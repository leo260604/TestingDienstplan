/* Externe Benachrichtigungen (E-Mail / Microsoft Teams) – Vorbereitung für die Anbindung an Microsoft Entra ID.
   Persönliche Auswahl liegt in den Benutzer-Einstellungen (UserPrefs.notifyExternal),
   der Versand selbst passiert serverseitig in src/server/notify.ts. */

export type NotifyChannel = 'mail' | 'teams';
export type NotifyEvent = 'newEntry' | 'changedEntry' | 'swap' | 'teamEntry' | 'absence';

export const NOTIFY_CHANNELS: { id: NotifyChannel; label: string; icon: string }[] = [
  { id: 'mail', label: 'E-Mail', icon: 'mail' },
  { id: 'teams', label: 'Teams', icon: 'chat' },
];

export const NOTIFY_EVENTS: { id: NotifyEvent; title: string; sub: string; lead?: boolean }[] = [
  { id: 'newEntry', title: 'Neue Dienste & Bereitschaften', sub: 'Wenn du für einen Dienst oder eine Bereitschaft eingeteilt wirst' },
  { id: 'changedEntry', title: 'Dienständerungen', sub: 'Wenn einer deiner Dienste verschoben, getauscht oder gelöscht wird' },
  { id: 'swap', title: 'Tauschanfragen', sub: 'Neue Anfragen an dich sowie Zu- und Absagen zu deinen Anfragen' },
  { id: 'teamEntry', title: 'Neue Dienste in meinen Teams', sub: 'Nur für Teamleiter und Stellvertretungen', lead: true },
  { id: 'absence', title: 'Abwesenheiten in meinen Teams', sub: 'Urlaub, Krankenstand & Co. · nur für Teamleiter und Stellvertretungen', lead: true },
];

export interface ExternalNotifyPrefs {
  /** Kanal grundsätzlich an/aus */
  mail: boolean;
  teams: boolean;
  /** Auswahl je Ereignis und Kanal */
  events: Record<NotifyEvent, Record<NotifyChannel, boolean>>;
}

export const DEFAULT_EXTERNAL_NOTIFY: ExternalNotifyPrefs = {
  mail: true,
  teams: true,
  events: {
    newEntry: { mail: true, teams: true },
    changedEntry: { mail: true, teams: true },
    swap: { mail: true, teams: true },
    teamEntry: { mail: false, teams: true },
    absence: { mail: false, teams: false },
  },
};

/** Gespeicherte (evtl. unvollständige/ältere) Auswahl mit den Standardwerten ergänzen */
export function normalizeExternalNotify(raw?: Partial<ExternalNotifyPrefs> | null): ExternalNotifyPrefs {
  const r = raw && typeof raw === 'object' ? raw : {};
  const events = {} as ExternalNotifyPrefs['events'];
  for (const e of NOTIFY_EVENTS) {
    const saved = (r.events as Partial<ExternalNotifyPrefs['events']> | undefined)?.[e.id];
    events[e.id] = { ...DEFAULT_EXTERNAL_NOTIFY.events[e.id], ...(saved && typeof saved === 'object' ? saved : {}) };
  }
  return {
    mail: typeof r.mail === 'boolean' ? r.mail : DEFAULT_EXTERNAL_NOTIFY.mail,
    teams: typeof r.teams === 'boolean' ? r.teams : DEFAULT_EXTERNAL_NOTIFY.teams,
    events,
  };
}

/** Möchte der Benutzer dieses Ereignis über diesen Kanal erhalten? */
export const wantsExternal = (p: ExternalNotifyPrefs, event: NotifyEvent, channel: NotifyChannel) => !!p[channel] && !!p.events[event]?.[channel];

/* ---------- Anbindung (global, nur Admin) – wird mit Entra ID / Microsoft 365 befüllt ---------- */
export interface IntegrationSettings {
  /** true, sobald die App bei Microsoft Entra ID registriert und verbunden ist */
  connected: boolean;
  tenantId?: string;
  mail: { enabled: boolean; sender?: string };
  teams: { enabled: boolean };
}

export const DEFAULT_INTEGRATIONS: IntegrationSettings = { connected: false, mail: { enabled: false }, teams: { enabled: false } };

export function normalizeIntegrations(raw?: Partial<IntegrationSettings> | null): IntegrationSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    connected: r.connected === true,
    tenantId: typeof r.tenantId === 'string' ? r.tenantId : undefined,
    mail: { ...DEFAULT_INTEGRATIONS.mail, ...(r.mail || {}) },
    teams: { ...DEFAULT_INTEGRATIONS.teams, ...(r.teams || {}) },
  };
}

/** Ist der Kanal technisch verfügbar (Anbindung steht und Kanal ist vom Admin freigeschaltet)? */
export const channelLive = (i: IntegrationSettings, ch: NotifyChannel) => i.connected && i[ch].enabled;
