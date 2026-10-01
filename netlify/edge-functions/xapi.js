// Rota NOVA /xapi/{pid}/* — proxy de API Xtream por provedor (multi-fornecedor).
// NAO substitui /xtream-api (provedor padrao segue intocado no caminho legado).
// Credenciais vem do registro Supabase (providers) — injetadas aqui, nunca
// precisam existir no cliente para provedores novos.
const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
const HDRS = { apikey: ANON, Authorization: 'Bearer ' + ANON };
const FALLBACK = { id: 'telefunplay', host: 'https://telefunplay.xyz', username: 'TurboBrasil@2026', password: '@27101992' };
const TTL_MS = 60000;

let cache = null;   // Map id -> {id,host,username,password,enabled}
let cacheAt = 0;

async function loadRegistry(force) {
    if (cache && !force && Date.now() - cacheAt < TTL_MS) return cache;
    try {
        const r = await fetch(SUPA + '/rest/v1/providers?select=id,host,username,password,enabled&enabled=eq.true', {
            headers: HDRS,
            signal: AbortSignal.timeout(6000)
        });
        if (!r.ok) return cache; // mantem stale em erro
        const rows = await r.json();
        const map = new Map();
        for (const row of rows) map.set(row.id, row);
        cache = map;
        cacheAt = Date.now();
        return cache;
    } catch {
        return cache;
    }
}

async function getProvider(pid) {
    let reg = await loadRegistry(false);
    if (reg && reg.has(pid)) return reg.get(pid);
    // miss: o registro pode ser novo (admin acabou de criar) — força refresh
    reg = await loadRegistry(true);
    if (reg && reg.has(pid)) return reg.get(pid);
    if (pid === FALLBACK.id) return FALLBACK;
    return null;
}

export default async (request, context) => {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/xapi\/([^/]+)(\/.*)$/);
    if (!m) {
        return new Response('Not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' } });
    }
    const pid = decodeURIComponent(m[1]);
    const splat = m[2];

    const prov = await getProvider(pid);
    if (!prov || !prov.host) {
        return new Response(JSON.stringify({ error: 'unknown_provider', pid }), {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
    }

    const dbg = url.searchParams.has('__dbg');
    if (dbg) url.searchParams.delete('__dbg');

    const target = new URL(prov.host.replace(/\/+$/, '') + splat);
    // repassa a query do cliente...
    for (const [k, v] of url.searchParams) {
        if (k !== 'username' && k !== 'password') target.searchParams.set(k, v);
    }
    // ...mas credenciais SEMPRE do registro (permite rotacionar sem cache no cliente)
    if (splat.endsWith('.php')) {
        target.searchParams.set('username', prov.username);
        target.searchParams.set('password', prov.password);
    }

    const fwd = new Headers();
    fwd.set('Accept', request.headers.get('Accept') || 'application/json');
    const ua = request.headers.get('User-Agent');
    if (ua) fwd.set('User-Agent', ua);

    let upstream;
    try {
        upstream = await fetch(target.href, {
            method: request.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: fwd,
            redirect: 'follow',
            signal: AbortSignal.timeout(30000)
        });
    } catch (e) {
        if (dbg) {
            return new Response(JSON.stringify({ dbg: 1, target: target.href, fetchError: String(e && e.message || e) }), {
                status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
            });
        }
        return new Response('Bad Gateway', { status: 502, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' } });
    }

    if (dbg) {
        const text = await upstream.text();
        return new Response(JSON.stringify({
            dbg: 1, target: target.href, finalUrl: upstream.url, status: upstream.status,
            contentType: upstream.headers.get('content-type'), bodyHead: text.slice(0, 300)
        }), { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    const resHeaders = new Headers(upstream.headers);
    resHeaders.delete('content-encoding');
    resHeaders.delete('content-length');
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Cache-Control', 'public, max-age=60');

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: resHeaders
    });
};
