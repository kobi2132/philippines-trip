// Offline support: app files are cached; bump VERSION to ship an update.
const VERSION = 'v11';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/util.js', 'js/install.js', 'js/trip.js', 'js/map.js', 'js/views.js', 'js/backend.js', 'js/main.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// App files and fonts/SDK: network first, fall back to cache (so updates arrive when online).
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const cacheable = url.origin === location.origin || url.host.endsWith('gstatic.com') || url.host === 'fonts.googleapis.com';
  if (!cacheable || url.pathname.includes('/google.firestore')) return;
  e.respondWith(
    // Own files skip the browser's HTTP cache (GitHub Pages keeps them 10 minutes), so updates arrive at once.
    (url.origin === location.origin ? fetch(new Request(e.request, { cache: 'no-cache' })) : fetch(e.request)).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: url.origin === location.origin }))
  );
});

// Push from the notifier job (FCM web push, data-only: { title, body, link }).
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data.json(); } catch (err) { p = { title: 'הטיול לפיליפינים', body: e.data && e.data.text() }; }
  const d = p.data || p.notification || p;
  e.waitUntil(self.registration.showNotification(d.title || 'הטיול לפיליפינים', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', dir: 'rtl', lang: 'he',
    data: { link: d.link || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = e.notification.data && e.notification.data.link || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { open.navigate(link); return open.focus(); }
    return self.clients.openWindow(link);
  }));
});
