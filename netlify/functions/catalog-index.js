// OpenTv F5 — indexa o catálogo de TODOS os provedores habilitados no
// Supabase (catalog_items + catalog_categories), espelhando as listas dos
// provedores com as categorias extras remapeadas para as categorias
// existentes do provedor base (mesma biblioteca do front: js/catalog-lib.js).
// Espelho fiel por provedor: itens que saíram do provedor são apagados na
// mesma rodada; provedores desabilitados ficam no banco e somem da view
// catalog_active_items (habilitar de volta → aparecem, sem reindexar).
// Disparado pelo workers-background (mesmo gatilho de 6h) e também sob
// demanda: node -e "require('./netlify/functions/catalog-index').handler()"
const CL = require('../../js/catalog-lib.js');

const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
const FETCH_TIMEOUT = 120000;
const UPSERT_CHUNK = 200;
const PACK_PARALLEL = 2;

const log = (...a) => console.log('[catalog-index]', ...a);

async function supaUpsert(table, rows, onConflict) {
    const chunks = Math.ceil(rows.length / UPSERT_CHUNK);
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK);
        const url = `${SUPA}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
        const tc = Date.now();
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                apikey: ANON, Authorization: `Bearer ${ANON}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(chunk),
            signal: AbortSignal.timeout(60000)
        });
        if (!res.ok) throw new Error(`${table} upsert HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const n = Math.min(i + UPSERT_CHUNK, rows.length);
        if (n % (UPSERT_CHUNK * 20) === 0 || n === rows.length) {
            log(`${table}: ${n}/${rows.length} linhas (chunk ${Math.ceil(n / UPSERT_CHUNK)}/${chunks}, ${Date.now() - tc}ms)`);
        }
    }
}

async function supaDelete(table, query) {
    const res = await fetch(`${SUPA}/rest/v1/${table}?${query}`, {
        method: 'DELETE',
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        signal: AbortSignal.timeout(60000)
    });
    if (!res.ok && res.status !== 204) throw new Error(`${table} delete HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function fetchRegistry() {
    const res = await fetch(
        `${SUPA}/rest/v1/providers?select=id,name,host,username,password,priority,enabled&enabled=eq.true&order=priority.asc`,
        { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) throw new Error('registry HTTP ' + res.status);
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) throw new Error('registry vazio');
    return list.sort((a, b) => (Number(a.priority) || 100) - (Number(b.priority) || 100));
}

async function xtream(prov, action) {
    const u = new URL(prov.host + '/player_api.php');
    u.searchParams.set('username', prov.username || '');
    u.searchParams.set('password', prov.password || '');
    u.searchParams.set('action', action);
    const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(action + ' HTTP ' + res.status);
    const j = await res.json();
    if (!Array.isArray(j)) throw new Error(action + ' formato invalido');
    return j;
}

async function fetchPack(prov) {
    const [liveCats, vodCats, seriesCats, live, movies, series] = await Promise.all([
        xtream(prov, 'get_live_categories'),
        xtream(prov, 'get_vod_categories'),
        xtream(prov, 'get_series_categories'),
        xtream(prov, 'get_live_streams'),
        xtream(prov, 'get_vod_streams'),
        xtream(prov, 'get_series')
    ]);
    return { pid: prov.id, liveCats, vodCats, seriesCats, live, movies, series };
}

async function mapLimit(items, limit, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
            const idx = i++;
            try { await fn(items[idx]); } catch (e) { log('erro item', idx, e.message); }
        }
    }));
}

function num(v) {
    const n = parseFloat(v);
    return isFinite(n) && n > 0 ? n : null;
}

// Listas Xtream às vezes trazem o mesmo id repetido (comum em VOD);
// o Postgres recusa ON CONFLICT com linha duplicada no mesmo batch.
function dedupRows(rows, keyFn) {
    const m = new Map();
    for (const r of rows) m.set(keyFn(r), r);
    return [...m.values()];
}

function itemRows(pack, kind, list, catMap, catNames, nowIso) {
    const isSeries = kind === 'series';
    return list.map(it => {
        const r = catMap && catMap.size ? CL.remapCats(it, catMap) : it;
        const extId = String(isSeries ? it.series_id : it.stream_id);
        return {
            provider: pack.pid,
            kind,
            external_id: extId,
            name: it.name || null,
            title: it.title || null,
            year: CL.extractYear(it),
            poster: it.movie_image || it.cover || it.stream_icon || null,
            rating: num(it.rating),
            category_id: r.category_id != null ? String(r.category_id) : null,
            category_name: r.category_name || (r.category_id != null ? (catNames.get(String(r.category_id)) || null) : null),
            added: Number(it.added) || null,
            indexed_at: nowIso
        };
    });
}

function catRows(pack, kind, cats, nowIso) {
    return cats
        .filter(c => c && c.category_id != null)
        .map(c => ({
            provider: pack.pid,
            kind,
            category_id: String(c.category_id),
            category_name: String(c.category_name || '')
        }));
}

