// Prüft im Vergleich: das Textblatt ist ein Blatt A4, gleich gross wie die Seite daneben, in jedem Zoom.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), assert = require('assert'), { server } = require('../werkzeuge/server.js'), R = path.resolve(__dirname, '..');
(async () => {
  const srv = server(R).listen(0), b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(`http://localhost:${srv.address().port}/`); await p.waitForSelector('.karte');
  const auf = async (w, d, s, vz) => { await p.evaluate(([w, d, s, vz]) => { const n = window.__nb; n.S.ed.dok = d; n.S.ed.seite = s; n.S.ed.vgl = true; n.S.ed.vtext = 'fliess'; n.S.ed.vz = vz; n.oeffne(w, 'edit'); }, [w, d, s, vz]); await p.waitForSelector('#vgl-r .vgltext'); await p.waitForTimeout(500); };
  const mass = () => p.evaluate(() => { const s = document.querySelector('#vgl-l .seite, #vgl-l .vglblatt').getBoundingClientRect(), t = document.querySelector('#vgl-r .vgltext'), r = t.getBoundingClientRect(), tab = t.querySelector('.uetab'), im = t.querySelector('img.ausschnitt'); return { sw: Math.round(s.width), sh: Math.round(s.height), tw: Math.round(r.width), th: Math.round(r.height), eng: t.dataset.eng || '', lang: !!t.dataset.lang, tab: tab ? Math.round(tab.getBoundingClientRect().width) : 0, bild: im ? Math.round(im.getBoundingClientRect().width) : 0, ueber: t.scrollWidth > t.clientWidth + 1 }; });
  const faelle = [['twp84', 'd-twp84-1', 14], ['twp84', 'd-twp84-1', 2], ['twp84', 'd-twp84-1', 30], ['two77', 'd-two77-1', 222], ['tph04', 'd-tph04-1', 5]];
  for (const [w, d, s] of faelle) for (const vz of [50, 100, 150]) {
    await auf(w, d, s, vz); const m = await mass(); console.log(w, 'Seite', s, vz + ' %:', JSON.stringify(m));
    assert.equal(m.tw, m.sw, 'gleiche Breite'); assert(Math.abs(m.tw / m.th - 210 / 297) < 0.02 || m.lang, `Format A4: ${m.tw}×${m.th}`); if (!m.lang) assert(Math.abs(m.th - m.sh) <= 3, 'gleiche Höhe');
    assert(!m.ueber, 'nichts ragt seitlich über das Blatt'); if (m.tab) assert(m.tab <= m.tw * 0.85, 'Tabelle bleibt im Satzspiegel'); if (m.bild) assert(m.bild <= m.tw * 0.85);
  }
  await auf('twp84', 'd-twp84-1', 14, 50); await p.screenshot({ path: path.join(R, 'test', 'blatt.png') });
  console.log('Fehler:', errs); assert.equal(errs.length, 0); await b.close(); srv.close(); console.log('TEST BLATT OK');
})().catch(e => { console.error(String(e.stack || e).slice(0, 1200)); process.exit(1); });
