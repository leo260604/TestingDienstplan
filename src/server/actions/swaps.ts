'use server';
/* Diensttausch: anfragen, bestätigen/ablehnen, zurückziehen */
import { prisma } from '../db';
import { audit, fail, notifyPerson, ok, withCtx, type ActionResult } from '../context';
import { SWAP_TO_DB } from '../mappers';
import { canRequestSwap, swapOpenFor, swapProblems, swapRange, swapSnap, swapText, SWAP_ROLES } from '@/lib/swaps';
import type { Entry, SwapSnap } from '@/lib/types';

export async function requestSwap(inp: { to: string; giveIds: string[]; takeIds: string[]; note: string }): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!SWAP_ROLES.includes(c.user.role)) return fail('Diensttausch-Anfragen können Mitarbeiter, Stellvertretungen und Admins stellen.');
    if (!canRequestSwap(c)) return fail('Der Diensttausch ist in deinen Teams deaktiviert.');
    const find = (id: string) => c.data.entries.find((e) => e.id === id);
    const G = inp.giveIds.map(find).filter((e): e is Entry => !!e).map(swapSnap);
    const T = inp.takeIds.map(find).filter((e): e is Entry => !!e).map(swapSnap);
    const pr = swapProblems(c, G, T, c.user.name, inp.to);
    if (pr.length) return fail(pr[0]);
    if ([...G, ...T].some((d) => swapOpenFor(c.data.swaps, d.id))) return fail('Für einen der Dienste läuft bereits eine Tauschanfrage.');
    const toP = c.data.staff.find((p) => p.name === inp.to);
    if (!toP) return fail('Person nicht gefunden.');
    const note = String(inp.note || '').trim().slice(0, 200);
    const sw = await prisma.swapRequest.create({ data: { fromId: c.user.id, toId: toP.id, give: G as never, take: T as never, note } });
    await notifyPerson(
      c,
      toP,
      'Anfrage: Diensttausch',
      `${c.user.name} möchte ${swapText(G)} mit dir tauschen${T.length ? ` – im Tausch gegen ${swapText(T)}` : ' (ohne Gegendienst)'}.${note ? ' Nachricht: ' + note : ''}`,
      { swapId: sw.id, targetDate: G[0].date },
    );
    await audit(c, 'Erstellt', 'Dienstplan', `Tauschanfrage ${c.user.name} → ${toP.name} · ${G.length} ${G.length === 1 ? 'Dienst' : 'Dienste'}${T.length ? ' gegen ' + T.length : ''} · ${swapRange([...G, ...T])}`, { title: 'Diensttausch angefragt' });
    return ok(`Anfrage an ${toP.name} gesendet. Getauscht wird erst nach der Bestätigung.`);
  });
}

