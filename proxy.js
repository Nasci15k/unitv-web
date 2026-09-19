const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');

const PROXY_PORT = 3000;
const TARGET_HOST = 'telefunplay.xyz';
const TARGET_PORT = 80;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t', '.m3u': 'application/vnd.apple.mpegurl'
};

function buildHeaders(host, extraHeaders = {}) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Accept-Encoding': 'identity',
    'Cache-Control': 'no-cache',
    'Referer': 'http://telefunplay.xyz/',
    ...extraHeaders
  };
  delete headers['host'];
  return headers;
}

function forwardRequest(targetHost, targetPath, clientReq, clientRes, isTarget = true) {
  return new Promise((resolve) => {
    const fullUrl = `http://${targetHost}${targetPath}`;
    console.log(`[PROXY] ${clientReq.method} ${fullUrl}`);

    const options = {
      hostname: targetHost,
      port: TARGET_PORT,
      path: targetPath,
      method: clientReq.method,
      headers: buildHeaders(targetHost),
      timeout: 30000
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const headers = { ...proxyRes.headers };

      // Handle redirect: follow server-side
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const redirectUrl = new URL(proxyRes.headers.location, `http://${targetHost}`);
        console.log(`[REDIRECT] -> ${redirectUrl.toString()}`);
        proxyRes.resume();

        // Build new request to redirect target
        const redirHost = redirectUrl.hostname;
        const redirPath = redirectUrl.pathname + redirectUrl.search;

        const redirOptions = {
          hostname: redirHost,
          port: redirectUrl.port || (redirectUrl.protocol === 'https:' ? 443 : 80),
          path: redirPath,
          method: clientReq.method,
          headers: buildHeaders(redirHost)
        };

        const redirectProtocol = redirectUrl.protocol === 'https:' ? https : http;
        const redirReq = redirectProtocol.request(redirOptions, (redirRes) => {
          const redirHeaders = { ...redirRes.headers };
          redirHeaders['access-control-allow-origin'] = '*';
          redirHeaders['access-control-allow-methods'] = '*';
          redirHeaders['access-control-allow-headers'] = '*';
          delete redirHeaders['content-security-policy'];
          delete redirHeaders['x-frame-options'];
          clientRes.writeHead(redirRes.statusCode, redirHeaders);
          redirRes.pipe(clientRes);
          resolve();
        });

        redirReq.on('error', (err) => {
          console.error(`[REDIRECT ERROR] ${err.message}`);
          if (!clientRes.headersSent) {
            clientRes.writeHead(502, { 'Content-Type': 'application/json' });
            clientRes.end(JSON.stringify({ error: 'Redirect error: ' + err.message }));
          }
          resolve();
        });

        redirReq.end();
        return;
      }

      // Normal response
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-methods'] = '*';
      headers['access-control-allow-headers'] = '*';
      delete headers['content-security-policy'];
      delete headers['x-frame-options'];
      clientRes.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(clientRes);
      resolve();
    });

    proxyReq.on('error', (err) => {
      console.error(`[PROXY ERROR] ${err.message}`);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
      }
      resolve();
    });

    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy();
      if (!clientRes.headersSent) {
        clientRes.writeHead(504, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ error: 'Gateway timeout' }));
      }
      resolve();
    });

    if (clientReq.method !== 'GET' && clientReq.method !== 'HEAD') {
      clientReq.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  });
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
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

  // API proxy
  if (parsedUrl.pathname.startsWith('/api/')) {
    const targetPath = parsedUrl.pathname.replace('/api/', '/') + (parsedUrl.search || '');
    await forwardRequest(TARGET_HOST, targetPath, req, res);
    return;
  }

  // Stream proxy (/stream/ -> strip prefix, /hls/ -> direct)
  if (parsedUrl.pathname.startsWith('/stream/')) {
    const targetPath = '/' + parsedUrl.pathname.slice('/stream/'.length) + (parsedUrl.search || '');
    await forwardRequest(TARGET_HOST, targetPath, req, res);
    return;
  }
  if (parsedUrl.pathname.startsWith('/hls/')) {
    await forwardRequest(TARGET_HOST, parsedUrl.pathname + (parsedUrl.search || ''), req, res);
    return;
  }

  // Static files
  let filePath = path.join(__dirname, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  
  // Prevent directory traversal
  if (!path.resolve(filePath).startsWith(path.resolve(__dirname))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);

  // Support Range requests (important for video seeking)
  const range = req.headers.range;
  if (range && ext.match(/\.(mp4|mkv|avi|webm|ts|mp3)$/)) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }
});

server.listen(PROXY_PORT, () => {
  console.log('');
  console.log('  UniTV Proxy');
  console.log('  ============');
  console.log(`  Running: http://localhost:${PROXY_PORT}`);
  console.log(`  API:     http://localhost:${PROXY_PORT}/api/...`);
  console.log(`  Stream:  http://localhost:${PROXY_PORT}/stream/...`);
  console.log(`  Target:  http://${TARGET_HOST}`);
  console.log('');
});
