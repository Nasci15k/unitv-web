const UPSTREAM = 'https://telefunplay.xyz';

function rewritePlaylist(text, proxyBase, baseUrl) {
    return text.split(/\r?\n/).map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        try {
            const abs = new URL(t, baseUrl);
            if (!/^https?:$/i.test(abs.protocol)) return line;
            return proxyBase + '/__f/' + encodeURIComponent(abs.href);
        } catch {
            return line;
        }
    }).join('\n');
}

export default async (request, context) => {
    const url = new URL(request.url);
    let splat = url.pathname.replace(/^\/xtream-stream/, '') || '/';
    let target;
    let extraSearch = url.search;

    if (splat.startsWith('/__f/')) {
        try {
            target = decodeURIComponent(splat.slice(5));
            extraSearch = '';
        } catch {
            return new Response('Bad Request', { status: 400 });
        }
    } else {
        target = UPSTREAM + splat + extraSearch;
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
    try {
        upstream = await fetch(parsed.href, {
            method: request.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: fwd,
            redirect: 'follow'
        });
    } catch {
        return new Response('Bad Gateway', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const resHeaders = new Headers(upstream.headers);
    resHeaders.delete('content-encoding');
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Cache-Control', 'no-cache');
    if (!resHeaders.get('Accept-Ranges')) resHeaders.set('Accept-Ranges', 'bytes');

    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
    const finalUrl = upstream.url || parsed.href;
    const isPlaylist = ct.includes('mpegurl') || /\.m3u8(\?|$)/i.test(parsed.pathname);

    if (isPlaylist && request.method !== 'HEAD') {
        resHeaders.delete('content-length');
        const text = await upstream.text();
        const proxyBase = url.origin + '/xtream-stream';
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
