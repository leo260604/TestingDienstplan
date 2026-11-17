'use client';
/* Notizen (pro Person und Tag) und Teamnotizen (pro Team und Tag) */
import { useState } from 'react';
import { useApp } from '../AppProvider';
import { Field, Icon, Modal, ModalActions, Picker } from '../ui';
import { day, isoDate } from '@/lib/dates';
import { canNoteFor, teamNoteTeams, personByName } from '@/lib/access';
import { deleteEntry, deleteTeamNote, saveNote, saveTeamNote } from '@/server/actions/entries';
import type { Entry, TeamNote } from '@/lib/types';

/** Notizen einer Person an einem Tag */
export const noteKey = (a: Pick<Entry, 'employee' | 'date'>) => a.employee + '|' + a.date;

export function NotesPopup({ k, onClose, onEdit, onAdd }: { k: string; onClose: () => void; onEdit: (n: Entry) => void; onAdd: (emp: string, date: string) => void }) {
  const { ctx, data, f, run, ask } = useApp();
  const i = k.lastIndexOf('|'),
    emp = k.slice(0, i),
    date = k.slice(i + 1);
  const list = data.entries.filter((a) => a.kind === 'Notiz' && a.employee === emp && a.date === date);
  const can = canNoteFor(ctx, emp);
  return (
    <Modal title={`Notizen · ${emp}`} sub={f.fmtWithWeekday(day(date))} icon="chat" className="form-dialog np-modal" onClose={onClose}>
      <div className="np-list">
        {list.map((n) => (
          <article className="np-item" key={n.id}>
            <p className="np-text">{n.note}</p>
            <div className="np-meta">
              <small className="np-by">
                <Icon name="user" />
                <span>
                  von <b>{n.author || emp}</b>
                </span>
              </small>
              {can && (
                <span className="np-actions">
                  <button type="button" className="icon-btn" title="Bearbeiten" aria-label="Notiz bearbeiten" onClick={() => onEdit(n)}>
                    <Icon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    title="Löschen"
                    aria-label="Notiz löschen"
                    onClick={async () => {
                      if (await ask(`Notiz von ${emp} am ${f.fmtIsoDate(date)} wirklich löschen?`, 'Löschen')) {
                        await run(deleteEntry(n.id));
                        if (list.length === 1) onClose();
                      }
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </span>
              )}
            </div>
          </article>
        ))}
        {!list.length && <div className="empty-note">Keine Notizen.</div>}
      </div>
      {can && (
        <div className="btn-row modal-actions wp-actions">
          <span />
          <span className="wp-actions-right">
            <button type="button" className="btn primary" onClick={() => onAdd(emp, date)}>
              <Icon name="plus" />
              Notiz hinzufügen
            </button>
          </span>
        </div>
      )}
    </Modal>
  );
}

export function NoteDialog({ note, date, forWho, onClose }: { note?: Entry; date?: string; forWho?: string; onClose: () => void }) {
  const { ctx, data, user, run, ask, f } = useApp();
  const targets = data.staff
    .filter((p) => canNoteFor(ctx, p.name))
    .sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : 0) || a.name.localeCompare(b.name, 'de'));
  const [who, setWho] = useState(note?.employee || (forWho && targets.some((p) => p.name === forWho) ? forWho : targets.find((p) => p.id === user.id)?.name || targets[0]?.name || ''));
  const [d, setD] = useState(note?.date || date || isoDate(new Date()));
  const [text, setText] = useState(note?.note || '');
  return (
    <Modal
      title={note ? 'Notiz bearbeiten' : 'Notiz hinzufügen'}
      sub="Notizen sehen alle, die diesen Dienstplan sehen."
      icon="edit"
      className="form-dialog"
      onClose={onClose}
      onSubmit={async () => {
        const r = await run(saveNote({ id: note?.id, employee: who, date: d, text }));
        if (r.ok) onClose();
      }}
      footer={
        <ModalActions
          onCancel={onClose}
          okLabel={note ? 'Speichern' : 'Notiz speichern'}
          left={
            note ? (
              <button
                type="button"
                className="btn ghost danger-text note-del"
                onClick={async () => {
                  if (await ask(`Notiz von ${note.employee} am ${f.fmtIsoDate(note.date)} wirklich löschen?`, 'Löschen')) {
                    const r = await run(deleteEntry(note.id));
                    if (r.ok) onClose();
                  }
                }}
              >
                <Icon name="trash" />
                Notiz löschen
              </button>
            ) : undefined
          }
        />
      }
    >
      {targets.length > 1 && (
        <Field label="Für">
          <Picker value={who} onChange={setWho} options={targets.map((p) => ({ value: p.name, label: p.name + (p.id === user.id ? ' (ich)' : ''), pic: 'person' }))} />
        </Field>
      )}
      <Field label="Datum">
        <input type="date" value={d} required onChange={(e) => setD(e.target.value)} />
      </Field>
      <Field label="Notiz" note="Max. 500 Zeichen">
        <textarea rows={4} maxLength={500} required placeholder="z. B. Arzttermin ab 15 Uhr, Schulung, Übergabe …" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {!personByName(ctx, who) && <small className="wp-note">Bitte eine Person wählen.</small>}
    </Modal>
  );
}

