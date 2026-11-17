/* Berechtigungen pro Rolle und Bereich: „N“ (kein Zugriff), „R“ (Lesen), „E“ (Bearbeiten).
   Die Matrix unter „Team Berechtigungen“ steuert Navigation und Bearbeitungsrechte.
   Diese Funktionen laufen identisch im Browser (Anzeige) und auf dem Server (Prüfung). */
import { PERM_AREAS, type Page, type PermArea, type PermLevel, type RolePermissions } from './types';

export const SYSTEM_ROLES = ['Mitarbeiter', 'Teamleiter', 'Abteilungsleiter', 'Deputy', 'Admin', 'Lohnverrechnung', 'Bereitschaftsadmin'];

const all = (lvl: PermLevel) => Object.fromEntries(PERM_AREAS.map((a) => [a, lvl])) as RolePermissions;

export const DEFAULT_PERMS: Record<string, RolePermissions> = {
  Admin: all('E'),
  Teamleiter: { Dashboard: 'E', Dienstplan: 'E', Bereitschaft: 'E', Dienstzeiten: 'E', Kontakte: 'R', 'Berichte / Export': 'E', Administration: 'E', 'Bereitschaft verwalten': 'E', Einstellungen: 'E' },
  Deputy: { Dashboard: 'E', Dienstplan: 'E', Bereitschaft: 'E', Dienstzeiten: 'E', Kontakte: 'R', 'Berichte / Export': 'E', Administration: 'E', Einstellungen: 'E' },
  Abteilungsleiter: { Dashboard: 'E', Dienstplan: 'E', Bereitschaft: 'E', Dienstzeiten: 'E', Kontakte: 'R', 'Berichte / Export': 'E', Administration: 'E', 'Audit Log': 'R', Einstellungen: 'E' },
  Mitarbeiter: { Dashboard: 'R', Dienstplan: 'R', Bereitschaft: 'R', Kontakte: 'R', Einstellungen: 'E' },
  Lohnverrechnung: { Dashboard: 'R', Dienstplan: 'R', Bereitschaft: 'R', Kontakte: 'R', 'Berichte / Export': 'E', Einstellungen: 'E' },
  Bereitschaftsadmin: { Bereitschaft: 'E', Kontakte: 'R', Einstellungen: 'E' },
};

/** Grundrechte für selbst angelegte Rollen – nie automatisch Adminrechte */
export const BASE_PERMS: RolePermissions = { Dashboard: 'R', Dienstplan: 'R', Bereitschaft: 'R', Kontakte: 'R', Einstellungen: 'E' };

export function permsFor(role: string, stored: Record<string, RolePermissions> = {}): Record<PermArea, PermLevel> {
  const p = stored[role] || DEFAULT_PERMS[role] || BASE_PERMS;
  return Object.fromEntries(
    PERM_AREAS.map((a) => [a, role === 'Admin' ? 'E' : a === 'Einstellungen' ? 'E' : p[a] || 'N']),
  ) as Record<PermArea, PermLevel>;
}

export const perm = (area: PermArea, role: string, stored?: Record<string, RolePermissions>) => permsFor(role, stored)[area] || 'N';
export const canViewArea = (area: PermArea, role: string, stored?: Record<string, RolePermissions>) => perm(area, role, stored) !== 'N';
export const canEditArea = (area: PermArea, role: string, stored?: Record<string, RolePermissions>) => perm(area, role, stored) === 'E';

export function allowedPages(role: string, stored?: Record<string, RolePermissions>): Page[] {
  return [...PERM_AREAS.filter((a) => perm(a, role, stored) !== 'N'), 'Hilfe'];
}

/** Sichtbare Rolle: Admin sehen nur Teamleiter, Abteilungsleiter & Admin; Deputy sieht nur der Admin – sonst „Mitarbeiter“ */
export function visibleRole(role: string | undefined, viewerRole: string): string {
  const r = role || 'Mitarbeiter';
  if (r === 'Admin' && !['Teamleiter', 'Abteilungsleiter', 'Admin'].includes(viewerRole)) return 'Mitarbeiter';
  if (r === 'Deputy' && viewerRole !== 'Admin') return 'Mitarbeiter';
  return r;
}

/** Anzeige-Name einer Rolle (intern bleibt „Deputy“) */
export const roleLabel = (role: string) => (role === 'Deputy' ? 'Stellvertretung' : role);

/* ---------- Seiten ↔ URL ---------- */
export const PAGE_ROUTES: Record<Page, string> = {
  Dashboard: '/dashboard',
  Dienstplan: '/dienstplan',
  Bereitschaft: '/bereitschaft',
  Dienstzeiten: '/dienstzeiten',
  Kontakte: '/kontakte',
  'Berichte / Export': '/berichte',
  Administration: '/administration',
  'Bereitschaft verwalten': '/bereitschaft-verwalten',
  'Team Berechtigungen': '/berechtigungen',
  'Audit Log': '/audit-log',
  'Export Audit': '/export-audit',
  Einstellungen: '/einstellungen',
  Hilfe: '/hilfe',
};

export function pageFromPath(path: string): Page | null {
  const hit = (Object.entries(PAGE_ROUTES) as [Page, string][]).find(([, r]) => path === r || path.startsWith(r + '/'));
  return hit ? hit[0] : null;
}