export async function decideSwap(id: string, accept: boolean): Promise<ActionResult> {
  return withCtx(async (c) => {
    const sw = c.data.swaps.find((x) => x.id === id && x.status === 'offen');
    if (!sw) return fail('Die Anfrage ist nicht mehr offen.');
    const me = c.user.name;
    if (sw.to !== me) return fail('Nur die angefragte Person kann den Tausch bestätigen.');
    const when = swapText(sw.give);
    const fromP = c.data.staff.find((p) => p.name === sw.from);
    if (!accept) {
      await prisma.swapRequest.update({ where: { id }, data: { status: 'ABGELEHNT', decidedAt: new Date() } });
      await notifyPerson(c, fromP, 'Diensttausch abgelehnt', `${me} hat deine Anfrage (${when}) abgelehnt. Deine Dienste bleiben unverändert.`, { swapId: id, targetDate: sw.give[0].date });
      await audit(c, 'Geändert', 'Dienstplan', `Tauschanfrage von ${sw.from} abgelehnt · ${swapRange(sw.give)}`, { title: 'Diensttausch abgelehnt' });
      return ok('Anfrage abgelehnt.');
    }
    const pr = swapProblems(c, sw.give, sw.take, sw.from, sw.to);
    if (pr.length) {
      await prisma.swapRequest.update({ where: { id }, data: { status: 'UNGUELTIG', decidedAt: new Date() } });
      await notifyPerson(c, fromP, 'Diensttausch nicht möglich', `Der Tausch mit ${me} (${when}) konnte nicht durchgeführt werden: ${pr[0]}`, { swapId: id, targetDate: sw.give[0].date });
      return fail('Tausch nicht möglich: ' + pr[0]);
    }
    const toP = c.data.staff.find((p) => p.name === sw.to)!;
    const ids = new Set([...sw.give, ...sw.take].map((d: SwapSnap) => d.id));
    const others = c.data.swaps.filter((x) => x !== sw && x.status === 'offen' && [...x.give, ...x.take].some((d) => ids.has(d.id)));
    await prisma.$transaction([
      prisma.entry.updateMany({ where: { id: { in: sw.give.map((d) => d.id) } }, data: { employeeId: toP.id } }),
      prisma.entry.updateMany({ where: { id: { in: sw.take.map((d) => d.id) } }, data: { employeeId: sw.fromId } }),
      prisma.swapRequest.update({ where: { id }, data: { status: SWAP_TO_DB['angenommen'], decidedAt: new Date() } }),
      prisma.swapRequest.updateMany({ where: { id: { in: others.map((x) => x.id) } }, data: { status: 'UNGUELTIG', decidedAt: new Date() } }),
    ]);
    for (const x of others)
      await notifyPerson(c, c.data.staff.find((p) => p.name === x.from), 'Diensttausch nicht mehr möglich', `Deine Anfrage (${swapText(x.give)}) ist hinfällig, weil einer der Dienste bereits getauscht wurde.`, { swapId: x.id, targetDate: x.give[0].date });
    await notifyPerson(c, fromP, 'Diensttausch bestätigt', `${me} hat den Tausch bestätigt und übernimmt ${swapText(sw.give)}.${sw.take.length ? ` Du übernimmst ${swapText(sw.take)}.` : ''}`, { swapId: id, targetDate: sw.give[0].date });
    const leads = new Set<string>();
    [...new Set([...sw.give, ...sw.take].map((d) => d.team))].forEach((n) => {
      const t = c.data.teams.find((x) => x.name === n);
      if (t) [t.leaderId, t.deputyId].filter(Boolean).forEach((x) => leads.add(x));
    });
    for (const lid of leads) {
      const p = c.data.staff.find((x) => x.id === lid);
      if (p && p.name !== sw.from && p.name !== sw.to)
        await notifyPerson(c, p, 'Dienst im Team getauscht', `${sw.from} ↔ ${sw.to} · ${swapText(sw.give)}${sw.take.length ? ' gegen ' + swapText(sw.take) : ''}`, { swapId: id, targetDate: sw.give[0].date });
    }
    await audit(c, 'Geändert', 'Dienstplan', `Dienst getauscht: ${sw.from} ↔ ${sw.to} · ${swapText(sw.give)}${sw.take.length ? ' gegen ' + swapText(sw.take) : ''}`, { title: 'Diensttausch bestätigt' });
    return ok('Dienst getauscht. ' + sw.from + ' wurde benachrichtigt.');
  });
}

export async function withdrawSwap(id: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    const sw = c.data.swaps.find((x) => x.id === id && x.status === 'offen');
    if (!sw || sw.from !== c.user.name) return fail('Die Anfrage kann nicht zurückgezogen werden.');
    await prisma.swapRequest.update({ where: { id }, data: { status: 'ZURUECKGEZOGEN', decidedAt: new Date() } });
    await prisma.notification.deleteMany({ where: { swapId: id, read: false, title: 'Anfrage: Diensttausch' } });
    await audit(c, 'Geändert', 'Dienstplan', `Tauschanfrage an ${sw.to} zurückgezogen · ${swapRange(sw.give)}`, { title: 'Diensttausch zurückgezogen' });
    return ok('Anfrage zurückgezogen.');
  });
}
