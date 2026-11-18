'use client';
/* Bereitschaft verwalten: Bereitschaftszeiten (nur Admin). Bereitschaften haben keine eigene Farbe – sie übernehmen die Teamfarbe. */
import { useState, type CSSProperties } from 'react';
import { useApp } from '../AppProvider';
import { Field, Heading, Icon, Meter, Modal, ModalActions, MultiPick, Picker, TimeRange } from '../ui';
import { durationHours, fmtHours, hoursOf, WD_SHORT } from '@/lib/dates';
import {
  isVariableStandby,
  scaleSegments,
  shiftHexColor,
  standbyCoverage,
  standbyDays,
  standbyDaysLabel,
  standbyHol,
  standbyRestricted,
  standbyTimeAllTeams,
  standbyTimeForTeam,
  standbyTimeTeams,
  standbyWdLabel,
  tRange,
} from '@/lib/entries';
import { canView } from '@/lib/access';
import { deleteStandbyTime, saveStandbyTime } from '@/server/actions/admin';
import type { StandbyTime } from '@/lib/types';

const badge = (t: { name: string }) => String(t.name).replace(/^Team\s+/i, '').slice(0, 2).toUpperCase() || 'T';

export function StandbyAdmin() {
  const { ctx, data, user, run, ask, teamColor } = useApp();
  const [edit, setEdit] = useState<StandbyTime | 'new' | null>(null);
  if (!canView(ctx, 'Bereitschaft verwalten')) return <Heading title="Zugriff nicht möglich" />;
  const admin = user.role === 'Admin';
  const times = data.standbyTimes;
  const varCount = times.filter((t) => isVariableStandby(t)).length;
  const cover = standbyCoverage(times);
  const covered = data.teams.filter((t) => times.some((x) => standbyTimeForTeam(x, t.name, data.teams))).length;
  /* Teamweise sortiert, damit die Bereitschaften eines Teams immer zusammenstehen:
     zuerst „Alle Teams“, dann die Teams in ihrer Reihenfolge; innerhalb eines Teams nach Beginn, variable zuletzt */
  const teamRank = (t: StandbyTime) => {
    if (standbyTimeAllTeams(t)) return -1;
    const idx = data.teams.map((x, i) => ((t.teamIds || []).includes(x.id) ? i : 9999));
    return Math.min(9999, ...idx);
  };
  const sorted = [...times].sort(
    (a, b) => teamRank(a) - teamRank(b) || Number(isVariableStandby(a)) - Number(isVariableStandby(b)) || (a.start || '').localeCompare(b.start || '') || a.name.localeCompare(b.name, 'de'),
  );
  return (
    <>
      <Heading
        title="Bereitschaft verwalten"
        actions={
          admin && (
            <button className="btn primary" onClick={() => setEdit('new')}>
              <Icon name="plus" />
              Bereitschaftszeit anlegen
            </button>
          )
        }
      />
      {!admin && (
        <div className="readonly-note">
          <Icon name="eye" />
          Bereitschaftszeiten kann nur ein Admin ändern.
        </div>
      )}
      <div className="stats sb-stats">
        <div className="stat-card">
          <div>
            <div className="stat-label">Bereitschaftszeiten</div>
            <div className="stat-value">{times.length}</div>
            <div className="stat-note">
              {times.length - varCount} fix · {varCount} variabel
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Teams mit Bereitschaft</div>
            <div className="stat-value">
              {covered} / {data.teams.length}
            </div>
            <Meter pct={data.teams.length ? (covered / data.teams.length) * 100 : 0} warn={covered < data.teams.length} />
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Tagesabdeckung</div>
            <div className="stat-value">{Math.round(cover * 10) / 10} / 24 Std.</div>
            <Meter pct={(cover / 24) * 100} warn={cover < 24} />
          </div>
        </div>
      </div>
      <section className="panel flush sb-times-panel">
        <div className="panel-toolbar sb-toolbar">
          <div>
            <h2>Bereitschaftszeiten</h2>
          </div>
        </div>
        {times.length ? (
          <div className="table-wrap borderless shift-times-table-wrap">
            <table className="sb-times-table">
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Art</th>
                  <th>Zeit</th>
                  <th>Dauer</th>
                  <th>Wochentage</th>
                  <th>Teams</th>
                  <th className="hide-sm scale-head">
                    <div className="scale-labels">
                      <span>00</span>
                      <span>06</span>
                      <span>12</span>
                      <span>18</span>
                      <span>24</span>
                    </div>
                  </th>
                  {admin && <th>Aktionen</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => {
                  const vari = isVariableStandby(t);
                  const list = standbyTimeTeams(t, data.teams);
                  /* Bereitschaften haben keine eigene Farbe – sie übernehmen die Teamfarbe */
                  const c = list.length === 1 ? teamColor(list[0]) : '#159da8';
                  return (
                    <tr key={t.id}>
                      <td>
                        <span className="shift-color-tag" style={{ '--shift-color': c } as CSSProperties}>
                          <i />
                          {t.name}
                        </span>
                      </td>
                      <td>{vari ? <span className="pill sb-type var">Variabel</span> : <span className="pill sb-type fix">Fix</span>}</td>
                      <td>
                        {vari ? (
                          <span className="muted">Ohne feste Uhrzeit</span>
                        ) : (
                          <>
                            {t.start} – {t.end}
                            {hoursOf(t.end) <= hoursOf(t.start) && <> <span className="pill">über Mitternacht</span></>}
                          </>
                        )}
                      </td>
                      <td>{vari ? <span className="muted">—</span> : fmtHours(durationHours(t.start, t.end))}</td>
                      <td>
                        <span className={`pill sb-days ${standbyRestricted(t) ? 'part' : ''}`}>{standbyDaysLabel(t)}</span>
                      </td>
                      <td>
                        {standbyTimeAllTeams(t) ? (
                          <span className="pill sb-all-teams">Alle Teams</span>
                        ) : !list.length ? (
                          <span className="muted">Kein Team</span>
                        ) : (
                          <span className="sb-team-names">{list.map((x) => x.name).join(', ')}</span>
                        )}
                      </td>
                      <td className="hide-sm">
                        <div className={`mini-scale${vari ? ' is-variable' : ''}`}>
                          {!vari &&
                            scaleSegments(t.start, t.end).map(([a, b]) => (
                              <i key={a} style={{ left: `${(a / 24) * 100}%`, width: `${((b - a) / 24) * 100}%`, background: c }} />
                            ))}
                        </div>
                      </td>
                      {admin && (
                        <td className="nowrap row-actions">
                          <button className="icon-btn" type="button" title="Bearbeiten" aria-label={`${t.name} bearbeiten`} onClick={() => setEdit(t)}>
                            <Icon name="edit" />
                          </button>
                          <button className="icon-btn danger" type="button" title="Löschen" aria-label={`${t.name} löschen`} onClick={async () => (await ask(`Bereitschaftszeit „${t.name}“ löschen? Bestehende Bereitschaftseinträge bleiben erhalten.`, 'Löschen')) && run(deleteStandbyTime(t.id))}>
                            <Icon name="trash" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-note sb-empty">{admin ? 'Noch keine Bereitschaftszeiten. Lege die erste an und wähle die Teams, die sie haben sollen.' : 'Es sind noch keine Bereitschaftszeiten angelegt.'}</div>
        )}
      </section>
      {edit && <StandbyTimeEditor value={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function StandbyTimeEditor({ value, onClose }: { value: StandbyTime | null; onClose: () => void }) {
  const { data, run, teamColor } = useApp();
  const [name, setName] = useState(value?.name || '');
  const [type, setType] = useState<'fix' | 'variabel'>(value && isVariableStandby(value) ? 'variabel' : 'fix');
  const [start, setStart] = useState(value?.start || '');
  const [end, setEnd] = useState(value?.end || '');
  const [days, setDays] = useState<number[]>(standbyDays(value || undefined));
  const [hol, setHol] = useState(standbyHol(value || undefined));
  const [teamIds, setTeamIds] = useState<string[]>(value ? standbyTimeTeams(value, data.teams).map((t) => t.id) : []);
  const vr = type === 'variabel';
  /* Gleicher Name ist für verschiedene Teams erlaubt – nur innerhalb eines Teams muss er eindeutig sein */
  const nameClash = (() => {
    const nm = name.trim().toLowerCase();
    if (!nm || !teamIds.length) return '';
    const all = teamIds.length === data.teams.length;
    const other = data.standbyTimes.find((t) => t.id !== value?.id && t.name.toLowerCase() === nm && (all || standbyTimeAllTeams(t) || teamIds.some((id) => (t.teamIds || []).includes(id))));
    if (!other) return '';
    const both = data.teams.filter((x) => teamIds.includes(x.id) && (all || standbyTimeAllTeams(other) || (other.teamIds || []).includes(x.id)));
    return `${both.map((x) => x.name).join(', ')} ${both.length === 1 ? 'hat' : 'haben'}`;
  })();
  /* Keine eigene Farbe: Anzeige in der Teamfarbe (bei genau einem Team), gespeichert bleibt der bisherige Wert */
  const color = teamIds.length === 1 ? teamColor(data.teams.find((t) => t.id === teamIds[0])) : '#159da8';
  const keepColor = shiftHexColor(value?.color || '#159da8');
  const problem = !name.trim()
    ? 'Bitte eine Bezeichnung eingeben.'
    : !days.length && !hol
      ? 'Bitte mindestens einen Wochentag oder Feiertage auswählen.'
      : nameClash
        ? `${nameClash} bereits eine Bereitschaft mit diesem Namen.`
        : !teamIds.length
          ? 'Bitte mindestens ein Team auswählen.'
          : !vr && (!start || !end)
            ? 'Bitte Beginn und Ende angeben.'
            : !vr && start === end
              ? 'Beginn und Ende dürfen nicht gleich sein.'
              : '';
  const over = !!start && !!end && hoursOf(end) <= hoursOf(start);
  return (
    <Modal
      title={value ? `${value.name} bearbeiten` : 'Bereitschaftszeit anlegen'}
      sub={value ? 'Bestehende Bereitschaftseinträge bleiben unverändert.' : 'Steht beim Einteilen der Bereitschaft für die gewählten Teams zur Auswahl.'}
      icon="clock"
      headStyle={{ background: color, color: '#fff', boxShadow: `0 6px 16px -6px ${color}` }}
      className="form-dialog sb-time-modal"
      onClose={onClose}
      onSubmit={async () => {
        const r = await run(saveStandbyTime({ id: value?.id, name, type, start, end, color: keepColor, days, hol, teamIds }));
        if (r.ok) onClose();
      }}
      footer={<ModalActions onCancel={onClose} okLabel={value ? 'Speichern' : 'Bereitschaftszeit anlegen'} disabled={!!problem} />}
    >
      <div className="sbt-grid">
        <div className="sbt-col">
          <Field label="Bezeichnung">
            <input maxLength={60} autoComplete="off" placeholder="z. B. Nachtbereitschaft" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </Field>
          <MultiPick
            label="Teams mit dieser Bereitschaft"
            items={data.teams.map((t) => ({ value: t.id, label: t.name, color: teamColor(t), small: t.memberIds.length }))}
            selected={teamIds}
            onChange={setTeamIds}
            allLabel="Alle Teams"
            emptyLabel="Teams auswählen …"
          />
          <small className={`wp-note sb-team-note ${!teamIds.length && name ? 'bad' : ''}`}>
            {!teamIds.length ? 'Nur die gewählten Teams können diese Bereitschaft einteilen.' : teamIds.length === data.teams.length ? 'Alle Teams ausgewählt – gilt auch für später angelegte Teams.' : `${teamIds.length} von ${data.teams.length} Teams können diese Bereitschaft einteilen.`}
          </small>
          <Field label="Art der Bereitschaft">
            <Picker
              value={type}
              onChange={(v) => setType(v as 'fix' | 'variabel')}
              options={[
                { value: 'fix', label: 'Fix', sub: 'Mit fester Uhrzeit (Beginn – Ende)', pic: 'icon', icon: 'clock' },
                { value: 'variabel', label: 'Variabel', sub: 'Uhrzeit wird beim Einteilen eingegeben', pic: 'icon', icon: 'refresh', color: '#9b69c8' },
              ]}
            />
          </Field>
          {!vr && (
            <Field label="Zeitraum">
              <TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
            </Field>
          )}
        </div>
        <div className="sbt-col">
          <Field label="Mögliche Tage" note={!days.length && !hol ? 'Bitte mindestens einen Wochentag oder Feiertage auswählen.' : days.length === 7 && hol ? 'Kann an jedem Tag eingetragen werden.' : `Eintragbar an: ${days.length ? standbyWdLabel(days) : '—'}${hol ? ' sowie an Feiertagen (Mo–Fr)' : ''}.`}>
            <div className="wd-chips">
              {WD_SHORT.map((d, i) => (
                <label className="wd-chip" key={d}>
                  <input type="checkbox" checked={days.includes(i)} onChange={(e) => setDays(e.target.checked ? [...days, i].sort() : days.filter((x) => x !== i))} />
                  <span>{d}</span>
                </label>
              ))}
              <label className="wd-chip wd-hol" title="An gesetzlichen Feiertagen (Österreich)">
                <input type="checkbox" checked={hol} onChange={(e) => setHol(e.target.checked)} />
                <span>Feiertage</span>
              </label>
            </div>
          </Field>
          <div className="wp-summary sb-time-sum">
            <span className="wp-sum-ic">
              <Icon name="clock" />
            </span>
            <div className="sb-sum-txt">
              <b>{vr ? 'Variable Bereitschaft' : start && end && start !== end ? fmtHours(durationHours(start, end)) + (over ? ' · über Mitternacht' : '') : 'Uhrzeit eingeben'}</b>
              <small className={problem && name ? 'bad' : ''}>{problem && name ? problem : vr ? 'Ohne feste Uhrzeit – sie wird erst beim Einteilen eingegeben.' : over ? `Endet am Folgetag um ${end} Uhr.` : 'Innerhalb eines Tages.'}</small>
              <div className={`mini-scale ${vr ? 'is-variable' : ''}`}>
                {!vr &&
                  start &&
                  end &&
                  start !== end &&
                  scaleSegments(start, end).map(([a, b]) => <i key={a} style={{ left: `${(a / 24) * 100}%`, width: `${((b - a) / 24) * 100}%`, background: color }} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <span hidden>{tRange({ start, end })}</span>
    </Modal>
  );
}

