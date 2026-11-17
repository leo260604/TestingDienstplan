'use client';
/* Kalender: Dienstplan & Bereitschaft – Ansichten Tag, Woche, Monat, Team (Dienstplan) bzw. Zeitleiste (Bereitschaft) */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../AppProvider';
import { useShell } from '../shell/AppShell';
import { Avatar, DayPickerPop, Dot, Heading, Icon, InfoDialog, MonthPickerPop, TeamFilter, useClientDate } from '../ui';
import { AbsenceDialog, DutyDialog, DutyRotationDialog, StandbyRotationDialog, WorkplaceDialog, type DutyPreset } from './dialogs';
import { NoteDialog, NoteTip, NotesPopup, TeamNoteDialog, TeamNotesPopup, noteKey } from './notes';
import { addDays, day, durationHours, isoDate, isoWeek, weekStart } from '@/lib/dates';
import { holidayName, isHoliday } from '@/lib/holidays';
import { assignmentColor, buildWpIndex, computeConflicts, isVariableStandby, shiftHexColor, tRange, weekHoursOf } from '@/lib/entries';
import {
  absenceTeams,
  areaOf,
  canCreateAbsenceFor,
  canEdit,
  canEditEntry,
  canManageTeam,
  canNoteFor,
  canSeeStandbyInDutyPlan,
  currentUserTeamNames,
  entryTeams,
  manageableTeams,
  managesTeam,
  orderedMembers,
  selfEditAllowed,
  teamNoteTeams,
} from '@/lib/access';
import { canSwapDuty, swapOpenFor } from '@/lib/swaps';
import { deleteEntry, moveEntry } from '@/server/actions/entries';
import type { Entry, TeamNote } from '@/lib/types';

type Area = 'Dienstplan' | 'Bereitschaft';
type NoteGroup = { kind: 'NotizGruppe'; id: string; employee: string; team: string; date: string; notes: Entry[] };
type Item = Entry | NoteGroup;

type Dlg =
  | { t: 'duty'; preset: DutyPreset }
  | { t: 'absence' }
  | { t: 'workplace'; preset: { from?: string; to?: string; type?: 'Homeoffice' | 'Büro'; employee?: string } }
  | { t: 'rotStandby' }
  | { t: 'rotDuty' }
  | { t: 'notes'; k: string }
  | { t: 'note'; note?: Entry; date?: string; forWho?: string }
  | { t: 'teamNotes'; date: string }
  | { t: 'teamNote'; note?: TeamNote; date?: string }
  | { t: 'day'; date: string }
  | { t: 'contact'; id: string }
  | { t: 'actions' }
  | null;

