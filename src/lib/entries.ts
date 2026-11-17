/* Fachlogik rund um Einträge: Farben, Zeiten, Stunden, Konflikte, Bereitschaftstage */
import { addDays, day, durationHours, hoursOf, isoDate, timeSpan, weekStart, WD_SHORT } from './dates';
import { isHoliday } from './holidays';
import type { Entry, ShiftType, StandbyTime, Team } from './types';

/** fixe Mittagspause, wird bei jedem Dienst abgezogen */
export const LUNCH_MIN = 30;

export const ABSENCE_KINDS: [string, string, string][] = [
  ['Urlaub', 'travel', 'Ganzer Tag'],
  ['Urlaub 1/2 Tag', 'travel', 'Halber Tag'],
  ['Gleittag', 'cal', 'Zeitausgleich'],
  ['Sonderurlaub', 'spark', 'z. B. Hochzeit, Umzug'],
  ['Berufsschule', 'file', 'Schultag'],
  ['Abwesend', 'alert', 'Ganzer Tag'],
  ['Abwesend untertägig', 'clock', 'Mit Uhrzeit'],
  ['Arztbesuch', 'plus', 'Mit Uhrzeit'],
];
export const TIMED_ABSENCES = ['Abwesend untertägig', 'Arztbesuch'];
export const ABSENCE_FULLDAY = ['Urlaub', 'Gleittag', 'Sonderurlaub', 'Berufsschule', 'Abwesend'];
export const ABSENCE_COLOR = '#d69b38';

export const SHIFT_SWATCHES = ['#3974c6', '#24966b', '#e09a2d', '#9b69c8', '#dc6475', '#159da8', '#596579', '#d95f20', '#7b8f32', '#263d75', '#e2b5ca', '#20242d'];
export const STANDBY_COLORS = ['#3974c6', '#0068a8', '#263d75', '#159da8', '#24966b', '#7b8f32', '#e09a2d', '#d95f20', '#c2412d', '#dc6475', '#d0508a', '#b5487d', '#9b69c8', '#596579'];

export const isHex = (v?: string) => /^#[0-9a-f]{6}$/i.test(v || '');

export function shiftHexColor(value?: string, accent: 'turquoise' | 'navy' = 'turquoise'): string {
  const map: Record<string, string> = {
    blue: '#3974c6',
    green: '#24966b',
    amber: '#e09a2d',
    red: '#dc6475',
    purple: '#9b69c8',
    teal: accent === 'navy' ? '#004d7d' : '#159da8',
  };
  return map[value || ''] || (isHex(value) ? (value as string) : '#3974c6');
}

export function teamColor(t: Team | undefined, shiftTypes: ShiftType[] = []): string {
  if (!t) return '#14A1A9';
  if (isHex(t.standbyColor)) return t.standbyColor;
  const st = shiftTypes.find((s) => s.team === t.name);
  return st ? shiftHexColor(st.color) : '#14A1A9';
}

export function assignmentColor(a: Entry, teams: Team[], shiftTypes: ShiftType[] = []): string {
  if (a.isAbsence) return ABSENCE_COLOR;
  if (a.kind === 'Bereitschaft') {
    const t = teams.find((x) => x.name === a.team);
    return t ? teamColor(t, shiftTypes) : a.color || '#159da8';
  }
  return shiftHexColor(a.color || 'blue');
}

