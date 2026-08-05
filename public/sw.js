/* Service worker mínimo para instalar la PWA y dar offline básico.
   Estrategia: NETWORK-FIRST (siempre intenta red; si falla, sirve caché). Así nunca queda JS
   viejo pegado tras un deploy, pero las páginas ya visitadas abren sin conexión. */
const CACHE = 'advl-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return          // no tocar terceros (APIs externas, etc.)
  if (url.pathname.startsWith('/api/')) return              // API siempre a la red (datos frescos)
  e.respondWith(
    fetch(req)
      .then((res) => {
        // Sólo cachea 200 completo (206 Partial Content NO es cacheable → Cache.put lanza).
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(req))
  )
})
