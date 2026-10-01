const http = require('http');

const t = Date.now();
const url = 'http://localhost:3001/video/series/TurboBrasil%402026/%4027101992/9361562.m3u8';
http.get(url, { timeout: 60000 }, (res) => {
  console.log('Status:', res.statusCode);
  console.log('CT:', res.headers['content-type']);
  console.log('CL:', res.headers['content-length'] || 'none');
  console.log('TE:', res.headers['transfer-encoding'] || 'none');
  let bytes = 0;
  let t2 = Date.now();
  res.on('data', (c) => {
    bytes += c.length;
    if (bytes <= 2000 || bytes % 100000 < c.length) {
      const speed = (bytes / ((Date.now() - t2) / 1000) / 1024).toFixed(0);
      console.log(`[+${Date.now()-t}ms] Total: ${(bytes/1024).toFixed(0)}KB (${speed} KB/s)`);
    }
    if (bytes > 1000000) {
      console.log('Got 1MB+, aborting. Total:', (bytes/1024/1024).toFixed(1) + 'MB in', (Date.now()-t2) + 'ms');
      res.destroy();
    }
  });
  res.on('end', () => console.log('Stream ended:', (bytes/1024).toFixed(0) + 'KB in', (Date.now()-t) + 'ms'));
  res.on('close', () => console.log('Stream closed:', (bytes/1024).toFixed(0) + 'KB in', (Date.now()-t) + 'ms'));
  res.on('error', (e) => console.log('Error:', e.message, 'after', (bytes/1024).toFixed(0) + 'KB'));
}).on('error', (e) => {
  console.log('Request error:', e.message, 'in', (Date.now()-t) + 'ms');
});
