'use client'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from '@/lib/push'

// Suscribe este navegador al push; el cron diario /api/push/daily manda el resumen de las 7:00.
// Vercel Hobby no permite un cron frecuente: "Recordarme" por tarea sólo suena con la app abierta.
const AYUDA = 'Con las notificaciones activas te llega un resumen de tu día a las 7:00 (hora de México), aunque la app esté cerrada. Los recordatorios por tarea («Recordarme») solo suenan con la app abierta.'

// Una vez por carga de página aunque haya varios botones montados (panel + detalle de tarea).
let resincronizada = false

export default function PushReminders() {
  const [state, setState] = useState<'loading' | 'unsupported' | 'off' | 'on' | 'denied' | 'working'>('loading')
  const [verAyuda, setVerAyuda] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => {
        setState(sub ? 'on' : 'off')
        // Si un guardado anterior falló, el servidor no la tiene y el resumen nunca llega (upsert idempotente).
        if (sub && !resincronizada) {
          resincronizada = true
          fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) })
            .then(r => r.json()).then(j => { if (!j?.ok) resincronizada = false })
            .catch(() => { resincronizada = false })
        }
      })
      .catch(() => setState('off'))
  }, [])

  const enable = async () => {
    setState('working')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource })
      const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) })
      const j = await r.json().catch(() => ({}))
      setState(j?.ok ? 'on' : 'off')
    } catch { setState('off') }
  }

  const disable = async () => {
    setState('working')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
    } catch { /* noop */ }
    setState('off')
  }

  if (state === 'loading' || state === 'unsupported') return null

  const pill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '6px 13px', font: '700 12px var(--font-ui, system-ui)', cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: '#16365F' }

  if (state === 'denied') return <span style={{ ...pill, cursor: 'default', color: '#B0522E', borderColor: 'rgba(176,82,46,0.35)' }} title="Están bloqueadas para este sitio; actívalas desde los ajustes del navegador.">🔕 Notificaciones bloqueadas</span>
  if (state === 'working') return <span style={{ ...pill, cursor: 'default', opacity: .7 }}>… un momento</span>
  // En el celular no hay hover (el title no se ve): la aclaración se abre con un toque.
  const info = <button type="button" onClick={() => setVerAyuda(v => !v)} aria-expanded={verAyuda} aria-label="Qué avisan las notificaciones" title="Qué avisan las notificaciones" style={{ ...pill, width: 26, height: 26, padding: 0, justifyContent: 'center' }}>?</button>
  const conAyuda = (fila: ReactNode) => (
    <span style={{ display: 'inline-block' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{fila}</span>
      {verAyuda && <span role="note" style={{ display: 'block', marginTop: 6, maxWidth: 290, padding: '7px 10px', borderRadius: 10, background: '#fff', border: '1px solid rgba(15,35,64,0.12)', color: 'rgba(20,35,61,0.75)', font: '500 11.5px/1.45 var(--font-ui, system-ui)', textAlign: 'left' }}>{AYUDA}</span>}
    </span>
  )

  if (state === 'on') return conAyuda(<>
    <span style={{ ...pill, cursor: 'default', color: '#2E6E6E', borderColor: 'rgba(46,110,110,0.35)', background: 'rgba(46,110,110,0.06)' }} title={AYUDA}>🔔 Resumen diario 7:00 ✓</span>
    {info}
    <button onClick={disable} style={{ border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.45)', font: '600 11.5px var(--font-ui, system-ui)', cursor: 'pointer' }}>apagar</button>
  </>)
  return conAyuda(<>
    <button onClick={enable} style={pill} title={AYUDA}>🔔 Activar resumen de las 7:00</button>
    {info}
  </>)
}
