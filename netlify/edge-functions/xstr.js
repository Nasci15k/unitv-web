// Rota NOVA /xstr/{pid}/* — proxy de streams por provedor (multi-fornecedor).
// NAO substitui /xtream-stream (provedor padrao segue intocado no caminho legado).
// Mesma engenharia do legado: reescrita de playlist (__f), validacao #EXTM3U,
// retry de .ts, placeholder de imagem. Credenciais injetadas aqui via registro.
const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
const HDRS = { apikey: ANON, Authorization: 'Bearer ' + ANON };
const FALLBACK = { id: 'telefunplay', host: 'https://telefunplay.xyz', username: 'TurboBrasil@2026', password: '@27101992' };
const TTL_MS = 60000;

let cache = null;
let cacheAt = 0;

async function loadRegistry(force) {
    if (cache && !force && Date.now() - cacheAt < TTL_MS) return cache;
    try {
        const r = await fetch(SUPA + '/rest/v1/providers?select=id,host,username,password,enabled&enabled=eq.true', {
            headers: HDRS,
            signal: AbortSignal.timeout(6000)
        });
        if (!r.ok) return cache;
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
    reg = await loadRegistry(true);
    if (reg && reg.has(pid)) return reg.get(pid);
    if (pid === FALLBACK.id) return FALLBACK;
    return null;
}

const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="18" fill="#171923"/><rect x="30" y="38" width="60" height="40" rx="6" fill="none" stroke="#3a3f4d" stroke-width="5"/><circle cx="60" cy="58" r="8" fill="#3a3f4d"/><rect x="52" y="86" width="16" height="5" rx="2.5" fill="#3a3f4d"/></svg>';

function imagePlaceholder() {
    return new Response(PLACEHOLDER_SVG, {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' }
    });
}

function rewritePlaylist(text, proxyBase, baseUrl) {
    return text.split(/\r?\n/).map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        try {
            const abs = new URL(t, baseUrl);
            if (!/^https?:$/i.test(abs.protocol)) return line;
            const qi = abs.href.indexOf('?');
            const pathPart = qi >= 0 ? abs.href.slice(0, qi) : abs.href;
            const query = qi >= 0 ? abs.href.slice(qi) : '';
            return proxyBase + '/__f/' + encodeURIComponent(pathPart) + query;
        } catch {
            return line;
        }
    }).join('\n');
}

