import 'server-only';
/* Datenbank-Zeilen → Domänenobjekte (Format der Fachlogik) */
import { initials } from '@/lib/demo-data';
import type { Entry, EntryKind, Person, StandbyTime, SwapRequest, SwapSnap, Team, TeamSettings } from '@/lib/types';
import type * as P from '@/generated/prisma/client';

export const KIND_FROM_DB: Record<P.EntryKind, EntryKind> = {
  DIENSTPLAN: 'Dienstplan',
  BEREITSCHAFT: 'Bereitschaft',
  ARBEITSORT: 'Arbeitsort',
  NOTIZ: 'Notiz',
};
export const KIND_TO_DB: Record<EntryKind, P.EntryKind> = {
  Dienstplan: 'DIENSTPLAN',
  Bereitschaft: 'BEREITSCHAFT',
  Arbeitsort: 'ARBEITSORT',
  Notiz: 'NOTIZ',
};
export const SWAP_FROM_DB: Record<P.SwapStatus, SwapRequest['status']> = {
  OFFEN: 'offen',
  ANGENOMMEN: 'angenommen',
  ABGELEHNT: 'abgelehnt',
  ZURUECKGEZOGEN: 'zurückgezogen',
  UNGUELTIG: 'ungültig',
};
export const SWAP_TO_DB = Object.fromEntries(Object.entries(SWAP_FROM_DB).map(([k, v]) => [v, k])) as Record<SwapRequest['status'], P.SwapStatus>;

/** Date (@db.Date, UTC-Mitternacht) ↔ "YYYY-MM-DD" */
export const dateToIso = (d: Date) => d.toISOString().slice(0, 10);
export const isoToDate = (iso: string) => new Date(iso + 'T00:00:00Z');

export const toPerson = (e: P.Employee): Person => ({
  id: e.id,
  name: e.name,
  initials: initials(e.name),
  email: e.email || '',
  phone: e.phone || '',
  teamsPhone: e.teamsPhone || '',
  photo: e.photo || '',
  role: e.roleName,
});

export const toTeam = (t: P.Team & { members: P.TeamMember[] }): Team => ({
  id: t.id,
  name: t.name,
  memberIds: t.members.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.employeeId),
  leaderId: t.leaderId || '',
  deputyId: t.deputyId || '',
  standbyColor: t.standbyColor || '',
  settings: (t.settings as Partial<TeamSettings>) || {},
  departmentId: t.departmentId || undefined,
});

export const toStandbyTime = (t: P.StandbyTime & { teams: P.StandbyTimeTeam[] }): StandbyTime => ({
  id: t.id,
  name: t.name,
  type: t.type === 'VARIABEL' ? 'variabel' : 'fix',
  start: t.start || '',
  end: t.end || '',
  color: t.color,
  days: t.days.length === 7 ? undefined : t.days,
  hol: t.holidays ? undefined : false,
  teamIds: t.allTeams ? undefined : t.teams.map((x) => x.teamId),
  groupId: t.groupId || undefined,
});

export function toEntry(e: P.Entry, names: { emp: Map<string, string>; team: Map<string, string> }): Entry {
  return {
    id: e.id,
    kind: KIND_FROM_DB[e.kind],
    isAbsence: e.isAbsence || undefined,
    team: (e.teamId && names.team.get(e.teamId)) || 'Ohne Team',
    teamId: e.teamId || undefined,
    employee: names.emp.get(e.employeeId) || '?',
    empId: e.employeeId,
    date: dateToIso(e.date),
    shift: e.shift,
    start: e.start || '',
    end: e.end || '',
    color: e.color || undefined,
    note: e.note || undefined,
    groupId: e.groupId || undefined,
    groupName: e.groupName || undefined,
    author: (e.authorId && names.emp.get(e.authorId)) || undefined,
  };
}

export function toSwap(s: P.SwapRequest, emp: Map<string, string>): SwapRequest {
  return {
    id: s.id,
    status: SWAP_FROM_DB[s.status],
    from: emp.get(s.fromId) || '?',
    fromId: s.fromId,
    to: emp.get(s.toId) || '?',
    toId: s.toId,
    give: (s.give as unknown as SwapSnap[]) || [],
    take: (s.take as unknown as SwapSnap[]) || [],
    note: s.note,
    createdAt: s.createdAt.getTime(),
    decidedAt: s.decidedAt?.getTime() || 0,
  };
}
