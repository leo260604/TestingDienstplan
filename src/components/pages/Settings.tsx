'use client';
/* Einstellungen: Kalender, Darstellung, Sprache & Datum, Benachrichtigungen, Funktionen (Admin), Links (Admin), Daten */
import { useEffect, useState } from 'react';
import { useApp } from '../AppProvider';
import { Heading, Icon, Segmented, Toggle } from '../ui';
import { CockpitDialog } from '../dashboard/Dashboard';
import { createFormatters, isoDate } from '@/lib/dates';
import { ENTRY_HEAD, entryRow } from '@/lib/export/reports';
import { downloadCsv, saveFile } from '@/lib/export/csv';
import { archiveOldEntries } from '@/server/actions/entries';
import { logExport, setCockpitLink, setFeature } from '@/server/actions/account';
import type { DateFormat, ThemeMode } from '@/lib/types';
import { offlineSavedAt, usePwaInstall } from '../PwaClient';
import { checkPushSubscription, getPushKey, removePushSubscription, savePushSubscription, sendTestPush } from '@/server/actions/push';
import { channelLive, NOTIFY_CHANNELS, NOTIFY_EVENTS, normalizeIntegrations, type ExternalNotifyPrefs } from '@/lib/notifications';

export function Settings() {
  const { data, user, prefs, setPrefs, f, toast, run, ask } = useApp();
  const [cockpit, setCockpit] = useState(false);
  const admin = user.role === 'Admin';
  const saved = () => toast('Einstellungen gespeichert.');
  const sections: [string, string, string][] = [
    ['set-cal', 'cal', 'Kalender'],
    ['set-look', 'sun', 'Darstellung'],
    ['set-lang', 'grid', 'Sprache & Datum'],
    ['set-notify', 'bell', 'Benachrichtigungen'],
    ['set-app', 'phone', 'App & Push'],
    ...(admin
      ? ([
          ['set-feat', 'spark', 'Funktionen'],
          ['link-admin', 'external', 'Links'],
        ] as [string, string, string][])
      : []),
    ['set-data', 'download', 'Daten & Sicherung'],
  ];
  const preview = (k: ThemeMode, label: string) => (
    <button type="button" className={`theme-card ${prefs.theme === k ? 'active' : ''}`} onClick={() => setPrefs({ theme: k })}>
      <span className={`theme-prev ${k}`}>
        <i />
        <span>
          <i />
          <i />
          <i />
        </span>
      </span>
      <span className="theme-card-foot">
        <b>{label}</b>
        {prefs.theme === k && <em>Aktiv</em>}
      </span>
    </button>
  );
  const link = data.settings.cockpitLink;
  const features = data.settings.features;
  return (
    <>
      <Heading title="Einstellungen" />
      <div className="settings-layout">
        <nav className="panel settings-nav">
          {sections.map(([id, ic, l], i) => (
            <a key={id} href={`#${id}`} className={`nav-item ${i === 0 ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <Icon name={ic} />
              <em>{l}</em>
            </a>
          ))}
        </nav>
        <div className="settings-main">
          <section className="settings-card" id="set-cal">
            <h2>Kalender</h2>
            <Row title="Standardansicht Dienstplan" sub="Beim Öffnen anzeigen">
              <Segmented value={prefs.defaults.Dienstplan} options={[['Tag', 'Tag'], ['Woche', 'Woche'], ['Monat', 'Monat'], ['Team', 'Team']]} onChange={(v) => { setPrefs({ defaults: { ...prefs.defaults, Dienstplan: v } }); saved(); }} />
            </Row>
            <Row title="Standardansicht Bereitschaft" sub="Beim Öffnen anzeigen">
              <Segmented value={prefs.defaults.Bereitschaft} options={[['Woche', 'Woche'], ['Monat', 'Monat'], ['Zeitleiste', 'Zeitleiste']]} onChange={(v) => { setPrefs({ defaults: { ...prefs.defaults, Bereitschaft: v } }); saved(); }} />
            </Row>
            <Row title="Wochenende im Dienstplan" sub="Welche Tage der Dienstplan in Woche, Monat und Team-Ansicht zeigt.">
              <Segmented value={prefs.dutyDays} options={[[5, 'Mo–Fr'], [6, 'Mo–Sa'], [7, 'Mo–So']]} onChange={(v) => { setPrefs({ dutyDays: v }); saved(); }} />
            </Row>
            <Row title="Wochenende in der Bereitschaft" sub="Welche Tage die Bereitschaft in Woche, Monat und Zeitleiste zeigt.">
              <Segmented value={prefs.standbyDays} options={[[5, 'Mo–Fr'], [6, 'Mo–Sa'], [7, 'Mo–So']]} onChange={(v) => { setPrefs({ standbyDays: v }); saved(); }} />
            </Row>
            <Row title="Darstellung der Einträge" sub="Kompakt = Woche/Monat passen ins Fenster, Rest als „+ X weitere“ · Erweitert = alle Einträge anzeigen (Seite scrollt)">
              <Segmented value={prefs.expandedMonthView ? 'expanded' : 'compact'} options={[['compact', 'Kompakt'], ['expanded', 'Erweitert']]} onChange={(v) => { setPrefs({ expandedMonthView: v === 'expanded' }); saved(); }} />
            </Row>
          </section>

          <section className="settings-card" id="set-look">
            <h2>Darstellung</h2>
            <div className="theme-cards">
              {preview('light', 'Hell')}
              {preview('dark', 'Dunkel')}
              {preview('system', 'System')}
            </div>
            <Row title="Akzentfarbe" sub="Für Buttons, Markierungen und aktive Elemente">
              <div className="swatch-row">
                {(
                  [
                    ['turquoise', '#14A1A9', 'Türkis'],
                    ['navy', '#0068A8', 'Blau'],
                  ] as const
                ).map(([k, c, l]) => (
                  <button key={k} type="button" className={`accent-option ${prefs.accent === k ? 'active' : ''}`} style={{ ['--sw' as string]: c }} aria-pressed={prefs.accent === k} onClick={() => setPrefs({ accent: k })}>
                    <i />
                    {l}
                  </button>
                ))}
              </div>
            </Row>
            <Row title="Schriftgröße" sub="Bessere Lesbarkeit auf großen Bildschirmen">
              <Segmented value={prefs.fontScale} options={[['small', 'Klein'], ['normal', 'Normal'], ['large', 'Groß']]} onChange={(v) => { setPrefs({ fontScale: v }); saved(); }} />
            </Row>
          </section>

          <section className="settings-card" id="set-lang">
            <h2>Sprache &amp; Datum</h2>
            <Row title="Sprache" sub="Sprache der gesamten Oberfläche.">
              <select className="form-select" data-no-translate value={prefs.lang} onChange={(e) => { setPrefs({ lang: e.target.value as 'de' | 'en' }); toast(e.target.value === 'en' ? 'Switching language …' : 'Sprache wird gewechselt …'); setTimeout(() => location.reload(), 400); }}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </Row>
            <Row title="Datumsformat" sub="So werden Datumswerte in der App und in Exporten angezeigt.">
              <select className="form-select" data-no-translate value={prefs.dateFormat} onChange={(e) => { setPrefs({ dateFormat: e.target.value as DateFormat }); toast('Datumsformat gespeichert.'); }}>
                {(['dmy', 'iso', 'mdy', 'long'] as DateFormat[]).map((k) => (
                  <option key={k} value={k}>
                    {{ dmy: 'TT.MM.JJJJ', iso: 'JJJJ-MM-TT', mdy: 'MM/TT/JJJJ', long: 'Ausgeschrieben' }[k]} · {createFormatters(k, prefs.lang).fmt(new Date(2026, 11, 31))}
                  </option>
                ))}
              </select>
            </Row>
            <div className="date-preview">
              <span>Beispiel:</span> <b suppressHydrationWarning>{f.fmtWithWeekday(new Date())}</b>
            </div>
          </section>

          <NotifySection />

          <AppSection />

          {admin && (
            <section className="settings-card" id="set-feat">
              <h2>Funktionen</h2>
              <Row title="„Rotation automatisch planen“ im Dienstplan" sub="Button oben im Dienstplan anzeigen">
                <Toggle on={features.rotationDuty !== false} onChange={(v) => run(setFeature('rotationDuty', v))} />
              </Row>
              <Row title="„Rotation automatisch planen“ in der Bereitschaft" sub="Button oben in der Bereitschaft anzeigen">
                <Toggle on={features.rotationStandby !== false} onChange={(v) => run(setFeature('rotationStandby', v))} />
              </Row>
            </section>
          )}
          {admin && (
            <section className="settings-card link-admin" id="link-admin">
              <div className="panel-head">
                <div>
                  <h2>
                    <Icon name="external" />
                    Links &amp; Weiterleitungen
                  </h2>
                </div>
              </div>
              <div className="link-row">
                <span className="link-ic">
                  <Icon name="external" />
                </span>
                <div className="link-txt">
                  <b>Mein Porsche Cockpit</b>
                  <small>Kachel „Ich@Porsche“ · Übersicht: Homeoffice- &amp; Bürotage</small>
                  {link.url ? (
                    <>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-url">
                        {link.url}
                      </a>
                      <small className="muted">
                        Zuletzt geändert von {link.by || '—'}
                        {link.at ? ' am ' + f.fmtWithWeekday(new Date(link.at)) : ''}
                      </small>
                    </>
                  ) : (
                    <span className="pill amber">Noch kein Link hinterlegt</span>
                  )}
                </div>
                <div className="btn-row">
                  {link.url && (
                    <a className="btn small" href={link.url} target="_blank" rel="noopener noreferrer">
                      <Icon name="external" />
                      Öffnen
                    </a>
                  )}
                  <button type="button" className="btn small primary" onClick={() => setCockpit(true)}>
                    <Icon name="edit" />
                    {link.url ? 'Ändern' : 'Link festlegen'}
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="settings-card" id="set-data">
            <h2>Daten &amp; Sicherung</h2>
            <div className="info-box">
              <Icon name="download" />
              Alle Daten liegen zentral in der Datenbank. Exporte für die Ablage erstellst du unter „Berichte / Export“.
            </div>
            <div className="btn-row">
              <button
                className="btn primary"
                onClick={() => {
                  const text = JSON.stringify({ app: 'DienstPlan Pro', exportedAt: new Date().toISOString(), data: { staff: data.staff, teams: data.teams, entries: data.entries, shiftTypes: data.shiftTypes, standbyTimes: data.standbyTimes } }, null, 1);
                  const size = saveFile(`dienstplan-sicherung-${isoDate(new Date())}.json`, text, 'application/json');
                  void logExport({ report: 'Datensicherung', format: 'JSON', rows: data.entries.length, status: 'Erfolgreich', size });
                  toast('Sicherung heruntergeladen.');
                }}
              >
                Daten herunterladen (.json)
              </button>
            </div>
            {admin && (
              <Row title="Alte Einträge archivieren" sub="Einträge, die älter als 12 Monate sind, werden als CSV-Datei gespeichert und danach aus der Datenbank entfernt.">
                <button
                  className="btn"
                  onClick={async () => {
                    const cut = new Date();
                    cut.setFullYear(cut.getFullYear() - 1);
                    const cutIso = isoDate(cut);
                    const old = data.entries.filter((a) => a.date < cutIso).sort((a, b) => a.date.localeCompare(b.date));
                    if (!old.length) return toast('Keine Einträge älter als 12 Monate.');
                    if (!(await ask(`${old.length} Einträge vor dem ${f.fmt(cut)} werden als CSV-Datei gespeichert und danach entfernt. Fortfahren?`, 'Archivieren'))) return;
                    downloadCsv([ENTRY_HEAD, ...old.map((a) => entryRow(a, f))], `dienstplan-archiv-bis-${cutIso}.csv`);
                    void logExport({ report: 'Archiv', format: 'CSV', rows: old.length, status: 'Erfolgreich', range: 'bis ' + f.fmt(cut) });
                    await run(archiveOldEntries());
                  }}
                >
                  Archivieren …
                </button>
              </Row>
            )}
          </section>
        </div>
      </div>
      {cockpit && <CockpitDialog onClose={() => setCockpit(false)} onSave={(u) => run(setCockpitLink(u))} />}
    </>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div>
        <b>{title}</b>
        <small>{sub}</small>
      </div>
      {children}
    </div>
  );
}

/* ---------- Benachrichtigungen per E-Mail / Microsoft Teams ---------- */
function NotifySection() {
  const { data, user, prefs, setPrefs, toast } = useApp();
  const np = prefs.notifyExternal;
  const integ = normalizeIntegrations(data.settings.integrations);
  const me = data.staff.find((p) => p.id === user.id);
  const lead = user.role !== 'Mitarbeiter' || data.teams.some((t) => t.leaderId === user.id || t.deputyId === user.id);
  const events = NOTIFY_EVENTS.filter((e) => !e.lead || lead);
  const save = (next: ExternalNotifyPrefs) => {
    setPrefs({ notifyExternal: next });
    toast('Einstellungen gespeichert.');
  };
  return (
    <section className="settings-card" id="set-notify">
      <h2>Benachrichtigungen</h2>
      <div className={`info-box notify-status ${integ.connected ? 'is-live' : ''}`}>
        <Icon name={integ.connected ? 'check' : 'lock'} />
        <span>
          {integ.connected ? (
            <>
              <b>Mit Microsoft Entra ID verbunden.</b> E-Mail {channelLive(integ, 'mail') ? 'aktiv' : 'noch nicht freigeschaltet'} · Teams {channelLive(integ, 'teams') ? 'aktiv' : 'noch nicht freigeschaltet'}.
            </>
          ) : (
            <>
              <b>Noch nicht aktiv.</b> E-Mail- und Teams-Benachrichtigungen werden verschickt, sobald die Anbindung an Microsoft Entra ID / Microsoft 365 eingerichtet ist. Deine Auswahl wird schon jetzt gespeichert.
            </>
          )}
        </span>
      </div>
      <Row title="Per E-Mail benachrichtigen" sub={me?.email ? `An ${me.email}` : 'Keine E-Mail-Adresse hinterlegt – unter „Mein Konto“ eintragen'}>
        <Toggle on={np.mail} label="E-Mail-Benachrichtigungen" onChange={(v) => save({ ...np, mail: v })} />
      </Row>
      <Row title="In Microsoft Teams benachrichtigen" sub="Als Teams-Nachricht an dein Microsoft-Konto">
        <Toggle on={np.teams} label="Teams-Benachrichtigungen" onChange={(v) => save({ ...np, teams: v })} />
      </Row>
      <div className="notify-matrix" role="table" aria-label="Benachrichtigungen je Ereignis">
        <div className="nm-row nm-head" role="row">
          <span role="columnheader">Benachrichtigen bei</span>
          {NOTIFY_CHANNELS.map((ch) => (
            <span role="columnheader" key={ch.id} className={np[ch.id] ? '' : 'off'}>
              <Icon name={ch.icon} />
              {ch.label}
            </span>
          ))}
        </div>
        {events.map((e) => (
          <div className="nm-row" role="row" key={e.id}>
            <span role="cell" className="nm-txt">
              <b>{e.title}</b>
              <small>{e.sub}</small>
            </span>
            {NOTIFY_CHANNELS.map((ch) => (
              <span role="cell" key={ch.id} className="nm-cell">
                <Toggle
                  on={np[ch.id] && np.events[e.id][ch.id]}
                  disabled={!np[ch.id]}
                  label={`${e.title} per ${ch.label}`}
                  onChange={(v) => save({ ...np, events: { ...np.events, [e.id]: { ...np.events[e.id], [ch.id]: v } } })}
                />
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="notify-foot">Benachrichtigungen in der App (Glocke) stellst du unter „Mein Konto“ → „Benachrichtigungen“ ein.</p>
    </section>
  );
}

/* ---------- App installieren, Offline-Ansicht und Push auf diesem Gerät ---------- */
type PushState = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' | 'busy';
/** Service Worker sicher bereitstellen (registrieren, falls nötig) – mit Zeitlimit statt endlosem Warten */
async function swReady(ms = 8000): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  if (reg.active) return reg;
  return Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, no) => setTimeout(() => no(new Error('Der Service Worker startet nicht – bitte Seite neu laden.')), ms))]);
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e || 'unbekannter Fehler'));
const b64ToBytes = (s: string) => {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
};

function AppSection() {
  const { f, run, toast } = useApp();
  const pwa = usePwaInstall();
  const [push, setPush] = useState<PushState>('loading');
  const [saved, setSaved] = useState<number | null>(null);
  const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  useEffect(() => {
    setSaved(offlineSavedAt());
    if (!supported()) {
      setPush(pwa.ios && !pwa.installed ? 'ios-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setPush('denied');
      return;
    }
    let alive = true;
    swReady()
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        if (!sub) return alive && setPush('off');
        // Nur als „aktiv“ zeigen, wenn das Abo dieses Geräts dem angemeldeten Benutzer gehört
        const res = await checkPushSubscription(sub.endpoint);
        const mine = res.ok && !!res.data?.mine;
        if (!mine) await sub.unsubscribe().catch(() => false);
        if (alive) setPush(mine ? 'on' : 'off');
      })
      .catch(() => alive && setPush('off'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enable = async () => {
    setPush('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPush(perm === 'denied' ? 'denied' : 'off');
        return toast('Ohne Erlaubnis kann DienstPlan keine Benachrichtigungen anzeigen.');
      }
      const k = await run(getPushKey(), { silent: true });
      if (!k.ok || !k.data) return setPush('off');
      const reg = await swReady();
      const key = b64ToBytes(k.data.key);
      let sub = await reg.pushManager.getSubscription();
      // Altes Abo mit anderem Schlüssel verwerfen, sonst lehnt der Push-Dienst ab
      const old = sub?.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
      if (sub && old && old.join() !== key.join()) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await run(savePushSubscription(sub.toJSON() as never));
      setPush(res.ok ? 'on' : 'off');
      if (res.ok) void run(sendTestPush(), { silent: true });
    } catch (e) {
      setPush('off');
      toast(`Push konnte nicht aktiviert werden: ${errText(e)}`);
    }
  };
  const disable = async () => {
    setPush('busy');
    try {
      const reg = await swReady();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await run(removePushSubscription(sub.endpoint));
        await sub.unsubscribe();
      }
    } finally {
      setPush('off');
    }
  };

  const pushSub: Record<PushState, string> = {
    loading: 'Wird geprüft …',
    busy: 'Einen Moment …',
    on: 'Aktiv – nur deine eigenen Mitteilungen (neue Einteilungen, Änderungen, Tauschanfragen) erscheinen auf diesem Gerät.',
    off: 'Mitteilungen auf diesem Gerät erhalten, auch wenn DienstPlan geschlossen ist.',
    denied: 'Mitteilungen sind für diese Seite blockiert – bitte in den Browser- bzw. Systemeinstellungen erlauben.',
    'ios-install': 'Auf dem iPhone/iPad zuerst DienstPlan zum Home-Bildschirm hinzufügen und von dort öffnen.',
    unsupported: 'Dieser Browser unterstützt keine Push-Mitteilungen.',
  };

  return (
    <section className="settings-card" id="set-app">
      <h2>App & Push</h2>
      <Row
        title="Als App installieren"
        sub={
          pwa.installed
            ? 'DienstPlan läuft bereits als installierte App.'
            : pwa.canPrompt
              ? 'Mit eigenem Symbol am Home-Bildschirm bzw. im Dock – startet ohne Browserleiste.'
              : pwa.ios
                ? 'In Safari auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen.'
                : 'Im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.'
        }
      >
        {pwa.installed ? (
          <span className="pill teal">
            <Icon name="check" /> Installiert
          </span>
        ) : pwa.canPrompt ? (
          <button type="button" className="btn primary small" onClick={async () => (await pwa.install()) && toast('DienstPlan wurde installiert.')}>
            <Icon name="download" />
            Installieren
          </button>
        ) : null}
      </Row>
      <Row title="Offline-Ansicht" sub={saved ? `Dein Plan (90 Tage voraus) ist auf diesem Gerät gespeichert · Stand ${f.fmtIsoDate(new Date(saved).toISOString().slice(0, 10))}, ${new Date(saved).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}` : 'Wird beim nächsten Öffnen mit Internet gespeichert.'}>
        <span className={`pill ${saved ? 'teal' : ''}`}>{saved ? 'Bereit' : 'Noch nicht'}</span>
      </Row>
      <Row title="Push-Mitteilungen auf diesem Gerät" sub={pushSub[push as PushState]}>
        <Toggle on={push === 'on'} disabled={!['on', 'off'].includes(push)} label="Push-Mitteilungen auf diesem Gerät" onChange={(v) => (v ? enable() : disable())} />
      </Row>
      {push === 'on' && (
        <div className="app-push-test">
          <button type="button" className="btn small" onClick={() => run(sendTestPush())}>
            <Icon name="bell" />
            Testnachricht senden
          </button>
        </div>
      )}
      <p className="notify-foot">Push gilt je Gerät und nur für die Person, die dort angemeldet ist – beim Abmelden oder wenn sich jemand anderes anmeldet, wird Push auf dem Gerät beendet. Welche Ereignisse du bekommst, richtet sich nach deinen Glocken-Einstellungen unter „Mein Konto“ → „Benachrichtigungen“.</p>
    </section>
  );
}
