const CACHE_NAME = 'hotelbook-v17';
const APP_SHELL = [
  'index.html',
  'hotel.html',
  'reservations.html',
  'manifest.json',
  'css/style.css',
  'script.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', function(event) {
  // kazdy soubor ukladame zvlast, aby jeden chybejici neshodil cely install
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
    return Promise.all(APP_SHELL.map(function(url) {
      return cache.add(url).catch(function() {});
    }));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(key) {
        return key !== CACHE_NAME;
      }).map(function(key) {
        return caches.delete(key);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  // network-first: zkus sit, pri vypadku vrat z cache
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
