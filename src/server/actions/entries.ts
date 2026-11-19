'use server';
/* Dienste, Bereitschaften, Abwesenheiten, Arbeitsorte, Notizen und Rotation */
import { dispatchExternal } from '../notify';
import { prisma } from '../db';
import { audit, fail, notifyAssignments, ok, withCtx, type ActionResult } from '../context';
import { isoToDate, KIND_TO_DB } from '../mappers';
import { addDays, day, DATE_RANGE_MSG, daysBetween, F, isoDate, validDateInput } from '@/lib/dates';
import { holidayName, isHoliday } from '@/lib/holidays';
import {
  absenceTeamFor,
  areaOf,
  canCreateAbsenceFor,
  canEditEntry,
  canManageTeam,
  canNoteFor,
  manageableTeams,
  managesTeam,
  rotationMembers,
  selfEditAllowed,
  canChangeTeamNote,
  teamNoteTeams,
  currentUserTeamNames, standbyRotationMembers, teamSettings } from '@/lib/access';
import { isVariableStandby, shiftHexColor, standbyDayOk, standbyDaysLabel, standbyRestricted, standbyTimeByName, standbyTimeForTeam, TIMED_ABSENCES } from '@/lib/entries';
import { planDutyRotation, planStandbyRotation } from '@/lib/rotation';
import type { Ctx, Entry } from '@/lib/types';

const T = /^\d\d:\d\d$/;
const eachDayIso = (from: string, to: string) => {
  const out: string[] = [];
  if (!validDateInput(from) || !validDateInput(to)) return out;
  for (let cur = day(from); isoDate(cur) <= to && out.length < 400; cur = addDays(cur, 1)) out.push(isoDate(cur));
  return out;
};

function entryData(c: Ctx, e: Entry, authorId?: string) {
  const emp = c.data.staff.find((p) => p.name === e.employee);
  const team = c.data.teams.find((t) => t.name === e.team);
  if (!emp) throw new Error('Mitarbeiter nicht gefunden: ' + e.employee);
  return {
    kind: KIND_TO_DB[e.kind],
    isAbsence: !!e.isAbsence,
    date: isoToDate(e.date),
    employeeId: emp.id,
    teamId: team?.id ?? null,
    shift: e.shift,
    start: e.start || null,
    end: e.end || null,
    color: e.color || null,
    note: e.note || null,
    groupId: e.groupId || null,
    groupName: e.groupName || null,
    authorId: authorId ?? null,
  };
}

async function insertEntries(c: Ctx, list: Entry[]): Promise<Entry[]> {
  const created: Entry[] = [];
  for (const e of list) {
    const row = await prisma.entry.create({ data: entryData(c, e) });
    created.push({ ...e, id: row.id });
  }
  return created;
}

/* ---------------- Dienst / Bereitschaft einteilen oder bearbeiten ---------------- */
export interface SaveDutyInput {
  area: 'Dienstplan' | 'Bereitschaft';
  team: string;
  employee: string;
  serviceId: string;
  from: string;
  to: string;
  start: string;
  end: string;
  editId?: string | null;
  dutyDays: number;
}

