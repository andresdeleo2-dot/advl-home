'use client'

import { useEffect, useRef, useState } from 'react'
import QuoteWidget from './QuoteWidget'
import TimerWidget from './TimerWidget'
import WeatherWidget from './WeatherWidget'
import CalendarWidget from './CalendarWidget'
import MomentosWidget from './MomentosWidget'

/* Dropdown de widgets extra (clima ampliado, frase, temporizador) en el header */
export function WidgetsDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="band-glass band-glass-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>✦</span> Widgets
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="animate-fade" style={{ position: 'absolute', right: 0, zIndex: 40, marginTop: 8, width: 320, maxWidth: '86vw', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <WeatherWidget />
          <QuoteWidget />
          <TimerWidget />
        </div>
      )}
    </div>
  )
}

/* "Especiales": abre un modal centrado a pantalla completa con Calendario y Momentos (pestañas).
   Es un modal (no dropdown) para que el detalle del recuerdo —que es position:fixed— se abra
   grande y centrado y no lo recorte un contenedor con scroll (bug de Safari). */
export function SpecialsDropdown() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'cal' | 'momentos'>('cal')
  return (
    <>
      <button onClick={() => setOpen(true)} className="band-glass band-glass-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>❋</span> Especiales
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,22,42,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '44px 20px', overflow: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
            <button onClick={() => setOpen(false)} title="Cerrar" style={{ position: 'absolute', top: -16, right: -6, zIndex: 2, height: 34, width: 34, borderRadius: 99, border: 'none', background: '#10233F', color: '#fff', fontSize: 16, cursor: 'pointer', boxShadow: '0 8px 20px -8px rgba(8,18,36,.7)' }}>✕</button>
            <div style={{ display: 'flex', gap: 4, padding: 4, background: '#F6F4EE', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 12 }}>
              {([['cal', 'Calendario'], ['momentos', 'Momentos']] as [typeof tab, string][]).map(([k, label]) => {
                const on = tab === k
                return <button key={k} onClick={() => setTab(k)} style={{ flex: 1, cursor: 'pointer', border: 'none', borderRadius: 9, padding: '9px 0', fontSize: 13, fontWeight: 700, background: on ? '#fff' : 'transparent', color: on ? '#10233F' : 'rgba(20,35,61,0.5)', boxShadow: on ? '0 1px 2px rgba(15,35,64,0.12)' : 'none' }}>{label}</button>
              })}
            </div>
            {tab === 'cal' ? <CalendarWidget /> : <MomentosWidget />}
          </div>
        </div>
      )}
    </>
  )
}
