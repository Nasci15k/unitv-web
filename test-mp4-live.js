const { chromium } = require('playwright');

async function videoState(page) {
  return page.evaluate(() => {
    const v = document.getElementById('video-player');
    return {
      open: !document.getElementById('player-modal')?.classList.contains('hidden'),
      paused: v?.paused,
      t: Math.round(v?.currentTime || 0),
      rs: v?.readyState,
      buffered: v?.buffered?.length ? Math.round(v.buffered.end(0)) : 0,
      error: v?.error?.message || 'none',
      type: typeof player !== 'undefined' ? player.currentType : '',
      errBox: document.getElementById('player-error') && !document.getElementById('player-error')?.classList.contains('hidden')
        ? (document.getElementById('player-error-text')?.textContent || '') : ''
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('[VIDEO]') || t.includes('[MSE]') || t.includes('[MPEGTS]') || msg.type() === 'error') {
      if (!t.includes('ERR_NAME') && !t.includes('BLOCKED') && !t.includes('402'))
        console.log('  [c]', t.substring(0, 220));
    }
  });
  page.on('response', res => {
    if (res.url().includes('/video/') || res.url().includes('/stream/'))
      console.log('  [res]', res.status(), res.headers().get?.('content-type') || res.headers['content-type'] || '', res.url().substring(0, 130));
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(3500);

  // Direct play known MP4 movie
  console.log('\n=== MOVIE 9973690 (known mp4) ===');
  await page.evaluate(() => {
    player.play('/video/movie/TurboBrasil%402026/%4027101992/9973690.mp4', 'MP4 Test Movie', 'movie', { streamId: 9973690, resumeAt: 0 });
  });
  await page.waitForTimeout(20000);
  let s = await videoState(page);
  console.log('MOVIE_MP4:', JSON.stringify(s));
  await page.screenshot({ path: 'test-movie-mp4.png' });
  await page.evaluate(() => {
    try { player.stop(); } catch (e) {}
    document.getElementById('player-modal')?.classList.add('hidden');
    document.body.style.overflow = '';
  });
  await page.waitForTimeout(500);

  // LIVE via UI - try a few channels
  console.log('\n=== LIVE UI ===');
  await page.evaluate(() => document.querySelector('[data-section="live"]')?.click());
  await page.waitForTimeout(1500);
  const chans = await page.evaluate(() => Array.from(document.querySelectorAll('.channel-card')).slice(0, 5).map(c => c.querySelector('.ch-name')?.textContent || ''));
  console.log('chans:', JSON.stringify(chans));
  for (let i = 0; i < Math.min(3, chans.length); i++) {
    console.log('live try', i, chans[i]);
    await page.evaluate((idx) => {
      const cards = document.querySelectorAll('.channel-card');
      cards[idx]?.click();
    }, i);
    await page.waitForTimeout(14000);
    s = await videoState(page);
    console.log('LIVE', i, JSON.stringify(s));
    if (!s.paused && s.rs >= 2) {
      await page.screenshot({ path: 'test-live-ok.png' });
      console.log('LIVE_OK');
      break;
    }
    await page.evaluate(() => {
      try { player.stop(); } catch (e) {}
      document.getElementById('player-modal')?.classList.add('hidden');
      document.body.style.overflow = '';
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('[data-section="live"]')?.click());
    await page.waitForTimeout(600);
  }

  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
