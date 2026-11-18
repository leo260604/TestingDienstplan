'use client';
/* Dienstzeiten: Schichtmodelle pro Team */
import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../AppProvider';
import { ColorChoice, Dot, Field, Heading, Icon, Modal, ModalActions, Picker, TeamFilter, TimeRange } from '../ui';
import { durationHours, hoursOf } from '@/lib/dates';
import { LUNCH_MIN, scaleSegments, shiftHexColor, shiftMulti, SHIFT_SWATCHES, tRange } from '@/lib/entries';
import { currentUserTeamNames, manageableTeams } from '@/lib/access';
import { deleteShiftType, duplicateShiftType, saveShiftType } from '@/server/actions/admin';
import type { ShiftType } from '@/lib/types';

export function ShiftTimes() {
  const { ctx, data, user, run, ask, teamColor } = useApp();
  const editable = manageableTeams(ctx, 'Dienstzeiten');
  const visibleTeams = editable.length ? editable : data.teams.filter((t) => user.role === 'Admin' || currentUserTeamNames(ctx).includes(t.name));
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [edit, setEdit] = useState<Partial<ShiftType> | null>(null);
  const usage = useMemo(() => {
    const u: Record<string, number> = {};
    data.entries.forEach((a) => {
      if (a.kind === 'Dienstplan' && !a.isAbsence) u[a.team + '|' + a.shift] = (u[a.team + '|' + a.shift] || 0) + 1;
    });
    return u;
  }, [data.entries]);
  if (!visibleTeams.length)
    return (
      <>
        <Heading title="Dienstzeiten" />
        <section className="settings-card">
          <p>Für dich sind keine Teams zur Bearbeitung zugeordnet. Bitte wende dich an die Administration.</p>
        </section>
      </>
    );
  const rows = data.shiftTypes
    .filter((x) => visibleTeams.some((t) => t.name === x.team) && (!sel.length || sel.includes(x.team)) && (!q || (x.name + ' ' + x.team).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.team.localeCompare(b.team) || a.start.localeCompare(b.start));
  let last = '';
  return (
    <>
      <Heading
        title="Dienstzeiten"
        actions={
          editable.length > 0 && (
            <button className="btn primary" onClick={() => setEdit({ team: editable.find((t) => sel.includes(t.name))?.name || editable[0].name, start: '06:00', end: '14:12', multi: true, color: '#3974c6' })}>
              <Icon name="plus" />
              Dienstzeit erstellen
            </button>
          )
        }
      />
      <div className="split-layout no-side">
        <section className="panel flush">
          <div className="panel-toolbar">
            <label className="search-field">
              <Icon name="search" />
              <input type="search" placeholder="Dienstzeit suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <TeamFilter teams={visibleTeams.map((t) => ({ name: t.name, color: teamColor(t) }))} selected={sel} onChange={setSel} count={(n) => data.shiftTypes.filter((x) => x.team === n).length} />
            <span className="muted small push-right">{rows.length} Modelle</span>
          </div>
          <div className="table-wrap borderless shift-times-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Zeit</th>
                  <th>Dauer</th>
                  <th className="hide-sm scale-head">
                    <div className="scale-labels">
                      <span>00</span>
                      <span>06</span>
                      <span>12</span>
                      <span>18</span>
                      <span>24</span>
                    </div>
                  </th>
                  <th className="hide-sm">Genutzt</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((x) => {
                    const head =
                      x.team !== last ? (
                        <tr className="group-row" key={'g' + x.team}>
                          <td colSpan={5}>
                            <Dot color={teamColor(x.team)} /> <b>{x.team}</b> <span className="muted">· {rows.filter((r) => r.team === x.team).length} Modelle</span>
                          </td>
                        </tr>
                      ) : null;
                    last = x.team;
                    const canE = editable.some((t) => t.name === x.team);
                    const net = Math.max(0, durationHours(x.start, x.end) * 60 - LUNCH_MIN);
                    const color = shiftHexColor(x.color);
                    const over = hoursOf(x.end) <= hoursOf(x.start);
                    return [
                      head,
                      <tr
                        key={x.id}
                        className={canE ? 'sb-row-edit' : ''}
                        tabIndex={canE ? 0 : undefined}
                        title={canE ? `${x.name} bearbeiten` : undefined}
                        onClick={canE ? () => setEdit(x) : undefined}
                        onKeyDown={canE ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setEdit(x)) : undefined}
                      >
                        <td>
                          <span className="shift-color-tag" style={{ '--shift-color': color } as CSSProperties}>
                            <i />
                            {x.name}
                          </span>
                          {!shiftMulti(x) && (
                            <>
                              {' '}
                              <span className="pill" title="Nur einmal pro Tag und Team">
                                1× pro Tag
                              </span>
                            </>
                          )}
                        </td>
                        <td>
                          {tRange(x, ' – ')}
                          {over && <> <span className="pill">über Mitternacht</span></>}
                        </td>
                        <td>
                          {Math.floor(net / 60)} Std. {Math.round(net % 60)} Min.
                          <small className="muted block">abzgl. {LUNCH_MIN} Min. Mittagspause</small>
                        </td>
                        <td className="hide-sm">
                          <div className="mini-scale">
                            {scaleSegments(x.start, x.end).map(([a, b]) => (
                              <i key={a} style={{ left: `${(a / 24) * 100}%`, width: `${((b - a) / 24) * 100}%`, background: color }} />
                            ))}
                          </div>
                        </td>
                        <td className="hide-sm muted">{usage[x.team + '|' + x.name] || 0}×</td>
                      </tr>,
                    ];
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-note">
                      Für diese Auswahl sind noch keine Dienstzeiten angelegt.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {edit && (
        <ShiftEditor
          key={edit.id || 'new'}
          value={edit}
          onClose={() => setEdit(null)}
          onDuplicate={async (x) => {
            const r = await run(duplicateShiftType(x.id!));
            if (r.ok) setEdit({ ...x, id: r.data?.id, name: x.name + ' (Kopie)' });
          }}
        />
      )}
    </>
  );
}

function ShiftEditor({ value, onClose, onDuplicate }: { value: Partial<ShiftType>; onClose: () => void; onDuplicate: (x: Partial<ShiftType>) => void }) {
  const { ctx, data, run, ask, teamColor } = useApp();
  const editable = manageableTeams(ctx, 'Dienstzeiten');
  const [v, setV] = useState({ id: value.id, team: value.team || editable[0]?.name || '', name: value.name || '', start: value.start || '06:00', end: value.end || '14:12', multi: value.multi !== false, color: shiftHexColor(value.color) });
  const m = Math.max(0, Math.round(durationHours(v.start, v.end) * 60) - LUNCH_MIN);
  return (
    <Modal
      title={v.id ? `${value.name} bearbeiten` : 'Neue Dienstzeit'}
      sub="Steht beim Einteilen als Auswahl zur Verfügung."
      icon="clock"
      headStyle={{ ['--sc' as string]: v.color }}
      className="shift-modal"
      onClose={onClose}
      onSubmit={async () => {
        const r = await run(saveShiftType(v));
        if (r.ok) onClose();
      }}
      footer={
        <ModalActions
          onCancel={onClose}
          left={
            value.id ? (
              <span className="wp-actions-left">
                <button
                  type="button"
                  className="btn ghost danger-text"
                  onClick={async () => {
                    if (!(await ask(`Dienstzeit „${value.name}“ wirklich löschen?`, 'Löschen'))) return;
                    const r = await run(deleteShiftType(value.id!));
                    if (r.ok) onClose();
                  }}
                >
                  <Icon name="trash" />
                  Löschen
                </button>
                <button type="button" className="btn" onClick={() => onDuplicate(value)}>
                  <Icon name="copy" />
                  Duplizieren
                </button>
              </span>
            ) : undefined
          }
        />
      }
    >
      <div className="te-two">
        <Field label="Team">
          <Picker
            value={v.team}
            onChange={(team) => setV({ ...v, team })}
            search="Team suchen …"
            options={editable.map((t) => {
              const k = data.shiftTypes.filter((x) => x.team === t.name).length;
              return { value: t.name, label: t.name, sub: `${t.memberIds.length} Mitglieder · ${k} ${k === 1 ? 'Dienstzeit' : 'Dienstzeiten'}`, pic: 'team', color: teamColor(t) };
            })}
          />
        </Field>
        <Field label="Bezeichnung">
          <input placeholder="z. B. 1A Dienst" required maxLength={60} value={v.name} autoFocus onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
      </div>
      <Field label="Arbeitszeit">
        <TimeRange start={v.start} end={v.end} onStart={(start) => setV({ ...v, start })} onEnd={(end) => setV({ ...v, end })} />
      </Field>
      <div className="wp-summary shift-net">
        <span className="wp-sum-ic">
          <Icon name="clock" />
        </span>
        <div>
          <b>
            {Math.floor(m / 60)} Std. {m % 60} Min.{hoursOf(v.end) <= hoursOf(v.start) ? ' · endet am Folgetag' : ''}
          </b>
          <small>Netto-Arbeitszeit · abzüglich {LUNCH_MIN} Min. fixer Mittagspause</small>
        </div>
      </div>
      <label className="check shift-multi wp-check">
        <input type="checkbox" checked={v.multi} onChange={(e) => setV({ ...v, multi: e.target.checked })} />
        <span>
          <b>Mehrfach am Tag besetzbar</b>
          <small className="muted block">Aus: Dieser Dienst wird pro Tag und Team nur einer Person zugeteilt. Bei „Rotation automatisch planen“ wird jeder Dienst mindestens einmal besetzt.</small>
        </span>
      </label>
      <Field label="Farbe" className="shift-color-field">
        <ColorChoice value={v.color} onChange={(color) => setV({ ...v, color })} swatches={SHIFT_SWATCHES} />
      </Field>
    </Modal>
  );
}
