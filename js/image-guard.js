(function () {
    'use strict';
    var PLACEHOLDER = 'assets/images/placeholder.svg';
    var DEAD_HOSTS = {
        'logos.imperioapps.xyz': 1,
        'loopstatic.net': 1,
        '32q0d.xyz': 1,
        'fenix7.com': 1,
        'imagizer.imageshack.com': 1
    };

    function isDeadHost(url) {
        try {
            var u = new URL(url, location.href);
            return !!DEAD_HOSTS[u.hostname];
        } catch (e) { return false; }
    }

    function fixImg(img) {
        if (!img || img.dataset.guardFixed) return;
        img.dataset.guardFixed = '1';
        if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
        if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
        if (!img.hasAttribute('referrerpolicy')) img.setAttribute('referrerpolicy', 'no-referrer');
        if (img.src && isDeadHost(img.src)) {
            img.src = PLACEHOLDER;
            return;
        }
        var prev = img.onerror;
        img.onerror = function () {
            if (prev && prev.call) { try { prev.call(img); } catch (e) {} }
            if (img.src.indexOf('placeholder.svg') !== -1) return;
            img.onerror = null;
            if (isDeadHost(img.src)) { img.src = PLACEHOLDER; return; }
            img.src = PLACEHOLDER;
        };
        if (img.complete && img.naturalWidth === 0 && img.src && img.src.indexOf('placeholder.svg') === -1) {
            img.onerror = null;
            img.src = PLACEHOLDER;
        }
    }

    function scan(root) {
        if (!root) return;
        if (root.tagName === 'IMG') fixImg(root);
        if (root.querySelectorAll) root.querySelectorAll('img').forEach(fixImg);
    }

    // Capture-phase error listener for IMG
    window.addEventListener('error', function (e) {
        var t = e.target;
        if (t && t.tagName === 'IMG') fixImg(t);
    }, true);

    // Hero / background-image failure fallback: add gradient class
    window.addEventListener('error', function (e) {
        var t = e.target;
        if (t && t.classList && t.classList.contains('hero-bg')) {
            t.classList.add('hero-bg-fallback');
            t.style.backgroundImage = '';
        }
    }, true);

    // MutationObserver: fix new imgs + add lazy to those missing it
    function observe() {
        if (!('MutationObserver' in window)) return;
        var mo = new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                m.addedNodes && m.addedNodes.forEach(function (n) {
                    if (n.nodeType === 1) scan(n);
                });
            });
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { scan(document); observe(); });
    } else {
        scan(document);
        observe();
    }
    window.ImageGuard = { scan: scan, PLACEHOLDER: PLACEHOLDER };
})();
