'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from '@/lib/push'

// Botón para activar los recordatorios PUSH (que suenan con la app cerrada). Suscribe este navegador
// y guarda la suscripción en el servidor; el cron /api/push/send manda el aviso a la hora del remindAt.
export default function PushReminders() {
  const [state, setState] = useState<'loading' | 'unsupported' | 'off' | 'on' | 'denied' | 'working'>('loading')

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setState(sub ? 'on' : 'off'))
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
  if (state === 'on') return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ ...pill, cursor: 'default', color: '#2E6E6E', borderColor: 'rgba(46,110,110,0.35)', background: 'rgba(46,110,110,0.06)' }}>🔔 Recordatorios activos ✓</span>
      <button onClick={disable} style={{ border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.45)', font: '600 11.5px var(--font-ui, system-ui)', cursor: 'pointer' }}>apagar</button>
    </span>
  )
  return <button onClick={enable} style={pill} title="Recibe los recordatorios de tus tareas aunque la app esté cerrada">🔔 Activar recordatorios</button>
}
