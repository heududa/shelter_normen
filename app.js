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

const LISTEN = ['herausgeber', 'werke', 'verknuepfungen', 'regeln', 'anmerkungen', 'dokumente', 'aenderungen', 'formate', 'glossar'];
const leererInhalt = () => ({ herausgeber: [], werke: [], verknuepfungen: [], regeln: [], anmerkungen: [], dokumente: [], aenderungen: [], formate: [], glossar: [] });
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
// Seitentext: Grundtext aus dem PDF, darüber OCR-Korrekturen, darüber fachliche Änderungen einer Schicht
function seitenBasis(lib, dokId, seite) { const t = (lib.seitentext || {})[dokId]; return (t && t[seite - 1]) || ''; }
function kette(lib, dokId, seite, schichtId) { return (lib.aenderungen || []).filter(a => a.dokId === dokId && a.seite === seite && !a.zurueckgezogen && (schichtId ? a.art === 'fachlich' && a.schichtId === schichtId : a.art === 'ocr')); }
function textOcr(lib, dokId, seite) { const k = kette(lib, dokId, seite, ''); return k.length ? k[k.length - 1].nachher : seitenBasis(lib, dokId, seite); }
function textSchicht(lib, dokId, seite, schichtId) { const k = schichtId ? kette(lib, dokId, seite, schichtId) : []; return k.length ? k[k.length - 1].nachher : textOcr(lib, dokId, seite); }

if (typeof module !== 'undefined') module.exports = { zeilenAus, erkenneStruktur, fvSchluessel, teilInhalt, artVorschlag, fliesstext, diffWorte, stellen, seitenBasis, textOcr, textSchicht, sha256, neueVersion, freigegeben, standVon, offeneAenderungen, fassung, regelwerkExport, teileText, inhalt };