export async function saveDuty(inp: SaveDutyInput): Promise<ActionResult<{ count: number; skipped: number }>> {
  return withCtx(async (c) => {
    const sb = inp.area === 'Bereitschaft';
    const team = c.data.teams.find((t) => t.name === inp.team);
    const person = c.data.staff.find((p) => p.name === inp.employee);
    if (!person || !team?.memberIds.includes(person.id)) return fail('Bitte einen Mitarbeiter auswählen, der diesem Team zugeordnet ist.');
    if (!canEditEntry(c, team.name, person.name, inp.area))
      return fail(selfEditAllowed(c, team.name, inp.area) ? 'Du darfst nur deine eigenen Einträge anlegen und bearbeiten.' : 'Du darfst nur Teams bearbeiten, für die du als Teamleiter oder Deputy zugeordnet bist.');
    const orig = inp.editId ? c.data.entries.find((a) => a.id === inp.editId) : null;
    if (inp.editId && !orig) return fail('Der Eintrag wurde nicht gefunden.');
    if (orig && !canEditEntry(c, orig.team, orig.employee, areaOf(orig))) return fail('Du darfst diesen Eintrag nicht bearbeiten.');
    const service = sb ? c.data.standbyTimes.find((x) => x.id === inp.serviceId) : c.data.shiftTypes.find((x) => x.id === inp.serviceId);
    if (!service) return fail(sb ? 'Für dieses Team ist noch keine Bereitschaftszeit angelegt.' : 'Bitte zuerst unter „Dienstzeiten“ eine Dienstzeit für dieses Team anlegen.');
    if (!validDateInput(inp.from) || !validDateInput(inp.to)) return fail(DATE_RANGE_MSG);
    if (inp.to < inp.from) return fail('Das Enddatum darf nicht vor dem Startdatum liegen.');
    if (daysBetween(inp.from, inp.to) + 1 > 366) return fail('Bitte einen Zeitraum von höchstens 366 Tagen auswählen.');
    const multiDay = inp.to !== inp.from;
    let dates: string[] = [];
    let skipped = 0;
    for (let cur = day(inp.from); isoDate(cur) <= inp.to; cur = addDays(cur, 1)) {
      if (multiDay && !sb && (cur.getDay() + 6) % 7 >= inp.dutyDays) {
        skipped++;
        continue;
      }
      dates.push(isoDate(cur));
    }
    if (sb && 'days' in service && standbyRestricted(service)) {
      const bad = dates.filter((d) => !standbyDayOk(service, d));
      if (bad.length && dates.length === 1) return fail(`„${service.name}“ ist nur an diesen Tagen möglich: ${standbyDaysLabel(service)}.`);
      dates = dates.filter((d) => !bad.includes(d));
      skipped += bad.length;
    }
    if (!sb) {
      const hol = dates.filter(isHoliday);
      if (hol.length && dates.length === 1) return fail(`Am ${F.fmtWithWeekday(day(hol[0]))} ist Feiertag (${holidayName(hol[0])}) – an Feiertagen können keine Dienste eingetragen werden, nur Bereitschaften.`);
      dates = dates.filter((d) => !hol.includes(d));
      skipped += hol.length;
    }
    if (!dates.length) return fail('Im gewählten Zeitraum liegen keine Arbeitstage.');
    if (orig && dates.length > 1) return fail('Beim Bearbeiten bitte nur einen Tag wählen.');
    const variable = sb && isVariableStandby(service as never);
    const start = inp.start || (variable ? '' : service.start);
    const end = inp.end || (variable ? '' : service.end);
    if (!T.test(start) || !T.test(end)) return fail(variable ? `${service.name} ist eine variable Bereitschaft – bitte Beginn und Ende eingeben.` : 'Bitte Beginn und Ende festlegen.');
    if (start === end) return fail('Beginn und Ende dürfen nicht gleich sein.');
    if (sb && !standbyTimeForTeam(service as never, team.name, c.data.teams)) return fail(`„${service.name}“ ist für ${team.name} nicht freigegeben.`);
    for (const date of dates) {
      const dup = c.data.entries.some((a) => a.employee === person.name && a.date === date && a.id !== inp.editId && a.kind === inp.area && !a.isAbsence);
      if (dup) return fail(`${person.name} hat am ${F.fmtIsoDate(date)} bereits ${sb ? 'eine Bereitschaft' : 'einen Dienst'}.`);
    }
    const group = sb ? c.data.standbyGroups.find((g) => g.id === (service as { groupId?: string }).groupId) : null;
    const color = sb ? team.standbyColor || '#159da8' : shiftHexColor(service.color || 'teal');
    const items: Entry[] = dates.map((date) => ({ id: '', kind: inp.area, team: team.name, employee: person.name, shift: service.name, groupId: group?.id || '', groupName: group?.name || '', start, end, color, date }));
    const detail = `${person.name} · ${service.name} ${start}–${end} · ${F.fmtIsoDate(dates[0])}${dates.length > 1 ? ' – ' + F.fmtIsoDate(dates[dates.length - 1]) + ' (' + dates.length + ' Tage)' : ''}`;
    if (orig) {
      await prisma.entry.update({ where: { id: orig.id }, data: entryData(c, { ...items[0], id: orig.id }) });
      await audit(c, 'Geändert', inp.area, detail);
      return ok('Eintrag wurde aktualisiert.', { count: 1, skipped: 0 });
    }
    const created = await insertEntries(c, items);
    await audit(c, 'Erstellt', inp.area, detail);
    await notifyAssignments(c, created);
    return ok(
      dates.length === 1 && !skipped
        ? 'Eintrag wurde erfolgreich angelegt.'
        : `${dates.length} ${dates.length === 1 ? 'Eintrag wurde' : 'Einträge wurden'} angelegt${skipped ? ` (${skipped} ${skipped === 1 ? 'freier Tag' : 'freie Tage'} ausgelassen)` : ''}.`,
      { count: dates.length, skipped },
    );
  });
}

/** Darf die angemeldete Person diesen Eintrag ändern bzw. löschen? */
function mayChangeEntry(c: Ctx, item: Entry): boolean {
  const own = item.kind === 'Arbeitsort' && item.employee === c.user.name;
  const absenceOk = !!item.isAbsence && canCreateAbsenceFor(c, c.data.staff.find((p) => p.name === item.employee));
  const noteOk = item.kind === 'Notiz' && canNoteFor(c, item.employee);
  return canManageTeam(c, item.team) || own || absenceOk || noteOk || (!item.isAbsence && item.kind !== 'Arbeitsort' && canEditEntry(c, item.team, item.employee, areaOf(item)));
}

