const APP_CACHE = 'noor-app-v1'
const QURAN_CACHE = 'noor-quran-text-v1'
const BASE_URL = new URL('./', self.location.href)
const APP_URL = BASE_URL.href

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('noor-') && ![APP_CACHE, QURAN_CACHE].includes(key))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(APP_CACHE).then((cache) => cache.put(APP_URL, copy))
          return response
        })
        .catch(async () => await caches.match(request) || await caches.match(APP_URL)))
      return
    }

    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(APP_CACHE).then((cache) => cache.put(request, copy))
      }
      return response
    })))
    return
  }

  if (url.hostname === 'api.alquran.cloud') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(QURAN_CACHE).then((cache) => cache.put(request, copy))
      }
      return response
    }).catch(async () => await caches.match(request) || new Response('Quran data is not available offline yet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })))
  }
})