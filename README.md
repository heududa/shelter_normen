# Normenbibliothek Schutzraum

Alle Normen an einem Ort: Original-PDF, erkannter Text, Regeln, Änderungen und Glossar. Für eine Person gleichzeitig, ohne Datenbank.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `index.html`, `app.js`, `style.css` | das Programm |
| `lib/` | PDF-Anzeige (pdf.js) und PDF-Export (pdf-lib) |
| `daten/bibliothek.json` | Bearbeitungsstand: Normen, Regeln, Änderungen, Anmerkungen, Glossar, Versionen, Verlauf |
| `daten/texte.json` | Seitentexte, Abschnitte und erkannte Struktur aus den PDF |
| `daten/titelbilder.json` | Titelblätter für die Startseite |
| `pdf/` | Original-PDF, unverändert |
| `pdf/eigene/` | PDF, die im Programm hinzugefügt wurden |
| `werkzeuge/` | Ersterfassung, Zusammenfügen von Kapiteldateien, kleiner Webserver |
| `test/` | Prüfläufe im Browser |

## Benutzen

**Bearbeiten (lesen und speichern):** Repo auf den Rechner holen, `index.html` in Edge oder Chrome öffnen und den Ordner des Repos wählen. Das Programm liest und speichert dann direkt in diesem Ordner. Danach mit Git sichern (`git add -A`, `git commit`, `git push`).

**Nur ansehen:** Über einen Webserver aufrufen, zum Beispiel `node werkzeuge/server.js` und dann `http://localhost:8080/`, oder über GitHub Pages. Ohne verbundenen Ordner ist die Bibliothek schreibgeschützt; „Ordner verbinden“ schaltet das Speichern frei.

Firefox und Safari können keine Ordner öffnen. Dort geht nur Ansehen über einen Webserver.

## Grundsätze

- Das Original-PDF bleibt unverändert.
- OCR-Korrekturen, fachliche Änderungen und Formatänderungen werden getrennt geführt, jede mit Name, Datum und Begründung.
- Fachliche Änderungen liegen in einer Schicht (Kanton oder Hersteller), nie in der Norm.
- Für die Auslegung gilt nur, was freigegeben ist.

Einzelheiten und offene Punkte: `CHANGELOG.md`.
