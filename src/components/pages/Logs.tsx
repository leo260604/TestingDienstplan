'use client';
/* Rollen & Berechtigungen, Audit Log, Export Audit, Hilfe */
import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../AppProvider';
import { useShell } from '../shell/AppShell';
import { Avatar, Heading, Icon } from '../ui';
import { isoDate, pad2 } from '@/lib/dates';
import { canEdit, adminCaps, absenceTeams, manageableTeams, pagesFor, selfEditAllowed, standbyColorTeams, teamNoteTeams } from '@/lib/access';
import { permsFor, roleLabel } from '@/lib/permissions';
import { canRequestSwap, SWAP_ROLES } from '@/lib/swaps';
import { HELP_SECTIONS, type HelpCaps } from '@/lib/help';
import { safeFileName, saveFile } from '@/lib/export/csv';
import { makePdf, makeXlsx, KIND_HEX } from '@/lib/export/formats';
import { addRole, deleteRole, renameRole, savePermissions } from '@/server/actions/admin';
import { logExport } from '@/server/actions/account';
import { PERM_AREAS, type PermLevel, type RolePermissions } from '@/lib/types';

/* ======================= Rollen & Berechtigungen ======================= */
const PERM_SHORT: Record<string, string> = { Abteilungsleiter: 'Abteilungsl.', Lohnverrechnung: 'Lohnverr.', Bereitschaftsadmin: 'Bereitschaftsadm.' };

