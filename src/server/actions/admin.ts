'use server';
/* Verwaltung: Dienstzeiten, Bereitschaftszeiten, Teamfarben, Kontakte, Teams, Abteilungen, Rollen */
import { prisma } from '../db';
import { audit, fail, ok, withCtx, type ActionResult } from '../context';
import { adminCaps, adminTeams, autoLeaderFor, manageableTeams, standbyColorTeams, teamSettings } from '@/lib/access';
import { distinctTeamColor } from '@/lib/colors';
import { isHex, shiftHexColor, standbyTimeAllTeams, tRange } from '@/lib/entries';
import { initials } from '@/lib/demo-data';
import { BASE_PERMS, canEditArea, permsFor } from '@/lib/permissions';
import { PERM_AREAS, type Ctx, type PermLevel, type RolePermissions, type TeamSettings } from '@/lib/types';

const T = /^\d\d:\d\d$/;
const MAX_TEAMS = 20;

/* ======================= Dienstzeiten ======================= */
export async function saveShiftType(inp: { id?: string; team: string; name: string; start: string; end: string; multi: boolean; color: string }): Promise<ActionResult<{ id: string }>> {
  return withCtx(async (c) => {
    const team = manageableTeams(c, 'Dienstzeiten').find((t) => t.name === inp.team);
    if (!team) return fail('Du darfst nur Dienstzeiten deiner zugeordneten Teams bearbeiten.');
    const name = inp.name.trim().slice(0, 60);
    if (!name) return fail('Bitte eine Bezeichnung eingeben.');
    if (!T.test(inp.start) || !T.test(inp.end)) return fail('Bitte Beginn und Ende angeben.');
    if (inp.start === inp.end) return fail('Beginn und Ende dürfen nicht gleich sein.');
    if (c.data.shiftTypes.some((x) => x.id !== inp.id && x.team === team.name && x.name.toLowerCase() === name.toLowerCase())) return fail('Diese Bezeichnung gibt es in diesem Team bereits.');
    const old = inp.id ? c.data.shiftTypes.find((x) => x.id === inp.id) : undefined;
    if (inp.id && (!old || !manageableTeams(c, 'Dienstzeiten').some((t) => t.name === old.team))) return fail('Du darfst diese Dienstzeit nicht bearbeiten.');
    const data = { teamId: team.id, name, start: inp.start, end: inp.end, multi: inp.multi, color: shiftHexColor(inp.color), pauseMin: 30 };
    const row = old ? await prisma.shiftType.update({ where: { id: old.id }, data }) : await prisma.shiftType.create({ data });
    if (old && old.name !== name) await prisma.entry.updateMany({ where: { kind: 'DIENSTPLAN', teamId: old.teamId, shift: old.name }, data: { shift: name } });
    const after = `${name} ${inp.start}–${inp.end}${inp.multi ? '' : ' · 1× pro Tag'}`;
    await audit(c, old ? 'Geändert' : 'Erstellt', 'Dienstzeiten', `${team.name} · ${name} (${inp.start}–${inp.end})`, {
      title: old ? 'Dienstzeit geändert' : 'Dienstzeit erstellt',
      object: team.name,
      before: old ? `${old.name} ${tRange(old)}${old.multi ? '' : ' · 1× pro Tag'}` : '',
      after,
    });
    return ok(old ? 'Dienstzeit gespeichert.' : 'Dienstzeit erstellt.', { id: row.id });
  });
}

export async function duplicateShiftType(id: string): Promise<ActionResult<{ id: string }>> {
  return withCtx(async (c) => {
    const x = c.data.shiftTypes.find((s) => s.id === id);
    if (!x || !manageableTeams(c, 'Dienstzeiten').some((t) => t.name === x.team)) return fail('Du darfst diese Dienstzeit nicht duplizieren.');
    let name = x.name + ' (Kopie)';
    for (let i = 2; c.data.shiftTypes.some((s) => s.team === x.team && s.name === name); i++) name = `${x.name} (Kopie ${i})`;
    const row = await prisma.shiftType.create({ data: { teamId: x.teamId, name, start: x.start, end: x.end, multi: x.multi, color: x.color, pauseMin: x.pause } });
    await audit(c, 'Erstellt', 'Dienstzeiten', `${x.team} · ${name}`, { title: 'Dienstzeit dupliziert', object: x.team, after: `${name} ${tRange(x)}` });
    return ok('Dienstzeit dupliziert – Bezeichnung jetzt anpassen.', { id: row.id });
  });
}

