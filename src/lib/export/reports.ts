/* Export-Zentrale: alle Berichte als PDF / Excel / CSV */
import { day, durationHours, F, type Formatters } from '../dates';
import { isVariableStandby, kindLabel, netHours } from '../entries';
import { KIND_ORDER, makePdf, makeXlsx, type Cell } from './formats';
import { toCsv } from './csv';
import type { Entry } from '../types';

export const ENTRY_HEAD = ['Datum', 'Wochentag', 'Mitarbeiter', 'Team', 'Art', 'Dienst / Bezeichnung', 'Gruppe', 'Beginn', 'Ende', 'Stunden (netto)', 'Bemerkung'];

export function entryRow(a: Entry, f: Formatters = F): Cell[] {
  const d = day(a.date);
  return [
    f.fmtIsoDate(a.date),
    f.weekdayName(d, 'short'),
    a.employee,
    a.team,
    kindLabel(a),
    a.shift || '',
    a.groupName || '',
    a.start || (a.isAbsence ? 'ganztägig' : isVariableStandby(a) ? 'variabel' : ''),
    a.end || '',
    a.start && a.end && !a.isAbsence ? +netHours(a).toFixed(2) : '',
    a.note || '',
  ];
}

export const sortEntries = (list: Entry[]) =>
  [...list].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      String(a.team).localeCompare(String(b.team), 'de') ||
      String(a.employee).localeCompare(String(b.employee), 'de') ||
      String(a.start || '').localeCompare(String(b.start || '')) ||
      KIND_ORDER.indexOf(kindLabel(a)) - KIND_ORDER.indexOf(kindLabel(b)),
  );

interface HourAgg {
  team: string;
  dn: number;
  dh: number;
  sn: number;
  sh: number;
  abs: number;
  vac: number;
  off: number;
  ho: number;
}
export function groupHours(list: Entry[]): [string, HourAgg][] {
  const map: Record<string, HourAgg> = {};
  list.forEach((a) => {
    const m = (map[a.employee] ||= { team: a.team, dn: 0, dh: 0, sn: 0, sh: 0, abs: 0, vac: 0, off: 0, ho: 0 });
    if (a.isAbsence) {
      m.abs++;
      if (String(a.shift).startsWith('Urlaub')) m.vac += a.shift === 'Urlaub 1/2 Tag' ? 0.5 : 1;
    } else if (a.kind === 'Dienstplan') {
      m.dn++;
      m.dh += netHours(a);
    } else if (a.kind === 'Bereitschaft') {
      m.sn++;
      m.sh += durationHours(a.start, a.end);
    } else if (a.kind === 'Arbeitsort') {
      if (a.shift === 'Homeoffice') m.ho++;
      else m.off++;
    }
  });
  return Object.entries(map).sort((a, b) => a[1].team.localeCompare(b[1].team, 'de') || a[0].localeCompare(b[0], 'de'));
}

export interface ReportSpec {
  file: string;
  title: string;
  head: string[];
  rows: Cell[][];
  count: number;
  kindCol?: number;
  kindOf?: (v: unknown) => string;
  headKinds?: (string | null)[];
  numCols?: number[];
  intCols?: number[];
  sumCols?: number[];
  units?: Record<number, string>;
  groupCol?: number;
  subBy?: number;
  widths?: number[];
  legend?: string[];
  pdf?: (title: string, sub: string) => Blob;
}

export interface ReportDef {
  id: string;
  icon: string;
  title: string;
  sub: string;
  unit: string;
  src?: 'filtered' | 'selection';
  template?: boolean;
  build: (list: Entry[]) => ReportSpec;
}

