// OpenTv — Multi-fornecedor (F1) + dedup multicamadas/remapeamento de
// categorias (F4).
// Registro de provedores no Supabase + carga de catálogo por provedor com
// ISOLAMENTO total: falha/timeout de um provedor nunca afeta o provedor
// padrão (telefunplay), que continua no caminho legado /xtream-api.
// A lógica de dedup/remapeamento mora em js/catalog-lib.js (compartilhada
// com o worker de indexação do Supabase — F5).
window.Providers = (function () {
    const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
    const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
    const DEFAULT_ID = 'telefunplay';
    const LS_KEY = 'opentv_providers_v1';
    const LS_TTL = 5 * 60 * 1000;
    // > _CATALOG_TIMEOUT (180s) do api.js: a carga do provedor tem margem
    // para o download completo das listas pela edge antes de desistir.
    const PER_PROVIDER_TIMEOUT = 200000;

    const CL = window.CatalogLib;

    let registryCache = null;

    function logDebug() {
        if (window.OPENTV_DEBUG && console && console.warn) console.warn.apply(console, arguments);
    }

    async function fetchRegistry() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const o = JSON.parse(raw);
                if (o && Array.isArray(o.list) && Date.now() - o.t < LS_TTL) return o.list;
            }
        } catch { /* sem cache */ }

        try {
            const r = await fetch(
                SUPA + '/rest/v1/providers?select=id,name,host,enabled,priority,expires_at&enabled=eq.true&order=priority.asc',
                {
                    headers: { apikey: ANON, Authorization: 'Bearer ' + ANON },
                    signal: AbortSignal.timeout(5000)
                }
            );
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const list = await r.json();
            if (!Array.isArray(list)) throw new Error('formato invalido');
            registryCache = list;
            try { localStorage.setItem(LS_KEY, JSON.stringify({ t: Date.now(), list })); } catch { /* quota */ }
            return list;
        } catch (e) {
            // registry indisponível: usa lista velha se houver; senão null
            // (null = só provedor padrão = comportamento idêntico ao atual)
            logDebug('[providers] registry indisponível:', e && e.message);
            try {
                const o = JSON.parse(localStorage.getItem(LS_KEY));
                if (o && Array.isArray(o.list)) return o.list;
            } catch { /* sem fallback */ }
            return null;
        }
    }

    // Provedores extras = registry menos o padrão (o padrão sempre carrega
    // pelo caminho legado, imune a falha de registry/edge novos).
    function extrasOf(list) {
        if (!Array.isArray(list)) return [];
        return list
            .filter(p => p && p.id && p.id !== DEFAULT_ID && p.enabled !== false)
            .sort((a, b) => (Number(a.priority) || 100) - (Number(b.priority) || 100));
    }

    async function loadOne(p) {
        try {
            const task = (async () => {
                const [lc, vc, sc, live, movies, series] = await Promise.all([
                    api.getLiveCategories(p.id),
                    api.getVodCategories(p.id),
                    api.getSeriesCategories(p.id),
                    api.getLiveStreams(null, p.id),
                    api.getVodStreams(null, p.id),
                    api.getSeries(null, p.id)
                ]);
                return {
                    pid: p.id,
                    priority: Number(p.priority) || 100,
                    liveCats: Array.isArray(lc) ? lc : [],
                    vodCats: Array.isArray(vc) ? vc : [],
                    seriesCats: Array.isArray(sc) ? sc : [],
                    live: Array.isArray(live) ? live : [],
                    movies: Array.isArray(movies) ? movies : [],
                    series: Array.isArray(series) ? series : []
                };
            })();
            const res = await Promise.race([
                task,
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + p.id)), PER_PROVIDER_TIMEOUT))
            ]);
            if (!res || (!res.movies.length && !res.series.length && !res.live.length)) {
                logDebug('[providers] descartado (vazio):', p.id);
                return null;
            }
            logDebug('[providers] carregado:', p.id, '| live', res.live.length, 'movies', res.movies.length, 'series', res.series.length);
            return res;
        } catch (e) {
            // ISOLAMENTO: provedor com erro é descartado; app segue normalmente
            logDebug('[providers] descartado:', p.id, '-', e && e.message);
            return null;
        }
    }

    // Cada provedor carrega em paralelo; um derrubado não afeta os outros.
    async function fetchCatalogs() {
        try {
            const list = await fetchRegistry();
            const extras = extrasOf(list);
            if (!extras.length) return [];
            const results = await Promise.all(extras.map(p => loadOne(p)));
            const packs = results.filter(Boolean);
            logDebug('[providers] packs ok:', packs.length, 'de', extras.length);
            return packs;
        } catch (e) {
            logDebug('[providers] falha na carga:', e && e.message);
            return [];
        }
    }

    // ---------- namespacing ----------
    // Cats no formato cru do Xtream ({category_id, category_name}), que é o
    // que o app.js lê em todo lugar (pills, grupos, kids, cards).
    function nsCat(c, pid) {
        const o = Object.assign({}, c);
        if (o.category_id != null) o.category_id = pid + ':' + o.category_id;
        return o;
    }

    function nsItem(it, pid, isSeries) {
        const o = Object.assign({}, it);
        o.provider = pid;
        if (o.stream_id != null) o.stream_id = pid + ':' + o.stream_id;
        if (isSeries && o.series_id != null) o.series_id = pid + ':' + o.series_id;
        if (o.category_id != null) o.category_id = pid + ':' + o.category_id;
        if (Array.isArray(o.category_ids)) o.category_ids = o.category_ids.map(x => pid + ':' + x);
        return o;
    }

    // ---------- merge ----------
    // state.all* já contêm o catálogo do provedor padrão (caminho legado).
    // loaded = resultados de fetchCatalogs() por pack.
    // Em prova de igualdade, o PADRÃO vence: o item extra vira fonte
    // alternativa (_alts) p/ failover (F2). Canais deduplicam só por nome
    // (mesmo nome = mesma estação; variações HD/SD/H265 viram _alts).
    function mergeInto(state, loaded) {
        if (!Array.isArray(loaded) || !loaded.length) return false;

        const defaultId = DEFAULT_ID;

        const mergeList = (defList, extraList, loose) => {
            const byName = new Map();
            for (const item of defList) {
                item.provider = defaultId;
                const n = CL.normName(item.name || item.title);
                if (!n) continue;
                if (!byName.has(n)) byName.set(n, []);
                byName.get(n).push(item);
            }
            const keep = [];
            let dups = 0;
            for (const extra of extraList) {
                const n = CL.normName(extra.name || extra.title);
                let dup = null;
                if (n) {
                    for (const c of (byName.get(n) || [])) {
                        if (loose || CL.isSameWork(c, extra)) { dup = c; break; }
                    }
                }
                if (dup) {
                    if (!dup._alts) dup._alts = [];
                    dup._alts.push(extra.stream_id); // id namespaced, já jogável
                    dups++;
                } else {
                    keep.push(extra);
                    if (n) {
                        if (!byName.has(n)) byName.set(n, []);
                        byName.get(n).push(extra);
                    }
                }
            }
            return { keep, dups };
        };

        // ordena por prioridade (menor primeiro): packs de menor prioridade
        // perdem na prova de igualdade e viram _alts
        const sorted = loaded.slice().sort((a, b) => a.priority - b.priority);

        const newMovies = [];
        const newSeries = [];
        const newLive = [];
        const newLCats = [];
        const newVCats = [];
        const newSCats = [];

        for (const pack of sorted) {
            const pid = pack.pid;

            // 1) namespacifica as cats primeiro: as chaves do map são ids
            //    prefixados ("b:5") e os valores são ids crus do base — sem
            //    colisão possível entre numerações de provedores diferentes.
            const lCats = pack.liveCats.map(x => nsCat(x, pid));
            const vCats = pack.vodCats.map(x => nsCat(x, pid));
            const sCats = pack.seriesCats.map(x => nsCat(x, pid));
            const lMap = CL.buildCatMap(lCats, state.liveCats);
            const vMap = CL.buildCatMap(vCats, state.vodCats);
            const sMap = CL.buildCatMap(sCats, state.seriesCats);

            // 2) nsItem nos itens e remapeia para a cat do base (id cru,
            //    sem prefixo — é a mesma cat dos itens do provedor padrão)
            const l = pack.live.map(x => CL.remapCats(nsItem(x, pid, false), lMap));
            const m = pack.movies.map(x => CL.remapCats(nsItem(x, pid, false), vMap));
            const s = pack.series.map(x => CL.remapCats(nsItem(x, pid, true), sMap));
            newLive.push(...l);
            newMovies.push(...m);
            newSeries.push(...s);

            // 3) cats extras sem match só entram se ainda houver item
            //    apontando para elas (as remapeadas somem da UI)
            newLCats.push(...usableCats(lCats, lMap, l));
            newVCats.push(...usableCats(vCats, vMap, m));
            newSCats.push(...usableCats(sCats, sMap, s));
        }

        const rm = mergeList(state.allMovies, newMovies, false);
        const rs = mergeList(state.allSeries, newSeries, false);
        const rl = mergeList(state.allLive, newLive, true);

        state.allMovies.push(...rm.keep);
        state.allSeries.push(...rs.keep);
        state.allLive.push(...rl.keep);
        state.liveCats.push(...newLCats);
        state.vodCats.push(...newVCats);
        state.seriesCats.push(...newSCats);

        // mais novo primeiro (só quando há extras — default puro não muda ordem)
        state.allMovies.sort((a, b) => (Number(b.added) || 0) - (Number(a.added) || 0));
        state.allSeries.sort((a, b) => (Number(b.added) || 0) - (Number(a.added) || 0));

        // busca local passa a ver o catálogo unido
        api.setLiveCache(state.allLive);
        api.setMovieCache(state.allMovies);
        api.setSeriesCache(state.allSeries);

        logDebug('[providers] merge ok | +', rm.keep.length, 'filmes,', '+', rs.keep.length, 'series,', '+', rl.keep.length, 'canais',
            '| dedup -', rm.dups, 'filmes, -', rs.dups, 'series, -', rl.dups, 'canais');
        return true;
    }

    // Categorias extras sem match só entram se algum item ainda apontar
    // para elas (as remapeadas deixam de contar e somem da UI).
    function usableCats(packCats, map, finalItems) {
        if (!Array.isArray(packCats)) return [];
        const used = new Set(finalItems.map(x => String(x.category_id)));
        return packCats.filter(c => c && c.category_id != null &&
            !map.has(String(c.category_id)) && used.has(String(c.category_id)));
    }

    function clearLocalCache() {
        try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
        registryCache = null;
    }

    return {
        DEFAULT_ID,
        fetchRegistry,
        fetchCatalogs,
        mergeInto,
        clearLocalCache
    };
})();