export async function deleteShiftType(id: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    const x = c.data.shiftTypes.find((s) => s.id === id);
    if (!x || !manageableTeams(c, 'Dienstzeiten').some((t) => t.name === x.team)) return fail('Du darfst diese Dienstzeit nicht löschen.');
    await prisma.shiftType.delete({ where: { id } });
    await audit(c, 'Gelöscht', 'Dienstzeiten', `${x.team} · ${x.name} (${tRange(x)})`, { title: 'Dienstzeit gelöscht', object: x.team, before: `${x.name} ${tRange(x)}` });
    return ok('Dienstzeit gelöscht.');
  });
}

/* ======================= Bereitschaftszeiten (nur Admin) ======================= */
export async function saveStandbyTime(inp: { id?: string; name: string; type: 'fix' | 'variabel'; start: string; end: string; color: string; days: number[]; hol: boolean; teamIds: string[] }): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (c.user.role !== 'Admin') return fail('Bereitschaftszeiten kann nur ein Admin verwalten.');
    const name = inp.name.trim().slice(0, 60);
    const vr = inp.type === 'variabel';
    const days = [...new Set(inp.days.filter((d) => d >= 0 && d <= 6))].sort();
    const chosen = c.data.teams.filter((t) => inp.teamIds.includes(t.id));
    if (!days.length && !inp.hol) return fail('Bitte mindestens einen Wochentag oder Feiertage auswählen.');
    if (!name || !chosen.length) return fail('Bitte alle Angaben prüfen.');
    /* Gleicher Name ist für verschiedene Teams erlaubt – nur innerhalb eines Teams muss er eindeutig sein */
    const allNew = chosen.length === c.data.teams.length;
    const clash = c.data.standbyTimes.find((t) => t.id !== inp.id && t.name.toLowerCase() === name.toLowerCase() && (allNew || standbyTimeAllTeams(t) || chosen.some((x) => (t.teamIds || []).includes(x.id))));
    if (clash) {
      const both = standbyTimeAllTeams(clash) || allNew ? chosen : chosen.filter((x) => (clash.teamIds || []).includes(x.id));
      return fail(`${both.map((x) => x.name).join(', ')} ${both.length === 1 ? 'hat' : 'haben'} bereits eine Bereitschaft „${clash.name}“. Bitte einen anderen Namen wählen.`);
    }
    if (!vr && (!T.test(inp.start) || !T.test(inp.end) || inp.start === inp.end)) return fail('Bitte Beginn und Ende angeben.');
    const allSel = chosen.length === c.data.teams.length;
    const data = {
      name,
      type: vr ? ('VARIABEL' as const) : ('FIX' as const),
      start: vr ? null : inp.start,
      end: vr ? null : inp.end,
      color: isHex(inp.color) ? inp.color : '#159da8',
      days,
      holidays: inp.hol,
      allTeams: allSel,
    };
    const teamTxt = allSel ? 'Alle Teams' : chosen.map((t) => t.name).join(', ');
    const range = vr ? 'variabel' : `${inp.start}–${inp.end}`;
    const ex = inp.id ? c.data.standbyTimes.find((t) => t.id === inp.id) : undefined;
    if (inp.id && !ex) return fail('Bereitschaftszeit nicht gefunden.');
    await prisma.$transaction(async (tx) => {
      const row = ex ? await tx.standbyTime.update({ where: { id: ex.id }, data }) : await tx.standbyTime.create({ data: { ...data, groupId: c.data.standbyGroups[0]?.id ?? null } });
      await tx.standbyTimeTeam.deleteMany({ where: { standbyTimeId: row.id } });
      if (!allSel) await tx.standbyTimeTeam.createMany({ data: chosen.map((t) => ({ standbyTimeId: row.id, teamId: t.id })) });
    });
    await audit(c, ex ? 'Geändert' : 'Erstellt', 'Bereitschaftszeiten', `${name} (${range}) · ${teamTxt}`, {
      title: ex ? 'Bereitschaftszeit geändert' : 'Bereitschaftszeit angelegt',
      object: name,
      before: ex ? `${ex.name} (${tRange(ex)})` : '',
      after: `${name} (${range}) · ${teamTxt}`,
    });
    return ok(ex ? 'Bereitschaftszeit gespeichert.' : 'Bereitschaftszeit angelegt.');
  });
}

