// Normenbibliothek für mehrere Nutzer: Anmeldung, Rollen, Bearbeitungssperre, Speichern auf dem Server.
//   node werkzeuge/mehrnutzer.js [--port 8080] [--git] [--ordner <Bibliothek>] [--privat <Ordner für Benutzer und Stand>]
// Braucht nur Node.js (ab 18), keine weiteren Pakete. Für den Betrieb im Firmennetz hinter einen HTTPS-Proxy stellen
// und mit --sicher starten (Cookie nur über HTTPS).
//
// Rollen: gast (lesen) · autor (bearbeiten, speichern) · pruefer (zusätzlich Erstfreigabe, Rückgabe, Versionen freigeben) · admin (zusätzlich Benutzer verwalten, Sperre aufheben)
// Es bearbeitet immer nur eine Person gleichzeitig (Bearbeitungssperre); alle anderen lesen und sehen neue Stände von selbst.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFile } = require('child_process');
const { server: statisch } = require('./server.js');

const ROLLEN = ['gast', 'autor', 'pruefer', 'admin'];
const DATEIEN = ['daten/bibliothek.json', 'daten/texte.json', 'daten/titelbilder.json'];
const SPERRE_MS = 3 * 60 * 1000, SITZUNG_MS = 12 * 3600 * 1000, FEHLVERSUCHE = 5, PAUSE_MS = 10 * 60 * 1000;

function hashPw(pw, salz) { return crypto.scryptSync(String(pw), salz, 64).toString('hex'); }
function gleich(a, b) { const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); }
const kennung = n => String(n || '').trim().toLowerCase();

// Prüft, ob ein neuer Stand gegenüber dem alten für die Rolle zulässig ist. Liefert '' oder den Grund der Ablehnung.
function pruefeStand(alt, neu, rolle) {
  if (!neu || !Array.isArray(neu.werke) || !Array.isArray(neu.versionen) || !Array.isArray(neu.verlauf) || !Array.isArray(neu.regeln)) return 'Die Datei ist kein gültiger Stand der Bibliothek.';
  if (neu.versionen.length < alt.versionen.length) return 'Freigegebene Versionen lassen sich nicht löschen.';
  for (let i = 0; i < alt.versionen.length; i++) if (JSON.stringify(alt.versionen[i]) !== JSON.stringify(neu.versionen[i])) return `Version ${alt.versionen[i].nr} ist freigegeben und lässt sich nicht ändern.`;
  if (neu.verlauf.length < alt.verlauf.length) return 'Der Verlauf lässt sich nicht kürzen.';
  for (let i = 0; i < alt.verlauf.length; i++) if (JSON.stringify(alt.verlauf[i]) !== JSON.stringify(neu.verlauf[i])) return 'Frühere Einträge im Verlauf lassen sich nicht ändern.';
  const darfFrei = rolle === 'pruefer' || rolle === 'admin';
  if (!darfFrei) {
    if (neu.versionen.length !== alt.versionen.length) return 'Versionen freigeben dürfen nur Prüfer.';
    const st = w => (w && w.digital && w.digital.status) || 'ungeprueft', am = new Map(alt.werke.map(w => [w.id, w]));
    for (const w of neu.werke) {
      const a = am.get(w.id), vor = st(a), nach = st(w);
      if (vor === nach) { if (vor === 'freigegeben' && JSON.stringify(a.digital) !== JSON.stringify(w.digital)) return `Die Freigabe von ${w.kurz || w.id} lässt sich nur von Prüfern ändern.`; continue; }
      if (nach === 'freigegeben') return `Die Erstfreigabe (${w.kurz || w.id}) dürfen nur Prüfer erteilen.`;
      if (nach === 'korrektur') return `Zur Korrektur zurückgeben (${w.kurz || w.id}) dürfen nur Prüfer.`;
    }
  }
  return '';
}

