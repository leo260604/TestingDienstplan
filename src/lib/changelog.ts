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
];
export const APP_VERSION = CHANGELOG[0].v;
