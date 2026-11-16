const CACHE = 'pdffusion-v1';
const CDN = [
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];
const CORE = ['./', 'index.html', 'style.css', 'app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(CORE.concat(CDN).map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const same = new URL(req.url).origin === self.location.origin;
  if (same) {
    // ملفات التطبيق: الشبكة أولًا (عشان التحديثات)، وعند انقطاع الإنترنت من الكاش
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const cp = res.clone();
            caches.open(CACHE).then((c) => c.put(req, cp));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    );
  } else {
    // المكتبات من CDN: الكاش أولًا
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(req, cp));
        }
        return res;
      }))
    );
  }
});
