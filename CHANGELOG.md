# Normenbibliothek – CHANGELOG

## 0.14.0 – 22.11.2026

Werkzeuge für den Vergleich mit dem Original.

### Neu im Vergleich («Vergleichen: ganze Seite»)
- **Zeilengetreu:** Umschalter «Fliesstext / Zeilengetreu». Zeilengetreu steht jede Zeile an ihrem Ort wie auf der Seite, mit demselben Umbruch; Skizzen stehen als Ausschnitt am selben Platz. Unsichere Wörter sind gelb, von Hand berichtigte blau.
- **Zeilengenaues Mitscrollen:** Im Fliesstext richtet sich die andere Seite nach der Zeile, nicht mehr nach dem Anteil. Die Stelle auf einem Drittel der Fensterhöhe steht links und rechts gleich hoch; Skizzen und Tabellen dienen als zusätzliche Stützpunkte.
- **Zeilenlineal:** Die aktuelle Zeile ist im Scan und im Text hervorgehoben und wandert mit Pfeil auf und ab oder per Klick.
- **Blinkvergleich:** Scan und zeilengetreuer Text liegen übereinander und wechseln mit der Leertaste.
- **Tastaturablauf:** Enter markiert die Seite als verglichen und geht zur nächsten, N springt zur nächsten Seite mit unsicheren Stellen, dazu Tasten für Seiten, Zoom, Darstellung, Lineal, Blinken und Bearbeiten. «Tasten» zeigt die Liste.
- **Fortschritt:** Balken «n von N Seiten verglichen» in der Leiste.

### Neu: Prüfliste
- **Stellen einzeln prüfen:** Unter «Prüfungen → Stellen prüfen» oder «Prüfliste» in der Bearbeitung. Jede Stelle zeigt den Ausschnitt aus dem Scan mit dem eingerahmten Wort, das gelesene Wort gross und die Zeile als Kontext. Enter bestätigt, K berichtigt, Pfeiltasten blättern, V öffnet die Seite im Vergleich.
- **Drei Listen:** unsicher gelesene Stellen, Zahlen mit Einheit, alle Zahlen. Eine vierte, «Vorschläge der Zweitlesung», erscheint, wenn Vorschläge vorliegen.
- **Berichtigen** legt eine OCR-Korrektur an (oder ändert die Tabellenzelle) und ist wie jede Änderung versioniert.
- **Bestätigte Stellen** erscheinen nicht mehr in der Liste. Sind alle gleichen Wörter einer Seite bestätigt, entfällt die gelbe Markierung im Text. Seiten, die als verglichen markiert sind, lässt die Liste aus.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| P1 | Zeilengetreu zeigt den Grundtext mit den OCR-Korrekturen von Hand, keine Schichten (Kanton, Hersteller) und keine Formatvorlagen. Tabellen stehen dort als Wörter an ihrem Ort, ohne Linien. |
| P2 | Seiten, die ganz als Bild geführt sind, zeigen zeilengetreu nur das Bild. |
| P3 | «Zahlen mit Einheit» erkennt eine Zahl, auf die in derselben Zeile eine Einheit folgt (m, mm, m², m³/h, Pa, kN/m², %, …) oder an der sie hängt. Zahlen ohne Einheit stehen nur in «Alle Zahlen». |
| P4 | Die Prüfliste gibt es nur für neu erkannte (gescannte) Seiten. Bei digital entstandenen PDF ist der Text das Original. |
| P5 | Bestätigungen in der Prüfliste werden je Sitzung und Liste einmal im Verlauf vermerkt, nicht je Stelle. Sie stehen aber einzeln in den Daten. |
| P6 | Eine bestätigte Stelle ist kein Ersatz für «Seite verglichen»: Die Prüfliste prüft Wörter, nicht ob etwas fehlt. |

## 0.13.0 – 22.11.2026

Eigene Bilder im Text: Skizze tauschen, Bild neu einfügen, Grösse, Ausrichtung und Lage einstellen.

### Neu
- **Skizze durch ein eigenes Bild ersetzen:** An jeder Skizze im Text öffnet «Bild, Grösse, Ausrichtung» den Dialog mit «Durch ein eigenes Bild ersetzen». Das eigene Bild steht danach an der Stelle der Skizze. «Wieder den Ausschnitt aus dem Original zeigen» macht den Tausch rückgängig.
- **Eigenes Bild neu einfügen:** In der Bearbeitung steht neben «Skizze übernehmen» der Knopf «Eigenes Bild einfügen». Das Bild erscheint zuerst am Ende der Seite.
- **Grösse und Ausrichtung:** Breite in Prozent der Textbreite (10 bis 100, leer = automatisch) und Ausrichtung links, Mitte oder rechts. Der Dialog zeigt die Wirkung sofort in der Vorschau. Beides gilt auch für Skizzen aus dem Original.
- **Lage im Text:** Bilder und Tabellen ohne Marke im Text lassen sich mit ↑ und ↓ zeilenweise verschieben. Wer eine feste Stelle will, setzt wie bisher die Marke `[[Skizze 64.2]]` in den Text der Seite.
- **Formate:** PNG, JPEG, WebP, GIF und SVG. Das Programm legt jedes Bild als PNG ab, längste Seite höchstens 2400 Punkte.
- **Ablage:** Die Bilder liegen als Dateien in `bilder/eigene/`; im Bearbeitungsstand stehen nur Pfad und Masse. Der Dateiname beginnt mit einer Prüfsumme, eine Datei wird nie überschrieben. Der Server für mehrere Nutzer nimmt Bilder über `api/bild` an (nur PNG, nur in diesen Ordner, nicht von Gästen) und nimmt sie mit `--git` in die Sicherung auf.
- **Versioniert:** Tausch, Einfügen, Grösse, Ausrichtung und Lage sind Einträge der Liste «Tabelle/Skizze», stehen unter «Änderungen» und werden wie alles andere freigegeben.
- **Druck und Word:** Beide zeigen das eigene Bild in der eingestellten Breite und Ausrichtung.
- Das Original-PDF bleibt unverändert. Der Scan links zeigt weiterhin die Skizze des Originals.

### Behoben
- **Sicherung mit `--git`:** Fehlte der Ordner `pdf/eigene`, brach `git add` ab und der Server legte keinen Commit an. Der Server übergibt jetzt nur vorhandene Ordner.

### Prüflauf
- `node test/bilder.js` (neu): Skizze ersetzen, Breite und Ausrichtung messen, speichern, neu laden, Original zurückholen, neues Bild einfügen und verschieben, Druck, Word-Datei (Bildbreite in der Datei nachgemessen), entfernen.
- `node test/mehrnutzer.js`: zusätzlich `api/bild` (falscher Ordner, falsche Endung, kein PNG, Gast, Überschreiben).
- `node test/test.js` und `node test/anmerkungen.js`: ohne Fehler.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| O1 | Ein eigenes Bild ist im Text eine «Skizze» mit eigener Nummer (z. B. Skizze 64.2). Eine eigene Bezeichnung «Bild» gibt es nicht. |
| O2 | Das Bild steht als eigener Block zwischen den Zeilen; Text fliesst nicht seitlich um das Bild. |
| O3 | Verschieben mit ↑ ↓ geht zeilenweise und nur bei Elementen ohne Marke im Text. Mehrere Schritte hintereinander ergeben einen Eintrag im Verlauf. |
| O4 | Alle Formate werden zu PNG mit weissem Grund. Vektorbilder (SVG) verlieren damit die freie Skalierbarkeit; Fotos werden als PNG grösser als als JPEG. |
| O5 | Schemas, die als PDF vorliegen, lassen sich nicht direkt einfügen; sie müssen vorher als Bild gespeichert werden. |
| O6 | Ein entferntes oder ersetztes Bild bleibt als Datei in `bilder/eigene/` liegen, damit freigegebene Versionen es weiter zeigen können. |
| O7 | Die Erstfreigabe einer Norm bestätigt die Übereinstimmung mit dem Original. Ein getauschtes Bild weicht davon ab; es ist im Text mit «eigenes Bild» bezeichnet, aber nicht als Abweichung einer Schicht (Kanton, Hersteller) geführt. |

### Offen
- Ohne Server und ohne verbundenen Ordner (nur heruntergeladene `bibliothek.json`) sind neu eingefügte Bilder nicht enthalten; das Programm meldet das.
- Der PDF-Export (Originalseiten mit Änderungsblättern) zeigt eigene Bilder nicht, nur der Druck und die Word-Datei.

## 0.12.0 – 22.11.2026

Antworten auf Anmerkungen und Markieren per Textauswahl.

### Neu
- **Antworten auf Anmerkungen:** Jede Anmerkung hat den Knopf «Antworten». Die Antworten stehen mit Name und Datum unter der Anmerkung, in der Reihenfolge ihres Eingangs. Beim Antworten lässt sich die Anmerkung gleich als erledigt markieren.
  - Antworten gehören zur Anmerkung und laufen wie sie über die Freigabe: Eine neue Antwort macht die Anmerkung zu einer offenen Änderung. Nicht freigegebene Antworten lassen sich löschen, freigegebene nur zurückziehen.
  - Die Suche findet den Text der Antworten. Das Protokoll für Excel führt jede Antwort als eigene Zeile, Druck, Word-Datei und PDF-Export zeigen sie unter der Anmerkung. Der Verlauf vermerkt jede Antwort.
