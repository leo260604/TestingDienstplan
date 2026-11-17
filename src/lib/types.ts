/* ---------------------------------------------------------------------------
   Domänentypen – entsprechen dem bisherigen Datenformat der Browser-Version,
   nur mit sprechenden Feldnamen statt Array-Indizes (staff[i][0] → person.name).
   Einträge referenzieren Team und Mitarbeiter weiterhin über den Namen, damit
   die bewährte Fachlogik (Konflikte, Rotation, Tausch …) 1:1 übernommen werden kann.
--------------------------------------------------------------------------- */

export type PermLevel = 'N' | 'R' | 'E';

export const PERM_AREAS = [
  'Dashboard',
  'Dienstplan',
  'Bereitschaft',
  'Dienstzeiten',
  'Kontakte',
  'Berichte / Export',
  'Administration',
  'Bereitschaft verwalten',
  'Team Berechtigungen',
  'Audit Log',
  'Export Audit',
  'Einstellungen',
] as const;
export type PermArea = (typeof PERM_AREAS)[number];
export type Page = PermArea | 'Hilfe';

export type RolePermissions = Partial<Record<PermArea, PermLevel>>;

export interface Person {
  id: string;
  name: string;
  initials: string;
  email: string;
  /** Bereitschaftsnummer */
  phone: string;
  teamsPhone: string;
  photo: string;
  role: string;
}

export type SelfMode = 'none' | 'all' | 'selected';
export interface TeamSettings {
  swap: boolean;
  selfDuty: SelfMode;
  selfDutyIds: string[];
  selfStandby: SelfMode;
  selfStandbyIds: string[];
}

export interface Team {
  id: string;
  name: string;
  memberIds: string[];
  leaderId: string;
  deputyId: string;
  standbyColor: string;
  settings: Partial<TeamSettings>;
  departmentId?: string;
}

export interface Department {
  id: string;
  name: string;
  headId: string;
  color: string;
  teamIds: string[];
}

export interface ShiftType {
  id: string;
  team: string;
  teamId: string;
  name: string;
  start: string;
  end: string;
  pause: number;
  multi: boolean;
  color: string;
}

export interface StandbyGroup {
  id: string;
  name: string;
}

export interface StandbyTime {
  id: string;
  name: string;
  type: 'fix' | 'variabel';
  start: string;
  end: string;
  color: string;
  /** 0 = Mo … 6 = So; undefined = alle Tage */
  days?: number[];
  /** false = an Feiertagen (Mo–Fr) nicht möglich */
  hol?: boolean;
  /** undefined = alle Teams */
  teamIds?: string[];
  groupId?: string;
}

export type EntryKind = 'Dienstplan' | 'Bereitschaft' | 'Arbeitsort' | 'Notiz';

export interface Entry {
  id: string;
  kind: EntryKind;
  isAbsence?: boolean;
  team: string;
  teamId?: string;
  employee: string;
  empId?: string;
  date: string;
  shift: string;
  start: string;
  end: string;
  color?: string;
  note?: string;
  groupId?: string;
  groupName?: string;
  author?: string;
}

export interface TeamNote {
  id: string;
  team: string;
  date: string;
  text: string;
  author: string;
  created: string;
}

export type SwapStatus = 'offen' | 'angenommen' | 'abgelehnt' | 'zurückgezogen' | 'ungültig';
export interface SwapSnap {
  id: string;
  date: string;
  shift: string;
  start: string;
  end: string;
  team: string;
}
export interface SwapRequest {
  id: string;
  status: SwapStatus;
  from: string;
  fromId: string;
  to: string;
  toId: string;
  give: SwapSnap[];
  take: SwapSnap[];
  note: string;
  createdAt: number;
  decidedAt: number;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  recipientRole: string;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  targetPage: string;
  targetDate?: string;
  swapId?: string;
  assignmentId?: string;
}

export interface AuditEntry {
  id: string;
  ts: number;
  user: string;
  role: string;
  action: string;
  area: string;
  detail: string;
  title: string;
  object: string;
  before: string;
  after: string;
}

export interface ExportEntry {
  id: string;
  ts: number;
  user: string;
  role: string;
  report: string;
  format: string;
  rows: number;
  status: string;
  range: string;
  size: number;
}

export type DateFormat = 'dmy' | 'iso' | 'mdy' | 'long';
export type Lang = 'de' | 'en';
export type ThemeMode = 'light' | 'dark' | 'system';
export type Accent = 'turquoise' | 'navy';

export interface DashLayout {
  hidden?: string[];
  known?: string[];
  pos?: Record<string, Record<string, { x: number; k: number }>>;
}

export interface UserPrefs {
  theme: ThemeMode;
  accent: Accent;
  fontScale: 'small' | 'normal' | 'large';
  lang: Lang;
  dateFormat: DateFormat;
  dutyDays: 5 | 6 | 7;
  standbyDays: 5 | 6 | 7;
  expandedMonthView: boolean;
  defaults: { Dienstplan: string; Bereitschaft: string };
  notify: { own: boolean; team: boolean; absence: boolean };
  favorites: string[];
  memberOrder: Record<string, string[]>;
  dashLayout: Record<string, DashLayout>;
  sidebarCollapsed: boolean;
  seenVersion: string;
}

export const DEFAULT_PREFS: UserPrefs = {
  theme: 'light',
  accent: 'turquoise',
  fontScale: 'normal',
  lang: 'de',
  dateFormat: 'dmy',
  dutyDays: 6,
  standbyDays: 7,
  expandedMonthView: false,
  defaults: { Dienstplan: 'Woche', Bereitschaft: 'Monat' },
  notify: { own: true, team: true, absence: true },
  favorites: [],
  memberOrder: {},
  dashLayout: {},
  sidebarCollapsed: false,
  seenVersion: '',
};

export interface AppSettings {
  features: { rotationDuty?: boolean; rotationStandby?: boolean };
  cockpitLink: { url?: string; by?: string; at?: number };
}

export interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

/** Gesamter Datenstand, den der Server für die angemeldete Person lädt. */
export interface AppData {
  staff: Person[];
  teams: Team[];
  departments: Department[];
  roles: string[];
  permissions: Record<string, RolePermissions>;
  shiftTypes: ShiftType[];
  standbyGroups: StandbyGroup[];
  standbyTimes: StandbyTime[];
  entries: Entry[];
  teamNotes: TeamNote[];
  swaps: SwapRequest[];
  notifications: AppNotification[];
  auditLog: AuditEntry[];
  exportLog: ExportEntry[];
  settings: AppSettings;
}

/** Kontext für alle Berechtigungs- und Fachfunktionen */
export interface Ctx {
  data: AppData;
  user: CurrentUser;
}
