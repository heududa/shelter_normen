// Ersterfassung der Normenbibliothek aus dem Projektwissen (Stand 11/2026).
// Alle Werte stammen aus den Projektdokumenten 03, 04, 05 (OCR-Auswertung) und sind NICHT am Original geprüft.
const THEMEN = [
  ['geltung', 'Geltung und Allgemeines'],
  ['fassung', 'Fassungsvermögen und Platzbedarf'],
  ['abteile', 'Abteile und Schleuse'],
  ['luft', 'Belüftung: Luftmengen'],
  ['komp', 'Belüftung: Komponenten'],
  ['druck', 'Belüftung: Druckabgleich'],
  ['abschl', 'Abschlüsse'],
  ['aborte', 'Aborte'],
  ['lf', 'Luftfassung, Notausgänge, Fluchtröhren'],
  ['elektro', 'Elektro'],
  ['fremd', 'Fremdleitungen'],
  ['abnahme', 'Abnahme'],
  ['wartung', 'Wartung'],
  ['einr', 'Einrichtung'],
  ['schock', 'Schocksicherheit und Befestigung'],
  ['statik', 'Statik (ausserhalb des Umfangs)'],
];

const herausgeber = [
  { id: 'babs', name: 'Bundesamt für Bevölkerungsschutz (BABS), vormals BZS', kurz: 'BABS Schweiz', art: 'bund', land: 'CH', notiz: 'Technische Weisungen (TW) und Pflichtenhefte (TPH) des Bundes.' },
  { id: 'andair', name: 'ANDAIR AG, Andelfingen', kurz: 'ANDAIR', art: 'hersteller', land: 'CH', notiz: 'Herstellernorm – keine behördliche Norm.' },
];

const W = (id, kurz, titel, o) => Object.assign({ id, kurz, titel, herausgeberId: 'babs', art: 'norm', ausgabe: '', inKraft: '', status: 'gültig', geltung: '', basisId: '', gebiet: '', gruppe: '', notiz: '' }, o);
const werke = [
  W('twp84', 'TWP 1984', 'Technische Weisungen für den Pflicht-Schutzraumbau', { ausgabe: '01.02.1984', inKraft: '01.04.1986', status: 'teilweise aufgehoben', geltung: 'Pflichtschutzräume in privaten Gebäuden, Pflichtschutzräume in öffentlichen Gebäuden (ausser Heime über 30 Plätze), öffentliche Schutzräume (ausser Tiefgaragen).', notiz: 'Kapitel 4 (Bemessung und Konstruktion) ist aufgehoben und durch die TWK ersetzt.' }),
  W('twe94', 'TWE 1994', 'Technische Weisungen für die Erneuerung von Schutzräumen bis zu 200 Schutzplätzen', { ausgabe: '20.01.1994', inKraft: '01.10.1994', geltung: 'Erneuerung von Personenschutzräumen bis 200 Schutzplätze in Gebäuden, die vor dem 1. April 1967 erstellt wurden.' }),
  W('tws82', 'TWS 1982', 'Technische Weisungen für spezielle Schutzräume', { ausgabe: '1982', geltung: 'Kap. 2 Tiefgaragen, Kap. 3 Freifeldschutzräume, Kap. 4 Spitäler, Alters- und Pflegeheime.', notiz: 'Titel und Ausgabedatum zu bestätigen. Erfasst ist Kap. 3 (Freifeld) sowie einzelne Angaben aus Kap. 2. Kap. 4 überarbeitet, gültig ab 01.01.2012.' }),
  W('twk17', 'TWK 2017', 'Technische Weisungen für die Konstruktion und Bemessung von Schutzbauten', { ausgabe: '2017', notiz: 'Titel zu bestätigen. Kein Inhalt erfasst: Statik liegt ausserhalb des Umfangs.' }),
  W('tww12', 'TWW 2012', 'Technische Weisungen: Belüftung mit Wärmedämmungen', { ausgabe: '2012', notiz: 'Titel zu bestätigen. Noch kein Inhalt erfasst.' }),
  W('twp66', 'TWP 1966', 'Technische Weisungen für den privaten Schutzraumbau', { ausgabe: '15.11.1966', status: 'aufgehoben', notiz: 'Durch die TWP 1984 aufgehoben. Kein Inhalt erfasst.' }),
  W('alt67', 'Altbestand vor 1967', 'Schutzräume in Gebäuden mit Baujahr vor dem 1. April 1967', { status: 'aufgehoben', notiz: 'Sammelposten für die Vorschriften, nach denen diese Schutzräume gebaut wurden. Die einzelnen Erlasse sind nicht erfasst – zu bestätigen.' }),
  W('schock21', 'TW Schock 2021', 'Technische Weisungen für die Schocksicherheit von Einbauteilen in Zivilschutzbauten', { art: 'produktanforderung', inKraft: '01.03.2021', notiz: 'Ersetzt die Ausgabe 1995. Titel zu bestätigen.' }),
  W('tph04', 'TPH-04', 'Technisches Pflichtenheft Ventile (ESV/VF, ÜV/ESV)', { art: 'produktanforderung', ausgabe: '30.06.2016' }),
  W('tph06', 'TPH-06', 'Technisches Pflichtenheft Gasfilter', { art: 'produktanforderung', ausgabe: '14.04.2015' }),
  W('tph11', 'TPH-11', 'Technisches Pflichtenheft Kleinbelüftungsgeräte', { art: 'produktanforderung', ausgabe: '01.10.2026' }),
  W('tph14', 'TPH-14', 'Technisches Pflichtenheft Notabort', { art: 'produktanforderung' }),
  W('tph15', 'TPH-15', 'Technisches Pflichtenheft Personalliegestellen', { art: 'produktanforderung' }),
  W('tph16', 'TPH-16', 'Technisches Pflichtenheft stapelbare Liegestellen', { art: 'produktanforderung' }),
  W('tph17', 'TPH-17', 'Technisches Pflichtenheft Liegestellen TWP', { art: 'produktanforderung', ausgabe: '1998', notiz: 'Zeichnungen 97-001a/b fehlen.' }),
  W('andair26', 'ANDAIR 2026', 'ANDAIR-Hausnorm auf Basis TWP 1984', { herausgeberId: 'andair', art: 'schicht', basisId: 'twp84', ausgabe: '2026', status: 'Entwurf', notiz: 'Enthält nur Abweichungen zur Basisnorm. Herstellernorm – keine behördliche Norm.' }),
];

