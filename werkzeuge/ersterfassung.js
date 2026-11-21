// Ersterfassung: erzeugt daten/bibliothek.json, daten/texte.json und daten/titelbilder.json aus den PDF in pdf/ und aus ersterfassung_daten.js.
// Aufruf im Ordner des Repos: node werkzeuge/ersterfassung.js --ueberschreiben
// ACHTUNG: ersetzt den Bearbeitungsstand. Ohne --ueberschreiben bricht das Skript ab, wenn schon Daten vorhanden sind.
const fs = require('fs'), path = require('path');
const d = require('./ersterfassung_daten.js'), app = require('../app.js'), crypto = require('crypto');
if (fs.existsSync('daten/bibliothek.json') && !process.argv.includes('--ueberschreiben')) { console.error('daten/bibliothek.json ist vorhanden. Mit --ueberschreiben wird der Bearbeitungsstand ersetzt.'); process.exit(1); }
const pdfjsNode = require('pdfjs-dist/legacy/build/pdf.js');
(async () => {
const VERSION = '0.10.0';
const lib = {
  schema: 1, meta: { titel: 'Normenbibliothek Schutzraum', programm: VERSION, erstellt: '2026-11-20', bearbeiter: '' },
  themen: d.THEMEN, herausgeber: d.herausgeber, werke: d.werke, verknuepfungen: d.verknuepfungen, regeln: d.regeln, anmerkungen: [], dokumente: [], titelbilder: {}, seitentext: {}, elemente: {}, unsicher: {}, ocr: {}, aenderungen: [], struktur: {}, formate: [], uebernahmen: [], glossar: [], abschnitte: [], versionen: [], verlauf: [],
};
// Original-PDF aus pdf/ erfassen: Prüfsumme, Seitenmasse, Seitentext, Struktur und Titelbild.
const zaehler = {}, texte = {}, rohSeiten = {}, erfasst = [];
for (const q of d.pdfs) {
  const bytes = fs.readFileSync(path.join('pdf', q.datei)), w = lib.werke.find(x => x.id === q.werkId);
  const n = zaehler[w.id] = (zaehler[w.id] || 0) + 1, id = `d-${w.id}-${n}`;
  const doc = await pdfjsNode.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const masse = [], seitenT = [], zeilen = [], roh = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i), v = page.getViewport({ scale: 1 }); masse.push([Math.round(v.width), Math.round(v.height)]);
    const c = await page.getTextContent(), t = c.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join(''); seitenT.push(app.fliesstext(t)); roh.push(t); zeilen.push(app.zeilenAus(c.items, v.height));
    page.cleanup();
  }
  await doc.destroy();
  lib.dokumente.push({ id, werkId: w.id, teil: q.teil, datei: path.basename(q.datei), groesse: bytes.length, pruefsumme: crypto.createHash('sha256').update(bytes).digest('hex'), seiten: masse.length, masse, datum: '2026-11-20', name: 'Ersterfassung', pfad: 'pdf/' + q.datei });
  // Titelbild für die Startseite: Seite 1, 260 px breit (pdftoppm aus poppler)
  try { const tmp = path.join(require('os').tmpdir(), 'nb-titel'); require('child_process').execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to-x', '260', '-scale-to-y', '-1', '-jpeg', '-jpegopt', 'quality=72', path.join('pdf', q.datei), tmp]); lib.titelbilder[id] = 'data:image/jpeg;base64,' + fs.readFileSync(tmp + '.jpg').toString('base64'); } catch (e) { console.log('  ohne Titelbild:', q.datei); }
  erfasst.push({ q, w, id, seitenT, zeilen, roh, alt: roh.slice(), ocr: null });
}
// Gescannte Seiten: Text, Tabellen und Skizzen aus der neuen Texterkennung (werkzeuge/ocr.py, Dateien in daten/ocr/)
const bericht = [];
for (const e of erfasst) {
  const f = path.join('daten', 'ocr', e.id + '.json'); if (!fs.existsSync(f)) continue;
  const o = JSON.parse(fs.readFileSync(f, 'utf8')), dk = lib.dokumente.find(x => x.id === e.id);
  if (o.pruefsumme !== dk.pruefsumme) { console.log('  Texterkennung passt nicht zum PDF, übersprungen:', e.id); continue; }
  e.ocr = o; lib.elemente[e.id] = []; lib.unsicher[e.id] = {};
  o.seiten.forEach(p => { e.seitenT[p.s - 1] = p.text; e.zeilen[p.s - 1] = p.zeilen; e.roh[p.s - 1] = p.roh; });
}
// Wortschatz aus allen Texten: für Umlaute, die der Scan verschluckt hat (Oltank statt Öltank)
const wortschatz = new Map(), RW = /([A-Za-zÄÖÜäöüß]+)/;
erfasst.forEach(e => e.seitenT.forEach(t => t.split(RW).forEach((x, i) => { if (i % 2 && x.length >= 4) wortschatz.set(x, (wortschatz.get(x) || 0) + 1); })));
const UML = { O: 'Ö', U: 'Ü', A: 'Ä', o: 'ö', u: 'ü', a: 'ä' }; let umlaute = 0; const umlautListe = new Map();
function umlaut(wort) {
  if (wort.length < 4 || /[ÄÖÜäöü]/.test(wort)) return wort;
  const n = wortschatz.get(wort) || 0; let best = wort, bn = Math.max(3, n * 6);
  for (let i = 0; i < wort.length; i++) { const u = UML[wort[i]]; if (!u || (i > 0 && wort[i] === wort[i].toUpperCase())) continue; const k = wort.slice(0, i) + u + wort.slice(i + 1), kn = wortschatz.get(k) || 0; if (kn >= bn) { best = k; bn = kn; } }
  return best;
}
const mitUmlaut = t => String(t).split(RW).map((x, i) => { if (!(i % 2)) return x; const k = umlaut(x); if (k !== x) { umlaute++; umlautListe.set(x + ' → ' + k, (umlautListe.get(x + ' → ' + k) || 0) + 1); } return k; }).join('');
// Zahlen, die die frühere Erkennung (Textebene des PDF) anders gelesen hat, gelten als unsicher
const zahlen = t => { const m = new Map(); String(t).split(/\s+/).forEach(x => { const k = x.replace(/[^0-9A-Za-zÄÖÜäöü.,/\-]/g, '').replace(/^[.,\-]+|[.,\-]+$/g, ''); if (/\d/.test(k)) m.set(k, (m.get(k) || 0) + 1); }); return m; };
for (const e of erfasst) {
  if (!e.ocr) continue;
  let nT = 0, nS = 0, nU = 0, conf = 0;
  e.ocr.seiten.forEach(p => {
    const i = p.s - 1;
    e.seitenT[i] = mitUmlaut(e.seitenT[i]); e.roh[i] = mitUmlaut(e.roh[i]); e.zeilen[i].forEach(z => { z.t = mitUmlaut(z.t); });
    const els = p.elemente.map(x => { const el = { nr: p.s + '.' + x.nr, s: p.s, typ: x.typ, box: x.box }; if (x.typ === 'tabelle') { el.zeilen = x.zeilen.map(z => z.map(mitUmlaut)); if (x.ohneKopf) el.ohneKopf = true; nT++; } else { el.text = mitUmlaut(x.text || ''); if (x.tab) el.tab = true; nS++; } return el; });
    lib.elemente[e.id].push(...els);
    const alt = zahlen(e.alt[i]), un = new Set(p.unsicher.map(mitUmlaut));
    const neuT = e.seitenT[i].replace(/\[\[[^\]]*\]\]/g, ' ') + ' ' + els.map(x => x.typ === 'tabelle' ? x.zeilen.map(z => z.join(' ')).join(' ') : '').join(' ');
    if (e.alt[i].replace(/\s/g, '').length > 40) zahlen(neuT).forEach((n, k) => { if ((alt.get(k) || 0) < n) neuT.split(/\s+/).forEach(x => { if (x.replace(/[^0-9A-Za-zÄÖÜäöü.,/\-]/g, '').replace(/^[.,\-]+|[.,\-]+$/g, '') === k) un.add(x); }); });
    if (un.size) { lib.unsicher[e.id][p.s] = [...un].sort(); nU += un.size; }
    conf += p.conf;
  });
  lib.ocr[e.id] = { werkzeug: e.ocr.werkzeug, seiten: e.ocr.seiten.length, datum: '2026-11-21', sicherheit: +(conf / e.ocr.seiten.length).toFixed(1), tabellen: nT, skizzen: nS, unsicher: nU };
  bericht.push({ dok: e.id, norm: e.w.kurz, teil: e.q.teil || '', seiten: e.ocr.seiten.length, sicherheit: lib.ocr[e.id].sicherheit, tabellen: nT, skizzen: nS, unsicher: nU, schwach: e.ocr.seiten.filter(p => p.conf < 80 && p.worte > 20).map(p => p.s) });
}
console.log('Umlaute berichtigt:', umlaute, [...umlautListe].sort((a, b) => b[1] - a[1]).slice(0, 40).map(x => x[0] + ' (' + x[1] + ')').join(', '));
// Struktur und Abschnitte
for (const e of erfasst) {
  const { q, w, id } = e, modus = q.text === undefined ? (e.seitenT.length <= 6 ? 'seiten' : 'nummern') : q.text;
  let txt = '', zeichen = 0;
  if (modus) e.roh.forEach((t, i) => { zeichen += t.replace(/\s/g, '').length; txt += `## PDF-Seite ${i + 1}\n${t}\n\n`; });
  lib.seitentext[id] = e.seitenT; lib.struktur[id] = app.erkenneStruktur(e.zeilen); rohSeiten[id] = e.roh;
  let na = 0;
  if (modus && zeichen >= 200) {
    let teile = app.teileText(txt, modus); if (teile.length < 5) teile = app.teileText(txt, 'seiten');
    lib.abschnitte.push(...teile.map((t, i) => Object.assign({ id: id + '-a' + (i + 1), werkId: w.id, dokId: id }, t))); na = teile.length;
    const x = texte[w.id] = texte[w.id] || { dateien: [], txt: '', n: 0 }; x.dateien.push(path.basename(q.datei)); x.txt += txt; x.n += na;
  }
  console.log((w.kurz + (q.teil ? ' / ' + q.teil : '')).slice(0, 58).padEnd(60), String(e.seitenT.length).padStart(4) + ' S.', na ? na + ' Abschnitte' : 'ohne Text', e.ocr ? '· neu erkannt: ' + e.ocr.seiten.length + ' S.' : '');
}
fs.writeFileSync(path.join('daten', 'ocr', 'bericht.json'), JSON.stringify({ datum: '2026-11-21', umlaute, dokumente: bericht }, null, 1));
Object.keys(texte).forEach(id => { const x = texte[id]; lib.werke.find(w => w.id === id).import = { datum: '2026-11-20', name: 'Ersterfassung', datei: x.dateien.join(', ') + ' (Text aus dem PDF)', pruefsumme: crypto.createHash('sha256').update(x.txt).digest('hex'), abschnitte: x.n }; });
// Jede Norm mit PDF beginnt als «Ungeprüft»: Die digitale Fassung ist noch nicht mit dem Original verglichen.
lib.werke.forEach(w => { if (lib.dokumente.some(x => x.werkId === w.id)) w.digital = { status: 'ungeprueft' }; });
lib.meta.pruefer = [];
// Glossar aus den Abkürzungsverzeichnissen
let gnr = 0; const gEin = (werkId, seite, paare) => { const dk = lib.dokumente.find(x => x.werkId === werkId); paare.forEach(([begriff, bedeutung]) => lib.glossar.push({ id: 'g' + String(++gnr).padStart(4, '0'), begriff, bedeutung, werkId, dokId: dk ? dk.id : '', seite: String(seite), geprueft: null, autor: 'Ersterfassung', datum: '2026-11-20', zurueckgezogen: false })); };
d.glossarAuto.forEach(q => { const dk = lib.dokumente.find(x => x.werkId === q.werkId), paare = d.glossarAus((rohSeiten[dk.id] || [])[q.seite - 1] || ''); console.log('Glossar', q.werkId, 'S.', q.seite, paare.length, 'Einträge'); gEin(q.werkId, q.seite, paare); });
d.glossarHand.forEach(q => gEin(q.werkId, q.seite, q.liste));
// Abkürzungen, die im Lauftext eingeführt werden, zum Beispiel «Explosionsschutzventil (ESV)». Je Norm die erste Fundstelle.
const schon = new Set(lib.glossar.map(g => g.begriff + '|' + g.werkId)); let ausText = 0;
const reAbk = /((?:[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-]*)(?:[ ][A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-]*){0,5})[ ]\(([A-ZÄÖÜ][A-Za-zÄÖÜ]{1,7})\)/g;
function bedeutungZu(phrase, abk) { // kürzeste Wortfolge am Ende der Phrase, deren Buchstaben die Abkürzung der Reihe nach enthalten und die mit ihrem ersten Buchstaben beginnt
  const w = phrase.split(' '), ziel = abk.toLowerCase();
  for (let i = w.length - 1; i >= 0; i--) {
    if (w[i][0].toLowerCase() !== ziel[0] || !/^[A-ZÄÖÜ]/.test(w[i])) continue;
    const t = w.slice(i).join(' ').toLowerCase(); let k = 0; for (const c of t) { if (c === ziel[k]) k++; if (k === ziel.length) break; }
    if (k === ziel.length && t.replace(/[^a-zäöüß]/g, '').length >= ziel.length + 3) return w.slice(i).join(' ');
  }
  return '';
}
lib.dokumente.forEach(dk => (rohSeiten[dk.id] || []).forEach((roh, i) => { const t = roh.replace(/-\n(?=[a-zäöüß])/g, '').replace(/\s+/g, ' '); let m; reAbk.lastIndex = 0;
  while ((m = reAbk.exec(t))) { const abk = m[2], key = abk + '|' + dk.werkId; if (schon.has(key) || !/[A-ZÄÖÜ].*[A-ZÄÖÜ]/.test(abk)) continue; const bed = bedeutungZu(m[1], abk); if (!bed || /(^| )[A-ZÄÖÜ]{2,}( |$)/.test(bed) || !/^[A-ZÄÖÜ]+$/.test(abk.replace(/[a-z]/g, '').slice(0, 1) + abk.slice(-1).toUpperCase())) continue; schon.add(key); ausText++;
    lib.glossar.push({ id: 'g' + String(++gnr).padStart(4, '0'), begriff: abk, bedeutung: bed, werkId: dk.werkId, dokId: dk.id, seite: String(i + 1), herkunft: 'text', geprueft: null, autor: 'Ersterfassung', datum: '2026-11-20', zurueckgezogen: false }); } }));
