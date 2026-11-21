// Kleiner Webserver für die Normenbibliothek (nur lesen): node werkzeuge/server.js [Port]
// Dient zum Ansehen im Firmennetz und für die Tests. Gespeichert wird im Browser über «Ordner verbinden».
const http = require('http'), fs = require('fs'), path = require('path');
const TYP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
function server(wurzel, ueberlagerung) { // ueberlagerung: Ordner, dessen Dateien Vorrang haben (für Tests)
  return http.createServer((req, res) => {
    let p; try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
    if (p.endsWith('/')) p += 'index.html';
    const rel = path.normalize(p).replace(/^([/\\]|\.\.[/\\])+/, '');
    let datei = ueberlagerung && fs.existsSync(path.join(ueberlagerung, rel)) ? path.join(ueberlagerung, rel) : path.join(wurzel, rel);
    if (!datei.startsWith(wurzel) && !(ueberlagerung && datei.startsWith(ueberlagerung))) { res.writeHead(403); return res.end(); }
    fs.stat(datei, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('nicht gefunden'); }
      const kopf = { 'Content-Type': TYP[path.extname(datei).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && (m[1] || m[2])) {
        const von = m[1] ? +m[1] : Math.max(0, st.size - +m[2]), bis = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
        if (von > bis || von >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
        res.writeHead(206, Object.assign(kopf, { 'Content-Range': `bytes ${von}-${bis}/${st.size}`, 'Content-Length': bis - von + 1 }));
        return req.method === 'HEAD' ? res.end() : fs.createReadStream(datei, { start: von, end: bis }).pipe(res);
      }
      res.writeHead(200, Object.assign(kopf, { 'Content-Length': st.size }));
      req.method === 'HEAD' ? res.end() : fs.createReadStream(datei).pipe(res);
    });
  });
}
module.exports = { server };
if (require.main === module) { const port = +process.argv[2] || 8080; server(path.resolve(__dirname, '..')).listen(port, () => console.log(`Normenbibliothek: http://localhost:${port}/`)); }
