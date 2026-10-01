const UPSTREAM = 'https://telefunplay.xyz';

// Placeholder retornado quando imagem upstream falha: evita "Failed to load resource"
// no console do usuario (403/404 de hosts de logo quebrados/do provedor).
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
            // Query (token) como query REAL, nao encoded no path: o hls.js compara o path
            // dos segmentos entre reloads ignorando query — token dentro do path causava
            // "media sequence mismatch" fatal em toda recarga do manifesto.
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
    let splat = url.pathname.replace(/^\/xtream-stream/, '') || '/';
    let target;
    let extraSearch = url.search;

    if (splat.startsWith('/__f/')) {
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

    // Segmento .ts com 404/5xx pontual (throttle/token race do provedor): uma unica repeticao.
    // Sucesso na repeticao = navegador nunca ve o erro (console limpo); falha = repassa o status.
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
    // Imagens (via __f): cache longo no Edge pra ficar rapido e aliviar o provedor
    const isImage = ct.startsWith('image/') || /\.(jpe?g|png|webp|svg|gif|ico)(\?|$)/i.test(parsed.pathname);
    if (isImage) {
        resHeaders.set('Cache-Control', 'public, max-age=604800');
    } else if (isPlaylist) {
        resHeaders.set('Cache-Control', 'no-cache');
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
        // Provedor as vezes devolve 200 com corpo invalido (lixo/HTML/vazio) em reload de manifesto.
        // Repassar isso quebra o hls.js com levelParsingError (fatal, sem retry de rede).
        // 502 vira erro de rede recuperavel: o player tenta startLoad() antes de trocar de engine.
        if (upstream.ok && !/^\uFEFF?\s*#EXTM3U/i.test(text)) {
            return new Response('Bad Gateway', { status: 502, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
        }
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
