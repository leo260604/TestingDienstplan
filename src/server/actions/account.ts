'use server';
/* Benachrichtigungen, Mein Konto, persönliche Einstellungen, Export-Protokoll */
import { revalidatePath } from 'next/cache';
import { prisma } from '../db';
import { requireUser } from '../session';
import { loadPrefs } from '../data';
import { audit, fail, ok, withCtx, type ActionResult } from '../context';
import { canEditArea } from '@/lib/permissions';
import type { UserPrefs } from '@/lib/types';
import { normalizeUrl } from '@/lib/url';

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { recipientId: user.id, ...(ids ? { id: { in: ids } } : {}) }, data: { read: true } });
  revalidatePath('/', 'layout');
  return ok();
}

export async function deleteNotifications(ids?: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const r = await prisma.notification.deleteMany({ where: { recipientId: user.id, ...(ids ? { id: { in: ids } } : {}) } });
  revalidatePath('/', 'layout');
  return ok(ids && ids.length === 1 ? 'Benachrichtigung gelöscht.' : `${r.count} Benachrichtigungen gelöscht.`);
}

const PHOTO_RX = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/;

export async function updateMyAccount(inp: { email?: string; phone?: string; teamsPhone?: string; photo?: string | null }): Promise<ActionResult> {
  return withCtx(async (c) => {
    const me = c.data.staff.find((p) => p.id === c.user.id);
    if (!me) return fail('Nicht angemeldet.');
    const data: Record<string, string | null> = {};
    if (inp.email !== undefined) {
      const email = inp.email.trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Bitte eine gültige E-Mail-Adresse eingeben.');
      if (email && c.data.staff.some((p) => p.id !== me.id && p.email.toLowerCase() === email)) return fail('Diese E-Mail-Adresse wird bereits verwendet.');
      data.email = email || null;
    }
    if (inp.phone !== undefined) data.phone = inp.phone.trim().slice(0, 40) || null;
    if (inp.teamsPhone !== undefined) data.teamsPhone = inp.teamsPhone.trim().slice(0, 40) || null;
    if (inp.photo !== undefined) {
      if (inp.photo && (!PHOTO_RX.test(inp.photo) || inp.photo.length > 200_000)) return fail('Das Bild konnte nicht gelesen werden.');
      data.photo = inp.photo || null;
    }
    await prisma.employee.update({ where: { id: me.id }, data });
    const what = inp.photo !== undefined ? (inp.photo ? 'Profilbild geändert' : 'Profilbild entfernt') : 'Kontaktdaten geändert';
    await audit(c, inp.photo === null ? 'Gelöscht' : 'Geändert', 'Kontakte', me.name, {
      title: what,
      object: me.name,
      before: inp.photo !== undefined ? '' : `${me.email || '—'} · ${me.phone || '—'} · Teams ${me.teamsPhone || '—'}`,
      after: inp.photo !== undefined ? '' : `${data.email || '—'} · ${data.phone || '—'} · Teams ${data.teamsPhone || '—'}`,
    });
    return ok(inp.photo !== undefined ? (inp.photo ? 'Profilbild gespeichert.' : 'Profilbild entfernt.') : 'Kontaktdaten gespeichert.');
  });
}

/** Persönliche Einstellungen (Theme, Datumsformat, Favoriten, Dashboard …) teilweise speichern */
export async function savePrefs(patch: Partial<UserPrefs>): Promise<ActionResult> {
  const user = await requireUser();
  const cur = await loadPrefs(user.id);
  const next = { ...cur, ...patch };
  await prisma.userPreference.upsert({ where: { employeeId: user.id }, create: { employeeId: user.id, data: next as never }, update: { data: next as never } });
  return ok();
}

