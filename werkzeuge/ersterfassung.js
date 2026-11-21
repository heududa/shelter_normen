// Ersterfassung: erzeugt daten/bibliothek.json, daten/texte.json und daten/titelbilder.json aus den PDF in pdf/ und aus ersterfassung_daten.js.
// Aufruf im Ordner des Repos: node werkzeuge/ersterfassung.js --ueberschreiben
// ACHTUNG: ersetzt den Bearbeitungsstand. Ohne --ueberschreiben bricht das Skript ab, wenn schon Daten vorhanden sind.
const fs = require('fs'), path = require('path');
const d = require('./ersterfassung_daten.js'), app = require('../app.js'), crypto = require('crypto');
if (fs.existsSync('daten/bibliothek.json') && !process.argv.includes('--ueberschreiben')) { console.error('daten/bibliothek.json ist vorhanden. Mit --ueberschreiben wird der Bearbeitungsstand ersetzt.'); process.exit(1); }
const pdfjsNode = require('pdfjs-dist/legacy/build/pdf.js');
(async () => {
const VERSION = '0.9.0';
const lib = {
  schema: 1, meta: { titel: 'Normenbibliothek Schutzraum', programm: VERSION, erstellt: '2026-11-20', bearbeiter: '' },
  themen: d.THEMEN, herausgeber: d.herausgeber, werke: d.werke, verknuepfungen: d.verknuepfungen, regeln: d.regeln, anmerkungen: [], dokumente: [], titelbilder: {}, seitentext: {}, aenderungen: [], struktur: {}, formate: [], glossar: [], abschnitte: [], versionen: [], verlauf: [],
};
// Original-PDF aus pdf/ erfassen: Prüfsumme, Seitenmasse, Seitentext, Struktur und Titelbild.
const zaehler = {}, texte = {}, rohSeiten = {};
for (const q of d.pdfs) {
  const bytes = fs.readFileSync(path.join('pdf', q.datei)), w = lib.werke.find(x => x.id === q.werkId);
  const n = zaehler[w.id] = (zaehler[w.id] || 0) + 1, id = `d-${w.id}-${n}`;
  const doc = await pdfjsNode.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const modus = q.text === undefined ? (doc.numPages <= 6 ? 'seiten' : 'nummern') : q.text;
  const masse = [], seitenT = [], zeilen = []; let txt = '', zeichen = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i), v = page.getViewport({ scale: 1 }); masse.push([Math.round(v.width), Math.round(v.height)]);
    const c = await page.getTextContent(), t = c.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join(''); seitenT.push(app.fliesstext(t)); (rohSeiten[id] = rohSeiten[id] || []).push(t); zeilen.push(app.zeilenAus(c.items, v.height));
    if (modus) { zeichen += t.replace(/\s/g, '').length; txt += `## PDF-Seite ${i}\n${t}\n\n`; }
    page.cleanup();
  }
  await doc.destroy();
  lib.seitentext[id] = seitenT; lib.struktur[id] = app.erkenneStruktur(zeilen);
  lib.dokumente.push({ id, werkId: w.id, teil: q.teil, datei: path.basename(q.datei), groesse: bytes.length, pruefsumme: crypto.createHash('sha256').update(bytes).digest('hex'), seiten: masse.length, masse, datum: '2026-11-20', name: 'Ersterfassung', pfad: 'pdf/' + q.datei });
  // Titelbild für die Startseite: Seite 1, 260 px breit (pdftoppm aus poppler)
  try { const tmp = path.join(require('os').tmpdir(), 'nb-titel'); require('child_process').execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to-x', '260', '-scale-to-y', '-1', '-jpeg', '-jpegopt', 'quality=72', path.join('pdf', q.datei), tmp]); lib.titelbilder[id] = 'data:image/jpeg;base64,' + fs.readFileSync(tmp + '.jpg').toString('base64'); } catch (e) { console.log('  ohne Titelbild:', q.datei); }
  let na = 0;
  if (modus && zeichen >= 200) {
    let teile = app.teileText(txt, modus); if (teile.length < 5) teile = app.teileText(txt, 'seiten');
    lib.abschnitte.push(...teile.map((t, i) => Object.assign({ id: id + '-a' + (i + 1), werkId: w.id, dokId: id }, t))); na = teile.length;
    const x = texte[w.id] = texte[w.id] || { dateien: [], txt: '', n: 0 }; x.dateien.push(path.basename(q.datei)); x.txt += txt; x.n += na;
  }
  console.log((w.kurz + (q.teil ? ' / ' + q.teil : '')).slice(0, 58).padEnd(60), String(masse.length).padStart(4) + ' S.', na ? na + ' Abschnitte' : 'ohne Text');
}
Object.keys(texte).forEach(id => { const x = texte[id]; lib.werke.find(w => w.id === id).import = { datum: '2026-11-20', name: 'Ersterfassung', datei: x.dateien.join(', ') + ' (Text aus dem PDF)', pruefsumme: crypto.createHash('sha256').update(x.txt).digest('hex'), abschnitte: x.n }; });
// Glossar aus den Abkürzungsverzeichnissen
let gnr = 0; const gEin = (werkId, seite, paare) => { const dk = lib.dokumente.find(x => x.werkId === werkId); paare.forEach(([begriff, bedeutung]) => lib.glossar.push({ id: 'g' + String(++gnr).padStart(4, '0'), begriff, bedeutung, werkId, dokId: dk ? dk.id : '', seite: String(seite), geprueft: null, autor: 'Ersterfassung', datum: '2026-11-20', zurueckgezogen: false })); };
d.glossarAuto.forEach(q => { const dk = lib.dokumente.find(x => x.werkId === q.werkId), paare = d.glossarAus((rohSeiten[dk.id] || [])[q.seite - 1] || ''); console.log('Glossar', q.werkId, 'S.', q.seite, paare.length, 'Einträge'); gEin(q.werkId, q.seite, paare); });
d.glossarHand.forEach(q => gEin(q.werkId, q.seite, q.liste));
// Version 1 = Ersterfassung ohne die ANDAIR-Einträge; diese bleiben offene Änderungen.
const entwurf = lib.regeln.filter(r => d.entwurfIds.includes(r.id));
lib.regeln = lib.regeln.filter(r => !d.entwurfIds.includes(r.id));
app.neueVersion(lib, 'Ersterfassung', 'Ersterfassung: Regeln und Glossar aus dem Projektwissen (OCR-Auswertung), 97 Original-PDF des BABS im Ordner pdf/ (TWS 1982 und TWO 1977 zu je einem PDF zusammengefügt). Kein Wert am Original geprüft.', '2026-11-20');
lib.regeln = lib.regeln.concat(entwurf);
const kern = {}; Object.keys(lib).forEach(k => { if (!['seitentext', 'abschnitte', 'struktur', 'titelbilder'].includes(k)) kern[k] = lib[k]; });
fs.mkdirSync('daten', { recursive: true });
fs.writeFileSync('daten/bibliothek.json', JSON.stringify(kern, null, 1));
fs.writeFileSync('daten/texte.json', JSON.stringify({ seitentext: lib.seitentext, abschnitte: lib.abschnitte, struktur: lib.struktur }));
fs.writeFileSync('daten/titelbilder.json', JSON.stringify(lib.titelbilder));
['bibliothek', 'texte', 'titelbilder'].forEach(n => console.log('daten/' + n + '.json', (fs.statSync('daten/' + n + '.json').size / 1024).toFixed(0) + ' kB'));
console.log(lib.werke.length + ' Werke, ' + lib.dokumente.length + ' PDF, ' + lib.regeln.length + ' Regeln, ' + lib.glossar.length + ' Glossareinträge');
})();
