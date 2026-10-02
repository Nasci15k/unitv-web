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

    // ---------- F10: dedup 100% idêntico DENTRO de cada lista ----------
    // Remove cópias da MESMA obra na MESMA variante de idioma que existem
    // dentro de um único provedor (ex.: "Moana (2026)" 2x na base, "Malhacao"
    // vs "Malhação", "Tango e Cash" vs "Tango & Cash"). Regra interna (mais
    // agressiva que a entre-provedores, pois é a MESMA fonte listando a mesma
    // obra 2x): bucket por variantKey (normName+idioma) + anos compatíveis
    // (Δ≤1 quando ambos sabidos) + NÃO ter posters DIFERENTES conhecidos
    // (posters distintos = provas de obras diferentes → preserva). Sem prova
    // de ano/poster é a MESMA fonte → remove. Diferentes variantes (dub×leg)
    // nunca são tocadas — vira trabalho do groupVersions (F6). O perdedor
    // vira _alts do vencedor (failover preservado). Idempotente.
    function dedupSelf(list) {
        if (!Array.isArray(list) || list.length < 2) return 0;
        const score = (it) => {
            const y = it.year && it.year !== '0' ? 4 : 0;
            const r = parseFloat(it.rating);
            const rr = isFinite(r) && r > 0 ? 2 : 0;
            const p = (it.movie_image || it.cover || it.stream_icon) ? 1 : 0;
            return y + rr + p;
        };
        const buckets = new Map();
        list.forEach((it, i) => {
            if (!it) return;
            const k = CL.variantKey(it.name || it.title);
            if (!k || k === '\u0001') return; // sem nome: não mexe
            if (!buckets.has(k)) buckets.set(k, []);
            buckets.get(k).push(i);
        });
        const drop = new Set();
        for (const arr of buckets.values()) {
            if (arr.length < 2) continue;
            arr.sort((a, b) => score(list[b]) - score(list[a])); // melhor fica
            const kept = [];
            for (const idx of arr) {
                const it = list[idx];
                let dup = null;
                for (const kIdx of kept) {
                    const k = list[kIdx];
                    const ya = CL.extractYear(k), yb = CL.extractYear(it);
                    if (ya && yb && Math.abs(ya - yb) > 1) continue; // anos conflitam
                    const pa = CL.normPoster(k.movie_image || k.cover || k.stream_icon);
                    const pb = CL.normPoster(it.movie_image || it.cover || it.stream_icon);
                    if (pa && pb && pa !== pb) continue; // posters = obras diferentes
                    dup = k; break;
                }
                if (dup) {
                    if (!dup._alts) dup._alts = [];
                    const altId = it.stream_id != null ? it.stream_id : it.series_id;
                    if (altId != null && dup._alts.indexOf(altId) < 0) dup._alts.push(altId);
                    drop.add(idx);
                } else kept.push(idx);
            }
        }
        if (!drop.size) return 0;
        const out = [];
        for (let i = 0; i < list.length; i++) if (!drop.has(i)) out.push(list[i]);
        list.length = 0;
        for (const it of out) list.push(it);
        return drop.size;
    }

    // Rank de qualidade (maior = melhor): 4K/UHD=4, FHD/1080=3, HD/720=2, SD=1, outros=0
    function qualityRank(name) {
        const n = String(name || '').toLowerCase();
        if (/\b(2160p|4k|uhd|ultra hd)\b/.test(n)) return 4;
        if (/\b(1080p|fhd|full hd)\b/.test(n)) return 3;
        if (/\b(720p|hd)\b/.test(n)) return 2;
        if (/\b(sd)\b/.test(n)) return 1;
        return 0;
    }

    // Canais extremamente idênticos (mesma estação com variação de
    // qualidade/codec no nome: "Globo HD" x "Globo H265" x "Globo 4K").
    // normName já remove qualidade/colchetes → mesma chave = mesma estação.
    // Vencedor = melhor qualidade (FHD>HD>SD) + nome limpo + logo + EPG;
    // perdedores viram _alts (IDs) e _altItems (objetos completos p/ UI).
    // Idempotente. Retorna nº de canais colapsados.
    function dedupSelfLive(list) {
        if (!Array.isArray(list) || list.length < 2) return 0;
        const score = (it) => {
            const n = String(it.name || '');
            const qr = qualityRank(n);
            const clean = /\b(1080p|720p|2160p|4k|fhd|hdrip|hd|sd|h264|h265|hevc|web-?dl)\b/i.test(n) ? 0 : 3;
            return qr * 5 + clean + (it.stream_icon ? 1 : 0) + (it.epg_channel_id ? 1 : 0);
        };
        const buckets = new Map();
        list.forEach((it, i) => {
            if (!it) return;
            const k = CL.normName(it.name || it.title);
            if (!k) return;
            if (!buckets.has(k)) buckets.set(k, []);
            buckets.get(k).push(i);
        });
        const drop = new Set();
        for (const arr of buckets.values()) {
            if (arr.length < 2) continue;
            arr.sort((a, b) => score(list[b]) - score(list[a]));
            const win = list[arr[0]];
            for (let j = 1; j < arr.length; j++) {
                const loser = list[arr[j]];
                if (!win._alts) win._alts = [];
                if (!win._altItems) win._altItems = [];
                const id = loser.stream_id != null ? loser.stream_id : loser.series_id;
                if (id != null && win._alts.indexOf(id) < 0) win._alts.push(id);
                if (id != null) {
                    const altItem = {
                        stream_id: id,
                        name: loser.name || loser.title,
                        stream_icon: loser.stream_icon,
                        epg_channel_id: loser.epg_channel_id,
                        provider: loser.provider
                    };
                    if (win._altItems.findIndex(x => x.stream_id === id) < 0) win._altItems.push(altItem);
                }
                if (Array.isArray(loser._alts)) {
                    for (const x of loser._alts) if (win._alts.indexOf(x) < 0) win._alts.push(x);
                }
                if (Array.isArray(loser._altItems)) {
                    for (const x of loser._altItems) {
                        if (win._altItems.findIndex(y => y.stream_id === x.stream_id) < 0) win._altItems.push(x);
                    }
                }
                drop.add(arr[j]);
            }
        }
        if (!drop.size) return 0;
        const out = [];
        for (let i = 0; i < list.length; i++) if (!drop.has(i)) out.push(list[i]);
        list.length = 0;
        for (const it of out) list.push(it);
        return drop.size;
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
            // Ocultos (hiddenVersion) ENTREM no índice: é o mesmo conjunto de
            // candidatos do pré-F6, garantindo contagem idêntica de keep.
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
                let dupScore = -1;
                if (n) {
                    for (const c of (byName.get(n) || [])) {
                        if (loose) { dup = c; break; }
                        if (!CL.isSameWork(c, extra)) continue;
                        // melhor candidato: VISÍVEL > oculto; mesma variante
                        // de idioma > outra. Scoring 3 (visível+mesma) encerra.
                        const sv = CL.variantKey(c.name || c.title) === CL.variantKey(extra.name || extra.title);
                        const sc = (c.hiddenVersion ? 0 : 2) + (sv ? 1 : 0);
                        if (sc > dupScore) { dup = c; dupScore = sc; }
                        if (dupScore === 3) break;
                    }
                }
                if (dup) {
                    if (!dup._alts) dup._alts = [];
                    if (!dup._altItems) dup._altItems = [];
                    dup._alts.push(extra.stream_id); // id namespaced, já jogável
                    // armazena objeto completo p/ UI de troca de qualidade/provedor
                    const altItem = {
                        stream_id: extra.stream_id,
                        name: extra.name || extra.title,
                        stream_icon: extra.stream_icon,
                        epg_channel_id: extra.epg_channel_id,
                        provider: extra.provider
                    };
                    if (dup._altItems.findIndex(x => x.stream_id === extra.stream_id) < 0) dup._altItems.push(altItem);
                    // F6: mesma obra em OUTRA variante de idioma vira também
                    // "_versions" (objeto completo, tocável pelo seletor do
                    // detail) — só quando o alvo é visível; alvo oculto fica
                    // só em _alts (comportamento pré-F6, contagem preservada).
                    if (!loose && !dup.hiddenVersion &&
                        CL.variantKey(dup.name || dup.title) !== CL.variantKey(extra.name || extra.title)) {
                        if (!dup._versions) dup._versions = [];
                        dup._versions.push(extra);
                        extra._leader = dup;
                    }
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

        // F10: limpa idênticos internos ANTES do merge (base e cada pack)
        const removedMovies = dedupSelf(state.allMovies) + dedupSelf(newMovies);
        const removedSeries = dedupSelf(state.allSeries) + dedupSelf(newSeries);
        const removedLive = dedupSelfLive(state.allLive) + dedupSelfLive(newLive);

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
            '| dedup -', rm.dups, 'filmes, -', rs.dups, 'series, -', rl.dups, 'canais',
            '| F10 internos -', removedMovies, 'filmes, -', removedSeries, 'series, -', removedLive, 'canais');
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

    // F6 — agrupa variantes de idioma da MESMA obra em um único card.
    // O líder (maior LANG_RANK: dub > multi > leg > original) fica visível;
    // os demais recebem hiddenVersion=true mas PERMANECEM no array (pills
    // continuam contando 66.732/32.359) e entram em leader._versions, que o
    // detail modal lista como botões tocáveis. Idempotente — seguro de
    // chamar de novo após cada mergeInto(). Retorna nº de itens ocultados.
    function groupVersions(list) {
        if (!Array.isArray(list) || list.length < 2) return 0;
        const byNorm = new Map();
        for (const it of list) {
            if (!it || it.hiddenVersion) continue;
            const n = CL.normName(it.name || it.title);
            if (!n) continue;
            if (!byNorm.has(n)) byNorm.set(n, []);
            byNorm.get(n).push(it);
        }
        let hidden = 0;
        for (const arr of byNorm.values()) {
            if (arr.length < 2) continue;
            let leader = arr[0];
            for (const it of arr) {
                if (CL.langRank(it.name || it.title) > CL.langRank(leader.name || leader.title)) leader = it;
            }
            for (const it of arr) {
                if (it === leader || it.hiddenVersion) continue;
                if (CL.variantKey(it.name || it.title) === CL.variantKey(leader.name || leader.title)) continue;
                if (!CL.isSameWork(leader, it)) continue;
                if (!leader._versions) leader._versions = [];
                // versões já penduradas no oculto migram para o líder
                if (Array.isArray(it._versions)) {
                    for (const v of it._versions) {
                        if (v && v !== leader && leader._versions.indexOf(v) < 0) {
                            leader._versions.push(v);
                            v._leader = leader;
                        }
                    }
                    it._versions = [];
                }
                it.hiddenVersion = true;
                it._leader = leader;
                if (leader._versions.indexOf(it) < 0) leader._versions.push(it);
                hidden++;
            }
        }
        return hidden;
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
        groupVersions,
        dedupSelf,
        dedupSelfLive,
        clearLocalCache
    };
})();
