/* Diensttausch: Anfrage an Kollegin/Kollegen (ein oder mehrere Tage).
   Getauscht wird erst nach Bestätigung durch die angefragte Person. */
import { F, isoDate } from './dates';
import { fullDayAbsent } from './entries';
import { teamSettings } from './access';
import type { Ctx, Entry, SwapRequest, SwapSnap } from './types';

export const SWAP_ROLES = ['Mitarbeiter', 'Deputy', 'Admin'];
export const SWAP_STATUS: Record<SwapRequest['status'], string> = {
  offen: 'Offen',
  angenommen: 'Getauscht',
  abgelehnt: 'Abgelehnt',
  zurückgezogen: 'Zurückgezogen',
  ungültig: 'Nicht mehr möglich',
};

export const swapSnap = (a: Entry): SwapSnap => ({
  id: a.id,
  date: String(a.date),
  shift: String(a.shift ?? ''),
  start: String(a.start || ''),
  end: String(a.end || ''),
  team: String(a.team ?? ''),
});

export const swapOpenFor = (swaps: SwapRequest[], id: string) =>
  swaps.find((x) => x.status === 'offen' && [...x.give, ...x.take].some((d) => String(d.id) === String(id)));

export function swapTeamsOf(c: Ctx, name: string): string[] {
  const p = c.data.staff.find((x) => x.name === name);
  return p ? c.data.teams.filter((t) => t.memberIds.includes(p.id) && teamSettings(t).swap).map((t) => t.name) : [];
}

export const canRequestSwap = (c: Ctx) => SWAP_ROLES.includes(c.user.role) && swapTeamsOf(c, c.user.name).length > 0;

export function swapColleagues(c: Ctx, teamFilter?: string) {
  const me = c.user.name,
    mine = swapTeamsOf(c, me).filter((t) => !teamFilter || t === teamFilter);
  return c.data.staff
    .filter((p) => p.name !== me && SWAP_ROLES.includes(p.role || 'Mitarbeiter') && c.data.teams.some((t) => mine.includes(t.name) && t.memberIds.includes(p.id)))
    .sort((x, y) => x.name.localeCompare(y.name, 'de'));
}

export function canSwapDuty(c: Ctx, a?: Entry): boolean {
  return (
    canRequestSwap(c) &&
    !!a &&
    a.kind === 'Dienstplan' &&
    !a.isAbsence &&
    a.employee === c.user.name &&
    a.date >= isoDate(new Date()) &&
    !swapOpenFor(c.data.swaps, a.id) &&
    swapColleagues(c, a.team).length > 0
  );
}

const swapDate = (d: string) => F.fmtIsoDate(d);
export const swapRange = (list: { date: string }[]) => {
  if (!list.length) return '';
  const d = list.map((x) => x.date).sort();
  return d[0] === d[d.length - 1] ? swapDate(d[0]) : `${swapDate(d[0])} – ${swapDate(d[d.length - 1])}`;
};
export const swapText = (list: SwapSnap[]) =>
  list.length === 1 ? `„${list[0].shift}“ am ${swapDate(list[0].date)}` : `${list.length} Dienste (${swapRange(list)})`;

/** Prüft den gesamten Tausch – liefert eine Liste von Gründen (leer = möglich) */
export function swapProblems(c: Ctx, give: SwapSnap[], take: SwapSnap[], from: string, to: string, today = isoDate(new Date())): string[] {
  const out: string[] = [];
  const entries = c.data.entries;
  const find = (id: string) => entries.find((x) => String(x.id) === String(id));
  if (!give.length) return ['An diesem Tag hast du keinen Dienst, den du tauschen kannst.'];
  {
    const off = [...new Set([...give, ...take].map((d) => d.team))].filter((n) => !teamSettings(c.data.teams.find((t) => t.name === n)).swap);
    if (off.length) return [`Diensttausch ist im ${off.join(', ')} deaktiviert.`];
  }
  const A = give.map((d) => find(d.id)),
    B = take.map((d) => find(d.id));
  if (A.some((a, i) => !a || a.employee !== from || a.isAbsence || a.date !== give[i].date)) out.push('Ein angefragter Dienst wurde inzwischen geändert oder gelöscht.');
  if (B.some((b, i) => !b || b.employee !== to || b.isAbsence || b.date !== take[i].date)) out.push('Ein Gegendienst wurde inzwischen geändert oder gelöscht.');
  if (out.length) return out;
  const AA = A as Entry[],
    BB = B as Entry[];
  if ([...AA, ...BB].some((x) => x.date < today)) out.push('Ein Dienst liegt bereits in der Vergangenheit.');
  const moving = new Set([...AA, ...BB]);
  const after = (name: string, gain: Entry[]) => {
    const by: Record<string, number> = {};
    entries.forEach((x) => {
      if (x.kind === 'Dienstplan' && !x.isAbsence && x.employee === name && !moving.has(x)) by[x.date] = (by[x.date] || 0) + 1;
    });
    gain.forEach((x) => {
      by[x.date] = (by[x.date] || 0) + 1;
    });
    return by;
  };
  const chk = (name: string, gain: Entry[]) => {
    const by = after(name, gain);
    [...new Set(gain.map((x) => x.date))].sort().forEach((d) => {
      if (by[d] > 1) out.push(`${name} hätte am ${swapDate(d)} zwei Dienste.`);
      if (fullDayAbsent(entries, name, d)) out.push(`${name} ist am ${swapDate(d)} abwesend.`);
    });
  };
  chk(to, AA);
  chk(from, BB);
  return [...new Set(out)];
}

export const swapsIncoming = (c: Ctx) => c.data.swaps.filter((x) => x.status === 'offen' && x.to === c.user.name);
export const swapsOutgoing = (c: Ctx) => c.data.swaps.filter((x) => x.status === 'offen' && x.from === c.user.name);
