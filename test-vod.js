const http = require('http');
const t = Date.now();
const url = 'http://localhost:3001/video/series/TurboBrasil%402026/%4027101992/9361562.m3u8';
http.get(url, { timeout: 20000 }, (res) => {
  console.log('Status:', res.statusCode);
  console.log('CT:', res.headers['content-type']);
  console.log('CL:', res.headers['content-length']);
  let bytes = 0;
  let first = true;
  res.on('data', (c) => {
    bytes += c.length;
    if (first) {
      first = false;
      console.log('First chunk:', c.length, 'bytes');
      console.log('Content preview (hex):', c.slice(0, 16).toString('hex'));
    }
    if (bytes > 100000) {
      console.log('Received >100KB, aborting test');
      console.log('Total bytes:', bytes, 'in', (Date.now()-t), 'ms');
      res.destroy();
    }
  });
  res.on('end', () => {
    console.log('Complete:', bytes, 'bytes in', (Date.now()-t), 'ms');
  });
  res.on('error', (e) => {
    console.log('Stream error:', e.message, 'after', bytes, 'bytes in', (Date.now()-t), 'ms');
  });
}).on('error', (e) => {
  console.log('Request error:', e.message, 'in', (Date.now()-t), 'ms');
});
