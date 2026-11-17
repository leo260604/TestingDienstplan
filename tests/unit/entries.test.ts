import { describe, expect, it } from 'vitest';
import { computeConflicts, netHours, standbyDayOk, standbyDaysLabel, standbyCoverage, tRange, isVariableStandby, shiftHexColor } from '@/lib/entries';
import { distinctTeamColor, colorDiff, TC_MIN_DIFF } from '@/lib/colors';
import { entry } from './helpers';

describe('Einträge', () => {
  it('zieht die Mittagspause nur bei Diensten ab', () => {
    expect(netHours(entry({ start: '07:00', end: '15:00' }))).toBe(7.5);
    expect(netHours(entry({ kind: 'Bereitschaft', start: '07:00', end: '19:00' }))).toBe(12);
  });
  it('erkennt Dienst an ganztägiger Abwesenheit als Konflikt', () => {
    const a = entry({ id: 'd1' }),
      b = entry({ id: 'u1', isAbsence: true, shift: 'Urlaub', start: '', end: '' });
    expect([...computeConflicts([a, b])].sort()).toEqual(['d1', 'u1']);
  });
  it('halber Urlaubstag ist kein Konflikt', () => {
    const a = entry({ id: 'd2' }),
      b = entry({ id: 'u2', isAbsence: true, shift: 'Urlaub 1/2 Tag', start: '', end: '' });
    expect(computeConflicts([a, b]).size).toBe(0);
  });
  it('untertägige Abwesenheit nur bei Überschneidung', () => {
    const a = entry({ id: 'd3', start: '07:00', end: '15:00' });
    expect(computeConflicts([a, entry({ id: 'x', isAbsence: true, shift: 'Arztbesuch', start: '16:00', end: '17:00' })]).size).toBe(0);
    expect(computeConflicts([a, entry({ id: 'y', isAbsence: true, shift: 'Arztbesuch', start: '14:00', end: '16:00' })]).size).toBe(2);
  });
  it('Nachtdienst, der in den Folgedienst reicht', () => {
    const night = entry({ id: 'n', date: '2026-11-16', start: '22:00', end: '07:00' });
    const next = entry({ id: 'm', date: '2026-11-17', start: '06:00', end: '14:00' });
    expect(computeConflicts([night, next]).size).toBe(2);
  });
  it('Bereitschaftstage und Feiertage', () => {
    const weekend = { days: [5, 6], hol: true };
    expect(standbyDayOk(weekend, '2026-11-21')).toBe(true); // Samstag
    expect(standbyDayOk(weekend, '2026-11-18')).toBe(false); // Mittwoch
    expect(standbyDayOk(weekend, '2026-12-08')).toBe(true); // Feiertag Dienstag
    expect(standbyDaysLabel(weekend)).toBe('Sa, So, Feiertage');
    expect(standbyDaysLabel({})).toBe('Täglich');
    expect(standbyDaysLabel({ days: [0, 1, 2, 3, 4], hol: false })).toBe('Mo–Fr (außer Feiertage)');
  });
  it('Abdeckung und variable Bereitschaft', () => {
    expect(standbyCoverage([{ id: 'a', name: 'a', type: 'fix', start: '07:00', end: '19:00', color: '' }, { id: 'b', name: 'b', type: 'fix', start: '19:00', end: '07:00', color: '' }])).toBe(24);
    expect(isVariableStandby({ kind: 'Bereitschaft', start: '', end: '' })).toBe(true);
    expect(tRange({ kind: 'Bereitschaft', start: '', end: '' })).toBe('variabel');
    expect(shiftHexColor('blue')).toBe('#3974c6');
  });
  it('Teamfarben bleiben unterscheidbar', () => {
    const others = [{ id: 't1', color: '#3974c6' }];
    const c = distinctTeamColor('#3a75c7', others);
    expect(colorDiff(c, '#3974c6')).toBeGreaterThanOrEqual(TC_MIN_DIFF);
    expect(distinctTeamColor('#d95f20', others)).toBe('#d95f20');
  });
});
