// Durchlauf im Browser: node test/bilder.js
// Der Webserver liefert das Repo; «daten» und neue PDF landen in test/tmp, damit der echte Bearbeitungsstand unberührt bleibt.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), assert = require('assert'), { execSync } = require('child_process'), { server } = require('../werkzeuge/server.js');
const R = path.resolve(__dirname, '..'), TMP = path.join(__dirname, 'tmp_b'), D = TMP + '/';
// Ordnerwahl des Browsers nachstellen: gelesen wird über den Webserver, geschrieben nach test/tmp
const ORDNER = () => {
  const b64 = async teile => { const u = new Uint8Array(await new Blob(teile).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32766) s += btoa(String.fromCharCode.apply(null, u.subarray(i, i + 32766))); return s; };
  const datei = p => ({ kind: 'file', name: p.split('/').pop(), getFile: async () => { const r = await fetch('/' + encodeURI(p), { cache: 'no-store' }); if (!r.ok) throw new DOMException('fehlt', 'NotFoundError'); return new File([await r.blob()], p); }, createWritable: async () => { const teile = []; return { write: async d => { teile.push(d); }, close: async () => { await window.__schreibe(p, await b64(teile)); } }; } });
  const ordner = p => ({ kind: 'directory', name: p ? p.split('/').pop() : 'shelter_normen', getDirectoryHandle: async n => ordner(p ? p + '/' + n : n), getFileHandle: async n => datei(p ? p + '/' + n : n), queryPermission: async () => 'granted', requestPermission: async () => 'granted' });
  window.showDirectoryPicker = async () => ordner('');
};
const path0 = path.join(__dirname, 'daten');
(async () => {
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(path.join(TMP, 'daten'), { recursive: true });
  fs.readdirSync(path.join(R, 'daten')).filter(f => f.endsWith('.json')).forEach(f => fs.copyFileSync(path.join(R, 'daten', f), path.join(TMP, 'daten', f)));
  const srv = server(R, TMP).listen(0), URL0 = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.exposeFunction('__schreibe', (pfad, b64) => { const f = path.join(TMP, pfad); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(b64, 'base64')); });
  await ctx.addInitScript(ORDNER);
  const p = await ctx.newPage(); const errs = []; global.__errs = errs; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL0); await p.waitForSelector('.karte');
  await p.click('.kopf [data-act=ordner]'); await p.waitForSelector('.kopf .ablage:has-text("shelter_normen")'); await p.waitForSelector('.karte');
  const ue = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__nb.S.lib.uebernahmen)));
  // Testbilder: ein Schema als SVG und ein kleines PNG
  const svg = path.join(TMP, 'schema.svg'); fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#fff"/><rect x="40" y="60" width="240" height="280" fill="none" stroke="#1D3F7A" stroke-width="8"/><circle cx="560" cy="200" r="120" fill="#F08A00"/><text x="60" y="40" font-size="28">Eigenes Schema</text></svg>');
  const geheSeite = async n => { await p.fill('#ed-sprung', String(n)); await p.press('#ed-sprung', 'Enter'); await p.waitForSelector(`.seite[data-seite="${n}"][data-fertig]`); };
  await p.click('.karte[data-id=twp84]'); await p.waitForSelector('.seite[data-fertig]');
  // 1. Skizze der Seite 38 durch ein eigenes Bild ersetzen
  await geheSeite(38); await p.waitForFunction(() => { const i = document.querySelector('.lesetext .ue-skizze img.ausschnitt'); return i && i.complete && i.naturalWidth > 500; });
  const nSk = await p.locator('.lesetext .ue-skizze').count(), nr = await p.locator('.lesetext .ue-skizze').first().getAttribute('id');
  await p.hover('.lesetext .ue-skizze >> nth=0'); await p.locator('.lesetext .ue-skizze').first().locator('[data-act=ue-bearbeiten]').click();
  await p.fill('input[name=name]', 'D. Heusser'); await p.click('#dlg button.haupt');
  await p.waitForSelector('#dlg #ue-datei'); await p.waitForFunction(() => { const i = document.querySelector('#ue-vorschau img'); return i && i.naturalWidth > 100; });
  assert.equal(await p.locator('#dlg input[name=original]').count(), 0);
  await p.setInputFiles('#ue-datei', svg); await p.waitForFunction(() => { const i = document.querySelector('#ue-vorschau img.eigen'); return i && i.naturalWidth === 800; });
  await p.fill('#dlg input[name=breite]', '60'); await p.selectOption('#dlg select[name=ausr]', 'mitte'); await p.fill('#dlg input[name=titel]', 'Schema ANDAIR');
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('#ue-vorschau')).getPropertyValue('--b').trim()), '60%');
  await p.screenshot({ path: D + 'b_dialog.png' }); await p.click('#dlg button.haupt');
  await p.waitForFunction(() => { const i = document.querySelector('.lesetext .ue-skizze.eigen img'); return i && i.naturalWidth === 800; });
  assert.equal(await p.locator('.lesetext .ue-skizze').count(), nSk); assert.equal(await p.locator('.lesetext .ue-skizze.eigen').getAttribute('id'), nr);
  let u = (await ue())[0]; assert.ok(/^bilder\/eigene\/[0-9a-f]{12}_schema\.png$/.test(u.bild.pfad), u.bild.pfad); assert.equal(u.breite, 60); assert.equal(u.ausr, 'mitte'); assert.ok(u.box[2] > 0);
  const lage = () => p.evaluate(() => { const f = document.querySelector('.lesetext .ue-skizze.eigen'), i = f.querySelector('img'), a = f.getBoundingClientRect(), b = i.getBoundingClientRect(); return { anteil: b.width / a.width, links: b.left - a.left, rechts: a.right - b.right }; });
  let l = await lage(); assert.ok(Math.abs(l.anteil - 0.6) < 0.02, JSON.stringify(l)); assert.ok(Math.abs(l.links - l.rechts) < 3, JSON.stringify(l));
  assert.ok((await p.locator('.lesetext .ue-skizze.eigen figcaption').innerText()).includes('eigenes Bild'));
  await p.screenshot({ path: D + 'b_ersetzt.png' });
  const pdfAus = async (seiten, datei) => { await p.click('[data-act=ed-pdf]'); await p.fill('#dlg input[name=seiten]', seiten); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlg button.haupt')]); await dl.saveAs(D + datei); await p.waitForFunction(() => !document.querySelector('#dlg').open); return { text: execSync(`pdftotext -layout ${D + datei} -`).toString(), bilder: execSync(`pdfimages -list ${D + datei}`).toString() }; };
  // PDF-Export: ersetzte Skizze auf der Originalseite eingerahmt, das eigene Bild auf dem Änderungsblatt
  let ex = await pdfAus('38', 'b_export38.pdf'); assert.ok(ex.text.includes('im Text durch eigenes Bild ersetzt') && ex.text.includes('ersetzt die Skizze des Originals') && ex.text.includes('Schema ANDAIR') && ex.text.includes('1 eigenes Bild') && ex.text.includes('nicht freigegeben'), ex.text.slice(0, 1500));
  assert.ok(/\s800\s+400\s/.test(ex.bilder), ex.bilder);
  // Grösse und Ausrichtung ändern, ohne das Bild neu zu wählen
  await p.hover('.lesetext .ue-skizze.eigen'); await p.click('.lesetext .ue-skizze.eigen [data-act=ue-bearbeiten]'); await p.waitForSelector('#dlg input[name=original]');
  await p.fill('#dlg input[name=breite]', '5'); await p.click('#dlg button.haupt'); assert.ok((await p.locator('#dlg .fehler').innerText()).includes('10 und 100') || await p.locator('#dlg input:invalid').count() === 1);
  await p.fill('#dlg input[name=breite]', '35'); await p.selectOption('#dlg select[name=ausr]', 'rechts'); await p.click('#dlg button.haupt'); await p.waitForFunction(() => !document.querySelector('#dlg').open);
  l = await lage(); assert.ok(Math.abs(l.anteil - 0.35) < 0.02 && l.rechts < 3 && l.links > 50, JSON.stringify(l));
  // Speichern: die Datei liegt in bilder/eigene, der Stand nennt nur den Pfad
  await p.click('[data-act=speichern]'); await p.waitForFunction(() => !window.__nb.S.dirty);
  const png = fs.readFileSync(path.join(TMP, u.bild.pfad)); assert.equal(png.slice(1, 4).toString(), 'PNG'); assert.ok(png.length > 2000);
  const stand = fs.readFileSync(path.join(TMP, 'daten', 'bibliothek.json'), 'utf8'); assert.ok(stand.includes(u.bild.pfad) && !stand.includes('data:image'));
  // Neu laden: das Bild kommt aus der Ablage
  await p.reload(); await p.waitForSelector('.karte'); await p.click('.kopf [data-act=ordner]'); await p.waitForSelector('.kopf .ablage:has-text("shelter_normen")'); await p.waitForSelector('.karte');
  await p.click('.karte[data-id=twp84]'); await p.waitForSelector('.seite[data-fertig]'); await geheSeite(38);
  await p.waitForFunction(() => { const i = document.querySelector('.lesetext .ue-skizze.eigen img'); return i && i.naturalWidth === 800; });
  // wieder das Original zeigen
  await p.hover('.lesetext .ue-skizze.eigen'); await p.click('.lesetext .ue-skizze.eigen [data-act=ue-bearbeiten]');
  await p.waitForSelector('#dlg input[name=original]'); await p.check('#dlg input[name=original]'); await p.click('#dlg button.haupt'); await p.waitForFunction(() => !document.querySelector('#dlg').open);
  assert.equal(await p.locator('.lesetext .ue-skizze.eigen').count(), 0); u = (await ue())[0]; assert.ok(!u.bild && u.breite === 35);
  // 2. Eigenes Bild neu einfügen (Seite 64, bisher ohne Skizze an dieser Stelle), verschieben
  await geheSeite(64); const vorher = await p.locator('.lesetext .ue').count();
  await p.click('[data-act=bild-neu]'); await p.waitForSelector('#dlg #ue-datei'); assert.ok((await p.locator('#ue-vorschau').innerText()).includes('Noch kein Bild'));
  await p.click('#dlg button.haupt'); assert.ok((await p.locator('#dlg .fehler').innerText()).includes('Bild wählen'));
  await p.setInputFiles('#ue-datei', svg); await p.waitForFunction(() => { const i = document.querySelector('#ue-vorschau img.eigen'); return i && i.naturalWidth === 800; });
  await p.fill('#dlg input[name=breite]', '50'); await p.click('#dlg button.haupt');
  await p.waitForFunction(() => { const i = document.querySelector('.lesetext .ue-skizze.eigen img'); return i && i.naturalWidth === 800; });
  assert.equal(await p.locator('.lesetext .ue').count(), vorher + 1);
  const pos = () => p.evaluate(() => { const t = document.querySelector('.lesetext'), f = t.querySelector('.ue-skizze.eigen'), r = document.createRange(); r.setStart(t, 0); r.setEndBefore(f); return r.toString().replace(/\s+/g, ' ').trim().length; });
  const ganz = await pos(); u = (await ue()).find(x => x.bild); assert.equal(u.nach, undefined); assert.equal(u.seite, 64);
  for (let i = 0; i < 3; i++) { await p.hover('.lesetext .ue-skizze.eigen'); await p.click('.lesetext .ue-skizze.eigen [data-act=ue-pos][data-d="-1"]'); }
  const oben = await pos(); assert.ok(oben < ganz - 40, `nach oben: ${ganz} -> ${oben}`); u = (await ue()).find(x => x.bild); assert.ok(u.nach >= 1);
  await p.hover('.lesetext .ue-skizze.eigen'); await p.click('.lesetext .ue-skizze.eigen [data-act=ue-pos][data-d="1"]'); const mitte = await pos(); assert.ok(mitte > oben && mitte < ganz, `nach unten: ${oben} -> ${mitte}`);
  assert.equal(await p.evaluate(() => window.__nb.S.lib.verlauf.filter(v => v.aktion === 'Bild im Text verschoben').length), 1);
  await p.hover('.lesetext .ue-skizze.eigen'); await p.locator('.lesetext').screenshot({ path: D + 'b_neu.png' });
  // erscheint unter den offenen Änderungen, im Druck und in der Word-Datei
  await p.click('.leiste [data-typ=offen]'); assert.ok((await p.locator('#haupt').innerText()).includes('(eigenes Bild)'));
  await p.evaluate(() => { const S = window.__nb.S; S.ed.dok = 'd-twp84-1'; S.ed.seite = 64; window.__nb.oeffne('twp84', 'edit'); }); await p.waitForSelector('.seite[data-seite="64"][data-fertig]');
  await p.evaluate(() => { window.print = () => {}; }); await p.click('[data-act=ed-druck]'); await p.selectOption('#dlg select[name=umfang]', 'seite'); await p.click('#dlg button.haupt');
  await p.waitForFunction(() => { const i = document.querySelector('#druck img.ausschnitt.eigen'); return i && i.src.startsWith('data:image/png') && i.dataset.w === '44'; });
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await p.click('[data-act=ed-druck]'); await p.selectOption('#dlg select[name=ausgabe]', 'word'); await p.selectOption('#dlg select[name=umfang]', 'seite');
  const [doc] = await Promise.all([p.waitForEvent('download'), p.click('#dlg button.haupt')]); await doc.saveAs(D + 'b_word.docx');
  const docT = fs.readFileSync(D + 'b_word.docx').toString('latin1'); assert.ok(docT.includes('word/media/bild1.png'), 'Word mit eigenem Bild');
  execSync(`cd ${TMP} && rm -rf w && mkdir w && cd w && unzip -q ../b_word.docx`); const dx = fs.readFileSync(path.join(TMP, 'w/word/document.xml'), 'utf8');
  const cx = +/<wp:extent cx="(\d+)"/.exec(dx)[1]; assert.ok(Math.abs(cx - 2880000) < 5000, 'Bild halb so breit wie der Satzspiegel: ' + cx);
  const bildDatei = fs.readFileSync(path.join(TMP, 'w/word/media/bild1.png')); assert.equal(bildDatei.readUInt32BE(16), 800);
  ex = await pdfAus('64', 'b_export64.pdf'); assert.ok(ex.text.includes('neu eingefügt') && ex.text.includes('Änderungen zu Seite 64') && !ex.text.includes('im Text durch eigenes Bild ersetzt'), ex.text.slice(0, 1500)); assert.ok(/\s800\s+400\s/.test(ex.bilder), ex.bilder);
  await p.waitForSelector('.lesetext .ue-skizze.eigen');
  // nicht freigegebenes Bild entfernen
  await p.hover('.lesetext .ue-skizze.eigen'); await p.click('.lesetext .ue-skizze.eigen [data-act=ue-weg]'); await p.click('#dlg button.haupt'); await p.waitForFunction(() => !document.querySelector('.lesetext .ue-skizze.eigen'));
  assert.equal((await ue()).filter(x => x.bild).length, 0);
  srv.close();
  console.log('Fehler:', errs); assert.equal(errs.length, 0); await b.close(); console.log('TEST BILDER OK');
})().catch(e => { console.error('Seitenfehler:', JSON.stringify(global.__errs || [])); console.error(String(e.stack || e).slice(0, 1500)); process.exit(1); });