// ---- Pflichtenhefte und Beilagen: Stammdaten vom Titelblatt der PDF (20.11.2026), PDF liegen in quellen/
// [id, Kurzbezeichnung, Titel, Ausgabe, PDF-Datei, Aufteilung des Textes ('' = Scan/Zeichnung, kein Text)]
const TPH = [
  ['tph01', 'TPH-01', 'Technisches Pflichtenheft für die Herstellung von Belüftungsgeräten der Typen VA 1200 – VA 4800 für Schutzanlagen der Organisation und des Sanitätsdienstes', '01.07.1992', 'tph01-de.pdf', 'nummern'],
  ['tph02', 'TPH-02', 'Technisches Pflichtenheft für die Herstellung von Belüftungsgeräten der Typen VA 4200 S – VA 9000 S für spezielle Schutzräume', '01.07.1992', 'tph02-de.pdf', 'nummern'],
  ['tph04', 'TPH-04', 'Technisches Pflichtenheft für die Herstellung von Überdruckventilen, Explosionsschutzventilen, Überdruck-Explosionsschutzventilen, Explosionsschutzventilen mit Vorfilter, Vorfiltern, Prallplatten und Schutzgittern im Bereich Zivilschutz', '30.06.2016', 'tph04-de.pdf', 'nummern'],
  ['tph05', 'TPH-05', 'Technisches Pflichtenheft für die Herstellung von gasdichten Absperrorganen für Schutzbauten', '26.04.2004', 'tph05-de.pdf', 'nummern'],
  ['tph06', 'TPH-06', 'Technisches Pflichtenheft für die Herstellung von Gasfiltern (ABC-Schutzfilter) der Typen GF 40, 75, 150, 300 und 600 für Zivilschutzbauten', '14.04.2015', 'tph06-de.pdf', 'nummern'],
  ['tph07', 'TPH-07', 'Technisches Pflichtenheft für Aktivkohle in ABC-Schutzfiltern', '01.11.2011', 'tph07-de.pdf', 'nummern'],
  ['tph08', 'TPH-08', 'Technisches Pflichtenheft für Schwebstofffiltermedien in ABC-Schutzfiltern für Zivilschutzbauten', '14.03.2013', 'tph08-de.pdf', 'nummern'],
  ['tph09', 'TPH-09', 'Technisches Pflichtenheft für Staubschutzmaterial in ABC-Schutzfiltern', '31.08.2001', 'tph09-de.pdf', 'nummern'],
  ['tph10', 'TPH-10', 'Technisches Pflichtenheft: Formteile und Halbzeuge aus Thermoplasten, Duromeren und Elastomeren (Kunststoff und Gummi), Vergussmassen, Klebstoffe', '01.03.2025', 'tph10-de.pdf', 'nummern'],
  ['tph11', 'TPH-11', 'Technisches Pflichtenheft für die Herstellung von Kleinbelüftungsgeräten der Typen VA 40, 75, 150 und 300 für Zivilschutzbauten', '01.10.2026', 'tph11-de.pdf', 'nummern'],
  ['tph12', 'TPH-12', 'Technisches Pflichtenheft Oberflächenschutz von Metallen im Bereich Zivilschutz', '01.02.2026', 'tph12-de.pdf', 'nummern'],
  ['tph14', 'TPH-14', 'Technisches Pflichtenheft für die Herstellung von Notabortausrüstungen für Schutzbauten', '26.03.2004', 'tph14-de.pdf', 'nummern'],
  ['tph15', 'TPH-15', 'Technisches Pflichtenheft für die Herstellung von fest eingebauten Personalliegestellen in den Zivilschutzanlagen', '16.04.1998', 'tph15-de.pdf', 'nummern'],
  ['tph15b', 'TPH-15 Beilage', 'Beilage zum TPH-15 (Zeichnungen)', '', 'tph15beilage-de.pdf', ''],
  ['tph16', 'TPH-16', 'Technisches Pflichtenheft für die Herstellung von vorfabrizierten Schutzraumeinrichtungen (stapelbare Liegestellen, mobile Toiletteneinrichtungen und mobile Raumunterteilungen) für TWS-Schutzräume (Raumhöhe i. L. min. 2,30 m) und von stapelbaren Liegestellen für TWP-Schutzräume (Raumhöhe i. L. min. 2,20 m)', '16.04.1998', 'tph16-de.pdf', 'nummern'],
  ['tph16b', 'TPH-16 Beilage', 'Beilage zum TPH-16 (Zeichnungen)', '', 'tph16beilage-de.pdf', ''],
  ['tph17', 'TPH-17', 'Technisches Pflichtenheft für die Herstellung von Liegestellen mit einer festen Liegefläche oder mit Liegetuchbespannung für TWP-Schutzräume (Raumhöhe i. L. min. 2,00 m)', '16.04.1998', 'tph17-de.pdf', 'nummern'],
  ['tph17b', 'TPH-17 Beilage', 'Beilage zum TPH-17 (Zeichnungen)', '', 'tph17beilage-de.pdf', ''],
  ['tph18', 'TPH-18', 'Technisches Pflichtenheft für die Herstellung von gasdichten und druckfesten Durchführungen für Schutzbauten', '19.05.2003', 'tph18-de.pdf', 'nummern'],
  ['tph19', 'TPH-19', 'Technisches Pflichtenheft für die Herstellung, Lieferung und Montage von Schutzbauabschlüssen und Drucktüren für Schutzbauten des Zivilschutzes', '05.12.2023', 'tph19-de.pdf', 'nummern'],
  ['tph20', 'TPH-20', 'Technisches Pflichtenheft für die Auswahl und den Betrieb von Polycom Repeater und der zugehörigen Antenneninstallationen in Schutzbauten', '01.02.2012', 'tph20-de.pdf', 'nummern'],
  ['tph21', 'TPH-21', 'Technisches Pflichtenheft V1.00 für stationäre Sirenenanlagen zur Warnung und Alarmierung der Bevölkerung', '01.11.2016', 'tph21-de.pdf', 'nummern'],
  ['tsp21', 'TSp-21', 'Technische Spezifikation V1.00: Schnittstelle zwischen Sirenenanlage und Fernsteuerung FGP zur Warnung und Alarmierung der Bevölkerung', '01.11.2016', 'tsp21beilage-de.pdf', 'nummern'],
  ['tph22', 'TPH-22', 'Technisches Pflichtenheft für die Notleuchten in Schutzbauten des Zivilschutzes', '01.04.2011', 'tph22-de.pdf', 'nummern'],
  ['tph23', 'TPH-23', 'Technisches Pflichtenheft V1.00 für mobile Sirenenanlagen zur Warnung und Alarmierung der Bevölkerung', '01.09.2017', 'tph23-de.pdf', 'nummern'],
  ['praez11', 'Präzisierung TPH 2011', 'Präzisierung zu den Technischen Pflichtenheften des Bundesamtes für Bevölkerungsschutz (Messunsicherheit bei der Konformitätsbewertung)', '16.09.2011', 'praezisierung-de.pdf', 'seiten'],
];
const G = { tw: 'Technische Weisungen', tph: 'Pflichtenhefte (TPH)', wsg: 'Weisungen', mb: 'Merkblätter', ue: 'Übrige Unterlagen' };
const pdfs = [];
// Ein Werk kann mehrere PDF (Teile) tragen. text: 'nummern' | 'seiten' | '' (kein Text) | undefined (automatisch)
const P_ = (werkId, datei, teil, text) => { pdfs.push({ werkId, datei, teil: teil || '', text }); };
const wk = id => werke.find(w => w.id === id);
function N(id, kurz, titel, ausgabe, art, gruppe, notiz) { let w = wk(id); if (!w) { w = W(id, kurz, titel, {}); werke.push(w); } Object.assign(w, { kurz, titel, ausgabe, art, gruppe, notiz: notiz || '' }); return w; }

// ---- Technische Weisungen (Stammdaten vom Titelblatt der PDF, 20.11.2026)
const T2 = '2_Technische_Weisungen/';
['twp84', 'twe94', 'tws82', 'twk17', 'tww12', 'twp66', 'alt67', 'schock21'].forEach(id => { wk(id).gruppe = G.tw; });
Object.assign(wk('twk17'), { ausgabe: '2017, Stand 02.12.2025', notiz: 'Keine Regeln erfasst: Statik liegt ausserhalb des Umfangs.' });
Object.assign(wk('tww12'), { titel: 'Technische Weisungen für die Belüftung von Schutzräumen mit Wärmedämmungen', ausgabe: '15.08.2012', notiz: 'Noch keine Regeln erfasst.' });
Object.assign(wk('schock21'), { titel: 'Technische Weisungen für die Schocksicherheit von Einbauteilen in Schutzbauten des Zivilschutzes', ausgabe: '01.03.2021', notiz: 'Ersetzt die Ausgabe 1995.' });
wk('tws82').notiz = 'PDF aus den fünf Kapiteldateien des BABS zusammengefügt (Kap. 1, 2, 3, 4, 5.1), Seiten durchgehend gezählt: Kap. 1 ab Seite 1, Kap. 2 ab 13, Kap. 3 ab 100, Kap. 4 ab 121, Kap. 5.1 ab 138. Ausgabedatum zu bestätigen. Regeln sind aus Kap. 3 (Freifeld) und einzelne aus Kap. 2 erfasst. Kap. 4 überarbeitet, gültig ab 01.01.2012.';
N('twe97', 'TWE 1997', 'Technische Weisungen für die Erneuerung von Anlagen und speziellen Schutzräumen', '03.04.1997', 'norm', G.tw, 'Noch keine Regeln erfasst.');
N('two77', 'TWO 1977', 'Technische Weisungen für die Schutzanlagen der Organisation und des Sanitätsdienstes', '01.10.1977', 'norm', G.tw, 'PDF aus den vier Kapiteldateien des BABS zusammengefügt, Seiten durchgehend gezählt: Kap. 1 ab Seite 1, Kap. 2 ab 25, Kap. 3 ab 183, Kap. 4 ab 299. Noch keine Regeln erfasst.');
N('twemp07', 'TW EMP 2007', 'Technische Weisungen für den EMP-Schutz der elektrischen Energieversorgung von Zivilschutzbauten (Material)', '2007', 'produktanforderung', G.tw, '');
N('twzq26', 'TW-Z&Q 2026', 'Technische Weisungen Zulassungsverfahren und Qualitätsmanagement für prüfpflichtige Komponenten und Materialien im Bereich Zivilschutz', '27.03.2026', 'produktanforderung', G.tw, '').inKraft = '01.05.2026';
N('twts03', 'TW Typenschilder 2003', 'Technische Weisungen betreffend Typenschilder, Montage-, Betriebs- und Wartungsanleitungen von BABS-prüfpflichtigen Einbauteilen', '20.02.2003', 'produktanforderung', G.tw, '');
N('duebel21', 'Bericht Dübelsysteme 2021', 'Bericht: Prüfung und Zulassung von Dübelsystemen (BBS-1936.9)', '15.03.2021', 'unterlage', G.tw, 'Datum aus dem Dateinamen, zu bestätigen.');
P_('twp84', T2 + 'TWP_1984_OCR_optimiert.pdf');
P_('twe94', T2 + 'TWE_1994_Schutzraeume.pdf');
P_('twe97', T2 + 'TWE_1997_Anlagen.pdf');
// TWS 1982 und TWO 1977 liefert das BABS in Kapiteldateien; zusammenfuegen.sh macht daraus je ein PDF.
P_('tws82', T2 + 'zusammengefuegt/TWS_1982_Kap1-5.pdf');
P_('two77', T2 + 'zusammengefuegt/TWO_1977_Kap1-4.pdf');
P_('twk17', T2 + 'TWK2017-de.pdf', 'Weisungen');
P_('twk17', T2 + 'TWK2017_beispiele-de.pdf', 'Beispiele');
P_('tww12', T2 + 'tww2012-de.pdf');
P_('schock21', T2 + 'TW-Schock_2021_Hauptdokument_de_SIG.pdf', 'Hauptdokument');
P_('schock21', T2 + 'TW-Schock_2021_Anhang_de.pdf', 'Anhang');
P_('twemp07', T2 + 'twemp2007material-de.pdf');
P_('twzq26', T2 + 'TWZQ_2026_1_de.pdf', 'Weisungen');
P_('twzq26', T2 + 'TWZQ_2026_2_Anhang_A_de.pdf', 'Anhang A Tarifliste');
P_('twzq26', T2 + 'TWZQ_2026_3_Anhang_B_de.pdf', 'Anhang B');
P_('twts03', T2 + 'twtypenschilder20030220-de.pdf');
P_('duebel21', T2 + 'Pruefung-Zulassung-Duebelsysteme-20210315-de.pdf');

