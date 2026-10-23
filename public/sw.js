/* BUILD-MARKER: v84-corregir-hora-inicio-sesion */
/* Service worker mínimo para instalar la PWA y dar offline básico.
   Estrategia: NETWORK-FIRST (siempre intenta red; si falla, sirve caché). Así nunca queda JS
   viejo pegado tras un deploy, pero las páginas ya visitadas abren sin conexión.
   Privacidad: lo autenticado no debe quedarse en el dispositivo. /peso (salud: lesiones, restricciones,
   notas médicas) NO se cachea nunca, y la caché completa se vacía al llegar a /login (sin sesión). */
// v2: subir el nombre hace que `activate` borre la v1, que ya guardó HTML/RSC de /peso con el perfil.
const CACHE = 'advl-v2'

/* /peso lleva datos de salud serializados en el HTML y en el payload RSC (?_rsc): solo a la red. */
const esPeso = (p) => p === '/peso' || p.startsWith('/peso/')
const esLogin = (p) => p === '/login' || p.startsWith('/login/')

/* Recordatorios PUSH: llegan aunque la app esté cerrada (los manda /api/push/send por cron). */
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: '⏰ Recordatorio', body: e.data ? e.data.text() : '' } }
  const title = d.title || '⏰ Recordatorio'
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', icon: '/icon-180.png', badge: '/icon-32.png',
    tag: d.tag || undefined, data: { url: d.url || '/epicas' }, requireInteraction: false,
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) { if ('focus' in c) { try { await c.navigate(url) } catch {} ; return c.focus() } }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})

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
  if (esPeso(url.pathname)) return                          // salud: ni se guarda ni se sirve de caché
  e.respondWith(
    fetch(req)
      .then(async (res) => {
        // Login servido con 200 y sin redirección = no hay sesión (con sesión, el middleware manda a «/»).
        // Cierre de sesión o sesión vencida: se vacía lo cacheado ANTES del put de abajo, para que el
        // siguiente que abra la PWA sin red no encuentre páginas privadas del usuario anterior.
        if (esLogin(url.pathname) && res.status === 200 && !res.redirected) {
          await caches.delete(CACHE).catch(() => {})
        }
        // Sólo cachea 200 completo (206 Partial Content NO es cacheable → Cache.put lanza).
        // Tampoco lo redirigido: sin sesión, una ruta privada terminaría guardando el HTML de /login
        // bajo su nombre, y una respuesta redirigida servida a una navegación el navegador la rechaza.
        if (res && res.status === 200 && res.type === 'basic' && !res.redirected) {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(req))
  )
})
