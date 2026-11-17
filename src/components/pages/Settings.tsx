'use client';
/* Einstellungen: Kalender, Darstellung, Sprache & Datum, Funktionen (Admin), Links (Admin), Daten */
import { useState } from 'react';
import { useApp } from '../AppProvider';
import { Heading, Icon, Segmented, Toggle } from '../ui';
import { CockpitDialog } from '../dashboard/Dashboard';
import { createFormatters, isoDate } from '@/lib/dates';
import { ENTRY_HEAD, entryRow } from '@/lib/export/reports';
import { downloadCsv, saveFile } from '@/lib/export/csv';
import { archiveOldEntries } from '@/server/actions/entries';
import { logExport, setCockpitLink, setFeature } from '@/server/actions/account';
import type { DateFormat, ThemeMode } from '@/lib/types';

export function Settings() {
  const { data, user, prefs, setPrefs, f, toast, run, ask } = useApp();
  const [cockpit, setCockpit] = useState(false);
  const admin = user.role === 'Admin';
  const saved = () => toast('Einstellungen gespeichert.');
  const sections: [string, string, string][] = [
    ['set-cal', 'cal', 'Kalender'],
    ['set-look', 'sun', 'Darstellung'],
    ['set-lang', 'grid', 'Sprache & Datum'],
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
