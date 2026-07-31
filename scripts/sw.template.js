// scripts/bump-sw-cache.js generates public/sw.js from scripts/sw.template.js
// (on npm run dev, build, and start), filling in CACHE_VERSION. Edit the
// template, never public/sw.js — it is gitignored and regenerated on each run.
//
// DreamyCafe POS service worker — keeps the staff app shell loadable offline so
// a network drop doesn't blank the POS. The menu DATA fallback lives in useMenu
// (localStorage); this SW only caches the app shell + static assets.
const CACHE_VERSION = '__CACHE_VERSION__'
// /pos is auth-gated — never pre-cache it (install fetches run without a staff cookie).
const APP_SHELL = ['/offline.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return

  // Never cache API responses — orders/cash/terminal/menu must be fresh online.
  if (url.pathname.startsWith('/api/')) return

  // Let the browser handle page navigations — iOS Safari/PWA can fail when the SW
  // proxies auth-gated HTML (e.g. /pos after staff login). Static assets below
  // still cache for offline shell; menu data offline fallback is in useMenu.
  if (request.mode === 'navigate') return

  // Static assets (_next/static, icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
