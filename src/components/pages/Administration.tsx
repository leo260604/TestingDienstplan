'use client';
/* Administration: Abteilungen, Teams, Verantwortliche, Mitglieder und Teamregeln */
import { useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../AppProvider';
import { Avatar, ColorChoice, Field, Heading, Icon, Meter, Modal, ModalActions, Picker, Segmented, Toggle } from '../ui';
import { adminCaps, adminTeams, canView, teamSettings } from '@/lib/access';
import { freeTeamColors } from '@/lib/colors';
import { roleLabel, visibleRole } from '@/lib/permissions';
import { createTeam, deleteDepartment, deleteTeam, saveDepartment, saveTeam } from '@/server/actions/admin';
import type { Department, SelfMode, Team, TeamSettings } from '@/lib/types';

const mark = (name: string) => String(name).replace(/^Team\s+/, '').slice(0, 2).toUpperCase() || 'T';

export function Administration() {
  const { ctx, data, user, teamColor } = useApp();
  const params = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'complete' | 'open'>('all');
  const [q, setQ] = useState('');
  const [openTeam, setOpenTeam] = useState<string | null>(() => params.get('team'));
  const [dept, setDept] = useState<Department | 'new' | null>(null);
  const [create, setCreate] = useState(false);
  if (!canView(ctx, 'Administration')) return <Heading title="Administration" />;
  const caps = adminCaps(ctx);
  const mine = adminTeams(ctx);
  if (!mine.length)
    return (
      <>
        <Heading title="Administration" />
        <div className="empty-note">Dir ist derzeit kein Team als Teamleitung oder Stellvertretung zugeordnet.</div>
      </>
    );
  const members = new Set(mine.flatMap((t) => t.memberIds));
  const withLead = mine.filter((t) => t.leaderId).length;
  const swapOn = mine.filter((t) => teamSettings(t).swap).length;
  const selfOn = mine.filter((t) => {
    const s = teamSettings(t);
    return s.selfDuty !== 'none' || s.selfStandby !== 'none';
  }).length;
  const ql = q.toLowerCase();
  const list = mine.filter((t) => {
    if (filter === 'complete' && !t.leaderId) return false;
    if (filter === 'open' && t.leaderId) return false;
    return !ql || t.name.toLowerCase().includes(ql) || data.staff.some((p) => t.memberIds.includes(p.id) && p.name.toLowerCase().includes(ql));
  });
  const depts = user.role === 'Admin' || (user.role === 'Abteilungsleiter' && caps.all) ? data.departments : user.role === 'Abteilungsleiter' ? data.departments.filter((d) => d.headId === user.id) : [];
  const deptOf = (t: Team) => data.departments.find((d) => d.teamIds.includes(t.id));
  const person = (id: string, label: string) => {
    const p = data.staff.find((x) => x.id === id);
    return (
      <div className="ta-person">
        {p ? <Avatar name={p.name} size={26} /> : <span className="pp-none">–</span>}
        <span>
          <small>{label}</small>
          <b className={p ? '' : 'muted'}>{p ? p.name : 'nicht besetzt'}</b>
        </span>
      </div>
    );
  };
  const badges = (t: Team) => {
    const st = teamSettings(t);
    const lbl = (m: SelfMode) => (m === 'all' ? 'alle' : 'ausgewählte');
    return (
      <>
        <span className={`ta-badge ${st.swap ? 'on' : 'off'}`}>
          <Icon name="refresh" />
          Tausch {st.swap ? 'an' : 'aus'}
        </span>
        {st.selfDuty !== 'none' && (
          <span className="ta-badge on">
            <Icon name="cal" />
            Dienste: {lbl(st.selfDuty)}
          </span>
        )}
        {st.selfStandby !== 'none' && (
          <span className="ta-badge on">
            <Icon name="moon" />
            Bereitschaft: {lbl(st.selfStandby)}
          </span>
        )}
      </>
    );
  };
  const card = (t: Team) => {
    const mem = data.staff.filter((p) => t.memberIds.includes(p.id));
    const color = teamColor(t);
    const complete = !!t.leaderId;
    return (
      <button key={t.id} type="button" className="ta-card" style={{ '--team': color } as CSSProperties} onClick={() => setOpenTeam(t.id)}>
        <span className="ta-card-top">
          <span className="ta-mark">{mark(t.name)}</span>
          <span className="ta-title">
            <b>{t.name}</b>
            <small>
              {mem.length} {mem.length === 1 ? 'Mitglied' : 'Mitglieder'}
              {deptOf(t) ? ` · ${deptOf(t)!.name}` : ''}
            </small>
          </span>
          <span className={`team-status ${complete ? 'complete' : 'incomplete'}`}>{complete ? 'Vollständig' : 'Teamleitung fehlt'}</span>
        </span>
        <span className="ta-people one">{person(t.leaderId, 'Teamleitung')}</span>
        <span className="ta-badges">{badges(t)}</span>
        <span className="ta-foot">
          <span className="avatar-stack">
            {mem.slice(0, 7).map((p) => (
              <Avatar key={p.id} name={p.name} color={color} size={26} />
            ))}
            {mem.length > 7 && <span className="more">+{mem.length - 7}</span>}
          </span>
          <span className="ta-edit">
            {caps.settings ? 'Bearbeiten' : 'Ansehen'}
            <Icon name="chev" />
          </span>
        </span>
      </button>
    );
  };
  const grouped = depts.length > 0;
  return (
    <>
      <Heading
        title="Administration"
        actions={
          <>
            {caps.dept && (
              <button className="btn" onClick={() => setDept('new')}>
                <Icon name="build" />
                Abteilung anlegen
              </button>
            )}
            {caps.create && (
              <button className="btn primary" onClick={() => setCreate(true)}>
                <Icon name="plus" />
                Team anlegen
              </button>
            )}
          </>
        }
      />
      <div className="stats ta-stats">
        <div className="stat-card">
          <div>
            <div className="stat-label">{caps.all ? 'Teams' : 'Deine Teams'}</div>
            <div className="stat-value">{mine.length}</div>
            <div className="stat-note">
              {members.size} Mitglieder{data.departments.length ? ` · ${data.departments.length} ${data.departments.length === 1 ? 'Abteilung' : 'Abteilungen'}` : ''}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Teamleitung besetzt</div>
            <div className="stat-value">
              {withLead} / {mine.length}
            </div>
            <Meter pct={(withLead / mine.length) * 100} warn={withLead < mine.length} />
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Diensttausch aktiv</div>
            <div className="stat-value">
              {swapOn} / {mine.length}
            </div>
            <Meter pct={(swapOn / mine.length) * 100} />
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Selbst eintragen</div>
            <div className="stat-value">{selfOn}</div>
            <div className="stat-note">{selfOn === 1 ? 'Team erlaubt' : 'Teams erlauben'} eigene Einträge</div>
          </div>
        </div>
      </div>
      <div className="list-toolbar ta-toolbar">
        <label className="search-field">
          <Icon name="search" />
          <input type="search" placeholder="Team oder Person suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chip-row">
          {(
            [
              ['all', `Alle · ${mine.length}`],
              ['complete', `Vollständig · ${withLead}`],
              ['open', `Teamleitung fehlt · ${mine.length - withLead}`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {grouped ? (
        <>
          {depts.map((d) => {
            const ts = list.filter((t) => d.teamIds.includes(t.id));
            if (!ts.length && (q || filter !== 'all')) return null;
            const head = data.staff.find((p) => p.id === d.headId);
            return (
              <section key={d.id} className="dept-group" style={{ '--dept': d.color } as CSSProperties}>
                <div className="dept-head">
                  <span className="dept-ic">
                    <Icon name="build" />
                  </span>
                  <div className="dept-title">
                    <b>{d.name}</b>
                    <small>
                      {d.teamIds.length} Teams · {new Set(data.teams.filter((t) => d.teamIds.includes(t.id)).flatMap((t) => t.memberIds)).size} Mitglieder
                    </small>
                  </div>
                  <div className="dept-lead">
                    {head ? <Avatar name={head.name} color={d.color} size={28} /> : <span className="pp-none">–</span>}
                    <span>
                      <small>Abteilungsleitung</small>
                      <b className={head ? '' : 'muted'}>{head ? head.name : 'nicht besetzt'}</b>
                    </span>
                  </div>
                  {caps.dept && (
                    <button type="button" className="btn small" onClick={() => setDept(d)}>
                      <Icon name="edit" />
                      Bearbeiten
                    </button>
                  )}
                </div>
                <div className="ta-grid">{ts.length ? ts.map(card) : <div className="empty-note">Dieser Abteilung sind noch keine Teams zugeordnet.</div>}</div>
              </section>
            );
          })}
          {caps.all && list.some((t) => !deptOf(t)) && (
            <section className="dept-group dept-none">
              <div className="dept-head">
                <span className="dept-ic">
                  <Icon name="users" />
                </span>
                <div className="dept-title">
                  <b>Ohne Abteilung</b>
                  <small>{list.filter((t) => !deptOf(t)).length} Teams</small>
                </div>
              </div>
              <div className="ta-grid">{list.filter((t) => !deptOf(t)).map(card)}</div>
            </section>
          )}
        </>
      ) : (
        <>
          {caps.dept && (
            <div className="dept-hint">
              <Icon name="build" />
              <div>
                <b>Abteilungen</b>
                <small>Fasse Teams zu Abteilungen zusammen und bestimme jeweils eine Abteilungsleitung.</small>
              </div>
              <button type="button" className="btn" onClick={() => setDept('new')}>
                <Icon name="plus" />
                Abteilung anlegen
              </button>
            </div>
          )}
          <div className="ta-grid">{list.length ? list.map(card) : <div className="empty-note">Keine Teams gefunden.</div>}</div>
        </>
      )}
      {openTeam && mine.some((t) => t.id === openTeam) && <TeamEditor team={mine.find((t) => t.id === openTeam)!} onClose={() => setOpenTeam(null)} />}
      {dept && <DeptEditor dept={dept === 'new' ? null : dept} onClose={() => setDept(null)} />}
      {create && <CreateTeam onClose={() => setCreate(false)} onCreated={(id) => { setCreate(false); setOpenTeam(id); }} />}
    </>
  );
}

function CreateTeam({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { data, run, teamColor } = useApp();
  const others = data.teams.map((t) => ({ id: t.id, color: teamColor(t) }));
  const swatches = freeTeamColors(others);
  const [name, setName] = useState('');
  const [color, setColor] = useState(swatches[0] || '#14a1a9');
  const [dept, setDept] = useState('');
  const dup = data.teams.some((t) => t.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <Modal
      title="Neues Team anlegen"
      sub="Danach legst du Mitglieder, Teamleitung und Stellvertretung fest."
      icon="users"
      headStyle={{ background: color, color: '#fff' }}
      className="form-dialog nt-modal"
      onClose={onClose}
      onSubmit={async () => {
        const r = await run(createTeam({ name, color, departmentId: dept || undefined }));
        if (r.ok && r.data) onCreated(r.data.id);
      }}
      footer={<ModalActions onCancel={onClose} okLabel="Team anlegen" disabled={!name.trim() || dup} />}
    >
      <Field label="Teamname" note={dup ? 'Ein Team mit diesem Namen existiert bereits.' : 'Der Name erscheint im Dienstplan, in der Bereitschaft und in den Filtern.'}>
        <input maxLength={60} autoComplete="off" placeholder="z. B. Team Ost" required value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Teamfarbe">
        <ColorChoice value={color} onChange={setColor} swatches={swatches} />
      </Field>
      {data.departments.length > 0 && (
        <Field label={<>Abteilung <span className="muted">(optional)</span></>}>
          <Picker value={dept} onChange={setDept} noneLabel="Keine Abteilung" options={data.departments.map((d) => ({ value: d.id, label: d.name, sub: `${d.teamIds.length} Teams`, pic: 'icon', icon: 'build', color: d.color }))} />
        </Field>
      )}
    </Modal>
  );
}

function TeamEditor({ team, onClose }: { team: Team; onClose: () => void }) {
  const { ctx, data, user, run, ask, teamColor } = useApp();
  const caps = adminCaps(ctx);
  const st = teamSettings(team);
  const [tab, setTab] = useState<'general' | 'members' | 'rules'>('general');
  const [d, setD] = useState({ name: team.name, color: teamColor(team), memberIds: [...team.memberIds], leaderId: team.leaderId, deputyId: team.deputyId, settings: { ...st } as TeamSettings });
  const [mq, setMq] = useState('');
  const others = data.teams.map((t) => ({ id: t.id, color: teamColor(t) }));
  const mem = data.staff.filter((p) => d.memberIds.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const people = [...data.staff].sort((a, b) => Number(d.memberIds.includes(b.id)) - Number(d.memberIds.includes(a.id)) || a.name.localeCompare(b.name, 'de')).filter((p) => !mq || p.name.toLowerCase().includes(mq.toLowerCase()));
  const setS = (patch: Partial<TeamSettings>) => setD({ ...d, settings: { ...d.settings, ...patch } });
  const toggleMember = (id: string, on: boolean) => {
    const p = data.staff.find((x) => x.id === id);
    const memberIds = on ? [...d.memberIds, id] : d.memberIds.filter((x) => x !== id);
    let { leaderId, deputyId } = d;
    if (!on && leaderId === id) leaderId = '';
    if (!on && deputyId === id) deputyId = '';
    if (on && p?.role === 'Teamleiter' && !leaderId) leaderId = id;
    if (on && p?.role === 'Deputy' && !deputyId) deputyId = id;
    setD({ ...d, memberIds, leaderId, deputyId });
  };
  return (
    <div className="modal-backdrop app-dialog" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal te-modal" role="dialog" aria-modal="true" style={{ '--team': d.color } as CSSProperties}>
        <div className="te-head">
          <span className="ta-mark">{mark(d.name)}</span>
          <div>
            <h2>{d.name}</h2>
            <p className="small muted">
              {d.memberIds.length} Mitglieder · Teamleitung: {data.staff.find((p) => p.id === d.leaderId)?.name || '—'}
            </p>
          </div>
          <button className="icon-btn" type="button" aria-label="Schließen" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="te-tabs" role="tablist">
          {(
            [
              ['general', 'Allgemein'],
              ['members', 'Mitglieder'],
              ['rules', 'Teamregeln'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {l}
              {k === 'members' && <span className="te-n">{d.memberIds.length}</span>}
            </button>
          ))}
        </div>
        <div className="te-body">
          {tab === 'general' && (
            <div className="te-sec">
              <Field label="Teamname">
                <input value={d.name} maxLength={60} disabled={!caps.structure} onChange={(e) => setD({ ...d, name: e.target.value })} />
              </Field>
              <Field label="Teamfarbe">{caps.color ? <ColorChoice value={d.color} onChange={(color) => setD({ ...d, color })} swatches={freeTeamColors(others, team.id).concat(d.color).slice(0, 11)} /> : <span className="muted">{d.color}</span>}</Field>
              <div className="te-two">
                <Field label="Teamleitung">
                  <Picker value={d.leaderId} onChange={(leaderId) => setD({ ...d, leaderId })} disabled={!caps.structure} noneLabel="Nicht besetzt" options={mem.map((p) => ({ value: p.id, label: p.name, sub: roleLabel(visibleRole(p.role, user.role)), pic: 'person' }))} />
                </Field>
                <Field label="Stellvertretung">
                  <Picker value={d.deputyId} onChange={(deputyId) => setD({ ...d, deputyId })} disabled={!caps.structure} noneLabel="Nicht besetzt" options={mem.filter((p) => p.id !== d.leaderId).map((p) => ({ value: p.id, label: p.name, sub: roleLabel(visibleRole(p.role, user.role)), pic: 'person' }))} />
                </Field>
              </div>
              <small className="muted">{caps.structure ? 'Teamleitung und Stellvertretung werden aus den Mitgliedern gewählt. Wer mit der Rolle „Teamleiter“ bzw. „Stellvertretung“ als Mitglied hinzugefügt wird, übernimmt diese Funktion automatisch.' : 'Name, Verantwortliche und Mitglieder ändert die Administration.'}</small>
            </div>
          )}
          {tab === 'members' && (
            <div className="te-sec">
              <div className="te-mhead">
                <label className="team-dd-search">
                  <Icon name="search" />
                  <input type="search" placeholder="Mitarbeiter suchen …" value={mq} onChange={(e) => setMq(e.target.value)} />
                </label>
                <span className="pill teal">{d.memberIds.length} im Team</span>
              </div>
              <div className={`ts-list te-mlist ${caps.structure ? '' : 'te-ro'}`}>
                {(caps.structure ? people : mem).map((p) => {
                  const on = d.memberIds.includes(p.id);
                  const other = data.teams.filter((o) => o.id !== team.id && o.memberIds.includes(p.id)).map((o) => o.name).join(', ');
                  const role = d.leaderId === p.id ? 'Teamleitung' : d.deputyId === p.id ? 'Stellvertretung' : '';
                  return (
                    <label className="ts-person" key={p.id}>
                      {caps.structure && <input type="checkbox" checked={on} onChange={(e) => toggleMember(p.id, e.target.checked)} />}
                      {caps.structure && (
                        <span className="swap-check-box">
                          <Icon name="check" />
                        </span>
                      )}
                      <Avatar name={p.name} color={d.color} size={28} />
                      <span className="pp-txt">
                        <b>{p.name}</b>
                        <small>
                          {roleLabel(p.role)}
                          {other ? ' · auch in ' + other : ''}
                        </small>
                      </span>
                      {role && <em className="pp-badge">{role}</em>}
                    </label>
                  );
                })}
              </div>
              {!caps.structure && (
                <small className="muted">
                  <Icon name="lock" /> Mitglieder kann nur die Administration (Admin/Abteilungsleitung) ändern.
                </small>
              )}
            </div>
          )}
          {tab === 'rules' && (
            <div className="te-sec">
              <div className="setting-row">
                <div>
                  <b>Diensttausch</b>
                  <small>Mitglieder können Dienste untereinander tauschen (mit Bestätigung).</small>
                </div>
                <Toggle on={d.settings.swap} onChange={(swap) => setS({ swap })} />
              </div>
              <SelfRule label="Dienste selbst eintragen" mode={d.settings.selfDuty} ids={d.settings.selfDutyIds} onMode={(selfDuty) => setS({ selfDuty })} onIds={(selfDutyIds) => setS({ selfDutyIds })} mem={mem} color={d.color} editable={caps.settings} />
              <SelfRule label="Bereitschaft selbst eintragen" mode={d.settings.selfStandby} ids={d.settings.selfStandbyIds} onMode={(selfStandby) => setS({ selfStandby })} onIds={(selfStandbyIds) => setS({ selfStandbyIds })} mem={mem} color={d.color} editable={caps.settings} />
            </div>
          )}
        </div>
        <div className="te-foot">
          {caps.remove ? (
            <button
              type="button"
              className="btn ghost danger-text"
              onClick={async () => {
                if (await ask(`Team „${team.name}“ mit allen Einträgen löschen?`, 'Löschen')) {
                  const r = await run(deleteTeam(team.id));
                  if (r.ok) onClose();
                }
              }}
            >
              <Icon name="trash" />
              Team löschen
            </button>
          ) : (
            <span />
          )}
          <span className="wp-actions-right">
            <button type="button" className="btn" onClick={onClose}>
              Abbrechen
            </button>
            {caps.settings && (
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  const r = await run(saveTeam({ id: team.id, ...d }));
                  if (r.ok) onClose();
                }}
              >
                <Icon name="check" />
                Speichern
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function SelfRule({ label, mode, ids, onMode, onIds, mem, color, editable }: { label: string; mode: SelfMode; ids: string[]; onMode: (m: SelfMode) => void; onIds: (ids: string[]) => void; mem: { id: string; name: string }[]; color: string; editable: boolean }) {
  return (
    <div className="te-rule">
      <div className="setting-row">
        <div>
          <b>{label}</b>
          <small>Wer darf eigene Einträge selbst anlegen und ändern?</small>
        </div>
        <Segmented value={mode} options={[['none', 'Niemand'], ['all', 'Alle'], ['selected', 'Ausgewählte']]} onChange={onMode} />
      </div>
      {mode === 'selected' && (
        <div className="ts-list">
          {mem.map((p) => (
            <label className="ts-person" key={p.id}>
              <input type="checkbox" checked={ids.includes(p.id)} disabled={!editable} onChange={(e) => onIds(e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id))} />
              <span className="swap-check-box">
                <Icon name="check" />
              </span>
              <Avatar name={p.name} color={color} size={26} />
              <span className="pp-txt">
                <b>{p.name}</b>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function DeptEditor({ dept, onClose }: { dept: Department | null; onClose: () => void }) {
  const { data, run, ask, teamColor } = useApp();
  const [d, setD] = useState({ name: dept?.name || '', headId: dept?.headId || '', color: dept?.color || '#0068A8', teamIds: dept ? [...dept.teamIds] : [] });
  const heads = data.staff.filter((p) => p.role === 'Abteilungsleiter' || p.id === d.headId).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return (
    <Modal
      title={dept ? dept.name || 'Abteilung' : 'Abteilung anlegen'}
      sub={`${d.teamIds.length} ${d.teamIds.length === 1 ? 'Team' : 'Teams'}`}
      icon="build"
      headStyle={{ background: d.color, color: '#fff' }}
      className="form-dialog dept-modal"
      onClose={onClose}
      onSubmit={async () => {
        const r = await run(saveDepartment({ id: dept?.id, ...d }));
        if (r.ok) onClose();
      }}
      footer={
        <ModalActions
          onCancel={onClose}
          okLabel={dept ? 'Speichern' : 'Abteilung anlegen'}
          left={
            dept ? (
              <button
                type="button"
                className="btn ghost danger-text"
                onClick={async () => {
                  if (await ask(`Abteilung „${dept.name}“ löschen? Die Teams bleiben erhalten und sind danach keiner Abteilung zugeordnet.`, 'Löschen')) {
                    const r = await run(deleteDepartment(dept.id));
                    if (r.ok) onClose();
                  }
                }}
              >
                <Icon name="trash" />
                Abteilung löschen
              </button>
            ) : undefined
          }
        />
      }
    >
      <Field label="Name der Abteilung">
        <input value={d.name} maxLength={60} placeholder="z. B. Technik" autoFocus onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <Field label="Abteilungsleitung" note={heads.length ? 'Zur Auswahl stehen alle Personen mit der Rolle „Abteilungsleiter“.' : 'Es gibt noch keine Person mit der Rolle „Abteilungsleiter“. Die Rolle vergibst du unter „Kontakte“.'}>
        <Picker value={d.headId} onChange={(headId) => setD({ ...d, headId })} noneLabel="Nicht besetzt" options={heads.map((p) => ({ value: p.id, label: p.name, sub: p.role, pic: 'person', color: d.color }))} />
      </Field>
      <Field label="Farbe">
        <ColorChoice value={d.color} onChange={(color) => setD({ ...d, color })} swatches={['#0068A8', '#14A1A9', '#2f8f5b', '#d4880f', '#c2412d', '#8a4fbf', '#596579']} />
      </Field>
      <Field label={<>Teams dieser Abteilung <span className="pill teal">{d.teamIds.length} ausgewählt</span></>}>
        <div className="ts-list dept-teams">
          {data.teams.map((t) => {
            const other = data.departments.find((x) => x.id !== dept?.id && x.teamIds.includes(t.id));
            return (
              <label className="ts-person" key={t.id}>
                <input type="checkbox" checked={d.teamIds.includes(t.id)} onChange={(e) => setD({ ...d, teamIds: e.target.checked ? [...d.teamIds, t.id] : d.teamIds.filter((x) => x !== t.id) })} />
                <span className="swap-check-box">
                  <Icon name="check" />
                </span>
                <span className="ta-mark sm" style={{ '--team': teamColor(t) } as CSSProperties}>
                  {mark(t.name)}
                </span>
                <span className="pp-txt">
                  <b>{t.name}</b>
                  <small>{other ? `derzeit in ${other.name}` : `${t.memberIds.length} Mitglieder`}</small>
                </span>
              </label>
            );
          })}
        </div>
      </Field>
    </Modal>
  );
}
