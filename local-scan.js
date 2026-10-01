const https = require('https');
const http = require('http');
const UPSTREAM = 'https://telefunplay.xyz';
const USER = 'TurboBrasil@2026';
const PASS = '@27101992';
const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';

function api(path) {
  return new Promise((resolve, reject) => {
    https.get(`${UPSTREAM}/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}&${path}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } }); }).on('error', reject);
  });
}

function probe(id) {
  return new Promise(resolve => {
    const url = `${UPSTREAM}/live/${encodeURIComponent(USER)}/${encodeURIComponent(PASS)}/${id}.ts`;
    const req = https.get(url, { headers: { Range: 'bytes=0-1', 'User-Agent': 'Mozilla/5.0' } }, res => {
      res.resume();
      const code = res.statusCode;
      resolve([200, 206, 301, 302, 307, 308].includes(code) ? 'online' : (code === 404 ? 'offline' : 'offline'));
    });
    req.setTimeout(6000, () => { req.destroy(); resolve('offline'); });
    req.on('error', () => resolve('offline'));
  });
}

async function supaUpsert(rows) {
  const body = JSON.stringify(rows);
  const res = await fetch(`${SUPA}/rest/v1/channel_status?on_conflict=stream_id`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body
  });
  return res.status;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  const out = [];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  });
  await Promise.all(workers);
  return out;
}

(async () => {
  const t0 = Date.now();
  const live = await api('action=get_live_streams');
  console.log('canais:', live.length);
  const statuses = await mapLimit(live, 20, async (s) => {
    const st = await probe(s.stream_id);
    return { stream_id: String(s.stream_id), status: st, checked_at: new Date().toISOString() };
  });
  const online = statuses.filter(s => s.status === 'online').length;
  console.log(`online: ${online}/${statuses.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
  for (let i = 0; i < statuses.length; i += 500) {
    const code = await supaUpsert(statuses.slice(i, i + 500));
    console.log('upsert', i, '->', code);
  }
  console.log('PRONTO');
})().catch(e => console.error('FATAL', e.message));