/* ---------------- Löschen ---------------- */
export async function deleteEntry(id: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    const item = c.data.entries.find((a) => a.id === id);
    if (!item) return fail('Der Eintrag wurde nicht gefunden.');
    if (!mayChangeEntry(c, item)) return fail('Du darfst Einträge dieses Teams nicht löschen.');
    await prisma.entry.delete({ where: { id } });
    const owner = c.data.staff.find((p) => p.name === item.employee);
    if (owner && owner.id !== c.user.id && (item.kind === 'Dienstplan' || item.kind === 'Bereitschaft') && !item.isAbsence)
      await dispatchExternal([{ recipientId: owner.id, event: 'changedEntry', title: item.kind === 'Bereitschaft' ? 'Bereitschaft gelöscht' : 'Dienst gelöscht', message: `${item.shift}${item.start ? ' · ' + item.start + '–' + item.end + ' Uhr' : ''} · ${F.fmtIsoDate(item.date)} · gelöscht von ${c.user.name}`, link: `/${item.kind === 'Bereitschaft' ? 'bereitschaft' : 'dienstplan'}?date=${item.date}` }]);
    await audit(c, 'Gelöscht', item.kind === 'Bereitschaft' ? 'Bereitschaft' : 'Dienstplan', `${item.employee} · ${item.shift}${item.start ? ' ' + item.start + '–' + item.end : ''} · ${F.fmtIsoDate(item.date)}`, item.kind === 'Notiz' ? { title: 'Notiz gelöscht', object: item.employee, before: item.note } : {});
    return ok(item.kind === 'Arbeitsort' ? 'Arbeitsort wurde entfernt.' : item.kind === 'Notiz' ? 'Notiz gelöscht.' : 'Eintrag wurde gelöscht.');
  });
}

/* ---------------- Verschieben (Drag & Drop) ---------------- */
export async function moveEntry(id: string, date: string, employee?: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    const item = c.data.entries.find((a) => a.id === id);
    if (!item || !validDateInput(date)) return fail('Der Eintrag wurde nicht gefunden.');
    const target = employee || item.employee;
    if (item.date === date && target === item.employee) return ok();
    if (item.kind === 'Dienstplan' && !item.isAbsence && isHoliday(date)) return fail(`Am ${F.fmtWithWeekday(day(date))} ist Feiertag (${holidayName(date)}) – an Feiertagen können keine Dienste eingetragen werden, nur Bereitschaften.`);
    if (item.kind === 'Bereitschaft') {
      const st = standbyTimeByName(c.data.standbyTimes, c.data.teams, item.shift, item.team);
      if (st && !standbyDayOk(st, date)) return fail(`„${st.name}“ ist nur an diesen Tagen möglich: ${standbyDaysLabel(st)}.`);
    }
    if (!canEditEntry(c, item.team, item.employee, areaOf(item)) || (target !== item.employee && !managesTeam(c, item.team, areaOf(item))))
      return fail('Du darfst Einträge dieses Teams nicht bearbeiten.');
    const team = c.data.teams.find((t) => t.name === item.team);
    const person = c.data.staff.find((p) => p.name === target);
    if (!person || !team || !team.memberIds.includes(person.id)) return fail('Einträge können nur innerhalb des eigenen Teams verschoben werden.');
    if (item.kind !== 'Arbeitsort' && c.data.entries.some((a) => a !== item && a.employee === target && a.date === date && a.kind === item.kind && !a.isAbsence))
      return fail(`${target} hat am ${F.fmtIsoDate(date)} bereits ${item.kind === 'Bereitschaft' ? 'eine Bereitschaft' : 'einen Dienst'}.`);
    await prisma.entry.update({ where: { id }, data: { date: isoToDate(date), employeeId: person.id } });
    await audit(c, 'Geändert', item.kind === 'Bereitschaft' ? 'Bereitschaft' : 'Dienstplan', `${item.shift} verschoben`, {
      title: (item.kind === 'Bereitschaft' ? 'Bereitschaft' : item.kind === 'Arbeitsort' ? 'Arbeitsort' : 'Dienst') + ' verschoben',
      object: item.shift,
      before: `${item.employee} · ${F.fmtIsoDate(item.date)}`,
      after: `${target} · ${F.fmtIsoDate(date)}`,
    });
    if (item.kind !== 'Arbeitsort') await notifyAssignments(c, [{ ...item, employee: target, date }], { changed: true });
    return ok('Eintrag verschoben.');
  });
}