export async function deleteStandbyTime(id: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (c.user.role !== 'Admin') return fail('Bereitschaftszeiten kann nur ein Admin verwalten.');
    const t = c.data.standbyTimes.find((x) => x.id === id);
    if (!t) return fail('Bereitschaftszeit nicht gefunden.');
    await prisma.standbyTime.delete({ where: { id } });
    await audit(c, 'Gelöscht', 'Bereitschaftszeiten', `${t.name} (${tRange(t)})`, { title: 'Bereitschaftszeit gelöscht', object: t.name, before: tRange(t) });
    return ok('Bereitschaftszeit gelöscht.');
  });
}

export async function setTeamStandbyColor(teamId: string, color: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    const t = standbyColorTeams(c).find((x) => x.id === teamId);
    if (!t) return fail('Du darfst die Bereitschaftsfarbe dieses Teams nicht ändern.');
    if (!isHex(color)) return fail('Ungültige Farbe.');
    await prisma.team.update({ where: { id: t.id }, data: { standbyColor: color } });
    await audit(c, 'Geändert', 'Teamfarben', `${t.name} → ${color}`, { title: 'Bereitschaftsfarbe geändert', object: t.name, before: t.standbyColor, after: color });
    return ok('Bereitschaftsfarbe für ' + t.name + ' gespeichert.');
  });
}

/* ======================= Kontakte / Mitarbeiter ======================= */
export async function saveEmployee(inp: { id?: string; name: string; role: string; email: string; phone: string; teamsPhone: string; photo: string; teamNames: string[] }): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!canEditArea('Kontakte', c.user.role, c.data.permissions) && c.user.role !== 'Admin') return fail('Keine Berechtigung.');
    const name = inp.name.trim().slice(0, 80);
    if (!name) return fail('Bitte einen Mitarbeiternamen eingeben.');
    if (c.data.staff.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== inp.id)) return fail('Ein Mitarbeiter mit diesem Namen existiert bereits.');
    if (!c.data.roles.includes(inp.role)) return fail('Unbekannte Rolle.');
    const email = inp.email.trim().toLowerCase();
    if (email && c.data.staff.some((s) => s.email.toLowerCase() === email && s.id !== inp.id)) return fail('Diese E-Mail-Adresse wird bereits verwendet.');
    if (inp.photo && !/^data:image\/(png|jpe?g|gif|webp);base64,/.test(inp.photo)) return fail('Bitte ein Bild im Format JPG, PNG, GIF oder WebP auswählen.');
    const old = inp.id ? c.data.staff.find((s) => s.id === inp.id) : undefined;
    const data = { name, roleName: inp.role, email: email || null, phone: inp.phone.trim() || null, teamsPhone: inp.teamsPhone.trim() || null, photo: inp.photo || null };
    const selected = c.data.teams.filter((t) => inp.teamNames.includes(t.name));
    await prisma.$transaction(async (tx) => {
      const emp = old ? await tx.employee.update({ where: { id: old.id }, data }) : await tx.employee.create({ data });
      await tx.teamMember.deleteMany({ where: { employeeId: emp.id, teamId: { notIn: selected.map((t) => t.id) } } });
      for (const t of selected) await tx.teamMember.upsert({ where: { teamId_employeeId: { teamId: t.id, employeeId: emp.id } }, create: { teamId: t.id, employeeId: emp.id, sortOrder: t.memberIds.length }, update: {} });
      // Teamleitung/Stellvertretung entfernen, wenn nicht mehr Mitglied
      await tx.team.updateMany({ where: { leaderId: emp.id, id: { notIn: selected.map((t) => t.id) } }, data: { leaderId: null } });
      await tx.team.updateMany({ where: { deputyId: emp.id, id: { notIn: selected.map((t) => t.id) } }, data: { deputyId: null } });
    });
    await syncLeaders();
    await audit(c, old ? 'Geändert' : 'Erstellt', 'Kontakte', `${name} · ${inp.role}${selected.length ? ' · ' + selected.map((t) => t.name).join(', ') : ''}`);
    return ok('Mitarbeiter gespeichert.');
  });
}

