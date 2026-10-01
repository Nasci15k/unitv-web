const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(e.message); console.log('[PAGEERROR]', e.message); });
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text().substring(0, 200)); });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(5000);

  const nav = await page.evaluate(() => ({
    labels: [...document.querySelectorAll('.nav-item')].map(n => n.textContent.trim()),
    active: document.querySelector('.nav-item.active')?.dataset.section,
    section: document.querySelector('.section.active')?.id,
  }));
  console.log('NAV', JSON.stringify(nav));

  await page.click('[data-section="jogos"]');
  await page.waitForTimeout(8000);
  const jogos = await page.evaluate(() => ({
    active: document.querySelector('.section.active')?.id,
    chips: document.querySelectorAll('.jogo-date-chip').length,
    games: document.querySelectorAll('.game-card').length,
    empty: !!document.querySelector('#jogos-grid .empty-state'),
    loading: (document.querySelector('#jogos-grid')?.textContent || '').includes('Carregando'),
    activeChip: document.querySelector('.jogo-date-chip.active')?.textContent,
  }));
  console.log('JOGOS', JSON.stringify(jogos));
  if (jogos.chips >= 2) {
    await page.click('.jogo-date-chip:nth-child(2)');
    await page.waitForTimeout(600);
    const sw = await page.evaluate(() => ({
      activeChip: document.querySelector('.jogo-date-chip.active')?.textContent,
      activeCount: document.querySelectorAll('.jogo-date-chip.active').length,
      hasContent: document.querySelectorAll('#jogos-grid .game-card, #jogos-grid .empty-state').length,
    }));
    console.log('JOGOS_SWITCH', JSON.stringify(sw));
  }

  await page.click('[data-section="movies"]');
  await page.waitForTimeout(400);
  await page.click('#btn-open-filter');
  await page.waitForTimeout(600);
  const filter = await page.evaluate(() => ({
    open: !document.getElementById('filter-modal')?.classList.contains('hidden'),
    tipo: document.querySelectorAll('#filter-tipo-pills .filter-pill').length,
    genero: document.querySelectorAll('#filter-genero-pills .filter-pill').length,
    ano: document.querySelectorAll('#filter-ano-pills .filter-pill').length,
    results: document.querySelectorAll('#filter-results .content-card').length,
    noRes: !document.getElementById('filter-no-results')?.classList.contains('hidden'),
    firstAno: document.querySelector('#filter-ano-pills .filter-pill')?.textContent,
  }));
  console.log('FILTER', JSON.stringify(filter));
  await page.click('#filter-tipo-pills .filter-pill[data-tipo="S\u00e9ries"]');
  await page.waitForTimeout(400);
  const fSeries = await page.evaluate(() => ({
    tipoActive: document.querySelector('#filter-tipo-pills .filter-pill.active')?.dataset.tipo,
    results: document.querySelectorAll('#filter-results .content-card').length,
  }));
  console.log('FILTER_SERIES', JSON.stringify(fSeries));
  if (filter.ano >= 3) {
    await page.click('#filter-ano-pills .filter-pill:nth-child(3)');
    await page.waitForTimeout(300);
  }
  await page.click('#btn-filter-apply');
  await page.waitForTimeout(300);
  await page.click('#btn-close-filter');
  await page.waitForTimeout(200);
  const fClosed = await page.evaluate(() => document.getElementById('filter-modal')?.classList.contains('hidden'));
  console.log('FILTER_CLOSED', fClosed);

  await page.evaluate(() => {
    ParentalControlStore.savePin('1234');
    if (!FavoriteStore.is('movie', 1)) FavoriteStore.toggle('movie', 1);
  });
  await page.click('[data-section="favorites"]');
  await page.waitForTimeout(500);
  const favBar = await page.evaluate(() => ({
    favBar: !document.getElementById('fav-actions')?.classList.contains('hidden'),
    histBar: !document.getElementById('hist-actions')?.classList.contains('hidden'),
    favCards: document.querySelectorAll('#favorites-grid .content-card, #favorites-grid .channel-card').length,
  }));
  console.log('FAV_BAR', JSON.stringify(favBar));
  await page.click('#btn-fav-clear-all');
  await page.waitForTimeout(400);
  const pinOpen = await page.evaluate(() => ({
    open: !document.getElementById('parental-modal')?.classList.contains('hidden'),
    msg: document.getElementById('parental-msg')?.textContent,
    removeBtn: !document.getElementById('btn-pin-remove')?.classList.contains('hidden'),
  }));
  console.log('PARENTAL_OPEN', JSON.stringify(pinOpen));
  await page.fill('#pin-1', '1');
  await page.fill('#pin-2', '2');
  await page.fill('#pin-3', '3');
  await page.fill('#pin-4', '4');
  await page.waitForTimeout(400);
  const pinDone = await page.evaluate(() => ({
    closed: document.getElementById('parental-modal')?.classList.contains('hidden'),
    favs: Object.keys(FavoriteStore.load()).length,
    stillPinned: ParentalControlStore.hasPin(),
  }));
  console.log('PARENTAL_OK', JSON.stringify(pinDone));
  await page.evaluate(() => ParentalControlStore.remove());

  const movie = await page.evaluate(async () => {
    const list = await api.getVodStreams();
    const m = Array.isArray(list) ? list.find(x => !ContentFilter.isAdult(x.name || '')) || list[0] : null;
    if (!m) return null;
    WatchStore.record('movie', m.stream_id, m.name);
    return { id: m.stream_id, name: m.name };
  });
  console.log('HIST_RECORD', JSON.stringify(movie));
  await page.click('.fav-tab[data-fav="history"]');
  await page.waitForTimeout(500);
  const hist = await page.evaluate(() => ({
    histBar: !document.getElementById('hist-actions')?.classList.contains('hidden'),
    favBar: !document.getElementById('fav-actions')?.classList.contains('hidden'),
    items: document.querySelectorAll('#history-list .content-card').length,
    empty: !!document.querySelector('#history-list .empty-state'),
  }));
  console.log('HISTORY', JSON.stringify(hist));
  await page.click('#btn-history-delete-mode');
  await page.waitForTimeout(400);
  const delMode = await page.evaluate(() => ({
    wraps: document.querySelectorAll('#history-list .hist-item').length,
    dels: document.querySelectorAll('#history-list .hist-del').length,
    mode: document.getElementById('btn-history-delete-mode')?.classList.contains('active'),
    deleteMode: document.getElementById('history-list')?.classList.contains('delete-mode'),
  }));
  console.log('HIST_DELETE_MODE', JSON.stringify(delMode));
  if (delMode.dels > 0) {
    const before = delMode.wraps;
    await page.click('#history-list .hist-del');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      wraps: document.querySelectorAll('#history-list .hist-item').length,
      history: WatchStore.getRecent(50).length,
    }));
    console.log('HIST_DELETED', JSON.stringify({ before, ...after }));
  }
  await page.evaluate(() => WatchStore.clearHistory());

  await page.click('[data-section="search"]');
  await page.waitForTimeout(300);
  const search = await page.evaluate(() => ({
    pills: document.querySelectorAll('#search-type-pills .filter-pill').length,
    activePill: document.querySelector('#search-type-pills .filter-pill.active')?.dataset.type,
  }));
  console.log('SEARCH_PILLS', JSON.stringify(search));

  await page.click('[data-section="live"]');
  await page.waitForTimeout(1500);
  const epg = await page.evaluate(() => ({
    reserve: !!document.getElementById('epg-reserve-btn'),
    timeshift: !!document.getElementById('epg-timeshift-btn'),
    clock: !!document.getElementById('epg-clock'),
    channels: document.querySelectorAll('#channel-list .channel-card').length,
  }));
  console.log('EPG_BTNS', JSON.stringify(epg));
  if (epg.channels > 0) {
    await page.evaluate(() => document.querySelector('#channel-list .channel-card')?.click());
    await page.waitForTimeout(2500);
    const epgOn = await page.evaluate(() => ({
      barVisible: !document.getElementById('live-epg-bar')?.classList.contains('hidden'),
      title: document.getElementById('epg-now-title')?.textContent,
      clock: document.getElementById('epg-clock')?.textContent,
      timeshiftHidden: document.getElementById('epg-timeshift-btn')?.classList.contains('hidden'),
      playerOpen: !document.getElementById('player-modal')?.classList.contains('hidden'),
    }));
    console.log('EPG_ON', JSON.stringify(epgOn));
    if (epgOn.playerOpen) await page.evaluate(() => player.stop());
  }

  await page.screenshot({ path: 'C:/Users/nasci15k/Downloads/unitv-web/test-features.png', fullPage: false });
  console.log('PAGE_ERRORS', pageErrors.length);
  console.log('DONE');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
