// Durchlauf im Browser: node test/menue.js
// Der Webserver liefert das Repo; «daten» und neue PDF landen in test/tmp, damit der echte Bearbeitungsstand unberührt bleibt.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), assert = require('assert'), { execSync } = require('child_process'), { server } = require('../werkzeuge/server.js');
const R = path.resolve(__dirname, '..'), TMP = path.join(__dirname, 'tmp_e'), D = TMP + '/';
// Ordnerwahl des Browsers nachstellen: gelesen wird über den Webserver, geschrieben nach test/tmp
const ORDNER = () => {
  const b64 = async teile => { const u = new Uint8Array(await new Blob(teile).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32766) s += btoa(String.fromCharCode.apply(null, u.subarray(i, i + 32766))); return s; };
  const datei = p => ({ kind: 'file', name: p.split('/').pop(), getFile: async () => { const r = await fetch('/' + encodeURI(p), { cache: 'no-store' }); if (!r.ok) throw new DOMException('fehlt', 'NotFoundError'); return new File([await r.blob()], p); }, createWritable: async () => { const teile = []; return { write: async d => { teile.push(d); }, close: async () => { await window.__schreibe(p, await b64(teile)); } }; } });
  const ordner = p => ({ kind: 'directory', name: p ? p.split('/').pop() : 'shelter_normen', getDirectoryHandle: async n => ordner(p ? p + '/' + n : n), getFileHandle: async n => datei(p ? p + '/' + n : n), queryPermission: async () => 'granted', requestPermission: async () => 'granted' });
  window.showDirectoryPicker = async () => ordner('');
};
const path0 = path.join(__dirname, 'daten');
(async () => {
  // Befehle in Aufklappmenüs: das Menü öffnen, bevor geklickt wird
  const menueAuf = pg => { const k0 = pg.click.bind(pg); pg.click = async (sel, o) => { await pg.evaluate(q => { try { const e = [...document.querySelectorAll(q)].find(x => x.closest('details.menue') || x.offsetParent) || document.querySelector(q), d = e && e.closest('details.menue'); if (d && !e.matches('summary')) d.open = true; } catch (x) { /* kein CSS-Selektor */ } }, sel).catch(() => {}); return k0(sel, o); }; return pg; };
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(path.join(TMP, 'daten'), { recursive: true });
  fs.readdirSync(path.join(R, 'daten')).filter(f => f.endsWith('.json')).forEach(f => fs.copyFileSync(path.join(R, 'daten', f), path.join(TMP, 'daten', f)));
  const srv = server(R, TMP).listen(0), URL0 = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.exposeFunction('__schreibe', (pfad, b64) => { const f = path.join(TMP, pfad); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(b64, 'base64')); });
  await ctx.addInitScript(ORDNER);
  const p = menueAuf(await ctx.newPage()); const errs = []; global.__errs = errs; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL0); await p.waitForSelector('.karte');
  await p.click('.kopf [data-act=ordner]'); await p.waitForSelector('.kopf .ablage:has-text("shelter_normen")'); await p.waitForSelector('.karte');
  // Kopfzeile: Name hinter «Daten», Seitenleiste mit den neuen Namen
  assert.equal(await p.locator('.kopf .werkzeug > [data-act=name]').count(), 0); assert.equal(await p.locator('.kopf details.menue [data-act=name]').count(), 1);
  const nav = await p.locator('.leiste .ansichten').innerText(); assert.ok(nav.includes('Prüfen') && !nav.includes('Prüfungen') && nav.includes('Verlauf') && !nav.includes('Versionen'), nav);
  // Norm: vier Arbeitsweisen, ein hervorgehobener Knopf
  await p.click('.karte[data-id=twp84]'); await p.waitForSelector('.seite[data-fertig]');
  assert.deepEqual(await p.locator('.tabs.modi [role=tab]').allInnerTexts(), ['Lesen', 'Prüfen', 'Bearbeiten', 'Regeln (19)']);
  assert.equal(await p.getAttribute('.tabs.modi [data-tab=edit]', 'aria-selected'), 'true');
  assert.equal(await p.locator('#rahmen button.haupt:visible').count(), 1, 'nur «Speichern» ist hervorgehoben');
  const oben = (await p.locator('.seite').boundingBox()).y; assert.ok(oben < 520, 'Das Original beginnt weiter oben: ' + oben);
  // Menüs: zu, auf, Klick daneben schliesst, Esc schliesst
  const m = p.locator('.edleiste details.menue:has-text("Einfügen")'); assert.equal(await m.getAttribute('open'), null); assert.equal(await p.locator('[data-act=bild-neu]').isVisible(), false);
  await m.locator('summary').click(); assert.equal(await p.locator('[data-act=bild-neu]').isVisible(), true); assert.deepEqual(await m.locator('.menueliste button').allInnerTexts(), ['Tabelle übernehmen', 'Skizze übernehmen', 'Eigenes Bild einfügen']);
  await p.click('.edkopf h3'); assert.equal(await m.getAttribute('open'), null);
  await m.locator('summary').click(); await p.keyboard.press('Escape'); assert.equal(await m.getAttribute('open'), null);
  assert.deepEqual(await p.locator('.edleiste details.menue:has-text("Ausgeben") .menueliste button').allTextContents(), ['Drucken oder Word', 'PDF exportieren', 'Protokoll für Excel']);
  // Tabelle übernehmen aus dem Menü: der laufende Schritt steht als Knopf in der Zeile und lässt sich abbrechen
  await p.click('[data-act=pdf-mark][data-art=tabelle]'); await p.fill('input[name=name]', 'D. Heusser'); await p.click('#dlg button.haupt');
  await p.waitForSelector('.seite.mark'); assert.ok((await p.locator('.edleiste > .rechts > [data-act=pdf-mark][data-art=tabelle]').innerText()).includes('einrahmen')); assert.equal(await p.locator('[data-act=pdf-mark][data-art=tabelle]').count(), 1);
  await p.click('.edleiste > .rechts > [data-act=pdf-mark][data-art=tabelle]'); assert.equal(await p.locator('.seite.mark').count(), 0);
  // Stelle kommentieren: ein Klick; Rechteck hinter dem Pfeil
  await p.locator('.teilknopf > [data-act=pdf-mark]').click(); await p.waitForSelector('.seite.mark.marktext'); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.seite.mark'));
  await p.locator('.teilknopf details.menue > summary').click(); await p.locator('.teilknopf [data-act=mark-weise][data-v=rechteck]').click(); await p.locator('.teilknopf > [data-act=pdf-mark]').click(); await p.waitForSelector('.seite.mark:not(.marktext)'); await p.keyboard.press('Escape');
  // Lesen: keine Werkzeuge zum Bearbeiten, Original auf Wunsch
  await p.click('[data-act=modus][data-m=lesen]'); await p.waitForSelector('.edgrid.lesen');
  assert.equal(await p.locator('#pdfanm, [data-act=ed-edit], .teilknopf, #ed-ebene').count(), 0); assert.equal(await p.locator('.edgrid .seite').count(), 0); assert.ok((await p.locator('.lesetext').innerText()).length > 10);
  await p.check('#ed-lesorig'); await p.waitForSelector('.edgrid.lesen.mitorig .seite[data-fertig]');
  await p.click('.unterwahl [data-tab=pdf]'); await p.waitForSelector('#pdfseiten .seite'); assert.equal(await p.getAttribute('.tabs.modi [data-m=lesen]', 'aria-selected'), 'true');
  await p.click('.unterwahl [data-tab=text]'); await p.waitForSelector('.abschnitt'); assert.equal(await p.getAttribute('.tabs.modi [data-m=lesen]', 'aria-selected'), 'true');
  // Prüfen und zurück
  await p.click('.tabs.modi [data-act=vgl-an]'); await p.waitForSelector('#vgl .seite[data-fertig]'); assert.equal(await p.locator('#vgl [data-act=pl-auf]').count(), 1);
  await p.click('[data-act=vgl-aus]'); await p.waitForSelector('.edgrid.lesen');
  // Regeln und Weitere
  await p.click('.tabs.modi [data-tab=regeln]'); await p.waitForSelector('.regel'); assert.equal(await p.locator('.tabs.modi .rechts > [data-act=regel-neu]').count(), 1);
  await p.click('.werkkopf [data-act=tab][data-tab=log]'); await p.waitForSelector('.logliste'); assert.equal(await p.locator('.untertitel').innerText(), 'Änderungsprotokoll');
  await p.click('.werkkopf [data-act=tab][data-tab=info]'); await p.waitForSelector('dl.meta');
  // Bearbeiten nach einem Sprung aus der Liste der Änderungen
  await p.click('[data-act=tab][data-tab=edit]'); await p.waitForSelector('#pdfanm');
  // Glossar: ein Knopf offen, der Rest im Menü
  await p.click('.leiste [data-typ=glossar]'); await p.waitForSelector('.glossar');
  const zeile = p.locator('.glossar tbody tr').first(); assert.equal(await zeile.locator('td.tat > button').count(), 1); assert.deepEqual(await zeile.locator('.menueliste button').allTextContents(), ['Bearbeiten', 'Zurückziehen']);
  srv.close();
  console.log('Fehler:', errs); assert.equal(errs.length, 0); await b.close(); console.log('TEST MENUE OK');
})().catch(e => { console.error('Seitenfehler:', JSON.stringify(global.__errs || [])); console.error(String(e.stack || e).slice(0, 1500)); process.exit(1); });
