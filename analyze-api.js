const https = require('https');
const HOST = 'https://telefunplay.xyz';
const USER = 'TurboBrasil@2026';
const PASS = '@27101992';

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(HOST + path, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ _raw: d.substring(0, 200), _status: res.statusCode }); } });
    }).on('error', reject);
  });
}

(async () => {
  const base = `/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`;

  // 1) VOD INFO de um filme (Toy Story 5 4k id=9973822 visto antes)
  const vod = await get(base + '&action=get_vod_info&stream_id=9973822');
  console.log('=== get_vod_info keys ===', Object.keys(vod || {}));
  if (vod && vod.info) {
    console.log('info keys:', Object.keys(vod.info));
    console.log('director:', vod.info.director);
    console.log('actors:', String(vod.info.actors || '').substring(0, 120));
    console.log('plot:', String(vod.info.plot || '').substring(0, 100));
    console.log('genre:', vod.info.genre, '| rating:', vod.info.rating, '| releasedate:', vod.info.releasedate, '| duration:', vod.info.duration);
    console.log('movie_image:', String(vod.info.movie_image || '').substring(0, 80));
    if (vod.info.audio) console.log('AUDIO TRACKS:', JSON.stringify(vod.info.audio).substring(0, 500));
    if (vod.info.video) console.log('video keys:', Object.keys(vod.info.video), '| video.subtitles:', JSON.stringify(vod.info.video.subtitles || 'none').substring(0, 300));
    if (vod.info.subtitles) console.log('SUBTITLES:', JSON.stringify(vod.info.subtitles).substring(0, 300));
  }
  if (vod && vod.movie_data) console.log('movie_data:', JSON.stringify(vod.movie_data).substring(0, 300));

  // 2) lista VOD — campos por item
  const vods = await get(base + '&action=get_vod_streams');
  const arr = Array.isArray(vods) ? vods : [];
  console.log('\n=== get_vod_streams ===', arr.length, 'items; first keys:', arr[0] ? Object.keys(arr[0]) : 'none');
  if (arr[0]) console.log('sample:', JSON.stringify(arr[0]).substring(0, 400));

  // 3) SERIES lista — campos
  const series = await get(base + '&action=get_series');
  const sarr = Array.isArray(series) ? series : [];
  console.log('\n=== get_series ===', sarr.length, 'items; keys:', sarr[0] ? Object.keys(sarr[0]) : 'none');
  if (sarr[0]) console.log('sample:', JSON.stringify({ ...sarr[0], plot: String(sarr[0].plot || '').substring(0, 60), cast: String(sarr[0].cast || '').substring(0, 40) }).substring(0, 500));

  // 4) SERIES INFO de uma série (pega primeiro id)
  if (sarr[0] && sarr[0].series_id) {
    const sid = sarr[0].series_id;
    const sinfo = await get(base + '&action=get_series_info&series_id=' + sid);
    console.log('\n=== get_series_info id', sid, '===');
    if (sinfo.info) {
      console.log('info keys:', Object.keys(sinfo.info));
      console.log('name:', sinfo.info.name, '| backdrop_path:', String(sinfo.info.backdrop_path || '').substring(0, 90));
      console.log('plot:', String(sinfo.info.plot || '').substring(0, 80), '| cast:', String(sinfo.info.cast || '').substring(0, 60), '| director:', sinfo.info.director);
    }
    const eps = sinfo.episodes || {};
    const sk = Object.keys(eps);
    if (sk.length) {
      const e0 = eps[sk[0]][0];
      console.log('episode keys:', Object.keys(e0));
      if (e0.info) {
        console.log('ep.info keys:', Object.keys(e0.info));
        console.log('ep.title:', e0.info.title, '| plot:', String(e0.info.plot || '').substring(0, 100));
        console.log('ep duration:', e0.info.duration, '| movie_image:', String(e0.info.movie_image || '').substring(0, 70));
        if (e0.info.audio) console.log('EP AUDIO:', JSON.stringify(e0.info.audio).substring(0, 400));
        if (e0.info.video) console.log('EP video.subtitles:', JSON.stringify(e0.info.video.subtitles || 'none').substring(0, 200));
      }
    }
  }

  // 5) EPG de um canal live (primeiro canal)
  const live = await get(base + '&action=get_live_streams');
  const larr = Array.isArray(live) ? live : [];
  console.log('\n=== get_live_streams ===', larr.length, 'items; keys:', larr[0] ? Object.keys(larr[0]) : 'none');
  if (larr[0] && larr[0].stream_id) {
    const st = larr[0].stream_id;
    const epg = await get(base + '&action=get_short_epg&stream_id=' + st + '&limit=8');
    console.log('=== get_short_epg keys ===', Object.keys(epg || {}));
    const elist = (epg && epg.epg_listings) || [];
    console.log('listings:', elist.length, elist[0] ? Object.keys(elist[0]) : 'none');
    if (elist[0]) console.log('sample listing:', JSON.stringify({ ...elist[0], description: String(elist[0].description || '').substring(0, 50) }).substring(0, 400));
    const tbl = await get(base + '&action=get_simple_data_table&stream_id=' + st);
    console.log('=== get_simple_data_table keys ===', Object.keys(tbl || {}));
    const tl = (tbl && tbl.epg_listings) || [];
    console.log('table listings:', tl.length, tl[0] ? Object.keys(tl[0]) : 'none');
    if (tl[0]) console.log('sample table:', JSON.stringify({ ...tl[0], description: String(tl[0].description || '').substring(0, 40) }).substring(0, 350));
  }

  // 6) séries categorias — amostra p/ regroup
  const scats = await get(base + '&action=get_series_categories');
  console.log('\n=== series_categories sample ===', (scats || []).slice(0, 12).map(c => c.category_name).join(' | '));
  const vcats = await get(base + '&action=get_vod_categories');
  console.log('\n=== vod_categories sample ===', (vcats || []).slice(0, 15).map(c => c.category_name).join(' | '));
  const lcats = await get(base + '&action=get_live_categories');
  console.log('\n=== live_categories ALL ===', (lcats || []).map(c => c.category_name).join(' | '));
})().catch(e => console.error('FATAL', e.message));
