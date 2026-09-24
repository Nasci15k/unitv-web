// OpenTv worker (background function, ate 15 min):
// 1) Testa TODOS os canais ao vivo e salva status no Supabase
// 2) Enriquece generos de filmes (lote por execucao) via get_vod_info
// Disparado pelo edge /status-all quando os dados estao velhos (>6h).

const UPSTREAM = 'https://telefunplay.xyz';
const USER = 'TurboBrasil@2026';
const PASS = '@27101992';
const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
const PROBE_CONCURRENCY = 30;
const PROBE_TIMEOUT = 6000;
const ENRICH_BATCH = 4000;
const ENRICH_CONCURRENCY = 12;

const log = (...a) => console.log('[worker]', ...a);

async function api(path) {
    const res = await fetch(`${UPSTREAM}/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}&${path}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000)
    });
    return res.json();
}

async function supaSelect(table, select, page) {
    const res = await fetch(`${SUPA}/rest/v1/${table}?select=${select}&limit=1000&offset=${page * 1000}`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        signal: AbortSignal.timeout(20000)
    });
    return res.json();
}

async function supaSelectAll(table, select) {
    const rows = [];
    for (let p = 0; p < 100; p++) {
        const j = await supaSelect(table, select, p);
        if (!Array.isArray(j)) break;
        rows.push(...j);
        if (j.length < 1000) break;
    }
    return rows;
}

async function supaUpsert(table, rows) {
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await fetch(`${SUPA}/rest/v1/${table}?on_conflict=stream_id`, {
            method: 'POST',
            headers: {
                apikey: ANON, Authorization: `Bearer ${ANON}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates'
            },
            body: JSON.stringify(chunk),
            signal: AbortSignal.timeout(30000)
        });
    }
}

async function mapLimit(items, limit, fn) {
    const out = [];
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
            const idx = i++;
            try { out[idx] = await fn(items[idx]); } catch (e) { out[idx] = null; }
        }
    });
    await Promise.all(workers);
    return out;
}

async function checkChannels() {
    const t0 = Date.now();
    let live = [];
    try { live = await api('action=get_live_streams'); } catch (e) { log('get_live_streams falhou', e.message); return; }
    if (!Array.isArray(live)) live = [];
    log(`testando ${live.length} canais...`);
    const nowIso = new Date().toISOString();
    const statuses = live.map(s => ({ stream_id: String(s.stream_id), status: 'offline', checked_at: nowIso }));
    await mapLimit(live, PROBE_CONCURRENCY, async (s) => {
        try {
            const res = await fetch(`${UPSTREAM}/live/${encodeURIComponent(USER)}/${encodeURIComponent(PASS)}/${s.stream_id}.ts`, {
                headers: { Range: 'bytes=0-1', 'User-Agent': 'Mozilla/5.0' },
                redirect: 'manual', // 302 -> CDN http e NORMAL e conta como online; 'follow' falha pq o runtime bloqueia http inseguro
                signal: AbortSignal.timeout(PROBE_TIMEOUT)
            });
            const idx = live.indexOf(s);
            if ([200, 206, 301, 302, 307, 308].includes(res.status)) statuses[idx].status = 'online';
        } catch (e) { /* offline */ }
    });
    const online = statuses.filter(s => s.status === 'online').length;
    try { await supaUpsert('channel_status', statuses); log(`status: ${online}/${statuses.length} online — salvo (${Math.round((Date.now() - t0) / 1000)}s)`); }
    catch (e) { log('erro ao salvar status', e.message); }
}

async function enrichGenres() {
    const t0 = Date.now();
    let vods = [];
    try { vods = await api('action=get_vod_streams'); } catch (e) { log('get_vod_streams falhou', e.message); return; }
    if (!Array.isArray(vods)) return;
    let existing = [];
    try { existing = await supaSelectAll('vod_meta', 'stream_id'); } catch (e) { log('leitura vod_meta falhou (tabela existe?)', e.message); return; }
    const done = new Set(existing.map(r => String(r.stream_id)));
    const todo = vods.filter(v => !done.has(String(v.stream_id))).slice(0, ENRICH_BATCH);
    if (!todo.length) { log('meta: nada a enriquecer'); return; }
    log(`meta: enriquecendo ${todo.length} filmes (feito: ${done.size}/${vods.length})...`);
    const rows = [];
    await mapLimit(todo, ENRICH_CONCURRENCY, async (v) => {
        try {
            const j = await api('action=get_vod_info&vod_id=' + v.stream_id);
            const info = (j && j.info) || {};
            const genres = String(info.genre || '').trim();
            let year = String(info.releasedate || info.year || v.year || '').trim().substring(0, 4);
            if (!/^(19|20)\d{2}$/.test(year)) year = '';
            if (genres || year) {
                rows.push({ stream_id: String(v.stream_id), kind: 'movie', genres: genres.substring(0, 120), year, updated_at: new Date().toISOString() });
            }
        } catch (e) { /* skip */ }
    });
    if (rows.length) {
        try { await supaUpsert('vod_meta', rows); log(`meta: +${rows.length} salvos (${Math.round((Date.now() - t0) / 1000)}s)`); }
        catch (e) { log('erro ao salvar meta', e.message); }
    }
}

exports.handler = async () => {
    log('iniciando rodada');
    try { await checkChannels(); } catch (e) { log('checkChannels erro', e.message); }
    try { await enrichGenres(); } catch (e) { log('enrichGenres erro', e.message); }
    log('rodada concluida');
    return { statusCode: 202, body: 'worker started' };
};
