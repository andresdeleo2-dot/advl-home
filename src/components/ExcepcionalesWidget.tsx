'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/* Widget de momentos excepcionales (fechas a recordar) del header:
   recuerdos de mi-vida marcados con ✦ que tienen fecha — su aniversario regresa
   cada año. El más próximo se ve sin picar nada; al picarlo, dropdown con los
   que vienen (cada uno abre ese recuerdo en mi-vida) + link a Personas.
   Lee /api/momentos (ya existente; incluye outstanding y personas). */

const VIDA_URL = 'https://mi-vida-neon.vercel.app/vida'
const PERSONAS_URL = `${VIDA_URL}?vista=personas`
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

type Momento = { id: number; titulo: string; fecha: string | null; outstanding: boolean; recordar?: boolean | null; personas: string[] | null }
type Prox = { id: number; titulo: string; personas: string[]; days: number; dia: number; mes: number; años: number }

export default function ExcepcionalesWidget() {
  const [momentos, setMomentos] = useState<Momento[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/momentos')
      .then(r => r.json())
      .then(j => { if (alive && j?.ok) setMomentos(j.recuerdos ?? []) })
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
    return momentos.map(m => {
      if (!m.fecha || !(m.recordar === true || (m.recordar !== false && m.outstanding))) return null
      const parts = m.fecha.split('-').map(Number)
      const y = parts[0], mm = parts[1], d = parts[2]
      if (!y || !mm || !d) return null
      let next = new Date(hoy.getFullYear(), mm - 1, d, 12)
      if (next.getTime() < hoy.getTime() - 43200000) next = new Date(hoy.getFullYear() + 1, mm - 1, d, 12)
      const days = Math.round((next.getTime() - hoy.getTime()) / 86400000)
      return { id: m.id, titulo: m.titulo, personas: m.personas ?? [], days, dia: d, mes: mm - 1, años: next.getFullYear() - y }
    }).filter((x): x is Prox => !!x).sort((a, b) => a.days - b.days)
  }, [momentos])

  if (!lista.length) return null
  const prox = lista[0]
  const hoyMismo = prox.days === 0
  const rel = (d: number) => (d === 0 ? '¡hoy! 🎉' : d === 1 ? 'mañana' : `en ${d}d`)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} title="Fechas a recordar (momentos ✦)"
        className={hoyMismo ? undefined : 'band-glass band-glass-hover'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '8px 12px',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: 230,
          ...(hoyMismo
            ? { background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305', border: 'none', boxShadow: '0 8px 16px -8px rgba(194,147,58,.85)' }
            : { color: 'rgba(255,255,255,0.85)' }),
        }}>
        <span style={{ fontSize: 13, lineHeight: 1, color: hoyMismo ? '#1B1305' : '#E7C56B' }}>✦</span>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700 }}>{prox.titulo}</span>
        <span style={{ flex: 'none', opacity: 0.8 }}>· {prox.days <= 14 ? rel(prox.days) : `${prox.dia} ${MES3[prox.mes]}`}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: 'none', opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="animate-fade" style={{ position: 'absolute', right: 0, zIndex: 40, marginTop: 8, width: 330, maxWidth: '86vw', background: '#10233F', border: '1px solid rgba(200,162,76,.4)', borderRadius: 14, boxShadow: '0 24px 60px -16px rgba(8,18,36,.8)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 15px 9px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: '#C8A24C', borderBottom: '1px solid rgba(255,255,255,.09)' }}>
            🔔 Fechas a recordar
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', padding: '6px 0' }}>
            {lista.slice(0, 12).map(c => (
              <a key={c.id} href={`${VIDA_URL}?r=${c.id}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 15px', textDecoration: 'none', background: c.days === 0 ? 'rgba(200,162,76,.16)' : 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = c.days === 0 ? 'rgba(200,162,76,.22)' : 'rgba(255,255,255,.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = c.days === 0 ? 'rgba(200,162,76,.16)' : 'transparent' }}>
                <span style={{ flex: 'none', width: 44, fontSize: 11, fontWeight: 800, color: '#E7C56B', fontVariantNumeric: 'tabular-nums' }}>{c.dia} {MES3[c.mes]}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: '#F3EFE6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.titulo}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'rgba(243,239,230,.5)' }}>{c.personas.length ? `con ${c.personas.slice(0, 2).join(', ')}${c.personas.length > 2 ? '…' : ''} · ` : ''}{c.años} año{c.años === 1 ? '' : 's'}</span>
                </span>
                <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: c.days <= 7 ? '#FFB4A2' : 'rgba(243,239,230,.55)' }}>{rel(c.days)}</span>
              </a>
            ))}
          </div>
          <a href={PERSONAS_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', padding: '11px 15px', borderTop: '1px solid rgba(255,255,255,.09)', background: 'rgba(200,162,76,.1)', color: '#E7C56B', fontSize: 12.5, fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>
            Ver todas en Personas →
          </a>
        </div>
      )}
    </div>
  )
}
