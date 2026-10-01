const https = require('https');
const http = require('http');

function get(url, cb) {
    const mod = url.startsWith('https') ? https : http;
    return mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, cb);
}

function pullRedirect(url, label, maxMs) {
    return new Promise(resolve => {
        const t0 = Date.now(); let bytes = 0; let done = false;
        const finish = (how) => { if (done) return; done = true; resolve({ label, ms: Date.now() - t0, mb: +(bytes / 1048576).toFixed(2), how }); };
        get(url, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                const loc = res.headers.location;
                get(loc, r2 => {
                    r2.on('data', c => bytes += c.length);
                    r2.on('end', () => finish('fim'));
                    r2.on('error', () => finish('erro'));
                }).on('error', () => finish('erro-redir'));
                setTimeout(() => finish('meu-timeout'), maxMs);
            } else {
                res.on('data', c => bytes += c.length);
                res.on('end', () => finish('fim-sem-redirect status=' + res.statusCode));
                setTimeout(() => finish('meu-timeout'), maxMs);
            }
        }).on('error', () => finish('erro'));
    });
}

(async () => {
    const proxy = 'https://opentvv.netlify.app/xtream-stream/live/TurboBrasil%402026/%4027101992/3979239.ts';
    const direct = 'https://telefunplay.xyz/live/TurboBrasil%402026/%4027101992/3979239.ts';
    console.log('local (meu IP, seguindo redirect):', await pullRedirect(direct, 'local', 30000));
    console.log('proxy (IP Netlify):', await pullRedirect(proxy, 'proxy', 30000));
})().catch(e => console.error(e));
