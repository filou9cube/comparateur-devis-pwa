// sw.js - Service Worker

const CACHE_NAME = 'comparateur-devis-cache-v12'; // Utilise un nom de cache récent
const urlsToCache = [
    './', // Représente la racine de votre site sur GitHub Pages (c'est-à-dire index.html)
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './images/icon-192x192.png',
    './images/icon-512x512.png'
    // Si vous avez d'autres fichiers/images essentiels à mettre en cache, ajoutez-les ic
];

self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installation en cours (Cache:', CACHE_NAME, ')...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Cache ouvert, mise en cache initiale.');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('[Service Worker] Mise en cache initiale terminée.');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Échec de la mise en cache initiale:', error);
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activation (Cache:', CACHE_NAME, ')...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Suppression de l\'ancien cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[Service Worker] Activé et anciens caches nettoyés.');
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) { return cachedResponse; }
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const requestUrl = new URL(event.request.url);
                        const isAppFile = urlsToCache.includes(requestUrl.pathname) ||
                                            urlsToCache.includes(requestUrl.pathname.substring(1)) ||
                                            event.request.url.startsWith(self.location.origin);
                        if (isAppFile) {
                             const responseToCache = networkResponse.clone();
                             caches.open(CACHE_NAME)
                                 .then((cache) => {
                                     // console.log('[Service Worker] Mise en cache dynamique de:', event.request.url); // Peut être commenté si trop verbeux
                                     cache.put(event.request, responseToCache);
                                 });
                        }
                    }
                    return networkResponse;
                }).catch(error => {
                    console.error('[Service Worker] Erreur fetch réseau:', error, 'pour', event.request.url);
                    return new Response('Network error occurred.', {
                        status: 408,
                        statusText: 'Network error'
                    });
                });
            })
            .catch(error => {
                 console.error('[Service Worker] Erreur match cache:', error);
                 return new Response('Error handling fetch.', { status: 500 });
            })
    );
});
