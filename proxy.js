const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

const PROXY_PORT = 3000;
const TARGET_HOST = 'telefunplay.xyz';

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl'
};

function proxyRequest(targetPath, req, res) {
  console.log(`[PROXY] ${req.method} -> http://${TARGET_HOST}${targetPath}`);

  const options = {
    hostname: TARGET_HOST,
    port: 80,
    path: targetPath,
    method: req.method,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const headers = {};
    for (const key in proxyRes.headers) {
      if (key !== 'content-security-policy' && key !== 'x-frame-options') {
        headers[key] = proxyRes.headers[key];
      }
    }
    headers['access-control-allow-origin'] = '*';
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[PROXY ERROR] ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
  });

  proxyReq.setTimeout(15000, () => {
    proxyReq.destroy();
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Gateway timeout' }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname.startsWith('/api/')) {
    const targetPath = parsedUrl.pathname.replace('/api/', '/') + (parsedUrl.search || '');
    return proxyRequest(targetPath, req, res);
  }

  if (parsedUrl.pathname.startsWith('/stream/')) {
    const targetPath = parsedUrl.pathname.replace('/stream/', '/');
    return proxyRequest(targetPath, req, res);
  }

  let filePath = path.join(__dirname, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PROXY_PORT, () => {
  console.log('');
  console.log('  UniTV Proxy Server');
  console.log('  ==================');
  console.log(`  Local:  http://localhost:${PROXY_PORT}`);
  console.log(`  API:    http://localhost:${PROXY_PORT}/api/player_api.php?username=...`);
  console.log(`  Target: http://${TARGET_HOST}`);
  console.log('');
  console.log('  Ctrl+C para parar');
  console.log('');
});
