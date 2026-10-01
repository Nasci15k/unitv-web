const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('[console.error]', msg.text().substring(0, 200)); });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(5000);

  const target = await page.evaluate(async () => {
    const streams = await api.getLiveStreams();
    const withArchive = (Array.isArray(streams) ? streams : []).filter(s => parseInt(s.tv_archive_duration, 10) > 0).slice(0, 5);
    for (const s of withArchive) {
      try {
        const data = await api.getEpg(s.stream_id);
        if (data && Array.isArray(data.epg_listings) && data.epg_listings.length > 0) {
          return { sid: s.stream_id, name: s.name, archive: s.tv_archive_duration, listings: data.epg_listings.length };
        }
      } catch (e) {}
    }
    return { candidates: withArchive.map(s => ({ sid: s.stream_id, name: s.name, archive: s.tv_archive_duration })) };
  });
  console.log('TARGET', JSON.stringify(target));
  if (!target.sid) { console.log('NO_ARCHIVE_CHANNEL_WITH_EPG'); await browser.close(); return; }

  await page.click(`#channel-list .channel-card[data-stream-id="${target.sid}"]`);
  await page.waitForTimeout(3500);
  const st = await page.evaluate(() => ({
    barHidden: document.getElementById('live-epg-bar')?.classList.contains('hidden'),
    title: document.getElementById('epg-now-title')?.textContent,
    clock: document.getElementById('epg-clock')?.textContent,
    progress: document.getElementById('epg-progress-bar')?.style.width,
    timeshiftHidden: document.getElementById('epg-timeshift-btn')?.classList.contains('hidden'),
    reserveActive: document.getElementById('epg-reserve-btn')?.classList.contains('active'),
  }));
  console.log('EPG_ARCHIVE', JSON.stringify(st, null, 2));

  if (!st.timeshiftHidden) {
    await page.click('#epg-timeshift-btn');
    await page.waitForTimeout(3000);
    const ts = await page.evaluate(() => ({
      title: document.getElementById('player-title')?.textContent,
      src: document.getElementById('video-player')?.src?.substring(0, 200),
      open: !document.getElementById('player-modal')?.classList.contains('hidden'),
      err: document.getElementById('player-error')?.classList.contains('hidden') ? null : document.getElementById('player-error-text')?.textContent,
    }));
    console.log('TIMESHIFT_PLAY', JSON.stringify(ts, null, 2));
    await page.evaluate(() => player.stop());
  }

  console.log('DONE');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
