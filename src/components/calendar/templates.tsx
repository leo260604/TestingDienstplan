'use client';
/* Wochenvorlagen: Musterwoche speichern und auf andere Wochen anwenden */
import { useMemo, useState } from 'react';
import { useApp } from '../AppProvider';
import { Dot, Field, Icon, Modal, Picker } from '../ui';
import { addDays, day, isoDate, isoWeek, weekStart } from '@/lib/dates';
import { manageableTeams } from '@/lib/access';
import { WEEKDAYS_SHORT } from '@/lib/staffing';
import { applyWeekTemplate, deleteWeekTemplate, saveWeekTemplate } from '@/server/actions/templates';
import type { WeekTemplate } from '@/lib/types';

type Area = 'Dienstplan' | 'Bereitschaft';

export function WeekTemplatesDialog({ area, current, preTeams, onClose }: { area: Area; current: Date; preTeams: string[]; onClose: () => void }) {
  const { ctx, data, f, run, ask, teamColor } = useApp();
  const avail = manageableTeams(ctx, area);
  const sb = area === 'Bereitschaft';
  const curWs = isoDate(weekStart(current));
  const [teamId, setTeamId] = useState(avail.find((t) => preTeams.includes(t.name))?.id || avail[0]?.id || '');
  const team = avail.find((t) => t.id === teamId);
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState('');

  /* Wochen zur Auswahl: 2 zurück bis 16 voraus, ausgehend von heute bzw. der angezeigten Woche */
  const weeks = useMemo(() => {
    const base = weekStart(new Date());
    const set = new Set<string>();
    for (let i = -2; i <= 16; i++) set.add(isoDate(addDays(base, i * 7)));
    set.add(curWs);
    return [...set].sort();
  }, [curWs]);
  const weekLabel = (ws: string) => `KW ${isoWeek(day(ws))} · ${f.fmtIsoDate(ws).slice(0, 6)} – ${f.fmtIsoDate(isoDate(addDays(day(ws), 6)))}`;

  const curDates = Array.from({ length: 7 }, (_, i) => isoDate(addDays(day(curWs), i)));
  const curCount = team ? data.entries.filter((a) => a.kind === area && !a.isAbsence && a.team === team.name && curDates.includes(a.date)).length : 0;
  const list = (data.settings.weekTemplates || []).filter((t) => t.area === area && avail.some((a) => a.id === t.teamId)).sort((a, b) => b.at - a.at);
  const defName = team ? `${team.name} – Musterwoche` : '';

  return (
    <Modal title="Wochenvorlagen" sub={`Musterwoche speichern und auf andere Wochen anwenden · ${sb ? 'Bereitschaft' : 'Dienstplan'}`} icon="copy" className="form-dialog tpl-modal" onClose={onClose} footer={
      <>
        <span />
        <span className="wp-actions-right">
          <button type="button" className="btn" onClick={onClose}>
            Schließen
          </button>
        </span>
      </>
    }>
      <section className="tpl-save">
        <div className="tpl-sec-head">
          <Icon name="download" />
          <b>Woche als Vorlage speichern</b>
        </div>
        <div className="tpl-save-grid">
          <Field label="Team">
            <Picker value={teamId} onChange={setTeamId} placeholder="Team auswählen" options={avail.map((t) => ({ value: t.id, label: t.name, pic: 'team', color: teamColor(t), sub: `${t.memberIds.length} Mitglieder` }))} />
          </Field>
          <Field label="Name der Vorlage">
            <input className="input" value={name} maxLength={60} placeholder={defName} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="tpl-save-foot">
          <small className="muted">
            Aus {weekLabel(curWs)}: <b>{curCount}</b> {sb ? (curCount === 1 ? 'Bereitschaft' : 'Bereitschaften') : curCount === 1 ? 'Dienst' : 'Dienste'}
            {team ? ` von ${team.name}` : ''}
          </small>
          <button
            type="button"
            className="btn primary small"
            disabled={!team || !curCount}
            onClick={async () => {
              const res = await run(saveWeekTemplate({ area, teamId, name: name.trim() || defName, weekStart: curWs }));
              if (res.ok) setName('');
            }}
          >
            <Icon name="check" />
            Vorlage speichern
          </button>
        </div>
      </section>

      <div className="tpl-sec-head tpl-list-head">
        <Icon name="copy" />
        <b>Gespeicherte Vorlagen</b>
        <span className="pill">{list.length}</span>
      </div>
      {list.length ? (
        <div className="tpl-list">
          {list.map((t) => (
            <TemplateCard
              key={t.id}
              tpl={t}
              open={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? '' : t.id)}
              weeks={weeks}
              defWeek={curWs}
              weekLabel={weekLabel}
              onApply={async (ws, replace) => {
                const tm = data.teams.find((x) => x.id === t.teamId);
                const dates = Array.from({ length: 7 }, (_, i) => isoDate(addDays(day(ws), i)));
                const existing = data.entries.filter((a) => a.kind === area && !a.isAbsence && a.team === tm?.name && dates.includes(a.date)).length;
                if (replace && existing && !(await ask(`${existing} bestehende ${sb ? 'Bereitschaften' : 'Dienste'} von ${tm?.name} in KW ${isoWeek(day(ws))} werden ersetzt. Fortfahren?`, 'Ersetzen'))) return;
                const res = await run(applyWeekTemplate({ id: t.id, weekStart: ws, replace }), { undo: 'Wochenvorlage' });
                if (res.ok) onClose();
              }}
              onDelete={async () => {
                if (await ask(`Vorlage „${t.name}“ wirklich löschen?`, 'Löschen')) await run(deleteWeekTemplate(t.id));
              }}
            />
          ))}
        </div>
      ) : (
        <div className="tpl-empty">
          <Icon name="copy" />
          <span>Noch keine Vorlagen. Plane eine Woche so, wie sie immer wieder aussehen soll, und speichere sie oben als Vorlage.</span>
        </div>
      )}
    </Modal>
  );
}