// ---------- Oberfläche ----------
if (typeof document !== 'undefined') (function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const h = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = { lib: null, view: { typ: 'start' }, tab: 'regeln', dirty: false, handle: null, q: '', kontext: null, mitEntwurf: false, offen: {} };
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
  S.ed = { dok: null, seite: 1, ansicht: 'hybrid', ebene: '', edit: false, entwurf: '', filter: 'alle', links: 'scan', transp: 60, zScan: true, zText: true, zMarken: true, such: '', ers: '' };
  S.wahlAus = new Set(); S.vgl = { a: '', b: 'jetzt' };
  S.bib = { q: '', gruppe: '', status: '', hg: '', liste: false };
  const R = { offen: [] };
  const PROGRAMM = (document.querySelector('meta[name=nb-version]') || {}).content || '';
  const dokus = id => L().dokumente.filter(d => d.werkId === id);
  const dokId = id => L().dokumente.find(d => d.id === id);
  const dokVon = id => dokus(id)[0];
  const istGanz = w => dokus(w.id).length > 1 && (!S.dokWahl[w.id] || S.dokWahl[w.id] === '*');
  function migriere() { // fehlende Felder älterer Stände ergänzen
    const l = S.lib; ['anmerkungen', 'dokumente', 'aenderungen', 'formate', 'glossar', 'abschnitte', 'versionen', 'verlauf'].forEach(k => { l[k] = l[k] || []; }); ['titelbilder', 'seitentext', 'struktur'].forEach(k => { l[k] = l[k] || {}; });
    l.dokumente.forEach(d => { if (d.teil == null) d.teil = ''; });
    l.anmerkungen.forEach(a => { if (!a.dokId) { const d = l.dokumente.find(x => x.werkId === a.werkId); if (d) a.dokId = d.id; } });
  }
  const FV = { text: 'Fliesstext', titel: 'Normtitel', u1: 'Überschrift 1', u2: 'Überschrift 2', u3: 'Überschrift 3', tabelle: 'Tabellentitel', bild: 'Bildbeschriftung', fussnote: 'Fussnote', liste: 'Aufzählung', formel: 'Formel' };
  const ANM = { kommentar: 'Kommentar', aenderung: 'Änderungsvorschlag', frage: 'Offene Frage' };
  const P = { werkId: null, docs: new Map(), gen: 0, canvases: new Map(), obs: null, zoom: 100, ziel: null, mark: false, markArt: 'kommentar', aktiv: null };

  function log(aktion, ziel, detail) { L().verlauf.push({ zeit: new Date().toISOString(), name: L().meta.bearbeiter || '', aktion, ziel, detail: detail || '' }); S.dirty = true; }
  function mitName(dann) {
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
    const ort = w ? w.kurz : ({ glossar: 'Glossar', offen: 'Änderungen', fassung: 'Geltende Fassung', verlauf: 'Versionen und Verlauf', suche: 'Suche' })[S.view.typ];
    return `<header class="kopf">
      <div class="ort"><nav class="pfad" aria-label="Ort"><a href="#" data-act="ansicht" data-typ="start">Bibliothek</a>${ort ? `<span aria-hidden="true">/</span><b>${h(ort)}</b>` : ''}</nav>
        <p class="stand">${v ? `Version ${v.nr} vom ${datumCH(v.datum)}` : 'Noch keine Version freigegeben'}${n ? `, ${n} ${n === 1 ? 'Änderung' : 'Änderungen'} nicht freigegeben` : ''}</p></div>
      <label class="suche"><span class="sr">Suchen</span><input type="search" id="q" value="${h(S.q)}" placeholder="In Regeln, Texten und Anmerkungen suchen"></label>
      <div class="werkzeug">
        <button data-act="name">${L().meta.bearbeiter ? 'Bearbeitet von ' + h(L().meta.bearbeiter) : 'Namen angeben'}</button>
        <button data-act="freigeben" ${n ? '' : 'disabled'}>Änderungen freigeben</button>
        ${A.dir ? `<span class="ablage" title="Gelesen und gespeichert wird in diesem Ordner">Ordner „${h(A.dir.name)}“</span>` : `<span class="ablage nurlesen" title="Ohne verbundenen Ordner lässt sich nicht direkt speichern">Nur lesen</span>${kannOrdner ? '<button data-act="ordner">Ordner verbinden</button>' : ''}`}
        <button class="haupt" data-act="speichern">${S.dirty ? 'Speichern •' : 'Speichern'}</button>
        <button data-act="mehr" aria-haspopup="dialog">Daten</button>
      </div></header>`;
  }
  function leiste() {
    const n = R.offen.length, w = S.view.typ === 'werk' && werk(S.view.id);
    const nav = (typ, txt, zahl) => `<a href="#" data-act="ansicht" data-typ="${typ}" class="${S.view.typ === typ ? 'aktiv' : ''}">${txt}${zahl ? `<i>${zahl}</i>` : ''}</a>`;
    const hgs = L().herausgeber.map(g => `<li><a href="#" data-act="bib-hg" data-id="${h(g.id)}" class="${S.view.typ === 'start' && S.bib.hg === g.id ? 'aktiv' : ''}">${h(g.kurz)}<i>${L().werke.filter(x => x.herausgeberId === g.id).length}</i></a><button class="klein" data-act="hg-edit" data-id="${h(g.id)}" aria-label="${h(g.kurz)} bearbeiten">ändern</button></li>`).join('');
    const st = w && werkStatus(w), ds = w ? dokus(w.id) : [];
    return `<nav class="leiste" aria-label="Bereiche">
      <div class="app"><span class="zeichen" aria-hidden="true"></span><h1>${h(L().meta.titel)}</h1></div>
      <div class="ansichten">${nav('start', 'Bibliothek')}${nav('offen', 'Änderungen', n)}${nav('glossar', 'Glossar')}${nav('fassung', 'Geltende Fassung')}${nav('verlauf', 'Versionen und Verlauf')}</div>
      <h3>Herausgeber</h3><ul class="hgs">${hgs}</ul>
      <p class="neu"><button data-act="werk-neu">Norm oder Schicht anlegen</button><button data-act="hg-neu">Herausgeber anlegen</button></p>
      ${w ? `<div class="aktuell"><h3>Aktuelle Norm</h3><b>${h(w.kurz)}</b><span>${h(st.pill)}${st.rechts ? ', ' + h(st.rechts) : ''}</span>${ds.length ? `<span>${ds.reduce((x, d) => x + d.seiten, 0)} Seiten</span>` : ''}${w.ausgabe ? `<span>Ausgabe ${h(w.ausgabe)}</span>` : ''}</div>` : ''}</nav>`;
  }

  // ----- Original-PDF und Anmerkungen
  const anm = id => L().anmerkungen.find(a => a.id === id);
  // ----- Ablage: verbundener Ordner (lesen und schreiben) oder Webserver (nur lesen)
  const A = { dir: null, alt: null, neuPdf: new Map(), cache: new Map(), fehler: '', laedt: true };
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
    meldung(`„${text.slice(0, 50)}“ ist jetzt ${FV[typ]}.`);
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
    const page = await doc.getPage(n), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: breite / v1.width });
    c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    if (gen !== P.gen) return;
    P.canvases.set(key, c);
    if (P.canvases.size > 14) { const k = P.canvases.keys().next().value, alt = P.canvases.get(k); P.canvases.delete(k); alt.remove(); alt.width = alt.height = 0; }
    const jetzt = document.querySelector(`#pdfseiten .seite[data-dok="${dk}"][data-seite="${n}"]`);
    if (jetzt) { const a = jetzt.querySelector('canvas'); if (a) a.remove(); jetzt.prepend(c); jetzt.dataset.fertig = '1'; if (jetzt.dataset.hybrid) textEbene(jetzt); }
  }
  async function textEbene(el) { // erkannter Text des PDF positionsgenau über dem Scan
    if (el.dataset.tl) return; el.dataset.tl = '1';
    const gen = P.gen, doc = await pdfDoc(el.dataset.dok); if (!doc || gen !== P.gen || !el.isConnected) return;
    const page = await doc.getPage(+el.dataset.seite), v1 = page.getViewport({ scale: 1 }), sc = el.clientWidth / v1.width;
    const div = document.createElement('div'); div.className = 'textebene'; div.style.setProperty('--scale-factor', sc);
    el.appendChild(div);
    await pdfLib().renderTextLayer({ textContentSource: await page.getTextContent(), container: div, viewport: page.getViewport({ scale: sc }), textDivs: [] }).promise;
    el.dataset.tlfertig = '1';
  }
  async function textImRechteck(dId, seite, r) { // Text des PDF innerhalb eines markierten Rechtecks (Anteile 0..1)
    try {
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
  function anmKarte(a) {
    const r = a.regelId && regel(a.regelId), offen = S.offen[a.id], neu = standVon(L(), 'anmerkungen', a) === 'neu';
    const hist = offen ? `<ol class="mini-verlauf">${(a.frueher || []).map(f => `<li><time>${datumCH(f.datum)}</time> ${h(f.autor)}, Fassung ${f.rev} (${h(ANM[f.art])}): ${h(f.text)}</li>`).join('')}${L().verlauf.filter(v => v.ziel === a.id).map(v => `<li><time>${datumCH(v.zeit)}</time> ${h(v.name)}: ${h(v.aktion)}</li>`).join('')}</ol>` : '';
    return `<article class="anm art-${a.art}${a.zurueckgezogen ? ' weg' : ''}${a.erledigt ? ' erledigt' : ''}${P.aktiv === a.id ? ' aktiv' : ''}" id="a-${h(a.id)}">
      <header><span class="nr">${a.nr}</span>${marke(ANM[a.art], a.art === 'frage' ? 'warn' : a.art === 'aenderung' ? 'art' : '')}<a href="#" data-act="anm-zeige" data-id="${h(a.id)}">${dokus(a.werkId).length > 1 && dokId(a.dokId) ? h(dokId(a.dokId).teil || dokId(a.dokId).datei) + ', ' : ''}Seite ${a.seite}${a.rect ? '' : ', ganze Seite'}</a></header>
      ${a.art === 'aenderung' && (a.alt || a.neu) ? `<dl class="altneu"><div><dt>Alt</dt><dd>${a.alt ? `<del class="${a.aendArt === 'ocr' ? 'ocr' : 'fach'}">${h(a.alt)}</del>` : '–'}</dd><dt>Neu</dt><dd>${a.neu ? `<ins class="${a.aendArt === 'ocr' ? 'ocr' : 'fach'}">${h(a.neu)}</ins>` : '–'}</dd></div></dl>` : ''}
      <p class="text">${h(a.text)}</p>
      <p class="grund">${h(a.autor)}, ${datumCH(a.datum)}${a.rev > 1 ? ', Fassung ' + a.rev : ''}</p>
      ${r ? `<p class="ziel">gehört zu <a href="#" data-act="zeige-regel" data-id="${h(r.id)}">${h(r.id)} ${h(r.titel)}</a></p>` : ''}
      <p class="marken">${a.art === 'aenderung' && a.aendArt ? marke(AEND[a.aendArt], a.aendArt === 'ocr' ? '' : 'art') : ''}${a.uebernommen ? marke('in den Text übernommen als ' + a.uebernommen, 'ok') : ''}${standMarke('anmerkungen', a)}${a.erledigt ? marke('erledigt', 'ok') : ''}${a.zurueckgezogen ? marke('zurückgezogen', 'weg') : ''}</p>
      <p class="aktionen">${a.art === 'aenderung' && !a.uebernommen && !a.zurueckgezogen ? `<button data-act="anm-uebernehmen" data-id="${h(a.id)}">In den Text übernehmen</button>` : ''}<button data-act="anm-edit" data-id="${h(a.id)}">Bearbeiten</button><button data-act="anm-erledigt" data-id="${h(a.id)}">${a.erledigt ? 'Wieder öffnen' : 'Erledigt'}</button>${r ? '' : `<button data-act="anm-regel" data-id="${h(a.id)}">Regel daraus anlegen</button>`}<button data-act="anm-weg" data-id="${h(a.id)}">${neu ? 'Löschen' : a.zurueckgezogen ? 'Wieder aufnehmen' : 'Zurückziehen'}</button><button data-act="anm-hist" data-id="${h(a.id)}" aria-expanded="${!!offen}">Verlauf</button></p>${hist}</article>`;
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
        L().anmerkungen.push({ id, nr, werkId: w.id, dokId: x.dokId, seite: x.seite, rect: x.rect, art: d.art, text, alt, neu, aendArt, uebernommen: '', regelId: d.regelId, autor: L().meta.bearbeiter, datum: heute(), rev: 1, erledigt: false, zurueckgezogen: false, frueher: [] });
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
    const fleck = a => `<button class="fleck art-${a.art}${a.erledigt ? ' erledigt' : ''}${P.aktiv === a.id ? ' aktiv' : ''}" id="f-${h(a.id)}" data-act="fleck" data-id="${h(a.id)}" style="left:${(a.rect.x * 100).toFixed(2)}%;top:${(a.rect.y * 100).toFixed(2)}%;width:${(a.rect.w * 100).toFixed(2)}%;height:${(a.rect.h * 100).toFixed(2)}%" aria-label="Anmerkung ${a.nr}: ${h(a.text.slice(0, 80))}"><span>${a.nr}</span></button>`;
    const seiten = zeigen.map(d => (ganz ? `<h4 class="teilkopf" style="width:${P.zoom}%">${h(name(d))}</h4>` : '') + (pdfDa(d) ? d.masse.map((m, i) => {
      const n = i + 1, hier = liste.filter(a => a.dokId === d.id && a.seite === n && !a.zurueckgezogen);
      return `<div class="seitenblock" data-dok="${h(d.id)}" data-seite="${n}" style="width:${P.zoom}%"><div class="seitenkopf"><span>${ganz ? h(name(d)) + ', ' : ''}Seite ${n}${hier.length ? ', ' + hier.length + (hier.length === 1 ? ' Anmerkung' : ' Anmerkungen') : ''}</span><button class="klein" data-act="anm-seite" data-werk="${h(w.id)}" data-dok="${h(d.id)}" data-seite="${n}">Ganze Seite kommentieren</button></div><div class="seite${P.mark ? ' mark' : ''}" data-dok="${h(d.id)}" data-seite="${n}" style="aspect-ratio:${m[0]}/${m[1]}">${hier.filter(a => a.rect).map(fleck).join('')}</div></div>`;
    }).join('') : `<p class="fehler-fest">Das PDF „${h(d.datei)}“ liegt nicht in der Ablage.</p>`)).join('');
    return `${teile}<div class="pdfleiste">
        <button data-act="pdf-mark" aria-pressed="${P.mark}" class="${P.mark ? 'haupt' : ''}">${P.mark ? 'Jetzt auf der Seite ein Rechteck aufziehen' : 'Stelle markieren und kommentieren'}</button>
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
    const mv = e => { const q = rect(e); band.style.cssText = `left:${q.x * 100}%;top:${q.y * 100}%;width:${q.w * 100}%;height:${q.h * 100}%`; };
    const ende = e => {
      s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', ende); s.removeEventListener('pointercancel', ab); band.remove();
      let q = rect(e); if (q.w < 0.012 && q.h < 0.008) q = { x: Math.max(0, Math.min(0.94, x0 - 0.03)), y: Math.max(0, Math.min(0.97, y0 - 0.012)), w: 0.06, h: 0.024 };
      q = { x: +q.x.toFixed(4), y: +q.y.toFixed(4), w: +q.w.toFixed(4), h: +q.h.toFixed(4) };
      P.mark = false; const vg = { werkId: $('#pdfseiten').dataset.werk, dokId: s.dataset.dok, seite: +s.dataset.seite, rect: q, art: P.markArt };
      textImRechteck(vg.dokId, vg.seite, q).then(t => { vg.alt = t; if (P.markArt === 'aenderung') vg.neu = t; anmForm(null, vg); });
      document.querySelectorAll('.seite.mark').forEach(n => n.classList.remove('mark'));
    };
    const ab = () => { s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', ende); s.removeEventListener('pointercancel', ab); band.remove(); };
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
  function werkStatus(w) {
    const offen = R.offen.filter(e => e.werkId === w.id).length, rs = L().regeln.filter(r => r.werkId === w.id), unb = istSchicht(w) ? 0 : rs.filter(r => !r.geprueft).length, v = letzteVersion(L());
    if (offen) return { k: 'offen', pill: 'Änderungen offen', art: 'warn', rechts: offen + ' offen' };
    if (unb) return { k: 'pruefen', pill: 'Zu bestätigen', art: '', rechts: unb + (unb === 1 ? ' Regel ungeprüft' : ' Regeln ungeprüft') };
    if (dokVon(w.id) || rs.length) return { k: 'frei', pill: 'Freigegeben', art: 'ok', rechts: v ? 'Stand ' + datumCH(v.datum) : '' };
    return { k: 'leer', pill: 'Ohne Inhalt', art: 'entwurf', rechts: '' };
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
    return L().werke.filter(w => (!S.bib.hg || w.herausgeberId === S.bib.hg) && (!S.bib.gruppe || (w.gruppe || '') === S.bib.gruppe) && (!q || (w.kurz + ' ' + w.titel).toLowerCase().includes(q)) && (!S.bib.status || (S.bib.status === 'ohnepdf' ? !dokVon(w.id) : werkStatus(w).k === S.bib.status)));
  }
  function bibInhalt() {
    const ws = bibListe();
    if (!ws.length) return '<p class="leer">Keine Norm entspricht dem Filter.</p>';
    if (!S.bib.liste) return `<ul class="karten">${ws.map(werkKarte).join('')}</ul>`;
    return `<div class="rollen"><table class="tabelle bibtab"><thead><tr><th>Norm</th><th>Titel</th><th>Gruppe</th><th>Seiten</th><th>Regeln</th><th>Status</th></tr></thead><tbody>${ws.map(w => { const st = werkStatus(w), ds = dokus(w.id); return `<tr><td><a href="#" data-act="werk-pdf" data-id="${h(w.id)}"><b>${h(w.kurz)}</b></a></td><td>${h(w.titel)}</td><td>${h(w.gruppe || hg(w.herausgeberId).kurz)}</td><td>${ds.length ? ds.reduce((x, y) => x + y.seiten, 0) : ''}</td><td>${L().regeln.filter(r => r.werkId === w.id).length || ''}</td><td>${marke(st.pill, st.art)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  const LNAME = { herausgeber: 'Herausgeber', werke: 'Norm', verknuepfungen: 'Verknüpfung', regeln: 'Regel', anmerkungen: 'Anmerkung', dokumente: 'PDF', aenderungen: 'Textänderung', formate: 'Formatänderung', glossar: 'Glossar' };
  function eintragText(e) {
    const x = e.obj;
    switch (e.liste) {
      case 'regeln': return x.id + ' ' + x.titel;
      case 'anmerkungen': return `${x.id}, Seite ${x.seite}: ${x.text}`;
      case 'aenderungen': return `${x.id}, Seite ${x.seite}: ${x.begruendung}`;
      case 'glossar': return `${x.begriff}: ${x.bedeutung}`;
      case 'formate': return `Seite ${x.seite}: „${x.text.slice(0, 60)}“ ist ${FV[x.typ]}`;
      case 'dokumente': return x.datei;
      case 'werke': return x.kurz + ' ' + x.titel;
      case 'herausgeber': return x.kurz;
      default: return (TYPEN[x.typ] || [''])[0] + ' ' + ((werk(x.nach) || {}).kurz || '');
    }
  }
  function eintragZeile(e) {
    const act = e.stand === 'entfernt' ? '' : e.liste === 'regeln' ? 'zeige-regel' : e.liste === 'anmerkungen' ? 'anm-zeige' : e.liste === 'aenderungen' ? 'aend-zeige' : e.liste === 'formate' ? 'fv-zeige' : e.liste === 'glossar' ? 'glossar-zeige' : werk(e.werkId) ? 'werk' : '';
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
            <label><span class="sr">Status</span><select id="bib-status">${opt([['', 'Alle Status'], ['offen', 'Änderungen offen'], ['pruefen', 'Zu bestätigen'], ['frei', 'Freigegeben'], ['ohnepdf', 'Ohne PDF']], S.bib.status)}</select></label>
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
      L().anmerkungen.filter(a => a.werkId === w.id).forEach(a => { const d = dokId(a.dokId) || {}; rows.push([a.id, w.kurz, d.teil || '', a.seite, ANM[a.art] + (a.aendArt ? ', ' + AEND[a.aendArt] : ''), '', a.alt || '', a.neu || '', a.text, a.regelId || '', a.autor, datumCH(a.datum), status('anmerkungen', a) + (a.erledigt ? ', erledigt' : ''), versionVon('anmerkungen', a.id) || '']); });
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
        <div class="werktitel"><h2>${h(w.kurz)}</h2><p class="lang">${h(w.titel)}</p>${marke(st.pill, st.art)}</div>
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
    const tn = L().anmerkungen.filter(a => (a.text + ' ' + a.autor).toLowerCase().includes(q));
    const ta = L().abschnitte.filter(a => (a.nr + ' ' + a.titel + ' ' + a.text).toLowerCase().includes(q)).slice(0, 60);
    const auszug = a => { const i = a.text.toLowerCase().indexOf(q); return i < 0 ? a.text.slice(0, 160) : '…' + a.text.slice(Math.max(0, i - 70), i + 110) + '…'; };
    return `<section class="blatt"><h2>Suche nach „${h(S.q)}“</h2>
      <h3>Regeln (${tr.length})</h3>${tr.map(r => `<p class="treffer-werk">${h((werk(r.werkId) || {}).kurz)}</p>${regelKarte(r)}`).join('') || '<p class="leer">Keine Regel gefunden.</p>'}
      ${tg.length ? `<h3>Glossar (${tg.length})</h3><ul class="vglliste">${tg.map(g => `<li><a href="#" data-act="glossar-zeige" data-id="${h(g.id)}"><b>${h(g.begriff)}</b></a><span>${h(g.bedeutung)}</span><span class="notiz">${h((werk(g.werkId) || {}).kurz || '')}</span></li>`).join('')}</ul>` : ''}
      <h3>Anmerkungen im PDF (${tn.length})</h3>${tn.map(a => `<p class="treffer-werk">${h((werk(a.werkId) || {}).kurz)}</p>${anmKarte(a)}`).join('') || '<p class="leer">Keine Anmerkung gefunden.</p>'}
      <h3>Originaltext (${ta.length})</h3>${ta.map(a => `<p class="treffer"><a href="#" data-act="werk-text" data-id="${h(a.werkId)}">${h((werk(a.werkId) || {}).kurz)} ${h(a.nr)} ${h(a.titel)}</a><span>${h(auszug(a))}</span></p>`).join('') || '<p class="leer">Kein Treffer im Originaltext. Originaltexte müssen zuerst eingelesen werden.</p>'}</section>`;
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
  function seitenHtml(dok, n, ansicht, ebene) {
    const basis = seitenBasis(L(), dok.id, n), ocr = textOcr(L(), dok.id, n), eff = textSchicht(L(), dok.id, n, ebene);
    return formatiert(ansicht === 'original' ? h(basis) : ansicht === 'neu' ? h(eff) : hybridHtml(basis, ocr, eff), dok.id, n);
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
    const fleck = a => `<button class="fleck art-${a.art}${a.erledigt ? ' erledigt' : ''}${P.aktiv === a.id ? ' aktiv' : ''}" id="f-${h(a.id)}" data-act="fleck" data-id="${h(a.id)}" style="left:${(a.rect.x * 100).toFixed(2)}%;top:${(a.rect.y * 100).toFixed(2)}%;width:${(a.rect.w * 100).toFixed(2)}%;height:${(a.rect.h * 100).toFixed(2)}%" aria-label="Anmerkung ${a.nr}: ${h(a.text.slice(0, 80))}"><span>${a.nr}</span></button>`;
    const links = da ? `<div id="pdfseiten" class="eine" data-werk="${h(w.id)}"><div class="seitenblock" data-dok="${h(dok.id)}" data-seite="${n}" style="width:${P.zoom}%"><div class="seite${P.mark ? ' mark' : ''}${E.links === 'hybrid' && !E.zScan ? ' ohne-scan' : ''}${E.links === 'hybrid' && !E.zText ? ' ohne-text' : ''}" data-dok="${h(dok.id)}" data-seite="${n}"${E.links === 'hybrid' ? ' data-hybrid="1"' : ''} style="aspect-ratio:${m[0]}/${m[1]};--t:${E.transp / 100}">${E.zMarken ? hier.filter(a => a.rect).map(fleck).join('') : ''}</div></div></div>`
      : `<div class="leerblock"><p>Das PDF „${h(dok.datei)}“ liegt nicht in der Ablage.</p><button class="haupt" data-act="pdf-ersetzen" data-id="${h(dok.id)}">PDF hinzufügen</button></div>`;
    let mitte;
    if (!hat) mitte = `<div class="leerblock"><p>Für dieses PDF ist noch kein Seitentext gespeichert.</p>${da ? `<button class="haupt" data-act="ed-text-lesen" data-id="${h(dok.id)}">Text aus dem PDF lesen</button>` : ''}</div>`;
    else if (E.edit) mitte = `<p class="hinweis edhinweis">Du bearbeitest ${sch ? `als <b>${h(sch.kurz)}</b>: fachliche Änderung. Das Original und der Grundtext bleiben unverändert.` : 'den <b>Grundtext</b>: OCR-Korrektur. Nur Lesefehler berichtigen, nichts am Inhalt ändern.'}</p>
        <div class="edwerkzeug"><button data-act="ed-undo" title="Rückgängig (Ctrl+Z)">Rückgängig</button><button data-act="ed-redo" title="Wiederholen (Ctrl+Y)">Wiederholen</button><span class="zeichen-leiste" aria-label="Sonderzeichen einfügen">${['Ø', '±', '≤', '≥', 'µ', '°', '²', '³', '×', '·', 'Δ', '‰', '½', '–', '„', '“', '§'].map(z => `<button data-act="ed-zeichen" data-z="${z}" aria-label="${z} einfügen">${z}</button>`).join('')}</span></div>
        <div class="edwerkzeug"><label class="fvwahl">Formatvorlage der Zeile<select id="ed-fv">${opt(Object.keys(FV).map(k => [k, FV[k]]), 'text')}</select></label></div>
        <div class="edwerkzeug suchen"><label><span class="sr">Suchen</span><input id="ed-such" value="${h(E.such)}" placeholder="Suchen"></label><label><span class="sr">Ersetzen durch</span><input id="ed-ers" value="${h(E.ers)}" placeholder="Ersetzen durch"></label><button data-act="ed-such-next">Weitersuchen</button><button data-act="ed-ers-eins">Ersetzen</button><button data-act="ed-ers-alle">Alle ersetzen</button></div>
        <label class="sr" for="ed-text">Text der Seite ${n}</label><textarea id="ed-text" spellcheck="false">${h(E.entwurf)}</textarea>
        <p class="aktionen edaktionen"><button class="haupt" data-act="ed-speichern">Änderung übernehmen</button><button data-act="ed-abbruch">Abbrechen</button></p>`;
    else { const html = seitenHtml(dok, n, E.ansicht, E.ebene); mitte = (html.trim() ? `<div class="lesetext">${html}</div>` : '<p class="leer edleer">Auf dieser Seite wurde kein Text erkannt. Über „Text bearbeiten“ lässt er sich von Hand erfassen.</p>') + (E.ansicht === 'hybrid' ? LEGENDE : ''); }
    const zeigA = E.filter !== 'kommentar', zeigK = E.filter === 'alle' || E.filter === 'kommentar';
    const aL = zeigA ? aes.filter(a => E.filter === 'alle' || a.art === E.filter) : [], kL = zeigK ? anms : [];
    const teil = (titel, f) => { const x = aL.filter(f).sort((a, b) => a.seite - b.seite || a.nr - b.nr).map(aendKarte).join('') + kL.filter(f).sort((a, b) => a.seite - b.seite || a.nr - b.nr).map(anmKarte).join(''); return x ? `<h4>${titel}</h4>${x}` : ''; };
    const liste = teil('Auf dieser Seite', a => a.seite === n) + teil('Auf anderen Seiten', a => a.seite !== n);
    const chip = (k, t, z) => `<button data-act="ed-filter" data-v="${k}" aria-pressed="${E.filter === k}">${t} (${z})</button>`;
    const sicht = (k, t) => `<button data-act="ed-ansicht" data-v="${k}" aria-pressed="${E.ansicht === k}">${t}</button>`;
    const bl = bloeckeVon(dok.id), kap = bl.filter(b => /^u\d$/.test(b.typ) || b.typ === 'titel');
    const inhalt = `<details class="inhalt" ${E.inhaltAuf ? 'open' : ''}><summary data-act="ed-inhalt">Inhalt${kap.length ? ' (' + kap.length + ')' : ''}</summary><div class="inhaltliste">${L().struktur[dok.id] ? (kap.map(b => `<a href="#" data-act="ed-gehe" data-s="${b.s}" class="iv-${b.typ}${b.s === n ? ' hier' : ''}"><span>${h(b.t.slice(0, 80))}</span><i>${b.s}</i></a>`).join('') || '<p class="leer">In diesem PDF wurden keine Überschriften erkannt. Im Text lässt sich einer Zeile die Formatvorlage „Überschrift“ zuweisen.</p>') : `<p class="leer">Für dieses PDF ist die Struktur noch nicht erkannt.</p>`}<p class="feldfuss"><button data-act="struktur-neu" data-id="${h(w.id)}">Struktur neu erkennen</button></p></div></details>`;
    return `<div class="pdfleiste edleiste">
        ${inhalt}
        ${ds.length > 1 ? `<label class="sprung">Teil<select id="ed-dok">${opt(ds.map(d => [d.id, d.teil || d.datei]), dok.id)}</select></label>` : ''}
        <span class="zoom"><button data-act="ed-seite" data-d="-1" aria-label="Vorherige Seite" ${n <= 1 ? 'disabled' : ''}>‹</button><label class="sprung">Seite<input type="number" id="ed-sprung" min="1" max="${N}" value="${n}"> von ${N}</label><button data-act="ed-seite" data-d="1" aria-label="Nächste Seite" ${n >= N ? 'disabled' : ''}>›</button></span>
        <label class="sprung">Ich bearbeite<select id="ed-ebene">${opt([['', 'Grundtext (OCR-Korrektur)']].concat(schichten.map(x => [x.id, x.kurz + ' (fachlich)'])), E.ebene)}</select></label>
        <span class="rechts"><button data-act="ed-druck">Drucken oder Word</button><button data-act="ed-pdf">PDF exportieren</button><button data-act="protokoll-csv" data-id="${h(w.id)}">Protokoll für Excel</button></span>
      </div>
      <div class="edgrid">
        <section class="edspalte" aria-label="Original"><header class="edkopf"><h3>Original</h3><span class="edtools">${marke('unverändert', 'ok')}<span class="zoom"><button data-act="pdf-zoom" data-d="-25" aria-label="Kleiner">−</button><output>${P.zoom} %</output><button data-act="pdf-zoom" data-d="25" aria-label="Grösser">+</button></span></span></header>
          <p class="edzeile">${['aenderung', 'kommentar'].map(k => { const an = P.mark && P.markArt === k; return `<button data-act="pdf-mark" data-art="${k}" aria-pressed="${an}" class="${an ? 'haupt' : ''}">${an ? 'Jetzt die Stelle im Scan einrahmen' : k === 'aenderung' ? 'Änderung im Scan vorschlagen' : 'Stelle kommentieren'}</button>`; }).join('')}<button data-act="anm-seite" data-werk="${h(w.id)}" data-dok="${h(dok.id)}" data-seite="${n}">Ganze Seite kommentieren</button></p>
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
      ${anms.map(a => `<tr><td>A${a.nr}</td><td>${teil(a)}S. ${a.seite}</td><td>${ANM[a.art]}${a.aendArt ? ', ' + AEND[a.aendArt] : ''}${standVon(L(), 'anmerkungen', a) === 'frei' ? '' : ' (nicht freigegeben)'}</td><td>${h(a.alt || '')}</td><td>${h(a.neu || '')}</td><td>${h(a.text)}</td><td>${h(a.autor)}, ${datumCH(a.datum)}</td></tr>`).join('')}</tbody></table>`;
  }
  function druckHtml(w, opt, fuerWord) {
    const E = S.ed, akt = dokId(E.dok), ds = opt.umfang === 'alles' ? dokus(w.id) : [akt], sch = E.ebene && werk(E.ebene), v = letzteVersion(L());
    const wahl = opt.umfang === 'seite' ? [E.seite] : opt.umfang === 'auswahl' ? seitenListe(opt.seiten, akt.seiten) : null;
    const namen = { original: 'Grundtext aus dem PDF', hybrid: 'Mit markierten Änderungen', neu: 'Neu (geltender Text)' }, entwurf = istEntwurf(w, sch);
    let html = `<header><h1>${h(w.kurz)}</h1><p class="dtitel">${h(w.titel)}</p>${entwurf && opt.ansicht !== 'original' ? '<p class="entwurf"><b>ENTWURF.</b> Enthält nicht freigegebene Änderungen.</p>' : `<p><b>${opt.ansicht === 'original' ? 'Grundtext ohne Änderungen.' : 'Freigegebene Fassung.'}</b></p>`}<p>Ansicht: ${namen[opt.ansicht]}. Ebene: ${sch ? h(sch.kurz) : 'Grundtext'}. Bibliothek ${v ? 'Version ' + v.nr + ' vom ' + datumCH(v.datum) : 'ohne Version'}. Ausgegeben am ${datumCH(heute())}${L().meta.bearbeiter ? ' von ' + h(L().meta.bearbeiter) : ''}.</p>${sch && ebeneVon(sch) === 'hersteller' && opt.ansicht !== 'original' ? '<p class="vermerk">Herstellernorm – keine behördliche Norm</p>' : ''}<p>Dies ist der erkannte Text, nicht das Original. Massgebend ist das Original-PDF.</p>${opt.ansicht === 'hybrid' ? LEGENDE : ''}</header>`;
    let anzahl = 0;
    ds.forEach(d => { const liste = wahl || Array.from({ length: d.seiten }, (_, i) => i + 1); if (ds.length > 1) html += `<h2 class="dteil">${h(d.teil || d.datei)}</h2>`; liste.forEach(n => { let t = seitenHtml(d, n, opt.ansicht, E.ebene); if (fuerWord) t = t.replace(/\n/g, '<br>'); anzahl++; html += `<section class="dseite"><h3>Seite ${n}</h3><div class="lesetext">${t.trim() ? t : '<i>kein erkannter Text</i>'}</div></section>`; }); });
    if (opt.verzeichnis) html += `<section class="dverz"><h2>Änderungsverzeichnis</h2>${verzeichnisHtml(w, ds, a => !wahl || wahl.includes(a.seite), opt.kommentare)}</section>`;
    return { html, anzahl };
  }
  function drucken(w, opt) {
    const { html } = druckHtml(w, opt, false), alt = document.getElementById('druck'); if (alt) alt.remove();
    const el = document.createElement('div'); el.id = 'druck'; el.innerHTML = html; document.body.appendChild(el); document.body.classList.add('druckt');
    setTimeout(() => window.print(), 60);
  }
  function wordExport(w, opt) {
    const { html } = druckHtml(w, opt, true);
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${h(w.kurz)}</title><style>body{font-family:Cambria,Georgia,serif;font-size:11pt}h1{font-family:Calibri,Arial,sans-serif;font-size:22pt}h2{font-family:Calibri,Arial,sans-serif;font-size:14pt}h3{font-family:Calibri,Arial,sans-serif;font-size:9pt;color:#555;font-weight:normal;border-top:1px solid #999}header p,table{font-family:Calibri,Arial,sans-serif;font-size:9pt}.entwurf{color:#A8261D;font-size:12pt}ins{background:#CFEFD8;color:#0E4D27;text-decoration:underline}del{background:#F9D5D1;color:#8A1C14;text-decoration:line-through}ins.ocr{background:#D7E5FB;color:#173B7A}del.ocr{background:#EDF1F7;color:#5E6E88}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;vertical-align:top;text-align:left}</style></head><body>${html}</body></html>`;
    herunterladenBlob(`${w.kurz.replace(/[^A-Za-z0-9äöüÄÖÜ-]+/g, '_')}_${opt.ansicht === 'neu' ? 'Fassung' : opt.ansicht === 'hybrid' ? 'mit_Aenderungen' : 'Grundtext'}.doc`, new Blob(['﻿', doc], { type: 'application/msword' }));
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
    const notiz = a => { zeile(`A${a.nr}  ${ANM[a.art]}${a.rect ? '' : ' zur ganzen Seite'}${standVon(L(), 'anmerkungen', a) === 'frei' ? '' : ' (nicht freigegeben)'}`, { fett: true }); if (a.alt) zeile('Alt: ' + a.alt, { ein: 14, farbe: FARBE.rot }); if (a.neu) zeile('Neu: ' + a.neu, { ein: 14, farbe: a.aendArt === 'ocr' ? FARBE.blau : FARBE.gruen }); zeile(a.text, { ein: 14 }); zeile(`${a.autor}, ${datumCH(a.datum)}`, { ein: 14, g: 8, farbe: FARBE.leise }); y -= 6; };
    if (opt.deckblatt) {
      neu(''); zeile('Normenbibliothek, Export mit Änderungen', { g: 9, farbe: FARBE.leise }); y -= 14; zeile(w.kurz, { fett: true, g: 26 }); y -= 4; zeile(w.titel, { g: 13 }); y -= 16;
      [['Herausgeber', g.name], ['Ausgabe', w.ausgabe], ['Stand der Bibliothek', v ? `Version ${v.nr} vom ${datumCH(v.datum)}` + (R.offen.length ? ', mit nicht freigegebenen Änderungen' : '') : 'keine Version'], ['Exportiert', datumCH(heute()) + (L().meta.bearbeiter ? ' von ' + L().meta.bearbeiter : '')], ['Umfang', `${wahl ? wahl.length : ds.reduce((x, d) => x + d.seiten, 0)} Originalseiten, ${aesAlle.length} ${aesAlle.length === 1 ? 'Textänderung' : 'Textänderungen'}, ${anmAlle.length} ${anmAlle.length === 1 ? 'Anmerkung' : 'Anmerkungen'}`]].filter(x => x[1]).forEach(x => zeile(x[0] + ': ' + x[1]));
      if (istEntwurf(w, null) || aesAlle.some(a => standVon(L(), 'aenderungen', a) !== 'frei')) { y -= 8; zeile('ENTWURF. Enthält nicht freigegebene Änderungen.', { fett: true, g: 13, farbe: FARBE.rot }); }
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
        if (opt.marken) { const { width, height } = p.getSize(); a2.filter(a => a.rect).forEach(a => { const c = a.art === 'frage' ? FARBE.rot : a.art === 'aenderung' ? rgb(0.78, 0.37, 0) : FARBE.blau, x = a.rect.x * width, yy = height - (a.rect.y + a.rect.h) * height; p.drawRectangle({ x, y: yy, width: a.rect.w * width, height: a.rect.h * height, borderColor: c, borderWidth: 1.2, color: c, opacity: 0.1, borderOpacity: 1 }); p.drawRectangle({ x, y: yy + a.rect.h * height, width: 22, height: 11, color: c }); p.drawText('A' + a.nr, { x: x + 3, y: yy + a.rect.h * height + 2.5, size: 8, font: fett, color: rgb(1, 1, 1) }); }); }
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
      return `<tr class="${g.zurueckgezogen ? 'weg' : ''}${erst ? ' erst' : ''}" id="g-${h(g.id)}"><th scope="row">${erst ? h(g.begriff) : ''}</th><td>${h(g.bedeutung)}</td><td>${w ? `<a href="#" data-act="${d && g.seite ? 'pdf-seite' : 'werk'}" data-id="${h(w.id)}"${d ? ` data-dok="${h(d.id)}"` : ''} data-seite="${h(g.seite || '')}">${h(w.kurz)}${g.seite ? ', S. ' + h(g.seite) : ''}</a>` : 'ohne Quelle'}</td><td>${g.geprueft ? marke('am Original geprüft', 'ok') : marke('zu bestätigen', 'warn')}${standMarke('glossar', g)}${g.zurueckgezogen ? marke('zurückgezogen', 'weg') : ''}</td><td class="tat"><button class="klein" data-act="glossar-edit" data-id="${h(g.id)}">bearbeiten</button><button class="klein" data-act="glossar-pruef" data-id="${h(g.id)}">${g.geprueft ? 'Prüfvermerk entfernen' : 'geprüft'}</button><button class="klein" data-act="glossar-weg" data-id="${h(g.id)}">${standVon(L(), 'glossar', g) === 'neu' ? 'löschen' : g.zurueckgezogen ? 'wieder aufnehmen' : 'zurückziehen'}</button></td></tr>`; }).join('');
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
    const l = L(), kern = {}; Object.keys(l).forEach(k => { if (!['seitentext', 'abschnitte', 'struktur', 'titelbilder'].includes(k)) kern[k] = l[k]; });
    return { 'daten/bibliothek.json': JSON.stringify(kern, null, 1), 'daten/texte.json': JSON.stringify({ seitentext: l.seitentext, abschnitte: l.abschnitte, struktur: l.struktur }), 'daten/titelbilder.json': JSON.stringify(l.titelbilder) };
  }
  function herunterladen(name, text, typ) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: typ })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function speichern() {
    if (!A.dir) { herunterladen('bibliothek.json', teileDaten()['daten/bibliothek.json'], 'application/json'); return meldung('Ohne verbundenen Ordner lässt sich nicht direkt speichern. Die Datei bibliothek.json wurde heruntergeladen; sie gehört in den Ordner „daten“.' + (A.neuPdf.size ? ' Neu hinzugefügte PDF und neu gelesene Texte sind darin nicht enthalten.' : '')); }
    try {
      for (const [id, bytes] of A.neuPdf) { const d = dokId(id); if (d) await schreibe(d.pfad, bytes); }
      A.neuPdf.clear();
      const t = teileDaten(); for (const p of Object.keys(t)) await schreibe(p, t[p]);
      S.dirty = false; render(); meldung('Gespeichert im Ordner „' + A.dir.name + '“.');
    } catch (e) { meldung('Speichern fehlgeschlagen: ' + (e.message || e)); }
  }
  async function ladeBibliothek() {
    const bib = JSON.parse(await liesText('daten/bibliothek.json')); let texte = {}, bilder = {};
    try { texte = JSON.parse(await liesText('daten/texte.json')); } catch (e) { /* ohne Texte weiter */ }
    try { bilder = JSON.parse(await liesText('daten/titelbilder.json')); } catch (e) { /* werden nachgeholt */ }
    S.lib = Object.assign(bib, { seitentext: texte.seitentext || {}, abschnitte: texte.abschnitte || [], struktur: texte.struktur || {}, titelbilder: bilder || {} });
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
    return `<div class="startschirm"><span class="zeichen" aria-hidden="true"></span><h1>Normenbibliothek</h1>
      ${A.laedt ? '<p class="lead">Die Bibliothek wird geladen …</p>' : `<p class="lead">Die Bibliothek liegt als Ordner vor: Programm, Daten und Original-PDF nebeneinander. Wähle den Ordner des Repos, dann liest und speichert das Programm direkt darin.</p>
      ${A.fehler ? `<p class="fehler-fest">${h(A.fehler)}</p>` : ''}
      ${kannOrdner ? `<p class="aktionen">${A.alt ? `<button class="haupt" data-act="ordner-alt">Ordner „${h(A.alt.name)}“ wieder öffnen</button>` : ''}<button class="${A.alt ? '' : 'haupt'}" data-act="ordner">Ordner der Bibliothek wählen</button></p>` : '<p class="fehler-fest">Dieser Browser kann keine Ordner öffnen. Bitte Edge oder Chrome verwenden oder die Bibliothek über einen Webserver aufrufen.</p>'}`}</div>`;
  }
  async function hochfahren() {
    render();
    if (webModus) { try { await ladeBibliothek(); return; } catch (e) { A.fehler = 'Die Bibliothek lässt sich nicht laden: ' + (e.message || e); } }
    A.alt = await idb('get'); A.laedt = false; render();
  }
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
      if (d.ausgabe === 'word') { wordExport(w, o); meldung('Word-Datei gespeichert.'); } else drucken(w, o);
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
    'pdf-zoom': el => { P.zoom = Math.max(50, Math.min(250, P.zoom + (+el.dataset.d))); },
    'pdf-mark': el => mitName(() => { const art = el.dataset.art || 'kommentar'; P.mark = !(P.mark && P.markArt === art); P.markArt = art; render(); }),
    'anm-seite': el => mitName(() => anmForm(null, { werkId: el.dataset.werk, dokId: el.dataset.dok, seite: +el.dataset.seite, rect: null })),
    'anm-edit': el => mitName(() => anmForm(anm(el.dataset.id))),
    'anm-zeige': el => { const a = anm(el.dataset.id); geheZu(a.werkId, a.seite, a.id, a.dokId); },
    fleck: el => { P.aktiv = el.dataset.id; document.querySelectorAll('.fleck.aktiv,.anm.aktiv').forEach(n => n.classList.remove('aktiv')); el.classList.add('aktiv'); const k = document.getElementById('a-' + el.dataset.id); if (k) { k.classList.add('aktiv'); k.scrollIntoView({ block: 'nearest' }); } return false; },
    'anm-erledigt': el => mitName(() => { const a = anm(el.dataset.id); a.erledigt = !a.erledigt; log(a.erledigt ? 'Anmerkung erledigt' : 'Anmerkung wieder offen', a.id); render(); }),
    'anm-weg': el => mitName(() => { const a = anm(el.dataset.id); if (standVon(L(), 'anmerkungen', a) === 'neu') { L().anmerkungen = L().anmerkungen.filter(x => x !== a); log('Nicht freigegebene Anmerkung gelöscht', a.id); } else { a.zurueckgezogen = !a.zurueckgezogen; log(a.zurueckgezogen ? 'Anmerkung zurückgezogen' : 'Anmerkung wieder aufgenommen', a.id); } render(); }),
    'anm-hist': el => { S.offen[el.dataset.id] = !S.offen[el.dataset.id]; },
    'anm-regel': el => mitName(() => { const a = anm(el.dataset.id); regelForm(null, { werkId: a.werkId, dokId: a.dokId, pdfSeite: String(a.seite), abschnitt: '', titel: '', text: a.text, params: [], anmId: a.id, quelle: 'Anmerkung ' + a.id }); }),
    ansicht: el => { S.view = { typ: el.dataset.typ }; },
    werk: el => { if (!werk(el.dataset.id)) return; S.view = { typ: 'werk', id: el.dataset.id }; S.tab = 'regeln'; },
    'werk-text': el => { S.view = { typ: 'werk', id: el.dataset.id }; S.tab = 'text'; },
    tab: el => { if (edGesperrt()) return false; S.tab = el.dataset.tab; },
    'zeige-regel': el => { const r = regel(el.dataset.id); S.view = { typ: 'werk', id: r.werkId }; S.tab = 'regeln'; render(); const z = document.getElementById('r-' + r.id); if (z) z.scrollIntoView({ block: 'center' }); return false; },
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
    freigeben: () => mitName(() => dialog('Änderungen freigeben', `<p>${offeneAenderungen(L())} Änderungen werden zur Version ${L().versionen.length + 1}. Freigegebene Versionen lassen sich nicht mehr ändern.</p>${bereich('notiz', 'Was wurde geändert?', '', 'required')}<p class="hinweis">Solange nur eine Person arbeitet, gibt dieselbe Person frei. Eine Zweitprüfung ist noch nicht eingebaut.</p>`, d => { const v = neueVersion(L(), L().meta.bearbeiter, d.notiz.trim(), heute()); S.wahlAus.clear(); log('Version freigegeben', 'Version ' + v.nr, d.notiz.trim()); meldung('Version ' + v.nr + ' freigegeben. Jetzt speichern.'); }, 'Freigeben')),
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
    'glossar-neu': () => mitName(() => glossarForm(null)),
    'glossar-edit': el => mitName(() => glossarForm(L().glossar.find(g => g.id === el.dataset.id))),
    'glossar-pruef': el => mitName(() => { const g = L().glossar.find(x => x.id === el.dataset.id); g.geprueft = g.geprueft ? null : { name: L().meta.bearbeiter, datum: heute() }; log(g.geprueft ? 'Glossareintrag am Original geprüft' : 'Prüfvermerk am Glossareintrag entfernt', g.id, g.begriff); render(); }),
    'glossar-weg': el => mitName(() => { const g = L().glossar.find(x => x.id === el.dataset.id); if (standVon(L(), 'glossar', g) === 'neu') { L().glossar = L().glossar.filter(x => x !== g); log('Nicht freigegebener Glossareintrag gelöscht', g.id, g.begriff); } else { g.zurueckgezogen = !g.zurueckgezogen; log(g.zurueckgezogen ? 'Glossareintrag zurückgezogen' : 'Glossareintrag wieder aufgenommen', g.id, g.begriff); } render(); }),
    'glossar-zeige': el => { const g = L().glossar.find(x => x.id === el.dataset.id); S.view = { typ: 'glossar' }; S.gq = g ? g.begriff : ''; },
    'ed-inhalt': () => { S.ed.inhaltAuf = !S.ed.inhaltAuf; return false; },
    'ed-gehe': el => { if (edGesperrt()) return false; S.ed.seite = +el.dataset.s; S.ed.inhaltAuf = false; },
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
    else if (t.id === 'ed-z-scan') { S.ed.zScan = t.checked; render(); }
    else if (t.id === 'ed-z-text') { S.ed.zText = t.checked; render(); }
    else if (t.id === 'ed-z-marken') { S.ed.zMarken = t.checked; render(); }
    else if (t.id === 'bib-gruppe') { S.bib.gruppe = t.value; render(); }
    else if (t.id === 'bib-status') { S.bib.status = t.value; render(); }
    else if (t.id === 'ed-sprung') { if (!edGesperrt()) S.ed.seite = +t.value || 1; render(); }
    else if (t.id === 'ed-dok') { if (!edGesperrt()) { S.ed.dok = t.value; S.ed.seite = 1; } render(); }
    else if (t.id === 'ed-ebene') { if (!edGesperrt()) S.ed.ebene = t.value; render(); }
    else if (t.id === 'daten-datei' && t.files[0]) datenImport(t.files[0]);
  });
  window.addEventListener('beforeunload', ev => { if (S.dirty || (S.ed.edit && S.tab === 'edit')) { ev.preventDefault(); ev.returnValue = ''; } });
  window.__nb = { S, A, teileDaten, oeffne: (id, tab) => { S.view = { typ: 'werk', id }; S.tab = tab || 'regeln'; S.ed.edit = false; render(); } };
  hochfahren();
})();
