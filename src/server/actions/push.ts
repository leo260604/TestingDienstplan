'use server';
/* Push-Benachrichtigungen: Abo dieses Geräts verwalten */
import { headers } from 'next/headers';
import { prisma } from '../db';
import { fail, ok, withCtx, type ActionResult } from '../context';
import { sendPush, vapidKeys } from '../push';

/** Öffentlicher VAPID-Schlüssel für pushManager.subscribe() */
export async function getPushKey(): Promise<ActionResult<{ key: string }>> {
  return withCtx(async () => ok('', { key: (await vapidKeys()).publicKey }));
}

export async function savePushSubscription(sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const endpoint = String(sub?.endpoint || '');
    const p256dh = String(sub?.keys?.p256dh || '');
    const auth = String(sub?.keys?.auth || '');
    if (!/^https:\/\/[^\s]{8,2000}$/.test(endpoint) || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return fail('Das Push-Abo dieses Geräts ist ungültig.');
    const ua = ((await headers()).get('user-agent') || '').slice(0, 300);
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, employeeId: c.user.id, userAgent: ua },
      update: { p256dh, auth, employeeId: c.user.id, userAgent: ua },
    });
    return ok('Push-Benachrichtigungen auf diesem Gerät aktiviert.');
  });
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: String(endpoint || ''), employeeId: c.user.id } });
    return ok('Push-Benachrichtigungen auf diesem Gerät deaktiviert.');
  });
}

export async function sendTestPush(): Promise<ActionResult> {
  return withCtx(async (c) => {
    const n = await prisma.pushSubscription.count({ where: { employeeId: c.user.id } });
    if (!n) return fail('Auf keinem Gerät sind Push-Benachrichtigungen aktiviert.');
    const r = await sendPush([{ recipientId: c.user.id, title: 'DienstPlan · Test', body: 'Push-Benachrichtigungen funktionieren auf diesem Gerät.', url: '/einstellungen', tag: 'test' }]);
    if (r.sent) return ok(`Testnachricht an ${r.sent} ${r.sent === 1 ? 'Gerät' : 'Geräte'} gesendet.${r.failed ? ` ${r.failed} fehlgeschlagen (${r.errors[0]}).` : ''}`);
    return fail(`Die Testnachricht konnte nicht zugestellt werden${r.errors[0] ? ' – ' + r.errors[0] : ''}. Bitte Push auf diesem Gerät aus- und wieder einschalten.`);
  });
}

/** Gehört das Push-Abo dieses Geräts dem angemeldeten Benutzer? Abos anderer Benutzer werden entfernt,
    damit auf einem Gerät nur Mitteilungen für die Person ankommen, die dort gerade angemeldet ist. */
export async function checkPushSubscription(endpoint: string): Promise<ActionResult<{ mine: boolean }>> {
  return withCtx(async (c) => {
    const ep = String(endpoint || '');
    if (!ep) return ok<{ mine: boolean }>('', { mine: false });
    const row = await prisma.pushSubscription.findUnique({ where: { endpoint: ep } });
    if (row && row.employeeId === c.user.id) return ok<{ mine: boolean }>('', { mine: true });
    if (row) await prisma.pushSubscription.delete({ where: { endpoint: ep } });
    return ok<{ mine: boolean }>('', { mine: false });
  });
}
