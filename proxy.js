const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');

process.on('uncaughtException', (e) => { console.error('[UNCAUGHT]', e.message); });
process.on('unhandledRejection', (e) => { console.error('[UNHANDLED]', e?.message || e); });

const PORT = 3001;
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.m3u8': 'application/vnd.apple.mpegurl',
  '.m3u': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.vtt': 'text/vtt; charset=utf-8',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

function serve(req, res, filePath, allowFallback) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      if (allowFallback) return serve(req, res, path.join(ROOT, 'index.html'), false);
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS));
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes'
    }, CORS);

    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (isNaN(start) || start >= stat.size) start = 0;
      if (isNaN(end) || end >= stat.size) end = stat.size - 1;
      if (start > end) { res.writeHead(416, CORS); res.end(); return; }
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
      headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).pipe(res);
  });
}
const XTREAM_HOST = 'telefunplay.xyz';

function proxyXtream(req, res, upstreamPath) {
  const target = `https://${XTREAM_HOST}${upstreamPath}`;
  const upstream = https.request(target, {
    method: req.method,
    headers: Object.assign({}, req.headers, {
      host: XTREAM_HOST,
      origin: undefined,
      referer: undefined
    })
  }, (ures) => {
    const headers = Object.assign({}, ures.headers, CORS);
    delete headers['content-encoding'];
    delete headers['content-length'];
    res.writeHead(ures.statusCode || 502, headers);
    ures.pipe(res);
  });
  upstream.on('error', (e) => {
    console.error('[PROXY]', e.message);
    if (!res.headersSent) {
      res.writeHead(502, Object.assign({ 'Content-Type': 'text/plain' }, CORS));
      res.end('Bad Gateway');
    }
  });
  if (req.method === 'GET' || req.method === 'HEAD') upstream.end();
  else req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS));
    res.end('405 Method Not Allowed');
    return;
  }
  const parsed = url.parse(req.url);
  let p;
  try { p = decodeURIComponent(parsed.pathname || '/'); } catch (e) { p = '/'; }
  if (p.indexOf('\0') !== -1) { res.writeHead(400, CORS); res.end('400 Bad Request'); return; }

  if (p.startsWith('/xtream-api/') || p.startsWith('/xtream-stream/')) {
    const upstreamPath = p.replace(/^\/xtream-(api|stream)/, '') + (parsed.search || '');
    proxyXtream(req, res, upstreamPath);
    return;
  }

  const filePath = path.resolve(path.join(ROOT, p === '/' ? 'index.html' : p));
  if (filePath !== ROOT && filePath.indexOf(ROOT + path.sep) !== 0) {
    res.writeHead(403, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS));
    res.end('403 Forbidden');
    return;
  }
  serve(req, res, filePath, true);
});

server.listen(PORT, () => {
  console.log(`\n  OpenTv Static — http://localhost:${PORT}\n`);
});