- **Markieren per Textauswahl:** Neben «Stelle kommentieren» steht die Wahl «Text | Rechteck». Bei «Text» (Vorgabe) überstreicht man die Wörter im Scan wie in einem Textprogramm, über mehrere Zeilen hinweg; ein Klick markiert ein einzelnes Wort. Die Stelle ist danach zeilenweise hinterlegt statt eingerahmt.
  - Die Anmerkung hält den markierten Text fest und zeigt ihn als Zitat. Bei «Änderung im Scan vorschlagen» steht er als Originalinhalt und als Ausgangspunkt des Vorschlags im Formular.
  - Es gilt der Text der neuen Texterkennung, bei digital entstandenen PDF die Textebene des PDF.
  - «Rechteck» arbeitet wie bisher. Tabellen und Skizzen werden immer mit einem Rechteck übernommen.
  - Der PDF-Export hinterlegt solche Stellen zeilenweise.

### Prüflauf
- `node test/anmerkungen.js` (neu): Text über mehrere Zeilen markieren, einzelnes Wort, Rechteck, zwei Personen antworten, erledigen, Antwort löschen, Suche, Speichern und Wiederlesen.
- `node test/test.js` und `node test/mehrnutzer.js`: ohne Fehler.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| N1 | Antworten sind eine einfache Liste unter der Anmerkung; Antworten auf Antworten (Verschachtelung) gibt es nicht. |
| N2 | Eine Antwort lässt sich nicht nachträglich ändern, nur löschen (nicht freigegeben) oder zurückziehen (freigegeben). |
| N3 | Jeder, der bearbeiten darf, kann antworten und auch fremde Antworten löschen oder zurückziehen. Der Server prüft das wie bei den Anmerkungen selbst nicht (siehe «Offen»). |
| N4 | Steht an der überstrichenen Stelle kein erkannter Text (Skizze, Seite ohne Text), wird die Stelle als Rechteck markiert; das Programm meldet das. |
| N5 | Die Lesefolge ist die der Texterkennung. Bei mehrspaltigen Seiten kann eine Auswahl über die Spalten hinweg mehr Wörter erfassen als gemeint. |
| N6 | Der markierte Text wird auf 600 Zeichen und 60 Zeilen begrenzt. |

### Offen
- Der Server schützt Anmerkungen und Antworten nicht je Person: Ein Autor kann fremde Einträge ändern oder löschen, und der Name am Eintrag kommt aus dem Browser. Freigegebene Versionen sind davon nicht betroffen.

## 0.11.2 – 21.11.2026

### Geändert
- **Nur noch eine Texterkennung im Programm:** Die Lage jedes Wortes aus der neuen Texterkennung ist gespeichert (`daten/lagen/`, je gescanntem PDF eine Datei, zusammen 5 MB). Für die neu erkannten Seiten nutzt das Programm überall diese Lagen statt der alten Textebene im PDF:
  - **Markierung im Text → Scan** trifft jetzt jedes Wort des angezeigten Textes.
  - **Hybridansicht** legt den neuen Text über den Scan, also denselben wie in der Textspalte.
  - **«Tabelle übernehmen»** und **«Änderung im Scan vorschlagen»** lesen den neuen Text im eingerahmten Bereich.
- Die Texterkennung lief dafür noch einmal über alle Scans. Text, Tabellen und Skizzen sind auf allen 820 Seiten gleich geblieben; nur die Wortlagen kamen dazu.
- Die Original-PDF sind unverändert. Ihre alte Textebene wird nur noch für digital entstandene PDF gebraucht (dort ist sie der richtige Text) und als Ersatz, wenn `daten/lagen/` fehlt.

### Zu bestätigen
- Annahme M1 aus 0.11.1 entfällt. Bleibt: Von Hand berichtigte Wörter (OCR-Korrekturen) haben keine eigene Lage; die Markierung findet sie im Scan nur, wenn das ursprünglich gelesene Wort ähnlich beginnt.

## 0.11.1 – 21.11.2026

### Neu
- **Vergleichen über das ganze Fenster:** In der Bearbeitung öffnet «Vergleichen: ganze Seite» das Original links und den Text rechts über das ganze Fenster. Beide Blätter haben immer dieselbe Grösse. «Ganze Seite» zeigt die Seite vollständig, «Seitenbreite» füllt die Breite; Zoom mit − und + oder Ctrl und Mausrad gilt für beide Seiten zugleich. «Gleich scrollen» führt die andere Seite mit. «Seite als verglichen markieren», «Norm freigeben» und «Text bearbeiten» sind dort erreichbar; Esc beendet den Vergleich.
- **Markierung zeigt die Stelle im Original:** Ein im Text markiertes Wort (oder mehrere) wird im Scan hervorgehoben, in der normalen Bearbeitung und im Vergleich, auch beim Bearbeiten im Textfeld. Kommt das Wort mehrfach vor, sind alle Stellen gelb und die entsprechende Stelle orange.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| M1 | Die Lage der Wörter im Scan stammt aus der Textebene des Original-PDF, also aus der früheren Texterkennung. Wo diese ein Wort anders gelesen hat als die neue, wird die Stelle nicht gefunden. |
| M2 | Der Text rechts ist im Vergleich im selben Massstab wie die Seite gesetzt. Bei «Ganze Seite» ist er deshalb klein; zum Lesen vergrössern. |
| M3 | Markieren im Scan hebt die Stelle im Text nicht hervor (nur Text → Scan). |

## 0.11.0 – 21.11.2026

Mehrnutzerbetrieb mit Anmeldung und Rollen, Freigabe direkt beim Vergleichen, echte Word-Datei.

### Neu
- **Mehrnutzerbetrieb:** `node werkzeuge/mehrnutzer.js` startet einen kleinen Server für das Firmennetz. Er braucht nur Node.js, keine Datenbank und keine weiteren Pakete. Die Bibliothek bleibt derselbe Ordner; der Betrieb ohne Server (Ordner verbinden) geht unverändert weiter.
  - **Anmeldung** mit Name und Passwort. Daten und PDF gibt der Server nur an angemeldete Benutzer aus.
  - **Rollen:** Gast (lesen), Autor (bearbeiten, speichern, zur Prüfung einreichen), Prüfer (zusätzlich Erstfreigabe, Rückgabe, Versionen freigeben), Admin (zusätzlich Benutzer verwalten, Sperre aufheben).
  - **Der Server setzt die Rollen durch**, nicht nur die Oberfläche: Er lehnt einen gespeicherten Stand ab, in dem ein Autor freigibt oder eine Version anlegt, in dem eine freigegebene Version geändert oder der Verlauf gekürzt oder umgeschrieben ist. Der Name im Verlauf kommt aus der Anmeldung.
  - **Bearbeitungssperre:** Es bearbeitet immer nur eine Person. Wer «Bearbeiten» wählt oder eine Änderung beginnt, hält die Bearbeitung; alle anderen lesen, sehen im Kopf, wer bearbeitet, und bekommen gespeicherte Stände von selbst. Die Sperre endet mit «Bearbeitung beenden», beim Abmelden oder nach zehn Minuten ohne Eingabe (ohne ungesicherte Änderungen).
  - **Benutzerverwaltung** für den Admin: anlegen, Rolle ändern, Passwort neu setzen, sperren. Wer ein vom Admin gesetztes Passwort hat, wird beim Anmelden aufgefordert, ein eigenes zu wählen.
  - **Schutz:** Passwörter als scrypt-Hash mit Salz, Sitzungs-Cookie HttpOnly und SameSite=Strict, Pause nach fünf Fehlversuchen, schreibende Aufrufe nur von derselben Herkunft, neue PDF nur nach `pdf/eigene/` und ohne Überschreiben.
  - **Sicherung:** Mit `--git` legt der Server nach jedem Speichern einen Commit mit dem Namen des Benutzers an.
- **Freigabe beim Vergleichen:** In der Bearbeitung steht neben «Seite als verglichen markieren» der Knopf «Norm freigeben». Er erscheint nur für Prüfer und erteilt die Erstfreigabe aus jedem Status direkt; die Norm muss nicht zuerst eingereicht sein. Ohne Server gilt das für die Namen der Prüferliste.
- **Word-Datei als echtes .docx:** Überschriften, Absätze, markierte Änderungen, Tabellen und Skizzen. Geprüft durch Öffnen und Umwandeln in LibreOffice; in Microsoft Word selbst konnte ich sie nicht öffnen. Die bisherige .doc-Datei mit Bildern liess sich in LibreOffice nicht lesen und ist ersetzt.