export async function deleteEmployees(ids: string[]): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!canEditArea('Kontakte', c.user.role, c.data.permissions) && c.user.role !== 'Admin') return fail('Keine Berechtigung.');
    const self = ids.includes(c.user.id);
    const list = c.data.staff.filter((s) => ids.includes(s.id) && s.id !== c.user.id);
    if (!list.length) return fail(self ? 'Du kannst dich nicht selbst löschen.' : 'Keine Mitarbeiter ausgewählt.');
    const gone = c.data.entries.filter((a) => list.some((p) => p.name === a.employee)).length;
    await prisma.employee.deleteMany({ where: { id: { in: list.map((p) => p.id) } } });
    for (const p of list) await audit(c, 'Gelöscht', 'Kontakte', p.name, { title: 'Mitarbeiter gelöscht', object: p.name, after: 'entfernt' });
    const who = list.length === 1 ? 'Mitarbeiter' : `${list.length} Mitarbeiter`;
    return ok(gone ? `${who} gelöscht – ${gone} ${gone === 1 ? 'Eintrag' : 'Einträge'} in Dienstplan & Bereitschaft entfernt.` : `${who} gelöscht.`);
  });
}

/** Teamleitung automatisch aus der Rolle „Teamleiter“ setzen, wenn keine gültige vorhanden ist */
async function syncLeaders() {
  const teams = await prisma.team.findMany({ include: { members: true } });
  const staff = await prisma.employee.findMany({ select: { id: true, roleName: true } });
  const persons = staff.map((s) => ({ id: s.id, role: s.roleName }));
  for (const t of teams) {
    const memberIds = t.members.map((m) => m.employeeId);
    const leaderValid = !!t.leaderId && memberIds.includes(t.leaderId);
    const next = autoLeaderFor({ id: t.id, name: t.name, memberIds, leaderId: leaderValid ? t.leaderId! : '', deputyId: '', standbyColor: '', settings: {} }, persons as never);
    if ((t.leaderId || '') !== next) await prisma.team.update({ where: { id: t.id }, data: { leaderId: next || null } });
  }
}

/* ======================= Teams ======================= */
const teamColorsOf = (c: Ctx) => c.data.teams.map((t) => ({ id: t.id, color: t.standbyColor || '#14a1a9' }));

export async function createTeam(inp: { name: string; color: string; departmentId?: string }): Promise<ActionResult<{ id: string }>> {
  return withCtx(async (c) => {
    if (!adminCaps(c).create) return fail('Teams kann nur ein Admin anlegen.');
    if (c.data.teams.length >= MAX_TEAMS) return fail(`Es sind maximal ${MAX_TEAMS} Teams möglich.`);
    const name = inp.name.trim().slice(0, 60);
    if (!name || c.data.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) return fail('Ein Team mit diesem Namen existiert bereits.');
    const color = distinctTeamColor(isHex(inp.color) ? inp.color : '#14A1A9', teamColorsOf(c));
    const dept = c.data.departments.find((d) => d.id === inp.departmentId);
    const t = await prisma.team.create({ data: { name, standbyColor: color, departmentId: dept?.id ?? null, sortOrder: c.data.teams.length } });
    await audit(c, 'Erstellt', 'Teams', name, { title: 'Team angelegt', object: name, after: dept ? 'Abteilung: ' + dept.name : '' });
    return ok('Team angelegt.', { id: t.id });
  });
}

