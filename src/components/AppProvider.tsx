'use client';
/* Zentraler Client-Zustand: Daten vom Server, angemeldete Person, persönliche Einstellungen,
   Formatierung, Meldungen (Toast) und Bestätigungsdialoge. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createFormatters, type Formatters } from '@/lib/dates';
import { teamColor as teamColorOf } from '@/lib/entries';
import { setLang } from '@/lib/i18n/dictionary';
import { savePrefs } from '@/server/actions/account';
import { restoreEntries } from '@/server/actions/entries';
import type { ActionResult } from '@/server/context';
import type { AppData, Ctx, CurrentUser, Entry, Team, UserPrefs } from '@/lib/types';

type CalPageState = { teams: string[]; member: string; onlyConflicts: boolean; view: string; date: string; mobileDate: string };

/** Ein Schritt im Rückgängig-Verlauf: Zustand vor der Änderung, danach berechnete Gegenoperation */
interface UndoStep {
  label: string;
  before: Entry[];
  inverse?: { remove: string[]; upsert: Entry[] };
}
const entrySig = (e: Entry) => JSON.stringify([e.kind, !!e.isAbsence, e.team, e.employee, e.date, e.shift, e.start || '', e.end || '', e.color || '', e.note || '', e.groupId || '', e.groupName || '']);
function diffEntries(before: Entry[], after: Entry[]) {
  const b = new Map(before.map((e) => [e.id, e]));
  const a = new Map(after.map((e) => [e.id, e]));
  const remove = after.filter((e) => !b.has(e.id)).map((e) => e.id);
  const upsert = before.filter((e) => {
    const now = a.get(e.id);
    return !now || entrySig(now) !== entrySig(e);
  });
  return { remove, upsert };
}

interface DialogReq {
  kind: 'confirm' | 'text';
  title: string;
  message: string;
  okLabel: string;
  danger: boolean;
  value?: string;
  resolve: (v: string | boolean | null) => void;
}

interface AppContextValue {
  data: AppData;
  user: CurrentUser;
  ctx: Ctx;
  prefs: UserPrefs;
  setPrefs: (patch: Partial<UserPrefs>) => void;
  f: Formatters;
  toast: (msg: string) => void;
  ask: (message: string, okLabel?: string) => Promise<boolean>;
  askText: (title: string, value?: string) => Promise<string>;
  /** Server Action ausführen: Meldung anzeigen, Daten neu laden */
  run: <T>(p: Promise<ActionResult<T>>, opts?: { silent?: boolean; undo?: string; undoHint?: boolean }) => Promise<ActionResult<T>>;
  /** Letzte eigene Änderung an Diensten/Bereitschaften zurücknehmen (Strg Z) */
  undo: () => Promise<void>;
  refresh: () => void;
  busy: boolean;
  teamColor: (t?: Team | string) => string;
  cal: Record<string, CalPageState>;
  setCal: (page: string, patch: Partial<CalPageState>) => void;
  demoLogin: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp() außerhalb von <AppProvider>');
  return c;
}