### Prüflauf
- `node test/mehrnutzer.js`: Schnittstelle (Anmeldung, Rollen, Sperre, veralteter Stand, unveränderliche Versionen und Verlauf, Fehlversuche) und Ablauf im Browser mit vier Benutzern: Autorin reicht ein, Prüfer vergleicht und gibt frei, Gast kann nichts ändern, Admin verwaltet Benutzer.
- `node test/test.js`: ohne Fehler, Word-Datei jetzt als .docx geprüft.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| L1 | Anmeldung mit eigenen Passwörtern. Eine Anbindung an das Firmenkonto (Microsoft, LDAP) ist nicht gebaut. |
| L2 | Vier Rollen: Gast, Autor, Prüfer, Admin. Prüfer und Admin dürfen auch bearbeiten. |
| L3 | Ein Prüfer darf eigene Korrekturen freigeben; der Verlauf vermerkt das als «Selbstprüfung». Ein erzwungenes Vier-Augen-Prinzip ist nicht eingebaut. |
| L4 | Eine Person bearbeitet gleichzeitig. Gleichzeitiges Bearbeiten verschiedener Normen ist nicht möglich, weil der Bearbeitungsstand eine Datei ist. |
| L5 | Verschlüsselung (HTTPS) übernimmt ein vorgeschalteter Proxy der Firma; dann mit `--sicher` starten. Ohne HTTPS gehen Passwörter unverschlüsselt durchs Netz. |
| L6 | Sitzungen liegen im Arbeitsspeicher: Nach einem Neustart des Servers melden sich alle neu an. |
| L7 | Der Admin kann eine fremde Sperre aufheben; ungesicherte Änderungen der anderen Person gehen dabei verloren. |

### Nicht umgesetzt
- **Vollständiger Vergleich aller 721 gescannten Seiten mit dem Original.** Das ist die Aufgabe der Prüfer; die Werkzeuge dafür sind da (unsichere Stellen, «Seite verglichen», «Norm freigeben»).
- **ANDAIR-Farben und Logo:** Die Vorgaben fehlen weiterhin; die Website liess sich von hier nicht abrufen.
- **Entscheid 125 oder 150 Pa** (ÜV/ESV 75/150): liegt bei ANDAIR.
- Tabellen und Skizzen in digital entstandenen PDF automatisch erkennen; Zellen verbinden im Tabelleneditor.

## 0.10.0 – 21.11.2026

Die gescannten Normen sind neu eingelesen. Tabellen und Skizzen stehen jetzt als eigene Elemente im Text.

### Neu
- **Neue Texterkennung für alle gescannten Seiten:** 721 Seiten mit Text aus 15 PDF (TWP 1984, TWE 1994, TWS 1982, TWO 1977, TPH-01, TPH-02, Beilagen zu TPH-15 und -16, Präzisierung 2011, Merkblatt ST-88, drei Merkblätter 2000 und weitere). Werkzeug: `werkzeuge/ocr.py` mit Tesseract 5, Modell «deu» aus tessdata_best, 300 dpi. Die Original-PDF werden nur gelesen. Mittlere Sicherheit der Erkennung je Norm: 87,5 bis 93,1 von 100.
  - Rasterflächen und Punktlinien werden vor dem Lesen entfernt.
  - Ein zweiter Durchgang liest Schrift nach, die der erste ausgelassen hat.
  - m² und m³ werden einzeln nachgelesen; Aufzählungspunkte, Trennstriche und Absätze werden wiederhergestellt.
  - Die drei Merkblätter von 2000, deren Überschriften im PDF nicht als Text lesbar waren, sind vollständig über die Texterkennung gelesen.
- **Tabellen und Skizzen als Elemente:** 711 Tabellen und 813 Bildausschnitte sind automatisch erkannt und vom Lauftext getrennt.
  - Tabellen mit Linien, Tabellen ohne Linien und die Listen «Bezeichnung: Angabe» der TWO 1977 sind echte Tabellen mit Zeilen und Spalten.
  - Skizzen sind Ausschnitte aus dem Original-PDF. Sie werden beim Anzeigen aus dem PDF gezeichnet; es gibt keine Bildkopien.
  - Gesetzte Formeln (105 Blöcke) und Tabellen, die nicht sauber lesbar waren (25), erscheinen als Bild aus dem Original statt als fehlerhafte Abschrift.
  - 66 Seiten mit einer seitenfüllenden, oft quer gesetzten Zeichnung sind eine einzige Skizze mit Seitenzahl und Bildtitel.
  - 23 Seiten, die die Texterkennung nicht sauber liest (Formelrechnungen im Anhang der TWO, Tabellen auf Raster, Kurvenblätter), erscheinen ganz als Bild. Der gelesene Text bleibt für die Suche erhalten.
  - Im Text steht je Element eine Marke wie `[[Tabelle 64.1]]` oder `[[Skizze 38.1]]`. Sie lässt sich beim Bearbeiten verschieben.
- **Übernahme von Hand:** In der Bearbeitung «Tabelle übernehmen» oder «Skizze übernehmen» wählen und den Bereich im Scan einrahmen. Bei Tabellen schlägt das Programm Zeilen und Spalten aus dem Text des PDF vor.
- **Tabelleneditor:** Zellen bearbeiten, Zeilen und Spalten anfügen oder entfernen, Kopfzeile ein und aus, Titel. Der Ausschnitt aus dem Original steht zum Vergleich darüber.
- **Je Element:** «Bearbeiten», «Als Bild zeigen» bzw. «Als Tabelle erfassen», «Entfernen». Die Knöpfe erscheinen beim Zeigen auf das Element oder mit der Tabulatortaste.
- **Versioniert:** Übernahmen und Änderungen an erkannten Elementen sind eine eigene Liste (`uebernahmen`), stehen unter «Änderungen» und werden wie alles andere freigegeben.
- **Unsicher gelesene Stellen:** 2296 Stellen auf 503 Seiten sind gelb markiert, bis die Seite als verglichen markiert ist. Markiert wird, was die Texterkennung mit geringer Sicherheit gelesen hat, und jede Zahl, die die frühere Erkennung im PDF anders gelesen hatte.
- **Suche, Index, Druck, Word:** Der Inhalt der Tabellen und die Beschriftungen der Skizzen sind in Volltextsuche und Index. Druck und Word-Datei enthalten Tabellen und Skizzen.

### Kontrolle
- Automatisch je Seite: Sicherheit der Erkennung, Anteil nicht gelesener Schrift, Abgleich aller Zahlen mit der früheren Erkennung. Ergebnis je PDF in `daten/ocr/bericht.json`.
- Von Hand gegen das Seitenbild verglichen: vier Seiten vollständig (TWP 1984 S. 49, TWE 1994 S. 20, TWS 1982 S. 52, TWO 1977 S. 196), Teile von TWP 1984 S. 38 und 64, dazu die Lage der Elemente auf rund 25 Seiten. Das sind Stichproben; die übrigen Seiten hat nur die automatische Kontrolle gesehen. Fliesstext und Zahlenwerte stimmten. Gefundene Fehlerarten sind unten genannt; drei Einzelfehler sind berichtigt (⅔ statt «24» in TWP 3.15, ≥135 m² statt «2135 m²», «Variante 1» statt «Variante 7»).
- Alle 74 Normen bleiben «Ungeprüft». Die Kontrolle ersetzt den Vergleich durch einen Prüfer nicht.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| K1 | Der neu erkannte Text ersetzt den bisherigen Grundtext der gescannten Seiten. Es gab noch keine OCR-Korrekturen von Hand; die frühere Erkennung bleibt als Textebene im Original-PDF und in der Git-Historie. |
| K2 | Im Zweifel Bild statt Abschrift: Unsichere Tabellen, Formeln und schlecht lesbare Seiten werden als Ausschnitt aus dem Original gezeigt. Wer die Tabelle als Text braucht, erfasst sie über «Als Tabelle erfassen». |
| K3 | Sichere Berichtigungen ohne Rückfrage: «{» und «}» zu Klammern, «@» vor einer Zahl zu «Ø», «mh» nach einer Zahl zu «m³/h», «UV» zu «ÜV» (ausser «UV-»), Umlaute bei Wörtern, die es ohne Umlaut in den digital entstandenen Normen nicht gibt (63 Stellen, z. B. Beluftung, Oltank). Die Stellen mit «m³/h», «ÜV» und berichtigtem Umlaut sind als unsicher markiert. |
| K4 | Die gedruckte Seitenzahl bleibt als erste Zeile im Text der Seite stehen. |
| K5 | Skizzen werden mit dem PDF mitgeführt, nicht als Bilddatei gespeichert. Ohne das PDF in der Ablage erscheint ein Hinweis statt der Skizze. |
| K6 | Einzelne Ziffern werden nicht als unsicher markiert, weil sonst jede gleiche Ziffer der Seite markiert würde. |
| K7 | Die Daten der Texterkennung je PDF liegen in `daten/ocr/` (4 MB). Die Ersterfassung übernimmt sie; das Programm selbst lädt sie nicht. |

### Bekannte Fehlerarten im erkannten Text
- **Bruchzeichen und Sonderzeichen:** ⅔, ≥, Tiefstellungen (b_min) und Fussnotenziffern werden oft falsch gelesen und nicht immer als unsicher erkannt.
- **Kursive Bildtitel:** einzelne Ziffern können falsch sein.
- **Mehrzeilige Zellen und Kopfzeilen über mehrere Spalten** sind in automatisch erkannten Tabellen teils auf mehrere Zeilen verteilt oder der ersten Spalte zugeordnet.
- **Beschriftungen in Skizzen** sind nur für die Suche gelesen und lückenhaft.
- **Titelblätter** mit grosser Schrift und Signet sind teils als Skizze erfasst.
- **Vereinzelt** steht ein Störzeichen als Aufzählungsstrich am Zeilenanfang und teilt eine Liste.
- **Glossar:** 511 statt 518 Einträge. 13 Einträge aus dem Lauftext sind entfallen, weil die Stelle jetzt in einem Bild liegt (u. a. TPH-01 und TPH-02); wenige neue kamen dazu.

