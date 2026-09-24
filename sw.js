// OpenTv — Service Worker (PWA installável, cache do shell)
const CACHE = 'opentv-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/assets/images/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  // nunca cachear streams/APIs/dados dinamicos
  if (/xtream-|sec-api|status-|session-|trial-|\/stats|genres-all|supabase|omdbapi/.test(url)) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) {
        fetch(e.request).then((res) => { if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); }).catch(() => {});
        return hit;
      }
      return fetch(e.request).then((res) => {
        if (res && res.ok && (url.includes('opentvv.netlify.app') || url.startsWith(self.location.origin))) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
