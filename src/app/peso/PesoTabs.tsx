'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { PESO_TABS, type PesoTab } from './contratos'
import { COLOR } from './ui'

// Barra de pestañas de /peso: pegajosa al tope con desenfoque (el contenido se difumina al pasar
// por debajo), con scroll horizontal en móvil y el patrón ARIA de tabs (flechas, Home/End, foco
// itinerante). Solo la pestaña activa monta su contenido (lo decide el padre).

/** Dorado para TEXTO sobre fondo claro (contraste AA): el del sistema de diseño, sin copia local. */
const DORADO_TEXTO = COLOR.goldText

/** Texto para lector de pantalla de la insignia, con singular correcto. Para lo subido a la biblioteca se dice «rutina o
 *  dieta» (como el nombre de la pestaña), no «plan» ni «archivo». */
function unidadContador(t: PesoTab, n: number): string {
  if (t === 'historial') return n === 1 ? ' medición' : ' mediciones'
  if (t === 'planes') return n === 1 ? ' rutina o dieta' : ' rutinas o dietas'
  return ''   // Resumen, Progreso y Mi perfil no llevan contador
}

export const tabId = (t: PesoTab) => `peso-tab-${t}`
export const panelId = (t: PesoTab) => `peso-panel-${t}`

// Oculta la barra de scroll horizontal (el CSS global estiliza *::-webkit-scrollbar y se vería una
// franja bajo las pestañas en escritorio) y da el foco visible de la marca.
const CSS = `
.peso-tabs-scroll{scrollbar-width:none}
.peso-tabs-scroll::-webkit-scrollbar{display:none}
.peso-tab:focus-visible{outline:2px solid ${COLOR.gold};outline-offset:-2px;border-radius:12px}
`

export default function PesoTabs({ tab, onChange, contadores, avisos }: {
  tab: PesoTab
  onChange: (t: PesoTab) => void
  /** Número que va como insignia junto a la etiqueta (Historial N, Rutinas y dietas M). */
  contadores?: Partial<Record<PesoTab, number>>
  /** Punto dorado junto a la etiqueta para algo pendiente (p. ej. «Mi perfil» sin completar). El texto se lee solo
   *  con lector de pantalla: el punto es decorativo. */
  avisos?: Partial<Record<PesoTab, string>>
}) {
  const scRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [bordes, setBordes] = useState({ izq: false, der: false })

  const medirBordes = useCallback(() => {
    const sc = scRef.current
    if (!sc) return
    const izq = sc.scrollLeft > 4
    const der = sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 4
    setBordes(b => (b.izq === izq && b.der === der ? b : { izq, der }))
  }, [])

  // Lleva la pestaña activa al centro de la franja (solo scrollLeft: scrollIntoView movería la página).
  useEffect(() => {
    const sc = scRef.current
    const idx = PESO_TABS.findIndex(t => t.id === tab)
    const el = tabRefs.current[idx]
    if (!sc || !el) return
    const reducir = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const destino = Math.max(0, el.offsetLeft - (sc.clientWidth - el.offsetWidth) / 2)
    sc.scrollTo({ left: destino, behavior: reducir ? 'auto' : 'smooth' })
  }, [tab])

  useEffect(() => {
    medirBordes()
    const sc = scRef.current
    if (!sc) return
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medirBordes) : null
    ro?.observe(sc)
    window.addEventListener('resize', medirBordes)
    return () => { ro?.disconnect(); window.removeEventListener('resize', medirBordes) }
  }, [medirBordes, contadores])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const n = PESO_TABS.length
    const i = PESO_TABS.findIndex(t => t.id === tab)
    let destino = -1
    if (e.key === 'ArrowRight') destino = (i + 1) % n
    else if (e.key === 'ArrowLeft') destino = (i - 1 + n) % n
    else if (e.key === 'Home') destino = 0
    else if (e.key === 'End') destino = n - 1
    if (destino < 0) return
    e.preventDefault()
    onChange(PESO_TABS[destino].id)
    tabRefs.current[destino]?.focus()
  }

  // Degradado en los bordes solo cuando hay más pestañas fuera de vista.
  const mascara = bordes.izq || bordes.der
    ? `linear-gradient(to right, transparent 0, #000 ${bordes.izq ? 22 : 0}px, #000 calc(100% - ${bordes.der ? 30 : 0}px), transparent 100%)`
    : undefined

  const lista = (
    <div
      ref={scRef}
      role="tablist"
      aria-label="Secciones de Peso"
      onKeyDown={onKeyDown}
      onScroll={medirBordes}
      className="peso-tabs-scroll relative flex gap-1 overflow-x-auto"
      style={{ WebkitMaskImage: mascara, maskImage: mascara }}
    >
      {PESO_TABS.map((t, i) => {
        const on = t.id === tab
        const n = contadores?.[t.id]
        const aviso = avisos?.[t.id]
        return (
          <button
            key={t.id}
            ref={el => { tabRefs.current[i] = el }}
            id={tabId(t.id)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId(t.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className="peso-tab relative shrink-0 inline-flex items-center gap-2 px-3.5 sm:px-4 min-h-[48px] whitespace-nowrap transition-colors"
            style={{ fontSize: 14, fontWeight: on ? 700 : 600, color: on ? COLOR.navy : COLOR.muted }}
          >
            <span aria-hidden style={{ fontSize: 15, filter: on ? 'none' : 'grayscale(1)', opacity: on ? 1 : 0.65, transition: 'opacity .15s' }}>{t.icon}</span>
            {t.label}
            {n != null && (
              <span
                className="tabular-nums"
                style={{
                  fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                  background: on ? `${COLOR.gold}2b` : 'rgba(15,35,64,0.07)',
                  color: on ? DORADO_TEXTO : COLOR.muted,
                }}
              >
                {n}<span className="sr-only">{unidadContador(t.id, n)}</span>
              </span>
            )}
            {aviso && (
              <>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: COLOR.gold, marginLeft: -2 }} />
                <span className="sr-only">, {aviso}</span>
              </>
            )}
            {/* Indicador dorado de la pestaña activa */}
            <span
              aria-hidden
              className="absolute left-3 right-3 bottom-0 rounded-t-full"
              style={{ height: 3, background: `linear-gradient(90deg, ${COLOR.goldLight}, ${COLOR.gold})`, opacity: on ? 1 : 0, transform: on ? 'scaleX(1)' : 'scaleX(.4)', transition: 'opacity .18s, transform .18s' }}
            />
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      id="peso-tabs"
      className="sticky top-0 z-30 -mx-4 px-4"
      style={{
        background: 'rgba(246,244,238,0.86)',
        backdropFilter: 'blur(14px) saturate(1.15)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.15)',
      }}
    >
      <style>{CSS}</style>
      {/* El filete va en un contenedor interno para alinearse con el borde de las tarjetas, no con el de la pantalla */}
      <div style={{ borderBottom: `1px solid ${COLOR.line}` }}>{lista}</div>
    </div>
  )
}
