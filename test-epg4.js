const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message));

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.click('#btn-enter');
  await page.waitForTimeout(5000);

  const found = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('#channel-list .channel-card')];
    for (const c of cards) {
      const sid = parseInt(c.getAttribute('data-stream-id'), 10);
      try {
        const data = await api.getEpg(sid);
        if (data && Array.isArray(data.epg_listings) && data.epg_listings.length > 0) return { sid, name: c.querySelector('.ch-name')?.textContent };
      } catch (e) {}
    }
    return null;
  });
  console.log('CHANNEL_WITH_EPG', JSON.stringify(found));
  if (!found) { console.log('NO_CHANNEL_WITH_EPG'); await browser.close(); return; }

  await page.click(`#channel-list .channel-card[data-stream-id="${found.sid}"]`);
  await page.waitForTimeout(3500);
  const state1 = await page.evaluate(() => ({
    playerSid: player.currentStreamId,
    playerOpen: !document.getElementById('player-modal')?.classList.contains('hidden'),
    barHidden: document.getElementById('live-epg-bar')?.classList.contains('hidden'),
    clock: document.getElementById('epg-clock')?.textContent,
    title: document.getElementById('epg-now-title')?.textContent,
    timeLeft: document.getElementById('epg-time-left')?.textContent,
    progress: document.getElementById('epg-progress-bar')?.style.width,
    reserveActive: document.getElementById('epg-reserve-btn')?.classList.contains('active'),
    timeshiftHidden: document.getElementById('epg-timeshift-btn')?.classList.contains('hidden'),
  }));
  console.log('EPG_BAR', JSON.stringify(state1, null, 2));

  if (!state1.barHidden) {
    const res = await page.evaluate(() => {
      document.getElementById('epg-reserve-btn').click();
      const active = document.getElementById('epg-reserve-btn').classList.contains('active');
      const list = ReservationStore.list();
      document.getElementById('epg-reserve-btn').click();
      const active2 = document.getElementById('epg-reserve-btn').classList.contains('active');
      const list2 = ReservationStore.list();
      return { active, listLen: list.length, active2, listLen2: list2.length };
    });
    console.log('RESERVE_TOGGLE', JSON.stringify(res));
    if (!state1.timeshiftHidden) {
      await page.click('#epg-timeshift-btn');
      await page.waitForTimeout(2500);
      const ts = await page.evaluate(() => ({
        title: document.getElementById('player-title')?.textContent,
        src: document.getElementById('video-player')?.src?.substring(0, 160),
        open: !document.getElementById('player-modal')?.classList.contains('hidden'),
      }));
      console.log('TIMESHIFT', JSON.stringify(ts));
    } else {
      console.log('TIMESHIFT hidden (canal sem archive ou sem janela disponivel)');
    }
  }

  await page.evaluate(() => { if (typeof player !== 'undefined') player.stop(); });
  await page.screenshot({ path: 'C:/Users/nasci15k/Downloads/unitv-web/test-epg.png' });
  console.log('DONE');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