async function indexPack(pack, basePack, dryRun) {
    const nowIso = new Date().toISOString();
    const isBase = pack.pid === basePack.pid;
    const vMap = isBase ? new Map() : CL.buildCatMap(pack.vodCats, basePack.vodCats);
    const sMap = isBase ? new Map() : CL.buildCatMap(pack.seriesCats, basePack.seriesCats);
    const lMap = isBase ? new Map() : CL.buildCatMap(pack.liveCats, basePack.liveCats);

    const vNames = new Map(pack.vodCats.map(c => [String(c.category_id), c.category_name]));
    const sNames = new Map(pack.seriesCats.map(c => [String(c.category_id), c.category_name]));
    const lNames = new Map(pack.liveCats.map(c => [String(c.category_id), c.category_name]));

    const catAll = dedupRows([
        ...catRows(pack, 'vod', pack.vodCats),
        ...catRows(pack, 'series', pack.seriesCats),
        ...catRows(pack, 'live', pack.liveCats)
    ], r => r.kind + ':' + r.category_id);
    const items = dedupRows([
        ...itemRows(pack, 'movie', pack.movies, vMap, vNames, nowIso),
        ...itemRows(pack, 'series', pack.series, sMap, sNames, nowIso),
        ...itemRows(pack, 'live', pack.live, lMap, lNames, nowIso)
    ], r => r.kind + ':' + r.external_id);

    if (dryRun) {
        log(`[dry] ${pack.pid}: ${items.filter(x => x.kind === 'movie').length} filmes,`,
            `${items.filter(x => x.kind === 'series').length} series,`,
            `${items.filter(x => x.kind === 'live').length} canais,`,
            `${catAll.length} cats (remap vod=${vMap.size} series=${sMap.size} live=${lMap.size})`);
        return { provider: pack.pid, movies: pack.movies.length, series: pack.series.length, channels: pack.live.length };
    }

    // espelho fiel: o que o provedor nao devolveu nesta rodada sai do indice.
    // t0 = mesmo timestamp das linhas gravadas: o delete so pega linhas de
    // rodadas anteriores (nunca a propria leva, senao apagaria tudo).
    // Deletes sao best-effort: linha orfa nao quebra nada (a view ativa ja
    // esconde provedor desabilitado); timeout do PostgREST nao derruba a
    // rodada.
    const t0 = nowIso;
    await supaUpsert('catalog_categories', catAll, 'provider,kind,category_id');
    await supaUpsert('catalog_items', items, 'provider,kind,external_id');
    try {
        await supaDelete('catalog_items', `provider=eq.${encodeURIComponent(pack.pid)}&indexed_at=lt.${encodeURIComponent(t0)}`);
        const keep = new Set([...pack.vodCats, ...pack.seriesCats, ...pack.liveCats].map(c => String(c.category_id)));
        const stale = catAll.filter(r => !keep.has(r.category_id)).map(r => r.category_id);
        if (stale.length) {
            await supaDelete('catalog_categories', `provider=eq.${encodeURIComponent(pack.pid)}&category_id=in.(${stale.map(encodeURIComponent).join(',')})`);
        }
    } catch (e) { log(`${pack.pid}: limpeza pulada (${e.message.slice(0, 120)})`); }
    log(`${pack.pid}: ${pack.movies.length} filmes, ${pack.series.length} series, ${pack.live.length} canais indexados (remap vod=${vMap.size} series=${sMap.size} live=${lMap.size})`);
    return { provider: pack.pid, movies: pack.movies.length, series: pack.series.length, channels: pack.live.length };
}

async function runIndexation(opts) {
    const dryRun = !!(opts && opts.dryRun);
    const t0 = Date.now();
    const report = { ok: false, providers: {}, failed: [] };
    try {
        const registry = await fetchRegistry();
        const base = registry[0];
        log(`registry: ${registry.length} habilitados; base=${base.id}`);
        const basePack = await fetchPack(base);
        report.providers[base.id] = await indexPack(basePack, basePack, dryRun);

        const extras = registry.slice(1);
        let idx = 0;
        await Promise.all(Array.from({ length: Math.min(PACK_PARALLEL, extras.length) }, async () => {
            while (idx < extras.length) {
                const prov = extras[idx++];
                try {
                    const pack = await fetchPack(prov);
                    report.providers[prov.id] = await indexPack(pack, basePack, dryRun);
                } catch (e) {
                    report.failed.push(prov.id);
                    log(`${prov.id}: FALHOU (${e.message}) — fica so no indice antigo ate a proxima rodada`);
                }
            }
        }));

        if (!dryRun) {
            try {
                const statRows = [
                    ...Object.values(report.providers).map(s => ({
                        provider: s.provider, movies: s.movies, series: s.series, channels: s.channels,
                        ok: true, error: null, indexed_at: new Date().toISOString()
                    })),
                    ...report.failed.map(pid => ({
                        provider: pid, movies: 0, series: 0, channels: 0,
                        ok: false, error: 'falha no download da API', indexed_at: new Date().toISOString()
                    }))
                ];
                await supaUpsert('provider_index_stats', statRows, 'provider');
            } catch (e) { log('stats ignorados:', e.message); }
        }
        report.ok = true;
    } catch (e) {
        report.error = e.message;
        log('FALHA GERAL:', e.message);
    }
    report.duration_s = Math.round((Date.now() - t0) / 1000);
    log(`concluido em ${report.duration_s}s | ok=${report.ok} | provedores: ${Object.keys(report.providers).join(', ')} | falhas: ${report.failed.join(', ') || '-'}`);
    return report;
}

exports.runIndexation = runIndexation;

exports.handler = async () => {
    const report = await runIndexation();
    return { statusCode: report.ok ? 200 : 207, body: JSON.stringify(report, null, 2) };
};