export interface SaveTeamInput {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
  leaderId: string;
  deputyId: string;
  settings: TeamSettings;
}
export async function saveTeam(inp: SaveTeamInput): Promise<ActionResult> {
  return withCtx(async (c) => {
    const caps = adminCaps(c);
    const t = adminTeams(c).find((x) => x.id === inp.id);
    if (!t || !caps.settings) return fail('Dieses Team kannst du nicht bearbeiten.');
    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    if (caps.structure) {
      const name = inp.name.trim().slice(0, 60);
      if (!name) return fail('Bitte einen Teamnamen eingeben.');
      if (c.data.teams.some((x) => x.id !== t.id && x.name.toLowerCase() === name.toLowerCase())) return fail('Ein Team mit diesem Namen existiert bereits.');
      const members = inp.memberIds.filter((id) => c.data.staff.some((p) => p.id === id));
      const leaderId = members.includes(inp.leaderId) ? inp.leaderId : '';
      const deputyId = members.includes(inp.deputyId) && inp.deputyId !== leaderId ? inp.deputyId : '';
      if (name !== t.name) changes.push(`Name: ${t.name} → ${name}`);
      if (leaderId !== t.leaderId) changes.push('Teamleitung geändert');
      if (deputyId !== t.deputyId) changes.push('Stellvertretung geändert');
      if (members.join() !== t.memberIds.join()) changes.push(`${members.length} Mitglieder`);
      Object.assign(data, { name, leaderId: leaderId || null, deputyId: deputyId || null });
      await prisma.$transaction(async (tx) => {
        await tx.teamMember.deleteMany({ where: { teamId: t.id } });
        await tx.teamMember.createMany({ data: members.map((employeeId, i) => ({ teamId: t.id, employeeId, sortOrder: i })) });
      });
    }
    if (caps.color && isHex(inp.color) && inp.color.toLowerCase() !== (t.standbyColor || '').toLowerCase()) {
      data.standbyColor = distinctTeamColor(inp.color, teamColorsOf(c), t.id);
      changes.push('Farbe geändert');
    }
    const st = teamSettings({ ...t, settings: inp.settings });
    const before = teamSettings(t);
    if (JSON.stringify(st) !== JSON.stringify(before)) {
      data.settings = st;
      changes.push(`Tausch ${st.swap ? 'an' : 'aus'} · Dienste selbst: ${st.selfDuty} · Bereitschaft selbst: ${st.selfStandby}`);
      if (st.minStaff.join() !== before.minStaff.join()) changes.push(`Mindestbesetzung: ${st.minStaff.some((n) => n > 0) ? st.minStaff.map((n, i) => ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i] + ' ' + n).join(', ') : 'keine'}`);
    }
    if (!changes.length) return ok('Keine Änderungen.');
    await prisma.team.update({ where: { id: t.id }, data });
    await syncLeaders();
    await audit(c, 'Geändert', 'Teams', `${t.name}: ${changes.join(' · ')}`, { title: 'Team geändert', object: t.name });
    return ok('Team gespeichert.');
  });
}

export async function deleteTeam(id: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!adminCaps(c).remove) return fail('Teams kann nur ein Admin löschen.');
    const t = c.data.teams.find((x) => x.id === id);
    if (!t) return fail('Team nicht gefunden.');
    const n = c.data.entries.filter((a) => a.team === t.name).length;
    await prisma.$transaction([prisma.entry.deleteMany({ where: { teamId: id } }), prisma.team.delete({ where: { id } })]);
    await audit(c, 'Gelöscht', 'Teams', t.name, { title: 'Team gelöscht', object: t.name, before: `${t.memberIds.length} Mitglieder, ${n} Einträge` });
    return ok('Team gelöscht.');
  });
}

/** Eigene Reihenfolge der Mitarbeiter in der Team-Ansicht wird in den persönlichen Einstellungen gespeichert (siehe savePrefs). */

/* ======================= Abteilungen ======================= */
export async function saveDepartment(inp: { id?: string; name: string; headId: string; color: string; teamIds: string[] }): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!adminCaps(c).dept) return fail('Abteilungen kann nur ein Admin verwalten.');
    const name = inp.name.trim().slice(0, 60);
    if (!name) return fail('Bitte einen Namen für die Abteilung eingeben.');
    if (c.data.departments.some((x) => x.id !== inp.id && x.name.toLowerCase() === name.toLowerCase())) return fail('Eine Abteilung mit diesem Namen existiert bereits.');
    const ex = inp.id ? c.data.departments.find((d) => d.id === inp.id) : undefined;
    const head = c.data.staff.find((p) => p.id === inp.headId);
    if (head && head.role !== 'Abteilungsleiter' && inp.headId !== ex?.headId) return fail('Als Abteilungsleitung sind nur Personen mit der Rolle „Abteilungsleiter“ möglich.');
    const teamIds = inp.teamIds.filter((id) => c.data.teams.some((t) => t.id === id));
    await prisma.$transaction(async (tx) => {
      const data = { name, headId: head?.id ?? null, color: isHex(inp.color) ? inp.color : '#0068A8' };
      const d = ex ? await tx.department.update({ where: { id: ex.id }, data }) : await tx.department.create({ data });
      await tx.team.updateMany({ where: { departmentId: d.id, id: { notIn: teamIds } }, data: { departmentId: null } });
      await tx.team.updateMany({ where: { id: { in: teamIds } }, data: { departmentId: d.id } });
    });
    await audit(c, ex ? 'Geändert' : 'Erstellt', 'Administration', `Abteilung ${name} · ${teamIds.length} Teams · Leitung: ${head?.name || '—'}`, { title: ex ? 'Abteilung geändert' : 'Abteilung angelegt', object: name });
    return ok(ex ? 'Abteilung gespeichert.' : 'Abteilung angelegt.');
  });
}

