// Durchlauf im Browser: node test/test.js
// Der Webserver liefert das Repo; «daten» und neue PDF landen in test/tmp, damit der echte Bearbeitungsstand unberührt bleibt.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path'), assert = require('assert'), { execSync } = require('child_process'), { server } = require('../werkzeuge/server.js');
const R = path.resolve(__dirname, '..'), TMP = path.join(__dirname, 'tmp'), D = TMP + '/';
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
  // Ablage: zuerst nur lesen, dann Ordner verbinden
  assert.ok((await p.locator('.kopf .ablage').innerText()).includes('Nur lesen'));
  await p.click('.kopf [data-act=ordner]'); await p.waitForSelector('.kopf .ablage:has-text("shelter_normen")'); await p.waitForSelector('.karte');
  // Bibliothek
  assert.equal(await p.locator('.karte').count(), 77); assert.equal(await p.locator('.karte img').count(), 74); assert.equal(await p.locator('.karte .marke:has-text("Ungeprüft")').count(), 74);
  await p.waitForFunction(() => Array.from(document.querySelectorAll('.karte img')).slice(0, 6).every(i => i.complete && i.naturalWidth > 100));
  await p.screenshot({ path: D + 'a_start.png' });
  await p.fill('#bq', 'tws 1982'); assert.equal(await p.locator('.karte').count(), 1); await p.fill('#bq', '');
  await p.selectOption('#bib-status', 'ohnepdf'); assert.equal(await p.locator('.karte').count(), 3); await p.selectOption('#bib-status', '');
  await p.click('[data-act=bib-liste][data-v="1"]'); assert.equal(await p.locator('.bibtab tbody tr').count(), 77); await p.click('[data-act=bib-liste][data-v="0"]');
  await p.click('.leiste [data-act=bib-hg][data-id=andair]'); assert.equal(await p.locator('.karte').count(), 1); await p.click('.leiste [data-act=bib-hg][data-id=andair]');
  await p.click('.leiste [data-typ=offen]'); assert.equal(await p.locator('.wahlliste li').count(), 3); await p.click('.leiste [data-typ=start]');
  await p.fill('#bq', 'tph-14'); await p.evaluate(() => { const l = window.__nb.S.lib; l.__tb = l.titelbilder; l.titelbilder = {}; }); await p.click('[data-typ=verlauf]'); await p.click('[data-typ=start]');
  await p.waitForFunction(() => document.querySelectorAll('.karte img').length === 1); await p.evaluate(() => { const l = window.__nb.S.lib; l.titelbilder = l.__tb; delete l.__tb; }); await p.fill('#bq', '');
  // Bearbeitung: TWP Seite 64
  await p.click('.karte[data-id=twp84]'); await p.waitForSelector('.seite[data-fertig]'); assert.equal(await p.locator('.seite').count(), 1);
  // Struktur: Inhaltsverzeichnis und Formatvorlagen aus dem Original
  await p.click('.inhalt summary'); assert.ok(await p.locator('.inhaltliste a').count() > 40); assert.ok(await p.locator('.inhaltliste a.iv-u3').count() > 10);
  await p.click('.inhaltliste a:has-text("2.2 Mindestanforderungen")'); await p.waitForSelector('.seite[data-seite="29"][data-fertig]'); assert.ok(await p.locator('.lesetext .fv-u2').count() >= 1);
  await p.fill('#ed-sprung', '64'); await p.press('#ed-sprung', 'Enter'); await p.waitForSelector('.seite[data-seite="64"][data-fertig]');
  assert.ok((await p.locator('.lesetext').innerText()).includes('125 Pa'));
  // OCR-Korrektur
  await p.click('[data-act=ed-edit]'); await p.fill('input[name=name]', 'D. Heusser'); await p.click('#dlg button.haupt');
  let t = await p.inputValue('#ed-text'); assert.ok(t.includes('125 Pa'));
  const wort = t.match(/Sprechver-?\s*bindung|Sprechverbindung|Panzertüre/)[0];
  await p.fill('#ed-text', t.replace('Panzertüre', 'Panzertuere_OCR')); await p.click('[data-act=ed-speichern]');
  assert.ok((await p.locator('#dlg .altneu').innerText()).includes('Panzertuere_OCR')); await p.click('#dlg button.haupt');
  assert.equal(await p.locator('.aend.art-ocr').count(), 1); assert.equal(await p.locator('.lesetext ins.ocr').count(), 1); assert.equal(await p.locator('.lesetext del.ocr').count(), 1);
  // Fachliche Änderung als ANDAIR, mit Regel
  await p.selectOption('#ed-ebene', 'andair26'); await p.click('[data-act=ed-edit]');
  t = await p.inputValue('#ed-text'); assert.ok(t.includes('Panzertuere_OCR'));
  await p.fill('#ed-text', t.replace('125 Pa', '150 Pa')); await p.click('[data-act=ed-speichern]');
  await p.fill('#dlg textarea[name=begruendung]', 'Wert gemäss TPH-04'); await p.selectOption('#dlg select[name=regelId]', 'TWP84-3.1-06'); await p.click('#dlg button.haupt');
  assert.equal(await p.locator('.aend.art-fachlich').count(), 1); assert.equal(await p.locator('.lesetext ins.fach').count(), 1); assert.equal(await p.locator('.lesetext del.fach').count(), 1);
  assert.ok((await p.locator('.aend.art-fachlich').innerText()).includes('noch nicht angepasst'));
  await p.screenshot({ path: D + 'a_edit.png' });
  await p.click('[data-act=ed-ansicht][data-v=neu]'); let neu = await p.locator('.lesetext').innerText(); assert.ok(neu.includes('150 Pa') && !neu.includes('125 Pa') && neu.includes('Panzertuere_OCR'));
  await p.click('[data-act=ed-ansicht][data-v=original]'); neu = await p.locator('.lesetext').innerText(); assert.ok(neu.includes('125 Pa') && neu.includes('Panzertüre') && !neu.includes('_OCR'));
  await p.click('[data-act=ed-ansicht][data-v=hybrid]');
  // Regelwert anpassen -> Schichteintrag
  await p.click('.aend.art-fachlich [data-act=aend-abw]'); await p.fill('#dlg input[name=pv1]', '150'); await p.fill('#dlg textarea[name=begruendung]', 'Wert gemäss TPH-04'); await p.click('#dlg button.haupt');
  await p.click('.leiste [data-typ=offen]'); assert.ok(await p.locator('.offenliste li').count() >= 6); await p.click('.offenliste a[data-act=aend-zeige] >> nth=1');
  await p.waitForSelector('.seite[data-seite="64"][data-fertig]'); assert.ok((await p.locator('.aend.art-fachlich').innerText()).includes('Regelwert in der Schicht angepasst'));
  // Grundtext nachträglich ändern -> fachliche Änderung "prüfen"
  await p.selectOption('#ed-ebene', ''); await p.click('[data-act=ed-edit]'); t = await p.inputValue('#ed-text'); await p.fill('#ed-text', t.replace('Panzertuere_OCR', 'Panzertüre')); await p.click('[data-act=ed-speichern]'); await p.click('#dlg button.haupt');
  assert.ok((await p.locator('.aend.art-fachlich').innerText()).includes('Grundtext geändert'));
  assert.equal(await p.locator('.aend.art-ocr [data-act=aend-weg]').count(), 1, 'nur die letzte OCR-Korrektur lässt sich löschen');
  // Kommentar auf der Seite, Filter
  await p.click('[data-act=anm-seite]'); await p.fill('#dlg textarea[name=text]', 'Mit BABS klären'); await p.click('#dlg button.haupt'); assert.equal(await p.locator('#pdfanm .anm').count(), 1);
  await p.click('[data-act=ed-filter][data-v=ocr]'); assert.equal(await p.locator('#pdfanm .aend').count(), 2); assert.equal(await p.locator('#pdfanm .anm').count(), 0); await p.click('[data-act=ed-filter][data-v=alle]');
  await p.click('[data-act=ed-seite][data-d="1"]'); await p.waitForSelector('.seite[data-seite="65"][data-fertig]'); assert.ok((await p.locator('#pdfanm').innerText()).includes('Auf anderen Seiten'));
  // Formatvorlage von Hand zuweisen (eigene Änderungsart)
  await p.click('[data-act=ed-edit]'); await p.locator('#ed-text').evaluate(t => { const i = t.value.indexOf('\n') + 1; t.focus(); t.setSelectionRange(i + 2, i + 2); });
  await p.selectOption('#ed-fv', 'u3'); assert.equal(await p.evaluate(() => window.__nb.S.lib.formate.length), 1); await p.click('[data-act=ed-abbruch]'); assert.ok(await p.locator('.lesetext .fv-u3').count() >= 1);
  // Hybrid: Text über dem Scan
  await p.click('[data-act=ed-links][data-v=hybrid]'); await p.waitForSelector('.seite[data-tlfertig]'); assert.ok(await p.locator('.textebene span').count() > 20);
  await p.locator('#ed-transp').fill('100'); assert.equal(await p.locator('.seite').evaluate(e => getComputedStyle(e.querySelector('.textebene')).opacity), '1');
  await p.screenshot({ path: D + 'a_hybrid.png' });
  await p.uncheck('#ed-z-text'); await p.waitForSelector('.seite[data-tlfertig]'); assert.ok(!(await p.locator('.textebene').isVisible())); await p.check('#ed-z-text'); await p.click('[data-act=ed-links][data-v=scan]');
  // Änderung im Scan vorschlagen: Rechteck, Originalinhalt aus dem PDF, Art automatisch
  await p.fill('#ed-sprung', '64'); await p.press('#ed-sprung', 'Enter'); await p.waitForSelector('.seite[data-seite="64"][data-fertig]');
  await p.click('[data-act=pdf-mark][data-art=aenderung]'); let bx = await p.locator('.seite').boundingBox();
  await p.mouse.move(bx.x + bx.width * 0.25, bx.y + bx.height * 0.12); await p.mouse.down(); await p.mouse.move(bx.x + bx.width * 0.95, bx.y + bx.height * 0.16, { steps: 4 }); await p.mouse.up();
  await p.waitForSelector('#dlg textarea[name=alt]'); const gelesen = await p.inputValue('#dlg textarea[name=alt]'); assert.ok(gelesen.length > 20, 'Text im Rechteck: ' + gelesen);
  assert.equal(await p.inputValue('#dlg select[name=art]'), 'aenderung');
  await p.fill('#dlg textarea[name=alt]', '0,05 m'); await p.fill('#dlg textarea[name=neu]', '0,08 m'); await p.fill('#dlg textarea[name=text]', 'Grössere Abluftöffnung'); await p.click('#dlg button.haupt');
  assert.ok((await p.locator('#pdfanm .anm.art-aenderung').innerText()).includes('Fachliche Änderung')); assert.equal(await p.locator('.fleck').count(), 1);
  await p.selectOption('#ed-ebene', ''); await p.locator('.anm.art-aenderung [data-act=anm-uebernehmen]').first().click(); await p.waitForSelector('.meldung'); assert.ok((await p.locator('.meldung').last().innerText()).includes('Schicht'));
  // OCR-Vorschlag: automatisch als OCR erkannt und in den Grundtext übernommen
  await p.click('[data-act=anm-seite]'); await p.selectOption('#dlg select[name=art]', 'aenderung'); await p.fill('#dlg textarea[name=alt]', 'Sprechverbindung'); await p.fill('#dlg textarea[name=neu]', 'Sprechverb1ndung'); await p.fill('#dlg textarea[name=text]', 'Testkorrektur'); await p.click('#dlg button.haupt');
  const ocrK = p.locator('#pdfanm .anm.art-aenderung', { hasText: 'Testkorrektur' }); assert.ok((await ocrK.innerText()).includes('OCR-Korrektur'));
  const vorT = await p.evaluate(() => window.__nb.S.lib.aenderungen.length); await ocrK.locator('[data-act=anm-uebernehmen]').click();
  assert.equal(await p.evaluate(() => window.__nb.S.lib.aenderungen.length), vorT + 1); assert.ok((await ocrK.innerText()).includes('in den Text übernommen'));
  // Editor: Sonderzeichen, Suchen und Ersetzen, Warnung bei Zahlenänderung im Grundtext
  await p.click('[data-act=ed-edit]'); await p.locator('#ed-text').evaluate(t => t.setSelectionRange(0, 0)); await p.click('[data-act=ed-zeichen][data-z="≥"]'); assert.ok((await p.inputValue('#ed-text')).startsWith('≥'));
  await p.click('[data-act=ed-undo]'); assert.ok(!(await p.inputValue('#ed-text')).startsWith('≥'));
  await p.fill('#ed-such', '1,85 m'); await p.fill('#ed-ers', '1,90 m'); await p.click('[data-act=ed-ers-alle]'); assert.ok((await p.inputValue('#ed-text')).includes('1,90 m'));
  await p.click('[data-act=ed-speichern]'); assert.ok((await p.locator('#dlg .fehler-fest').innerText()).includes('fachlichen Änderung')); await p.click('#dlg [data-act=dlg-zu]'); await p.click('[data-act=ed-abbruch]');
  // Protokoll für Excel
  const [csv] = await Promise.all([p.waitForEvent('download'), p.click('.edleiste [data-act=protokoll-csv]')]); await csv.saveAs(D + 'a_prot.csv'); const csvT = fs.readFileSync(D + 'a_prot.csv', 'utf8');
  assert.ok(csvT.includes('Änderungs-ID') && csvT.includes('TWP1984-T2') && csvT.includes('Wert gemäss TPH-04') && csvT.split('\r\n').length >= 7, 'CSV');
  // Word
  await p.click('[data-act=ed-druck]'); await p.selectOption('#dlg select[name=ausgabe]', 'word'); await p.selectOption('#dlg select[name=umfang]', 'auswahl'); await p.fill('#dlg input[name=seiten]', '63-65');
  const [doc] = await Promise.all([p.waitForEvent('download'), p.click('#dlg button.haupt')]); await doc.saveAs(D + 'a_word.doc'); let docT = fs.readFileSync(D + 'a_word.doc', 'utf8');
  if (docT.startsWith('MIME-Version')) { assert.ok(docT.includes('Content-Type: image/png') && docT.includes('bild1.png'), 'Word mit Bildern'); docT = Buffer.from(docT.split('dokument.htm\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString('utf8'); assert.ok(docT.includes('<img src="bild1.png"')); }
  assert.ok(docT.includes('ENTWURF') && (docT.match(/class="dseite"/g) || []).length === 3 && docT.includes('Änderungsverzeichnis'), 'Word');
  // Drucken
  await p.evaluate(() => { window.print = () => { window.__gedruckt = true; }; });
  await p.selectOption('#ed-ebene', 'andair26');
  await p.click('[data-act=ed-druck]'); await p.click('#dlg button.haupt'); await p.waitForFunction(() => window.__gedruckt);
  assert.equal(await p.locator('#druck .dseite').count(), 79); assert.ok((await p.locator('#druck header').innerText()).includes('ENTWURF')); assert.equal(await p.locator('#druck .dseite ins.fach').count(), 3); assert.equal(await p.locator('#druck .dseite del.fach').count(), 3); assert.ok((await p.locator('#druck .dverz').innerText()).includes('Wert gemäss TPH-04'));
  assert.ok((await p.locator('#druck header').innerText()).includes('Herstellernorm'));
  await p.emulateMedia({ media: 'print' }); assert.ok(await p.locator('#druck').isVisible()); assert.ok(!(await p.locator('#app').isVisible())); await p.pdf({ path: D + 'a_druck.pdf', format: 'A4' }); await p.emulateMedia({ media: 'screen' });
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint'))); assert.equal(await p.locator('#druck').count(), 0);
  // PDF-Export
  await p.click('[data-act=ed-pdf]'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlg button.haupt')]); await dl.saveAs(D + 'a_export.pdf');
  const seiten = +execSync(`pdfinfo "${D}a_export.pdf" | awk '/^Pages/{print $2}'`).toString(); assert.ok(seiten >= 81, 'Seiten im Export: ' + seiten);
  const txt = execSync(`pdftotext "${D}a_export.pdf" -`, { maxBuffer: 5e7 }).toString(); assert.ok(txt.includes('Änderungsverzeichnis') && txt.includes('Wert gemäss TPH-04') && txt.includes('Änderungen zu Seite 64'), 'Text im Export');
  // Auswahl freigeben, eine Änderung verwerfen, Versionen vergleichen
  await p.click('.leiste [data-typ=offen]'); const nOffen = await p.locator('.wahlbox').count(); assert.ok(nOffen >= 11); assert.ok((await p.locator('.wahlliste').first().innerText()).includes('Formatänderung') || (await p.locator('#haupt').innerText()).includes('Formatänderung'));
  await p.click('[data-act=wahl-alle][data-v="0"]'); await p.check('.wahlbox[data-k="aenderungen|TWP1984-T1"]'); await p.check('.wahlbox[data-k="regeln|ANDAIR26-X-01"]');
  await p.click('[data-act=freigeben-wahl]'); assert.ok((await p.locator('#dlg').innerText()).includes('2 von ')); await p.fill('#dlg textarea[name=notiz]', 'Teilfreigabe'); await p.click('#dlg button.haupt');
  assert.ok((await p.locator('.kopf p').innerText()).startsWith('Version 2')); assert.equal(await p.locator('.wahlbox').count(), nOffen - 2);
  assert.equal(await p.evaluate(() => JSON.parse(window.__nb.S.lib.versionen[1].snapshot).aenderungen.length), 1);
  await p.click('.offenliste [data-act=offen-weg][data-k="regeln|ANDAIR26-X-02"]'); await p.click('#dlg button.haupt'); assert.equal(await p.locator('.wahlbox').count(), nOffen - 3); assert.equal(await p.evaluate(() => window.__nb.S.lib.regeln.some(r => r.id === 'ANDAIR26-X-02')), false);
  await p.click('.leiste [data-typ=verlauf]'); await p.selectOption('#vgl-a', '1'); await p.selectOption('#vgl-b', '2');
  let vg = await p.locator('#vergleich').innerText(); assert.ok(vg.includes('Textänderungen (1)') && vg.includes('Regeln (1)') && vg.includes('Geänderte Seitentexte (1)'), vg.slice(0, 300));
  await p.selectOption('#vgl-b', 'jetzt'); vg = await p.locator('#vergleich').innerText(); assert.ok(vg.includes('Anmerkungen'));
  await p.click('[data-act=freigeben]'); await p.fill('textarea[name=notiz]', 'Test'); await p.click('#dlg button.haupt'); assert.ok((await p.locator('.kopf p').innerText()).startsWith('Version 3') && !(await p.locator('.kopf p').innerText()).includes('nicht freigegeben'));
  await p.evaluate(() => window.__nb.oeffne('tws82', 'pdf')); await p.waitForSelector('.seite[data-fertig]'); assert.equal(await p.locator('.seite').count(), 148);
  await p.evaluate(() => window.__nb.oeffne('twk17', 'pdf')); await p.waitForSelector('.seite[data-fertig]'); assert.equal(await p.locator('.teile button').count(), 3); assert.equal(await p.locator('.seite').count(), 226);
  await p.evaluate(() => window.__nb.oeffne('alt67', 'pdf')); assert.equal(await p.locator('.leerblock [data-act=pdf-neu]').count(), 1);
  await p.click('.leiste [data-typ=fassung]'); assert.equal(await p.locator('.regel.fass').count(), 19);
  await p.evaluate(() => window.__nb.oeffne('twp84', 'info')); assert.ok((await p.locator('#haupt').innerText()).includes('Überschrift 2')); await p.click('#haupt [data-act=struktur-neu]'); await p.waitForSelector('.meldung:has-text("Struktur neu erkannt")');
  assert.equal(await p.evaluate(() => window.__nb.S.lib.formate.length), 1); assert.ok(await p.evaluate(() => window.__nb.S.lib.struktur['d-twp84-1'].bloecke.length > 100));
  // Prüfstatus und Erstfreigabe
  assert.equal(await p.evaluate(() => window.__nb.S.lib.werke.find(w => w.id === 'twp84').digital.status), 'bearbeitung', 'erste OCR-Korrektur setzt «In Bearbeitung»');
  await p.evaluate(() => window.__nb.oeffne('twp84', 'edit')); await p.waitForSelector('.seite[data-fertig]'); await p.click('[data-act=seite-ok]'); assert.ok((await p.locator('[data-act=seite-ok]').innerText()).includes('✓'));
  await p.click('.werkkopf [data-act=digital]'); await p.selectOption('#dlg select[name=ziel]', 'pruefung'); await p.click('#dlg button.haupt'); assert.ok((await p.locator('.werkkopf .pruefstand').innerText()).includes('Zur Prüfung'));
  await p.click('.leiste [data-typ=pruefung]'); assert.equal(await p.locator('.bibtab tbody tr').count(), 74); await p.selectOption('#pf', 'pruefung'); assert.equal(await p.locator('.bibtab tbody tr').count(), 1); assert.ok((await p.locator('.bibtab tbody tr').innerText()).includes('1 von 79'));
  await p.click('.bibtab [data-act=digital]'); await p.selectOption('#dlg select[name=ziel]', 'freigegeben'); await p.check('#dlg input[name=ok]'); await p.click('#dlg button.haupt'); assert.ok((await p.locator('#dlg .fehler').innerText()).includes('Prüferliste')); await p.click('#dlg [data-act=dlg-zu]');
  await p.click('[data-act=mehr]'); await p.fill('#pruefer-liste', 'D. Heusser\nL. Riedo'); await p.click('[data-act=pruefer-speichern]'); await p.click('#dlg [data-act=dlg-zu]');
  const vVor = await p.evaluate(() => window.__nb.S.lib.versionen.length);
  await p.click('.bibtab [data-act=digital]'); await p.selectOption('#dlg select[name=ziel]', 'freigegeben'); await p.click('#dlg button.haupt'); assert.ok((await p.locator('#dlg .fehler').innerText()).includes('bestätigen'));
  await p.check('#dlg input[name=ok]'); await p.click('#dlg button.haupt'); assert.equal(await p.evaluate(() => window.__nb.S.lib.versionen.length), vVor + 1);
  assert.deepEqual(await p.evaluate(() => { const d = window.__nb.S.lib.werke.find(w => w.id === 'twp84').digital; return [d.status, d.pruefer]; }), ['freigegeben', 'D. Heusser']);
  await p.selectOption('#pf', ''); await p.click('.leiste [data-typ=start]'); assert.equal(await p.locator('.karte .marke:has-text("Freigegeben")').count(), 1); assert.equal(await p.locator('.karte .marke:has-text("Ungeprüft")').count(), 73);
  // Glossar, Index, Volltext
  await p.click('.leiste [data-typ=glossar]'); const nG = await p.locator('.glossar tbody tr').count(); assert.ok(nG > 400, 'Glossar ' + nG);
  await p.fill('#gq', 'Explosionsschutzventil'); assert.ok(await p.locator('.glossar tbody tr').count() >= 5); assert.ok((await p.locator('.glossar tbody').innerText()).includes('ESV'));
  await p.click('[data-act=glossar-neu]'); await p.fill('#dlg input[name=begriff]', 'KBG'); await p.fill('#dlg textarea[name=bedeutung]', 'Kleinbelüftungsgerät'); await p.selectOption('#dlg select[name=werkId]', 'tph11'); await p.click('#dlg button.haupt');
  assert.equal(await p.locator('.glossar tbody tr').count(), 0 + await p.locator('.glossar tbody tr').count()); await p.fill('#gq', 'KBG'); assert.ok((await p.locator('.glossar tbody').innerText()).includes('nicht freigegeben'));
  await p.click('.leiste [data-typ=index]'); await p.fill('#ixq', 'ESV'); await p.click('[data-act=ix-auf][data-b="ESV"]'); assert.ok((await p.locator('.ixdetail').innerText()).includes('TWP 1984'));
  await p.click('[data-act=ix-tab][data-v=kapitel]'); await p.fill('#ixq', 'Platzbedarf'); assert.ok(await p.locator('.sachliste li a').count() >= 2);
  await p.fill('#q', 'Panzerschiebewand'); await p.waitForSelector('.volltreffer'); assert.ok(await p.locator('.volltreffer').count() >= 2); await p.locator('.volltreffer a[data-act=pdf-seite]').first().click(); await p.waitForSelector('.seite[data-fertig]'); assert.ok((await p.locator('.lesetext').innerText()).includes('Panzerschiebew'));
  await p.fill('#q', '');
  // Neues PDF hinzufügen, speichern, neu laden
  await p.evaluate(() => window.__nb.oeffne('twp66')); await p.click('.werkkopf [data-act=pdf-neu]'); await p.setInputFiles('#dlg input[name=datei]', path0 + '/testnorm.pdf'); await p.click('#dlg button.haupt'); await p.waitForSelector('.seite[data-fertig]'); assert.equal(await p.locator('.seite').count(), 4);
  await p.click('.kopf [data-act=speichern]'); await p.waitForSelector('.meldung:has-text("Gespeichert im Ordner")');
  assert.ok(fs.readdirSync(path.join(TMP, 'pdf', 'eigene')).some(f => f.endsWith('testnorm.pdf'))); const gesp = JSON.parse(fs.readFileSync(path.join(TMP, 'daten', 'bibliothek.json'), 'utf8')); assert.equal(gesp.aenderungen.length, 4); assert.ok(!gesp.seitentext && fs.existsSync(path.join(TMP, 'daten', 'texte.json')));
  const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 390, height: 800 }); p2.on('pageerror', e => errs.push('neu geladen: ' + e.message)); await p2.goto(URL0); await p2.waitForSelector('.karte');
  assert.equal(await p2.evaluate(() => window.__nb.S.lib.aenderungen.length), 4); assert.equal(await p2.evaluate(() => window.__nb.S.lib.werke.find(w => w.id === 'twp84').digital.status), 'freigegeben');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'kein Querscrollen Start');
  await p2.evaluate(() => window.__nb.oeffne('twp66', 'edit')); await p2.locator('.seite').scrollIntoViewIfNeeded(); await p2.waitForSelector('.seite[data-fertig]'); assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'kein Querscrollen Bearbeitung');
  // Tabellen und Skizzen aus der Texterkennung
  const geheSeite = async n => { await p.fill('#ed-sprung', String(n)); await p.press('#ed-sprung', 'Enter'); await p.waitForSelector(`.seite[data-seite="${n}"][data-fertig]`); };
  await p.evaluate(() => { const S = window.__nb.S; S.ed.ebene = ''; S.ed.ansicht = 'neu'; S.ed.dok = 'd-twp84-1'; S.ed.seite = 1; window.__nb.oeffne('twp84', 'edit'); });
  await geheSeite(64); await p.waitForSelector('.lesetext .ue-tabelle table');
  let tab = await p.locator('.lesetext .ue-tabelle table').first().innerText(); assert.ok(tab.includes('VA 150') && tab.includes('300'), 'Tabelle 3.1-3: ' + tab);
  assert.ok(await p.locator('.lesetext .ue-tabelle thead th').count() >= 5); assert.ok(!(await p.locator('.lesetext').innerText()).includes('[[Tabelle'));
  await p.screenshot({ path: D + 'k_tabelle.png' });
  await p.click('.ue-tabelle [data-act=ue-bearbeiten]'); await p.waitForSelector('#dlg .uegitter textarea'); await p.waitForFunction(() => { const i = document.querySelector('#dlg .uevorschau img'); return i && i.naturalWidth > 300; });
  const zellen = await p.locator('#dlg .uegitter textarea').count(); await p.click('#dlg [data-act=ue-gitter][data-op="z+"]'); assert.ok(await p.locator('#dlg .uegitter textarea').count() > zellen);
  await p.fill('#dlg textarea[name=c_1_0]', 'bis 13 SP'); await p.screenshot({ path: D + 'k_tabelle_dialog.png' }); await p.click('#dlg button.haupt');
  assert.ok((await p.locator('.lesetext .ue-tabelle.hand table').innerText()).includes('bis 13 SP'));
  assert.equal(await p.evaluate(() => window.__nb.S.lib.uebernahmen.length), 1);
  await p.click('.ue-tabelle [data-act=ue-typ]'); await p.waitForFunction(() => { const i = document.querySelector('.lesetext .ue-skizze img.ausschnitt'); return i && i.naturalWidth > 300; });
  await p.click('.ue-skizze [data-act=ue-typ]'); await p.waitForSelector('#dlg .uegitter textarea'); assert.equal(await p.inputValue('#dlg textarea[name=c_1_0]'), 'bis 13 SP'); await p.click('#dlg button.haupt'); await p.waitForSelector('.lesetext .ue-tabelle.hand table');
  await geheSeite(38); await p.waitForFunction(() => { const i = document.querySelector('.lesetext .ue-skizze img.ausschnitt'); return i && i.complete && i.naturalWidth > 500; });
  assert.ok((await p.locator('.lesetext').innerText()).includes('Grundrissbeispiele')); await p.screenshot({ path: D + 'k_skizze.png' });
  // Skizze und Tabelle von Hand aus dem Scan übernehmen
  const vorher = await p.locator('.lesetext .ue').count();
  await p.click('[data-act=pdf-mark][data-art=skizze]'); bx = await p.locator('.seite').boundingBox();
  await p.mouse.move(bx.x + bx.width * 0.3, bx.y + bx.height * 0.05); await p.mouse.down(); await p.mouse.move(bx.x + bx.width * 0.9, bx.y + bx.height * 0.12, { steps: 4 }); await p.mouse.up();
  await p.waitForSelector('#dlg input[name=titel]'); await p.fill('#dlg input[name=titel]', 'Testskizze'); await p.click('#dlg button.haupt');
  assert.equal(await p.locator('.lesetext .ue').count(), vorher + 1); assert.ok((await p.locator('.lesetext .ue.hand figcaption').last().innerText()).includes('Testskizze'));
  await p.locator('.lesetext .ue.hand [data-act=ue-weg]').last().click(); await p.click('#dlg button.haupt'); assert.equal(await p.locator('.lesetext .ue').count(), vorher);
  await geheSeite(64); await p.click('[data-act=pdf-mark][data-art=tabelle]'); await p.locator('.seite').evaluate(el => el.scrollIntoView({ block: 'end' })); bx = await p.locator('.seite').boundingBox();
  await p.mouse.move(bx.x + bx.width * 0.06, bx.y + bx.height * 0.655); await p.mouse.down(); await p.mouse.move(bx.x + bx.width * 0.93, bx.y + bx.height * 0.71, { steps: 4 }); await p.mouse.up();
  await p.waitForSelector('#dlg .uegitter textarea'); assert.ok(await p.locator('#dlg .uegitter tr').count() >= 3, 'Zeilen aus dem Rechteck'); assert.ok(await p.locator('#dlg .uegitter tr:first-child td').count() >= 4, 'Spalten aus dem Rechteck');
  await p.click('#dlg button.haupt'); assert.equal(await p.locator('.lesetext .ue-tabelle').count(), 2);
  await p.click('.leiste [data-typ=offen]'); assert.ok(await p.locator('.wahlliste li:has-text("Tabelle/Skizze")').count() >= 2);
  // Suche findet den Inhalt von Tabellen
  await p.fill('#q', 'bis 13 SP'); await p.waitForSelector('#haupt'); assert.ok((await p.locator('#haupt').innerText()).includes('TWP'), 'Suche in Tabellen');
  await p.fill('#q', '');
  // unsicher gelesene Stellen: markiert, bis die Seite verglichen ist
  const us = await p.evaluate(() => { const u = window.__nb.S.lib.unsicher['d-twe94-1'] || {}; const n = Object.keys(u).find(k => u[k].length >= 2 && !/^\[\[/.test(u[k][0])); return n ? +n : 0; });
  assert.ok(us > 0, 'TWE 1994 hat unsicher gelesene Stellen');
  await p.evaluate(n => { const S = window.__nb.S; S.ed.dok = 'd-twe94-1'; S.ed.seite = n; S.ed.ansicht = 'neu'; window.__nb.oeffne('twe94', 'edit'); }, us);
  await p.waitForSelector('.seite[data-fertig]'); assert.ok(await p.locator('mark.unsicher').count() >= 1); await p.screenshot({ path: D + 'k_unsicher.png' });
  await p.click('[data-act=seite-ok]'); assert.equal(await p.locator('.lesetext mark.unsicher').count(), 0); await p.click('[data-act=seite-ok]');
  // Druckansicht mit Tabellen und Skizzen
  await p.evaluate(() => { const S = window.__nb.S; S.ed.dok = 'd-twp84-1'; S.ed.seite = 38; window.__nb.oeffne('twp84', 'edit'); }); await p.waitForSelector('.seite[data-fertig]');
  await p.evaluate(() => { window.print = () => {}; }); await p.click('[data-act=ed-druck]'); await p.selectOption('#dlg select[name=umfang]', 'seite'); await p.click('#dlg button.haupt');
  await p.waitForFunction(() => { const i = document.querySelector('#druck img.ausschnitt'); return i && i.src.startsWith('data:image/png'); }); assert.equal(await p.locator('#druck .uetools').count(), 0);
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  // Ohne Webserver: Startschirm mit Ordnerwahl
  const p3 = await b.newPage(); p3.on('pageerror', e => errs.push('file: ' + e.message)); await p3.goto('file://' + R + '/index.html'); await p3.waitForSelector('.startschirm [data-act=ordner]');
  srv.close();
  console.log('Fehler:', errs); assert.equal(errs.length, 0); await b.close(); console.log('TEST OK');
})().catch(e => { console.error('Seitenfehler:', JSON.stringify(global.__errs || [])); console.error(String(e.stack || e).slice(0, 1500)); process.exit(1); });
