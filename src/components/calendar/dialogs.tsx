'use client';
/* Eingabemasken im Kalender: Dienst/Bereitschaft, Abwesenheit, Arbeitsort, Rotation */
import { useMemo, useState } from 'react';
import { useApp } from '../AppProvider';
import { Avatar, DateRange, Field, Icon, Modal, ModalActions, MultiPick, Picker, TimeRange } from '../ui';
import { addDays, day, daysBetween, durationHours, eachDay, isoDate, timeSpan, validDateInput, weekStart } from '@/lib/dates';
import { isHoliday } from '@/lib/holidays';
import {
  ABSENCE_KINDS,
  fullDayAbsent,
  isVariableStandby,
  LUNCH_MIN,
  shiftHexColor,
  shiftMulti,
  standbyDayOk,
  standbyDaysLabel,
  standbyRestricted,
  standbyTimeAllTeams,
  standbyTimeForTeam,
  standbyTimeTeams,
  TIMED_ABSENCES,
  tRange,
} from '@/lib/entries';
import { absenceTeamFor, absenceTeams, canCreateAbsenceFor, entryTeams, manageableTeams, selfOnly } from '@/lib/access';
import { createAbsence, runDutyRotation, runStandbyRotation, saveDuty, saveWorkplace } from '@/server/actions/entries';
import type { Entry } from '@/lib/types';

const today = () => isoDate(new Date());

/* ======================= Dienst / Bereitschaft einteilen ======================= */
export interface DutyPreset {
  team?: string;
  employee?: string;
  date?: string;
  dateTo?: string;
  edit?: Entry;
}

