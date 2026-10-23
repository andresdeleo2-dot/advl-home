'use client'

// La biblioteca: una tira horizontal de tarjetas (se desliza con el dedo; en escritorio, con flechas).
// Mantiene visible la tarjeta seleccionada y no obliga a bajar mucho para llegar al visor.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PesoPlanMeta } from '@/lib/peso-planes'
import { COLOR, Eyebrow } from '../ui'
import { FOCO, Icono, type Ocupado } from './comun'
import TarjetaPlan from './TarjetaPlan'

export default function Biblioteca({ lista, selId, hoy, ocupado, onSel, onProyectar, onMarcarEnUso }: {
  lista: PesoPlanMeta[]
  selId: string | null
  hoy: string | null
  ocupado: Ocupado | null
  onSel: (id: string) => void
  onProyectar: (id: string) => void
  onMarcarEnUso: (id: string) => void
}) {
  const rail = useRef<HTMLUListElement>(null)
  const [fl, setFl] = useState({ hay: false, izq: false, der: false })
  const primera = useRef(true)

  const medir = useCallback(() => {
    const r = rail.current
    if (!r) return
    const max = r.scrollWidth - r.clientWidth
    const n = { hay: max > 4, izq: r.scrollLeft > 4, der: r.scrollLeft < max - 4 }
    setFl(p => (p.hay === n.hay && p.izq === n.izq && p.der === n.der ? p : n))
  }, [])

  useEffect(() => {
    medir()
    const r = rail.current
    if (!r || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(r)
    return () => ro.disconnect()
  }, [medir, lista.length])

  // Si la tarjeta seleccionada quedó fuera de la tira (p. ej. recién subida), se desliza hasta ella.
  // Solo mueve la tira, nunca la página.
  useEffect(() => {
    const r = rail.current
    if (!r || !selId) return
    const li = Array.from(r.children).find(n => (n as HTMLElement).dataset.planId === selId) as HTMLElement | undefined
    if (!li) return
    const sinAnimar = primera.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    primera.current = false
    if (li.offsetLeft >= r.scrollLeft && li.offsetLeft + li.offsetWidth <= r.scrollLeft + r.clientWidth) return
    r.scrollTo({ left: Math.max(0, li.offsetLeft - (r.clientWidth - li.offsetWidth) / 2), behavior: sinAnimar ? 'auto' : 'smooth' })
  }, [selId])

  function deslizar(dir: -1 | 1) {
    const r = rail.current
    if (!r) return
    const sinAnimar = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    r.scrollBy({ left: dir * r.clientWidth * 0.8, behavior: sinAnimar ? 'auto' : 'smooth' })
  }

  const FLECHA = `inline-flex items-center justify-center w-10 h-10 rounded-lg border bg-white transition-colors disabled:opacity-35 disabled:cursor-not-allowed enabled:hover:border-[var(--gold-500)] ${FOCO}`

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5 min-h-10">
        <Eyebrow color={COLOR.muted}>{lista.length} {lista.length === 1 ? 'documento' : 'documentos'}</Eyebrow>
        {fl.hay && (
          <div className="hidden sm:flex items-center gap-1.5">
            <button type="button" onClick={() => deslizar(-1)} disabled={!fl.izq} aria-label="Ver documentos anteriores" className={FLECHA} style={{ borderColor: COLOR.line, color: COLOR.navy2 }}><Icono n="izq" /></button>
            <button type="button" onClick={() => deslizar(1)} disabled={!fl.der} aria-label="Ver más documentos" className={FLECHA} style={{ borderColor: COLOR.line, color: COLOR.navy2 }}><Icono n="der" /></button>
          </div>
        )}
      </div>
      <ul
        ref={rail}
        onScroll={medir}
        aria-label="Documentos de la biblioteca"
        className="pp-rail relative flex items-stretch gap-3 overflow-x-auto snap-x snap-mandatory overscroll-x-contain -mx-5 sm:-mx-6 px-5 sm:px-6 pt-1 pb-3 scroll-px-5 sm:scroll-px-6"
      >
        {lista.map(p => (
          <li key={p.id} data-plan-id={p.id} className="snap-start shrink-0 flex w-[17.25rem] sm:w-[19rem]">
            <TarjetaPlan
              plan={p}
              seleccionado={p.id === selId}
              hoy={hoy}
              bloqueado={!!ocupado}
              marcando={ocupado?.accion === 'uso' && ocupado.id === p.id}
              onSeleccionar={() => onSel(p.id)}
              onProyectar={() => onProyectar(p.id)}
              onMarcarEnUso={() => onMarcarEnUso(p.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
