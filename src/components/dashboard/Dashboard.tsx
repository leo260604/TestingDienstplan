'use client';
/* Dashboard – Baukasten aus Kacheln (Widgets). Neue Ansicht: in WIDGETS ergänzen. */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../AppProvider';
import { useShell } from '../shell/AppShell';
import { Avatar, Field, Heading, Icon, InfoDialog, Modal, ModalActions, StatCard } from '../ui';
import { addDays, day, isoDate, isoWeek, weekStart } from '@/lib/dates';
import { ABSENCE_FULLDAY, assignmentColor, buildWpIndex, computeConflicts, netHours, shiftHexColor, tRange } from '@/lib/entries';
import { currentUserTeamNames, manageableTeams, pagesFor, scopeTeams } from '@/lib/access';
import { swapOpenFor, swapsIncoming, swapsOutgoing } from '@/lib/swaps';
import { setCockpitLink } from '@/server/actions/account';
import type { Entry, Page, Team } from '@/lib/types';

type Size = 'tile' | 'half' | 'full';
interface Issue {
  level: 'warn' | 'crit';
  icon: string;
  title: string;
  text: string;
  page: Page;
  query?: Record<string, string>;
}

const DEFAULT_LAYOUT: Record<'emp' | 'lead', [string, number][]> = {
  emp: [['today', 0], ['kDuties', 0], ['kStandby', 3], ['kAbsence', 6], ['kHours', 9], ['myDuties', 0], ['myStandby', 6], ['kWorkplace', 6], ['kSwaps', 6]],
  lead: [['today', 0], ['kDuties', 0], ['kStandby', 3], ['kAbsence', 6], ['kIssues', 9], ['myDuties', 0], ['myStandby', 6], ['kWorkplace', 6], ['kHours', 6], ['kSwaps', 9], ['kTeamDuty', 9], ['kTeamStandby', 6], ['teamToday', 0], ['standbyToday', 6], ['weekLoad', 0]],
};
const dashCols = (w: number) => (w >= 720 ? 12 : w >= 440 ? 6 : 2);
const dashW = (size: Size, cols: number) => (size === 'full' ? cols : size === 'half' ? (cols >= 12 ? 6 : cols) : cols >= 12 ? 3 : cols >= 6 ? 2 : 1);