export function DutyDialog({ area, preset, onClose }: { area: 'Dienstplan' | 'Bereitschaft'; preset: DutyPreset; onClose: () => void }) {
  const { ctx, data, user, prefs, f, run, ask, teamColor, toast } = useApp();
  const sb = area === 'Bereitschaft';
  const teams = entryTeams(ctx, area);
  const edit = preset.edit;
  const [team, setTeam] = useState(edit?.team || (preset.team && teams.some((t) => t.name === preset.team) ? preset.team : teams[0]?.name || ''));
  const t = data.teams.find((x) => x.name === team);
  const own = !!t && selfOnly(ctx, team, area);
  const people = data.staff.filter((p) => t?.memberIds.includes(p.id) && (!own || p.id === user.id));
  const [employee, setEmployee] = useState(edit?.employee || preset.employee || (own ? user.name : ''));
  const services = sb ? data.standbyTimes.filter((x) => standbyTimeForTeam(x, team, data.teams)) : data.shiftTypes.filter((x) => x.team === team);
  const initialService = edit ? services.find((s) => s.name === edit.shift)?.id || '' : '';
  const [serviceId, setServiceId] = useState(initialService);
  const service = services.find((s) => s.id === serviceId);
  const [start, setStart] = useState(edit?.start || service?.start || '');
  const [end, setEnd] = useState(edit?.end || service?.end || '');
  const [from, setFrom] = useState(edit?.date || preset.date || today());
  const [to, setTo] = useState(edit?.date || preset.dateTo || preset.date || today());

  /* Bereitschaft mit festen Wochentagen: andere Tage sind im Kalender ausgegraut (wie bisher) */
  const dayOk = (s: typeof service, iso: string) => !sb || !s || !('days' in s) || !standbyRestricted(s as never) || standbyDayOk(s as never, iso);
  const snap = (s: typeof service, iso: string) => {
    let d = iso;
    for (let g = 0; g < 400 && d && !dayOk(s, d); g++) d = isoDate(addDays(day(d), 1));
    return d;
  };
  const pickService = (id: string) => {
    setServiceId(id);
    const s = services.find((x) => x.id === id);
    setStart(s?.start || '');
    setEnd(s?.end || '');
    if (sb && s) {
      const nf = snap(s, from);
      setFrom(nf);
      const nt = snap(s, to < nf ? nf : to);
      setTo(nt < nf ? nf : nt);
    }
  };

  const summary = useMemo(() => {
    if (!employee || !service) return { warn: false, title: !employee ? 'Mitarbeiter auswählen' : sb ? 'Bereitschaftszeit auswählen' : 'Dienst auswählen', sub: 'Danach Zeitraum festlegen und speichern.' };
    if (!from || to < from) return { warn: true, title: 'Das Enddatum liegt vor dem Startdatum.', sub: '' };
    let n = 0,
      skip = 0;
    const multi = to !== from;
    for (const d of eachDay(from, to, 367)) {
      const wd = (day(d).getDay() + 6) % 7;
      if ((multi && !sb && wd >= prefs.dutyDays) || (!sb && isHoliday(d)) || (sb && 'days' in service && !standbyDayOk(service, d))) skip++;
      else n++;
    }
    const st = start || service.start,
      en = end || service.end;
    if (sb && (!st || !en)) return { warn: true, title: 'Uhrzeit eingeben', sub: `${service.name} ist eine variable Bereitschaft – Beginn und Ende sind Pflicht.` };
    const mins = Math.round(durationHours(st, en) * 60) - (sb ? 0 : LUNCH_MIN);
    const net = mins > 0 ? ` · ${Math.floor(mins / 60)} Std.${mins % 60 ? ' ' + (mins % 60) + ' Min.' : ''}${sb ? '' : ' netto'}` : '';
    if (!n) return { warn: true, title: 'Im gewählten Zeitraum liegen keine Arbeitstage.', sub: '' };
    return {
      warn: false,
      title: `${edit ? 'Eintrag ändern' : `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`} · ${service.name}`,
      sub: `${employee} · ${st}–${en}${net} · ${f.fmtIsoDate(from)}${multi ? ' – ' + f.fmtIsoDate(to) : ''}${skip ? ` · ${skip} ${skip === 1 ? 'freier Tag' : 'freie Tage'} ausgelassen` : ''}`,
    };
  }, [employee, service, from, to, start, end, sb, prefs.dutyDays, edit, f]);

  const submit = async () => {
    if (!employee) return toast('Bitte einen Mitarbeiter auswählen.');
    if (!service) return toast(sb ? 'Für dieses Team ist noch keine Bereitschaftszeit angelegt.' : 'Bitte zuerst unter „Dienstzeiten“ eine Dienstzeit für dieses Team anlegen.');
    if (!validDateInput(from) || !validDateInput(to || from)) return toast('Bitte ein gültiges Datum wählen.');
    // Weiche Prüfungen (Bestätigung) wie in der Browser-Version
    for (const date of eachDay(from, to || from, 367)) {
      const others = data.entries.filter((a) => a.employee === employee && a.date === date && a.id !== edit?.id);
      const abs = others.find((a) => a.isAbsence && !['Abwesend untertägig', 'Arztbesuch', 'Urlaub 1/2 Tag'].includes(a.shift));
      if (abs && !(await ask(`${employee} ist am ${f.fmtIsoDate(date)} abwesend (${abs.shift}). Trotzdem einteilen?`, 'Einteilen'))) return;
      if (!sb && 'multi' in service && !shiftMulti(service)) {
        const taken = data.entries.find((a) => a.kind === 'Dienstplan' && !a.isAbsence && a.team === team && a.date === date && a.shift === service.name && a.employee !== employee && a.id !== edit?.id);
        if (taken && !(await ask(`${service.name} ist nur einmal pro Tag vorgesehen und am ${f.fmtIsoDate(date)} bereits mit ${taken.employee} besetzt. Trotzdem einteilen?`, 'Einteilen'))) return;
      }
      if (!sb) {
        const [ns, ne] = timeSpan({ start: start || service.start, end: end || service.end });
        const near = (o: number) => data.entries.filter((a) => a.employee === employee && a.date === isoDate(addDays(day(date), o)) && a.kind === 'Dienstplan' && !a.isAbsence && a.start && a.end && a.id !== edit?.id);
        const clash = near(-1).find((a) => timeSpan(a)[1] - 1440 > ns) || (ne > 1440 ? near(1).find((a) => timeSpan(a)[0] < ne - 1440) : undefined);
        if (clash && !(await ask(`${employee} hat am ${f.fmtIsoDate(clash.date)} bereits ${clash.shift} (${tRange(clash)}). Die Zeiten überschneiden sich. Trotzdem einteilen?`, 'Einteilen'))) return;
      }
    }
    const r = await run(saveDuty({ area, team, employee, serviceId, from, to: to || from, start, end, editId: edit?.id || null, dutyDays: prefs.dutyDays }), { undo: edit ? `${employee} bearbeitet` : `${area === 'Bereitschaft' ? 'Bereitschaft' : 'Dienst'} für ${employee}` });
    if (r.ok) onClose();
  };

  const variable = sb && service && isVariableStandby(service as never);
  return (
    <Modal
      title={edit ? 'Eintrag bearbeiten' : sb ? 'Bereitschaft einteilen' : 'Neuen Dienst einteilen'}
      sub={sb ? 'Wird an jedem Tag im Zeitraum eingetragen.' : 'Wird an jedem Arbeitstag im Zeitraum eingetragen.'}
      icon={sb ? 'moon' : 'cal'}
      className="duty-modal"
      onClose={onClose}
      onSubmit={submit}
      footer={<ModalActions onCancel={onClose} okLabel={edit ? 'Speichern' : sb ? 'Bereitschaft einteilen' : 'Dienst einteilen'} />}
    >
      <div className="te-two">
        <Field label="Team">
          <Picker
            value={team}
            onChange={(v) => {
              setTeam(v);
              setEmployee('');
              setServiceId('');
            }}
            options={teams.map((x) => ({ value: x.name, label: x.name, sub: `${x.memberIds.length} ${x.memberIds.length === 1 ? 'Mitglied' : 'Mitglieder'}`, pic: 'team', color: teamColor(x) }))}
            empty="Kein Team zugewiesen"
            search="Team suchen …"
          />
        </Field>
        <Field label="Mitarbeiter">
          <Picker value={employee} onChange={setEmployee} options={people.map((p) => ({ value: p.name, label: p.name, sub: p.role, pic: 'person', color: teamColor(t) }))} placeholder="Mitarbeiter auswählen" empty="Keine Mitarbeiter in diesem Team" search="Name suchen …" />
        </Field>
      </div>
      <Field label={sb ? 'Bereitschaftszeit' : 'Dienst'}>
        <Picker
          value={serviceId}
          onChange={pickService}
          placeholder={sb ? 'Bereitschaftszeit auswählen' : 'Dienst auswählen'}
          empty={sb ? 'Für dieses Team ist keine Bereitschaftszeit angelegt' : 'Keine Dienstzeiten für dieses Team angelegt'}
          options={services.map((x) => {
            const m = Math.round(durationHours(x.start, x.end) * 60) - (sb ? 0 : LUNCH_MIN);
            return { value: x.id, label: x.name, sub: tRange(x as never, ' – ') + (sb ? '' : ` · ${Math.floor(m / 60)} Std.${m % 60 ? ' ' + (m % 60) + ' Min.' : ''} netto`), pic: 'icon', icon: sb ? 'moon' : 'clock', color: sb ? t?.standbyColor || '#159da8' : shiftHexColor(x.color) };
          })}
        />
      </Field>
      {service && (
        <Field label="Uhrzeit für diesen Eintrag" note={variable ? 'Variable Bereitschaft – bitte Beginn und Ende für diesen Eintrag eingeben.' : 'Die Uhrzeiten gelten nur für diesen Eintrag und ändern die hinterlegte Dienstzeit nicht.'} className={variable ? 'needs-time' : ''}>
          <TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
        </Field>
      )}
      <Field label="Zeitraum" note={sb && service && standbyRestricted(service as never) ? `„${service.name}“ – eintragbar: ${standbyDaysLabel(service as never)}. Andere Tage sind im Kalender ausgegraut.` : undefined}>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} allowed={sb && service ? (iso) => dayOk(service, iso) : undefined} />
      </Field>
      <div className={`wp-summary ${summary.warn ? 'warn' : ''}`} aria-live="polite">
        <span className="wp-sum-ic">
          <Icon name={summary.warn ? 'alert' : sb ? 'moon' : 'cal'} />
        </span>
        <div>
          <b>{summary.title}</b>
          {summary.sub && <small>{summary.sub}</small>}
        </div>
      </div>
    </Modal>
  );
}