// ---- Pflichtenhefte; Beilagen sind ein zweiter Teil des jeweiligen Pflichtenhefts
TPH.forEach(([id, kurz, titel, ausgabe, datei, text]) => {
  if (/^tph\d+b$/.test(id)) return P_(id.slice(0, -1), '1_TPH/' + datei, 'Beilage (Zeichnungen)');
  const w = N(id, kurz, titel, ausgabe, 'produktanforderung', G.tph, (wk(id) || {}).notiz);
  if (id === 'tph17') w.notiz = 'Zeichnungen: siehe Teil «Beilage».';
  if (id === 'praez11') w.notiz = 'Schreiben des BABS an die Hersteller prüfpflichtiger Komponenten. Gilt für alle Pflichtenhefte.';
  if (id === 'tsp21') w.notiz = 'Beilage zum TPH-21.';
  P_(id, '1_TPH/' + datei, /^tph1[567]$/.test(id) ? 'Pflichtenheft' : '', text);
});

// ---- Weisungen, Merkblätter, übrige Unterlagen: ohne Regelwerk
const U = (id, kurz, titel, ausgabe, gruppe, dateien, notiz) => { N(id, kurz, titel, ausgabe, 'unterlage', gruppe, notiz); const ord = { [G.wsg]: '3_Weisungen/', [G.mb]: '4_Merkblaetter/', [G.ue]: '5_Uebrige/' }[gruppe]; [].concat(dateien).forEach(d => Array.isArray(d) ? P_(id, ord + d[0], d[1]) : P_(id, ord + d)); };
U('psbk25', 'Wsg PSBK 2025', 'Weisungen des BABS über die periodische Schutzbautenkontrolle (PSBK)', '07.05.2025', G.wsg, 'Weisungen-BABS-PSBK-20250507-sig-de.pdf');
U('psbkerl25', 'Erläuterungen PSBK 2025', 'Erläuterungen zu den Weisungen über die periodische Schutzbautenkontrolle (PSBK)', '07.05.2025', G.wsg, 'Erlaeuterungen-BABS-PSBK-20250507-de.pdf');
U('aw25', 'AW 2025', 'Administrative Weisungen für die Erneuerung von Schutzanlagen', '2025', G.wsg, 'Administrative_Weisungen_für_die_Erneuerung_von_Schutzanlagen_-_AW_2025-sig.pdf');
U('awkgsr25', 'AW KGSR 2025', 'Administrative Weisungen für den Bau und die Erneuerung von Kulturgüterschutzräumen (KGSR)', '2025', G.wsg, 'Administrative_Weisungen_für_den_Bau_und_die_Erneuerung_von_Kulturgüterschutzräumen_KGSR-sig.pdf');
U('twausr26', 'TW Ausrüstung 2026', 'Technische Weisungen über die Ausrüstung der Schutzanlagen mit Handfeuerlöschern, Nothandleuchten und Elektroluftentfeuchtern', '30.03.2026', G.wsg, 'Tech-Wsg-ueber-die-Ausruestung-der-Schutzanlagen-mit-HandfeuerloeschernNothandleuchtenElektroluft-de.pdf');
U('zupla22', 'Wsg ZUPLA 2022', 'Weisungen betreffend Steuerung des Schutzraumbaus und Zuweisungsplanung', '01.02.2022 (Stand 02.05.2022)', G.wsg, 'WsgSR-Bau-ZUPLA-20220201-de.pdf');
U('bedplas24', 'Wsg BedplaS 2024', 'Weisungen zur kantonalen Bedarfsplanung für Schutzanlagen der Führungsorgane und Zivilschutzorganisationen (BedplaS)', '01.01.2024', G.wsg, 'WsgkantonaleBedarfsplanungvonSchutzanlagen-de.pdf');
U('rueckbau25', 'Wsg Rückbau 2025', 'Weisungen über den notwendigen Rückbau der technischen Schutzbausysteme bei aufgehobenen Schutzanlagen', '20.08.2025', G.wsg, '2025-09-01_Weisung_Rueckbau-de.pdf');
U('pauschal26', 'Wsg Pauschalbeiträge 2026', 'Weisungen über die Ausrichtung von jährlichen Pauschalbeiträgen zur Sicherstellung der Betriebsbereitschaft der Schutzanlagen', '19.12.2025', G.wsg, '2026_Weisungen_des_BABS_über_die_Ausrichtung_von_jährlichen_Pauschalbeiträgen.pdf');
U('archiv21', 'Liste Archivanlagen 2021', 'Liste der Bewilligungen zum Einbau demontierbarer Archivanlagen in Schutzräumen', '15.02.2021', G.wsg, 'ArchivanlageninSR-2021-de.pdf');
U('rohrbef24', 'Liste Rohrbefestigungen 2024', 'Liste der Bewilligungen zum Einbau von Rohrbefestigungs- und Leitungssystemen', '27.05.2024', G.wsg, 'bewrohrbefltgsysteme-de.pdf');

U('revschalter16', 'Schreiben Revisionsschalter 2016', 'Schalteinrichtungen für Wartungsarbeiten «Revisionsschalter» bei Kleinbelüftungsgeräten in Schutzbauten', '02.08.2016', G.mb, 'revisionsschalter-de.pdf');
U('tmb001', 'TMB 2000 Überdruckventile', 'Technisches Merkblatt: Pendeln von Überdruckventilen', 'April 2000', G.mb, 'tmb001-de.pdf', 'Titel im PDF nicht als Text lesbar; sinngemäss übernommen.');
U('tmb002', 'TMB 2000 Schleusenspülzeiten', 'Technisches Merkblatt: Schleusenspülzeiten, Richtwerte für vollwertige Anlagen der Organisationen und geschützte Operationsstellen', 'April 2000', G.mb, 'tmb002-de.pdf', 'Titel im PDF nicht als Text lesbar; sinngemäss übernommen.');
U('tmb004', 'TMB 2000 Unterhalt', 'Technisches Merkblatt: Aufgebot für den Unterhalt von Zivilschutzanlagen', 'August 2000', G.mb, 'tmb004-de.pdf', 'Titel im PDF nicht als Text lesbar; sinngemäss übernommen.');
U('tmb011', 'TMB 01-1', 'Technisches Merkblatt: Unterhalt, Kontrolle von ABC-Schutzfiltern GF 40 / 75 / 150 / 300 / 600', '01.06.2016', G.mb, 'tmb011-de.pdf');
U('tmb021', 'TMB 02-1', 'Technisches Merkblatt: Oeltank für Notstromanlagen', '01.06.2016', G.mb, 'tmb021-de.pdf');
U('tmb035', 'TMB 03-5', 'Technisches Merkblatt: Durchführung für Kabel oder Rohre', '01.03.2003, revidiert 01.10.2018', G.mb, 'tmb035-de.pdf');
U('tmb046', 'TMB 04-6', 'Technisches Merkblatt: 24-h-Dauerlauf der Notstromgruppe alle 10 Jahre', 'April 2004', G.mb, 'tmb046-de.pdf');
U('mb2302', 'MB 2023-02 Asbest', 'Merkblatt Nr. 2023-02: Asbest in Schutzbauten', '25.01.2023', G.mb, 'TMB-23-2-AsbestinSB-de.pdf');
U('mb2401', 'MB 2024-01 Fernwärme', 'Merkblatt Nr. 2024-01: Durchführung von Fernwärmeleitungen durch Schutzräume', '01.09.2024', G.mb, 'TMB_24-01-DurchfuehrungFWLdurchSchutzraeume-de.pdf');
U('mb2501g', 'MB 2025-01 Glasfaser', 'Merkblatt Nr. 2025-01: Erschliessung von Schutzbauten mit Glasfaserkabel', '30.01.2025', G.mb, 'TMB_25-01-ErschliessungvonSchutzbautenmitGlasfaserkabel-de.pdf');
U('mb2501d', 'MB 2025-01 Dieselpartikelfilter', 'Merkblatt Nr. 2025-01: Nachrüstung von Dieselpartikelfiltern (DPF) in stationären Notstromanlagen von Schutzanlagen des Zivilschutzes', '07.04.2025', G.mb, 'MB_2025-01_Einbau_DPF_in_Notstromanlagen_von_Schutzbauten.pdf');

