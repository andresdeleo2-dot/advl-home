'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/* Widget de cumpleaños del header: el más próximo se ve sin picar nada;
   al picarlo, dropdown con los que vienen y link al archivo de Personas de mi-vida.
   Lee /api/cumples (tabla `personas` de la Supabase compartida). */

const PERSONAS_URL = 'https://mi-vida-neon.vercel.app/vida?vista=personas'
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

type PersonaCumple = { id: string; nombre: string; apodo: string | null; cumple: string }
type Prox = { id: string; nombre: string; days: number; dia: number; mes: number; cumpleAños: number }

export default function CumplesWidget() {
  const [personas, setPersonas] = useState<PersonaCumple[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/cumples')
      .then(r => r.json())
      .then(j => { if (alive && j?.ok) setPersonas(j.personas) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const lista = useMemo<Prox[]>(() => {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0)
    return personas.map(p => {
      const parts = (p.cumple || '').split('-').map(Number)
      const m = parts[1], d = parts[2]
      if (!m || !d) return null
      let next = new Date(hoy.getFullYear(), m - 1, d, 12)
      if (next.getTime() < hoy.getTime() - 43200000) next = new Date(hoy.getFullYear() + 1, m - 1, d, 12)
      const days = Math.round((next.getTime() - hoy.getTime()) / 86400000)
      return { id: p.id, nombre: p.apodo?.trim() || p.nombre, days, dia: d, mes: m - 1, cumpleAños: next.getFullYear() - parts[0] }
    }).filter((x): x is Prox => !!x).sort((a, b) => a.days - b.days)
  }, [personas])

  if (!lista.length) return null
  const prox = lista[0]
  const hoyMismo = prox.days === 0
  const rel = (d: number) => (d === 0 ? '¡hoy! 🎉' : d === 1 ? 'mañana' : `en ${d}d`)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} title="Cumpleaños próximos"
        className={hoyMismo ? undefined : 'band-glass band-glass-hover'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '8px 12px',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          ...(hoyMismo
            ? { background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305', border: 'none', boxShadow: '0 8px 16px -8px rgba(194,147,58,.85)' }
            : { color: 'rgba(255,255,255,0.85)' }),
        }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>🎂</span>
        <span style={{ fontWeight: 700 }}>{prox.nombre}</span>
        <span style={{ opacity: 0.8 }}>· {prox.days <= 14 ? rel(prox.days) : `${prox.dia} ${MES3[prox.mes]}`}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="animate-fade" style={{ position: 'absolute', right: 0, zIndex: 40, marginTop: 8, width: 310, maxWidth: '86vw', background: '#10233F', border: '1px solid rgba(200,162,76,.4)', borderRadius: 14, boxShadow: '0 24px 60px -16px rgba(8,18,36,.8)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 15px 9px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: '#C8A24C', borderBottom: '1px solid rgba(255,255,255,.09)' }}>
            🎂 Cumpleaños que vienen
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', padding: '6px 0' }}>
            {lista.slice(0, 12).map(c => (
              <a key={c.id} href={PERSONAS_URL} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 15px', textDecoration: 'none', background: c.days === 0 ? 'rgba(200,162,76,.16)' : 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = c.days === 0 ? 'rgba(200,162,76,.22)' : 'rgba(255,255,255,.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = c.days === 0 ? 'rgba(200,162,76,.16)' : 'transparent' }}>
                <span style={{ flex: 'none', width: 44, fontSize: 11, fontWeight: 800, color: '#E7C56B', fontVariantNumeric: 'tabular-nums' }}>{c.dia} {MES3[c.mes]}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: '#F3EFE6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'rgba(243,239,230,.5)' }}>cumple {c.cumpleAños}</span>
                </span>
                <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: c.days <= 7 ? '#FFB4A2' : 'rgba(243,239,230,.55)' }}>{rel(c.days)}</span>
              </a>
            ))}
          </div>
          <a href={PERSONAS_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', padding: '11px 15px', borderTop: '1px solid rgba(255,255,255,.09)', background: 'rgba(200,162,76,.1)', color: '#E7C56B', fontSize: 12.5, fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>
            Ver todos en Personas →
          </a>
        </div>
      )}
    </div>
  )
}
