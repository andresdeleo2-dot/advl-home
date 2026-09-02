'use client'

import { useState, type CSSProperties } from 'react'

const PRESETS = [5, 10, 15, 30]

/** Botón "Tomar un break" — arranca un cronómetro (o uno con tiempo fijo) marcado como 'ocio', para
 *  que NO cuente como trabajado (Tiempo y Épicas ya excluyen esa área de los totales del día).
 *  Compartido entre Tiempo y Épicas: cada uno pasa su propio `onStart`, que arma la sesión con SU
 *  mecanismo (beginSession en Tiempo, focus.begin en Épicas) — el botón sólo decide los minutos. */
export default function BreakButton({ onStart }: { onStart: (minutes: number) => void }) {
  const [open, setOpen] = useState(false)
  const go = (min: number) => { onStart(min); setOpen(false) }
  const chip: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(46,142,110,0.4)', background: 'rgba(46,142,110,0.08)', color: '#2E6E5A', borderRadius: 9, padding: '9px 15px', font: '700 12.5px var(--font-ui, system-ui)', whiteSpace: 'nowrap' }
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(v => !v)} title="Registra un descanso — no cuenta como trabajado" style={chip}>☕ Tomar un break</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div onClick={ev => ev.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41, display: 'flex', flexWrap: 'wrap', gap: 6, width: 220, padding: 10, background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 12, boxShadow: '0 18px 34px -18px rgba(15,35,64,0.5)' }}>
            <span style={{ flexBasis: '100%', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.5)' }}>¿Cuánto tiempo?</span>
            {PRESETS.map(m => (
              <button key={m} onClick={() => go(m)} style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 700, border: '1px solid rgba(46,142,110,0.3)', background: '#fff', color: '#2E6E5A' }}>{m} min</button>
            ))}
            <button onClick={() => go(0)} style={{ flexBasis: '100%', marginTop: 2, cursor: 'pointer', borderRadius: 8, padding: '7px 11px', fontSize: 12.5, fontWeight: 700, border: 'none', background: '#2E6E5A', color: '#fff' }}>Libre — paro cuando quiera</button>
          </div>
        </>
      )}
    </div>
  )
}
