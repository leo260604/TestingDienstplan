/* Hilfe – Anleitungen zu allen Bereichen, passend zur Rolle (aus der Browser-Version übernommen).
   Jeder Abschnitt gehört zu einer Seite (page) und erscheint nur, wenn die Rolle diese Seite sehen darf.
   Jede Anleitung kann mit when(c) an Rechte gebunden werden. */
 
import type { Page } from './types';

export interface HelpCaps {
  role: string;
  admin: boolean;
  lead: boolean;
  plan: boolean;
  planSb: boolean;
  selfDuty: boolean;
  selfSb: boolean;
  swap: boolean;
  absence: boolean;
  shifts: boolean;
  contactsEdit: boolean;
  reports: boolean;
  adminCaps: { all: boolean; dept: boolean; create: boolean; remove: boolean; structure: boolean; settings: boolean; color: boolean };
  sbTimes: boolean;
  sbColors: boolean;
  rolesEdit: boolean;
  teamNotes: boolean;
  rotDuty: boolean;
  rotSb: boolean;
  has: (p: Page) => boolean;
}
export interface HelpItem {
  t: string;
  s: string[];
  tip?: string | ((c: HelpCaps) => string);
  when?: (c: HelpCaps) => boolean;
}
export interface HelpSection {
  id: string;
  page: Page | null;
  icon: string;
  title: string;
  intro: string;
  items: HelpItem[];
}

