'use client';
/* Kontakte: Favoriten, Suche, Mitarbeiterliste (Admin), Mitarbeiter anlegen/bearbeiten/löschen */
import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../AppProvider';
import { Avatar, Field, Heading, Icon, Modal, ModalActions, MultiPick, Picker, resizeImage } from '../ui';
import { canEdit } from '@/lib/access';
import { roleLabel, visibleRole } from '@/lib/permissions';
import { downloadCsv } from '@/lib/export/csv';
import { deleteEmployees, saveEmployee } from '@/server/actions/admin';
import { logExport } from '@/server/actions/account';
import type { Person } from '@/lib/types';

const teamsCall = (n: string) => `https://teams.microsoft.com/l/call/0/0?users=4:${encodeURIComponent(n.replace(/[^\d+]/g, ''))}`;

export function Contacts() {
  const { ctx, data, user, prefs, setPrefs, toast, run, ask, teamColor } = useApp();
  const admin = user.role === 'Admin';
  const editable = canEdit(ctx, 'Kontakte') || admin;
  const [q, setQ] = useState('');
  const [role, setRole] = useState('Alle');
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [sort, setSort] = useState<{ key: 'name' | 'role' | 'team' | 'mail'; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Person | 'new' | null>(null);
  const [detail, setDetail] = useState<Person | null>(null);
  const favs = prefs.favorites.filter((id) => data.staff.some((s) => s.id === id));
  const teamsOf = (p: Person) => data.teams.filter((t) => t.memberIds.includes(p.id));
  const counts = data.roles.map((r) => [r, data.staff.filter((s) => visibleRole(s.role, user.role) === r).length] as [string, number]).filter((x) => x[1]);
  const rows = useMemo(
    () => data.staff.filter((s) => (role === 'Alle' || visibleRole(s.role, user.role) === role) && [s.name, teamsOf(s).map((t) => t.name).join(', '), s.email, s.phone, s.teamsPhone].join(' ').toLowerCase().includes(q.trim().toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.staff, data.teams, role, q, user.role],
  );
  const toggleFav = (p: Person) => {
    const on = favs.includes(p.id);
    setPrefs({ favorites: on ? favs.filter((x) => x !== p.id) : [...favs, p.id] });
    toast(on ? `${p.name} aus Favoriten entfernt.` : `${p.name} zu Favoriten hinzugefügt.`);
  };
  const del = async (ids: string[]) => {
    const list = data.staff.filter((s) => ids.includes(s.id) && s.id !== user.id);
    if (!list.length) return toast('Du kannst dich nicht selbst löschen.');
    if (!(await ask(list.length === 1 ? `Mitarbeiter „${list[0].name}“ wirklich löschen?` : `${list.length} Mitarbeiter wirklich löschen?`))) return;
    const r = await run(deleteEmployees(list.map((p) => p.id)));
    if (r.ok) setSel(new Set());
  };

  const tile = (s: Person, full = false) => {
    const ts = teamsOf(s);
    const fav = favs.includes(s.id);
    return (
      <article key={s.id} className={`contact-tile${fav ? ' is-fav' : ''}${full ? ' contact-tile-full' : ''}`} tabIndex={full ? undefined : 0} onClick={(e) => !full && !(e.target as HTMLElement).closest('button,a') && window.matchMedia('(max-width: 1360px)').matches && setDetail(s)}>
        <button type="button" className={`contact-fav${fav ? ' on' : ''}`} aria-pressed={fav} title={fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'} aria-label={fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'} onClick={() => toggleFav(s)}>
          <Icon name="star" />
        </button>
        <div className="contact-tile-head">
          <Avatar name={s.name} color={teamColor(ts[0])} size={48} />
          <div className="contact-tile-name">
            <b>{s.name}</b>
            <span className="role-pill">{roleLabel(visibleRole(s.role, user.role))}</span>
          </div>
        </div>
        <div className="contact-tile-teams">
          <Icon name="users" />
          <span>{ts.map((t) => t.name).join(', ') || '—'}</span>
        </div>
        <div className="contact-tile-links">
          {s.teamsPhone ? (
            <a className="contact-link" href={teamsCall(s.teamsPhone)} target="_blank" rel="noopener noreferrer" title="Anruf in Microsoft Teams starten">
              <Icon name="phone" />
              <span>
                {s.teamsPhone} <em className="contact-hint">(Teams Anruf)</em>
              </span>
            </a>
          ) : (
            <span className="contact-none">
              <Icon name="phone" />
              <span>
                — <em className="contact-hint">(Teams Anruf)</em>
              </span>
            </span>
          )}
          {s.email ? (
            <a className="contact-link" href={`mailto:${s.email}`}>
              <Icon name="mail" />
              <span>{s.email}</span>
            </a>
          ) : (
            <span className="contact-none">
              <Icon name="mail" />
              <span>—</span>
            </span>
          )}
          <div className="contact-teams">
            {s.email ? (
              <a className="btn small teams-btn" href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(s.email)}`} target="_blank" rel="noopener noreferrer" title="Chat in Microsoft Teams starten">
                <Icon name="chat" />
                <span>Chat</span>
              </a>
            ) : (
              <span className="btn small teams-btn is-off" aria-disabled="true">
                <Icon name="chat" />
                <span>Chat</span>
              </span>
            )}
            {s.phone ? (
              <a className="btn small teams-btn" href={teamsCall(s.phone)} target="_blank" rel="noopener noreferrer" title={`Bereitschaftsnummer ${s.phone} in Microsoft Teams anrufen`}>
                <Icon name="moon" />
                <span>Bereitschaft</span>
              </a>
            ) : (
              <span className="btn small teams-btn is-off" aria-disabled="true">
                <Icon name="moon" />
                <span>Bereitschaft</span>
              </span>
            )}
          </div>
        </div>
        {editable && (
          <div className="contact-tile-actions">
            <button className="btn small" onClick={() => { setDetail(null); setEdit(s); }}>
              Bearbeiten
            </button>
            <button className="btn small danger" onClick={() => { setDetail(null); void del([s.id]); }}>
              Löschen
            </button>
          </div>
        )}
      </article>
    );
  };

  const listMode = view === 'list' && admin;
  const searching = !!q.trim() || role !== 'Alle';
  const key = { name: (s: Person) => s.name.toLowerCase(), role: (s: Person) => roleLabel(s.role).toLowerCase() + ' ' + s.name.toLowerCase(), team: (s: Person) => (teamsOf(s).map((t) => t.name).join(', ') || '~').toLowerCase() + s.name.toLowerCase(), mail: (s: Person) => (s.email || '~').toLowerCase() }[sort.key];
  const sorted = [...rows].sort((a, b) => (key(a) < key(b) ? -sort.dir : key(a) > key(b) ? sort.dir : 0));
  const selectable = sorted.filter((s) => s.id !== user.id);
  const th = (k: typeof sort.key, l: string) => (
    <th className={`sortable${sort.key === k ? ' on' : ''}`} aria-sort={sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort(sort.key === k ? { key: k, dir: (-sort.dir) as 1 | -1 } : { key: k, dir: 1 })}>
        {l}
        <span className="sort-ic">{sort.key === k ? (sort.dir > 0 ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
  return (
    <>
      <Heading
        title="Kontakte"
        actions={
          <>
            <button
              className="btn"
              onClick={() => {
                downloadCsv([['Name', 'Rolle', 'Teams', 'Teams-Telefonnummer', 'Bereitschaftsnummer', 'E-Mail'], ...data.staff.map((s) => [s.name, visibleRole(s.role, user.role), teamsOf(s).map((t) => t.name).join(', '), s.teamsPhone, s.phone, s.email])], 'kontakte.csv');
                void logExport({ report: 'Kontakte', format: 'CSV', rows: data.staff.length, status: 'Erfolgreich' });
                toast('Kontakte exportiert.');
              }}
            >
              CSV exportieren
            </button>
            {editable && (
              <button className="btn primary" onClick={() => setEdit('new')}>
                ＋ Mitarbeiter hinzufügen
              </button>
            )}
          </>
        }
      />
      <section className="panel contact-search-panel">
        <div className="table-toolbar">
          {admin && (
            <div className="contact-view-switch" role="tablist" aria-label="Ansicht">
              <button type="button" role="tab" className={view === 'cards' ? 'active' : ''} aria-selected={view === 'cards'} onClick={() => setView('cards')}>
                <Icon name="star" />
                <span>Kontakte</span>
              </button>
              <button type="button" role="tab" className={view === 'list' ? 'active' : ''} aria-selected={view === 'list'} onClick={() => setView('list')}>
                <Icon name="users" />
                <span>Mitarbeiterliste</span>
              </button>
            </div>
          )}
          <input className="input" type="search" placeholder="Name, Team, Telefon oder E-Mail …" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chip-row contact-role-chips">
            {[['Alle', data.staff.length] as [string, number], ...counts].map(([r, c]) => (
              <button key={r} type="button" className={`chip ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>
                {roleLabel(r)} · {c}
              </button>
            ))}
          </div>
        </div>
      </section>
      {!listMode && !searching && (
        <section className="panel contact-fav-panel">
          <div className="panel-head">
            <h2>
              <Icon name="star" className="fav-head-ic" /> Meine Favoriten
            </h2>
          </div>
          {favs.length ? (
            <div className="contact-grid contact-fav-grid">{favs.map((id) => tile(data.staff.find((s) => s.id === id)!))}</div>
          ) : (
            <div className="contact-empty">
              <Icon name="star" />
              <span>Noch keine Favoriten. Tippe bei einem Kontakt auf den Stern, um ihn hier anzuzeigen.</span>
            </div>
          )}
        </section>
      )}
      {listMode && (
        <section className="panel staff-admin-panel">
          <div className="panel-head staff-admin-head">
            <div>
              <h2>
                <Icon name="users" className="res-head-ic" /> Mitarbeiterliste
              </h2>
            </div>
            <div className="staff-admin-tools">
              {sel.size > 0 && (
                <span className="staff-bulk">
                  <b>{sel.size} ausgewählt</b>
                  <button type="button" className="btn small" onClick={() => setSel(new Set())}>
                    Auswahl aufheben
                  </button>
                  <button type="button" className="btn small danger" onClick={() => del([...sel])}>
                    <Icon name="trash" />
                    Löschen
                  </button>
                </span>
              )}
            </div>
          </div>
          {sorted.length ? (
            <div className="staff-list">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th className="cb-col">
                      <input type="checkbox" aria-label="Alle auswählen" checked={selectable.length > 0 && selectable.every((s) => sel.has(s.id))} onChange={(e) => setSel(e.target.checked ? new Set(selectable.map((s) => s.id)) : new Set())} />
                    </th>
                    {th('name', 'Mitarbeiter')}
                    {th('role', 'Rolle')}
                    {th('team', 'Teams')}
                    <th>Teams-Telefon</th>
                    <th>Bereitschaftsnr.</th>
                    <th className="act-col">
                      <span className="sr-only">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => {
                    const ts = teamsOf(s),
                      me = s.id === user.id;
                    return (
                      <tr key={s.id} className={sel.has(s.id) ? 'sel' : ''} onDoubleClick={() => setEdit(s)}>
                        <td className="cb-col">
                          {!me && (
                            <input
                              type="checkbox"
                              aria-label={`${s.name} auswählen`}
                              checked={sel.has(s.id)}
                              onChange={(e) => {
                                const n = new Set(sel);
                                if (e.target.checked) n.add(s.id);
                                else n.delete(s.id);
                                setSel(n);
                              }}
                            />
                          )}
                        </td>
                        <td className="st-name">
                          <div className="st-person">
                            <Avatar name={s.name} color={teamColor(ts[0])} size={34} />
                            <div>
                              <b>
                                {s.name}
                                {me && <em className="st-me"> Du</em>}
                              </b>
                              {s.email ? (
                                <a className="st-mail" href={`mailto:${s.email}`}>
                                  {s.email}
                                </a>
                              ) : (
                                <small className="muted">Keine E-Mail</small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td data-label="Rolle">
                          <span className={`role-pill role-${s.role.toLowerCase()}`}>{roleLabel(s.role)}</span>
                        </td>
                        <td data-label="Teams">
                          <div className="st-teams">
                            {ts.length ? (
                              ts.map((t) => (
                                <span key={t.id} className="st-team" style={{ '--c': teamColor(t) } as CSSProperties}>
                                  <i />
                                  {t.name}
                                  {t.leaderId === s.id ? <small> TL</small> : t.deputyId === s.id ? <small> STV</small> : null}
                                </span>
                              ))
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </div>
                        </td>
                        <td data-label="Teams-Telefon">{s.teamsPhone || <span className="muted">—</span>}</td>
                        <td data-label="Bereitschaftsnr.">{s.phone || <span className="muted">—</span>}</td>
                        <td className="act-col">
                          <div className="row-actions">
                            <button className="icon-btn" type="button" title="Bearbeiten" aria-label={`${s.name} bearbeiten`} onClick={() => setEdit(s)}>
                              <Icon name="edit" />
                            </button>
                            <button className="icon-btn danger" type="button" disabled={me} title={me ? 'Du kannst dich nicht selbst löschen' : 'Löschen'} aria-label={`${s.name} löschen`} onClick={() => del([s.id])}>
                              <Icon name="trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="contact-empty">Keine Mitarbeiter gefunden.</div>
          )}
        </section>
      )}
      {!listMode && searching && (
        <section className="panel contact-results-panel">
          <div className="panel-head">
            <h2>
              <Icon name="search" className="res-head-ic" /> Suchergebnisse
            </h2>
            <span className="contact-count">{rows.length} Treffer</span>
          </div>
          <div className="contact-results">{rows.length ? <div className="contact-grid">{rows.map((s) => tile(s))}</div> : <div className="contact-empty">Keine Mitarbeiter gefunden.</div>}</div>
        </section>
      )}
      {detail && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="modal contact-detail-modal" role="dialog" aria-modal="true" aria-label="Kontakt">
            <div className="panel-head">
              <h2>Kontakt</h2>
              <button className="icon-btn" type="button" aria-label="Schließen" onClick={() => setDetail(null)}>
                ×
              </button>
            </div>
            <div className="contact-detail-body">{tile(detail, true)}</div>
          </div>
        </div>
      )}
      {edit && <EmployeeDialog person={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EmployeeDialog({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const { data, run, toast, teamColor } = useApp();
  const [v, setV] = useState({
    name: person?.name || '',
    role: person?.role || 'Mitarbeiter',
    email: person?.email || '',
    phone: person?.phone || '',
    teamsPhone: person?.teamsPhone || '',
    photo: person?.photo || '',
    teamNames: person ? data.teams.filter((t) => t.memberIds.includes(person.id)).map((t) => t.name) : [],
  });
  return (
    <Modal
      title={person ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter hinzufügen'}
      icon="users"
      className="form-dialog"
      onClose={onClose}
      onSubmit={async () => {
        if (!v.name.trim()) return toast('Bitte einen Mitarbeiternamen eingeben.');
        const r = await run(saveEmployee({ id: person?.id, ...v }));
        if (r.ok) onClose();
      }}
      footer={<ModalActions onCancel={onClose} />}
    >
      <Field label="Vor- und Nachname">
        <input required placeholder="Max Mustermann" value={v.name} autoFocus onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="Benutzerrolle">
        <Picker value={v.role} onChange={(role) => setV({ ...v, role })} options={data.roles.map((r) => ({ value: r, label: roleLabel(r), pic: 'icon', icon: 'shield' }))} />
      </Field>
      <div className="photo-row">
        <div className="employee-photo-preview">{v.photo ? <img src={v.photo} alt="Profilbild-Vorschau" /> : <span>Foto</span>}</div>
        <label className="btn">
          Profilbild wählen
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return toast('Bitte ein Bild im Format JPG, PNG, GIF oder WebP auswählen.');
              setV({ ...v, photo: await resizeImage(file) });
            }}
          />
        </label>
        {v.photo && (
          <button type="button" className="link-btn" onClick={() => setV({ ...v, photo: '' })}>
            Entfernen
          </button>
        )}
      </div>
      {data.teams.length ? (
        <MultiPick label="Teams zuordnen" items={data.teams.map((t) => ({ value: t.name, label: t.name, color: teamColor(t), small: t.memberIds.length }))} selected={v.teamNames} onChange={(teamNames) => setV({ ...v, teamNames })} allLabel="Alle Teams" emptyLabel="Teams auswählen …" />
      ) : (
        <Field label="Teams zuordnen">
          <small className="muted">Es sind noch keine Teams angelegt.</small>
        </Field>
      )}
      <Field label="E-Mail">
        <input type="email" placeholder="name@example.at" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
      </Field>
      <div className="te-two">
        <Field label="Bereitschaftsnummer">
          <input placeholder="+43 660 …" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <Field label="Teams-Telefonnummer">
          <input placeholder="+43 …" value={v.teamsPhone} onChange={(e) => setV({ ...v, teamsPhone: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
