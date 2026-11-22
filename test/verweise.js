// Prüft Verweise im Text, Vermerke in abgelösten Teilen und die Beziehungen aus der Durchsicht.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), assert = require('assert'), { server } = require('../werkzeuge/server.js'), R = path.resolve(__dirname, '..');
(async () => {
  // Befehle in Aufklappmenüs: das Menü öffnen, bevor geklickt wird
  const menueAuf = pg => { const k0 = pg.click.bind(pg); pg.click = async (sel, o) => { await pg.evaluate(q => { try { const e = [...document.querySelectorAll(q)].find(x => x.closest('details.menue') || x.offsetParent) || document.querySelector(q), d = e && e.closest('details.menue'); if (d && !e.matches('summary')) d.open = true; } catch (x) { /* kein CSS-Selektor */ } }, sel).catch(() => {}); return k0(sel, o); }; return pg; };
  const srv = server(R).listen(0), b = await chromium.launch(), errs = [];
  const p = menueAuf(await b.newPage({ viewport: { width: 1500, height: 1000 } })); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(`http://localhost:${srv.address().port}/`); await p.waitForSelector('.karte');
  const nb = f => p.evaluate(f);
  // 1 Kopf der alten Norm nennt die neueren
  await nb(() => window.__nb.oeffne('twp84', 'info')); await p.waitForSelector('.werkkopf');
  assert(/ersetzt durch TWK 2017 · ergänzt durch .*TWW 2012.* · 13 Pflichtenhefte gehen vor/.test(await p.locator('.werkkopf details.abgeloest summary').innerText())); await p.click('.werkkopf details.abgeloest summary');
  const kopf = await p.locator('.werkkopf .abgeloest p').allInnerTexts(); console.log('TWP Kopf:', kopf.map(x => x.slice(0, 90)));
  assert(kopf.some(x => /Kapitel 4.*ersetzt durch TWK 2017/.test(x))); assert(kopf.some(x => /ergänzt durch TWW 2012/.test(x))); assert(kopf.some(x => /Bei Abweichungen gehen vor:.*TPH-04/.test(x)));
  // 2 Angaben: Durchsicht mit Beleg
  const ds = await p.locator('.links').first().innerText(); assert(/Aus der Durchsicht der Normen, belegt/.test(ds)); assert(/tritt bei Abweichungen zurück hinter/.test(ds)); assert(await p.locator('.links a.beleg').count() > 5);
  console.log('TWP Angaben: Belege', await p.locator('.links a.beleg').count(), ', weitere Nennungen', await p.locator('[data-act=bezug-ja]').count());
  await p.screenshot({ path: path.join(R, 'test', 'verweise-angaben.png'), fullPage: true });
  // 3 Vermerk im Text: Seite mit Abschnitt 3.4 der TWP nennt das Merkblatt Fernwärme
  const s34 = await nb(() => window.__nb.vw.ziele('d-twp84-1').nr.get('3.4')); assert(s34 > 20, 'Abschnitt 3.4 der TWP nicht gefunden: ' + s34);
  await p.evaluate(s => { const n = window.__nb; n.S.ed.dok = 'd-twp84-1'; n.S.ed.seite = s; n.oeffne('twp84', 'edit'); }, s34); await p.waitForSelector('.lesetext');
  const sh = await p.locator('.seitenhinweis').allInnerTexts(); console.log('TWP Seite', s34, ':', sh.map(x => x.slice(0, 80))); assert(sh.some(x => /Fernwärme.*ergänzt durch MB 2024-01/.test(x)));
  // 4 Verweis im Text der TWE 1994 führt in die TWP und zurück
  const ziel = await nb(() => { const n = window.__nb, L = n.S.lib, w = L.werke.find(x => x.id === 'twe94'), d = L.dokumente.find(x => x.werkId === 'twe94'); for (let i = 0; i < d.seiten; i++) { const t = n.vw.treffer(L.seitentext[d.id][i] || '', w, d).find(x => !x.intern && x.w.id === 'twp84' && x.s); if (t) return { d: d.id, s: i + 1, zs: t.s, nr: t.nr }; } return null; });
  assert(ziel, 'kein Verweis TWE → TWP mit Abschnitt'); console.log('TWE 1994 Seite', ziel.s, '→ TWP Abschnitt', ziel.nr, 'Seite', ziel.zs);
  await p.evaluate(z => { const n = window.__nb; n.S.ed.dok = z.d; n.S.ed.seite = z.s; n.oeffne('twe94', 'edit'); }, ziel); await p.waitForSelector('.lesetext a.verweis.fremd');
  await p.screenshot({ path: path.join(R, 'test', 'verweise-text.png') });
  await p.locator('.lesetext a.verweis.fremd[data-w=twp84][data-s="' + ziel.zs + '"]').first().click(); await p.waitForSelector('[data-act=verweis-zurueck]');
  let st = await nb(() => ({ w: window.__nb.S.view.id, s: window.__nb.S.ed.seite })); assert.deepEqual(st, { w: 'twp84', s: ziel.zs });
  await p.click('[data-act=verweis-zurueck]'); await p.waitForSelector('.lesetext'); st = await nb(() => ({ w: window.__nb.S.view.id, s: window.__nb.S.ed.seite })); assert.deepEqual(st, { w: 'twe94', s: ziel.s });
  // 5 Verweise innerhalb einer Norm: Abschnitt und Figur
  const intern = await nb(() => { const n = window.__nb, L = n.S.lib, w = L.werke.find(x => x.id === 'two77'), d = L.dokumente.find(x => x.werkId === 'two77'); let a = 0, f = 0; for (let i = 0; i < d.seiten; i++) n.vw.treffer(L.seitentext[d.id][i] || '', w, d).forEach(x => { if (x.intern) (/Figur|Tabelle/.test(x.titel) ? f++ : a++); }); return { a, f }; });
  console.log('TWO 1977: Verweise auf Abschnitte', intern.a, ', auf Figuren und Tabellen', intern.f); assert(intern.a > 100 && intern.f > 100);
  // 6 Nennung übernehmen wird zur Verknüpfung
  await nb(() => { window.__nb.S.lib.meta.bearbeiter = 'Test'; window.__nb.oeffne('tph19', 'info'); }); await p.waitForSelector('.links >> nth=0');
  const vor = await p.locator('[data-act=bezug-ja][data-typ=verweist]').count(); assert(vor > 0, 'keine Nennung bei TPH-19');
  const n0 = await nb(() => window.__nb.S.lib.verknuepfungen.length); await p.locator('[data-act=bezug-ja][data-typ=verweist]').first().click();
  await p.waitForFunction(n => window.__nb.S.lib.verknuepfungen.length === n + 1, n0); assert.equal(await p.locator('[data-act=bezug-ja][data-typ=verweist]').count(), vor - 1);
  console.log('Fehler:', errs); assert.equal(errs.length, 0); await b.close(); srv.close(); console.log('TEST VERWEISE OK');
})().catch(e => { console.error(String(e.stack || e).slice(0, 1200)); process.exit(1); });
