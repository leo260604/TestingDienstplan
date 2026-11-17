'use client';
/* Diensttausch: Anfrage-Dialog mit Kalender und Übersicht (offene Anfragen & Verlauf) */
import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../AppProvider';
import { Avatar, Dot, Field, Icon, InfoDialog, Modal, ModalActions, Picker } from '../ui';
import { addDays, day, isoDate } from '@/lib/dates';
import { assignmentColor, shiftHexColor, tRange } from '@/lib/entries';
import { canRequestSwap, swapColleagues, swapOpenFor, swapProblems, swapRange, swapSnap, swapsIncoming, swapsOutgoing, swapTeamsOf } from '@/lib/swaps';
import { decideSwap, requestSwap, withdrawSwap } from '@/server/actions/swaps';
import type { Entry, SwapRequest, SwapSnap } from '@/lib/types';

export function SwapRequestDialog({ entryId, onClose, onOpenCenter }: { entryId?: string; onClose: () => void; onOpenCenter: () => void }) {
  const { ctx, data, user, f, run, teamColor, toast } = useApp();
  const me = user.name;
  const today = isoDate(new Date());
  const myTeams = swapTeamsOf(ctx, me);
  const cols = swapColleagues(ctx);
  const pre = entryId ? data.entries.find((e) => e.id === entryId) : undefined;
  const duties = (name: string) => data.entries.filter((x) => x.kind === 'Dienstplan' && !x.isAbsence && x.employee === name);
  const startDate =
    pre?.date ||
    duties(me)
      .filter((x) => x.date >= today && myTeams.includes(x.team) && !swapOpenFor(data.swaps, x.id))
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date ||
    today;
  const first = cols.find((p) => duties(p.name).some((x) => x.date === startDate)) || cols[0];
  const [to, setTo] = useState(first?.name || '');
  const [dates, setDates] = useState<string[]>([startDate]);
  const [note, setNote] = useState('');
  const [month, setMonth] = useState(() => {
    const d = day(startDate);
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const shared = (other: string) => myTeams.filter((t) => swapTeamsOf(ctx, other).includes(t));
  const mineOn = (date: string) => duties(me).filter((x) => x.date === date && shared(to).includes(x.team));
  const theirsOn = (date: string) => duties(to).filter((x) => x.date === date && shared(to).includes(x.team));
  const give: Entry[] = dates.flatMap((d) => (d >= today ? mineOn(d) : []));
  const take: Entry[] = dates.flatMap((d) => (d >= today ? theirsOn(d) : []));

  const problems = useMemo(() => {
    const pr: string[] = [];
    if (!dates.length) pr.push('Bitte im Kalender mindestens einen Tag auswählen.');
    const none = dates.filter((d) => d >= today && !mineOn(d).length);
    if (none.length) pr.push(`Du hast am ${none.map((d) => f.fmtIsoDate(d)).join(', ')} keinen Dienst, den du tauschen kannst.`);
    if ([...give, ...take].some((x) => swapOpenFor(data.swaps, x.id))) pr.push('Für einen der Dienste läuft bereits eine Tauschanfrage.');
    return pr.length ? pr : swapProblems(ctx, give.map(swapSnap), take.map(swapSnap), me, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, to, data]);

  if (!canRequestSwap(ctx) || !cols.length) {
    return (
      <InfoDialog title="Diensttausch anfragen" onClose={onClose}>
        <div className="empty-note">{canRequestSwap(ctx) ? 'In deinen Teams gibt es niemanden, mit dem du tauschen kannst.' : 'Der Diensttausch ist für dich nicht verfügbar.'}</div>
      </InfoDialog>
    );
  }

  const y = month.getFullYear(),
    m = month.getMonth(),
    lead = (new Date(y, m, 1, 12).getDay() + 6) % 7,
    days = new Date(y, m + 1, 0).getDate();
  const maxDay = isoDate(addDays(new Date(), 180));
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const pendIn = swapsIncoming(ctx).length;
  return (
    <Modal
      title="Diensttausch anfragen"
      className="form-dialog swap-modal"
      icon="refresh"
      sub={
        <>
          Wähle die Person und den Tag – deine Dienste an diesem Tag werden getauscht.{' '}
          <button type="button" className="link-btn" onClick={onOpenCenter}>
            {pendIn ? `${pendIn} ${pendIn === 1 ? 'Anfrage wartet' : 'Anfragen warten'} auf dich` : 'Anfragen & Verlauf ansehen'}
          </button>
        </>
      }
      onClose={onClose}
      onSubmit={async () => {
        if (problems.length) return toast(problems[0]);
        const r = await run(requestSwap({ to, giveIds: give.map((x) => x.id), takeIds: take.map((x) => x.id), note }));
        if (r.ok) onClose();
      }}
      footer={<ModalActions onCancel={onClose} okLabel="Anfrage senden" disabled={problems.length > 0} />}
    >
      <div className="swap-req">
        <Field label="Mit wem möchtest du tauschen?">
          <Picker value={to} onChange={setTo} options={cols.map((p) => ({ value: p.name, label: p.name, sub: shared(p.name).join(', '), pic: 'person', color: teamColor(data.teams.find((t) => t.memberIds.includes(p.id))) }))} />
        </Field>
        <div className="swap-cols">
          <Field label={<>Datum <small className="muted">– Tage antippen</small></>}>
            <div className="scal">
              <div className="scal-head">
                <button type="button" className="icon-btn" aria-label="Voriger Monat" onClick={() => setMonth(new Date(y, m - 1, 1, 12))}>
                  <Icon name="chev" />
                </button>
                <b>{f.monthName(month)}</b>
                <button type="button" className="icon-btn scal-next" aria-label="Nächster Monat" onClick={() => setMonth(new Date(y, m + 1, 1, 12))}>
                  <Icon name="chev" />
                </button>
              </div>
              <div className="scal-grid">
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
                  <span className="scal-wd" key={w}>
                    {w}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <span className="scal-blank" key={'b' + i} />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const iso = `${prefix}-${String(i + 1).padStart(2, '0')}`;
                  const mine = duties(me).find((x) => x.date === iso && myTeams.includes(x.team));
                  const sel = dates.includes(iso);
                  const busy = mine && swapOpenFor(data.swaps, mine.id);
                  const ok = !!mine && iso >= today && !busy && iso <= maxDay;
                  const theirs = duties(to).some((x) => x.date === iso);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`scal-day ${sel ? 'on' : ''} ${ok ? 'has' : ''} ${iso === today ? 'today' : ''} ${busy ? 'busy' : ''}`}
                      disabled={!ok && !sel}
                      aria-pressed={sel}
                      title={`${f.fmtWithWeekday(day(iso))}${mine ? ` · ${mine.shift} ${tRange(mine)}` : ' · kein Dienst'}${busy ? ' · bereits angefragt' : ''}`}
                      onClick={() => {
                        if (sel) setDates(dates.filter((d) => d !== iso));
                        else if (dates.length >= 14) toast('Höchstens 14 Tage pro Anfrage.');
                        else setDates([...dates, iso].sort());
                      }}
                    >
                      <span className="scal-n">{i + 1}</span>
                      {mine && (
                        <span className="scal-shift" style={{ '--c': shiftHexColor(assignmentColor(mine, data.teams)) } as CSSProperties}>
                          {mine.shift.slice(0, 1)}
                        </span>
                      )}
                      {theirs && ok && <i className="scal-them" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              <div className="scal-legend">
                <span>
                  <i className="scal-shift lg">D</i>Dein Dienst
                </span>
                <span>
                  <i className="scal-them lg" />
                  {to.split(' ')[0]} hat Dienst
                </span>
                <span>
                  <i className="scal-sel lg" />
                  Ausgewählt
                </span>
              </div>
            </div>
          </Field>
          <Field label="Auswahl" className="swap-right">
            <div className="swap-dates">
              {dates.length ? (
                dates.map((d) => {
                  const mm = d >= today ? mineOn(d) : [],
                    tt = d >= today ? theirsOn(d) : [];
                  const dayBusy = [...mm, ...tt].some((x) => swapOpenFor(data.swaps, x.id));
                  const one = (l: Entry[]) =>
                    l.map((x) => (
                      <span key={x.id} className="block">
                        <b>{x.shift}</b> <small>{tRange(x)}</small>
                      </span>
                    ));
                  return (
                    <div className={`swap-day${dayBusy ? ' is-busy' : ''}`} key={d}>
                      <div className="swap-day-top">
                        <span className="swap-day-date">
                          <b>{f.fmtShortWd(day(d))}</b>
                        </span>
                        <button type="button" className="swap-x" aria-label="Tag entfernen" onClick={() => setDates(dates.filter((x) => x !== d))}>
                          ×
                        </button>
                      </div>
                      <div className="swap-day-line">
                        <span className="swap-give">{mm.length ? one(mm) : <em>Kein Dienst</em>}</span>
                        <span className="swap-arrow sm">
                          <Icon name="refresh" />
                        </span>
                        <span className="swap-take">{tt.length ? one(tt) : <em>{to.split(' ')[0]} hat frei</em>}</span>
                      </div>
                      {dayBusy && (
                        <small className="swap-opt-why">
                          <Icon name="alert" />
                          Bereits angefragt
                        </small>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="swap-empty">Tippe links im Kalender auf einen Tag mit deinem Dienst.</div>
              )}
            </div>
          </Field>
        </div>
        <div className={`wp-summary swap-sum-wide ${problems.length ? 'warn' : ''}`} aria-live="polite">
          {problems.length ? (
            <>
              <Icon name="alert" />
              <div>
                {problems.slice(0, 4).map((p) => (
                  <span className="block" key={p}>
                    {p}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <span className="wp-sum-ic">
                <Icon name="refresh" />
              </span>
              <div>
                <b>{take.length ? `Tausch mit ${to}` : `${to} übernimmt deinen Dienst`}</b>
                <small>
                  Du gibst {give.length} {give.length === 1 ? 'Dienst' : 'Dienste'} ab{take.length ? ` und übernimmst ${take.length}` : ''} · {to} muss bestätigen.
                </small>
              </div>
            </>
          )}
        </div>
        <Field label={<>Nachricht <small className="muted">(optional)</small></>}>
          <input maxLength={200} placeholder="z. B. Grund für den Tausch" autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="small muted swap-hint">
          <Icon name="alert" />
          Getauscht wird erst, wenn deine Kollegin bzw. dein Kollege die Anfrage bestätigt.
        </p>
      </div>
    </Modal>
  );
}

function SwapList({ list, label, empty }: { list: SwapSnap[]; label: string; empty: string }) {
  const { data, f } = useApp();
  return (
    <div className={`swap-duty ${list.length ? '' : 'is-none'}`}>
      <span className="swap-duty-label">
        {label}
        {list.length > 1 ? ` · ${list.length}` : ''}
      </span>
      {list.length ? (
        list.map((x) => {
          const c = data.shiftTypes.find((st) => st.team === x.team && st.name === x.shift);
          return (
            <div className="swap-line" key={x.id} style={{ '--c': shiftHexColor(c?.color || 'blue') } as CSSProperties}>
              <b>{x.shift}</b>
              <small>
                {f.fmtShortWd(day(x.date))}
                {x.start ? ` · ${x.start}–${x.end}` : ''}
              </small>
            </div>
          );
        })
      ) : (
        <>
          <b>{empty}</b>
          <small>Dienst wird nur übernommen</small>
        </>
      )}
    </div>
  );
}

export function SwapCenter({ focusId, onClose, onNew }: { focusId?: string; onClose: () => void; onNew: () => void }) {
  const { ctx, data, user, f, run, ask, teamColor } = useApp();
  const me = user.name;
  const focus = focusId ? data.swaps.find((x) => x.id === focusId) : undefined;
  const [tab, setTab] = useState<'open' | 'hist'>(focus && focus.status !== 'offen' ? 'hist' : 'open');
  const inc = swapsIncoming(ctx),
    out = swapsOutgoing(ctx);
  const hist = data.swaps.filter((x) => x.status !== 'offen' && (x.from === me || x.to === me)).sort((a, b) => (b.decidedAt || b.createdAt) - (a.decidedAt || a.createdAt));
  const card = (sw: SwapRequest, mode: 'in' | 'out') => {
    const other = mode === 'in' ? sw.from : sw.to;
    const left = mode === 'in' ? sw.take : sw.give,
      right = mode === 'in' ? sw.give : sw.take;
    return (
      <div className={`swap-card ${sw.id === focusId ? 'is-focus' : ''}`} key={sw.id}>
        <div className="swap-card-head">
          <Avatar name={other} color={teamColor(sw.give[0]?.team)} size={34} />
          <div>
            <b>{mode === 'in' ? `${other} fragt dich an` : `Anfrage an ${other}`}</b>
            <small>{f.fmtDateTime(sw.createdAt)}</small>
          </div>
        </div>
        <div className="swap-pair">
          <SwapList list={left} label="Du gibst ab" empty="Kein Gegendienst" />
          <span className="swap-arrow">
            <Icon name="refresh" />
          </span>
          <SwapList list={right} label="Du übernimmst" empty="—" />
        </div>
        {sw.note && <p className="swap-note">„{sw.note}“</p>}
        <div className="btn-row swap-actions">
          {mode === 'in' ? (
            <>
              <button type="button" className="btn" onClick={async () => (await ask('Anfrage wirklich ablehnen?', 'Ablehnen')) && run(decideSwap(sw.id, false))}>
                Ablehnen
              </button>
              <button type="button" className="btn primary" onClick={() => run(decideSwap(sw.id, true))}>
                <Icon name="check" />
                Annehmen &amp; tauschen
              </button>
            </>
          ) : (
            <>
              <span className="small muted">Wartet auf Bestätigung durch {other}</span>
              <button type="button" className="btn ghost" onClick={async () => (await ask('Anfrage zurückziehen?', 'Zurückziehen')) && run(withdrawSwap(sw.id))}>
                Zurückziehen
              </button>
            </>
          )}
        </div>
      </div>
    );
  };
  const STATUS: Record<string, string> = { angenommen: 'Getauscht', abgelehnt: 'Abgelehnt', zurückgezogen: 'Zurückgezogen', ungültig: 'Nicht mehr möglich' };
  return (
    <InfoDialog title="Diensttausch" sub="Anfragen bestätigen, ablehnen oder zurückziehen. Getauscht wird erst nach Bestätigung." onClose={onClose} className="swap-center">
      <div className="te-tabs swap-tabs" role="tablist">
        <button type="button" role="tab" className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>
          Offene Anfragen <span className="te-n">{inc.length + out.length}</span>
        </button>
        <button type="button" role="tab" className={tab === 'hist' ? 'active' : ''} onClick={() => setTab('hist')}>
          Verlauf <span className="te-n">{hist.length}</span>
        </button>
      </div>
      {tab === 'hist' ? (
        <div className="swap-hist">
          {hist.length ? (
            hist.slice(0, 40).map((sw) => {
              const mineOut = sw.from === me,
                other = mineOut ? sw.to : sw.from;
              return (
                <details className={`swap-hrow ${sw.id === focusId ? 'is-focus' : ''}`} key={sw.id} open={sw.id === focusId}>
                  <summary>
                    <Avatar name={other} color={teamColor(sw.give[0]?.team)} size={30} />
                    <span className="swap-hmain">
                      <b>
                        {mineOut ? 'Du → ' : ''}
                        {other}
                        {mineOut ? '' : ' → dich'}
                      </b>
                      <small>
                        {sw.take.length ? `${sw.give.length} ⇄ ${sw.take.length} Dienste` : `${sw.give.length} ${sw.give.length === 1 ? 'Dienst' : 'Dienste'} übernommen`} · {swapRange([...sw.give, ...sw.take])}
                      </small>
                    </span>
                    <span className={`swap-status ${sw.status === 'angenommen' ? 'ok' : 'no'}`}>{STATUS[sw.status]}</span>
                  </summary>
                  <div className="swap-hdetail">
                    <SwapList list={sw.give} label={`${sw.from} gibt ab`} empty="—" />
                    <SwapList list={sw.take} label={`${sw.to} gibt ab`} empty="Kein Gegendienst" />
                    {sw.note && <p className="swap-note">„{sw.note}“</p>}
                  </div>
                </details>
              );
            })
          ) : (
            <div className="empty-note">Noch keine abgeschlossenen Tauschanfragen.</div>
          )}
        </div>
      ) : (
        <>
          {canRequestSwap(ctx) && (
            <button type="button" className="btn primary swap-new" onClick={onNew}>
              <Icon name="plus" />
              Neue Tauschanfrage
            </button>
          )}
          <section className="swap-sec">
            <h3>
              Anfragen an dich <span className="pill">{inc.length}</span>
            </h3>
            {inc.length ? inc.map((x) => card(x, 'in')) : <div className="empty-note">Keine offenen Anfragen an dich.</div>}
          </section>
          <section className="swap-sec">
            <h3>
              Deine Anfragen <span className="pill">{out.length}</span>
            </h3>
            {out.length ? out.map((x) => card(x, 'out')) : <div className="empty-note">Du hast keine offenen Anfragen.</div>}
          </section>
        </>
      )}
      <Dot color="transparent" />
    </InfoDialog>
  );
}
