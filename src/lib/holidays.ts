/* Gesetzliche Feiertage Österreich (bundesweit), berechnet für 1900–2099.
   Fix: Neujahr, Heilige Drei Könige, Staatsfeiertag, Mariä Himmelfahrt, Nationalfeiertag,
        Allerheiligen, Mariä Empfängnis, Christtag, Stefanitag
   Beweglich (Ostern): Ostersonntag, Ostermontag, Christi Himmelfahrt, Pfingsten, Fronleichnam */
import { isoDate, addDays } from './dates';

const cache = new Map<number, Map<string, string>>();

export function easterSunday(y: number): Date {
  const a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31),
    da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da, 12);
}

export function atHolidays(y: number): Map<string, string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const m = new Map<string, string>();
  cache.set(y, m);
  if (y < 1900 || y > 2099) return m;
  const fix: [number, number, string][] = [
    [1, 1, 'Neujahr'],
    [1, 6, 'Heilige Drei Könige'],
    [5, 1, 'Staatsfeiertag'],
    [8, 15, 'Mariä Himmelfahrt'],
    [10, 26, 'Nationalfeiertag'],
    [11, 1, 'Allerheiligen'],
    [12, 8, 'Mariä Empfängnis'],
    [12, 25, 'Christtag'],
    [12, 26, 'Stefanitag'],
  ];
  fix.forEach(([mo, d, n]) => m.set(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, n));
  const easter = easterSunday(y);
  const rel = (offset: number, name: string) => {
    const key = isoDate(addDays(easter, offset));
    m.set(key, m.has(key) ? m.get(key) + ' · ' + name : name);
  };
  rel(0, 'Ostersonntag');
  rel(1, 'Ostermontag');
  rel(39, 'Christi Himmelfahrt');
  rel(49, 'Pfingstsonntag');
  rel(50, 'Pfingstmontag');
  rel(60, 'Fronleichnam');
  return m;
}

export function holidayName(iso?: string): string {
  if (!iso || typeof iso !== 'string') return '';
  return atHolidays(+iso.slice(0, 4)).get(iso.slice(0, 10)) || '';
}

export const isHoliday = (iso: string) => !!holidayName(iso);
