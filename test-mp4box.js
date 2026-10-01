const http = require('http');

const url = 'http://localhost:3001/video/series/TurboBrasil%402026/%4027101992/9361562.m3u8';
http.get(url, { timeout: 15000 }, (res) => {
  console.log('Status:', res.statusCode);
  let bytes = 0;
  const boxes = [];
  res.on('data', (c) => {
    bytes += c.length;
    if (bytes <= 100000) {
      for (let i = 0; i < c.length - 4; i += 4) {
        const box = c.slice(i, i + 4).toString('ascii');
        if (/^[a-z]{4}$/.test(box)) {
          boxes.push({ box, offset: bytes - c.length + i });
        }
      }
    }
    if (bytes > 500000) {
      console.log('MP4 box scan (first 500KB):');
      boxes.forEach(b => console.log('  ' + b.box + ' @ offset ' + b.offset));
      res.destroy();
    }
  });
  res.on('close', () => console.log('Total bytes read:', bytes));
  res.on('error', () => {});
}).on('error', (e) => console.log('Error:', e.message));
