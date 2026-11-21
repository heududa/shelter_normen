// Ersterfassung: erzeugt daten/bibliothek.json, daten/texte.json und daten/titelbilder.json aus den PDF in pdf/ und aus ersterfassung_daten.js.
// Aufruf im Ordner des Repos: node werkzeuge/ersterfassung.js --ueberschreiben
// ACHTUNG: ersetzt den Bearbeitungsstand. Ohne --ueberschreiben bricht das Skript ab, wenn schon Daten vorhanden sind.
const fs = require('fs'), path = require('path');
const d = require('./ersterfassung_daten.js'), app = require('../app.js'), crypto = require('crypto');
if (fs.existsSync('daten/bibliothek.json') && !process.argv.includes('--ueberschreiben')) { console.error('daten/bibliothek.json ist vorhanden. Mit --ueberschreiben wird der Bearbeitungsstand ersetzt.'); process.exit(1); }
const pdfjsNode = require('pdfjs-dist/legacy/build/pdf.js');
(async () => {
const VERSION = '0.11.0';
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
let stichproben = 0;
const STICHPROBE = [
  { dok: 'd-twp84-1', s: 64, alt: 'mindestens 24 der erforderlichen', neu: 'mindestens ⅔ der erforderlichen' },
  { dok: 'd-twp84-1', s: 38, alt: 'Bodenfläche 2135 m²', neu: 'Bodenfläche ≥135 m²' },
  { dok: 'd-tws82-1', s: 68, alt: 'Variante 7', neu: 'Variante 1' },
];
// Seiten, die fast nur aus einer Zeichnung bestehen (oft quer gesetzt): die ganze Zeichnung ist eine Skizze, als Text bleiben Seitenzahl und Bildtitel
let bildseiten = 0;
function bildseite(p) {
  const zl = p.text.split('\n'), echt = zl.filter(z => !/^\[\[/.test(z)), sk = p.elemente.filter(x => x.typ === 'skizze');
  const flaeche = sk.reduce((a, x) => a + x.box[2] * x.box[3], 0), kurz = echt.filter(z => z.replace(/\s/g, '').length <= 6).length;
  if (!sk.length || flaeche < 0.12 || !(p.conf < 82 || (kurz >= 4 && kurz >= 0.5 * echt.length))) return;
  const ti = zl.findIndex(z => /^(Figur|Fig\.|Bild|Abb\.|Abbildung|Tabelle)\s/.test(z)), kopf = /^\d{1,3}$/.test(zl[0] || '') ? [zl[0]] : [], fuss = ti >= 0 ? zl.slice(ti).filter(z => !/^\[\[/.test(z)) : [];
  const bleibt = new Set(kopf.concat(fuss)), weg = p.zeilen.filter(z => !bleibt.has(z.t) && ![...bleibt].some(b => b.replace(/\s+/g, ' ').startsWith(z.t)));
  let x0 = Math.min(...p.elemente.map(x => x.box[0])), y0 = Math.min(...p.elemente.map(x => x.box[1])), x1 = Math.max(...p.elemente.map(x => x.box[0] + x.box[2])), y1 = Math.max(...p.elemente.map(x => x.box[1] + x.box[3]));
  weg.forEach(z => { x0 = Math.min(x0, z.x / 595 - 0.01); y0 = Math.min(y0, z.yy - 0.005); y1 = Math.max(y1, z.yy + 0.02); x1 = Math.max(x1, 0.93); });
  const kap = p.zeilen.filter(z => fuss.some(f => f.replace(/\s+/g, ' ').startsWith(z.t))).map(z => z.yy); if (kap.length) y1 = Math.min(y1, Math.min(...kap) - 0.004);
  x0 = Math.max(0.02, x0); y0 = Math.max(0.03, y0); x1 = Math.min(0.98, x1); y1 = Math.min(0.97, y1); if (y1 - y0 < 0.1) return;
  const text = p.elemente.map(x => x.typ === 'tabelle' ? '' : x.text || '').join(' ').replace(/\s+/g, ' ').trim().slice(0, 600);
  p.elemente = [{ nr: 1, typ: 'skizze', box: [x0, y0, x1 - x0, y1 - y0].map(v => +v.toFixed(4)), text, ganz: true }];
  p.text = kopf.concat([`[[Skizze ${p.s}.1]]`], fuss).join('\n'); p.roh = kopf.concat(fuss).join('\n'); p.zeilen = p.zeilen.filter(z => !weg.includes(z)); p.unsicher = p.unsicher.filter(u => p.text.includes(u)); bildseiten++;
}
// Seiten, die die Texterkennung nicht sauber liest (Formelrechnungen, Tabellen auf Raster, Kurvenblätter): die ganze Seite als Bild.
// Der gelesene Text bleibt für die Suche erhalten, wird aber nicht als Abschrift ausgegeben.
let ganzseiten = 0; const ganzListe = [];
function ganzseite(p) {
  if (p.worte <= 20 || (p.elemente[0] && p.elemente[0].ganz)) return;
  if (!(p.conf < 84 || p.luecke > 0.1 || p.unsicher.length > Math.max(12, 0.12 * p.worte))) return;
  const zl = p.text.split('\n').filter(z => !/^\[\[/.test(z)), kopf = /^\d{1,3}$/.test(zl[0] || '') ? [zl[0]] : [];
  const titel = zl.filter(z => /^\d{1,2}(\.\d{1,2}){1,3}\s+[A-ZÄÖÜ]/.test(z) && z.length < 90), unter = zl.filter(z => /^(Figur|Fig\.|Bild|Abb\.|Abbildung|Tabelle)\s+[A-Z]?\d/.test(z));
  const such = (zl.join(' ') + ' ' + p.elemente.map(x => x.zeilen ? x.zeilen.map(z => z.join(' ')).join(' ') : x.text || '').join(' ')).replace(/\s+/g, ' ').slice(0, 4000);
  p.elemente = [{ nr: 1, typ: 'skizze', box: [0.03, 0.035, 0.94, 0.93], text: such, ganz: true, seite: true }];
  const bleibt = kopf.concat(titel, unter);
  p.text = kopf.concat(titel, [`[[Skizze ${p.s}.1]]`], unter).join('\n'); p.roh = bleibt.join('\n'); p.zeilen = p.zeilen.filter(z => bleibt.some(b => b.replace(/\s+/g, ' ').startsWith(z.t))); p.unsicher = p.unsicher.filter(u => p.text.includes(u)); ganzseiten++; ganzListe.push(p.s);
}
// Lesefehler der Texterkennung, die sich sicher berichtigen lassen
const putzen = t => String(t).replace(/\(\(/g, '(').replace(/\)\)/g, ')').replace(/@ ?(?=\d)/g, 'Ø').replace(/(\d) ?mh(?![a-zäöü])/g, '$1 m³/h').replace(/([A-ZÄÖÜ]{2,})- (?!und |oder |bzw)(?=[A-Za-zäöü])/g, '$1-').replace(/(^|[^A-Za-zÄÖÜäöü0-9])UV(?=\/ESV)/g, '$1ÜV').replace(/(^|[^A-Za-zÄÖÜäöü0-9\-])UV(?![A-Za-zÄÖÜäöü0-9\-\/])/g, '$1ÜV');
// Gescannte Seiten: Text, Tabellen und Skizzen aus der neuen Texterkennung (werkzeuge/ocr.py, Dateien in daten/ocr/)
const bericht = [];
for (const e of erfasst) {
  const f = path.join('daten', 'ocr', e.id + '.json'); if (!fs.existsSync(f)) continue;
  const o = JSON.parse(fs.readFileSync(f, 'utf8')), dk = lib.dokumente.find(x => x.id === e.id);
  if (o.pruefsumme !== dk.pruefsumme) { console.log('  Texterkennung passt nicht zum PDF, übersprungen:', e.id); continue; }
  e.ocr = o; lib.elemente[e.id] = []; lib.unsicher[e.id] = {};
  // Lesefehler der Texterkennung, die sich sicher berichtigen lassen: doppelte Klammern, @ statt Durchmesserzeichen
  o.seiten.forEach(p => { p.text = putzen(p.text); p.roh = putzen(p.roh); p.zeilen.forEach(z => { z.t = putzen(z.t); }); if (/\d ?mh(?![a-zäöü])/.test(p.text)) p.unsicher.push('m³/h'); if (/(^|[^A-Za-zÄÖÜäöü0-9\-])UV(?![A-Za-zÄÖÜäöü0-9\-\/])/.test(p.text)) p.unsicher.push('ÜV'); p.unsicher = p.unsicher.map(putzen); p.elemente.forEach(x => { if (x.zeilen) x.zeilen = x.zeilen.map(z => z.map(putzen)); }); });
  // Lesefehler, die bei der Stichprobe am Scan aufgefallen sind (Bruchzeichen, Grösser-gleich-Zeichen, Ziffer in Kursivschrift)
  STICHPROBE.filter(k => k.dok === e.id).forEach(k => { const p = o.seiten.find(x => x.s === k.s); if (!p || !p.text.includes(k.alt)) { console.log('  Stichprobenkorrektur nicht gefunden:', k.dok, k.s, k.alt); return; } const f = t => String(t).split(k.alt).join(k.neu); p.text = f(p.text); p.roh = f(p.roh); p.zeilen.forEach(z => { z.t = f(z.t); }); p.unsicher = p.unsicher.filter(u => !k.alt.split(' ').includes(u)); stichproben++; });
  o.seiten.forEach(bildseite); o.seiten.forEach(ganzseite);
  o.seiten.forEach(p => { e.seitenT[p.s - 1] = p.text; e.zeilen[p.s - 1] = p.zeilen; e.roh[p.s - 1] = p.roh; });
}
// Wortschatz aus den digital entstandenen Normen: für Umlaute, die der Scan verschluckt hat (Oltank statt Öltank)
const wortschatz = new Map(), RW = /([A-Za-zÄÖÜäöüß]+)/;
erfasst.filter(e => !e.ocr).forEach(e => e.seitenT.forEach(t => t.split(RW).forEach((x, i) => { if (i % 2 && x.length >= 4) wortschatz.set(x, (wortschatz.get(x) || 0) + 1); })));
const scanschatz = new Map(); erfasst.filter(e => e.ocr).forEach(e => e.seitenT.forEach(t => t.split(RW).forEach((x, i) => { if (i % 2 && x.length >= 4) scanschatz.set(x, (scanschatz.get(x) || 0) + 1); })));
const KEIN_UMLAUT = new Set(['halt', 'nahe', 'konnte', 'konnten', 'schaden', 'hatte', 'hatten', 'wurde', 'wurden', 'mochte', 'mochten', 'boden', 'kasten', 'graben', 'mangel', 'laden', 'wagen', 'lauft', 'fallen', 'grun', 'schon', 'losen', 'fordern', 'forderung', 'forderungen', 'drucken', 'druck', 'zahlen', 'lage', 'stucke']);
const UML = { O: 'Ö', U: 'Ü', A: 'Ä', o: 'ö', u: 'ü', a: 'ä' }; let umlaute = 0; const umlautListe = new Map();
function umlaut(wort) {
  if (wort.length < 4 || /[ÄÖÜäöü]/.test(wort)) return wort;
  if (wortschatz.has(wort) || KEIN_UMLAUT.has(wort.toLowerCase())) return wort; // das Wort gibt es so in den digital entstandenen Normen: nichts ändern
  let best = wort, bn = 3; const selbst = scanschatz.get(wort) || 0;
  for (let i = 0; i < wort.length; i++) { const u = UML[wort[i]]; if (!u || (i > 0 && wort[i] === wort[i].toUpperCase())) continue; const k = wort.slice(0, i) + u + wort.slice(i + 1), kn = wortschatz.get(k) || 0; if (kn >= bn && (scanschatz.get(k) || 0) >= 8 * selbst) { best = k; bn = kn; } }
  return best;
}
let geaendert = new Set();
const mitUmlaut = t => String(t).split(RW).map((x, i) => { if (!(i % 2)) return x; const k = umlaut(x); if (k !== x) { umlaute++; geaendert.add(k); umlautListe.set(x + ' → ' + k, (umlautListe.get(x + ' → ' + k) || 0) + 1); } return k; }).join('');
// Zahlen, die die frühere Erkennung (Textebene des PDF) anders gelesen hat, gelten als unsicher
const zahlen = t => { const m = new Map(); String(t).split(/\s+/).forEach(x => { const k = x.replace(/[^0-9A-Za-zÄÖÜäöü.,/\-]/g, '').replace(/^[.,\-]+|[.,\-]+$/g, ''); if (/\d/.test(k)) m.set(k, (m.get(k) || 0) + 1); }); return m; };
for (const e of erfasst) {
  if (!e.ocr) continue;
  let nT = 0, nS = 0, nU = 0, conf = 0, worte = 0;
  e.ocr.seiten.forEach(p => {
    const i = p.s - 1; geaendert = new Set();
    e.seitenT[i] = mitUmlaut(e.seitenT[i]); e.roh[i] = mitUmlaut(e.roh[i]); e.zeilen[i].forEach(z => { z.t = mitUmlaut(z.t); });
    const els = p.elemente.map(x => { const el = { nr: p.s + '.' + x.nr, s: p.s, typ: x.typ, box: x.box }; if (x.typ === 'tabelle') { el.zeilen = x.zeilen.map(z => z.map(mitUmlaut)); if (x.ohneKopf) el.ohneKopf = true; nT++; } else { el.text = mitUmlaut(x.text || ''); if (x.tab) el.tab = true; if (x.formel) el.formel = true; if (x.ganz) el.ganz = true; if (x.seite) el.seite = true; nS++; } return el; });
    lib.elemente[e.id].push(...els);
    const alt = zahlen(e.alt[i]), un = new Set(p.unsicher.map(mitUmlaut));
    const neuT = e.seitenT[i].replace(/\[\[[^\]]*\]\]/g, ' ') + ' ' + els.map(x => x.typ === 'tabelle' ? x.zeilen.map(z => z.join(' ')).join(' ') : '').join(' ');
    if (e.alt[i].replace(/\s/g, '').length > 40) zahlen(neuT).forEach((n, k) => { if ((alt.get(k) || 0) < n) neuT.split(/\s+/).forEach(x => { if (x.replace(/[^0-9A-Za-zÄÖÜäöü.,/\-]/g, '').replace(/^[.,\-]+|[.,\-]+$/g, '') === k) un.add(x); }); });
    const worteNeu = new Set(neuT.split(/\s+/)); geaendert.forEach(k => worteNeu.forEach(x => { if (x.includes(k)) un.add(x); }));
    [...un].forEach(x => { if (x.replace(/[^0-9A-Za-zÄÖÜäöü]/g, '').length < 2) un.delete(x); }); // einzelne Ziffern würden jede gleiche Ziffer der Seite markieren
    if (un.size) { lib.unsicher[e.id][p.s] = [...un].sort(); nU += un.size; }
    conf += p.conf * p.worte; worte += p.worte;
  });
  // Wortlagen je Dokument: für die Markierung im Scan und die Hybridansicht (das Programm lädt sie bei Bedarf)
  const lagen = {}; e.ocr.seiten.forEach(p => { if (p.lagen && p.lagen.length) lagen[p.s] = p.lagen.map(a => [String(putzen(a[0])).split(RW).map((x, i) => i % 2 ? umlaut(x) : x).join(''), a[1], a[2], a[3], a[4]]); });
  if (Object.keys(lagen).length) { fs.mkdirSync(path.join('daten', 'lagen'), { recursive: true }); fs.writeFileSync(path.join('daten', 'lagen', e.id + '.json'), JSON.stringify({ dokId: e.id, seiten: lagen })); }
  lib.ocr[e.id] = { werkzeug: e.ocr.werkzeug, seiten: e.ocr.seiten.length, datum: '2026-11-21', sicherheit: +(conf / Math.max(1, worte)).toFixed(1), tabellen: nT, skizzen: nS, unsicher: nU };
  bericht.push({ dok: e.id, norm: e.w.kurz, teil: e.q.teil || '', seiten: e.ocr.seiten.length, sicherheit: lib.ocr[e.id].sicherheit, tabellen: nT, skizzen: nS, unsicher: nU, schwach: e.ocr.seiten.filter(p => p.conf < 80 && p.worte > 20).map(p => p.s) });
}
console.log('Stichprobenkorrekturen:', stichproben);
console.log('Bildseiten:', bildseiten, '· ganze Seite als Bild:', ganzseiten);
console.log('Umlaute berichtigt:', umlaute, [...umlautListe].sort((a, b) => b[1] - a[1]).slice(0, 40).map(x => x[0] + ' (' + x[1] + ')').join(', '));
// Struktur und Abschnitte
for (const e of erfasst) {
  const { q, w, id } = e, modus = q.text === undefined ? (e.seitenT.length <= 6 ? 'seiten' : 'nummern') : q.text;
  let txt = '', zeichen = 0;
  if (modus) e.roh.forEach((t, i) => { zeichen += t.replace(/\s/g, '').length; txt += `## PDF-Seite ${i + 1}\n${t}\n\n`; });
  lib.seitentext[id] = e.seitenT; lib.struktur[id] = app.erkenneStruktur(e.zeilen); rohSeiten[id] = e.roh.map((t, i) => t + (lib.elemente[id] || []).filter(x => x.s === i + 1).map(x => '\n' + (x.zeilen ? x.zeilen.map(z => z.join(' ')).join('\n') : x.text || '')).join(''));
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
