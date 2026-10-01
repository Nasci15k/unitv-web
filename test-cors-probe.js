const urls = [
  ['batman', 'http://telefunplay.xyz/movie/TurboBrasil%402026/%4027101992/9973709.mp4'],
  ['moana', 'http://telefunplay.xyz/movie/TurboBrasil%402026/%4027101992/9973821.mp4'],
];
(async () => {
  for (const [name, url] of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-15', Origin: 'http://localhost:3001' },
        redirect: 'follow',
      });
      const buf = new Uint8Array(await res.arrayBuffer());
      const hex = [...buf.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(name, {
        status: res.status,
        ct: res.headers.get('content-type'),
        acao: res.headers.get('access-control-allow-origin'),
        final: res.url.substring(0, 90),
        hex,
        mkv: buf[0] === 0x1a && buf[1] === 0x45,
        ts: buf[0] === 0x47,
        mp4: buf[4] === 0x66 && buf[5] === 0x74,
      });
    } catch (e) {
      console.log(name, 'ERR', e.message);
    }
  }
})();
