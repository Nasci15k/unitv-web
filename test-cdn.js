const http = require('http');

function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, {timeout: 8000}, res => {
      let d = '';
      res.on('data', c => { if (d.length < 2000) d += c; else d += '...TRUNCATED'; });
      res.on('end', () => resolve({status: res.statusCode, ct: res.headers['content-type'], body: d.substring(0, 1000)}));
      res.on('error', reject);
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

async function test() {
  console.log('=== M3U8 ===');
  const m3u8 = await req('http://localhost:3001/stream/live/TurboBrasil%402026/%4027101992/3979186.m3u8');
  console.log(m3u8.status, m3u8.ct);
  console.log(m3u8.body);
  
  const lines = m3u8.body.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('http://localhost:3001/cdn/')) {
      console.log('\n=== SEGMENT TEST ===');
      console.log('URL:', t.substring(0, 140));
      try {
        const seg = await req(t);
        console.log('Status:', seg.status, 'CT:', seg.ct, 'Size:', seg.body.length);
      } catch(e) {
        console.log('ERROR:', e.message);
      }
      break;
    }
  }
}
test().catch(e => console.error(e));
