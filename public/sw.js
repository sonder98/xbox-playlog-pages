// Cache only public app-shell assets. Xbox records are encrypted but must always be fetched fresh.
const VERSION = 'playlog-pwa-v1';
const SHELL = VERSION + '-shell';
const IMAGES = VERSION + '-art';
const APP = new URL(self.registration.scope);
const withinApp = url => url.origin === APP.origin && url.pathname.startsWith(APP.pathname);
const isRecord = url => /\/(?:vault|status)\.json$/.test(url.pathname);
self.addEventListener('install', event => {
 event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
 event.waitUntil((async () => {
  for (const key of await caches.keys()) {
   if (key.startsWith('playlog-pwa-') && key !== SHELL && key !== IMAGES) await caches.delete(key);
  }
  await self.clients.claim();
 })());
});
async function store(cacheName, request, response, limit) {
 if (!response.ok || response.type === 'opaque') return;
 const cache = await caches.open(cacheName);
 await cache.put(request, response.clone());
 const keys = await cache.keys();
 if (keys.length > limit) await Promise.all(keys.slice(0, keys.length - limit).map(key => cache.delete(key)));
}
self.addEventListener('fetch', event => {
 const request = event.request;
 if (request.method !== 'GET') return;
 const url = new URL(request.url);
 if (!withinApp(url) || isRecord(url) || url.pathname.includes('/api/')) return;
 if (request.mode === 'navigate') {
  event.respondWith((async () => {
   try {
    const response = await fetch(request);
    if (response.ok) event.waitUntil(store(SHELL, new Request(APP.href), response, 24));
    return response;
   } catch {
    return (await caches.match(APP.href)) || Response.error();
   }
  })());
  return;
 }
 if (/\.(?:js|css|png|svg|ico|webmanifest)$/.test(url.pathname) && !url.pathname.includes('/media/')) {
  event.respondWith((async () => {
   const cached = await caches.match(request);
   if (cached) return cached;
   const response = await fetch(request);
   if (response.ok) event.waitUntil(store(SHELL, request, response, 48));
   return response;
  })());
  return;
 }
 if (url.pathname.includes('/media/') && /\.(?:webp|png|jpe?g)$/.test(url.pathname)) {
  event.respondWith((async () => {
   const cached = await caches.match(request);
   if (cached) return cached;
   const response = await fetch(request);
   if (response.ok) event.waitUntil(store(IMAGES, request, response, 120));
   return response;
  })());
 }
});
