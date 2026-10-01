const https = require('https');
const http = require('http');
const HOST = 'https://telefunplay.xyz';
const USER = 'TurboBrasil@2026';
const PASS = '@27101992';

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(HOST + path, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } });
    }).on('error', reject);
  });
}

function probe(url) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, res => {
      res.resume();
      resolve({ ok: res.statusCode < 400, status: res.statusCode, ms: Date.now() - t0 });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 'TIMEOUT', ms: Date.now() - t0 }); });
    req.on('error', e => resolve({ ok: false, status: e.code || e.message, ms: Date.now() - t0 }));
  });
}

(async () => {
  const base = `/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`;
  const [live, vods, series] = await Promise.all([
    get(base + '&action=get_live_streams'),
    get(base + '&action=get_vod_streams'),
    get(base + '&action=get_series')
  ]);
  const hosts = new Map();
  const countHost = (url) => {
    try { const h = new URL(url).hostname; hosts.set(h, (hosts.get(h) || 0) + 1); } catch (e) {}
  };
  (live || []).forEach(s => s.stream_icon && countHost(s.stream_icon));
  (vods || []).forEach(v => v.stream_icon && countHost(v.stream_icon));
  (series || []).forEach(s => s.cover && countHost(s.cover));
  console.log('=== HOSTS DE IMAGENS ===');
  const sorted = [...hosts.entries()].sort((a, b) => b[1] - a[1]);
  sorted.forEach(([h, n]) => console.log(`  ${h}: ${n}`));

  console.log('\n=== PROBE DOS TOP HOSTS (8s max) ===');
  const samples = {};
  (live || []).forEach(s => { if (s.stream_icon) { try { const h = new URL(s.stream_icon).hostname; if (!samples[h]) samples[h] = s.stream_icon; } catch (e) {} } });
  (vods || []).forEach(v => { if (v.stream_icon) { try { const h = new URL(v.stream_icon).hostname; if (!samples[h]) samples[h] = v.stream_icon; } catch (e) {} } });
  for (const [h, sample] of Object.entries(samples).slice(0, 15)) {
    const r = await probe(sample);
    console.log(`  ${h} → ${r.ok ? 'OK ' + r.status : 'FALHOU: ' + r.status} (${r.ms}ms)`);
  }
})().catch(e => console.error('FATAL', e.message));