export const HELP_SECTIONS: HelpSection[] = [
 {id:'start',page:null,icon:'spark',title:'Erste Schritte',intro:'Grundlagen, die auf jeder Seite gelten.',items:[
  {t:'Als App installieren, offline & Push',s:['Unter „Einstellungen“ → „App & Push“ installierst du DienstPlan als App (am iPhone: in Safari „Teilen“ → „Zum Home-Bildschirm“).','Ohne Internet zeigt die App deinen gespeicherten Plan der nächsten 90 Tage an.','Schalte dort „Push-Mitteilungen auf diesem Gerät“ ein, um neue Einteilungen, Änderungen und Tauschanfragen als Mitteilung am Handy zu bekommen.'],tip:'Push gilt je Gerät – auf jedem Handy bzw. Browser einmal einschalten.'},
  {t:'Im Menü navigieren',s:['Links im Menü findest du alle Bereiche, die deine Rolle nutzen darf – oben die Arbeitsbereiche, darunter „Verwaltung“.','Mit dem Pfeil am Menürand klappst du das Menü auf schmale Symbole zusammen.','Am Handy öffnest du das Menü über das Symbol ☰ oben links.'],tip:'Was du nicht siehst, ist für deine Rolle nicht freigegeben. Freigaben verwaltet die Administration unter „Team Berechtigungen“.'},
  {t:'Anmelden und abmelden',s:['Melde dich mit deinem Microsoft-Konto, mit E-Mail und Passwort oder (im Demo-Betrieb) über „Benutzer wählen“ an.','Die Rolle ist im Benutzerprofil hinterlegt – die Seite passt sich automatisch an.','Zum Abmelden oben rechts auf dein Profilbild klicken und „Abmelden“ wählen.']},
  {t:'Schnellsuche (Strg K)',s:['Drücke Strg K (am Mac ⌘ K).','Tippe einen Namen, ein Team, einen Dienst oder eine Seite – auch Anleitungen aus dieser Hilfe werden gefunden.','Mit ↑ ↓ wählen, mit Enter öffnen, mit Esc schließen.']},
  {t:'Benachrichtigungen',s:['Die Glocke oben rechts zeigt neue Hinweise, z. B. wenn du eingeteilt wurdest oder eine Tauschanfrage bekommst.','Klicke auf einen Hinweis, um direkt zum Eintrag zu springen.','Welche Hinweise du bekommst, stellst du in „Mein Konto“ → „Benachrichtigungen“ ein.']},
  {t:'Mein Konto und Profilbild',s:['Klicke oben rechts auf deinen Avatar.','Unter „Konto“ änderst du Profilbild, E-Mail und Telefonnummer.','Unter „Benachrichtigungen“ legst du fest, worüber du informiert wirst.']},
  {t:'Hell- und Dunkelmodus',s:['Klicke oben rechts auf das Sonnen- bzw. Mond-Symbol.','Weitere Darstellungsoptionen (Akzentfarbe, Schriftgröße) findest du in den Einstellungen.']},
 ]},
 {id:'dashboard',page:'Dashboard',icon:'grid',title:'Dashboard',intro:'Dein Überblick über heute und die nächsten Tage.',items:[
  {t:'Kacheln lesen',s:['Jede Kachel zeigt einen Ausschnitt: kommende Dienste und Bereitschaften, Abwesenheiten, wer heute im Dienst ist oder Bereitschaft hat.','Klicke auf eine Kachel oder „alle anzeigen“, um direkt in den passenden Kalender zu springen.','Bei Bereitschaft heute kannst du die Person über „Anrufen“ direkt erreichen.']},
  {t:'Offene Punkte abarbeiten',when:c=>c.lead,s:['Die Kachel „Offene Punkte“ listet, was Aufmerksamkeit braucht: z. B. Teams ohne Teamleitung oder Stellvertretung, Tage ohne Bereitschaft oder Überschneidungen.','Klicke auf einen Punkt – du landest direkt an der richtigen Stelle (Kalender, Administration …).']},
  {t:'Dashboard anpassen',s:['Klicke auf „Dashboard anpassen“.','Blende Kacheln ein oder aus und speichere.','Im Bearbeitungsmodus kannst du Kacheln am Griff anfassen und an eine andere Stelle ziehen.'],tip:'Das Layout wird pro Person gespeichert.'},
  {t:'Direkt einen Dienst einteilen',when:c=>c.plan,s:['Klicke oben auf „＋ Dienst einteilen“.','Es öffnet sich derselbe Dialog wie im Dienstplan (siehe „Dienst einteilen“).']}
 ]},
 {id:'dienstplan',page:'Dienstplan',icon:'cal',title:'Dienstplan',intro:'Dienste, Abwesenheiten und Arbeitsorte im Kalender.',items:[
  {t:'Wochenvorlagen verwenden',when:c=>c.plan,s:['Plane eine Woche so, wie sie immer wieder aussehen soll.','Öffne „Aktionen“ → „Wochenvorlagen“, wähle das Team und klicke „Vorlage speichern“.','Um sie zu nutzen: Vorlage aufklappen, Zielwoche wählen und „anwenden“ klicken. Ohne „ersetzen“ werden nur freie Plätze gefüllt.'],tip:'Abwesende, Feiertage und Personen, die nicht mehr im Team sind, werden automatisch ausgelassen.'},
  {t:'Unterbesetzung erkennen',when:c=>c.lead,s:['Ist für ein Team eine Mindestbesetzung festgelegt, zeigt der Kalender einen roten Hinweis (z. B. „2/3“) an Tagen mit zu wenig Personen im Dienst.','Die Teamansicht zeigt die Besetzung je Tag samt Mindestwert; das Dashboard listet unterbesetzte Tage unter „Offene Punkte“.']},
  {t:'Ansicht und Zeitraum wählen',s:['Oben wählst du die Ansicht: Tag, Woche, Monat oder Team.','Mit ‹ und › blätterst du, „Heute“ springt zurück zum aktuellen Datum.','Deine bevorzugte Startansicht legst du in den Einstellungen unter „Kalender“ fest.']},
  {t:'Nach Team oder Person filtern',s:['Öffne das Team-Auswahlfeld und hake ein oder mehrere Teams an – oder „Alle Teams“.','Über das Mitarbeiterfeld zeigst du nur eine Person an.','„Filter zurücksetzen“ stellt die Standardauswahl wieder her.']},
  {t:'Konflikte finden',s:['Einträge mit Überschneidungen (z. B. Dienst trotz Urlaub) sind markiert.','Klicke auf „Nur Konflikte“, um ausschließlich diese Einträge zu sehen.'],tip:c=>c.plan?'Korrigiere Konflikte direkt über das „⋯“-Menü des Eintrags oder per Verschieben.':''},
  {t:'Dienst einteilen',when:c=>c.plan||c.selfDuty,s:['Klicke auf „Eintrag erstellen“ – oder im Kalender bei der Person und dem Tag auf „+“.','Wähle Team, Mitarbeiter und Dienst. Beginn und Ende werden aus der Dienstzeit übernommen und können für diesen Eintrag angepasst werden.','Wähle das Datum – für mehrere Tage ein „Bis“-Datum. Es werden nur die eingestellten Arbeitstage belegt.','Prüfe die Zusammenfassung und klicke auf „Speichern“.'],tip:'Ist die Person an dem Tag abwesend oder schon eingeteilt, wirst du vor dem Speichern gewarnt.'},
  {t:'Nur eigene Dienste eintragen',when:c=>c.selfDuty&&!c.plan,s:['Dein Team erlaubt dir, eigene Dienste selbst einzutragen.','Im Dialog bist du als Mitarbeiter bereits ausgewählt – wähle Dienst und Datum und speichere.','Einträge anderer Personen kannst du nicht ändern.']},
  {t:'Eintrag bearbeiten oder löschen',when:c=>c.plan||c.selfDuty,s:['Klicke auf einen Eintrag oder auf „⋯“ daneben.','Wähle „Bearbeiten“ oder „Löschen“.']},
  {t:'Feiertage',s:['Gesetzliche Feiertage in Österreich sind im Kalender rot markiert und mit Namen beschriftet (z. B. „Nationalfeiertag“).','An Feiertagen können keine Dienste eingetragen werden – Bereitschaften sind weiterhin möglich.','Bei mehrtägigen Einträgen und bei der automatischen Rotation werden Feiertage übersprungen.']},
  {t:'Notizen lesen',s:['Hat jemand an einem Tag eine Notiz, steht beim Eintrag „Notizen“ – ohne Dienst an dem Tag erscheint eine eigene Karte „Notizen“.','Klicke auf „Notizen“: Der Text öffnet sich in einem Popup.'],tip:'Notizen sieht jeder, der diesen Dienstplan sieht.'},
  {t:'Teamnotizen',s:['Notizen für ein ganzes Team stehen im Kalender direkt unter dem Datum (z. B. „Teambesprechung 09:00“).','Klicke darauf, um alle Teamnotizen des Tages zu sehen.'],tip:c=>c.teamNotes?'Neue Teamnotiz: Fahre über das Datum und klicke auf „+ Teamnotiz“ – oder im Teamnotizen-Popup auf „Weitere Teamnotiz hinzufügen“.':''},
  {t:'Notiz hinzufügen',s:['Hast du an dem Tag einen Dienst, klicke bei deinem Dienst auf „⋯“ und wähle „Notiz hinzufügen“. Die Notiz hängt dann an diesem Dienst.','Hast du an dem Tag keinen Dienst, klicke im Kalender auf das Feld „Notiz hinzufügen“.','Schreibe die Notiz und speichere. Im Notizen-Popup kannst du sie später bearbeiten, löschen oder weitere hinzufügen.'],tip:c=>c.admin?'Als Admin kannst du Notizen für alle Personen anlegen.':['Teamleiter','Stellvertretung'].includes(c.role)?'Notizen kannst du für dich selbst und für Personen deiner Teams anlegen.':'Notizen kannst du für dich selbst anlegen.'},
  {t:'Einträge verschieben',when:c=>c.plan,s:['Ziehe einen Eintrag mit der Maus auf einen anderen Tag oder zu einer anderen Person im selben Team.','Lass los – der Eintrag wird verschoben. ']},
  {t:'Rotation automatisch planen',when:c=>c.plan&&c.rotDuty,s:['Klicke oben auf „Aktionen“ und wähle „Rotation automatisch planen“.','Wähle Teams, Dienste und den Zeitraum.','Die Dienste werden gleichmäßig auf die Teammitglieder verteilt; Abwesende werden übersprungen.','Kontrolliere das Ergebnis im Kalender.']},
  {t:'Abwesenheit eintragen',when:c=>c.absence,s:['Klicke oben auf „Aktionen“ und wähle „Abwesenheit“.','Wähle Mitarbeiter und Art (z. B. Urlaub, Zeitausgleich, Arztbesuch). Bei stundenweisen Arten gibst du zusätzlich die Uhrzeit an.','Wähle den Zeitraum und speichere – die Abwesenheit erscheint beim Mitarbeiter im Kalender.']},
  {t:'Arbeitsort eintragen (Büro / Homeoffice)',s:['Klicke oben auf „Aktionen“ und wähle „Arbeitsort“.','Wähle Büro oder Homeoffice und den Zeitraum – eingetragen wird Montag bis Freitag.','Schneller geht es in der Wochen- oder Monatsansicht: Mit gedrückter Maustaste über mehrere Tage ziehen, um den Zeitraum zu markieren.']},
  {t:'Dienst tauschen',when:c=>c.swap,s:['Klicke bei deinem Dienst im „⋯“-Menü auf „Dienst tauschen“.','Wähle die Kollegin bzw. den Kollegen und den Dienst, den du dafür übernimmst.','Getauscht wird erst, wenn die andere Person zustimmt. Offene Anfragen bestätigst, lehnst ab oder ziehst zurück in der Übersicht „Diensttausch“ (Dashboard-Kachel oder Benachrichtigung).'],tip:'Der Diensttausch muss für dein Team in der Administration aktiviert sein.'},
  {t:'Dienste lesen',when:c=>!c.plan&&!c.selfDuty,s:['Du siehst den Dienstplan im Lesemodus.','Klicke auf einen Eintrag, um Details wie Uhrzeit und Team zu sehen.']}
 ]},
 {id:'bereitschaft',page:'Bereitschaft',icon:'moon',title:'Bereitschaft',intro:'Wer wann Bereitschaft hat – und wie man sie einteilt.',items:[
  {t:'Ansichten und Zeitleiste',s:['Wähle Tag, Woche, Monat oder Zeitleiste.','Die Zeitleiste zeigt pro Team, wer an welchem Tag Bereitschaft hat.','Mit ‹ › und „Heute“ wechselst du den Zeitraum.']},
  {t:'Bereitschaft einteilen',when:c=>c.planSb||c.selfSb,s:['Klicke auf „Bereitschaft einteilen“ – oder im Kalender bei der Person und dem Tag auf „+“.','Wähle Team, Mitarbeiter und Bereitschaftszeit – angeboten werden nur die Bereitschaftszeiten, die für dieses Team freigegeben sind.','Bei einer fixen Bereitschaft wird die Uhrzeit übernommen. Bei einer variablen Bereitschaft musst du Beginn und Ende selbst eingeben.','Wähle das Datum bzw. den Zeitraum und speichere.']},
  {t:'Bereitschafts-Rotation planen',when:c=>c.planSb&&c.rotSb,s:['Klicke oben auf „Aktionen“ und wähle „Rotation automatisch planen“.','Wähle Teams, Bereitschaftszeit, Zeitraum und ob wöchentlich oder täglich gewechselt wird. Die Bereitschaftszeit muss für alle gewählten Teams freigegeben sein.','Bei einer variablen Bereitschaft gibst du die Uhrzeit einmal für alle Einträge ein.','Mit „Bestehende Einträge behalten“ werden nur Lücken gefüllt.']},
  {t:'Bereitschaft bearbeiten oder löschen',when:c=>c.planSb||c.selfSb,s:['Klicke auf den Eintrag oder auf „⋯“.','Wähle „Bearbeiten“ oder „Löschen“.']},
  {t:'Bereitschaft erreichen',s:['Fahre über einen Bereitschaftseintrag oder öffne ihn.','Über die Telefonnummer bzw. „Anrufen“ erreichst du die Person direkt.']}
 ]},
 {id:'sbadmin',page:'Bereitschaft verwalten',icon:'sliders',title:'Bereitschaft verwalten',intro:'Bereitschaftszeiten je Team. Bereitschaften verwenden automatisch die Teamfarbe.',items:[
  {t:'Bereitschaftszeit anlegen',when:c=>c.sbTimes,s:['Klicke oben auf „Bereitschaftszeit anlegen“.','Gib eine Bezeichnung ein, z. B. „Nachtbereitschaft“.','Wähle unter „Teams mit dieser Bereitschaft“ die Teams aus – nur diese Teams können die Bereitschaft später einteilen. „Alle Teams“ gilt auch für später angelegte Teams.','Wähle die Art: „Fix“ – Beginn und Ende sind Pflicht (über Mitternacht möglich). „Variabel“ – ohne Uhrzeit, sie wird erst beim Einteilen eingegeben.','Wähle eine Farbe für die Übersicht und klicke auf „Bereitschaftszeit anlegen“.']},
  {t:'Bereitschaftszeit ändern oder löschen',when:c=>c.sbTimes,s:['In der Tabelle „Bereitschaftszeiten“ klickst du beim Eintrag auf den Stift, um Bezeichnung, Teams, Art, Uhrzeit oder Farbe zu ändern.','Mit dem Papierkorb löschst du die Bereitschaftszeit.'],tip:'Bereits eingeteilte Bereitschaften bleiben beim Ändern oder Löschen erhalten.'},
  {t:'Übersicht lesen',when:c=>!c.sbTimes,s:['Die Tabelle zeigt alle Bereitschaftszeiten mit Uhrzeit und den Teams, für die sie gelten.','„Fix“ bedeutet feste Uhrzeit, „Variabel“ eine Uhrzeit, die beim Einteilen eingegeben wird.','„Teams mit Bereitschaft“ zeigt, wie viele Teams mindestens eine Bereitschaftszeit haben.']}
 ]},
 {id:'dienstzeiten',page:'Dienstzeiten',icon:'clock',title:'Dienstzeiten',intro:'Schichtmodelle pro Team, die beim Einteilen zur Auswahl stehen.',items:[
  {t:'Dienstzeit erstellen',when:c=>c.shifts,s:['Klicke auf „Dienstzeit erstellen“.','Wähle das Team und gib eine Bezeichnung ein, z. B. „Frühdienst“.','Lege Beginn und Ende fest – die Netto-Arbeitszeit (abzüglich Mittagspause) wird angezeigt.','Lege fest, ob der Dienst mehrfach am Tag besetzt werden darf, wähle eine Farbe und speichere.']},
  {t:'Bearbeiten, duplizieren, löschen',when:c=>c.shifts,s:['In der Spalte „Aktionen“ findest du Stift (bearbeiten), Kopie (duplizieren) und Papierkorb (löschen).','Beim Duplizieren entsteht eine Kopie, deren Bezeichnung du gleich anpasst.']},
  {t:'Suchen und filtern',s:['Über das Suchfeld findest du Dienstzeiten nach Name oder Team.','Mit „Alle Teams“ schränkst du die Liste auf bestimmte Teams ein.','Die Spalte „Genutzt“ zeigt, wie oft ein Dienst bereits eingeteilt ist.']}
 ]},
 {id:'kontakte',page:'Kontakte',icon:'users',title:'Kontakte',intro:'Alle Personen mit Telefon, E-Mail und Team.',items:[
  {t:'Person finden',s:['Tippe Name, Team, Telefonnummer oder E-Mail in das Suchfeld.','Mit den Rollen-Chips (z. B. „Teamleiter“) filterst du nach Rolle.','Klicke auf eine Karte, um alle Details zu sehen.']},
  {t:'Anrufen, schreiben, Favoriten',s:['In der Detailansicht rufst du direkt an, schreibst eine E-Mail oder startest einen Teams-Anruf.','Mit dem Stern markierst du Favoriten – sie stehen oben unter „Meine Favoriten“.']},
  {t:'Kontakte exportieren',s:['Klicke auf „CSV exportieren“, um die Liste z. B. in Excel zu öffnen.']},
  {t:'Mitarbeiter hinzufügen, bearbeiten, löschen',when:c=>c.contactsEdit,s:['Klicke auf „＋ Mitarbeiter hinzufügen“, fülle Name, E-Mail, Telefon, Team und Rolle aus und speichere.','Zum Ändern öffne die Karte und klicke auf „Bearbeiten“; dort kannst du auch ein Profilbild wählen.','„Löschen“ entfernt die Person – du wirst vorher gefragt.']}
 ]},
 {id:'berichte',page:'Berichte / Export',icon:'chart',title:'Berichte / Export',intro:'Auswertungen und Exporte für Lohnverrechnung und Planung.',items:[
  {t:'Zeitraum und Filter wählen',s:['Wähle oben „Diese Woche“, „Dieser Monat“, „Letzter Monat“ oder blättere mit ‹ ›.','Schränke nach Team, Mitarbeiter und Art (Dienst, Bereitschaft, Abwesenheit, Arbeitsort) ein.','Die Kennzahlen (Dienststunden, Bereitschaftsstunden, Abwesenheitstage) passen sich sofort an.']},
  {t:'Bericht exportieren',when:c=>c.reports,s:['Klicke auf „Exportieren“.','Wähle den Bericht – z. B. alle oder ausgewählte Einträge, Lohnverrechnung, Bereitschaftsabrechnung, Abwesenheitsübersicht, Stunden je Mitarbeiter oder Arbeitsort-Monatsauswertung.','Wähle das Format: PDF zum Lesen und Drucken, Excel mit Summen oder CSV für Importe.','Der Export wird im Export Audit protokolliert.']},
  {t:'Nur bestimmte Einträge exportieren',when:c=>c.reports,s:['Hake in der Einträge-Tabelle die gewünschten Zeilen an.','Wähle im Export-Dialog „Ausgewählte Einträge“.']}
 ]},
 {id:'administration',page:'Administration',icon:'build',title:'Administration',intro:'Teams, Verantwortliche, Mitglieder und Teamregeln.',items:[
  {t:'Mindestbesetzung festlegen',when:c=>c.lead,s:['Öffne das Team und wechsle zu „Teamregeln“.','Trage unter „Mindestbesetzung“ für jeden Wochentag ein, wie viele Personen mindestens Dienst haben sollen (0 = keine Vorgabe).','Speichern – ab sofort warnen Dienstplan und Dashboard bei Unterbesetzung.']},
  {t:'Teams finden',s:['Über das Suchfeld findest du Teams oder Personen.','„Vollständig“ und „Offen“ filtern nach Teams mit bzw. ohne Teamleitung.']},
  {t:'Team anlegen',when:c=>c.adminCaps.create,s:['Klicke auf „Team anlegen“.','Gib den Teamnamen ein, wähle eine Teamfarbe und optional eine Abteilung.','Klicke auf „Team anlegen“ – danach legst du Mitglieder, Teamleitung und Stellvertretung fest.']},
  {t:'Abteilung anlegen',when:c=>c.adminCaps.dept,s:['Klicke auf „Abteilung anlegen“.','Gib den Namen ein, wähle die Abteilungsleitung (Rolle „Abteilungsleiter“) und hake die Teams an.','Klicke auf „Anlegen“.']},
  {t:'Mitglieder, Teamleitung und Stellvertretung festlegen',when:c=>c.adminCaps.structure,s:['Klicke bei einem Team auf „Bearbeiten“.','Im Reiter „Mitglieder“ fügst du Personen hinzu oder entfernst sie. Personen mit der Rolle „Teamleiter“ bzw. „Stellvertretung“ werden dabei automatisch Teamleitung bzw. Stellvertretung des Teams.','Im Reiter „Allgemein“ kannst du Teamleitung und Stellvertretung jederzeit ändern.','Klicke auf „Speichern“.'],tip:'Je Team gibt es genau eine Teamleitung und einen Stellvertretung.'},
  {t:'Teamregeln einstellen',when:c=>c.adminCaps.settings,s:['Klicke bei deinem Team auf „Bearbeiten“ und öffne den Reiter „Teamregeln“.','„Diensttausch“: erlaubt Mitarbeitern, Dienste untereinander zu tauschen – erst nach Bestätigung der anderen Person.','„Selbst eintragen“: legt fest, ob niemand, alle oder ausgewählte Mitglieder eigene Dienste bzw. Bereitschaften selbst eintragen dürfen.','Klicke auf „Speichern“.']},
  {t:'Teams ansehen',when:c=>!c.adminCaps.settings,s:['Klicke bei einem Team auf „Ansehen“, um Mitglieder und Regeln zu sehen.']}
 ]},
 {id:'rollen',page:'Team Berechtigungen',icon:'shield',title:'Team Berechtigungen',intro:'Welche Rolle welchen Bereich sehen oder bearbeiten darf.',items:[
  {t:'Rechte einer Rolle ändern',when:c=>c.rolesEdit,s:['Suche in der Tabelle die Zeile des Bereichs und die Spalte der Rolle.','Klicke auf das Feld, um zwischen „Kein Zugriff“, „Lesen“ und „Bearbeiten“ zu wechseln.','Klicke auf „Speichern“. Die Navigation der Rolle passt sich sofort an.'],tip:'Geschützte Rollen (z. B. Admin) lassen sich nicht einschränken.'},
  {t:'Neue Rolle anlegen oder duplizieren',when:c=>c.rolesEdit,s:['„Neue Rolle“ legt eine leere Rolle an, „Rolle duplizieren“ übernimmt die Rechte der gewählten Rolle.','Gib einen Namen ein und passe die Rechte an.','Mit „Umbenennen“ und „Löschen“ verwaltest du eigene Rollen.']},
  {t:'Rechte lesen',when:c=>!c.rolesEdit,s:['Die Tabelle zeigt für jede Rolle, welche Bereiche sie lesen oder bearbeiten darf.']}
 ]},
 {id:'audit',page:'Audit Log',icon:'history',title:'Audit Log',intro:'Wer hat wann was geändert.',items:[
  {t:'Änderungen nachvollziehen',s:['Filtere nach „Erstellt“, „Geändert“ oder „Gelöscht“ und suche nach Personen oder Aktionen.','Bei Änderungen zeigt jeder Eintrag den alten und den neuen Wert (Vorher → Nachher).','Rechts siehst du die Aktivität der letzten 7 Tage und die aktivsten Benutzer.']},
  {t:'Log exportieren',s:['Klicke auf „Log exportieren“ und wähle das Format – oder exportiere einzelne Einträge mit „Eintrag als CSV“.']}
 ]},
 {id:'exportaudit',page:'Export Audit',icon:'download',title:'Export Audit',intro:'Protokoll aller Exporte.',items:[
  {t:'Exporte prüfen',s:['Die Kennzahlen zeigen Exporte und exportierte Zeilen der letzten 30 Tage, verweigerte Exporte und das häufigste Format.','Suche nach Bericht oder Person und filtere nach Format.']},
  {t:'Protokoll exportieren',s:['Klicke auf „Protokoll exportieren“ und wähle das Format.']}
 ]},
 {id:'einstellungen',page:'Einstellungen',icon:'gear',title:'Einstellungen',intro:'Persönliche Ansicht und Datensicherung. Öffnen über den Avatar oben rechts oder das Menü.',items:[
  {t:'Kalender einstellen',s:['Unter „Kalender“ wählst du die Startansicht für Dienstplan und Bereitschaft.','Lege die Arbeitstage fest (Mo–Fr, Mo–Sa oder Mo–So).','„Kompakt“ zeigt in der Monatsansicht „+X weitere“, „Erweitert“ zeigt alle Einträge.']},
  {t:'Darstellung und Sprache',s:['Unter „Darstellung“ wählst du Hell, Dunkel oder System, die Akzentfarbe und die Schriftgröße.','Unter „Sprache & Datum“ stellst du Deutsch oder Englisch ein.']},
  {t:'Links für Dashboard-Kacheln',when:c=>c.admin,s:['Unter „Links & Weiterleitungen“ legst du mit „Link festlegen“ fest, wohin z. B. die Kachel „Mein Porsche Cockpit“ führt.']},
  {t:'Wo liegen die Daten?',s:['Alle Daten liegen zentral in der Datenbank – auf jedem Gerät siehst du denselben Stand.','Jede Änderung wird serverseitig auf Berechtigung geprüft und im Audit Log protokolliert.','Unter Einstellungen → Daten kannst du eine Kopie als .json herunterladen.']},
  {t:'Alte Einträge archivieren',when:c=>c.admin,s:['„Archivieren …“ speichert Einträge, die älter als 12 Monate sind, als CSV und entfernt sie danach aus der Datenbank.']}
 ]}
];
