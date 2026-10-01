const https = require('https');
const HOST = 'https://telefunplay.xyz';
const USER = 'TurboBrasil@2026';
const PASS = '@27101992';

function get(path) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    https.get(HOST + path, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ j: JSON.parse(d), ms: Date.now() - t0 }); } catch (e) { resolve({ j: null, ms: Date.now() - t0 }); } });
    }).on('error', reject);
  });
}

(async () => {
  const base = `/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`;
  const { j: vods } = await get(base + '&action=get_vod_streams');
  const arr = Array.isArray(vods) ? vods : [];
  // pega 8 filmes de categorias SEM gênero (Prime Video, Legendado, Lançamentos)
  const noGenreCats = new Set(['2657', '2656', '1832', '2670']);
  const sample = arr.filter(v => noGenreCats.has(String(v.category_id))).slice(0, 8);
  console.log('Testando get_vod_info em', sample.length, 'filmes sem gênero taggeado...');
  let ok = 0, tms = [];
  for (const v of sample) {
    const { j, ms } = await get(base + '&action=get_vod_info&vod_id=' + v.stream_id);
    tms.push(ms);
    const genre = j?.info?.genre;
    if (genre && String(genre).length > 2) ok++;
    console.log(`  [${v.stream_id}] ${String(v.name).substring(0, 34).padEnd(36)} genre="${genre || 'VAZIO'}" (${ms}ms)`);
  }
  console.log(`\nCom genre: ${ok}/${sample.length} | tempo médio: ${Math.round(tms.reduce((a, b) => a + b, 0) / tms.length)}ms`);
  console.log(`Projeção: 22k filmes @ ${Math.round(tms.reduce((a, b) => a + b, 0) / tms.length)}ms com 15 concorrentes = ~${Math.round(21960 * (tms.reduce((a, b) => a + b, 0) / tms.length) / 15 / 60000)} min`);
})().catch(e => console.error('FATAL', e.message));