function mehrnutzer(opt) {
  const wurzel = path.resolve(opt.ordner), privat = path.resolve(opt.privat || path.join(wurzel, 'server')), stat = statisch(wurzel);
  const fBenutzer = path.join(privat, 'benutzer.json'), fStand = path.join(privat, 'stand.json');
  fs.mkdirSync(privat, { recursive: true });
  const lies = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
  const schreib = (f, inhalt) => { const t = f + '.neu' + process.pid; fs.writeFileSync(t, inhalt); fs.renameSync(t, f); };
  let benutzer = lies(fBenutzer, null), stand = lies(fStand, { revision: 1 }), sperre = null;
  const sitzungen = new Map(), fehl = new Map();
  const sichern = () => schreib(fBenutzer, JSON.stringify(benutzer, null, 1));
  let erstPasswort = '';
  if (!benutzer) {
    erstPasswort = opt.adminPasswort || crypto.randomBytes(9).toString('base64url');
    const salz = crypto.randomBytes(16).toString('hex');
    benutzer = [{ name: 'admin', anzeige: 'Admin', rolle: 'admin', salz, hash: hashPw(erstPasswort, salz), aktiv: true, neuSetzen: !opt.adminPasswort }]; sichern();
  }
  const sperreAktiv = () => { if (sperre && sperre.bis < Date.now()) sperre = null; return sperre; };
  const oeffentlich = s => s ? { name: s.anzeige, seit: s.seit } : null;

  function antwort(res, code, obj, kopf) { const t = JSON.stringify(obj); res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(t) }, kopf || {})); res.end(t); }
  function koerper(req, max) { return new Promise((ok, nein) => { const teile = []; let n = 0; req.on('data', c => { n += c.length; if (n > max) { nein(Object.assign(new Error('zu gross'), { code: 413 })); req.destroy(); } else teile.push(c); }); req.on('end', () => ok(Buffer.concat(teile))); req.on('error', nein); }); }
  function sitzung(req) {
    const m = /(?:^|;\s*)nb=([A-Za-z0-9_-]{20,})/.exec(req.headers.cookie || ''), s = m && sitzungen.get(m[1]);
    if (!s) return null;
    if (s.bis < Date.now()) { sitzungen.delete(m[1]); return null; }
    const b = benutzer.find(x => x.name === s.name); if (!b || !b.aktiv) { sitzungen.delete(m[1]); return null; }
    s.bis = Date.now() + SITZUNG_MS; return { token: m[1], name: b.name, anzeige: b.anzeige, rolle: b.rolle, neuSetzen: !!b.neuSetzen };
  }
  // Schutz vor fremden Seiten: Schreibende Aufrufe müssen von derselben Herkunft kommen
  const gleicheHerkunft = req => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch (e) { return false; } };
  const pwGut = p => typeof p === 'string' && p.length >= 10;

  async function api(req, res, pfad, s) {
    const M = req.method;
    if (M !== 'GET' && !gleicheHerkunft(req)) return antwort(res, 403, { fehler: 'Aufruf von fremder Seite abgelehnt.' });
    if (pfad === '/api/ich' && M === 'GET') return antwort(res, 200, { modus: 'mehrnutzer', angemeldet: !!s, name: s ? s.name : '', anzeige: s ? s.anzeige : '', rolle: s ? s.rolle : '', neuSetzen: s ? s.neuSetzen : false, revision: stand.revision });
    if (pfad === '/api/anmelden' && M === 'POST') {
      const d = JSON.parse((await koerper(req, 4096)).toString('utf8') || '{}'), k = kennung(d.name), schluessel = k + '|' + (req.socket.remoteAddress || ''), f = fehl.get(schluessel);
      if (f && f.n >= FEHLVERSUCHE && f.bis > Date.now()) return antwort(res, 429, { fehler: `Zu viele Fehlversuche. Bitte in ${Math.ceil((f.bis - Date.now()) / 60000)} Minuten erneut versuchen.` });
      const b = benutzer.find(x => x.name === k);
      const ok = !!b && b.aktiv && gleich(hashPw(d.passwort || '', b.salz), b.hash);
      if (!b) hashPw(d.passwort || '', '00'); // gleiche Rechenzeit, damit sich Namen nicht erraten lassen
      if (!ok) { const e = f && f.bis > Date.now() ? f : { n: 0, bis: 0 }; e.n++; e.bis = Date.now() + PAUSE_MS; fehl.set(schluessel, e); return antwort(res, 401, { fehler: 'Name oder Passwort stimmt nicht.' }); }
      fehl.delete(schluessel);
      const token = crypto.randomBytes(32).toString('base64url'); sitzungen.set(token, { name: b.name, bis: Date.now() + SITZUNG_MS });
      return antwort(res, 200, { name: b.name, anzeige: b.anzeige, rolle: b.rolle, neuSetzen: !!b.neuSetzen }, { 'Set-Cookie': `nb=${token}; HttpOnly; SameSite=Strict; Path=/${opt.sicher ? '; Secure' : ''}` });
    }
    if (!s) return antwort(res, 401, { fehler: 'Bitte anmelden.' });
    if (pfad === '/api/abmelden' && M === 'POST') { if (sperre && sperre.token === s.token) sperre = null; sitzungen.delete(s.token); return antwort(res, 200, {}, { 'Set-Cookie': 'nb=; Max-Age=0; Path=/' }); }
    if (pfad === '/api/passwort' && M === 'POST') {
      const d = JSON.parse((await koerper(req, 4096)).toString('utf8') || '{}'), b = benutzer.find(x => x.name === s.name);
      if (!gleich(hashPw(d.alt || '', b.salz), b.hash)) return antwort(res, 403, { fehler: 'Das bisherige Passwort stimmt nicht.' });
      if (!pwGut(d.neu)) return antwort(res, 400, { fehler: 'Das neue Passwort braucht mindestens 10 Zeichen.' });
      b.salz = crypto.randomBytes(16).toString('hex'); b.hash = hashPw(d.neu, b.salz); b.neuSetzen = false; sichern();
      for (const [t, x] of sitzungen) if (x.name === b.name && t !== s.token) sitzungen.delete(t);
      return antwort(res, 200, {});
    }
    if (pfad === '/api/stand' && M === 'GET') { const sp = sperreAktiv(); return antwort(res, 200, { revision: stand.revision, sperre: oeffentlich(sp), ich: !!sp && sp.token === s.token }); }
    if (pfad === '/api/sperre' && M === 'POST') {
      const d = JSON.parse((await koerper(req, 4096)).toString('utf8') || '{}'), sp = sperreAktiv();
      if (d.aktion === 'geben') { if (sp && sp.token === s.token) sperre = null; return antwort(res, 200, { revision: stand.revision, sperre: null, ich: false }); }
      if (d.aktion === 'aufheben') { if (s.rolle !== 'admin') return antwort(res, 403, { fehler: 'Die Sperre aufheben darf nur der Admin.' }); sperre = null; return antwort(res, 200, { revision: stand.revision, sperre: null, ich: false }); }
      if (s.rolle === 'gast') return antwort(res, 403, { fehler: 'Gäste können lesen, aber nicht bearbeiten.' });
      if (sp && sp.token !== s.token) return antwort(res, 423, { fehler: `${sp.anzeige} bearbeitet gerade.`, revision: stand.revision, sperre: oeffentlich(sp), ich: false });
      if (!sp && d.revision !== undefined && d.revision !== stand.revision) return antwort(res, 409, { fehler: 'Auf dem Server liegt ein neuerer Stand.', revision: stand.revision, sperre: null, ich: false });
      sperre = { token: s.token, name: s.name, anzeige: s.anzeige, seit: sp ? sp.seit : new Date().toISOString(), bis: Date.now() + SPERRE_MS };
      return antwort(res, 200, { revision: stand.revision, sperre: oeffentlich(sperre), ich: true });
    }
    if (pfad === '/api/daten' && M === 'PUT') {
      if (s.rolle === 'gast') return antwort(res, 403, { fehler: 'Gäste können nicht speichern.' });
      const sp = sperreAktiv();
      if (!sp || sp.token !== s.token) return antwort(res, 423, { fehler: sp ? `${sp.anzeige} bearbeitet gerade. Der Stand wurde nicht gespeichert.` : 'Die Bearbeitungssperre ist abgelaufen. Bitte „Bearbeiten“ wählen und erneut speichern.' });
      const d = JSON.parse((await koerper(req, 80 * 1024 * 1024)).toString('utf8'));
      if (d.revision !== stand.revision) return antwort(res, 409, { fehler: 'Auf dem Server liegt ein neuerer Stand. Der eigene Stand wurde nicht gespeichert.', revision: stand.revision });
      const dateien = d.dateien || {};
      for (const p of Object.keys(dateien)) { if (!DATEIEN.includes(p)) return antwort(res, 400, { fehler: 'Unbekannte Datei: ' + p }); try { JSON.parse(dateien[p]); } catch (e) { return antwort(res, 400, { fehler: p + ' ist kein gültiges JSON.' }); } }
      if (dateien[DATEIEN[0]]) {
        const alt = lies(path.join(wurzel, DATEIEN[0]), null), neu = JSON.parse(dateien[DATEIEN[0]]);
        const grund = alt ? pruefeStand(alt, neu, s.rolle) : ''; if (grund) return antwort(res, 403, { fehler: grund });
        // neue Einträge im Verlauf tragen den angemeldeten Namen
        const ab = alt ? alt.verlauf.length : neu.verlauf.length; let geaendert = false;
        for (let i = ab; i < neu.verlauf.length; i++) if (neu.verlauf[i].name !== s.anzeige) { neu.verlauf[i].name = s.anzeige; geaendert = true; }
        if (neu.meta && neu.meta.bearbeiter) { neu.meta.bearbeiter = ''; geaendert = true; }
        if (geaendert) dateien[DATEIEN[0]] = JSON.stringify(neu, null, 1);
      }
      for (const p of Object.keys(dateien)) schreib(path.join(wurzel, p), dateien[p]);
      stand = { revision: stand.revision + 1, zeit: new Date().toISOString(), name: s.anzeige }; schreib(fStand, JSON.stringify(stand));
      sperre.bis = Date.now() + SPERRE_MS;
      if (opt.git) execFile('git', ['-C', wurzel, 'add'].concat(['daten', 'pdf/eigene', 'bilder/eigene'].filter(p => fs.existsSync(path.join(wurzel, p)))), () => execFile('git', ['-C', wurzel, '-c', 'user.name=' + s.anzeige, '-c', 'user.email=normenbibliothek@localhost', 'commit', '-q', '-m', `Gespeichert von ${s.anzeige} (Stand ${stand.revision})`], e => { if (e && !/nothing to commit/.test(String(e.stdout || e.message))) console.log('git:', String(e.message).split('\n')[0]); }));
      return antwort(res, 200, { revision: stand.revision });
    }
    if (pfad === '/api/pdf' && M === 'PUT') {
      if (s.rolle === 'gast') return antwort(res, 403, { fehler: 'Gäste können keine PDF hinzufügen.' });
      const p = new URL(req.url, 'http://x').searchParams.get('pfad') || '';
      if (!/^pdf\/eigene\/[A-Za-z0-9._-]+\.pdf$/i.test(p) || p.includes('..')) return antwort(res, 400, { fehler: 'PDF lassen sich nur in pdf/eigene/ ablegen.' });
      const ziel = path.join(wurzel, p); if (fs.existsSync(ziel)) return antwort(res, 409, { fehler: 'Diese Datei gibt es schon. Originale werden nicht überschrieben.' });
      const b = await koerper(req, 150 * 1024 * 1024); if (b.slice(0, 5).toString('latin1') !== '%PDF-') return antwort(res, 400, { fehler: 'Die Datei ist kein PDF.' });
      fs.mkdirSync(path.dirname(ziel), { recursive: true }); schreib(ziel, b); return antwort(res, 200, {});
    }
    if (pfad === '/api/bild' && M === 'PUT') { // eigene Bilder im Text: nur PNG, nur nach bilder/eigene/, ohne Überschreiben
      if (s.rolle === 'gast') return antwort(res, 403, { fehler: 'Gäste können keine Bilder hinzufügen.' });
      const p = new URL(req.url, 'http://x').searchParams.get('pfad') || '';
      if (!/^bilder\/eigene\/[A-Za-z0-9._-]+\.png$/.test(p) || p.includes('..')) return antwort(res, 400, { fehler: 'Bilder lassen sich nur in bilder/eigene/ ablegen.' });
      const ziel = path.join(wurzel, p); if (fs.existsSync(ziel)) return antwort(res, 409, { fehler: 'Diese Datei gibt es schon.' });
      const b = await koerper(req, 20 * 1024 * 1024); if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return antwort(res, 400, { fehler: 'Die Datei ist kein PNG-Bild.' });
      fs.mkdirSync(path.dirname(ziel), { recursive: true }); schreib(ziel, b); return antwort(res, 200, {});
    }
    if (pfad === '/api/benutzer') {
      if (s.rolle !== 'admin') return antwort(res, 403, { fehler: 'Benutzer verwalten darf nur der Admin.' });
      if (M === 'GET') return antwort(res, 200, { benutzer: benutzer.map(b => ({ name: b.name, anzeige: b.anzeige, rolle: b.rolle, aktiv: b.aktiv })) });
      if (M === 'POST') {
        const d = JSON.parse((await koerper(req, 4096)).toString('utf8') || '{}'), k = kennung(d.name);
        if (!/^[a-z0-9._-]{2,40}$/.test(k)) return antwort(res, 400, { fehler: 'Der Anmeldename braucht 2 bis 40 Zeichen: Buchstaben a–z, Ziffern, Punkt, Bindestrich.' });
        if (!ROLLEN.includes(d.rolle)) return antwort(res, 400, { fehler: 'Unbekannte Rolle.' });
        let b = benutzer.find(x => x.name === k);
        if (!b) { if (!pwGut(d.passwort)) return antwort(res, 400, { fehler: 'Das Passwort braucht mindestens 10 Zeichen.' }); b = { name: k, aktiv: true }; benutzer.push(b); }
        const admins = benutzer.filter(x => x.rolle === 'admin' && x.aktiv && x !== b).length;
        if (b.rolle === 'admin' && (d.rolle !== 'admin' || d.aktiv === false) && !admins) return antwort(res, 400, { fehler: 'Es muss mindestens ein aktiver Admin bleiben.' });
        b.anzeige = String(d.anzeige || k).trim().slice(0, 60) || k; b.rolle = d.rolle; b.aktiv = d.aktiv !== false;
        if (d.passwort) { if (!pwGut(d.passwort)) return antwort(res, 400, { fehler: 'Das Passwort braucht mindestens 10 Zeichen.' }); b.salz = crypto.randomBytes(16).toString('hex'); b.hash = hashPw(d.passwort, b.salz); b.neuSetzen = b.name !== s.name; for (const [t, x] of sitzungen) if (x.name === b.name && t !== s.token) sitzungen.delete(t); }
        if (!b.aktiv) { for (const [t, x] of sitzungen) if (x.name === b.name) sitzungen.delete(t); if (sperre && sperre.name === b.name) sperre = null; }
        sichern(); return antwort(res, 200, {});
      }
    }
    return antwort(res, 404, { fehler: 'Unbekannter Aufruf.' });
  }

  const srv = http.createServer((req, res) => {
    let pfad; try { pfad = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
    const s = sitzung(req);
    if (pfad.startsWith('/api/')) return api(req, res, pfad, s).catch(e => antwort(res, e.code || (e instanceof SyntaxError ? 400 : 500), { fehler: e.code === 413 ? 'Die Daten sind zu gross.' : e instanceof SyntaxError ? 'Ungültige Anfrage.' : 'Fehler auf dem Server.' }));
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const norm = path.posix.normalize(pfad);
    if (/^\/(server|\.git|node_modules|test|werkzeuge)(\/|$)/.test(norm) || /\/\./.test(norm)) { res.writeHead(404); return res.end('nicht gefunden'); }
    if (/^\/(daten|pdf)\//.test(norm) && !s) { res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bitte anmelden.'); }
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Referrer-Policy', 'no-referrer');
    stat.emit('request', req, res);
  });
  srv.erstPasswort = erstPasswort;
  return srv;
}

module.exports = { mehrnutzer, pruefeStand };
if (require.main === module) {
  const a = process.argv.slice(2), wert = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const port = +(wert('--port') || 8080), srv = mehrnutzer({ ordner: wert('--ordner') || path.resolve(__dirname, '..'), privat: wert('--privat'), git: a.includes('--git'), sicher: a.includes('--sicher') });
  srv.listen(port, () => {
    console.log(`Normenbibliothek für mehrere Nutzer: http://localhost:${port}/`);
    if (srv.erstPasswort) console.log(`\nErster Start: Anmeldename «admin», Passwort «${srv.erstPasswort}».\nDas Passwort steht nur hier. Nach der ersten Anmeldung ändern und weitere Benutzer anlegen.\n`);
  });
}
