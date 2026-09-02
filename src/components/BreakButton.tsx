'use client'

import { useState, type CSSProperties } from 'react'

const PRESETS = [5, 10, 15, 30]
const DRIVE_URL = 'https://drive.google.com/file/d/1lEcxA-Wnsp7rqkgyR3hvX9DWpbfvrjSj/view?usp=drive_link'

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
            <div style={{ flexBasis: '100%', height: 1, background: 'rgba(15,35,64,0.08)', margin: '4px 0 2px' }} />
            <a href={DRIVE_URL} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}
              style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', borderRadius: 8, padding: '7px 9px', border: '1px solid rgba(15,35,64,0.1)', background: '#fff' }}>
              <svg width="15" height="15" viewBox="0 0 87.3 78" style={{ flexShrink: 0 }}>
                <path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
                <path fill="#00ac47" d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 47.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" />
                <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 56.5c.8-1.4 1.2-2.95 1.2-4.5H59.798l5.852 11.5z" />
                <path fill="#00832d" d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" />
                <path fill="#2684fc" d="M59.8 52H27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
                <path fill="#ffba00" d="M73.4 26.5L60.6 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.55 25l16.25 27H87.3c0-1.55-.4-3.1-1.2-4.5z" />
              </svg>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: '#16365F' }}>Abrir Google Drive</span>
              <span style={{ fontSize: 13, color: 'rgba(20,35,61,0.35)' }}>↗</span>
            </a>
          </div>
        </>
      )}
    </div>
  )
}