export default async (request, context) => {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/xstr\/([^/]+)(\/.*)$/);
    if (!m) {
        return new Response('Not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' } });
    }
    const pid = decodeURIComponent(m[1]);
    let splat = m[2];
    let target;
    let extraSearch = url.search;

    if (splat.startsWith('/__f/')) {
        // segmento de playlist (URL absoluta do provedor, sem credenciais)
        try {
            target = decodeURIComponent(splat.slice(5));
            if (target.includes('?')) {
                if (url.search) target += '&' + url.search.slice(1);
            } else {
                target += url.search;
            }
            extraSearch = '';
        } catch {
            return new Response('Bad Request', { status: 400 });
        }
    } else {
        const prov = await getProvider(pid);
        if (!prov || !prov.host) {
            return new Response(JSON.stringify({ error: 'unknown_provider', pid }), {
                status: 404,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
            });
        }
        const base = prov.host.replace(/\/+$/, '');
        // /live|movie|series/{id}.{ext} — injeta credenciais no path (formato Xtream)
        const mm = splat.match(/^(\/live|\/movie|\/series)(\/[^/]+)(\.[^/?]+)?$/);
        if (mm) {
            target = base + mm[1] + '/' + encodeURIComponent(prov.username) + '/' + encodeURIComponent(prov.password) + mm[2] + (mm[3] || '');
        } else if (splat.startsWith('/streaming/')) {
            // timeshift.php e cia: credenciais via query
            const t = new URL(base + splat);
            for (const [k, v] of url.searchParams) {
                if (k !== 'username' && k !== 'password') t.searchParams.set(k, v);
            }
            t.searchParams.set('username', prov.username);
            t.searchParams.set('password', prov.password);
            target = t.href;
            extraSearch = '';
        } else {
            target = base + splat + extraSearch;
        }
    }

    let parsed;
    try {
        parsed = new URL(target);
        if (!/^https?:$/i.test(parsed.protocol)) {
            return new Response('Bad Request', { status: 400 });
        }
    } catch {
        return new Response('Bad Request', { status: 400 });
    }

    const fwd = new Headers();
    const range = request.headers.get('Range');
    if (range) fwd.set('Range', range);
    const ua = request.headers.get('User-Agent');
    if (ua) fwd.set('User-Agent', ua);
    fwd.set('Accept', request.headers.get('Accept') || '*/*');

    let upstream;
    const probablyImage = /\.(jpe?g|png|webp|svg|gif|ico)(\?|$)/i.test(parsed.pathname);
    const probablyPlaylist = /\.m3u8(\?|$)/i.test(parsed.pathname);
    try {
        upstream = await fetch(parsed.href, {
            method: request.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: fwd,
            redirect: 'follow',
            signal: probablyImage ? AbortSignal.timeout(10000) : (probablyPlaylist ? AbortSignal.timeout(12000) : undefined)
        });
    } catch {
        if (probablyImage) return imagePlaceholder();
        return new Response('Bad Gateway', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    if (probablyImage && !upstream.ok) {
        try { if (upstream.body) await upstream.body.cancel(); } catch { /* descarta */ }
        return imagePlaceholder();
    }

    const isTs = /\.ts(\?|$)/i.test(parsed.pathname);
    if (isTs && request.method !== 'HEAD' && (upstream.status === 404 || upstream.status >= 500)) {
        try { if (upstream.body) await upstream.body.cancel(); } catch { /* descarta */ }
        await new Promise(r => setTimeout(r, 250));
        try {
            upstream = await fetch(parsed.href, {
                method: 'GET',
                headers: fwd,
                redirect: 'follow',
                signal: AbortSignal.timeout(12000)
            });
        } catch {
            return new Response('Bad Gateway', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
        }
    }

    const resHeaders = new Headers(upstream.headers);
    resHeaders.delete('content-encoding');
    resHeaders.set('Access-Control-Allow-Origin', '*');

    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
    const finalUrl = upstream.url || parsed.href;
    const isPlaylist = ct.includes('mpegurl') || /\.m3u8(\?|$)/i.test(parsed.pathname);
    const isImage = ct.startsWith('image/') || /\.(jpe?g|png|webp|svg|gif|ico)(\?|$)/i.test(parsed.pathname);
    if (isImage) {
        resHeaders.set('Cache-Control', 'public, max-age=604800');
    } else {
        resHeaders.set('Cache-Control', 'no-cache');
    }
    if (!resHeaders.get('Accept-Ranges') && !isPlaylist && !isImage) resHeaders.set('Accept-Ranges', 'bytes');

    if (isPlaylist && request.method !== 'HEAD') {
        resHeaders.delete('content-length');
        let text;
        try {
            text = await Promise.race([
                upstream.text(),
                new Promise((_, rej) => setTimeout(() => rej(new Error('playlist read timeout')), 12000))
            ]);
        } catch {
            try { if (upstream.body) await upstream.body.cancel(); } catch { /* descarta */ }
            return new Response('Bad Gateway', { status: 502, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
        }
        if (upstream.ok && !/^\uFEFF?\s*#EXTM3U/i.test(text)) {
            return new Response('Bad Gateway', { status: 502, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
        }
        const proxyBase = url.origin + '/xstr/' + encodeURIComponent(pid);
        const rewritten = rewritePlaylist(text, proxyBase, finalUrl);
        return new Response(rewritten, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: resHeaders
        });
    }

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: resHeaders
    });
};
