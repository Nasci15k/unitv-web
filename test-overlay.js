const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message));

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(3000);

  await page.click('[data-section="live"]');
  await page.waitForTimeout(2000);

  const clicked = await page.evaluate(() => {
    const cards = document.querySelectorAll('.channel-card');
    for (const c of cards) {
      const n = c.querySelector('.ch-name')?.textContent || '';
      if (n.toLowerCase().includes('globo')) { c.click(); return n; }
    }
    return null;
  });
  console.log('Clicked:', clicked);
  await page.waitForTimeout(8000);

  const during = await page.evaluate(() => ({
    playerOpen: !document.getElementById('player-modal')?.classList.contains('hidden'),
    loadingOpen: !document.getElementById('loading-overlay')?.classList.contains('hidden'),
    bodyOverflow: document.body.style.overflow,
    rs: document.getElementById('video-player')?.readyState,
  }));
  console.log('DURING', JSON.stringify(during));

  await page.evaluate(() => player.stop());
  await page.waitForTimeout(1000);

  const after = await page.evaluate(() => {
    const overlays = [...document.querySelectorAll('.modal-overlay, .loading-overlay')].map(el => ({
      id: el.id,
      hidden: el.classList.contains('hidden'),
      display: getComputedStyle(el).display,
      pe: getComputedStyle(el).pointerEvents,
      z: getComputedStyle(el).zIndex,
    }));
    const nav = document.querySelector('[data-section="series"]');
    const r = nav?.getBoundingClientRect();
    const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    return {
      overlays,
      bodyOverflow: document.body.style.overflow,
      playerOpen: !document.getElementById('player-modal')?.classList.contains('hidden'),
      loadingOpen: !document.getElementById('loading-overlay')?.classList.contains('hidden'),
      navRect: r ? { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null,
      hitTag: hit?.tagName,
      hitId: hit?.id,
      hitClass: hit?.className?.toString?.().substring(0, 80),
      hitHtml: hit?.outerHTML?.substring(0, 120),
    };
  });
  console.log('AFTER', JSON.stringify(after, null, 2));

  const clickable = await page.evaluate(() => {
    const nav = document.querySelector('[data-section="series"]');
    if (!nav) return 'no-nav';
    nav.click();
    return document.querySelector('.section.active')?.id || 'none';
  });
  console.log('CLICKED_SERIES', clickable);

  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