/* ---------------- Abwesenheit ---------------- */
export interface AbsenceInput {
  employee: string;
  kind: string;
  from: string;
  to: string;
  start: string;
  end: string;
  note: string;
}
export async function createAbsence(inp: AbsenceInput): Promise<ActionResult> {
  return withCtx(async (c) => {
    const person = c.data.staff.find((p) => p.name === inp.employee);
    if (!person || !inp.kind || !inp.from) return fail('Bitte Mitarbeiter, Abwesenheitsart und Startdatum auswählen.');
    if (!canCreateAbsenceFor(c, person)) return fail('Du kannst Abwesenheiten nur für Mitarbeiter deines eigenen Teams eintragen.');
    const to = inp.to || inp.from;
    if (!validDateInput(inp.from) || !validDateInput(to)) return fail(DATE_RANGE_MSG);
    if (to < inp.from) return fail('Das Enddatum darf nicht vor dem Startdatum liegen.');
    const days = daysBetween(inp.from, to) + 1;
    if (days > 366) return fail('Der Zeitraum darf höchstens 366 Tage umfassen.');
    let start = '',
      end = '';
    if (TIMED_ABSENCES.includes(inp.kind)) {
      start = inp.start;
      end = inp.end;
      if (!T.test(start) || !T.test(end)) return fail('Bitte die Uhrzeit eintragen.');
      if (end <= start) return fail('Die Endzeit muss nach der Beginnzeit liegen.');
    }
    const team = absenceTeamFor(c, person)?.name || 'Ohne Team';
    const note = String(inp.note || '').trim().slice(0, 500);
    const items: Entry[] = Array.from({ length: days }, (_, i) => ({ id: '', kind: 'Dienstplan', team, employee: person.name, shift: inp.kind, start, end, date: isoDate(addDays(day(inp.from), i)), isAbsence: true, note, color: '#d69b38' }));
    const created = await insertEntries(c, items);
    await audit(c, 'Erstellt', 'Abwesenheit', `${person.name} · ${inp.kind} · ${F.fmtIsoDate(inp.from)}${days > 1 ? ' – ' + F.fmtIsoDate(to) : ''}`);
    await notifyAssignments(c, created, { absence: true });
    return ok(days === 1 ? 'Abwesenheit wurde eingetragen.' : `Abwesenheit für ${days} Tage wurde eingetragen.`);
  });
}

/* ---------------- Arbeitsort ---------------- */
function workdays(from: string, to: string): string[] | null {
  if (!validDateInput(from) || !validDateInput(to) || to < from) return null;
  const out: string[] = [];
  for (let c = day(from); isoDate(c) <= to && out.length < 400; c = addDays(c, 1)) if (c.getDay() !== 0 && c.getDay() !== 6) out.push(isoDate(c));
  return out;
}
const workplaceManager = (role: string) => ['Admin', 'Teamleiter', 'Abteilungsleiter'].includes(role);

export async function saveWorkplace(inp: { employee: string; type: 'Homeoffice' | 'Büro'; from: string; to: string; remove?: boolean }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const person = workplaceManager(c.user.role) ? c.data.staff.find((p) => p.name === inp.employee) : c.data.staff.find((p) => p.id === c.user.id);
    if (!person) return fail('Der Mitarbeiter konnte nicht zugeordnet werden.');
    const d = workdays(inp.from, inp.to || inp.from);
    if (!d) return fail('Bitte einen gültigen Zeitraum auswählen.');
    if (d.length > 366) return fail('Der Zeitraum darf höchstens 366 Tage umfassen.');
    if (!d.length) return fail('Am Wochenende kann kein Arbeitsort eingetragen werden.');
    const existing = c.data.entries.filter((a) => a.kind === 'Arbeitsort' && a.employee === person.name && d.includes(a.date));
    if (inp.remove) {
      if (!existing.length) return fail('Im Zeitraum ist kein Arbeitsort eingetragen.');
      await prisma.entry.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } });
      await audit(c, 'Gelöscht', 'Arbeitsort', `${person.name} · ${existing.length} ${existing.length === 1 ? 'Tag' : 'Tage'}`);
      return ok(existing.length === 1 ? 'Arbeitsort entfernt.' : `Arbeitsort an ${existing.length} Tagen entfernt.`);
    }
    const team = absenceTeamFor(c, person)?.name || 'Ohne Team';
    const color = inp.type === 'Homeoffice' ? '#159da8' : '#3979bd';
    const teamId = c.data.teams.find((t) => t.name === team)?.id ?? null;
    await prisma.$transaction(async (tx) => {
      for (const date of d) {
        const ex = existing.find((a) => a.date === date);
        if (ex) await tx.entry.update({ where: { id: ex.id }, data: { shift: inp.type, color, teamId } });
        else await tx.entry.create({ data: entryData(c, { id: '', kind: 'Arbeitsort', team, employee: person.name, shift: inp.type, date, color, start: '', end: '' }) });
      }
    });
    await audit(c, 'Erstellt', 'Arbeitsort', `${person.name} · ${inp.type} · ${F.fmtIsoDate(d[0])}${d.length > 1 ? ' – ' + F.fmtIsoDate(d[d.length - 1]) : ''}`);
    return ok(d.length === 1 ? 'Arbeitsort gespeichert.' : `Arbeitsort für ${d.length} Tage gespeichert.`);
  });
}

