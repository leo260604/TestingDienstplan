/* Neuigkeiten (Änderungen je Version) – erscheinen über den Knopf in der Kopfzeile */
export type ChangeItem = ['neu' | 'verbessert', string, string, string];
export interface Release {
  v: string;
  date: string;
  title: string;
  items: ChangeItem[];
}

export const CHANGELOG: Release[] = [
  {
    v: '2026.11.18',
    date: '18.11.2026',
    title: 'Neue technische Basis: Server, Datenbank & Anmeldung',
    items: [
      ['neu', 'Oberfläche', 'Next.js & React', 'Die App läuft jetzt als Webanwendung mit Server statt nur im Browser.'],
      ['neu', 'Anmeldung', 'Echte Anmeldung', 'Microsoft-Konto (Entra ID), E-Mail & Passwort oder Demo-Anmeldung.'],
      ['neu', 'Einstellungen', 'Daten in der Datenbank', 'Alle Daten liegen zentral – für alle Geräte und Personen gleich.'],
      ['verbessert', 'Team', 'Rechte am Server geprüft', 'Jede Änderung wird serverseitig auf Berechtigung geprüft und protokolliert.'],
    ],
  },
  {
    v: '2026.11.17',
    date: '17.11.2026',
    title: 'Feiertage, neue Datumsauswahl & aufgeräumte Oberfläche',
    items: [
      ['neu', 'Kalender', 'Feiertagskalender Österreich', 'Feiertage sind im Kalender markiert, Dienste an Feiertagen gesperrt.'],
      ['neu', 'Kalender', 'Datum im Kalenderkopf anklickbar', 'Tag, Woche (KW) oder Monat direkt auswählen.'],
      ['neu', 'Kontakte', 'Mitarbeiterliste für Admins', 'Sortieren, bearbeiten, löschen und mehrere auf einmal auswählen.'],
      ['neu', 'Bereitschaft', 'Wochentage je Bereitschaftszeit', 'Inklusive Option „Feiertage“ für die Samstags-Freigabe.'],
      ['neu', 'Einstellungen', 'Wochenende in der Bereitschaft', 'Eigene Einstellung, getrennt vom Dienstplan.'],
      ['neu', 'Notizen', 'Notiz-Vorschau', 'Beim Darüberfahren sichtbar, Verfasser wird immer angezeigt.'],
      ['verbessert', 'Kalender', 'Monatsansicht', 'Gleichmäßig skaliert – Einträge und Feiertage vollständig lesbar.'],
      ['verbessert', 'Dashboard', '„Dashboard anpassen“', 'Neu gestaltet mit Karten und Ein/Aus-Schaltern.'],
      ['verbessert', 'Team', 'Stellvertretung', '„Deputy“ heißt jetzt „Stellvertretung“, Teamleitung wird aus der Rolle gesetzt.'],
    ],
  },
  {
    v: '2026.11.16',
    date: '16.11.2026',
    title: 'Notizen, Rotation & Team-Ansicht',
    items: [
      ['neu', 'Notizen', 'Notizen im Dienstplan', 'Inklusive Teamnotizen unter dem Datum.'],
      ['neu', 'Team', 'Eigene Mitarbeiter-Reihenfolge', 'Per Drag & Drop in der Team-Ansicht.'],
      ['neu', 'Bereitschaft', 'Faire Rotation', 'Teamleitung wird automatisch erkannt und ausgenommen.'],
      ['neu', 'Bereitschaft', 'Kontakt-Popup', 'Mit Anruf und Teams-Chat direkt aus dem Kalender.'],
      ['verbessert', 'Kalender', 'Getrennte Teamfilter', 'Dienstplan und Bereitschaft merken sich ihre Auswahl.'],
    ],
  },
];
export const APP_VERSION = CHANGELOG[0].v;
