/* ============================================================
   EyeCare Pro — Service Worker
   Cache-first for static assets, network-first for API.
============================================================ */

const CACHE_NAME = 'eyecare-v2';
const STATIC_ASSETS = [
    '/',
    '/login.html',
    '/index.html',
    '/style.css',
    '/script-with-ml.js',
    '/api.js',
    '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET and /api/ requests (always go to network for API)
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (!response || response.status !== 200 || response.type === 'opaque') return response;
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => caches.match('/login.html'));
        })
    );
});