/* ---------------- Notizen ---------------- */
export async function saveNote(inp: { id?: string; employee: string; date: string; text: string }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const text = String(inp.text || '').trim().slice(0, 500);
    if (!text) return fail('Bitte einen Text eingeben.');
    if (!validDateInput(inp.date)) return fail('Bitte ein gültiges Datum wählen.');
    if (!canNoteFor(c, inp.employee)) return fail('Für diese Person darfst du keine Notiz anlegen.');
    const p = c.data.staff.find((x) => x.name === inp.employee)!;
    const mine = currentUserTeamNames(c);
    const ts = c.data.teams.filter((t) => t.memberIds.includes(p.id));
    const team = (ts.find((t) => mine.includes(t.name)) || ts[0])?.name || '';
    if (inp.id) {
      const ex = c.data.entries.find((a) => a.id === inp.id && a.kind === 'Notiz');
      if (!ex || !canNoteFor(c, ex.employee)) return fail('Diese Notiz darfst du nicht bearbeiten.');
      await prisma.entry.update({ where: { id: ex.id }, data: { ...entryData(c, { ...ex, employee: p.name, team, date: inp.date, note: text }), authorId: undefined } });
      await audit(c, 'Geändert', 'Dienstplan', `Notiz · ${p.name}`, { title: 'Notiz geändert', object: `${p.name} · ${F.fmtIsoDate(inp.date)}`, before: ex.note, after: text });
      return ok('Notiz gespeichert.');
    }
    await prisma.entry.create({ data: entryData(c, { id: '', kind: 'Notiz', team, employee: p.name, shift: 'Notiz', start: '', end: '', date: inp.date, note: text, color: '#e0a800' }, c.user.id) });
    await audit(c, 'Erstellt', 'Dienstplan', `Notiz · ${p.name}`, { title: 'Notiz hinzugefügt', object: `${p.name} · ${F.fmtIsoDate(inp.date)}`, after: text });
    return ok('Notiz gespeichert.');
  });
}

export async function saveTeamNote(inp: { id?: string; team: string; date: string; text: string }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const text = String(inp.text || '').trim().slice(0, 300);
    if (!text) return fail('Bitte einen Text eingeben.');
    if (!validDateInput(inp.date)) return fail('Bitte ein gültiges Datum wählen.');
    if (!teamNoteTeams(c).includes(inp.team)) return fail('Für dieses Team darfst du keine Teamnotiz anlegen.');
    const team = c.data.teams.find((t) => t.name === inp.team)!;
    if (inp.id) {
      const ex = c.data.teamNotes.find((n) => n.id === inp.id);
      if (!ex || !canChangeTeamNote(c, ex)) return fail('Diese Teamnotiz darfst du nicht bearbeiten – nur die Teamleitung oder wer sie geschrieben hat.');
      await prisma.teamNote.update({ where: { id: ex.id }, data: { teamId: team.id, date: isoToDate(inp.date), text } });
      await audit(c, 'Geändert', 'Dienstplan', `Teamnotiz · ${team.name}`, { title: 'Teamnotiz geändert', object: `${team.name} · ${F.fmtIsoDate(inp.date)}`, before: ex.text, after: text });
      return ok('Teamnotiz gespeichert.');
    }
    await prisma.teamNote.create({ data: { teamId: team.id, date: isoToDate(inp.date), text, authorId: c.user.id } });
    await audit(c, 'Erstellt', 'Dienstplan', `Teamnotiz · ${team.name}`, { title: 'Teamnotiz hinzugefügt', object: `${team.name} · ${F.fmtIsoDate(inp.date)}`, after: text });
    return ok('Teamnotiz gespeichert.');
  });
}

export async function deleteTeamNote(id: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    const n = c.data.teamNotes.find((x) => x.id === id);
    if (!n || !canChangeTeamNote(c, n)) return fail('Diese Teamnotiz darfst du nicht löschen – nur die Teamleitung oder wer sie geschrieben hat.');
    await prisma.teamNote.delete({ where: { id } });
    await audit(c, 'Gelöscht', 'Dienstplan', `Teamnotiz · ${n.team}`, { title: 'Teamnotiz gelöscht', object: `${n.team} · ${F.fmtIsoDate(n.date)}`, before: n.text });
    return ok('Teamnotiz gelöscht.');
  });
}

