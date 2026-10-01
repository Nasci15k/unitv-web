const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  page.on('console', msg => console.log(`  [console] ${msg.text()}`));
  page.on('request', req => {
    if (req.url().includes('/video/') || req.url().includes('/stream/') || req.url().includes('/cdn/'))
      console.log(`  [req] ${req.method()} ${req.url().substring(0, 120)}`);
  });
  page.on('response', res => {
    if (res.url().includes('/video/') || res.url().includes('/stream/') || res.url().includes('/cdn/'))
      console.log(`  [res] ${res.status()} ${res.url().substring(0, 120)}`);
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(3000);

  // LIVE - Try multiple channels
  console.log('\n=== LIVE ===');
  await page.click('[data-section="live"]');
  await page.waitForTimeout(3000);

  const channelNames = ['Globo', 'GNT', 'Band', 'SBT', 'Record', 'ESPN', 'ESPN2', 'Fox', 'HBO', 'Cine'];
  let liveOk = false;
  for (const name of channelNames) {
    if (liveOk) break;
    const clicked = await page.evaluate((searchName) => {
      const cards = document.querySelectorAll('.channel-card');
      for (const c of cards) {
        const chName = c.querySelector('.ch-name')?.textContent || '';
        if (chName.toLowerCase().includes(searchName.toLowerCase())) {
          c.click();
          return chName;
        }
      }
      return null;
    }, name);

    if (clicked) {
      console.log('Trying channel: ' + clicked);
      await page.waitForTimeout(15000);
      let s = await page.evaluate(() => ({
        ok: !document.getElementById('video-player')?.paused,
        t: Math.round(document.getElementById('video-player')?.currentTime || 0),
        rs: document.getElementById('video-player')?.readyState,
        src: document.getElementById('video-player')?.src?.substring(0, 80),
        networkState: document.getElementById('video-player')?.networkState,
        buffered: document.getElementById('video-player')?.buffered.length > 0 ?
          Math.round(document.getElementById('video-player')?.buffered.end(0)) : 0,
        error: document.getElementById('video-player')?.error?.message || 'none',
      }));
      console.log('LIVE (' + clicked + '):', JSON.stringify(s));
      if (s.rs >= 2 || s.ok || s.buffered > 0) {
        liveOk = true;
        await page.screenshot({ path: 'C:/Users/nasci15k/Downloads/unitv-web/test-live.png' });
      }
      await page.evaluate(() => player.stop());
      await page.waitForTimeout(500);
    }
  }
  if (!liveOk) console.log('LIVE: No working channel found');

  // SERIES
  console.log('\n=== SERIES ===');
  await page.click('[data-section="series"]');
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const cards = document.querySelectorAll('#series-grid .content-card');
    if (cards[0]) cards[0].click();
  });
  await page.waitForTimeout(5000);

  let eps = await page.evaluate(() => document.querySelectorAll('.episode-card').length);
  console.log('Episodes:', eps);

  if (eps > 0) {
    const epInfo = await page.evaluate(() => {
      const card = document.querySelectorAll('.episode-card')[0];
      return { id: card?.dataset?.id, title: card?.dataset?.title };
    });
    console.log('Clicking episode:', epInfo);
    await page.evaluate(() => document.querySelectorAll('.episode-card')[0].click());
    console.log('Clicked! Waiting 45s for large MP4...');
    await page.waitForTimeout(45000);
    s = await page.evaluate(() => ({
      ok: !document.getElementById('video-player')?.paused,
      t: Math.round(document.getElementById('video-player')?.currentTime || 0),
      rs: document.getElementById('video-player')?.readyState,
      src: document.getElementById('video-player')?.src?.substring(0, 100),
      networkState: document.getElementById('video-player')?.networkState,
      buffered: document.getElementById('video-player')?.buffered.length > 0 ?
        Math.round(document.getElementById('video-player')?.buffered.end(0)) : 0,
      error: document.getElementById('video-player')?.error?.message || 'none',
    }));
    console.log('SERIES:', JSON.stringify(s));
    await page.screenshot({ path: 'C:/Users/nasci15k/Downloads/unitv-web/test-series-player.png' });
    await page.evaluate(() => player.stop());
  }

  // MOVIES
  console.log('\n=== MOVIES ===');
  await page.click('[data-section="movies"]');
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const cards = document.querySelectorAll('#movies-grid .content-card');
    if (cards[0]) cards[0].click();
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const btn = document.getElementById('btn-play-movie');
    if (btn) btn.click();
  });
  console.log('Clicked play movie! Waiting 45s...');
  await page.waitForTimeout(45000);
  s = await page.evaluate(() => ({
    ok: !document.getElementById('video-player')?.paused,
    t: Math.round(document.getElementById('video-player')?.currentTime || 0),
    rs: document.getElementById('video-player')?.readyState,
    src: document.getElementById('video-player')?.src?.substring(0, 100),
    networkState: document.getElementById('video-player')?.networkState,
    buffered: document.getElementById('video-player')?.buffered.length > 0 ?
      Math.round(document.getElementById('video-player')?.buffered.end(0)) : 0,
    error: document.getElementById('video-player')?.error?.message || 'none',
  }));
  console.log('MOVIE:', JSON.stringify(s));
  await page.screenshot({ path: 'C:/Users/nasci15k/Downloads/unitv-web/test-movie.png' });

  await browser.close();
  console.log('\nDONE');
})();
