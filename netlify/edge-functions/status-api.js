// API de status: /status-all (GET), /status-report (POST), /genres-all (GET)
// Le/escreve no Supabase via REST (anon key publica) e dispara o worker quando os dados estao velhos (>6h).

const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
const STALE_MS = 6 * 3600 * 1000;
const HDRS = { apikey: ANON, Authorization: `Bearer ${ANON}` };

const json = (obj, status = 200, cache = 'no-store') =>
    new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': cache }
    });

async function selectAll(table, select) {
    const rows = [];
    for (let p = 0; p < 100; p++) {
        const res = await fetch(`${SUPA}/rest/v1/${table}?select=${select}&limit=1000&offset=${p * 1000}`, {
            headers: HDRS,
            signal: AbortSignal.timeout(15000)
        });
        const j = await res.json().catch(() => null);
        if (!Array.isArray(j)) break;
        rows.push(...j);
        if (j.length < 1000) break;
    }
    return rows;
}

export default async (request, context) => {
    const { pathname, origin } = new URL(request.url);

    if (request.method === 'OPTIONS') return json({ ok: true });

    if (pathname === '/status-report' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        const s = String((body && body.s) || '');
        if (!/^\d+$/.test(s)) return json({ ok: false }, 400);
        const status = body.ok ? 'online' : 'offline';
        try {
            await fetch(`${SUPA}/rest/v1/channel_status?on_conflict=stream_id`, {
                method: 'POST',
                headers: { ...HDRS, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
                body: JSON.stringify({ stream_id: s, status, checked_at: new Date().toISOString() }),
                signal: AbortSignal.timeout(10000)
            });
        } catch (e) { /* tabela pode nao existir ainda */ }
        return json({ ok: true });
    }

    if (pathname === '/status-all') {
        let rows = [];
        try { rows = await selectAll('channel_status', 'stream_id,status,checked_at'); }
        catch (e) { return json({ st: {}, stale: true }); }
        const st = {};
        let oldest = null;
        rows.forEach(r => {
            st[r.stream_id] = r.status;
            const t = Date.parse(r.checked_at);
            if (oldest === null || t < oldest) oldest = t;
        });
        const stale = rows.length === 0 || oldest === null || (Date.now() - oldest) > STALE_MS;
        if (stale) {
            try {
                context.waitUntil(fetch(origin + '/.netlify/functions/workers-background', { method: 'POST' }).catch(() => {}));
            } catch (e) { /* worker ja rodando */ }
        }
        return json({ st, stale, n: rows.length });
    }

    if (pathname === '/genres-all') {
        let rows = [];
        try { rows = await selectAll('movie_genres', 'stream_id,genres'); }
        catch (e) { return json({ mg: [], n: 0 }); }
        const mg = rows.map(r => [r.stream_id, r.genres || '']);
        return json({ mg, n: mg.length }, 200, 'public, max-age=120');
    }

    return json({ error: 'not found' }, 404);
};
