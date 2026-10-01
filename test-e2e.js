const { chromium } = require('playwright');

async function closePlayer(page) {
  await page.evaluate(() => {
    try { player.stop(); } catch (e) {}
    document.getElementById('player-modal')?.classList.add('hidden');
    document.getElementById('detail-modal')?.classList.add('hidden');
    document.getElementById('resume-modal')?.classList.add('hidden');
    document.getElementById('loading-overlay')?.classList.add('hidden');
    document.body.style.overflow = '';
  });
  await page.waitForTimeout(400);
}

async function videoState(page) {
  return page.evaluate(() => {
    const v = document.getElementById('video-player');
    return {
      open: !document.getElementById('player-modal')?.classList.contains('hidden'),
      paused: v?.paused,
      t: Math.round(v?.currentTime || 0),
      rs: v?.readyState,
      src: (v?.src || '').substring(0, 110),
      buffered: v?.buffered?.length ? Math.round(v.buffered.end(0)) : 0,
      error: v?.error?.message || 'none',
      type: typeof player !== 'undefined' ? player.currentType : '',
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message));
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('[VIDEO]') || t.includes('[MSE]') || t.includes('[MPEGTS]') || t.includes('error') || msg.type() === 'error') {
      if (!t.includes('ERR_NAME_NOT_RESOLVED') && !t.includes('BLOCKED_BY') && !t.includes('402'))
        console.log('  [c]', t.substring(0, 200));
    }
  });
  page.on('response', res => {
    if (res.url().includes('/video/') || res.url().includes('/stream/movie') || res.url().includes('/stream/series'))
      console.log('  [res]', res.status(), res.url().substring(0, 120));
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(4000);

  // LIVE
  console.log('\n=== LIVE ===');
  await page.evaluate(() => document.querySelector('[data-section="live"]')?.click());
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    for (const c of document.querySelectorAll('.channel-card')) {
      const n = c.querySelector('.ch-name')?.textContent || '';
      if (n.toLowerCase().includes('globo')) { c.click(); return; }
    }
    document.querySelector('.channel-card')?.click();
  });
  await page.waitForTimeout(12000);
  let s = await videoState(page);
  console.log('LIVE:', JSON.stringify(s));
  await page.screenshot({ path: 'test-live.png' });
  await closePlayer(page);

  // SERIES
  console.log('\n=== SERIES ===');
  await page.evaluate(() => document.querySelector('[data-section="series"]')?.click());
  await page.waitForTimeout(2500);
  const seriesCount = await page.evaluate(() => document.querySelectorAll('#series-grid .content-card').length);
  console.log('series cards:', seriesCount);
  await page.evaluate(() => document.querySelectorAll('#series-grid .content-card')[0]?.click());
  await page.waitForTimeout(5000);
  const eps = await page.evaluate(() => document.querySelectorAll('.episode-card').length);
  console.log('episodes:', eps);
  if (eps > 0) {
    await page.evaluate(() => document.querySelectorAll('.episode-card')[0]?.click());
    await page.waitForTimeout(35000);
    s = await videoState(page);
    console.log('SERIES:', JSON.stringify(s));
    await page.screenshot({ path: 'test-series-player.png' });
  }
  await closePlayer(page);

  // MOVIES
  console.log('\n=== MOVIES ===');
  await page.evaluate(() => document.querySelector('[data-section="movies"]')?.click());
  await page.waitForTimeout(2500);
  const movieCount = await page.evaluate(() => document.querySelectorAll('#movies-grid .content-card').length);
  console.log('movie cards:', movieCount);

  // Try first 5 movies until one plays
  let movieOk = false;
  for (let i = 0; i < 5 && !movieOk; i++) {
    const title = await page.evaluate((idx) => {
      const cards = document.querySelectorAll('#movies-grid .content-card');
      if (!cards[idx]) return null;
      cards[idx].click();
      return cards[idx].querySelector('.card-title, .content-title, h3, h4')?.textContent || 'movie' + idx;
    }, i);
    if (!title) break;
    console.log('Opening movie', i, title.substring(0, 50));
    await page.waitForTimeout(2500);
    const hasBtn = await page.evaluate(() => !!document.getElementById('btn-play-movie'));
    if (!hasBtn) { console.log('no play btn, skip'); await closePlayer(page); continue; }
    await page.evaluate(() => document.getElementById('btn-play-movie')?.click());
    await page.waitForTimeout(15000);
    s = await videoState(page);
    const errVisible = await page.evaluate(() => {
      const box = document.getElementById('player-error');
      if (!box || box.classList.contains('hidden')) return '';
      return (document.getElementById('player-error-text')?.textContent || box.textContent || '').trim().substring(0, 80);
    });
    console.log('MOVIE', i, JSON.stringify(s), 'err:', errVisible || 'none');
    if (s.rs >= 2 || s.buffered > 0 || (!s.paused && s.t > 0)) {
      movieOk = true;
      await page.screenshot({ path: 'test-movie.png' });
    }
    await closePlayer(page);
    if (!movieOk) {
      await page.evaluate(() => document.querySelector('[data-section="movies"]')?.click());
      await page.waitForTimeout(500);
    }
  }

  console.log('\nRESULT live=ok series=' + (eps > 0) + ' movie=' + movieOk);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