U('konzept23', 'Konzept Schutzbauten 2023', 'Konzept Schutzbauten: Planungsgrundlage für die Weiterentwicklung und den Werterhalt der Schutzräume, Kommandoposten und Bereitstellungsanlagen', '01.05.2023', G.ue, '20230501KonzeptSchutzbauten-de.pdf');
U('schildva150', 'Hinweisschild VA 150', 'Information über die Plombierung der Verbindungsschläuche VA 150', '', G.ue, 'HinweisschildVA150_Plombierung_de.pdf');
U('gaswarn98', 'KS 9/98 Gaswarnanlage', 'Kreisschreiben Nr. 9/98-108: Lagerung von brennbaren Flüssigkeiten in Geräteräumen von Bereitstellungsanlagen (BSA) sowie in Materialräumen gemäss TWS', '24.09.1998', G.ue, [['ksgaswarnanlage-de.pdf', 'Kreisschreiben'], ['ksgaswarnanlagebeilage-de.pdf', 'Beilage Installationsanleitung'], ['installationsvarianten-de.pdf', 'Installationsvarianten'], ['massnahmenlueftungsaggregat-de.pdf', 'Massnahmen am Lüftungsaggregat VA 75/150'], ['projektprozessbeschrieb-de.pdf', 'Prozess Einbau Gaswarnanlage'], ['gaswarnschild-de.pdf', 'Warnschild'], ['gaswarnschildva150-de.pdf', 'Warnschild VA 150'], ['schildachtungexplosionsgefahr-de.pdf', 'Schild Explosionsgefahr']], 'Die acht PDF zur Gaswarnanlage sind hier zusammengefasst; Zuordnung zu bestätigen.');
U('ks126', 'KS 1/26 SanD-Anlagen', 'Kreisschreiben 1/26 zur Übergangslösung für die sanitätsdienstlichen Schutzanlagen', '07.05.2026', G.ue, 'KS-fuer-Uebergangsloesung-der-SanD-Anlagen-de.pdf');
U('rsmedgas05', 'RS Medizinalgas 2005', 'Rundschreiben: Regelung bezüglich der Medizinalgas-Versorgung in den sanitätsdienstlichen Anlagen', '31.08.2005', G.ue, [['rsmedgasversorg-de.pdf', 'Rundschreiben'], ['checkliste-de.pdf', 'Beilage Checkliste'], ['muster-de.pdf', 'Muster Schilder']]);
U('rsmedgas07', 'RS Medizinalgasflaschen 2007', 'Rundschreiben: Regelung bezüglich der Medizinalgasflaschen in den sanitätsdienstlichen Schutzanlagen', '15.05.2007', G.ue, 'rsmedgasflaschenentsorg-de.pdf');
U('ks407', 'KS 4/07 Telematik', 'Kreisschreiben 4/07: Erweiterung der Telematiksysteme für geschützte Führungsstandorte, geschützte Spitäler und geschützte Sanitätsstellen', '10.12.2007', G.ue, 'kserweittelematiksysteme-de.pdf');
U('wltgtelematik', 'Wegleitung Telematik', 'Wegleitung Erweiterung Telematiksysteme (Ergänzung zum Kreisschreiben 4/07)', '16.09.2008, Stand zu bestätigen', G.ue, 'wegltgerweittelematik-de.pdf');
U('wltgpolycom16', 'Wegleitung Polycom-Repeater', 'Wegleitung für die Verwendung von Polycom-Repeater in Schutzanlagen des Zivilschutzes', '07.07.2011, Stand 01.06.2016', G.ue, '20160601wltgpolycomrepeater-de.pdf');
U('matpolycom', 'Materialliste Polycom-Repeater', 'Materialliste für die Verwendung von besonderem Material im Zusammenhang mit Polycom-Repeater in Schutzanlagen des Zivilschutzes', '07.07.2011, Stand zu bestätigen', G.ue, 'matlistepolycomrepeater-de.pdf');
U('steckdose230', 'Steckdose 230 V Repeater', 'Steckdose 230 V für Repeater, Rack und Aktivkomponenten in Schutzanlagen (Ausnahmeregelung)', '', G.ue, 'steckdose230v-de.pdf');
U('ipmig17', 'IP-Migrationskonzept 2017', 'IP-Migrationskonzept PSTN-Einzelanschlüsse', '2017, Version 1.1', G.ue, '2017_IPMigrationskonzeptBABS_V1-0_de.pdf');
U('st88', 'Merkblatt ST-88', 'Merkblatt: Nachrüstung der Sortimente Schleusentelefone ST-88', '01.01.1994', G.ue, 'merkblattmontageanltg-de.pdf');
U('anljournal10', 'Anlagejournal Elektro 2010', 'Anlagejournal für Elektroinstallationen in Schutzanlagen', 'August 2010', G.ue, 'anljournlelektrinst-de.pdf');
U('twu2000c', 'TWU 2000 Anhang C', 'Beispiel eines Pflichtenheftes für Anlagewarte der ZSO (Organisation und Ablauf des Unterhaltes von Schutzbauten, Anhang C)', '', G.ue, 'bspflichthefttwo2000tl1anhc-de.pdf', 'Zugehörigkeit zu den TWU 2000 zu bestätigen.');
U('flussumn', 'Flussdiagramm Umnutzung', 'Anhang: Flussdiagramm Umnutzung Schutzanlagen', '', G.ue, 'AnhangFlussdiagrammUmnutzungSchutzanlagen-de.pdf');

// Reihenfolge in der Seitenleiste
const TWORD = ['twp84', 'twe94', 'twe97', 'tws82', 'two77', 'twk17', 'tww12', 'schock21', 'twemp07', 'twzq26', 'twts03', 'duebel21', 'twp66', 'alt67'];
const GORD = [G.tw, G.tph, G.wsg, G.mb, G.ue];
const rang = (w, i) => w.id === 'andair26' ? 1e6 : GORD.indexOf(w.gruppe) * 1000 + (w.gruppe === G.tw ? TWORD.indexOf(w.id) : i);
werke.map((w, i) => [rang(w, i), w]).sort((a, b) => a[0] - b[0]).forEach((x, i) => { werke[i] = x[1]; });

const verknuepfungen = [
  { id: 'v1', von: 'twe94', typ: 'erneuert', nach: 'alt67', bereich: 'Schutzräume bis 200 SP in Gebäuden mit Baujahr vor 01.04.1967', notiz: '' },
  { id: 'v2', von: 'twe94', typ: 'verweist', nach: 'twp84', bereich: 'z. B. TWE 2.6 auf TWP 3.15', notiz: 'Einzelne Verweisstellen zu bestätigen.' },
  { id: 'v3', von: 'twp84', typ: 'ersetzt', nach: 'twp66', bereich: 'ganze Weisung', notiz: '' },
  { id: 'v4', von: 'twk17', typ: 'ersetzt', nach: 'twp84', bereich: 'Kapitel 4 (Bemessung und Konstruktion)', notiz: 'Der Scan der TWP nennt TWK 1994/1997; heute gilt TWK 2017.' },
  { id: 'v5', von: 'andair26', typ: 'abgeleitet', nach: 'twp84', bereich: 'ganze Weisung', notiz: '' },
  { id: 'v6', von: 'tsp21', typ: 'ergaenzt', nach: 'tph21', bereich: 'Schnittstelle Sirenenanlage – Fernsteuerung', notiz: '' },
  { id: 'v7', von: 'praez11', typ: 'ergaenzt', nach: 'tph04', bereich: 'gilt für alle Pflichtenhefte', notiz: 'Stellvertretend mit TPH-04 verknüpft.' },
  { id: 'v8', von: 'twe97', typ: 'verweist', nach: 'two77', bereich: 'gilt für Anlagen, die vor Inkraftsetzung der TWO 1977 erstellt wurden', notiz: 'TWE 1997 Art. 1 (Seite 3).' },
  { id: 'v9', von: 'twe97', typ: 'verweist', nach: 'tws82', bereich: 'gilt für spezielle Schutzräume, die vor Inkraftsetzung der TWS 1982 erstellt wurden', notiz: 'TWE 1997 Art. 1 (Seite 3).' },
  { id: 'v10', von: 'psbkerl25', typ: 'ergaenzt', nach: 'psbk25', bereich: 'Erläuterungen zu den einzelnen Bestimmungen', notiz: '' },
  { id: 'v11', von: 'wltgtelematik', typ: 'ergaenzt', nach: 'ks407', bereich: 'ganze Wegleitung', notiz: '' },
  { id: 'v12', von: 'matpolycom', typ: 'ergaenzt', nach: 'wltgpolycom16', bereich: 'Materialliste', notiz: '' },
  { id: 'v13', von: 'rsmedgas07', typ: 'ergaenzt', nach: 'rsmedgas05', bereich: 'Medizinalgasflaschen', notiz: '' },
];

