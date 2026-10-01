const https = require('https');
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

(async () => {
  const base = `/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`;

  const [scats, series, vcats, vods] = await Promise.all([
    get(base + '&action=get_series_categories'),
    get(base + '&action=get_series'),
    get(base + '&action=get_vod_categories'),
    get(base + '&action=get_vod_streams')
  ]);
  const sc = Array.isArray(scats) ? scats : [];
  const se = Array.isArray(series) ? series : [];
  const vc = Array.isArray(vcats) ? vcats : [];
  const vo = Array.isArray(vods) ? vods : [];

  console.log('=== SÉRIES CATEGORIAS (todas, com contagem) ===');
  const sCount = new Map();
  se.forEach(s => { const k = String(s.category_id); sCount.set(k, (sCount.get(k) || 0) + 1); });
  sc.forEach(c => console.log(`  [${c.category_id}] "${c.category_name}" — ${sCount.get(String(c.category_id)) || 0} séries`));

  // cobertura dos grupos atuais
  const GROUPS = [
    ['Netflix', /netflix/], ['Prime Video', /amazon|prime video|\bprime\b/], ['HBO Max', /hbo/],
    ['Disney+', /disney/], ['GloboPlay', /globo/], ['Paramount+', /paramount/],
    ['Apple TV', /apple/], ['Crunchyroll', /crunchy|anime/], ['Lançamentos', /lan[çc]amento/]
  ];
  let covered = new Set();
  GROUPS.forEach(([n, re]) => sc.filter(c => re.test(String(c.category_name).toLowerCase())).forEach(c => [...(c.category_ids || [c.category_id])].forEach(id => covered.add(String(id)))));
  const totalSeries = se.length;
  const inGroups = se.filter(s => (s.category_ids || [s.category_id]).some(id => covered.has(String(id)))).length;
  console.log(`\nTotal séries: ${totalSeries} | em grupos de plataforma: ${inGroups} | fora: ${totalSeries - inGroups}`);

  console.log('\n=== campo genre das SÉRIES ===');
  let withGenre = 0;
  const genreSet = new Map();
  se.forEach(s => {
    const g = String(s.genre || '').trim();
    if (g && g !== '0' && g !== 'null') { withGenre++; g.split(/[,;]/).map(x => x.trim()).filter(Boolean).forEach(x => genreSet.set(x, (genreSet.get(x) || 0) + 1)); }
  });
  console.log(`Séries com genre preenchido: ${withGenre}/${totalSeries}`);
  console.log('Top gêneros:', [...genreSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([g, n]) => `${g}(${n})`).join(', '));

  console.log('\n=== FILMES CATEGORIAS (todas) ===');
  const vCount = new Map();
  vo.forEach(v => { const k = String(v.category_id); vCount.set(k, (vCount.get(k) || 0) + 1); });
  vc.forEach(c => console.log(`  [${c.category_id}] "${c.category_name}" — ${vCount.get(String(c.category_id)) || 0} filmes`));

  // plataformas nos filmes?
  const PLAT = ['netflix', 'prime', 'amazon', 'hbo', 'max', 'disney', 'globo', 'paramount', 'apple', 'star', 'crunchy'];
  console.log('\nCategorias de filmes com nome de plataforma:');
  vc.filter(c => PLAT.some(p => String(c.category_name).toLowerCase().includes(p))).forEach(c => console.log(`  "${c.category_name}" — ${vCount.get(String(c.category_id)) || 0}`));

  console.log(`\nTotal filmes: ${vo.length}`);
})().catch(e => console.error('FATAL', e.message));
