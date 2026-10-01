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
    if (t.includes('[VIDEO]') || t.includes('[MSE]') || t.includes('[MPEGTS]') || t.includes('[LIVE]') || msg.type() === 'error') {
      if (!t.includes('ERR_NAME') && !t.includes('BLOCKED') && !t.includes('402'))
        console.log('  [c]', t.substring(0, 220));
    }
  });
  page.on('response', res => {
    if (res.url().includes('/stream/') || res.url().includes('.m3u8') || res.url().includes('.ts'))
      console.log('  [res]', res.status(), res.headers.get('content-type') || '', res.url().substring(0, 140));
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(4000);

  console.log('\n=== LIVE RETRY ===');
  await page.evaluate(() => document.querySelector('[data-section="live"]')?.click());
  await page.waitForTimeout(1500);

  const channels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.channel-card')).slice(0, 8).map(c => ({
      name: c.querySelector('.ch-name')?.textContent || '',
      id: c.getAttribute('data-id') || c.dataset?.id || ''
    }));
  });
  console.log('channels:', JSON.stringify(channels));

  for (const ch of channels.slice(0, 3)) {
    console.log('Opening live:', ch.name);
    await page.evaluate((name) => {
      for (const c of document.querySelectorAll('.channel-card')) {
        if ((c.querySelector('.ch-name')?.textContent || '').includes(name)) { c.click(); return; }
      }
      document.querySelector('.channel-card')?.click();
    }, ch.name);
    await page.waitForTimeout(15000);
    const s = await videoState(page);
    console.log('LIVE_STATE:', JSON.stringify(s));
    if (!s.paused && s.rs >= 2) {
      console.log('LIVE_OK');
      await page.screenshot({ path: 'test-live-retry.png' });
      break;
    }
    await page.evaluate(() => {
      try { player.stop(); } catch (e) {}
      document.getElementById('player-modal')?.classList.add('hidden');
      document.body.style.overflow = '';
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('[data-section="live"]')?.click());
    await page.waitForTimeout(800);
  }

  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
