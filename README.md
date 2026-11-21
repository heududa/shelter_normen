# Normenbibliothek Schutzraum

Alle Normen an einem Ort: Original-PDF, erkannter Text, Regeln, Änderungen und Glossar. Für eine Person gleichzeitig, ohne Datenbank.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `index.html`, `app.js`, `style.css` | das Programm |
| `lib/` | PDF-Anzeige (pdf.js) und PDF-Export (pdf-lib) |
| `daten/bibliothek.json` | Bearbeitungsstand: Normen, Regeln, Änderungen, Anmerkungen, Glossar, Versionen, Verlauf |
| `daten/texte.json` | Seitentexte, Abschnitte, erkannte Struktur, Tabellen und Skizzen, unsicher gelesene Stellen |
| `daten/lagen/` | Lage jedes Wortes auf den neu erkannten Seiten; für Markierung im Scan und Hybridansicht |
| `daten/ocr/` | Ergebnis der Texterkennung je gescanntem PDF und `bericht.json`; Quelle für die Ersterfassung |
| `daten/titelbilder.json` | Titelblätter für die Startseite |
| `pdf/` | Original-PDF, unverändert |
| `pdf/eigene/` | PDF, die im Programm hinzugefügt wurden |
| `werkzeuge/` | Ersterfassung, Texterkennung für Scans, Zusammenfügen von Kapiteldateien, kleiner Webserver |
| `test/` | Prüfläufe im Browser |

## Benutzen

**Bearbeiten (lesen und speichern):** Repo auf den Rechner holen, `index.html` in Edge oder Chrome öffnen und den Ordner des Repos wählen. Das Programm liest und speichert dann direkt in diesem Ordner. Danach mit Git sichern (`git add -A`, `git commit`, `git push`).

**Nur ansehen:** Über einen Webserver aufrufen, zum Beispiel `node werkzeuge/server.js` und dann `http://localhost:8080/`, oder über GitHub Pages. Ohne verbundenen Ordner ist die Bibliothek schreibgeschützt; „Ordner verbinden“ schaltet das Speichern frei.

Firefox und Safari können keine Ordner öffnen. Dort geht nur Ansehen über einen Webserver.

## Was drin ist

- **Bibliothek:** 77 Werke des BABS und die Schicht ANDAIR 2026, 99 Original-PDF mit 2378 Seiten.
- **Prüfungen:** Stand der digitalen Fassung je Norm, von „Ungeprüft“ bis „Freigegeben“.
- **Gescannte Normen:** neu erkannter Text, Tabellen als Tabellen, Skizzen als Ausschnitt aus dem Original, unsicher gelesene Stellen gelb markiert.
- **Tabellen und Skizzen übernehmen:** Bereich im Scan einrahmen; Tabellen lassen sich Zelle für Zelle bearbeiten.
- **Glossar und Index:** Abkürzungen mit Quelle und alle Fundstellen in den Normen.
- **Änderungen und Versionen:** offene Änderungen freigeben oder verwerfen, Stände vergleichen.

## Farben und Logo

`marke/farben.css` enthält die Farben. Für ein Logo die Datei (SVG oder PNG, für dunklen Hintergrund) nach `marke/` legen und in `farben.css` die Zeilen `--logo` und `--logo-hoehe` aktivieren.

## Mehrere Nutzer

```
node werkzeuge/mehrnutzer.js --port 8080 --git
```

Beim ersten Start legt der Server den Benutzer `admin` an und zeigt dessen Passwort einmal in der Konsole. Danach im Browser anmelden, das Passwort ändern und unter «Konto → Benutzer verwalten» die weiteren Benutzer anlegen.

| Rolle | Darf |
|---|---|
| Gast | lesen, suchen, drucken |
| Autor | bearbeiten, speichern, zur Prüfung einreichen |
| Prüfer | zusätzlich: Seiten vergleichen und die Norm freigeben, zurückgeben, Versionen freigeben |
| Admin | zusätzlich: Benutzer verwalten, Bearbeitungssperre aufheben |

- Es bearbeitet immer nur eine Person gleichzeitig. Die anderen lesen und sehen neue Stände von selbst.
- Benutzer und Stand liegen im Ordner `server/` (nicht im Repo). Diesen Ordner sichern.
- `--git` legt nach jedem Speichern einen Commit an. `--sicher` setzt das Cookie nur über HTTPS; dafür den Server hinter den HTTPS-Proxy der Firma stellen.
- Braucht Node.js ab Version 18, sonst nichts.

## Entwickeln

- `npm install` holt pdf.js und pdf-lib; die fertigen Dateien liegen bereits in `lib/`.
- `node test/test.js` prüft den ganzen Ablauf im Browser (Playwright). Geschrieben wird dabei nur nach `test/tmp/`.
- `node werkzeuge/ersterfassung.js --ueberschreiben` erzeugt `daten/` neu aus den PDF. **Das ersetzt den Bearbeitungsstand.**
- `python3 werkzeuge/ocr.py --tessdata <Ordner>` liest die gescannten Seiten neu ein und schreibt `daten/ocr/`. Braucht Tesseract 5 mit `deu.traineddata` aus tessdata_best, poppler, Python mit opencv und pytesseract. Der ganze Lauf dauert auf zwei Kernen rund 35 Minuten. Danach die Ersterfassung laufen lassen.
- `sh werkzeuge/zusammenfuegen.sh` fügt die Kapiteldateien von TWS 1982 und TWO 1977 zusammen (braucht qpdf).

## Grundsätze

- Das Original-PDF bleibt unverändert.
- OCR-Korrekturen, fachliche Änderungen und Formatänderungen werden getrennt geführt, jede mit Name, Datum und Begründung.
- Fachliche Änderungen liegen in einer Schicht (Kanton oder Hersteller), nie in der Norm.
- Für die Auslegung gilt nur, was freigegeben ist.

Einzelheiten und offene Punkte: `CHANGELOG.md`.
