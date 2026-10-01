// Clave PÚBLICA VAPID (no es secreta: se manda al servicio de push del navegador). La PRIVADA vive
// sólo en la variable de entorno VAPID_PRIVATE_KEY del servidor. Generadas con web-push; rotadas el
// 2026-09-30 porque la privada original se perdió (cambiarla obliga a re-suscribir: PushReminders lo detecta).
export const VAPID_PUBLIC_KEY = 'BO1dzo-vaSSjGOdF0w-WH2-tKSWcOOamUix4dqlmICShBBwNDeX1dP6ihmhOs6og0DZZrPbLZSKBSTmNDwG2MYs'

// base64url → Uint8Array, como pide pushManager.subscribe({ applicationServerKey }).
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
