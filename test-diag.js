const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[console.error]', msg.text().substring(0, 200));
  });
  page.on('request', req => {
    if (req.url().includes('/video/') || req.url().includes('/stream/movie') || req.url().includes('/stream/series'))
      console.log('[req]', req.url().substring(0, 140));
  });
  page.on('response', res => {
    if (res.url().includes('/video/') || res.url().includes('/stream/movie') || res.url().includes('/stream/series'))
      console.log('[res]', res.status(), res.url().substring(0, 140));
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(5000);

  const boot = await page.evaluate(() => ({
    hasPlayer: typeof player !== 'undefined',
    hasApi: typeof api !== 'undefined',
    hasWS: typeof WatchStore !== 'undefined',
    hasFS: typeof FavoriteStore !== 'undefined',
    liveCards: document.querySelectorAll('.channel-card').length,
    movieCards: document.querySelectorAll('#movies-grid .content-card').length,
    seriesCards: document.querySelectorAll('#series-grid .content-card').length,
    activeSection: document.querySelector('.section.active')?.id,
    navCount: document.querySelectorAll('.nav-item').length,
    hasResume: !!document.getElementById('resume-modal'),
    hasKids: !!document.getElementById('section-kids'),
    hasFav: !!document.getElementById('section-favorites'),
    filterModes: document.querySelectorAll('#movie-filter-modes .filter-mode').length,
  }));
  console.log('BOOT', JSON.stringify(boot, null, 2));

  // NAV test
  for (const sec of ['destaques', 'movies', 'series', 'kids', 'explorar', 'favorites', 'live']) {
    await page.click(`[data-section="${sec}"]`);
    await page.waitForTimeout(400);
    const active = await page.evaluate(() => document.querySelector('.section.active')?.id);
    const count = await page.evaluate((s) => {
      const el = document.getElementById('section-' + s);
      if (!el) return -1;
      return el.querySelectorAll('.content-card, .channel-card, .continue-card').length;
    }, sec);
    console.log(`NAV ${sec}: active=${active} cards=${count}`);
  }

  // Filter modes
  await page.click('[data-section="movies"]');
  await page.waitForTimeout(300);
  await page.click('#movie-filter-modes [data-mode="ano"]');
  await page.waitForTimeout(300);
  const yearPills = await page.evaluate(() => ({
    yearVisible: document.getElementById('movie-year-pills')?.style.display,
    yearCount: document.querySelectorAll('#movie-year-pills .filter-pill').length,
    cards: document.querySelectorAll('#movies-grid .content-card').length,
  }));
  console.log('FILTER ano', JSON.stringify(yearPills));

  await page.click('#movie-filter-modes [data-mode="genero"]');
  await page.waitForTimeout(300);
  const genrePills = await page.evaluate(() => ({
    genreVisible: document.getElementById('movie-genre-pills')?.style.display,
    genreCount: document.querySelectorAll('#movie-genre-pills .filter-pill').length,
  }));
  console.log('FILTER genero', JSON.stringify(genrePills));

  // Favorite toggle
  await page.click('#movie-filter-modes [data-mode="todos"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const btn = document.querySelector('#movies-grid .card-fav');
    if (btn) btn.click();
  });
  await page.waitForTimeout(200);
  const favState = await page.evaluate(() => ({
    store: window.FavoriteStore ? Object.keys(window.FavoriteStore.load()) : null,
    active: document.querySelectorAll('#movies-grid .card-fav.active').length,
  }));
  console.log('FAVORITE', JSON.stringify(favState));

  await page.click('[data-section="favorites"]');
  await page.waitForTimeout(500);
  const favGrid = await page.evaluate(() => document.querySelectorAll('#favorites-grid .content-card, #favorites-grid .channel-card').length);
  console.log('FAV_SECTION cards=', favGrid);

  // Movie play
  await page.click('[data-section="movies"]');
  await page.waitForTimeout(500);
  const cardInfo = await page.evaluate(() => {
    const cards = document.querySelectorAll('#movies-grid .content-card');
    return { n: cards.length, first: cards[0]?.querySelector('.card-title')?.textContent };
  });
  console.log('MOVIES', JSON.stringify(cardInfo));

  await page.evaluate(() => document.querySelectorAll('#movies-grid .content-card')[0]?.click());
  await page.waitForTimeout(2500);
  const detail = await page.evaluate(() => ({
    open: !document.getElementById('detail-modal')?.classList.contains('hidden'),
    hasPlay: !!document.getElementById('btn-play-movie'),
    title: document.querySelector('#detail-content h2')?.textContent,
  }));
  console.log('DETAIL', JSON.stringify(detail));

  if (detail.hasPlay) {
    await page.evaluate(() => document.getElementById('btn-play-movie').click());
    await page.waitForTimeout(8000);
    const playState = await page.evaluate(() => ({
      src: document.getElementById('video-player')?.src?.substring(0, 120),
      paused: document.getElementById('video-player')?.paused,
      rs: document.getElementById('video-player')?.readyState,
      playerOpen: !document.getElementById('player-modal')?.classList.contains('hidden'),
      resumeOpen: !document.getElementById('resume-modal')?.classList.contains('hidden'),
      currentType: typeof player !== 'undefined' ? player.currentType : null,
      err: document.getElementById('player-error')?.classList.contains('hidden') ? null : document.getElementById('player-error-text')?.textContent,
    }));
    console.log('PLAY_MOVIE', JSON.stringify(playState));
  }

  // WatchStore save simulation
  const wsTest = await page.evaluate(() => {
    WatchStore.saveProgress('movie', 99999, 100, 3600, 'Teste');
    const p = WatchStore.getProgress('movie', 99999);
    WatchStore.record('movie', 99999, 'Teste');
    const rec = WatchStore.getRecent(5);
    return { saved: !!p, pos: p?.lastWatchedPosition, completed: p?.isCompleted, history: rec.length, histType: rec[0]?.type };
  });
  console.log('WATCHSTORE', JSON.stringify(wsTest));

  // Resume modal simulation
  const resumeTest = await page.evaluate(() => {
    player.currentType = 'movie';
    player.currentStreamId = 99999;
    player.showResumeModal(650);
    const open = !document.getElementById('resume-modal')?.classList.contains('hidden');
    const label = document.getElementById('resume-position')?.textContent;
    document.getElementById('btn-resume-restart')?.click();
    const closed = document.getElementById('resume-modal')?.classList.contains('hidden');
    return { open, label, closed };
  });
  console.log('RESUME_MODAL', JSON.stringify(resumeTest));

  await page.screenshot({ path: 'C:/Users/nasci15k/Downloads/unitv-web/test-diag.png', fullPage: false });
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
