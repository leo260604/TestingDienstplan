import 'server-only';
/* Web Push (RFC 8030/8291/8292) ohne Zusatzpaket: VAPID-Signatur (ES256) und aes128gcm-Verschlüsselung mit node:crypto.
   Schlüssel: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url) aus der Umgebung – sonst einmalig erzeugt und in AppSetting „vapid“ gespeichert. */
import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { prisma } from './db';

export interface PushMessage {
  recipientId: string;
  title: string;
  body: string;
  /** Seite in der App, z. B. "/dienstplan?date=2026-11-18" */
  url?: string;
  tag?: string;
}

interface Vapid {
  publicKey: string; // base64url, unkomprimierter P-256-Punkt (65 Byte)
  privateKey: crypto.KeyObject;
}

const b64u = (b: Buffer) => b.toString('base64url');
const fromB64u = (s: string) => Buffer.from(s, 'base64url');

function keyFromRaw(pub: string, priv: string): Vapid {
  const p = fromB64u(pub);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33, 65)), d: priv };
  return { publicKey: pub, privateKey: crypto.createPrivateKey({ key: jwk, format: 'jwk' }) };
}

let cached: Promise<Vapid> | null = null;
export function vapidKeys(): Promise<Vapid> {
  if (!cached)
    cached = (async () => {
      const envPub = process.env.VAPID_PUBLIC_KEY;
      const envPriv = process.env.VAPID_PRIVATE_KEY;
      if (envPub && envPriv) return keyFromRaw(envPub, envPriv);
      const row = await prisma.appSetting.findUnique({ where: { key: 'vapid' } });
      const v = row?.value as { publicKey?: string; privateKey?: string } | undefined;
      if (v?.publicKey && v.privateKey) return keyFromRaw(v.publicKey, v.privateKey);
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
      const d = (privateKey.export({ format: 'jwk' }) as { d: string }).d;
      const pub = b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]));
      await prisma.appSetting.upsert({ where: { key: 'vapid' }, create: { key: 'vapid', value: { publicKey: pub, privateKey: d } }, update: {} });
      // Falls parallel schon Schlüssel gespeichert wurden, diese verwenden
      const saved = (await prisma.appSetting.findUnique({ where: { key: 'vapid' } }))?.value as { publicKey: string; privateKey: string };
      return keyFromRaw(saved.publicKey, saved.privateKey);
    })().catch((e) => {
      cached = null;
      throw e;
    });
  return cached;
}

/** Absender (sub) für VAPID: Apple lehnt Platzhalter wie „@localhost“ ab – daher die echte Adresse der App */
async function vapidSubject(): Promise<string> {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const base = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (base && /^https:\/\//.test(base)) return new URL(base).origin;
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    if (host && !/^(localhost|127\.|10\.|192\.168\.)/.test(host)) return `https://${host.split(',')[0].trim()}`;
  } catch {
    /* außerhalb einer Anfrage */
  }
  return 'mailto:push@dienstplan-pro.app';
}

/** VAPID-Header (RFC 8292) für einen Push-Dienst */
export function vapidAuth(endpoint: string, v: Vapid, subject: string): string {
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: v.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${payload}.${b64u(sig)}, k=${v.publicKey}`;
}

/** Nutzlast verschlüsseln (RFC 8291, Content-Encoding aes128gcm) */
export function encryptPayload(plain: Buffer, p256dh: string, auth: string): Buffer {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plain, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** Push an alle Geräte der Empfänger senden. Abgelaufene Abos werden entfernt; Fehler brechen nie die Aktion ab. */
export async function sendPush(messages: PushMessage[]): Promise<{ sent: number; failed: number; errors: string[] }> {
  const res = { sent: 0, failed: 0, errors: [] as string[] };
  if (!messages.length) return res;
  try {
    const ids = [...new Set(messages.map((m) => m.recipientId))];
    const subs = await prisma.pushSubscription.findMany({ where: { employeeId: { in: ids } } });
    if (!subs.length) return res;
    const v = await vapidKeys();
    const subject = await vapidSubject();
    const gone: string[] = [];
    await Promise.all(
      messages.flatMap((m) =>
        subs
          .filter((s) => s.employeeId === m.recipientId)
          .map(async (s) => {
            try {
              const body = encryptPayload(Buffer.from(JSON.stringify({ title: m.title, body: m.body, url: m.url || '/dashboard', tag: m.tag })), s.p256dh, s.auth);
              const r = await fetch(s.endpoint, {
                method: 'POST',
                headers: { Authorization: vapidAuth(s.endpoint, v, subject), TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' },
                body: new Uint8Array(body),
                signal: AbortSignal.timeout(10000),
              });
              if (r.status === 404 || r.status === 410) gone.push(s.id);
              if (r.ok) res.sent++;
              else {
                res.failed++;
                const why = `${new URL(s.endpoint).host} antwortet ${r.status}${(await r.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ').replace(/^(.)/, ': $1')}`;
                res.errors.push(why);
                console.error('Push abgelehnt –', why);
              }
            } catch (e) {
              res.failed++;
              const why = `${new URL(s.endpoint).host} nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`;
              res.errors.push(why);
              console.error('Push fehlgeschlagen –', why);
            }
          }),
      ),
    );
    if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  } catch (e) {
    console.error('Push-Benachrichtigungen konnten nicht verschickt werden', e);
  }
  return res;
}
