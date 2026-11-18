'use server';
/* Wochenvorlagen: Musterwoche eines Teams speichern und auf beliebige Wochen anwenden */
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { audit, fail, notifyAssignments, ok, withCtx, type ActionResult } from '../context';
import { isoToDate, KIND_TO_DB } from '../mappers';
import { manageableTeams } from '@/lib/access';
import { addDays, day, F, isoDate, isoWeek, validDateInput, weekStart } from '@/lib/dates';
import { isHoliday } from '@/lib/holidays';
import type { Ctx, Entry, WeekTemplate, WeekTemplateItem } from '@/lib/types';

type Area = 'Dienstplan' | 'Bereitschaft';
const KEY = 'weekTemplates';
const MAX_TEMPLATES = 60;

async function loadTemplates(): Promise<WeekTemplate[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return Array.isArray(row?.value) ? (row.value as unknown as WeekTemplate[]) : [];
}
async function storeTemplates(list: WeekTemplate[]) {
  const value = list as never;
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}
const weekDates = (iso: string) => {
  const ws = weekStart(day(iso));
  return Array.from({ length: 7 }, (_, i) => isoDate(addDays(ws, i)));
};
const teamFor = (c: Ctx, area: Area, teamId: string) => manageableTeams(c, area).find((t) => t.id === teamId);

/** Woche eines Teams als Vorlage speichern (gleicher Name im selben Team wird überschrieben) */
export async function saveWeekTemplate(inp: { area: Area; teamId: string; name: string; weekStart: string }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const team = teamFor(c, inp.area, inp.teamId);
    if (!team) return fail('Für dieses Team darfst du keine Vorlagen anlegen.');
    if (!validDateInput(inp.weekStart)) return fail('Bitte eine gültige Woche wählen.');
    const name = inp.name.trim().slice(0, 60);
    if (!name) return fail('Bitte einen Namen für die Vorlage eingeben.');
    const dates = weekDates(inp.weekStart);
    const items: WeekTemplateItem[] = c.data.entries
      .filter((a) => a.kind === inp.area && !a.isAbsence && a.team === team.name && dates.includes(a.date))
      .map((a): WeekTemplateItem | null => {
        const emp = c.data.staff.find((p) => p.name === a.employee);
        return emp ? { d: dates.indexOf(a.date), employeeId: emp.id, shift: a.shift, start: a.start || '', end: a.end || '', color: a.color || '', groupId: a.groupId || undefined, groupName: a.groupName || undefined } : null;
      })
      .filter((x): x is WeekTemplateItem => !!x)
      .sort((a, b) => a.d - b.d || a.start.localeCompare(b.start));
    if (!items.length) return fail(`${team.name} hat in dieser Woche keine ${inp.area === 'Bereitschaft' ? 'Bereitschaften' : 'Dienste'} – es gibt nichts zu speichern.`);
    const list = await loadTemplates();
    const same = list.find((t) => t.area === inp.area && t.teamId === team.id && t.name.toLowerCase() === name.toLowerCase());
    const tpl: WeekTemplate = { id: same?.id || randomUUID(), name, area: inp.area, teamId: team.id, items, by: c.user.name, at: Date.now() };
    const next = same ? list.map((t) => (t.id === same.id ? tpl : t)) : [tpl, ...list];
    if (next.length > MAX_TEMPLATES) return fail(`Es sind höchstens ${MAX_TEMPLATES} Vorlagen möglich – bitte zuerst alte Vorlagen löschen.`);
    await storeTemplates(next);
    await audit(c, same ? 'Geändert' : 'Erstellt', inp.area, `Wochenvorlage „${name}“ · ${team.name} · ${items.length} Einträge aus KW ${isoWeek(day(dates[0]))}`, { title: same ? 'Wochenvorlage überschrieben' : 'Wochenvorlage gespeichert', object: team.name });
    return ok(`Vorlage „${name}“ ${same ? 'überschrieben' : 'gespeichert'} (${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}).`);
  });
}

