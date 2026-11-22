'use strict';
/* Normenbibliothek – Programm, Daten (daten/*.json) und Original-PDF (pdf/) liegen als Ordner nebeneinander. Kernlogik (ohne DOM) oben, Oberfläche unten. */

// ---------- Kernlogik ----------
function sha256(str) {
  const prim = []; for (let n = 2; prim.length < 64; n++) { if (prim.every(p => n % p)) prim.push(n); }
  const frac = x => ((x - Math.floor(x)) * 4294967296) >>> 0;
  const K = prim.map(p => frac(Math.cbrt(p)));
  const H = prim.slice(0, 8).map(p => frac(Math.sqrt(p)));
  const b = typeof str === 'string' ? new TextEncoder().encode(str) : str, l = b.length, n = ((l + 8) >> 6) + 1;
  const m = new Uint8Array(n * 64); m.set(b); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(n * 64 - 8, Math.floor(l / 536870912)); dv.setUint32(n * 64 - 4, (l << 3) >>> 0);
  const w = new Uint32Array(64), rr = (x, k) => (x >>> k) | (x << (32 - k));
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i * 64 + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    [a, bb, c, d, e, f, g, h].forEach((v, k) => { H[k] = (H[k] + v) >>> 0; });
  }
  return H.map(v => v.toString(16).padStart(8, '0')).join('');
}

const TYPEN = {
  erneuert: ['erneuert', 'wird erneuert durch'],
  ersetzt: ['ersetzt', 'wird ersetzt durch'],
  verweist: ['verweist auf', 'wird zitiert von'],
  abgeleitet: ['ist abgeleitet von', 'ist Basis von'],
  ergaenzt: ['ergänzt', 'wird ergänzt durch'],
};
const ARTEN = { regel: 'Regel', aendern: 'ändern', ergaenzen: 'ergänzen', aufheben: 'aufheben', kommentar: 'Kommentar' };

const LISTEN = ['herausgeber', 'werke', 'verknuepfungen', 'regeln', 'anmerkungen', 'dokumente', 'aenderungen', 'formate', 'glossar', 'uebernahmen'];
const leererInhalt = () => ({ herausgeber: [], werke: [], verknuepfungen: [], regeln: [], anmerkungen: [], dokumente: [], aenderungen: [], formate: [], glossar: [], uebernahmen: [] });
function inhalt(lib) { const o = {}; LISTEN.forEach(k => { o[k] = lib[k] || []; }); return o; }

function neueVersion(lib, name, notiz, datum, inh) {
  const snap = JSON.stringify(inh || inhalt(lib));
  const v = { nr: lib.versionen.length + 1, datum, name, notiz, pruefsumme: sha256(snap), anzahlRegeln: (inh || lib).regeln.length, snapshot: snap };
  lib.versionen.push(v); return v;
}
function letzteVersion(lib) { return lib.versionen[lib.versionen.length - 1] || null; }
let _snapCache = { nr: -1, data: null };
function freigegeben(lib) {
  const v = letzteVersion(lib);
  if (!v) return leererInhalt();
  if (_snapCache.nr !== v.nr || _snapCache.sum !== v.pruefsumme) _snapCache = { nr: v.nr, sum: v.pruefsumme, data: Object.assign(leererInhalt(), JSON.parse(v.snapshot)) };
  return _snapCache.data;
}
// Stand eines Eintrags gegenüber der letzten freigegebenen Version: 'neu' | 'geaendert' | 'frei'
function standVon(lib, liste, obj) {
  const alt = freigegeben(lib)[liste].find(x => x.id === obj.id);
  if (!alt) return 'neu';
  return JSON.stringify(alt) === JSON.stringify(obj) ? 'frei' : 'geaendert';
}
function offeneAenderungen(lib) {
  const f = freigegeben(lib); let n = 0;
  for (const liste of LISTEN) {
    const alt = new Map(f[liste].map(x => [x.id, JSON.stringify(x)]));
    for (const x of (lib[liste] || [])) { if (alt.get(x.id) !== JSON.stringify(x)) n++; alt.delete(x.id); }
    n += alt.size;
  }
  return n;
}

// Geltende Fassung: Basisnorm + kantonale Schicht + Hersteller-Schicht (N2, N9)
function fassung(lib, kontext, mitEntwurf) {
  const q = mitEntwurf ? inhalt(lib) : freigegeben(lib);
  const werk = id => q.werke.find(w => w.id === id);
  const basis = werk(kontext.basis);
  if (!basis) return { basis: null, eintraege: [], konflikte: 0, pruefen: 0 };
  const quelle = r => basis.kurz + (r.abschnitt ? ', ' + r.abschnitt : '');
  const out = q.regeln.filter(r => r.werkId === basis.id && r.art === 'regel' && !r.zurueckgezogen)
    .map(r => ({ regel: r, wirksam: r, herkunft: quelle(r), ebene: 'bund', mods: [], kommentare: [], konflikt: false, aufgehoben: false, pruefen: false, zuBestaetigen: !r.geprueft }));
  const ebenen = [['kanton', kontext.kanton], ['hersteller', kontext.hersteller]];
  for (const [ebene, id] of ebenen) {
    const s = id && werk(id); if (!s || s.basisId !== basis.id) continue;
    for (const e of q.regeln.filter(r => r.werkId === s.id && !r.zurueckgezogen)) {
      const ziel = out.find(o => o.regel.id === e.zielId);
      if (e.art === 'ergaenzen' || (e.art === 'regel')) out.push({ regel: e, wirksam: e, herkunft: s.kurz + ' (ergänzt)', ebene, mods: [], kommentare: [], konflikt: false, aufgehoben: false, pruefen: false, zuBestaetigen: false });
      else if (!ziel) continue;
      else if (e.art === 'kommentar') ziel.kommentare.push({ e, schicht: s, ebene });
      else ziel.mods.push({ e, schicht: s, ebene });
    }
  }
  let konflikte = 0, pruefen = 0;
  for (const o of out) {
    if (!o.mods.length) { if (o.ebene === 'bund' && (kontext.kanton || kontext.hersteller)) { const via = [kontext.hersteller, kontext.kanton].map(werk).filter(Boolean)[0]; if (via) o.herkunft += ' (übernommen via ' + via.kurz + ')'; } continue; }
    if (o.mods.length > 1) { o.konflikt = true; konflikte++; }
    const m = o.mods.find(x => x.ebene === 'kanton') || o.mods[0]; // behördliche Schicht geht vor, Konflikt bleibt sichtbar
    o.ebene = m.ebene; o.zuBestaetigen = false;
    if (m.e.basisRev < o.regel.rev) { o.pruefen = true; o.zuBestaetigen = true; pruefen++; }
    if (m.e.art === 'aufheben') { o.aufgehoben = true; o.herkunft = m.schicht.kurz + ' (aufgehoben)'; }
    else { o.wirksam = Object.assign({}, o.regel, { titel: m.e.titel || o.regel.titel, text: m.e.text, params: m.e.params }); o.herkunft = m.schicht.kurz + ' (geändert)'; }
  }
  return { basis, eintraege: out, konflikte, pruefen };
}

function regelwerkExport(lib, kontext, mitEntwurf) {
  const f = fassung(lib, kontext, mitEntwurf), v = letzteVersion(lib), q = mitEntwurf ? inhalt(lib) : freigegeben(lib);
  const kurz = id => (q.werke.find(w => w.id === id) || {}).kurz || null;
  const zeile = o => ({ id: o.regel.id, thema: o.regel.thema, abschnitt: o.regel.abschnitt, pdfSeite: o.regel.pdfSeite, titel: o.wirksam.titel, text: o.wirksam.text, parameter: o.wirksam.params, herkunft: o.herkunft, aufgehoben: o.aufgehoben, konflikt: o.konflikt, status: o.konflikt || o.zuBestaetigen ? 'zu bestätigen' : 'bestätigt' });
  return {
    format: 'normenbibliothek-regelwerk/1', bibliothek: lib.meta.titel, version: v ? v.nr : 0, pruefsumme: v ? v.pruefsumme : '', entwuerfeEnthalten: !!mitEntwurf,
    kontext: { basis: kurz(kontext.basis), kanton: kurz(kontext.kanton), hersteller: kurz(kontext.hersteller) },
    vermerk: kontext.hersteller ? 'Herstellernorm – keine behördliche Norm' : '',
    themen: lib.themen.map(t => ({ schluessel: t[0], titel: t[1], geregelt: f.eintraege.some(o => o.regel.thema === t[0] && !o.aufgehoben) })),
    regeln: f.eintraege.map(zeile),
    produktanforderungen: q.regeln.filter(r => (q.werke.find(w => w.id === r.werkId) || {}).art === 'produktanforderung' && !r.zurueckgezogen)
      .map(r => ({ id: r.id, quelle: kurz(r.werkId) + (r.abschnitt ? ', ' + r.abschnitt : ''), thema: r.thema, titel: r.titel, text: r.text, parameter: r.params, status: r.geprueft ? 'bestätigt' : 'zu bestätigen' })),
  };
}

// Normtext einlesen: Text in Abschnitte teilen
function teileText(txt, modus) {
  const out = []; let cur = null, seite = '';
  const neu = (nr, titel) => { cur = { nr, titel, pdfSeite: seite, text: '' }; out.push(cur); };
  for (const roh of txt.replace(/\r/g, '').split('\n')) {
    const line = roh.trimEnd(); let m;
    if ((m = /^#{1,6}\s*PDF-Seite\s+(\d+)/i.exec(line))) { seite = m[1]; if (modus === 'seiten') neu('S. ' + seite, 'PDF-Seite ' + seite); continue; }
    if (modus === 'nummern' && (m = /^(\d{1,2}(?:\.\d{1,2}){1,3})\.?\s+([A-ZÄÖÜ][^|]{2,90})$/.exec(line.trim()))) { neu(m[1], m[2].trim()); continue; }
    if (modus === 'ueberschriften' && (m = /^#{1,6}\s+(.+)$/.exec(line))) { const k = /^(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(m[1]); neu(k ? k[1] : '', k ? k[2] : m[1]); continue; }
    if (!cur) { if (!line.trim()) continue; neu('', 'Vorspann'); }
    cur.text += line + '\n';
  }
  // Einträge aus Inhaltsverzeichnissen entfernen: fast leer und Nummer kommt später wieder
  const res = out.filter((a, i) => !(a.nr && a.text.trim().length < 40 && (/\d$/.test(a.titel) || out.slice(i + 1).some(b => b.nr === a.nr))));
  res.forEach(a => { a.text = a.text.trim(); });
  return res.filter(a => a.text || a.nr);
}

// Wortweiser Vergleich zweier Texte: [{o:'='|'-'|'+', t}]. Leerraum zählt nicht als Unterschied.
function diffWorte(a, b) {
  const tok = t => String(t).split(/(\s+)/).filter(x => x !== ''), k = t => /^\s+$/.test(t) ? ' ' : t;
  const A = tok(a), B = tok(b), KA = A.map(k), KB = B.map(k);
  let s = 0; while (s < A.length && s < B.length && KA[s] === KB[s]) s++;
  let ea = A.length, eb = B.length; while (ea > s && eb > s && KA[ea - 1] === KB[eb - 1]) { ea--; eb--; }
  const out = []; for (let i = 0; i < s; i++) out.push({ o: '=', t: B[i] });
  const n = ea - s, m = eb - s; let i = 0, j = 0;
  if (n * m <= 6e6) {
    const w = m + 1, T = new Uint16Array((n + 1) * w);
    for (let x = n - 1; x >= 0; x--) for (let y = m - 1; y >= 0; y--) T[x * w + y] = KA[s + x] === KB[s + y] ? T[(x + 1) * w + y + 1] + 1 : Math.max(T[(x + 1) * w + y], T[x * w + y + 1]);
    while (i < n && j < m) { if (KA[s + i] === KB[s + j]) { out.push({ o: '=', t: B[s + j] }); i++; j++; } else if (T[(i + 1) * w + j] >= T[i * w + j + 1]) out.push({ o: '-', t: A[s + i++] }); else out.push({ o: '+', t: B[s + j++] }); }
  }
  while (i < n) out.push({ o: '-', t: A[s + i++] }); while (j < m) out.push({ o: '+', t: B[s + j++] });
  for (let x = eb; x < B.length; x++) out.push({ o: '=', t: B[x] });
  return out;
}
// Zusammenhängende Unterschiede als Stellen {alt, neu}
function stellen(ops) {
  const out = []; let cur = null, pend = '';
  for (const o of ops) {
    if (o.o === '=') { if (cur) { if (/^\s+$/.test(o.t)) pend += o.t; else { out.push(cur); cur = null; pend = ''; } } continue; }
    if (!cur) cur = { alt: '', neu: '' };
    if (pend) { cur.alt += pend; cur.neu += pend; pend = ''; }
    if (o.o === '-') cur.alt += o.t; else cur.neu += o.t;
  }
  if (cur) out.push(cur);
  return out.map(x => ({ alt: x.alt.replace(/\s+/g, ' ').trim(), neu: x.neu.replace(/\s+/g, ' ').trim() })).filter(x => x.alt || x.neu);
}
// Textstücke einer PDF-Seite zu Zeilen mit Schriftgrösse und Lage ordnen
function zeilenAus(items, hoehe) {
  const z = [];
  items.forEach(it => {
    if (!it.str || !it.str.trim()) return;
    const y = it.transform[5], x = it.transform[4], g = it.height || Math.abs(it.transform[3]) || 0;
    let l = z.find(q => Math.abs(q.y - y) <= Math.max(2, Math.min(q.g, g || q.g) * 0.4)); if (!l) { l = { y, teile: [], g: 0 }; z.push(l); }
    l.teile.push({ x, s: it.str }); l.g = Math.max(l.g, g);
  });
  return z.sort((a, b) => b.y - a.y).map(l => { l.teile.sort((a, b) => a.x - b.x); return { t: l.teile.map(p => p.s).join(' ').replace(/\s+/g, ' ').trim(), g: Math.round(l.g * 10) / 10, x: Math.round(l.teile[0].x), yy: +(1 - l.y / (hoehe || 842)).toFixed(3) }; });
}
const fvSchluessel = t => String(t).toLowerCase().replace(/[^a-z0-9äöüß]/g, '').slice(0, 40);
// Struktur einer Norm aus dem Layout erkennen (Regeln, kein Sprachmodell): Überschriften, Tabellen- und Bildtitel, Fussnoten, Aufzählungen, Formeln
function erkenneStruktur(seiten) {
  const hist = new Map(); seiten.forEach(zs => zs.forEach(l => { const k = Math.round(l.g * 2) / 2; if (k > 0) hist.set(k, (hist.get(k) || 0) + l.t.length); }));
  let koerper = 10, max = 0; hist.forEach((n, k) => { if (n > max) { max = n; koerper = k; } });
  const roh = [];
  seiten.forEach((zs, i) => zs.forEach(l => {
    const t = l.t, s = i + 1; let typ = '', nr = '';
    const m = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\S.*)$/.exec(t);
    if (m && /^[A-ZÄÖÜ]/.test(m[2]) && m[2].length <= 90 && /[a-zäöü]{3}/.test(m[2]) && !/[.;,:]$/.test(m[2]) && !/(\.{3,}|\s\d{1,3})$/.test(m[2]) && !/\d[.,]?\d*\s+\S+\s+\d/.test(m[2])) {
      const tiefe = m[1].split('.').length;
      if (tiefe >= 2 || l.g >= koerper * 1.12) { typ = 'u' + Math.min(3, tiefe); nr = m[1]; }
    }
    if (!typ && /^(Anhang|Beilage|Anlage)\s+[A-Z0-9]{1,3}\b/.test(t) && t.length <= 80 && !/(\.{3,}|\s\d{1,3})$/.test(t)) { typ = 'u1'; nr = /^(\S+\s+\S+)/.exec(t)[1]; }
    if (!typ && s <= 2 && l.g >= koerper * 1.6 && t.length >= 3) typ = 'titel';
    if (!typ && /^(Tabelle|Tab\.)\s*\d/.test(t)) typ = 'tabelle';
    if (!typ && /^(Fig\.|Figur|Bild|Abb\.|Abbildung)\s*\d/.test(t)) typ = 'bild';
    if (!typ && l.g > 0 && l.g <= koerper * 0.86 && l.yy > 0.78 && /^(\d{1,2}\)|\*\)?|[¹²³])\s*\S/.test(t)) typ = 'fussnote';
    if (!typ && /^([-–•]|[a-z]\))\s+\S/.test(t)) typ = 'liste';
    if (!typ && t.length < 70 && /^\S{1,12}\s*=\s*\S/.test(t) && !/[a-zäöü]{4,}\s+[a-zäöü]{4,}\s+[a-zäöü]{4,}/.test(t)) typ = 'formel';
    if (typ) roh.push({ s, typ, nr, t: t.slice(0, 140), g: l.g });
  }));
  // dieselbe Kapitelnummer mehrfach (Inhaltsverzeichnis und Text): die grösser gesetzte bzw. spätere Zeile gilt
  const beste = new Map(); roh.forEach((b, i) => { if (!b.nr) return; const a = beste.get(b.nr); if (!a || b.g >= roh[a.i].g) beste.set(b.nr, { i }); });
  const bloecke = roh.filter((b, i) => !b.nr || beste.get(b.nr).i === i), vorlagen = {};
  // Nummern wie 2.21 unter 2.2 (Dezimalgliederung) sind eine Stufe tiefer
  const nrn = new Set(bloecke.map(b => b.nr)); bloecke.forEach(b => { const m = /^(\d{1,2})\.(\d)(\d)$/.exec(b.nr); if (m && b.typ === 'u2' && nrn.has(m[1] + '.' + m[2])) b.typ = 'u3'; });
  ['titel', 'u1', 'u2', 'u3', 'tabelle', 'bild', 'fussnote', 'liste', 'formel'].forEach(k => { const gs = bloecke.filter(b => b.typ === k && b.g > 0).map(b => b.g).sort((a, b) => a - b); if (gs.length) vorlagen[k] = { g: gs[Math.floor(gs.length / 2)], n: gs.length }; });
  return { koerper, vorlagen, bloecke: bloecke.map(b => ({ s: b.s, typ: b.typ, nr: b.nr, t: b.t })) };
}
// Inhalt einer Version, in die nur die gewählten offenen Einträge ("liste|id") einfliessen
function teilInhalt(lib, gewaehlt) {
  const f = freigegeben(lib), o = {};
  for (const liste of LISTEN) {
    const alt = new Map(f[liste].map(x => [x.id, x])), out = [], da = new Set();
    for (const x of (lib[liste] || [])) { da.add(x.id); const a = alt.get(x.id); if ((a && JSON.stringify(a) === JSON.stringify(x)) || gewaehlt.has(liste + '|' + x.id)) out.push(x); else if (a) out.push(a); }
    f[liste].forEach(a => { if (!da.has(a.id) && !gewaehlt.has(liste + '|' + a.id)) out.push(a); });
    o[liste] = out;
  }
  return o;
}
// Vorschlag, ob eine Änderung ein Lesefehler (OCR) oder eine fachliche Änderung ist. Der Autor entscheidet.
function artVorschlag(alt, neu) {
  if (!alt || !neu) return 'fachlich';
  const n = t => String(t).toLowerCase().replace(/\s+/g, '').replace(/o/g, '0').replace(/[il|!\[\]]/g, '1').replace(/s/g, '5').replace(/b/g, '8').replace(/z/g, '2').replace(/rn/g, 'm').replace(/[,;:]/g, '.').replace(/[’'`´"„“”\-–—_]/g, '');
  const a = n(alt).slice(0, 200), b = n(neu).slice(0, 200); if (a === b) return 'ocr';
  if (String(alt).replace(/\D/g, '') !== String(neu).replace(/\D/g, '')) return 'fachlich';
  let vor = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const z = [i]; for (let j = 1; j <= b.length; j++) z[j] = Math.min(vor[j] + 1, z[j - 1] + 1, vor[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); vor = z; }
  return vor[b.length] <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.25)) ? 'ocr' : 'fachlich';
}
// Zeilen eines PDF zu Absätzen fügen: volle Zeilen laufen weiter, Trennstriche am Zeilenende fallen weg.
function fliesstext(t) {
  const z = String(t).replace(/\r/g, '').split('\n').map(x => x.replace(/\s+$/, '')), voll = z.map(x => x.length).sort((a, b) => a - b)[Math.floor(z.length * 0.9)] || 0;
  let out = '';
  for (let i = 0; i < z.length; i++) {
    const a = z[i], b = z[i + 1];
    if (b === undefined) { out += a; break; }
    const kopf = /^(\d+(\.\d+)*\.?\s|[-–•*]\s|[a-z]\)\s|Tabelle\s|Fig(ur|\.)\s)/.test(b.trim());
    if (!a.trim() || !b.trim() || kopf || a.length < voll * 0.7) { out += a + '\n'; continue; }
    if (/[a-zäöüß]-$/.test(a) && /^[a-zäöüß]/.test(b.trim()) && !/^(und|oder|bzw|sowie)\b/.test(b.trim())) out += a.slice(0, -1);
    else out += a + ' ';
  }
  return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
// Tabellen und Skizzen einer Seite: automatisch erkannte Elemente, überlagert mit den Übernahmen von Hand
function elementeVon(lib, dokId, seite) {
  const out = ((lib.elemente || {})[dokId] || []).filter(e => e.s === seite).map(e => Object.assign({ dokId }, e));
  (lib.uebernahmen || []).filter(u => u.dokId === dokId && u.seite === seite).forEach(u => {
    const i = out.findIndex(e => e.nr === u.nr);
    const o = { nr: u.nr, s: seite, dokId, typ: u.typ, box: u.box, titel: u.titel || '', zeilen: u.zeilen, ohneKopf: !!u.ohneKopf, hand: true, uid: u.id, text: i >= 0 ? out[i].text || '' : '', bild: u.bild || null, breite: u.breite || 0, ausr: u.ausr || '', nach: u.nach == null ? null : u.nach };
    if (u.weg) { if (i >= 0) out.splice(i, 1); } else if (i >= 0) out[i] = o; else out.push(o);
  });
  return out.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
}
// Wörter mit Lage (Anteile der Seite) zu Zeilen und Spalten einer Tabelle ordnen
function gitterAus(ws) {
  if (!ws.length) return [];
  const hs = ws.map(w => w.h).sort((a, b) => a - b), hm = hs[Math.floor(hs.length / 2)] || 0.012, reihen = [];
  ws.slice().sort((a, b) => a.y - b.y).forEach(w => { const r = reihen[reihen.length - 1]; if (r && Math.abs(w.y - r.y) < hm * 0.6) { r.w.push(w); r.y = r.w.reduce((q, x) => q + x.y, 0) / r.w.length; } else reihen.push({ y: w.y, w: [w] }); });
  const x0 = Math.min(...ws.map(w => w.x)), x1 = Math.max(...ws.map(w => w.x + w.w)), N = 1000, frei = new Array(N).fill(true), pos = x => Math.max(0, Math.min(N - 1, Math.round((x - x0) / Math.max(1e-6, x1 - x0) * (N - 1))));
  ws.forEach(w => { for (let i = pos(w.x); i <= pos(w.x + w.w); i++) frei[i] = false; });
  const min = Math.max(4, Math.round(0.014 / Math.max(1e-6, x1 - x0) * N)), grenzen = []; let a = -1;
  for (let i = 0; i < N; i++) { if (frei[i] && a < 0) a = i; if (!frei[i] && a >= 0) { if (i - a >= min) grenzen.push(x0 + (a + i) / 2 / (N - 1) * (x1 - x0)); a = -1; } }
  return reihen.map(r => { const z = new Array(grenzen.length + 1).fill(''); r.w.sort((p, q) => p.x - q.x).forEach(w => { const k = grenzen.filter(g => w.x + w.w / 2 > g).length; z[k] += (z[k] ? ' ' : '') + w.t; }); return z; });
}
// Seitentext: Grundtext aus dem PDF, darüber OCR-Korrekturen, darüber fachliche Änderungen einer Schicht
function seitenBasis(lib, dokId, seite) { const t = (lib.seitentext || {})[dokId]; return (t && t[seite - 1]) || ''; }
function kette(lib, dokId, seite, schichtId) { return (lib.aenderungen || []).filter(a => a.dokId === dokId && a.seite === seite && !a.zurueckgezogen && (schichtId ? a.art === 'fachlich' && a.schichtId === schichtId : a.art === 'ocr')); }
function textOcr(lib, dokId, seite) { const k = kette(lib, dokId, seite, ''); return k.length ? k[k.length - 1].nachher : seitenBasis(lib, dokId, seite); }
function textSchicht(lib, dokId, seite, schichtId) { const k = schichtId ? kette(lib, dokId, seite, schichtId) : []; return k.length ? k[k.length - 1].nachher : textOcr(lib, dokId, seite); }

if (typeof module !== 'undefined') module.exports = { elementeVon, gitterAus, zeilenAus, erkenneStruktur, fvSchluessel, teilInhalt, artVorschlag, fliesstext, diffWorte, stellen, seitenBasis, textOcr, textSchicht, sha256, neueVersion, freigegeben, standVon, offeneAenderungen, fassung, regelwerkExport, teileText, inhalt };

// ---------- Oberfläche ----------
if (typeof document !== 'undefined') (function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const h = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = { lib: null, view: { typ: 'start' }, tab: 'regeln', dirty: false, handle: null, q: '', kontext: null, mitEntwurf: false, offen: {} };
  // ----- Mehrnutzerbetrieb (nur wenn werkzeuge/mehrnutzer.js die Seite ausliefert): Anmeldung, Rolle, Bearbeitungssperre
  const M = { an: false, ich: null, revision: 0, sperre: null, hat: false, geladen: {}, aktiv: Date.now(), holt: null, fehler: '' };
  const ROLLE = { gast: 'Gast', autor: 'Autor', pruefer: 'Prüfer', admin: 'Admin' };
  const darfFreigeben = () => M.an ? !!M.ich && (M.ich.rolle === 'pruefer' || M.ich.rolle === 'admin') : (S.lib.meta.pruefer || []).includes(S.lib.meta.bearbeiter);
  async function ruf(pfad, methode, daten) {
    try { const r = await fetch(pfad, { method: methode || 'GET', headers: daten !== undefined ? { 'Content-Type': 'application/json' } : {}, body: daten !== undefined ? JSON.stringify(daten) : undefined, cache: 'no-store', credentials: 'same-origin' }); let j = {}; try { j = await r.json(); } catch (e) { /* ohne Inhalt */ } return { ok: r.ok, status: r.status, j }; }
    catch (e) { return { ok: false, status: 0, j: { fehler: 'Der Server ist nicht erreichbar.' } }; }
  }
  { let d = false; Object.defineProperty(S, 'dirty', { enumerable: true, get: () => d, set: v => { const neu = !!v && !d; d = !!v; if (neu && M.an && !M.hat) sperreHolen(true); } }); }
  function sperreHolen(nach) { // nach: eine Änderung ist schon gemacht; ohne Sperre wird sie verworfen
    if (M.holt) return M.holt;
    return (M.holt = (async () => {
      const r = await ruf('api/sperre', 'POST', { aktion: 'nehmen', revision: M.revision }); M.holt = null;
      if (r.ok) { M.hat = true; M.sperre = r.j.sperre; mStatus(); return true; }
      if (r.j.sperre !== undefined) M.sperre = r.j.sperre;
      const warum = r.status === 403 ? 'Als Gast lässt sich die Bibliothek lesen, aber nicht bearbeiten.' : r.status === 409 ? 'Auf dem Server liegt ein neuerer Stand.' : r.status === 401 ? 'Die Anmeldung ist abgelaufen.' : (r.j.fehler || 'Die Bearbeitung ist gesperrt.');
      if (nach || r.status === 409) { await neuLaden(); meldung(warum + (nach ? ' Die Änderung wurde nicht übernommen.' : ' Er ist jetzt geladen.')); } else { mStatus(); meldung(warum); }
      return false;
    })());
  }
  function mStatus() { // Anzeige der Sperre im Kopf, ohne die Seite neu aufzubauen
    const el = document.getElementById('mstatus'); if (!el) return;
    el.textContent = M.hat ? 'Sie bearbeiten' : M.sperre ? `${M.sperre.name} bearbeitet seit ${new Date(M.sperre.seit).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}` : 'Niemand bearbeitet';
    el.className = 'ablage' + (M.hat ? '' : M.sperre ? ' besetzt' : ' nurlesen');
    const b = document.getElementById('msperre'); if (b) { b.textContent = M.hat ? 'Bearbeitung beenden' : 'Bearbeiten'; b.hidden = !M.ich || M.ich.rolle === 'gast'; b.disabled = !M.hat && !!M.sperre; }
  }
  async function neuLaden() { const v = S.view, tab = S.tab, ed = Object.assign({}, S.ed); await ladeBibliothek(); if (v.typ !== 'werk' || S.lib.werke.some(w => w.id === v.id)) { S.view = v; S.tab = tab; Object.assign(S.ed, ed, { edit: false }); } render(); }
  async function takt() { // alle 15 Sekunden: Sperre halten oder Stand abfragen
    if (!M.an || !M.ich || !S.lib) return;
    const ruhig = Date.now() - M.aktiv > 10 * 60 * 1000;
    const r = M.hat ? await ruf('api/sperre', 'POST', { aktion: S.dirty || !ruhig ? 'nehmen' : 'geben' }) : await ruf('api/stand');
    if (r.status === 401) { M.ich = null; M.hat = false; if (!S.dirty) { S.lib = null; A.laedt = false; render(); } else meldung('Die Anmeldung ist abgelaufen. Bitte unter „Daten“ die Datensicherung herunterladen und neu anmelden.'); return; }
    if (r.status === 423 && M.hat) { M.hat = false; M.sperre = r.j.sperre || null; meldung('Die Bearbeitungssperre liegt nicht mehr bei Ihnen. Vor dem Weiterarbeiten bitte „Bearbeiten“ wählen.'); }
    else if (r.ok) { M.hat = !!r.j.ich; M.sperre = r.j.sperre || null; if (r.j.revision !== M.revision && !S.dirty && !(document.getElementById('dlg') || {}).open && !(S.ed.edit && S.tab === 'edit')) { await neuLaden(); meldung('Ein neuer Stand vom Server ist geladen.'); } }
    mStatus();
  }
  const L = () => S.lib;
  const werk = id => L().werke.find(w => w.id === id);
  const hg = id => L().herausgeber.find(x => x.id === id) || { kurz: '?', name: '?', art: '' };
  const regel = id => L().regeln.find(r => r.id === id);
  const thema = k => (L().themen.find(t => t[0] === k) || [k, k])[1];
  const heute = () => new Date().toISOString().slice(0, 10);
  const datumCH = iso => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
  const uid = p => p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const istSchicht = w => w.art === 'schicht';
  const layer0 = istSchicht;
  const ebeneVon = w => hg(w.herausgeberId).art === 'kanton' ? 'kanton' : 'hersteller';
  S.dokWahl = {}; S.auf = {};
  S.ed = { dok: null, seite: 1, ansicht: 'hybrid', ebene: '', edit: false, entwurf: '', filter: 'alle', links: 'scan', transp: 60, zScan: true, zText: true, zMarken: true, such: '', ers: '', vgl: false, vz: 'seite', vsync: true, vtext: 'fliess', vlineal: false, vzl: 0, vblink: false, vblinkT: true };
  S.wahlAus = new Set(); S.vgl = { a: '', b: 'jetzt' };
  S.bib = { q: '', gruppe: '', status: '', hg: '', liste: false };
  const R = { offen: [] };
  const PROGRAMM = (document.querySelector('meta[name=nb-version]') || {}).content || '';
  const dokus = id => L().dokumente.filter(d => d.werkId === id);
  const dokId = id => L().dokumente.find(d => d.id === id);
  const dokVon = id => dokus(id)[0];
  const istGanz = w => dokus(w.id).length > 1 && (!S.dokWahl[w.id] || S.dokWahl[w.id] === '*');
  function migriere() { // fehlende Felder älterer Stände ergänzen
    const l = S.lib; ['anmerkungen', 'dokumente', 'aenderungen', 'formate', 'glossar', 'abschnitte', 'versionen', 'verlauf'].forEach(k => { l[k] = l[k] || []; }); ['titelbilder', 'seitentext', 'struktur', 'elemente', 'unsicher', 'ocr', 'vorschlaege'].forEach(k => { l[k] = l[k] || {}; }); l.uebernahmen = l.uebernahmen || [];
    l.dokumente.forEach(d => { if (d.teil == null) d.teil = ''; });
    l.anmerkungen.forEach(a => { if (!a.dokId) { const d = l.dokumente.find(x => x.werkId === a.werkId); if (d) a.dokId = d.id; } });
  }
  const FV = { text: 'Fliesstext', titel: 'Normtitel', u1: 'Überschrift 1', u2: 'Überschrift 2', u3: 'Überschrift 3', tabelle: 'Tabellentitel', bild: 'Bildbeschriftung', fussnote: 'Fussnote', liste: 'Aufzählung', formel: 'Formel' };
  const ANM = { kommentar: 'Kommentar', aenderung: 'Änderungsvorschlag', frage: 'Offene Frage' };
  const P = { werkId: null, docs: new Map(), gen: 0, canvases: new Map(), obs: null, zoom: 100, ziel: null, mark: false, markArt: 'kommentar', markWeise: 'text', aktiv: null, schnitte: new Map(), kette: Promise.resolve(), seitenbild: null };

  function log(aktion, ziel, detail) { L().verlauf.push({ zeit: new Date().toISOString(), name: L().meta.bearbeiter || '', aktion, ziel, detail: detail || '' }); S.dirty = true; }
  function mitName(dann) {
    if (M.an) {
      if (!M.ich || M.ich.rolle === 'gast') return meldung('Als Gast lässt sich die Bibliothek lesen, aber nicht bearbeiten.');
      if (M.hat) return dann();
      sperreHolen(false).then(ok => { if (ok) { dann(); if (!$('#dlg').open) render(); } }); return false;
    }
    if (L().meta.bearbeiter) return dann();
    dialog('Wer bearbeitet?', `<p class="hinweis">Der Name steht bei jeder Änderung im Verlauf.</p><label>Name<input name="name" required autocomplete="name"></label>`, d => { L().meta.bearbeiter = d.name.trim(); dann(); }, 'Weiter');
  }

  // ----- Dialog
  let dlgNr = 0;
  function dialog(titel, body, onOk, okText, breit) {
    const el = $('#dlg'), nr = ++dlgNr;
    el.innerHTML = `<form method="dialog" class="${breit ? 'breit' : ''}"><h2>${h(titel)}</h2><div class="dlg-body">${body}</div><p class="fehler" role="alert" hidden></p><div class="dlg-fuss"><button type="button" value="x" data-act="dlg-zu">Abbrechen</button>${onOk ? `<button class="haupt" value="ok">${h(okText || 'Übernehmen')}</button>` : ''}</div></form>`;
    const form = $('form', el);
    form.onsubmit = ev => {
      ev.preventDefault();
      const d = {}; new FormData(form).forEach((v, k) => { d[k] = typeof v === 'string' ? v : v; });
      const fehler = onOk && onOk(d, form);
      if (fehler && typeof fehler === 'string') { const f = $('.fehler', el); f.textContent = fehler; f.hidden = false; return; }
      if (fehler === false || dlgNr !== nr) return; // Folgedialog offen lassen
      el.close(); render();
    };
    if (!el.open) el.showModal();
    schnitteMount();
    const erstes = $('input,select,textarea', form); if (erstes) erstes.focus();
  }
  const opt = (liste, wert) => liste.map(([v, t]) => `<option value="${h(v)}"${v === wert ? ' selected' : ''}>${h(t)}</option>`).join('');
  const feld = (name, label, wert, attr) => `<label>${h(label)}<input name="${name}" value="${h(wert)}" ${attr || ''}></label>`;
  const bereich = (name, label, wert, attr) => `<label>${h(label)}<textarea name="${name}" rows="4" ${attr || ''}>${h(wert)}</textarea></label>`;
  function paramFelder(params) {
    const z = (params || []).concat([{ k: '', v: '', e: '' }, { k: '', v: '', e: '' }]);
    return `<fieldset><legend>Werte für das Auslegeprogramm</legend><div class="ptab"><span>Schlüssel</span><span>Wert</span><span>Einheit</span>${z.map((p, i) => `<input name="pk${i}" value="${h(p.k)}" aria-label="Schlüssel ${i + 1}"><input name="pv${i}" value="${h(p.v)}" aria-label="Wert ${i + 1}"><input name="pe${i}" value="${h(p.e)}" aria-label="Einheit ${i + 1}">`).join('')}</div></fieldset>`;
  }
  function leseParams(d) { const p = []; for (let i = 0; ('pk' + i) in d; i++) if (d['pk' + i].trim() || d['pv' + i].trim()) p.push({ k: d['pk' + i].trim(), v: d['pv' + i].trim(), e: d['pe' + i].trim() }); return p; }

  // ----- Bausteine
  const marke = (txt, art) => `<span class="marke ${art || ''}">${h(txt)}</span>`;
  function standMarke(liste, obj) { const s = standVon(L(), liste, obj); return s === 'neu' ? marke('neu, nicht freigegeben', 'entwurf') : s === 'geaendert' ? marke('geändert, nicht freigegeben', 'entwurf') : ''; }
  function paramTabelle(params) {
    if (!params || !params.length) return '';
    return `<table class="werte"><tbody>${params.map(p => `<tr><th scope="row">${h(p.k)}</th><td>${h(p.v)}${p.e ? ' ' + h(p.e) : ''}</td></tr>`).join('')}</tbody></table>`;
  }
  function seitenLink(werkId, seite, dId) {
    if (!seite) return '';
    const d = (dId && dokId(dId)) || dokVon(werkId);
    return d && /^\d+$/.test(seite) ? `<a href="#" data-act="pdf-seite" data-id="${h(d.werkId)}" data-dok="${h(d.id)}" data-seite="${h(seite)}">PDF-Seite ${h(seite)}</a>` : 'PDF-Seite ' + h(seite);
  }
  function regelKarte(r) {
    const w = werk(r.werkId), layer = istSchicht(w), ziel = r.zielId && regel(r.zielId);
    const ort = [r.abschnitt && h('Abschnitt ' + r.abschnitt), seitenLink(r.werkId, r.pdfSeite, r.dokId)].filter(Boolean).join(', ');
    const pruef = layer ? '' : (r.geprueft ? marke(`am Original geprüft: ${r.geprueft.name}, ${datumCH(r.geprueft.datum)}`, 'ok') : marke('zu bestätigen: nicht am Original geprüft', 'warn'));
    const veraltet = ziel && r.basisRev < ziel.rev ? marke('Basis aktualisiert – prüfen', 'warn') : '';
    const offen = S.offen[r.id];
    const hist = offen ? `<ol class="mini-verlauf">${L().verlauf.filter(v => v.ziel === r.id).map(v => `<li><time>${datumCH(v.zeit)}</time> ${h(v.name)}: ${h(v.aktion)}${v.detail ? ' – ' + h(v.detail) : ''}</li>`).join('') || `<li>Seit der Ersterfassung unverändert (${h(r.autor)}, ${datumCH(r.datum)}).</li>`}</ol>` : '';
    return `<article class="regel ${r.zurueckgezogen ? 'weg' : ''} art-${r.art}" id="r-${h(r.id)}">
      <header><span class="rid">${h(r.id)}</span>${layer ? marke(ARTEN[r.art], 'art') : ''}<span class="ort">${ort}</span></header>
      <h4>${h(r.titel)}</h4>
      ${ziel ? `<p class="ziel">betrifft <a href="#" data-act="zeige-regel" data-id="${h(ziel.id)}">${h(ziel.id)} ${h(ziel.titel)}</a></p>` : ''}
      ${r.art === 'aufheben' ? '<p class="text">Diese Regel gilt in dieser Schicht nicht.</p>' : `<p class="text">${h(r.text)}</p>`}
      ${paramTabelle(r.params)}
      ${r.begruendung ? `<p class="grund">Begründung: ${h(r.begruendung)}</p>` : ''}${r.quelle ? `<p class="grund">Quelle: ${h(r.quelle)}</p>` : ''}
      <p class="marken">${pruef}${veraltet}${standMarke('regeln', r)}${r.zurueckgezogen ? marke('zurückgezogen', 'weg') : ''}</p>
      <p class="aktionen">
        <button data-act="regel-edit" data-id="${h(r.id)}">Bearbeiten</button>
        ${layer ? (veraltet ? `<button data-act="basis-ok" data-id="${h(r.id)}">Gegen neue Basis geprüft</button>` : '') : `<button data-act="pruef" data-id="${h(r.id)}">${r.geprueft ? 'Prüfvermerk entfernen' : 'Als am Original geprüft markieren'}</button><button data-act="abweichung" data-id="${h(r.id)}">Abweichung oder Kommentar erfassen</button>`}
        <button data-act="regel-weg" data-id="${h(r.id)}">${standVon(L(), 'regeln', r) === 'neu' ? 'Löschen' : r.zurueckgezogen ? 'Wieder aufnehmen' : 'Zurückziehen'}</button>
        <button data-act="regel-hist" data-id="${h(r.id)}" aria-expanded="${!!offen}">Verlauf</button>
      </p>${hist}</article>`;
  }

  // ----- Kopf und Seitenleiste
  function kopf() {
    const v = letzteVersion(L()), n = R.offen.length, w = S.view.typ === 'werk' && werk(S.view.id);
    const ort = w ? w.kurz : ({ pruefung: 'Prüfungen', index: 'Index', glossar: 'Glossar', offen: 'Änderungen', fassung: 'Geltende Fassung', verlauf: 'Versionen und Verlauf', suche: 'Suche' })[S.view.typ];
    return `<header class="kopf">
      <div class="ort"><nav class="pfad" aria-label="Ort"><a href="#" data-act="ansicht" data-typ="start">Bibliothek</a>${ort ? `<span aria-hidden="true">/</span><b>${h(ort)}</b>` : ''}</nav>
        <p class="stand">${v ? `Version ${v.nr} vom ${datumCH(v.datum)}` : 'Noch keine Version freigegeben'}${n ? `, ${n} ${n === 1 ? 'Änderung' : 'Änderungen'} nicht freigegeben` : ''}</p></div>
      <label class="suche"><span class="sr">Suchen</span><input type="search" id="q" value="${h(S.q)}" placeholder="In Regeln, Texten und Anmerkungen suchen"></label>
      <div class="werkzeug">
        ${M.an ? `<button data-act="m-konto" aria-haspopup="dialog">${h(M.ich.anzeige)} · ${ROLLE[M.ich.rolle]}</button>` : `<button data-act="name">${L().meta.bearbeiter ? 'Bearbeitet von ' + h(L().meta.bearbeiter) : 'Namen angeben'}</button>`}
        <button data-act="freigeben" ${n && (!M.an || darfFreigeben()) ? '' : 'disabled'} ${M.an && !darfFreigeben() ? 'title="Versionen freigeben dürfen nur Prüfer"' : ''}>Änderungen freigeben</button>
        ${M.an ? `<span class="ablage" id="mstatus" role="status"></span><button id="msperre" data-act="m-sperre">Bearbeiten</button>` : A.dir ? `<span class="ablage" title="Gelesen und gespeichert wird in diesem Ordner">Ordner „${h(A.dir.name)}“</span>` : `<span class="ablage nurlesen" title="Ohne verbundenen Ordner lässt sich nicht direkt speichern">Nur lesen</span>${kannOrdner ? '<button data-act="ordner">Ordner verbinden</button>' : ''}`}
        ${M.an && M.ich.rolle === 'gast' ? '' : `<button class="haupt" data-act="speichern">${S.dirty ? 'Speichern •' : 'Speichern'}</button>`}
        <button data-act="mehr" aria-haspopup="dialog">Daten</button>
      </div></header>`;
  }
  function leiste() {
    const n = R.offen.length, w = S.view.typ === 'werk' && werk(S.view.id);
    const nav = (typ, txt, zahl) => `<a href="#" data-act="ansicht" data-typ="${typ}" class="${S.view.typ === typ ? 'aktiv' : ''}">${txt}${zahl ? `<i>${zahl}</i>` : ''}</a>`;
    const hgs = L().herausgeber.map(g => `<li><a href="#" data-act="bib-hg" data-id="${h(g.id)}" class="${S.view.typ === 'start' && S.bib.hg === g.id ? 'aktiv' : ''}">${h(g.kurz)}<i>${L().werke.filter(x => x.herausgeberId === g.id).length}</i></a><button class="klein" data-act="hg-edit" data-id="${h(g.id)}" aria-label="${h(g.kurz)} bearbeiten">ändern</button></li>`).join('');
    const st = w && werkStatus(w), ds = w ? dokus(w.id) : [];
    return `<nav class="leiste" aria-label="Bereiche">
      <div class="app"><span class="logo" aria-hidden="true"></span><span class="zeichen" aria-hidden="true"></span><h1>${h(L().meta.titel)}</h1></div>
      <div class="ansichten">${nav('start', 'Bibliothek')}${nav('offen', 'Änderungen', n)}${nav('pruefung', 'Prüfungen', L().werke.filter(w => dstat(w) === 'pruefung').length)}${nav('glossar', 'Glossar')}${nav('index', 'Index')}${nav('fassung', 'Geltende Fassung')}${nav('verlauf', 'Versionen und Verlauf')}</div>
      <h3>Herausgeber</h3><ul class="hgs">${hgs}</ul>
      <p class="neu"><button data-act="werk-neu">Norm oder Schicht anlegen</button><button data-act="hg-neu">Herausgeber anlegen</button></p>
      ${w ? `<div class="aktuell"><h3>Aktuelle Norm</h3><b>${h(w.kurz)}</b><span>${h(st.pill)}${st.rechts ? ', ' + h(st.rechts) : ''}</span>${ds.length ? `<span>${ds.reduce((x, d) => x + d.seiten, 0)} Seiten</span>` : ''}${w.ausgabe ? `<span>Ausgabe ${h(w.ausgabe)}</span>` : ''}</div>` : ''}</nav>`;
  }

  // ----- Original-PDF und Anmerkungen
  const anm = id => L().anmerkungen.find(a => a.id === id);
  // ----- Ablage: verbundener Ordner (lesen und schreiben) oder Webserver (nur lesen)
  const A = { dir: null, alt: null, neuPdf: new Map(), neuBild: new Map(), cache: new Map(), fehler: '', laedt: true };
  const webModus = /^https?:$/.test(location.protocol), kannOrdner = !!window.showDirectoryPicker;
  function idb(op, wert) { return new Promise(res => { try { const r = indexedDB.open('normenbibliothek', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = () => res(null); r.onsuccess = () => { try { const st = r.result.transaction('kv', op === 'get' ? 'readonly' : 'readwrite').objectStore('kv'), q = op === 'get' ? st.get('ordner') : st.put(wert, 'ordner'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }; } catch (e) { res(null); } }); }
  async function dateiHandle(pfad, anlegen) { let d = A.dir; const t = pfad.split('/'); for (const n of t.slice(0, -1)) d = await d.getDirectoryHandle(n, { create: !!anlegen }); return d.getFileHandle(t[t.length - 1], { create: !!anlegen }); }
  async function liesText(pfad) { if (A.dir) return (await (await dateiHandle(pfad)).getFile()).text(); const r = await fetch(encodeURI(pfad), { cache: 'no-store' }); if (!r.ok) throw new Error(pfad + ' fehlt (' + r.status + ')'); return r.text(); }
  async function liesBytes(pfad) { if (A.dir) return new Uint8Array(await (await (await dateiHandle(pfad)).getFile()).arrayBuffer()); const r = await fetch(encodeURI(pfad)); if (!r.ok) throw new Error(pfad + ' fehlt (' + r.status + ')'); return new Uint8Array(await r.arrayBuffer()); }
  async function schreibe(pfad, daten) { const w = await (await dateiHandle(pfad, true)).createWritable(); await w.write(daten); await w.close(); }
  const pdfDa = d => !!(d && (d.pfad || A.neuPdf.has(d.id)));
  async function pdfBytes(d) { // Kopie der Bytes; die letzten zwei PDF bleiben im Speicher
    if (A.neuPdf.has(d.id)) return A.neuPdf.get(d.id).slice();
    let b = A.cache.get(d.id); if (!b) { b = await liesBytes(d.pfad); A.cache.set(d.id, b); if (A.cache.size > 2) A.cache.delete(A.cache.keys().next().value); }
    return b.slice();
  }
  const pdfQuelle = d => !A.dir && webModus && !A.neuPdf.has(d.id) ? Promise.resolve({ url: encodeURI(d.pfad) }) : pdfBytes(d).then(data => ({ data }));
  function herunterladenBlob(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  function pdfLib() {
    const lib = window.pdfjsLib; if (!lib) throw new Error('Die PDF-Anzeige fehlt (lib/pdf.min.js).');
    if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    return lib;
  }
  function pdfReset() { P.docs.forEach(x => { if (x.doc) x.doc.destroy(); }); P.docs.clear(); P.werkId = null; P.canvases.clear(); P.gen++; }
  function pdfDoc(id) {
    let x = P.docs.get(id); if (x) return x.laden;
    const d = dokId(id); x = { doc: null };
    x.laden = pdfDa(d) ? pdfQuelle(d).then(q => pdfLib().getDocument(Object.assign({ isEvalSupported: false }, q)).promise).then(doc => (x.doc = doc)) : Promise.resolve(null);
    P.docs.set(id, x); return x.laden;
  }
  async function titelbildAus(bytes) {
    const doc = await pdfLib().getDocument({ data: bytes, isEvalSupported: false }).promise;
    try {
      const page = await doc.getPage(1), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 260 / v1.width });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return c.toDataURL('image/jpeg', 0.72);
    } finally { doc.destroy(); }
  }
  let tbLauf = false;
  async function titelbilderNachholen() { // für PDF ohne gespeichertes Titelbild (ältere Dateien)
    if (tbLauf) return; tbLauf = true;
    try {
      for (const el of Array.from(document.querySelectorAll('.deckel[data-fehlt]'))) {
        const id = el.dataset.fehlt;
        if (!L().titelbilder[id] && pdfDa(dokId(id))) { try { L().titelbilder[id] = await titelbildAus(await pdfBytes(dokId(id))); } catch (e) { continue; } }
        const z = document.querySelector(`.deckel[data-fehlt="${id}"]`);
        if (z && L().titelbilder[id]) { z.innerHTML = `<img src="${L().titelbilder[id]}" alt="">`; z.removeAttribute('data-fehlt'); }
      }
    } finally { tbLauf = false; }
  }
  const seitenTextAus = c => fliesstext(c.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join(''));
  async function strukturLesen(dok) { // Layout des PDF neu auswerten; von Hand gesetzte Formatvorlagen bleiben erhalten
    const doc = await pdfLib().getDocument({ data: await pdfBytes(dok), isEvalSupported: false }).promise, zeilen = [];
    try { for (let i = 1; i <= doc.numPages; i++) { const page = await doc.getPage(i); zeilen.push(zeilenAus((await page.getTextContent()).items, page.getViewport({ scale: 1 }).height)); } } finally { doc.destroy(); }
    L().struktur[dok.id] = erkenneStruktur(zeilen); S.dirty = true;
  }
  function bloeckeVon(dId) { // erkannte Struktur, überlagert mit den Korrekturen von Hand
    const st = L().struktur[dId], out = st ? st.bloecke.map(b => Object.assign({}, b)) : [];
    L().formate.filter(f => f.dokId === dId).forEach(f => {
      const i = out.findIndex(b => b.s === f.seite && fvSchluessel(b.t) === f.schluessel);
      if (f.typ === 'text') { if (i >= 0) out.splice(i, 1); }
      else if (i >= 0) { out[i].typ = f.typ; out[i].hand = true; }
      else out.push({ s: f.seite, typ: f.typ, nr: (/^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s/.exec(f.text) || [])[1] || '', t: f.text, hand: true });
    });
    return out.sort((a, b) => a.s - b.s);
  }
  function formatiert(html, dId, n) { // Zeilen des Seitentexts mit ihrer Formatvorlage auszeichnen
    const bl = bloeckeVon(dId).filter(b => b.s === n); if (!bl.length) return html;
    const st = L().struktur[dId] || { vorlagen: {}, koerper: 0 };
    const nachKey = new Map(bl.map(b => [fvSchluessel(b.t), b])), nachNr = new Map(bl.filter(b => b.nr && /^u\d$/.test(b.typ)).map(b => [b.nr, b]));
    return html.split('\n').map(z => {
      const klar = z.replace(/<del[^>]*>.*?<\/del>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim(); if (!klar) return z;
      const m = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s/.exec(klar), b = nachKey.get(fvSchluessel(klar)) || (m && klar.length <= 100 && nachNr.get(m[1])); if (!b) return z;
      const v = st.vorlagen[b.typ], rel = v && st.koerper ? Math.max(b.typ === 'fussnote' ? 0.8 : 1, Math.min(1.7, v.g / st.koerper)) : (b.typ === 'fussnote' ? 0.85 : 1);
      return `<span class="fv fv-${b.typ}" style="font-size:${rel.toFixed(2)}em">${z}</span>`;
    }).join('\n');
  }
  function fvSetzen(w, dId, seite, zeile, typ) {
    const text = zeile.replace(/\s+/g, ' ').trim().slice(0, 140), key = fvSchluessel(text); if (!key) return meldung('Die Zeile ist leer.');
    const auto = ((L().struktur[dId] || { bloecke: [] }).bloecke.find(b => b.s === seite && fvSchluessel(b.t) === key) || {}).typ || 'text';
    const alt = L().formate.find(f => f.dokId === dId && f.seite === seite && f.schluessel === key);
    if (alt && typ === auto && standVon(L(), 'formate', alt) === 'neu') { L().formate = L().formate.filter(f => f !== alt); log('Formatvorlage zurückgesetzt', w.id, `Seite ${seite}: ${text.slice(0, 50)}`); }
    else if (alt) { if (alt.typ === typ) return; Object.assign(alt, { typ, autor: L().meta.bearbeiter, datum: heute() }); log('Formatvorlage geändert', w.id, `Seite ${seite}: ${text.slice(0, 50)} ist ${FV[typ]}`); }
    else { if (typ === auto) return; L().formate.push({ id: uid('f'), werkId: w.id, dokId: dId, seite, schluessel: key, text, typ, autor: L().meta.bearbeiter, datum: heute() }); log('Formatvorlage zugewiesen', w.id, `Seite ${seite}: ${text.slice(0, 50)} ist ${FV[typ]}`); }
    digitalBeruehrt(w); meldung(`„${text.slice(0, 50)}“ ist jetzt ${FV[typ]}.`);
  }
  const edZeile = () => { const t = $('#ed-text'); if (!t) return ''; const v = t.value, a = v.lastIndexOf('\n', t.selectionStart - 1) + 1, b = v.indexOf('\n', t.selectionStart); return v.slice(a, b < 0 ? v.length : b); };
  const edZeileTyp = () => { const z = edZeile(), k = fvSchluessel(z), m = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s/.exec(z.trim()), bl = bloeckeVon(S.ed.dok).filter(b => b.s === S.ed.seite), b = bl.find(x => fvSchluessel(x.t) === k) || (m && bl.find(x => x.nr === m[1] && /^u\d$/.test(x.typ))); return b ? b.typ : 'text'; };
  async function seitentextLesen(dok) { // für PDF aus älteren Dateien
    const doc = await pdfLib().getDocument({ data: await pdfBytes(dok), isEvalSupported: false }).promise, texte = [];
    try { for (let i = 1; i <= doc.numPages; i++) texte.push(seitenTextAus(await (await doc.getPage(i)).getTextContent())); } finally { doc.destroy(); }
    L().seitentext[dok.id] = texte; S.dirty = true;
  }
  async function pdfEinlesen(w, file, alt, teil) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!String.fromCharCode.apply(null, bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error('Die Datei ist kein PDF.');
    let doc; try { doc = await pdfLib().getDocument({ data: bytes.slice(), isEvalSupported: false }).promise; } catch (e) { throw new Error(e && e.name === 'PasswordException' ? 'Das PDF ist mit einem Passwort geschützt.' : 'Das PDF lässt sich nicht lesen (' + (e && e.message || e) + ').'); }
    const masse = [], texte = [], zeilen = [];
    for (let i = 1; i <= doc.numPages; i++) { const page = await doc.getPage(i), v = page.getViewport({ scale: 1 }), c = await page.getTextContent(); masse.push([Math.round(v.width), Math.round(v.height)]); texte.push(seitenTextAus(c)); zeilen.push(zeilenAus(c.items, v.height)); }
    doc.destroy();
    const sum = sha256(bytes), id = alt ? alt.id : uid('d');
    const neu = { id, werkId: w.id, teil: teil || '', datei: file.name, groesse: bytes.length, pruefsumme: sum, seiten: masse.length, masse, datum: heute(), name: L().meta.bearbeiter };
    pdfReset(); A.neuPdf.set(id, bytes.slice()); A.cache.delete(id); neu.pfad = 'pdf/eigene/' + id + '_' + file.name.replace(/[^A-Za-z0-9._-]+/g, '_');
    L().dokumente = alt ? L().dokumente.map(x => x === alt ? neu : x) : L().dokumente.concat([neu]);
    w.digital = { status: 'ungeprueft' }; neu.geprueftSeiten = [];
    S.dokWahl[w.id] = id; L().seitentext[id] = texte; L().struktur[id] = erkenneStruktur(zeilen);
    try { L().titelbilder[id] = await titelbildAus(bytes.slice()); } catch (e) { delete L().titelbilder[id]; }
    log(alt ? (alt.pruefsumme === sum ? 'PDF erneut hinzugefügt' : 'PDF ersetzt') : 'PDF hinzugefügt', w.id, `${file.name}, ${masse.length} Seiten`);
  }
  function pdfForm(w, dok) {
    const n = dok ? L().anmerkungen.filter(a => a.dokId === dok.id).length : 0;
    dialog(dok ? 'PDF von ' + w.kurz + ' ersetzen' : 'PDF zu ' + w.kurz + ' hinzufügen', `${dok ? `<p class="fehler-fest">Das vorhandene PDF „${h(dok.datei)}“ wird ersetzt.${n ? ` ${n} ${n === 1 ? 'Anmerkung bleibt' : 'Anmerkungen bleiben'} auf ${n === 1 ? 'ihrer Seite' : 'ihren Seiten'} stehen.` : ''}</p>` : ''}
      <p class="hinweis">Das PDF bleibt unverändert und wird beim Speichern im Ordner pdf/eigene abgelegt.${A.dir ? '' : ' Dafür muss ein Ordner verbunden sein; ohne Ordner ist das PDF nur in dieser Sitzung vorhanden.'}</p>
      ${feld('teil', 'Bezeichnung des Teils (nur bei mehreren PDF je Norm)', dok ? dok.teil : '', 'placeholder="z. B. Kapitel 3, Anhang, Beilage"')}
      <label>PDF-Datei<input type="file" name="datei" accept="application/pdf,.pdf" required></label>`, (d, form) => {
      const file = d.datei; if (!file || !file.size) return 'PDF-Datei wählen.';
      if (file.size > 95e6) return 'Das PDF ist grösser als 95 MB. GitHub nimmt Dateien über 100 MB nicht an; bitte das PDF verkleinern oder aufteilen.';
      const knopf = $('button.haupt', form), txt = knopf.textContent; knopf.disabled = true; knopf.textContent = 'Wird eingelesen …';
      pdfEinlesen(w, file, dok, d.teil.trim()).then(() => { $('#dlg').close(); S.view = { typ: 'werk', id: w.id }; S.tab = 'pdf'; render(); }, e => { const f = $('.fehler', form); f.textContent = e.message; f.hidden = false; knopf.disabled = false; knopf.textContent = txt; });
      return false;
    }, dok ? 'Ersetzen' : 'Hinzufügen');
  }
  async function pdfText(w) {
    let alle = [], gesamt = ''; const ds = dokus(w.id).filter(pdfDa);
    for (const d of ds) {
      const doc = await pdfLib().getDocument({ data: await pdfBytes(d), isEvalSupported: false }).promise; let txt = '', zeichen = 0;
      for (let i = 1; i <= doc.numPages; i++) {
        const c = await (await doc.getPage(i)).getTextContent(), t = c.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join('');
        zeichen += t.replace(/\s/g, '').length; txt += `## PDF-Seite ${i}\n${t}\n\n`;
      }
      doc.destroy(); if (zeichen < 200) continue;
      let teile = teileText(txt, 'nummern'); if (teile.length < 3) teile = teileText(txt, 'seiten');
      alle = alle.concat(teile.map((t, i) => Object.assign({ id: d.id + '-a' + (i + 1), werkId: w.id, dokId: d.id }, t))); gesamt += txt;
    }
    if (!alle.length) return meldung('Dieses PDF enthält keinen Text (Scan). Den erkannten Text über „Originaltext einlesen“ laden.');
    L().abschnitte = L().abschnitte.filter(a => a.werkId !== w.id).concat(alle);
    w.import = { datum: heute(), name: L().meta.bearbeiter, datei: ds.map(d => d.datei).join(', ') + ' (Text aus dem PDF)', pruefsumme: sha256(gesamt), abschnitte: alle.length };
    log('Originaltext aus dem PDF übernommen', w.id, `${alle.length} Abschnitte`);
    S.tab = 'text'; render(); meldung(`${alle.length} Abschnitte aus dem PDF übernommen.`);
  }
  function geheZu(werkId, seite, anmId, dId) {
    const bleibt = S.view.typ === 'werk' && S.view.id === werkId && S.tab === 'pdf';
    if (!(S.view.typ === 'werk' && S.view.id === werkId)) S.view = { typ: 'werk', id: werkId };
    const d = (dId && dokId(dId)) || dokVon(werkId);
    if (bleibt) { if (dId && S.dokWahl[werkId] && S.dokWahl[werkId] !== '*') S.dokWahl[werkId] = dId; }
    else { S.tab = 'edit'; S.ed.dok = d && d.id; S.ed.seite = seite; S.ed.edit = false; }
    P.ziel = { seite, anm: anmId, dok: d && d.id }; if (anmId) P.aktiv = anmId;
  }
  // ----- Markierung im Text zeigt die Stelle im Original: Wörter der PDF-Seite mit ihrer Lage
  const wortNorm = t => String(t).toLowerCase().replace(/[äàâ]/g, 'a').replace(/[öô]/g, 'o').replace(/[üû]/g, 'u').replace(/[éèê]/g, 'e').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
  function lagenVon(dId) { // Wortlagen der neuen Texterkennung (daten/lagen/<Dokument>.json), nur für neu erkannte PDF
    P.lagen = P.lagen || new Map(); if (P.lagen.has(dId)) return P.lagen.get(dId);
    const pr = !L().ocr[dId] ? Promise.resolve(null) : liesText('daten/lagen/' + dId + '.json').then(t => JSON.parse(t).seiten || null).catch(() => null);
    P.lagen.set(dId, pr); return pr;
  }
  function seitenWorte(dId, n) { // Wörter der Seite mit Lage (Anteile der Seite): aus der neuen Texterkennung, sonst aus der Textebene des PDF
    P.worte = P.worte || new Map(); const key = dId + ':' + n; if (P.worte.has(key)) return P.worte.get(key);
    const pr = (async () => {
      try {
        const lg = await lagenVon(dId);
        if (lg && lg[n] && lg[n].length) return lg[n].map(a => ({ t: a[0], k: wortNorm(a[0]), x: a[1], y: a[2], w: a[3], h: a[4], strich: /[-‐]$/.test(a[0]), neu: true }));
        const doc = await pdfDoc(dId); if (!doc) return [];
        const page = await doc.getPage(n), vp = page.getViewport({ scale: 1 }), c = await page.getTextContent(), ws = [];
        c.items.forEach(it => {
          if (!it.str || !it.str.trim() || !it.width) return;
          const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]), hh = it.height || 10; let pos = 0;
          it.str.split(/(\s+)/).forEach(t => { if (t.trim()) ws.push({ t, k: wortNorm(t), x: (x + it.width * pos / it.str.length) / vp.width, y: (y - hh) / vp.height, w: it.width * t.length / it.str.length / vp.width, h: hh * 1.15 / vp.height, strich: /[-‐]$/.test(t) }); pos += t.length; });
        });
        return ws;
      } catch (e) { return []; }
    })();
    if (P.worte.size > 30) P.worte.delete(P.worte.keys().next().value);
    P.worte.set(key, pr); return pr;
  }
  function fundstellen(ws, tok) { // alle Stellen, an denen die Wortfolge im PDF steht; ein getrenntes Wort («Belas-» «tung») zählt als eines
    const out = [];
    for (let i = 0; i < ws.length; i++) {
      let j = i, ok = true; const teile = [];
      for (const t of tok) {
        if (j >= ws.length) { ok = false; break; }
        if (ws[j].k === t) { teile.push(ws[j]); j++; }
        else if (ws[j].strich && j + 1 < ws.length && ws[j].k + ws[j + 1].k === t) { teile.push(ws[j], ws[j + 1]); j += 2; }
        else { ok = false; break; }
      }
      if (ok && teile.length) out.push(teile);
    }
    return out;
  }
  async function zeigeImOriginal(text, davor) {
    const se = $('#pdfseiten .seite'); if (!se) return; se.querySelectorAll('.treffer').forEach(x => x.remove());
    const tok = String(text).split(/\s+/).map(wortNorm).filter(Boolean); if (!tok.length || tok.length > 40) return;
    const dId = se.dataset.dok, n = +se.dataset.seite, ws = (await seitenWorte(dId, n)).filter(w => w.k); if (se !== $('#pdfseiten .seite')) return;
    let fs = fundstellen(ws, tok); if (!fs.length && tok.length === 1 && tok[0].length >= 4) fs = ws.filter(w => w.k.startsWith(tok[0]) || (w.k.length >= 4 && tok[0].startsWith(w.k))).map(w => [w]);
    if (!fs.length) return;
    // die wievielte gleiche Stelle im Text ist markiert? Dieselbe Nummer im Original wird hervorgehoben.
    const vor = String(davor).split(/\s+/).map(wortNorm).filter(Boolean); let nr = 0; for (let i = 0; i + tok.length <= vor.length; i++) if (tok.every((t, k) => vor[i + k] === t)) nr++;
    const haupt = Math.min(nr, fs.length - 1); let ziel = null;
    fs.forEach((teile, i) => teile.forEach(w => { const d = document.createElement('div'); d.className = 'treffer' + (i === haupt ? ' haupt' : ''); d.style.cssText = `left:${(w.x * 100).toFixed(2)}%;top:${(w.y * 100).toFixed(2)}%;width:${(w.w * 100).toFixed(2)}%;height:${(w.h * 100).toFixed(2)}%`; se.appendChild(d); if (i === haupt && !ziel) ziel = d; }));
    if (ziel) { vglMount.still = $('#vgl-l'); clearTimeout(vglMount.t2); vglMount.t2 = setTimeout(() => { vglMount.still = null; }, 400); ziel.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  let auswahlT = 0;
  document.addEventListener('selectionchange', () => { clearTimeout(auswahlT); auswahlT = setTimeout(() => {
    if (!S.lib || S.view.typ !== 'werk' || S.tab !== 'edit' || !$('#pdfseiten .seite')) return;
    const ta = document.activeElement && document.activeElement.id === 'ed-text' ? document.activeElement : null;
    if (ta) { const a = ta.selectionStart, b = ta.selectionEnd; return zeigeImOriginal(a === b ? '' : ta.value.slice(a, b), ta.value.slice(0, a)); }
    const sel = document.getSelection(), feld = sel && sel.rangeCount && !sel.isCollapsed && sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('.lesetext');
    if (!feld) { const se = $('#pdfseiten .seite'); if (se && !P.mark) se.querySelectorAll('.treffer').forEach(x => x.remove()); return; }
    const r = sel.getRangeAt(0), vor = document.createRange(); vor.selectNodeContents(feld); vor.setEnd(r.startContainer, r.startOffset);
    zeigeImOriginal(sel.toString(), vor.toString());
  }, 160); });
  const VGL_STUFEN = [50, 75, 100, 125, 150, 200, 250, 300, 400];
  // ----- Zeilen der Seite, zeilengetreue Darstellung, Zuordnung Text ↔ Scan
  function zeilenAusWorten(ws) { // Wörter mit Lage zu Zeilen, von oben nach unten; in der Zeile von links nach rechts
    if (!ws.length) return [];
    const hs = ws.map(w => w.h).sort((a, b) => a - b), hm = hs[Math.floor(hs.length / 2)] || 0.012, zl = [];
    ws.map((w, i) => i).sort((p, q) => (ws[p].y + ws[p].h / 2) - (ws[q].y + ws[q].h / 2)).forEach(i => { const w = ws[i], z = zl[zl.length - 1], m = w.y + w.h / 2; if (z && Math.abs(m - z.m) < 0.55 * hm) { z.w.push(i); z.o = Math.min(z.o, w.y); z.u = Math.max(z.u, w.y + w.h); z.m = (z.o + z.u) / 2; } else zl.push({ m, o: w.y, u: w.y + w.h, w: [i] }); });
    zl.forEach(z => { z.w.sort((p, q) => ws[p].x - ws[q].x); z.x0 = ws[z.w[0]].x; z.x1 = Math.max(...z.w.map(k => ws[k].x + ws[k].w)); z.gr = Math.min(z.u - z.o, 2.2 * hm); });
    return zl;
  }
  function lcs(a, b, gleich) { // längste gemeinsame Folge: Paare [i, j]
    const n = a.length, m = b.length, t = new Uint16Array((n + 1) * (m + 1)), out = [];
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i * (m + 1) + j] = gleich(a[i], b[j]) ? t[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(t[(i + 1) * (m + 1) + j], t[i * (m + 1) + j + 1]);
    for (let i = 0, j = 0; i < n && j < m;) { if (gleich(a[i], b[j])) { out.push([i, j]); i++; j++; } else if (t[(i + 1) * (m + 1) + j] >= t[i * (m + 1) + j + 1]) i++; else j++; }
    return out;
  }
  function ersetzungen(dId, n, ws) { // Korrekturen am Grundtext auf die Wörter im Scan übertragen: Wortnummer → neuer Text
    const out = new Map(), basis = seitenBasis(L(), dId, n), eff = textOcr(L(), dId, n); if (basis === eff) return out;
    const tok = t => t.replace(/\[\[[^\]]*\]\]/g, ' ').split(/\s+/).filter(Boolean), A = tok(basis), B = tok(eff), ers = new Map(); let ia = 0, ib = 0;
    lcs(A, B, (x, y) => x === y).concat([[A.length, B.length]]).forEach(([x, y]) => {
      if (x > ia) { ers.set(ia, B.slice(ib, y).join(' ')); for (let k = ia + 1; k < x; k++) ers.set(k, ''); }
      else if (y > ib && ia > 0) ers.set(ia - 1, (ers.has(ia - 1) ? ers.get(ia - 1) : A[ia - 1]) + ' ' + B.slice(ib, y).join(' '));
      ia = x + 1; ib = y + 1;
    });
    if (ers.size) lcs(A.map(wortNorm), ws.map(w => w.k), (x, y) => !!x && x === y).forEach(([ai, wi]) => { if (ers.has(ai)) out.set(wi, ers.get(ai)); });
    return out;
  }
  async function zeilenBlatt(ziel, dId, n) { // der Text zeilengetreu: jede Zeile an ihrem Ort auf der Seite, Skizzen als Ausschnitt
    const dok = dokId(dId), ws = await seitenWorte(dId, n); if (!ziel.isConnected) return;
    const els = hatEl(dId) ? elementeVon(L(), dId, n).filter(e => e.typ === 'skizze') : [], inBild = w => els.some(e => w.x + w.w / 2 > e.box[0] && w.x + w.w / 2 < e.box[0] + e.box[2] && w.y + w.h / 2 > e.box[1] && w.y + w.h / 2 < e.box[1] + e.box[3]);
    const zl = zeilenAusWorten(ws), H = ziel.clientHeight, B = ziel.clientWidth, un = new Set(unsicherVon(dok, n)), ers = ersetzungen(dId, n, ws);
    ziel.innerHTML = (ws.length ? '' : '<p class="zgleer">Auf dieser Seite ist kein Text erkannt.</p>') + els.map(e => `<div class="zgbild" style="left:${e.box[0] * 100}%;top:${e.box[1] * 100}%;width:${e.box[2] * 100}%;height:${e.box[3] * 100}%">${schnittImg(dId, n, e.box, 'Skizze ' + e.nr)}</div>`).join('')
      + zl.map((z, i) => `<div class="zg" data-z="${i}" style="top:${(z.o * 100).toFixed(2)}%;height:${((z.u - z.o) * 100).toFixed(2)}%;font-size:${Math.max(3, z.gr * H * 0.9).toFixed(1)}px">${z.w.map(k => { const w = ws[k], t = ers.has(k) ? ers.get(k) : w.t; return t === '' || inBild(w) ? '' : `<span class="${ers.has(k) ? 'korr' : un.has(w.t) ? 'unsicher' : ''}" style="left:${(w.x * 100).toFixed(2)}%" data-b="${(w.w * B).toFixed(1)}">${h(t)}</span>`; }).join('')}</div>`).join('');
    ziel.querySelectorAll('.zg span').forEach(sp => { const b = sp.offsetWidth; if (b) sp.style.transform = `scaleX(${Math.min(2.5, Math.max(0.4, +sp.dataset.b / b)).toFixed(3)})`; });
    schnitteMount(); linealZeigen();
  }
  function domWorte(feld) { // Wörter des Fliesstextes mit ihrer Stelle im Dokumentbaum
    const out = [], tw = document.createTreeWalker(feld, NodeFilter.SHOW_TEXT); let nd;
    while ((nd = tw.nextNode())) { if (nd.parentElement.closest('figcaption')) continue; const re = /\S+/g; let m; while ((m = re.exec(nd.nodeValue))) { const k = wortNorm(m[0]); if (k) out.push({ nd, a: m.index, b: m.index + m[0].length, k }); } }
    return out;
  }
  async function vglZuordnen() { // welches Wort im Fliesstext ist welches Wort im Scan; daraus die Anker für das Scrollen
    const se = $('#vgl .seite'), v = $('#vgl'); if (!se || !v) return; const dId = se.dataset.dok, n = +se.dataset.seite, marke = dId + ':' + n + ':' + S.ed.ansicht + ':' + S.ed.vtext + ':' + S.ed.vblink;
    const ws = await seitenWorte(dId, n); if (!se.isConnected) return;
    const Z = { marke, ws, zl: zeilenAusWorten(ws), tk: [], zuTk: new Map(), anker: null }, feld = $('#vgl-r .vgltext .lesetext');
    if (feld) { Z.tk = domWorte(feld); lcs(Z.tk.map(t => t.k), ws.map(w => w.k), (x, y) => x === y).forEach(([i, j]) => Z.zuTk.set(j, i)); }
    vglMount.z = Z; if (S.ed.vzl >= Z.zl.length) S.ed.vzl = 0; vglAnker(); linealZeigen();
  }
  function vglAnker() { // Stützpunkte: Höhe im Scan (Anteil) ↔ Höhe im Textblatt (Anteil)
    const Z = vglMount.z, blatt = $('#vgl-r .vgltext'); if (!Z) return; Z.anker = null; if (!blatt || !Z.tk.length) return;
    const top = blatt.getBoundingClientRect().top, H = blatt.offsetHeight, roh = [], r = document.createRange();
    Z.zl.forEach(z => { const k = z.w.find(x => Z.zuTk.has(x)); if (k === undefined) return; const t = Z.tk[Z.zuTk.get(k)]; r.setStart(t.nd, t.a); r.setEnd(t.nd, t.b); const q = r.getBoundingClientRect(); if (q.height) roh.push([z.o, (q.top - top) / H]); });
    const se = $('#vgl .seite'); if (hatEl(se.dataset.dok)) elementeVon(L(), se.dataset.dok, +se.dataset.seite).forEach(e => { const f = document.getElementById('ue-' + e.nr.replace('.', '-')); if (f && blatt.contains(f)) { const q = f.getBoundingClientRect(); roh.push([e.box[1], (q.top - top) / H], [e.box[1] + e.box[3], (q.bottom - top) / H]); } });
    roh.sort((a, b) => a[0] - b[0]); const A = [[0, 0]]; roh.forEach(p => { const l = A[A.length - 1]; if (p[0] > l[0] + 0.004 && p[1] > l[1]) A.push(p); }); if (A[A.length - 1][0] < 1) A.push([1, Math.max(1, A[A.length - 1][1] + 0.001)]);
    if (A.length > 3) Z.anker = A;
  }
  function vglUm(x, vonLinks) { // Höhe von einem Blatt ins andere umrechnen (Anteile)
    const A = vglMount.z && vglMount.z.anker; if (!A) return x; const a = vonLinks ? 0 : 1, b = 1 - a;
    for (let i = 1; i < A.length; i++) if (x <= A[i][a] || i === A.length - 1) { const p = A[i - 1], q = A[i]; return p[b] + (q[b] - p[b]) * Math.max(0, Math.min(1.5, (x - p[a]) / Math.max(1e-6, q[a] - p[a]))); }
    return x;
  }
  function linealZeigen() { // aktuelle Zeile auf beiden Seiten hervorheben
    document.querySelectorAll('.lineal').forEach(x => x.remove()); document.querySelectorAll('.zg.aktiv').forEach(x => x.classList.remove('aktiv')); if (window.CSS && CSS.highlights) CSS.highlights.delete('lineal');
    const Z = vglMount.z, se = $('#vgl .seite'); if (!Z || !se || !S.ed.vlineal || S.ed.vblink || !Z.zl.length) return;
    const z = Z.zl[Math.max(0, Math.min(Z.zl.length - 1, S.ed.vzl))], d = document.createElement('div'); d.className = 'lineal'; d.style.cssText = `top:${((z.o - 0.0015) * 100).toFixed(2)}%;height:${((z.u - z.o + 0.003) * 100).toFixed(2)}%`; se.appendChild(d);
    const zg = document.querySelector(`#vgl-zg .zg[data-z="${Z.zl.indexOf(z)}"]`); if (zg) zg.classList.add('aktiv');
    if (window.CSS && CSS.highlights && window.Highlight && Z.tk.length) { const rs = z.w.filter(k => Z.zuTk.has(k)).map(k => { const t = Z.tk[Z.zuTk.get(k)], r = document.createRange(); r.setStart(t.nd, t.a); r.setEnd(t.nd, t.b); return r; }); if (rs.length) CSS.highlights.set('lineal', new Highlight(...rs)); }
  }
  function linealGehe(i, rollen) {
    const Z = vglMount.z; if (!Z || !Z.zl.length) return; S.ed.vzl = Math.max(0, Math.min(Z.zl.length - 1, i)); linealZeigen();
    if (!rollen) return; const li = $('#vgl-l'), bl = li.querySelector('.vglblatt'), z = Z.zl[S.ed.vzl], y = z.o * bl.offsetHeight + 14;
    if (y < li.scrollTop + 30 || y > li.scrollTop + li.clientHeight - 60) li.scrollTop = Math.max(0, y - li.clientHeight / 3);
  }
  function vglMount() { // Grösse beider Blätter aus dem Zoom berechnen; 100 % heisst: die ganze Seite passt ins Feld
    const v = $('#vgl'); document.body.classList.toggle('vglan', !!v); if (!v) { vglMount.z = null; if (window.CSS && CSS.highlights) CSS.highlights.delete('lineal'); return; }
    const E = S.ed, [a, b] = v.dataset.m.split('/').map(Number), li = $('#vgl-l'), re = $('#vgl-r');
    const bw = li.clientWidth - 28, bh = li.clientHeight - 28, fit = Math.max(160, Math.min(bw, bh * a / b));
    const W = Math.round(E.vz === 'breite' ? bw : fit * (E.vz === 'seite' ? 100 : E.vz) / 100); E.vzAkt = Math.round(W / fit * 100);
    v.querySelectorAll('.vglblatt').forEach(x => { x.style.width = W + 'px'; });
    const t = v.querySelector('.vgltext'); if (t) { t.style.minHeight = Math.round(W * b / a) + 'px'; t.style.fontSize = Math.max(4, W * 0.0165).toFixed(2) + 'px'; t.style.padding = `${Math.round(W * 0.06)}px ${Math.round(W * 0.08)}px`; }
    let zg = $('#vgl-zg'); const se = v.querySelector('.seite');
    if (E.vblink && !E.edit && se && !zg) { zg = document.createElement('div'); zg.id = 'vgl-zg'; zg.className = 'vglzeile blinklage'; zg.dataset.dok = se.dataset.dok; zg.dataset.seite = se.dataset.seite; se.appendChild(zg); }
    if (zg) { if (!zg.classList.contains('blinklage')) zg.style.height = Math.round(W * b / a) + 'px'; else { zg.hidden = !E.vblinkT; const was = $('#vgl-blinkwas'); if (was) was.textContent = E.vblinkT ? 'Zu sehen: erkannter Text' : 'Zu sehen: Scan'; } zeilenBlatt(zg, zg.dataset.dok, +zg.dataset.seite); }
    $('#vgl-z').textContent = E.vzAkt + ' %'; $('#vgl-seite').setAttribute('aria-pressed', E.vz === 'seite'); $('#vgl-breite').setAttribute('aria-pressed', E.vz === 'breite');
    clearTimeout(vglMount.t); vglMount.t = setTimeout(() => { const el = v.querySelector('.seite'); if (el) zeichne(el); }, 140);
    const Z = vglMount.z, marke = se ? se.dataset.dok + ':' + se.dataset.seite + ':' + E.ansicht + ':' + E.vtext + ':' + E.vblink : '';
    if (!Z || Z.marke !== marke || (Z.tk[0] && !Z.tk[0].nd.isConnected)) vglZuordnen(); else { vglAnker(); linealZeigen(); }
    if (li.dataset.gebunden) return; li.dataset.gebunden = '1';
    const felder = re ? [li, re] : [li];
    felder.forEach((x, i) => x.addEventListener('scroll', () => {
      if (!re || !S.ed.vsync || vglMount.still === x) return; const y = i ? li : re; vglMount.still = y; clearTimeout(vglMount.t2); vglMount.t2 = setTimeout(() => { vglMount.still = null; }, 80);
      // zeilengenau: die Stelle auf einem Drittel der Höhe des Feldes steht auf beiden Seiten gleich hoch
      const bx = x.querySelector('.vglblatt'), by = y.querySelector('.vglblatt'), ant = (x.scrollTop + x.clientHeight / 3 - 14) / Math.max(1, bx.offsetHeight);
      y.scrollTop = vglUm(ant, i === 0) * by.offsetHeight + 14 - y.clientHeight / 3; y.scrollLeft = x.scrollLeft / Math.max(1, x.scrollWidth - x.clientWidth) * (y.scrollWidth - y.clientWidth);
    }, { passive: true }));
    v.addEventListener('wheel', ev => { if (!ev.ctrlKey) return; ev.preventDefault(); vglZoom(ev.deltaY < 0 ? 1 : -1); }, { passive: false });
    v.addEventListener('click', ev => { // Zeilenlineal: Klick setzt die Zeile
      if (!S.ed.vlineal || P.mark || ev.target.closest('button,a,input,select,textarea,label')) return; const Z2 = vglMount.z; if (!Z2) return;
      const zgl = ev.target.closest('.zg'); if (zgl) return linealGehe(+zgl.dataset.z, false);
      const s2 = ev.target.closest('.seite'); if (!s2) return; const q = s2.getBoundingClientRect(), y = (ev.clientY - q.top) / q.height; let best = 0; Z2.zl.forEach((z, k) => { if (Math.abs((z.o + z.u) / 2 - y) < Math.abs((Z2.zl[best].o + Z2.zl[best].u) / 2 - y)) best = k; }); linealGehe(best, false);
    });
  }
  function vglZoom(d, v) {
    const E = S.ed; if (v) E.vz = v; else { const jetzt = E.vzAkt || 100, st = d > 0 ? VGL_STUFEN.find(x => x > jetzt + 2) : VGL_STUFEN.slice().reverse().find(x => x < jetzt - 2); if (!st) return; E.vz = st; }
    vglMount();
  }
  window.addEventListener('resize', () => { if ($('#vgl')) vglMount(); });
  const TASTEN = [['← →', 'vorherige, nächste Seite'], ['Enter', 'Seite als verglichen markieren und zur nächsten'], ['N', 'nächste Seite mit unsicher gelesenen Stellen'], ['+ −', 'grösser, kleiner'], ['Z', 'Fliesstext oder zeilengetreu'], ['L', 'Zeilenlineal ein und aus'], ['↑ ↓', 'Zeilenlineal: eine Zeile hinauf, hinunter'], ['B', 'Blinkvergleich ein und aus'], ['Leertaste', 'Blinkvergleich: zwischen Scan und Text wechseln'], ['E', 'Text bearbeiten'], ['Esc', 'Vergleich beenden']];
  function naechsteUnsichere() { const d = dokId(S.ed.dok); for (let k = S.ed.seite + 1; k <= d.seiten; k++) if (unsicherVon(d, k).length) { S.ed.seite = k; return true; } meldung('Nach dieser Seite gibt es in diesem PDF keine unsicher gelesenen Stellen mehr.'); return false; }
  document.addEventListener('keydown', ev => {
    if (!S.lib || !S.ed.vgl || S.view.typ !== 'werk' || $('#dlg').open || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const E = S.ed, ziel = ev.target, tippt = ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.tagName === 'SELECT');
    if (ev.key === 'Escape' && !E.edit) { E.vgl = false; return render(); }
    if (tippt || E.edit) return;
    const d = dokId(E.dok), k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key, tu = f => { ev.preventDefault(); f(); };
    if (k === 'ArrowLeft' && E.seite > 1) tu(() => { E.seite--; render(); });
    else if (k === 'ArrowRight' && E.seite < d.seiten) tu(() => { E.seite++; render(); });
    else if (k === 'ArrowUp' && E.vlineal) tu(() => linealGehe(E.vzl - 1, true));
    else if (k === 'ArrowDown' && E.vlineal) tu(() => linealGehe(E.vzl + 1, true));
    else if (k === 'Enter' && ziel.tagName !== 'BUTTON') tu(() => mitName(() => { const set = new Set(d.geprueftSeiten || []); if (!set.has(E.seite)) { set.add(E.seite); d.geprueftSeiten = [...set].sort((x, y) => x - y); log('Seite mit dem Original verglichen', d.werkId, `${d.teil ? d.teil + ', ' : ''}Seite ${E.seite}`); } if (E.seite < d.seiten) E.seite++; render(); }));
    else if (k === 'n') tu(() => { if (naechsteUnsichere()) render(); });
    else if (k === '+' || k === '=') tu(() => vglZoom(1));
    else if (k === '-') tu(() => vglZoom(-1));
    else if (k === 'z') tu(() => { E.vtext = E.vtext === 'zeile' ? 'fliess' : 'zeile'; E.vblink = false; render(); });
    else if (k === 'l') tu(() => { E.vlineal = !E.vlineal; render(); });
    else if (k === 'b') tu(() => { E.vblink = !E.vblink; E.vblinkT = true; render(); });
    else if (k === ' ' && E.vblink && ziel.tagName !== 'BUTTON') tu(() => { E.vblinkT = !E.vblinkT; vglMount(); });
    else if (k === 'e') tu(() => { const b = document.querySelector('#vgl [data-act=ed-edit]'); if (b) b.click(); });
  });
  function pdfMount() {
    const box = $('#pdfseiten'); if (!box) return;
    if (P.werkId !== box.dataset.werk) { pdfReset(); P.werkId = box.dataset.werk; }
    if (P.obs) P.obs.disconnect();
    P.obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) zeichne(e.target); }), { rootMargin: '700px 0px' });
    box.querySelectorAll('.seite').forEach(el => P.obs.observe(el));
    if (P.ziel) {
      const z = P.ziel; P.ziel = null;
      const el = (z.anm && document.getElementById('f-' + z.anm)) || box.querySelector(`.seitenblock[data-seite="${z.seite}"]${z.dok ? `[data-dok="${z.dok}"]` : ''}`);
      if (el) el.scrollIntoView({ block: el.classList.contains('fleck') ? 'center' : 'start' });
      const k = z.anm && document.getElementById('a-' + z.anm); if (k) k.scrollIntoView({ block: 'nearest' });
    }
  }
  async function zeichne(el) {
    const n = +el.dataset.seite, dk = el.dataset.dok, breite = Math.round(el.clientWidth * Math.min(window.devicePixelRatio || 1, 2)); if (!breite) return;
    const key = dk + ':' + n + '@' + breite; let c = P.canvases.get(key);
    if (c) { P.canvases.delete(key); P.canvases.set(key, c); if (c.parentNode !== el) { const a = el.querySelector('canvas'); if (a) a.remove(); el.prepend(c); } el.dataset.fertig = '1'; if (el.dataset.hybrid) textEbene(el); return; }
    if (el.dataset.laeuft === key) return; el.dataset.laeuft = key;
    const gen = P.gen; let doc; try { doc = await pdfDoc(dk); } catch (e) { el.innerHTML = `<p class="fehler-fest">Das PDF lässt sich nicht anzeigen: ${h(e.message || e)}</p>`; return; }
    if (!doc || gen !== P.gen) return;
    let page; try { page = await doc.getPage(n); } catch (e) { delete el.dataset.laeuft; return; }
    const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: breite / v1.width });
    c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    try { await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; } catch (e) { delete el.dataset.laeuft; return; } // abgebrochen, weil inzwischen eine andere Norm offen ist
    if (gen !== P.gen) return;
    P.canvases.set(key, c);
    if (P.canvases.size > 14) { const k = P.canvases.keys().next().value, alt = P.canvases.get(k); P.canvases.delete(k); alt.remove(); alt.width = alt.height = 0; }
    const jetzt = document.querySelector(`#pdfseiten .seite[data-dok="${dk}"][data-seite="${n}"]`);
    if (jetzt) { const a = jetzt.querySelector('canvas'); if (a) a.remove(); jetzt.prepend(c); jetzt.dataset.fertig = '1'; if (jetzt.dataset.hybrid) textEbene(jetzt); }
  }
  async function textEbene(el) { // erkannter Text des PDF positionsgenau über dem Scan
    if (el.dataset.tl) return; el.dataset.tl = '1';
    const gen = P.gen, ws = await seitenWorte(el.dataset.dok, +el.dataset.seite); if (gen !== P.gen || !el.isConnected) return;
    if (ws.length && ws[0].neu) { // neu erkannter Text: derselbe wie in der Textspalte
      const div = document.createElement('div'); div.className = 'textebene neu'; const H = el.clientHeight, B = el.clientWidth, zeilen = [];
      const hs = ws.map(w => w.h).sort((a, b) => a - b), hm = hs[Math.floor(hs.length / 2)];
      ws.forEach(w => { const z = zeilen[zeilen.length - 1], m = w.y + w.h / 2; if (z && Math.abs(m - z.m) < 0.6 * hm && w.x > z.x1 - 0.01) { z.w.push(w); z.o = Math.min(z.o, w.y); z.u = Math.max(z.u, w.y + w.h); z.x1 = w.x + w.w; } else zeilen.push({ m, o: w.y, u: w.y + w.h, x1: w.x + w.w, w: [w] }); });
      div.innerHTML = zeilen.map(z => { const gr = Math.max(4, Math.min(z.u - z.o, 2.2 * hm) * H * 0.9); return z.w.map(w => `<span style="left:${(w.x * 100).toFixed(2)}%;top:${(z.o * 100).toFixed(2)}%;font-size:${gr.toFixed(1)}px" data-b="${(w.w * B).toFixed(1)}">${h(w.t)}</span>`).join(''); }).join('');
      el.appendChild(div);
      div.querySelectorAll('span').forEach(sp => { const b = sp.offsetWidth; if (b) sp.style.transform = `scaleX(${Math.min(3, +sp.dataset.b / b).toFixed(3)})`; });
      el.dataset.tlfertig = '1'; return;
    }
    const doc = await pdfDoc(el.dataset.dok); if (!doc || gen !== P.gen || !el.isConnected) return;
    const page = await doc.getPage(+el.dataset.seite), v1 = page.getViewport({ scale: 1 }), sc = el.clientWidth / v1.width;
    const div = document.createElement('div'); div.className = 'textebene'; div.style.setProperty('--scale-factor', sc);
    el.appendChild(div);
    await pdfLib().renderTextLayer({ textContentSource: await page.getTextContent(), container: div, viewport: page.getViewport({ scale: sc }), textDivs: [] }).promise;
    el.dataset.tlfertig = '1';
  }
  async function textImRechteck(dId, seite, r) { // Text des PDF innerhalb eines markierten Rechtecks (Anteile 0..1)
    try {
      const nw = await seitenWorte(dId, seite);
      if (nw.length && nw[0].neu) return nw.filter(w => { const mx = w.x + w.w / 2, my = w.y + w.h / 2; return mx >= r.x && mx <= r.x + r.w && my >= r.y - 0.004 && my <= r.y + r.h + 0.004; }).map(w => w.t).join(' ').slice(0, 600);
      const doc = await pdfDoc(dId); if (!doc) return '';
      const page = await doc.getPage(seite), vp = page.getViewport({ scale: 1 }), c = await page.getTextContent(), teile = [];
      c.items.forEach(it => {
        if (!it.str || !it.str.trim() || !it.width) return;
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]), hh = it.height || 10, cy = (y - hh / 2) / vp.height;
        if (cy < r.y - 0.004 || cy > r.y + r.h + 0.004) return;
        const von = (r.x * vp.width - x) / it.width, bis = ((r.x + r.w) * vp.width - x) / it.width; if (bis <= 0 || von >= 1) return;
        let a = Math.max(0, Math.floor(von * it.str.length)), b = Math.min(it.str.length, Math.ceil(bis * it.str.length));
        while (a > 0 && /\S/.test(it.str[a - 1]) && /\S/.test(it.str[a])) a--; while (b < it.str.length && /\S/.test(it.str[b]) && /\S/.test(it.str[b - 1])) b++;
        if (it.str.slice(a, b).trim()) teile.push({ y, x, s: it.str.slice(a, b).trim() });
      });
      teile.sort((p1, p2) => Math.abs(p1.y - p2.y) > 3 ? p1.y - p2.y : p1.x - p2.x);
      return teile.map(t => t.s).join(' ').replace(/\s+/g, ' ').slice(0, 600);
    } catch (e) { return ''; }
  }
  // Antworten auf eine Anmerkung (Diskussion). Freigegebene Antworten lassen sich nur zurückziehen, neue auch löschen.
  const antwFrei = a => { const alt = freigegeben(L()).anmerkungen.find(x => x.id === a.id); return new Set(((alt && alt.antworten) || []).map(r => r.nr)); };
  function antwortenHtml(a) {
    const rs = a.antworten || []; if (!rs.length) return '';
    const frei = antwFrei(a);
    return `<ol class="antworten" aria-label="Antworten auf Anmerkung ${a.nr}">${rs.map(r => `<li class="${r.zurueckgezogen ? 'weg' : ''}" id="r-${h(a.id)}-${r.nr}"><p class="text">${h(r.text)}</p><p class="grund">${h(r.autor)}, ${datumCH(r.datum)}${frei.has(r.nr) ? '' : ', nicht freigegeben'}${r.zurueckgezogen ? ', zurückgezogen' : ''} <button class="klein" data-act="antw-weg" data-id="${h(a.id)}" data-nr="${r.nr}">${!frei.has(r.nr) ? 'Löschen' : r.zurueckgezogen ? 'Wieder aufnehmen' : 'Zurückziehen'}</button></p></li>`).join('')}</ol>`;
  }
  const antwortText = a => (a.antworten || []).filter(r => !r.zurueckgezogen);
  function antwortForm(a) {
    dialog('Antwort auf Anmerkung ' + a.nr, `<blockquote class="zitat">${h(a.text)}<footer>${h(a.autor)}, ${datumCH(a.datum)}</footer></blockquote>
      ${bereich('text', 'Antwort', '', 'required')}
      ${a.erledigt ? '' : '<label class="haken"><input type="checkbox" name="erledigt"> Anmerkung damit als erledigt markieren</label>'}`, d => {
      const text = d.text.trim(); if (!text) return 'Antwort eingeben.';
      const rs = a.antworten = a.antworten || [], nr = rs.reduce((m, r) => Math.max(m, r.nr), 0) + 1;
      rs.push({ nr, text, autor: L().meta.bearbeiter, datum: heute(), zurueckgezogen: false });
      log('Antwort auf Anmerkung', a.id, 'Antwort ' + nr); P.aktiv = a.id;
      if (d.erledigt && !a.erledigt) { a.erledigt = true; log('Anmerkung erledigt', a.id); }
    }, 'Antworten', true);
  }
  // Markierte Stelle im PDF: Rechteck oder, bei Textauswahl, eine Fläche je Zeile
  function fleckHtml(a) {
    const b = a.rect, pz = v => (v * 100).toFixed(2) + '%', zl = a.rects && a.rects.length && b.w > 0 && b.h > 0 ? a.rects : null;
    return `<button class="fleck art-${a.art}${zl ? ' text' : ''}${a.erledigt ? ' erledigt' : ''}${P.aktiv === a.id ? ' aktiv' : ''}" id="f-${h(a.id)}" data-act="fleck" data-id="${h(a.id)}" style="left:${pz(b.x)};top:${pz(b.y)};width:${pz(b.w)};height:${pz(b.h)}" aria-label="Anmerkung ${a.nr}: ${h(a.text.slice(0, 80))}">${zl ? zl.map(z => `<i style="left:${pz((z.x - b.x) / b.w)};top:${pz((z.y - b.y) / b.h)};width:${pz(z.w / b.w)};height:${pz(z.h / b.h)}"></i>`).join('') : ''}<span>${a.nr}</span></button>`;
  }
  const markText = () => P.markWeise !== 'rechteck' && P.markArt !== 'tabelle' && P.markArt !== 'skizze';
  const markKl = () => P.mark ? ' mark' + (markText() ? ' marktext' : '') : '';
  const weiseWahl = () => `<span class="umschalt" role="group" aria-label="Art der Markierung"><button data-act="mark-weise" data-v="text" aria-pressed="${P.markWeise !== 'rechteck'}">Text</button><button data-act="mark-weise" data-v="rechteck" aria-pressed="${P.markWeise === 'rechteck'}">Rechteck</button></span>`;
  function anmKarte(a) {
    const r = a.regelId && regel(a.regelId), offen = S.offen[a.id], neu = standVon(L(), 'anmerkungen', a) === 'neu';
    const hist = offen ? `<ol class="mini-verlauf">${(a.frueher || []).map(f => `<li><time>${datumCH(f.datum)}</time> ${h(f.autor)}, Fassung ${f.rev} (${h(ANM[f.art])}): ${h(f.text)}</li>`).join('')}${L().verlauf.filter(v => v.ziel === a.id).map(v => `<li><time>${datumCH(v.zeit)}</time> ${h(v.name)}: ${h(v.aktion)}</li>`).join('')}</ol>` : '';
    return `<article class="anm art-${a.art}${a.zurueckgezogen ? ' weg' : ''}${a.erledigt ? ' erledigt' : ''}${P.aktiv === a.id ? ' aktiv' : ''}" id="a-${h(a.id)}">
      <header><span class="nr">${a.nr}</span>${marke(ANM[a.art], a.art === 'frage' ? 'warn' : a.art === 'aenderung' ? 'art' : '')}<a href="#" data-act="anm-zeige" data-id="${h(a.id)}">${dokus(a.werkId).length > 1 && dokId(a.dokId) ? h(dokId(a.dokId).teil || dokId(a.dokId).datei) + ', ' : ''}Seite ${a.seite}${a.rect ? '' : ', ganze Seite'}</a></header>
      ${a.art === 'aenderung' && (a.alt || a.neu) ? `<dl class="altneu"><div><dt>Alt</dt><dd>${a.alt ? `<del class="${a.aendArt === 'ocr' ? 'ocr' : 'fach'}">${h(a.alt)}</del>` : '–'}</dd><dt>Neu</dt><dd>${a.neu ? `<ins class="${a.aendArt === 'ocr' ? 'ocr' : 'fach'}">${h(a.neu)}</ins>` : '–'}</dd></div></dl>` : ''}
      ${a.zitat && a.art !== 'aenderung' ? `<blockquote class="zitat">${h(a.zitat)}</blockquote>` : ''}
      <p class="text">${h(a.text)}</p>
      <p class="grund">${h(a.autor)}, ${datumCH(a.datum)}${a.rev > 1 ? ', Fassung ' + a.rev : ''}</p>
      ${antwortenHtml(a)}
      ${r ? `<p class="ziel">gehört zu <a href="#" data-act="zeige-regel" data-id="${h(r.id)}">${h(r.id)} ${h(r.titel)}</a></p>` : ''}
      <p class="marken">${a.art === 'aenderung' && a.aendArt ? marke(AEND[a.aendArt], a.aendArt === 'ocr' ? '' : 'art') : ''}${a.uebernommen ? marke('in den Text übernommen als ' + a.uebernommen, 'ok') : ''}${standMarke('anmerkungen', a)}${a.erledigt ? marke('erledigt', 'ok') : ''}${a.zurueckgezogen ? marke('zurückgezogen', 'weg') : ''}</p>
      <p class="aktionen">${a.art === 'aenderung' && !a.uebernommen && !a.zurueckgezogen ? `<button data-act="anm-uebernehmen" data-id="${h(a.id)}">In den Text übernehmen</button>` : ''}<button data-act="anm-antwort" data-id="${h(a.id)}">Antworten</button><button data-act="anm-edit" data-id="${h(a.id)}">Bearbeiten</button><button data-act="anm-erledigt" data-id="${h(a.id)}">${a.erledigt ? 'Wieder öffnen' : 'Erledigt'}</button>${r ? '' : `<button data-act="anm-regel" data-id="${h(a.id)}">Regel daraus anlegen</button>`}<button data-act="anm-weg" data-id="${h(a.id)}">${neu ? 'Löschen' : a.zurueckgezogen ? 'Wieder aufnehmen' : 'Zurückziehen'}</button><button data-act="anm-hist" data-id="${h(a.id)}" aria-expanded="${!!offen}">Verlauf</button></p>${hist}</article>`;
  }
  function anmForm(a, vorgabe) {
    const x = a || vorgabe, w = werk(x.werkId), rs = L().regeln.filter(r => r.werkId === w.id);
    dialog(a ? 'Anmerkung ' + a.nr + ' bearbeiten' : `${x.art === 'aenderung' ? 'Änderung vorschlagen' : 'Anmerkung'} zu ${w.kurz}, Seite ${x.seite}`, `<label>Art<select name="art">${opt(Object.keys(ANM).map(k => [k, ANM[k]]), x.art || 'kommentar')}</select></label>
      <fieldset class="vorschlag"><legend>Nur für Änderungsvorschläge</legend>${bereich('alt', 'Originalinhalt', x.alt || '')}${bereich('neu', 'Vorgeschlagene Änderung', x.neu || '')}
        <label>Änderungsart<select name="aendArt">${opt([['', 'automatisch vorschlagen'], ['ocr', 'OCR-Korrektur'], ['fachlich', 'Fachliche Änderung']], x.aendArt || '')}</select></label></fieldset>
      ${bereich('text', 'Begründung oder Kommentar', x.text || '', 'required')}
      <label>Gehört zu Regel<select name="regelId">${opt([['', 'keine']].concat(rs.map(r => [r.id, r.id + ' ' + r.titel])), x.regelId || '')}</select></label>`, d => {
      const text = d.text.trim(), vor = d.art === 'aenderung', alt = vor ? d.alt.replace(/\s+/g, ' ').trim() : '', neu = vor ? d.neu.replace(/\s+/g, ' ').trim() : '';
      if (!text) return 'Begründung oder Kommentar eingeben.';
      if (vor && !alt && !neu) return 'Originalinhalt oder vorgeschlagene Änderung eingeben.';
      if (vor && alt === neu) return 'Der Vorschlag entspricht dem Originalinhalt.';
      const aendArt = vor ? (d.aendArt || artVorschlag(alt, neu)) : '';
      if (a) {
        const gleich = a.text === text && a.art === d.art && (a.alt || '') === alt && (a.neu || '') === neu && (a.aendArt || '') === aendArt;
        if (gleich && (a.regelId || '') === d.regelId) return 'Es wurde nichts geändert.';
        if (!gleich) { (a.frueher = a.frueher || []).push({ rev: a.rev, art: a.art, text: a.text, autor: a.autor, datum: a.datum }); a.rev++; a.autor = L().meta.bearbeiter; a.datum = heute(); }
        Object.assign(a, { text, art: d.art, regelId: d.regelId, alt, neu, aendArt }); log('Anmerkung geändert', a.id, 'Fassung ' + a.rev);
      } else {
        const pre = w.kurz.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); let nr = L().anmerkungen.filter(q => q.werkId === w.id).reduce((m, q) => Math.max(m, q.nr), 0), id;
        do { id = `${pre}-A${++nr}`; } while (anm(id) || L().verlauf.some(v => v.ziel === id));
        L().anmerkungen.push({ id, nr, werkId: w.id, dokId: x.dokId, seite: x.seite, rect: x.rect, ...(x.rects ? { rects: x.rects, zitat: x.zitat || '' } : {}), art: d.art, text, alt, neu, aendArt, uebernommen: '', regelId: d.regelId, autor: L().meta.bearbeiter, datum: heute(), rev: 1, erledigt: false, zurueckgezogen: false, frueher: [] });
        log('Anmerkung erfasst (' + ANM[d.art] + ')', id, 'Seite ' + x.seite); P.aktiv = id;
      }
    }, a ? 'Änderung übernehmen' : 'Speichern', true);
  }
  function pdfAnsicht(w) {
    const ds = dokus(w.id), ganz = istGanz(w), dok = ganz ? null : (ds.find(d => d.id === S.dokWahl[w.id]) || ds[0]), zeigen = ganz ? ds : [dok];
    const name = d => d.teil || d.datei;
    const liste = L().anmerkungen.filter(a => ds.length ? zeigen.some(d => d.id === a.dokId) : a.werkId === w.id).sort((a, b) => ds.findIndex(d => d.id === a.dokId) - ds.findIndex(d => d.id === b.dokId) || a.seite - b.seite || a.nr - b.nr);
    const karten = liste.map(anmKarte).join('');
    if (!ds.length) return `<div class="leerblock"><p>Zu ${h(w.kurz)} liegt noch kein PDF in der Bibliothek. Nach dem Hinzufügen steht hier die ganze Norm zum Lesen und Kommentieren.</p><button class="haupt" data-act="pdf-neu" data-id="${h(w.id)}">PDF hinzufügen</button></div>${karten ? `<div id="pdfanm" class="lose">${karten}</div>` : ''}`;
    const teile = ds.length > 1 ? `<div class="teile" role="tablist" aria-label="Teile dieser Norm"><button role="tab" aria-selected="${ganz}" data-act="pdf-teil" data-id="${h(w.id)}" data-dok="*">Ganze Norm<span>${ds.reduce((n, d) => n + d.seiten, 0)} S.</span></button>${ds.map(d => `<button role="tab" aria-selected="${d === dok}" data-act="pdf-teil" data-id="${h(w.id)}" data-dok="${h(d.id)}">${h(name(d))}<span>${d.seiten} S.</span></button>`).join('')}</div>` : '';
    const mehr = `<button class="klein" data-act="pdf-neu" data-id="${h(w.id)}">weiteres PDF hinzufügen</button>`;
    if (!ganz && !pdfDa(dok)) return `${teile}<div class="leerblock"><p>Das PDF „${h(dok.datei)}“ liegt nicht in der Ablage. Dasselbe PDF erneut hinzufügen; die Anmerkungen bleiben erhalten.</p><button class="haupt" data-act="pdf-ersetzen" data-id="${h(dok.id)}">PDF hinzufügen</button></div>${karten ? `<div id="pdfanm" class="lose">${karten}</div>` : ''}`;
    const fleck = fleckHtml;
    const seiten = zeigen.map(d => (ganz ? `<h4 class="teilkopf" style="width:${P.zoom}%">${h(name(d))}</h4>` : '') + (pdfDa(d) ? d.masse.map((m, i) => {
      const n = i + 1, hier = liste.filter(a => a.dokId === d.id && a.seite === n && !a.zurueckgezogen);
      return `<div class="seitenblock" data-dok="${h(d.id)}" data-seite="${n}" style="width:${P.zoom}%"><div class="seitenkopf"><span>${ganz ? h(name(d)) + ', ' : ''}Seite ${n}${hier.length ? ', ' + hier.length + (hier.length === 1 ? ' Anmerkung' : ' Anmerkungen') : ''}</span><button class="klein" data-act="anm-seite" data-werk="${h(w.id)}" data-dok="${h(d.id)}" data-seite="${n}">Ganze Seite kommentieren</button></div><div class="seite${markKl()}" data-dok="${h(d.id)}" data-seite="${n}" style="aspect-ratio:${m[0]}/${m[1]}">${hier.filter(a => a.rect).map(fleck).join('')}</div></div>`;
    }).join('') : `<p class="fehler-fest">Das PDF „${h(d.datei)}“ liegt nicht in der Ablage.</p>`)).join('');
    return `${teile}<div class="pdfleiste">
        <button data-act="pdf-mark" aria-pressed="${P.mark}" class="${P.mark ? 'haupt' : ''}">${P.mark ? (markText() ? 'Jetzt den Text auf der Seite überstreichen' : 'Jetzt auf der Seite ein Rechteck aufziehen') : 'Stelle markieren und kommentieren'}</button>${weiseWahl()}
        <span class="zoom"><button data-act="pdf-zoom" data-d="-25" aria-label="Kleiner">−</button><output>${P.zoom} %</output><button data-act="pdf-zoom" data-d="25" aria-label="Grösser">+</button></span>
        ${ganz ? '' : `<label class="sprung">Seite<input type="number" id="pdf-sprung" min="1" max="${dok.seiten}" value="1"> von ${dok.seiten}</label>`}
        <span class="rechts">${istSchicht(w) ? '' : `<button data-act="pdf-text" data-id="${h(w.id)}">Text als Originaltext übernehmen</button>`}${ganz ? '' : `<button data-act="pdf-laden" data-id="${h(dok.id)}">PDF herunterladen</button>`}</span>
      </div>
      <p class="hinweis">${ganz ? `Alle ${ds.length} Teile hintereinander, ${ds.reduce((n, d) => n + d.seiten, 0)} Seiten. Zum Herunterladen, Ersetzen oder Entfernen einen einzelnen Teil wählen. ${mehr}`
        : `„${h(dok.datei)}“, ${(dok.groesse / 1048576).toFixed(1)} MB, hinzugefügt am ${datumCH(dok.datum)} von ${h(dok.name)}, Prüfsumme <code title="${h(dok.pruefsumme)}">${h(dok.pruefsumme.slice(0, 12))}</code> ${standMarke('dokumente', dok)} <button class="klein" data-act="pdf-ersetzen" data-id="${h(dok.id)}">ersetzen</button><button class="klein" data-act="pdf-weg" data-id="${h(dok.id)}">entfernen</button>${mehr}`}</p>
      <div class="pdfgrid"><div id="pdfseiten" data-werk="${h(w.id)}">${seiten}</div>
        <aside id="pdfanm" aria-label="Anmerkungen"><h3>Anmerkungen (${liste.length})</h3>${karten || '<p class="leer">Noch keine Anmerkung. Eine Stelle im PDF markieren oder eine ganze Seite kommentieren.</p>'}</aside></div>`;
  }
  document.addEventListener('pointerdown', ev => {
    if (!P.mark || ev.button > 0) return; const s = ev.target.closest('.seite.mark'); if (!s) return;
    ev.preventDefault();
    const r = s.getBoundingClientRect(), fx = e => Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), fy = e => Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    const x0 = fx(ev), y0 = fy(ev), band = document.createElement('div'); band.className = 'band'; s.appendChild(band);
    try { s.setPointerCapture(ev.pointerId); } catch (e) { /* ohne Capture weiter */ }
    const rect = e => ({ x: Math.min(x0, fx(e)), y: Math.min(y0, fy(e)), w: Math.abs(fx(e) - x0), h: Math.abs(fy(e) - y0) });
    // Textauswahl: die Wörter der Seite vom ersten bis zum letzten überstrichenen, in Lesefolge
    const alsText = markText(), T = { ws: null, i0: -1, i1: -1, letzt: ev, divs: [] }, seitenV = r.height / r.width;
    const naechstes = e => { const px = fx(e), py = fy(e); let best = -1, bd = Infinity; T.ws.forEach((w, i) => { const dx = Math.max(w.x - px, 0, px - w.x - w.w), dy = Math.max(w.y - py, 0, py - w.y - w.h) * seitenV, d = dx * dx + 9 * dy * dy; if (d < bd) { bd = d; best = i; } }); return { i: best, d: Math.sqrt(bd) }; };
    const zeigeWahl = () => {
      if (!T.ws || !T.ws.length || T.i0 < 0) return; const b = naechstes(T.letzt).i; if (b === T.i1) return; T.i1 = b;
      T.divs.forEach(d => d.remove()); T.divs = []; band.style.display = 'none';
      T.ws.slice(Math.min(T.i0, T.i1), Math.max(T.i0, T.i1) + 1).forEach(w => { const d = document.createElement('div'); d.className = 'auswahl'; d.style.cssText = `left:${(w.x * 100).toFixed(2)}%;top:${(w.y * 100).toFixed(2)}%;width:${(w.w * 100).toFixed(2)}%;height:${(w.h * 100).toFixed(2)}%`; s.appendChild(d); T.divs.push(d); });
    };
    const bereit = !alsText ? Promise.resolve() : seitenWorte(s.dataset.dok, +s.dataset.seite).then(ws => { T.ws = ws.filter(w => w.t && w.w > 0 && w.h > 0); if (T.ws.length) { const a = naechstes(ev); T.i0 = a.d < 0.05 ? a.i : -1; zeigeWahl(); } });
    const mv = e => { T.letzt = e; const q = rect(e); band.style.cssText = `left:${q.x * 100}%;top:${q.y * 100}%;width:${q.w * 100}%;height:${q.h * 100}%`; if (alsText && T.ws && T.i0 >= 0) { T.i1 = -1; zeigeWahl(); } };
    const textWahl = () => { // Flächen je Zeile, Rahmen um alles und der markierte Text
      const ws = T.ws.slice(Math.min(T.i0, T.i1), Math.max(T.i0, T.i1) + 1), zl = [], r4 = v => +v.toFixed(4);
      ws.forEach(w => { const z = zl[zl.length - 1], m = w.y + w.h / 2; if (z && Math.abs(m - z.m) < 0.6 * Math.max(w.h, z.u - z.o) && w.x >= z.x1 - 0.02) { z.o = Math.min(z.o, w.y); z.u = Math.max(z.u, w.y + w.h); z.x1 = Math.max(z.x1, w.x + w.w); z.m = (z.o + z.u) / 2; } else zl.push({ m, o: w.y, u: w.y + w.h, x0: w.x, x1: w.x + w.w }); });
      const x = Math.min(...zl.map(z => z.x0)), y = Math.min(...zl.map(z => z.o)), x1 = Math.max(...zl.map(z => z.x1)), y1 = Math.max(...zl.map(z => z.u));
      return { rect: { x: r4(x), y: r4(y), w: r4(x1 - x), h: r4(y1 - y) }, rects: zl.slice(0, 60).map(z => ({ x: r4(z.x0), y: r4(z.o), w: r4(z.x1 - z.x0), h: r4(z.u - z.o) })), text: ws.map(w => w.t).join(' ').replace(/([A-Za-zäöüÄÖÜ])[-‐] (?=[a-zäöü])/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 600) };
    };
    const ende = async e => {
      s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', ende); s.removeEventListener('pointercancel', ab); band.remove();
      if (alsText) {
        T.letzt = e; await bereit; T.i1 = -1; zeigeWahl(); T.divs.forEach(d => d.remove());
        if (T.ws && T.ws.length && T.i0 >= 0 && T.i1 >= 0) {
          const t = textWahl(); P.mark = false;
          anmForm(null, { werkId: $('#pdfseiten').dataset.werk, dokId: s.dataset.dok, seite: +s.dataset.seite, rect: t.rect, rects: t.rects, zitat: t.text, art: P.markArt, alt: t.text, neu: P.markArt === 'aenderung' ? t.text : '' });
          document.querySelectorAll('.seite.mark').forEach(n => n.classList.remove('mark', 'marktext')); return;
        }
        meldung(T.ws && T.ws.length ? 'An dieser Stelle steht kein erkannter Text. Die Stelle ist als Rechteck markiert.' : 'Auf dieser Seite ist kein Text erkannt. Die Stelle ist als Rechteck markiert.');
      }
      let q = rect(e); if (q.w < 0.012 && q.h < 0.008) q = { x: Math.max(0, Math.min(0.94, x0 - 0.03)), y: Math.max(0, Math.min(0.97, y0 - 0.012)), w: 0.06, h: 0.024 };
      q = { x: +q.x.toFixed(4), y: +q.y.toFixed(4), w: +q.w.toFixed(4), h: +q.h.toFixed(4) };
      P.mark = false; const vg = { werkId: $('#pdfseiten').dataset.werk, dokId: s.dataset.dok, seite: +s.dataset.seite, rect: q, art: P.markArt };
      if (P.markArt === 'tabelle' || P.markArt === 'skizze') uebernahmeNeu(vg);
      else textImRechteck(vg.dokId, vg.seite, q).then(t => { vg.alt = t; if (P.markArt === 'aenderung') vg.neu = t; anmForm(null, vg); });
      document.querySelectorAll('.seite.mark').forEach(n => n.classList.remove('mark', 'marktext'));
    };
    const ab = () => { s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', ende); s.removeEventListener('pointercancel', ab); band.remove(); T.divs.forEach(d => d.remove()); };
    s.addEventListener('pointermove', mv); s.addEventListener('pointerup', ende); s.addEventListener('pointercancel', ab);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && P.mark && !$('#dlg').open) { P.mark = false; render(); }
    if (ev.key === 'Enter' && ev.target.id === 'pdf-sprung') { const el = document.querySelector(`.seitenblock[data-seite="${+ev.target.value}"]`); if (el) el.scrollIntoView({ block: 'start' }); }
  });
  const fvAnzeigen = ev => { if (ev.target.id === 'ed-text' && $('#ed-fv')) $('#ed-fv').value = edZeileTyp(); };
  document.addEventListener('keyup', fvAnzeigen); document.addEventListener('click', fvAnzeigen);
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if ($('#pdfseiten') && !$('#dlg').open) render(); }, 250); });

  // ----- Ansichten
  // ----- Bibliothek (Startseite)
  function offeneEintraege() {
    const f = freigegeben(L()), out = [];
    const wid = (liste, x) => liste === 'werke' ? x.id : liste === 'verknuepfungen' ? x.von : liste === 'herausgeber' ? '' : x.werkId;
    for (const liste of LISTEN) {
      const alt = new Map(f[liste].map(x => [x.id, x]));
      for (const x of (L()[liste] || [])) { const a = alt.get(x.id); if (!a) out.push({ liste, obj: x, stand: 'neu', werkId: wid(liste, x) }); else if (JSON.stringify(a) !== JSON.stringify(x)) out.push({ liste, obj: x, stand: 'geändert', werkId: wid(liste, x) }); alt.delete(x.id); }
      alt.forEach(x => out.push({ liste, obj: x, stand: 'entfernt', werkId: wid(liste, x) }));
    }
    return out;
  }
  // Prüfstatus der digitalen Fassung: bestätigt die Übereinstimmung mit dem Original, nicht die fachliche Gültigkeit
  const DSTAT = { '': ['Ohne PDF', 'entwurf'], ungeprueft: ['Ungeprüft', 'warn'], bearbeitung: ['In Bearbeitung', ''], pruefung: ['Zur Prüfung', 'art'], korrektur: ['Korrektur erforderlich', 'fehler'], freigegeben: ['Freigegeben', 'ok'] };
  const dstat = w => dokVon(w.id) ? ((w.digital && w.digital.status) || 'ungeprueft') : '';
  function werkStatus(w) {
    const k = dstat(w), offen = R.offen.filter(e => e.werkId === w.id).length, d = w.digital || {};
    return { k, pill: k ? DSTAT[k][0] : istSchicht(w) ? 'Schicht' : 'Ohne PDF', art: DSTAT[k][1], offen, rechts: offen ? offen + (offen === 1 ? ' Änderung offen' : ' Änderungen offen') : k === 'freigegeben' && d.datum ? 'geprüft ' + datumCH(d.datum) : '' };
  }
  function digitalBeruehrt(w) { // erste Korrektur an einer ungeprüften oder zurückgegebenen Norm
    const k = dstat(w); if (k !== 'ungeprueft' && k !== 'korrektur') return;
    w.digital = Object.assign({}, w.digital, { status: 'bearbeitung' }); log('Prüfstatus: In Bearbeitung', w.id, 'erste Korrektur');
  }
  const seitenStand = w => { const ds = dokus(w.id); return { alle: ds.reduce((n, x) => n + x.seiten, 0), ok: ds.reduce((n, x) => n + (x.geprueftSeiten || []).length, 0), leer: ds.reduce((n, x) => n + (L().seitentext[x.id] || []).filter(t => !String(t).trim()).length, 0) }; };
  function digitalForm(w, wunsch) {
    const k = dstat(w), d = w.digital || {}, st = seitenStand(w), pr = L().meta.pruefer || [];
    const ziele = { ungeprueft: ['bearbeitung', 'pruefung'], bearbeitung: ['pruefung'], pruefung: ['freigegeben', 'korrektur'], korrektur: ['bearbeitung', 'pruefung'], freigegeben: ['bearbeitung'] }[k].slice();
    if (darfFreigeben() && k !== 'freigegeben' && !ziele.includes('freigegeben')) ziele.unshift('freigegeben'); // Prüfer geben direkt frei, wenn sie verglichen haben
    if (M.an && !darfFreigeben()) ['freigegeben', 'korrektur'].forEach(z => { const i = ziele.indexOf(z); if (i >= 0) ziele.splice(i, 1); });
    if (!ziele.length) return meldung('Die Norm wartet auf die Prüfung. Freigeben oder zurückgeben dürfen nur Prüfer.');
    const TXT = { bearbeitung: k === 'freigegeben' ? 'Wieder öffnen: In Bearbeitung' : 'In Bearbeitung: OCR- und Formatkorrekturen laufen', pruefung: 'Zur Prüfung einreichen', freigegeben: 'Freigeben: digitale Fassung stimmt mit dem Original überein', korrektur: 'Zurückgeben: Korrektur erforderlich' };
    dialog('Prüfstatus von ' + w.kurz, `<p>Jetzt: <b>${DSTAT[k][0]}</b>${d.pruefer ? `, geprüft von ${h(d.pruefer)} am ${datumCH(d.datum)}` : ''}${d.notiz ? `. Bemerkung: ${h(d.notiz)}` : ''}</p>
      <p>${st.ok} von ${st.alle} Seiten sind als verglichen markiert${st.leer ? `, ${st.leer} ${st.leer === 1 ? 'Seite hat' : 'Seiten haben'} keinen erkannten Text` : ''}.</p>
      <label>Neuer Status<select name="ziel">${opt(ziele.map(z => [z, TXT[z]]), ziele.includes(wunsch) ? wunsch : ziele[0])}</select></label>
      ${bereich('notiz', 'Bemerkung (bei Rückgabe und beim Wiederöffnen nötig)', '')}
      <label class="haken"><input type="checkbox" name="ok"> Ich habe Text und Struktur mit dem Original verglichen (für die Freigabe)</label>
      <p class="hinweis">Die Freigabe bestätigt die Übereinstimmung der digitalen Fassung mit dem Original, nicht die fachliche Gültigkeit der Norm. ${M.an ? 'Freigeben und zurückgeben dürfen nur Benutzer mit der Rolle Prüfer.' : `Freigeben dürfen nur eingetragene Prüfer: ${pr.length ? h(pr.join(', ')) : 'noch niemand eingetragen (unter „Daten“)'}.`}</p>`, dd => {
      const name = L().meta.bearbeiter, notiz = dd.notiz.trim();
      if (dd.ziel === 'freigegeben') {
        if (!darfFreigeben()) return M.an ? 'Die Erstfreigabe dürfen nur Benutzer mit der Rolle Prüfer erteilen.' : `Nur eingetragene Prüfer dürfen freigeben. „${name}“ steht nicht in der Prüferliste (unter „Daten“).`;
        if (!dd.ok) return 'Für die Freigabe den Vergleich mit dem Original bestätigen.';
        const selbst = d.eingereichtVon === name;
        w.digital = { status: 'freigegeben', pruefer: name, datum: heute(), notiz, eingereichtVon: d.eingereichtVon || '', verglichen: `${st.ok} von ${st.alle} Seiten` };
        log('Erstfreigabe der digitalen Fassung', w.id, `${st.ok} von ${st.alle} Seiten verglichen${selbst ? ', Selbstprüfung' : ''}${notiz ? ': ' + notiz : ''}`);
        const gew = new Set(['werke|' + w.id].concat(dokus(w.id).map(x => 'dokumente|' + x.id), L().aenderungen.filter(a => a.werkId === w.id && a.art === 'ocr').map(a => 'aenderungen|' + a.id), L().formate.filter(f => f.werkId === w.id).map(f => 'formate|' + f.id)));
        if (R.offen.some(e => e.liste === 'herausgeber' && e.obj.id === w.herausgeberId)) gew.add('herausgeber|' + w.herausgeberId);
        const v = neueVersion(L(), name, `Erstfreigabe ${w.kurz}: digitale Fassung mit dem Original verglichen`, heute(), teilInhalt(L(), gew));
        log('Version freigegeben (Erstfreigabe)', 'Version ' + v.nr, w.kurz); meldung(`${w.kurz} ist freigegeben. Version ${v.nr} enthält die geprüfte Fassung. Jetzt speichern.`);
        return;
      }
      if ((dd.ziel === 'korrektur' || k === 'freigegeben') && !notiz) return 'Bitte in der Bemerkung angeben, was zu korrigieren ist.';
      w.digital = Object.assign({}, k === 'freigegeben' ? {} : d, { status: dd.ziel, notiz }, dd.ziel === 'pruefung' ? { eingereichtVon: name } : {});
      log('Prüfstatus: ' + DSTAT[dd.ziel][0], w.id, notiz);
    }, 'Übernehmen');
  }
  // ----- Prüfliste: unsichere Stellen, Zahlen und Vorschläge einzeln mit Ausschnitt aus dem Scan bestätigen oder berichtigen
  const PL_ART = { unsicher: 'Unsicher gelesene Stellen', einheit: 'Zahlen mit Einheit', zahlen: 'Alle Zahlen', vorschlag: 'Vorschläge der Zweitlesung' };
  const EINHEIT = /^[(\[]?(mm|cm|dm|m|km|m²|m³|m2|m3|m³\/h|m\/s|l|l\/s|l\/min|kg|g|t|kg\/m³|kg\/m²|kN|kN\/m²|kN\/m|N\/mm²|MN|Pa|kPa|MPa|bar|mbar|atü|°C|K|W|kW|V|A|Hz|h|min|s|%|‰|SP|Stk\.?|Mpm|Mp|kp|kp\/cm²|t\/m²)[)\].,;:]*$/;
  const plKey = it => it.n + '|' + it.idx;
  async function plBauen(w, art) {
    const out = [];
    for (const d of dokus(w.id)) {
      if (art === 'vorschlag') { const vs = L().vorschlaege[d.id] || {}, erl = d.vorschlagErledigt || []; for (const n of Object.keys(vs).map(Number).sort((a, b) => a - b)) { const ws = (await seitenWorte(d.id, n)).filter(x => x.k), alle = await seitenWorte(d.id, n); vs[n].forEach((v, k) => { if (erl.some(e => e.startsWith(n + '|' + k + '|'))) return; const f = fundstellen(ws, String(v.alt).split(/\s+/).map(wortNorm).filter(Boolean))[0], wo = f ? f[0] : null; out.push({ dokId: d.id, n, idx: 'v' + k, vk: k, t: v.alt, neu: v.neu, grund: v.grund || '', x: wo ? wo.x : 0.1, y: wo ? wo.y : 0.05, w: wo ? Math.max(...f.map(q => q.x + q.w)) - wo.x : 0.8, h: wo ? wo.h : 0.02, zo: wo ? wo.y : 0.05, zu: wo ? wo.y + wo.h : 0.07, ctx: '', gefunden: !!wo, alleLen: alle.length }); }); } continue; }
      const lg = await lagenVon(d.id); if (!lg) continue; const best = new Set(d.bestaetigt || []);
      for (const n of Object.keys(lg).map(Number).sort((a, b) => a - b)) {
        if ((d.geprueftSeiten || []).includes(n)) continue;
        const ws = await seitenWorte(d.id, n), zl = zeilenAusWorten(ws), zuZ = new Map(); zl.forEach(z => z.w.forEach(k => zuZ.set(k, z)));
        const tabs = hatEl(d.id) ? elementeVon(L(), d.id, n).filter(e => e.typ === 'tabelle') : [], inTab = x => tabs.find(e => x.x + x.w / 2 > e.box[0] - 0.005 && x.x + x.w / 2 < e.box[0] + e.box[2] + 0.005 && x.y + x.h / 2 > e.box[1] - 0.005 && x.y + x.h / 2 < e.box[1] + e.box[3] + 0.005);
        const un = art === 'unsicher' ? new Set((L().unsicher[d.id] || {})[n] || []) : null;
        ws.forEach((x, idx) => {
          const z = zuZ.get(idx), pos = z.w.indexOf(idx), nach = pos + 1 < z.w.length ? ws[z.w[pos + 1]].t : '';
          const passt = art === 'unsicher' ? un.has(x.t) : /\d/.test(x.t) && (art === 'zahlen' || EINHEIT.test(nach) || /\d\s?(mm|cm|m|m²|m³|kg|kN|Pa|bar|%|°C|kW|W|V|l|h)[).,;:]*$/.test(x.t));
          if (!passt || best.has(n + '|' + idx)) return;
          const gleiche = ws.map((q, k) => q.t === x.t ? k : -1).filter(k => k >= 0), tab = inTab(x);
          out.push({ dokId: d.id, n, idx, t: x.t, x: x.x, y: x.y, w: x.w, h: x.h, zo: z.o, zu: z.u, ctx: z.w.map(k => k === idx ? '\u0001' + ws[k].t + '\u0002' : ws[k].t).join(' '), gleiche, tabNr: tab ? tab.nr : '', vorher: gleiche.filter(k => k < idx && !inTab(ws[k])).length, nach: art === 'unsicher' ? '' : nach });
        });
      }
    }
    return out;
  }
  function plStart(w, art) { S.pl = { werk: w.id, art, i: 0, liste: null, ok: 0, korr: 0, schreibt: false }; plBauen(w, art).then(l => { if (S.pl && S.pl.werk === w.id && S.pl.art === art) { S.pl.liste = l; S.pl.von = l.length; if (S.view.typ === 'stellen') render(); } }); }
  function stellenAnsicht(w) {
    if (!S.pl || S.pl.werk !== w.id) plStart(w, 'unsicher');
    const Q = S.pl, hatV = dokus(w.id).some(d => Object.keys(L().vorschlaege[d.id] || {}).length);
    const kopf = `<header class="dashkopf"><div><p class="pfad"><a href="#" data-act="werk-pdf" data-id="${h(w.id)}">Zurück zu ${h(w.kurz)}</a></p><h2>Prüfliste ${h(w.kurz)}</h2><p class="lead">Jede Stelle zeigt den Ausschnitt aus dem Scan und das gelesene Wort. Bestätigen oder berichtigen; das Original bleibt unverändert.</p></div></header>
      <div class="filter"><label>Was prüfen<select id="pl-art">${opt(Object.keys(PL_ART).filter(k => k !== 'vorschlag' || hatV).map(k => [k, PL_ART[k]]), Q.art)}</select></label>${Q.liste ? `<span class="vglstand"><progress max="${Math.max(1, Q.von)}" value="${Math.min(Q.i, Q.von)}"></progress> Stelle ${Math.min(Q.i + 1, Q.von)} von ${Q.von} · ${Q.ok} bestätigt, ${Q.korr} berichtigt</span>` : ''}</div>`;
    if (!Q.liste) return `<section class="blatt weit">${kopf}<p class="leer" role="status">Die Liste wird aufgebaut …</p></section>`;
    if (!Q.von) return `<section class="blatt weit">${kopf}<p class="leer">${Q.art === 'vorschlag' ? 'Keine offenen Vorschläge.' : 'Keine offenen Stellen dieser Art. Seiten, die als verglichen markiert sind, und bestätigte Stellen erscheinen nicht.'}</p></section>`;
    if (Q.i >= Q.von) return `<section class="blatt weit">${kopf}<div class="plende"><h3>Die Liste ist durch.</h3><p>${Q.ok} bestätigt, ${Q.korr} berichtigt, ${Q.von - Q.ok - Q.korr} übersprungen.</p><p class="reihe"><button data-act="pl-neu">Übersprungene noch einmal zeigen</button><button class="haupt" data-act="werk-pdf" data-id="${h(w.id)}">Zurück zur Norm</button></p></div></section>`;
    const it = Q.liste[Q.i], d = dokId(it.dokId), zh = Math.max(it.zu - it.zo, 0.012), r4 = x => +x.toFixed(4);
    const bw = 0.64, bx = r4(Math.max(0, Math.min(1 - bw, it.x + it.w / 2 - bw / 2))), by = r4(Math.max(0, it.zo - 1.7 * zh)), bh = r4(Math.min(1 - by, (it.zu - it.zo) + 3.4 * zh));
    const ctx = h(it.ctx).replace('\u0001', '<mark>').replace('\u0002', '</mark>'), vor = Q.art === 'vorschlag';
    return `<section class="blatt weit">${kopf}
      <div class="plkarte" id="plkarte">
        <p class="plwo">${h(d.teil ? d.teil + ' · ' : '')}Seite ${it.n}${it.tabNr ? ' · in Tabelle ' + h(it.tabNr) : ''}</p>
        <div class="plbild">${schnittImg(it.dokId, it.n, [bx, by, bw, bh], 'Ausschnitt aus dem Scan, Seite ' + it.n)}${vor && !it.gefunden ? '' : `<span class="plmarke" style="left:${((it.x - bx) / bw * 100).toFixed(2)}%;top:${((it.y - by) / bh * 100).toFixed(2)}%;width:${(it.w / bw * 100).toFixed(2)}%;height:${(it.h / bh * 100).toFixed(2)}%"></span>`}</div>
        ${vor ? `<dl class="altneu vorschau"><div><dt>Gelesen</dt><dd><del class="ocr">${h(it.t)}</del></dd><dt>Vorschlag</dt><dd><ins class="ocr">${h(it.neu)}</ins></dd></div></dl>${it.grund ? `<p class="hinweis">${h(it.grund)}</p>` : ''}`
          : `<p class="plwort"><span>Gelesen</span><b>${h(it.t)}</b>${it.nach ? `<i>${h(it.nach)}</i>` : ''}</p><p class="plctx">${ctx}</p>`}
        ${Q.schreibt ? `<form class="plform" id="plform"><label>Richtig ist<input id="pl-neu" value="${h(vor ? it.neu : it.t)}" autocomplete="off" spellcheck="false"></label><button class="haupt">Übernehmen (Enter)</button><button type="button" data-act="pl-abbr">Abbrechen (Esc)</button></form>`
          : `<p class="aktionen plknopf">${vor ? '<button class="haupt" data-act="pl-ok">Annehmen <kbd>Enter</kbd></button><button data-act="pl-nein">Ablehnen <kbd>X</kbd></button><button data-act="pl-korr">Anders berichtigen <kbd>K</kbd></button>' : '<button class="haupt" data-act="pl-ok">Stimmt <kbd>Enter</kbd></button><button data-act="pl-korr">Berichtigen <kbd>K</kbd></button>'}<button data-act="pl-weiter">Überspringen <kbd>→</kbd></button><button data-act="pl-zurueck" ${Q.i ? '' : 'disabled'}>Zurück <kbd>←</kbd></button><button data-act="pl-vgl">Im Vergleich öffnen <kbd>V</kbd></button></p>`}
      </div></section>`;
  }
  function plVermerk(d) { if (S.pl.vermerkt) return; S.pl.vermerkt = true; log('Prüfliste: Stellen mit dem Original verglichen', d.werkId, PL_ART[S.pl.art]); digitalBeruehrt(werk(d.werkId)); }
  function plErledigt(it) { // Stelle bestätigt; sind alle gleichen Wörter der Seite bestätigt, entfällt die Markierung im Text
    const d = dokId(it.dokId); d.bestaetigt = d.bestaetigt || []; if (!d.bestaetigt.includes(plKey(it))) d.bestaetigt.push(plKey(it));
    if ((it.gleiche || []).every(k => d.bestaetigt.includes(it.n + '|' + k))) { d.stelleOk = d.stelleOk || {}; const l = d.stelleOk[it.n] = d.stelleOk[it.n] || []; if (!l.includes(it.t)) l.push(it.t); }
    plVermerk(d); S.dirty = true;
  }
  function plBerichtigen(it, neu) {
    const d = dokId(it.dokId), w = werk(d.werkId), esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), vorher = textOcr(L(), it.dokId, it.n);
    if (S.pl.art === 'vorschlag') { if (!vorher.includes(it.t)) return 'Die Stelle steht so nicht mehr im Text. Bitte im Vergleich berichtigen.'; aendAnlegen(w, it.dokId, it.n, 'ocr', null, vorher, vorher.replace(it.t, neu), 'Lesefehler berichtigt (Vorschlag der Zweitlesung, vom Prüfer angenommen).', ''); return ''; }
    const re = new RegExp('(^|[\\s(\\[„])' + esc(it.t) + '(?=$|[\\s)\\]“.,;:])', 'g');
    if (it.tabNr) { const e = elementeVon(L(), it.dokId, it.n).find(x => x.nr === it.tabNr); if (e && e.zeilen) { let fertig = false; const Z = e.zeilen.map(z => z.map(c => { if (fertig) return c; const q = c.replace(new RegExp(re.source), (m, a) => { fertig = true; return a + neu; }); return q; })); if (fertig) { ueSetzen(w, e, { zeilen: Z }, 'Tabelle berichtigt (Prüfliste)'); return ''; } } }
    let c = -1, nachher = vorher.replace(re, (m, a) => ++c === it.vorher ? a + neu : m);
    if (nachher === vorher) { const alle = vorher.match(re) || []; if (alle.length === 1) nachher = vorher.replace(re, (m, a) => a + neu); }
    if (nachher === vorher) return 'Die Stelle liess sich im Text nicht eindeutig finden. Bitte «Im Vergleich öffnen» und dort berichtigen.';
    aendAnlegen(w, it.dokId, it.n, 'ocr', null, vorher, nachher, 'Lesefehler der Texterkennung berichtigt (Prüfliste).', ''); return '';
  }
  function plTat(was, wert) {
    const Q = S.pl; if (!Q || !Q.liste || Q.i >= Q.von) return; const it = Q.liste[Q.i], d = dokId(it.dokId), vor = Q.art === 'vorschlag';
    const vErl = k => { d.vorschlagErledigt = d.vorschlagErledigt || []; d.vorschlagErledigt.push(it.n + '|' + it.vk + '|' + k); plVermerk(d); S.dirty = true; };
    if (was === 'ok') { if (it.fertig) { Q.i++; return; } if (vor) { const f = plBerichtigen(it, it.neu); if (f) return meldung(f); vErl('a'); Q.korr++; } else { plErledigt(it); Q.ok++; } it.fertig = true; Q.i++; }
    else if (was === 'nein') { if (!it.fertig) { vErl('x'); it.fertig = true; Q.ok++; } Q.i++; }
    else if (was === 'korr') { if (wert === (vor ? it.neu : it.t) && !vor) { Q.schreibt = false; return plTat('ok'); } const f = plBerichtigen(it, wert); if (f) return meldung(f); if (vor) vErl('a'); else plErledigt(it); it.fertig = true; Q.korr++; Q.schreibt = false; Q.i++; }
  }
  document.addEventListener('submit', ev => { if (ev.target.id !== 'plform') return; ev.preventDefault(); const v = $('#pl-neu').value.trim(); if (!v) return meldung('Das Feld ist leer. Zum Löschen eines Wortes bitte im Vergleich bearbeiten.'); mitName(() => { plTat('korr', v); render(); }); });
  document.addEventListener('keydown', ev => {
    if (!S.lib || S.view.typ !== 'stellen' || !S.pl || !S.pl.liste || $('#dlg').open || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const Q = S.pl, tippt = ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'SELECT');
    if (Q.schreibt) { if (ev.key === 'Escape') { Q.schreibt = false; render(); } return; }
    if (tippt || Q.i >= Q.von) return; const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key, knopf = a => { const b = document.querySelector(`#plkarte [data-act=${a}]`); if (b && !b.disabled) { ev.preventDefault(); b.click(); } };
    if (k === 'Enter' && ev.target.tagName !== 'BUTTON') knopf('pl-ok'); else if (k === 'k') knopf('pl-korr'); else if (k === 'x') knopf('pl-nein'); else if (k === 'ArrowRight') knopf('pl-weiter'); else if (k === 'ArrowLeft') knopf('pl-zurueck'); else if (k === 'v') knopf('pl-vgl');
  });
  function pruefAnsicht() {
    const f = S.pf || '', ws = L().werke.filter(w => dokVon(w.id) && (!f || dstat(w) === f)), zahl = k => L().werke.filter(w => dstat(w) === k).length;
    return `<section class="blatt weit"><header class="dashkopf"><div><h2>Prüfungen</h2><p class="lead">Jede Norm mit PDF und der Stand ihrer digitalen Fassung. Freigegeben ist eine Norm erst, wenn ein Prüfer Text und Struktur mit dem Original verglichen hat.</p></div></header>
      <p class="kenn">${['ungeprueft', 'bearbeitung', 'pruefung', 'korrektur', 'freigegeben'].map(k => `<span><b>${zahl(k)}</b> ${DSTAT[k][0]}</span>`).join('')}</p>
      <div class="filter"><label><span class="sr">Status</span><select id="pf">${opt([['', 'Alle Status']].concat(['ungeprueft', 'bearbeitung', 'pruefung', 'korrektur', 'freigegeben'].map(k => [k, DSTAT[k][0]])), f)}</select></label></div>
      <div class="rollen"><table class="tabelle bibtab"><thead><tr><th>Norm</th><th>Status</th><th>Seiten verglichen</th><th>Ohne Text</th><th>OCR-Korrekturen</th><th>Formatänderungen</th><th>Prüfer</th><th><span class="sr">Aktion</span></th></tr></thead><tbody>${ws.map(w => { const st = werkStatus(w), se = seitenStand(w), d = w.digital || {};
        return `<tr><td><a href="#" data-act="werk-pdf" data-id="${h(w.id)}"><b>${h(w.kurz)}</b></a></td><td>${marke(st.pill, st.art)}${d.notiz && st.k !== 'freigegeben' ? `<span class="notiz">${h(d.notiz)}</span>` : ''}</td><td>${se.ok} von ${se.alle}</td><td>${se.leer || ''}</td><td>${L().aenderungen.filter(a => a.werkId === w.id && a.art === 'ocr' && !a.zurueckgezogen).length || ''}</td><td>${L().formate.filter(x => x.werkId === w.id).length || ''}</td><td>${d.pruefer ? h(d.pruefer) + ', ' + datumCH(d.datum) : ''}</td><td><button class="klein" data-act="pl-auf" data-id="${h(w.id)}" ${dokus(w.id).some(x => L().ocr[x.id]) ? '' : 'disabled title="Nur für gescannte Normen"'}>Stellen prüfen</button> <button class="klein" data-act="digital" data-id="${h(w.id)}">Status ändern</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="leer">Keine Norm in diesem Status.</td></tr>'}</tbody></table></div></section>`;
  }
  function werkKarte(w) {
    const ds = dokus(w.id), d = ds[0], bild = d && L().titelbilder[d.id], st = werkStatus(w);
    const deckel = bild ? `<span class="deckel"><img src="${bild}" alt="" loading="lazy"></span>` : d ? `<span class="deckel" data-fehlt="${h(d.id)}"></span>` : `<span class="deckel leer"><i>${h(w.kurz)}</i><small>${istSchicht(w) ? 'Schicht' : 'kein PDF'}</small></span>`;
    return `<li><a class="karte" href="#" data-act="werk-pdf" data-id="${h(w.id)}" title="${h(w.titel)}">
      <span class="buehne">${deckel}${d ? `<span class="typ">${ds.length > 1 ? ds.length + ' PDF' : 'PDF'}</span>` : ''}</span>
      <span class="kinfo"><b>${h(w.kurz)}</b><span class="kt">${h(w.titel)}</span>
        <span class="kzeile"><span>${h(w.gruppe || hg(w.herausgeberId).kurz)}</span><span>${d ? ds.reduce((x, y) => x + y.seiten, 0) + ' Seiten' : ''}</span></span>
        <span class="kfuss">${marke(st.pill, st.art)}<span>${h(st.rechts)}</span></span></span></a></li>`;
  }
  function bibListe() {
    const q = S.bib.q.trim().toLowerCase();
    return L().werke.filter(w => (!S.bib.hg || w.herausgeberId === S.bib.hg) && (!S.bib.gruppe || (w.gruppe || '') === S.bib.gruppe) && (!q || (w.kurz + ' ' + w.titel).toLowerCase().includes(q)) && (!S.bib.status || (S.bib.status === 'ohnepdf' ? !dokVon(w.id) : S.bib.status === 'offen' ? werkStatus(w).offen > 0 : werkStatus(w).k === S.bib.status)));
  }
  function bibInhalt() {
    const ws = bibListe();
    if (!ws.length) return '<p class="leer">Keine Norm entspricht dem Filter.</p>';
    if (!S.bib.liste) return `<ul class="karten">${ws.map(werkKarte).join('')}</ul>`;
    return `<div class="rollen"><table class="tabelle bibtab"><thead><tr><th>Norm</th><th>Titel</th><th>Gruppe</th><th>Seiten</th><th>Regeln</th><th>Status</th></tr></thead><tbody>${ws.map(w => { const st = werkStatus(w), ds = dokus(w.id); return `<tr><td><a href="#" data-act="werk-pdf" data-id="${h(w.id)}"><b>${h(w.kurz)}</b></a></td><td>${h(w.titel)}</td><td>${h(w.gruppe || hg(w.herausgeberId).kurz)}</td><td>${ds.length ? ds.reduce((x, y) => x + y.seiten, 0) : ''}</td><td>${L().regeln.filter(r => r.werkId === w.id).length || ''}</td><td>${marke(st.pill, st.art)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  const LNAME = { herausgeber: 'Herausgeber', werke: 'Norm', verknuepfungen: 'Verknüpfung', regeln: 'Regel', anmerkungen: 'Anmerkung', dokumente: 'PDF', aenderungen: 'Textänderung', formate: 'Formatänderung', glossar: 'Glossar', uebernahmen: 'Tabelle/Skizze' };
  function eintragText(e) {
    const x = e.obj;
    switch (e.liste) {
      case 'regeln': return x.id + ' ' + x.titel;
      case 'anmerkungen': return `${x.id}, Seite ${x.seite}: ${x.text}`;
      case 'aenderungen': return `${x.id}, Seite ${x.seite}: ${x.begruendung}`;
      case 'glossar': return `${x.begriff}: ${x.bedeutung}`;
      case 'formate': return `Seite ${x.seite}: „${x.text.slice(0, 60)}“ ist ${FV[x.typ]}`;
      case 'uebernahmen': return `Seite ${x.seite}: ${x.typ === 'tabelle' ? 'Tabelle' : 'Skizze'} ${x.nr}${x.weg ? ' entfernt' : (x.bild ? ' (eigenes Bild)' : '') + (x.titel ? ' ' + x.titel : '')}`;
      case 'dokumente': return x.datei;
      case 'werke': return x.kurz + ' ' + x.titel;
      case 'herausgeber': return x.kurz;
      default: return (TYPEN[x.typ] || [''])[0] + ' ' + ((werk(x.nach) || {}).kurz || '');
    }
  }
  function eintragZeile(e) {
    const act = e.stand === 'entfernt' ? '' : e.liste === 'regeln' ? 'zeige-regel' : e.liste === 'anmerkungen' ? 'anm-zeige' : e.liste === 'aenderungen' ? 'aend-zeige' : e.liste === 'formate' ? 'fv-zeige' : e.liste === 'uebernahmen' ? 'ue-zeige' : e.liste === 'glossar' ? 'glossar-zeige' : werk(e.werkId) ? 'werk' : '';
    const id = act === 'werk' ? e.werkId : e.obj.id, t = h(eintragText(e).slice(0, 140));
    return `<li><span class="lart">${LNAME[e.liste]}</span>${act ? `<a href="#" data-act="${act}" data-id="${h(id)}">${t}</a>` : `<span>${t}</span>`}${marke(e.stand, e.stand === 'entfernt' ? 'weg' : 'entwurf')}</li>`;
  }
  function start() {
    const z = L().regeln.filter(r => !istSchicht(werk(r.werkId))), v = letzteVersion(L()), mitPdf = L().werke.filter(w => dokVon(w.id)).length;
    const gruppen = [...new Set(L().werke.map(w => w.gruppe || '').filter(Boolean))], hgF = S.bib.hg && hg(S.bib.hg);
    const neueste = R.offen.slice(-5).reverse();
    return `<section class="dash">
      <header class="dashkopf"><div><h2>Normenbibliothek</h2><p class="lead">Alle Normen, Änderungen und Freigaben an einem Ort. Ein Klick auf das Titelblatt öffnet die Norm zum Lesen und Bearbeiten.</p></div><button class="haupt" data-act="werk-neu">Norm hinzufügen</button></header>
      <p class="kenn"><span><b>${L().werke.length}</b> Normen, ${mitPdf} mit PDF</span><span><b>${v ? 'Version ' + v.nr : 'Keine Version'}</b>${v ? ' vom ' + datumCH(v.datum) : ''}</span><span><b>${R.offen.length}</b> Änderungen nicht freigegeben</span><span><b>${z.filter(r => !r.geprueft).length}</b> von ${z.length} Regeln zu bestätigen</span></p>
      <div class="bibgrid">
        <section class="feld"><header class="feldkopf"><h3>${hgF ? h(hgF.kurz) : 'Alle Normen'} <span>(${bibListe().length})</span></h3>${hgF ? '<button class="klein" data-act="bib-hg" data-id="">alle Herausgeber zeigen</button>' : ''}</header>
          <div class="filter"><label><span class="sr">Normen filtern</span><input type="search" id="bq" value="${h(S.bib.q)}" placeholder="Nummer oder Titel filtern"></label>
            <label><span class="sr">Gruppe</span><select id="bib-gruppe">${opt([['', 'Alle Gruppen']].concat(gruppen.map(g => [g, g])), S.bib.gruppe)}</select></label>
            <label><span class="sr">Status</span><select id="bib-status">${opt([['', 'Alle Status'], ['ungeprueft', 'Ungeprüft'], ['bearbeitung', 'In Bearbeitung'], ['pruefung', 'Zur Prüfung'], ['korrektur', 'Korrektur erforderlich'], ['freigegeben', 'Freigegeben'], ['offen', 'Änderungen offen'], ['ohnepdf', 'Ohne PDF']], S.bib.status)}</select></label>
            <span class="umschalt"><button data-act="bib-liste" data-v="0" aria-pressed="${!S.bib.liste}">Karten</button><button data-act="bib-liste" data-v="1" aria-pressed="${S.bib.liste}">Liste</button></span></div>
          <div id="bibinhalt">${bibInhalt()}</div></section>
        <aside class="dashrechts">
          <section class="feld"><header class="feldkopf"><h3>Offene Änderungen</h3></header><ul class="offenliste">${neueste.map(eintragZeile).join('') || '<li class="leer">Alles ist freigegeben.</li>'}</ul>${R.offen.length ? `<p class="feldfuss"><button data-act="ansicht" data-typ="offen">Alle ${R.offen.length} Änderungen anzeigen</button></p>` : ''}</section>
          <section class="feld info"><h3>Das Original bleibt erhalten</h3><p>OCR-Korrekturen und fachliche Änderungen werden getrennt vom Original geführt. Für die Auslegung gilt nur, was freigegeben ist.</p>
            <details><summary>So arbeitet man damit</summary><ol class="schritte"><li>Norm anlegen und das Original-PDF hinzufügen.</li><li>In der Bearbeitung den Text je Seite korrigieren (OCR) oder als Schicht fachlich ändern, mit Begründung.</li><li>Regeln mit Abschnitt, Seite und Werten erfassen und am Original prüfen.</li><li>Änderungen freigeben. Erst dann entsteht eine neue Version.</li><li>Speichern. Daten und PDF liegen im verbundenen Ordner und lassen sich mit Git sichern.</li></ol></details></section>
        </aside></div></section>`;
  }
  const eKey = e => e.liste + '|' + e.obj.id;
  function verwerfbar(e) {
    if (e.liste === 'dokumente') return false;
    if (e.liste === 'werke' || e.liste === 'herausgeber') return e.stand === 'geändert';
    if (e.liste === 'aenderungen' && e.stand === 'neu') return e.obj.zurueckgezogen || letzteInKette(e.obj);
    if (e.liste === 'regeln' && e.stand === 'neu') return !L().regeln.some(r => r.zielId === e.obj.id);
    return true;
  }
  function offenAnsicht() {
    const ids = [...new Set(R.offen.map(e => e.werkId))], gew = R.offen.filter(e => !S.wahlAus.has(eKey(e))).length;
    const zeile = e => `<li><label class="wahl"><input type="checkbox" class="wahlbox" data-k="${h(eKey(e))}" ${S.wahlAus.has(eKey(e)) ? '' : 'checked'}><span class="sr">für die Freigabe auswählen</span></label>${eintragZeile(e).replace(/^<li>|<\/li>$/g, '')}${verwerfbar(e) ? `<button class="klein" data-act="offen-weg" data-k="${h(eKey(e))}">verwerfen</button>` : ''}</li>`;
    const bloecke = ids.map(id => { const w = werk(id); return `<section class="thema"><h3>${w ? h(w.kurz) : 'Allgemein'}</h3><ul class="offenliste gross wahlliste">${R.offen.filter(e => e.werkId === id).map(zeile).join('')}</ul></section>`; }).join('');
    return `<section class="blatt"><h2>Änderungen</h2><p class="lead">Alles, was seit der letzten freigegebenen Version neu, geändert oder entfernt ist. Für die Auslegung gilt es erst nach der Freigabe. Was nicht ausgewählt ist, bleibt offen.</p>
      ${R.offen.length ? `<p class="aktionen"><button class="haupt" data-act="freigeben-wahl" ${gew ? '' : 'disabled'}>${gew} von ${R.offen.length} freigeben</button><button data-act="wahl-alle" data-v="1">Alle auswählen</button><button data-act="wahl-alle" data-v="0">Keine auswählen</button><button data-act="protokoll-csv" data-id="">Gesamtes Protokoll für Excel</button></p>${bloecke}` : '<div class="leerblock"><p>Alles ist freigegeben.</p><button data-act="protokoll-csv" data-id="">Gesamtes Protokoll für Excel</button></div>'}</section>`;
  }
  // ----- Versionen vergleichen
  const vCache = new Map();
  function versionInhalt(nr) { if (nr === 'jetzt') return inhalt(L()); if (!vCache.has(nr)) { const v = L().versionen.find(x => String(x.nr) === String(nr)); vCache.set(nr, Object.assign(leererInhalt(), v ? JSON.parse(v.snapshot) : {})); } return vCache.get(nr); }
  function versionVon(liste, id) { for (const v of L().versionen) if (versionInhalt(v.nr)[liste].some(x => x.id === id)) return v.nr; return 0; }
  function vergleichHtml(A, B) {
    const LPL = { herausgeber: 'Herausgeber', werke: 'Normen', verknuepfungen: 'Verknüpfungen', regeln: 'Regeln', anmerkungen: 'Anmerkungen', dokumente: 'PDF', aenderungen: 'Textänderungen', formate: 'Formatänderungen', glossar: 'Glossar' }, teile = [];
    const kurzW = x => typeof x === 'string' ? x : JSON.stringify(x);
    const felder = (a, b) => Object.keys(Object.assign({}, a, b)).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]) && !['rev', 'frueher', 'masse', 'vorher', 'nachher'].includes(k)).map(k => k === 'text' || k === 'titel' || k === 'notiz' || k === 'begruendung' ? `<div class="lesetext klein"><b>${k}:</b> ${markiert(diffWorte(String(a[k] || ''), String(b[k] || '')), 'fach')}</div>` : `<div class="lesetext klein"><b>${k}:</b> <del class="fach">${h(kurzW(a[k] == null ? '' : a[k]).slice(0, 300))}</del> <ins class="fach">${h(kurzW(b[k] == null ? '' : b[k]).slice(0, 300))}</ins></div>`).join('');
    for (const liste of LISTEN) {
      const ma = new Map(A[liste].map(x => [x.id, x])), rows = [];
      const z = (stand, x, det) => `<li><span>${h(eintragText({ liste, obj: x }).slice(0, 160))}</span>${marke(stand, stand === 'entfernt' ? 'weg' : stand === 'neu' ? 'ok' : 'warn')}${det || ''}</li>`;
      B[liste].forEach(x => { const a = ma.get(x.id); if (!a) rows.push(z('neu', x)); else if (JSON.stringify(a) !== JSON.stringify(x)) rows.push(z('geändert', x, felder(a, x))); ma.delete(x.id); });
      ma.forEach(x => rows.push(z('entfernt', x)));
      if (rows.length) teile.push(`<section class="thema"><h3>${LPL[liste]} (${rows.length})</h3><ul class="vglliste">${rows.join('')}</ul></section>`);
    }
    const keys = new Set(); A.aenderungen.concat(B.aenderungen).forEach(a => keys.add(a.dokId + '|' + a.seite + '|' + (a.art === 'fachlich' ? a.schichtId : '')));
    const la = { seitentext: L().seitentext, aenderungen: A.aenderungen }, lb = { seitentext: L().seitentext, aenderungen: B.aenderungen }, texte = [];
    [...keys].sort().forEach(k => { const [d, n, sch] = k.split('|'), ta = textSchicht(la, d, +n, sch), tb = textSchicht(lb, d, +n, sch); if (ta === tb) return; const dk = dokId(d), w = dk && werk(dk.werkId);
      texte.push(`<article class="abschnitt"><header><b>${h(w ? w.kurz : d)}</b> ${dk && dk.teil ? h(dk.teil) + ', ' : ''}Seite ${n}, ${sch && werk(sch) ? h(werk(sch).kurz) : 'Grundtext'}</header><div class="lesetext">${markiert(diffWorte(ta, tb), 'fach')}</div></article>`); });
    if (texte.length) teile.push(`<section class="thema"><h3>Geänderte Seitentexte (${texte.length})</h3>${texte.join('')}</section>`);
    return teile.join('') || '<p class="leer">Zwischen diesen beiden Ständen gibt es keinen Unterschied.</p>';
  }
  // ----- Änderungsprotokoll für Excel
  function protokollCsv(ws) {
    const kopf = ['Änderungs-ID', 'Norm', 'Teil', 'Seite', 'Art', 'Schicht', 'Alter Inhalt', 'Neuer Inhalt', 'Begründung oder Kommentar', 'Betroffene Regel', 'Autor', 'Datum', 'Status', 'Freigegeben in Version'], rows = [];
    const status = (liste, a) => a.zurueckgezogen ? 'zurückgezogen' : standVon(L(), liste, a) === 'frei' ? 'freigegeben' : 'nicht freigegeben';
    ws.forEach(w => {
      L().aenderungen.filter(a => a.werkId === w.id).forEach(a => { const st = stellen(diffWorte(a.vorher, a.nachher)), d = dokId(a.dokId) || {}; rows.push([a.id, w.kurz, d.teil || '', a.seite, AEND[a.art], a.schichtId && werk(a.schichtId) ? werk(a.schichtId).kurz : '', st.map(x => x.alt || '–').join(' | '), st.map(x => x.neu || '–').join(' | '), a.begruendung, a.regelId || '', a.autor, datumCH(a.datum), status('aenderungen', a), versionVon('aenderungen', a.id) || '']); });
      L().formate.filter(f => f.werkId === w.id).forEach(f => { const d = dokId(f.dokId) || {}; rows.push([f.id, w.kurz, d.teil || '', f.seite, 'Formatänderung', '', f.text, FV[f.typ], '', '', f.autor, datumCH(f.datum), standVon(L(), 'formate', f) === 'frei' ? 'freigegeben' : 'nicht freigegeben', versionVon('formate', f.id) || '']); });
      L().anmerkungen.filter(a => a.werkId === w.id).forEach(a => { const d = dokId(a.dokId) || {}; rows.push([a.id, w.kurz, d.teil || '', a.seite, ANM[a.art] + (a.aendArt ? ', ' + AEND[a.aendArt] : ''), '', a.alt || '', a.neu || '', a.text, a.regelId || '', a.autor, datumCH(a.datum), status('anmerkungen', a) + (a.erledigt ? ', erledigt' : ''), versionVon('anmerkungen', a.id) || '']); const fr = antwFrei(a); (a.antworten || []).forEach(r => rows.push([a.id + '-R' + r.nr, w.kurz, d.teil || '', a.seite, 'Antwort auf ' + a.id, '', '', '', r.text, '', r.autor, datumCH(r.datum), (fr.has(r.nr) ? 'freigegeben' : 'nicht freigegeben') + (r.zurueckgezogen ? ', zurückgezogen' : ''), ''])); });
    });
    const q = t => '"' + String(t == null ? '' : t).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
    return { text: '﻿' + [kopf].concat(rows).map(r => r.map(q).join(';')).join('\r\n'), zeilen: rows.length };
  }
  function werkAnsicht(w) {
    const ds = dokus(w.id), dok = ds[0], layer = istSchicht(w);
    if (S.tab === 'edit' && !dok) S.tab = 'regeln';
    if (layer && S.tab === 'text') S.tab = 'regeln';
    const g = hg(w.herausgeberId), rs = L().regeln.filter(r => r.werkId === w.id), abs = L().abschnitte.filter(a => a.werkId === w.id), st = werkStatus(w);
    let inhaltHtml;
    if (S.tab === 'edit') inhaltHtml = edAnsicht(w);
    else if (S.tab === 'pdf') inhaltHtml = pdfAnsicht(w);
    else if (S.tab === 'info') {
      const links = L().verknuepfungen.filter(v => v.von === w.id || v.nach === w.id).map(v => {
        const aus = v.von === w.id, anderes = werk(aus ? v.nach : v.von) || { kurz: '?', id: '' };
        return `<li>${h(TYPEN[v.typ][aus ? 0 : 1])} <a href="#" data-act="werk" data-id="${h(anderes.id)}">${h(anderes.kurz)}</a>${v.bereich ? `<span class="bereich">${h(v.bereich)}</span>` : ''}${v.notiz ? `<span class="notiz">${h(v.notiz)}</span>` : ''}${standMarke('verknuepfungen', v)}<button class="klein" data-act="link-weg" data-id="${h(v.id)}">entfernen</button></li>`;
      }).join('');
      const meta = [['Herausgeber', g.name], ['Gruppe', w.gruppe], ['Ausgabe', w.ausgabe], ['In Kraft', w.inKraft], ['Status', w.status], ['Geltungsbereich', w.geltung], layer && ['Basisnorm', (werk(w.basisId) || {}).kurz], layer && ['Gebiet', w.gebiet], ['Bemerkung', w.notiz]].filter(x => x && x[1]).map(x => `<div><dt>${x[0]}</dt><dd>${h(x[1])}</dd></div>`).join('');
      const fvTab = ds.map(d => { const st = L().struktur[d.id]; if (!st) return `<p class="hinweis">${h(d.teil || d.datei)}: Struktur noch nicht erkannt.</p>`; const hand = L().formate.filter(f => f.dokId === d.id).length;
        return `<div class="rollen"><table class="tabelle"><caption>${h(d.teil || d.datei)}: Fliesstext ${st.koerper} pt${hand ? `, ${hand} Zeilen von Hand zugewiesen` : ''}</caption><thead><tr><th>Formatvorlage</th><th>Schriftgrösse im Original</th><th>Erkannte Zeilen</th></tr></thead><tbody>${Object.keys(FV).filter(k => st.vorlagen[k]).map(k => `<tr><td>${FV[k]}</td><td>${st.vorlagen[k].g} pt</td><td>${st.vorlagen[k].n}</td></tr>`).join('') || '<tr><td colspan="3">keine erkannt</td></tr>'}</tbody></table></div>`; }).join('');
      inhaltHtml = `<dl class="meta">${meta}</dl><div class="links"><h3>Verknüpfungen</h3><ul>${links || '<li class="leer">Keine Verknüpfung erfasst.</li>'}</ul></div>
        ${ds.length ? `<div class="links"><h3>Formatvorlagen aus dem Original</h3><p class="hinweis">Aus Schriftgrösse, Nummerierung und Lage der Zeilen im PDF erkannt. Zuweisungen von Hand bleiben beim erneuten Erkennen erhalten.</p>${fvTab}<p class="aktionen"><button data-act="struktur-neu" data-id="${h(w.id)}">Struktur neu erkennen</button></p></div>` : ''}`;
    } else if (S.tab === 'log') {
      const ids = new Set([w.id].concat(rs.map(r => r.id), L().anmerkungen.filter(a => a.werkId === w.id).map(a => a.id), L().aenderungen.filter(a => a.werkId === w.id).map(a => a.id)));
      const logs = L().verlauf.filter(v => ids.has(v.ziel)).reverse().map(v => `<li><time>${datumCH(v.zeit)} ${h((v.zeit || '').slice(11, 16))}</time><b>${h(v.name)}</b> ${h(v.aktion)} <span class="rid">${h(v.ziel)}</span>${v.detail ? `<span class="notiz">${h(v.detail)}</span>` : ''}</li>`).join('');
      inhaltHtml = `<ol class="logliste">${logs || '<li class="leer">Zu dieser Norm wurde seit der Ersterfassung nichts geändert.</li>'}</ol>`;
    } else if (S.tab === 'text' && !layer) {
      inhaltHtml = abs.length ? `<p class="hinweis">Eingelesen am ${datumCH(w.import && w.import.datum)} aus „${h(w.import && w.import.datei)}“ von ${h(w.import && w.import.name)}. Dieser Text ist in Abschnitte geteilt und gesperrt; Korrekturen macht man in der Bearbeitung.</p>` + abs.map(a => `<article class="abschnitt"><header><b>${h(a.nr)}</b> ${h(a.titel)} ${a.pdfSeite ? `<span class="ort">${(ds.length > 1 && a.dokId && dokId(a.dokId) ? h(dokId(a.dokId).teil) + ', ' : '') + seitenLink(w.id, a.pdfSeite, a.dokId)}</span>` : ''}<button class="klein" data-act="regel-neu" data-werk="${h(w.id)}" data-abs="${h(a.id)}">Regel daraus anlegen</button></header><pre>${h(a.text)}</pre></article>`).join('')
        : `<div class="leerblock"><p>Für ${h(w.kurz)} ist noch kein Originaltext eingelesen.</p><button class="haupt" data-act="import" data-id="${h(w.id)}">Originaltext einlesen</button></div>`;
    } else {
      const nachThema = L().themen.map(t => [t, rs.filter(r => r.thema === t[0])]).filter(x => x[1].length);
      inhaltHtml = (rs.length ? nachThema.map(([t, liste]) => `<section class="thema"><h3>${h(t[1])}</h3>${liste.map(regelKarte).join('')}</section>`).join('')
        : `<div class="leerblock"><p>${layer ? 'Diese Schicht enthält noch keine Abweichungen. Abweichungen erfasst man direkt bei der betreffenden Regel der Basisnorm, zusätzliche Regeln hier.' : 'Für dieses Werk sind noch keine Regeln erfasst.'}</p></div>`);
    }
    const tab = (k, txt) => `<button role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${txt}</button>`;
    const seitenZ = ds.reduce((n, d) => n + d.seiten, 0), nAnm = L().anmerkungen.filter(a => a.werkId === w.id).length;
    return `<section class="blatt${S.tab === 'pdf' || S.tab === 'edit' ? ' weit' : ''}">
      <header class="werkkopf">
        <p class="art"><a href="#" data-act="ansicht" data-typ="start">Zurück zur Bibliothek</a> ${layer ? (ebeneVon(w) === 'kanton' ? 'Kantonale Schicht' : 'Hersteller-Schicht') : w.art === 'produktanforderung' ? 'Produktanforderung, gilt unter jeder Norm' : w.art === 'unterlage' ? 'Weisung, Merkblatt oder Unterlage' : 'Norm'} ${standMarke('werke', w)}</p>
        <div class="werktitel"><h2>${h(w.kurz)}</h2><p class="lang">${h(w.titel)}</p><span class="pruefstand">${marke(st.pill, st.art)}${dok ? `<button class="klein" data-act="digital" data-id="${h(w.id)}">Prüfstatus ändern</button>` : ''}</span></div>
        ${dok ? (st.k === 'freigegeben' ? `<p class="geprueft">Digitale Fassung mit dem Original verglichen und freigegeben von ${h((w.digital || {}).pruefer)} am ${datumCH((w.digital || {}).datum)}.</p>` : `<p class="ungeprueft"><b>${st.k === 'ungeprueft' ? 'Ungeprüfte digitale Fassung.' : DSTAT[st.k][0] + '.'}</b> Text und Struktur sind noch nicht anhand des Originals freigegeben. Massgebend ist das Original-PDF.${(w.digital || {}).notiz ? ' Bemerkung: ' + h(w.digital.notiz) : ''}</p>`) : ''}
        ${layer && ebeneVon(w) === 'hersteller' ? '<p class="vermerk">Herstellernorm – keine behördliche Norm</p>' : ''}
        <p class="aktionen"><button data-act="werk-edit" data-id="${h(w.id)}">Angaben bearbeiten</button><button data-act="link-neu" data-id="${h(w.id)}">Verknüpfung hinzufügen</button><button data-act="regel-neu" data-werk="${h(w.id)}">${layer ? 'Regel ergänzen' : 'Regel erfassen'}</button>${dok ? '' : `<button data-act="pdf-neu" data-id="${h(w.id)}">PDF hinzufügen</button>`}${layer ? '' : `<button data-act="import" data-id="${h(w.id)}">Originaltext einlesen</button>`}</p>
      </header>
      <div class="tabs" role="tablist">${dok ? tab('edit', 'Bearbeitung') : ''}${tab('pdf', dok ? `Ganze Norm (${(ds.length > 1 ? ds.length + ' Teile, ' : '') + seitenZ} Seiten, ${nAnm} Anmerkungen)` : 'Original-PDF (keines)')}${tab('regeln', `${layer ? 'Einträge' : 'Regeln'} (${rs.length})`)}${layer ? '' : tab('text', `Originaltext (${abs.length} Abschnitte)`)}${tab('log', 'Änderungsprotokoll')}${tab('info', 'Angaben')}</div>
      ${inhaltHtml}</section>`;
  }

  function fassungAnsicht() {
    const k = S.kontext, q = S.mitEntwurf ? L() : freigegeben(L());
    const hgq = id => (q.herausgeber || []).find(x => x.id === id) || hg(id);
    const normen = q.werke.filter(w => w.art === 'norm'), schichten = q.werke.filter(w => w.art === 'schicht' && w.basisId === k.basis);
    const kant = schichten.filter(w => hgq(w.herausgeberId).art === 'kanton'), herst = schichten.filter(w => hgq(w.herausgeberId).art !== 'kanton');
    if (!kant.some(w => w.id === k.kanton)) k.kanton = ''; if (!herst.some(w => w.id === k.hersteller)) k.hersteller = '';
    const f = fassung(L(), k, S.mitEntwurf);
    const stapel = o => `<span class="stapel" title="Herkunft: ${h(o.herkunft)}"><i class="${o.ebene === 'bund' || o.regel.art === 'regel' ? 'an' : ''}">Bund</i><i class="${o.mods.some(m => m.ebene === 'kanton') || (o.ebene === 'kanton') ? 'an' : ''}">Kanton</i><i class="${o.mods.some(m => m.ebene === 'hersteller') || (o.ebene === 'hersteller') ? 'an' : ''}">Hersteller</i></span>`;
    const zeile = o => `<article class="regel fass ${o.aufgehoben ? 'weg' : ''} ${o.konflikt ? 'konflikt' : ''}">
        <header><span class="rid">${h(o.regel.id)}</span><span class="ort">${h(o.herkunft)}</span>${stapel(o)}</header>
        <h4>${h(o.wirksam.titel)}</h4>
        ${o.aufgehoben ? `<p class="text">Aufgehoben. Ursprünglich: ${h(o.regel.text)}</p>` : `<p class="text">${h(o.wirksam.text)}</p>${paramTabelle(o.wirksam.params)}`}
        ${o.wirksam !== o.regel && !o.aufgehoben ? `<p class="grund">Wert der Basisnorm: ${h(o.regel.text)}</p>` : ''}
        ${o.mods.map(m => `<p class="grund">${h(m.schicht.kurz)} (${h(ARTEN[m.e.art])}): ${h(m.e.begruendung)}</p>`).join('')}
        ${o.kommentare.map(c => `<p class="kommentar"><b>${h(c.schicht.kurz)}:</b> ${h(c.e.text)}</p>`).join('')}
        <p class="marken">${o.konflikt ? marke('Konflikt: Kanton und Hersteller regeln dasselbe. Es gilt die behördliche Schicht.', 'fehler') : ''}${o.pruefen ? marke('Basis aktualisiert – prüfen', 'warn') : ''}${o.zuBestaetigen && !o.pruefen ? marke('zu bestätigen', 'warn') : ''}</p></article>`;
    const themen = L().themen.map(t => { const liste = f.eintraege.filter(o => o.regel.thema === t[0]); return `<section class="thema"><h3>${h(t[1])}</h3>${liste.length ? liste.map(zeile).join('') : `<p class="ungeregelt">In ${h(f.basis ? f.basis.kurz : '')} nicht geregelt. Es wird nicht aus einer anderen Norm aufgefüllt.</p>`}</section>`; }).join('');
    return `<section class="blatt"><h2>Geltende Fassung</h2>
      <p class="lead">Eine Basisnorm, darüber die kantonale Schicht, darüber die Hersteller-Schicht. So liest später das Auslegeprogramm das Regelwerk.</p>
      <div class="kontext">
        <label>Basisnorm<select id="k-basis">${opt(normen.map(w => [w.id, w.kurz]), k.basis)}</select></label>
        <label>Kantonale Schicht<select id="k-kanton">${opt([['', kant.length ? 'keine' : 'keine erfasst']].concat(kant.map(w => [w.id, w.kurz + (w.gebiet ? ' – ' + w.gebiet : '')])), k.kanton)}</select></label>
        <label>Hersteller-Schicht<select id="k-hersteller">${opt([['', herst.length ? 'keine' : 'keine erfasst']].concat(herst.map(w => [w.id, w.kurz])), k.hersteller)}</select></label>
        <label class="haken"><input type="checkbox" id="k-entwurf" ${S.mitEntwurf ? 'checked' : ''}> Nicht freigegebene Änderungen einbeziehen</label>
      </div>
      ${k.hersteller ? '<p class="vermerk">Herstellernorm – keine behördliche Norm</p>' : ''}
      <p class="bilanz">${f.eintraege.length} Regeln, ${f.konflikte} ${f.konflikte === 1 ? 'Konflikt' : 'Konflikte'}, ${f.eintraege.filter(o => o.zuBestaetigen || o.konflikt).length} zu bestätigen. <button data-act="regelwerk">Regelwerk exportieren</button></p>
      ${themen}</section>`;
  }

  function verlaufAnsicht() {
    const vs = L().versionen.slice().reverse().map(v => `<tr><td>${v.nr}</td><td>${datumCH(v.datum)}</td><td>${h(v.name)}</td><td>${h(v.notiz)}</td><td>${v.anzahlRegeln}</td><td><code title="${h(v.pruefsumme)}">${h(v.pruefsumme.slice(0, 12))}</code></td></tr>`).join('');
    const logs = L().verlauf.slice().reverse().map(v => `<li><time>${datumCH(v.zeit)} ${h((v.zeit || '').slice(11, 16))}</time><b>${h(v.name)}</b> ${h(v.aktion)} <span class="rid">${h(v.ziel)}</span>${v.detail ? `<span class="notiz">${h(v.detail)}</span>` : ''}</li>`).join('');
    const vopt = L().versionen.map(v => [String(v.nr), `Version ${v.nr} vom ${datumCH(v.datum)}`]).concat([['jetzt', 'Aktueller Stand']]);
    if (!S.vgl.a || !vopt.some(o => o[0] === S.vgl.a)) S.vgl.a = String((letzteVersion(L()) || { nr: 'jetzt' }).nr);
    return `<section class="blatt"><h2>Verlauf und Versionen</h2>
      <h3>Zwei Stände vergleichen</h3>
      <div class="kontext"><label>Von<select id="vgl-a">${opt(vopt, S.vgl.a)}</select></label><label>Nach<select id="vgl-b">${opt(vopt, S.vgl.b)}</select></label></div>
      <div id="vergleich">${vergleichHtml(versionInhalt(S.vgl.a), versionInhalt(S.vgl.b))}</div>
      <h3>Freigegebene Versionen</h3>
      <div class="rollen"><table class="tabelle"><thead><tr><th>Nr.</th><th>Datum</th><th>Freigegeben von</th><th>Notiz</th><th>Regeln</th><th>Prüfsumme</th></tr></thead><tbody>${vs}</tbody></table></div>
      <h3>Änderungen</h3><ol class="logliste">${logs || '<li class="leer">Seit der Ersterfassung wurde nichts geändert.</li>'}</ol></section>`;
  }

  function suchAnsicht() {
    const q = S.q.trim().toLowerCase(); if (q.length < 2) return `<section class="blatt"><h2>Suchen</h2><p class="lead">Mindestens zwei Zeichen eingeben.</p></section>`;
    const tr = L().regeln.filter(r => [r.id, r.titel, r.text, r.abschnitt, r.begruendung].concat(r.params.map(p => p.k + ' ' + p.v + ' ' + p.e)).join(' ').toLowerCase().includes(q));
    const tg = L().glossar.filter(g => (g.begriff + ' ' + g.bedeutung).toLowerCase().includes(q)).slice(0, 40);
    const tn = L().anmerkungen.filter(a => [a.text, a.autor, a.zitat || ''].concat((a.antworten || []).map(r => r.text + ' ' + r.autor)).join(' ').toLowerCase().includes(q));
    const vt = volltextSuche(q), nSeiten = vt.reduce((n, x) => n + x.seiten.length, 0);
    return `<section class="blatt"><h2>Suche nach „${h(S.q)}“</h2>
      <h3>Regeln (${tr.length})</h3>${tr.map(r => `<p class="treffer-werk">${h((werk(r.werkId) || {}).kurz)}</p>${regelKarte(r)}`).join('') || '<p class="leer">Keine Regel gefunden.</p>'}
      ${tg.length ? `<h3>Glossar (${tg.length})</h3><ul class="vglliste">${tg.map(g => `<li><a href="#" data-act="glossar-zeige" data-id="${h(g.id)}"><b>${h(g.begriff)}</b></a><span>${h(g.bedeutung)}</span><span class="notiz">${h((werk(g.werkId) || {}).kurz || '')}</span></li>`).join('')}</ul>` : ''}
      <h3>Anmerkungen im PDF (${tn.length})</h3>${tn.map(a => `<p class="treffer-werk">${h((werk(a.werkId) || {}).kurz)}</p>${anmKarte(a)}`).join('') || '<p class="leer">Keine Anmerkung gefunden.</p>'}
      <h3>Text der Normen (${nSeiten} ${nSeiten === 1 ? 'Seite' : 'Seiten'} in ${vt.length} ${vt.length === 1 ? 'PDF' : 'PDF'})</h3>
      ${vt.slice(0, 40).map(x => { const w = werk(x.d.werkId) || { kurz: '?' }; return `<div class="volltreffer"><p class="treffer-werk"><b>${h(w.kurz)}</b>${x.d.teil ? ', ' + h(x.d.teil) : ''}: ${x.seiten.length} ${x.seiten.length === 1 ? 'Seite' : 'Seiten'}</p>${x.seiten.slice(0, 4).map(t => `<p class="treffer"><a href="#" data-act="pdf-seite" data-id="${h(x.d.werkId)}" data-dok="${h(x.d.id)}" data-seite="${t.n}">Seite ${t.n}</a><span>${h(t.vor)}<mark>${h(t.wort)}</mark>${h(t.nach)}</span></p>`).join('')}${x.seiten.length > 4 ? `<p class="treffer mehr">weitere Seiten: ${x.seiten.slice(4, 44).map(t => `<a href="#" data-act="pdf-seite" data-id="${h(x.d.werkId)}" data-dok="${h(x.d.id)}" data-seite="${t.n}">${t.n}</a>`).join(' ')}${x.seiten.length > 44 ? ' …' : ''}</p>` : ''}</div>`; }).join('') || '<p class="leer">Kein Treffer im Text der Normen.</p>'}
      ${vt.length > 40 ? `<p class="hinweis">Weitere ${vt.length - 40} PDF mit Treffern sind nicht aufgeführt. Die Suche genauer fassen.</p>` : ''}</section>`;
  }
  // ----- Volltext und Index über alle Normen
  const VT = { stand: '', seiten: null, klein: null }, IX = { stand: '', map: null };
  const hatEl = dId => !!(L().elemente[dId] || L().uebernahmen.some(u => u.dokId === dId));
  function elementText(dId, n) { // Inhalt der Tabellen und Beschriftungen der Skizzen, für Suche und Index
    if (!hatEl(dId)) return '';
    return elementeVon(L(), dId, n).map(e => '\n' + (e.titel ? e.titel + ' ' : '') + (e.typ === 'tabelle' ? (e.zeilen || []).map(z => z.join(' | ')).join('\n') : e.text || '')).join('');
  }
  function volltext() { // Seitentexte aller PDF, mit den OCR-Korrekturen
    const stand = L().aenderungen.length + ':' + L().aenderungen.filter(a => a.zurueckgezogen).length + ':' + L().dokumente.map(d => d.pruefsumme.slice(0, 4)).join('') + ':' + Object.keys(L().seitentext).length + ':' + L().uebernahmen.length + JSON.stringify(L().uebernahmen).length;
    if (VT.stand !== stand) {
      const korr = new Set(L().aenderungen.filter(a => a.art === 'ocr' && !a.zurueckgezogen).map(a => a.dokId + '|' + a.seite));
      VT.seiten = L().dokumente.map(d => ({ d, t: (L().seitentext[d.id] || []).map((x, i) => (korr.has(d.id + '|' + (i + 1)) ? textOcr(L(), d.id, i + 1) : x) + elementText(d.id, i + 1)) }));
      VT.klein = VT.seiten.map(x => x.t.map(t => t.toLowerCase())); VT.stand = stand;
    }
    return VT.seiten;
  }
  function volltextSuche(q) {
    const alle = volltext(), out = [];
    alle.forEach((x, k) => { const seiten = []; VT.klein[k].forEach((t, i) => { const p = t.indexOf(q); if (p < 0) return; const o = x.t[i]; seiten.push({ n: i + 1, vor: (p > 70 ? '… ' : '') + o.slice(Math.max(0, p - 70), p).replace(/\s+/g, ' '), wort: o.slice(p, p + q.length), nach: o.slice(p + q.length, p + q.length + 110).replace(/\s+/g, ' ') + ' …' }); }); if (seiten.length) out.push({ d: x.d, seiten }); });
    return out.sort((a, b) => b.seiten.length - a.seiten.length);
  }
  function begriffIndex() { // Vorkommen jedes Glossarbegriffs als ganzes Wort, je PDF und Seite
    const begriffe = [...new Set(L().glossar.filter(g => !g.zurueckgezogen).map(g => g.begriff))].filter(b => b.length >= 2); volltext();
    const stand = begriffe.join('|') + VT.stand; if (IX.stand === stand) return IX.map;
    const esc = b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), map = new Map(begriffe.map(b => [b, new Map()]));
    const re = new RegExp('(?<![A-Za-zÄÖÜäöüß0-9])(' + begriffe.slice().sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?![A-Za-zÄÖÜäöüß0-9])', 'g');
    if (begriffe.length) VT.seiten.forEach(({ d, t }) => t.forEach((txt, i) => { const hier = new Set(); let m; re.lastIndex = 0; while ((m = re.exec(txt))) hier.add(m[1]); hier.forEach(b => { const x = map.get(b); if (!x.has(d.id)) x.set(d.id, []); x.get(d.id).push(i + 1); }); }));
    IX.stand = stand; IX.map = map; return map;
  }
  function indexAnsicht() {
    const tab = S.ixTab || 'begriffe', q = (S.ixq || '').trim().toLowerCase();
    let inhalt;
    if (tab === 'begriffe') {
      const map = begriffIndex(), zeilen = [...map.keys()].filter(b => !q || b.toLowerCase().includes(q) || L().glossar.some(g => g.begriff === b && g.bedeutung.toLowerCase().includes(q))).sort((a, b) => a.localeCompare(b, 'de'));
      inhalt = `<div class="rollen"><table class="tabelle glossar"><thead><tr><th>Begriff</th><th>Bedeutung</th><th>Vorkommen</th></tr></thead><tbody>${zeilen.map(b => {
        const vor = map.get(b), nS = [...vor.values()].reduce((n, x) => n + x.length, 0), bed = [...new Set(L().glossar.filter(g => g.begriff === b && !g.zurueckgezogen).map(g => g.bedeutung))], auf = S.ixAuf === b;
        const det = auf ? `<tr class="ixdetail"><td colspan="3">${[...vor.entries()].sort((x, y) => y[1].length - x[1].length).map(([dId, seiten]) => { const d = dokId(dId), w = d && werk(d.werkId); return `<p><b>${h(w ? w.kurz : dId)}</b>${d && d.teil ? ', ' + h(d.teil) : ''} (${seiten.length}): ${seiten.slice(0, 40).map(n => `<a href="#" data-act="pdf-seite" data-id="${h(d.werkId)}" data-dok="${h(dId)}" data-seite="${n}">${n}</a>`).join(' ')}${seiten.length > 40 ? ' …' : ''}</p>`; }).join('') || '<p class="leer">Kommt im Text der Normen nicht vor.</p>'}</td></tr>` : '';
        return `<tr class="erst"><th scope="row">${h(b)}</th><td>${bed.slice(0, 3).map(h).join('<br>')}${bed.length > 3 ? '<br>…' : ''}</td><td><button class="klein" data-act="ix-auf" data-b="${h(b)}" aria-expanded="${auf}">${vor.size} PDF, ${nS} ${nS === 1 ? 'Seite' : 'Seiten'}</button></td></tr>${det}`; }).join('') || '<tr><td colspan="3" class="leer">Kein Begriff entspricht der Suche.</td></tr>'}</tbody></table></div>`;
    } else {
      const kap = []; L().dokumente.forEach(d => bloeckeVon(d.id).filter(b => /^u\d$/.test(b.typ)).forEach(b => kap.push({ d, b, titel: b.t.replace(/^[\d.\s]+/, '').trim() })));
      const zeilen = kap.filter(k => k.titel.length > 2 && (!q || k.b.t.toLowerCase().includes(q))).sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
      inhalt = `<p class="hinweis">${zeilen.length} Überschriften aus allen Normen, nach dem Stichwort geordnet.${zeilen.length > 800 ? ' Angezeigt werden die ersten 800; über das Suchfeld eingrenzen.' : ''}</p><ul class="sachliste">${zeilen.slice(0, 800).map(k => { const w = werk(k.d.werkId) || { kurz: '?' }; return `<li><a href="#" data-act="pdf-seite" data-id="${h(k.d.werkId)}" data-dok="${h(k.d.id)}" data-seite="${k.b.s}">${h(k.titel)}</a><span>${h(w.kurz)}${k.b.nr ? ', ' + h(k.b.nr) : ''}, S. ${k.b.s}</span></li>`; }).join('') || '<li class="leer">Keine Überschrift entspricht der Suche.</li>'}</ul>`;
    }
    return `<section class="blatt weit"><header class="dashkopf"><div><h2>Index</h2><p class="lead">Wo steht was? Die Begriffe des Glossars mit allen Fundstellen und die Überschriften aller Normen als Sachregister.</p></div></header>
      <div class="filter"><span class="umschalt"><button data-act="ix-tab" data-v="begriffe" aria-pressed="${tab === 'begriffe'}">Begriffe</button><button data-act="ix-tab" data-v="kapitel" aria-pressed="${tab === 'kapitel'}">Überschriften</button></span><label><span class="sr">Index durchsuchen</span><input type="search" id="ixq" value="${h(S.ixq || '')}" placeholder="Im Index suchen"></label></div>
      <div id="ixinhalt">${inhalt}</div></section>`;
  }

  // ----- Bearbeitung: Original, Text, Änderungen
  const AEND = { ocr: 'OCR-Korrektur', fachlich: 'Fachliche Änderung' };
  const aend = id => L().aenderungen.find(a => a.id === id);
  const kurzSum = t => sha256(t).slice(0, 16);
  const rund = (x, a, b) => Math.max(a, Math.min(b, x));
  const letzteInKette = a => { const k = kette(L(), a.dokId, a.seite, a.art === 'fachlich' ? a.schichtId : ''); return k[k.length - 1] === a; };
  const basisVeraltet = a => a.art === 'fachlich' && !a.zurueckgezogen && letzteInKette(a) && a.basis !== kurzSum(textOcr(L(), a.dokId, a.seite));
  function markiert(ops, kl) { return ops.map(o => o.o === '=' ? h(o.t) : /^\s+$/.test(o.t) ? (o.o === '+' ? h(o.t) : '') : o.o === '+' ? `<ins class="${kl}">${h(o.t)}</ins>` : `<del class="${kl}">${h(o.t)}</del>`).join(''); }
  function hybridHtml(basis, ocr, eff) {
    const d1 = diffWorte(basis, ocr);
    if (eff === ocr) return markiert(d1, 'ocr');
    const seq = []; let geist = '';
    d1.forEach(o => { if (o.o === '-') { if (!/^\s+$/.test(o.t)) geist += `<del class="ocr">${h(o.t)}</del> `; } else { seq.push({ t: o.t, neu: o.o === '+' && !/^\s+$/.test(o.t), geist }); geist = ''; } });
    let i = 0, html = '';
    diffWorte(ocr, eff).forEach(o => {
      if (o.o === '+') { html += /^\s+$/.test(o.t) ? h(o.t) : `<ins class="fach">${h(o.t)}</ins>`; return; }
      const x = seq[i++] || { t: o.t, geist: '' };
      if (o.o === '-') html += /^\s+$/.test(x.t) ? '' : `<del class="fach">${h(x.t)}</del>`;
      else html += x.geist + (x.neu ? `<ins class="ocr">${h(x.t)}</ins>` : h(o.t));
    });
    return html + geist;
  }
  function seitenHtml(dok, n, ansicht, ebene, druck) {
    const basis = seitenBasis(L(), dok.id, n), ocr = textOcr(L(), dok.id, n), eff = textSchicht(L(), dok.id, n, ebene);
    let html = ansicht === 'original' ? h(basis) : ansicht === 'neu' ? h(eff) : hybridHtml(basis, ocr, eff);
    if (!druck && ansicht !== 'hybrid') html = unsicherMark(html, dok, n);
    return mitElementen(formatiert(html, dok.id, n), dok, n, druck);
  }
  const unsicherVon = (dok, n) => { if ((dok.geprueftSeiten || []).includes(n)) return []; const ok = (dok.stelleOk || {})[n] || []; return ((L().unsicher[dok.id] || {})[n] || []).filter(t => !ok.includes(t)); }; // in der Prüfliste bestätigte Wörter sind nicht mehr unsicher
  function unsicherMark(html, dok, n) { // Wörter, die die Texterkennung unsicher gelesen hat, bis die Seite verglichen ist
    const ws = unsicherVon(dok, n); if (!ws.length) return html;
    const re = new RegExp('(^|[\\s(\\[„])(' + ws.map(w => h(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|') + ')(?=$|[\\s)\\]“])', 'g');
    return html.replace(re, '$1<mark class="unsicher" title="Unsicher gelesen. Bitte mit dem Original vergleichen.">$2</mark>');
  }
  const schnittKey = (dId, n, box) => dId + ':' + n + ':' + box.join(',');
  function ausschnitt(dId, n, box) { // Bereich einer Originalseite als Bild; das PDF bleibt die Quelle
    const key = schnittKey(dId, n, box); if (P.schnitte.has(key)) return Promise.resolve(P.schnitte.get(key));
    return (P.kette = P.kette.then(async () => {
      if (P.schnitte.has(key)) return P.schnitte.get(key);
      try {
        const doc = await pdfDoc(dId); if (!doc) return '';
        const page = await doc.getPage(n), v1 = page.getViewport({ scale: 1 }), sk = 2.4, sb = dId + ':' + n;
        let c = P.seitenbild && P.seitenbild.key === sb ? P.seitenbild.c : null;
        if (!c) { const vp = page.getViewport({ scale: sk }); c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); await page.render({ canvasContext: ctx, viewport: vp }).promise; P.seitenbild = { key: sb, c }; }
        const x = Math.round(box[0] * c.width), y = Math.round(box[1] * c.height), bw = Math.max(1, Math.round(box[2] * c.width)), bh = Math.max(1, Math.round(box[3] * c.height)), o = document.createElement('canvas');
        o.width = bw; o.height = bh; o.getContext('2d').drawImage(c, x, y, bw, bh, 0, 0, bw, bh);
        const url = o.toDataURL('image/png'); P.schnitte.set(key, url);
        if (P.schnitte.size > 400) P.schnitte.delete(P.schnitte.keys().next().value);
        return url;
      } catch (e) { return ''; }
    }));
  }
  // ----- Eigene Bilder im Text: PNG-Dateien in bilder/eigene/, im Bearbeitungsstand stehen nur Pfad und Masse
  const b64 = u8 => { let t = ''; for (let i = 0; i < u8.length; i += 32766) t += String.fromCharCode.apply(null, u8.subarray(i, i + 32766)); return btoa(t); };
  function bildUrl(pfad) {
    P.bilder = P.bilder || new Map(); if (P.bilder.has(pfad)) return Promise.resolve(P.bilder.get(pfad));
    return (A.neuBild.has(pfad) ? Promise.resolve(A.neuBild.get(pfad)) : liesBytes(pfad)).then(b => { const u = 'data:image/png;base64,' + b64(b); P.bilder.set(pfad, u); return u; }).catch(() => '');
  }
  async function bildAusDatei(file) { // jedes Bildformat des Browsers wird ein PNG, längste Seite höchstens 2400 Punkte
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const b0 = img.naturalWidth || 1600, h0 = img.naturalHeight || 1200, f = Math.min(1, 2400 / Math.max(b0, h0)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(b0 * f)); c.height = Math.max(1, Math.round(h0 * f)); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/png')), bytes = new Uint8Array(await blob.arrayBuffer()), kern = b64(bytes);
      const name = file.name.replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'bild';
      return { bytes, b: c.width, h: c.height, url: 'data:image/png;base64,' + kern, pfad: 'bilder/eigene/' + sha256(kern).slice(0, 12) + '_' + name + '.png', datei: file.name };
    } finally { URL.revokeObjectURL(url); }
  }
  function bildImg(bild, alt, w) { const src = P.bilder && P.bilder.get(bild.pfad); return `<img class="ausschnitt eigen" alt="${h(alt)}" data-w="${w}" style="aspect-ratio:${bild.b}/${bild.h}" ${src ? `src="${src}"` : `data-bild="${h(bild.pfad)}"`}>`; }
  const hatBox = e => !!(e.box && e.box[2] > 0 && e.box[3] > 0);
  function ueVorschau() { // Vorschau im Dialog: gewähltes oder vorhandenes Bild in der eingestellten Breite und Ausrichtung
    const v = $('#ue-vorschau'), f = v && v.closest('form'); if (!v || !UE) return;
    const b = UE.bildNeu || (f.elements.original && f.elements.original.checked ? null : UE.bild), br = f.elements.breite && +f.elements.breite.value, au = f.elements.ausr ? f.elements.ausr.value : 'links';
    v.innerHTML = b ? (UE.bildNeu ? `<img class="ausschnitt eigen" alt="Gewähltes Bild" src="${b.url}">` : bildImg(b, 'Eigenes Bild', 88)) : hatBox(UE) ? schnittImg(UE.dokId, UE.s, UE.box, 'Ausschnitt aus dem Original') : '<p class="leer">Noch kein Bild gewählt.</p>';
    v.className = 'uevorschau' + (UE.typ === 'skizze' ? ' bild ausr-' + au : ''); v.style.setProperty('--b', br >= 10 && br <= 100 ? br + '%' : 'auto'); schnitteMount();
  }
  document.addEventListener('change', async ev => {
    if (ev.target.id !== 'ue-datei' || !UE) return; const file = ev.target.files[0], st = UE; if (!file) return;
    const fe = $('#dlg .fehler'); fe.hidden = true;
    try { const b = await bildAusDatei(file); if (UE !== st) return; st.bildNeu = b; const o = $('#dlg input[name=original]'); if (o) o.checked = false; ueVorschau(); }
    catch (e) { if (UE !== st) return; st.bildNeu = null; ev.target.value = ''; fe.textContent = 'Die Datei lässt sich nicht als Bild lesen. Möglich sind PNG, JPEG, WebP, GIF und SVG.'; fe.hidden = false; }
  });
  document.addEventListener('input', ev => { if (UE && ev.target.closest && ev.target.closest('#dlg .bildwahl')) ueVorschau(); });
  function schnitteMount() { document.querySelectorAll('img.ausschnitt[data-bild]').forEach(img => { const p = img.dataset.bild; img.removeAttribute('data-bild'); bildUrl(p).then(u => { if (u) img.src = u; else img.alt = 'Das Bild liegt nicht in der Ablage.'; }); }); document.querySelectorAll('img.ausschnitt[data-box]').forEach(img => { const b = img.dataset.box.split(',').map(Number); img.removeAttribute('data-box'); ausschnitt(img.dataset.dok, +img.dataset.seite, b).then(u => { if (u) img.src = u; else img.alt = 'Das PDF liegt nicht in der Ablage; der Ausschnitt lässt sich nicht zeigen.'; }); }); }
  function schnittImg(dId, n, box, alt, kl) {
    const d = dokId(dId), m = (d && d.masse[n - 1]) || [210, 297], src = P.schnitte.get(schnittKey(dId, n, box));
    return `<img class="ausschnitt${kl ? ' ' + kl : ''}" alt="${h(alt)}" data-w="${Math.round(box[2] * 100)}" style="aspect-ratio:${(box[2] * m[0]).toFixed(1)}/${(box[3] * m[1]).toFixed(1)}" ${src ? `src="${src}"` : `data-dok="${h(dId)}" data-seite="${n}" data-box="${box.join(',')}"`}>`;
  }
  function tabelleHtml(e, druck) {
    const Z = e.zeilen || [], dk = druck ? null : dokId(e.dokId), zelle = (t, tag) => `<${tag}>${(dk ? unsicherMark(h(t), dk, e.s) : h(t)).replace(/\n/g, '<br>')}</${tag}>`;
    const kopf = e.ohneKopf || Z.length < 2 ? '' : `<thead><tr>${Z[0].map(c => zelle(c, 'th')).join('')}</tr></thead>`;
    return `<div class="uerahmen"><table class="uetab${e.ohneKopf ? ' ohnekopf' : ''}">${kopf}<tbody>${(kopf ? Z.slice(1) : Z).map(z => `<tr>${z.map((c, i) => zelle(c, e.ohneKopf && i === 0 ? 'th' : 'td')).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function elementHtml(e, druck, frei) { // frei: das Element hat keine Marke im Text und lässt sich mit ↑ ↓ verschieben
    const name = (e.typ === 'tabelle' ? 'Tabelle ' : 'Skizze ') + e.nr, nr = `data-nr="${h(e.nr)}"`, sk = e.typ === 'skizze', eigen = sk && e.bild, br = sk && e.breite ? e.breite : 0, au = sk && e.ausr ? e.ausr : '';
    const schieben = frei ? `<button class="klein" data-act="ue-pos" data-d="-1" ${nr} aria-label="${h(name)} im Text nach oben schieben" title="Im Text nach oben">↑</button><button class="klein" data-act="ue-pos" data-d="1" ${nr} aria-label="${h(name)} im Text nach unten schieben" title="Im Text nach unten">↓</button>` : '';
    const tools = druck ? '' : `<span class="uetools">${schieben}<button class="klein" data-act="ue-bearbeiten" ${nr}>${sk ? 'Bild, Grösse, Ausrichtung' : 'Bearbeiten'}</button>${eigen && !hatBox(e) ? '' : `<button class="klein" data-act="ue-typ" ${nr}>${e.typ === 'tabelle' ? 'Als Bild zeigen' : 'Als Tabelle erfassen'}</button>`}<button class="klein" data-act="ue-weg" ${nr}>Entfernen</button></span>`;
    let innen = e.typ === 'tabelle' ? tabelleHtml(e, druck) : eigen ? bildImg(e.bild, `${name}: eigenes Bild${e.titel ? ', ' + e.titel : ''}`, Math.round(88 * Math.min(1, e.bild.b / 1600))) : schnittImg(e.dokId, e.s, e.box, `${name} aus dem Original, Seite ${e.s}${e.text ? '. Beschriftungen: ' + e.text.slice(0, 200) : ''}`);
    if (sk && (br || au)) innen = innen.replace(/ data-w="(\d+)"/, (m, w) => ` data-w="${br ? Math.round(br * 0.88) : w}"${au ? ` data-ausr="${au}"` : ''}`);
    return `<figure class="ue ue-${e.typ}${e.hand ? ' hand' : ''}${eigen ? ' eigen' : ''}${br ? ' mitbreite' : ''}${au ? ' ausr-' + au : ''}"${br ? ` style="--b:${br}%"` : ''}${druck ? '' : ' tabindex="0"'} id="ue-${h(e.nr.replace('.', '-'))}">${innen}<figcaption><span>${h(name)}${e.titel ? ': ' + h(e.titel) : ''}${druck ? '' : eigen ? ' · eigenes Bild' : e.hand ? ' · von Hand übernommen' : ' · automatisch erkannt'}</span>${tools}</figcaption></figure>`;
  }
  function mitElementen(html, dok, n, druck) { // Platzhalter [[Tabelle 12.1]] und [[Skizze 12.2]] durch das Element ersetzen
    if (!hatEl(dok.id)) return html;
    const els = elementeVon(L(), dok.id, n), da = new Set();
    html = html.replace(/\n?\[\[(?:Tabelle|Skizze) (\d+\.\d+)\]\]\n?/g, (m, nr) => { const e = els.find(x => x.nr === nr); if (!e || da.has(nr)) return m[0] === '\n' && m.slice(-1) === '\n' ? '\n' : ''; da.add(nr); return elementHtml(e, druck); });
    // Elemente ohne Marke: nach der Zeile «nach» (gezählt werden Zeilen mit Inhalt), sonst am Ende der Seite
    const rest = els.filter(e => !da.has(e.nr)), zl = html.split('\n'), voll = []; zl.forEach((z, i) => { if (z.replace(/<[^>]+>/g, '').trim() || z.includes('<figure')) voll.push(i); });
    (P.zeilen = P.zeilen || new Map()).set(dok.id + ':' + n, voll.length);
    const vor = [], hinter = new Map(); let ende = '';
    rest.forEach(e => { const f = elementHtml(e, druck, true); if (e.nach == null || e.nach >= voll.length) ende += f; else if (e.nach <= 0) vor.push(f); else { const i = voll[e.nach - 1]; hinter.set(i, (hinter.get(i) || '') + f); } });
    hinter.forEach((f, i) => { zl[i] += f; });
    return vor.join('') + zl.join('\n') + ende;
  }
  async function schnitteLaden(ds, wahl) { for (const d of ds) { if (!hatEl(d.id)) continue; for (const n of (wahl || Array.from({ length: d.seiten }, (_, i) => i + 1))) for (const e of elementeVon(L(), d.id, n)) if (e.typ === 'skizze') await (e.bild ? bildUrl(e.bild.pfad) : ausschnitt(d.id, n, e.box)); } }
  async function tabelleImRechteck(dId, seite, box) { // erkannter Text im Rechteck als Zeilen und Spalten
    try { return gitterAus((await seitenWorte(dId, seite)).map(w => ({ t: w.t, x: w.x, w: w.w, y: w.y + w.h / 2, h: w.h })).filter(w => w.x + w.w / 2 >= box[0] && w.x + w.w / 2 <= box[0] + box[2] && w.y >= box[1] && w.y <= box[1] + box[3])); }
    catch (e) { return []; }
  }
  const ueNrNeu = (dId, n) => n + '.' + (Math.max(0, ...((L().elemente[dId] || []).filter(e => e.s === n).map(e => +e.nr.split('.')[1])), ...L().uebernahmen.filter(u => u.dokId === dId && u.seite === n).map(u => +u.nr.split('.')[1])) + 1);
  function ueSetzen(w, e, felder, was) { // Übernahme anlegen oder ändern; ein automatisch erkanntes Element wird dabei überlagert
    let u = L().uebernahmen.find(x => x.dokId === e.dokId && x.nr === e.nr);
    if (!u) { u = { id: uid('u'), werkId: w.id, dokId: e.dokId, seite: e.s, nr: e.nr, typ: e.typ, box: e.box, titel: e.titel || '', zeilen: e.zeilen || null, ohneKopf: !!e.ohneKopf, weg: false }; L().uebernahmen.push(u); }
    Object.assign(u, felder, { autor: L().meta.bearbeiter, datum: heute() }); ['bild', 'breite', 'ausr'].forEach(k => { if (!u[k]) delete u[k]; }); if (u.nach == null) delete u.nach;
    const det = `Seite ${e.s}, ${u.typ === 'tabelle' ? 'Tabelle' : 'Skizze'} ${e.nr}`, lz = L().verlauf[L().verlauf.length - 1];
    if (lz && lz.aktion === was && lz.ziel === w.id && lz.detail === det && lz.name === (L().meta.bearbeiter || '') && was === 'Bild im Text verschoben') S.dirty = true; else log(was, w.id, det);
    digitalBeruehrt(w);
  }
  let UE = null;
  const ueLesen = form => UE.zeilen.map((z, i) => z.map((c, j) => (form.elements[`c_${i}_${j}`] || { value: c }).value.replace(/\r/g, '').trim()));
  function ueForm(w, st) {
    UE = st; const tab = st.typ === 'tabelle';
    if (tab) { if (!st.zeilen || !st.zeilen.length) st.zeilen = [['', ''], ['', '']]; const nc = Math.max(1, ...st.zeilen.map(z => z.length)); st.zeilen = st.zeilen.map(z => Array.from({ length: nc }, (_, j) => z[j] || '')); }
    const op = (k, t) => `<button type="button" data-act="ue-gitter" data-op="${k}">${t}</button>`;
    const gitter = !tab ? '' : `<p class="hinweis">Die Zellen stammen aus dem erkannten Text und können falsch zugeordnet sein. Bitte mit dem Ausschnitt oben vergleichen.</p>
      <p class="aktionen">${op('z+', 'Zeile anfügen')}${op('z-', 'Letzte Zeile entfernen')}${op('s+', 'Spalte anfügen')}${op('s-', 'Letzte Spalte entfernen')}${op('zu', 'Leere Zeilen und Spalten entfernen')}</p>
      <div class="uerahmen"><table class="uegitter">${st.zeilen.map((z, i) => `<tr>${z.map((c, j) => `<td><textarea name="c_${i}_${j}" rows="${Math.max(1, c.split('\n').length, Math.ceil(c.length / 22))}" aria-label="Zeile ${i + 1}, Spalte ${j + 1}">${h(c)}</textarea></td>`).join('')}</tr>`).join('')}</table></div>
      <label class="haken"><input type="checkbox" name="kopf" ${st.ohneKopf ? '' : 'checked'}> Die erste Zeile ist die Kopfzeile</label>`;
    st.bildNeu = null;
    const bildwahl = tab ? '' : `<fieldset class="bildwahl"><legend>Bild, Grösse und Ausrichtung</legend>
        <label>${st.bild ? 'Anderes eigenes Bild einsetzen' : hatBox(st) ? 'Durch ein eigenes Bild ersetzen' : 'Eigenes Bild'} (PNG, JPEG, WebP, GIF oder SVG)<input type="file" name="datei" id="ue-datei" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"></label>
        ${st.bild && hatBox(st) ? '<label class="haken"><input type="checkbox" name="original"> Wieder den Ausschnitt aus dem Original zeigen</label>' : ''}
        <div class="bildmass"><label>Breite in Prozent der Textbreite<input type="number" name="breite" min="10" max="100" step="5" value="${st.breite || ''}" placeholder="automatisch"></label>
        <label>Ausrichtung<select name="ausr">${opt([['links', 'links'], ['mitte', 'Mitte'], ['rechts', 'rechts']], st.ausr || 'links')}</select></label></div>
        ${hatBox(st) ? '<p class="hinweis">Das Original-PDF bleibt unverändert. Ersetzt wird nur das Bild im Text der Bibliothek.</p>' : ''}</fieldset>`;
    dialog(st.eigen ? `Eigenes Bild einfügen, Seite ${st.s}` : `${tab ? 'Tabelle' : 'Skizze'} ${st.nr} ${st.neu ? 'übernehmen' : 'bearbeiten'}`, `<div class="uevorschau" id="ue-vorschau"></div>
      ${feld('titel', tab ? 'Titel der Tabelle (optional)' : 'Titel des Bildes (optional)', st.titel || '')}${bildwahl}${gitter}
      ${st.neu ? `<p class="hinweis">Das Element erscheint am Ende der Seite. ${tab ? '' : 'Mit ↑ und ↓ am Bild lässt es sich im Text verschieben. '}Mit der Marke <code>[[${tab ? 'Tabelle' : 'Skizze'} ${h(st.nr)}]]</code> im Text der Seite lässt es sich an eine feste Stelle setzen.</p>` : ''}`, (d, form) => {
      const felder = { typ: st.typ, box: st.box, titel: d.titel.trim(), weg: false };
      if (!tab) {
        if (d.datei && d.datei.size && !st.bildNeu) return 'Das Bild wird noch gelesen. Bitte noch einmal «Übernehmen» wählen.';
        if (d.breite && !(+d.breite >= 10 && +d.breite <= 100)) return 'Die Breite liegt zwischen 10 und 100 Prozent.';
        felder.breite = d.breite ? Math.round(+d.breite) : 0; felder.ausr = d.ausr === 'links' ? '' : d.ausr;
        if (st.bildNeu) { const b = st.bildNeu; A.neuBild.set(b.pfad, b.bytes); (P.bilder = P.bilder || new Map()).set(b.pfad, b.url); felder.bild = { pfad: b.pfad, b: b.b, h: b.h, datei: b.datei }; }
        else if (d.original) felder.bild = null;
        if (!hatBox(st) && !st.bildNeu && !st.bild) return 'Bitte ein Bild wählen.';
        if (st.eigen || st.bildNeu || d.original) { ueSetzen(w, st, felder, st.eigen ? 'Eigenes Bild eingefügt' : st.bildNeu ? 'Skizze durch eigenes Bild ersetzt' : 'Skizze wieder aus dem Original'); return; }
      }
      if (tab) { let Z = ueLesen(form); Z = Z.filter(z => z.some(c => c)); if (!Z.length) return 'Die Tabelle ist leer.'; felder.zeilen = Z; felder.ohneKopf = !d.kopf; }
      ueSetzen(w, st, felder, st.neu ? (tab ? 'Tabelle übernommen' : 'Skizze übernommen') : (tab ? 'Tabelle geändert' : 'Skizze geändert'));
    }, 'Übernehmen', true);
    ueVorschau();
  }
  function uebernahmeNeu(vg) {
    const w = werk(vg.werkId), box = [vg.rect.x, vg.rect.y, vg.rect.w, vg.rect.h], st = { dokId: vg.dokId, s: vg.seite, nr: ueNrNeu(vg.dokId, vg.seite), typ: vg.art, box, titel: '', neu: true };
    document.querySelectorAll('.seite.mark').forEach(n => n.classList.remove('mark'));
    if (vg.art === 'tabelle') tabelleImRechteck(vg.dokId, vg.seite, box).then(z => { st.zeilen = z; ueForm(w, st); }); else ueForm(w, st);
  }
  const LEGENDE = '<p class="legende"><span><ins class="fach">Ergänzung</ins></span><span><del class="fach">Löschung</del></span><span><ins class="ocr">OCR-Korrektur</ins></span><span><del class="ocr">vom OCR falsch gelesen</del></span></p>';
  function aendKarte(a) {
    const st = stellen(diffWorte(a.vorher, a.nachher)), sch = a.schichtId && werk(a.schichtId), r = a.regelId && regel(a.regelId), neu = standVon(L(), 'aenderungen', a) === 'neu', letzte = a.zurueckgezogen || letzteInKette(a);
    const hatAbw = r && sch && L().regeln.some(x => x.werkId === sch.id && x.zielId === r.id && x.art !== 'kommentar' && !x.zurueckgezogen);
    return `<article class="aend art-${a.art}${a.zurueckgezogen ? ' weg' : ''}${P.aktiv === a.id ? ' aktiv' : ''}" id="t-${h(a.id)}">
      <header><span class="nr">Ä${a.nr}</span>${marke(AEND[a.art] + (sch ? ', ' + sch.kurz : ''), a.art === 'ocr' ? '' : 'art')}<a href="#" data-act="aend-zeige" data-id="${h(a.id)}">Seite ${a.seite}</a></header>
      <dl class="altneu">${st.slice(0, 4).map(x => `<div><dt>Alt</dt><dd>${x.alt ? `<del class="${a.art === 'ocr' ? 'ocr' : 'fach'}">${h(x.alt)}</del>` : '–'}</dd><dt>Neu</dt><dd>${x.neu ? `<ins class="${a.art === 'ocr' ? 'ocr' : 'fach'}">${h(x.neu)}</ins>` : '–'}</dd></div>`).join('')}</dl>
      ${st.length > 4 ? `<p class="grund">und ${st.length - 4} weitere ${st.length - 4 === 1 ? 'Stelle' : 'Stellen'}</p>` : ''}
      <p class="grund">Begründung: ${h(a.begruendung)}</p><p class="grund">${h(a.autor)}, ${datumCH(a.datum)}</p>
      ${r ? `<p class="ziel">betrifft Regel <a href="#" data-act="zeige-regel" data-id="${h(r.id)}">${h(r.id)} ${h(r.titel)}</a></p>` : ''}
      <p class="marken">${standMarke('aenderungen', a)}${a.zurueckgezogen ? marke('zurückgezogen', 'weg') : ''}${basisVeraltet(a) ? marke('Grundtext geändert – prüfen', 'warn') : ''}${a.art === 'fachlich' && !a.zurueckgezogen ? (!r ? marke('ohne Regel: wirkt nicht auf die Auslegung', 'warn') : hatAbw ? marke('Regelwert in der Schicht angepasst', 'ok') : marke('Regelwert in der Schicht noch nicht angepasst', 'warn')) : ''}</p>
      <p class="aktionen">${r && sch && !hatAbw && !a.zurueckgezogen ? `<button data-act="aend-abw" data-id="${h(a.id)}">Regelwert anpassen</button>` : ''}${basisVeraltet(a) ? `<button data-act="aend-basis" data-id="${h(a.id)}">Gegen neuen Grundtext geprüft</button>` : ''}${letzte ? `<button data-act="aend-weg" data-id="${h(a.id)}">${neu ? 'Löschen' : a.zurueckgezogen ? 'Wieder aufnehmen' : 'Zurückziehen'}</button>` : ''}</p></article>`;
  }
  function edAnsicht(w) {
    const ds = dokus(w.id), dok = ds.find(d => d.id === S.ed.dok) || ds[0], N = dok.seiten; S.ed.dok = dok.id;
    const n = S.ed.seite = rund(S.ed.seite | 0, 1, N), E = S.ed;
    const schichten = L().werke.filter(x => istSchicht(x) && x.basisId === w.id);
    if (E.ebene && !schichten.some(x => x.id === E.ebene)) E.ebene = '';
    const hat = !!L().seitentext[dok.id], da = pdfDa(dok), m = dok.masse[n - 1] || [210, 297];
    const ocr = textOcr(L(), dok.id, n), eff = textSchicht(L(), dok.id, n, E.ebene), sch = E.ebene && werk(E.ebene);
    const anms = L().anmerkungen.filter(a => a.dokId === dok.id), aes = L().aenderungen.filter(a => a.dokId === dok.id);
    const hier = anms.filter(a => a.seite === n && !a.zurueckgezogen);
    const fleck = fleckHtml;
    const links = da ? `<div id="pdfseiten" class="eine" data-werk="${h(w.id)}"><div class="seitenblock" data-dok="${h(dok.id)}" data-seite="${n}" style="width:${P.zoom}%"><div class="seite${markKl()}${E.links === 'hybrid' && !E.zScan ? ' ohne-scan' : ''}${E.links === 'hybrid' && !E.zText ? ' ohne-text' : ''}" data-dok="${h(dok.id)}" data-seite="${n}"${E.links === 'hybrid' ? ' data-hybrid="1"' : ''} style="aspect-ratio:${m[0]}/${m[1]};--t:${E.transp / 100}">${E.zMarken ? hier.filter(a => a.rect).map(fleck).join('') : ''}</div></div></div>`
      : `<div class="leerblock"><p>Das PDF „${h(dok.datei)}“ liegt nicht in der Ablage.</p><button class="haupt" data-act="pdf-ersetzen" data-id="${h(dok.id)}">PDF hinzufügen</button></div>`;
    let mitte;
    if (!hat) mitte = `<div class="leerblock"><p>Für dieses PDF ist noch kein Seitentext gespeichert.</p>${da ? `<button class="haupt" data-act="ed-text-lesen" data-id="${h(dok.id)}">Text aus dem PDF lesen</button>` : ''}</div>`;
    else if (E.edit) mitte = `<p class="hinweis edhinweis">Du bearbeitest ${sch ? `als <b>${h(sch.kurz)}</b>: fachliche Änderung. Das Original und der Grundtext bleiben unverändert.` : 'den <b>Grundtext</b>: OCR-Korrektur. Nur Lesefehler berichtigen, nichts am Inhalt ändern.'}</p>
        <div class="edwerkzeug"><button data-act="ed-undo" title="Rückgängig (Ctrl+Z)">Rückgängig</button><button data-act="ed-redo" title="Wiederholen (Ctrl+Y)">Wiederholen</button><span class="zeichen-leiste" aria-label="Sonderzeichen einfügen">${['Ø', '±', '≤', '≥', 'µ', '°', '²', '³', '×', '·', 'Δ', '‰', '½', '–', '„', '“', '§'].map(z => `<button data-act="ed-zeichen" data-z="${z}" aria-label="${z} einfügen">${z}</button>`).join('')}</span></div>
        <div class="edwerkzeug"><label class="fvwahl">Formatvorlage der Zeile<select id="ed-fv">${opt(Object.keys(FV).map(k => [k, FV[k]]), 'text')}</select></label></div>
        <div class="edwerkzeug suchen"><label><span class="sr">Suchen</span><input id="ed-such" value="${h(E.such)}" placeholder="Suchen"></label><label><span class="sr">Ersetzen durch</span><input id="ed-ers" value="${h(E.ers)}" placeholder="Ersetzen durch"></label><button data-act="ed-such-next">Weitersuchen</button><button data-act="ed-ers-eins">Ersetzen</button><button data-act="ed-ers-alle">Alle ersetzen</button></div>
        <label class="sr" for="ed-text">Text der Seite ${n}</label><textarea id="ed-text" spellcheck="false">${h(E.entwurf)}</textarea>
        ${/\[\[(Tabelle|Skizze) /.test(E.entwurf) ? '<p class="hinweis edhinweis">Zeilen wie <code>[[Tabelle 12.1]]</code> und <code>[[Skizze 12.2]]</code> sind Platzhalter: An dieser Stelle steht in der Leseansicht die Tabelle oder die Skizze. Die Zeile lässt sich verschieben.</p>' : ''}
        <p class="aktionen edaktionen"><button class="haupt" data-act="ed-speichern">Änderung übernehmen</button><button data-act="ed-abbruch">Abbrechen</button></p>`;
    else { const html = seitenHtml(dok, n, E.ansicht, E.ebene); const un = E.ansicht === 'hybrid' ? [] : unsicherVon(dok, n), oc = L().ocr[dok.id]; mitte = (un.length ? `<p class="hinweis edhinweis"><mark class="unsicher">${un.length} ${un.length === 1 ? 'Stelle' : 'Stellen'}</mark> auf dieser Seite hat die Texterkennung unsicher gelesen. Die Markierung verschwindet, sobald die Seite als verglichen markiert ist.</p>` : '') + (html.trim() ? `<div class="lesetext">${html}</div>` : '<p class="leer edleer">Auf dieser Seite wurde kein Text erkannt. Über „Text bearbeiten“ lässt er sich von Hand erfassen.</p>') + (E.ansicht === 'hybrid' ? LEGENDE : ''); }
    const zeigA = E.filter !== 'kommentar', zeigK = E.filter === 'alle' || E.filter === 'kommentar';
    const aL = zeigA ? aes.filter(a => E.filter === 'alle' || a.art === E.filter) : [], kL = zeigK ? anms : [];
    const teil = (titel, f) => { const x = aL.filter(f).sort((a, b) => a.seite - b.seite || a.nr - b.nr).map(aendKarte).join('') + kL.filter(f).sort((a, b) => a.seite - b.seite || a.nr - b.nr).map(anmKarte).join(''); return x ? `<h4>${titel}</h4>${x}` : ''; };
    const liste = teil('Auf dieser Seite', a => a.seite === n) + teil('Auf anderen Seiten', a => a.seite !== n);
    const chip = (k, t, z) => `<button data-act="ed-filter" data-v="${k}" aria-pressed="${E.filter === k}">${t} (${z})</button>`;
    const sicht = (k, t) => `<button data-act="ed-ansicht" data-v="${k}" aria-pressed="${E.ansicht === k}">${t}</button>`;
    const bl = bloeckeVon(dok.id), kap = bl.filter(b => /^u\d$/.test(b.typ) || b.typ === 'titel');
    const inhalt = `<details class="inhalt" ${E.inhaltAuf ? 'open' : ''}><summary data-act="ed-inhalt">Inhalt${kap.length ? ' (' + kap.length + ')' : ''}</summary><div class="inhaltliste">${L().struktur[dok.id] ? (kap.map(b => `<a href="#" data-act="ed-gehe" data-s="${b.s}" class="iv-${b.typ}${b.s === n ? ' hier' : ''}"><span>${h(b.t.slice(0, 80))}</span><i>${b.s}</i></a>`).join('') || '<p class="leer">In diesem PDF wurden keine Überschriften erkannt. Im Text lässt sich einer Zeile die Formatvorlage „Überschrift“ zuweisen.</p>') : `<p class="leer">Für dieses PDF ist die Struktur noch nicht erkannt.</p>`}<p class="feldfuss"><button data-act="struktur-neu" data-id="${h(w.id)}">Struktur neu erkennen</button></p></div></details>`;
    if (E.vgl) { // Vergleich: Original und Text nebeneinander über das ganze Fenster, gleicher Zoom, zeilengenaues Scrollen
      const ok = (dok.geprueftSeiten || []).includes(n), nOk = (dok.geprueftSeiten || []).length, blink = E.vblink && !E.edit, zeile = E.vtext === 'zeile' && !E.edit;
      const an = (k, v) => `aria-pressed="${v}" class="${v ? 'an' : ''}"`;
      return `<div class="vgl" id="vgl" data-m="${m[0]}/${m[1]}">
        <div class="vglleiste">
          <b class="vglname">${h(w.kurz)}</b>
          <span class="zoom"><button data-act="ed-seite" data-d="-1" aria-label="Vorherige Seite" ${n <= 1 ? 'disabled' : ''}>‹</button><label class="sprung">Seite<input type="number" id="ed-sprung" min="1" max="${N}" value="${n}"> von ${N}</label><button data-act="ed-seite" data-d="1" aria-label="Nächste Seite" ${n >= N ? 'disabled' : ''}>›</button></span>
          <span class="zoom"><button data-act="vgl-zoom" data-d="-1" aria-label="Kleiner">−</button><output id="vgl-z" aria-label="Zoom"></output><button data-act="vgl-zoom" data-d="1" aria-label="Grösser">+</button></span>
          <span class="umschalt"><button data-act="vgl-zoom" data-v="seite" id="vgl-seite">Ganze Seite</button><button data-act="vgl-zoom" data-v="breite" id="vgl-breite">Seitenbreite</button></span>
          ${blink ? `<button data-act="vgl-wechsel" class="haupt">Wechseln (Leertaste)</button><span class="hinweis" id="vgl-blinkwas"></span>` : `<span class="umschalt" role="group" aria-label="Darstellung des Textes"><button data-act="vgl-text" data-v="fliess" aria-pressed="${!zeile}">Fliesstext</button><button data-act="vgl-text" data-v="zeile" aria-pressed="${zeile}" title="Jede Zeile steht wie auf der Seite (Z)">Zeilengetreu</button></span>
          ${zeile ? '' : `<span class="umschalt">${sicht('original', 'Grundtext')}${sicht('hybrid', 'Mit Änderungen')}${sicht('neu', 'Neu')}</span>`}
          <label class="haken"><input type="checkbox" id="vgl-sync" ${E.vsync ? 'checked' : ''}> Gleich scrollen</label>
          <button data-act="vgl-lineal" ${an('l', E.vlineal)} title="Die aktuelle Zeile ist auf beiden Seiten hervorgehoben; Pfeil auf und ab (L)">Zeilenlineal</button>`}
          <button data-act="vgl-blink" ${an('b', blink)} title="Scan und gesetzter Text liegen übereinander und wechseln auf Tastendruck (B)">Blinkvergleich</button>
          <span class="rechts"><span class="vglstand" title="Seiten dieses PDF, die als verglichen markiert sind"><progress max="${N}" value="${nOk}"></progress> ${nOk} von ${N}</span><button data-act="vgl-unsicher" title="Zur nächsten Seite mit unsicher gelesenen Stellen (N)">Nächste unsichere</button><button data-act="seite-ok" aria-pressed="${ok}" class="${ok ? 'ok' : ''}" title="Enter: als verglichen markieren und zur nächsten Seite">${ok ? 'Seite verglichen ✓' : 'Seite als verglichen markieren'}</button>${darfFreigeben() && dstat(w) !== 'freigegeben' ? `<button data-act="digital-frei" data-id="${h(w.id)}">Norm freigeben</button>` : ''}${hat && !E.edit ? '<button data-act="ed-edit" title="E">Text bearbeiten</button>' : ''}<button data-act="vgl-tasten" aria-label="Tasten anzeigen">Tasten</button><button class="haupt" data-act="vgl-aus" title="Esc">Vergleich beenden</button></span>
        </div>
        <div class="vglgrid${blink ? ' blink' : ''}">
          <div class="vglfeld" id="vgl-l" tabindex="0" aria-label="Original, Seite ${n}"><div class="vglblatt">${links}</div></div>
          ${blink ? '' : `<div class="vglfeld" id="vgl-r" tabindex="0" aria-label="Text der Seite ${n}">${zeile ? `<div class="vglblatt vglzeile" id="vgl-zg" data-dok="${h(dok.id)}" data-seite="${n}"></div>` : `<div class="vglblatt vgltext${E.edit ? ' schreibt' : ''}">${mitte}</div>`}</div>`}
        </div></div>`;
    }
    return `<div class="pdfleiste edleiste">
        ${inhalt}
        ${ds.length > 1 ? `<label class="sprung">Teil<select id="ed-dok">${opt(ds.map(d => [d.id, d.teil || d.datei]), dok.id)}</select></label>` : ''}
        <span class="zoom"><button data-act="ed-seite" data-d="-1" aria-label="Vorherige Seite" ${n <= 1 ? 'disabled' : ''}>‹</button><label class="sprung">Seite<input type="number" id="ed-sprung" min="1" max="${N}" value="${n}"> von ${N}</label><button data-act="ed-seite" data-d="1" aria-label="Nächste Seite" ${n >= N ? 'disabled' : ''}>›</button></span>
        <label class="sprung">Ich bearbeite<select id="ed-ebene">${opt([['', 'Grundtext (OCR-Korrektur)']].concat(schichten.map(x => [x.id, x.kurz + ' (fachlich)'])), E.ebene)}</select></label>
        <span class="rechts"><button class="haupt" data-act="vgl-an" ${da && hat ? '' : 'disabled'}>Vergleichen: ganze Seite</button><button data-act="pl-auf" data-id="${h(w.id)}" ${L().ocr[dok.id] ? '' : 'disabled title="Nur für gescannte Normen"'}>Prüfliste</button><button data-act="ed-druck">Drucken oder Word</button><button data-act="ed-pdf">PDF exportieren</button><button data-act="protokoll-csv" data-id="${h(w.id)}">Protokoll für Excel</button></span>
      </div>
      <div class="edgrid">
        <section class="edspalte" aria-label="Original"><header class="edkopf"><h3>Original</h3><span class="edtools"><button data-act="seite-ok" aria-pressed="${(dok.geprueftSeiten || []).includes(n)}" class="klein ${(dok.geprueftSeiten || []).includes(n) ? 'ok' : ''}" title="${(dok.geprueftSeiten || []).length} von ${N} Seiten verglichen">${(dok.geprueftSeiten || []).includes(n) ? 'Seite verglichen ✓' : 'Seite als verglichen markieren'}</button>${darfFreigeben() && dstat(w) !== 'freigegeben' ? `<button data-act="digital-frei" data-id="${h(w.id)}" class="klein" title="${seitenStand(w).ok} von ${seitenStand(w).alle} Seiten verglichen">Norm freigeben</button>` : ''}<span class="zoom"><button data-act="pdf-zoom" data-d="-25" aria-label="Kleiner">−</button><output>${P.zoom} %</output><button data-act="pdf-zoom" data-d="25" aria-label="Grösser">+</button></span></span></header>
          <p class="edzeile">${['aenderung', 'kommentar'].map(k => { const an = P.mark && P.markArt === k; return `<button data-act="pdf-mark" data-art="${k}" aria-pressed="${an}" class="${an ? 'haupt' : ''}">${an ? (markText() ? 'Jetzt den Text im Scan überstreichen' : 'Jetzt die Stelle im Scan einrahmen') : k === 'aenderung' ? 'Änderung im Scan vorschlagen' : 'Stelle kommentieren'}</button>`; }).join('')}${weiseWahl()}<button data-act="anm-seite" data-werk="${h(w.id)}" data-dok="${h(dok.id)}" data-seite="${n}">Ganze Seite kommentieren</button></p>
          <p class="edzeile">${['tabelle', 'skizze'].map(k => { const an = P.mark && P.markArt === k; return `<button data-act="pdf-mark" data-art="${k}" aria-pressed="${an}" class="${an ? 'haupt' : ''}">${an ? 'Jetzt den Bereich im Scan einrahmen' : k === 'tabelle' ? 'Tabelle übernehmen' : 'Skizze übernehmen'}</button>`; }).join('')}${hat ? '<button data-act="bild-neu">Eigenes Bild einfügen</button>' : ''}</p>
          <p class="edzeile ebenen"><span class="umschalt"><button data-act="ed-links" data-v="scan" aria-pressed="${E.links === 'scan'}">Scan</button><button data-act="ed-links" data-v="hybrid" aria-pressed="${E.links === 'hybrid'}">Hybrid</button></span>
            ${E.links === 'hybrid' ? `<label class="regler">Text deckend<input type="range" id="ed-transp" min="0" max="100" step="5" value="${E.transp}"><output>${E.transp} %</output></label><label class="haken"><input type="checkbox" id="ed-z-scan" ${E.zScan ? 'checked' : ''}> Scan</label><label class="haken"><input type="checkbox" id="ed-z-text" ${E.zText ? 'checked' : ''}> Text</label>` : ''}<label class="haken"><input type="checkbox" id="ed-z-marken" ${E.zMarken ? 'checked' : ''}> Markierungen</label></p>
          ${links}</section>
        <section class="edspalte" aria-label="Text der Seite"><header class="edkopf"><h3>Text der Seite ${n}</h3><span class="edtools"><span class="umschalt">${sicht('original', 'Grundtext')}${sicht('hybrid', 'Mit Änderungen')}${sicht('neu', 'Neu')}</span>${hat && !E.edit ? '<button class="haupt" data-act="ed-edit">Text bearbeiten</button>' : ''}</span></header>
          ${mitte}</section>
        <aside id="pdfanm" class="edspalte edliste" aria-label="Änderungen"><header class="edkopf"><h3>Änderungen (${aes.length + anms.length})</h3></header>
          <p class="umschalt chips">${chip('alle', 'Alle', aes.length + anms.length)}${chip('fachlich', 'Fachlich', aes.filter(a => a.art === 'fachlich').length)}${chip('ocr', 'OCR', aes.filter(a => a.art === 'ocr').length)}${chip('kommentar', 'Kommentare', anms.length)}</p>
          ${liste || '<p class="leer">Noch keine Änderung. Den Text bearbeiten oder eine Stelle im Original kommentieren.</p>'}</aside>
      </div>`;
  }
  function aendAnlegen(w, dId, n, art, sch, vorher, nachher, begruendung, regelId) {
    const pre = w.kurz.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); let nr = L().aenderungen.filter(a => a.werkId === w.id).reduce((x, a) => Math.max(x, a.nr), 0), id;
    do { id = `${pre}-T${++nr}`; } while (aend(id) || L().verlauf.some(v => v.ziel === id));
    const st = stellen(diffWorte(vorher, nachher));
    L().aenderungen.push({ id, nr, werkId: w.id, dokId: dId, seite: n, art, schichtId: sch ? sch.id : '', vorher, nachher, basis: sch ? kurzSum(textOcr(L(), dId, n)) : '', begruendung, regelId, autor: L().meta.bearbeiter, datum: heute(), zurueckgezogen: false });
    log('Textänderung erfasst (' + AEND[art] + ')', id, `Seite ${n}, ${st.length} ${st.length === 1 ? 'Stelle' : 'Stellen'}`);
    if (art === 'ocr') digitalBeruehrt(w);
    return id;
  }
  function edSpeichern() {
    const w = werk(S.view.id), E = S.ed, dok = dokId(E.dok), n = E.seite, sch = E.ebene && werk(E.ebene), art = sch ? 'fachlich' : 'ocr';
    const vorher = textSchicht(L(), dok.id, n, E.ebene), nachher = E.entwurf.replace(/\r/g, '');
    const st = stellen(diffWorte(vorher, nachher));
    if (!st.length) return meldung('Am Text wurde nichts geändert.');
    const rs = L().regeln.filter(r => r.werkId === w.id), vs = st.map(x => artVorschlag(x.alt, x.neu));
    const rat = art === 'ocr' && vs.includes('fachlich') ? 'Mindestens eine Stelle sieht nach einer fachlichen Änderung aus, zum Beispiel ein geänderter Zahlenwert. Fachliche Änderungen gehören in eine Schicht (Auswahl „Ich bearbeite“).' : art === 'fachlich' && vs.every(v => v === 'ocr') ? 'Die Änderung sieht nach einer OCR-Korrektur aus. Lesefehler berichtigt man im Grundtext.' : '';
    dialog(`${AEND[art]} auf Seite ${n} übernehmen`, `<dl class="altneu vorschau">${st.slice(0, 6).map(x => `<div><dt>Alt</dt><dd>${x.alt ? `<del class="${art === 'ocr' ? 'ocr' : 'fach'}">${h(x.alt)}</del>` : '–'}</dd><dt>Neu</dt><dd>${x.neu ? `<ins class="${art === 'ocr' ? 'ocr' : 'fach'}">${h(x.neu)}</ins>` : '–'}</dd></div>`).join('')}</dl>${st.length > 6 ? `<p class="hinweis">und ${st.length - 6} weitere Stellen</p>` : ''}
      ${rat ? `<p class="fehler-fest">${rat}</p>` : ''}
      ${bereich('begruendung', 'Begründung', art === 'ocr' ? 'Lesefehler der Texterkennung berichtigt.' : '', 'required')}
      ${art === 'fachlich' ? `<label>Betrifft Regel<select name="regelId">${opt([['', 'keine Regel']].concat(rs.map(r => [r.id, r.id + ' ' + r.titel])), '')}</select></label><p class="hinweis">Eine Änderung am Text allein ändert die Auslegung nicht. Dafür muss auch der Wert der Regel in ${h(sch.kurz)} angepasst sein.</p>` : ''}`, d => {
      const id = aendAnlegen(w, dok.id, n, art, sch, vorher, nachher, d.begruendung.trim(), d.regelId || '');
      E.edit = false; E.entwurf = ''; P.aktiv = id; if (E.ansicht === 'original') E.ansicht = 'hybrid';
    }, 'Übernehmen', true);
  }

  // ----- Drucken und PDF-Export
  function seitenListe(txt, max) { // "60-66, 70" -> [60..66, 70]
    const out = new Set(); String(txt || '').split(/[,;\s]+/).forEach(t => { const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(t.trim()); if (!m) return; const a = +m[1], b = m[2] ? +m[2] : a; for (let i = Math.min(a, b); i <= Math.max(a, b) && i <= max; i++) if (i >= 1) out.add(i); });
    return [...out].sort((a, b) => a - b);
  }
  const istEntwurf = (w, sch) => R.offen.some(e => e.werkId === w.id || (sch && e.werkId === sch.id));
  function verzeichnisHtml(w, ds, seitenFilter, mitKomm) {
    const aes = L().aenderungen.filter(a => ds.some(d => d.id === a.dokId) && !a.zurueckgezogen && seitenFilter(a)), anms = mitKomm === false ? [] : L().anmerkungen.filter(a => ds.some(d => d.id === a.dokId) && !a.zurueckgezogen && seitenFilter(a));
    if (!aes.length && !anms.length) return '<p>Keine Änderungen oder Anmerkungen.</p>';
    const teil = a => ds.length > 1 ? h((dokId(a.dokId) || {}).teil || '') + ', ' : '';
    return `<table class="dtab" border="1" cellspacing="0" cellpadding="3"><thead><tr><th>Nr.</th><th>Stelle</th><th>Art</th><th>Alt</th><th>Neu</th><th>Begründung</th><th>Von</th></tr></thead><tbody>
      ${aes.map(a => { const st = stellen(diffWorte(a.vorher, a.nachher)); return `<tr><td>Ä${a.nr}</td><td>${teil(a)}S. ${a.seite}</td><td>${AEND[a.art]}${a.schichtId && werk(a.schichtId) ? ', ' + h(werk(a.schichtId).kurz) : ''}${standVon(L(), 'aenderungen', a) === 'frei' ? '' : ' (nicht freigegeben)'}</td><td>${st.map(x => h(x.alt || '–')).join('<br>')}</td><td>${st.map(x => h(x.neu || '–')).join('<br>')}</td><td>${h(a.begruendung)}</td><td>${h(a.autor)}, ${datumCH(a.datum)}</td></tr>`; }).join('')}
      ${anms.map(a => `<tr><td>A${a.nr}</td><td>${teil(a)}S. ${a.seite}</td><td>${ANM[a.art]}${a.aendArt ? ', ' + AEND[a.aendArt] : ''}${standVon(L(), 'anmerkungen', a) === 'frei' ? '' : ' (nicht freigegeben)'}</td><td>${h(a.alt || (a.art !== 'aenderung' && a.zitat) || '')}</td><td>${h(a.neu || '')}</td><td>${h(a.text)}${antwortText(a).map(r => `<br>↳ ${h(r.autor)}, ${datumCH(r.datum)}: ${h(r.text)}`).join('')}</td><td>${h(a.autor)}, ${datumCH(a.datum)}</td></tr>`).join('')}</tbody></table>`;
  }
  function druckHtml(w, opt, fuerWord) {
    const E = S.ed, akt = dokId(E.dok), ds = opt.umfang === 'alles' ? dokus(w.id) : [akt], sch = E.ebene && werk(E.ebene), v = letzteVersion(L());
    const wahl = opt.umfang === 'seite' ? [E.seite] : opt.umfang === 'auswahl' ? seitenListe(opt.seiten, akt.seiten) : null;
    const namen = { original: 'Grundtext aus dem PDF', hybrid: 'Mit markierten Änderungen', neu: 'Neu (geltender Text)' }, entwurf = istEntwurf(w, sch);
    let html = `<header><h1>${h(w.kurz)}</h1><p class="dtitel">${h(w.titel)}</p>${entwurf && opt.ansicht !== 'original' ? '<p class="entwurf"><b>ENTWURF.</b> Enthält nicht freigegebene Änderungen.</p>' : `<p><b>${opt.ansicht === 'original' ? 'Grundtext ohne Änderungen.' : 'Freigegebene Fassung.'}</b></p>`}<p>Ansicht: ${namen[opt.ansicht]}. Ebene: ${sch ? h(sch.kurz) : 'Grundtext'}. Bibliothek ${v ? 'Version ' + v.nr + ' vom ' + datumCH(v.datum) : 'ohne Version'}. Ausgegeben am ${datumCH(heute())}${L().meta.bearbeiter ? ' von ' + h(L().meta.bearbeiter) : ''}.</p>${sch && ebeneVon(sch) === 'hersteller' && opt.ansicht !== 'original' ? '<p class="vermerk">Herstellernorm – keine behördliche Norm</p>' : ''}<p>${dstat(w) === 'freigegeben' ? `Digitale Fassung mit dem Original verglichen und freigegeben von ${h(w.digital.pruefer)} am ${datumCH(w.digital.datum)}.` : '<b>Ungeprüfte digitale Fassung:</b> noch nicht mit dem Original verglichen.'} Massgebend ist das Original-PDF.</p>${opt.ansicht === 'hybrid' ? LEGENDE : ''}</header>`;
    let anzahl = 0;
    ds.forEach(d => { const liste = wahl || Array.from({ length: d.seiten }, (_, i) => i + 1); if (ds.length > 1) html += `<h2 class="dteil">${h(d.teil || d.datei)}</h2>`; liste.forEach(n => { let t = seitenHtml(d, n, opt.ansicht, E.ebene, true); if (fuerWord) t = t.replace(/\n/g, '<br>'); anzahl++; html += `<section class="dseite"><h3>Seite ${n}</h3><div class="lesetext">${t.trim() ? t : '<i>kein erkannter Text</i>'}</div></section>`; }); });
    if (opt.verzeichnis) html += `<section class="dverz"><h2>Änderungsverzeichnis</h2>${verzeichnisHtml(w, ds, a => !wahl || wahl.includes(a.seite), opt.kommentare)}</section>`;
    return { html, anzahl };
  }
  const druckUmfang = opt => { const akt = dokId(S.ed.dok); return [opt.umfang === 'alles' ? dokus(akt.werkId) : [akt], opt.umfang === 'seite' ? [S.ed.seite] : opt.umfang === 'auswahl' ? seitenListe(opt.seiten, akt.seiten) : null]; };
  async function drucken(w, opt) {
    await schnitteLaden(...druckUmfang(opt));
    const { html } = druckHtml(w, opt, false), alt = document.getElementById('druck'); if (alt) alt.remove();
    const el = document.createElement('div'); el.id = 'druck'; el.innerHTML = html; document.body.appendChild(el); document.body.classList.add('druckt');
    setTimeout(() => window.print(), 60);
  }
  async function wordExport(w, opt) {
    await schnitteLaden(...druckUmfang(opt));
    const blob = docxAus(druckHtml(w, opt, true).html, w.kurz);
    herunterladenBlob(`${w.kurz.replace(/[^A-Za-z0-9äöüÄÖÜ-]+/g, '_')}_${opt.ansicht === 'neu' ? 'Fassung' : opt.ansicht === 'hybrid' ? 'mit_Aenderungen' : 'Grundtext'}.docx`, blob);
  }
  // ----- Word-Datei (.docx) ohne Zusatzbibliothek: die Druckansicht wird in WordprocessingML übersetzt und als ZIP (ohne Kompression) verpackt
  function zipOhneKompression(dateien) { // dateien: [{ name, bytes }]
    const T = zipOhneKompression.t || (zipOhneKompression.t = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
    const crc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const enc = new TextEncoder(), teile = [], zentral = []; let pos = 0;
    const kopf = (sig, f, extra) => { const n = enc.encode(f.name), k = new DataView(new ArrayBuffer(extra ? 46 : 30)); let o = 0; const u16 = v => { k.setUint16(o, v, true); o += 2; }, u32 = v => { k.setUint32(o, v, true); o += 4; };
      u32(sig); if (extra) u16(20); u16(20); u16(0x0800); u16(0); u16(0); u16(0x21); u32(f.crc); u32(f.bytes.length); u32(f.bytes.length); u16(n.length); u16(0); if (extra) { u16(0); u16(0); u16(0); u32(0); u32(f.pos); } return [new Uint8Array(k.buffer), n]; };
    dateien.forEach(f => { f.crc = crc(f.bytes); f.pos = pos; const [k, n] = kopf(0x04034b50, f, false); teile.push(k, n, f.bytes); pos += k.length + n.length + f.bytes.length; });
    const start = pos; dateien.forEach(f => { const [k, n] = kopf(0x02014b50, f, true); zentral.push(k, n); pos += k.length + n.length; });
    const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, dateien.length, true); e.setUint16(10, dateien.length, true); e.setUint32(12, pos - start, true); e.setUint32(16, start, true);
    return new Blob(teile.concat(zentral, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  function docxAus(html, titel) {
    const wurzel = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html').getElementById('r'), enc = new TextEncoder();
    const x = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), medien = [];
    const BLOCK = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'DIV', 'SECTION', 'HEADER', 'UL', 'OL', 'LI', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD']);
    const rPr = f => `<w:rPr>${f.sans ? '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' : ''}${f.b ? '<w:b/>' : ''}${f.i ? '<w:i/>' : ''}${f.strike ? '<w:strike/>' : ''}${f.farbe ? `<w:color w:val="${f.farbe}"/>` : ''}${f.gr ? `<w:sz w:val="${f.gr}"/><w:szCs w:val="${f.gr}"/>` : ''}${f.u ? '<w:u w:val="single"/>' : ''}${f.hg ? `<w:shd w:val="clear" w:color="auto" w:fill="${f.hg}"/>` : ''}</w:rPr>`;
    const lauf = (t, f) => t ? `<w:r>${rPr(f)}<w:t xml:space="preserve">${x(t)}</w:t></w:r>` : '';
    function stil(k, f) { // Format eines Elements
      const T = k.tagName, c = k.className || '', g = Object.assign({}, f);
      if (T === 'H1') Object.assign(g, { b: true, gr: 44, sans: true, pPr: '<w:pPr><w:spacing w:after="60"/></w:pPr>' });
      else if (T === 'H2') Object.assign(g, { b: true, gr: 28, sans: true, pPr: '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr>' });
      else if (T === 'H3') Object.assign(g, { gr: 18, sans: true, farbe: '555555', pPr: '<w:pPr><w:keepNext/><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="999999"/></w:pBdr><w:spacing w:before="240" w:after="60"/></w:pPr>' });
      else if (T === 'HEADER' || T === 'FIGCAPTION') Object.assign(g, { sans: true, gr: 18 });
      else if (T === 'B' || T === 'STRONG' || T === 'TH') g.b = true;
      else if (T === 'I' || T === 'EM') g.i = true;
      else if (T === 'INS') Object.assign(g, /\bocr\b/.test(c) ? { farbe: '173B7A', hg: 'D7E5FB', u: true } : { farbe: '0E4D27', hg: 'CFEFD8', u: true });
      else if (T === 'DEL') Object.assign(g, /\bocr\b/.test(c) ? { farbe: '5E6E88', hg: 'EDF1F7', strike: true } : { farbe: '8A1C14', hg: 'F9D5D1', strike: true });
      else if (T === 'MARK') g.hg = 'FFE9A8';
      if (/\bentwurf\b/.test(c)) Object.assign(g, { farbe: 'A8261D', gr: 24 });
      if (/\bdtitel\b/.test(c)) g.gr = 26;
      const m = /\bfv-(\w+)/.exec(c);
      if (m) { const rel = parseFloat((k.style && k.style.fontSize) || '1') || 1; if (/^(titel|u1|u2|u3)$/.test(m[1])) Object.assign(g, { b: true, sans: true, gr: Math.round(22 * rel), pPr: '<w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/></w:pPr>' }); else if (m[1] === 'tabelle' || m[1] === 'bild') Object.assign(g, { i: true, b: true }); else if (m[1] === 'fussnote') Object.assign(g, { gr: 18, farbe: '555555' }); else if (m[1] === 'liste') g.pPr = '<w:pPr><w:ind w:left="284"/></w:pPr>'; }
      return g;
    }
    function inline(k, f) { if (k.nodeType === 3) return lauf(k.nodeValue.replace(/\s+/g, ' '), f); if (k.nodeType !== 1) return ''; if (k.tagName === 'BR') return '<w:r><w:br/></w:r>'; if (k.tagName === 'BUTTON') return ''; const g = stil(k, f); return [...k.childNodes].map(c => inline(c, g)).join('') + (k.tagName === 'SPAN' && k.nextSibling && k.nextSibling.nodeType === 1 ? lauf('  ', f) : ''); }
    function tabelle(t) {
      const zeile = tr => `<w:tr>${[...tr.cells].map(c => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${c.colSpan > 1 ? `<w:gridSpan w:val="${c.colSpan}"/>` : ''}${c.tagName === 'TH' ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF1F5"/>' : ''}</w:tcPr>${block(c, { sans: true, gr: 18, b: c.tagName === 'TH', zelle: true }) || '<w:p/>'}</w:tc>`).join('')}</w:tr>`;
      return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(n => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="888888"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>${[...t.rows].map(zeile).join('')}</w:tbl><w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`;
    }
    function bild(img) {
      const m = /^data:image\/png;base64,(.+)$/.exec(img.getAttribute('src') || ''); if (!m) return `<w:p>${lauf('[' + (img.alt || 'Skizze') + ': im Original-PDF]', { i: true, farbe: '555555' })}</w:p>`;
      const bin = atob(m[1]), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dv = new DataView(bytes.buffer), pw = dv.getUint32(16), ph = dv.getUint32(20), VOLL = 5760000, HOCH = 7700000; // 16 cm breit, höchstens 21,4 cm hoch
      let cx = Math.round(VOLL * Math.min(1, Math.max(0.25, (+img.dataset.w || 88) / 88))), cy = Math.round(cx * ph / pw); if (cy > HOCH) { cx = Math.round(cx * HOCH / cy); cy = HOCH; }
      medien.push({ name: `word/media/bild${medien.length + 1}.png`, bytes }); const n = medien.length;
      return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="40"/>${img.dataset.ausr === 'mitte' ? '<w:jc w:val="center"/>' : img.dataset.ausr === 'rechts' ? '<w:jc w:val="right"/>' : ''}</w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Bild ${n}" descr="${x((img.alt || '').slice(0, 250))}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="bild${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    }
    function block(el, f) { // Kinder eines Elements: Zeilen und Blöcke werden Absätze
      let out = '', buf = ''; const ab = () => { if (buf) out += `<w:p>${f.pPr || (f.zelle ? '<w:pPr><w:spacing w:after="0"/></w:pPr>' : '')}${buf}</w:p>`; buf = ''; };
      [...el.childNodes].forEach(k => {
        if (k.nodeType === 3) { buf += lauf(k.nodeValue.replace(/\s+/g, ' '), f); return; }
        if (k.nodeType !== 1) return; const T = k.tagName;
        if (T === 'BR') return ab();
        if (T === 'TABLE') { ab(); out += tabelle(k); return; }
        if (T === 'IMG') { ab(); out += bild(k); return; }
        if (BLOCK.has(T) || (T === 'SPAN' && /\bfv\b/.test(k.className))) { ab(); out += block(k, Object.assign(stil(k, Object.assign({}, f, { pPr: '' })), {})); return; }
        buf += inline(k, f);
      });
      ab(); return out;
    }
    const koerper = block(wurzel, {});
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"', X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const dateien = [
      ['[Content_Types].xml', `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
      ['_rels/.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
      ['docProps/core.xml', `${X}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${x(titel)}</dc:title><dc:creator>Normenbibliothek</dc:creator></cp:coreProperties>`],
      ['word/styles.xml', `${X}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:cs="Cambria"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="de-CH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/></w:style></w:styles>`],
      ['word/_rels/document.xml.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${medien.map((m, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/bild${i + 1}.png"/>`).join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['word/document.xml', `${X}<w:document ${NS}><w:body>${koerper}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`],
    ].map(([name, t]) => ({ name, bytes: enc.encode(t) }));
    return zipOhneKompression(dateien.concat(medien));
  }
  window.addEventListener('afterprint', () => { const el = document.getElementById('druck'); if (el) el.remove(); document.body.classList.remove('druckt'); });
  async function pdfExport(w, opt) {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib, out = await PDFDocument.create(), v = letzteVersion(L());
    const font = await out.embedFont(StandardFonts.Helvetica), fett = await out.embedFont(StandardFonts.HelveticaBold);
    const rein = t => String(t == null ? '' : t).replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/\s+/g, ' ').replace(/[^ -~ -ÿ‚„…†‡‰Š‹ŒŽ‘’“”•–—™š›œžŸ€]/g, '?');
    const FARBE = { tinte: rgb(0.09, 0.13, 0.18), leise: rgb(0.34, 0.38, 0.45), rot: rgb(0.66, 0.15, 0.11), gruen: rgb(0.11, 0.42, 0.25), blau: rgb(0.11, 0.25, 0.48) };
    let page, y; const B = 595.28, H = 841.89, L0 = 56, W = B - 2 * L0;
    const neu = kopfzeile => { page = out.addPage([B, H]); y = H - 56; if (kopfzeile) { page.drawText(rein(kopfzeile), { x: L0, y: H - 34, size: 8, font, color: FARBE.leise }); page.drawLine({ start: { x: L0, y: H - 40 }, end: { x: B - L0, y: H - 40 }, thickness: 0.5, color: FARBE.leise }); } return page; };
    let kz = '';
    const zeile = (txt, o = {}) => {
      const f = o.fett ? fett : font, g = o.g || 10, ein = o.ein || 0, breite = W - ein, lines = []; let cur = '';
      rein(txt).split(' ').forEach(wort => { while (f.widthOfTextAtSize(wort, g) > breite) { let k = wort.length; while (k > 1 && f.widthOfTextAtSize(wort.slice(0, k), g) > breite) k--; if (cur) { lines.push(cur); cur = ''; } lines.push(wort.slice(0, k)); wort = wort.slice(k); } const t = cur ? cur + ' ' + wort : wort; if (f.widthOfTextAtSize(t, g) > breite) { lines.push(cur); cur = wort; } else cur = t; });
      if (cur) lines.push(cur);
      lines.forEach(l => { if (y < 60) neu(kz); page.drawText(l, { x: L0 + ein, y, size: g, font: f, color: o.farbe || FARBE.tinte }); y -= g * 1.42; });
    };
    const wahl = opt.seiten && opt.seiten.length ? opt.seiten : null, ds = (wahl ? [dokId(S.ed.dok)] : dokus(w.id)).filter(pdfDa), g = hg(w.herausgeberId), inWahl = a => !wahl || wahl.includes(a.seite);
    const aesAlle = L().aenderungen.filter(a => ds.some(d => d.id === a.dokId) && !a.zurueckgezogen && inWahl(a)), anmAlle = L().anmerkungen.filter(a => ds.some(d => d.id === a.dokId) && !a.zurueckgezogen && inWahl(a));
    const artText = a => AEND[a.art] + (a.schichtId && werk(a.schichtId) ? ', ' + werk(a.schichtId).kurz : '') + (standVon(L(), 'aenderungen', a) === 'frei' ? '' : ' (nicht freigegeben)');
    const eintrag = a => { zeile(`Ä${a.nr}  ${artText(a)}`, { fett: true }); stellen(diffWorte(a.vorher, a.nachher)).forEach(x => { zeile('Alt: ' + (x.alt || '–'), { ein: 14, farbe: FARBE.rot }); zeile('Neu: ' + (x.neu || '–'), { ein: 14, farbe: a.art === 'ocr' ? FARBE.blau : FARBE.gruen }); }); zeile('Begründung: ' + a.begruendung, { ein: 14 }); zeile(`${a.autor}, ${datumCH(a.datum)}`, { ein: 14, g: 8, farbe: FARBE.leise }); y -= 6; };
    const notiz = a => { zeile(`A${a.nr}  ${ANM[a.art]}${a.rect ? '' : ' zur ganzen Seite'}${standVon(L(), 'anmerkungen', a) === 'frei' ? '' : ' (nicht freigegeben)'}`, { fett: true }); if (a.alt) zeile('Alt: ' + a.alt, { ein: 14, farbe: FARBE.rot }); if (a.neu) zeile('Neu: ' + a.neu, { ein: 14, farbe: a.aendArt === 'ocr' ? FARBE.blau : FARBE.gruen }); if (a.zitat && a.art !== 'aenderung') zeile('Markiert: ' + a.zitat, { ein: 14, farbe: FARBE.leise }); zeile(a.text, { ein: 14 }); zeile(`${a.autor}, ${datumCH(a.datum)}`, { ein: 14, g: 8, farbe: FARBE.leise }); antwortText(a).forEach(r => { zeile('Antwort: ' + r.text, { ein: 28 }); zeile(`${r.autor}, ${datumCH(r.datum)}`, { ein: 28, g: 8, farbe: FARBE.leise }); }); y -= 6; };
    if (opt.deckblatt) {
      neu(''); zeile('Normenbibliothek, Export mit Änderungen', { g: 9, farbe: FARBE.leise }); y -= 14; zeile(w.kurz, { fett: true, g: 26 }); y -= 4; zeile(w.titel, { g: 13 }); y -= 16;
      [['Herausgeber', g.name], ['Ausgabe', w.ausgabe], ['Stand der Bibliothek', v ? `Version ${v.nr} vom ${datumCH(v.datum)}` + (R.offen.length ? ', mit nicht freigegebenen Änderungen' : '') : 'keine Version'], ['Exportiert', datumCH(heute()) + (L().meta.bearbeiter ? ' von ' + L().meta.bearbeiter : '')], ['Umfang', `${wahl ? wahl.length : ds.reduce((x, d) => x + d.seiten, 0)} Originalseiten, ${aesAlle.length} ${aesAlle.length === 1 ? 'Textänderung' : 'Textänderungen'}, ${anmAlle.length} ${anmAlle.length === 1 ? 'Anmerkung' : 'Anmerkungen'}`]].filter(x => x[1]).forEach(x => zeile(x[0] + ': ' + x[1]));
      if (istEntwurf(w, null) || aesAlle.some(a => standVon(L(), 'aenderungen', a) !== 'frei')) { y -= 8; zeile('ENTWURF. Enthält nicht freigegebene Änderungen.', { fett: true, g: 13, farbe: FARBE.rot }); }
      zeile(dstat(w) === 'freigegeben' ? `Digitale Fassung geprüft von ${w.digital.pruefer} am ${datumCH(w.digital.datum)}.` : 'Digitale Fassung ungeprüft: Text und Änderungen sind noch nicht mit dem Original verglichen.');
      y -= 12; zeile('Die Originalseiten sind unverändert übernommen. Dieses Deckblatt' + (opt.blaetter ? ', die eingefügten Änderungsblätter' : '') + (opt.marken ? ' und die farbigen Rahmen mit Nummern' : '') + ' gehören nicht zum Original.', { fett: true });
      if (aesAlle.some(a => a.schichtId && werk(a.schichtId) && ebeneVon(werk(a.schichtId)) === 'hersteller')) { y -= 6; zeile('Enthält Herstellernorm – keine behördliche Norm.', { fett: true, farbe: FARBE.rot }); }
      y -= 16; kz = `${w.kurz}, Änderungsverzeichnis`; zeile('Änderungsverzeichnis', { fett: true, g: 14 }); y -= 6;
      if (!aesAlle.length && !anmAlle.length) zeile('Keine Änderungen oder Anmerkungen.');
      ds.forEach(d => { const a1 = aesAlle.filter(a => a.dokId === d.id), a2 = anmAlle.filter(a => a.dokId === d.id); if (!a1.length && !a2.length) return; if (ds.length > 1) { zeile(d.teil || d.datei, { fett: true, g: 11 }); y -= 2; } a1.concat(a2).sort((a, b) => a.seite - b.seite).forEach(a => zeile(`Seite ${a.seite}: ${a.vorher != null ? 'Ä' + a.nr + ' ' + artText(a) + ', ' + a.begruendung : 'A' + a.nr + ' ' + ANM[a.art] + ', ' + a.text}`, { ein: 8, g: 9 })); y -= 6; });
    }
    for (const d of ds) {
      const src = await PDFDocument.load(await pdfBytes(d), { ignoreEncryption: true }), idx = wahl ? wahl.filter(n => n <= src.getPageCount()).map(n => n - 1) : src.getPageIndices(), seiten = await out.copyPages(src, idx);
      seiten.forEach((p, i) => {
        const n = idx[i] + 1, a1 = aesAlle.filter(a => a.dokId === d.id && a.seite === n), a2 = anmAlle.filter(a => a.dokId === d.id && a.seite === n);
        out.addPage(p);
        if (opt.marken) { const { width, height } = p.getSize(); a2.filter(a => a.rect).forEach(a => { const c = a.art === 'frage' ? FARBE.rot : a.art === 'aenderung' ? rgb(0.78, 0.37, 0) : FARBE.blau, x = a.rect.x * width, yy = height - (a.rect.y + a.rect.h) * height; if (a.rects && a.rects.length) a.rects.forEach(z => p.drawRectangle({ x: z.x * width, y: height - (z.y + z.h) * height, width: z.w * width, height: z.h * height, color: c, opacity: 0.22 })); else p.drawRectangle({ x, y: yy, width: a.rect.w * width, height: a.rect.h * height, borderColor: c, borderWidth: 1.2, color: c, opacity: 0.1, borderOpacity: 1 }); p.drawRectangle({ x, y: yy + a.rect.h * height, width: 22, height: 11, color: c }); p.drawText('A' + a.nr, { x: x + 3, y: yy + a.rect.h * height + 2.5, size: 8, font: fett, color: rgb(1, 1, 1) }); }); }
        if (opt.blaetter && (a1.length || a2.length)) { kz = `${w.kurz}${ds.length > 1 ? ', ' + (d.teil || d.datei) : ''}: Änderungen zu Seite ${n}. Eingefügtes Blatt, kein Bestandteil des Originals.`; neu(kz); zeile(`Änderungen zu Seite ${n}`, { fett: true, g: 15 }); y -= 8; a1.forEach(eintrag); a2.forEach(notiz); }
      });
    }
    out.setTitle(rein(`${w.kurz} mit Änderungen`)); out.setCreator('Normenbibliothek ' + PROGRAMM);
    const bytes = await out.save();
    herunterladenBlob(`${w.kurz.replace(/[^A-Za-z0-9äöüÄÖÜ-]+/g, '_')}_mit_Aenderungen${v ? '_v' + v.nr : ''}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
    return out.getPageCount();
  }

  // ----- Glossar: Abkürzungen und Begriffe je Norm
  function glossarZeilen() {
    const q = (S.gq || '').trim().toLowerCase();
    const ein = L().glossar.filter(g => !q || (g.begriff + ' ' + g.bedeutung).toLowerCase().includes(q)).sort((a, b) => a.begriff.localeCompare(b.begriff, 'de') || L().werke.findIndex(w => w.id === a.werkId) - L().werke.findIndex(w => w.id === b.werkId));
    if (!ein.length) return '<tr><td colspan="5" class="leer">Kein Begriff entspricht der Suche.</td></tr>';
    let vor = '';
    return ein.map(g => { const w = werk(g.werkId), d = g.dokId && dokId(g.dokId), erst = g.begriff !== vor; vor = g.begriff;
      return `<tr class="${g.zurueckgezogen ? 'weg' : ''}${erst ? ' erst' : ''}" id="g-${h(g.id)}"><th scope="row">${erst ? h(g.begriff) : ''}</th><td>${h(g.bedeutung)}</td><td>${w ? `<a href="#" data-act="${d && g.seite ? 'pdf-seite' : 'werk'}" data-id="${h(w.id)}"${d ? ` data-dok="${h(d.id)}"` : ''} data-seite="${h(g.seite || '')}">${h(w.kurz)}${g.seite ? ', S. ' + h(g.seite) : ''}</a>` : 'ohne Quelle'}</td><td>${g.geprueft ? marke('am Original geprüft', 'ok') : marke('zu bestätigen', 'warn')}${g.herkunft === 'text' ? marke('aus dem Lauftext erkannt', 'entwurf') : ''}${standMarke('glossar', g)}${g.zurueckgezogen ? marke('zurückgezogen', 'weg') : ''}</td><td class="tat"><button class="klein" data-act="glossar-edit" data-id="${h(g.id)}">bearbeiten</button><button class="klein" data-act="glossar-pruef" data-id="${h(g.id)}">${g.geprueft ? 'Prüfvermerk entfernen' : 'geprüft'}</button><button class="klein" data-act="glossar-weg" data-id="${h(g.id)}">${standVon(L(), 'glossar', g) === 'neu' ? 'löschen' : g.zurueckgezogen ? 'wieder aufnehmen' : 'zurückziehen'}</button></td></tr>`; }).join('');
  }
  function glossarAnsicht() {
    const n = new Set(L().glossar.map(g => g.begriff)).size;
    return `<section class="blatt weit"><header class="dashkopf"><div><h2>Glossar</h2><p class="lead">${n} Abkürzungen und Begriffe mit ${L().glossar.length} Bedeutungen aus den Verzeichnissen der Normen. Derselbe Begriff kann je Norm anders erklärt sein; jede Bedeutung nennt ihre Quelle.</p></div><button class="haupt" data-act="glossar-neu">Begriff erfassen</button></header>
      <div class="filter"><label><span class="sr">Glossar durchsuchen</span><input type="search" id="gq" value="${h(S.gq || '')}" placeholder="Abkürzung oder Bedeutung suchen"></label></div>
      <div class="rollen"><table class="tabelle glossar"><thead><tr><th>Begriff</th><th>Bedeutung</th><th>Quelle</th><th>Stand</th><th><span class="sr">Aktionen</span></th></tr></thead><tbody id="glossarbody">${glossarZeilen()}</tbody></table></div></section>`;
  }
  function glossarForm(g) {
    const x = g || { begriff: '', bedeutung: '', werkId: '', seite: '' };
    dialog(g ? 'Glossareintrag bearbeiten' : 'Begriff erfassen', `<div class="zwei">${feld('begriff', 'Abkürzung oder Begriff', x.begriff, 'required')}<label>Quelle<select name="werkId">${opt([['', 'ohne Quelle']].concat(L().werke.map(w => [w.id, w.kurz])), x.werkId)}</select></label></div>
      ${bereich('bedeutung', 'Bedeutung', x.bedeutung, 'required')}${feld('seite', 'PDF-Seite der Fundstelle', x.seite || '')}`, d => {
      const neu = { begriff: d.begriff.trim(), bedeutung: d.bedeutung.replace(/\s+/g, ' ').trim(), werkId: d.werkId, seite: d.seite.trim() }, dk = dokVon(d.werkId);
      neu.dokId = dk ? ((g && g.werkId === d.werkId && g.dokId) || dk.id) : '';
      if (g) { if (['begriff', 'bedeutung', 'werkId', 'seite'].every(k => String(g[k] || '') === neu[k])) return 'Es wurde nichts geändert.'; Object.assign(g, neu, { geprueft: null, autor: L().meta.bearbeiter, datum: heute() }); log('Glossareintrag geändert', g.id, neu.begriff); }
      else { const id = uid('g'); L().glossar.push(Object.assign({ id, geprueft: null, autor: L().meta.bearbeiter, datum: heute(), zurueckgezogen: false }, neu)); log('Glossareintrag erfasst', id, neu.begriff); }
    }, g ? 'Übernehmen' : 'Erfassen');
  }

  function haupt() {
    const v = S.view;
    if (v.typ === 'werk' && werk(v.id)) return werkAnsicht(werk(v.id));
    if (v.typ === 'fassung') return fassungAnsicht();
    if (v.typ === 'verlauf') return verlaufAnsicht();
    if (v.typ === 'offen') return offenAnsicht();
    if (v.typ === 'glossar') return glossarAnsicht();
    if (v.typ === 'index') return indexAnsicht();
    if (v.typ === 'pruefung') return pruefAnsicht();
    if (v.typ === 'stellen' && werk(v.id)) return stellenAnsicht(werk(v.id));
    if (v.typ === 'suche') return suchAnsicht();
    return start();
  }
  function render() {
    const app = $('#app');
    if (!$('#dlg')) app.innerHTML = '<div id="rahmen"></div><dialog id="dlg"></dialog>';
    if (!S.lib) { $('#rahmen').innerHTML = startschirm(); return; }
    const alt = $('#pdfanm'), st = alt ? alt.scrollTop : 0;
    R.offen = offeneEintraege();
    $('#rahmen').innerHTML = '<div class="spalten">' + leiste() + '<div class="arbeit">' + kopf() + '<main id="haupt" tabindex="-1">' + haupt() + '</main></div></div>';
    if ($('#pdfanm')) $('#pdfanm').scrollTop = st;
    if ($('#pdfseiten')) pdfMount();
    schnitteMount(); mStatus(); vglMount();
    if ($('.deckel[data-fehlt]')) titelbilderNachholen();
    document.title = (S.dirty ? '• ' : '') + L().meta.titel;
  }

  // ----- Formulare
  function regelForm(r, vorgabe) {
    const neu = !r, w = werk(neu ? vorgabe.werkId : r.werkId), layer = istSchicht(w), x = r || vorgabe;
    const body = `<div class="zwei">${feld('abschnitt', 'Abschnitt', x.abschnitt || '')}${feld('pdfSeite', 'PDF-Seite', x.pdfSeite || '')}</div>
      ${dokus(w.id).length > 1 ? `<label>Die PDF-Seite liegt in<select name="dokId">${opt(dokus(w.id).map(q => [q.id, q.teil || q.datei]), x.dokId || dokus(w.id)[0].id)}</select></label>` : ''}
      <label>Thema<select name="thema">${opt(L().themen, x.thema || 'geltung')}</select></label>
      ${feld('titel', 'Titel', x.titel || '', 'required')}${x.art === 'aufheben' ? '' : bereich('text', x.art === 'kommentar' ? 'Kommentar' : 'Regel in eigenen Worten', x.text || '', 'required')}
      ${x.art === 'kommentar' || x.art === 'aufheben' ? '' : paramFelder(x.params)}
      ${feld('quelle', 'Quelle oder Fundstelle', x.quelle || '')}
      ${bereich('begruendung', neu && !layer ? 'Bemerkung zur Erfassung' : 'Begründung der Änderung', neu ? (x.begruendung || '') : '', neu && !layer ? '' : 'required')}`;
    dialog(neu ? (layer ? 'Eintrag in ' + w.kurz : 'Regel in ' + w.kurz + ' erfassen') : r.id + ' bearbeiten', body, d => {
      const daten = { abschnitt: d.abschnitt.trim(), pdfSeite: d.pdfSeite.trim(), thema: d.thema, titel: d.titel.trim(), text: (d.text || '').trim(), params: 'pk0' in d ? leseParams(d) : [], quelle: d.quelle.trim(), dokId: 'dokId' in d ? d.dokId : (x.dokId || '') };
      if (neu) {
        const pre = w.kurz.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); let n = 1, id;
        do { id = `${pre}-${(daten.abschnitt.split(/[ ,/]/)[0] || 'X')}-${String(n++).padStart(2, '0')}`; } while (regel(id));
        L().regeln.push(Object.assign({ id, werkId: w.id, art: x.art || (layer ? 'ergaenzen' : 'regel'), geprueft: null, zielId: x.zielId || '', basisRev: x.basisRev || 0, begruendung: d.begruendung.trim(), autor: L().meta.bearbeiter, datum: heute(), rev: 1, zurueckgezogen: false }, daten));
        log(layer ? 'Eintrag erfasst (' + ARTEN[x.art || 'ergaenzen'] + ')' : 'Regel erfasst', id, d.begruendung.trim());
        const an = x.anmId && L().anmerkungen.find(a => a.id === x.anmId); if (an) an.regelId = id;
        S.view = { typ: 'werk', id: w.id }; S.tab = 'regeln';
      } else {
        const alt = JSON.stringify({ a: r.abschnitt, s: r.pdfSeite, th: r.thema, t: r.titel, x: r.text, p: r.params, q: r.quelle });
        Object.assign(r, daten); r.rev++; if (r.geprueft) r.geprueft = null;
        if (layer) r.begruendung = d.begruendung.trim();
        if (alt === JSON.stringify({ a: r.abschnitt, s: r.pdfSeite, th: r.thema, t: r.titel, x: r.text, p: r.params, q: r.quelle }) && !layer) { r.rev--; return 'Es wurde nichts geändert.'; }
        log('Regel geändert', r.id, d.begruendung.trim());
      }
    }, neu ? 'Erfassen' : 'Änderung übernehmen', true);
  }
  function abweichungForm(r) {
    const schichten = L().werke.filter(w => istSchicht(w) && w.basisId === r.werkId);
    if (!schichten.length) return dialog('Keine Schicht vorhanden', `<p>Für ${h(werk(r.werkId).kurz)} gibt es noch keine Schicht. Zuerst über „Norm oder Schicht anlegen“ eine kantonale Schicht oder eine Hersteller-Schicht mit dieser Basisnorm anlegen.</p>`);
    dialog('Abweichung zu ' + r.id, `<p class="hinweis">Die Norm selbst bleibt unverändert. Der Eintrag wird in der gewählten Schicht gespeichert.</p>
      <label>Schicht<select name="schicht">${opt(schichten.map(w => [w.id, w.kurz]), schichten[0].id)}</select></label>
      <label>Art<select name="art">${opt([['aendern', 'ändern: anderer Wert'], ['aufheben', 'aufheben: Regel gilt nicht'], ['kommentar', 'Kommentar: ohne Einfluss auf die Rechnung']], 'aendern')}</select></label>`, d => {
      setTimeout(() => regelForm(null, { werkId: d.schicht, art: d.art, zielId: r.id, basisRev: r.rev, thema: r.thema, titel: d.art === 'kommentar' ? '' : r.titel, text: d.art === 'aendern' ? r.text : '', params: d.art === 'aendern' ? JSON.parse(JSON.stringify(r.params)) : [], abschnitt: '', pdfSeite: '' }), 0);
    }, 'Weiter');
  }
  function werkForm(w) {
    const x = w || { kurz: '', titel: '', herausgeberId: L().herausgeber[0].id, art: 'norm', ausgabe: '', inKraft: '', status: 'gültig', geltung: '', basisId: '', gebiet: '', gruppe: '', notiz: '' };
    dialog(w ? w.kurz + ' bearbeiten' : 'Norm oder Schicht anlegen', `<div class="zwei">${feld('kurz', 'Kurzbezeichnung', x.kurz, 'required placeholder="z. B. TWP 1984"')}<label>Herausgeber<select name="herausgeberId">${opt(L().herausgeber.map(g => [g.id, g.kurz]), x.herausgeberId)}</select></label></div>
      ${feld('titel', 'Titel', x.titel, 'required')}
      <div class="zwei"><label>Art<select name="art">${opt([['norm', 'Norm'], ['produktanforderung', 'Produktanforderung (gilt unter jeder Norm)'], ['unterlage', 'Weisung, Merkblatt oder Unterlage (ohne Regelwerk)'], ['schicht', 'Schicht mit Abweichungen (Kanton oder Hersteller)']], x.art)}</select></label><label>Basisnorm (nur für Schichten)<select name="basisId">${opt([['', 'keine']].concat(L().werke.filter(n => n.art === 'norm').map(n => [n.id, n.kurz])), x.basisId)}</select></label></div>
      <div class="zwei">${feld('ausgabe', 'Ausgabe vom', x.ausgabe)}${feld('inKraft', 'In Kraft seit', x.inKraft)}</div>
      <div class="zwei">${feld('status', 'Status', x.status, 'list="statusliste"')}<datalist id="statusliste"><option>gültig</option><option>teilweise aufgehoben</option><option>aufgehoben</option><option>Entwurf</option></datalist>${feld('gebiet', 'Gebiet (Kanton, Gemeinden)', x.gebiet)}</div>
      ${feld('gruppe', 'Gruppe in der Seitenleiste', x.gruppe || '', 'list="gruppenliste"')}<datalist id="gruppenliste">${[...new Set(L().werke.map(n => n.gruppe).filter(Boolean))].map(n => `<option>${h(n)}</option>`).join('')}</datalist>
      ${bereich('geltung', 'Geltungsbereich', x.geltung)}${bereich('notiz', 'Bemerkung', x.notiz)}`, d => {
      if (d.art === 'schicht' && !d.basisId) return 'Eine Schicht braucht genau eine Basisnorm.';
      if (d.art !== 'schicht') d.basisId = '';
      Object.keys(d).forEach(k => { d[k] = d[k].trim(); });
      if (w) { Object.assign(w, d); log('Angaben geändert', w.id); }
      else {
        const id = uid('w'); L().werke.push(Object.assign({ id }, d)); log('Werk angelegt', id, d.kurz);
        if (d.art === 'schicht') { L().verknuepfungen.push({ id: uid('v'), von: id, typ: 'abgeleitet', nach: d.basisId, bereich: 'ganze Weisung', notiz: '' }); }
        S.view = { typ: 'werk', id }; S.tab = 'regeln';
      }
    }, w ? 'Übernehmen' : 'Anlegen', true);
  }
  function hgForm(g) {
    const x = g || { name: '', kurz: '', art: 'bund', land: 'CH', notiz: '' };
    dialog(g ? g.kurz + ' bearbeiten' : 'Herausgeber anlegen', `${feld('kurz', 'Kurzbezeichnung', x.kurz, 'required placeholder="z. B. Kanton Aargau"')}${feld('name', 'Voller Name', x.name, 'required')}
      <div class="zwei"><label>Art<select name="art">${opt([['bund', 'Bundesbehörde'], ['kanton', 'Kanton oder Gemeinde'], ['hersteller', 'Hersteller'], ['ausland', 'Ausländische Normstelle']], x.art)}</select></label>${feld('land', 'Land', x.land)}</div>${bereich('notiz', 'Bemerkung', x.notiz)}`, d => {
      Object.keys(d).forEach(k => { d[k] = d[k].trim(); });
      if (g) { Object.assign(g, d); log('Herausgeber geändert', g.id); } else { const id = uid('h'); L().herausgeber.push(Object.assign({ id }, d)); log('Herausgeber angelegt', id, d.kurz); }
    }, g ? 'Übernehmen' : 'Anlegen');
  }
  function linkForm(w) {
    dialog('Verknüpfung von ' + w.kurz, `<label>${h(w.kurz)} …<select name="typ">${opt(Object.keys(TYPEN).map(k => [k, TYPEN[k][0]]), 'verweist')}</select></label>
      <label>… diese Norm<select name="nach">${opt(L().werke.filter(n => n.id !== w.id).map(n => [n.id, n.kurz]), '')}</select></label>
      ${feld('bereich', 'Betroffener Bereich', '', 'placeholder="z. B. Kapitel 4 oder ganze Weisung"')}${feld('notiz', 'Bemerkung', '')}`, d => {
      const v = { id: uid('v'), von: w.id, typ: d.typ, nach: d.nach, bereich: d.bereich.trim(), notiz: d.notiz.trim() };
      L().verknuepfungen.push(v); log('Verknüpfung erfasst', w.id, TYPEN[v.typ][0] + ' ' + werk(v.nach).kurz);
    }, 'Verknüpfen');
  }
  function importForm(w) {
    const vorhanden = L().abschnitte.some(a => a.werkId === w.id);
    dialog('Originaltext von ' + w.kurz + ' einlesen', `${vorhanden ? '<p class="fehler-fest">Es ist bereits ein Text eingelesen. Neues Einlesen ersetzt ihn vollständig.</p>' : ''}
      <p class="hinweis">Textdatei (.md oder .txt) wählen oder Text einfügen. Markierungen „## PDF-Seite 12“ werden als Seitenzahl übernommen.</p>
      <label>Datei<input type="file" name="datei" accept=".md,.txt,text/plain,text/markdown"></label>
      ${bereich('text', 'oder Text einfügen', '')}
      <label>Aufteilen nach<select name="modus">${opt([['nummern', 'nummerierten Abschnitten (2.6, 3.14 …)'], ['ueberschriften', 'Markdown-Überschriften'], ['seiten', 'Seiten']], 'nummern')}</select></label>`, (d, form) => {
      const fertig = (txt, name) => {
        const teile = teileText(txt, d.modus);
        if (!teile.length) { const f = $('.fehler', $('#dlg')); f.textContent = 'Im Text wurden keine Abschnitte gefunden. Andere Aufteilung wählen.'; f.hidden = false; return; }
        L().abschnitte = L().abschnitte.filter(a => a.werkId !== w.id).concat(teile.map((t, i) => Object.assign({ id: w.id + '-a' + (i + 1), werkId: w.id }, t)));
        w.import = { datum: heute(), name: L().meta.bearbeiter, datei: name, pruefsumme: sha256(txt), abschnitte: teile.length };
        log('Originaltext eingelesen', w.id, `${teile.length} Abschnitte aus ${name}`);
        S.view = { typ: 'werk', id: w.id }; S.tab = 'text'; $('#dlg').close(); render();
      };
      const file = d.datei && d.datei.size ? d.datei : null;
      if (file) { file.text().then(t => fertig(t, file.name)); return false; }
      if (!d.text.trim()) return 'Datei wählen oder Text einfügen.';
      fertig(d.text, 'eingefügter Text'); return false;
    }, 'Einlesen', true);
  }

  // ----- Datei
  function teileDaten() { // drei Dateien: Bearbeitungsstand, Texte aus den PDF, Titelbilder
    const l = L(), kern = {}; Object.keys(l).forEach(k => { if (!['seitentext', 'abschnitte', 'struktur', 'titelbilder', 'elemente', 'unsicher', 'ocr', 'vorschlaege'].includes(k)) kern[k] = l[k]; });
    return { 'daten/bibliothek.json': JSON.stringify(kern, null, 1), 'daten/texte.json': JSON.stringify({ seitentext: l.seitentext, abschnitte: l.abschnitte, struktur: l.struktur, elemente: l.elemente, unsicher: l.unsicher, ocr: l.ocr, vorschlaege: l.vorschlaege }), 'daten/titelbilder.json': JSON.stringify(l.titelbilder) };
  }
  function herunterladen(name, text, typ) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: typ })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function speichern() {
    if (M.an) {
      if (!M.hat && !(await sperreHolen(false))) return;
      for (const [id, bytes] of A.neuPdf) { const d = dokId(id); if (!d) continue; const r = await fetch('api/pdf?pfad=' + encodeURIComponent(d.pfad), { method: 'PUT', body: bytes, credentials: 'same-origin' }); if (!r.ok && r.status !== 409) { let j = {}; try { j = await r.json(); } catch (e) { /* leer */ } return meldung('Das PDF liess sich nicht ablegen: ' + (j.fehler || r.status)); } }
      A.neuPdf.clear();
      for (const [pfad, bytes] of A.neuBild) { if (!L().uebernahmen.some(u => u.bild && u.bild.pfad === pfad)) continue; const r = await fetch('api/bild?pfad=' + encodeURIComponent(pfad), { method: 'PUT', body: bytes, credentials: 'same-origin' }); if (!r.ok && r.status !== 409) { let j = {}; try { j = await r.json(); } catch (e) { /* leer */ } return meldung('Das Bild liess sich nicht ablegen: ' + (j.fehler || r.status)); } }
      A.neuBild.clear();
      const t = teileDaten(), dateien = {}; Object.keys(t).forEach(p => { if (t[p] !== M.geladen[p]) dateien[p] = t[p]; });
      const r = await ruf('api/daten', 'PUT', { revision: M.revision, dateien });
      if (!r.ok) { if (r.status === 423) { M.hat = false; mStatus(); } return meldung('Nicht gespeichert: ' + (r.j.fehler || 'Fehler ' + r.status) + (r.status === 409 || r.status === 423 ? ' Unter „Daten“ lässt sich der eigene Stand als Datensicherung herunterladen.' : '')); }
      M.revision = r.j.revision; Object.assign(M.geladen, dateien); S.dirty = false; render(); return meldung(`Gespeichert auf dem Server (Stand ${M.revision}).`);
    }
    if (!A.dir) { herunterladen('bibliothek.json', teileDaten()['daten/bibliothek.json'], 'application/json'); return meldung('Ohne verbundenen Ordner lässt sich nicht direkt speichern. Die Datei bibliothek.json wurde heruntergeladen; sie gehört in den Ordner „daten“.' + (A.neuPdf.size ? ' Neu hinzugefügte PDF und neu gelesene Texte sind darin nicht enthalten.' : '') + (A.neuBild.size ? ' Neu eingefügte Bilder sind darin nicht enthalten.' : '')); }
    try {
      for (const [id, bytes] of A.neuPdf) { const d = dokId(id); if (d) await schreibe(d.pfad, bytes); }
      A.neuPdf.clear();
      for (const [pfad, bytes] of A.neuBild) if (L().uebernahmen.some(u => u.bild && u.bild.pfad === pfad)) await schreibe(pfad, bytes);
      A.neuBild.clear();
      const t = teileDaten(); for (const p of Object.keys(t)) await schreibe(p, t[p]);
      S.dirty = false; render(); meldung('Gespeichert im Ordner „' + A.dir.name + '“.');
    } catch (e) { meldung('Speichern fehlgeschlagen: ' + (e.message || e)); }
  }
  async function ladeBibliothek() {
    const roh = {}, lies = async p => (roh[p] = await liesText(p));
    let st = M.an ? await ruf('api/stand') : null;
    const bib = JSON.parse(await lies('daten/bibliothek.json')); let texte = {}, bilder = {};
    try { texte = JSON.parse(await lies('daten/texte.json')); } catch (e) { /* ohne Texte weiter */ }
    try { bilder = JSON.parse(await lies('daten/titelbilder.json')); } catch (e) { /* werden nachgeholt */ }
    if (M.an) { const danach = await ruf('api/stand'); if (st.ok && danach.ok && st.j.revision !== danach.j.revision) return ladeBibliothek(); st = danach.ok ? danach : st; M.revision = st.j.revision; M.sperre = st.j.sperre || null; M.hat = !!st.j.ich; M.geladen = roh; bib.meta = bib.meta || {}; bib.meta.bearbeiter = M.ich.anzeige; }
    S.lib = Object.assign(bib, { seitentext: texte.seitentext || {}, abschnitte: texte.abschnitte || [], struktur: texte.struktur || {}, elemente: texte.elemente || {}, unsicher: texte.unsicher || {}, ocr: texte.ocr || {}, vorschlaege: texte.vorschlaege || {}, titelbilder: bilder || {} });
    nachLaden();
  }
  function nachLaden() {
    migriere(); pdfReset(); vCache.clear(); S.dokWahl = {}; S.view = { typ: 'start' }; S.dirty = false; A.laedt = false;
    S.kontext = { basis: (L().werke.find(w => w.art === 'norm') || {}).id || '', kanton: '', hersteller: '' };
    render();
  }
  async function ordnerVerbinden(handle) {
    try {
      const dir = handle || await window.showDirectoryPicker({ mode: 'readwrite' });
      if (handle && (await dir.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
      const vorher = A.dir; A.dir = dir;
      try { await dateiHandle('daten/bibliothek.json'); } catch (e) { A.dir = vorher; A.fehler = `Im Ordner „${dir.name}“ liegt keine Bibliothek: daten/bibliothek.json fehlt. Bitte den Ordner des Repos wählen.`; if (S.lib) meldung(A.fehler); render(); return; }
      A.fehler = ''; A.cache.clear(); pdfReset(); idb('put', dir);
      if (!S.lib || !S.dirty) await ladeBibliothek(); else render();
      meldung('Ordner „' + dir.name + '“ verbunden.' + (S.dirty ? ' Die ungesicherten Änderungen bleiben erhalten; „Speichern“ schreibt sie in den Ordner.' : ''));
    } catch (e) { if (e && e.name === 'AbortError') return; A.fehler = 'Der Ordner lässt sich nicht öffnen: ' + (e.message || e); if (S.lib) meldung(A.fehler); render(); }
  }
  function startschirm() {
    if (M.an && !M.ich) return `<div class="startschirm"><span class="zeichen" aria-hidden="true"></span><h1>Normenbibliothek</h1><p class="lead">Bitte anmelden.</p>
      ${M.fehler ? `<p class="fehler-fest" role="alert">${h(M.fehler)}</p>` : ''}
      <form id="anmeldung" class="anmeldung"><label>Anmeldename<input name="name" autocomplete="username" required autofocus></label><label>Passwort<input name="passwort" type="password" autocomplete="current-password" required></label><p class="aktionen"><button class="haupt">Anmelden</button></p></form></div>`;
    return `<div class="startschirm"><span class="zeichen" aria-hidden="true"></span><h1>Normenbibliothek</h1>
      ${A.laedt ? '<p class="lead">Die Bibliothek wird geladen …</p>' : `<p class="lead">Die Bibliothek liegt als Ordner vor: Programm, Daten und Original-PDF nebeneinander. Wähle den Ordner des Repos, dann liest und speichert das Programm direkt darin.</p>
      ${A.fehler ? `<p class="fehler-fest">${h(A.fehler)}</p>` : ''}
      ${kannOrdner ? `<p class="aktionen">${A.alt ? `<button class="haupt" data-act="ordner-alt">Ordner „${h(A.alt.name)}“ wieder öffnen</button>` : ''}<button class="${A.alt ? '' : 'haupt'}" data-act="ordner">Ordner der Bibliothek wählen</button></p>` : '<p class="fehler-fest">Dieser Browser kann keine Ordner öffnen. Bitte Edge oder Chrome verwenden oder die Bibliothek über einen Webserver aufrufen.</p>'}`}</div>`;
  }
  async function hochfahren() {
    render();
    if (webModus) { const r = await ruf('api/ich'); if (r.ok && r.j.modus === 'mehrnutzer') { M.an = true; M.ich = r.j.angemeldet ? r.j : null; if (!M.ich) { A.laedt = false; return render(); } } }
    if (webModus) { try { await ladeBibliothek(); if (M.an && M.ich.neuSetzen) passwortForm(true); return; } catch (e) { A.fehler = 'Die Bibliothek lässt sich nicht laden: ' + (e.message || e); } }
    A.alt = await idb('get'); A.laedt = false; render();
  }
  // ----- Konto und Benutzer (Mehrnutzerbetrieb)
  function passwortForm(pflicht) {
    dialog('Passwort ändern', `${pflicht ? '<p class="hinweis">Das Passwort wurde vom Admin gesetzt. Bitte jetzt ein eigenes wählen.</p>' : ''}<label>Bisheriges Passwort<input name="alt" type="password" autocomplete="current-password" required></label><label>Neues Passwort (mindestens 10 Zeichen)<input name="neu" type="password" autocomplete="new-password" minlength="10" required></label><label>Neues Passwort wiederholen<input name="neu2" type="password" autocomplete="new-password" minlength="10" required></label>`, d => {
      if (d.neu !== d.neu2) return 'Die beiden neuen Passwörter sind nicht gleich.';
      ruf('api/passwort', 'POST', { alt: d.alt, neu: d.neu }).then(r => { if (r.ok) { M.ich.neuSetzen = false; meldung('Das Passwort ist geändert.'); } else { meldung(r.j.fehler || 'Das Passwort liess sich nicht ändern.'); passwortForm(pflicht); } });
    }, 'Ändern');
  }
  function benutzerForm(wahl) {
    ruf('api/benutzer').then(r => {
      if (!r.ok) return meldung(r.j.fehler || 'Die Benutzer lassen sich nicht laden.');
      const b = r.j.benutzer.find(x => x.name === wahl) || { name: '', anzeige: '', rolle: 'autor', aktiv: true };
      dialog('Benutzer verwalten', `<div class="uerahmen"><table class="tabelle"><thead><tr><th>Anmeldename</th><th>Name</th><th>Rolle</th><th>Stand</th><th></th></tr></thead><tbody>${r.j.benutzer.map(x => `<tr><td>${h(x.name)}</td><td>${h(x.anzeige)}</td><td>${ROLLE[x.rolle]}</td><td>${x.aktiv ? 'aktiv' : 'gesperrt'}</td><td><button type="button" class="klein" data-act="m-benutzer" data-name="${h(x.name)}">Ändern</button></td></tr>`).join('')}</tbody></table></div>
        <h3>${b.name ? 'Benutzer ändern: ' + h(b.name) : 'Neuer Benutzer'}</h3>
        ${b.name ? `<input type="hidden" name="name" value="${h(b.name)}">` : feld('name', 'Anmeldename (Kleinbuchstaben, Ziffern, Punkt)', '', 'required autocomplete="off"')}
        ${feld('anzeige', 'Name, wie er im Verlauf steht', b.anzeige, 'required')}
        <label>Rolle<select name="rolle">${opt(Object.keys(ROLLE).map(k => [k, ROLLE[k] + ({ gast: ': lesen', autor: ': bearbeiten und speichern', pruefer: ': zusätzlich vergleichen und freigeben', admin: ': zusätzlich Benutzer verwalten' })[k]]), b.rolle)}</select></label>
        <label>${b.name ? 'Neues Passwort (leer lassen, um es zu behalten)' : 'Passwort für die erste Anmeldung (mindestens 10 Zeichen)'}<input name="passwort" type="text" autocomplete="off" ${b.name ? '' : 'required minlength="10"'}></label>
        <label class="haken"><input type="checkbox" name="aktiv" ${b.aktiv ? 'checked' : ''}> Darf sich anmelden</label>
        ${b.name ? '<p class="reihe"><button type="button" data-act="m-benutzer" data-name="">Stattdessen neuen Benutzer anlegen</button></p>' : ''}`, d => {
        ruf('api/benutzer', 'POST', { name: d.name, anzeige: d.anzeige, rolle: d.rolle, passwort: d.passwort || undefined, aktiv: !!d.aktiv }).then(x => { meldung(x.ok ? 'Benutzer gespeichert.' : x.j.fehler || 'Der Benutzer liess sich nicht speichern.'); benutzerForm(x.ok ? '' : d.name); });
      }, 'Speichern', true);
    });
  }
  document.addEventListener('submit', ev => {
    if (ev.target.id !== 'anmeldung') return; ev.preventDefault();
    const f = ev.target; ruf('api/anmelden', 'POST', { name: f.elements.name.value, passwort: f.elements.passwort.value }).then(async r => {
      if (!r.ok) { M.fehler = r.j.fehler || 'Die Anmeldung ist fehlgeschlagen.'; return render(); }
      M.fehler = ''; M.ich = r.j; A.laedt = true; render();
      try { await ladeBibliothek(); if (M.ich.neuSetzen) passwortForm(true); } catch (e) { A.laedt = false; A.fehler = 'Die Bibliothek lässt sich nicht laden: ' + (e.message || e); render(); }
    });
  });
  ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => { M.aktiv = Date.now(); }, true));
  setInterval(takt, 15000);
  function meldung(t) { const m = document.createElement('p'); m.className = 'meldung'; m.setAttribute('role', 'status'); m.textContent = t; $('#app').appendChild(m); setTimeout(() => m.remove(), 6000); }
  function datenImport(file) {
    file.text().then(t => {
      let neu; try { neu = JSON.parse(t); } catch (e) { return meldung('Die Datei ist keine gültige Datensicherung.'); }
      if (!neu || !Array.isArray(neu.regeln) || !Array.isArray(neu.werke) || !Array.isArray(neu.versionen)) return meldung('Die Datei ist keine gültige Datensicherung.');
      const pdfs = neu.pdfs || {}; delete neu.pdfs; neu.anmerkungen = neu.anmerkungen || []; neu.dokumente = neu.dokumente || [];
      const mit = Object.keys(pdfs).filter(id => neu.dokumente.some(d => d.id === id)); A.neuPdf.clear();
      mit.forEach(id => { const d = neu.dokumente.find(x => x.id === id), bin = atob(pdfs[id]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); A.neuPdf.set(id, u); if (!d.pfad) d.pfad = 'pdf/eigene/' + id + '_' + String(d.datei).replace(/[^A-Za-z0-9._-]+/g, '_'); });
      S.lib = neu; nachLaden(); S.dirty = true; log('Daten aus Sicherung geladen', file.name); $('#dlg').close(); render(); meldung('Daten geladen. Jetzt speichern.');
    });
  }

  // ----- Ereignisse
  function edEinfuegen(z) { const t = $('#ed-text'); if (!t) return; t.focus(); if (!document.execCommand('insertText', false, z)) t.setRangeText(z, t.selectionStart, t.selectionEnd, 'end'); S.ed.entwurf = t.value; }
  function edSuche() { const t = $('#ed-text'), q = S.ed.such.toLowerCase(); if (!t || !q) return; const v = t.value.toLowerCase(); let i = v.indexOf(q, t.selectionEnd); if (i < 0) i = v.indexOf(q); if (i < 0) return meldung('„' + S.ed.such + '“ kommt auf dieser Seite nicht vor.'); t.focus(); t.setSelectionRange(i, i + q.length); }
  const edGesperrt = () => { if (S.tab === 'edit' && S.ed.edit && S.ed.entwurf !== textSchicht(L(), S.ed.dok, S.ed.seite, S.ed.ebene)) { meldung('Zuerst die Änderung am Text übernehmen oder abbrechen.'); return true; } S.ed.edit = false; return false; };
  const aktionen = {
    'dlg-zu': () => $('#dlg').close(),
    'werk-pdf': el => { if (!werk(el.dataset.id)) return; S.view = { typ: 'werk', id: el.dataset.id }; S.tab = dokVon(el.dataset.id) ? 'edit' : 'regeln'; S.ed.dok = null; S.ed.seite = 1; S.ed.edit = false; },
    'bib-hg': el => { S.bib.hg = S.bib.hg === el.dataset.id ? '' : el.dataset.id; S.view = { typ: 'start' }; },
    'bib-liste': el => { S.bib.liste = el.dataset.v === '1'; },
    'ed-seite': el => { if (edGesperrt()) return false; S.ed.seite += +el.dataset.d; },
    'ed-ansicht': el => { S.ed.ansicht = el.dataset.v; },
    'ed-filter': el => { S.ed.filter = el.dataset.v; },
    'ed-edit': () => mitName(() => { S.ed.entwurf = textSchicht(L(), S.ed.dok, S.ed.seite, S.ed.ebene); S.ed.edit = true; render(); const t = $('#ed-text'); if (t) t.focus(); }),
    'ed-abbruch': () => { S.ed.edit = false; S.ed.entwurf = ''; },
    'ed-speichern': () => { edSpeichern(); return $('#dlg').open ? undefined : false; },
    'ed-text-lesen': el => { const d = dokId(el.dataset.id); el.disabled = true; el.textContent = 'Wird gelesen …'; seitentextLesen(d).then(render, e => meldung('Der Text lässt sich nicht lesen: ' + (e.message || e))); return false; },
    'ed-druck': () => dialog('Drucken oder als Word speichern', `<label>Ausgabe<select name="ausgabe">${opt([['druck', 'Drucken (im Druckdialog auch „Als PDF speichern“)'], ['word', 'Word-Datei zum Weiterbearbeiten (.doc)']], 'druck')}</select></label>
      <div class="zwei"><label>Umfang<select name="umfang">${opt([['alles', 'Ganze Norm'], ['seite', 'Diese Seite'], ['auswahl', 'Ausgewählte Seiten']], 'alles')}</select></label>${feld('seiten', 'Seiten bei Auswahl', '', 'placeholder="z. B. 60-66, 70"')}</div>
      <label>Fassung<select name="ansicht">${opt([['hybrid', 'Bearbeitet, Änderungen markiert'], ['neu', 'Bearbeitet, ohne Markierungen'], ['original', 'Grundtext aus dem PDF, ohne Änderungen']], S.ed.ansicht)}</select></label>
      <label class="haken"><input type="checkbox" name="verzeichnis" checked> Änderungsprotokoll anhängen</label>
      <label class="haken"><input type="checkbox" name="kommentare" checked> Kommentare im Protokoll aufführen</label>
      <p class="hinweis">Ausgegeben wird der erkannte Text der Ebene „${h(S.ed.ebene && werk(S.ed.ebene) ? werk(S.ed.ebene).kurz : 'Grundtext')}“. Nicht freigegebene Stände werden als Entwurf gekennzeichnet. Die Originalseiten selbst liefert „PDF exportieren“.</p>`, d => {
      const o = { umfang: d.umfang, seiten: d.seiten, ansicht: d.ansicht, verzeichnis: !!d.verzeichnis, kommentare: !!d.kommentare }, w = werk(S.view.id);
      if (d.umfang === 'auswahl' && !seitenListe(d.seiten, dokId(S.ed.dok).seiten).length) return 'Seiten angeben, zum Beispiel 60-66, 70.';
      if (d.ausgabe === 'word') wordExport(w, o).then(() => meldung('Word-Datei (.docx) gespeichert.')); else drucken(w, o);
    }, 'Ausgeben'),
    'ed-pdf': () => dialog('PDF exportieren', `<p class="hinweis">Erzeugt ein PDF aus den unveränderten Originalseiten. Änderungen und Anmerkungen kommen als eigene Blätter dazu.</p>
      <label class="haken"><input type="checkbox" name="deckblatt" checked> Deckblatt mit Änderungsverzeichnis</label>
      <label class="haken"><input type="checkbox" name="blaetter" checked> Änderungsblatt nach jeder Seite mit Änderungen einfügen</label>
      <label class="haken"><input type="checkbox" name="marken" checked> Kommentierte Stellen auf den Seiten einrahmen</label>
      ${feld('seiten', 'Nur diese Seiten (leer = ganze Norm)', '', 'placeholder="z. B. 60-66, 70"')}`, (d, form) => {
      const wahl = seitenListe(d.seiten, dokId(S.ed.dok).seiten); if (d.seiten.trim() && !wahl.length) return 'Seiten angeben, zum Beispiel 60-66, 70.';
      const knopf = $('button.haupt', form); knopf.disabled = true; knopf.textContent = 'PDF wird erzeugt …';
      pdfExport(werk(S.view.id), { deckblatt: !!d.deckblatt, blaetter: !!d.blaetter, marken: !!d.marken, seiten: wahl }).then(n => { $('#dlg').close(); meldung(`PDF mit ${n} Seiten erzeugt.`); }, e => { const f = $('.fehler', form); f.textContent = 'Das PDF lässt sich nicht erzeugen: ' + (e.message || e); f.hidden = false; knopf.disabled = false; knopf.textContent = 'PDF erzeugen'; });
      return false;
    }, 'PDF erzeugen'),
    'aend-zeige': el => { const a = aend(el.dataset.id); S.view = { typ: 'werk', id: a.werkId }; S.tab = 'edit'; S.ed.dok = a.dokId; S.ed.seite = a.seite; S.ed.edit = false; if (a.schichtId) S.ed.ebene = a.schichtId; P.aktiv = a.id; },
    'aend-weg': el => mitName(() => { const a = aend(el.dataset.id); if (standVon(L(), 'aenderungen', a) === 'neu') { L().aenderungen = L().aenderungen.filter(x => x !== a); log('Nicht freigegebene Textänderung gelöscht', a.id); } else if (a.zurueckgezogen) { const k = kette(L(), a.dokId, a.seite, a.art === 'fachlich' ? a.schichtId : ''); if (k.length && k[k.length - 1].nachher !== a.vorher) return meldung('Der Text wurde inzwischen weiter geändert. Diese Änderung lässt sich nicht wieder aufnehmen.'); a.zurueckgezogen = false; L().aenderungen = L().aenderungen.filter(x => x !== a).concat([a]); log('Textänderung wieder aufgenommen', a.id); } else { a.zurueckgezogen = true; log('Textänderung zurückgezogen', a.id); } render(); }),
    'aend-basis': el => mitName(() => { const a = aend(el.dataset.id); a.basis = kurzSum(textOcr(L(), a.dokId, a.seite)); log('Textänderung gegen neuen Grundtext geprüft', a.id); render(); }),
    'aend-abw': el => mitName(() => { const a = aend(el.dataset.id), r = regel(a.regelId); regelForm(null, { werkId: a.schichtId, art: 'aendern', zielId: r.id, basisRev: r.rev, thema: r.thema, titel: r.titel, text: r.text, params: JSON.parse(JSON.stringify(r.params)), abschnitt: '', pdfSeite: '', begruendung: a.begruendung, quelle: 'Textänderung ' + a.id }); }),
    'pdf-neu': el => mitName(() => pdfForm(werk(el.dataset.id), null)),
    'pdf-ersetzen': el => mitName(() => { const d = dokId(el.dataset.id); pdfForm(werk(d.werkId), d); }),
    'pdf-weg': el => mitName(() => {
      const d = dokId(el.dataset.id), n = L().anmerkungen.filter(a => a.dokId === d.id).length + L().aenderungen.filter(a => a.dokId === d.id).length;
      if (n) return dialog('PDF nicht entfernt', `<p>Zu diesem PDF gibt es ${n} ${n === 1 ? 'Anmerkung oder Textänderung' : 'Anmerkungen und Textänderungen'}. Ein solches PDF lässt sich nur ersetzen, nicht entfernen.</p>`);
      dialog('PDF entfernen?', `<p>„${h(d.datei)}“ wird aus der Bibliothek entfernt. Der daraus übernommene Originaltext wird ebenfalls entfernt.</p>`, () => {
        const el2 = document.getElementById('pdf-' + d.id); if (el2) el2.remove(); pdfReset();
        delete L().titelbilder[d.id]; delete L().seitentext[d.id]; delete L().struktur[d.id]; L().dokumente = L().dokumente.filter(x => x !== d); L().abschnitte = L().abschnitte.filter(a => a.dokId !== d.id); delete S.dokWahl[d.werkId];
        log('PDF entfernt', d.werkId, d.datei);
      }, 'Entfernen');
    }),
    'pdf-teil': el => { S.dokWahl[el.dataset.id] = el.dataset.dok; },
    gruppe: el => { S.auf[el.dataset.key] = el.dataset.auf !== 'true'; },
    'pdf-laden': el => { const d = dokId(el.dataset.id); pdfBytes(d).then(b => herunterladenBlob(d.datei, new Blob([b], { type: 'application/pdf' })), e => meldung('Das PDF lässt sich nicht laden: ' + (e.message || e))); return false; },
    'pdf-text': el => mitName(() => { const w = werk(el.dataset.id); if (L().abschnitte.some(a => a.werkId === w.id)) dialog('Originaltext ersetzen?', `<p>Für ${h(w.kurz)} ist bereits ein Originaltext eingelesen. Der Text aus dem PDF ersetzt ihn vollständig.</p>`, () => { pdfText(w); }, 'Ersetzen'); else pdfText(w); }),
    'pdf-seite': el => { geheZu(el.dataset.id, +el.dataset.seite, null, el.dataset.dok); },
    'vgl-an': () => { S.ed.vgl = true; },
    'vgl-aus': () => { S.ed.vgl = false; },
    'pl-auf': el => { S.view = { typ: 'stellen', id: el.dataset.id }; S.ed.vgl = false; plStart(werk(el.dataset.id), S.pl && S.pl.werk === el.dataset.id ? S.pl.art : 'unsicher'); },
    'pl-ok': () => mitName(() => { plTat('ok'); render(); }),
    'pl-nein': () => mitName(() => { plTat('nein'); render(); }),
    'pl-korr': () => mitName(() => { S.pl.schreibt = true; render(); const f = $('#pl-neu'); if (f) { f.focus(); f.select(); } }),
    'pl-abbr': () => { S.pl.schreibt = false; },
    'pl-weiter': () => { S.pl.i++; },
    'pl-zurueck': () => { if (S.pl.i > 0) S.pl.i--; },
    'pl-neu': () => { const Q = S.pl; Q.liste = Q.liste.filter(x => !x.fertig); Q.von = Q.liste.length; Q.i = 0; Q.ok = 0; Q.korr = 0; },
    'pl-vgl': () => { const it = S.pl.liste[S.pl.i], d = dokId(it.dokId); S.view = { typ: 'werk', id: d.werkId }; S.tab = 'edit'; S.ed.dok = it.dokId; S.ed.seite = it.n; S.ed.edit = false; S.ed.vgl = true; },
    'vgl-text': el => { S.ed.vtext = el.dataset.v; },
    'vgl-lineal': () => { S.ed.vlineal = !S.ed.vlineal; },
    'vgl-blink': () => { S.ed.vblink = !S.ed.vblink; S.ed.vblinkT = true; },
    'vgl-wechsel': () => { S.ed.vblinkT = !S.ed.vblinkT; vglMount(); return false; },
    'vgl-unsicher': () => naechsteUnsichere(),
    'vgl-tasten': () => dialog('Tasten im Vergleich', `<table class="tabelle"><tbody>${TASTEN.map(t => `<tr><th scope="row"><kbd>${h(t[0])}</kbd></th><td>${h(t[1])}</td></tr>`).join('')}</tbody></table>`),
    'vgl-zoom': el => { vglZoom(+el.dataset.d || 0, el.dataset.v); return false; },
    'pdf-zoom': el => { P.zoom = Math.max(50, Math.min(250, P.zoom + (+el.dataset.d))); },
    'pdf-mark': el => mitName(() => { const art = el.dataset.art || 'kommentar'; P.mark = !(P.mark && P.markArt === art); P.markArt = art; render(); }),
    'anm-seite': el => mitName(() => anmForm(null, { werkId: el.dataset.werk, dokId: el.dataset.dok, seite: +el.dataset.seite, rect: null })),
    'anm-edit': el => mitName(() => anmForm(anm(el.dataset.id))),
    'anm-zeige': el => { const a = anm(el.dataset.id); geheZu(a.werkId, a.seite, a.id, a.dokId); },
    fleck: el => { P.aktiv = el.dataset.id; document.querySelectorAll('.fleck.aktiv,.anm.aktiv').forEach(n => n.classList.remove('aktiv')); el.classList.add('aktiv'); const k = document.getElementById('a-' + el.dataset.id); if (k) { k.classList.add('aktiv'); k.scrollIntoView({ block: 'nearest' }); } return false; },
    'anm-erledigt': el => mitName(() => { const a = anm(el.dataset.id); a.erledigt = !a.erledigt; log(a.erledigt ? 'Anmerkung erledigt' : 'Anmerkung wieder offen', a.id); render(); }),
    'anm-weg': el => mitName(() => { const a = anm(el.dataset.id); if (standVon(L(), 'anmerkungen', a) === 'neu') { L().anmerkungen = L().anmerkungen.filter(x => x !== a); log('Nicht freigegebene Anmerkung gelöscht', a.id); } else { a.zurueckgezogen = !a.zurueckgezogen; log(a.zurueckgezogen ? 'Anmerkung zurückgezogen' : 'Anmerkung wieder aufgenommen', a.id); } render(); }),
    'anm-antwort': el => mitName(() => antwortForm(anm(el.dataset.id))),
    'antw-weg': el => mitName(() => { const a = anm(el.dataset.id), r = (a.antworten || []).find(x => String(x.nr) === el.dataset.nr); if (!r) return; if (!antwFrei(a).has(r.nr)) { a.antworten = a.antworten.filter(x => x !== r); if (!a.antworten.length && !antwFrei(a).size) delete a.antworten; log('Nicht freigegebene Antwort gelöscht', a.id, 'Antwort ' + r.nr); } else { r.zurueckgezogen = !r.zurueckgezogen; log(r.zurueckgezogen ? 'Antwort zurückgezogen' : 'Antwort wieder aufgenommen', a.id, 'Antwort ' + r.nr); } render(); }),
    'mark-weise': el => { P.markWeise = el.dataset.v; },
    'anm-hist': el => { S.offen[el.dataset.id] = !S.offen[el.dataset.id]; },
    'anm-regel': el => mitName(() => { const a = anm(el.dataset.id); regelForm(null, { werkId: a.werkId, dokId: a.dokId, pdfSeite: String(a.seite), abschnitt: '', titel: '', text: a.text, params: [], anmId: a.id, quelle: 'Anmerkung ' + a.id }); }),
    ansicht: el => { S.view = { typ: el.dataset.typ }; },
    werk: el => { if (!werk(el.dataset.id)) return; S.view = { typ: 'werk', id: el.dataset.id }; S.tab = 'regeln'; },
    'werk-text': el => { S.view = { typ: 'werk', id: el.dataset.id }; S.tab = 'text'; },
    tab: el => { if (edGesperrt()) return false; S.tab = el.dataset.tab; },
    'zeige-regel': el => { const r = regel(el.dataset.id); S.view = { typ: 'werk', id: r.werkId }; S.tab = 'regeln'; render(); const z = document.getElementById('r-' + r.id); if (z) z.scrollIntoView({ block: 'center' }); return false; },
    'm-konto': () => dialog('Konto', `<p>Angemeldet als <b>${h(M.ich.anzeige)}</b> (${h(M.ich.name)}), Rolle ${ROLLE[M.ich.rolle]}.</p>
      <p class="reihe"><button type="button" data-act="m-passwort">Passwort ändern</button><button type="button" data-act="m-abmelden">Abmelden</button></p>
      ${M.ich.rolle === 'admin' ? `<p class="reihe"><button type="button" data-act="m-benutzer" data-name="">Benutzer verwalten</button>${M.sperre && !M.hat ? '<button type="button" data-act="m-aufheben">Bearbeitungssperre aufheben</button>' : ''}</p>` : ''}
      <p class="hinweis">Es bearbeitet immer nur eine Person gleichzeitig. Wer „Bearbeiten“ wählt oder eine Änderung beginnt, hält die Bearbeitung, bis er sie beendet oder zehn Minuten nichts tut. Alle anderen lesen und sehen gespeicherte Stände von selbst.</p>`),
    'm-passwort': () => { passwortForm(false); return false; },
    'm-benutzer': el => { benutzerForm(el.dataset.name || ''); return false; },
    'm-aufheben': () => { ruf('api/sperre', 'POST', { aktion: 'aufheben' }).then(r => { if (r.ok) { M.sperre = null; $('#dlg').close(); mStatus(); meldung('Die Bearbeitungssperre ist aufgehoben. Ungesicherte Änderungen der anderen Person gehen dabei verloren.'); } else meldung(r.j.fehler || 'Die Sperre liess sich nicht aufheben.'); }); return false; },
    'm-abmelden': () => { if (S.dirty) { meldung('Zuerst speichern. Es gibt ungesicherte Änderungen.'); return false; } ruf('api/abmelden', 'POST', {}).then(() => { M.ich = null; M.hat = false; S.lib = null; A.laedt = false; $('#dlg').close(); render(); }); return false; },
    'm-sperre': () => {
      if (M.hat) { if (S.dirty) { meldung('Zuerst speichern. Es gibt ungesicherte Änderungen.'); return false; } ruf('api/sperre', 'POST', { aktion: 'geben' }).then(() => { M.hat = false; M.sperre = null; mStatus(); }); }
      else sperreHolen(false);
      return false;
    },
    name: () => dialog('Wer bearbeitet?', feld('name', 'Name', L().meta.bearbeiter || '', 'required'), d => { L().meta.bearbeiter = d.name.trim(); }),
    'regel-neu': el => mitName(() => { const a = el.dataset.abs && L().abschnitte.find(x => x.id === el.dataset.abs); regelForm(null, { werkId: el.dataset.werk, dokId: a ? a.dokId : '', abschnitt: a ? a.nr : '', pdfSeite: a ? a.pdfSeite : '', titel: a ? a.titel : '', params: [] }); }),
    'regel-edit': el => mitName(() => regelForm(regel(el.dataset.id))),
    abweichung: el => mitName(() => abweichungForm(regel(el.dataset.id))),
    'regel-hist': el => { S.offen[el.dataset.id] = !S.offen[el.dataset.id]; },
    pruef: el => mitName(() => { const r = regel(el.dataset.id); r.geprueft = r.geprueft ? null : { name: L().meta.bearbeiter, datum: heute() }; log(r.geprueft ? 'Am Original geprüft' : 'Prüfvermerk entfernt', r.id); render(); }),
    'basis-ok': el => mitName(() => { const r = regel(el.dataset.id); r.basisRev = regel(r.zielId).rev; log('Gegen neue Basis geprüft', r.id); render(); }),
    'regel-weg': el => mitName(() => { const r = regel(el.dataset.id); if (standVon(L(), 'regeln', r) === 'neu') { L().regeln = L().regeln.filter(x => x !== r); log('Nicht freigegebene Regel gelöscht', r.id); } else { r.zurueckgezogen = !r.zurueckgezogen; log(r.zurueckgezogen ? 'Regel zurückgezogen' : 'Regel wieder aufgenommen', r.id); } render(); }),
    'werk-neu': () => mitName(() => werkForm(null)),
    'werk-edit': el => mitName(() => werkForm(werk(el.dataset.id))),
    'hg-neu': () => mitName(() => hgForm(null)),
    'hg-edit': el => mitName(() => hgForm(hg(el.dataset.id))),
    'link-neu': el => mitName(() => linkForm(werk(el.dataset.id))),
    'link-weg': el => mitName(() => { L().verknuepfungen = L().verknuepfungen.filter(v => v.id !== el.dataset.id); log('Verknüpfung entfernt', el.dataset.id); render(); }),
    import: el => mitName(() => importForm(werk(el.dataset.id))),
    freigeben: () => M.an && !darfFreigeben() ? meldung('Versionen freigeben dürfen nur Prüfer.') : mitName(() => dialog('Änderungen freigeben', `<p>${offeneAenderungen(L())} Änderungen werden zur Version ${L().versionen.length + 1}. Freigegebene Versionen lassen sich nicht mehr ändern.</p>${bereich('notiz', 'Was wurde geändert?', '', 'required')}${M.an ? '' : '<p class="hinweis">Solange nur eine Person arbeitet, gibt dieselbe Person frei.</p>'}`, d => { const v = neueVersion(L(), L().meta.bearbeiter, d.notiz.trim(), heute()); S.wahlAus.clear(); log('Version freigegeben', 'Version ' + v.nr, d.notiz.trim()); meldung('Version ' + v.nr + ' freigegeben. Jetzt speichern.'); }, 'Freigeben')),
    'wahl-alle': el => { S.wahlAus.clear(); if (el.dataset.v === '0') R.offen.forEach(e => S.wahlAus.add(eKey(e))); },
    'freigeben-wahl': () => mitName(() => {
      const gew = new Set(R.offen.filter(e => !S.wahlAus.has(eKey(e))).map(eKey)), vorher = gew.size, offenNeu = k => R.offen.some(e => eKey(e) === k && e.stand === 'neu');
      let mehr = true; while (mehr) { mehr = false; R.offen.filter(e => gew.has(eKey(e))).forEach(e => { const brauch = []; if (e.werkId) brauch.push('werke|' + e.werkId); if (e.liste === 'werke') brauch.push('herausgeber|' + e.obj.herausgeberId, 'werke|' + (e.obj.basisId || '')); if (e.liste === 'regeln' && e.obj.zielId) brauch.push('regeln|' + e.obj.zielId); if (e.liste === 'aenderungen' && e.obj.schichtId) brauch.push('werke|' + e.obj.schichtId); if (e.obj.dokId) brauch.push('dokumente|' + e.obj.dokId); brauch.forEach(k => { if (!gew.has(k) && offenNeu(k)) { gew.add(k); mehr = true; } }); }); }
      dialog('Auswahl freigeben', `<p>${gew.size} von ${R.offen.length} Änderungen werden zur Version ${L().versionen.length + 1}. Der Rest bleibt offen.</p>${gew.size > vorher ? `<p class="hinweis">${gew.size - vorher} weitere Einträge kommen dazu, weil die Auswahl ohne sie unvollständig wäre (zum Beispiel die neue Norm zu einer gewählten Regel).</p>` : ''}${bereich('notiz', 'Was wurde geändert?', '', 'required')}`, d => {
        const v = neueVersion(L(), L().meta.bearbeiter, d.notiz.trim(), heute(), teilInhalt(L(), gew)); S.wahlAus.clear(); log('Version freigegeben (Auswahl)', 'Version ' + v.nr, `${gew.size} Änderungen: ${d.notiz.trim()}`); meldung('Version ' + v.nr + ' freigegeben. Jetzt speichern.');
      }, 'Freigeben');
    }),
    'offen-weg': el => mitName(() => {
      const e = R.offen.find(x => eKey(x) === el.dataset.k); if (!e) return;
      dialog('Änderung verwerfen', `<p>${LNAME[e.liste]} „${h(eintragText(e).slice(0, 120))}“ wird auf den Stand der letzten freigegebenen Version zurückgesetzt${e.stand === 'neu' ? ' und damit gelöscht' : ''}.</p>${bereich('grund', 'Begründung', '')}`, d => {
        const alt = freigegeben(L())[e.liste].find(x => x.id === e.obj.id), kopie = alt && JSON.parse(JSON.stringify(alt));
        if (e.stand === 'neu') L()[e.liste] = L()[e.liste].filter(x => x.id !== e.obj.id);
        else if (e.stand === 'entfernt') L()[e.liste].push(kopie);
        else L()[e.liste] = L()[e.liste].map(x => x.id === e.obj.id ? kopie : x);
        S.wahlAus.delete(eKey(e)); log('Änderung verworfen (' + LNAME[e.liste] + ', ' + e.stand + ')', e.obj.id, d.grund.trim());
      }, 'Verwerfen');
    }),
    'protokoll-csv': el => { const ws = el.dataset.id ? [werk(el.dataset.id)] : L().werke, c = protokollCsv(ws); if (!c.zeilen) { meldung('Es gibt noch keine Textänderungen oder Anmerkungen.'); return false; } herunterladen((el.dataset.id ? werk(el.dataset.id).kurz.replace(/[^A-Za-z0-9äöüÄÖÜ-]+/g, '_') + '_' : 'Normenbibliothek_') + 'Aenderungsprotokoll_' + heute() + '.csv', c.text, 'text/csv'); meldung(`Protokoll mit ${c.zeilen} Einträgen gespeichert. Die Datei öffnet sich in Excel.`); return false; },
    'ed-links': el => { S.ed.links = el.dataset.v; },
    digital: el => mitName(() => digitalForm(werk(el.dataset.id))),
    'digital-frei': el => mitName(() => digitalForm(werk(el.dataset.id), 'freigegeben')),
    'seite-ok': () => mitName(() => { const d = dokId(S.ed.dok), n = S.ed.seite, set = new Set(d.geprueftSeiten || []); if (set.has(n)) set.delete(n); else set.add(n); d.geprueftSeiten = [...set].sort((a, b) => a - b); log(set.has(n) ? 'Seite mit dem Original verglichen' : 'Vergleichsvermerk entfernt', d.werkId, `${d.teil ? d.teil + ', ' : ''}Seite ${n}`); render(); }),
    'pruefer-speichern': () => { L().meta.pruefer = $('#pruefer-liste').value.split('\n').map(x => x.trim()).filter(Boolean); S.dirty = true; meldung(`Prüferliste übernommen: ${L().meta.pruefer.length} ${L().meta.pruefer.length === 1 ? 'Name' : 'Namen'}.`); return false; },
    'ix-tab': el => { S.ixTab = el.dataset.v; },
    'ix-auf': el => { S.ixAuf = S.ixAuf === el.dataset.b ? '' : el.dataset.b; },
    'glossar-neu': () => mitName(() => glossarForm(null)),
    'glossar-edit': el => mitName(() => glossarForm(L().glossar.find(g => g.id === el.dataset.id))),
    'glossar-pruef': el => mitName(() => { const g = L().glossar.find(x => x.id === el.dataset.id); g.geprueft = g.geprueft ? null : { name: L().meta.bearbeiter, datum: heute() }; log(g.geprueft ? 'Glossareintrag am Original geprüft' : 'Prüfvermerk am Glossareintrag entfernt', g.id, g.begriff); render(); }),
    'glossar-weg': el => mitName(() => { const g = L().glossar.find(x => x.id === el.dataset.id); if (standVon(L(), 'glossar', g) === 'neu') { L().glossar = L().glossar.filter(x => x !== g); log('Nicht freigegebener Glossareintrag gelöscht', g.id, g.begriff); } else { g.zurueckgezogen = !g.zurueckgezogen; log(g.zurueckgezogen ? 'Glossareintrag zurückgezogen' : 'Glossareintrag wieder aufgenommen', g.id, g.begriff); } render(); }),
    'glossar-zeige': el => { const g = L().glossar.find(x => x.id === el.dataset.id); S.view = { typ: 'glossar' }; S.gq = g ? g.begriff : ''; },
    'ed-inhalt': () => { S.ed.inhaltAuf = !S.ed.inhaltAuf; return false; },
    'ed-gehe': el => { if (edGesperrt()) return false; S.ed.seite = +el.dataset.s; S.ed.inhaltAuf = false; },
    'ue-zeige': el => { const u = L().uebernahmen.find(x => x.id === el.dataset.id); S.view = { typ: 'werk', id: u.werkId }; S.tab = 'edit'; S.ed.dok = u.dokId; S.ed.seite = u.seite; S.ed.edit = false; },
    'ue-bearbeiten': el => mitName(() => { const e = elementeVon(L(), S.ed.dok, S.ed.seite).find(x => x.nr === el.dataset.nr); if (e) ueForm(werk(S.view.id), Object.assign({}, e, { zeilen: e.zeilen ? e.zeilen.map(z => z.slice()) : null })); }),
    'bild-neu': () => mitName(() => { const w = werk(S.view.id); ueForm(w, { dokId: S.ed.dok, s: S.ed.seite, nr: ueNrNeu(S.ed.dok, S.ed.seite), typ: 'skizze', box: [0, 1, 0, 0], titel: '', neu: true, eigen: true }); }),
    'ue-pos': el => mitName(() => {
      const w = werk(S.view.id), e = elementeVon(L(), S.ed.dok, S.ed.seite).find(x => x.nr === el.dataset.nr); if (!e) return;
      const N = (P.zeilen && P.zeilen.get(S.ed.dok + ':' + S.ed.seite)) || 0, nach = rund((e.nach == null ? N : Math.min(e.nach, N)) + +el.dataset.d, 0, N);
      ueSetzen(w, e, { nach }, 'Bild im Text verschoben'); render(); const f = document.getElementById('ue-' + e.nr.replace('.', '-')); if (f) { f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'nearest' }); }
    }),
    'ue-typ': el => mitName(() => {
      const w = werk(S.view.id), e = elementeVon(L(), S.ed.dok, S.ed.seite).find(x => x.nr === el.dataset.nr); if (!e) return;
      if (e.typ === 'tabelle') { ueSetzen(w, e, { typ: 'skizze' }, 'Tabelle als Bild gezeigt'); render(); }
      else if (e.zeilen && e.zeilen.length) ueForm(w, Object.assign({}, e, { typ: 'tabelle', zeilen: e.zeilen.map(z => z.slice()) }));
      else tabelleImRechteck(e.dokId, e.s, e.box).then(z => ueForm(w, Object.assign({}, e, { typ: 'tabelle', zeilen: z })));
    }),
    'ue-weg': el => mitName(() => {
      const w = werk(S.view.id), e = elementeVon(L(), S.ed.dok, S.ed.seite).find(x => x.nr === el.dataset.nr); if (!e) return;
      const name = (e.typ === 'tabelle' ? 'Tabelle ' : 'Skizze ') + e.nr;
      dialog(name + ' entfernen', `<p>${h(name)} wird aus dem Text der Seite ${e.s} entfernt. Das Original-PDF bleibt unverändert.</p>`, () => {
        const u = L().uebernahmen.find(x => x.dokId === e.dokId && x.nr === e.nr), auto = (L().elemente[e.dokId] || []).some(x => x.nr === e.nr);
        if (u && !auto && standVon(L(), 'uebernahmen', u) === 'neu') { L().uebernahmen = L().uebernahmen.filter(x => x !== u); log('Übernahme gelöscht', w.id, `Seite ${e.s}, ${name}`); }
        else ueSetzen(w, e, { weg: true }, 'Tabelle oder Skizze entfernt');
      }, 'Entfernen');
    }),
    'ue-gitter': el => {
      const st = UE, form = el.closest('form'); st.zeilen = ueLesen(form); st.titel = form.elements.titel.value; st.ohneKopf = !form.elements.kopf.checked;
      const nc = st.zeilen[0].length, op = el.dataset.op;
      if (op === 'z+') st.zeilen.push(new Array(nc).fill('')); else if (op === 'z-' && st.zeilen.length > 1) st.zeilen.pop();
      else if (op === 's+') st.zeilen.forEach(z => z.push('')); else if (op === 's-' && nc > 1) st.zeilen.forEach(z => z.pop());
      else if (op === 'zu') { st.zeilen = st.zeilen.filter(z => z.some(c => c)); const voll = st.zeilen[0] ? st.zeilen[0].map((_, j) => st.zeilen.some(z => z[j])) : []; st.zeilen = st.zeilen.map(z => z.filter((_, j) => voll[j])); }
      ueForm(werk(S.view.id), st); return false;
    },
    'fv-zeige': el => { const f = L().formate.find(x => x.id === el.dataset.id); S.view = { typ: 'werk', id: f.werkId }; S.tab = 'edit'; S.ed.dok = f.dokId; S.ed.seite = f.seite; S.ed.edit = false; },
    'struktur-neu': el => { const ds = dokus(el.dataset.id).filter(pdfDa); el.disabled = true; el.textContent = 'Wird erkannt …'; (async () => { for (const d of ds) await strukturLesen(d); })().then(() => { render(); meldung('Struktur neu erkannt. Zuweisungen von Hand sind erhalten.'); }, e => meldung('Die Struktur lässt sich nicht erkennen: ' + (e.message || e))); return false; },
    'ed-undo': () => { const t = $('#ed-text'); t.focus(); document.execCommand('undo'); S.ed.entwurf = t.value; return false; },
    'ed-redo': () => { const t = $('#ed-text'); t.focus(); document.execCommand('redo'); S.ed.entwurf = t.value; return false; },
    'ed-zeichen': el => { edEinfuegen(el.dataset.z); return false; },
    'ed-such-next': () => { edSuche(); return false; },
    'ed-ers-eins': () => { const t = $('#ed-text'), q = S.ed.such; if (q && t.value.slice(t.selectionStart, t.selectionEnd).toLowerCase() === q.toLowerCase()) edEinfuegen(S.ed.ers); edSuche(); return false; },
    'ed-ers-alle': () => { const t = $('#ed-text'), q = S.ed.such; if (!q) return false; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), n = (t.value.match(re) || []).length; if (!n) { meldung('„' + q + '“ kommt auf dieser Seite nicht vor.'); return false; } const neu = t.value.replace(re, () => S.ed.ers); t.focus(); t.select(); if (!document.execCommand('insertText', false, neu)) t.value = neu; S.ed.entwurf = t.value; meldung(`${n} ${n === 1 ? 'Stelle' : 'Stellen'} ersetzt.`); return false; },
    'anm-uebernehmen': el => mitName(() => {
      const a = anm(el.dataset.id), w = werk(a.werkId), fach = a.aendArt === 'fachlich', sch = fach ? werk(S.ed.ebene) : null;
      if (fach && !sch) return meldung('Fachliche Änderungen gehören in eine Schicht. Zuerst unter „Ich bearbeite“ die Schicht wählen.');
      if (!a.alt) return meldung('Ohne Originalinhalt lässt sich der Vorschlag nicht automatisch einsetzen. Bitte den Text von Hand ändern.');
      const vorher = textSchicht(L(), a.dokId, a.seite, sch ? sch.id : ''), re = new RegExp(a.alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'g'), tr = vorher.match(re) || [];
      if (tr.length !== 1) return meldung(tr.length ? 'Der Originalinhalt kommt auf der Seite mehrfach vor. Bitte den Text von Hand ändern.' : 'Der Originalinhalt steht so nicht im Text der Seite. Bitte den Text von Hand ändern.');
      const id = aendAnlegen(w, a.dokId, a.seite, fach ? 'fachlich' : 'ocr', sch, vorher, vorher.replace(re, () => a.neu), a.text, a.regelId || ''); a.uebernommen = id; log('Änderungsvorschlag in den Text übernommen', a.id, id); render();
    }),
    speichern: () => { speichern(); return false; },
    ordner: () => { ordnerVerbinden(); return false; },
    'ordner-alt': () => { ordnerVerbinden(A.alt); return false; },
    mehr: () => dialog('Daten', `<p class="hinweis">Programmversion ${h(PROGRAMM)}. Die Datensicherung enthält den ganzen Bearbeitungsstand und die Texte in einer Datei, ohne die PDF. Damit lassen sich die Inhalte in eine neuere Programmdatei übernehmen.</p>
      <p class="reihe"><button type="button" data-act="daten-export">Datensicherung herunterladen</button></p>
      ${M.an ? '<p class="hinweis">Wer freigeben darf, bestimmt die Rolle des Benutzers (Konto → Benutzer verwalten).</p>' : `<label>Prüfer: wer die digitale Fassung einer Norm freigeben darf (ein Name je Zeile)<textarea id="pruefer-liste" rows="3">${h((L().meta.pruefer || []).join('\n'))}</textarea></label><p class="reihe"><button type="button" data-act="pruefer-speichern">Prüferliste übernehmen</button></p>`}
      <label>Datensicherung laden (ersetzt den ganzen Bearbeitungsstand)<input type="file" id="daten-datei" accept=".json,application/json"></label>`),
    'daten-export': () => { herunterladen('Normenbibliothek_Daten_' + heute() + '.json', JSON.stringify(L()), 'application/json'); return false; },
    regelwerk: () => { const k = S.kontext, x = regelwerkExport(L(), k, S.mitEntwurf); herunterladen(`Regelwerk_${(x.kontext.basis || '').replace(/\s/g, '')}_v${x.version}${S.mitEntwurf ? '_Entwurf' : ''}.json`, JSON.stringify(x, null, 1), 'application/json'); return false; },
  };
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    if (el.tagName === 'A') ev.preventDefault();
    const fn = aktionen[el.dataset.act]; if (!fn) return;
    const vorher = S.view; const r = fn(el);
    if (r === false) return;
    if (!$('#dlg').open || el.dataset.act === 'dlg-zu') { render(); if (vorher !== S.view) { $('#haupt').scrollTop = 0; window.scrollTo(0, 0); } }
  });
  document.addEventListener('input', ev => {
    if (ev.target.id === 'q') { S.q = ev.target.value; S.view = { typ: S.q.trim() ? 'suche' : 'start' }; $('#haupt').innerHTML = haupt(); if ($('.deckel[data-fehlt]')) titelbilderNachholen(); }
    else if (ev.target.id === 'ixq') { S.ixq = ev.target.value; const neu = document.createElement('div'); neu.innerHTML = indexAnsicht(); $('#ixinhalt').innerHTML = neu.querySelector('#ixinhalt').innerHTML; }
    else if (ev.target.id === 'gq') { S.gq = ev.target.value; $('#glossarbody').innerHTML = glossarZeilen(); }
    else if (ev.target.id === 'bq') { S.bib.q = ev.target.value; $('#bibinhalt').innerHTML = bibInhalt(); if ($('.deckel[data-fehlt]')) titelbilderNachholen(); }
    else if (ev.target.id === 'ed-text') S.ed.entwurf = ev.target.value;
    else if (ev.target.id === 'ed-such') S.ed.such = ev.target.value;
    else if (ev.target.id === 'ed-ers') S.ed.ers = ev.target.value;
    else if (ev.target.id === 'ed-transp') { S.ed.transp = +ev.target.value; const se = $('#pdfseiten .seite'); if (se) se.style.setProperty('--t', S.ed.transp / 100); ev.target.nextElementSibling.textContent = S.ed.transp + ' %'; }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.id === 'k-basis') { S.kontext.basis = t.value; S.kontext.kanton = S.kontext.hersteller = ''; render(); }
    else if (t.id === 'k-kanton') { S.kontext.kanton = t.value; render(); }
    else if (t.id === 'k-hersteller') { S.kontext.hersteller = t.value; render(); }
    else if (t.id === 'k-entwurf') { S.mitEntwurf = t.checked; render(); }
    else if (t.classList.contains('wahlbox')) { if (t.checked) S.wahlAus.delete(t.dataset.k); else S.wahlAus.add(t.dataset.k); render(); }
    else if (t.id === 'vgl-a' || t.id === 'vgl-b') { S.vgl[t.id.slice(4)] = t.value; render(); }
    else if (t.id === 'ed-fv') { mitName(() => { fvSetzen(werk(S.view.id), S.ed.dok, S.ed.seite, edZeile(), t.value); }); }
    else if (t.id === 'vgl-sync') { S.ed.vsync = t.checked; }
    else if (t.id === 'pl-art') { plStart(werk(S.view.id), t.value); render(); }
    else if (t.id === 'ed-z-scan') { S.ed.zScan = t.checked; render(); }
    else if (t.id === 'ed-z-text') { S.ed.zText = t.checked; render(); }
    else if (t.id === 'ed-z-marken') { S.ed.zMarken = t.checked; render(); }
    else if (t.id === 'pf') { S.pf = t.value; render(); }
    else if (t.id === 'bib-gruppe') { S.bib.gruppe = t.value; render(); }
    else if (t.id === 'bib-status') { S.bib.status = t.value; render(); }
    else if (t.id === 'ed-sprung') { if (!edGesperrt()) S.ed.seite = +t.value || 1; render(); }
    else if (t.id === 'ed-dok') { if (!edGesperrt()) { S.ed.dok = t.value; S.ed.seite = 1; } render(); }
    else if (t.id === 'ed-ebene') { if (!edGesperrt()) S.ed.ebene = t.value; render(); }
    else if (t.id === 'daten-datei' && t.files[0]) datenImport(t.files[0]);
  });
  window.addEventListener('beforeunload', ev => { if (S.dirty || (S.ed.edit && S.tab === 'edit')) { ev.preventDefault(); ev.returnValue = ''; } });
  window.__nb = { S, A, M, takt, teileDaten, oeffne: (id, tab) => { S.view = { typ: 'werk', id }; S.tab = tab || 'regeln'; S.ed.edit = false; render(); } };
  hochfahren();
})();
