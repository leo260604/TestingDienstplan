'use client';
/* Rahmen der App: Seitenleiste, Kopfzeile, Benachrichtigungen, Mein Konto, Suche, Neuigkeiten */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../AppProvider';
import { Avatar, Icon, PickerPop, Toggle, resizeImage, useClientDate, useOutside } from '../ui';
import { SwapCenter, SwapRequestDialog } from '../calendar/Swap';
import { MobileTables, PageTopButton } from './PageExtras';
import { PAGE_ROUTES, pageFromPath, roleLabel, visibleRole } from '@/lib/permissions';
import { currentUserTeamNames, pagesFor } from '@/lib/access';
import { isoWeek } from '@/lib/dates';
import { CHANGELOG, APP_VERSION } from '@/lib/changelog';
import { deleteNotifications, markNotificationsRead, saveMyBirthday, updateMyAccount } from '@/server/actions/account';
import { forgetDevice, PwaClient } from '../PwaClient';
import { logout } from '@/server/actions/auth';
import { tRange } from '@/lib/entries';
import type { Page } from '@/lib/types';

const NAV: { page: Page; icon: string; group: 'work' | 'admin' | 'help' }[] = [
  { page: 'Dashboard', icon: 'grid', group: 'work' },
  { page: 'Dienstplan', icon: 'cal', group: 'work' },
  { page: 'Bereitschaft', icon: 'moon', group: 'work' },
  { page: 'Dienstzeiten', icon: 'clock', group: 'work' },
  { page: 'Kontakte', icon: 'users', group: 'work' },
  { page: 'Berichte / Export', icon: 'chart', group: 'work' },
  { page: 'Administration', icon: 'build', group: 'admin' },
  { page: 'Bereitschaft verwalten', icon: 'sliders', group: 'admin' },
  { page: 'Team Berechtigungen', icon: 'shield', group: 'admin' },
  { page: 'Audit Log', icon: 'history', group: 'admin' },
  { page: 'Export Audit', icon: 'download', group: 'admin' },
  { page: 'Hilfe', icon: 'help', group: 'help' },
];

interface ShellApi {
  openSwapCenter: (focusId?: string) => void;
  openSwapRequest: (entryId?: string) => void;
  go: (page: Page, query?: Record<string, string>) => void;
}
const ShellContext = createContext<ShellApi | null>(null);
export const useShell = () => useContext(ShellContext)!;

