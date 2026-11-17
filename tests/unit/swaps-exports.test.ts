// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { swapProblems, swapSnap } from '@/lib/swaps';
import { csvSafe, toCsv } from '@/lib/export/csv';
import { makePdf, makeXlsx, makeZip } from '@/lib/export/formats';
import { exportReports } from '@/lib/export/reports';
import { demoCtx, entry } from './helpers';

describe('Diensttausch', () => {
  it('erlaubt einen gültigen Tausch und erkennt Doppeldienste', () => {
    const mine = entry({ id: 'g', employee: 'Alex Gruber', date: '2030-01-07' });
    const theirs = entry({ id: 't', employee: 'Daniel Winkler', date: '2030-01-08' });
    const c = demoCtx('Alex Gruber', [mine, theirs]);
    expect(swapProblems(c, [swapSnap(mine)], [swapSnap(theirs)], 'Alex Gruber', 'Daniel Winkler', '2030-01-01')).toEqual([]);
    const clash = entry({ id: 'x', employee: 'Daniel Winkler', date: '2030-01-07' });
    c.data.entries.push(clash);
    expect(swapProblems(c, [swapSnap(mine)], [], 'Alex Gruber', 'Daniel Winkler', '2030-01-01')[0]).toMatch(/zwei Dienste/);
  });
  it('blockiert, wenn der Tausch im Team deaktiviert ist', () => {
    const mine = entry({ id: 'g2', date: '2030-01-07' });
    const c = demoCtx('Alex Gruber', [mine]);
    c.data.teams[0].settings = { swap: false };
    expect(swapProblems(c, [swapSnap(mine)], [], 'Alex Gruber', 'Daniel Winkler', '2030-01-01')[0]).toMatch(/deaktiviert/);
  });
});

describe('Exporte', () => {
  it('CSV schützt vor Formel-Injection, lässt Telefonnummern', () => {
    expect(csvSafe('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvSafe('+43 660 123')).toBe('+43 660 123');
    expect(toCsv([['a', 1.5]])).toBe('﻿"a";"1,5"');
  });
  it('erzeugt ZIP, XLSX und PDF', async () => {
    const zip = makeZip([{ name: 'a.txt', data: 'hallo' }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const x = makeXlsx('Test', [['Kopf', 'Zahl'], ['a', 1]], { sumCols: [1] });
    expect(x.size).toBeGreaterThan(500);
    const pdf = makePdf('Titel', 'Sub', ['A', 'B'], [['1', '2']], [1, 1]);
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 8))).toBe('%PDF-1.4');
  });
  it('Lohnverrechnung summiert Stunden je Mitarbeiter', () => {
    const list = [entry({ employee: 'A' }), entry({ employee: 'A', date: '2026-11-17' }), entry({ employee: 'A', kind: 'Bereitschaft', start: '07:00', end: '19:00' })];
    const payroll = exportReports().find((r) => r.id === 'payroll')!.build(list);
    expect(payroll.rows[0]).toEqual(['A', 'Team Nord', 2, 15, 1, 12, 0, 0]);
  });
});
