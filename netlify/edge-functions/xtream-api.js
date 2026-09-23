const UPSTREAM = 'https://telefunplay.xyz';

export default async (request, context) => {
    const url = new URL(request.url);
    const splat = url.pathname.replace(/^\/xtream-api/, '') || '/';
    const target = UPSTREAM + splat + url.search;

    const fwd = new Headers();
    fwd.set('Accept', request.headers.get('Accept') || 'application/json');
    const ua = request.headers.get('User-Agent');
    if (ua) fwd.set('User-Agent', ua);

    let upstream;
    try {
        upstream = await fetch(target, {
            method: request.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: fwd,
            redirect: 'follow'
        });
    } catch {
        return new Response('Bad Gateway', { status: 502, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' } });
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
