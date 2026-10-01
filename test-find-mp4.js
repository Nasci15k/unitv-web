const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: 'localhost', port: 3001, path, timeout: 20000 }, (res) => {
      const headers = res.headers;
      res.resume();
      resolve({ status: res.statusCode, ct: headers['content-type'] || '', cl: headers['content-length'] || '0' });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

(async () => {
  const list = await get('/api/get_vod_movies');
  // proxy may not have that path — try player API style
  // fallback: fetch a known movie list via proxy /api
  console.log('probe list attempt', list.status, list.ct);

  // Direct content-type probe for a batch of movie IDs around recent ones + older range
  const ids = [];
  for (let i = 9973709; i >= 9973690; i--) ids.push(i);
  for (let i = 9000000; i <= 9000020; i++) ids.push(i);
  for (let i = 8000000; i <= 8000020; i++) ids.push(i);
  for (let i = 7000000; i <= 7000020; i++) ids.push(i);
  for (let i = 1000000; i <= 1000020; i++) ids.push(i);
  for (let i = 200000; i <= 200030; i++) ids.push(i);
  for (let i = 100000; i <= 100030; i++) ids.push(i);
  for (let i = 50000; i <= 500030; i++) ids.push(i);
  for (let i = 10000; i <= 100030; i++) ids.push(i);
  for (let i = 1000; i <= 1030; i++) ids.push(i);

  const found = [];
  let checked = 0;
  const concurrency = 8;
  let idx = 0;

  async function worker() {
    while (idx < ids.length) {
      const id = ids[idx++];
      try {
        const r = await get(`/video/movie/TurboBrasil%402026/%4027101992/${id}.mp4`);
        checked++;
        const ct = r.ct.toLowerCase();
        const isMkv = ct.includes('matroska') || ct.includes('mkv');
        const isMp4 = ct.includes('mp4') || (ct.includes('video') && !isMkv);
        if (!isMkv && r.status < 400) {
          found.push({ id, status: r.status, ct: r.ct, cl: r.cl });
          console.log('FOUND', JSON.stringify(found[found.length - 1]));
        }
        if (checked % 50 === 0) console.log('checked', checked, 'found', found.length);
      } catch (e) {
        // ignore
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log('DONE checked=' + checked + ' nonMkv=' + found.length);
  console.log(JSON.stringify(found, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
