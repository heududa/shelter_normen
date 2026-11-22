// Durchlauf im Browser: node test/anmerkungen.js
// Der Webserver liefert das Repo; «daten» und neue PDF landen in test/tmp, damit der echte Bearbeitungsstand unberührt bleibt.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), assert = require('assert'), { execSync } = require('child_process'), { server } = require('../werkzeuge/server.js');
const R = path.resolve(__dirname, '..'), TMP = path.join(__dirname, 'tmp_a'), D = TMP + '/';
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
  const lib = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__nb.S.lib.anmerkungen)));
  // TWP 1984 (Scan), Seite 64: Text überstreichen statt Rechteck
  await p.click('.karte[data-id=twp84]'); await p.waitForSelector('.seite[data-fertig]');
  await p.fill('#ed-sprung', '64'); await p.press('#ed-sprung', 'Enter'); await p.waitForSelector('.seite[data-seite="64"][data-fertig]');
  assert.equal(await p.getAttribute('[data-act=mark-weise][data-v=text]', 'aria-pressed'), 'true');
  await p.click('[data-act=pdf-mark][data-art=kommentar]'); await p.fill('input[name=name]', 'A. Autorin'); await p.click('#dlg button.haupt');
  await p.waitForSelector('.seite.mark.marktext'); assert.ok((await p.locator('[data-act=pdf-mark][data-art=kommentar]').innerText()).includes('überstreichen'));
  // zwei Wörter derselben Seite als Anfang und Ende: mitten in Zeile A bis mitten in eine spätere Zeile
  const ws = await p.evaluate(async () => { const r = await fetch('daten/lagen/' + window.__nb.S.ed.dok + '.json'); return (await r.json()).seiten[64]; });
  assert.ok(ws.length > 100, 'Wortlagen Seite 64');
  const i0 = ws.findIndex((w, i) => i > 40 && w[0].length > 4), i1 = i0 + 23;
  let bx = await p.locator('.seite').boundingBox(); const mitte = w => [bx.x + (w[1] + w[3] / 2) * bx.width, bx.y + (w[2] + w[4] / 2) * bx.height];
  await p.mouse.move(...mitte(ws[i0])); await p.mouse.down(); await p.mouse.move(...mitte(ws[i0 + 5]), { steps: 3 });
  await p.waitForFunction(() => document.querySelectorAll('.seite .auswahl').length === 6);
  await p.mouse.move(...mitte(ws[i1]), { steps: 5 }); await p.waitForFunction(() => document.querySelectorAll('.seite .auswahl').length === 24);
  await p.screenshot({ path: D + 'a_auswahl.png' }); await p.mouse.up();
  await p.waitForSelector('#dlg textarea[name=text]'); assert.equal(await p.inputValue('#dlg select[name=art]'), 'kommentar');
  await p.fill('#dlg textarea[name=text]', 'Gilt das auch für VA 150?'); await p.selectOption('#dlg select[name=art]', 'frage'); await p.click('#dlg button.haupt');
  await p.waitForSelector('.fleck.text'); let an = (await lib())[0];
  assert.ok(an.rects.length >= 2, 'mehrere Zeilen: ' + an.rects.length); assert.ok(an.zitat.startsWith(ws[i0][0].replace(/[-‐]$/, '')), an.zitat); assert.equal(an.art, 'frage');
  assert.ok(an.rect.w > 0.2 && an.rect.h > 0.01); assert.equal(await p.locator('.fleck.text i').count(), an.rects.length);
  assert.ok((await p.locator('.anm .zitat').innerText()).includes(ws[i0 + 3][0].replace(/[-‐]$/, '')));
  assert.equal(await p.locator('.seite.mark').count(), 0);
  await p.screenshot({ path: D + 'a_textmarke.png' });
  // Klick auf die markierte Zeile wählt die Karte
  await p.locator('.fleck.text i').first().click(); assert.equal(await p.locator('.anm.aktiv').count(), 1);
  // ein einzelnes Wort: nur klicken; als Änderungsvorschlag steht das Wort in Alt und Neu
  await p.click('[data-act=pdf-mark][data-art=aenderung]'); bx = await p.locator('.seite').boundingBox(); await p.mouse.click(...mitte(ws[i0 + 60]));
  await p.waitForSelector('#dlg textarea[name=alt]'); assert.equal(await p.inputValue('#dlg textarea[name=alt]'), ws[i0 + 60][0]); assert.equal(await p.inputValue('#dlg textarea[name=neu]'), ws[i0 + 60][0]);
  await p.click('#dlg [data-act=dlg-zu]');
  // Rechteck geht weiter; im Text-Modus an einer leeren Stelle wird ebenfalls ein Rechteck daraus
  await p.click('[data-act=mark-weise][data-v=rechteck]'); await p.click('[data-act=pdf-mark][data-art=kommentar]'); assert.equal(await p.locator('.seite.marktext').count(), 0);
  bx = await p.locator('.seite').boundingBox();
  await p.mouse.move(bx.x + bx.width * 0.2, bx.y + bx.height * 0.3); await p.mouse.down(); await p.mouse.move(bx.x + bx.width * 0.6, bx.y + bx.height * 0.36, { steps: 4 }); await p.mouse.up();
  await p.waitForSelector('#dlg textarea[name=text]'); await p.fill('#dlg textarea[name=text]', 'Rechteck bleibt möglich'); await p.click('#dlg button.haupt');
  an = (await lib())[1]; assert.ok(!an.rects && an.rect.w > 0.39 && an.rect.w < 0.41); assert.equal(await p.locator('.fleck:not(.text)').count(), 1);
  // Antworten: zwei Personen
  await p.locator('.anm').first().locator('[data-act=anm-antwort]').click(); assert.ok((await p.locator('#dlg .zitat').innerText()).includes('VA 150'));
  await p.click('#dlg button.haupt'); assert.ok((await p.locator('#dlg .fehler').innerText()).length > 0 || await p.locator('#dlg textarea:invalid').count() === 1);
  await p.fill('#dlg textarea[name=text]', 'Ja, siehe TPH-11.'); await p.click('#dlg button.haupt');
  await p.evaluate(() => { window.__nb.S.lib.meta.bearbeiter = 'P. Prüfer'; });
  await p.locator('.anm').first().locator('[data-act=anm-antwort]').click(); await p.fill('#dlg textarea[name=text]', 'Einverstanden, erledigt.'); await p.check('#dlg input[name=erledigt]'); await p.click('#dlg button.haupt');
  assert.equal(await p.locator('.anm').first().locator('.antworten li').count(), 2);
  const at = await p.locator('.anm').first().locator('.antworten').innerText(); assert.ok(at.includes('A. Autorin') && at.includes('P. Prüfer') && at.includes('nicht freigegeben'), at);
  an = (await lib())[0]; assert.equal(an.erledigt, true); assert.deepEqual(an.antworten.map(r => r.nr), [1, 2]);
  await p.screenshot({ path: D + 'a_antworten.png' });
  // nicht freigegebene Antwort löschen
  await p.locator('.antworten li').nth(1).locator('[data-act=antw-weg]').click(); assert.equal(await p.locator('.antworten li').count(), 1);
  await p.evaluate(() => { window.__nb.S.lib.meta.bearbeiter = 'A. Autorin'; });
  await p.locator('.anm').first().locator('[data-act=anm-antwort]').click(); assert.equal(await p.locator('#dlg input[name=erledigt]').count(), 0); await p.fill('#dlg textarea[name=text]', 'Zweite Antwort'); await p.click('#dlg button.haupt');
  assert.deepEqual((await lib())[0].antworten.map(r => r.nr), [1, 2]);
  // Suche findet den Text einer Antwort
  await p.fill('#q', 'TPH-11.'); await p.press('#q', 'Enter'); await p.waitForSelector('h3:has-text("Anmerkungen im PDF (1)")'); assert.equal(await p.locator('.blatt .anm .antworten li').count(), 2);
  // Protokoll und Druckliste enthalten die Antworten; Verlauf nennt sie
  const stand = await p.evaluate(() => { const l = window.__nb.S.lib; return { v: l.verlauf.filter(x => /Antwort/.test(x.aktion)).map(x => x.aktion) }; });
  assert.deepEqual(stand.v, ['Antwort auf Anmerkung', 'Antwort auf Anmerkung', 'Nicht freigegebene Antwort gelöscht', 'Antwort auf Anmerkung']);
  // Speichern, neu laden: Antworten und Textmarke sind noch da
  await p.click('[data-act=speichern]'); await p.waitForFunction(() => !window.__nb.S.dirty);
  const datei = JSON.parse(fs.readFileSync(path.join(TMP, 'daten', 'bibliothek.json'), 'utf8')).anmerkungen;
  assert.equal(datei[0].antworten.length, 2); assert.ok(datei[0].rects.length >= 2 && datei[0].zitat);
  srv.close();
  console.log('Fehler:', errs); assert.equal(errs.length, 0); await b.close(); console.log('TEST ANMERKUNGEN OK');
})().catch(e => { console.error('Seitenfehler:', JSON.stringify(global.__errs || [])); console.error(String(e.stack || e).slice(0, 1500)); process.exit(1); });
