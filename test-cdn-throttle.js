const https = require('https');
const http = require('http');

function pull(url, label, maxMs = 25000) {
    return new Promise(resolve => {
        const t0 = Date.now();
        let bytes = 0;
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            res.on('data', c => { bytes += c.length; });
            res.on('end', () => resolve({ label, ms: Date.now() - t0, mb: +(bytes / 1048576).toFixed(2), end: 'fechou' }));
            res.on('error', () => resolve({ label, ms: Date.now() - t0, mb: +(bytes / 1048576).toFixed(2), end: 'erro' }));
        });
        req.on('error', e => resolve({ label, ms: Date.now() - t0, mb: 0, end: e.message }));
        setTimeout(() => { req.destroy(); resolve({ label, ms: Date.now() - t0, mb: +(bytes / 1048576).toFixed(2), end: 'meu-timeout' }); }, maxMs);
    });
}

(async () => {
    // 1) direto no provedor (302 -> CDN http) - pull A
    const dir = 'https://telefunplay.xyz/live/TurboBrasil%402026/%4027101992/3979239.ts';
    // 2) via proxy edge
    const proxy = 'https://opentvv.netlify.app/xtream-stream/live/TurboBrasil%402026/%4027101992/3979239.ts';

    console.log('--- pull 1 direto no provedor ---');
    console.log(await pull(dir, 'direto-1'));
    console.log('--- pull 2 direto (logo em seguida) ---');
    console.log(await pull(dir, 'direto-2'));
    console.log('--- pull 3 via proxy edge ---');
    console.log(await pull(proxy, 'proxy-1'));
    console.log('--- pull 4 via proxy (logo em seguida) ---');
    console.log(await pull(proxy, 'proxy-2'));
    console.log('--- espera 12s e pull 5 direto ---');
    await new Promise(r => setTimeout(r, 12000));
    console.log(await pull(dir, 'direto-3-pos-espera'));
})().catch(e => console.error('FATAL', e));
