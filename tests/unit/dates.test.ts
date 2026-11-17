import { describe, expect, it } from 'vitest';
import { addDays, createFormatters, durationHours, isoDate, isoWeek, timeSpan, validDateInput, weekStart, day } from '@/lib/dates';
import { holidayName, isHoliday, easterSunday } from '@/lib/holidays';

describe('Datumsfunktionen', () => {
  it('berechnet Wochenstart (Montag) und ISO-KW', () => {
    expect(isoDate(weekStart(day('2026-11-19')))).toBe('2026-11-16');
    expect(isoDate(weekStart(day('2026-11-22')))).toBe('2026-11-16');
    expect(isoWeek(day('2026-11-17'))).toBe(47);
    expect(isoWeek(day('2027-01-01'))).toBe(53);
  });
  it('rechnet Dauer über Mitternacht', () => {
    expect(durationHours('06:00', '14:12')).toBeCloseTo(8.2);
    expect(durationHours('22:00', '06:00')).toBe(8);
    expect(timeSpan({ start: '19:00', end: '07:00' })).toEqual([1140, 1860]);
  });
  it('prüft Datumseingaben (2000–2099)', () => {
    expect(validDateInput('2026-02-28')).toBe(true);
    expect(validDateInput('1999-12-31')).toBe(false);
    expect(validDateInput('abc')).toBe(false);
  });
  it('formatiert nach Einstellung', () => {
    const d = day('2026-12-31');
    expect(createFormatters('dmy').fmt(d)).toBe('31.12.2026');
    expect(createFormatters('iso').fmt(d)).toBe('2026-12-31');
    expect(createFormatters('mdy').fmt(d)).toBe('12/31/2026');
    expect(isoDate(addDays(d, 1))).toBe('2027-01-01');
  });
});

describe('Feiertage Österreich', () => {
  it('kennt fixe und bewegliche Feiertage', () => {
    expect(isoDate(easterSunday(2026))).toBe('2026-04-05');
    expect(holidayName('2026-10-26')).toBe('Nationalfeiertag');
    expect(holidayName('2026-04-06')).toBe('Ostermontag');
    expect(holidayName('2026-06-04')).toBe('Fronleichnam');
    expect(isHoliday('2026-11-17')).toBe(false);
  });
});
