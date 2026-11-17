/* Datums- und Zeitfunktionen (lokale Zeit, Mittag als Anker gegen Sommerzeit-Probleme) */
import type { DateFormat, Lang } from './types';

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function isoDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** ISO-Datum → Date um 12:00 Uhr */
export const day = (iso: string) => new Date(iso + 'T12:00:00');

export function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const addDaysIso = (iso: string, n: number) => isoDate(addDays(day(iso), n));

/** Wochentag 0 = Montag … 6 = Sonntag */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

export function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - dayNum);
  const y = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - y.getTime()) / 86400000 + 1) / 7);
}

/** Dauer in Stunden; Ende ≤ Beginn bedeutet „über Mitternacht“ */
export function durationHours(start?: string, end?: string): number {
  if (!start || !end) return 0;
  const [a, b] = start.split(':').map(Number);
  const [c, e] = end.split(':').map(Number);
  let m = c * 60 + e - (a * 60 + b);
  if (m <= 0) m += 1440;
  return m / 60;
}

export function hoursOf(hhmm?: string): number {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h + (m || 0) / 60;
}

/** Zeitspanne in Minuten [Beginn, Ende]; Ende kann > 1440 sein */
export function timeSpan(a: { start?: string; end?: string }): [number, number] {
  const m = (t: string) => {
    const [h, mm] = String(t).split(':').map(Number);
    return h * 60 + (mm || 0);
  };
  if (!a.start || !a.end) return [0, 1440];
  const s = m(a.start);
  let e = m(a.end);
  if (e <= s) e += 1440;
  return [s, e];
}

export function validDateInput(v: unknown): v is string {
  const s = String(v || '');
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2099 && !Number.isNaN(day(s).getTime())
  );
}
export const DATE_RANGE_MSG = 'Bitte ein gültiges Datum zwischen 2000 und 2099 wählen.';

export const daysBetween = (from: string, to: string) => Math.round((day(to).getTime() - day(from).getTime()) / 86400000);

export function eachDay(from: string, to: string, max = 400): string[] {
  const out: string[] = [];
  for (let c = day(from); isoDate(c) <= to && out.length < max; c = addDays(c, 1)) out.push(isoDate(c));
  return out;
}

export const WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS_DE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/* ---------- Formatierung (abhängig von Sprache und Datumsformat) ---------- */

export interface Formatters {
  locale: string;
  weekdays: string[];
  fmt: (d: Date) => string;
  fmtShort: (d: Date) => string;
  weekdayName: (d: Date, style?: 'long' | 'short') => string;
  fmtWithWeekday: (d: Date) => string;
  fmtShortWd: (d: Date) => string;
  fmtIsoDate: (iso: string) => string;
  fmtDateTime: (ts: number) => string;
  monthName: (d: Date) => string;
  num: (v: number, maxDigits?: number) => string;
}

export function createFormatters(dateFormat: DateFormat = 'dmy', lang: Lang = 'de'): Formatters {
  const locale = lang === 'en' ? 'en-GB' : 'de-AT';
  const fmt = (d: Date) => {
    const D = pad2(d.getDate()),
      M = pad2(d.getMonth() + 1),
      Y = d.getFullYear();
    switch (dateFormat) {
      case 'iso':
        return `${Y}-${M}-${D}`;
      case 'mdy':
        return `${M}/${D}/${Y}`;
      case 'long':
        return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
      default:
        return `${D}.${M}.${Y}`;
    }
  };
  const fmtShort = (d: Date) => {
    const D = pad2(d.getDate()),
      M = pad2(d.getMonth() + 1);
    switch (dateFormat) {
      case 'iso':
        return `${M}-${D}`;
      case 'mdy':
        return `${M}/${D}`;
      case 'long':
        return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
      default:
        return `${D}.${M}.`;
    }
  };
  const weekdayName = (d: Date, style: 'long' | 'short' = 'long') => d.toLocaleDateString(locale, { weekday: style });
  return {
    locale,
    weekdays: lang === 'en' ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] : ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'],
    fmt,
    fmtShort,
    weekdayName,
    fmtWithWeekday: (d) => weekdayName(d) + ', ' + fmt(d),
    fmtShortWd: (d) => weekdayName(d, 'short') + ' ' + fmtShort(d),
    fmtIsoDate: (iso) => fmt(day(iso)),
    fmtDateTime: (ts) => {
      const d = new Date(ts);
      return fmt(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    },
    monthName: (d) => d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
    num: (v, maxDigits = 1) => v.toLocaleString(locale, { maximumFractionDigits: maxDigits }),
  };
}

/** Standard-Formatierer (deutsch, TT.MM.JJJJ) für Meldungen in der Fachlogik */
export const F = createFormatters();

export const fmtHours = (h: number) => {
  const mm = Math.round(h * 60),
    H = Math.floor(mm / 60),
    M = mm % 60;
  return M ? `${H} Std. ${M} Min.` : `${H} Std.`;
};
