# DienstPlan Pro – Dienst- und Bereitschaftsplanung

Web-App für Dienstplan, Bereitschaft, Diensttausch, Abwesenheiten, Arbeitsort, Teams & Abteilungen,
Berichte/Export und Audit Log. Die bisherige reine Browser-Version (HTML/JS, Daten im `localStorage`)
wurde auf eine Server-Anwendung mit Datenbank und echter Anmeldung umgebaut. Oberfläche, Abläufe und
Fachregeln sind übernommen – das bisherige Stylesheet wird unverändert weiterverwendet.

| Bereich | Technik |
|---|---|
| Programmiersprache | TypeScript (strict) |
| Frontend | Next.js 16 (App Router) · React 19 |
| Styling | CSS (bestehendes Stylesheet) · PostCSS (Nesting, Autoprefixer) |
| Datenbankzugriff | Prisma 7 · PostgreSQL (`@prisma/adapter-pg`) |
| Unit-/Integrationstests | Vitest (`vitest.config.ts`) · Testing Library |
| E2E-Tests | Playwright (`playwright.config.ts`, Desktop + Handy) |
| Containerisierung | Docker (`Dockerfile`, `docker-compose.yml`) |
| CI/CD | GitLab CI (`.gitlab-ci.yml`) |
| Authentifizierung | NextAuth v5 / Auth.js (`src/auth.ts`, `src/auth.config.ts`, `src/proxy.ts`, `src/server/session.ts`) |

## Schnellstart (lokal)

Voraussetzungen: Node.js 22, Docker (für PostgreSQL) – oder eine vorhandene PostgreSQL-Datenbank.

```bash
cp .env.example .env
```

```bash
docker compose up -d db
```

```bash
npm install
```

```bash
npx prisma migrate deploy
```

```bash
npx prisma db seed
```

```bash
npm run dev
```

Danach <http://localhost:3000> öffnen. Mit `AUTH_DEMO_LOGIN=true` erscheint auf der Anmeldeseite
„Demo: Benutzer wählen“ (ohne Passwort). **Alex Gruber** ist Admin und sieht alle Bereiche.

Demo-Daten: 11 Teams, 60 Personen, Dienst- und Bereitschaftszeiten. Mit
`SEED_DEMO_ENTRIES=true npx prisma db seed` werden zusätzlich 5 Wochen Dienste und Bereitschaften
erzeugt. **Achtung:** Der Seed löscht vorher alle Daten.

### Datenbank anbinden

Nur `DATABASE_URL` in `.env` (bzw. als Umgebungsvariable im Betrieb) setzen:

```
DATABASE_URL="postgresql://BENUTZER:PASSWORT@HOST:5432/DATENBANK?schema=public"
```

Schema anlegen bzw. aktualisieren: `npx prisma migrate deploy`. Das Docker-Image macht das beim Start
automatisch (abschaltbar mit `SKIP_MIGRATIONS=1`).

### Anmeldung (NextAuth)

| Variante | Einrichtung |
|---|---|
| Microsoft Entra ID (Firmen-SSO) | `AUTH_MICROSOFT_ENTRA_ID_ID`, `…_SECRET`, `…_ISSUER` setzen. Angemeldet werden nur Personen, deren E-Mail als Mitarbeiter angelegt ist. |
| E-Mail + Passwort | Für Personen mit `passwordHash` (bcrypt) in der Tabelle `Employee`. |
| Demo „Benutzer wählen“ | `AUTH_DEMO_LOGIN=true` – **nur für Test-/Demosysteme**. |

`AUTH_SECRET` muss im Betrieb ein zufälliger Wert sein (`npx auth secret`). Die Rolle steht nicht im
Session-Token, sondern wird bei jeder Anfrage aus der Datenbank gelesen – Rollenänderungen wirken sofort.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` / `npm start` | Produktions-Build / -Server |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:e2e` | E2E-Tests (Playwright, startet den Dev-Server; Datenbank mit Seed nötig) |
| `npm run db:migrate` | neue Migration aus `prisma/schema.prisma` erzeugen |
| `npm run db:seed` | Demo-Daten einspielen |
| `docker compose up --build` | App + Datenbank als Container auf Port 3000 |

## Aufbau

```
prisma/              Datenmodell (schema.prisma), Migrationen, Seed
src/app/             Seiten (App Router): (auth)/login, (app)/dashboard, dienstplan, bereitschaft, …
src/auth*.ts         NextAuth-Konfiguration · src/proxy.ts schützt alle Seiten
src/server/          Datenbankzugriff (db.ts, data.ts), Session, Server Actions (actions/*)
src/lib/             Fachlogik ohne UI – läuft im Browser und auf dem Server:
                     permissions, access (Team-/Eintragsrechte), entries (Konflikte, Stunden,
                     Bereitschaftstage), rotation, swaps, holidays (Feiertage AT), export (PDF/XLSX/CSV)
src/components/      React-Oberfläche: shell, calendar, dashboard, pages, ui
src/styles/          app.css (bisheriges Stylesheet) + react.css (Ergänzungen)
tests/unit/          Vitest · tests/e2e/ Playwright
legacy/              bisherige Browser-Version als Referenz (wird nicht mehr ausgeliefert)
```

Jede Änderung läuft über eine Server Action (`src/server/actions`), die die Berechtigung mit
denselben Funktionen aus `src/lib` prüft wie die Oberfläche, in die Datenbank schreibt und einen
Audit-Log-Eintrag erzeugt.

## Stand des Umbaus

Übernommen: Anmeldung, Seitenleiste/Kopfzeile, Benachrichtigungen, Mein Konto, Suche (Strg K),
Neuigkeiten, Dashboard (Kacheln, „Dashboard anpassen“), Dienstplan & Bereitschaft (Tag, Woche, Monat,
Team/Zeitleiste, Handy-Ansichten, Filter, Konflikte, Feiertage, Drag & Drop, Arbeitsort per Ziehen),
Dienst/Bereitschaft einteilen, Abwesenheit, Arbeitsort, Notizen & Teamnotizen, Rotation (Dienst und
Bereitschaft), Diensttausch, Bereitschafts-Kontakt, Dienstzeiten, Bereitschaft verwalten, Kontakte,
Berichte/Export (PDF, Excel, CSV), Administration (Teams, Teamregeln, Abteilungen), Rollen &
Berechtigungen, Audit Log, Export Audit, Einstellungen, Hilfe, Deutsch/Englisch.

Bewusst geändert bzw. noch offen:

- **Rückgängig (Strg Z)** entfällt vorerst – Änderungen sind sofort gespeichert und im Audit Log nachvollziehbar.
- **Sicherung einspielen (.json)** und „Demo-Daten zurücksetzen“ entfallen; Daten liegen zentral in der Datenbank (Seed für Demos).
- **Dashboard „Ansicht bearbeiten“** (Kacheln frei verschieben) ist noch nicht portiert; Ein-/Ausblenden funktioniert.
- **Datums- und Farbauswahl** nutzen vorerst die Browser-eigenen Auswahlfelder statt der eigenen Popups.
- **Englisch** wird wie bisher per Wörterbuch über die Oberfläche übersetzt (`src/lib/i18n`); mittelfristig auf `t()`-Aufrufe umstellen.
- Alle Einträge werden derzeit vollständig geladen; bei großen Datenmengen auf zeitraumbezogenes Laden umstellen.