const regeln = [];
const zaehler = {};
const PRE = { twp84: 'TWP84', twe94: 'TWE94', tws82: 'TWS82', schock21: 'SCHOCK21', tph04: 'TPH04', tph06: 'TPH06', tph11: 'TPH11', tph14: 'TPH14', tph15: 'TPH15', tph16: 'TPH16', tph17: 'TPH17', andair26: 'ANDAIR26' };
function R(werkId, abschnitt, thema, titel, text, params, extra) {
  const key = PRE[werkId] + '-' + (abschnitt.split(/[ ,/]/)[0] || 'X');
  zaehler[key] = (zaehler[key] || 0) + 1;
  const r = Object.assign({ id: key + '-' + String(zaehler[key]).padStart(2, '0'), werkId, art: 'regel', abschnitt, pdfSeite: '', thema, titel, text, params: (params || []).map(p => ({ k: p[0], v: p[1], e: p[2] || '' })), geprueft: null, zielId: '', basisRev: 0, begruendung: '', quelle: '', autor: 'Ersterfassung', datum: '2026-11-20', rev: 1, zurueckgezogen: false }, extra || {});
  regeln.push(r); return r;
}

// ---- TWP 1984
R('twp84', '2.2', 'fassung', 'Grundrissfläche je Schutzplatz', 'Je Schutzplatz ist 1,0 m² Grundrissfläche erforderlich.', [['flaeche_je_sp', '1,0', 'm²']]);
R('twp84', '2.2', 'fassung', 'Rauminhalt je Schutzplatz', 'Je Schutzplatz sind 2,5 m³ Rauminhalt erforderlich, einschliesslich VA und Aborte.', [['volumen_je_sp', '2,5', 'm³']]);
R('twp84', '2.2', 'fassung', 'Zusatzfläche je Belüftungsgerät', 'Je VA kommt 1,0 m² Fläche dazu.', [['flaeche_je_va', '1,0', 'm²']]);
R('twp84', '2.2', 'fassung', 'Mindestfläche des Schutzraums', 'Der Schutzraum misst einschliesslich VA mindestens 8 m².', [['flaeche_min', '8', 'm²']]);
R('twp84', '2.2', 'fassung', 'Mindestbreite und Mindesthöhe', 'Raumbreite und Raumhöhe betragen je mindestens 2 m.', [['breite_min', '2', 'm'], ['hoehe_min', '2', 'm']]);
R('twp84', '2.2', 'abteile', 'Schutzplätze je Abteil', 'Ein Abteil (Stahlbeton-Zwischenwand) fasst höchstens 50 Schutzplätze.', [['sp_je_abteil_max', '50', 'SP']]);
R('twp84', '2.2', 'abteile', 'Schleusenfläche', 'Schleuse bei 51–100 SP: 3,5 m²; bei 101–200 SP: 5 m². Raumhöhe der Schleuse höchstens 3,0 m.', [['schleuse_51_100', '3,5', 'm²'], ['schleuse_101_200', '5', 'm²'], ['schleuse_hoehe_max', '3,0', 'm']]);
R('twp84', '2.2 / 2.8', 'aborte', 'Anzahl und Fläche der Aborte', 'Je 30 Schutzplätze 1 Abort (Trockenabort mit BZS-Zulassung). Zusatzfläche: bis 30 SP 0 m², 31–60 SP 2 m², 61–90 SP 3 m², 91–100 SP 4 m². Separater Toilettenraum: 101–120 SP 7 m², 121–150 SP 9 m², 151–180 SP 11 m², 181–200 SP 13 m².', [['sp_je_abort', '30', 'SP'], ['abortflaeche', '≤30: 0 | 31–60: 2 | 61–90: 3 | 91–100: 4 | 101–120: 7 | 121–150: 9 | 151–180: 11 | 181–200: 13', 'm²']]);
R('twp84', '2.4', 'einr', 'Wandabstand der Liegestellen', 'Die TWP lässt einen Wandabstand der Liegestellen von mindestens 5 cm zu.', [['liegestelle_wandabstand_min', '5', 'cm']], { quelle: 'Planer-Regel TWP-2.4-02; Fundstelle in der TWP zu bestätigen' });
R('twp84', '3.1, Tab. 3.1-3', 'komp', 'Komponentenzuordnung nach Schutzplätzen', 'Bis 13 SP: VA 40 + GF 40, ESV/VF 40, ÜV/ESV 40. 14–25 SP: VA 75 + GF 75, ESV/VF 75, ÜV/ESV 75. 26–50 SP: VA 150 + GF 150, ESV/VF 150, ÜV/ESV 150.', [['bis_13_sp', 'VA 40 + GF 40 | ESV/VF 40 | ÜV/ESV 40'], ['14_25_sp', 'VA 75 + GF 75 | ESV/VF 75 | ÜV/ESV 75'], ['26_50_sp', 'VA 150 + GF 150 | ESV/VF 150 | ÜV/ESV 150']]);
R('twp84', '3.1, Tab. 3.1-3', 'luft', 'Mindestluftraten je Gerätegrösse', 'Frischluft (FRL) mindestens 80 / 150 / 300 m³/h und Filterluft (FIL) mindestens 40 / 75 / 150 m³/h für VA 40 / 75 / 150.', [['frl_min', '80 | 150 | 300', 'm³/h'], ['fil_min', '40 | 75 | 150', 'm³/h']]);
R('twp84', '3.1', 'komp', 'Massgebendes Fassungsvermögen', 'Für die Komponentenwahl zählt das effektiv vorhandene Fassungsvermögen (Fläche bzw. Volumen).', []);
R('twp84', '3.1', 'luft', 'Luftanteil je Abteil', 'Bei mehreren Abteilen erhält jedes mindestens 2/3 der erforderlichen Luftrate direkt vom zugeteilten Gerät. Der Rest darf aus dem Überschuss eines Nachbarabteils angerechnet werden, wenn dessen Luft vollständig ins Abteil abströmt.', [['luftanteil_direkt_min', '2/3']]);
R('twp84', '3.14', 'komp', 'Einbauhöhe der Ventile', 'ESV/VF und ÜV/ESV auf 1,85 m Achsmass über Boden einbauen. Bei Schleusen mindestens ein Ventil als Sprechverbindung direkt neben der Panzertüre.', [['ventil_achsmass', '1,85', 'm']]);
R('twp84', '3.1', 'abteile', 'Abluftöffnung je Abteil', 'Abluft je Abteil über eine freie Wand- oder Türöffnung von mindestens 0,05 m². Steht die VA ausnahmsweise ausserhalb des Abteils, dann bei der nächsten Luftfassung, mit Zuluftleitung unter der Decke entlang der Wände.', [['abluftoeffnung_min', '0,05', 'm²']]);
R('twp84', '3.1', 'druck', 'ÜV/ESV 40 nicht bei Schleusen', 'ÜV/ESV 40 wird bei Schleusen nicht verwendet (Druckverlust bei FRL bis 250 Pa). Stattdessen ÜV/ESV 75 oder 150 (bis 125 Pa).', [['dp_frl_uev40_max', '250', 'Pa'], ['dp_frl_uev75_150_max', '125', 'Pa']]);
R('twp84', '3.1', 'komp', 'Abluftführung', 'Ohne Schleuse: Abluft im Bereich des Eingangs (spült zugleich die Abortkabinen). Mit Schleuse: gesamte Abluft durch die Schleuse.', []);
R('twp84', '3.1', 'komp', 'ÜV/ESV 150 anstelle mehrerer ÜV/ESV 75', 'Bei mehreren VA 40/75 darf anstelle mehrerer ÜV/ESV 75 eine der Filterluftrate entsprechende Zahl ÜV/ESV 150 eingesetzt werden: 1 × ÜV/ESV 150 ersetzt 2 × ÜV/ESV 75 am gleichen Ort.', []);
R('twp84', '4', 'statik', 'Bemessung und Konstruktion', 'Kapitel 4 ist aufgehoben. Es gilt die TWK. In dieser Bibliothek nicht geregelt (Statik ausserhalb des Umfangs).', []);