export function AppProvider({ data, user, prefs: initialPrefs, demoLogin, children }: { data: AppData; user: CurrentUser; prefs: UserPrefs; demoLogin: boolean; children: ReactNode }) {
  const router = useRouter();
  const [prefs, setPrefsState] = useState(initialPrefs);
  const [toastMsg, setToastMsg] = useState<{ text: string; n: number } | null>(null);
  const [dialog, setDialog] = useState<DialogReq | null>(null);
  const [busy, setBusy] = useState(false);
  const [cal, setCalState] = useState<Record<string, CalPageState>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const undoStack = useRef<UndoStep[]>([]);
  const entriesRef = useRef(data.entries);

  setLang(prefs.lang);
  const f = useMemo(() => createFormatters(prefs.dateFormat, prefs.lang), [prefs.dateFormat, prefs.lang]);
  const ctx = useMemo<Ctx>(() => ({ data, user }), [data, user]);

  const setPrefs = useCallback((patch: Partial<UserPrefs>) => {
    setPrefsState((p) => ({ ...p, ...patch }));
    void savePrefs(patch);
  }, []);

  const toast = useCallback((text: string) => {
    clearTimeout(toastTimer.current);
    setToastMsg({ text, n: Date.now() });
    toastTimer.current = setTimeout(() => setToastMsg(null), Math.min(15000, Math.max(5000, 4000 + text.length * 70)));
  }, []);

  const ask = useCallback(
    (message: string, okLabel?: string) =>
      new Promise<boolean>((resolve) => {
        const danger = /lösch|zurücksetzen|entfernen|ablehnen/i.test(message + (okLabel || ''));
        setDialog({ kind: 'confirm', title: 'Bitte bestätigen', message, okLabel: okLabel || (danger ? 'Löschen' : 'Bestätigen'), danger, resolve: (v) => resolve(!!v) });
      }),
    [],
  );
  const askText = useCallback(
    (title: string, value = '') =>
      new Promise<string>((resolve) => {
        setDialog({ kind: 'text', title, message: '', okLabel: 'Speichern', danger: false, value, resolve: (v) => resolve(typeof v === 'string' ? v : '') });
      }),
    [],
  );

  /* Nach dem Neuladen der Daten: Gegenoperation für offene Rückgängig-Schritte berechnen */
  useEffect(() => {
    entriesRef.current = data.entries;
    for (const step of undoStack.current) {
      if (step.inverse) continue;
      const inv = diffEntries(step.before, data.entries);
      if (inv.remove.length || inv.upsert.length) step.inverse = inv;
    }
  }, [data.entries]);

  const refresh = useCallback(() => router.refresh(), [router]);
  const run = useCallback(
    async <T,>(p: Promise<ActionResult<T>>, opts: { silent?: boolean; undo?: string; undoHint?: boolean } = {}) => {
      const before = opts.undo ? entriesRef.current : null;
      setBusy(true);
      try {
        const res = await p;
        if (res.ok && before && opts.undo) {
          // höchstens 25 Schritte merken (wie bisher). Sind die neuen Daten schon da, Gegenoperation gleich berechnen.
          const step: UndoStep = { label: opts.undo, before };
          const inv = diffEntries(before, entriesRef.current);
          if (inv.remove.length || inv.upsert.length) step.inverse = inv;
          undoStack.current = [...undoStack.current, step].slice(-25);
        }
        if (res.message && (!opts.silent || !res.ok)) toast(res.ok && opts.undoHint && !window.matchMedia('(pointer: coarse)').matches ? `${res.message.replace(/\.$/, '')}. Strg Z macht es rückgängig.` : res.message);
        if (res.ok) router.refresh();
        return res;
      } catch (e) {
        console.error(e);
        toast('Die Änderung konnte nicht gespeichert werden.');
        return { ok: false, message: 'Fehler' } as ActionResult<T>;
      } finally {
        setBusy(false);
      }
    },
    [router, toast],
  );

  const undo = useCallback(async () => {
    const step = undoStack.current[undoStack.current.length - 1];
    if (!step) return toast('Nichts zum Rückgängigmachen.');
    if (!step.inverse) {
      // Änderung noch nicht neu geladen oder ohne Auswirkung
      undoStack.current = undoStack.current.slice(0, -1);
      return toast('Nichts zum Rückgängigmachen.');
    }
    undoStack.current = undoStack.current.slice(0, -1);
    setBusy(true);
    try {
      const res = await restoreEntries({ label: step.label, ...step.inverse });
      toast(res.message || (res.ok ? 'Rückgängig: ' + step.label : 'Rückgängig nicht möglich.'));
      if (res.ok) router.refresh();
    } catch (e) {
      console.error(e);
      toast('Die Änderung konnte nicht rückgängig gemacht werden.');
    } finally {
      setBusy(false);
    }
  }, [router, toast]);

  const teamColor = useCallback(
    (t?: Team | string) => teamColorOf(typeof t === 'string' ? data.teams.find((x) => x.name === t) : t, data.shiftTypes),
    [data.teams, data.shiftTypes],
  );

  const setCal = useCallback((page: string, patch: Partial<CalPageState>) => {
    setCalState((s) => ({ ...s, [page]: { ...(s[page] || { teams: [], member: 'Alle Mitarbeiter', onlyConflicts: false, view: '', date: '', mobileDate: '' }), ...patch } }));
  }, []);

  /* Darstellung: Hell/Dunkel, Akzentfarbe, Schriftgröße */
  useEffect(() => {
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      const b = document.body;
      b.classList.toggle('dark-mode', dark);
      document.cookie = `dp-theme=${dark ? 'dark' : 'light'};path=/;max-age=31536000;samesite=lax`;
      const ACCENTS = { turquoise: ['#14A1A9', '#0e8a91', '#0b7f86', '#14A1A9'], navy: ['#0068A8', '#00588f', '#004d7d', '#2f8fd1'] } as const;
      const [base, hov, d, darkC] = ACCENTS[prefs.accent] || ACCENTS.turquoise;
      const c = dark ? darkC : base,
        h = dark && darkC !== base ? base : hov;
      const rgb = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(',');
      b.style.setProperty('--accent-color', c);
      b.style.setProperty('--accent-hover', h);
      b.style.setProperty('--accent-dark', dark ? `color-mix(in srgb,${c} 55%,#fff)` : d);
      b.style.setProperty('--accent-soft', dark ? `rgba(${rgb},.18)` : `color-mix(in srgb,${c} 11%,#fff)`);
      b.style.setProperty('--accent-ring', `rgba(${rgb},.2)`);
      b.classList.toggle('navy-accent', prefs.accent === 'navy');
      document.documentElement.style.setProperty('zoom', window.matchMedia('(max-width: 700px)').matches ? '' : { small: '0.92', normal: '', large: '1.1' }[prefs.fontScale]);
      document.documentElement.lang = prefs.lang;
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefs.theme, prefs.accent, prefs.fontScale, prefs.lang]);

  const value: AppContextValue = { data, user, ctx, prefs, setPrefs, f, toast, ask, askText, run, undo, refresh, busy, teamColor, cal, setCal, demoLogin };

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className={`toast ${toastMsg ? 'show' : ''}`} role="status" title="Klicken zum Schließen" onClick={() => setToastMsg(null)}>
        {toastMsg?.text}
      </div>
      {dialog && <AppDialog req={dialog} onDone={(v) => { dialog.resolve(v); setDialog(null); }} />}
    </AppContext.Provider>
  );
}