console.log('Glossar aus dem Lauftext:', ausText, 'Einträge');
// Version 1 = Ersterfassung ohne die ANDAIR-Einträge; diese bleiben offene Änderungen.
const entwurf = lib.regeln.filter(r => d.entwurfIds.includes(r.id));
lib.regeln = lib.regeln.filter(r => !d.entwurfIds.includes(r.id));
app.neueVersion(lib, 'Ersterfassung', 'Ersterfassung: Regeln und Glossar aus dem Projektwissen (OCR-Auswertung), Original-PDF des BABS im Ordner pdf/ (TWS 1982 und TWO 1977 zu je einem PDF zusammengefügt). Gescannte Seiten neu erkannt, Tabellen und Skizzen getrennt erfasst. Kein Wert am Original geprüft.', '2026-11-20');
lib.regeln = lib.regeln.concat(entwurf);
const kern = {}; Object.keys(lib).forEach(k => { if (!['seitentext', 'abschnitte', 'struktur', 'titelbilder', 'elemente', 'unsicher', 'ocr'].includes(k)) kern[k] = lib[k]; });
fs.mkdirSync('daten', { recursive: true });
fs.writeFileSync('daten/bibliothek.json', JSON.stringify(kern, null, 1));
fs.writeFileSync('daten/texte.json', JSON.stringify({ seitentext: lib.seitentext, abschnitte: lib.abschnitte, struktur: lib.struktur, elemente: lib.elemente, unsicher: lib.unsicher, ocr: lib.ocr }));
fs.writeFileSync('daten/titelbilder.json', JSON.stringify(lib.titelbilder));
['bibliothek', 'texte', 'titelbilder'].forEach(n => console.log('daten/' + n + '.json', (fs.statSync('daten/' + n + '.json').size / 1024).toFixed(0) + ' kB'));
console.log(lib.werke.length + ' Werke, ' + lib.dokumente.length + ' PDF, ' + lib.regeln.length + ' Regeln, ' + lib.glossar.length + ' Glossareinträge');
})();