/** Vorlage auf eine Woche anwenden; ohne „ersetzen“ werden nur freie Plätze gefüllt */
export async function applyWeekTemplate(inp: { id: string; weekStart: string; replace: boolean }): Promise<ActionResult<{ count: number }>> {
  return withCtx(async (c) => {
    const tpl = (await loadTemplates()).find((t) => t.id === inp.id);
    if (!tpl) return fail('Die Vorlage wurde nicht gefunden.');
    const team = teamFor(c, tpl.area, tpl.teamId);
    if (!team) return fail('Für dieses Team darfst du keine Einträge planen.');
    if (!validDateInput(inp.weekStart)) return fail('Bitte eine gültige Woche wählen.');
    const dates = weekDates(inp.weekStart);
    const sb = tpl.area === 'Bereitschaft';
    let existing = c.data.entries.filter((a) => a.kind === tpl.area && !a.isAbsence && dates.includes(a.date));
    let removed = 0;
    if (inp.replace) {
      const ids = existing.filter((a) => a.team === team.name).map((a) => a.id);
      if (ids.length) await prisma.entry.deleteMany({ where: { id: { in: ids } } });
      removed = ids.length;
      existing = existing.filter((a) => !ids.includes(a.id));
    }
    const skip = { gone: 0, absent: 0, holiday: 0, taken: 0 };
    const items: Entry[] = [];
    for (const it of tpl.items) {
      const date = dates[it.d];
      const emp = c.data.staff.find((p) => p.id === it.employeeId);
      if (!date || !emp || !team.memberIds.includes(emp.id)) {
        skip.gone++;
        continue;
      }
      if (!sb && isHoliday(date)) {
        skip.holiday++;
        continue;
      }
      if (c.data.entries.some((a) => a.isAbsence && a.employee === emp.name && a.date === date && !a.start)) {
        skip.absent++;
        continue;
      }
      if (existing.some((a) => a.employee === emp.name && a.date === date) || items.some((a) => a.employee === emp.name && a.date === date)) {
        skip.taken++;
        continue;
      }
      items.push({ id: '', kind: tpl.area, team: team.name, employee: emp.name, shift: it.shift, start: it.start, end: it.end, color: it.color, groupId: it.groupId || '', groupName: it.groupName || '', date });
    }
    const created: Entry[] = [];
    for (const e of items) {
      const emp = c.data.staff.find((p) => p.name === e.employee)!;
      const row = await prisma.entry.create({
        data: { kind: KIND_TO_DB[e.kind], isAbsence: false, date: isoToDate(e.date), employeeId: emp.id, teamId: team.id, shift: e.shift, start: e.start || null, end: e.end || null, color: e.color || null, groupId: e.groupId || null, groupName: e.groupName || null, authorId: c.user.id },
      });
      created.push({ ...e, id: row.id });
    }
    const kw = isoWeek(day(dates[0]));
    await audit(c, 'Erstellt', tpl.area, `Wochenvorlage „${tpl.name}“ auf KW ${kw} angewendet · ${team.name} · ${created.length} angelegt${removed ? `, ${removed} ersetzt` : ''}`, {
      title: 'Wochenvorlage angewendet',
      object: `${F.fmtIsoDate(dates[0])} – ${F.fmtIsoDate(dates[6])}`,
    });
    if (created.length) await notifyAssignments(c, created);
    const why = [skip.taken ? `${skip.taken}× schon belegt` : '', skip.absent ? `${skip.absent}× abwesend` : '', skip.holiday ? `${skip.holiday}× Feiertag` : '', skip.gone ? `${skip.gone}× nicht mehr im Team` : ''].filter(Boolean).join(', ');
    return ok(
      created.length
        ? `${created.length} ${created.length === 1 ? 'Eintrag' : 'Einträge'} aus „${tpl.name}“ in KW ${kw} angelegt.${why ? ' Ausgelassen: ' + why + '.' : ''}`
        : `Nichts angelegt – alle Plätze in KW ${kw} sind schon belegt oder nicht möglich.${why ? ' (' + why + ')' : ''}`,
      { count: created.length },
    );
  });
}

export async function deleteWeekTemplate(id: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    const list = await loadTemplates();
    const tpl = list.find((t) => t.id === id);
    if (!tpl) return fail('Die Vorlage wurde nicht gefunden.');
    const team = teamFor(c, tpl.area, tpl.teamId);
    if (!team) return fail('Diese Vorlage darfst du nicht löschen.');
    await storeTemplates(list.filter((t) => t.id !== id));
    await audit(c, 'Gelöscht', tpl.area, `Wochenvorlage „${tpl.name}“ · ${team.name}`, { title: 'Wochenvorlage gelöscht', object: team.name });
    return ok(`Vorlage „${tpl.name}“ gelöscht.`);
  });
}