function entriesPdf(list: Entry[], title: string, sub: string, author: string) {
  const rows = list.map((a) => {
    const d = day(a.date);
    return [
      F.weekdayName(d, 'short') + ' ' + F.fmtIsoDate(a.date),
      a.employee,
      a.team,
      kindLabel(a),
      a.shift || '—',
      a.start ? a.start + '–' + a.end : isVariableStandby(a) ? 'variabel' : 'ganztägig',
      a.start && !a.isAbsence ? netHours(a).toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '—',
    ];
  });
  const tot = list.reduce((t, a) => t + (a.start && a.end && !a.isAbsence ? netHours(a) : 0), 0);
  return makePdf(title, sub, ['Datum', 'Mitarbeiter', 'Team', 'Art', 'Dienst', 'Uhrzeit', 'Std.'], rows, [1.7, 2.6, 1.8, 1.5, 2.3, 1.4, 0.8], {
    kindCol: 3,
    rightCols: [6],
    groupCol: 0,
    author,
    legend: KIND_ORDER.filter((k) => list.some((a) => kindLabel(a) === k)),
    sumRow: ['Summe', `${list.length} Einträge`, '', '', '', '', tot.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 2 })],
  });
}

export function exportReports(author = ''): ReportDef[] {
  const entriesSpec = (file: string, title: string) => (list: Entry[]): ReportSpec => {
    list = sortEntries(list);
    return { file, title, head: ENTRY_HEAD, rows: list.map((a) => entryRow(a)), kindCol: 4, numCols: [9], sumCols: [9], count: list.length, pdf: (t, s) => entriesPdf(list, t, s, author) };
  };
  return [
    { id: 'entries', icon: 'grid', title: 'Alle Einträge', sub: 'Alle gefilterten Einträge mit Art, Dienst & Uhrzeit', unit: 'Einträge', src: 'filtered', build: entriesSpec('dienstplan-eintraege', 'Dienstplan – Einträge') },
    { id: 'selection', icon: 'check', title: 'Ausgewählte Einträge', sub: 'Nur die angehakten Zeilen', unit: 'Einträge', src: 'selection', build: entriesSpec('dienstplan-auswahl', 'Dienstplan – Auswahl') },
    {
      id: 'payroll', icon: 'file', title: 'Monatsbericht Lohnverrechnung', sub: 'Dienste, Bereitschaften & Abwesenheiten je Mitarbeiter', unit: 'Mitarbeiter', template: true,
      build: (list) => {
        const rows = groupHours(list).filter(([, m]) => m.dn || m.sn || m.abs).map(([n, m]) => [n, m.team, m.dn, +m.dh.toFixed(2), m.sn, +m.sh.toFixed(2), m.vac, m.abs]);
        return { file: 'lohnverrechnung', title: 'Monatsbericht Lohnverrechnung', head: ['Mitarbeiter', 'Team', 'Dienste', 'Dienststunden (netto)', 'Bereitschaften', 'Bereitschaftsstunden', 'Urlaubstage', 'Abwesenheitstage'], rows, headKinds: [null, null, 'Dienst', 'Dienst', 'Bereitschaft', 'Bereitschaft', 'Abwesenheit', 'Abwesenheit'], intCols: [2, 4, 7], numCols: [3, 5, 6], sumCols: [2, 3, 4, 5, 6, 7], units: { 3: ' h', 5: ' h' }, groupCol: 1, subBy: 1, widths: [2.6, 2, 1, 1.6, 1.3, 1.7, 1.2, 1.4], legend: ['Dienst', 'Bereitschaft', 'Abwesenheit'], count: rows.length };
      },
    },
    {
      id: 'standby', icon: 'moon', title: 'Bereitschaftsabrechnung', sub: 'Bereitschaftstage & -stunden je Team', unit: 'Mitarbeiter', template: true,
      build: (list) => {
        const map: Record<string, { team: string; emp: string; days: number; h: number }> = {};
        list.filter((a) => a.kind === 'Bereitschaft').forEach((a) => {
          const m = (map[a.team + '|' + a.employee] ||= { team: a.team, emp: a.employee, days: 0, h: 0 });
          m.days++;
          m.h += durationHours(a.start, a.end);
        });
        const rows = Object.values(map).sort((a, b) => a.team.localeCompare(b.team, 'de') || a.emp.localeCompare(b.emp, 'de')).map((m) => [m.team, m.emp, 'Bereitschaft', m.days, +m.h.toFixed(2)]);
        return { file: 'bereitschaftsabrechnung', title: 'Bereitschaftsabrechnung', head: ['Team', 'Mitarbeiter', 'Art', 'Bereitschaftstage', 'Stunden'], rows, kindCol: 2, headKinds: [null, null, null, 'Bereitschaft', 'Bereitschaft'], intCols: [3], numCols: [4], sumCols: [3, 4], units: { 4: ' h' }, groupCol: 0, subBy: 0, widths: [2.6, 3.2, 1.6, 1.4, 1.4], legend: ['Bereitschaft'], count: rows.length };
      },
    },
    {
      id: 'absence', icon: 'plane', title: 'Abwesenheitsübersicht', sub: 'Urlaub & Abwesenheiten je Mitarbeiter', unit: 'Einträge', template: true,
      build: (list) => {
        const ab = list.filter((a) => a.isAbsence).sort((a, b) => a.employee.localeCompare(b.employee, 'de') || a.date.localeCompare(b.date));
        const rows = ab.map((a) => [a.employee, a.team, F.fmtIsoDate(a.date), F.weekdayName(day(a.date), 'short'), a.shift || 'Abwesend', a.start ? a.start + '–' + a.end : a.shift === 'Urlaub 1/2 Tag' ? 'halber Tag' : 'ganztägig', a.shift === 'Urlaub 1/2 Tag' ? 0.5 : 1, a.note || '']);
        return { file: 'abwesenheiten', title: 'Abwesenheitsübersicht', head: ['Mitarbeiter', 'Team', 'Datum', 'Tag', 'Art der Abwesenheit', 'Dauer', 'Tage', 'Bemerkung'], rows, kindCol: 4, kindOf: () => 'Abwesenheit', headKinds: [null, null, null, null, 'Abwesenheit', null, 'Abwesenheit', null], numCols: [6], sumCols: [6], groupCol: 0, subBy: 0, widths: [2.5, 1.9, 1.4, 0.7, 2.2, 1.3, 0.8, 2.6], legend: ['Abwesenheit'], count: rows.length };
      },
    },
    {
      id: 'hours', icon: 'clock', title: 'Stunden je Mitarbeiter', sub: 'Dienst- & Bereitschaftsstunden im Zeitraum', unit: 'Mitarbeiter', template: true,
      build: (list) => {
        const rows = groupHours(list).filter(([, m]) => m.dn || m.sn || m.abs).map(([n, m]) => [n, m.team, +m.dh.toFixed(2), +m.sh.toFixed(2), +(m.dh + m.sh).toFixed(2), m.abs]);
        return { file: 'stunden-je-mitarbeiter', title: 'Stunden je Mitarbeiter', head: ['Mitarbeiter', 'Team', 'Dienststunden (netto)', 'Bereitschaftsstunden', 'Stunden gesamt', 'Abwesenheitstage'], rows, headKinds: [null, null, 'Dienst', 'Bereitschaft', null, 'Abwesenheit'], numCols: [2, 3, 4], intCols: [5], sumCols: [2, 3, 4, 5], units: { 2: ' h', 3: ' h', 4: ' h' }, groupCol: 1, subBy: 1, widths: [2.6, 2, 1.7, 1.7, 1.5, 1.5], legend: ['Dienst', 'Bereitschaft', 'Abwesenheit'], count: rows.length };
      },
    },
    {
      id: 'workplace', icon: 'home', title: 'Arbeitsort-Monatsauswertung', sub: 'Büro- & Homeoffice-Tage je Mitarbeiter', unit: 'Mitarbeiter', template: true,
      build: (list) => {
        const rows = groupHours(list).filter(([, m]) => m.off || m.ho).map(([n, m]) => {
          const t = m.off + m.ho;
          return [n, m.team, m.off, m.ho, t, t ? +((m.ho / t) * 100).toFixed(1) : 0];
        });
        return { file: 'arbeitsort-auswertung', title: 'Arbeitsort – Monatsauswertung', head: ['Mitarbeiter', 'Team', 'Bürotage', 'Homeoffice-Tage', 'Tage gesamt', 'Homeoffice-Anteil (%)'], rows, headKinds: [null, null, 'Arbeitsort', 'Arbeitsort', 'Arbeitsort', 'Arbeitsort'], intCols: [2, 3, 4], numCols: [5], sumCols: [2, 3, 4], units: { 5: ' %' }, groupCol: 1, subBy: 1, widths: [2.6, 2, 1.2, 1.5, 1.3, 1.8], legend: ['Arbeitsort'], count: rows.length };
      },
    },
  ];
}