// ---- TWE 1994
R('twe94', '1', 'geltung', 'Geltungsbereich', 'Erneuerung von Personenschutzräumen bis 200 Schutzplätze in Gebäuden, die vor dem 1. April 1967 erstellt wurden. Ziel: minimal erforderlicher, ausgewogener Schutz bei begrenztem Aufwand.', [['sp_max', '200', 'SP'], ['baujahr_vor', '01.04.1967']]);
R('twe94', '1.42', 'fassung', 'Fassungsvermögen früh festlegen', 'Die Schutzplatzzahl des erneuerten Schutzraums wird nach Anhang A2 bereits in der Projektierung bzw. mit der Einstufung bestimmt und in den Dokumenten angegeben.', [], { pdfSeite: '12' });
R('twe94', '2.2', 'fassung', 'Platzbedarf je Schutzplatz', 'Je Schutzplatz 1,0 m² Grundrissfläche und 2,5 m³ Rauminhalt.', [['flaeche_je_sp', '1,0', 'm²'], ['volumen_je_sp', '2,5', 'm³']]);
R('twe94', '2.2', 'abteile', 'Schleusenfläche und Schleusenvolumen', '51–75 SP: 2,5 m², höchstens 12 m³. 76–100 SP: 3,5 m² / 15 m³. 101–150 SP: 5,0 m² / 30 m³. 151–200 SP: 5,0 m² / 40 m³.', [['schleuse_51_75', '2,5 m² / 12 m³'], ['schleuse_76_100', '3,5 m² / 15 m³'], ['schleuse_101_150', '5,0 m² / 30 m³'], ['schleuse_151_200', '5,0 m² / 40 m³']]);
R('twe94', '2.6', 'luft', 'Mindestluftmengen', 'Filterbetrieb 3 m³/h je Schutzplatz, Frischluftbetrieb 6 m³/h je Schutzplatz. Bei zweigeschossigen Schutzräumen je 50 % mehr.', [['fil_je_sp', '3', 'm³/h'], ['frl_je_sp', '6', 'm³/h'], ['zuschlag_zweigeschossig', '50', '%']]);
R('twe94', '2.6', 'luft', 'Handbetrieb', 'Die minimale Luftmenge muss mit Handbetrieb gewährleistet sein.', []);
R('twe94', '2.6', 'druck', 'Raumüberdruck im Filterbetrieb', 'Im Filterbetrieb beträgt der Raumüberdruck mindestens 50 Pa (5 mm WS).', [['ueberdruck_fil_min', '50', 'Pa']]);
R('twe94', '2.6', 'komp', 'ESV und Vorfilter', 'ESV und VF mit BZS-Zulassung in der Ansaugleitung an der Schutzraumhülle oder in einer Vorfilterkammer.', []);
R('twe94', '2.6', 'komp', 'Belüftungsgerät und Gasfilter', 'VA und GF mit BZS-Zulassung. Der GF ist plombiert. Grössen GF 150, 75, 40 oder 20.', [['gf_groessen', '150 | 75 | 40 | 20']]);
R('twe94', '2.6', 'komp', 'Abluft und Schleusenventile', 'Abluft beim Eingangsbereich über ÜV/ESV nach aussen. Bei Gasschleusen sind drucklose ÜV an der Schleuseninnenwand möglich. Bei Druckschleusen genügt aussen ein ESV, wenn zwischen Schleuse und Schutzraum ein ÜV/ESV vorhanden ist.', []);
R('twe94', '2.6', 'komp', 'Zuleitung zum Gasfilter', 'Die Zuleitung zum GF ist gasdicht. Ein flexibles Leitungsstück mit Kupplung muss an den GF anschliessbar sein.', []);
R('twe94', '2.6', 'schock', 'Befestigung neuer Komponenten', 'Alle neu eingebauten Komponenten werden mit BZS-zugelassenen Dübeln befestigt.', []);
R('twe94', '2.6', 'lf', 'Luftfassungen', 'Luftfassung aus Fluchtröhre oder Notausstiegschacht; zulässig auch in Stahlbetonfassaden oder als Stahlrohrkonstruktion, an Stahlbeton verankert. Ansaugstelle mindestens 0,5 m über Terrain bzw. Schachtboden. In Mauerwerksfassaden nicht zulässig.', [['ansaughoehe_min', '0,5', 'm']]);
R('twe94', '2.7', 'fremd', 'Wasser und Abwasser', 'Ein Wasser- oder Abwasseranschluss im Schutzraum ist nicht erforderlich. Vorhandene Abwasseranschlüsse und Bodenabläufe brauchen einen Siphon.', []);
R('twe94', '2.7', 'aborte', 'Lage der Abortbereiche', 'Abortbereiche liegen in der Regel bei den Abluftöffnungen nahe dem Eingang. Vorhandene Toiletten- und Reinigungsräume können mit separater Abluftführung zum Eingang genutzt werden.', []);
R('twe94', '1.4', 'abnahme', 'Schild im Schutzraum', 'Nach der Abnahme wird an gut sichtbarer Stelle ein Schild angebracht mit Fassungsvermögen, Daten der Abnahme und der periodischen Schutzraumkontrollen.', [], { pdfSeite: '12', quelle: 'Ablauftabelle vor 1.42; Abschnittsnummer zu bestätigen' });

// ---- TWS 1982
R('tws82', '3.11', 'geltung', 'Grösse von Freifeldschutzräumen', '100–200 Schutzplätze, in bestimmten Fällen ab 50.', [['sp_min', '100 (Ausnahme 50)', 'SP'], ['sp_max', '200', 'SP']]);
R('tws82', '3.16, Tab. 3.1-1', 'fassung', 'Platzbedarf je Schutzplatz', 'Je Schutzplatz 1,0 m² und 2,5 m³, zusätzlich 1 m² je VA.', [['flaeche_je_sp', '1,0', 'm²'], ['volumen_je_sp', '2,5', 'm³'], ['flaeche_je_va', '1', 'm²']]);
R('tws82', '3.15.3, Tab. 3.1-1', 'aborte', 'Toilettenraum und Küche', 'Fläche direkt neben der Schleuse: 8 m² bis 50 SP, 9–12 m² bei 51–90 SP, 13–14 m² bei 91–120 SP, 17–18 m² bei 121–150 SP, 21–22 m² bei 151–200 SP. 1 Trockenklosett je 30 SP.', [['toilettenraum_kueche', '≤50: 8 | 51–90: 9–12 | 91–120: 13–14 | 121–150: 17–18 | 151–200: 21–22', 'm²'], ['sp_je_abort', '30', 'SP']]);
R('tws82', 'Tab. 3.1-1', 'fremd', 'Wassertank', '70 l bzw. rund 0,04 m² je Schutzplatz.', [['wasser_je_sp', '70', 'l'], ['tankflaeche_je_sp', '0,04', 'm²']]);
R('tws82', '3.12', 'fassung', 'Raumhöhe', 'Raumhöhe 2,30 bis 3,00 m. Eine Mindestbreite ist nicht geregelt.', [['hoehe_min', '2,30', 'm'], ['hoehe_max', '3,00', 'm']]);
R('tws82', 'Tab. 3.1-1, 3.2-1', 'abteile', 'Schutzplätze je Raum', 'In der Regel höchstens 50 SP je Raum, ausnahmsweise 10 % mehr.', [['sp_je_abteil_max', '50', 'SP'], ['ausnahme', '+10', '%']]);
R('tws82', '3.15.1', 'abteile', 'Schleuse', 'Immer mit Schleuse, 3,5 bis 5 m². Breite mindestens 1,50 m (PT 1) bzw. 1,70 m (PT 2).', [['schleuse_flaeche', '3,5–5', 'm²'], ['schleuse_breite_min', 'PT 1: 1,50 | PT 2: 1,70', 'm']]);
R('tws82', 'Tab. 3.1-2', 'lf', 'Notausgänge', 'Bis 50 SP: 1 trümmerfrei. 51–100 SP: 2 trümmerfrei oder 1 trümmerfrei + 1 im Trümmerbereich. 101–200 SP: 2 trümmerfrei oder 1 trümmerfrei + 2 im Trümmerbereich.', []);
R('tws82', '2.18.1, Fig. 2.1-25', 'abschl', 'Anschlagmasse der Abschlüsse', 'PT aussen, PD innen angeschlagen. a = 0,20 m, c = 1,30/1,50 m, d = 0,50 m (PD 0,45 m).', [['a', '0,20', 'm'], ['c', '1,30 / 1,50', 'm'], ['d', '0,50 (PD 0,45)', 'm']]);
R('tws82', '3.21', 'luft', 'Belüftung Freifeld', 'Nur VA 150 und VA 75. Filterluft 3 m³/h, Frischluft 6 m³/h je Schutzplatz.', [['fil_je_sp', '3', 'm³/h'], ['frl_je_sp', '6', 'm³/h']]);
R('tws82', 'Tab. 3.2-1', 'komp', 'Zuordnung der Belüftungsgeräte', 'Bis 50 SP: 1 VA 150. 51–75 SP: VA 150 + VA 75. 76–100 SP: 2 VA 150. 101–150 SP: 3 VA 150. 151–200 SP: 4 VA 150.', [['va_zuordnung', '≤50: 1×150 | 51–75: 150+75 | 76–100: 2×150 | 101–150: 3×150 | 151–200: 4×150']]);
R('tws82', '3.21', 'komp', 'Abluftführung Freifeld', 'Bis 100 SP strömt die gesamte Abluft durch Toilettenraum/Küche und Schleuse, darüber mindestens 2/3.', []);
R('tws82', '3.21', 'lf', 'Luftfassung je Gerät', 'Je VA eine eigene Luftfassung, höchstens 2 je Fluchtröhre bzw. trümmerfreiem Notausstieg.', []);
R('tws82', '2.22', 'abteile', 'Schleusenspülung', 'Ein vierfacher Luftwechsel senkt die Konzentration auf rund 1–2 %. Luftwechselrate im Filterbetrieb mindestens 20/h (bis 400 SP) bzw. 40/h (über 400 SP). Die Spülzeit für 4 Luftwechsel wird in der Schleuse angeschrieben.', [['luftwechsel_spuelung', '4'], ['luftwechselrate_min', '≤400 SP: 20 | >400 SP: 40', '1/h']], { quelle: '2.22 steht im Kapitel Tiefgaragen; 3.21 verweist nur auf 2.21 – Geltung für Freifeld zu bestätigen' });
R('tws82', '2.21.2', 'luft', 'Belüftungsunterbruch', 'Bei 2,5 m³ je Person sind nach rund 3 h 2,5 Vol.-% CO₂ erreicht, nach rund 5 h 4,5 Vol.-%.', []);
R('tws82', '2', 'luft', 'Luftmengen Tiefgaragen', 'Tiefgaragen 201–2000 SP mit VA 300 bzw. zentraler Belüftung mit GF 600: Filterluft mindestens 4,5 m³/h, Frischluft mindestens 9 m³/h je Schutzplatz.', [['fil_je_sp', '4,5', 'm³/h'], ['frl_je_sp', '9', 'm³/h']]);
R('tws82', '3.23', 'elektro', 'Elektro Freifeld', 'Kein Notstrom, kein EMP-Schutz. Als Notbeleuchtung dient jene der Kleinbelüftungsgeräte.', []);