### Nicht umgesetzt
- **Tabellen und Skizzen in den digital entstandenen PDF** werden nicht automatisch erkannt; die Übernahme von Hand geht bei jedem PDF.
- **Texterkennung im Programm:** Sie läuft als Werkzeug ausserhalb (`werkzeuge/ocr.py`), nicht im Browser.
- **Zellen verbinden** im Tabelleneditor.
- **ANDAIR-Farben und Logo:** weiterhin offen, die Vorgaben fehlen.

## 0.9.0 – 21.11.2026

Abschied von der Einzeldatei. Die Bibliothek ist jetzt ein Ordner (dieses Repo) mit Programm, Daten und Original-PDF nebeneinander.

### Neu
- **Aufbau als Ordner:** `index.html`, `app.js`, `style.css`, `lib/`, `daten/` (drei JSON-Dateien) und `pdf/` (99 Original-PDF). Das Programm lädt in unter einer Sekunde; ein PDF wird erst geholt, wenn man es öffnet.
- **Speichern in den Ordner:** In Edge oder Chrome den Ordner des Repos verbinden; „Speichern“ schreibt `daten/*.json` und neu hinzugefügte PDF nach `pdf/eigene/`. Gesichert und versioniert wird zusätzlich mit Git.
- **Nur lesen über Webserver:** `node werkzeuge/server.js` oder GitHub Pages. Ohne verbundenen Ordner ist die Bibliothek schreibgeschützt.
- **PDF-Anzeige ohne Worker:** Der Fehler „Setting up fake worker failed“ aus der Chat-Vorschau ist behoben; der Zeichenbaustein läuft im Hauptfenster.
- **Glossar:** 518 Einträge. 194 stammen aus den Abkürzungsverzeichnissen von AW 2025, AW KGSR 2025, Konzept Schutzbauten 2023, TSp-21, TWE 1994 (Anhang D) und TWP 1984 (A2); 324 sind aus dem Lauftext aller Normen erkannt (Muster „Explosionsschutzventil (ESV)“). Jede Bedeutung nennt Norm und Seite. Erfassen, bearbeiten, am Original prüfen, zurückziehen; alles versioniert.
- **Index über alle Normen:** Jeder Glossarbegriff mit allen Fundstellen je PDF und Seite, dazu ein Sachregister aus den Überschriften aller Normen.
- **Volltextsuche über alle Seiten:** Die Suche läuft über den Seitentext aller 2378 Seiten samt OCR-Korrekturen und springt auf die Seite.
- **Prüfstatus und Erstfreigabe:** Jede Norm mit PDF hat einen Status der digitalen Fassung: Ungeprüft, In Bearbeitung, Zur Prüfung, Korrektur erforderlich, Freigegeben.
  - Alle 74 Normen mit PDF beginnen als „Ungeprüft“ und sind auf Karte, Norm-Kopf, Druck, Word und PDF-Export so gekennzeichnet.
  - Die erste OCR- oder Formatkorrektur setzt „In Bearbeitung“.
  - Seiten lassen sich einzeln als „mit dem Original verglichen“ markieren.
  - Freigeben darf nur, wer in der Prüferliste steht (unter „Daten“), mit ausdrücklicher Bestätigung. Prüfer und Datum bleiben an der Norm.
  - Die Erstfreigabe erzeugt automatisch eine Version mit dem PDF, den OCR-Korrekturen und den Formatänderungen dieser Norm. Fachliche Änderungen und Regeln gehören nicht dazu.
  - Neue Ansicht „Prüfungen“ mit allen Normen, ihrem Status, verglichenen Seiten, Seiten ohne Text und Korrekturen.
- **Logo und Farben:** `marke/farben.css` nimmt die Hausfarben und ein Logo auf.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| J1 | Bearbeitet wird in einem lokalen Klon des Repos; der Ordner wird im Browser verbunden. Mehrere Personen arbeiten nacheinander, Git führt zusammen. Eine Sperre gegen gleichzeitiges Bearbeiten gibt es nicht. |
| J2 | Der Bearbeitungsstand ist in drei Dateien geteilt: `bibliothek.json` (lesbar eingerückt, für Git-Vergleiche), `texte.json` (Seitentexte, Abschnitte, Struktur), `titelbilder.json`. |
| J3 | Die Prüferliste ist eine Namensliste, kein Zugriffsschutz. Wer seinen Namen ändert, umgeht sie. Reicht dieselbe Person ein und gibt frei, steht im Verlauf „Selbstprüfung“. |
| J4 | Die Erstfreigabe verlangt nicht, dass alle Seiten als verglichen markiert sind; der Stand („12 von 79 Seiten“) wird angezeigt und festgehalten. |
| J5 | Der bisherige Status je Norm (Änderungen offen, Zu bestätigen) ist durch den Prüfstatus ersetzt; offene Änderungen stehen daneben. |
| J6 | Glossareinträge aus dem Lauftext sind automatisch erkannt und nicht durchgesehen; sie tragen „aus dem Lauftext erkannt“ und „zu bestätigen“. Einzelne Fehltreffer sind zu erwarten. |
| J7 | Die Listen von TWP 1984 und TWE 1994 sind aus dem OCR-Text von Hand übertragen. In der TWP fehlt im OCR die Abkürzung zu „Schleuse“; „S“ ist ergänzt. |
| J8 | Der Index zählt einen Begriff nur als ganzes Wort und mit Gross- und Kleinschreibung. Zweibuchstabige Abkürzungen treffen auch zufällige Buchstabenpaare im OCR-Text. |
| J9 | Die Kapiteldateien des BABS zu TWS 1982 und TWO 1977 liegen unter `pdf/2_Technische_Weisungen/kapiteldateien/`; die Bibliothek verwendet die zusammengefügten PDF. |

### Nicht umgesetzt
- **ANDAIR-Farben und Logo:** Die Vorgaben liegen mir nicht vor. `marke/farben.css` ist vorbereitet; es braucht die Logo-Datei und die Farbwerte.
- **Automatische Texterkennung** für PDF ohne Text und ein **KI-Modell** für die Struktur: weiterhin nicht vorhanden. Die Prüfungsübersicht zeigt, wie viele Seiten keinen Text haben.
- **Einlesen von Word-Dateien.**
- **Rollen mit Anmeldung** (Gast, Autor, Prüfer, Admin): braucht einen Server.
- Die Glossarbegriffe sind im Text noch nicht mit ihrer Bedeutung hinterlegt (Tooltip).

### Offene Punkte
- GitHub warnt bei `TWO_1977_Kap1-4.pdf` (57 MB) vor grossen Dateien; die Grenze liegt bei 100 MB.
- Die Einzeldatei-Tests (`test.js`, `test_pdf.js`, `test_klein.js`) sind durch `test/test.js` ersetzt. Der Fall „Kanton und Hersteller regeln dasselbe“ ist dort nicht mehr abgedeckt.
- Wer Inhalte in einer früheren Einzeldatei erfasst hat, übernimmt sie über „Daten“ → Datensicherung.

### Geprüft
`node test/test.js` gegen das ganze Repo: Laden über den Webserver, Ordner verbinden, Bibliothek mit 77 Karten, Bearbeitung der TWP (OCR-Korrektur, fachliche Änderung, Formatvorlage, Hybrid, Änderung im Scan), Druck, Word, PDF-Export, Protokoll, Teilfreigabe, Verwerfen, Vergleich, Prüfstatus bis zur Erstfreigabe (mit und ohne Eintrag in der Prüferliste), Glossar, Index, Volltextsuche, neues PDF hinzufügen, Speichern in den Ordner und erneutes Laden, schmale Ansicht, Startschirm ohne Webserver.

## 0.8.0 – 21.11.2026

Format- und Strukturerkennung aus dem Auftrag „KI-gestützte Format- und Strukturerkennung“, soweit sie in einer Datei ohne Server geht.

### Neu
- **Struktur aus dem Layout:** Beim Hinzufügen eines PDF werden aus Schriftgrösse, Nummerierung und Lage der Zeilen erkannt: Normtitel, Überschriften in drei Stufen (auch Dezimalgliederung wie 2.2 → 2.21), Anhänge, Tabellentitel, Bildbeschriftungen, Fussnoten, Aufzählungen und Formeln. Für die 97 eingebetteten PDF ist das beim Bauen geschehen.
- **Inhaltsverzeichnis:** In der Bearbeitung öffnet „Inhalt“ die Kapitelnavigation; ein Klick springt auf die Seite.
- **Formatvorlagen je Norm:** Aus den erkannten Schriftgrössen entsteht je PDF ein Satz Vorlagen (Reiter „Angaben“). Der Seitentext wird damit dargestellt, auch im Druck und in der Word-Ausgabe.
- **Zuweisen von Hand:** Im Bearbeitungsmodus weist „Formatvorlage der Zeile“ der Zeile unter dem Cursor eine Vorlage zu. Das ist eine eigene Änderungsart „Formatänderung“, getrennt von OCR-Korrektur und fachlicher Änderung, mit Freigabe, Verwerfen, Vergleich und Protokoll.
- **Neu erkennen:** „Struktur neu erkennen“ wertet das Layout erneut aus. Zuweisungen von Hand bleiben erhalten.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| I1 | Es ist **kein KI-Modell** eingebaut. Die Erkennung arbeitet mit festen Regeln (Schriftgrösse, Nummernmuster, Lage). Ein lokales Sprach- oder Layoutmodell passt nicht in eine einzelne Datei ohne Installation. |
| I2 | Schriftart, Fett/Kursiv, Abstände und Einzüge des Originals werden nicht ausgewertet; nur die Schriftgrösse. |
| I3 | Die Formatvorlage hängt am Text der Zeile (und bei Überschriften an der Kapitelnummer), nicht an einer Position. |
| I4 | Die Erkennung ändert nie den Text. Sie zeichnet nur Zeilen aus. |

