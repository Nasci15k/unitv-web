// OpenTv — Navegação por controle remoto (TV / TV Box)
// Setas movem o foco espacialmente, OK/Enter clica, Back volta.
(function () {
    'use strict';
    let enabled = true;

    function focusables() {
        const els = [];
        document.querySelectorAll('.nav-item, .content-card, .channel-card, .filter-pill, .filter-mode, .btn-open-filter, .season-pill, .episode-card, .btn-hero, .btn-watch, .page-btn, .live-category-btn, .ch-guide, .modal-close, .fav-tab, .bottom-nav .nav-item, .epg-row, .btn-plan').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(el).visibility !== 'hidden') {
                els.push(el);
            }
        });
        return els;
    }

    function center(el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function move(dir) {
        const cur = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
        const cands = focusables().filter(el => el !== cur);
        if (!cands.length) return;
        if (!cur) { cands[0].focus(); cands[0].classList.add('tv-focus'); return; }
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
        if (best) {
            document.querySelectorAll('.tv-focus').forEach(el => el.classList.remove('tv-focus'));
            best.classList.add('tv-focus');
            best.focus();
            best.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    document.addEventListener('keydown', (e) => {
        // no player: setas controlam seek, não navegação
        const playerOpen = document.getElementById('player-modal') && !document.getElementById('player-modal').classList.contains('hidden');
        const key = e.key;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            if (playerOpen || !enabled) return;
            e.preventDefault();
            move(key.replace('Arrow', '').toLowerCase());
        } else if (key === 'Enter') {
            const el = document.activeElement;
            if (el && el !== document.body && el.classList.contains('tv-focus')) { el.click(); }
        } else if (key === 'Backspace' || key === 'GoBack') {
            const openModal = ['.modal-overlay:not(.hidden)'].some(sel => document.querySelector(sel));
            if (openModal) {
                e.preventDefault();
                const ov = [...document.querySelectorAll('.modal-overlay:not(.hidden)')].pop();
                if (ov.id === 'player-modal') document.getElementById('btn-close-player')?.click();
                else ov.classList.add('hidden');
            }
        }
    }, true);
})();
