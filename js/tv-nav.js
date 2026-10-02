// OpenTv — Navegação por controle remoto (TV / TV Box)
// Setas movem o foco espacialmente, OK/Enter clica, Back/Escape volta.
(function () {
    'use strict';

    // ===== Detecção de TV (UA) — liga modo tv-mode p/ estilos maiores =====
    const TVUA = /AndroidTV|SmartTV|Web0S|Tizen|HbbTV|GoogleTV|NetCast|Vidaa|AppleTV|OPR\/|AFT[A-Z]{0,4}\b|Roku/i;
    const isTVUA = TVUA.test(navigator.userAgent || '');
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const bigScreen = Math.max(screen.width || 0, screen.height || 0) >= 1280;
    if (isTVUA || (coarse && bigScreen)) document.documentElement.classList.add('tv-mode');

    let enabled = true;
    let lastFocus = null;
    let dispatchingBack = false;

    const INPUT_SEL = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
    const FOCUSABLE_SEL = '.nav-item, .content-card, .channel-card, .filter-pill, .filter-mode, .btn-open-filter, .season-pill, .episode-card, .btn-hero, .btn-watch, .page-btn, .live-category-btn, .ch-guide, .modal-close, .fav-tab, .bottom-nav .nav-item, .epg-row, .btn-plan, .region-btn, .row-scroll-btn, .lp-btn, .enter-btn, input[type="search"], input[type="text"], input[type="email"], input[type="password"]';

    function inInput(el) {
        if (!el || el === document.body || !el.closest) return false;
        return !!el.closest(INPUT_SEL);
    }

    function visible(el) {
        if (!el || !el.isConnected) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return false;
        if (r.bottom <= 0 || r.top >= window.innerHeight) return false;
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none';
    }

    function focusables() {
        const els = [];
        document.querySelectorAll(FOCUSABLE_SEL).forEach(el => { if (visible(el)) els.push(el); });
        return els;
    }

    function center(el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function setFocus(el) {
        document.querySelectorAll('.tv-focus').forEach(x => x.classList.remove('tv-focus'));
        el.classList.add('tv-focus');
        lastFocus = el;
        try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    function move(dir) {
        const active = document.activeElement;
        let cur = (active && active !== document.body && visible(active)) ? active : null;
        if (!cur && lastFocus && visible(lastFocus)) cur = lastFocus;
        const cands = focusables().filter(el => el !== cur);
        if (!cur) {
            if (!cands.length) return false;
            setFocus(cands[0]);
            return true;
        }
        const c = center(cur);
        let best = null, bestScore = Infinity;
        cands.forEach(el => {
            const p = center(el);
            const dx = p.x - c.x, dy = p.y - c.y;
            let ok = false, primary = 0, cross = 0;
            if (dir === 'up') { ok = dy < -10; primary = -dy; cross = Math.abs(dx); }
            if (dir === 'down') { ok = dy > 10; primary = dy; cross = Math.abs(dx); }
            if (dir === 'left') { ok = dx < -10; primary = -dx; cross = Math.abs(dy); }
            if (dir === 'right') { ok = dx > 10; primary = dx; cross = Math.abs(dy); }
            if (!ok) return;
            const score = primary + cross * 2.5;
            if (score < bestScore) { bestScore = score; best = el; }
        });
        if (!best) return false;
        setFocus(best);
        return true;
    }

    function playerOpen() {
        const pm = document.getElementById('player-modal');
        return !!(pm && !pm.classList.contains('hidden'));
    }

    // Mouse/touch: limpa anel de foco do TV ao clicar (evita anel fantasma no PC)
    document.addEventListener('pointerdown', () => {
        document.querySelectorAll('.tv-focus').forEach(x => x.classList.remove('tv-focus'));
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || dispatchingBack) return;
        const key = e.key;
        const typing = inInput(e.target);

        // ===== Back (remotos mandam Escape/GoBack/Backspace/BrowserBack) =====
        if (key === 'Escape' || key === 'GoBack' || key === 'BrowserBack' || key === 'Backspace') {
            if (typing) {
                if (key === 'Escape') { e.target.blur(); e.preventDefault(); }
                return; // Backspace digitando apaga texto; Escape dentro de campo só sai do campo
            }
            const sb = document.getElementById('sidebar');
            if (sb && sb.classList.contains('open')) { sb.classList.remove('open'); e.preventDefault(); return; }
            if (key === 'Escape') return; // app.js/player.js já tratam Escape (fecha modal/player)
            // normaliza para Escape: app.js fecha modal/topo, player.js para player
            e.preventDefault();
            dispatchingBack = true;
            try {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            } catch (err) {}
            setTimeout(() => { dispatchingBack = false; }, 0);
            return;
        }

        if (typing) return; // não sequestra setas/Enter digitando

        if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
            if (playerOpen() || !enabled) return; // player: setas controlam seek
            if (move(key.replace('Arrow', '').toLowerCase())) e.preventDefault();
            return;
        }

        if (key === 'Enter' || key === 'NumpadEnter' || key === 'Select') {
            if (playerOpen()) return;
            const el = document.activeElement;
            if (!el || el === document.body) return;
            // nativos (button/a/input) já disparam click sozinhos — não duplica
            const native = el.matches && el.matches('button, a[href], input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], [role="button"], summary');
            if (native) return;
            if (el.classList.contains('tv-focus')) { e.preventDefault(); el.click(); }
            return;
        }

        // Botões de canal/página do remoto
        if (key === 'PageUp' || key === 'PageDown' || key === 'ChannelUp' || key === 'ChannelDown') {
            if (playerOpen()) return;
            e.preventDefault();
            const dir = (key === 'PageUp' || key === 'ChannelUp') ? -1 : 1;
            window.scrollBy({ top: dir * window.innerHeight * 0.85, behavior: 'smooth' });
        }
    }, true);

    window.__tvNav = { move: move, isTV: isTVUA || (coarse && bigScreen) };
})();
