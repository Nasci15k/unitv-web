const https = require('https');
const UPSTREAM = 'https://telefunplay.xyz';
const USER = 'TurboBrasil@2026';
const PASS = '@27101992';
const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
const CONC = 15;

function apiGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } });
    }).on('error', reject);
  });
}

function api(path) { return apiGet(`${UPSTREAM}/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}&${path}`); }

async function supaGetAll() {
  const rows = [];
  for (let p = 0; p < 100; p++) {
    const j = await apiGet(`${SUPA}/rest/v1/vod_meta?select=stream_id&limit=1000&offset=${p * 1000}`);
    if (!Array.isArray(j)) break;
    rows.push(...j);
    if (j.length < 1000) break;
  }
  return rows;
}

async function supaUpsert(rows) {
  const res = await fetch(`${SUPA}/rest/v1/vod_meta?on_conflict=stream_id`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows)
  });
  return res.status;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  const out = [];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; try { out[idx] = await fn(items[idx]); } catch (e) { out[idx] = null; } }
  });
  await Promise.all(workers);
  return out;
}

(async () => {
  const t0 = Date.now();
  const vods = await api('action=get_vod_streams');
  console.log('filmes:', vods.length);
  const existing = await supaGetAll();
  console.log('ja enriquecidos:', existing.length);
  const done = new Set(existing.map(r => String(r.stream_id)));
  const todo = vods.filter(v => !done.has(String(v.stream_id)));
  console.log('faltando:', todo.length);
  let saved = 0;
  const CHUNK = 500;
  let buffer = [];
  const flush = async () => {
    if (!buffer.length) return;
    const code = await supaUpsert(buffer);
    saved += buffer.length;
    console.log(`salvos: ${saved}/${todo.length} (${Math.round((Date.now() - t0) / 1000)}s, upsert ${code})`);
    buffer = [];
  };
  await mapLimit(todo, CONC, async (v) => {
    const j = await api('action=get_vod_info&vod_id=' + v.stream_id);
    const info = (j && j.info) || {};
    const genres = String(info.genre || '').trim();
    let year = String(info.releasedate || info.year || v.year || '').trim().substring(0, 4);
    if (!/^(19|20)\d{2}$/.test(year)) year = '';
    if (genres || year) {
      buffer.push({ stream_id: String(v.stream_id), kind: 'movie', genres: genres.substring(0, 120), year, updated_at: new Date().toISOString() });
    }
    if (buffer.length >= CHUNK) await flush();
  });
  await flush();
  console.log('ENRIQUECIMENTO COMPLETO:', saved, 'filmes em', Math.round((Date.now() - t0) / 1000) + 's');
})().catch(e => console.error('FATAL', e.message));