### Offene Punkte
- **Scans:** Bei gescannten Normen stammen Schriftgrössen aus der OCR-Textebene und sind ungenau. TWS 1982 Kap. 3 liefert nur zwei Überschriften; bei der TWP 1984 stehen einzelne Zeilen des gedruckten Inhaltsverzeichnisses doppelt in der Navigation.
- **Tabellen** werden nur am Titel („Tabelle 3.1-3 …“) erkannt, nicht als Zeilen und Spalten.
- **Word-Dateien** lassen sich nicht einlesen, nur PDF.
- Eigene Formatvorlagen anlegen und Vorlagen bearbeiten (Grösse, Farbe) geht noch nicht.

## 0.7.0 – 21.11.2026

Die Punkte aus dem Auftrag „Professionelle Bearbeitungswerkzeuge, OCR-Funktionen und Hybridansicht“, die mit einer Datei und einem Nutzer gehen.

### Neu
- **Änderung im Scan vorschlagen:** Stelle im Original einrahmen; das Fenster nimmt Originalinhalt (aus dem PDF vorbefüllt), vorgeschlagene Änderung, Änderungsart und Begründung auf. Der Vorschlag hängt an der Scanposition, steht in der Änderungsliste und lässt sich mit „In den Text übernehmen“ einsetzen, wenn der Originalinhalt genau einmal auf der Seite steht.
- **Änderungsart automatisch vorgeschlagen:** Verwechslungen wie O/0, l/1, rn/m gelten als OCR-Korrektur, geänderte Zahlen als fachliche Änderung. Beim Speichern im Grundtext warnt das Programm, wenn eine Stelle fachlich aussieht. Der Autor entscheidet.
- **Hybrid als Überlagerung:** Im Original lässt sich zwischen „Scan“ und „Hybrid“ wechseln. Hybrid legt den erkannten Text positionsgenau über den Scan, mit Deckkraftregler 0–100 % und Schaltern für Scan, Text und Markierungen. Der Text ist dort markierbar.
- **Editor:** Rückgängig, Wiederholen, Sonderzeichen (Ø ± ≤ ≥ µ ° ² ³ × …), Suchen und Ersetzen. Ungesicherte Entwürfe lösen beim Schliessen eine Rückfrage aus.
- **Auswahl freigeben:** In „Änderungen“ hat jeder Eintrag ein Häkchen. Freigegeben wird nur die Auswahl; der Rest bleibt offen. Abhängige Einträge (z. B. die neue Norm zu einer Regel) kommen automatisch dazu.
- **Verwerfen:** Ein offener Eintrag lässt sich mit Begründung auf den Stand der letzten Version zurücksetzen.
- **Versionen vergleichen:** Unter „Versionen und Verlauf“ zwei Stände wählen (jede Version oder der aktuelle Stand); gezeigt wird, was neu, geändert oder entfernt ist, samt markierten Seitentexten.
- **Ausgabe:** Änderungsprotokoll für Excel (CSV) je Norm und gesamt; Word-Datei (.doc) zum Weiterbearbeiten; Seitenauswahl bei Druck, Word und PDF-Export; Kommentare im Protokoll ein- oder ausblendbar; nicht freigegebene Stände tragen „ENTWURF“.
- Die Textansichten heissen jetzt „Grundtext“, „Mit Änderungen“ und „Neu“ (bisher Original, Hybrid, Neu).

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| H1 | „Hybrid“ meint die Überlagerung von Scan und erkanntem Text (ersetzt G1). |
| H2 | Die Überlagerung zeigt den Text, wie er im PDF steckt. OCR-Korrekturen und fachliche Änderungen stehen in der Textspalte, nicht in der Überlagerung. |
| H3 | Fachliche Änderungen behalten Grün für Ergänzung und Rot für Löschung; ein eigenes Gelb gibt es nicht, weil jede Änderung aus Löschung und Ergänzung besteht. |
| H4 | „Excel“ ist eine CSV-Datei mit Strichpunkt, „Word“ eine .doc-Datei im HTML-Format. Beide öffnen sich in Excel bzw. Word, sind aber kein .xlsx bzw. .docx. |
| H5 | Eine Teilfreigabe erzeugt eine vollständige Version, in der die nicht gewählten Einträge auf ihrem bisherigen Stand stehen. |

### Nicht umgesetzt aus dem Auftrag
- **Braucht einen Server:** Rollen (Gast, Autor, Prüfer, Admin), Prüfer und Prüfdatum, serverseitige Rechte, Konflikte bei mehreren Autoren.
- **Eigener grosser Schritt:** Tabellen bearbeiten, Bilder einfügen, Hoch- und Tiefstellen als Formatierung, Formeleditor, Querverweise.
- **Bewusst weggelassen:** Schriftart, Schriftfarbe, Seitenränder, Kopf- und Fusszeilen. Das Layout ist das Original-PDF.
- **Keine Texterkennung:** OCR für einen Bereich neu ausführen und unsichere Ergebnisse kennzeichnen. Das Programm liest nur den Text, der schon im PDF steckt.
- **PDF/A** und der Vergleich zweier Fassungen als PDF.

### Offene Punkte
- **Push ins Repo heududa/Claude_Shelter** weiterhin nicht möglich (kein Repo-Zugriff in dieser Sitzung).
- Drehen der Seiten wird nicht unterstützt.
- Rückgängig im Texteditor geht nach einem Seitenwechsel oder Speichern nicht über diesen Punkt zurück.

### Geprüft
`node test_klein.js` mit der Testdatei: zusätzlich Inhaltsverzeichnis und Formatvorlagen, Zuweisung von Hand, Hybrid-Überlagerung mit Regler, Änderung im Scan (Text aus dem Rechteck, Art automatisch, Übernahme in den Text), Sonderzeichen, Suchen und Ersetzen, Warnung bei Zahlenänderung im Grundtext, Protokoll als CSV, Word-Datei mit Seitenauswahl und Entwurf-Vermerk, Teilfreigabe, Verwerfen, Vergleich zweier Versionen. `node test.js` und `node test_pdf.js testdaten` laufen mit der vollen Datei.

## 0.6.0 – 21.11.2026

Neue Oberfläche nach den beiden Entwürfen (Startseite und Bearbeitung), dazu Drucken, PDF-Export und die Hybrid-Ansicht.

### Neu
- **Bibliothek (Startseite):** dunkle Seitenleiste nach Aufgaben (Bibliothek, Änderungen, Geltende Fassung, Versionen und Verlauf) und Herausgebern. Karten mit echtem Titelblatt, Gruppe, Seitenzahl und Status je Norm (Änderungen offen, Zu bestätigen, Freigegeben, Ohne Inhalt). Filter nach Nummer/Titel, Gruppe, Status und Herausgeber; Umschaltung Karten/Liste. Rechts die offenen Änderungen.
- **Ansicht „Änderungen“:** alles, was seit der letzten Version neu, geändert oder entfernt ist, je Norm, mit Sprung an die Stelle.
- **Bearbeitung in drei Spalten:** links die Originalseite (unverändert), in der Mitte der Text derselben Seite, rechts die Änderungen mit Alt, Neu und Begründung.
  - **OCR-Korrektur:** berichtigt den Grundtext (Lesefehler). Gehört zur Norm.
  - **Fachliche Änderung:** wird in der gewählten Schicht (z. B. ANDAIR 2026) gespeichert, nie in der Norm. Auswahl „Ich bearbeite“.
  - Jede Änderung braucht eine Begründung, trägt Name und Datum, ist zuerst „nicht freigegeben“ und wird mit der Freigabe Teil der Version.
  - **Verbindung zur Regel:** Eine fachliche Änderung nennt die betroffene Regel. Die Karte zeigt, ob der Regelwert in der Schicht schon angepasst ist; „Regelwert anpassen“ legt den Eintrag in der Schicht an. Ohne Regel steht der Hinweis „wirkt nicht auf die Auslegung“.
  - Ändert sich der Grundtext nach einer fachlichen Änderung, erscheint „Grundtext geändert – prüfen“.
  - Kommentare auf dem Original (Rechteck oder ganze Seite) stehen in derselben Liste.