export function fmtCell(v: Cell, ci: number, spec: Pick<ReportSpec, 'units' | 'intCols'>): string {
  if (typeof v !== 'number') return v === '' || v == null ? '—' : v;
  const u = (spec.units || {})[ci] || '';
  if ((spec.intCols || []).includes(ci)) return v.toLocaleString('de-AT') + u;
  return v.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + u;
}

export function genericPdf(spec: ReportSpec, sub: string, unitLabel: string, author: string): Blob {
  const sums = spec.sumCols || [],
    rows: (Cell[] | { sum: Cell[]; sub?: boolean })[] = [];
  let cur: Cell | undefined,
    acc: Record<number, number> | null = null,
    n = 0;
  const flush = () => {
    if (acc && n > 1) rows.push({ sub: true, sum: spec.head.map((_, ci) => (ci === 0 ? `Summe ${cur}` : sums.includes(ci) ? fmtCell(+acc![ci].toFixed(2), ci, spec) : '')) });
  };
  spec.rows.forEach((r) => {
    const g = spec.subBy != null ? r[spec.subBy] : null;
    if (spec.subBy != null && g !== cur) {
      flush();
      cur = g as Cell;
      acc = {};
      n = 0;
      sums.forEach((c) => (acc![c] = 0));
    }
    if (acc) sums.forEach((c) => (acc![c] += typeof r[c] === 'number' ? (r[c] as number) : 0));
    n++;
    rows.push(r.map((v, ci) => fmtCell(v, ci, spec)));
  });
  flush();
  const tot = spec.head.map((_, ci) =>
    ci === 0 ? 'Gesamt' : ci === 1 ? `${spec.count} ${unitLabel}`.trim() : sums.includes(ci) ? fmtCell(+spec.rows.reduce((t, r) => t + (typeof r[ci] === 'number' ? (r[ci] as number) : 0), 0).toFixed(2), ci, spec) : '',
  );
  return makePdf(spec.title, sub, spec.head, rows, spec.widths || spec.head.map(() => 1), {
    groupCol: spec.groupCol,
    kindCol: spec.kindCol,
    kindOf: spec.kindOf,
    headKinds: spec.headKinds,
    rightCols: [...(spec.numCols || []), ...(spec.intCols || [])],
    legend: spec.legend,
    sumRow: sums.length ? tot : null,
    author,
  });
}

/** Erstellt die Datei eines Berichts im gewählten Format */
export function renderReport(spec: ReportSpec, format: 'PDF' | 'XLSX' | 'CSV', sub: string, unitLabel: string, author: string): { blob: Blob; ext: string } {
  if (format === 'CSV') return { blob: new Blob([toCsv([spec.head, ...spec.rows])], { type: 'text/csv;charset=utf-8;' }), ext: 'csv' };
  if (format === 'XLSX')
    return {
      blob: makeXlsx(spec.title.slice(0, 31), [spec.head, ...spec.rows], {
        title: spec.title,
        subtitle: `${sub} · erstellt ${F.fmtDateTime(Date.now())} von ${author}`,
        kindCol: spec.kindCol,
        headKinds: spec.headKinds,
        numCols: spec.numCols,
        intCols: spec.intCols,
        sumCols: spec.sumCols,
        sumLabel: 'Gesamt',
      }),
      ext: 'xlsx',
    };
  return { blob: spec.pdf ? spec.pdf(spec.title, sub) : genericPdf(spec, sub, unitLabel, author), ext: 'pdf' };
}