export function colorWithAlpha(hex: string, alpha: number, dark = false): string {
  if (dark && alpha <= 0.15) alpha = 0.34;
  const c = shiftHexColor(hex);
  const r = parseInt(c.slice(1, 3), 16),
    g = parseInt(c.slice(3, 5), 16),
    b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Standard: Dienst darf mehrfach am Tag besetzt werden */
export const shiftMulti = (s?: Pick<ShiftType, 'multi'> | null) => !s || s.multi !== false;

/** Variable Bereitschaft: ohne feste Uhrzeit → „variabel“ */
export function isVariableStandby(x?: Partial<Entry & StandbyTime> | null): boolean {
  if (!x) return false;
  if (x.start && x.end) return false;
  return x.kind === 'Bereitschaft' || x.type === 'variabel' || (!('kind' in x) && !!x.groupId);
}

export const tRange = (x: { start?: string; end?: string; kind?: string; type?: string; groupId?: string }, sep = '–') =>
  isVariableStandby(x as Partial<Entry & StandbyTime>) ? 'variabel' : `${x?.start}${sep}${x?.end}`;

export function netHours(a: Pick<Entry, 'start' | 'end' | 'kind' | 'isAbsence'>): number {
  return Math.max(0, durationHours(a.start, a.end) - (a.kind === 'Dienstplan' && !a.isAbsence ? LUNCH_MIN / 60 : 0));
}

export const kindLabel = (a: Entry) => (a.isAbsence ? 'Abwesenheit' : a.kind === 'Dienstplan' ? 'Dienst' : a.kind);

export function weekHoursOf(entries: Entry[], name: string, ws: Date): number {
  const a = isoDate(ws),
    b = isoDate(addDays(ws, 6));
  return entries
    .filter((x) => x.employee === name && x.kind === 'Dienstplan' && !x.isAbsence && x.date >= a && x.date <= b)
    .reduce((s, x) => s + netHours(x), 0);
}

export function fullDayAbsent(entries: Entry[], name: string, date: string): boolean {
  return entries.some((a) => a.isAbsence && a.employee === name && a.date === date && !a.start && a.shift !== 'Urlaub 1/2 Tag');
}

/** Konflikte: Dienst/Bereitschaft an einem Abwesenheitstag sowie Dienste,
    die über Mitternacht in den nächsten Dienst hineinreichen. */
export function computeConflicts(list: Entry[]): Set<string> {
  const by: Record<string, Entry[]> = {};
  list.forEach((a) => {
    if (a.kind === 'Dienstplan' || a.kind === 'Bereitschaft') (by[a.employee + '|' + a.date] ||= []).push(a);
  });
  const ids = new Set<string>();
  Object.values(by).forEach((items) => {
    const work = items.filter((a) => !a.isAbsence),
      abs = items.filter((a) => a.isAbsence);
    if (!work.length || !abs.length) return;
    abs.forEach((x) => {
      if (x.shift === 'Urlaub 1/2 Tag') return;
      const partial = !!(x.start && x.end);
      work.forEach((w) => {
        let overlap = !partial;
        if (partial) {
          const [xs, xe] = timeSpan(x),
            [ws, we] = timeSpan(w);
          overlap = xs < we && ws < xe;
        }
        if (overlap) {
          ids.add(w.id);
          ids.add(x.id);
        }
      });
    });
  });
  list.forEach((a) => {
    if (a.kind !== 'Dienstplan' || a.isAbsence || !a.start || !a.end) return;
    const [, e] = timeSpan(a);
    if (e <= 1440) return;
    const next = isoDate(addDays(day(a.date), 1));
    (by[a.employee + '|' + next] || []).forEach((n) => {
      if (n.kind !== 'Dienstplan' || n.isAbsence || !n.start) return;
      if (timeSpan(n)[0] < e - 1440) {
        ids.add(a.id);
        ids.add(n.id);
      }
    });
  });
  return ids;
}

/* ---------- Bereitschaftszeiten ---------- */

export const standbyTimeAllTeams = (t?: StandbyTime) => !Array.isArray(t?.teamIds);
export const standbyTimeTeams = (t: StandbyTime, teams: Team[]) =>
  standbyTimeAllTeams(t) ? teams : teams.filter((x) => t.teamIds!.includes(x.id));
export function standbyTimeForTeam(t: StandbyTime | undefined, teamName: string, teams: Team[]): boolean {
  if (!t) return false;
  if (standbyTimeAllTeams(t)) return true;
  const x = teams.find((tt) => tt.name === teamName);
  return !!x && t.teamIds!.includes(x.id);
}

export const standbyDays = (x?: Partial<StandbyTime>) => (Array.isArray(x?.days) ? x!.days!.filter((d) => d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6]);
export const standbyHol = (x?: Partial<StandbyTime>) => x?.hol !== false;
export const standbyRestricted = (x?: Partial<StandbyTime>) => standbyDays(x).length < 7 || !standbyHol(x);

/** Feiertag Mo–Fr: nur Bereitschaften mit „Feiertage“; Feiertag am Wochenende zählt als normaler Sa/So */
export function standbyDayOk(x: Partial<StandbyTime>, iso: string): boolean {
  const wd = (day(iso).getDay() + 6) % 7;
  if (isHoliday(iso) && wd < 5) return standbyHol(x);
  return standbyDays(x).includes(wd);
}

export function standbyWdLabel(days: number[]): string {
  const d = days.slice().sort((a, b) => a - b);
  if (d.length === 7) return 'Mo–So';
  const runs: [number, number][] = [];
  d.forEach((v) => {
    const r = runs[runs.length - 1];
    if (r && v === r[1] + 1) r[1] = v;
    else runs.push([v, v]);
  });
  return runs
    .map(([a, b]) => (a === b ? WD_SHORT[a] : b === a + 1 ? WD_SHORT[a] + ', ' + WD_SHORT[b] : WD_SHORT[a] + '–' + WD_SHORT[b]))
    .join(', ');
}

export function standbyDaysLabel(x: Partial<StandbyTime>): string {
  const d = standbyDays(x),
    h = standbyHol(x);
  if (d.length === 7 && h) return 'Täglich';
  if (!d.length) return h ? 'Nur Feiertage' : '—';
  const w = standbyWdLabel(d);
  if (h) return w + ', Feiertage';
  return d.some((v) => v < 5) ? w + ' (außer Feiertage)' : w;
}

export function standbyTimeByName(times: StandbyTime[], teams: Team[], name: string, team?: string) {
  return times.find((x) => x.name === name && (!team || standbyTimeForTeam(x, team, teams))) || times.find((x) => x.name === name);
}

/** Abdeckung der fixen Bereitschaftszeiten über 24 Stunden (in Stunden) */
export function standbyCoverage(times: StandbyTime[]): number {
  const m = new Uint8Array(1440);
  times.forEach((t) => {
    if (isVariableStandby(t)) return;
    const s = Math.round(hoursOf(t.start) * 60),
      e = Math.round(hoursOf(t.end) * 60);
    if (s === e) return;
    if (e > s) m.fill(1, s, e);
    else {
      m.fill(1, s, 1440);
      m.fill(1, 0, e);
    }
  });
  let n = 0;
  for (const v of m) n += v;
  return n / 60;
}

/** Zeitleisten-Segmente (in Stunden 0–24) einer Uhrzeitspanne */
export function scaleSegments(start: string, end: string): [number, number][] {
  const s = hoursOf(start),
    e = hoursOf(end);
  return e > s ? [[s, e]] : [[s, 24], [0, e]];
}

/* ---------- Arbeitsort-Hinweise ---------- */
export function buildWpIndex(entries: Entry[]) {
  const wp = new Map<string, Entry>(),
    duty = new Set<string>();
  entries.forEach((a) => {
    const k = a.date + '|' + a.employee;
    if (a.kind === 'Arbeitsort') wp.set(k, a);
    else if (a.kind === 'Dienstplan' && !a.isAbsence) duty.add(k);
  });
  return {
    wpFor: (a: Entry) => (a.kind === 'Dienstplan' && !a.isAbsence ? wp.get(a.date + '|' + a.employee) || null : null),
    /** Arbeitsort steht bereits als Hinweis beim Dienst */
    merged: (a: Entry) => a.kind === 'Arbeitsort' && duty.has(a.date + '|' + a.employee),
  };
}

/** Lücken ohne Bereitschaft für ein Team in einer Datumsliste */
export function standbyGapRanges(entries: Entry[], teamName: string, dates: string[]) {
  const out: { from: string; to: string }[] = [];
  let cur: { from: string; to: string } | null = null;
  dates.forEach((date) => {
    const has = entries.some((a) => a.kind === 'Bereitschaft' && a.team === teamName && a.date === date);
    if (!has) {
      if (cur && cur.to === isoDate(addDays(day(date), -1))) cur.to = date;
      else {
        cur = { from: date, to: date };
        out.push(cur);
      }
    }
  });
  return out;
}

export { weekStart };