// ---- TW Schock 2021
R('schock21', '', 'schock', 'Grenzwerte je Schutzgrad', 'Basisschutz 1 bar: s_max 0,10 m, v_max 1,0 m/s, a_max 125 m/s². 3 bar: 0,25 m, 1,6 m/s, 160 m/s².', [['basis_1bar', 's 0,10 m | v 1,0 m/s | a 125 m/s²'], ['3bar', 's 0,25 m | v 1,6 m/s | a 160 m/s²']]);
R('schock21', '', 'schock', 'Vereinfachter Nachweis', 'F = m · a_max · DLF mit DLF 1,25 (Basisschutz) bzw. 1,6 (3 bar). Je Dübel: S = F/n · √(1 + 4 (h_z/b)²) und N_z = (F − G)/n. Bedingung: R_d,Schock ≥ S_d,Schock.', [['dlf_basis', '1,25'], ['dlf_3bar', '1,6']]);
R('schock21', '', 'schock', 'Zugelassene Dübel', 'Teile über 10 kg nur mit BABS-zugelassenen Dübeln (ZKDB). Montageanleitung und Datenschild nennen Dübeltyp, Anzahl, Schwingweg und Wandabstand.', [['masse_grenze', '10', 'kg']]);
R('schock21', 'Anhang A1', 'schock', 'Prüfpflichtige Teile', 'Prüfpflichtig («Überleben»): VA 40–300, GF, ESV/VF und ÜV/ESV. Liegestellen nach TPH-16/17 ebenfalls, Verformung zulässig. Trennwände bis 80 kg/lfm sind nicht prüfpflichtig.', []);
R('schock21', 'Anhang A2', 'schock', 'Befestigungstabelle', 'Kanalbefestigungen alle 1,5 m. Beispiel aus der Befestigungstabelle: Standklosett mit 2 Dübeln à 0,8 kN.', [['kanalbefestigung_abstand', '1,5', 'm']]);

// ---- TPH
R('tph04', '', 'druck', 'Überdruck und Einsatzgrenze', 'ÜV/ESV sichern im Filterbetrieb mindestens 50 Pa Überdruck; obere Einsatzgrenze 250 Pa.', [['ueberdruck_fil_min', '50', 'Pa'], ['einsatzgrenze', '250', 'Pa']]);
R('tph04', '5.2.2', 'druck', 'Druckverlust im Frischluftbetrieb', 'ÜV/ESV 75/150: höchstens 150 Pa. ÜV/ESV 40: höchstens 250 Pa, deshalb nur in Schutzräumen ohne Schleuse zulässig.', [['dp_frl_uev75_150_max', '150', 'Pa'], ['dp_frl_uev40_max', '250', 'Pa']]);
R('tph04', '', 'schock', 'Druckstoss Basisschutz', 'pe 1,0 bar, pr 2,7–3,3 bar. Restluftstoss ESV/VF mit Gehäuse höchstens 0,6 bar.', []);
R('tph04', '', 'komp', 'Prallplatte, Schutzgitter, Einbau', 'Prallplatte höchstens 60 Pa. Schutzgitter mit Maschenweite 10–12 mm. ESV auch an der Decke zulässig. Für den Vorfilterwechsel genügt 1 m Abstand zur Gegenwand. Befestigung mit BZS-zugelassenen Dübeln oder Mauerkasten (Mauerkasten vorzuziehen).', []);
R('tph06', '', 'druck', 'Strömungswiderstand Gasfilter', 'GF 40/75/150: höchstens 600 Pa bei Nennluftmenge. GF 300: 650 Pa. GF 600: 800 ± 40 Pa.', [['dp_gf_40_150_max', '600', 'Pa'], ['dp_gf_300', '650', 'Pa'], ['dp_gf_600', '800 ± 40', 'Pa']]);
R('tph06', '', 'komp', 'Aktivkohle und Gehäusedichtheit', 'Je m³/h Filterluft mindestens 0,44 l Aktivkohle. Gehäusedichtheit bei ± 3000 Pa: höchstens 20 Pa/min.', [['aktivkohle_je_m3h', '0,44', 'l']]);
R('tph11', '', 'luft', 'Luftmengen der Kleinbelüftungsgeräte', 'FIL = Nennluftmenge, FRL mindestens 2 × Nennluftmenge, Notbetrieb = Nennluftmenge (VA 300: 200 m³/h).', []);
R('tph11', '', 'druck', 'Mindestdruck und Kurbelleistung', 'Statischer Mindestdruck: FIL 1100 Pa, FRL 700 Pa. Leistung an der Kurbel inkl. Notbeleuchtung: VA 40 höchstens 65 W, VA 75 höchstens 85 W, VA 150 höchstens 135 W.', [['druck_fil_min', '1100', 'Pa'], ['druck_frl_min', '700', 'Pa'], ['kurbelleistung_max', 'VA 40: 65 | VA 75: 85 | VA 150: 135', 'W']]);
R('tph11', '', 'komp', 'Schall und Luftmengenmesser', 'Schall höchstens 70 dB(A). Luftmengenmesser ± 10 %, höchstens 60 Pa Widerstand.', [['schall_max', '70', 'dB(A)']]);
R('tph14', '', 'aborte', 'Notabort-Sets', 'Sets für 8, 15 oder 30 Personen und 14 Tage. Entleerung alle 2 Tage, 1,5 l je Person und Tag.', []);
R('tph15', '', 'einr', 'Personalliegestellen', 'Matratze 190 × 70 × 8 cm, Tragkraft 300 kg, am Boden befestigt.', []);
R('tph16', '', 'einr', 'Stapelbare Liegestellen', 'Raumhöhe TWS mindestens 2,30 m, in TWP ab 2,20 m. Wandabstand 10 cm. Sprosse 35–40 cm ab Boden. Sicherungsbügel bei über 20 cm Wandabstand. Lager: höchstens 2 Gestelle je rund 150 Plätze.', [['liegestelle_wandabstand', '10', 'cm']]);
R('tph17', '', 'einr', 'Liegestellen TWP', 'Dreistöckig, oberste Liegefläche 1,40 m, lichte Höhe mindestens 60 cm. Raumhöhe mindestens 2,00 m. Frei stehend, ringsum 10 cm Wandabstand, Kippsicherung, Schocklast 100 kg je Bett.', [['liegestelle_wandabstand', '10', 'cm']]);