/* ---------------- Bereitschaft übergeben (Vertretung) ---------------- */
export async function handOverStandby(inp: { ids: string[]; employee: string; from: string; to: string }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const items = inp.ids.map((id) => c.data.entries.find((a) => a.id === id)).filter((a): a is Entry => !!a && a.kind === 'Bereitschaft');
    if (!items.length) return fail('Keine Bereitschaft gefunden.');
    if (!managesTeam(c, items[0].team, 'Bereitschaft')) return fail('Du darfst Bereitschaften dieses Teams nicht bearbeiten.');
    const person = c.data.staff.find((p) => p.name === inp.employee);
    const team = c.data.teams.find((t) => t.name === items[0].team);
    if (!person || !team?.memberIds.includes(person.id)) return fail('Bitte eine Person aus dem Team wählen.');
    const affected = items.filter((a) => a.date >= inp.from && a.date <= inp.to);
    const clash = affected.find((a) => c.data.entries.some((x) => x.kind === 'Bereitschaft' && x.employee === person.name && x.date === a.date));
    if (clash) return fail(`${person.name} hat am ${F.fmtIsoDate(clash.date)} bereits eine Bereitschaft.`);
    await prisma.entry.updateMany({ where: { id: { in: affected.map((a) => a.id) } }, data: { employeeId: person.id } });
    await audit(c, 'Geändert', 'Bereitschaft', `${items[0].employee} → ${person.name}`, { title: 'Bereitschaft getauscht', object: team.name, before: items[0].employee, after: person.name });
    await notifyAssignments(c, affected.map((a) => ({ ...a, employee: person.name })));
    return ok(`${affected.length} ${affected.length === 1 ? 'Tag' : 'Tage'} an ${person.name} übergeben.`);
  });
}

/* ---------------- Rotation ---------------- */
export async function runStandbyRotation(inp: { teams: string[]; timeId: string; from: string; to: string; mode: 'week' | 'day'; keep: boolean; start?: string; end?: string }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const avail = manageableTeams(c, 'Bereitschaft');
    const chosen = avail.filter((t) => inp.teams.includes(t.name));
    if (!chosen.length) return fail('Bitte mindestens ein Team wählen.');
    if (!validDateInput(inp.from) || !validDateInput(inp.to) || inp.to < inp.from) return fail('Das Enddatum darf nicht vor dem Startdatum liegen.');
    if (daysBetween(inp.from, inp.to) + 1 > 366) return fail('Bitte einen Zeitraum von höchstens 366 Tagen auswählen.');
    const st = c.data.standbyTimes.find((x) => x.id === inp.timeId);
    if (!st) return fail('Bereitschaftszeit nicht gefunden.');
    const bad = chosen.filter((t) => !standbyTimeForTeam(st, t.name, c.data.teams));
    if (bad.length) return fail(`„${st.name}“ ist für ${bad.map((t) => t.name).join(', ')} nicht freigegeben. Bitte diese Teams abwählen oder eine andere Bereitschaftszeit wählen.`);
    if (!eachDayIso(inp.from, inp.to).some((d) => standbyDayOk(st, d))) return fail(`„${st.name}“ ist nur an diesen Tagen möglich: ${standbyDaysLabel(st)} – im Zeitraum liegt kein passender Tag.`);
    const variable = isVariableStandby(st);
    if (variable && (!T.test(inp.start || '') || !T.test(inp.end || '') || inp.start === inp.end)) return fail(`${st.name} ist eine variable Bereitschaft – bitte Beginn und Ende eingeben.`);
    const res = planStandbyRotation({
      entries: c.data.entries,
      teams: chosen.map((t) => ({ name: t.name, standbyColor: t.standbyColor, members: standbyRotationMembers(t, c.data.staff).map((p) => p.name) })),
      time: st,
      group: c.data.standbyGroups.find((g) => g.id === st.groupId),
      from: inp.from,
      to: inp.to,
      mode: inp.mode,
      keep: inp.keep,
      start: variable ? inp.start : undefined,
      end: variable ? inp.end : undefined,
    });
    if (res.removed.length) await prisma.entry.deleteMany({ where: { id: { in: res.removed } } });
    const created = await insertEntries(c, res.created);
    await audit(c, 'Erstellt', 'Bereitschaft', `${created.length} Einträge · ${chosen.map((t) => t.name).join(', ')}`, { title: 'Rotation automatisch geplant', object: `${F.fmtIsoDate(inp.from)} – ${F.fmtIsoDate(inp.to)}`, after: `${created.length} Bereitschaften angelegt` });
    await notifyAssignments(c, created);
    return ok(created.length ? `${created.length} Bereitschaften wurden eingeteilt.` : 'Keine Lücken gefunden – nichts zu tun.');
  });
}

