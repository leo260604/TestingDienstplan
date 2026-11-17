import { describe, expect, it } from 'vitest';
import { planDutyRotation, planStandbyRotation, rotationPattern } from '@/lib/rotation';
import type { ShiftType } from '@/lib/types';
import { entry } from './helpers';

const shift = (name: string, start: string, end: string, multi = true): ShiftType => ({ id: name, team: 'T', teamId: 't', name, start, end, pause: 30, multi, color: '#159da8' });

describe('Bereitschafts-Rotation', () => {
  const time = { id: 's', name: 'Tagesbereitschaft', type: 'fix' as const, start: '07:00', end: '19:00', color: '#000' };
  it('wechselt wöchentlich der Reihe nach', () => {
    const r = planStandbyRotation({ entries: [], teams: [{ name: 'T', members: ['A', 'B', 'C'] }], time, from: '2026-11-16', to: '2026-12-06', mode: 'week', keep: true });
    expect(r.created).toHaveLength(21);
    expect(r.created.filter((e) => e.date <= '2026-11-22').every((e) => e.employee === 'A')).toBe(true);
    expect(r.created.find((e) => e.date === '2026-11-23')!.employee).toBe('B');
  });
  it('setzt nach der letzten Bereitschaft fort und überspringt Abwesende', () => {
    const prev = entry({ kind: 'Bereitschaft', team: 'T', employee: 'A', date: '2026-11-15' });
    const away = entry({ team: 'T', employee: 'B', date: '2026-11-16', isAbsence: true, shift: 'Urlaub', start: '', end: '' });
    const r = planStandbyRotation({ entries: [prev, away], teams: [{ name: 'T', members: ['A', 'B', 'C'] }], time, from: '2026-11-16', to: '2026-11-17', mode: 'day', keep: true });
    expect(r.created.map((e) => e.employee)).toEqual(['C', 'C']);
  });
});

describe('Dienst-Rotation', () => {
  it('faires Muster: Einzeldienst einmal pro Zyklus', () => {
    const p = rotationPattern([shift('F', '06:00', '14:00', false), shift('T', '07:00', '15:00')], 5);
    expect(p).toHaveLength(5);
    expect(p.filter((x) => x === 0)).toHaveLength(1);
  });
  it('besetzt jeden Arbeitstag, keine Feiertage, keine Abwesenden', () => {
    const shifts = [shift('Früh', '06:00', '14:00', false), shift('Tag', '07:00', '15:00')];
    const away = entry({ team: 'T', employee: 'B', date: '2026-12-09', isAbsence: true, shift: 'Urlaub', start: '', end: '' });
    const r = planDutyRotation({ entries: [away], teams: [{ name: 'T', members: ['A', 'B', 'C'], shifts }], from: '2026-12-07', to: '2026-12-11', mode: 'week', keep: true });
    // 5 Tage, 8.12. Feiertag → 4 Tage × 3 Personen − 1 Abwesenheit
    expect(r.created).toHaveLength(11);
    expect(r.created.some((e) => e.date === '2026-12-08')).toBe(false);
    expect(r.created.some((e) => e.employee === 'B' && e.date === '2026-12-09')).toBe(false);
    for (const d of ['2026-12-07', '2026-12-09', '2026-12-10', '2026-12-11']) expect(r.created.filter((e) => e.date === d && e.shift === 'Früh')).toHaveLength(1);
  });
});