export function TeamNotesPopup({ date, shown, onClose, onEdit, onAdd }: { date: string; shown: Set<string>; onClose: () => void; onEdit: (n: TeamNote) => void; onAdd: () => void }) {
  const { ctx, data, f, run, ask } = useApp();
  const list = data.teamNotes.filter((n) => n.date === date && shown.has(n.team)).sort((a, b) => a.team.localeCompare(b.team, 'de'));
  const allowed = teamNoteTeams(ctx);
  return (
    <Modal title="Teamnotizen" sub={f.fmtWithWeekday(day(date))} icon="chat" className="form-dialog np-modal" onClose={onClose}>
      <div className="np-list">
        {list.map((n) => (
          <article className="np-item tn-item" key={n.id}>
            <p className="np-text">{n.text}</p>
            <div className="np-meta">
              <small>
                <b>{n.team}</b> · <Icon name="user" />
                von <b>{n.author || '—'}</b>
              </small>
              {allowed.includes(n.team) && (
                <span className="np-actions">
                  <button type="button" className="icon-btn" aria-label="Teamnotiz bearbeiten" onClick={() => onEdit(n)}>
                    <Icon name="edit" />
                  </button>
                  <button type="button" className="icon-btn danger" aria-label="Teamnotiz löschen" onClick={async () => (await ask(`Teamnotiz für ${n.team} am ${f.fmtIsoDate(n.date)} wirklich löschen?`, 'Löschen')) && run(deleteTeamNote(n.id))}>
                    <Icon name="trash" />
                  </button>
                </span>
              )}
            </div>
          </article>
        ))}
        {!list.length && <div className="empty-note">Keine Teamnotizen.</div>}
      </div>
      {allowed.some((t) => shown.has(t)) && (
        <div className="btn-row modal-actions wp-actions">
          <span />
          <span className="wp-actions-right">
            <button type="button" className="btn primary" onClick={onAdd}>
              <Icon name="plus" />
              Teamnotiz hinzufügen
            </button>
          </span>
        </div>
      )}
    </Modal>
  );
}

export function TeamNoteDialog({ note, date, preferTeam, onClose }: { note?: TeamNote; date?: string; preferTeam?: string; onClose: () => void }) {
  const { ctx, run, teamColor } = useApp();
  const allowed = teamNoteTeams(ctx);
  const [team, setTeam] = useState(note?.team || (preferTeam && allowed.includes(preferTeam) ? preferTeam : allowed[0] || ''));
  const [d, setD] = useState(note?.date || date || isoDate(new Date()));
  const [text, setText] = useState(note?.text || '');
  return (
    <Modal
      title={note ? 'Teamnotiz bearbeiten' : 'Teamnotiz hinzufügen'}
      sub="Gilt für das ganze Team und steht im Kalender unter dem Datum."
      icon="chat"
      className="form-dialog"
      onClose={onClose}
      onSubmit={async () => {
        const r = await run(saveTeamNote({ id: note?.id, team, date: d, text }));
        if (r.ok) onClose();
      }}
      footer={<ModalActions onCancel={onClose} okLabel="Speichern" />}
    >
      {allowed.length > 1 && (
        <Field label="Team">
          <Picker value={team} onChange={setTeam} options={allowed.map((t) => ({ value: t, label: t, pic: 'team', color: teamColor(t) }))} search="Team suchen …" />
        </Field>
      )}
      <Field label="Datum">
        <input type="date" value={d} required onChange={(e) => setD(e.target.value)} />
      </Field>
      <Field label="Notiz" note="Wird im Kalender unter dem Datum angezeigt. Max. 300 Zeichen.">
        <textarea rows={3} maxLength={300} required placeholder="z. B. Teambesprechung 09:00, Wartung ab 14 Uhr …" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </Modal>
  );
}