export async function runDutyRotation(inp: { teams: string[]; shifts: string[]; from: string; to: string; mode: 'week' | 'day'; keep: boolean }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const avail = manageableTeams(c, 'Dienstplan').filter((t) => c.data.shiftTypes.some((s) => s.team === t.name));
    const chosen = avail.filter((t) => inp.teams.includes(t.name));
    if (!chosen.length) return fail('Bitte mindestens ein Team wählen.');
    if (!inp.shifts.length) return fail('Bitte mindestens einen Dienst wählen.');
    if (!validDateInput(inp.from) || !validDateInput(inp.to)) return fail(DATE_RANGE_MSG);
    if (inp.to < inp.from) return fail('Das Enddatum darf nicht vor dem Startdatum liegen.');
    if (daysBetween(inp.from, inp.to) + 1 > 366) return fail('Bitte einen Zeitraum von höchstens 366 Tagen auswählen.');
    const res = planDutyRotation({
      entries: c.data.entries,
      teams: chosen.map((t) => ({
        name: t.name,
        members: rotationMembers(t, c.data.staff).map((p) => p.name),
        shifts: inp.shifts.map((n) => c.data.shiftTypes.find((s) => s.team === t.name && s.name === n)).filter((s): s is NonNullable<typeof s> => !!s),
        favorites: Object.fromEntries(
          Object.entries(teamSettings(t).dutyFavorites)
            .map(([id, list]) => [c.data.staff.find((p) => p.id === id)?.name || '', list] as const)
            .filter(([name]) => !!name),
        ),
      })),
      from: inp.from,
      to: inp.to,
      mode: inp.mode,
      keep: inp.keep,
    });
    if (res.removed.length) await prisma.entry.deleteMany({ where: { id: { in: res.removed } } });
    const created = await insertEntries(c, res.created);
    const s = res.stats;
    await audit(c, 'Erstellt', 'Dienstplan', `${created.length} Einträge · ${chosen.map((t) => t.name).join(', ')} · ${inp.shifts.join(' / ')}`, {
      title: 'Dienst-Rotation automatisch geplant',
      object: `${F.fmtIsoDate(inp.from)} – ${F.fmtIsoDate(inp.to)}`,
      after: `${created.length} Dienste angelegt${s.moved ? `, ${s.moved} wegen Abwesenheit umverteilt` : ''}`,
    });
    await notifyAssignments(c, created);
    const extra = [s.absent ? `${s.absent}× abwesend` : '', s.dayFree ? `${s.dayFree}× dienstfrei (kein passender bzw. ausgewählter Dienst mehr frei)` : '', s.noShift.length ? `ohne passende Dienste: ${s.noShift.join(', ')}` : '']
      .filter(Boolean)
      .join(' · ');
    const uf = Object.entries(s.unfilledShifts);
    const wish = uf.length ? ` Unbesetzt (niemand verfügbar bzw. ausgewählt): ${uf.map(([n, c]) => `${n} ${c}×`).join(', ')}.` : '';
    return ok(
      created.length
        ? `${created.length} Dienste wurden eingeteilt.${wish}${extra ? ' Ausgelassen: ' + extra + '.' : ''}${s.moved ? ` ${s.moved} ${s.moved === 1 ? 'Dienst wurde' : 'Dienste wurden'} wegen Abwesenheit umverteilt.` : ''}${s.unfilled && !uf.length ? ` Achtung: ${s.unfilled}× blieb ein Dienst unbesetzt (zu wenige Personen).` : ''}${s.shortRest ? ` Hinweis: ${s.shortRest}× weniger als 11 Std. Ruhezeit zum Vortag.` : ''}`
        : `Keine freien Plätze gefunden – nichts zu tun.${extra ? ' Ausgelassen: ' + extra + '.' : ''}`,
    );
  });
}

/* ---------------- Archivieren (älter als 12 Monate) ---------------- */
export async function archiveOldEntries(): Promise<ActionResult<{ count: number }>> {
  return withCtx(async (c) => {
    if (c.user.role !== 'Admin') return fail('Nur Admins können archivieren.');
    const cut = new Date();
    cut.setFullYear(cut.getFullYear() - 1);
    const cutIso = isoDate(cut);
    const old = c.data.entries.filter((a) => a.date < cutIso);
    if (!old.length) return fail('Keine Einträge älter als 12 Monate.');
    await prisma.entry.deleteMany({ where: { date: { lt: isoToDate(cutIso) } } });
    await audit(c, 'Gelöscht', 'Dienstplan', `${old.length} Einträge vor dem ${F.fmt(cut)} archiviert`, { title: 'Alte Einträge archiviert' });
    return ok(`${old.length} Einträge archiviert.`, { count: old.length });
  });
}

