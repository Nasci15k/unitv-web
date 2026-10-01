// OpenTv — Multi-fornecedor (F1)
// Registro de provedores no Supabase + carga de catálogo por provedor com
// ISOLAMENTO total: falha/timeout de um provedor nunca afeta o provedor
// padrão (telefunplay), que continua no caminho legado /xtream-api.
window.Providers = (function () {
    const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
    const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
    const DEFAULT_ID = 'telefunplay';
    const LS_KEY = 'opentv_providers_v1';
    const LS_TTL = 5 * 60 * 1000;
    const PER_PROVIDER_TIMEOUT = 45000;

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
            return results.filter(Boolean);
        } catch (e) {
            logDebug('[providers] falha na carga:', e && e.message);
            return [];
        }
    }

    // ---------- namespacing ----------
    function nsCat(c, pid) {
        const o = Object.assign({}, c);
        if (o.id != null) o.id = pid + ':' + o.id;
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

    function normName(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/\s*\b(1080p|720p|2160p|4k|fhd|hdrip|hd|sd|bluray|bdrip|web-?dl|hdcam|cam|dublado|dub|legendado|leg)\b\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function yearsCompatible(a, b) {
        if (!a || !b) return true; // um sem ano: assume mesmo título
        return String(a) === String(b);
    }

    // ---------- merge ----------
    // state.all* já contêm o catálogo do provedor padrão (caminho legado).
    // loaded = resultados de fetchCatalogs() já namespaced.
    // Em empate de título, o PADRÃO vence (é o que está provado); o item do
    // provedor novo vira fonte alternativa (_alts) p/ failover futuro (F2).
    function mergeInto(state, loaded) {
        if (!Array.isArray(loaded) || !loaded.length) return false;

        const defaultId = DEFAULT_ID;

        const mergeList = (defList, extraList, isSeries) => {
            const byName = new Map();
            for (const item of defList) {
                item.provider = defaultId;
                const n = normName(item.name || item.title);
                if (!byName.has(n)) byName.set(n, []);
                byName.get(n).push(item);
            }
            const keep = [];
            for (const extra of extraList) {
                const n = normName(extra.name || extra.title);
                const cands = byName.get(n);
                let dup = null;
                if (cands) {
                    for (const c of cands) {
                        if (yearsCompatible(c.year, extra.year)) { dup = c; break; }
                    }
                }
                if (dup) {
                    if (!dup._alts) dup._alts = [];
                    dup._alts.push(extra.stream_id); // id namespaced, já jogável
                } else {
                    keep.push(extra);
                    if (!byName.has(n)) byName.set(n, []);
                    byName.get(n).push(extra);
                }
            }
            return keep;
        };

        // filtra extras já namespaced e ordena por prioridade (menor primeiro)
        const sorted = loaded.slice().sort((a, b) => a.priority - b.priority);

        const newMovies = [];
        const newSeries = [];
        const newLive = [];
        const newLCats = [];
        const newVCats = [];
        const newSCats = [];

        for (const pack of sorted) {
            const pid = pack.pid;
            const m = pack.movies.map(x => nsItem(x, pid, false));
            const s = pack.series.map(x => nsItem(x, pid, true));
            const l = pack.live.map(x => nsItem(x, pid, false));
            newMovies.push(...m);
            newSeries.push(...s);
            newLive.push(...l);
            newLCats.push(...pack.liveCats.map(x => nsCat(x, pid)));
            newVCats.push(...pack.vodCats.map(x => nsCat(x, pid)));
            newSCats.push(...pack.seriesCats.map(x => nsCat(x, pid)));
        }

        const uniqMovies = mergeList(state.allMovies, newMovies, false);
        const uniqSeries = mergeList(state.allSeries, newSeries, true);

        state.allMovies.push(...uniqMovies);
        state.allSeries.push(...uniqSeries);
        state.allLive.push(...newLive);
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

        return true;
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
