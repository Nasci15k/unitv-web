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

// ===== regexes EXATOS do app.js atual =====
const PLATFORM_DEFS = [
  ['Netflix', /netflix/], ['Prime Video', /amazon|prime video|\bprime\b/], ['HBO Max', /hbo/],
  ['Disney+', /disney/], ['Apple TV', /apple/], ['GloboPlay', /globo/],
  ['Paramount+', /paramount/], ['Crunchyroll', /crunchy|anime(?!s)/], ['Looke', /looke/]
];
const VOD_GENRE_DEFS = [
  ['Ação', /a[çc][ãa]o|acao|action/], ['Aventura', /aventura|adventure/],
  ['Comédia', /com[ée]dia|comedy|comedia/], ['Crime', /crime|policia/],
  ['Drama', /drama/], ['Terror', /terror|horror|medo/],
  ['Suspense', /suspense|thriller/], ['Romance', /romance/],
  ['Ficção & Fantasia', /fic[çc]|sci.?fi|fanta/], ['Animação & Anime', /anima[çc]|anime|desenho/],
  ['Família', /fam[íi]lia|familia/], ['Documentário', /document/],
  ['Mistério', /mist[ée]rio|misterio/], ['História', /hist[óo]ria|historia/],
  ['Faroeste', /faroeste|western/], ['Guerra', /guerra|war\b/],
  ['Música & Shows', /m[uú]sica|musica|musical|shows?|karaoke/],
  ['Clássicos & Retrô', /cl[áa]ssic|classic|retro|antigos/],
  ['Nacional', /nacional|brasileir/],
  ['Religiosos', /evang[ée]lic|religios|gospel|natal|jesus|bibli|louvor/],
  ['Coletâneas', /colet[âa]nea|coletanea|mazzaropi|resident|batman|bourne|star wars|brinquedo|jornada|trapalh|rocky|007|anjos da noite/]
];
const VOD_COLLECTION_DEFS = [
  ['Lançamentos', /lan[çc]amento|lancamento|estreia|2025|2026|di[áa]rios/],
  ['4K & Cinema', /4k|qualidade cinema|\b3d\b|uhd|bluray|remaster/],
  ['Legendados', /legendad/]
];
const SERIES_GENRE_DEFS = [
  ['Drama', /drama/], ['Comédia', /com[ée]dia|comedy|comedia/], ['Documentário', /document/],
  ['Animação & Animes', /anima[çc]|anime/], ['Reality Shows', /reality/],
  ['Crime', /crime/], ['Mistério', /mist[ée]rio|misterio/],
  ['Novelas & Turcas', /novela|turca|dorama/], ['Sci-Fi & Fantasia', /sci.?fi|fanta|fic[çc]/],
  ['Ação & Aventura', /a[çc][ãa]o|acao|action|aventura/], ['Kids & Família', /kids|fam[íi]lia|familia/],
  ['Guerra & Política', /war\b|politic|guerra/], ['Faroeste', /faroeste|western/],
  ['Romance', /romance/], ['Legendadas', /legendad/], ['Looke', /looke/]
];

function groupCount(cats, defs, catchAllName, items, label) {
  const counts = new Map();
  items.forEach(m => { const k = String(m.category_id); counts.set(k, (counts.get(k) || 0) + 1); });
  const seen = new Set();
  const out = [];
  defs.forEach(([name, re]) => {
    const ids = cats.filter(c => re.test(String(c.category_name || '').toLowerCase())).map(c => String(c.category_id));
    let n = 0;
    ids.forEach(id => { if (!seen.has(id)) { seen.add(id); n += counts.get(id) || 0; } });
    out.push([name, n]);
  });
  if (catchAllName) {
    let n = 0;
    cats.forEach(c => { const id = String(c.category_id); if (!seen.has(id)) n += counts.get(id) || 0; });
    out.push([catchAllName, n]);
  }
  console.log(`\n=== ${label} ===`);
  out.forEach(([n, c]) => console.log(`  ${n}: ${c}`));
  const total = items.length;
  const covered = out.reduce((a, [, c]) => a + c, 0);
  console.log(`  TOTAL: ${total} | coberto: ${covered} (${Math.round(covered / total * 100)}%)`);
  // categorias fora de tudo
  const missed = cats.filter(c => !seen.has(String(c.category_id)));
  if (missed.length && !catchAllName) console.log(`  SEM GRUPO:`, missed.map(c => c.category_name).join(' | '));
  return seen;
}

(async () => {
  const base = `/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`;
  const [vcats, vods, scats, series] = await Promise.all([
    get(base + '&action=get_vod_categories'), get(base + '&action=get_vod_streams'),
    get(base + '&action=get_series_categories'), get(base + '&action=get_series')
  ]);
  groupCount(vcats, PLATFORM_DEFS, null, vods, 'FILMES — STREAMING');
  groupCount(vcats, VOD_COLLECTION_DEFS, null, vods, 'FILMES — COLEÇÕES');
  groupCount(vcats, VOD_GENRE_DEFS, 'Diversos', vods, 'FILMES — GÊNEROS');
  groupCount(scats, PLATFORM_DEFS, null, series, 'SÉRIES — STREAMING');
  groupCount(scats, SERIES_GENRE_DEFS, 'Diversos', series, 'SÉRIES — GÊNEROS');
})().catch(e => console.error('FATAL', e.message));