function TemplateCard({
  tpl,
  open,
  onToggle,
  weeks,
  defWeek,
  weekLabel,
  onApply,
  onDelete,
}: {
  tpl: WeekTemplate;
  open: boolean;
  onToggle: () => void;
  weeks: string[];
  defWeek: string;
  weekLabel: (ws: string) => string;
  onApply: (ws: string, replace: boolean) => void;
  onDelete: () => void;
}) {
  const { data, f, teamColor } = useApp();
  const team = data.teams.find((t) => t.id === tpl.teamId);
  const nextWeek = weeks.find((w) => w > defWeek) || defWeek;
  const [ws, setWs] = useState(nextWeek);
  const [replace, setReplace] = useState(false);
  const perDay = WEEKDAYS_SHORT.map((_, i) => tpl.items.filter((x) => x.d === i).length);
  const people = new Set(tpl.items.map((x) => x.employeeId)).size;
  return (
    <div className={`tpl-card ${open ? 'open' : ''}`}>
      <button type="button" className="tpl-card-head" aria-expanded={open} onClick={onToggle}>
        <span className="tpl-card-ic">
          <Icon name="copy" />
        </span>
        <span className="tpl-card-txt">
          <b>{tpl.name}</b>
          <small>
            {team && <Dot color={teamColor(team)} />}
            {team?.name || 'Team gelöscht'} · {tpl.items.length} Einträge · {people} {people === 1 ? 'Person' : 'Personen'} · {tpl.by}, {f.fmtIsoDate(isoDate(new Date(tpl.at)))}
          </small>
        </span>
        <span className="tpl-days" aria-label="Einträge je Wochentag">
          {perDay.map((n, i) => (
            <span key={i} className={n ? 'on' : ''} title={`${WEEKDAYS_SHORT[i]}: ${n}`}>
              {WEEKDAYS_SHORT[i][0]}
            </span>
          ))}
        </span>
        <Icon name="down" className="tpl-chev" />
      </button>
      {open && (
        <div className="tpl-card-body">
          <Field label="Anwenden auf">
            <Picker value={ws} onChange={setWs} options={weeks.map((w) => ({ value: w, label: weekLabel(w), sub: w === defWeek ? 'angezeigte Woche' : undefined }))} />
          </Field>
          <label className="check wp-check">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            <span>
              <b>Bestehende Einträge dieser Woche ersetzen</b>
              <small className="muted block">{replace ? `Alle ${tpl.area === 'Bereitschaft' ? 'Bereitschaften' : 'Dienste'} von ${team?.name || 'diesem Team'} in der Woche werden durch die Vorlage ersetzt.` : 'Nur freie Plätze füllen – schon geplante Tage bleiben unverändert.'}</small>
            </span>
          </label>
          <small className="wp-note">
            <Icon name="alert" />
            Abwesende Personen, Feiertage{tpl.area === 'Bereitschaft' ? ' (nur Dienste)' : ''} und Personen, die nicht mehr im Team sind, werden automatisch ausgelassen.
          </small>
          <div className="tpl-card-actions">
            <button type="button" className="btn ghost small danger-text" onClick={onDelete}>
              <Icon name="trash" />
              Löschen
            </button>
            <button type="button" className="btn primary small" disabled={!team} onClick={() => onApply(ws, replace)}>
              <Icon name="check" />
              Auf {weekLabel(ws).split(' · ')[0]} anwenden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
