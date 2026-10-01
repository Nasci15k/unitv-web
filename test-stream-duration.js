const https = require('https');
const URL_TEST = process.argv[2] || 'https://opentvv.netlify.app/xtream-stream/live/TurboBrasil%402026/%4027101992/3979239.ts';

const t0 = Date.now();
https.get(URL_TEST, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
    console.log('status:', res.statusCode, '| content-type:', res.headers['content-type']);
    let bytes = 0;
    let lastLog = 0;
    res.on('data', c => {
        bytes += c.length;
        const s = (Date.now() - t0) / 1000;
        if (s - lastLog >= 5) { lastLog = s; console.log(`${s.toFixed(0)}s: ${(bytes / 1048576).toFixed(2)} MB recebidos`); }
        if (bytes > 60 * 1048576) { console.log('60MB — encerrando teste'); res.destroy(); process.exit(0); }
    });
    res.on('end', () => console.log(`CONECCAO FECHOU em ${((Date.now() - t0) / 1000).toFixed(1)}s com ${(bytes / 1048576).toFixed(2)} MB`));
    res.on('error', e => console.log('erro:', e.message, `em ${((Date.now() - t0) / 1000).toFixed(1)}s`));
    setTimeout(() => { console.log(`90s atingidos: ${(bytes / 1048576).toFixed(2)} MB — stream VIVO`); res.destroy(); process.exit(0); }, 90000);
}).on('error', e => console.log('falhou:', e.message));