- **Hybrid-Ansicht:** Umschaltung des Textes zwischen Original (Grundtext aus dem PDF), Hybrid (Original mit farbig markierten Änderungen: Ergänzung, Löschung, OCR-Korrektur) und Neu (geltender Text ohne Markierungen).
- **Drucken:** diese Seite oder ganze Norm, in der Ansicht Original, Hybrid oder Neu, wahlweise mit Änderungsverzeichnis. Im Druckdialog des Browsers lässt sich auch „Als PDF speichern“ wählen.
- **PDF exportieren:** erzeugt ein PDF aus den unveränderten Originalseiten, mit Deckblatt und Änderungsverzeichnis, einem eingefügten Änderungsblatt nach jeder Seite mit Änderungen und Rahmen um kommentierte Stellen. Eingebaut mit pdf-lib 1.17.1 (MIT), ohne Netz.
- **Reiter je Norm:** Bearbeitung, Ganze Norm, Regeln, Originaltext, Änderungsprotokoll, Angaben.
- Der Seitentext wird beim Hinzufügen eines PDF gelesen und zu Absätzen gefügt; ältere Dateien lesen ihn auf Knopfdruck nach.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| G1 | „Hybride Sichtweise“ ist als Textansicht verstanden, die Original und Änderungen zusammen zeigt (am Bildschirm, im Druck und als eingefügte Änderungsblätter im PDF-Export). |
| G2 | Aus den Entwürfen nicht übernommen, weil es dafür keine Funktion gibt: Prüfungen, Benutzerverwaltung, Rolle, „Zur Prüfung einreichen“, Version je Norm. Der Status je Norm ist aus dem abgeleitet, was die Bibliothek weiss. |
| G3 | Eine Textänderung speichert den ganzen Seitentext vorher und nachher; Alt und Neu werden daraus wortweise berechnet. Eine Begründung gilt für alle Stellen eines Speichervorgangs. |
| G4 | Zurückziehen oder löschen lässt sich nur die jeweils letzte Änderung einer Seite und Ebene, damit die Kette stimmt. |
| G5 | Der bearbeitbare Text ist reiner Text: keine Tabellen, keine Formatierung. Tabellen aus dem PDF erscheinen als Zeilen. |
| G6 | Beim Zusammenfügen der Zeilen fallen Trennstriche am Zeilenende weg (ausser vor „und“, „oder“, „bzw.“). Das kann einzelne Wörter falsch verbinden und ist dann als OCR-Korrektur zu berichtigen. |
| G7 | Der PDF-Export enthält auch nicht freigegebene Änderungen und kennzeichnet sie. Zurückgezogene fehlen. |
| G8 | Der Reiter „Originaltext“ (in Abschnitte geteilt) bleibt neben der seitenweisen Bearbeitung bestehen und zeigt den unkorrigierten Text. |

### Offene Punkte
- **Push ins Repo heududa/Claude_Shelter** weiterhin nicht möglich (kein Repo-Zugriff in dieser Sitzung).
- Fachliche Textänderungen wirken nicht auf die geltende Fassung und den Regelwerk-Export; massgebend bleibt dort der Eintrag in der Schicht.
- Die Suche findet Textänderungen noch nicht, und sie durchsucht den unkorrigierten Originaltext.
- Im PDF-Export sitzen Rahmen bei gedrehten Seiten falsch; Zeichen ausserhalb des westeuropäischen Zeichensatzes werden auf den Änderungsblättern als „?“ geschrieben.
- Kein Vergleich zweier Versionen, kein Tabelleneditor, keine Antworten auf Kommentare.
- Die volle Datei ist weiterhin rund 197 MB gross.

### Geprüft
`node test_klein.js` mit der Testdatei: Bibliothek (Filter, Liste, Herausgeber, Änderungen), OCR-Korrektur und fachliche Änderung auf TWP Seite 64 (125 Pa → 150 Pa als ANDAIR, mit Regel), die drei Ansichten, Regelwert anpassen, „Grundtext geändert – prüfen“, Kommentar, Drucken (79 Seiten mit Markierungen und Verzeichnis), PDF-Export (81 Seiten, Änderungsblatt nach Seite 64), Freigabe, Speichern und Wiederöffnen, schmale Ansicht. `node test.js` und `node test_pdf.js testdaten` laufen mit der vollen Datei.

## 0.5.0 – 21.11.2026

### Neu
- **Startseite mit Titelblättern:** Jede Norm erscheint als Karte mit der ersten Seite ihres PDF, darunter Kurzbezeichnung, Titel, Seitenzahl, Anzahl Regeln und Anmerkungen. Gegliedert nach Herausgeber und Gruppe. Ein Klick öffnet die Norm im Original-PDF; Werke ohne PDF zeigen eine leere Karte und öffnen bei den Regeln.
- Das Titelbild wird beim Hinzufügen oder Ersetzen eines PDF erzeugt (260 px breit, JPEG) und in der Datei gespeichert. Ältere Dateien und Datensicherungen ohne Titelbilder holen sie beim Öffnen der Startseite nach.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| F1 | Bei Werken mit mehreren PDF zeigt die Karte das Titelblatt des ersten Teils. |
| F2 | Titelbilder sind nur Vorschau und nicht Teil der freigegebenen Versionen. |
| F3 | Die Zahlen und die Kurzanleitung stehen weiterhin auf der Startseite, jetzt unter den Karten. |

### Geprüft
`node test_klein.js` (Karten und Bilder, Nachholen fehlender Titelbilder, Klick öffnet PDF bzw. Regeln), dazu `node test_pdf.js testdaten` und `node test.js` mit der vollen Datei.

## 0.4.1 – 21.11.2026

### Neu
- **Testdatei** `Normenbibliothek_Test.html`, rund 9 MB, gebaut mit `node build.js --test`. Gleiches Programm wie die volle Datei, aber nur 15 Werke und 6 PDF:
  - mit PDF: TWP 1984 (79 Seiten), TWS 1982 nur Kap. 3 Freifeldschutzräume (21 Seiten), TPH-14, -15, -16, -17 (ohne Beilagen);
  - ohne PDF, mit Regeln: TWE 1994, TW Schock 2021, TPH-04, -06, -11;
  - ohne PDF, ohne Regeln: TWK 2017, TWP 1966, Altbestand vor 1967; dazu die Schicht ANDAIR 2026.
- Die volle Datei (`node build.js`, rund 196 MB, 77 Werke, 97 PDF) ist unverändert.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| E1 | 8 MB sind mit TWP und der ganzen TWS nicht erreichbar: TWP 1984 braucht eingebettet 5,1 MB, die ganze TWS 14,4 MB, das Programm 1,5 MB. Deshalb enthält die Testdatei von der TWS nur Kap. 3, zu dem die erfassten Regeln gehören. |
| E2 | Alle 73 Regeln bleiben in der Testdatei, damit geltende Fassung, Schichten und Export wie in der vollen Datei prüfbar sind. |

### Geprüft
`node test_klein.js`: TWP-PDF, Sprung von der Regel auf PDF-Seite 64, Anmerkung, TWS-PDF, Werk ohne PDF, Suche, geltende Fassung, Speichern und Wiederöffnen.

## 0.4.0 – 20.11.2026

Die in Kapitel aufgeteilten Normen sind zu je einem PDF zusammengefügt; Normen mit Anhängen lassen sich als Ganzes öffnen.

### Neu
- **TWS 1982 und TWO 1977 als je ein PDF:** Die fünf bzw. vier Kapiteldateien des BABS sind mit `zusammenfuegen.sh` (qpdf) in der Reihenfolge der Kapitel zusammengefügt. Seiten und Textebene sind unverändert, die Seiten zählen durchgehend.
  - TWS 1982, 148 Seiten: Kap. 1 ab Seite 1, Kap. 2 ab 13, Kap. 3 ab 100, Kap. 4 ab 121, Kap. 5.1 ab 138.
  - TWO 1977, 420 Seiten: Kap. 1 ab Seite 1, Kap. 2 ab 25, Kap. 3 ab 183, Kap. 4 ab 299.
- **Ansicht „Ganze Norm“:** Bei Werken, die weiterhin aus mehreren PDF bestehen (z. B. TWK 2017 mit Beispielen, TW Schock 2021 mit Anhang, TPH-15/16/17 mit Beilage), stehen alle Teile hintereinander und lassen sich in einem Zug lesen und kommentieren. Das ist die Vorgabe; die einzelnen Teile bleiben wählbar. Jede Anmerkung nennt ihren Teil.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| D1 | „Geteilte Normen“ sind die in Kapiteldateien gelieferten Normen TWS 1982 und TWO 1977. Anhänge, Beispiele und Beilagen sind eigene Dokumente und bleiben Teile des Werks (ersetzt C2 für TWS und TWO). |
| D2 | Das zusammengefügte PDF ist eine neue Datei mit eigener Prüfsumme; die Kapiteldateien des BABS bleiben im Ordner `quellen/` erhalten. |
| D3 | Reihenfolge der TWS-Kapitel nach Kapitelnummer. Das vom BABS überarbeitete Kap. 4 (gültig ab 01.01.2012) steht an seiner Stelle. |

### Offene Punkte
- **Push ins Repo heududa/Claude_Shelter** weiterhin nicht möglich (kein Repo-Zugriff in dieser Sitzung).
- Die elf erfassten Regeln aus TWS Kap. 3 und die fünf aus Kap. 2 tragen noch keine PDF-Seite.
- Übrige offene Punkte wie in 0.3.0.

