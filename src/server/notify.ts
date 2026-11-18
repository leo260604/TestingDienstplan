import 'server-only';
/* Versand externer Benachrichtigungen (E-Mail / Microsoft Teams).
   Wird überall dort aufgerufen, wo auch In-App-Benachrichtigungen entstehen.
   Solange keine Entra-ID-Anbindung besteht, passiert hier nichts. */
import { prisma } from './db';
import { channelLive, normalizeExternalNotify, normalizeIntegrations, wantsExternal, type ExternalNotifyPrefs, type NotifyChannel, type NotifyEvent } from '@/lib/notifications';

export interface ExternalMessage {
  recipientId: string;
  event: NotifyEvent;
  title: string;
  message: string;
  /** Seite in der App, z. B. "/dienstplan?date=2026-11-18" */
  link?: string;
}

interface Recipient {
  id: string;
  name: string;
  email: string | null;
}

/* ---------- Kanäle: hier kommt später Microsoft Graph hinein ---------- */
const SENDERS: Record<NotifyChannel, (to: Recipient, msg: ExternalMessage) => Promise<void>> = {
  // TODO(Entra ID): POST https://graph.microsoft.com/v1.0/users/{sender}/sendMail (Anwendungsberechtigung Mail.Send)
  mail: async () => {},
  // TODO(Entra ID): Teams-Nachricht/Aktivitätsfeed über Microsoft Graph (z. B. TeamsActivity.Send) an das Konto des Empfängers
  teams: async () => {},
};

/** Externe Benachrichtigungen verschicken – berücksichtigt die persönliche Auswahl jedes Empfängers. Fehler brechen die Aktion nie ab. */
export async function dispatchExternal(items: ExternalMessage[]): Promise<void> {
  if (!items.length) return;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: 'integrations' } });
    const integ = normalizeIntegrations(row?.value as never);
    const channels = (['mail', 'teams'] as const).filter((ch) => channelLive(integ, ch));
    if (!channels.length) return; // noch keine Anbindung an Entra ID / Microsoft 365
    const ids = [...new Set(items.map((i) => i.recipientId))];
    const [prefs, people] = await Promise.all([
      prisma.userPreference.findMany({ where: { employeeId: { in: ids } } }),
      prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }),
    ]);
    const prefOf = new Map<string, ExternalNotifyPrefs>(prefs.map((p) => [p.employeeId, normalizeExternalNotify((p.data as { notifyExternal?: never })?.notifyExternal)]));
    for (const msg of items) {
      const to = people.find((p) => p.id === msg.recipientId);
      if (!to) continue;
      const p = prefOf.get(to.id) || normalizeExternalNotify();
      for (const ch of channels) {
        if (!wantsExternal(p, msg.event, ch)) continue;
        if (ch === 'mail' && !to.email) continue;
        try {
          await SENDERS[ch](to, msg);
        } catch (e) {
          console.error(`Benachrichtigung per ${ch} an ${to.name} fehlgeschlagen`, e);
        }
      }
    }
  } catch (e) {
    console.error('Externe Benachrichtigungen konnten nicht verschickt werden', e);
  }
}