export function Calendar({ area }: { area: Area }) {
  const app = useApp();
  const { ctx, data, user, prefs, f, cal, setCal, run, ask, toast, teamColor } = app;
  const shell = useShell();
  const params = useSearchParams();
  const isDuty = area === 'Dienstplan';
  const st = cal[area];
  const views = isDuty ? ['Tag', 'Woche', 'Monat', 'Team'] : ['Tag', 'Woche', 'Monat', 'Zeitleiste'];
  const [dlg, setDlg] = useState<Dlg>(null);
  const nowDate = useClientDate();
  const today = nowDate ? isoDate(nowDate) : '';
  const [limit, setLimit] = useState(99);

  /* Strg Z / ⌘ Z: letzte eigene Änderung zurücknehmen (nur Dienstplan & Bereitschaft, nicht in Eingabefeldern) */
  const { undo } = app;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input,textarea,select,[contenteditable]') || document.querySelector('.modal-backdrop,.cp-layer,.dpk-pop')) return;
      e.preventDefault();
      void undo();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [undo]);

  /* Startzustand: eigenes Team, Standardansicht, Datum aus der URL (z. B. aus einer Benachrichtigung) */
  useEffect(() => {
    const qDate = params.get('date');
    const qView = params.get('view');
    const qTeam = params.get('team');
    const patch: Record<string, unknown> = {};
    if (!st) Object.assign(patch, { teams: currentUserTeamNames(ctx).slice(0, 1), member: 'Alle Mitarbeiter', onlyConflicts: false, mobileDate: '' });
    let defView = prefs.defaults[area] || 'Woche';
    if (!views.includes(defView)) defView = 'Woche';
    if (!st?.view) patch.view = defView;
    if (qView && views.includes(qView)) patch.view = qView;
    if (qDate) Object.assign(patch, { date: qDate, mobileDate: qDate });
    else if (!st?.date) patch.date = isoDate(new Date());
    if (qTeam) patch.teams = [qTeam];
    if (params.get('conflicts')) patch.onlyConflicts = true;
    if (Object.keys(patch).length) setCal(area, patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  const view = st?.view && views.includes(st.view) ? st.view : 'Woche';
  const cur = useMemo(() => (st?.date ? day(st.date) : day(isoDate(new Date()))), [st?.date]);
  const calTeams = st?.teams || [];
  const member = st?.member || 'Alle Mitarbeiter';
  const onlyConflicts = !!st?.onlyConflicts;
  const n = isDuty ? prefs.dutyDays : prefs.standbyDays;
  const set = useCallback((patch: Partial<NonNullable<typeof st>>) => setCal(area, patch), [area, setCal]);

  /* Wie viele Einträge pro Tag direkt sichtbar sind, hängt von der Fensterhöhe ab */
  useEffect(() => {
    const calc = () => {
      const h = window.innerHeight || 800;
      if (view === 'Woche') setLimit(Math.max(4, Math.floor((h - 330) / 68)));
      else if (view === 'Monat') {
        const weeks = Math.ceil((new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate() + 6) / 7);
        setLimit(Math.max(2, Math.floor(((h - 330) / weeks - 34) / 50)));
      } else setLimit(99);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [view, cur]);

  const teamOk = (team: string) => !calTeams.length || calTeams.includes(team);
  const conflicts = useMemo(() => computeConflicts(data.entries), [data.entries]);
  const wp = useMemo(() => buildWpIndex(data.entries), [data.entries]);
  const visible = useMemo(
    () =>
      data.entries.filter((a) => {
        const kindOk = !isDuty ? a.kind === 'Bereitschaft' : a.kind === 'Dienstplan' || a.kind === 'Arbeitsort' || a.kind === 'Notiz' || (a.kind === 'Bereitschaft' && canSeeStandbyInDutyPlan(ctx, a));
        return kindOk && teamOk(a.team) && (member === 'Alle Mitarbeiter' || a.employee === member) && (!onlyConflicts || conflicts.has(a.id)) && !wp.merged(a);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.entries, isDuty, calTeams, member, onlyConflicts, conflicts, wp, ctx],
  );
  const byDate = useMemo(() => {
    const m: Record<string, Entry[]> = {};
    visible.forEach((a) => (m[a.date] ||= []).push(a));
    return m;
  }, [visible]);

  /* Notizen hängen am Eintrag der Person (Knopf „Notizen“), sonst eigene kleine Karte */
  const { notesBy, noteHost } = useMemo(() => {
    const notesBy: Record<string, Entry[]> = {},
      noteHost: Record<string, Entry> = {};
    visible.forEach((a) => a.kind === 'Notiz' && (notesBy[noteKey(a)] ||= []).push(a));
    const rank = (a: Entry) => (a.kind === 'Dienstplan' && !a.isAbsence ? 0 : a.isAbsence ? 1 : a.kind === 'Bereitschaft' ? 2 : 3);
    visible.forEach((a) => {
      if (a.kind === 'Notiz') return;
      const k = noteKey(a);
      if (!notesBy[k]) return;
      const h = noteHost[k];
      if (!h || rank(a) < rank(h)) noteHost[k] = a;
    });
    return { notesBy, noteHost };
  }, [visible]);

  const rankMap = useMemo(() => {
    const m = new Map<string, number>();
    let k = 0;
    [...data.teams.filter((t) => teamOk(t.name)), ...data.teams].forEach((t) =>
      orderedMembers(t, data.staff, prefs.memberOrder[t.id]).forEach((p) => {
        if (!m.has(p.name)) m.set(p.name, k++);
      }),
    );
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.teams, data.staff, prefs.memberOrder, calTeams]);

  const dayEntries = useCallback(
    (date: string): Item[] => {
      const list: Item[] = [],
        seen = new Set<string>();
      (byDate[date] || []).forEach((a) => {
        if (a.kind !== 'Notiz') return list.push(a);
        const k = noteKey(a);
        if (noteHost[k] || seen.has(k)) return;
        seen.add(k);
        list.push({ kind: 'NotizGruppe', id: 'ng|' + k, employee: a.employee, team: a.team, date: a.date, notes: notesBy[k] });
      });
      const isNg = (a: Item) => (a.kind === 'NotizGruppe' ? 1 : 0);
      if (isDuty) {
        const rk = (e: string) => (rankMap.has(e) ? rankMap.get(e)! : 1e6);
        return list.sort((a, b) => isNg(a) - isNg(b) || rk(a.employee) - rk(b.employee) || a.employee.localeCompare(b.employee) || (a.kind === 'Bereitschaft' ? 1 : 0) - (b.kind === 'Bereitschaft' ? 1 : 0) || ((a as Entry).start || '').localeCompare((b as Entry).start || ''));
      }
      return list.sort((a, b) => isNg(a) - isNg(b) || ((a as Entry).start || '').localeCompare((b as Entry).start || ''));
    },
    [byDate, noteHost, notesBy, isDuty, rankMap],
  );

  /* ---------- Rechte & Aktionen ---------- */
  const canAdd = entryTeams(ctx, area).length > 0;
  const canManageAny = manageableTeams(ctx, area).length > 0;
  const features = data.settings.features;
  const movable = (a: Entry) => (!a.isAbsence && a.kind !== 'Arbeitsort' && a.kind !== 'Notiz' && canEditEntry(ctx, a.team, a.employee, areaOf(a))) || (a.kind === 'Arbeitsort' && managesTeam(ctx, a.team, 'Dienstplan'));
  const noteSelf = member !== 'Alle Mitarbeiter' ? member : user.name;
  const tnShown = useMemo(() => new Set(data.teams.filter((t) => teamOk(t.name)).map((t) => t.name)), [data.teams, calTeams]); // eslint-disable-line react-hooks/exhaustive-deps

  const askDelete = async (a: Entry) => {
    const own = a.kind === 'Arbeitsort' && a.employee === user.name;
    const absenceOk = a.isAbsence && canCreateAbsenceFor(ctx, data.staff.find((p) => p.name === a.employee));
    if (!canManageTeam(ctx, a.team) && !own && !absenceOk && !(!a.isAbsence && a.kind !== 'Arbeitsort' && canEditEntry(ctx, a.team, a.employee, areaOf(a)))) return toast('Du darfst Einträge dieses Teams nicht löschen.');
    if (await ask(`${a.isAbsence ? 'Abwesenheit' : a.kind === 'Arbeitsort' ? `Arbeitsort („${a.shift}“)` : 'Eintrag'} von ${a.employee} am ${f.fmtIsoDate(a.date)} wirklich löschen?`)) await run(deleteEntry(a.id), { undo: `${a.employee} · ${a.shift} gelöscht`, undoHint: true });
  };

  const doMove = async (id: string, date: string, emp?: string) => {
    const a = data.entries.find((x) => x.id === id);
    if (!a) return;
    const target = emp || a.employee;
    if (a.date === date && target === a.employee) return;
    const fullAbs = data.entries.some((x) => x.isAbsence && x.employee === target && x.date === date && !x.start && x.shift !== 'Urlaub 1/2 Tag');
    if (a.kind !== 'Arbeitsort' && fullAbs && !(await ask(`${target} ist am ${f.fmtIsoDate(date)} abwesend. Trotzdem verschieben?`, 'Verschieben'))) return;
    await run(moveEntry(id, date, emp), { undo: `${a.shift} verschoben`, undoHint: true });
  };

  /* ---------- Bausteine ---------- */
  const holTag = (date: string, cls = '') => {
    const nm = holidayName(date);
    return nm ? (
      <span className={`hol-badge ${cls}`} title={`Gesetzlicher Feiertag: ${nm}${isDuty ? ' – keine Dienste möglich' : ''}`}>
        <Icon name="flag" />
        <span>{nm}</span>
      </span>
    ) : null;
  };
  const holCls = (date: string) => (isHoliday(date) ? ' is-holiday' : '');
  const tnHead = (date: string, cls = '') => {
    if (!isDuty || onlyConflicts) return null;
    const list = data.teamNotes.filter((x) => x.date === date && tnShown.has(x.team));
    const can = teamNoteTeams(ctx).some((t) => tnShown.has(t));
    if (!list.length && !can) return null;
    return (
      <div className={`tn-wrap ${cls}`}>
        {list.slice(0, 2).map((x) => (
          <button key={x.id} type="button" className="tn-chip" title={`${x.team}: ${x.text}${x.author ? ' – von ' + x.author : ''}`} onClick={() => setDlg({ t: 'teamNotes', date })}>
            <Icon name="chat" />
            <span>{x.text}</span>
          </button>
        ))}
        {list.length > 2 && (
          <button type="button" className="tn-chip tn-more" onClick={() => setDlg({ t: 'teamNotes', date })}>
            +{list.length - 2} weitere
          </button>
        )}
        {!list.length && can && (
          <button type="button" className="tn-add" onClick={() => setDlg({ t: 'teamNote', date })}>
            <Icon name="plus" />
            <span>Teamnotiz</span>
          </button>
        )}
      </div>
    );
  };
  const noteAddField = (date: string, emp = '', cls = '') =>
    isDuty && !onlyConflicts && day(date).getDay() !== 6 && (emp ? canNoteFor(ctx, emp) : data.staff.some((p) => canNoteFor(ctx, p.name))) ? (
      <button type="button" className={`note-add-field ${cls}`} onClick={() => setDlg({ t: 'note', date, forWho: emp || undefined })}>
        <Icon name="plus" />
        <span>Notiz hinzufügen</span>
      </button>
    ) : null;
  const noteSelfShown = (() => {
    const id = data.staff.find((p) => p.name === noteSelf)?.id;
    return !!id && data.teams.some((t) => teamOk(t.name) && t.memberIds.includes(id));
  })();
  const ownNoteField = (date: string, cls = '') => {
    const items = byDate[date] || [];
    if (noteSelfShown) return items.some((a) => a.kind !== 'Bereitschaft' && a.employee === noteSelf) ? null : noteAddField(date, noteSelf, cls);
    return items.some((a) => a.kind !== 'Bereitschaft') ? null : noteAddField(date, '', cls);
  };
  const noteChip = (a: Entry) => {
    const k = noteKey(a);
    if (!isDuty || noteHost[k] !== a) return null;
    const cnt = notesBy[k].length;
    return (
      <button type="button" className="note-chip" data-notes-open={k} aria-label={`${cnt > 1 ? cnt + ' Notizen' : 'Notiz'} anzeigen`} onClick={(e) => { e.stopPropagation(); setDlg({ t: 'notes', k }); }}>
        <Icon name="chat" />
        {cnt > 1 && <span>{cnt}</span>}
      </button>
    );
  };
  const wpHint = (a: Entry, cls = '') => {
    const w = wp.wpFor(a);
    return w ? (
      <span className={`wp-hint ${w.shift === 'Homeoffice' ? 'is-home' : 'is-office'} ${cls}`} title={`Arbeitsort: ${w.shift}`}>
        <Icon name={w.shift === 'Homeoffice' ? 'home' : 'build'} />
        {w.shift}
      </span>
    ) : null;
  };
  const swapPill = (a: Entry) => {
    if (a.kind !== 'Dienstplan' || a.isAbsence) return null;
    const x = swapOpenFor(data.swaps, a.id);
    return x ? (
      <span className="swap-pill" title={`Tausch zwischen ${x.from} und ${x.to} wartet auf Bestätigung`}>
        <Icon name="refresh" />
        Tausch angefragt
      </span>
    ) : null;
  };
  const foot = (small: ReactNode, chip: ReactNode) =>
    chip ? (
      <div className="ca-foot">
        {small}
        {chip}
      </div>
    ) : (
      small
    );

  const menuItems = (a: Entry): MenuItem[] => {
    const w = wp.wpFor(a);
    const items: MenuItem[] = [];
    if (isDuty && canNoteFor(ctx, a.employee)) items.push({ label: 'Notiz hinzufügen', icon: 'chat', run: () => setDlg({ t: 'note', date: a.date, forWho: a.employee }) });
    if (!a.isAbsence && a.kind !== 'Arbeitsort' && canEditEntry(ctx, a.team, a.employee, areaOf(a)) && (a.kind === 'Bereitschaft') === !isDuty) items.push({ label: 'Bearbeiten', icon: 'edit', run: () => setDlg({ t: 'duty', preset: { edit: a } }) });
    if (canSwapDuty(ctx, a)) items.push({ label: 'Dienst tauschen', icon: 'refresh', run: () => shell.openSwapRequest(a.id) });
    if (w) {
      items.push({ label: 'Arbeitsort ändern', run: () => setDlg({ t: 'workplace', preset: { from: w.date, to: w.date, type: w.shift as 'Homeoffice', employee: w.employee } }) });
      items.push({ label: 'Arbeitsort entfernen', run: () => askDelete(w) });
    }
    items.push({ label: 'Löschen', icon: 'trash', danger: true, run: () => askDelete(a) });
    return items;
  };

  const noteStub = (g: NoteGroup, agenda?: boolean) => (
    <button key={g.id} type="button" className={`calendar-assignment note-assignment note-stub${agenda ? ' note-agenda' : ''}`} data-notes-open={g.employee + '|' + g.date} aria-label={`Notizen von ${g.employee} anzeigen`} onClick={() => setDlg({ t: 'notes', k: g.employee + '|' + g.date })}>
      <span className="note-indicator">
        <Icon name="chat" />
        Notizen{g.notes.length > 1 ? ` (${g.notes.length})` : ''}
      </span>
      <b>{g.employee}</b>
      <small>{g.team}</small>
    </button>
  );

  const dayCard = (a: Item) => {
    if (a.kind === 'NotizGruppe') return noteStub(a);
    const c = conflicts.has(a.id);
    const drag = movable(a);
    return (
      <div
        key={a.id}
        className={`calendar-assignment ${a.kind === 'Bereitschaft' ? 'standby-assignment ' : ''}${a.isAbsence ? 'absence-assignment ' : ''}${a.kind === 'Arbeitsort' ? 'workplace-assignment ' : ''}${c ? 'conflict ' : ''}`}
        title={`${a.employee} · ${a.shift}${c ? ' · Konflikt' : ''}`}
        style={{ '--shift-color': shiftHexColor(assignmentColor(a, data.teams, data.shiftTypes)) } as CSSProperties}
        draggable={drag}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', a.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        tabIndex={a.kind === 'Bereitschaft' ? 0 : undefined}
        onClick={a.kind === 'Bereitschaft' ? () => setDlg({ t: 'contact', id: a.id }) : undefined}
      >
        {c && !a.isAbsence && <span className="conflict-indicator">⚠ Konflikt</span>}
        {a.kind === 'Bereitschaft' ? isDuty && <span className="standby-indicator">◷ Bereitschaft</span> : a.kind === 'Arbeitsort' ? <span className="workplace-indicator">⌂ {a.shift}</span> : null}
        <b>{a.employee}</b>
        {isDuty && !a.isAbsence && ((a.start && a.end) || isVariableStandby(a)) ? (
          <span className="ca-shift ca-shift-row">
            <span className="ca-shift-name">{a.shift}</span>
            <span className="ca-time-inline">({a.start && a.end ? tRange(a) : 'variabel'})</span>
          </span>
        ) : (
          <>
            <span className="ca-shift">
              {a.isAbsence ? 'Abwesenheit: ' : ''}
              {a.shift}
            </span>
            {a.start && a.end ? <span className="ca-time">{tRange(a)}</span> : isVariableStandby(a) ? <span className="ca-time">variabel</span> : null}
          </>
        )}
        {wpHint(a)}
        {swapPill(a)}
        {a.note && (
          <div className="absence-note">
            <span className="absence-note-label">Bemerkung</span>
            <span>{a.note}</span>
          </div>
        )}
        {foot(<small>{a.team}</small>, noteChip(a))}
        <EntryMenu items={menuItems(a)} />
      </div>
    );
  };

  const agendaCard = (a: Item) => {
    if (a.kind === 'NotizGruppe') return noteStub(a, true);
    return (
      <div
        key={a.id}
        className={`mobile-agenda-card ${a.kind === 'Bereitschaft' ? 'standby-assignment' : ''} ${a.isAbsence ? 'absence-assignment' : ''} ${conflicts.has(a.id) ? 'conflict' : ''}`}
        style={{ '--shift-color': shiftHexColor(assignmentColor(a, data.teams, data.shiftTypes)) } as CSSProperties}
        onClick={a.kind === 'Bereitschaft' ? () => setDlg({ t: 'contact', id: a.id }) : undefined}
      >
        <div className="mobile-agenda-time">
          {a.start || (isVariableStandby(a) ? 'Var.' : '—')}
          <small>{a.end || ''}</small>
        </div>
        <div className="mobile-agenda-content">
          {a.kind === 'Bereitschaft' && isDuty && <span className="standby-indicator">◷ Bereitschaft</span>}
          <b>{a.kind === 'Arbeitsort' ? a.shift + ' (Arbeitsort)' : a.shift}</b>
          <span>{a.employee}</span>
          {wpHint(a)}
          {swapPill(a)}
          {foot(<small>{a.team}</small>, noteChip(a))}
        </div>
        <EntryMenu items={menuItems(a)} />
      </div>
    );
  };

  const dayStack = (date: string) => {
    const entries = dayEntries(date);
    if ((view === 'Monat' || view === 'Woche') && prefs.expandedMonthView) return entries.map((a) => dayCard(a));
    const shown = entries.slice(0, limit),
      remaining = entries.length - shown.length;
    return (
      <>
        {shown.map((a) => dayCard(a))}
        {remaining > 0 && (
          <button type="button" className="calendar-more" aria-label={`${remaining} weitere Einträge am ${date} anzeigen`} onClick={(e) => { e.stopPropagation(); setDlg({ t: 'day', date }); }}>
            +{remaining} weitere
          </button>
        )}
      </>
    );
  };

  /* Drop-Ziel (Drag & Drop) */
  const [dropOn, setDropOn] = useState('');
  const dropProps = (date: string, emp?: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDropOn(date + '|' + (emp || ''));
    },
    onDragLeave: () => setDropOn(''),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropOn('');
      const id = e.dataTransfer.getData('text/plain');
      if (id) void doMove(id, date, emp);
    },
  });
  const dropCls = (date: string, emp?: string) => (dropOn === date + '|' + (emp || '') ? ' drop-target' : '');

  /* Arbeitsort-Zeitraum per Ziehen über mehrere Tage markieren (Woche/Monat, Dienstplan) */
  const [range, setRange] = useState<{ a: string; b: string } | null>(null);
  useEffect(() => {
    if (!range) return;
    const up = () => {
      const [from, to] = range.a < range.b ? [range.a, range.b] : [range.b, range.a];
      setRange(null);
      document.body.classList.remove('dp-range-dragging');
      if (from !== to) setDlg({ t: 'workplace', preset: { from, to, type: 'Homeoffice' } });
    };
    document.addEventListener('pointerup', up);
    return () => document.removeEventListener('pointerup', up);
  }, [range]);
  const rangeProps = (date: string) =>
    isDuty && (view === 'Woche' || view === 'Monat')
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            if (e.button !== 0 || e.pointerType === 'touch' || (e.target as HTMLElement).closest('button,details,a,input,select,[draggable="true"]')) return;
            e.preventDefault();
            document.body.classList.add('dp-range-dragging');
            setRange({ a: date, b: date });
          },
          onPointerEnter: () => range && setRange({ ...range, b: date }),
        }
      : {};
  const inRange = (date: string) => !!range && date >= (range.a < range.b ? range.a : range.b) && date <= (range.a < range.b ? range.b : range.a);

  /* ---------- Ansichten ---------- */
  const ws = weekStart(cur),
    we = addDays(ws, n - 1);
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1),
    last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
  const shownTeams = data.teams.filter((t) => teamOk(t.name));
  const mobileDate = st?.mobileDate || '';
  const selectDay = (date: string, focusEmp?: string) => set({ mobileDate: date, date, ...(focusEmp !== undefined ? {} : {}) });
  const W = f.weekdays;
  let body: ReactNode = null;

  if (view === 'Woche') {
    const dates = Array.from({ length: n }, (_, i) => isoDate(addDays(ws, i)));
    const selected = mobileDate && dates.includes(mobileDate) ? mobileDate : dates.includes(isoDate(cur)) ? isoDate(cur) : dates[0];
    body = (
      <>
        <div className="week-grid compact-week cal-cols mobile-hide-calendar" style={{ '--cols': n } as CSSProperties}>
          {dates.map((date, i) => (
            <div key={'h' + date} className={`day-head ${date === today ? 'today' : ''}${holCls(date)}`}>
              {W[i]}
              <b>{day(date).getDate()}</b>
              {holTag(date)}
              {tnHead(date)}
            </div>
          ))}
          {dates.map((date) => (
            <div key={date} className={`week-day-cell ${date === today ? 'today' : ''}${holCls(date)}${dropCls(date)}${inRange(date) ? ' workplace-range-selected' : ''}`} data-calendar-day={date} {...dropProps(date)} {...rangeProps(date)}>
              {dayEntries(date).length || ownNoteField(date) ? (
                <>
                  {dayStack(date)}
                  {ownNoteField(date)}
                </>
              ) : (
                <span className="calendar-empty">—</span>
              )}
            </div>
          ))}
        </div>
        <div className="mobile-agenda-view mobile-week-view">
          <div className="mobile-date-strip cal-cols" style={{ '--cols': n } as CSSProperties}>
            {dates.map((date, i) => (
              <button key={date} type="button" className={`mobile-date-button ${date === selected ? 'selected' : ''} ${date === today ? 'is-today' : ''}${holCls(date)}`} onClick={() => selectDay(date)}>
                <small>{W[i]}</small>
                <b>{day(date).getDate()}</b>
                {dayEntries(date).length ? <i /> : null}
              </button>
            ))}
          </div>
          <div className="mobile-agenda-heading">
            <b>{f.fmtWithWeekday(day(selected))}</b>
            <span>{dayEntries(selected).length} Einträge</span>
          </div>
          {holTag(selected, 'hol-mobile')}
          {tnHead(selected, 'tn-mobile')}
          <div className="mobile-agenda-list">
            {dayEntries(selected).length ? dayEntries(selected).map((a) => agendaCard(a)) : <div className="mobile-agenda-empty">Keine Einträge für diesen Tag.</div>}
            {ownNoteField(selected, 'agenda-note-add')}
          </div>
        </div>
      </>
    );
  } else if (view === 'Monat') {
    const firstDow = (first.getDay() + 6) % 7,
      offset = firstDow < n ? firstDow : 0;
    const monthDays: string[] = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const x = new Date(cur.getFullYear(), cur.getMonth(), d, 12);
      if ((x.getDay() + 6) % 7 < n) monthDays.push(isoDate(x));
    }
    const monthKey = isoDate(first).slice(0, 7);
    const selected = mobileDate && mobileDate.startsWith(monthKey) ? mobileDate : isoDate(cur);
    body = (
      <>
        <div className="month-grid cal-cols mobile-hide-calendar" style={{ '--cols': n } as CSSProperties}>
          {W.slice(0, n).map((x) => (
            <div className="month-head" key={x}>
              {x}
            </div>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <div className="month-cell is-blank" key={'b' + i} />
          ))}
          {monthDays.map((date) => (
            <div key={date} className={`month-cell ${date === today ? 'today' : ''}${holCls(date)}${dropCls(date)}${inRange(date) ? ' workplace-range-selected' : ''}`} data-calendar-day={date} {...dropProps(date)} {...rangeProps(date)}>
              <div className="date">{day(date).getDate()}</div>
              {holTag(date, 'hol-month')}
              {data.teamNotes.some((x) => x.date === date && tnShown.has(x.team)) && tnHead(date, 'tn-month')}
              {dayStack(date)}
            </div>
          ))}
        </div>
        <div className="mobile-agenda-view mobile-month-view">
          <div className="mobile-month-overview">
            <div className="mobile-month-title">
              <div>
                <span>MONATSÜBERSICHT</span>
                <b>{f.monthName(cur)}</b>
              </div>
              <small>{visible.filter((a) => a.date.startsWith(monthKey)).length} Einträge im Monat</small>
            </div>
            <div className="mobile-month-grid cal-cols" style={{ '--cols': n } as CSSProperties}>
              {W.slice(0, n).map((x) => (
                <span className="mobile-month-weekday" key={x}>
                  {x}
                </span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span className="mobile-month-blank" key={'mb' + i} />
              ))}
              {monthDays.map((date) => {
                const count = dayEntries(date).length;
                return (
                  <button key={date} type="button" className={`mobile-month-day ${date === selected ? 'selected' : ''} ${date === today ? 'is-today' : ''} ${count ? 'has-entries' : ''}${holCls(date)}`} onClick={() => selectDay(date)}>
                    <span>{day(date).getDate()}</span>
                    {count ? <i>{count > 9 ? '9+' : count}</i> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mobile-month-selected-day">
            <div className="mobile-agenda-heading">
              <div>
                <span>GEWÄHLTER TAG</span>
                <b>{f.fmtWithWeekday(day(selected))}</b>
              </div>
              <span className="mobile-month-entry-count">
                {dayEntries(selected).length} {dayEntries(selected).length === 1 ? 'Eintrag' : 'Einträge'}
              </span>
            </div>
            {holTag(selected, 'hol-mobile')}
            {tnHead(selected, 'tn-mobile')}
            <div className="mobile-agenda-list">{dayEntries(selected).length ? dayEntries(selected).map((a) => agendaCard(a)) : <div className="mobile-agenda-empty">Keine Einträge für diesen Tag.</div>}</div>
          </div>
        </div>
      </>
    );
  } else if (view === 'Team' || view === 'Zeitleiste') {
    body = (
      <TeamMatrix
        dates={Array.from({ length: n }, (_, i) => isoDate(addDays(ws, i)))}
        ws={ws}
        shownTeams={shownTeams}
        isDuty={isDuty}
        today={today}
        member={member}
        onlyConflicts={onlyConflicts}
        dayEntries={dayEntries}
        dayCard={dayCard}
        agendaCard={agendaCard}
        noteAddField={noteAddField}
        holTag={holTag}
        holCls={holCls}
        tnHead={tnHead}
        dropProps={dropProps}
        dropCls={dropCls}
        mobileDate={mobileDate}
        onSelectDay={selectDay}
        onQuickAdd={(team, emp, date) => setDlg({ t: 'duty', preset: { team, employee: emp, date } })}
        conflicts={conflicts}
        visible={visible}
        wpFor={wp.wpFor}
        sortable={isDuty && view === 'Team'}
      />
    );
  } else {
    const date = isoDate(cur),
      entries = dayEntries(date);
    body = (
      <>
        {holTag(date, 'hol-day')}
        {tnHead(date, 'tn-day')}
        <div className={`day-assignment-list${dropCls(date)}`} {...dropProps(date)}>
          {entries.length ? (
            entries.map((a) => (
              <div className="day-assignment-row" key={a.id}>
                {dayCard(a)}
              </div>
            ))
          ) : (
            <div className="empty-note">Für diesen Tag sind noch keine Dienste eingetragen.</div>
          )}
          {ownNoteField(date, 'day-note-add')}
        </div>
      </>
    );
  }

  /* ---------- Kopf: Aktionen, Navigation, Filter ---------- */
  const actions: { id: string; label: string; icon: string; desc: string; primary?: boolean; run: () => void }[] = [];
  if (isDuty) {
    actions.push({ id: 'add-workplace', label: 'Arbeitsort', icon: 'home', desc: 'Homeoffice oder Büro eintragen', run: () => setDlg({ t: 'workplace', preset: {} }) });
    if (absenceTeams(ctx).length) actions.push({ id: 'add-absence', label: 'Abwesenheit', icon: 'travel', desc: 'Urlaub, Krankenstand & Co. eintragen', run: () => setDlg({ t: 'absence' }) });
    if (features.rotationDuty !== false && canManageAny && manageableTeams(ctx, 'Dienstplan').some((t) => data.shiftTypes.some((s) => s.team === t.name)))
      actions.push({ id: 'duty-rotation', label: 'Rotation automatisch planen', icon: 'spark', desc: 'Dienste im Wechsel automatisch verteilen', run: () => setDlg({ t: 'rotDuty' }) });
    if (canAdd) actions.push({ id: 'add', label: 'Eintrag erstellen', icon: 'plus', desc: 'Neuen Dienst einteilen', primary: true, run: () => setDlg({ t: 'duty', preset: { date: isoDate(new Date()) } }) });
  } else {
    if (features.rotationStandby !== false && canManageAny && data.standbyTimes.length)
      actions.push({ id: 'auto-rotation', label: 'Rotation automatisch planen', icon: 'spark', desc: 'Bereitschaften im Wechsel automatisch verteilen', run: () => setDlg({ t: 'rotStandby' }) });
    if (canAdd) actions.push({ id: 'add', label: 'Bereitschaft einteilen', icon: 'plus', desc: 'Neue Bereitschaft einteilen', primary: true, run: () => setDlg({ t: 'duty', preset: { date: isoDate(new Date()) } }) });
  }
  const secondary = actions.filter((a) => !a.primary).length;

  const step = (dir: 1 | -1) => {
    const d = new Date(cur);
    if (view === 'Monat') {
      d.setDate(1);
      d.setMonth(d.getMonth() + dir);
    } else d.setDate(d.getDate() + (view === 'Tag' ? dir : dir * 7));
    set({ date: isoDate(d), mobileDate: '' });
  };
  const rangeLabel =
    view === 'Woche' || view === 'Team' || view === 'Zeitleiste' ? (
      <>
        {f.fmt(ws)} – {f.fmt(we)} <span className="kw-pill">KW {isoWeek(ws)}</span>
      </>
    ) : view === 'Monat' ? (
      f.monthName(cur)
    ) : (
      f.fmtWithWeekday(cur)
    );
  const pickRef = useRef<HTMLButtonElement>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const closePick = useCallback(() => setPickOpen(false), []);
  const conflictCount = [...conflicts].filter((id) => {
    const a = data.entries.find((x) => x.id === id);
    return a && !a.isAbsence && teamOk(a.team);
  }).length;
  const memberOptions = data.staff.filter((s) => !calTeams.length || data.teams.some((t) => calTeams.includes(t.name) && t.memberIds.includes(s.id)));

  return (
    <>
      <Heading
        title={area}
        actions={
          actions.length ? (
            <>
              <span className={`dp-actions${secondary ? '' : ' no-secondary'}`}>
                {actions.map((a) => (
                  <button key={a.id} id={a.id} className={`btn ${a.primary ? 'primary' : ''}`} onClick={a.run}>
                    <Icon name={a.icon} className={a.icon === 'travel' ? 'ic-fill' : ''} />
                    {a.label}
                  </button>
                ))}
              </span>
              <button type="button" className={`btn dp-actions-toggle${secondary ? '' : ' no-secondary'}`} aria-haspopup="menu" onClick={() => setDlg({ t: 'actions' })}>
                <Icon name="grid" className="dp-act-ic" />
                <span>Aktionen</span>
                <Icon name="down" className="dp-act-caret" />
              </button>
            </>
          ) : null
        }
      />
      <div className={`calendar-shell panel standby-shell${isDuty ? ' duty-shell' : ''}`}>
        <div className="calendar-toolbar">
          <div className="calendar-nav">
            <button className="btn" aria-label="Zurück" onClick={() => step(-1)}>
              ‹
            </button>
            <button
              ref={pickRef}
              type="button"
              className={`cal-pick${pickOpen ? ' open' : ''}`}
              title={view === 'Tag' ? 'Tag auswählen' : view === 'Monat' ? 'Monat auswählen' : 'Kalenderwoche auswählen'}
              aria-haspopup="dialog"
              aria-expanded={pickOpen}
              onClick={(e) => {
                e.stopPropagation();
                setPickOpen((o) => !o);
              }}
            >
              <strong>{rangeLabel}</strong>
            </button>
            {pickOpen &&
              (view === 'Monat' ? (
                <MonthPickerPop anchor={pickRef.current} value={isoDate(cur)} onClose={closePick} onPick={(v) => set({ date: v, mobileDate: '' })} />
              ) : (
                <DayPickerPop anchor={pickRef.current} value={isoDate(cur)} week={view !== 'Tag'} onClose={closePick} onPick={(v) => v && set({ date: v, mobileDate: '' })} />
              ))}
            <button className="btn" aria-label="Weiter" onClick={() => step(1)}>
              ›
            </button>
            <button className="btn" onClick={() => set({ date: isoDate(new Date()), mobileDate: '' })}>
              Heute
            </button>
          </div>
          <div className="view-switch">
            {views.map((v) => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => set({ view: v, mobileDate: '' })}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="cal-filterbar">
          <label className="search-field">
            <Icon name="search" />
            <input
              type="search"
              list={`member-options-${area}`}
              placeholder="Mitarbeiter suchen …"
              defaultValue={member === 'Alle Mitarbeiter' ? '' : member}
              key={member}
              autoComplete="off"
              onChange={(e) => {
                const v = e.target.value.trim();
                if (!v) set({ member: 'Alle Mitarbeiter' });
                else if (data.staff.some((s) => s.name === v)) set({ member: v });
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const v = (e.target as HTMLInputElement).value.trim();
                if (v && v !== 'Alle Mitarbeiter' && !data.staff.some((s) => s.name === v)) toast('Kein Mitarbeiter mit diesem Namen gefunden.');
              }}
            />
            <datalist id={`member-options-${area}`}>
              <option value="Alle Mitarbeiter" />
              {memberOptions.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </label>
          <TeamFilter
            teams={data.teams.map((t) => ({ name: t.name, color: teamColor(t) }))}
            selected={calTeams}
            count={(nm) => data.teams.find((t) => t.name === nm)?.memberIds.length || 0}
            onChange={(next) => {
              const keepMember = member === 'Alle Mitarbeiter' || !next.length || data.staff.some((s) => s.name === member && data.teams.some((t) => next.includes(t.name) && t.memberIds.includes(s.id)));
              set({ teams: next, ...(keepMember ? {} : { member: 'Alle Mitarbeiter' }) });
            }}
          />
          {isDuty && (
            <button type="button" className={`chip ${onlyConflicts ? 'active warn' : ''}`} onClick={() => set({ onlyConflicts: !onlyConflicts })}>
              <Icon name="alert" />
              Nur Konflikte{conflicts.size ? ` · ${conflictCount}` : ''}
            </button>
          )}
          {(member !== 'Alle Mitarbeiter' || calTeams.length > 0 || onlyConflicts) && (
            <button type="button" className="link-btn" onClick={() => set({ teams: [], onlyConflicts: false, member: 'Alle Mitarbeiter' })}>
              Filter zurücksetzen
            </button>
          )}
          <div className="legend push-right">
            <span>
              <Dot color="#3974c6" />
              Dienst
            </span>
            <span>
              <i className="lg-standby" />
              Bereitschaft
            </span>
            <span>
              <i className="lg-absence">Abw.</i>Abwesenheit
            </span>
            <span>
              <Icon name="home" />
              Homeoffice
            </span>
          </div>
        </div>
        <div className={`calendar-card ${view === 'Monat' ? 'month-compact-card' : ''} view-${view.toLowerCase()}`}>
          <div className="calendar-scroll">{body}</div>
        </div>
      </div>

      {dlg?.t === 'duty' && <DutyDialog area={area} preset={dlg.preset} onClose={() => setDlg(null)} />}
      {dlg?.t === 'absence' && <AbsenceDialog onClose={() => setDlg(null)} />}
      {dlg?.t === 'workplace' && <WorkplaceDialog preset={dlg.preset} onClose={() => setDlg(null)} />}
      {dlg?.t === 'rotStandby' && <StandbyRotationDialog current={cur} preTeams={calTeams} onClose={() => setDlg(null)} />}
      {dlg?.t === 'rotDuty' && <DutyRotationDialog current={cur} preTeams={calTeams} onClose={() => setDlg(null)} />}
      {isDuty && <NoteTip />}
      {dlg?.t === 'notes' && <NotesPopup k={dlg.k} onClose={() => setDlg(null)} onEdit={(nn) => setDlg({ t: 'note', note: nn })} onAdd={(emp, date) => setDlg({ t: 'note', date, forWho: emp })} />}
      {dlg?.t === 'note' && <NoteDialog note={dlg.note} date={dlg.date} forWho={dlg.forWho} onClose={() => setDlg(null)} />}
      {dlg?.t === 'teamNotes' && <TeamNotesPopup date={dlg.date} shown={tnShown} onClose={() => setDlg(null)} onEdit={(nn) => setDlg({ t: 'teamNote', note: nn })} onAdd={() => setDlg({ t: 'teamNote', date: dlg.date })} />}
      {dlg?.t === 'teamNote' && <TeamNoteDialog note={dlg.note} date={dlg.date} preferTeam={calTeams[0]} onClose={() => setDlg(null)} />}
      {dlg?.t === 'contact' && <StandbyContact id={dlg.id} onClose={() => setDlg(null)} />}
      {dlg?.t === 'day' && (
        <InfoDialog title={f.fmtWithWeekday(day(dlg.date))} sub={`${dayEntries(dlg.date).length} Einträge`} onClose={() => setDlg(null)} className="day-details-modal">
          <div className="day-assignment-list">
            {dayEntries(dlg.date).map((a) => (
              <div className="day-assignment-row" key={a.id}>
                {dayCard(a)}
              </div>
            ))}
          </div>
        </InfoDialog>
      )}
      {dlg?.t === 'actions' && (
        <div className="modal-backdrop app-dialog dp-sheet-layer show" onClick={(e) => e.target === e.currentTarget && setDlg(null)}>
          <div className="dp-sheet" role="dialog" aria-modal="true">
            <div className="dp-sheet-grip" aria-hidden="true" />
            <div className="dp-sheet-head">
              <b>Aktionen</b>
              <button type="button" className="icon-btn" aria-label="Schließen" onClick={() => setDlg(null)}>
                ×
              </button>
            </div>
            <div className="dp-sheet-list">
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`dp-sheet-item ${a.primary ? 'primary' : ''}`}
                  onClick={() => {
                    setDlg(null);
                    setTimeout(a.run, 30);
                  }}
                >
                  <span className="dp-sheet-ic">
                    <Icon name={a.icon} />
                  </span>
                  <span className="dp-sheet-txt">
                    <b>{a.label}</b>
                    <small>{a.desc}</small>
                  </span>
                  <Icon name="chev" className="dp-sheet-chev" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ======================= Aktionsmenü „⋯“ eines Eintrags ======================= */
interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  run: () => void;
}
function EntryMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  /* Menü hängt (wie bisher) direkt am <body>, damit es nicht von Kalenderzellen abgeschnitten wird */
  useLayoutEffect(() => {
    if (!open || !btn.current || !menu.current) return;
    const r = btn.current.getBoundingClientRect(),
      m = menu.current,
      h = m.offsetHeight,
      w = m.offsetWidth;
    m.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, r.bottom + 4)) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menu.current?.contains(t)) return;
      close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  return (
    <div className={`duty-actions ${open ? 'open' : ''}`} ref={ref} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button ref={btn} type="button" className="duty-actions-sum" aria-label="Dienstaktionen" title="Dienstaktionen" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open &&
        createPortal(
          <div ref={menu} className="duty-actions-menu" role="menu" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={it.danger ? 'danger-text' : ''}
                onClick={() => {
                  setOpen(false);
                  it.run();
                }}
              >
                {it.icon && <Icon name={it.icon} />}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ======================= Team-Ansicht / Zeitleiste ======================= */
function TeamMatrix(props: {
  dates: string[];
  ws: Date;
  shownTeams: ReturnType<typeof useApp>['data']['teams'];
  isDuty: boolean;
  today: string;
  member: string;
  onlyConflicts: boolean;
  dayEntries: (d: string) => Item[];
  dayCard: (a: Item) => ReactNode;
  agendaCard: (a: Item) => ReactNode;
  noteAddField: (date: string, emp?: string, cls?: string) => ReactNode;
  holTag: (d: string, cls?: string) => ReactNode;
  holCls: (d: string) => string;
  tnHead: (d: string, cls?: string) => ReactNode;
  dropProps: (date: string, emp?: string) => object;
  dropCls: (date: string, emp?: string) => string;
  mobileDate: string;
  onSelectDay: (d: string) => void;
  onQuickAdd: (team: string, emp: string, date: string) => void;
  conflicts: Set<string>;
  visible: Entry[];
  wpFor: (a: Entry) => Entry | null;
  sortable: boolean;
}) {
  const { ctx, data, user, prefs, setPrefs, f, teamColor } = useApp();
  const { dates, ws, shownTeams, isDuty, today, member, onlyConflicts, dayEntries, dayCard, agendaCard, noteAddField, holTag, holCls, tnHead, dropProps, dropCls } = props;
  const editArea = isDuty ? 'Dienstplan' : 'Bereitschaft';
  const isWork = (a: Item) => (isDuty ? a.kind === 'Dienstplan' && !(a as Entry).isAbsence : a.kind === 'Bereitschaft');
  const sbOn = (team: string, date: string) => data.entries.find((a) => a.kind === 'Bereitschaft' && a.team === team && a.date === date);
  const W = f.weekdays;
  const [dragMember, setDragMember] = useState<string | null>(null);
  const reorder = (teamId: string, fromId: string, toId: string) => {
    const t = data.teams.find((x) => x.id === teamId);
    if (!t || fromId === toId) return;
    const ids = orderedMembers(t, data.staff, prefs.memberOrder[teamId]).map((p) => p.id);
    const i = ids.indexOf(fromId);
    ids.splice(i, 1);
    ids.splice(ids.indexOf(toId), 0, fromId);
    setPrefs({ memberOrder: { ...prefs.memberOrder, [teamId]: ids } });
  };
  const rows: ReactNode[] = [];
  shownTeams.forEach((t) => {
    const all = orderedMembers(t, data.staff, prefs.memberOrder[t.id]);
    let members = member === 'Alle Mitarbeiter' ? all : all.filter((p) => p.name === member);
    if (onlyConflicts) members = members.filter((p) => dates.some((d) => dayEntries(d).some((a) => a.employee === p.name)));
    if (!members.length) return;
    const color = teamColor(t),
      manage = canManageTeam(ctx, t.name) && canEdit(ctx, editArea);
    if (shownTeams.length > 1)
      rows.push(
        <div className="tm-row tm-team" key={'t' + t.id}>
          <div className="tm-name">
            <Dot color={color} />
            <b>{t.name}</b>
            <small>{all.length} Mitarbeiter</small>
          </div>
          {dates.map((date) => {
            if (!isDuty) {
              return sbOn(t.name, date) ? (
                <div key={date} className={`tm-cov tm-cov-blank ${date === today ? 'today' : ''}`} />
              ) : (
                <div key={date} className={`tm-cov ${date === today ? 'today' : ''}`}>
                  {manage ? (
                    <button type="button" className="sb-gap" title="Unbesetzt – jetzt einteilen" onClick={() => props.onQuickAdd(t.name, '', date)}>
                      <Icon name="alert" />
                      Lücke
                    </button>
                  ) : (
                    <span className="sb-gap">
                      <Icon name="alert" />
                      Lücke
                    </span>
                  )}
                </div>
              );
            }
            const c = all.filter((p) => data.entries.some((a) => a.date === date && a.employee === p.name && a.kind === 'Dienstplan' && !a.isAbsence)).length;
            const pct = all.length ? Math.round((c / all.length) * 100) : 0;
            return (
              <div key={date} className={`tm-cov ${date === today ? 'today' : ''}`}>
                <span className="cov-bar">
                  <i style={{ width: `${pct}%` }} className={pct >= 80 ? 'ok' : pct >= 50 ? 'mid' : 'low'} />
                </span>
                {c}/{all.length}
              </div>
            );
          })}
        </div>,
      );
    members.forEach((p) => {
      const role = t.leaderId === p.id ? 'Teamleiter' : t.deputyId === p.id ? 'Stellvertretung' : 'Mitarbeiter';
      const hrs = isDuty ? weekHoursOf(data.entries, p.name, ws) : 0;
      const sbDays = dates.filter((dt) => data.entries.some((a) => a.kind === 'Bereitschaft' && a.employee === p.name && a.date === dt)).length;
      const ord = props.sortable && all.length > 1;
      rows.push(
        <div className="tm-row" key={t.id + p.id}>
          <div
            className={`tm-name tm-person ${ord ? 'tm-draggable' : ''}`}
            draggable={ord}
            title={ord ? 'Ziehen, um die Reihenfolge zu ändern' : undefined}
            onDragStart={(e) => {
              if (!ord) return;
              setDragMember(p.id);
              e.dataTransfer.setData('application/x-member', t.id + '|' + p.id);
            }}
            onDragOver={(e) => ord && dragMember && e.preventDefault()}
            onDrop={(e) => {
              const v = e.dataTransfer.getData('application/x-member');
              if (!v) return;
              e.preventDefault();
              const [tid, pid] = v.split('|');
              if (tid === t.id) reorder(t.id, pid, p.id);
              setDragMember(null);
            }}
          >
            {ord && (
              <span className="tm-grip" aria-hidden="true">
                ⋮⋮
              </span>
            )}
            <Avatar name={p.name} color={color} size={32} />
            <div>
              <b>{p.name}</b>
              <small>
                {role} · {isDuty ? `${hrs.toLocaleString(f.locale, { maximumFractionDigits: 1 })} h/Woche` : `◷ ${sbDays} Tage`}
              </small>
            </div>
          </div>
          {dates.map((date) => {
            const items = dayEntries(date).filter((a) => a.employee === p.name);
            const canQuick = (manage || (p.id === user.id && selfEditAllowed(ctx, t.name, editArea))) && !onlyConflicts && !items.some(isWork) && (isDuty || !sbOn(t.name, date)) && !(isDuty && isHoliday(date));
            return (
              <div key={date} className={`tm-cell ${date === today ? 'today' : ''}${holCls(date)}${dropCls(date, p.name)}`} {...dropProps(date, p.name)}>
                {items.map((a) => dayCard(a))}
                {items.some((a) => a.kind !== 'Bereitschaft') ? null : noteAddField(date, p.name, 'tm-note-add')}
                {canQuick && (
                  <button type="button" className="tm-add" title={`${isDuty ? 'Dienst' : 'Bereitschaft'} für ${p.name} am ${date} anlegen`} aria-label={`${isDuty ? 'Dienst' : 'Bereitschaft'} anlegen`} onClick={() => props.onQuickAdd(t.name, p.name, date)}>
                    +
                  </button>
                )}
              </div>
            );
          })}
        </div>,
      );
    });
  });

  /* Handy: Wochenübersicht + Details zum gewählten Tag */
  const selDay = props.mobileDate && dates.includes(props.mobileDate) ? props.mobileDate : dates.includes(today) ? today : dates[0];
  /* Kompakte Wochenübersicht je Team (wie bisher): Abdeckung pro Tag, je Person ein Feld mit Dienstkürzel */
  const abbr = (a: Entry) => (a.kind === 'Arbeitsort' ? (a.shift === 'Homeoffice' ? 'HO' : 'BÜ') : String(a.shift || '').replace(/[^A-Za-zÄÖÜäöüß0-9]/g, '').slice(0, 2) || '•');
  const legendMap = new Map<string, string>();
  const tileFor = (items: Entry[]) => {
    const duty = items.find((a) => a.kind === 'Dienstplan' && !a.isAbsence),
      abs = items.find((a) => a.isAbsence),
      sb = items.find((a) => a.kind === 'Bereitschaft'),
      wp = items.find((a) => a.kind === 'Arbeitsort') || (duty && props.wpFor(duty)),
      nt = items.find((a) => a.kind === 'Notiz');
    const main = abs || duty;
    const out: ReactNode[] = [];
    if (main) {
      legendMap.set(abbr(main), main.shift);
      out.push(
        <span key="m" className={`mt-tile ${abs ? 'is-absence' : ''} ${props.conflicts.has(main.id) ? 'is-conflict' : ''}`} style={{ '--shift-color': shiftHexColor(assignmentColor(main, data.teams, data.shiftTypes)) } as CSSProperties}>
          {abbr(main)}
        </span>,
      );
    } else if (sb) {
      out.push(
        <span key="s" className="mt-tile is-standby" style={{ '--shift-color': shiftHexColor(assignmentColor(sb, data.teams, data.shiftTypes)) } as CSSProperties}>
          ◷
        </span>,
      );
    } else out.push(<span key="e" className="mt-empty" />);
    if (sb) out.push(<i key="sb" className="mt-sb" style={{ '--c': shiftHexColor(assignmentColor(sb, data.teams, data.shiftTypes)) } as CSSProperties} title="Bereitschaft" />);
    if (wp && wp.shift === 'Homeoffice') out.push(<i key="ho" className="mt-ho" title="Homeoffice">⌂</i>);
    if (nt) out.push(<i key="nt" className="mt-note" title="Notizen anzeigen" data-notes-open={noteKey(nt)}>✎</i>);
    return out;
  };
  const [focusEmp, setFocusEmp] = useState('');
  useEffect(() => {
    if (!focusEmp) return;
    const card = [...document.querySelectorAll<HTMLElement>('[data-emp-card]')].find((c) => c.dataset.empCard === focusEmp);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusEmp, selDay]);
  const mWeek = shownTeams.map((t) => {
    const all = orderedMembers(t, data.staff, prefs.memberOrder[t.id]);
    const members = member === 'Alle Mitarbeiter' ? all : all.filter((p) => p.name === member);
    if (!members.length) return null;
    const color = teamColor(t);
    const cov = (date: string) => (!isDuty ? (sbOn(t.name, date) ? 1 : 0) : all.filter((p) => data.entries.some((a) => a.date === date && a.employee === p.name && a.kind === 'Dienstplan' && !a.isAbsence)).length);
    return (
      <div className="mt-team" key={t.id}>
        <div className="mt-team-name">
          <Dot color={color} />
          {t.name}
        </div>
        <div className="mt-grid cal-cols" style={{ '--cols': dates.length } as CSSProperties}>
          <span className="mt-corner" />
          {dates.map((date) => {
            const c = cov(date),
              pct = all.length ? c / all.length : 0;
            return (
              <button key={date} type="button" className={`mt-cov ${date === selDay ? 'sel' : ''} ${isDuty ? (pct >= 0.8 ? 'ok' : pct >= 0.5 ? 'mid' : 'low') : c ? 'ok' : 'low'}`} onClick={() => { setFocusEmp(''); props.onSelectDay(date); }}>
                {isDuty ? `${c}/${all.length}` : c ? '✓' : '!'}
              </button>
            );
          })}
          {members.map((p) => {
            const short = p.name.split(' ');
            return (
              <Fragment key={p.id}>
                <span className="mt-name">
                  {short[0]} {(short[1] || '').charAt(0)}.
                </span>
                {dates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className={`mt-cell ${date === selDay ? 'sel' : ''} ${date === today ? 'is-today' : ''}`}
                    aria-label={`${p.name} ${date}`}
                    onClick={() => {
                      setFocusEmp(p.name);
                      props.onSelectDay(date);
                    }}
                  >
                    {tileFor(props.visible.filter((a) => a.date === date && a.employee === p.name))}
                  </button>
                ))}
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  });
  const legend = [...legendMap.entries()].slice(0, 8);
  return (
    <>
      <div className="team-matrix-scroll">
        <div className="team-matrix" style={{ '--cols': dates.length } as CSSProperties}>
          <div className="tm-row tm-head">
            <div className="tm-name">Mitarbeiter</div>
            {dates.map((date, i) => (
              <div key={date} className={date === today ? 'today' : ''}>
                {W[i]}
                <b>{f.fmtShort(day(date))}</b>
                {holTag(date, 'hol-tm')}
                {tnHead(date, 'tn-tm')}
              </div>
            ))}
          </div>
          {rows.length ? rows : <div className="empty-note">{onlyConflicts ? 'Keine Konflikte in dieser Woche. 🎉' : 'Keine Mitarbeiter für diesen Filter.'}</div>}
        </div>
      </div>
      <div className="mobile-team-view">
        <div className="mt-head">
          <b>Wochenübersicht</b>
          <small>Tippe auf einen Tag oder ein Feld, um Details zu sehen.</small>
        </div>
        <div className="mt-days cal-cols" style={{ '--cols': dates.length } as CSSProperties}>
          <span className="mt-corner" />
          {dates.map((date, i) => (
            <button key={date} type="button" className={`mt-day ${date === selDay ? 'sel' : ''} ${date === today ? 'is-today' : ''}${holCls(date)}`} onClick={() => props.onSelectDay(date)}>
              <small>{W[i]}</small>
              <b>{day(date).getDate()}</b>
            </button>
          ))}
        </div>
        {mWeek.some(Boolean) ? mWeek : <div className="empty-note">Keine Mitarbeiter für diesen Filter.</div>}
        <div className="mt-legend">
          {legend.map(([k, v]) => (
            <span key={k}>
              <b>{k}</b> {v}
            </span>
          ))}
          <span>
            <i className="mt-sb" style={{ '--c': '#159da8' } as CSSProperties} /> Bereitschaft
          </span>
          <span>
            <span className="mt-tile is-absence mini">U</span> Abwesenheit
          </span>
        </div>
        <div className="md-heading">
          <b>{f.fmtWithWeekday(day(selDay))}</b>
        </div>
        {holTag(selDay, 'hol-mobile')}
        {tnHead(selDay, 'tn-mobile')}
        {shownTeams.map((t) => {
          const all = orderedMembers(t, data.staff, prefs.memberOrder[t.id]);
          const members = member === 'Alle Mitarbeiter' ? all : all.filter((p) => p.name === member);
          if (!members.length) return null;
          const color = teamColor(t);
          const manage = canManageTeam(ctx, t.name) && canEdit(ctx, editArea);
          const c = isDuty ? all.filter((p) => data.entries.some((a) => a.date === selDay && a.employee === p.name && a.kind === 'Dienstplan' && !a.isAbsence)).length : 0;
          const selSb = !isDuty && sbOn(t.name, selDay);
          return (
            <div className="md-team" key={t.id}>
              <div className="md-team-head">
                <span>
                  <Dot color={color} />
                  <b>{t.name}</b>
                </span>
                {isDuty ? (
                  <span className={`md-cov ${c / all.length >= 0.8 ? 'ok' : c / all.length >= 0.5 ? 'mid' : 'low'}`}>
                    {c}/{all.length}
                  </span>
                ) : selSb ? (
                  <span className="md-cov ok">{selSb.employee}</span>
                ) : (
                  <span className="md-cov low">Lücke</span>
                )}
              </div>
              {members.map((p) => {
                const items = dayEntries(selDay).filter((a) => a.employee === p.name);
                const has = items.some(isWork) || (!isDuty && !!selSb);
                return (
                  <div className={`md-person${focusEmp === p.name ? ' focus' : ''}`} key={p.id} data-emp-card={p.name}>
                    <div className="md-person-head">
                      <Avatar name={p.name} color={color} size={32} />
                      <div>
                        <b>{p.name}</b>
                        <small>{t.leaderId === p.id ? 'Teamleiter' : t.deputyId === p.id ? 'Stellvertretung' : 'Mitarbeiter'}</small>
                      </div>
                      {(manage || (p.id === user.id && selfEditAllowed(ctx, t.name, editArea))) && !has && (
                        <button type="button" className="btn small" onClick={() => props.onQuickAdd(t.name, p.name, selDay)}>
                          {isDuty ? '＋ Dienst' : '＋ Bereitschaft'}
                        </button>
                      )}
                    </div>
                    {items.length ? (
                      <div className="md-entries">
                        {items.map((a) => agendaCard(a))}
                      </div>
                    ) : (
                      <div className="md-free">Kein Eintrag</div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ======================= Bereitschaft: Kontakt-Popup ======================= */
function StandbyContact({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, f, teamColor } = useApp();
  const a = data.entries.find((x) => x.id === id);
  if (!a) return null;
  const p = data.staff.find((x) => x.name === a.employee);
  const num = p?.phone || '',
    mail = p?.email || '',
    c = teamColor(a.team);
  const now = new Date(),
    hm = now.toTimeString().slice(0, 5);
  const active = a.date === isoDate(now) && (!a.start || !a.end || (a.end > a.start ? hm >= a.start && hm < a.end : hm >= a.start || hm < a.end));
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wp-modal sbc-modal" role="dialog" aria-modal="true">
        <div className="wp-head">
          <span className="wp-head-icon">
            <Icon name="moon" />
          </span>
          <div>
            <h2>Bereitschaft kontaktieren</h2>
            <p className="small muted">
              {a.shift || 'Bereitschaft'} · {f.fmtWithWeekday(day(a.date))}
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="wp-form">
          <div className="wp-field">
            <span className="wp-label">Person</span>
            <div className="sbc-person">
              <Avatar name={a.employee} color={c} size={40} />
              <span>
                <b>{a.employee}</b>
                <small>
                  <Dot color={c} />
                  {a.team}
                </small>
              </span>
              {active && <span className="pill sbc-live">● Jetzt in Bereitschaft</span>}
            </div>
          </div>
          <div className="wp-field">
            <span className="wp-label">Zeit</span>
            <div className="sbc-value">
              <Icon name="clock" />
              <b>{a.start && a.end ? tRange(a) + ' Uhr' : isVariableStandby(a) ? 'variabel' : 'ganztägig'}</b>
            </div>
          </div>
          <div className="wp-field">
            <span className="wp-label">Bereitschaftsnummer</span>
            <div className="sbc-value">
              <Icon name="phone" />
              <b className={num ? '' : 'muted'}>{num || 'nicht hinterlegt'}</b>
            </div>
          </div>
          {(!num || !mail) && (
            <small className="wp-note">
              {!num ? 'Keine Bereitschaftsnummer hinterlegt. ' : ''}
              {!mail ? 'Keine E-Mail für Teams hinterlegt.' : ''}
            </small>
          )}
          <div className="btn-row modal-actions wp-actions">
            <span className="wp-actions-right">
              {mail ? (
                <a className="btn sbc-teams" href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(mail)}`} target="_blank" rel="noopener noreferrer">
                  <Icon name="chat" />
                  Teams-Chat
                </a>
              ) : (
                <span className="btn sbc-teams is-off" aria-disabled="true">
                  <Icon name="chat" />
                  Teams-Chat
                </span>
              )}
              {num ? (
                <a className="btn primary sbc-call" href={`tel:${num.replace(/[^\d+]/g, '')}`}>
                  <Icon name="phone" />
                  Anrufen
                </a>
              ) : (
                <span className="btn primary sbc-call is-off" aria-disabled="true">
                  <Icon name="phone" />
                  Anrufen
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

