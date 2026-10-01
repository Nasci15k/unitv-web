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
    if (t.includes('[VIDEO]') || t.includes('[MSE]') || t.includes('[FFMPEG]') || t.includes('[MPEGTS]') || msg.type() === 'error') {
      if (!t.includes('ERR_NAME') && !t.includes('BLOCKED') && !t.includes('402'))
        console.log('  [c]', t.substring(0, 240));
    }
  });
  page.on('response', res => {
    if (res.url().includes('/video/') || res.url().includes('/stream/movie'))
      console.log('  [res]', res.status(), res.headers()['content-type'] || '', res.url().substring(0, 120));
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(3500);

  console.log('\n=== MKV MOVIE 9973709 via UI ===');
  await page.evaluate(() => document.querySelector('[data-section="movies"]')?.click());
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll('#movies-grid .content-card')[0]?.click());
  await page.waitForTimeout(3000);
  const hasBtn = await page.evaluate(() => !!document.getElementById('btn-play-movie'));
  console.log('hasBtn:', hasBtn);
  if (hasBtn) {
    await page.evaluate(() => document.getElementById('btn-play-movie')?.click());
    await page.waitForTimeout(30000);
    const s = await videoState(page);
    console.log('MOVIE:', JSON.stringify(s));
    await page.screenshot({ path: 'test-mkv-remux.png' });
  }

  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
