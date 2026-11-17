import { buildDemoData } from '@/lib/demo-data';
import { DEFAULT_PERMS, SYSTEM_ROLES } from '@/lib/permissions';
import type { AppData, Ctx, Entry } from '@/lib/types';

export function demoCtx(userName = 'Alex Gruber', entries: Entry[] = []): Ctx {
  const d = buildDemoData();
  const data: AppData = {
    staff: d.staff,
    teams: d.teams,
    departments: [],
    roles: SYSTEM_ROLES,
    permissions: { ...DEFAULT_PERMS },
    shiftTypes: d.shiftTypes,
    standbyGroups: d.standbyGroups,
    standbyTimes: d.standbyTimes,
    entries,
    teamNotes: [],
    swaps: [],
    notifications: [],
    auditLog: [],
    exportLog: [],
    settings: { features: {}, cockpitLink: {} },
  };
  const p = d.staff.find((x) => x.name === userName)!;
  return { data, user: { id: p.id, name: p.name, role: p.role } };
}

let n = 0;
export const entry = (e: Partial<Entry>): Entry => ({ id: 'e' + ++n, kind: 'Dienstplan', team: 'Team Nord', employee: 'Alex Gruber', date: '2026-11-16', shift: 'Tagdienst', start: '07:00', end: '15:00', ...e });
