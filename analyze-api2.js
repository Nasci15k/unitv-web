const https = require('https');
const HOST = 'https://telefunplay.xyz';
const USER = 'TurboBrasil@2026';
const PASS = '@27101992';

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(HOST + path, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ _raw: d.substring(0, 300) }); } });
    }).on('error', reject);
  });
}

(async () => {
  const base = `/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`;

  // 1) Série com metadados completos (procura uma popular)
  const series = await get(base + '&action=get_series');
  const sarr = Array.isArray(series) ? series : [];
  const rich = sarr.find(s => s.cast && s.cast.length > 5 && s.rating && String(s.rating) !== '0' && s.backdrop_path) ||
               sarr.find(s => s.cast && s.cast.length > 5) ||
               sarr.find(s => s.rating && String(s.rating) !== '0');
  if (rich) {
    console.log('=== SÉRIE RICA ===', rich.name, '| id', rich.series_id);
    console.log('rating:', rich.rating, '| genre:', rich.genre, '| cast:', String(rich.cast).substring(0, 80));
    console.log('director:', String(rich.director).substring(0, 60), '| releaseDate:', rich.releaseDate, '| run_time:', rich.episode_run_time);
    console.log('backdrop:', String(rich.backdrop_path || '').substring(0, 100));
    console.log('youtube_trailer:', rich.youtube_trailer);
    const sinfo = await get(base + '&action=get_series_info&series_id=' + rich.series_id);
    const eps = sinfo.episodes || {};
    const sk = Object.keys(eps);
    if (sk.length && eps[sk[0]][0]) {
      const e0 = eps[sk[0]][0];
      console.log('\n--- episódio S', sk[0], 'E', e0.episode_num, '---');
      console.log('title:', e0.title);
      console.log('info.plot:', String(e0.info?.plot || '').substring(0, 150));
      console.log('info.duration:', e0.info?.duration, '| info.season:', e0.info?.season);
      console.log('SUBTITLES (campo do episódio):', JSON.stringify(e0.subtitles).substring(0, 500));
      console.log('info keys:', Object.keys(e0.info || {}));
    }
  }

  // quantas séries têm trailer/cast/director/rating
  let wTrailer = 0, wCast = 0, wDirector = 0, wRating = 0, wBackdrop = 0;
  sarr.forEach(s => {
    if (s.youtube_trailer) wTrailer++;
    if (s.cast && s.cast.length > 3) wCast++;
    if (s.director && s.director.length > 3) wDirector++;
    if (s.rating && String(s.rating) !== '0') wRating++;
    if (s.backdrop_path) wBackdrop++;
  });
  console.log(`\nTOTAL séries: ${sarr.length} | com trailer: ${wTrailer} | cast: ${wCast} | director: ${wDirector} | rating: ${wRating} | backdrop: ${wBackdrop}`);

  // 2) EPG no canal History (3979239 - tinha EPG antes)
  for (const sid of [3979239, 3979240]) {
    const epg = await get(base + '&action=get_short_epg&stream_id=' + sid + '&limit=10');
    const elist = (epg && epg.epg_listings) || [];
    console.log(`\n=== EPG stream ${sid}: ${elist.length} listings ===`);
    if (elist.length) {
      console.log('keys:', Object.keys(elist[0]));
      elist.slice(0, 3).forEach(l => {
        const dec = (b) => { try { return Buffer.from(b || '', 'base64').toString('utf8').substring(0, 60); } catch (e) { return '?'; } };
        console.log(' -', dec(l.title), '|', l.start, '->', l.end, '|', dec(l.description));
      });
    }
  }

  // 3) get_simple_data_table (agenda completa do dia)
  const tbl = await get(base + '&action=get_simple_data_table&stream_id=3979239');
  const tl = (tbl && tbl.epg_listings) || [];
  console.log(`\n=== DATA TABLE (dia completo): ${tl.length} programas ===`);
  if (tl.length) console.log('sample:', JSON.stringify({ ...tl[0], description: String(tl[0].description || '').substring(0, 40) }).substring(0, 300));

  // 4) rating dos filmes — distribuição (quantos têm rating 10-scale)
  const vods = await get(base + '&action=get_vod_streams');
  const varr = Array.isArray(vods) ? vods : [];
  let w10 = 0, w5 = 0, wNone = 0, tmdb = 0;
  varr.slice(0, 500).forEach(v => {
    if (!v.rating) wNone++;
    else if (Number(v.rating) > 5) w10++;
    else w5++;
    if (String(v.stream_icon || '').includes('tmdb')) tmdb++;
  });
  console.log(`\n=== VOD (500 primeiros): rating>5: ${w10} | rating<=5: ${w5} | sem: ${wNone} | poster tmdb: ${tmdb} ===`);
  // sample de nomes com year
  const sample = varr.slice(0, 3).map(v => ({ name: v.name, year: v.year, rating: v.rating, rating5: v.rating_5based }));
  console.log('samples:', JSON.stringify(sample));
})().catch(e => console.error('FATAL', e.message));
