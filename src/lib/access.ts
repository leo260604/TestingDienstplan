/* Team- und Eintragsrechte (Teamleitung, Stellvertretung, Selbst-Eintragung, Abwesenheiten …) */
import { canEditArea, canViewArea, allowedPages } from './permissions';
import type { Ctx, Person, PermArea, Team, TeamSettings, Entry } from './types';

export const teamByName = (c: Ctx, name: string) => c.data.teams.find((t) => t.name === name);
export const teamById = (c: Ctx, id: string) => c.data.teams.find((t) => t.id === id);
export const personByName = (c: Ctx, name: string) => c.data.staff.find((p) => p.name === name);
export const personById = (c: Ctx, id: string) => c.data.staff.find((p) => p.id === id);

export const canEdit = (c: Ctx, area: PermArea) => canEditArea(area, c.user.role, c.data.permissions);
export const canView = (c: Ctx, area: PermArea) => canViewArea(area, c.user.role, c.data.permissions);
export const pagesFor = (c: Ctx) => allowedPages(c.user.role, c.data.permissions);

export function teamSettings(t?: Team | null): TeamSettings {
  const v = (t && t.settings && typeof t.settings === 'object' ? t.settings : {}) as Partial<TeamSettings>;
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : []);
  const mode = (x: unknown) => (x === 'all' || x === 'selected' ? x : 'none');
  return {
    swap: v.swap !== false,
    selfDuty: mode(v.selfDuty),
    selfDutyIds: ids(v.selfDutyIds),
    selfStandby: mode(v.selfStandby),
    selfStandbyIds: ids(v.selfStandbyIds),
    dutyFavorites: (() => {
      const o = v.dutyFavorites && typeof v.dutyFavorites === 'object' && !Array.isArray(v.dutyFavorites) ? v.dutyFavorites : {};
      const r: Record<string, string[]> = {};
      Object.entries(o).forEach(([k, list]) => {
        const l = ids(list).slice(0, 20);
        if (l.length) r[k] = l;
      });
      return r;
    })(),
    standbyIds: ids(v.standbyIds),
    minStaff: Array.from({ length: 7 }, (_, i) => {
      const n = Array.isArray(v.minStaff) ? Number(v.minStaff[i]) : 0;
      return Number.isFinite(n) ? Math.max(0, Math.min(99, Math.round(n))) : 0;
    }),
  };
}

export function canManageTeam(c: Ctx, name: string): boolean {
  if (c.user.role === 'Admin') return true;
  if (!['Teamleiter', 'Deputy'].includes(c.user.role)) return false;
  const t = teamByName(c, name);
  if (!t) return false;
  return c.user.role === 'Teamleiter' ? t.leaderId === c.user.id : t.deputyId === c.user.id;
}

export function manageableTeams(c: Ctx, area: PermArea): Team[] {
  if (!canEdit(c, area)) return [];
  return c.user.role === 'Admin' ? c.data.teams : c.data.teams.filter((t) => canManageTeam(c, t.name));
}

export function selfEditAllowed(c: Ctx, teamName: string, area: string, uid = c.user.id): boolean {
  const t = teamByName(c, teamName);
  if (!t || !t.memberIds.includes(uid) || !['Dienstplan', 'Bereitschaft'].includes(area)) return false;
  const st = teamSettings(t);
  const m = area === 'Bereitschaft' ? st.selfStandby : st.selfDuty;
  const ids = area === 'Bereitschaft' ? st.selfStandbyIds : st.selfDutyIds;
  return m === 'all' || (m === 'selected' && ids.includes(uid));
}

export const areaOf = (a: Pick<Entry, 'kind'>): 'Bereitschaft' | 'Dienstplan' => (a.kind === 'Bereitschaft' ? 'Bereitschaft' : 'Dienstplan');
export const managesTeam = (c: Ctx, teamName: string, area: PermArea) => canEdit(c, area) && canManageTeam(c, teamName);

export function canEditEntry(c: Ctx, teamName: string, employee: string, area: 'Dienstplan' | 'Bereitschaft'): boolean {
  if (managesTeam(c, teamName, area)) return true;
  return employee === c.user.name && selfEditAllowed(c, teamName, area);
}
export const selfOnly = (c: Ctx, teamName: string, area: 'Dienstplan' | 'Bereitschaft') =>
  !managesTeam(c, teamName, area) && selfEditAllowed(c, teamName, area);

/** Teams, in denen die Person Einträge anlegen darf (verwaltet oder selbst) */
export function entryTeams(c: Ctx, area: 'Dienstplan' | 'Bereitschaft'): Team[] {
  const managed = manageableTeams(c, area);
  return [...managed, ...c.data.teams.filter((t) => !managed.includes(t) && selfEditAllowed(c, t.name, area))];
}

export function currentUserTeamNames(c: Ctx): string[] {
  return c.data.teams
    .filter((t) => t.leaderId === c.user.id || t.deputyId === c.user.id || t.memberIds.includes(c.user.id))
    .map((t) => t.name);
}

/** Abteilungsleitung mit eigener Abteilung sieht nur deren Teams; ohne Zuordnung alle Teams */
export function headDeptTeams(c: Ctx): Team[] | null {
  if (c.user.role !== 'Abteilungsleiter') return null;
  const mine = c.data.departments.filter((d) => d.headId === c.user.id);
  if (!mine.length) return null;
  const ids = new Set(mine.flatMap((d) => d.teamIds));
  return c.data.teams.filter((t) => ids.has(t.id));
}

