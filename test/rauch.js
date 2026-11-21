// Kurzprüfung: lädt die Bibliothek über den Webserver und über file:// mit nachgestelltem Ordner.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), assert = require('assert'), { server } = require('../werkzeuge/server.js'), R = path.resolve(__dirname, '..');
(async () => {
  const srv = server(R).listen(0); const port = srv.address().port, b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  let t = Date.now(); await p.goto(`http://localhost:${port}/`); await p.waitForSelector('.karte'); console.log('geladen in', Date.now() - t, 'ms,', await p.locator('.karte').count(), 'Karten');
  await p.click('.karte[data-id=twp84]'); await p.waitForSelector('.seite[data-fertig]'); console.log('TWP Seite 1 gezeichnet');
  await p.evaluate(() => window.__nb.oeffne('two77', 'edit')); t = Date.now(); await p.waitForSelector('.seite[data-fertig]'); console.log('TWO (60 MB) erste Seite in', Date.now() - t, 'ms');
  await p.click('.leiste [data-typ=glossar]'); console.log('Glossarzeilen', await p.locator('.glossar tbody tr').count());
  await p.screenshot({ path: path.join(R, 'test', 'rauch.png') });
  const q = await b.newPage(); q.on('pageerror', e => errs.push('file: ' + e.message));
  await q.goto('file://' + R + '/index.html'); await q.waitForSelector('.startschirm [data-act=ordner]'); console.log('file://: Startschirm mit Ordnerwahl');
  console.log('Fehler:', errs); assert.equal(errs.length, 0); await b.close(); srv.close(); console.log('RAUCH OK');
})().catch(e => { console.error(String(e.stack || e).slice(0, 900)); process.exit(1); });
