// Jalan offline: jaringan dulu (pembaruan langsung sampai), cadangan dari cache.
const CACHE = 'tapak-v5';
const FILES = [
  './', 'index.html', 'app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  ...['main', 'work', 'panels', 'board', 'draw', 'model', 'pkp', 'geom', 'auto', 'worker', 'pdf', 'store', 'export', 'ui', 'crop', 'warp', 'pick', 'deskew', 'cursor'].map((n) => `js/${n}.js`),
  'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs', 'vendor/pdfjs/wasm/openjpeg.wasm', 'vendor/pdfjs/wasm/jbig2.wasm', 'vendor/pdflib/pdf-lib.esm.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(FILES.map((f) => c.add(f)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tapak-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? Response.error())),
  );
});
