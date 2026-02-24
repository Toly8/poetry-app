const CACHE = "poetry-cache-v4";
const ASSETS = [
  "/",
  "/index.html",
  "/collection.html",
  "/reader.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/service-worker.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(event.request);
    })
  );
});
