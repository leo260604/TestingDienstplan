'use client';
/* Installierbare App (PWA): Service Worker registrieren, eigenen Plan für die Offline-Ansicht ablegen,
   Installations-Angebot des Browsers für „App installieren“ in den Einstellungen bereithalten. */
import { useEffect, useState } from 'react';
import { useApp } from './AppProvider';
import { addDays, isoDate } from '@/lib/dates';
import { checkPushSubscription, removePushSubscription } from '@/server/actions/push';

export const OFFLINE_KEY = 'dp-offline-plan';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/** Zustand für „App installieren“ */
export function usePwaInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    ios: isIos(),
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const res = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
      deferred = null;
      emit();
      return res.outcome === 'accepted';
    },
  };
}

/** Wann wurde der Plan zuletzt für die Offline-Ansicht gespeichert? */
export function offlineSavedAt(): number | null {
  try {
    const p = JSON.parse(localStorage.getItem(OFFLINE_KEY) || 'null');
    return p?.savedAt || null;
  } catch {
    return null;
  }
}

export function PwaClient() {
  const { data, user } = useApp();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (reg) => {
        // Push nur für den hier angemeldeten Benutzer: Abo einer anderen Person auf diesem Gerät beenden
        const sub = 'pushManager' in reg ? await reg.pushManager.getSubscription() : null;
        if (!sub) return;
        const res = await checkPushSubscription(sub.endpoint);
        if (res.ok && !res.data?.mine) await sub.unsubscribe();
      })
      .catch(() => {});
  }, [user.id]);

  // Eigenen Plan (7 Tage zurück bis 90 Tage voraus) für die Offline-Ansicht ablegen
  useEffect(() => {
    const from = isoDate(addDays(new Date(), -7));
    const to = isoDate(addDays(new Date(), 90));
    const entries = data.entries
      .filter((a) => a.employee === user.name && a.date >= from && a.date <= to && a.kind !== 'Notiz')
      .map((a) => ({ date: a.date, kind: a.kind, isAbsence: !!a.isAbsence, shift: a.shift, start: a.start || '', end: a.end || '', color: a.color || '', team: a.team || '' }));
    try {
      localStorage.setItem(OFFLINE_KEY, JSON.stringify({ user: user.name, savedAt: Date.now(), entries }));
    } catch {
      /* Speicher voll oder gesperrt – Offline-Ansicht bleibt beim alten Stand */
    }
  }, [data.entries, user.name]);

  return null;
}

/** Beim Abmelden: Push-Abo dieses Geräts beenden und den Offline-Plan löschen */
export async function forgetDevice(): Promise<void> {
  try {
    localStorage.removeItem(OFFLINE_KEY);
  } catch {
    /* egal */
  }
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : undefined;
    const sub = reg && 'pushManager' in reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await removePushSubscription(sub.endpoint).catch(() => undefined);
      await sub.unsubscribe().catch(() => false);
    }
  } catch {
    /* Abmelden darf daran nie scheitern */
  }
}
