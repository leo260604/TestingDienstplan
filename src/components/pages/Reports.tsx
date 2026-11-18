'use client';
/* Berichte / Export: Filter, Kennzahlen, Einträge-Tabelle, Export-Zentrale (PDF / Excel / CSV) */
import { useMemo, useState } from 'react';
import { useApp } from '../AppProvider';
import { Avatar, DateField, Dot, FilterDropdown, Heading, Icon, TeamFilter } from '../ui';
import { addDays, day, durationHours, isoDate, weekStart } from '@/lib/dates';
import { isVariableStandby, kindLabel, netHours, tRange } from '@/lib/entries';
import { exportReports, renderReport } from '@/lib/export/reports';
import { saveFile } from '@/lib/export/csv';
import { canEdit, currentUserTeamNames } from '@/lib/access';
import { exportAllowed, logExport } from '@/server/actions/account';

const KINDS = ['Dienst', 'Bereitschaft', 'Abwesenheit', 'Arbeitsort'];
const PAGE = 25;
type Fmt = 'PDF' | 'XLSX' | 'CSV';

export function Reports() {
  const { ctx, data, user, f, toast, teamColor, refresh } = useApp();
  const now = new Date();
  const [from, setFrom] = useState(isoDate(now));
  const [to, setTo] = useState(isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [teams, setTeams] = useState<string[]>([]);
  const [member, setMember] = useState('Alle Mitarbeiter');
  const [kinds, setKinds] = useState(KINDS);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [exp, setExp] = useState<{ rep: string } | null>(null);
  const [fmt, setFmt] = useState<Fmt>('PDF');

  const allTeamsRole = ['Admin', 'Abteilungsleiter', 'Lohnverrechnung'].includes(user.role);
  const myTeams = currentUserTeamNames(ctx);
  const rowsAll = (allKinds = false) =>
    data.entries
      .filter((a) => (!teams.length || teams.includes(a.team)) && (member === 'Alle Mitarbeiter' || a.employee === member) && (allKinds || kinds.includes(kindLabel(a))) && (!from || a.date >= from) && (!to || a.date <= to) && (allTeamsRole || myTeams.includes(a.team)))
      .sort((a, b) => b.date.localeCompare(a.date) || (a.start || '').localeCompare(b.start || '') || a.employee.localeCompare(b.employee));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => rowsAll(), [data.entries, teams, member, kinds, from, to]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pg = Math.min(page, pages - 1);
  const shown = filtered.slice(pg * PAGE, (pg + 1) * PAGE);
  const duties = filtered.filter((a) => a.kind === 'Dienstplan' && !a.isAbsence),
    sbs = filtered.filter((a) => a.kind === 'Bereitschaft'),
    abs = filtered.filter((a) => a.isAbsence);
  const dutyHours = duties.reduce((s, a) => s + netHours(a), 0),
    standbyHours = sbs.reduce((s, a) => s + durationHours(a.start, a.end), 0),
    people = new Set(duties.map((a) => a.employee)).size;
  const vac = abs.filter((a) => String(a.shift).startsWith('Urlaub')).length;
  const ws = weekStart(now);
  const q = { week: [isoDate(ws), isoDate(addDays(ws, 6))], month: [isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))], last: [isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), isoDate(new Date(now.getFullYear(), now.getMonth(), 0))] };
  const rangeText = `${from ? f.fmtIsoDate(from) : '…'} – ${to ? f.fmtIsoDate(to) : '…'}`;
  const filterText = `${teams.length ? teams.join(', ') : 'Alle Teams'}${member !== 'Alle Mitarbeiter' ? ' · ' + member : ''}`;
  const reports = exportReports(user.name);
  const srcOf = (id: string) => {
    const r = reports.find((x) => x.id === id)!;
    return r.src === 'filtered' ? filtered : r.src === 'selection' ? filtered.filter((a) => sel.has(a.id)) : rowsAll(true);
  };
  const members = data.staff.filter((s) => !teams.length || data.teams.some((t) => teams.includes(t.name) && t.memberIds.includes(s.id)));

  const runExport = async (id: string, format: Fmt) => {
    const rep = reports.find((r) => r.id === id);
    if (!rep) return;
    if (!canEdit(ctx, 'Berichte / Export') || !(await exportAllowed(rep.title, format, rangeText))) {
      toast('Keine Berechtigung zum Exportieren. Der Versuch wurde protokolliert.');
      return;
    }
    const spec = rep.build(srcOf(id));
    if (!spec.rows.length) return toast('Keine Daten für diesen Bericht im gewählten Zeitraum.');
    const sub = `Zeitraum ${rangeText} · ${filterText} · ${spec.count.toLocaleString(f.locale)} ${rep.unit}`;
    const { blob, ext } = renderReport(spec, format, sub, rep.unit, user.name);
    const size = saveFile(`${spec.file}-${from || 'alle'}_${to || ''}.${ext}`, blob);
    await logExport({ report: rep.title, format, rows: spec.rows.length, status: spec.rows.length > 1000 ? 'Groß (>1.000 Zeilen)' : 'Erfolgreich', range: rangeText, size });
    refresh();
    toast(`„${rep.title}“ als ${format === 'XLSX' ? 'Excel' : format} erstellt.`);
    setExp(null);
  };

  const allChecked = shown.length > 0 && shown.every((a) => sel.has(a.id));
  const setRange = (k: keyof typeof q) => {
    setFrom(q[k][0]);
    setTo(q[k][1]);
    setPage(0);
  };
  const isQ = (k: keyof typeof q) => from === q[k][0] && to === q[k][1];
  return (
    <>
      <Heading
        title="Berichte / Export"
        actions={
          <button className="btn primary" onClick={() => setExp({ rep: sel.size ? 'selection' : 'entries' })}>
            <Icon name="download" />
            Exportieren
          </button>
        }
      />
      <section className="panel filter-panel report-filters">
        <span className="date-range">
          <Icon name="cal" />
          <DateField compact required value={from} ariaLabel="Von" rangeFrom={from} rangeTo={to} onChange={(v) => { setFrom(v); if (to && v > to) setTo(v); setPage(0); }} />
          <span>–</span>
          <DateField compact required value={to} ariaLabel="Bis" min={from || undefined} rangeFrom={from} rangeTo={to} onChange={(v) => { setTo(v); setPage(0); }} />
        </span>
        <button type="button" className={`chip ${isQ('week') ? 'active' : ''}`} onClick={() => setRange('week')}>
          Diese Woche
        </button>
        <button type="button" className={`chip ${isQ('month') ? 'active' : ''}`} onClick={() => setRange('month')}>
          Dieser Monat
        </button>
        <button type="button" className={`chip ${isQ('last') ? 'active' : ''}`} onClick={() => setRange('last')}>
          Letzter Monat
        </button>
        <span className="report-break" aria-hidden="true" />
        <div className="report-who">
          <TeamFilter teams={data.teams.map((t) => ({ name: t.name, color: teamColor(t) }))} selected={teams} count={(n) => data.teams.find((t) => t.name === n)?.memberIds.length || 0} onChange={(v) => { setTeams(v); setPage(0); }} />
          <label className="search-field report-member-search">
            <Icon name="search" />
            <input
              type="search"
              list="report-member-options"
              placeholder="Mitarbeiter suchen …"
              defaultValue={member === 'Alle Mitarbeiter' ? '' : member}
              autoComplete="off"
              onChange={(e) => {
                const v = e.target.value.trim();
                if (!v || v === 'Alle Mitarbeiter') setMember('Alle Mitarbeiter');
                else if (data.staff.some((s) => s.name === v)) setMember(v);
                setPage(0);
              }}
            />
            <datalist id="report-member-options">
              <option value="Alle Mitarbeiter" />
              {members.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </label>
        </div>
        <span className="report-kind-chips">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip ${kinds.includes(k) ? 'active' : ''}`}
              onClick={() => {
                const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
                setKinds(next.length ? next : [k]);
                setPage(0);
              }}
            >
              {k}
            </button>
          ))}
        </span>
        <FilterDropdown
          className="kind-dd"
          icon="filter"
          multi
          active={kinds.length < KINDS.length}
          label={kinds.length === KINDS.length ? 'Alle Arten' : kinds.join(', ')}
          options={KINDS.map((k) => ({ value: k, label: k, on: kinds.includes(k) }))}
          onPick={(k) => {
            const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
            setKinds(next.length ? next : [k]);
            setPage(0);
          }}
        />
      </section>
      <div className="stats">
        <div className="stat-card">
          <div>
            <div className="stat-label">Einträge</div>
            <div className="stat-value">{filtered.length.toLocaleString(f.locale)}</div>
            <div className="stat-note">im gewählten Zeitraum</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Dienststunden</div>
            <div className="stat-value">{f.num(dutyHours)} h</div>
            <div className="stat-note">Ø {f.num(people ? dutyHours / people : 0)} h je Mitarbeiter · netto</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Bereitschaftsstunden</div>
            <div className="stat-value">{f.num(standbyHours)} h</div>
            <div className="stat-note">
              {new Set(sbs.map((a) => a.team)).size} Teams · {sbs.length} Einsätze
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Abwesenheitstage</div>
            <div className="stat-value">{abs.length}</div>
            <div className="stat-note">
              {vac} Urlaub · {abs.length - vac} Sonstige
            </div>
          </div>
        </div>
      </div>
      <div className="split-layout no-side">
        <section className="panel flush">
          <div className="panel-toolbar">
            {sel.size ? (
              <>
                <b>{sel.size} ausgewählt</b>
                <button className="btn small push-right" onClick={() => setExp({ rep: 'selection' })}>
                  <Icon name="download" />
                  Auswahl exportieren
                </button>
                <button className="btn small ghost" onClick={() => setSel(new Set())}>
                  Auswahl aufheben
                </button>
              </>
            ) : (
              <>
                <b>Einträge</b>
                <span className="rt-count">{filtered.length.toLocaleString(f.locale)}</span>
                <span className="push-right" />
              </>
            )}
            <label className="rt-selall">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => {
                  const n = new Set(sel);
                  shown.forEach((a) => (e.target.checked ? n.add(a.id) : n.delete(a.id)));
                  setSel(n);
                }}
              />
              Seite auswählen
            </label>
          </div>
          <div className="table-wrap borderless report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th className="cb-col">
                    <input
                      type="checkbox"
                      aria-label="Alle auf dieser Seite auswählen"
                      checked={allChecked}
                      onChange={(e) => {
                        const n = new Set(sel);
                        shown.forEach((a) => (e.target.checked ? n.add(a.id) : n.delete(a.id)));
                        setSel(n);
                      }}
                    />
                  </th>
                  <th>Datum</th>
                  <th>Mitarbeiter</th>
                  <th>Art</th>
                  <th>Dienst</th>
                  <th className="num">Std.</th>
                </tr>
              </thead>
              <tbody>
                {shown.length ? (
                  shown.map((a) => {
                    const k = kindLabel(a);
                    const c = teamColor(a.team);
                    const dd = day(a.date);
                    const h = a.start && a.end && !a.isAbsence ? f.num(a.kind === 'Bereitschaft' ? durationHours(a.start, a.end) : netHours(a), 2) : '';
                    return (
                      <tr key={a.id} className={sel.has(a.id) ? 'is-selected' : ''}>
                        <td className="cb-col rt-cb">
                          <input
                            type="checkbox"
                            aria-label="Auswählen"
                            checked={sel.has(a.id)}
                            onChange={(e) => {
                              const n = new Set(sel);
                              if (e.target.checked) n.add(a.id);
                              else n.delete(a.id);
                              setSel(n);
                            }}
                          />
                        </td>
                        <td className="rt-date">
                          <span className="rt-day">{f.weekdayName(dd, 'short')}</span>
                          <b>{f.fmtIsoDate(a.date)}</b>
                        </td>
                        <td className="rt-person">
                          <span className="person">
                            <Avatar name={a.employee} color={c} size={30} />
                            <span className="rt-name">
                              <b>{a.employee}</b>
                              <small>
                                <Dot color={c} />
                                {a.team}
                              </small>
                            </span>
                          </span>
                        </td>
                        <td className="rt-kind">
                          <span className={`pill kind-${k.toLowerCase()}`}>{k}</span>
                        </td>
                        <td className="rt-shift" data-date={`${f.weekdayName(dd, 'short')} ${f.fmtShort(dd)}`}>
                          <b>{a.shift || k}</b>
                          <small>
                            <Icon name="clock" />
                            {a.start ? tRange(a) : isVariableStandby(a) ? 'variabel' : 'ganztägig'}
                          </small>
                        </td>
                        <td className="num rt-hours">
                          {h ? (
                            <>
                              <b>{h}</b>
                              <small>Std.</small>
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="empty-note">
                      Keine Einträge für diese Filter gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted small">{filtered.length ? `${pg * PAGE + 1}–${Math.min(filtered.length, (pg + 1) * PAGE)} von ${filtered.length.toLocaleString(f.locale)}` : '0 Einträge'}</span>
            <span className="btn-row">
              <button className="btn small" disabled={!pg} aria-label="Vorherige Seite" onClick={() => setPage(pg - 1)}>
                ‹
              </button>
              <button className="btn small" disabled={pg >= pages - 1} aria-label="Nächste Seite" onClick={() => setPage(pg + 1)}>
                ›
              </button>
            </span>
          </div>
        </section>
      </div>
      {exp && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setExp(null)}>
          <div className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
            <div className="export-head">
              <span className="export-head-ic">
                <Icon name="download" />
              </span>
              <div>
                <h2 id="export-title">Exportieren</h2>
                <small>
                  Zeitraum {rangeText} · {filterText}
                </small>
              </div>
              <button type="button" className="icon-btn" aria-label="Schließen" onClick={() => setExp(null)}>
                ×
              </button>
            </div>
            <div className="export-body">
              <div className="export-label">Was möchtest du exportieren?</div>
              <div className="export-list" role="radiogroup">
                {reports
                  .filter((r) => r.id !== 'selection' || sel.size)
                  .map((r) => {
                    const cnt = r.build(srcOf(r.id)).count;
                    return (
                      <button key={r.id} type="button" role="radio" aria-checked={exp.rep === r.id} className={`export-opt ${exp.rep === r.id ? 'on' : ''}`} data-empty={cnt ? undefined : '1'} onClick={() => setExp({ rep: r.id })}>
                        <span className={`export-opt-ic tone-${r.id}`}>
                          <Icon name={r.icon} />
                        </span>
                        <span className="export-opt-text">
                          <b>{r.title}</b>
                          <small>{r.sub}</small>
                        </span>
                        <span className="export-opt-count">
                          {cnt.toLocaleString(f.locale)} {r.unit}
                        </span>
                      </button>
                    );
                  })}
              </div>
              <div className="export-label">Format</div>
              <div className="export-formats" role="radiogroup">
                {(
                  [
                    ['PDF', 'PDF', 'file', 'Zum Lesen & Drucken'],
                    ['XLSX', 'Excel', 'grid', 'Formatiert, mit Summen'],
                    ['CSV', 'CSV', 'download', 'Rohdaten für Importe'],
                  ] as const
                ).map(([v, l, ic, s]) => (
                  <button key={v} type="button" role="radio" aria-checked={fmt === v} className={`export-fmt ${fmt === v ? 'on' : ''}`} onClick={() => setFmt(v)}>
                    <Icon name={ic} />
                    <b>{l}</b>
                    <small>{s}</small>
                  </button>
                ))}
              </div>
              {fmt === 'CSV' && (
                <p className="export-note">
                  <Icon name="alert" />
                  CSV enthält nur die Werte – Farben und Spaltenbreiten kann das Format nicht speichern.
                </p>
              )}
            </div>
            <div className="export-actions">
              <button type="button" className="btn ghost" onClick={() => setExp(null)}>
                Abbrechen
              </button>
              <button type="button" className="btn primary" onClick={() => runExport(exp.rep, fmt)}>
                <Icon name="download" />
                Als {fmt === 'XLSX' ? 'Excel' : fmt} exportieren
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