### Geprüft
`node test_pdf.js testdaten` und `node test.js`: TWS 1982 mit 148 Seiten ohne Teilwahl, Sprung auf Seite 100 zeigt das Titelblatt von Kap. 3, TWO 1977 mit 420 Seiten, TWK 2017 als ganze Norm (226 Seiten, Anmerkung landet im richtigen Teil, Sprung aus der Suche), Speichern und Wiederöffnen ohne Verlust.

## 0.3.0 – 20.11.2026

Alle gelieferten Unterlagen des BABS liegen als Original-PDF in der Bibliothek: 97 PDF mit 2378 Seiten in 77 Werken. Eine Norm kann jetzt aus mehreren PDF bestehen.

### Neu
- **Mehrere PDF je Werk (Teile):** z. B. TWS 1982 mit fünf Kapiteln, TWO 1977 mit vier, TWK 2017 mit Weisungen und Beispielen, TW Schock 2021 mit Hauptdokument und Anhang, TPH-15/16/17 mit Beilage. Jeder Teil hat eigene Anmerkungen, Prüfsumme und Seitenzählung. Teile lassen sich hinzufügen, ersetzen und (ohne Anmerkungen) entfernen.
- **Gruppen in der Seitenleiste:** Technische Weisungen, Pflichtenhefte (TPH), Weisungen, Merkblätter, Übrige Unterlagen. Auf- und zuklappbar; die Gruppe ist ein Feld des Werks.
- **Neue Art „Weisung, Merkblatt oder Unterlage“** für Werke ohne Regelwerk. Sie erscheinen nicht als Basisnorm in der geltenden Fassung.
- **Regeln und Abschnitte** merken sich, in welchem Teil ihre PDF-Seite liegt.
- **Originaltext** aller PDF mit Textebene ist eingelesen (2326 Abschnitte) und durchsuchbar, auch die OCR-Textebene der Scans (TWP 1984, TWE 1994, TWS 1982, TWO 1977).
- Dateien und Datensicherungen aus 0.1.0 und 0.2.0 werden beim Laden umgestellt.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| C1 | Alle 97 PDF gehören zur Version 1 „Ersterfassung“. Die Datei ist dadurch rund 196 MB gross (PDF zusammen 143 MB). Gemessen: Öffnen rund 2 s, Speichern rund 1 s, auf einem Netzlaufwerk entsprechend länger. |
| C2 | Zuordnung der PDF zu Werken und Teilen nach Titelblatt und Dateiname. Die Beilagen der TPH-15/16/17 sind jetzt Teile des Pflichtenhefts (ersetzt B2 für diese drei). |
| C3 | Die acht PDF zur Gaswarnanlage sind als Teile des Kreisschreibens 9/98 zusammengefasst, Checkliste und Musterschilder als Teile des Rundschreibens Medizinalgas 2005. |
| C4 | TW EMP 2007, TW-Z&Q 2026 und TW Typenschilder 2003 sind als Produktanforderung geführt (gelten unter jeder Norm), TWE 1997 und TWO 1977 als Norm ohne Regeln. |
| C5 | Verknüpfung „TWE 1997 erneuert TWO 1977 und TWS 1982“ ist aus dem Titel abgeleitet. |
| C6 | Ausgabedaten ohne Tag (AW 2025, TW EMP 2007), aus dem Dateinamen (Bericht Dübelsysteme) oder aus der Änderungstabelle (Wegleitungen, Materialliste) sind zu bestätigen. TWS 1982 hat weiterhin kein Ausgabedatum. |
| C7 | Die Aufteilung des Originaltexts in Abschnitte ist automatisch und bei den Scans durch OCR-Fehler ungenau; bei wenigen erkannten Abschnitten wird nach Seiten geteilt. Bei TMB 2000 (drei Merkblätter) sind die Überschriften im PDF nicht als Text lesbar. |

### Geklärt
- **125 Pa / 150 Pa (Druckverlust ÜV/ESV 75/150 im Frischluftbetrieb):** kein Erfassungsfehler. Die TWP 1984 nennt 125 Pa (PDF-Seite 64), das TPH-04 von 2016 nennt in 5.2.2 150 Pa (PDF-Seite 11). Beide Stellen im PDF nachgelesen. Offen ist nur noch der Entscheid, gegen welchen Wert ANDAIR prüft (Kommentar in ANDAIR 2026).
- Titel und Daten von TWK 2017, TWW 2012, TW Schock 2021 stammen jetzt vom Titelblatt (erledigt A7 bis auf TWS 1982).

### Offene Punkte
- **Push ins Repo heududa/Claude_Shelter war wieder nicht möglich** (Repo-Zugriff in dieser Sitzung nicht freigegeben). Der Quellcode liegt als ZIP bei, ohne den Ordner `quellen/` mit den PDF (137 MB); dessen Aufbau steht im README.
- **Regeln:** Nur TWP 1984, TWE 1994, TWS 1982, TW Schock 2021 und sieben TPH haben Regeln. Kein Regelwert ist am Original geprüft; die Regeln von TWP, TWE und TWS tragen bis auf drei noch keine PDF-Seite.
- **Ohne PDF:** TWP 1966, Altbestand vor 1967, ANDAIR 2026.
- **Dateigrösse:** Eine Datei von rund 196 MB ist für E-Mail zu gross und auf langsamen Laufwerken träge. Falls das stört, wäre der nächste Schritt die früher besprochene Trennung in Programmdatei und PDF-Ordner.
- Kantonale Weisungen und ausländische Normen sind weiterhin nicht erfasst.

### Geprüft
`node test_pdf.js testdaten` und `node test.js` mit der vollständigen Datei: zusätzlich Norm mit fünf Teilen (Teil wechseln, Anmerkung je Teil, Sprung aus der Suche in den richtigen Teil), Regel der TWP führt auf PDF-Seite 64, Gruppen in der Seitenleiste, Speichern und Wiederöffnen der ganzen Datei ohne Verlust.

## 0.2.0 – 20.11.2026

Das Original-PDF liegt als ganze Norm in der Bibliothek und lässt sich direkt auf der Seite kommentieren. 26 PDF des BABS sind eingebettet.

### Neu
- **Original-PDF je Werk:** Jedes Werk (Norm, Produktanforderung, Schicht) kann genau ein PDF tragen. Es wird vollständig in die eine HTML-Datei eingebettet, bleibt unverändert und trägt Dateiname, Grösse, Datum, Name und Prüfsumme (SHA-256). Anzeige mit eingebettetem pdf.js 3.11.174 (Apache-2.0), ohne Netz.
- **Anmerkungen im PDF:** Stelle als Rechteck markieren oder die ganze Seite kommentieren. Arten: Kommentar, Änderung, offene Frage. Jede Anmerkung trägt Nummer, Name, Datum und optional die zugehörige Regel.
- **Versionierung der Anmerkungen:** Bearbeiten erzeugt eine neue Fassung, frühere Fassungen bleiben im Verlauf lesbar. Neue und geänderte Anmerkungen sind offene Änderungen und werden mit „Änderungen freigeben“ Teil der nächsten Version. Freigegebene Anmerkungen lassen sich nur zurückziehen, nicht löschen. „Erledigt“ für abgeschlossene Fragen.
- **Verbindung zu den Regeln:** „Regel daraus anlegen“ übernimmt Seite und Text; bei Regeln und Originaltext-Abschnitten ist die PDF-Seite ein Link ins PDF.
- **Text aus dem PDF:** Enthält das PDF Text, lässt er sich als Originaltext übernehmen (durchsuchbar, in Abschnitte geteilt).
- **Suche** findet auch Anmerkungen.
- **Datensicherung** enthält die PDF. Sicherungen aus 0.1.0 lassen sich laden.

### Eingebettete Originale (Stand der Titelblätter)
TPH-01, -02 (01.07.1992), TPH-04 (30.06.2016), TPH-05 (26.04.2004), TPH-06 (14.04.2015), TPH-07 (01.11.2011), TPH-08 (14.03.2013), TPH-09 (31.08.2001), TPH-10 (01.03.2025), TPH-11 (01.10.2026), TPH-12 (01.02.2026), TPH-14 (26.03.2004), TPH-15, -16, -17 (16.04.1998) mit je einer Beilage, TPH-18 (19.05.2003), TPH-19 (05.12.2023), TPH-20 (01.02.2012), TPH-21 und TSp-21 (01.11.2016), TPH-22 (01.04.2011), TPH-23 (01.09.2017), Präzisierung zu den TPH (16.09.2011). Zusammen 349 Seiten; die Datei ist dadurch rund 21 MB gross.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| B1 | Die 26 PDF gehören zur Version 1 „Ersterfassung“. Titel und Ausgabedatum der TPH stammen jetzt vom Titelblatt (ersetzt A7 für die TPH). |
| B2 | Beilagen (TPH-15/16/17, TSp-21) und die Präzisierung 2011 sind eigene Werke, mit „ergänzt“ verknüpft. Die Präzisierung gilt für alle TPH, ist aber nur stellvertretend mit TPH-04 verknüpft. |
| B3 | Neue Werke (TPH-01, -02, -05, -07 bis -10, -12, -18 bis -23) haben das PDF und den Originaltext, aber **noch keine Regeln**. |
| B4 | Die PDF-Seiten an 12 bestehenden TPH-Regeln stammen aus einer Stichwortsuche. Die Regeln bleiben „zu bestätigen“. |
| B5 | Anmerkungen im PDF sind Notizen zum Original. Abweichungen von Kanton oder ANDAIR, die für die Rechnung gelten sollen, bleiben Einträge in der Schicht. |
| B6 | Der Originaltext der TPH ist automatisch aus dem PDF gelesen und nach nummerierten Abschnitten geteilt; die Teilung ist nicht geprüft. Die drei Zeichnungs-Beilagen sind Scans ohne Text. |