function AppDialog({ req, onDone }: { req: DialogReq; onDone: (v: string | boolean | null) => void }) {
  const [value, setValue] = useState(req.value || '');
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDone(null);
      }
    };
    document.addEventListener('keydown', key, true);
    if (req.kind === 'confirm') setTimeout(() => okRef.current?.focus(), 20);
    return () => document.removeEventListener('keydown', key, true);
  }, [onDone, req.kind]);
  return (
    <div className="modal-backdrop app-dialog" onClick={(e) => e.target === e.currentTarget && onDone(null)}>
      <form
        className="modal"
        role="alertdialog"
        aria-modal="true"
        onSubmit={(e) => {
          e.preventDefault();
          onDone(req.kind === 'text' ? value : true);
        }}
      >
        <h2>{req.title}</h2>
        {req.kind === 'confirm' ? <p className="dialog-text">{req.message}</p> : <input className="input dialog-input" type="text" value={value} maxLength={60} autoFocus onChange={(e) => setValue(e.target.value)} />}
        <div className="btn-row modal-actions">
          <button type="button" className="btn" onClick={() => onDone(null)}>
            Abbrechen
          </button>
          <button ref={okRef} type="submit" className={`btn ${req.danger ? 'danger-solid' : 'primary'}`}>
            {req.okLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