export function settingsTeams(c: Ctx): Team[] {
  const { role, id } = c.user;
  if (role === 'Admin') return c.data.teams;
  if (role === 'Abteilungsleiter') return headDeptTeams(c) || c.data.teams;
  if (role === 'Teamleiter') return c.data.teams.filter((t) => t.leaderId === id);
  if (role === 'Deputy') return c.data.teams.filter((t) => t.deputyId === id);
  return [];
}

export function absenceTeams(c: Ctx): Team[] {
  if (['Lohnverrechnung', 'Bereitschaftsadmin'].includes(c.user.role)) return [];
  if (['Abteilungsleiter', 'Admin'].includes(c.user.role)) return c.data.teams;
  const mine = currentUserTeamNames(c);
  return c.data.teams.filter((t) => mine.includes(t.name));
}

export const absenceTeamFor = (c: Ctx, p?: Person) => (p ? c.data.teams.find((t) => t.memberIds.includes(p.id)) : undefined);

export function canCreateAbsenceFor(c: Ctx, p?: Person): boolean {
  if (!p || ['Lohnverrechnung', 'Bereitschaftsadmin'].includes(c.user.role)) return false;
  if (['Abteilungsleiter', 'Admin'].includes(c.user.role)) return true;
  const team = absenceTeamFor(c, p);
  return !!team && absenceTeams(c).some((t) => t.id === team.id);
}

export function canSeeStandbyInDutyPlan(c: Ctx, a: Entry): boolean {
  if (['Admin', 'Abteilungsleiter'].includes(c.user.role)) return true;
  return currentUserTeamNames(c).includes(a.team);
}

/** Teams im Blick (Dashboard, Berichte) */
export function scopeTeams(c: Ctx): Team[] {
  if (['Admin', 'Abteilungsleiter', 'Lohnverrechnung'].includes(c.user.role)) return c.data.teams;
  const mine = c.data.teams.filter((t) => currentUserTeamNames(c).includes(t.name));
  return mine.length ? mine : c.data.teams;
}

/* ---------- Notizen ---------- */
export function canNoteFor(c: Ctx, name: string): boolean {
  if (name && name === c.user.name) return true;
  if (c.user.role === 'Admin') return true;
  if (['Teamleiter', 'Deputy'].includes(c.user.role)) {
    const id = personByName(c, name)?.id;
    const mine = currentUserTeamNames(c);
    return !!id && c.data.teams.some((t) => mine.includes(t.name) && t.memberIds.includes(id));
  }
  return false;
}

/** Teamnotizen anlegen: jeder für seine eigenen Teams (Admin, Abteilungsleitung, Lohnverrechnung für alle Teams im Blick) */
export function teamNoteTeams(c: Ctx): string[] {
  return scopeTeams(c).map((t) => t.name);
}

/** Teamnotiz bearbeiten/löschen: Admin, Abteilungsleitung, Teamleitung/Stellvertretung des Teams oder wer sie geschrieben hat */
export function canChangeTeamNote(c: Ctx, n: { team: string; author: string }): boolean {
  if (!teamNoteTeams(c).includes(n.team)) return false;
  if (['Admin', 'Abteilungsleiter'].includes(c.user.role)) return true;
  return canManageTeam(c, n.team) || (!!n.author && n.author === c.user.name);
}

/* ---------- Administration ---------- */
export function adminCaps(c: Ctx) {
  const ed = canEdit(c, 'Administration');
  const role = c.user.role;
  return {
    all: role === 'Admin' || (role === 'Abteilungsleiter' && !headDeptTeams(c)),
    dept: ed && role === 'Admin',
    create: ed && role === 'Admin',
    remove: ed && role === 'Admin',
    structure: ed && ['Admin', 'Abteilungsleiter'].includes(role),
    settings: ed,
    color: ed,
  };
}
export const adminTeams = (c: Ctx) => (adminCaps(c).all ? c.data.teams : settingsTeams(c));

/** Bereitschaftsfarben: Admin alle Teams, Teamleitung die eigenen */
export function standbyColorTeams(c: Ctx): Team[] {
  if (!canEdit(c, 'Bereitschaft verwalten')) return [];
  return c.user.role === 'Admin' ? c.data.teams : c.data.teams.filter((t) => t.leaderId === c.user.id);
}

/** Teamleitung automatisch: hat ein Team keine gültige, wird ein Mitglied mit Rolle „Teamleiter“ eingetragen */
export function autoLeaderFor(t: Team, staff: Person[]): string {
  if (t.leaderId && staff.some((p) => p.id === t.leaderId)) return t.leaderId;
  return staff.find((p) => t.memberIds.includes(p.id) && p.role === 'Teamleiter')?.id || '';
}

/** Teamleiter nehmen an keiner automatischen Rotation teil */
export const rotationMembers = (t: Team, staff: Person[]) =>
  staff.filter((p) => t.memberIds.includes(p.id) && p.role !== 'Teamleiter' && p.id !== t.leaderId);

/** Wer bei der Bereitschafts-Rotation eingeteilt wird: die im Team festgelegten Personen, sonst alle außer der Teamleitung */
export function standbyRotationMembers(t: Team, staff: Person[]): Person[] {
  const ids = teamSettings(t).standbyIds.filter((id) => t.memberIds.includes(id));
  return ids.length ? staff.filter((p) => ids.includes(p.id)) : rotationMembers(t, staff);
}

export function orderedMembers(t: Team, staff: Person[], order: string[] = []): Person[] {
  const list = staff.filter((p) => t.memberIds.includes(p.id));
  const byMember = t.memberIds;
  const ix = (p: Person) => {
    const i = order.indexOf(p.id);
    return i < 0 ? 1e6 + byMember.indexOf(p.id) : i;
  };
  return list.slice().sort((a, b) => ix(a) - ix(b));
}
