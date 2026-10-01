// OpenTv — biblioteca compartilhada de catálogo (F4/F5).
// Normalização de títulos, dedup multicamadas (nome + ano + pôster + rating,
// preservando homônimos sem prova) e remapeamento das categorias extras para
// as categorias existentes do provedor base.
// Carregada pelo front como <script> (window.CatalogLib) e pelo worker de
// indexação via require() — mesma lógica nos dois lados, sem duplicação.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CatalogLib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ---------- normalização de títulos ----------
    function stripDiacritics(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    // Chave de dedup: minúsculas, sem acento, sem ano entre ()/[], sem
    // marcadores de qualidade, sem pontuação. "Rocky II" ≠ "Rocky III";
    // "Titanic (1997) 1080p DUB" → "titanic".
    function normName(s) {
        return stripDiacritics(s)
            .toLowerCase()
            .replace(/\[[^\]]*\]/g, ' ')
            .replace(/[[(]\s*(?:18|19|20)\d{2}\s*[)\]]/g, ' ')
            .replace(/(\p{L})(\d{3,4}p\b)/gu, '$1 $2') // "DUB1080p" → "dub 1080p"
            .replace(/\b(1080p|720p|2160p|4k|fhd|hdrip|hd|sd|bluray|bdrip|web-?dl|hdcam|cam|dublado|dub|legendado|leg|multi|full|h264|h265|hevc|avc|mpeg4|mux)\b/g, ' ')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Ano do conteúdo: campo (year/releaseDate/release_date) ou ano entre
    // parênteses/colchetes no título. Ano solto no nome ("Blade Runner
    // 2049") é parte do título e não vale como ano de lançamento.
    function extractYear(it) {
        if (!it) return null;
        const fields = [it.year, it.releaseDate, it.release_date, it.first_air_date];
        for (const v of fields) {
            const m = String(v == null ? '' : v).match(/\b((?:18|19|20)\d{2})\b/);
            if (m) return Number(m[1]);
        }
        const m = String(it.name || it.title || '').match(/[([]\s*((?:18|19|20)\d{2})\s*[)\]]/);
        return m ? Number(m[1]) : null;
    }

    // Mesmo arquivo de imagem = mesma obra. Pôsteres TMDB têm path único;
    // o diretório de tamanho (w500/w600_and_h900_bestv2) é normalizado para
    // não divergir entre provedores que pedem resoluções diferentes.
    function normPoster(u) {
        let s = stripDiacritics(u).toLowerCase()
            .replace(/^https?:\/\//, '')
            .split('?')[0]
            .replace(/\/+$/, '');
        s = s.replace(/\/t\/p\/w\d+(?:_and_h\d+)?(?:_bestv2)?\//, '/t/p/');
        return s.length > 20 ? s : '';
    }

    function ratingOf(it) {
        const r = parseFloat(it && it.rating);
        return isFinite(r) && r > 0 ? r : null;
    }

    // Camadas de prova (exige mesmo título normalizado antes de tudo):
    // 1) anos conflitantes (Δ>1)  → OBRAS DIFERENTES (Mortal Kombat 1995/2021);
    // 2) mesmo pôster             → mesma obra;
    // 3) anos compatíveis         → mesma obra;
    // 4) um sabe o ano e o outro não → mesma obra (relançamento típico de
    //    IPTV: "O Sorveteiro (2026)" ≡ "O Sorveteiro");
    // 5) rating compatível (Δ≤0.2)→ mesma obra;
    // 6) sem prova                → HOMÔNIMOS PRESERVADOS (não deduplica no escuro).
    function isSameWork(a, b) {
        const na = normName(a.name || a.title);
        const nb = normName(b.name || b.title);
        if (!na || !nb || na !== nb) return false;
        const ya = extractYear(a);
        const yb = extractYear(b);
        if (ya && yb && Math.abs(ya - yb) > 1) return false;
        const pa = normPoster(a.movie_image || a.cover || a.stream_icon);
        const pb = normPoster(b.movie_image || b.cover || b.stream_icon);
        if (pa && pb && pa === pb) return true;
        if (ya && yb) return true;
        if (ya || yb) return true; // um sabe o ano, outro não → mesmo título
        const ra = ratingOf(a);
        const rb = ratingOf(b);
        if (ra && rb && Math.abs(ra - rb) <= 0.2) return true;
        return false;
    }

    // ---------- categorias ----------
    // Aliases palavra a palavra, canonicamente em PT (a UI é PT): "Action
    // Movies" → "acao movies" → kw "acao" → casa com "Filmes | Ação".
    const CAT_ALIASES = {
        'action': 'acao', 'actions': 'acao',
        'adventure': 'aventura',
        'comedy': 'comedia', 'comedies': 'comedia',
        'horror': 'terror',
        'thriller': 'suspense',
        'science fiction': 'ficcao cientifica', 'sci fi': 'ficcao cientifica',
        'scifi': 'ficcao cientifica', 'sf': 'ficcao cientifica',
        'fiction': 'ficcao',
        'documentary': 'documentario', 'documentaries': 'documentario',
        'animation': 'animacao', 'animated': 'animacao', 'cartoon': 'animacao', 'cartoons': 'animacao',
        'family': 'familia',
        'war': 'guerra',
        'western': 'faroeste',
        'music': 'musica',
        'mystery': 'misterio',
        'kids': 'infantil', 'children': 'infantil', 'child': 'infantil',
        'news': 'noticias',
        'sports': 'esportes', 'sport': 'esportes',
        'religious': 'religioso', 'religion': 'religioso',
        'history': 'historia',
        'fantasy': 'fantasia',
        'movies': 'filmes', 'movie': 'filmes'
    };
    const CAT_STOP = new Set([
        'de', 'do', 'da', 'das', 'dos', 'e', 'and', 'the', 'of', 'a', 'o', 'os', 'as',
        'um', 'uma', 'filmes', 'filme', 'movies', 'movie', 'series', 'serie',
        'canais', 'canal', 'channels', 'channel', 'tv', 'shows', 'todos', 'all',
        'ultra', 'hd', '4k', 'fhd', 'sdtv'
    ]);

    // Nome da categoria reduzido ao "tail" depois de | ou : (o vocabulário
    // de gênero mora lá: "Filmes | Ação" → "ação"), sem acento/pontuação.
    function normCat(name) {
        let s = stripDiacritics(name);
        s = s.replace(/\[[^\]]*\]/g, ' ');
        s = s.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
        s = s.replace(/\s+/g, ' ').trim();
        const m = s.match(/(?:.*[|:])\s*(.+)$/);
        if (m) s = m[1];
        s = s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ');
        return s.replace(/\s+/g, ' ').trim();
    }

    function kwOf(s) {
        return String(s || '').split(' ').filter(w => w && !CAT_STOP.has(w)).join(' ');
    }

    function canonWord(w) {
        if (CAT_ALIASES[w]) return CAT_ALIASES[w];
        if (w.endsWith('s') && CAT_ALIASES[w.slice(0, -1)]) return CAT_ALIASES[w.slice(0, -1)];
        return w;
    }

    function canonCat(s) {
        return String(s || '').split(' ').map(canonWord).join(' ').replace(/\s+/g, ' ').trim();
    }

    // Match em camadas da categoria extra contra as do base:
    // 1) tail normalizado idêntico ("acao" === "acao");
    // 2) palavra-chave canônica idêntica ("action movies" → "acao" ✓);
    // 3) palavra-chave contida na outra (>=4 chars);
    // 4) keyword bruta igual (sem alias);
    // 5) sem match → a categoria extra entra como NOVA (fallback honesto).
    function matchCat(pc, baseInfo) {
        const ne = normCat(pc.category_name);
        if (!ne) return null;
        const ke = kwOf(ne);
        const cke = kwOf(canonCat(ne));
        const i1 = baseInfo.findIndex(b => b.nc === ne);
        if (i1 >= 0) return baseInfo[i1];
        if (cke) {
            const i2 = baseInfo.findIndex(b => b.ck === cke);
            if (i2 >= 0) return baseInfo[i2];
        }
        if (cke) {
            const ew = cke.split(' ').filter(w => w.length >= 4);
            let best = null;
            let bestLen = 0;
            for (const b of baseInfo) {
                if (!b.ck) continue;
                const bw = b.ck.split(' ').filter(w => w.length >= 4);
                const hit = bw.some(x => ew.some(y => y.includes(x) || x.includes(y)));
                if (hit && b.ck.length > bestLen) { best = b; bestLen = b.ck.length; }
            }
            if (best) return best;
        }
        if (ke) {
            const i4 = baseInfo.findIndex(b => b.kw && b.kw === ke);
            if (i4 >= 0) return baseInfo[i4];
        }
        return null;
    }

    // packCats no formato cru do Xtream ({category_id, category_name}),
    // JÁ namespaced quando for o caso (a chave do map é o id string).
    // Retorna Map(idPackCat → {id, name} da cat do base).
    function buildCatMap(packCats, baseCats) {
        const map = new Map();
        if (!Array.isArray(packCats) || !Array.isArray(baseCats)) return map;
        const baseInfo = baseCats
            .filter(c => c && c.category_id != null)
            .map(c => {
                const nc = normCat(c.category_name);
                return { id: c.category_id, name: c.category_name, nc, kw: kwOf(nc), ck: kwOf(canonCat(nc)) };
            });
        if (!baseInfo.length) return map;
        for (const pc of packCats) {
            if (!pc || pc.category_id == null) continue;
            const hit = matchCat(pc, baseInfo);
            if (hit) map.set(String(pc.category_id), hit);
        }
        return map;
    }

    // Reaponta o item para a categoria do base quando houve match; o campo
    // category_name acompanha para os cards exibirem o nome já existente.
    function remapCats(item, map) {
        if (!map || !map.size) return item;
        const o = Object.assign({}, item);
        const hit = map.get(String(o.category_id));
        if (hit) {
            o.category_id = hit.id;
            if (Array.isArray(o.category_ids) && o.category_ids.length) o.category_ids = [hit.id];
            o.category_name = hit.name;
        }
        return o;
    }

    return {
        stripDiacritics,
        normName,
        extractYear,
        normPoster,
        ratingOf,
        isSameWork,
        normCat,
        kwOf,
        canonCat,
        matchCat,
        buildCatMap,
        remapCats
    };
});