export function Dashboard() {
  const { ctx, data, user, prefs, setPrefs, f, toast, teamColor, setCal, run } = useApp();
  const shell = useShell();
  const router = useRouter();
  const [popup, setPopup] = useState<'absence' | 'issues' | 'customize' | 'cockpit' | null>(null);
  const lead = user.role !== 'Mitarbeiter';
  const layoutKey = lead ? 'lead' : 'emp';
  const allowed = pagesFor(ctx);

  /* Daten für alle Kacheln einmal berechnen */
  const c = useMemo(() => {
    const today = isoDate(new Date());
    const name = user.name;
    const mine = data.entries.filter((a) => a.employee === name);
    const byTime = (a: Entry, b: Entry) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '');
    const upcoming = mine.filter((a) => !a.isAbsence && a.date >= today && (a.kind === 'Dienstplan' || a.kind === 'Bereitschaft')).sort(byTime);
    const scope: Team[] = lead ? scopeTeams(ctx) : data.teams.filter((t) => currentUserTeamNames(ctx).includes(t.name));
    const scopeNames = new Set(scope.map((t) => t.name));
    const members = new Set(data.staff.filter((s) => scope.some((t) => t.memberIds.includes(s.id))).map((s) => s.name));
    const seen = new Set<string>();
    const absences = data.entries
      .filter((a) => a.isAbsence && a.date === today && (scopeNames.has(a.team) || members.has(a.employee)))
      .filter((a) => {
        const k = a.employee + '|' + a.shift + '|' + (a.start || '');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.employee.localeCompare(b.employee));
    const ws = weekStart(new Date());
    const todays = data.entries.filter((a) => a.date === today && scopeNames.has(a.team));
    const issues: Issue[] = [];
    if (lead) {
      scope.forEach((t) => {
        if (!t.leaderId) issues.push({ level: 'warn', icon: 'users', title: `${t.name} ohne Teamleiter`, text: 'In der Teamverwaltung festlegen', page: 'Administration', query: { team: t.id } });
        if (!t.deputyId) issues.push({ level: 'warn', icon: 'users', title: `${t.name} ohne Stellvertretung`, text: 'Stellvertretung in der Teamverwaltung festlegen', page: 'Administration', query: { team: t.id } });
      });
      const horizon = Array.from({ length: 14 }, (_, i) => isoDate(addDays(new Date(), i)));
      scope.forEach((t) => {
        const gaps = horizon.filter((date) => !data.entries.some((a) => a.date === date && a.team === t.name && a.kind === 'Bereitschaft'));
        if (gaps.length) issues.push({ level: 'crit', icon: 'moon', title: `${t.name}: ${gaps.length} ${gaps.length === 1 ? 'Tag' : 'Tage'} ohne Bereitschaft`, text: 'Erster offener Tag: ' + f.fmtIsoDate(gaps[0]), page: 'Bereitschaft', query: { view: 'Woche', date: gaps[0], team: t.name } });
      });
      const ids = computeConflicts(data.entries);
      const hits = data.entries.filter((a) => !a.isAbsence && ids.has(a.id) && horizon.includes(a.date) && scopeNames.has(a.team)).sort((a, b) => a.date.localeCompare(b.date));
      if (hits.length) issues.unshift({ level: 'crit', icon: 'cal', title: `${hits.length} Überschneidung${hits.length === 1 ? '' : 'en'}`, text: 'Dienst oder Bereitschaft trifft auf Abwesenheit oder einen anderen Dienst (nächste 14 Tage)', page: 'Dienstplan', query: { view: 'Woche', date: hits[0].date, team: hits[0].team, conflicts: '1' } });
    }
    return {
      today,
      name,
      mine,
      duties: upcoming.filter((a) => a.kind === 'Dienstplan'),
      standbys: upcoming.filter((a) => a.kind === 'Bereitschaft'),
      scope,
      scopeNames,
      absences,
      ws,
      weekHours: mine.filter((a) => a.kind === 'Dienstplan' && !a.isAbsence && a.date >= isoDate(ws) && a.date <= isoDate(addDays(ws, 6))).reduce((s, a) => s + netHours(a), 0),
      teamDuties: todays.filter((a) => a.kind === 'Dienstplan' && !a.isAbsence).sort((a, b) => (a.start || '').localeCompare(b.start || '') || a.employee.localeCompare(b.employee)),
      teamStandbys: todays.filter((a) => a.kind === 'Bereitschaft'),
      memberCount: new Set(scope.flatMap((t) => t.memberIds)).size,
      issues,
    };
  }, [data, user.name, lead, ctx, f]);
  const wp = useMemo(() => buildWpIndex(data.entries), [data.entries]);

  const goCal = (page: 'Dienstplan' | 'Bereitschaft', view: string, opts: { teams?: string[]; member?: string; query?: Record<string, string> } = {}) => {
    if (!allowed.includes(page)) return toast('Dieser Bereich ist für deine Benutzergruppe nicht freigegeben.');
    setCal(page, { view, date: isoDate(new Date()), mobileDate: '', onlyConflicts: false, ...(opts.teams ? { teams: opts.teams } : {}), ...(opts.member !== undefined ? { member: opts.member || 'Alle Mitarbeiter' } : {}) });
    shell.go(page, opts.query);
  };
  const openIssue = (x: Issue) => {
    if (!allowed.includes(x.page)) return toast('Dieser Bereich ist für deine Benutzergruppe nicht freigegeben.');
    if (x.page === 'Dienstplan' || x.page === 'Bereitschaft') setCal(x.page, { teams: x.query?.team ? [x.query.team] : [], onlyConflicts: !!x.query?.conflicts, view: x.query?.view || 'Woche', date: x.query?.date || '' });
    shell.go(x.page, x.query);
  };
  const openCockpit = () => {
    const url = data.settings.cockpitLink.url;
    if (!url) return toast(user.role === 'Admin' ? 'Für „Mein Porsche Cockpit“ ist noch kein Link hinterlegt. Du kannst ihn unter Einstellungen → Links festlegen.' : 'Für „Mein Porsche Cockpit“ ist noch kein Link hinterlegt. Bitte wende dich an einen Admin.');
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const dutyPill = (a: Entry) =>
    swapOpenFor(data.swaps, a.id) ? (
      <span className="swap-pill">
        <Icon name="refresh" />
        Tausch angefragt
      </span>
    ) : null;
  const hint = (a: Entry) => {
    const w = wp.wpFor(a);
    return w ? (
      <span className={`wp-hint ${w.shift === 'Homeoffice' ? 'is-home' : 'is-office'} on-light`}>
        <Icon name={w.shift === 'Homeoffice' ? 'home' : 'build'} />
        {w.shift}
      </span>
    ) : null;
  };
  const daysUntil = (iso: string) => Math.round((day(iso).getTime() - day(c.today).getTime()) / 86400000);
  const inDays = (n: number) => (n <= 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

  interface Widget {
    id: string;
    title: string;
    desc: string;
    size: Size;
    lead?: boolean;
    hidden?: boolean;
    icon: string;
    render: () => ReactNode;
    action?: () => void;
  }
  const WIDGETS: Widget[] = [
    {
      id: 'today', title: 'Heute', desc: 'Dein heutiger Dienst in der Akzentfarbe', size: 'full', icon: 'sun',
      render: () => {
        const abs = c.mine.find((a) => a.isAbsence && a.date === c.today),
          duty = c.duties.filter((a) => a.date === c.today),
          sb = c.standbys.find((a) => a.date === c.today);
        return (
          <div className="today-hero">
            <span>HEUTE</span>
            {duty.length ? (
              <>
                <b>{duty.map((a) => `${a.shift} · ${tRange(a)}`).join(' / ')}</b>
                <small>
                  {duty[0].team}
                  {sb ? ` · Bereitschaft ${tRange(sb)}` : ''}
                </small>
              </>
            ) : abs ? (
              <>
                <b>{abs.shift}</b>
                <small>
                  {abs.start ? `${abs.start}–${abs.end} · ` : ''}
                  {abs.team}
                </small>
              </>
            ) : sb ? (
              <>
                <b>Bereitschaft · {tRange(sb)}</b>
                <small>{sb.team}</small>
              </>
            ) : (
              <>
                <b>Kein Dienst eingetragen</b>
                <small>Genieße deinen freien Tag.</small>
              </>
            )}
          </div>
        );
      },
    },
    { id: 'kDuties', title: 'Kommende Dienste', desc: 'Anzahl deiner nächsten Dienste', size: 'tile', icon: 'cal', render: () => <StatCard label="Kommende Dienste" value={c.duties.length} note={c.duties[0] ? 'Nächster: ' + f.fmtShortWd(day(c.duties[0].date)) : 'Keine Dienste geplant'} icon="cal" />, action: () => goCal('Dienstplan', 'Woche') },
    { id: 'kStandby', title: 'Kommende Bereitschaften', desc: 'Anzahl deiner nächsten Bereitschaften', size: 'tile', icon: 'moon', render: () => <StatCard label="Kommende Bereitschaften" value={c.standbys.length} note={c.standbys[0] ? 'Nächste: ' + f.fmtShortWd(day(c.standbys[0].date)) : 'Keine Bereitschaft geplant'} icon="moon" />, action: () => goCal('Bereitschaft', 'Woche', { teams: [], member: '' }) },
    {
      id: 'kAbsence', title: 'Aktuelle Abwesenheiten', desc: 'Wer heute fehlt', size: 'tile', icon: 'plane',
      render: () => {
        const n = new Set(c.absences.map((a) => a.employee)).size;
        return <StatCard label="Aktuelle Abwesenheiten" value={n} note={n ? [...new Set(c.absences.map((a) => a.shift))].slice(0, 2).join(', ') : 'Niemand abwesend'} icon="travel" tone="amber" />;
      },
      action: () => setPopup('absence'),
    },
    { id: 'kIssues', title: 'Offene Punkte', desc: 'Automatisch erkannte Lücken & Konflikte', size: 'tile', lead: true, icon: 'alert', render: () => <StatCard label="Offene Punkte" value={c.issues.length} note={c.issues.length ? `${c.issues.filter((i) => i.level === 'crit').length} kritisch` : 'Alles erledigt'} icon="alert" tone="red" />, action: () => setPopup('issues') },
    {
      id: 'kSwaps', title: 'Diensttausch', desc: 'Offene Tauschanfragen an dich und von dir', size: 'tile', icon: 'refresh',
      render: () => {
        const inc = swapsIncoming(ctx).length,
          out = swapsOutgoing(ctx).length;
        return <StatCard label="Diensttausch" value={inc} note={inc ? (inc === 1 ? 'Anfrage wartet auf dich' : 'Anfragen warten auf dich') : out ? `${out} eigene ${out === 1 ? 'Anfrage' : 'Anfragen'} offen` : 'Keine offenen Anfragen'} icon="refresh" tone={inc ? 'amber' : ''} />;
      },
      action: () => shell.openSwapCenter(),
    },
    { id: 'kHours', title: 'Mein Porsche Cockpit', desc: 'Ich@Porsche – Übersicht: Homeoffice- & Bürotage', size: 'tile', icon: 'external', render: () => <StatCard label="Mein Porsche Cockpit" value="Ich@Porsche" note="Übersicht: Homeoffice- & Bürotage" icon="external" tone="cockpit" />, action: openCockpit },
    {
      id: 'kTeamDuty', title: 'Heute im Dienst', desc: 'Besetzung deiner Teams heute', size: 'tile', lead: true, hidden: true, icon: 'users',
      render: () => {
        const on = new Set(c.teamDuties.map((a) => a.employee)).size,
          pct = c.memberCount ? Math.round((on / c.memberCount) * 100) : 0;
        return (
          <StatCard
            label="Heute im Dienst"
            value={
              <>
                {on}
                <small> / {c.memberCount}</small>
              </>
            }
            note={`${pct} % Besetzung`}
            icon="users"
          />
        );
      },
      action: () => goCal('Dienstplan', 'Team'),
    },
    {
      id: 'kTeamStandby', title: 'Bereitschaft heute', desc: 'Bereitschaften deiner Teams heute', size: 'tile', lead: true, hidden: true, icon: 'moon',
      render: () => {
        const missing = c.scope.length - new Set(c.teamStandbys.map((a) => a.team)).size;
        return <StatCard label="Bereitschaft heute" value={c.teamStandbys.length} note={missing > 0 ? `${missing} Team(s) ohne Bereitschaft` : 'Alle Teams besetzt'} icon="moon" />;
      },
      action: () => goCal('Bereitschaft', 'Woche'),
    },
    {
      id: 'kWorkplace', title: 'Büro & Homeoffice', desc: 'Deine Büro- und Homeoffice-Tage in diesem Monat', size: 'half', icon: 'home',
      render: () => {
        const m = c.today.slice(0, 7),
          mine = c.mine.filter((a) => a.kind === 'Arbeitsort' && a.date.slice(0, 7) === m);
        const office = new Set(mine.filter((a) => a.shift === 'Büro').map((a) => a.date)).size,
          home = new Set(mine.filter((a) => a.shift === 'Homeoffice').map((a) => a.date)).size;
        const total = office + home,
          po = total ? Math.round((office / total) * 100) : 0;
        return (
          <div className="stat-card dash-stat wp-card">
            <div className="wp-head">
              <span className="stat-label">Büro &amp; Homeoffice</span>
              <span className="wp-month">
                <Icon name="cal" />
                {f.monthName(new Date())}
              </span>
            </div>
            <div className="wp-grid">
              <div className="wp-box office">
                <span className="wp-ic">
                  <Icon name="build" />
                </span>
                <span className="wp-num">
                  <b>{office}</b>
                  <small>{office === 1 ? 'Tag' : 'Tage'} Büro</small>
                </span>
              </div>
              <div className="wp-box home">
                <span className="wp-ic">
                  <Icon name="home" />
                </span>
                <span className="wp-num">
                  <b>{home}</b>
                  <small>{home === 1 ? 'Tag' : 'Tage'} Homeoffice</small>
                </span>
              </div>
            </div>
            {total ? (
              <>
                <div className="wp-bar" role="img" aria-label={`${po} % Büro, ${100 - po} % Homeoffice`}>
                  <i style={{ width: `${po}%` }} />
                </div>
                <div className="wp-legend">
                  <span>
                    <i className="o" />
                    {po} % Büro
                  </span>
                  <span>
                    <i className="h" />
                    {100 - po} % Homeoffice
                  </span>
                </div>
              </>
            ) : (
              <div className="wp-empty">Diesen Monat noch keine Arbeitsorte eingetragen</div>
            )}
          </div>
        );
      },
      action: () => goCal('Dienstplan', 'Monat', { teams: currentUserTeamNames(ctx), member: user.name }),
    },
    {
      id: 'myDuties', title: 'Meine Dienste', desc: 'Montag bis Freitag, 5 Tage ab heute', size: 'half', icon: 'cal',
      render: () => {
        const days: string[] = [];
        let d = new Date();
        d.setHours(12, 0, 0, 0);
        while ((d.getDay() + 6) % 7 > 4) d = addDays(d, 1);
        while (days.length < 5) {
          if ((d.getDay() + 6) % 7 < 5) days.push(isoDate(d));
          d = addDays(d, 1);
        }
        return (
          <section className="panel dash-panel">
            <div className="panel-head">
              <div>
                <h2>Meine Dienste</h2>
                <p className="sub">Montag bis Freitag · ab heute</p>
              </div>
              <button className="btn" onClick={() => shell.go('Dienstplan')}>
                Dienstplan öffnen
              </button>
            </div>
            {days.map((iso, i) => {
              const dt = day(iso),
                wd = (dt.getDay() + 6) % 7;
              const items = c.mine.filter((a) => a.date === iso && a.kind === 'Dienstplan' && !a.isAbsence).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
              const abs = c.mine.find((a) => a.date === iso && a.isAbsence);
              return (
                <div key={iso}>
                  {i > 0 && wd === 0 && <div className="dash-week-sep">Nächste Woche</div>}
                  <div className={`dash-day-row ${iso === c.today ? 'is-today' : ''}`}>
                    <div className="dash-day">
                      <b>{f.weekdays[wd]}</b>
                      <small>{f.fmtShort(dt)}</small>
                      {iso === c.today && <em>Heute</em>}
                    </div>
                    <div className="dash-day-items">
                      {items.length ? (
                        items.map((a) => (
                          <div key={a.id} className="dash-duty" style={{ '--c': shiftHexColor(assignmentColor(a, data.teams)) } as CSSProperties}>
                            <div>
                              <b>{a.shift}</b>
                              <small>{a.team}</small>
                              {hint(a)}
                              {dutyPill(a)}
                            </div>
                            <span className="employee-time-pill">{tRange(a)}</span>
                          </div>
                        ))
                      ) : abs ? (
                        <div className="dash-duty is-absence">
                          <div>
                            <b>{abs.shift}</b>
                            <small>Abwesenheit{abs.start ? ` · ${abs.start}–${abs.end}` : ''}</small>
                          </div>
                        </div>
                      ) : (
                        <div className="dash-duty is-free">
                          <div>
                            <b>Kein Dienst</b>
                            <small>Frei</small>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        );
      },
    },
    {
      id: 'myStandby', title: 'Meine Bereitschaften', desc: 'Aktuelle und nächste Bereitschaft', size: 'half', icon: 'moon',
      render: () => {
        const list = c.mine.filter((a) => a.kind === 'Bereitschaft' && a.date >= isoDate(addDays(new Date(), -31))).sort((a, b) => a.date.localeCompare(b.date));
        const runs: { from: string; to: string; team: string; items: Entry[] }[] = [];
        list.forEach((a) => {
          const last = runs[runs.length - 1];
          if (last && last.team === a.team && daysUntil(a.date) - daysUntil(last.to) === 1) {
            last.to = a.date;
            last.items.push(a);
          } else if (!(last && last.to === a.date)) runs.push({ from: a.date, to: a.date, team: a.team, items: [a] });
        });
        const cur = runs.find((r) => r.from <= c.today && r.to >= c.today),
          next = runs.find((r) => r.from > c.today);
        const range = (r: (typeof runs)[0]) => (r.from === r.to ? f.fmtShortWd(day(r.from)) : `${f.fmtShortWd(day(r.from))} – ${f.fmtShortWd(day(r.to))}`);
        const block = (r: (typeof runs)[0], label: string, cls: string) => {
          const a = r.items.find((x) => x.date === c.today) || r.items[0];
          return (
            <div className={`dash-sb ${cls}`}>
              <div className="dash-sb-label">{label}</div>
              <b>{range(r)}</b>
              <small>
                {r.team} · {tRange(a)}
              </small>
            </div>
          );
        };
        return (
          <section className="panel dash-panel dash-standby">
            <div className="panel-head">
              <h2>Meine Bereitschaften</h2>
              <button className="btn" onClick={() => shell.go('Bereitschaft')}>
                Bereitschaft öffnen
              </button>
            </div>
            {cur && block(cur, 'Du hast Bereitschaft', 'is-now')}
            {next && block(next, `Nächste Bereitschaft · ${inDays(daysUntil(next.from))}`, '')}
            {!cur && !next && <div className="employee-empty">Keine Bereitschaft geplant.</div>}
          </section>
        );
      },
    },
    {
      id: 'teamToday', title: 'Heute im Dienst (Teams)', desc: 'Liste aller Dienste deiner Teams heute', size: 'half', lead: true, icon: 'users',
      render: () => (
        <section className="panel dash-panel">
          <div className="panel-head">
            <div>
              <h2>Heute im Dienst</h2>
              <p className="sub">{f.fmtWithWeekday(new Date())}</p>
            </div>
            <button className="btn" onClick={() => shell.go('Dienstplan')}>
              Dienstplan öffnen
            </button>
          </div>
          {c.teamDuties.length ? (
            <>
              {c.teamDuties.slice(0, 8).map((a) => (
                <div className="schedule-row" key={a.id}>
                  <div className="schedule-time">{tRange(a)}</div>
                  <div className="person">
                    <Avatar name={a.employee} color={teamColor(a.team)} size={32} />
                    <div>
                      <b>{a.employee}</b>
                      <small>{a.shift}</small>
                    </div>
                  </div>
                  <span className="pill" style={{ '--c': teamColor(a.team) } as CSSProperties}>
                    {a.team}
                  </span>
                </div>
              ))}
              {c.teamDuties.length > 8 && <div className="more-line">+ {c.teamDuties.length - 8} weitere</div>}
            </>
          ) : (
            <div className="empty-note">Heute sind keine Dienste eingetragen.</div>
          )}
        </section>
      ),
    },
    {
      id: 'standbyToday', title: 'Bereitschaft heute (Teams)', desc: 'Wer heute erreichbar ist – mit Anruf-Button', size: 'half', lead: true, icon: 'shield',
      render: () => (
        <section className="panel dash-panel">
          <div className="panel-head">
            <div>
              <h2>Bereitschaft heute</h2>
              <p className="sub">Direkt erreichbar</p>
            </div>
            <span className="pill teal">{c.teamStandbys.length} aktiv</span>
          </div>
          {c.teamStandbys.length ? (
            c.teamStandbys.slice(0, 6).map((a) => {
              const p = data.staff.find((x) => x.name === a.employee);
              return (
                <div className="schedule-row standby-row" key={a.id}>
                  <div className="person">
                    <Avatar name={a.employee} color={teamColor(a.team)} size={34} />
                    <div>
                      <b>{a.employee}</b>
                      <small>
                        {a.team} · {tRange(a)}
                      </small>
                    </div>
                  </div>
                  {p?.phone && (
                    <a className="btn small" href={`tel:${p.phone.replace(/\s+/g, '')}`}>
                      Anrufen
                    </a>
                  )}
                </div>
              );
            })
          ) : (
            <div className="empty-note">Heute ist keine Bereitschaft eingetragen.</div>
          )}
        </section>
      ),
    },
    {
      id: 'weekLoad', title: 'Wochenauslastung', desc: 'Dienste, Bereitschaften und Abwesenheiten je Tag', size: 'half', lead: true, icon: 'chart',
      render: () => {
        const stats = Array.from({ length: 7 }, (_, i) => {
          const date = isoDate(addDays(c.ws, i));
          const it = data.entries.filter((a) => a.date === date && c.scopeNames.has(a.team));
          return { date, d: it.filter((a) => a.kind === 'Dienstplan' && !a.isAbsence).length, s: it.filter((a) => a.kind === 'Bereitschaft').length, a: it.filter((a) => a.isAbsence).length };
        });
        const max = Math.max(1, ...stats.map((x) => x.d + x.s + x.a));
        return (
          <section className="panel dash-panel">
            <div className="panel-head">
              <div>
                <h2>Wochenauslastung KW {isoWeek(c.ws)}</h2>
                <p className="sub">Dienste, Bereitschaften und Abwesenheiten</p>
              </div>
            </div>
            <div className="week-bars">
              {stats.map((x, i) => (
                <div key={x.date} className={`week-bar ${x.date === c.today ? 'today' : ''}`} title={`${x.d} Dienste · ${x.s} Bereitschaften · ${x.a} Abwesenheiten`}>
                  <div className="week-bar-stack">
                    <i className="a" style={{ height: `${(x.a / max) * 100}%` }} />
                    <i className="s" style={{ height: `${(x.s / max) * 100}%` }} />
                    <i className="d" style={{ height: `${(x.d / max) * 100}%` }} />
                  </div>
                  <b>{x.d + x.s}</b>
                  <span>{f.weekdays[i]}</span>
                </div>
              ))}
            </div>
          </section>
        );
      },
    },
  ];

  const available = WIDGETS.filter((w) => !w.lead || lead);
  const saved = prefs.dashLayout[`${user.id}|${layoutKey}`] || prefs.dashLayout[layoutKey];
  const hidden = saved?.hidden ?? available.filter((w) => w.hidden).map((w) => w.id);
  const visible = available.filter((w) => !hidden.includes(w.id));
  const colored = !visible.some((w) => w.id === 'today');

  /* Raster: jede Ansicht hat eine Spalte (x) und fällt nach oben, bis sie auf eine andere trifft */
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const layout = () => {
      const cols = dashCols(el.clientWidth);
      el.style.setProperty('--cols', String(cols));
      el.style.minHeight = el.offsetHeight + 'px'; // Seite darf beim Messen nicht kürzer werden
      el.classList.remove('dash-sized');
      const def = DEFAULT_LAYOUT[layoutKey];
      const order = available.map((w) => w.id);
      const pos: Record<string, { x: number; k: number }> = {};
      let cur = 0;
      const seq = [...def.filter(([id]) => order.includes(id)), ...order.filter((id) => !def.some(([d]) => d === id)).map((id) => [id, 0] as [string, number])];
      seq.forEach(([id, x], k) => {
        const size = WIDGETS.find((w) => w.id === id)?.size || 'tile';
        const w = dashW(size, cols);
        let xx: number;
        if (cols === 12 && x + w <= 12) xx = x;
        else {
          if (cur + w > cols) cur = 0;
          xx = cur;
          cur = (cur + w) % cols;
        }
        pos[id] = { x: xx, k };
      });
      const els = [...el.querySelectorAll<HTMLElement>('.dash-w')];
      els.forEach((n) => {
        n.style.gridColumn = `span ${dashW(n.dataset.size as Size, cols)}`;
        n.style.gridRow = 'auto';
      });
      const items = els.map((n) => {
        const p = pos[n.dataset.widget!] || { x: 0, k: 1e6 };
        return { n, size: n.dataset.size as Size, w: dashW(n.dataset.size as Size, cols), x: p.x, k: p.k, y: 0, h: Math.max(1, Math.ceil(((n.firstElementChild as HTMLElement)?.offsetHeight + 16) / 8)) };
      });
      const pack = () => {
        items.sort((a, b) => a.k - b.k || a.x - b.x);
        const placed: typeof items = [];
        items.forEach((it) => {
          it.x = Math.max(0, Math.min(cols - it.w, Math.round(it.x)));
          let y = 0;
          placed.forEach((p) => {
            if (p.x < it.x + it.w && it.x < p.x + p.w) y = Math.max(y, p.y + p.h);
          });
          it.y = y;
          placed.push(it);
        });
      };
      pack();
      const tiles = items.filter((i) => i.size === 'tile');
      if (tiles.length) {
        const h = Math.max(...tiles.map((i) => i.h));
        tiles.forEach((i) => (i.h = h));
      }
      items.forEach((i) => (i.k = i.y + i.x / 100));
      pack();
      items.forEach((i) => {
        i.n.style.gridColumn = `${i.x + 1} / span ${i.w}`;
        i.n.style.gridRow = `${i.y + 1} / span ${i.h}`;
      });
      el.classList.add('dash-sized');
      el.style.minHeight = '';
    };
    layout();
    const t = setTimeout(layout, 150);
    window.addEventListener('resize', layout);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', layout);
    };
  });

  const first = user.name.split(' ')[0];
  return (
    <>
      <Heading
        title={lead ? `Guten Tag, ${first}` : `Hallo ${first}`}
        actions={
          <>
            {lead && manageableTeams(ctx, 'Dienstplan').length > 0 && (
              <button className="btn primary" onClick={() => router.push('/dienstplan')}>
                ＋ Dienst einteilen
              </button>
            )}
            <button className="btn" onClick={() => setPopup('customize')}>
              <Icon name="sliders" />
              Dashboard anpassen
            </button>
          </>
        }
      />
      <div className={`dash dash-grid ${colored ? 'dash-colored' : ''}`} id="dash" ref={root}>
        {visible.length ? (
          visible.map((w) => (
            <div
              key={w.id}
              className={`dash-w dash-${w.size}`}
              data-widget={w.id}
              data-size={w.size}
              role={w.action ? 'button' : undefined}
              tabIndex={w.action ? 0 : undefined}
              onClick={(e) => {
                if (!w.action || (e.target as HTMLElement).closest('a,button,input,select')) return;
                w.action();
              }}
              onKeyDown={(e) => {
                if (w.action && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  w.action();
                }
              }}
            >
              {w.render()}
            </div>
          ))
        ) : (
          <div className="empty-note">Alle Ansichten sind ausgeblendet. Über „Dashboard anpassen“ kannst du sie wieder einblenden.</div>
        )}
      </div>

      {popup === 'absence' && (
        <InfoDialog title="Aktuelle Abwesenheiten" sub={`${f.fmtWithWeekday(new Date())} · ${new Set(c.absences.map((a) => a.employee)).size} abwesend`} onClose={() => setPopup(null)}>
          {c.absences.length ? (
            c.absences.map((a) => {
              let to = a.date;
              for (let i = 0; i < 60; i++) {
                const nx = isoDate(addDays(day(to), 1));
                if (data.entries.some((x) => x.isAbsence && x.employee === a.employee && x.shift === a.shift && x.date === nx)) to = nx;
                else break;
              }
              return (
                <div className="dash-abs-row" key={a.id}>
                  <Avatar name={a.employee} color={teamColor(a.team)} size={36} />
                  <div className="dash-abs-main">
                    <b>{a.employee}</b>
                    <small>
                      {a.team}
                      {a.note ? ' · ' + a.note : ''}
                    </small>
                  </div>
                  <div className="dash-abs-type">
                    <span className={`abs-pill ${ABSENCE_FULLDAY.includes(a.shift) ? '' : 'partial'}`}>{a.shift}</span>
                    <small>{!a.start ? (to > a.date ? 'bis ' + f.fmtShortWd(day(to)) : 'ganztägig') : tRange(a)}</small>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="employee-empty">Heute ist niemand abwesend.</div>
          )}
        </InfoDialog>
      )}
      {popup === 'issues' && (
        <InfoDialog title="Offene Punkte" sub={c.issues.length ? `${c.issues.length} offen · ${c.issues.filter((i) => i.level === 'crit').length} kritisch · Antippen führt direkt zur betroffenen Stelle` : 'Automatisch erkannte Lücken & Konflikte'} onClose={() => setPopup(null)}>
          {c.issues.length ? (
            c.issues.map((x, i) => {
              const ok = allowed.includes(x.page);
              return (
                <button
                  key={i}
                  type="button"
                  className={`dash-issue ${x.level}`}
                  disabled={!ok}
                  onClick={() => {
                    setPopup(null);
                    openIssue(x);
                  }}
                >
                  <span className="issue-icon">
                    <Icon name={x.icon} />
                  </span>
                  <span className="dash-issue-main">
                    <b>{x.title}</b>
                    <small>
                      {x.text}
                      {ok ? '' : ' · keine Berechtigung'}
                    </small>
                  </span>
                  {ok && (
                    <span className="dash-issue-go">
                      <Icon name="chev" />
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="employee-empty">Alles erledigt – keine offenen Punkte. 🎉</div>
          )}
        </InfoDialog>
      )}
      {popup === 'customize' && (
        <CustomizeDialog
          widgets={available}
          hidden={hidden}
          onClose={() => setPopup(null)}
          onSave={(h) => {
            setPrefs({ dashLayout: { ...prefs.dashLayout, [`${user.id}|${layoutKey}`]: { hidden: h, known: available.map((w) => w.id) } } });
            toast('Dashboard gespeichert.');
            setPopup(null);
          }}
          onReset={() => {
            const next = { ...prefs.dashLayout };
            delete next[`${user.id}|${layoutKey}`];
            setPrefs({ dashLayout: next });
            toast('Standard wiederhergestellt.');
            setPopup(null);
          }}
        />
      )}
      {popup === 'cockpit' && <CockpitDialog onClose={() => setPopup(null)} onSave={(u) => run(setCockpitLink(u))} />}
    </>
  );
}

function CustomizeDialog({ widgets, hidden, onClose, onSave, onReset }: { widgets: { id: string; title: string; desc: string; size: Size; icon: string }[]; hidden: string[]; onClose: () => void; onSave: (h: string[]) => void; onReset: () => void }) {
  const [h, setH] = useState(hidden);
  return (
    <Modal
      title="Dashboard anpassen"
      icon="grid"
      className="form-dialog dcfg-modal"
      onClose={onClose}
      onSubmit={() => onSave(h)}
      footer={
        <ModalActions
          onCancel={onClose}
          left={
            <span className="dcfg-tools">
              <button type="button" className="btn ghost small" onClick={onReset}>
                <Icon name="refresh" />
                Standard
              </button>
            </span>
          }
        />
      }
    >
      <div className="dcfg">
        {(
          [
            ['full', 'Banner'],
            ['tile', 'Kacheln'],
            ['half', 'Bereiche'],
          ] as const
        ).map(([k, label]) => {
          const ws = widgets.filter((w) => w.size === k);
          if (!ws.length) return null;
          return (
            <section className="dcfg-group" key={k}>
              <div className="dcfg-group-head">
                <b>{label}</b>
              </div>
              <div className="dcfg-grid">
                {ws.map((w) => (
                  <label className="dcfg-card" key={w.id}>
                    <span className="dcfg-ic">
                      <Icon name={w.icon} />
                    </span>
                    <span className="dcfg-txt">
                      <b>{w.title}</b>
                      <small>{w.desc}</small>
                    </span>
                    <input type="checkbox" checked={!h.includes(w.id)} onChange={(e) => setH(e.target.checked ? h.filter((x) => x !== w.id) : [...h, w.id])} />
                    <span className="dcfg-switch" aria-hidden="true" />
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

export function CockpitDialog({ onClose, onSave }: { onClose: () => void; onSave: (url: string) => Promise<{ ok: boolean }> }) {
  const { data } = useApp();
  const [url, setUrl] = useState(data.settings.cockpitLink.url || '');
  return (
    <Modal
      title="Link „Mein Porsche Cockpit“"
      sub="Nur für Admins. Der Link lässt sich jederzeit hier ändern."
      icon="external"
      className="form-dialog"
      onClose={onClose}
      onSubmit={async () => {
        const r = await onSave(url);
        if (r.ok) onClose();
      }}
      footer={<ModalActions onCancel={onClose} />}
    >
      <Field label="Adresse (URL)" note="Ein Klick auf die Kachel „Mein Porsche Cockpit“ öffnet diese Seite in einem neuen Tab – für alle Benutzer. Leer lassen entfernt den Link.">
        <input type="text" inputMode="url" autoComplete="url" spellCheck={false} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
    </Modal>
  );
}
