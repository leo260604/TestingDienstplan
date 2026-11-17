import 'server-only';
/* Lädt den gesamten Datenstand, den die angemeldete Person sehen darf. */
import { prisma } from './db';
import { dateToIso, toEntry, toPerson, toStandbyTime, toSwap, toTeam } from './mappers';
import { canViewArea } from '@/lib/permissions';
import { DEFAULT_PREFS, type AppData, type CurrentUser, type RolePermissions, type UserPrefs } from '@/lib/types';

export async function loadPermissions(): Promise<{ roles: string[]; permissions: Record<string, RolePermissions> }> {
  const roles = await prisma.role.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return { roles: roles.map((r) => r.name), permissions: Object.fromEntries(roles.map((r) => [r.name, r.permissions as RolePermissions])) };
}

export async function loadAppData(user: CurrentUser): Promise<AppData> {
  const { roles, permissions } = await loadPermissions();
  const [employees, teams, departments, shiftTypes, groups, times, entries, teamNotes, swaps, notifications, settings] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.team.findMany({ include: { members: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.department.findMany({ include: { teams: { select: { id: true } } }, orderBy: { name: 'asc' } }),
    prisma.shiftType.findMany({ include: { team: { select: { name: true } } } }),
    prisma.standbyGroup.findMany(),
    prisma.standbyTime.findMany({ include: { teams: true } }),
    prisma.entry.findMany({ orderBy: [{ date: 'asc' }, { start: 'asc' }] }),
    prisma.teamNote.findMany({ include: { team: { select: { name: true } }, author: { select: { name: true } } } }),
    prisma.swapRequest.findMany({ where: { OR: [{ status: 'OFFEN' }, { fromId: user.id }, { toId: user.id }] }, orderBy: { createdAt: 'desc' } }),
    prisma.notification.findMany({ where: { recipientId: user.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.appSetting.findMany(),
  ]);
  const empNames = new Map(employees.map((e) => [e.id, e.name]));
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const canAudit = canViewArea('Audit Log', user.role, permissions);
  const canExportAudit = canViewArea('Export Audit', user.role, permissions);
  const [auditLog, exportLog] = await Promise.all([
    canAudit ? prisma.auditLog.findMany({ orderBy: { ts: 'desc' }, take: 1500 }) : [],
    canExportAudit ? prisma.exportLog.findMany({ orderBy: { ts: 'desc' }, take: 1000 }) : [],
  ]);
  const setting = (k: string) => (settings.find((s) => s.key === k)?.value as Record<string, unknown>) || {};
  return {
    staff: employees.map(toPerson),
    teams: teams.map(toTeam),
    departments: departments.map((d) => ({ id: d.id, name: d.name, headId: d.headId || '', color: d.color, teamIds: d.teams.map((t) => t.id) })),
    roles,
    permissions,
    shiftTypes: shiftTypes.map((s) => ({ id: s.id, team: s.team.name, teamId: s.teamId, name: s.name, start: s.start, end: s.end, pause: s.pauseMin, multi: s.multi, color: s.color })),
    standbyGroups: groups.map((g) => ({ id: g.id, name: g.name })),
    standbyTimes: times.map(toStandbyTime),
    entries: entries.map((e) => toEntry(e, { emp: empNames, team: teamNames })),
    teamNotes: teamNotes.map((n) => ({ id: n.id, team: n.team.name, date: dateToIso(n.date), text: n.text, author: n.author?.name || '', created: n.createdAt.toISOString() })),
    swaps: swaps.map((s) => toSwap(s, empNames)),
    notifications: notifications.map((n) => ({
      id: n.id,
      recipientId: n.recipientId,
      recipientRole: n.recipientRole,
      title: n.title,
      message: n.message,
      createdAt: n.createdAt.getTime(),
      read: n.read,
      targetPage: n.targetPage,
      targetDate: n.targetDate || undefined,
      swapId: n.swapId || undefined,
      assignmentId: n.entryId || undefined,
    })),
    auditLog: auditLog.map((a) => ({ id: a.id, ts: a.ts.getTime(), user: a.userName, role: a.role, action: a.action, area: a.area, detail: a.detail, title: a.title, object: a.object, before: a.before, after: a.after })),
    exportLog: exportLog.map((x) => ({ id: x.id, ts: x.ts.getTime(), user: x.userName, role: x.role, report: x.report, format: x.format, rows: x.rows, status: x.status, range: x.range, size: x.size })),
    settings: { features: setting('features'), cockpitLink: setting('cockpitLink') },
  };
}

export async function loadPrefs(employeeId: string): Promise<UserPrefs> {
  const row = await prisma.userPreference.findUnique({ where: { employeeId } });
  const data = (row?.data as Partial<UserPrefs>) || {};
  return {
    ...DEFAULT_PREFS,
    ...data,
    defaults: { ...DEFAULT_PREFS.defaults, ...(data.defaults || {}) },
    notify: { ...DEFAULT_PREFS.notify, ...(data.notify || {}) },
  };
}