export function AppShell({ children }: { children: ReactNode }) {
  const { ctx, prefs, setPrefs, f, user, toast } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const page = pageFromPath(pathname) || 'Dashboard';
  const allowed = pagesFor(ctx);
  const [openOn, setOpenOn] = useState<string | null>(null);
  const mobileOpen = openOn === pathname;
  const setMobileOpen = (fn: (o: boolean) => boolean) => setOpenOn(fn(mobileOpen) ? pathname : null);
  const [collapsed, setCollapsed] = useState(() => prefs.sidebarCollapsed || (typeof window !== 'undefined' && window.innerWidth > 700 && window.innerWidth <= 1180));
  const [search, setSearch] = useState(false);
  const [whatsNew, setWhatsNew] = useState(false);
  const [swapCenter, setSwapCenter] = useState<{ focus?: string } | null>(null);
  const [swapReq, setSwapReq] = useState<{ entryId?: string } | null>(null);
  const now = useClientDate();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    document.body.classList.toggle('settings-mode', page === 'Einstellungen');
  }, [page]);

  const go = useCallback(
    (p: Page, query?: Record<string, string>) => {
      if (!allowed.includes(p)) {
        toast('Dieser Navigationspunkt ist für deine Benutzergruppe nicht freigegeben.');
        return;
      }
      const qs = query ? '?' + new URLSearchParams(query).toString() : '';
      router.push(PAGE_ROUTES[p] + qs);
    },
    [allowed, router, toast],
  );
  const api = useMemo<ShellApi>(() => ({ openSwapCenter: (focus) => setSwapCenter({ focus }), openSwapRequest: (entryId) => setSwapReq({ entryId }), go }), [go]);

  const show = (g: string) => NAV.some((n) => n.group === g && allowed.includes(n.page));

  return (
    <ShellContext.Provider value={api}>
      <PwaClient />
      <div className="app-shell">
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`} id="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <Icon name="logo" />
            </div>
            <div>
              <strong>
                DienstPlan <span>Pro</span>
              </strong>
            </div>
          </div>
          <button
            className="sidebar-collapse"
            type="button"
            aria-label={collapsed ? 'Menü ausklappen' : 'Menü einklappen'}
            title={collapsed ? 'Menü ausklappen' : 'Menü einklappen'}
            onClick={() => {
              setCollapsed(!collapsed);
              setPrefs({ sidebarCollapsed: !collapsed });
            }}
          >
            <Icon name="chev" />
          </button>
          {show('work') && <div className="workspace-label">ARBEITSBEREICH</div>}
          <nav id="main-nav" aria-label="Hauptnavigation">
            {NAV.map((n, i) => (
              <span key={n.page} style={{ display: 'contents' }}>
                {n.group === 'admin' && NAV[i - 1].group !== 'admin' && show('admin') && <div className="workspace-label admin-label">VERWALTUNG</div>}
                {n.group === 'help' && <div className="workspace-label help-label">SUPPORT</div>}
                {allowed.includes(n.page) && (
                  <Link href={PAGE_ROUTES[n.page]} className={`nav-item ${page === n.page ? 'active' : ''}`} title={n.page} aria-label={n.page} data-page={n.page}>
                    <Icon name={n.icon} />
                    <em>{n.page}</em>
                  </Link>
                )}
              </span>
            ))}
          </nav>
          <div className="sidebar-bottom side-info">
            <span className="side-ver">Version {APP_VERSION}</span>
            <span className="side-copy">© 2026 DienstPlan Pro</span>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <Link className="btn back-dashboard" href="/dashboard" aria-label="Zurück zum Dashboard">
              <Icon name="chev" />
              <span className="bd-long">Zurück zum Dashboard</span>
              <span className="bd-short">Zurück</span>
            </Link>
            <button className="mobile-menu" aria-label="Menü öffnen" aria-expanded={mobileOpen} onClick={() => setMobileOpen((o) => !o)}>
              <Icon name="menu" />
            </button>
            <div className="breadcrumbs">
              Arbeitsbereich <span>/</span> <b id="crumb">{page}</b>
            </div>
            <div className="top-actions">
              <span className="top-date" suppressHydrationWarning>
                {now ? `${f.fmtShortWd(now)} · KW ${isoWeek(now)}` : ''}
              </span>
              <button className="top-icon-btn" type="button" title="Suche (Strg K)" aria-label="Suche" onClick={() => setSearch(true)}>
                <Icon name="search" />
              </button>
              <button
                className="top-icon-btn"
                type="button"
                title="Hell/Dunkel umschalten"
                aria-label="Hell/Dunkel umschalten"
                onClick={() => setPrefs({ theme: document.body.classList.contains('dark-mode') ? 'light' : 'dark' })}
              >
                <Icon name={prefs.theme === 'dark' ? 'sun' : 'moon'} />
              </button>
              <button className="top-icon-btn whatsnew-btn" type="button" title="Neuigkeiten" aria-label="Neuigkeiten der aktuellen Version" onClick={() => setWhatsNew(true)}>
                <Icon name="news" />
                {prefs.seenVersion !== APP_VERSION && <span className="whatsnew-dot" />}
              </button>
              <Notifications />
              <AccountMenu />
            </div>
          </header>
          <div className="content" id="content">
            {allowed.includes(page) ? (
              children
            ) : (
              <div className="page-heading">
                <div>
                  <h1>Zugriff nicht möglich</h1>
                  <p className="muted">Diese Seite ist für deine Rolle ({user.role}) nicht freigegeben.</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      <PageTopButton page={page} isAdmin={user.role === 'Admin'} />
      <MobileTables page={page} />
      {search && <GlobalSearch onClose={() => setSearch(false)} />}
      {whatsNew && (
        <WhatsNew
          onClose={() => {
            setWhatsNew(false);
            if (prefs.seenVersion !== APP_VERSION) setPrefs({ seenVersion: APP_VERSION });
          }}
        />
      )}
      {swapCenter && <SwapCenter focusId={swapCenter.focus} onClose={() => setSwapCenter(null)} onNew={() => { setSwapCenter(null); setSwapReq({}); }} />}
      {swapReq && <SwapRequestDialog entryId={swapReq.entryId} onClose={() => setSwapReq(null)} onOpenCenter={() => { setSwapReq(null); setSwapCenter({}); }} />}
    </ShellContext.Provider>
  );
}

/* ---------------- Benachrichtigungen ---------------- */
function Notifications() {
  const { data, f, run, ask } = useApp();
  const shell = useShell();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(open, ref, () => setOpen(false));
  const items = data.notifications;
  const unread = items.filter((n) => !n.read).length;
  const openItem = (id: string) => {
    const n = items.find((x) => x.id === id);
    if (!n) return;
    if (!n.read) void markNotificationsRead([n.id]);
    setOpen(false);
    if (n.swapId) return shell.openSwapCenter(n.swapId);
    const page = n.targetPage === 'Bereitschaft' ? '/bereitschaft' : '/dienstplan';
    router.push(page + (n.targetDate ? `?date=${n.targetDate}` : ''));
  };
  return (
    <div className="notification-wrap" ref={ref}>
      <button className="notification-trigger" type="button" title="Benachrichtigungen" aria-label="Benachrichtigungen öffnen" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" />
        {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <section className="notification-panel" aria-label="Benachrichtigungen">
          <div className="notification-panel-head">
            <div>
              <b>Benachrichtigungen</b>
              <small>{unread ? `${unread} ungelesen` : 'Keine ungelesenen Meldungen'}</small>
            </div>
            <div className="notification-head-actions">
              <button type="button" className="notification-read-all" disabled={!unread} onClick={() => run(markNotificationsRead(), { silent: true })}>
                Alle gelesen
              </button>
              <button
                type="button"
                className="notification-read-all notification-delete-all"
                disabled={!items.length}
                onClick={async () => {
                  if (await ask(`Alle ${items.length} Benachrichtigungen löschen?`, 'Löschen')) await run(deleteNotifications());
                }}
              >
                Alle löschen
              </button>
            </div>
          </div>
          <div className="notification-list">
            {items.length ? (
              items.map((n) => {
                const target = n.targetPage === 'Bereitschaft' ? 'Bereitschaft' : 'Dienstplan';
                return (
                  <article key={n.id} className={`notification-item ${n.read ? 'is-read' : 'is-unread'}`} role="button" tabIndex={0} onClick={() => openItem(n.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openItem(n.id)}>
                    <span className="notification-dot" aria-hidden="true" />
                    <div className="notification-copy">
                      <b>{n.title}</b>
                      <p>{n.message}</p>
                      <small>
                        {f.fmtDateTime(n.createdAt)} · {n.swapId ? 'Diensttausch öffnen' : 'Zum Eintrag in ' + target}
                      </small>
                    </div>
                    <span className="notification-actions">
                      {!n.read && (
                        <button type="button" className="notification-mark-read" aria-label="Als gelesen markieren" title="Als gelesen markieren" onClick={(e) => { e.stopPropagation(); void run(markNotificationsRead([n.id]), { silent: true }); }}>
                          ✓
                        </button>
                      )}
                      <button type="button" className="notification-delete" aria-label="Benachrichtigung löschen" title="Benachrichtigung löschen" onClick={(e) => { e.stopPropagation(); void run(deleteNotifications([n.id])); }}>
                        <Icon name="trash" />
                      </button>
                    </span>
                  </article>
                );
              })
            ) : (
              <div className="notification-empty">Du hast noch keine Benachrichtigungen.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------------- Mein Konto ---------------- */
function AccountMenu() {
  const { data, user, ctx, prefs, setPrefs, run, teamColor, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'konto' | 'notify'>('konto');
  const ref = useRef<HTMLDivElement>(null);
  useOutside(open, ref, () => setOpen(false));
  const me = data.staff.find((p) => p.id === user.id);
  const teamsTxt = currentUserTeamNames(ctx).join(', ') || 'Ohne Team';
  const np = prefs.notify;
  return (
    <div className="account-wrap" ref={ref}>
      <button type="button" className="top-avatar" aria-label="Mein Konto" aria-haspopup="dialog" aria-expanded={open} title="Mein Konto" onClick={() => setOpen((o) => !o)}>
        {me?.photo ? <img src={me.photo} alt="" /> : me?.initials}
      </button>
      {open && me && (
        <section className="account-panel" aria-label="Mein Konto">
          <div className="acc-head">
            <div className="acc-photo">
              <Avatar name={me.name} color={teamColor(currentUserTeamNames(ctx)[0])} size={64} />
              <label className="acc-photo-btn" title="Profilbild ändern" aria-label="Profilbild ändern">
                <Icon name="upload" />
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!file.type.startsWith('image/')) return toast('Bitte eine Bilddatei wählen.');
                    try {
                      await run(updateMyAccount({ photo: await resizeImage(file) }));
                    } catch {
                      toast('Das Bild konnte nicht gelesen werden.');
                    }
                  }}
                />
              </label>
            </div>
            <div className="acc-id">
              <b>{me.name}</b>
              <small>
                {roleLabel(visibleRole(user.role, user.role))} · {teamsTxt}
              </small>
              {me.photo && (
                <button type="button" className="link-btn" onClick={() => run(updateMyAccount({ photo: null }))}>
                  Profilbild entfernen
                </button>
              )}
            </div>
            <button type="button" className="icon-btn acc-close" aria-label="Schließen" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="segmented acc-tabs" role="tablist">
            <button type="button" role="tab" className={tab === 'konto' ? 'active' : ''} onClick={() => setTab('konto')}>
              <Icon name="users" />
              Konto
            </button>
            <button type="button" role="tab" className={tab === 'notify' ? 'active' : ''} onClick={() => setTab('notify')}>
              <Icon name="bell" />
              Benachrichtigungen
            </button>
          </div>
          <div className="acc-body">
            {tab === 'konto' ? (
              <>
                <BirthdayField value={me.birthday || ''} onSave={(v) => run(saveMyBirthday(v))} />
                <AccountForm email={me.email} phone={me.phone} teamsPhone={me.teamsPhone} onSave={(v) => run(updateMyAccount(v))} />
              </>
            ) : (
              <>
                {(
                  [
                    ['own', 'Neue Einteilungen für mich', 'Dienste und Bereitschaften, die für dich angelegt werden'],
                    ['team', 'Neue Dienste in meinen Teams', 'Nur für Teamleiter und Stellvertretungen'],
                    ['absence', 'Abwesenheiten in meinen Teams', 'Urlaub, Arztbesuch, Berufsschule …'],
                  ] as const
                ).map(([k, t, s]) => (
                  <div className="setting-row" key={k}>
                    <div>
                      <b>{t}</b>
                      <small>{s}</small>
                    </div>
                    <Toggle
                      on={np[k]}
                      label={t}
                      onChange={(v) => {
                        setPrefs({ notify: { ...np, [k]: v } });
                        toast('Einstellungen gespeichert.');
                      }}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="acc-foot">
            <Link className="btn ghost" href="/einstellungen" onClick={() => setOpen(false)}>
              <Icon name="gear" />
              Einstellungen
            </Link>
            <button type="button" className="btn" onClick={async () => {
                await forgetDevice();
                void logout();
              }}>
              <Icon name="refresh" />
              Abmelden
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function AccountForm(props: { email: string; phone: string; teamsPhone: string; onSave: (v: { email: string; phone: string; teamsPhone: string }) => void }) {
  const [form, setForm] = useState({ email: props.email, phone: props.phone, teamsPhone: props.teamsPhone });
  return (
    <>
      <label className="field">
        E-Mail
        <input type="email" value={form.email} autoComplete="email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </label>
      <label className="field">
        Bereitschaftsnummer
        <input type="text" inputMode="tel" value={form.phone} autoComplete="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </label>
      <label className="field">
        Teams-Telefonnummer
        <input type="text" inputMode="tel" value={form.teamsPhone} placeholder="+43 …" onChange={(e) => setForm({ ...form, teamsPhone: e.target.value })} />
      </label>
      <button className="btn primary acc-save" onClick={() => props.onSave(form)}>
        Kontaktdaten speichern
      </button>
    </>
  );
}

/* ---------------- Geburtstag (Tag + Monat, ohne Jahr) ---------------- */
const BD_MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const BD_MAX = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const BD_SHORT = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function BirthdayField({ value, onSave }: { value: string; onSave: (v: { day: number; month: number } | null) => void }) {
  const [m0, d0] = /^\d\d-\d\d$/.test(value) ? value.split('-').map(Number) : [0, 0];
  const [month, setMonth] = useState(m0);
  const [dayN, setDayN] = useState(d0);
  const [open, setOpen] = useState<'' | 'day' | 'month'>('');
  const dayBtn = useRef<HTMLButtonElement>(null);
  const monBtn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(''), []);
  const save = (d: number, m: number) => {
    if (d && m) onSave({ day: d, month: m });
    else if (!d && !m && value) onSave(null);
  };
  const maxDay = month ? BD_MAX[month - 1] : 31;
  return (
    <div className="field acc-birthday">
      <span>
        Geburtstag <span className="muted">(freiwillig)</span>
      </span>
      <div className="acc-bd-row">
        <button ref={dayBtn} type="button" className={`dpk-btn acc-bd-btn${open === 'day' ? ' open' : ''}`} aria-haspopup="dialog" aria-label="Tag auswählen" onClick={() => setOpen(open === 'day' ? '' : 'day')}>
          <span className={dayN ? '' : 'ph'}>{dayN ? `${dayN}.` : 'Tag'}</span>
        </button>
        <button ref={monBtn} type="button" className={`dpk-btn acc-bd-btn${open === 'month' ? ' open' : ''}`} aria-haspopup="dialog" aria-label="Monat auswählen" onClick={() => setOpen(open === 'month' ? '' : 'month')}>
          <span className={month ? '' : 'ph'}>{month ? BD_MONTHS[month - 1] : 'Monat'}</span>
        </button>
        {(dayN || month) > 0 && (
          <button
            type="button"
            className="dpk-link acc-bd-clear danger-text"
            onClick={() => {
              setDayN(0);
              setMonth(0);
              save(0, 0);
            }}
          >
            Entfernen
          </button>
        )}
      </div>
      {open === 'day' && (
        <PickerPop anchor={dayBtn.current} onClose={close} ariaLabel="Tag auswählen" title={<b>Tag</b>} className="acc-bd-pop">
          <div className="acc-bd-days">
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                className={`dpk-day${d === dayN ? ' on' : ''}`}
                aria-pressed={d === dayN}
                onClick={() => {
                  setDayN(d);
                  close();
                  save(d, month);
                  if (!month) setTimeout(() => setOpen('month'), 0);
                }}
              >
                <span>{d}</span>
              </button>
            ))}
          </div>
        </PickerPop>
      )}
      {open === 'month' && (
        <PickerPop anchor={monBtn.current} onClose={close} ariaLabel="Monat auswählen" title={<b>Monat</b>} className="dpk-months">
          <div className="dpk-mgrid">
            {BD_MONTHS.map((n, i) => (
              <button
                key={n}
                type="button"
                className={`dpk-mon${i + 1 === month ? ' on' : ''}`}
                aria-label={n}
                onClick={() => {
                  const m = i + 1;
                  const d = dayN > BD_MAX[i] ? BD_MAX[i] : dayN;
                  setMonth(m);
                  setDayN(d);
                  close();
                  save(d, m);
                  if (!d) setTimeout(() => setOpen('day'), 0);
                }}
              >
                {BD_SHORT[i]}
              </button>
            ))}
          </div>
        </PickerPop>
      )}
    </div>
  );
}

/* ---------------- Globale Suche (Strg K) ---------------- */
function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { data, ctx, user, setCal } = useApp();
  const shell = useShell();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const allowed = pagesFor(ctx);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out: { group: string; label: string; sub: string; ic: string; run: () => void }[] = [];
    allowed.forEach((p) => {
      if (!s || p.toLowerCase().includes(s)) out.push({ group: 'Seiten', label: p, sub: 'Seite öffnen', ic: 'grid', run: () => shell.go(p) });
    });
    if (s) {
      data.staff
        .filter((p) => p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s))
        .slice(0, 8)
        .forEach((p) => {
          const t = data.teams.find((t) => t.memberIds.includes(p.id));
          out.push({
            group: 'Mitarbeiter',
            label: p.name,
            sub: `${roleLabel(visibleRole(p.role, user.role))} · ${t?.name || 'Ohne Team'}${p.phone ? ' · ' + p.phone : ''}`,
            ic: 'users',
            run: () => {
              if (allowed.includes('Dienstplan')) {
                setCal('Dienstplan', { teams: t ? [t.name] : [], member: p.name });
                shell.go('Dienstplan');
              } else shell.go('Kontakte');
            },
          });
        });
      data.teams
        .filter((t) => t.name.toLowerCase().includes(s))
        .forEach((t) =>
          out.push({
            group: 'Teams',
            label: t.name,
            sub: `${t.memberIds.length} Mitarbeiter · im Dienstplan anzeigen`,
            ic: 'build',
            run: () => {
              setCal('Dienstplan', { teams: [t.name], member: 'Alle Mitarbeiter' });
              shell.go(allowed.includes('Dienstplan') ? 'Dienstplan' : 'Kontakte');
            },
          }),
        );
      data.shiftTypes
        .filter((x) => x.name.toLowerCase().includes(s))
        .slice(0, 6)
        .forEach((x) => out.push({ group: 'Dienstzeiten', label: `${x.name} (${tRange(x)})`, sub: x.team, ic: 'clock', run: () => shell.go(allowed.includes('Dienstzeiten') ? 'Dienstzeiten' : 'Dienstplan') }));
    }
    return out.slice(0, 24);
  }, [q, allowed, data, user.role, shell, setCal]);
  const choose = (i: number) => {
    const it = items[i];
    if (!it) return;
    onClose();
    it.run();
  };
  let last = '';
  return (
    <div className="modal-backdrop search-layer" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-box" role="dialog" aria-modal="true" aria-label="Suche">
        <label className="search-input">
          <Icon name="search" />
          <input
            type="search"
            autoFocus
            placeholder="Mitarbeiter, Team, Dienst oder Seite suchen …"
            autoComplete="off"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => (s + 1) % Math.max(1, items.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => (s - 1 + items.length) % Math.max(1, items.length));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(sel);
              }
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="search-results">
          {items.length ? (
            items.map((it, i) => {
              const head = it.group !== last;
              last = it.group;
              return (
                <span key={it.group + it.label + i} style={{ display: 'contents' }}>
                  {head && <div className="search-group">{it.group}</div>}
                  <button type="button" className={`search-item ${i === sel ? 'active' : ''}`} onClick={() => choose(i)}>
                    <Icon name={it.ic} />
                    <span>
                      <b>{it.label}</b>
                      <small>{it.sub}</small>
                    </span>
                  </button>
                </span>
              );
            })
          ) : (
            <div className="empty-note">Keine Treffer.</div>
          )}
        </div>
        <div className="search-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> auswählen
          </span>
          <span>
            <kbd>Enter</kbd> öffnen
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Neuigkeiten ---------------- */
const WN_IC: Record<string, string> = { Kalender: 'cal', Bereitschaft: 'moon', Kontakte: 'users', Dashboard: 'grid', Anmeldung: 'lock', Oberfläche: 'sliders', Einstellungen: 'gear', Notizen: 'chat', Team: 'users' };
function WhatsNew({ onClose }: { onClose: () => void }) {
  const { prefs } = useApp();
  const [filter, setFilter] = useState<'all' | 'neu' | 'verbessert'>('all');
  const cur = CHANGELOG[0];
  const cnt = (r: (typeof CHANGELOG)[0], t: string) => r.items.filter((x) => x[0] === t).length;
  const item = (x: (typeof cur.items)[0], i: number) =>
    filter !== 'all' && x[0] !== filter ? null : (
      <li className="wn-item" key={i}>
        <span className={`wn-ic wn-${x[0]}`}>
          <Icon name={WN_IC[x[1]] || 'spark'} />
        </span>
        <div className="wn-item-main">
          <div className="wn-item-top">
            <b>{x[2]}</b>
            <span className={`wn-tag wn-${x[0]}`}>{x[0] === 'neu' ? 'Neu' : 'Verbessert'}</span>
          </div>
          <p>{x[3]}</p>
          <small>{x[1]}</small>
        </div>
      </li>
    );
  return (
    <div className="modal-backdrop app-dialog" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal form-dialog wp-modal wn-modal" role="dialog" aria-modal="true" aria-label="Neuigkeiten">
        <div className="wp-head">
          <span className="wp-head-icon">
            <Icon name="news" />
          </span>
          <div>
            <h2>Neuigkeiten</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="wp-form">
          <div className="wn-body">
            <div className="wn-hero">
              <div className="wn-hero-top">
                <span className="wn-hero-badge">{prefs.seenVersion === APP_VERSION ? 'Aktuelle Version' : 'Neu für dich'}</span>
                <span className="wn-hero-date">{cur.date}</span>
              </div>
              <div className="wn-hero-ver">Version {cur.v}</div>
              <div className="wn-hero-title">{cur.title}</div>
              <div className="wn-hero-stats">
                <span>
                  <b>{cnt(cur, 'neu')}</b> neu
                </span>
                <span>
                  <b>{cnt(cur, 'verbessert')}</b> verbessert
                </span>
              </div>
            </div>
            <div className="wn-filter" role="tablist">
              {(['all', 'neu', 'verbessert'] as const).map((k) => (
                <button key={k} type="button" className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
                  {k === 'all' ? 'Alle' : k === 'neu' ? 'Neu' : 'Verbessert'}
                </button>
              ))}
            </div>
            <ul className="wn-items wn-current">{cur.items.map(item)}</ul>
          </div>
          <div className="btn-row modal-actions wp-actions">
            <span />
            <span className="wp-actions-right">
              <button type="button" className="btn primary" onClick={onClose}>
                Alles klar
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