/* ---------------- Rückgängig (Strg Z) ----------------
   Stellt den Zustand vor der letzten eigenen Änderung wieder her: neu angelegte Einträge werden
   entfernt, gelöschte bzw. geänderte Einträge mit ihrer ursprünglichen ID wiederhergestellt. */
export async function restoreEntries(inp: { label: string; remove: string[]; upsert: Entry[] }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const label = String(inp?.label || 'Änderung').slice(0, 120);
    const remove = Array.isArray(inp?.remove) ? inp.remove.filter((x) => typeof x === 'string').slice(0, 2000) : [];
    const upsert = Array.isArray(inp?.upsert) ? inp.upsert.filter((e) => e && typeof e.id === 'string' && e.id && validDateInput(e.date)).slice(0, 2000) : [];
    if (!remove.length && !upsert.length) return fail('Nichts zum Rückgängigmachen.');
    const removeItems = remove.map((id) => c.data.entries.find((a) => a.id === id)).filter((a): a is Entry => !!a);
    for (const e of removeItems) if (!mayChangeEntry(c, e)) return fail('Du darfst diese Änderung nicht zurücknehmen.');
    for (const e of upsert) {
      if (!mayChangeEntry(c, e)) return fail('Du darfst diese Änderung nicht zurücknehmen.');
      const now = c.data.entries.find((a) => a.id === e.id);
      if (now && !mayChangeEntry(c, now)) return fail('Du darfst diese Änderung nicht zurücknehmen.');
    }
    const authorOf = (e: Entry) => (e.author ? c.data.staff.find((p) => p.name === e.author)?.id : undefined);
    await prisma.$transaction([
      ...(removeItems.length ? [prisma.entry.deleteMany({ where: { id: { in: removeItems.map((e) => e.id) } } })] : []),
      ...upsert.map((e) => {
        const data = entryData(c, e, authorOf(e));
        return prisma.entry.upsert({ where: { id: e.id }, create: { id: e.id, ...data }, update: data });
      }),
    ]);
    const area = [...removeItems, ...upsert].some((e) => e.kind === 'Bereitschaft') ? 'Bereitschaft' : 'Dienstplan';
    await audit(c, 'Geändert', area, 'Rückgängig: ' + label, { title: 'Änderung rückgängig gemacht', object: label });
    return ok('Rückgängig: ' + label);
  });
}

/* ---------------- Rotation: Wunschdienste / Bereitschaftspersonen je Team ---------------- */
export async function saveRotationSettings(inp: { team: string; area: 'Dienstplan' | 'Bereitschaft'; dutyFavorites?: Record<string, string[]>; standbyIds?: string[] }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const t = manageableTeams(c, inp.area).find((x) => x.name === inp.team);
    if (!t) return fail('Für dieses Team darfst du die Rotation nicht einstellen.');
    const st = teamSettings(t);
    const next = { ...st };
    const changes: string[] = [];
    const nameOf = (id: string) => c.data.staff.find((p) => p.id === id)?.name || id;
    if (inp.area === 'Dienstplan' && inp.dutyFavorites) {
      const shiftNames = new Set(c.data.shiftTypes.filter((s) => s.team === t.name).map((s) => s.name));
      const fav: Record<string, string[]> = {};
      Object.entries(inp.dutyFavorites).forEach(([id, list]) => {
        if (!t.memberIds.includes(id) || !Array.isArray(list)) return;
        const l = [...new Set(list.filter((n) => typeof n === 'string' && shiftNames.has(n)))].slice(0, 20);
        if (l.length) fav[id] = l;
      });
      next.dutyFavorites = fav;
      changes.push(Object.keys(fav).length ? `Wunschdienste: ${Object.entries(fav).map(([id, l]) => `${nameOf(id)} (${l.join(', ')})`).join('; ')}` : 'Wunschdienste entfernt');
    }
    if (inp.area === 'Bereitschaft' && inp.standbyIds) {
      const ids = [...new Set(inp.standbyIds.filter((id) => typeof id === 'string' && t.memberIds.includes(id)))];
      if (!ids.length) return fail('Bitte mindestens eine Person für die Bereitschaft auswählen.');
      next.standbyIds = ids;
      changes.push(`Bereitschaft machen: ${ids.map(nameOf).join(', ')}`);
    }
    if (!changes.length || JSON.stringify(next) === JSON.stringify(st)) return ok('');
    await prisma.team.update({ where: { id: t.id }, data: { settings: next as never } });
    await audit(c, 'Geändert', inp.area, `${t.name}: ${changes.join(' · ')}`, { title: inp.area === 'Bereitschaft' ? 'Bereitschaftspersonen festgelegt' : 'Wunschdienste festgelegt', object: t.name });
    return ok(inp.area === 'Bereitschaft' ? `Bereitschaftspersonen für ${t.name} gespeichert.` : `Wunschdienste für ${t.name} gespeichert.`);
  });
}
