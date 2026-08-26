// Clave PÚBLICA VAPID (no es secreta: se manda al servicio de push del navegador). La PRIVADA vive
// sólo en la variable de entorno VAPID_PRIVATE_KEY del servidor. Generadas con web-push (una vez).
export const VAPID_PUBLIC_KEY = 'BGC69HPWQJld3oleODJdLvHER6hSc8BFOsWUR47n9dp3bq6fbYDef8KBU_RIaD8HLEvuOZn2AiZNs3G0_6z3AR8'

// base64url → Uint8Array, como pide pushManager.subscribe({ applicationServerKey }).
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
