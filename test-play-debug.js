const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message));
  page.on('console', msg => {
    const t = msg.text();
    if (msg.type() === 'error' || t.includes('[VIDEO]') || t.includes('player') || t.includes('Error') || t.includes('MSE'))
      console.log('[console]', t.substring(0, 250));
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(5000);

  await page.evaluate(() => {
    window.__playCalls = [];
    const orig = player.play.bind(player);
    player.play = function(...args) {
      window.__playCalls.push({ url: args[0], title: args[1], type: args[2], opts: args[3] });
      try {
        return orig(...args);
      } catch (e) {
        window.__playError = e.message + '\n' + e.stack;
        throw e;
      }
    };
  });

  await page.click('[data-section="movies"]');
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll('#movies-grid .content-card')[0]?.click());
  await page.waitForTimeout(3000);

  const before = await page.evaluate(() => ({
    hasBtn: !!document.getElementById('btn-play-movie'),
    detailHidden: document.getElementById('detail-modal')?.classList.contains('hidden'),
  }));
  console.log('BEFORE', JSON.stringify(before));

  await page.evaluate(() => {
    const btn = document.getElementById('btn-play-movie');
    if (!btn) return 'NO_BTN';
    try {
      btn.click();
      return 'CLICKED';
    } catch (e) {
      return 'CLICK_ERR:' + e.message;
    }
  });

  await page.waitForTimeout(3000);

  const after = await page.evaluate(() => ({
    playCalls: window.__playCalls,
    playError: window.__playError || null,
    playerOpen: !document.getElementById('player-modal')?.classList.contains('hidden'),
    playerHiddenClass: document.getElementById('player-modal')?.className,
    src: document.getElementById('video-player')?.src,
    currentType: player.currentType,
    currentUrl: player.currentUrl,
    containerIsPlayerModal: player.container?.id,
    loaderHidden: document.getElementById('player-loader')?.classList.contains('hidden'),
    errHidden: document.getElementById('player-error')?.classList.contains('hidden'),
    errText: document.getElementById('player-error-text')?.textContent,
  }));
  console.log('AFTER', JSON.stringify(after, null, 2));

  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