### Offene Punkte
- **Push ins Repo heududa/Claude_Shelter war wieder nicht möglich:** Der Zugriff auf das Repo wurde in dieser Sitzung nicht freigegeben. Quellcode und PDF liegen als ZIP bei.
- **125 Pa / 150 Pa:** Das TPH-04 nennt in 5.2.2 (PDF-Seite 11) 150 Pa, im PDF nachgelesen. Offen bleibt der Wert 125 Pa aus der TWP-Auswertung.
- **TWP 1984, TWE 1994, TWS 1982, TW Schock 2021, TWK, TWW:** Für diese Werke liegt noch kein PDF vor.
- **PDF ersetzen:** Es wird nur das aktuelle PDF aufbewahrt; das frühere bleibt mit Prüfsumme im Verlauf, aber nicht als Datei. Anmerkungen bleiben auf ihrer Seitenzahl stehen.
- **Dateigrösse:** Jedes PDF vergrössert die Datei um rund das 1,3-Fache. Grenze je PDF 120 MB; grosse Scans machen Speichern und Öffnen langsam.
- **Markieren** geht als Rechteck, nicht als Textauswahl. Antworten auf Anmerkungen (Diskussion) gibt es noch nicht.
- **Schriften:** PDF ohne eingebettete Schriften werden mit Ersatzschriften gezeichnet.

### Geprüft
`node test_pdf.js <Ordner mit Test-PDF>`: PDF hinzufügen, Seite zeichnen, Rechteck markieren, ganze Seite kommentieren, bearbeiten → Fassung 2 mit früherer Fassung im Verlauf, freigeben, zurückziehen, Regel daraus anlegen, Text übernehmen, Scan ohne Text, falsche Datei abgelehnt, eingebettetes TPH-04 (19 Seiten, Sprung auf Seite 12, Originaltext, Suche), Speichern und Wiederöffnen der 21-MB-Datei ohne Verlust, schmale Ansicht. `node test.js` (Durchlauf aus 0.1.0) läuft weiter.

## 0.1.0 – 20.11.2026

Erste Fassung der Normenbibliothek als **eine HTML-Datei für eine Person gleichzeitig**. Ohne Server, ohne Installation, ohne Internet (keine externen Schriften, Skripte oder Aufrufe). Das Auslegeprogramm ist nicht Teil dieses Schritts; die Bibliothek liefert dafür einen Export.

### Enthalten
- **Ablage nach Herausgeber:** BABS Schweiz und ANDAIR sind angelegt; Kantone und ausländische Normstellen lassen sich als Herausgeber anlegen.
- **Werke:** TWP 1984, TWE 1994, TWS 1982, TWK 2017, TWW 2012, TWP 1966, TW Schock 2021, TPH-04/06/11/14/15/16/17, Schicht ANDAIR 2026 (Basis TWP 1984).
- **70 Regeln** aus dem Projektwissen (Dokumente 03 und 05), je mit Abschnitt, Thema, Text in eigenen Worten und Werten mit Schlüssel für das Auslegeprogramm.
- **Verknüpfungen** mit festen Typen: erneuert, ersetzt, verweist auf, ist abgeleitet von, ergänzt. Sie werden bei beiden Normen angezeigt.
- **Schichten** für Kantone und Hersteller: ändern, ergänzen, aufheben, Kommentar. Die Norm selbst bleibt unverändert. Jeder Eintrag braucht eine Begründung.
- **Geltende Fassung:** Basisnorm + kantonale Schicht + Hersteller-Schicht, mit Herkunft je Regel, Konfliktanzeige, „Basis aktualisiert – prüfen“ und „in <Norm> nicht geregelt“ (N2).
- **Versionen:** Änderungen sind zuerst offen; „Änderungen freigeben“ erzeugt eine unveränderliche Version mit Name, Datum, Notiz und Prüfsumme (SHA-256). Verlauf je Regel und gesamt.
- **Originaltext einlesen:** .md/.txt je Norm, Aufteilung nach nummerierten Abschnitten, Überschriften oder Seiten; „## PDF-Seite n“ wird als Seitenzahl übernommen. Eingelesener Text ist gesperrt.
- **Suche** über Regeln und Originaltext.
- **Speichern:** Die Datei schreibt sich selbst neu (Edge/Chrome direkt in die gewählte Datei, sonst als Download). Datensicherung als JSON zum Übernehmen in eine neuere Programmdatei.
- **Regelwerk-Export** (JSON, Format `normenbibliothek-regelwerk/1`) für das spätere Auslegeprogramm.

### Annahmen (Status „zu bestätigen“)
| Nr. | Annahme |
|---|---|
| A1 | Version 1 „Ersterfassung“ gilt als freigegeben, obwohl **kein Wert am Original geprüft** ist. Jede Regel trägt deshalb „zu bestätigen: nicht am Original geprüft“ (N6), bis jemand sie abhakt. |
| A2 | Solange nur eine Person arbeitet, gibt dieselbe Person frei. Das Vier-Augen-Prinzip und die Rollen (Leser, Autor, Prüfer, Admin) sind ausgesetzt, nicht gestrichen. |
| A3 | Widersprechen sich kantonale Schicht und Hersteller-Schicht, gilt die kantonale (behördliche); der Konflikt bleibt sichtbar. |
| A4 | TWE 1994 „erneuert“ einen Sammelposten „Altbestand vor 1967“, weil die einzelnen alten Erlasse nicht bekannt sind. |
| A5 | Die Themenliste N7 ist um vier Schlüssel erweitert: Geltung und Allgemeines, Einrichtung, Schocksicherheit und Befestigung, Statik (ausserhalb des Umfangs). |
| A6 | Die Originaltexte sind **nicht** in die Datei eingebaut. Sie werden je Norm einmal über „Originaltext einlesen“ geladen (die OCR-Dateien aus dem Projekt funktionieren). |
| A7 | Titel von TWS 1982, TWK 2017, TWW 2012, TW Schock 2021 und der TPH sind sinngemäss gesetzt, nicht vom Titelblatt übernommen. |
| A8 | Regel-IDs sind je Norm eigenständig (`TWP84-2.2-01`, `TWE94-2.6-01` …), wie im Normkonzept verlangt. Die bisherigen Planer-IDs (`TWP-2.2-03` …) sind nicht übernommen. |
| A9 | Die ANDAIR-Schicht enthält drei offene, nicht freigegebene Einträge: Schleusenspülung mit 5 Luftwechseln (ergänzen) und zwei Kommentare. |

### Offene Punkte
- **Push ins Repo heududa/Claude_Shelter war nicht möglich:** In dieser Umgebung fehlen Zugangsdaten für GitHub. Der Quellcode liegt als ZIP bei (Ordner `normenbibliothek/`).
- **Widerspruch 125 Pa / 150 Pa:** Druckverlust ÜV/ESV 75/150 im Frischluftbetrieb – die TWP-Auswertung nennt 125 Pa, das TPH-04 150 Pa. Als Kommentar in ANDAIR 2026 erfasst.
- **Wandabstand Liegestellen:** TWP 5 cm, TPH-16/17 10 cm (bestehende Frage TWP-2.4-02). Als Kommentar erfasst.
- **TWS 2.22 Schleusenspülung:** steht im Kapitel Tiefgaragen; Geltung für Freifeld offen.
- **Abschnittsnummern** sind teils nur auf Kapitel genau (z. B. „3.1“); PDF-Seiten fehlen fast überall.
- **Kantonale Sonderregeln:** Mechanik vorhanden und getestet, aber keine echte kantonale Weisung erfasst.
- **Verweise TWE → TWP:** nur als eine Sammelverknüpfung; einzelne Verweisstellen fehlen.
- **Einlesen von OCR-Text:** Die Aufteilung erkennt Abschnittsnummern mit Punkt (2.6, 3.14); Kapitelüberschriften ohne Punkt und Tabellen bleiben im vorherigen Abschnitt.
- **Keine Sperre gegen gleichzeitiges Bearbeiten:** Öffnen zwei Personen die Datei, überschreibt die zuletzt gespeicherte Fassung die andere.
- **Später:** Rollen und Zweitprüfung, Vergleich zweier Versionen, Ordner mit getrennten Inhalten, Anschluss des Auslegeprogramms.

### Geprüft
Automatischer Durchlauf im Browser (`node test.js`): Abweichung Hersteller und Kanton auf dieselbe Regel → Konflikt, Kanton gilt; Freigabe → Version 2; TWE-OCR einlesen und durchsuchen; Basisregel ändern → Schicht meldet „Basis aktualisiert – prüfen“; Speichern und Wiederöffnen ohne Verlust; schmale Ansicht ohne Querscrollen; keine Skriptfehler.
