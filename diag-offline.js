const https = require('https');
const USER = 'TurboBrasil@2026';
const PASS = '@27101992';
const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';

function supaGet() {
  return new Promise((resolve, reject) => {
    https.get(`${SUPA}/rest/v1/channel_status?select=stream_id,status&status=eq.offline&limit=1000`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve([]); } }); }).on('error', reject);
  });
}

function probe(id) {
  return new Promise(resolve => {
    const url = `https://telefunplay.xyz/live/${encodeURIComponent(USER)}/${encodeURIComponent(PASS)}/${id}.ts`;
    const req = https.get(url, { headers: { Range: 'bytes=0-1', 'User-Agent': 'Mozilla/5.0' } }, res => {
      res.resume();
      resolve({ id, code: res.statusCode, loc: res.headers.location ? String(res.headers.location).substring(0, 50) : null });
    });
    req.on('timeout', () => { req.destroy(); resolve({ id, code: 'TIMEOUT' }); });
    req.on('error', e => resolve({ id, code: e.code || e.message }));
    req.setTimeout(6000);
  });
}

(async () => {
  const off = await supaGet();
  console.log('marcados offline no Supabase (amostra de 1000):', off.length);
  // pega 20 aleatorios
  const sample = off.sort(() => Math.random() - 0.5).slice(0, 20);
  const results = [];
  for (const s of sample) results.push(await probe(s.stream_id));
  const ok = results.filter(r => r.code === 200 || r.code === 206 || r.code === 302).length;
  const notFound = results.filter(r => r.code === 404).length;
  const other = results.filter(r => r.code !== 200 && r.code !== 206 && r.code !== 302 && r.code !== 404);
  console.log(`probe local de 20 "offline": ok=${ok} 404=${notFound} outros=${other.length}`);
  other.slice(0, 6).forEach(r => console.log('  outro:', r.id, '->', r.code));
  console.log('\nDetalhe de 8:');
  results.slice(0, 8).forEach(r => console.log(`  ${r.id}: ${r.code}${r.loc ? ' (redirect ' + r.loc + ')' : ''}`));
})().catch(e => console.error('FATAL', e.message));