export async function deleteDepartment(id: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!adminCaps(c).dept) return fail('Abteilungen kann nur ein Admin verwalten.');
    const d = c.data.departments.find((x) => x.id === id);
    if (!d) return fail('Abteilung nicht gefunden.');
    await prisma.department.delete({ where: { id } });
    await audit(c, 'Gelöscht', 'Administration', `Abteilung ${d.name}`, { title: 'Abteilung gelöscht', object: d.name });
    return ok('Abteilung gelöscht.');
  });
}

/* ======================= Rollen & Berechtigungen ======================= */
const canEditRoles = (c: Ctx) => canEditArea('Team Berechtigungen', c.user.role, c.data.permissions);

export async function savePermissions(draft: Record<string, RolePermissions>): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!canEditRoles(c)) return fail('Keine Berechtigung.');
    const L: Record<PermLevel, string> = { N: '—', R: 'Lesen', E: 'Bearbeiten' };
    let n = 0;
    for (const r of c.data.roles) {
      if (r === 'Admin' || !draft[r]) continue;
      const cur = permsFor(r, c.data.permissions);
      const next = Object.fromEntries(PERM_AREAS.map((a) => [a, a === 'Einstellungen' ? 'E' : (['N', 'R', 'E'].includes(draft[r][a] as string) ? draft[r][a] : 'N')])) as RolePermissions;
      const diffs = PERM_AREAS.filter((a) => cur[a] !== next[a]);
      if (!diffs.length) continue;
      await prisma.role.update({ where: { name: r }, data: { permissions: next } });
      for (const a of diffs) {
        n++;
        await audit(c, 'Geändert', 'Berechtigungen', `${r} · ${a}`, { title: 'Berechtigung geändert', object: r, before: L[cur[a]], after: L[next[a] as PermLevel] });
      }
    }
    return ok(n ? `${n} Berechtigungen gespeichert.` : 'Keine Änderungen.');
  });
}

export async function addRole(name: string, copyFrom?: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!canEditRoles(c)) return fail('Keine Berechtigung.');
    const v = name.trim().slice(0, 40);
    if (!v) return fail('Bitte einen Namen eingeben.');
    if (c.data.roles.includes(v)) return fail('Diese Rolle gibt es bereits.');
    const permissions = copyFrom ? permsFor(copyFrom, c.data.permissions) : BASE_PERMS;
    await prisma.role.create({ data: { name: v, permissions, sortOrder: c.data.roles.length } });
    await audit(c, 'Erstellt', 'Rollen', v, { title: copyFrom ? 'Rolle dupliziert' : 'Rolle angelegt', object: v, before: copyFrom || '' });
    return ok(copyFrom ? 'Rolle dupliziert.' : 'Rolle angelegt.');
  });
}

export async function renameRole(oldName: string, newName: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!canEditRoles(c)) return fail('Keine Berechtigung.');
    const v = newName.trim().slice(0, 40);
    if (oldName === 'Admin') return fail('Die Admin-Rolle ist geschützt.');
    if (!v || v === oldName) return ok();
    if (c.data.roles.includes(v)) return fail('Diese Rolle gibt es bereits.');
    // Der Primärschlüssel wird per ON UPDATE CASCADE auch bei den Mitarbeitern geändert
    await prisma.role.update({ where: { name: oldName }, data: { name: v } });
    await audit(c, 'Geändert', 'Rollen', `${oldName} → ${v}`, { title: 'Rolle umbenannt', object: v, before: oldName, after: v });
    return ok('Rolle umbenannt.');
  });
}

export async function deleteRole(name: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (!canEditRoles(c)) return fail('Keine Berechtigung.');
    if (name === 'Admin') return fail('Die Admin-Rolle ist geschützt.');
    const used = c.data.staff.filter((s) => s.role === name).length;
    if (used) return fail(`Die Rolle ist noch ${used} Person(en) zugeordnet.`);
    await prisma.role.delete({ where: { name } });
    await audit(c, 'Gelöscht', 'Rollen', name, { title: 'Rolle gelöscht', object: name });
    return ok('Rolle gelöscht.');
  });
}
