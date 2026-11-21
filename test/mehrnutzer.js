// Prüflauf für den Mehrnutzerbetrieb: node test/mehrnutzer.js
// Startet werkzeuge/mehrnutzer.js auf einer Kopie der Daten (test/tmp_m) und prüft Anmeldung, Rollen, Sperre und Freigabe.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), assert = require('assert');
const { mehrnutzer, pruefeStand } = require('../werkzeuge/mehrnutzer.js');
const R = path.resolve(__dirname, '..'), T = path.join(__dirname, 'tmp_m');
(async () => {
  fs.rmSync(T, { recursive: true, force: true }); fs.mkdirSync(path.join(T, 'daten'), { recursive: true });
  ['index.html', 'app.js', 'style.css'].forEach(f => fs.copyFileSync(path.join(R, f), path.join(T, f)));
  ['lib', 'marke'].forEach(d => fs.cpSync(path.join(R, d), path.join(T, d), { recursive: true }));
  fs.readdirSync(path.join(R, 'daten')).filter(f => f.endsWith('.json')).forEach(f => fs.copyFileSync(path.join(R, 'daten', f), path.join(T, 'daten', f)));
  fs.symlinkSync(path.join(R, 'pdf'), path.join(T, 'pdf'));
  const srv = mehrnutzer({ ordner: T, adminPasswort: 'admin-passwort-1' }).listen(0), U = `http://localhost:${srv.address().port}/`;

  // --- Schnittstelle
  const jar = {}; // Cookie je Benutzer
  const ruf = async (wer, pfad, methode, daten) => { const r = await fetch(U + pfad, { method: methode || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, jar[wer] ? { Cookie: jar[wer] } : {}), body: daten ? JSON.stringify(daten) : undefined }); const c = r.headers.get('set-cookie'); if (c && c.includes('nb=') && !c.includes('Max-Age=0')) jar[wer] = c.split(';')[0]; let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
  assert.equal((await fetch(U + 'daten/bibliothek.json')).status, 401, 'Daten nur mit Anmeldung');
  assert.equal((await fetch(U + 'pdf/1_TPH/tph01-de.pdf')).status, 401, 'PDF nur mit Anmeldung');
  assert.equal((await fetch(U + 'server/benutzer.json')).status, 404, 'Benutzerdatei wird nie ausgeliefert');
  assert.equal((await fetch(U + 'index.html')).status, 200);
  assert.equal((await ruf('x', 'api/ich')).j.angemeldet, false);
  assert.equal((await ruf('admin', 'api/anmelden', 'POST', { name: 'admin', passwort: 'falsch' })).s, 401);
  assert.equal((await ruf('admin', 'api/anmelden', 'POST', { name: 'Admin', passwort: 'admin-passwort-1' })).s, 200);
  assert.equal((await ruf('admin', 'api/benutzer', 'POST', { name: 'anna', anzeige: 'Anna Autor', rolle: 'autor', passwort: 'kurz' })).s, 400, 'kurzes Passwort');
  for (const [n, a, r] of [['anna', 'Anna Autor', 'autor'], ['paul', 'Paul Prüfer', 'pruefer'], ['gabi', 'Gabi Gast', 'gast']]) assert.equal((await ruf('admin', 'api/benutzer', 'POST', { name: n, anzeige: a, rolle: r, passwort: n + '-passwort-1' })).s, 200);
  for (const n of ['anna', 'paul', 'gabi']) assert.equal((await ruf(n, 'api/anmelden', 'POST', { name: n, passwort: n + '-passwort-1' })).s, 200);
  assert.equal((await ruf('anna', 'api/benutzer')).s, 403, 'nur Admin verwaltet Benutzer');
  assert.equal((await ruf('admin', 'api/benutzer', 'POST', { name: 'admin', anzeige: 'Admin', rolle: 'autor' })).s, 400, 'letzter Admin bleibt');
  assert.equal((await fetch(U + 'api/sperre', { method: 'POST', headers: { Cookie: jar.anna, Origin: 'http://fremd.example', 'Content-Type': 'application/json' }, body: '{"aktion":"nehmen"}' })).status, 403, 'fremde Herkunft');
  const bibText = () => fs.readFileSync(path.join(T, 'daten/bibliothek.json'), 'utf8');
  let rev = (await ruf('anna', 'api/stand')).j.revision;
  assert.equal((await ruf('gabi', 'api/sperre', 'POST', { aktion: 'nehmen' })).s, 403, 'Gast bearbeitet nicht');
  assert.equal((await ruf('anna', 'api/daten', 'PUT', { revision: rev, dateien: {} })).s, 423, 'ohne Sperre kein Speichern');
  assert.equal((await ruf('anna', 'api/sperre', 'POST', { aktion: 'nehmen', revision: rev })).s, 200);
  const zw = await ruf('paul', 'api/sperre', 'POST', { aktion: 'nehmen', revision: rev }); assert.equal(zw.s, 423); assert.equal(zw.j.sperre.name, 'Anna Autor');
  // Autor ändert und speichert
  let b = JSON.parse(bibText()); b.verlauf.push({ zeit: new Date().toISOString(), name: 'gefälscht', aktion: 'Test', ziel: 'twp84', detail: '' }); b.werke.find(w => w.id === 'twp84').digital = { status: 'pruefung', eingereichtVon: 'Anna Autor' };
  let r = await ruf('anna', 'api/daten', 'PUT', { revision: rev, dateien: { 'daten/bibliothek.json': JSON.stringify(b) } }); assert.equal(r.s, 200, JSON.stringify(r.j)); rev = r.j.revision;
  assert.equal(JSON.parse(bibText()).verlauf.slice(-1)[0].name, 'Anna Autor', 'Name im Verlauf kommt von der Anmeldung');
  assert.equal((await ruf('anna', 'api/daten', 'PUT', { revision: rev - 1, dateien: {} })).s, 409, 'veralteter Stand');
  // Autor darf nicht freigeben, keine Version anlegen, nichts am Verlauf oder an Versionen ändern
  const versuch = async f => { const x = JSON.parse(bibText()); f(x); return (await ruf('anna', 'api/daten', 'PUT', { revision: rev, dateien: { 'daten/bibliothek.json': JSON.stringify(x) } })); };
  assert.equal((await versuch(x => { x.werke.find(w => w.id === 'twp84').digital.status = 'freigegeben'; })).s, 403, 'Autor erteilt keine Erstfreigabe');
  assert.equal((await versuch(x => { x.versionen.push(Object.assign({}, x.versionen[0], { nr: 2 })); })).s, 403, 'Autor gibt keine Version frei');
  assert.equal((await versuch(x => { x.versionen[0].notiz = 'anders'; })).s, 403, 'Versionen sind unveränderlich');
  assert.equal((await versuch(x => { x.verlauf.shift(); })).s, 403, 'Verlauf lässt sich nicht kürzen');
  assert.equal((await versuch(x => { x.verlauf[0].name = 'x'; })).s, 403, 'Verlauf lässt sich nicht ändern');
  assert.equal((await ruf('anna', 'api/sperre', 'POST', { aktion: 'geben' })).s, 200);
  // Prüfer gibt frei
  assert.equal((await ruf('paul', 'api/sperre', 'POST', { aktion: 'nehmen', revision: rev })).s, 200);
  b = JSON.parse(bibText()); b.werke.find(w => w.id === 'twp84').digital = { status: 'freigegeben', pruefer: 'Paul Prüfer' };
  r = await ruf('paul', 'api/daten', 'PUT', { revision: rev, dateien: { 'daten/bibliothek.json': JSON.stringify(b) } }); assert.equal(r.s, 200, JSON.stringify(r.j)); rev = r.j.revision;
  assert.equal((await ruf('anna', 'api/sperre', 'POST', { aktion: 'aufheben' })).s, 403); assert.equal((await ruf('admin', 'api/sperre', 'POST', { aktion: 'aufheben' })).s, 200);
  assert.equal((await ruf('paul', 'api/daten', 'PUT', { revision: rev, dateien: {} })).s, 423, 'nach dem Aufheben kein Speichern');
  assert.equal((await ruf('anna', 'api/pdf?pfad=' + encodeURIComponent('pdf/../app.js'), 'PUT', {})).s, 400, 'PDF nur nach pdf/eigene');
  assert.equal(pruefeStand({ versionen: [], verlauf: [], werke: [] }, { werke: [] }, 'admin') !== '', true);
  // gesperrter Benutzer
  assert.equal((await ruf('admin', 'api/benutzer', 'POST', { name: 'gabi', anzeige: 'Gabi Gast', rolle: 'gast', aktiv: false })).s, 200); assert.equal((await ruf('gabi', 'api/stand')).s, 401);
  for (let i = 0; i < 6; i++) r = await ruf('y', 'api/anmelden', 'POST', { name: 'niemand', passwort: 'falsch' + i }); assert.equal(r.s, 429, 'Sperre nach Fehlversuchen');
  console.log('Schnittstelle OK');

  // --- Im Browser: Autor reicht ein, Prüfer vergleicht und gibt frei
  const br = await chromium.launch(), errs = [];
  const seite = async () => { const c = await br.newContext({ viewport: { width: 1500, height: 950 } }), p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
  const anmelden = async (p, n, pw) => { await p.goto(U); await p.waitForSelector('#anmeldung'); await p.fill('#anmeldung [name=name]', n); await p.fill('#anmeldung [name=passwort]', pw || n + '-passwort-1'); await p.click('#anmeldung button'); };
  const pa = await seite(); await anmelden(pa, 'anna', 'falsch-falsch'); await pa.waitForSelector('.fehler-fest'); await anmelden(pa, 'anna');
  await pa.waitForSelector('#anmeldung', { state: 'detached' }); await pa.waitForSelector('#dlg[open] input[name=neu]'); // vom Admin gesetztes Passwort: ändern
  await pa.fill('#dlg [name=alt]', 'anna-passwort-1'); await pa.fill('#dlg [name=neu]', 'annas-eigenes-pw'); await pa.fill('#dlg [name=neu2]', 'annas-eigenes-pw'); await pa.click('#dlg button.haupt');
  await pa.waitForSelector('.karte'); assert.ok((await pa.locator('.kopf').innerText()).includes('Anna Autor · Autor')); assert.equal(await pa.locator('#mstatus').innerText(), 'Niemand bearbeitet');
  assert.ok(await pa.locator('[data-act=freigeben]').isDisabled(), 'Autor gibt keine Version frei');
  const pp = await seite(); await anmelden(pp, 'paul'); await pp.waitForSelector('#dlg[open] input[name=neu]'); await pp.click('#dlg [data-act=dlg-zu]'); await pp.waitForSelector('.karte');
  // Anna markiert eine Seite der TWE 1994 als verglichen: holt dabei die Sperre
  await pa.evaluate(() => { const S = window.__nb.S; S.ed.dok = 'd-twe94-1'; S.ed.seite = 20; S.ed.ansicht = 'neu'; window.__nb.oeffne('twe94', 'edit'); }); await pa.waitForSelector('.seite[data-fertig]');
  assert.equal(await pa.locator('[data-act=digital-frei]').count(), 0, 'Autor sieht «Norm freigeben» nicht');
  await pa.click('[data-act=seite-ok]'); await pa.waitForFunction(() => document.querySelector('#mstatus').textContent === 'Sie bearbeiten'); await pa.waitForSelector('[data-act=seite-ok][aria-pressed=true]');
  // Paul versucht gleichzeitig zu bearbeiten: abgewiesen, nichts geändert
  await pp.evaluate(() => { const S = window.__nb.S; S.ed.dok = 'd-twe94-1'; S.ed.seite = 21; S.ed.ansicht = 'neu'; window.__nb.oeffne('twe94', 'edit'); }); await pp.waitForSelector('.seite[data-fertig]');
  await pp.click('[data-act=seite-ok]'); await pp.waitForSelector('.meldung'); assert.ok((await pp.locator('.meldung').last().innerText()).includes('Anna Autor bearbeitet gerade'));
  assert.equal(await pp.locator('[data-act=seite-ok][aria-pressed=true]').count(), 0); assert.equal(await pp.evaluate(() => window.__nb.S.dirty), false);
  // Anna reicht zur Prüfung ein, speichert, beendet die Bearbeitung
  await pa.evaluate(() => window.__nb.oeffne('twe94', 'info')); await pa.click('[data-act=digital]'); await pa.selectOption('#dlg select[name=ziel]', 'pruefung'); assert.equal(await pa.locator('#dlg select[name=ziel] option[value=freigegeben]').count(), 0);
  await pa.click('#dlg button.haupt'); await pa.click('[data-act=speichern]'); await pa.waitForFunction(() => [...document.querySelectorAll('.meldung')].some(m => m.textContent.includes('Gespeichert auf dem Server')));
  await pa.click('#msperre'); await pa.waitForFunction(() => document.querySelector('#mstatus').textContent === 'Niemand bearbeitet');
  // Paul bekommt den neuen Stand von selbst, vergleicht und gibt direkt aus der Vergleichsansicht frei
  await pp.evaluate(() => window.__nb.takt()); await pp.waitForFunction(() => (window.__nb.S.lib.werke.find(w => w.id === 'twe94').digital || {}).status === 'pruefung');
  await pp.waitForSelector('.seite[data-fertig]'); await pp.click('[data-act=seite-ok]'); await pp.waitForSelector('[data-act=seite-ok][aria-pressed=true]');
  await pp.click('[data-act=digital-frei]'); await pp.waitForSelector('#dlg select[name=ziel]'); assert.equal(await pp.inputValue('#dlg select[name=ziel]'), 'freigegeben');
  await pp.check('#dlg [name=ok]'); await pp.screenshot({ path: path.join(T, 'freigabe.png') }); await pp.click('#dlg button.haupt'); await pp.click('[data-act=speichern]');
  await pp.waitForFunction(() => [...document.querySelectorAll('.meldung')].some(m => m.textContent.includes('Gespeichert auf dem Server')));
  const end = JSON.parse(bibText()), twe = end.werke.find(w => w.id === 'twe94');
  assert.equal(twe.digital.status, 'freigegeben'); assert.equal(twe.digital.pruefer, 'Paul Prüfer'); assert.equal(twe.digital.eingereichtVon, 'Anna Autor'); assert.equal(end.versionen.length, 2);
  assert.ok(end.verlauf.some(v => v.name === 'Anna Autor' && /Zur Prüfung/.test(v.aktion)) && end.verlauf.some(v => v.name === 'Paul Prüfer' && /Erstfreigabe/.test(v.aktion)));
  assert.deepEqual(end.dokumente.find(d => d.id === 'd-twe94-1').geprueftSeiten, [20, 21]);
  // Gast: liest, kann nichts ändern
  await ruf('admin', 'api/benutzer', 'POST', { name: 'gabi', anzeige: 'Gabi Gast', rolle: 'gast', aktiv: true, passwort: 'gabi-passwort-2' });
  const pg = await seite(); await anmelden(pg, 'gabi', 'gabi-passwort-2'); await pg.waitForSelector('#dlg[open] input[name=neu]'); await pg.click('#dlg [data-act=dlg-zu]'); await pg.waitForSelector('.karte');
  assert.equal(await pg.locator('[data-act=speichern]').count(), 0); assert.ok(await pg.locator('#msperre').isHidden());
  await pg.evaluate(() => { const S = window.__nb.S; S.ed.dok = 'd-twe94-1'; S.ed.seite = 22; window.__nb.oeffne('twe94', 'edit'); }); await pg.waitForSelector('.seite[data-fertig]'); await pg.click('[data-act=seite-ok]'); await pg.waitForSelector('.meldung');
  assert.ok((await pg.locator('.meldung').last().innerText()).includes('Als Gast')); assert.equal(await pg.evaluate(() => window.__nb.S.dirty), false);
  // Admin: Benutzerverwaltung
  const pad = await seite(); await anmelden(pad, 'admin', 'admin-passwort-1'); await pad.waitForSelector('.karte'); await pad.click('[data-act=m-konto]'); await pad.click('#dlg [data-act=m-benutzer]'); await pad.waitForSelector('#dlg table.tabelle');
  assert.equal(await pad.locator('#dlg table.tabelle tbody tr').count(), 4); await pad.screenshot({ path: path.join(T, 'benutzer.png') });
  await pad.click('#dlg [data-act=dlg-zu]'); await pad.click('[data-act=m-konto]'); await pad.click('#dlg [data-act=m-abmelden]'); await pad.waitForSelector('#anmeldung');
  console.log('Fehler:', JSON.stringify(errs)); assert.equal(errs.length, 0);
  await br.close(); srv.close(); console.log('TEST OK');
})().catch(e => { console.error(e); process.exit(1); });
