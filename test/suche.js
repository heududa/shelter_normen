// Prüft die Suche über alles: mehrere Wörter, Wortfolge, Filter, Normen und Beziehungen.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), assert = require('assert'), { server } = require('../werkzeuge/server.js'), R = path.resolve(__dirname, '..');
(async () => {
  const srv = server(R).listen(0), b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(`http://localhost:${srv.address().port}/`); await p.waitForSelector('.karte');
  const such = async q => { await p.fill('#q', q); await p.waitForSelector('.suchfilter, .lead'); return p.locator('#haupt').innerText(); };
  const seiten = async () => +(/Text der Normen \((\d+) Seite/.exec(await p.locator('#haupt').innerText()) || [0, 0])[1];
  // mehrere Wörter in beliebiger Reihenfolge finden dasselbe
  let t = await such('Überdruckventil Schleuse'); const a = await seiten(); assert(a > 5, 'zwei Wörter: ' + a);
  t = await such('Schleuse Überdruckventil'); assert.equal(await seiten(), a);
  assert(await p.locator('.volltreffer .treffer mark').count() >= 2, 'beide Wörter hervorgehoben');
  // Wortfolge in Anführungszeichen ist enger
  await such('"Schleuse Überdruckventil"'); const c = await seiten(); assert(c < a, `Wortfolge ${c} < ${a}`);
  // Filter nach Norm und Gruppe
  await such('Überdruckventil'); const alle = await seiten(); await p.selectOption('#sf-werk', 'twp84'); await p.waitForSelector('[data-act=sf-leer]'); const nur = await seiten();
  assert(nur > 0 && nur < alle, `Filter Norm ${nur} < ${alle}`); assert.equal(await p.locator('.volltreffer').count(), 1);
  await p.click('[data-act=sf-leer]'); await p.selectOption('#sf-gruppe', 'Pflichtenhefte (TPH)'); await p.waitForSelector('[data-act=sf-leer]'); const gr = await seiten(); assert(gr > 0 && gr < alle, `Filter Gruppe ${gr}`);
  assert(!(await p.locator('.volltreffer .treffer-werk').allInnerTexts()).some(x => /^TW[POSE] /.test(x)), 'nur Pflichtenhefte');
  await p.click('[data-act=sf-leer]');
  // Normen und Beziehungen werden gefunden
  t = await such('Wärmedämmung Belüftung'); assert(/Normen \(\d+\)/.test(t) && /TWW 2012/.test(t), 'Normtitel');
  t = await such('Vorrang TPH-04'); assert(/Beziehungen zwischen Normen \(\d+\)/.test(t), 'Beziehungen');
  // Regelwert mit Einheit, Tabelleninhalt
  t = await such('Pa 150'); assert(/Regeln \([1-9]/.test(t), 'Regelwert');
  t = await such('bis 13 SP'); assert(t.includes('TWP'), 'Tabellen');
  // «nur diese Norm» und Sprung zur Seite
  await such('Fluchtröhre'); await p.locator('[data-act=sf-werk]').first().click(); await p.waitForSelector('[data-act=sf-leer]'); assert.equal(await p.locator('.volltreffer').count(), 1);
  await p.locator('.volltreffer .treffer a').first().click(); await p.waitForSelector('.seite');
  await p.fill('#q', 'x'); assert((await p.locator('#haupt').innerText()).includes('Mindestens zwei Zeichen'));
  console.log('Seiten: zwei Wörter', a, ', Wortfolge', c, ', Überdruckventil', alle, ', nur TWP', nur, ', nur TPH', gr);
  console.log('Fehler:', errs); assert.equal(errs.length, 0); await b.close(); srv.close(); console.log('TEST SUCHE OK');
})().catch(e => { console.error(String(e.stack || e).slice(0, 1200)); process.exit(1); });
