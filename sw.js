// Fenix Scanner Pro — service worker
// Estrategia: datos JSON y páginas HTML network-first (siempre lo más reciente
// del repo) con caché de respaldo para uso sin conexión; íconos cache-first.
// v2 (1-oct-2026): antes movil.html era cache-first y una versión nueva de la
// app nunca llegaba al celular. Cambiar SHELL obliga a reinstalar.
const SHELL = 'fenix-shell-v2';
const DATA = 'fenix-data-v1';
const SHELL_FILES = ['movil.html', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('.json')) {
    // Datos: red primero (tiempo real), caché si no hay conexión
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(DATA).then(c => c.put(url.pathname, copy));
        return r;
      }).catch(() => caches.open(DATA).then(c => c.match(url.pathname)))
    );
  } else if (url.pathname.endsWith('.html')) {
    // Páginas: red primero para que cada versión nueva llegue; caché sin conexión
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
        return r;
      }).catch(() => caches.match(e.request))
    );
  } else if (SHELL_FILES.some(f => url.pathname.endsWith(f))) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