export async function logExport(inp: { report: string; format: string; rows: number; status: string; range?: string; size?: number }): Promise<ActionResult> {
  const user = await requireUser();
  await prisma.exportLog.create({
    data: { userName: user.name, role: user.role, report: inp.report.slice(0, 120), format: inp.format.slice(0, 10), rows: inp.rows | 0, status: inp.status.slice(0, 40), range: (inp.range || '').slice(0, 80), size: (inp.size ?? 0) | 0 },
  });
  revalidatePath('/export-audit');
  return ok();
}

/* ---------------- Globale Einstellungen (nur Admin) ---------------- */
export async function setFeature(key: 'rotationDuty' | 'rotationStandby', on: boolean): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (c.user.role !== 'Admin') return fail('Nur Admins können Funktionen ändern.');
    const features = { ...c.data.settings.features, [key]: on };
    await prisma.appSetting.upsert({ where: { key: 'features' }, create: { key: 'features', value: features }, update: { value: features } });
    const label = key === 'rotationDuty' ? '„Rotation automatisch planen“ (Dienstplan)' : '„Rotation automatisch planen“ (Bereitschaft)';
    await audit(c, 'Geändert', 'Einstellungen', `${label}: ${on ? 'eingeblendet' : 'ausgeblendet'}`, { title: 'Funktion geändert', object: label, before: on ? 'aus' : 'an', after: on ? 'an' : 'aus' });
    return ok(on ? 'Button wird angezeigt.' : 'Button ist ausgeblendet.');
  });
}

export async function setCockpitLink(raw: string): Promise<ActionResult> {
  return withCtx(async (c) => {
    if (c.user.role !== 'Admin') return fail('Nur Admins können diesen Link ändern.');
    const url = normalizeUrl(raw);
    if (url === null) return fail('Bitte eine gültige Adresse eingeben, z. B. https://beispiel.at');
    const before = c.data.settings.cockpitLink.url || '—';
    const value = url ? { url, by: c.user.name, at: Date.now() } : {};
    await prisma.appSetting.upsert({ where: { key: 'cockpitLink' }, create: { key: 'cockpitLink', value }, update: { value } });
    await audit(c, url ? (before === '—' ? 'Erstellt' : 'Geändert') : 'Gelöscht', 'Administration', 'Link „Mein Porsche Cockpit“', { title: 'Dashboard-Link geändert', object: 'Mein Porsche Cockpit', before, after: url || '—' });
    return ok(url ? 'Link gespeichert.' : 'Link entfernt.');
  });
}

/** Export ohne Berechtigung wird verweigert und protokolliert */
export async function exportAllowed(report: string, format: string, range: string): Promise<boolean> {
  const user = await requireUser();
  const roles = await prisma.role.findMany();
  const perms = Object.fromEntries(roles.map((r) => [r.name, r.permissions as never]));
  if (canEditArea('Berichte / Export', user.role, perms)) return true;
  await prisma.exportLog.create({ data: { userName: user.name, role: user.role, report, format, rows: 0, status: 'Verweigert', range } });
  return false;
}

/** Eigenen Geburtstag (Tag + Monat, ohne Jahr) speichern oder entfernen. Sichtbar nur für die eigenen Teams. */
export async function saveMyBirthday(inp: { day: number; month: number } | null): Promise<ActionResult> {
  return withCtx(async (c) => {
    const me = c.data.staff.find((p) => p.id === c.user.id);
    if (!me) return fail('Nicht angemeldet.');
    let value: string | null = null;
    if (inp) {
      const d = Math.trunc(Number(inp.day)),
        m = Math.trunc(Number(inp.month));
      const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
      if (!maxDay || d < 1 || d > maxDay) return fail('Bitte einen gültigen Tag und Monat auswählen.');
      value = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    await prisma.employee.update({ where: { id: me.id }, data: { birthday: value } });
    await audit(c, value ? 'Geändert' : 'Gelöscht', 'Kontakte', me.name, { title: value ? 'Geburtstag eingetragen' : 'Geburtstag entfernt', object: me.name });
    return ok(value ? 'Geburtstag gespeichert – sichtbar für deine Teams.' : 'Geburtstag entfernt.');
  });
}