/* ======================= Abwesenheit ======================= */
export function AbsenceDialog({ onClose }: { onClose: () => void }) {
  const { ctx, data, user, f, run, teamColor } = useApp();
  const allowed = absenceTeams(ctx);
  const eligible = data.staff.filter((s) => ['Abteilungsleiter', 'Admin'].includes(user.role) || allowed.some((t) => t.memberIds.includes(s.id)));
  const [employee, setEmployee] = useState(eligible.find((s) => s.id === user.id)?.name || '');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const timed = TIMED_ABSENCES.includes(kind);
  const t2 = to || from;
  const days = t2 >= from ? daysBetween(from, t2) + 1 : 0;
  return (
    <Modal
      title="Abwesenheit eintragen"
      sub="Wird im Dienstplan beim Mitarbeiter angezeigt."
      icon="travel"
      className="abs-modal"
      onClose={onClose}
      onSubmit={async () => {
        const p = data.staff.find((x) => x.name === employee);
        if (!canCreateAbsenceFor(ctx, p)) return;
        const r = await run(createAbsence({ employee, kind, from, to: t2, start, end, note }), { undo: `${kind} für ${employee}` });
        if (r.ok) onClose();
      }}
      footer={<ModalActions onCancel={onClose} okLabel="Abwesenheit speichern" />}
    >
      <Field label="Mitarbeiter">
        <Picker
          value={employee}
          onChange={setEmployee}
          placeholder="Mitarbeiter auswählen"
          search="Name oder Team suchen …"
          options={eligible.map((s) => {
            const tt = absenceTeamFor(ctx, s);
            return { value: s.name, label: s.name, sub: tt?.name || 'Ohne Team', pic: 'person', color: teamColor(tt) };
          })}
        />
      </Field>
      <Field label="Art der Abwesenheit">
        <Picker value={kind} onChange={setKind} placeholder="Art der Abwesenheit wählen" options={ABSENCE_KINDS.map(([v, ic, sub]) => ({ value: v, label: v, sub, pic: 'icon', icon: ic, color: '#d69b38' }))} />
      </Field>
      {timed && (
        <Field label="Uhrzeit">
          <TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} startLabel="Von" endLabel="Bis" />
        </Field>
      )}
      <Field label="Zeitraum" note="Ohne „Bis“ gilt die Abwesenheit nur für einen Tag.">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} toLabel="Bis (optional)" toRequired={false} />
      </Field>
      <Field label={<>Bemerkung <span className="muted">(optional)</span></>} note="Die Bemerkung wird beim Mitarbeiter im Dienstplan angezeigt.">
        <textarea rows={2} placeholder="Zusätzliche Information oder Hinweis …" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className={`wp-summary ${kind && employee && !days ? 'warn' : ''}`} aria-live="polite">
        <span className="wp-sum-ic">
          <Icon name="travel" />
        </span>
        {!kind || !employee ? (
          <div>
            <b>{!employee ? 'Mitarbeiter auswählen' : 'Art der Abwesenheit wählen'}</b>
            <small>Danach Zeitraum festlegen und speichern.</small>
          </div>
        ) : !days ? (
          <div>
            <b>Das Enddatum liegt vor dem Startdatum.</b>
          </div>
        ) : (
          <div>
            <b>
              {kind} · {days} {days === 1 ? 'Tag' : 'Tage'}
            </b>
            <small>
              {employee} · {f.fmtIsoDate(from)}
              {days > 1 ? ' – ' + f.fmtIsoDate(t2) : ''}
              {timed && start && end ? ` · ${start}–${end}` : ''}
            </small>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ======================= Arbeitsort ======================= */
export function WorkplaceDialog({ preset, onClose }: { preset: { from?: string; to?: string; type?: 'Homeoffice' | 'Büro'; employee?: string }; onClose: () => void }) {
  const { data, user, f, run, ask, teamColor } = useApp();
  const manager = ['Admin', 'Teamleiter', 'Abteilungsleiter'].includes(user.role);
  const [employee, setEmployee] = useState(preset.employee || user.name);
  const [type, setType] = useState<'Homeoffice' | 'Büro'>(preset.type || 'Homeoffice');
  const [from, setFrom] = useState(preset.from || today());
  const [to, setTo] = useState(preset.to || preset.from || today());
  const name = manager ? employee : user.name;
  const days = useMemo(() => (validDateInput(from) && validDateInput(to) && to >= from ? eachDay(from, to).filter((d) => ![0, 6].includes(day(d).getDay())) : null), [from, to]);
  const withDuty = days ? days.filter((x) => data.entries.some((a) => a.kind === 'Dienstplan' && !a.isAbsence && a.employee === name && a.date === x)).length : 0;
  const existing = days ? days.filter((x) => data.entries.some((a) => a.kind === 'Arbeitsort' && a.employee === name && a.date === x)).length : 0;
  const quick = (q: string) => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    let a = t,
      z = t;
    if (q === 'tomorrow') {
      a = addDays(t, 1);
      while (a.getDay() === 0 || a.getDay() === 6) a = addDays(a, 1);
      z = a;
    } else if (q === 'week') {
      a = weekStart(t);
      z = addDays(a, 4);
    } else if (q === 'next') {
      a = addDays(weekStart(t), 7);
      z = addDays(a, 4);
    }
    setFrom(isoDate(a));
    setTo(isoDate(z));
  };
  return (
    <Modal
      title={manager ? 'Arbeitsort eintragen' : 'Meinen Arbeitsort eintragen'}
      sub={manager ? 'Wird beim jeweiligen Dienst als Hinweis angezeigt.' : 'Nur dein eigener Arbeitsort wird geändert · erscheint als Hinweis bei deinem Dienst.'}
      icon={type === 'Homeoffice' ? 'home' : 'build'}
      onClose={onClose}
      onSubmit={async () => {
        const r = await run(saveWorkplace({ employee: name, type, from, to }), { undo: `${type} für ${name}` });
        if (r.ok) onClose();
      }}
      footer={
        <ModalActions
          onCancel={onClose}
          left={
            <button
              type="button"
              className="btn ghost danger-text"
              disabled={!existing}
              onClick={async () => {
                if (!(await ask(`Arbeitsort von ${name} an ${existing} ${existing === 1 ? 'Tag' : 'Tagen'} entfernen?`, 'Entfernen'))) return;
                const r = await run(saveWorkplace({ employee: name, type, from, to, remove: true }), { undo: `${type} entfernt` });
                if (r.ok) onClose();
              }}
            >
              <Icon name="trash" />
              Im Zeitraum entfernen
            </button>
          }
        />
      }
    >
      {manager ? (
        <Field label="Mitarbeiter">
          <Picker
            value={employee}
            onChange={setEmployee}
            search="Name oder Team suchen …"
            options={[...data.staff].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((p) => {
              const ts = data.teams.filter((t) => t.memberIds.includes(p.id));
              return { value: p.name, label: p.name, sub: ts.map((t) => t.name).join(', '), pic: 'person', color: teamColor(ts[0]) };
            })}
          />
        </Field>
      ) : (
        <div className="wp-me">
          <Avatar name={user.name} size={36} />
          <div>
            <b>{user.name}</b>
            <small>Dein Arbeitsort</small>
          </div>
        </div>
      )}
      <Field label="Arbeitsort">
        <div className="wp-types" role="radiogroup" aria-label="Arbeitsort">
          {(
            [
              ['Homeoffice', 'home', 'Arbeiten von zu Hause'],
              ['Büro', 'build', 'Arbeiten vor Ort'],
            ] as const
          ).map(([v, ic, s]) => (
            <label className="wp-type" key={v}>
              <input type="radio" name="wp-type" value={v} checked={type === v} onChange={() => setType(v)} />
              <span className="wp-type-card">
                <span className="wp-type-ic">
                  <Icon name={ic} />
                </span>
                <b>{v}</b>
                <small>{s}</small>
                <i className="wp-type-check">
                  <Icon name="check" />
                </i>
              </span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Zeitraum" note="Arbeitsorte werden nur von Montag bis Freitag eingetragen.">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <div className="wp-quick">
          {(
            [
              ['today', 'Heute'],
              ['tomorrow', 'Nächster Werktag'],
              ['week', 'Diese Woche'],
              ['next', 'Nächste Woche'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className="chip" onClick={() => quick(k)}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      <div className={`wp-summary ${!days || !days.length ? 'warn' : ''}`} aria-live="polite">
        {!days ? (
          <>
            <Icon name="alert" />
            <span>Bitte einen gültigen Zeitraum wählen („Bis“ darf nicht vor „Von“ liegen).</span>
          </>
        ) : !days.length ? (
          <>
            <Icon name="alert" />
            <span>Am Wochenende kann kein Arbeitsort eingetragen werden. Bitte einen Tag von Montag bis Freitag wählen.</span>
          </>
        ) : (
          <>
            <span className="wp-sum-ic">
              <Icon name={type === 'Homeoffice' ? 'home' : 'build'} />
            </span>
            <div>
              <b>
                {type} · {days.length} {days.length === 1 ? 'Tag' : 'Tage'}
              </b>
              <small>{days.length === 1 ? f.fmtWithWeekday(day(days[0])) : `${f.fmtShortWd(day(days[0]))} – ${f.fmtShortWd(day(days[days.length - 1]))}`}</small>
              <small>
                {withDuty ? `Bei ${withDuty} von ${days.length} Tagen als Hinweis beim Dienst sichtbar.` : 'An diesen Tagen ist noch kein Dienst eingetragen.'}
                {existing ? ` ${existing} ${existing === 1 ? 'Tag wird' : 'Tage werden'} überschrieben.` : ''}
              </small>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ======================= Rotation: Bereitschaft ======================= */
function defaultRange(current: Date) {
  const from = today();
  let to = isoDate(new Date(current.getFullYear(), current.getMonth() + 1, 0));
  if (to < from) {
    const t = new Date();
    to = isoDate(new Date(t.getFullYear(), t.getMonth() + 1, 0));
  }
  return { from, to };
}

function ModeChoice({ mode, setMode }: { mode: 'week' | 'day'; setMode: (m: 'week' | 'day') => void }) {
  return (
    <Field label="Wechsel">
      <div className="wp-types rot-modes" role="radiogroup" aria-label="Wechsel">
        {(
          [
            ['week', 'cal', 'Wöchentlich', 'Wechsel jeden Montag'],
            ['day', 'refresh', 'Täglich', 'Wechsel jeden Tag'],
          ] as const
        ).map(([v, ic, l, s]) => (
          <label className="wp-type" key={v}>
            <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} />
            <span className="wp-type-card">
              <span className="wp-type-ic">
                <Icon name={ic} />
              </span>
              <b>{l}</b>
              <small>{s}</small>
              <i className="wp-type-check">
                <Icon name="check" />
              </i>
            </span>
          </label>
        ))}
      </div>
    </Field>
  );
}

function KeepChoice({ keep, setKeep }: { keep: boolean; setKeep: (v: boolean) => void }) {
  return (
    <label className="check wp-check">
      <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
      <span>
        <b>Bestehende Einträge behalten</b>
        <small className="muted block">Nur Lücken füllen – bereits geplante Tage bleiben unverändert.</small>
      </span>
    </label>
  );
}

export function StandbyRotationDialog({ current, preTeams, onClose }: { current: Date; preTeams: string[]; onClose: () => void }) {
  const { ctx, data, run, teamColor, toast } = useApp();
  const avail = manageableTeams(ctx, 'Bereitschaft');
  const [teams, setTeams] = useState<string[]>(preTeams.length ? preTeams.filter((n) => avail.some((t) => t.name === n)) : avail.map((t) => t.name));
  const [timeId, setTimeId] = useState(data.standbyTimes[0]?.id || '');
  const r = defaultRange(current);
  const [from, setFrom] = useState(r.from);
  const [to, setTo] = useState(r.to);
  const [mode, setMode] = useState<'week' | 'day'>('week');
  const [keep, setKeep] = useState(true);
  const [vs, setVs] = useState('');
  const [ve, setVe] = useState('');
  const st = data.standbyTimes.find((x) => x.id === timeId);
  const variable = !!st && isVariableStandby(st);
  return (
    <Modal
      title="Rotation automatisch planen"
      sub="Verteilt die Bereitschaft gleichmäßig auf alle Teammitglieder."
      icon="refresh"
      className="form-dialog rot-modal"
      onClose={onClose}
      onSubmit={async () => {
        if (variable && (!vs || !ve)) return toast(`${st!.name} ist eine variable Bereitschaft – bitte Beginn und Ende eingeben.`);
        const res = await run(runStandbyRotation({ teams, timeId, from, to, mode, keep, start: vs, end: ve }), { undo: 'Bereitschafts-Rotation' });
        if (res.ok) onClose();
      }}
      footer={<ModalActions onCancel={onClose} okLabel="Rotation erstellen" />}
    >
      <MultiPick label="Teams" items={avail.map((t) => ({ value: t.name, label: t.name, color: teamColor(t), small: t.memberIds.length }))} selected={teams} onChange={setTeams} allLabel="Alle meine Teams" emptyLabel="Team auswählen …" />
      <small className="wp-note rot-lead-note">
        <Icon name="alert" />
        Teamleiter werden nicht eingeteilt – sie haben keine Bereitschaft.
      </small>
      <Field label="Bereitschaftszeit">
        <Picker
          value={timeId}
          onChange={setTimeId}
          placeholder="Bereitschaftszeit auswählen"
          options={data.standbyTimes.map((x) => ({ value: x.id, label: x.name, sub: `${tRange(x, ' – ')} · ${standbyTimeAllTeams(x) ? 'Alle Teams' : standbyTimeTeams(x, data.teams).length + ' Teams'}`, pic: 'icon', icon: 'moon', color: x.color }))}
        />
      </Field>
      {variable && (
        <Field label={<>Uhrzeit <span className="muted">(variable Bereitschaft)</span></>} note="Gilt für alle Einträge dieser Rotation.">
          <TimeRange start={vs} end={ve} onStart={setVs} onEnd={setVe} />
        </Field>
      )}
      <Field label="Zeitraum">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </Field>
      <ModeChoice mode={mode} setMode={setMode} />
      <KeepChoice keep={keep} setKeep={setKeep} />
      <small className="wp-note rot-note">
        <Icon name="alert" />
        <span>Die Reihenfolge setzt dort fort, wo die letzte Bereitschaft vor dem Zeitraum endete. Ganztägig abwesende Personen werden für diesen Tag automatisch vertreten.</span>
      </small>
    </Modal>
  );
}

/* ======================= Rotation: Dienstplan ======================= */
export function DutyRotationDialog({ current, preTeams, onClose }: { current: Date; preTeams: string[]; onClose: () => void }) {
  const { ctx, data, run, ask, teamColor } = useApp();
  const avail = manageableTeams(ctx, 'Dienstplan').filter((t) => data.shiftTypes.some((s) => s.team === t.name));
  const [teams, setTeams] = useState<string[]>(preTeams.length ? preTeams.filter((n) => avail.some((t) => t.name === n)) : avail.map((t) => t.name));
  const names = [...new Set(data.shiftTypes.filter((s) => avail.some((t) => t.name === s.team)).map((s) => s.name))];
  const [shifts, setShifts] = useState<string[]>(names);
  const r = defaultRange(current);
  const [from, setFrom] = useState(r.from);
  const [to, setTo] = useState(r.to);
  const [mode, setMode] = useState<'week' | 'day'>('week');
  const [keep, setKeep] = useState(true);
  const visibleShift = (n: string) => !teams.length || teams.some((t) => data.shiftTypes.some((s) => s.team === t && s.name === n));
  return (
    <Modal
      title="Rotation automatisch planen"
      sub="Verteilt die Dienste gleichmäßig im Wechsel auf alle Teammitglieder."
      icon="refresh"
      className="form-dialog rot-modal"
      onClose={onClose}
      onSubmit={async () => {
        const removing = keep ? 0 : data.entries.filter((a) => a.kind === 'Dienstplan' && !a.isAbsence && a.date >= from && a.date <= to && teams.includes(a.team)).length;
        if (removing && !(await ask(`${removing} bestehende Dienste im Zeitraum werden ersetzt. Fortfahren?`, 'Ersetzen'))) return;
        const res = await run(runDutyRotation({ teams, shifts: shifts.filter(visibleShift), from, to, mode, keep }), { undo: 'Dienst-Rotation' });
        if (res.ok) onClose();
      }}
      footer={<ModalActions onCancel={onClose} okLabel="Rotation erstellen" />}
    >
      <MultiPick label="Teams" items={avail.map((t) => ({ value: t.name, label: t.name, color: teamColor(t), small: t.memberIds.length }))} selected={teams} onChange={setTeams} allLabel="Alle meine Teams" emptyLabel="Team auswählen …" />
      <MultiPick
        label={<>Dienste im Wechsel <span className="muted">(in dieser Reihenfolge)</span></>}
        icon="clock"
        items={names.map((n) => {
          const x = data.shiftTypes.find((s) => s.name === n && avail.some((t) => t.name === s.team));
          return { value: n, label: n, color: shiftHexColor(x?.color), small: x ? `${tRange(x)}${shiftMulti(x) ? '' : ' · 1×/Tag'}` : '', hidden: !visibleShift(n) };
        })}
        selected={shifts}
        onChange={setShifts}
        allLabel="Alle Dienste"
        emptyLabel="Dienste auswählen …"
      />
      <Field label="Zeitraum">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </Field>
      <ModeChoice mode={mode} setMode={setMode} />
      <KeepChoice keep={keep} setKeep={setKeep} />
      <details className="rot-help">
        <summary>
          <Icon name="alert" />
          So funktioniert die Rotation
        </summary>
        <p>
          Jedes Teammitglied bekommt an jedem Arbeitstag (Mo–Fr) einen Dienst. Die Dienste wechseln fair im Kreis: Ein Dienst, den pro Tag nur eine Person hat, kommt bei derselben Person erst wieder, wenn alle anderen im Team ihn hatten. Teamleiter werden nicht eingeteilt. Bei Urlaub, Gleittag,
          Sonderurlaub, Berufsschule oder „Abwesend“ bekommt die Person keinen Dienst, und die Dienste dieses Tages werden unter den Anwesenden neu verteilt. Feiertage werden ausgelassen. Tage, an denen jemand schon einen Dienst hat, bleiben unverändert.
        </p>
      </details>
    </Modal>
  );
}

export { fullDayAbsent };
