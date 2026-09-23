const UPSTREAM = 'https://telefunplay.xyz';

function rewritePlaylist(text, proxyBase, baseUrl) {
    return text.split(/\r?\n/).map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        try {
            const abs = new URL(t, baseUrl);
            return proxyBase + abs.pathname + abs.search;
        } catch {
            return line;
        }
    }).join('\n');
}

export default async (request, context) => {
    const url = new URL(request.url);
    const splat = url.pathname.replace(/^\/xtream-stream/, '') || '/';
    const target = UPSTREAM + splat + url.search;

    const fwd = new Headers();
    const range = request.headers.get('Range');
    if (range) fwd.set('Range', range);
    const ua = request.headers.get('User-Agent');
    if (ua) fwd.set('User-Agent', ua);
    fwd.set('Accept', request.headers.get('Accept') || '*/*');

    let upstream;
    try {
        upstream = await fetch(target, {
            method: request.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: fwd,
            redirect: 'follow'
        });
    } catch {
        return new Response('Bad Gateway', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const resHeaders = new Headers(upstream.headers);
    resHeaders.delete('content-encoding');
    resHeaders.delete('content-length');
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Cache-Control', 'no-cache');

    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
    const isPlaylist = ct.includes('mpegurl') || /\.m3u8(\?|$)/i.test(splat);

    if (isPlaylist && request.method !== 'HEAD') {
        const text = await upstream.text();
        const proxyBase = url.origin + '/xtream-stream';
        const rewritten = rewritePlaylist(text, proxyBase, upstream.url || target);
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
