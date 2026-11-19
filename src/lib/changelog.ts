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
    v: '2026.11.19',
    date: '19.11.2026',
    title: 'Rotation: Dienste je Person',
    items: [
      ['neu', 'Dienstplan', 'Dienste je Person in der Rotation', 'Teamleitungen legen je Person fest, welche Dienste sie bekommt – „Rotation automatisch planen“ teilt nur diese zu.'],
      ['neu', 'Bereitschaft', 'Wer macht Bereitschaft?', 'Je Team festlegen, wer bei der Bereitschafts-Rotation eingeteilt wird.'],
    ],
  },
  {
    v: '2026.11.18.2',
    date: '18.11.2026',
    title: 'Mindestbesetzung, Wochenvorlagen, App & Push',
    items: [
      ['neu', 'Team', 'Mindestbesetzung', 'Pro Team und Wochentag festlegen – Dienstplan und Dashboard warnen bei Unterbesetzung.'],
      ['neu', 'Dienstplan', 'Wochenvorlagen', 'Musterwoche speichern und mit einem Klick auf beliebige Wochen anwenden.'],
      ['neu', 'Oberfläche', 'Als App installieren', 'DienstPlan lässt sich am Handy und PC installieren und zeigt deinen Plan auch offline.'],
      ['neu', 'Benachrichtigungen', 'Push am Handy', 'Neue Einteilungen, Änderungen und Tauschanfragen als Mitteilung – auch wenn die App geschlossen ist.'],
    ],
  },
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
