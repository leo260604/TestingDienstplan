import 'server-only';
import { revalidatePath } from 'next/cache';
import { prisma } from './db';
import { loadAppData } from './data';
import { requireUser } from './session';
import { F } from '@/lib/dates';
import type { Ctx, Entry, Person } from '@/lib/types';
import type { Prisma } from '@/generated/prisma/client';
import { dispatchExternal, type ExternalMessage } from './notify';
import { sendPush } from './push';
import type { NotifyEvent } from '@/lib/notifications';

export type ActionResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; message: string };
export const ok = <T,>(message?: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
export const fail = (message: string): ActionResult<never> => ({ ok: false, message });

/** Lädt Benutzer + Daten und führt die Aktion aus; Fehler werden als Meldung zurückgegeben. */
export async function withCtx<T>(fn: (c: Ctx) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const user = await requireUser();
  try {
    const data = await loadAppData(user);
    const res = await fn({ user, data });
    if (res.ok) revalidatePath('/', 'layout');
    return res;
  } catch (e) {
    console.error(e);
    return fail('Die Änderung konnte nicht gespeichert werden.');
  }
}

export async function audit(c: Ctx, action: 'Erstellt' | 'Geändert' | 'Gelöscht', area: string, detail: string, extra: { title?: string; object?: string; before?: string; after?: string } = {}) {
  await prisma.auditLog.create({
    data: { userName: c.user.name, role: c.user.role, action, area, detail: String(detail || ''), title: extra.title || '', object: extra.object || '', before: extra.before ?? '', after: extra.after ?? '' },
  });
}

/** Benachrichtigungen zu neuen Einträgen (respektiert die persönlichen Einstellungen der Empfänger) */
export async function notifyAssignments(c: Ctx, items: Entry[], { absence = false, changed = false } = {}) {
  const prefsRows = await prisma.userPreference.findMany();
  const prefs = new Map(prefsRows.map((r) => [r.employeeId, ((r.data as { notify?: Record<string, boolean> })?.notify || {}) as Record<string, boolean>]));
  const pref = (id: string) => ({ own: true, team: true, absence: true, ...(prefs.get(id) || {}) });
  const out: Prisma.NotificationCreateManyInput[] = [];
  const ext: ExternalMessage[] = [];
  for (const item of items) {
    const team = c.data.teams.find((t) => t.name === item.team);
    if (!team) continue;
    const isStandby = item.kind === 'Bereitschaft';
    const timeText = item.start && item.end ? ` · ${item.start}–${item.end} Uhr` : '';
    const typeText = absence ? 'Abwesenheit' : isStandby ? 'Bereitschaft' : 'Dienst';
    const details = `${item.employee} · ${item.team}${item.groupName ? ' · ' + item.groupName : ''} · ${item.shift || typeText} · ${F.fmtIsoDate(item.date)}${timeText}`;
    const targetPage = absence ? 'Dienstplan' : isStandby ? 'Bereitschaft' : 'Dienstplan';
    const add = (recipientId: string, recipientRole: string, title: string) => {
      if (!recipientId) return;
      const pr = pref(recipientId);
      const own = recipientRole === 'Mitarbeiter' || title.includes('für dich');
      // Mail/Teams: eigene Auswahl je Ereignis (unabhängig von den Glocken-Einstellungen)
      ext.push({ recipientId, event: own ? (changed ? 'changedEntry' : 'newEntry') : absence ? 'absence' : 'teamEntry', title, message: details, link: `/${targetPage.toLowerCase()}?date=${item.date}` });
      if (own) {
        if (!pr.own) return;
      } else if (absence ? !pr.absence : !pr.team) return;
      out.push({ recipientId, recipientRole, title, message: details, targetPage, targetDate: item.date, entryId: item.id });
    };
    if (!absence) {
      const emp = c.data.staff.find((x) => x.name === item.employee);
      if (emp) add(emp.id, emp.role || 'Mitarbeiter', isStandby ? 'Neue Bereitschaft für dich' : 'Neue Einteilung für dich');
    }
    const teamTitle = absence ? 'Neue Abwesenheit' : isStandby ? 'Neue Bereitschaft im Team' : 'Neuer Dienst im Team';
    add(team.leaderId, 'Teamleiter', teamTitle);
    add(team.deputyId, 'Deputy', teamTitle);
  }
  if (out.length) await prisma.notification.createMany({ data: out });
  await sendPush(out.map((n) => ({ recipientId: n.recipientId, title: n.title, body: n.message, url: `/${String(n.targetPage || 'Dienstplan').toLowerCase()}${n.targetDate ? '?date=' + n.targetDate : ''}` })));
  await dispatchExternal(ext);
}

export async function notifyPerson(c: Ctx, person: Person | undefined, title: string, message: string, opts: { swapId?: string; targetDate?: string; event?: NotifyEvent } = {}) {
  if (!person) return;
  await dispatchExternal([{ recipientId: person.id, event: opts.event || (opts.swapId ? 'swap' : 'changedEntry'), title, message, link: `/dienstplan${opts.targetDate ? '?date=' + opts.targetDate : ''}` }]);
  await prisma.notification.create({
    data: { recipientId: person.id, recipientRole: person.role || 'Mitarbeiter', title, message, swapId: opts.swapId, targetPage: 'Dienstplan', targetDate: opts.targetDate },
  });
  await sendPush([{ recipientId: person.id, title, body: message, url: `/dienstplan${opts.targetDate ? '?date=' + opts.targetDate : ''}` }]);
}
