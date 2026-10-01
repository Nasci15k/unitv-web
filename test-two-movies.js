const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', m => { const t = m.text(); if (t.includes('[PROBE]') || t.includes('[VIDEO]') || t.includes('[MSE]') || t.includes('[MPEGTS]') || t.includes('[MKV]')) console.log(t.substring(0, 220)); });
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message));
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(5000);
  for (const [name, id] of [['moana', 9973821], ['batman', 9973709]]) {
    console.log('\n===', name, '===');
    await page.evaluate(() => document.querySelector('[data-section="movies"]')?.click());
    await page.waitForTimeout(2000);
    const opened = await page.evaluate((mid) => {
      const want = mid === 9973821 ? 'Moana' : 'Batman';
      const cards = [...document.querySelectorAll('#movies-grid .content-card')];
      const card = cards.find(c => (c.querySelector('.card-title')?.textContent || '').includes(want));
      if (!card) return 'no-title-match';
      card.click();
      return true;
    }, id);
    console.log('opened card', opened);
    await page.waitForTimeout(2500);
    const has = await page.evaluate(() => !!document.getElementById('btn-play-movie'));
    console.log('detail', has);
    if (has) {
      await page.evaluate(() => document.getElementById('btn-play-movie').click());
      await page.waitForTimeout(14000);
      const s = await page.evaluate(() => {
        const v = document.getElementById('video-player');
        return {
          t: Math.round(v?.currentTime || 0), rs: v?.readyState, paused: v?.paused,
          err: document.getElementById('player-error')?.classList.contains('hidden') ? null : document.getElementById('player-error-text')?.textContent,
        };
      });
      console.log(name, JSON.stringify(s));
      await page.evaluate(() => player.stop());
      await page.waitForTimeout(400);
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