export function Roles() {
  const { ctx, data, run, ask, askText, toast } = useApp();
  const editable = canEdit(ctx, 'Team Berechtigungen');
  const [roleSel, setRoleSel] = useState(data.roles.find((r) => r !== 'Admin') || data.roles[0]);
  const base = () => Object.fromEntries(data.roles.map((r) => [r, permsFor(r, data.permissions)])) as Record<string, RolePermissions>;
  const [draft, setDraft] = useState(base);
  const cur = base();
  const changes = data.roles.reduce((s, r) => s + PERM_AREAS.filter((a) => (draft[r] || cur[r])[a] !== cur[r][a]).length, 0);
  return (
    <>
      <Heading
        title="Rollen & Berechtigungen"
        actions={
          editable && (
            <>
              <button
                className="btn"
                onClick={async () => {
                  const v = (await askText(`Name der Kopie von „${roleSel}“:`, roleSel + ' (Kopie)')).trim();
                  if (v) await run(addRole(v, roleSel));
                }}
              >
                <Icon name="copy" />
                Rolle duplizieren
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  const v = (await askText('Name der neuen Rolle:')).trim();
                  if (v) await run(addRole(v));
                }}
              >
                <Icon name="plus" />
                Neue Rolle
              </button>
            </>
          )
        }
      />
      <div className="split-layout left-side">
        <section className="panel roles-list">
          <div className="panel-head">
            <h2>Rollen</h2>
            <span className="pill">{data.roles.length}</span>
          </div>
          {data.roles.map((r) => (
            <div key={r} className={`role-item ${r === roleSel ? 'active' : ''}`} role="button" tabIndex={0} onClick={(e) => !(e.target as HTMLElement).closest('button') && setRoleSel(r)}>
              <span className="role-ic">
                <Icon name="shield" />
              </span>
              <span className="role-txt">
                <b>{roleLabel(r)}</b>
                <small>{data.staff.filter((s) => s.role === r).length} Personen</small>
              </span>
              {r === 'Admin' ? (
                <span className="muted" title="Geschützt">
                  <Icon name="lock" />
                </span>
              ) : (
                editable && (
                  <span className="role-actions">
                    <button
                      className="icon-btn"
                      title="Bearbeiten"
                      aria-label="Rolle umbenennen"
                      onClick={async () => {
                        const v = (await askText('Rollenbezeichnung bearbeiten:', r)).trim();
                        if (v && v !== r) await run(renameRole(r, v));
                      }}
                    >
                      <Icon name="edit" />
                    </button>
                    <button
                      className="icon-btn danger"
                      title="Löschen"
                      aria-label="Rolle löschen"
                      onClick={async () => {
                        const used = data.staff.filter((s) => s.role === r).length;
                        if (used) return toast(`Die Rolle ist noch ${used} Person(en) zugeordnet.`);
                        if (await ask(`Rolle „${r}“ wirklich löschen?`)) await run(deleteRole(r));
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </span>
                )
              )}
            </div>
          ))}
        </section>
        <section className="panel flush perm-card">
          <div className="panel-toolbar">
            <div>
              <b className="title">Berechtigungsmatrix</b>
            </div>
            <div className="perm-legend push-right" aria-label="Legende">
              <span className="perm-leg">
                <span className="perm e static">
                  <Icon name="edit" />
                </span>
                Bearbeiten
              </span>
              <span className="perm-leg">
                <span className="perm r static">
                  <Icon name="eye" />
                </span>
                Lesen
              </span>
              <span className="perm-leg">
                <span className="perm n static">—</span>Kein Zugriff
              </span>
            </div>
            {changes > 0 && (
              <span className="perm-save-bar">
                <span className="pill amber">{changes} Änderungen</span>
                <button className="btn small" onClick={() => setDraft(base())}>
                  Verwerfen
                </button>
                <button
                  className="btn small primary"
                  onClick={async () => {
                    const r = await run(savePermissions(draft));
                    if (r.ok) setDraft(base());
                  }}
                >
                  <Icon name="check" />
                  Speichern
                </button>
              </span>
            )}
          </div>
          <div className="table-wrap borderless perm-table">
            <table>
              <thead>
                <tr>
                  <th>Bereich</th>
                  {data.roles.map((r) => (
                    <th key={r} className={r === roleSel ? 'sel' : ''} title={r}>
                      {PERM_SHORT[r] || roleLabel(r)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERM_AREAS.map((a) => (
                  <tr key={a}>
                    <td>
                      <b>{a}</b>
                    </td>
                    {data.roles.map((r) => {
                      const v = ((draft[r] || cur[r])[a] || 'N') as PermLevel;
                      const locked = r === 'Admin' || a === 'Einstellungen' || !editable;
                      return (
                        <td key={r} className={r === roleSel ? 'sel' : ''}>
                          <button
                            type="button"
                            className={`perm ${v === 'E' ? 'e' : v === 'R' ? 'r' : 'n'} ${v !== cur[r][a] ? 'changed' : ''}`}
                            disabled={locked}
                            title={`${r} · ${a}: ${v === 'E' ? 'Bearbeiten' : v === 'R' ? 'Lesen' : 'Kein Zugriff'}`}
                            onClick={() => {
                              setRoleSel(r);
                              setDraft({ ...draft, [r]: { ...(draft[r] || cur[r]), [a]: v === 'N' ? 'R' : v === 'R' ? 'E' : 'N' } });
                            }}
                          >
                            {v === 'E' ? <Icon name="edit" /> : v === 'R' ? <Icon name="eye" /> : '—'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

/* ======================= Protokoll-Export (Audit / Export Audit) ======================= */
function ExportLogButton({ audit }: { audit: boolean }) {
  const { data, user, f, toast, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const list = audit ? data.auditLog : data.exportLog;
  const go = (fmt: 'PDF' | 'XLSX' | 'CSV') => {
    setOpen(false);
    if (!list.length) return toast('Das Protokoll ist leer.');
    const head = audit ? ['Zeitpunkt', 'Benutzer', 'Rolle', 'Aktion', 'Bereich', 'Titel', 'Objekt', 'Vorher', 'Nachher', 'Details'] : ['Zeitpunkt', 'Benutzer', 'Rolle', 'Bericht', 'Format', 'Zeilen', 'Zeitraum', 'Größe', 'Status'];
    const rows = audit
      ? data.auditLog.map((x) => [f.fmtDateTime(x.ts), x.user, x.role, x.action, x.area, x.title, x.object, x.before, x.after, x.detail])
      : data.exportLog.map((x) => [f.fmtDateTime(x.ts), x.user, x.role, x.report, x.format, x.rows, x.range, fmtSize(x.size), x.status]);
    const title = audit ? 'Audit Log' : 'Export-Protokoll';
    const sub = `${list.length.toLocaleString(f.locale)} Einträge · Stand ${f.fmtDateTime(new Date().getTime())}`;
    const base = safeFileName(audit ? 'Audit Log' : 'Export Audit');
    let size = 0;
    if (fmt === 'CSV') size = saveFile(base + '.csv', new Blob(['﻿' + [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')], { type: 'text/csv' }));
    else if (fmt === 'XLSX') size = saveFile(base + '.xlsx', makeXlsx(title, [head, ...rows], { title, subtitle: sub, intCols: audit ? [] : [5] }));
    else
      size = saveFile(
        base + '.pdf',
        makePdf(title, sub, audit ? head.slice(0, 7).concat('Details') : head, rows.map((r) => (audit ? [...r.slice(0, 7).map(String), String(r[9] || (r[7] || r[8] ? `${r[7] || '—'} → ${r[8] || '—'}` : ''))] : r.map((v) => (typeof v === 'number' ? v.toLocaleString(f.locale) : String(v))))), audit ? [1.6, 1.8, 1.3, 1.1, 1.4, 2.2, 2, 3] : [1.6, 1.8, 1.3, 2.6, 0.9, 0.8, 2.1, 0.9, 1.2], {
          kindCol: audit ? 3 : 8,
          kindOf: (v) => (KIND_HEX[String(v)] ? String(v) : audit ? 'Info' : 'Hinweis'),
          author: user.name,
        }),
      );
    void logExport({ report: title, format: fmt, rows: list.length, status: 'Erfolgreich', size }).then(refresh);
    toast(`Protokoll als ${fmt === 'XLSX' ? 'Excel' : fmt} exportiert.`);
  };
  return (
    <span className="export-log-wrap" style={{ position: 'relative' }}>
      <button className="btn primary" onClick={() => setOpen((o) => !o)}>
        <Icon name="download" />
        {audit ? 'Log exportieren' : 'Protokoll exportieren'}
      </button>
      {open && (
        <span className="duty-actions-menu react-menu">
          {(['PDF', 'XLSX', 'CSV'] as const).map((x) => (
            <button key={x} type="button" onClick={() => go(x)}>
              <Icon name={x === 'PDF' ? 'file' : x === 'XLSX' ? 'grid' : 'download'} />
              {x === 'XLSX' ? 'Excel' : x}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export const fmtSize = (b: number) => (!b ? '—' : b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toLocaleString('de-AT', { maximumFractionDigits: 1 }) + ' MB');
const AREA_ICON: Record<string, string> = { Dienstplan: 'cal', Bereitschaft: 'moon', Dienstzeiten: 'clock', Kontakte: 'users', Teams: 'build', Rollen: 'shield', Berechtigungen: 'shield', Abwesenheit: 'plane', Arbeitsort: 'home', Bereitschaftszeiten: 'clock', Teamfarben: 'sliders' };

/* ======================= Audit Log ======================= */
export function AuditLog() {
  const { data, f } = useApp();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('Alle');
  const [range, setRange] = useState('7');
  const [userF, setUserF] = useState('Alle');
  const [area, setArea] = useState('Alle');
  const [limit, setLimit] = useState(100);
  const log = data.auditLog;
  const [now] = useState(() => Date.now());
  const minTs = range === 'Alle' ? 0 : range === '1' ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : now - +range * 864e5;
  const inRange = log.filter((x) => x.ts >= minTs);
  const list = inRange.filter((x) => (action === 'Alle' || x.action === action) && (userF === 'Alle' || x.user === userF) && (area === 'Alle' || x.area === area) && (!q || JSON.stringify(x).toLowerCase().includes(q.toLowerCase())));
  const users = [...new Set(log.map((x) => x.user))].sort(),
    areas = [...new Set(log.map((x) => x.area))].sort();
  const top = Object.entries(inRange.reduce<Record<string, number>>((m, x) => ((m[x.user] = (m[x.user] || 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  let lastDay = '';
  return (
    <>
      <Heading title="Audit Log" actions={<ExportLogButton audit />} />
      <section className="panel filter-panel">
        <label className="search-field">
          <Icon name="search" />
          <input type="search" placeholder="Suchen in Aktionen, Personen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="form-select" value={range} onChange={(e) => { setRange(e.target.value); setLimit(100); }}>
          <option value="1">Heute</option>
          <option value="7">Letzte 7 Tage</option>
          <option value="30">Letzte 30 Tage</option>
          <option value="Alle">Gesamt</option>
        </select>
        <div className="chip-row">
          {['Alle', 'Erstellt', 'Geändert', 'Gelöscht'].map((a) => (
            <button key={a} type="button" className={`chip ${action === a ? 'active' : ''}`} onClick={() => setAction(a)}>
              {a === 'Alle' ? 'Alle Aktionen' : a}
            </button>
          ))}
        </div>
        <select className="form-select" value={userF} onChange={(e) => setUserF(e.target.value)}>
          <option value="Alle">Alle Benutzer</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <select className="form-select" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="Alle">Alle Bereiche</option>
          {areas.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </section>
      <div className="split-layout narrow-side">
        <section className="panel log-list">
          {list.length ? (
            list.slice(0, limit).map((x) => {
              const d = isoDate(new Date(x.ts));
              const head =
                d !== lastDay ? (
                  <div className="log-day" key={'d' + d}>
                    <b>
                      {d === isoDate(new Date()) ? 'Heute · ' : ''}
                      {f.fmtWithWeekday(new Date(x.ts))}
                    </b>
                    <span className="muted small">{list.filter((y) => isoDate(new Date(y.ts)) === d).length} Ereignisse</span>
                  </div>
                ) : null;
              lastDay = d;
              const t = new Date(x.ts);
              const diff = x.before && x.after ? `${x.before} → ${x.after}` : x.after || x.detail;
              return [
                head,
                <article className="log-entry" key={x.id}>
                  <span className="log-time">
                    {pad2(t.getHours())}:{pad2(t.getMinutes())}
                  </span>
                  <span className={`log-icon act-${x.action.toLowerCase()}`}>
                    <Icon name={AREA_ICON[x.area] || (x.action === 'Gelöscht' ? 'trash' : x.action === 'Erstellt' ? 'plus' : 'edit')} />
                  </span>
                  <div className="log-body">
                    <div className="log-title">
                      <b>{x.title || `${x.area}: ${x.action}`}</b>
                      <span className={`pill act-${x.action.toLowerCase()}`}>{x.action}</span>
                    </div>
                    <div className="log-meta">
                      <span>{x.user}</span> · <span>{x.role}</span> · <span>{x.area}</span>
                      {x.object ? <> · <span>{x.object}</span></> : null}
                    </div>
                    {diff && <code className="diff">{diff}</code>}
                  </div>
                </article>,
              ];
            })
          ) : (
            <div className="empty-note">{log.length ? 'Keine Einträge für diesen Filter.' : 'Noch keine Änderungen protokolliert.'}</div>
          )}
          {list.length > limit && (
            <div className="btn-row center">
              <button className="btn" onClick={() => setLimit(limit + 100)}>
                Weitere {Math.min(100, list.length - limit)} laden
              </button>
            </div>
          )}
        </section>
        <aside className="side-stack">
          <section className="panel">
            <h2>{{ '1': 'Heute', '7': 'Letzte 7 Tage', '30': 'Letzte 30 Tage', Alle: 'Gesamt' }[range]}</h2>
            {['Erstellt', 'Geändert', 'Gelöscht'].map((a) => (
              <div className="stat-line" key={a}>
                <span className={`pill act-${a.toLowerCase()}`}>{a}</span>
                <b>{inRange.filter((x) => x.action === a).length}</b>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Aktivste Benutzer</h2>
            {top.length ? (
              top.map(([u, c]) => (
                <div className="stat-line" key={u}>
                  <Avatar name={u} color="#14A1A9" size={28} />
                  <span className="grow">{u}</span>
                  <b>{c}</b>
                </div>
              ))
            ) : (
              <p className="muted small">Noch keine Aktivität.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

/* ======================= Export Audit ======================= */
export function ExportAudit() {
  const { data, f } = useApp();
  const [fmt, setFmt] = useState('Alle');
  const [status, setStatus] = useState('Alle');
  const [q, setQ] = useState('');
  const log = data.exportLog;
  const [now] = useState(() => Date.now());
  const last30 = log.filter((x) => x.ts >= now - 30 * 864e5),
    prev30 = log.filter((x) => x.ts < now - 30 * 864e5 && x.ts >= now - 60 * 864e5);
  const delta = prev30.length ? Math.round(((last30.length - prev30.length) / prev30.length) * 100) : null;
  const rows30 = last30.reduce((s, x) => s + (+x.rows || 0), 0),
    denied = log.filter((x) => x.status === 'Verweigert').length;
  const fmtCount = log.reduce<Record<string, number>>((m, x) => ((m[x.format] = (m[x.format] || 0) + 1), m), {});
  const topF = Object.entries(fmtCount).sort((a, b) => b[1] - a[1])[0];
  const list = log.filter((x) => (fmt === 'Alle' || x.format === fmt) && (status === 'Alle' || (status === 'Hinweis' ? !['Erfolgreich', 'Verweigert'].includes(x.status) : x.status === status)) && (!q || `${x.report} ${x.user}`.toLowerCase().includes(q.toLowerCase())));
  const FC: Record<string, string> = { CSV: '#3974c6', XLSX: '#1f9a63', PDF: '#d64550', JSON: '#596579' };
  return (
    <>
      <Heading title="Export Audit" actions={<ExportLogButton audit={false} />} />
      <div className="stats">
        <div className="stat-card">
          <div>
            <div className="stat-label">Exporte (30 Tage)</div>
            <div className="stat-value">{last30.length}</div>
            <div className="stat-note">{delta === null ? 'Kein Vormonat zum Vergleich' : `${delta >= 0 ? '+' : ''}${delta} % ggü. Vormonat`}</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Exportierte Zeilen</div>
            <div className="stat-value">{rows30.toLocaleString(f.locale)}</div>
            <div className="stat-note">Ø {last30.length ? Math.round(rows30 / last30.length).toLocaleString(f.locale) : 0} je Export</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Verweigert</div>
            <div className="stat-value">{denied}</div>
            <div className="stat-note">fehlende Berechtigung</div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Häufigstes Format</div>
            <div className="stat-value">{topF ? topF[0] : '—'}</div>
            <div className="stat-note">{topF ? Math.round((topF[1] / log.length) * 100) + ' % aller Exporte' : 'Noch kein Export'}</div>
          </div>
        </div>
      </div>
      <section className="panel flush">
        <div className="panel-toolbar">
          <label className="search-field">
            <Icon name="search" />
            <input type="search" placeholder="Bericht oder Person …" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="chip-row">
            {['Alle', ...Object.keys(fmtCount).sort()].map((x) => (
              <button key={x} type="button" className={`chip ${fmt === x ? 'active' : ''}`} onClick={() => setFmt(x)}>
                {x === 'Alle' ? 'Alle Formate' : x}
              </button>
            ))}
          </div>
          <select className="form-select push-right" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="Alle">Alle Status</option>
            <option value="Erfolgreich">Erfolgreich</option>
            <option value="Verweigert">Verweigert</option>
            <option value="Hinweis">Hinweis</option>
          </select>
        </div>
        <div className="table-wrap borderless">
          <table>
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Benutzer</th>
                <th>Bericht</th>
                <th>Zeitraum</th>
                <th>Größe</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.length ? (
                list.slice(0, 300).map((x) => (
                  <tr key={x.id}>
                    <td className="muted">{f.fmtDateTime(x.ts)}</td>
                    <td>
                      <span className="person">
                        <Avatar name={x.user} color="#14A1A9" size={26} />
                        {x.user}
                      </span>
                    </td>
                    <td className="wrap">
                      <span className="file-cell">
                        <span className="file-badge" style={{ '--c': FC[x.format] || '#596579' } as CSSProperties}>
                          {x.format}
                        </span>
                        <span>
                          <b>{x.report}</b>
                          <small className="muted block">{x.rows.toLocaleString(f.locale)} Zeilen</small>
                        </span>
                      </span>
                    </td>
                    <td className="muted">{x.range || '—'}</td>
                    <td className="muted">{fmtSize(x.size)}</td>
                    <td>
                      <span className={`pill ${x.status === 'Erfolgreich' ? 'act-erfolgreich' : x.status === 'Verweigert' ? 'act-gelöscht' : 'act-hinweis'}`}>{x.status}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-note">
                    {log.length ? 'Keine Einträge für diesen Filter.' : 'Noch keine Exporte. Unter „Berichte / Export“ einen Export starten.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ======================= Hilfe ======================= */
export function Help() {
  const { ctx, data, user } = useApp();
  const shell = useShell();
  const [q, setQ] = useState('');
  const caps: HelpCaps = useMemo(() => {
    const pages = pagesFor(ctx);
    return {
      role: user.role,
      admin: user.role === 'Admin',
      lead: user.role !== 'Mitarbeiter',
      plan: manageableTeams(ctx, 'Dienstplan').length > 0,
      planSb: manageableTeams(ctx, 'Bereitschaft').length > 0,
      selfDuty: data.teams.some((t) => selfEditAllowed(ctx, t.name, 'Dienstplan')),
      selfSb: data.teams.some((t) => selfEditAllowed(ctx, t.name, 'Bereitschaft')),
      swap: SWAP_ROLES.includes(user.role) && canRequestSwap(ctx),
      absence: absenceTeams(ctx).length > 0,
      shifts: manageableTeams(ctx, 'Dienstzeiten').length > 0,
      contactsEdit: canEdit(ctx, 'Kontakte'),
      reports: canEdit(ctx, 'Berichte / Export'),
      adminCaps: adminCaps(ctx),
      sbTimes: user.role === 'Admin',
      sbColors: standbyColorTeams(ctx).length > 0,
      rolesEdit: canEdit(ctx, 'Team Berechtigungen'),
      teamNotes: teamNoteTeams(ctx).length > 0,
      rotDuty: data.settings.features.rotationDuty !== false,
      rotSb: data.settings.features.rotationStandby !== false,
      has: (p) => pages.includes(p),
    };
  }, [ctx, data, user.role]);
  const secs = HELP_SECTIONS.filter((s) => !s.page || caps.has(s.page))
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.when || it.when(caps)) }))
    .filter((s) => s.items.length);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tipOf = (tip: string | ((c: HelpCaps) => string) | undefined) => (typeof tip === 'function' ? tip(caps) : tip || '');
  const hit = (title: string, it: (typeof secs)[0]['items'][0]) => !words.length || words.every((w) => `${title} ${it.t} ${it.s.join(' ')} ${tipOf(it.tip)}`.toLowerCase().includes(w));
  const shown = secs.map((s) => ({ ...s, items: s.items.filter((it) => hit(s.title, it)) })).filter((s) => s.items.length);
  const total = shown.reduce((n, s) => n + s.items.length, 0);
  return (
    <>
      <Heading title="Hilfe" />
      <div className="help-top">
        <label className="search-field help-search">
          <Icon name="search" />
          <input type="search" placeholder="Anleitung suchen, z. B. „Urlaub“ oder „Rotation“ …" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="muted small">
          {total} {words.length ? 'Treffer' : 'Anleitungen'}
        </span>
      </div>
      <div className="help-layout">
        <nav className="help-toc" aria-label="Inhalt der Hilfe">
          {shown.map((s) => (
            <button key={s.id} type="button" className="help-toc-item" onClick={() => document.getElementById('help-' + s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <Icon name={s.icon} />
              <span>{s.title}</span>
              <small>{s.items.length}</small>
            </button>
          ))}
        </nav>
        <div className="help-main">
          {shown.map((s) => (
            <section className="panel help-sec" id={'help-' + s.id} key={s.id}>
              <div className="help-sec-head">
                <span className="ta-mark help-mark">
                  <Icon name={s.icon} />
                </span>
                <div className="help-sec-txt">
                  <h2>{s.title}</h2>
                  <p className="sub">{s.intro}</p>
                </div>
                {s.page && (
                  <button type="button" className="btn small help-open" onClick={() => shell.go(s.page!)}>
                    Seite öffnen
                    <Icon name="chev" />
                  </button>
                )}
              </div>
              <div className="help-items">
                {s.items.map((it) => {
                  const tip = tipOf(it.tip);
                  return (
                    <details className="help-item" key={it.t} open={words.length > 0}>
                      <summary>
                        <span className="help-q">{it.t}</span>
                        <Icon name="down" className="help-chev" />
                      </summary>
                      <ol className="help-steps">
                        {it.s.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ol>
                      {tip && (
                        <p className="help-tip">
                          <Icon name="spark" />
                          <span>{tip}</span>
                        </p>
                      )}
                    </details>
                  );
                })}
              </div>
            </section>
          ))}
          {!shown.length && <div className="empty-note help-empty">Keine Anleitung gefunden. Versuche einen anderen Begriff.</div>}
        </div>
      </div>
    </>
  );
}
