# DienstPlan Pro – Shift Planning

Web-App zur Dienst- und Bereitschaftsplanung (Dienstplan, Bereitschaft, Diensttausch, Abwesenheiten, Arbeitsort, Teams & Abteilungen, Berichte/Export, Audit Log). Läuft komplett im Browser, ohne Server – Daten werden im `localStorage` des Browsers gespeichert.

## Starten
- `DienstPlanPro/index.html` im Browser öffnen, **oder**
- `DienstPlanPro-Einzeldatei.html` öffnen (alles in einer Datei).

## Inhalt
| Pfad | Beschreibung |
|---|---|
| `DienstPlanPro/` | Quellcode: `index.html`, `app.js`, `i18n.js` (Deutsch/Englisch), `styles.css`, `assets/` |
| `tools/build_einzeldatei.py` | Baut `DienstPlanPro-Einzeldatei.html` aus den Quelldateien |
| `DienstPlanPro-Einzeldatei.html` | Gesamte App in einer HTML-Datei |
| `LIES_MICH.md` | Ausführliche Beschreibung aller Funktionen und Änderungen |
| `Mockups/`, `Screenshots_*` | Entwürfe und Screenshots |

## Einzeldatei bauen
Nach jeder Änderung an den Quelldateien: `python3 tools/build_einzeldatei.py` (bettet `styles.css`, `i18n.js` und `app.js` in eine Datei ein).