// ---- ANDAIR 2026 (Schicht, noch nicht freigegeben)
const idWand = regeln.find(r => r.titel === 'Wandabstand der Liegestellen').id;
const idUev = regeln.find(r => r.titel === 'ÜV/ESV 40 nicht bei Schleusen').id;
const andair = [
  R('andair26', '', 'abteile', 'Schleusenspülung mit 5 Luftwechseln', 'Für die Spülzeit der Schleuse rechnet ANDAIR mit 5 Luftwechseln.', [['luftwechsel_spuelung', '5']], { art: 'ergaenzen', begruendung: 'Die TWP nennt keinen Wert; bisherige ANDAIR-Annahme im Planer.', quelle: 'Planer v0.24.0 – von ANDAIR zu bestätigen' }),
  R('andair26', '', 'einr', 'Wandabstand: 5 cm oder 10 cm?', 'TPH-16 und TPH-17 verlangen 10 cm Wandabstand, die TWP lässt 5 cm zu. Welcher Wert gilt für ANDAIR-Auslegungen?', [], { art: 'kommentar', zielId: idWand, basisRev: 1, begruendung: 'Offene Frage aus der Quellenauswertung.', quelle: 'Planer-Regel TWP-2.4-02' }),
  R('andair26', '', 'druck', 'Druckverlust ÜV/ESV 75/150: 125 Pa oder 150 Pa?', 'Beide Werte stehen so in den Originalen, im PDF nachgelesen: Die TWP 1984 nennt höchstens 125 Pa (PDF-Seite 64), das jüngere TPH-04 von 2016 in 5.2.2 höchstens 150 Pa (PDF-Seite 11). Zu entscheiden ist, gegen welchen Wert ANDAIR-Auslegungen geprüft werden.', [], { art: 'kommentar', zielId: idUev, basisRev: 1, begruendung: 'TWP 1984 und TPH-04 nennen verschiedene Grenzwerte.', quelle: 'TWP 1984, PDF-Seite 64; TPH-04, 5.2.2, PDF-Seite 11' }),
];
const entwurfIds = andair.map(r => r.id);

// Fundstellen im Original-PDF (Stichwortsuche vom 20.11.2026, nicht Zeile für Zeile geprüft)
const SEITEN = { twp84: { 'ÜV/ESV 40 nicht bei Schleusen': '64' }, tph04: { 'Überdruck und Einsatzgrenze': '12', 'Druckverlust im Frischluftbetrieb': '11', 'Prallplatte, Schutzgitter, Einbau': '17' }, tph06: { 'Strömungswiderstand Gasfilter': '5', 'Aktivkohle und Gehäusedichtheit': '10' }, tph11: { 'Luftmengen der Kleinbelüftungsgeräte': '4', 'Mindestdruck und Kurbelleistung': '6', 'Schall und Luftmengenmesser': '4' }, tph14: { 'Notabort-Sets': '5' }, tph15: { 'Personalliegestellen': '5' }, tph16: { 'Stapelbare Liegestellen': '9' }, tph17: { 'Liegestellen TWP': '5' } };
Object.keys(SEITEN).forEach(w => Object.keys(SEITEN[w]).forEach(t => { const r = regeln.find(x => x.werkId === w && x.titel === t); if (!r) throw new Error('Regel fehlt: ' + t); r.pdfSeite = SEITEN[w][t]; }));

// ---- Glossar
// Verzeichnisse mit sauberer Textebene werden beim Erfassen aus dem PDF gelesen (Zeilen «Abkürzung Bedeutung»).
const glossarAuto = [{ werkId: 'aw25', seite: 47 }, { werkId: 'awkgsr25', seite: 30 }, { werkId: 'konzept23', seite: 55 }, { werkId: 'tsp21', seite: 4 }];
// Verzeichnisse der gescannten Weisungen: aus dem OCR-Text von Hand übertragen, Lesefehler berichtigt. Nicht am Original geprüft.
const glossarHand = [
  { werkId: 'twp84', seite: 78, liste: [['AL', 'Abluft'], ['BF', 'Bodenfläche'], ['BMG', 'Bundesgesetz über die baulichen Massnahmen im Zivilschutz'], ['BMV', 'Verordnung über die baulichen Massnahmen im Zivilschutz'], ['BZS', 'Bundesamt für Zivilschutz, Bern'], ['ESV', 'Explosionsschutzventil'], ['FIL', 'Filterbetrieb (Gasfilter eingeschaltet)'], ['FRL', 'Frischluftbetrieb'], ['FR', 'Fluchtröhre'], ['GF', 'Gasfilter'], ['GZP', 'Weisungen für die Generelle Zivilschutzplanung in der Gemeinde'], ['H, H/2', 'Traufhöhe bzw. halbe Traufhöhe des Gebäudes'], ['LF', 'Luftfassung'], ['List', 'Liegestelle'], ['MZS', 'Mitteilungsblatt des Zivilschutzes'], ['NA', 'Notausstieg'], ['NW', 'Nennweite'], ['OK', 'Oberkant'], ['PD', 'Panzerdeckel'], ['PSR', 'Personenschutzraum'], ['PT', 'Panzertüre'], ['S', 'Schleuse'], ['SP', 'Schutzplatz'], ['SR', 'Schutzraum'], ['SRHB', 'Schutzraumhandbuch'], ['TA BSR', 'Technische Anleitung für die Herrichtung von Behelfsschutzräumen'], ['TC', 'Trockenklosett'], ['TWO', 'Technische Weisungen für die Schutzanlagen der Organisation und des Sanitätsdienstes'], ['TWP', 'Technische Weisungen für den Pflicht-Schutzraumbau'], ['TWS', 'Technische Weisungen für Spezielle Schutzräume'], ['UK', 'Unterkant'], ['ÜV', 'Überdruckventil'], ['VA', 'Belüftungsgerät (Ventilationsaggregat)'], ['VF', 'Vorfilter'], ['WC', 'Wasserklosett'], ['ZS', 'Zivilschutz']] },
  { werkId: 'twe94', seite: 69, liste: [['TWP', 'Technische Weisungen für den Pflicht-Schutzraumbau'], ['BZS', 'Bundesamt für Zivilschutz'], ['A+L', 'Abteilung Luftschutz (frühere Dienstabteilung für den Schutzbau)'], ['ZSO', 'Zivilschutzorganisation (der Gemeinde)'], ['ZS', 'Zivilschutz'], ['SP', 'Schutzplatz'], ['SR', 'Schutzraum'], ['S', 'Schleuse'], ['Re', 'Reinigung'], ['WC', 'Wasserklosett'], ['TC', 'Trockenklosett'], ['ÜV', 'Überdruckventil'], ['ESV', 'Explosionsschutzventil'], ['VF', 'Vorfilter'], ['VA', 'Ventilationsaggregat'], ['GF', 'Gasfilter'], ['NA', 'Notausstieg'], ['FR', 'Fluchtröhre'], ['FK', 'Fluchtkamin'], ['LF', 'Luftfassung'], ['PT', 'Panzertüre (200 mm dick)'], ['MPT', 'mittlere Panzertüre (150 mm dick)'], ['PD', 'Panzerdeckel (200 mm dick)'], ['GD', 'Gasschutzdeckel (Stahlblechdeckel)'], ['DT', 'Drucktüre'], ['h', 'Symbol für die Dicke eines Bauteils (Abmessung)'], ['WS', 'Wassersäule'], ['NW', 'Nennweite']] },
];
// Zeilen «ABK Bedeutung» nach der Kopfzeile lesen; Fortsetzungszeilen gehören zur vorherigen Bedeutung.
function glossarAus(roh) {
  const z = String(roh).split('\n').map(x => x.trim()).filter(Boolean), i0 = z.findIndex(x => /^Abkürzung\s+(Bedeutung|Beschreibung|Bezeichnung)/.test(x)), out = [];
  if (i0 < 0) return out;
  const istAbk = t => (/^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9&/+\-]*$/.test(t) && t.length <= 8) || ['SiNa', 'SuG', 'WeZS', 'Schock', 'QS'].includes(t);
  for (const zeile of z.slice(i0 + 1)) {
    const w = zeile.split(/\s+/); let k = 0; while (k < w.length - 1 && k < 3 && istAbk(w[k]) && (k === 0 || /^\d{4}$/.test(w[k]) || ['Schock', 'QS'].includes(w[k]))) k++;
    if (k >= 1 && /[A-ZÄÖÜ]/.test(w[0])) out.push([w.slice(0, k).join(' '), w.slice(k).join(' ')]); else if (out.length && !/^\d+\/\d+$/.test(zeile)) out[out.length - 1][1] += ' ' + zeile;
  }
  return out;
}

module.exports = { THEMEN, herausgeber, werke, verknuepfungen, regeln, entwurfIds, pdfs, glossarAuto, glossarHand, glossarAus };
