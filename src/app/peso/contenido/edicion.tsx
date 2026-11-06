'use client'

// Edición en la propia página de la rutina, la dieta y el plan. Un documento es un JSON; las vistas lo pintan y, en modo
// edición, cada texto se vuelve un campo ligado a su «ruta» dentro del documento (['secciones', 2, 'titulo']). Cada
// cambio clona el documento, aplica el cambio y avisa al contenedor (que guarda el borrador). Las MISMAS vistas
// sirven para leer y para editar: no hay una pantalla de edición aparte que pueda quedar desfasada de la de lectura.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'
import type { Doc } from '@/lib/peso-contenido'
import { COLOR } from '../ui'

export type Ruta = (string | number)[]
type Nodo = Record<string | number, unknown>

/** Lee el valor en `ruta` (undefined si algún tramo no existe). */
export function leer(raiz: unknown, ruta: Ruta): unknown {
  let cur: unknown = raiz
  for (const k of ruta) { if (cur == null || typeof cur !== 'object') return undefined; cur = (cur as Nodo)[k] }
  return cur
}
const nodo = (raiz: unknown, ruta: Ruta): Nodo => { let cur = raiz as Nodo; for (const k of ruta) cur = cur[k] as Nodo; return cur }

type Ctx = {
  doc: Doc
  editando: boolean
  poner: (ruta: Ruta, v: unknown) => void
  agregar: (ruta: Ruta, item: unknown) => void
  quitar: (ruta: Ruta, i: number) => void
  mover: (ruta: Ruta, i: number, dir: -1 | 1) => void
}
const Contexto = createContext<Ctx | null>(null)
export function useDoc(): Ctx {
  const c = useContext(Contexto)
  if (!c) throw new Error('useDoc fuera de ProveedorDoc')
  return c
}

export function ProveedorDoc({ doc, editando, onCambio, children }: { doc: Doc; editando: boolean; onCambio: (d: Doc) => void; children: ReactNode }) {
  // El documento «más reciente» vive en un ref para que dos cambios en el mismo instante se compongan (no se pisen).
  const ref = useRef(doc)
  ref.current = doc
  const aplicar = useCallback((fn: (d: Nodo) => void) => {
    const nuevo = JSON.parse(JSON.stringify(ref.current)) as Nodo
    fn(nuevo)
    ref.current = nuevo as unknown as Doc
    onCambio(ref.current)
  }, [onCambio])

  const valor = useMemo<Ctx>(() => ({
    doc, editando,
    poner: (ruta, v) => aplicar(d => { nodo(d, ruta.slice(0, -1))[ruta[ruta.length - 1]] = v }),
    // Si la lista aún no existe (una tarjeta sin viñetas, p. ej.) se crea.
    agregar: (ruta, item) => aplicar(d => {
      const padre = nodo(d, ruta.slice(0, -1)); const k = ruta[ruta.length - 1]
      if (!Array.isArray(padre[k])) padre[k] = []
      ;(padre[k] as unknown[]).push(item)
    }),
    quitar: (ruta, i) => aplicar(d => { (nodo(d, ruta) as unknown as unknown[]).splice(i, 1) }),
    mover: (ruta, i, dir) => aplicar(d => {
      const a = nodo(d, ruta) as unknown as unknown[]
      const j = i + dir
      if (j < 0 || j >= a.length) return
      ;[a[i], a[j]] = [a[j], a[i]]
    }),
  }), [doc, editando, aplicar])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

// ── Campos ──────────────────────────────────────────────────────────────────

const CAMPO = 'w-full rounded-lg border bg-white px-2.5 py-1.5 text-[13.5px] leading-snug max-sm:text-base focus:outline-none focus:border-[#8A6420] focus:ring-2 focus:ring-[#8A6420]/40'
const BORDE_CAMPO: CSSProperties = { borderColor: COLOR.lineStrong, color: COLOR.ink }

/** Rótulo pequeño sobre un campo (solo en edición). */
function Etq({ t, children, className = '' }: { t?: string; children: ReactNode; className?: string }) {
  if (!t) return <div className={className}>{children}</div>
  return (
    <label className={`block ${className}`}>
      <span className="block mb-0.5" style={{ font: '700 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: COLOR.muted }}>{t}</span>
      {children}
    </label>
  )
}

/** Texto: se pinta como `as` al leer (nada si está vacío) y es un campo al editar. */
export function T({ ruta, as = 'span', multi = false, etq, ph, className, style, vacio }: {
  ruta: Ruta; as?: ElementType; multi?: boolean; etq?: string; ph?: string; className?: string; style?: CSSProperties; vacio?: string
}) {
  const { doc, editando, poner } = useDoc()
  const v = String(leer(doc, ruta) ?? '')
  if (!editando) {
    if (!v && !vacio) return null
    const Tag = as
    return <Tag className={className} style={style}>{v || vacio}</Tag>
  }
  const comun = { value: v, 'aria-label': etq ?? ph, placeholder: ph, className: CAMPO, style: BORDE_CAMPO, onChange: (e: { target: { value: string } }) => poner(ruta, e.target.value) }
  return (
    <Etq t={etq}>
      {multi
        ? <textarea {...comun} rows={Math.min(10, Math.max(2, Math.ceil(v.length / 60) + (v.match(/\n/g)?.length ?? 0)))} />
        : <input {...comun} type="text" />}
    </Etq>
  )
}

const aNumero = (s: string): number | null => { const t = s.trim().replace(',', '.'); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null }

/** Número (solo editable; al leer no pinta nada: cada vista da formato a su manera). */
export function N({ ruta, etq, ph, className }: { ruta: Ruta; etq?: string; ph?: string; className?: string }) {
  const { doc, editando, poner } = useDoc()
  const valor = Number(leer(doc, ruta) ?? 0)
  const [txt, setTxt] = useState(String(valor))
  // Si el valor cambia desde fuera (reordenar, quitar una fila) el campo lo sigue; al teclear no se pisa lo escrito.
  useEffect(() => { if (aNumero(txt) !== valor) setTxt(String(valor)) }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!editando) return null
  return (
    <Etq t={etq} className={className}>
      <input type="text" inputMode="decimal" value={txt} placeholder={ph} aria-label={etq ?? ph} className={CAMPO} style={BORDE_CAMPO}
        onChange={e => { setTxt(e.target.value); const n = aNumero(e.target.value); if (n !== null) poner(ruta, n) }} />
    </Etq>
  )
}

export function Fecha({ ruta, etq, className }: { ruta: Ruta; etq?: string; className?: string }) {
  const { doc, editando, poner } = useDoc()
  if (!editando) return null
  return (
    <Etq t={etq} className={className}>
      <input type="date" value={String(leer(doc, ruta) ?? '')} aria-label={etq} className={CAMPO} style={BORDE_CAMPO} onChange={e => poner(ruta, e.target.value)} />
    </Etq>
  )
}

export function Sel({ ruta, etq, opciones, className, alCambiar }: { ruta: Ruta; etq?: string; opciones: { v: string; t: string }[]; className?: string; alCambiar?: (v: string) => void }) {
  const { doc, editando, poner } = useDoc()
  if (!editando) return null
  return (
    <Etq t={etq} className={className}>
      <select value={String(leer(doc, ruta) ?? '')} aria-label={etq} className={CAMPO} style={BORDE_CAMPO}
        onChange={e => { poner(ruta, e.target.value); alCambiar?.(e.target.value) }}>
        {opciones.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </Etq>
  )
}

export function Chk({ ruta, etq }: { ruta: Ruta; etq: string }) {
  const { doc, editando, poner } = useDoc()
  if (!editando) return null
  return (
    <label className="inline-flex items-center gap-2 min-h-10 text-[13px]" style={{ color: COLOR.ink }}>
      <input type="checkbox" checked={leer(doc, ruta) === true} onChange={e => poner(ruta, e.target.checked ? true : undefined)} className="h-4 w-4 accent-[#8A6420]" />
      {etq}
    </label>
  )
}

// ── Controles de lista ──────────────────────────────────────────────────────

const BOTON_CTL = 'inline-flex items-center justify-center rounded-lg border min-w-9 min-h-9 text-[13px] font-bold disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8A6420]'

/** ↑ ↓ ✕ de un elemento de una lista (solo en edición). */
export function Ctl({ ruta, i, n, soloQuitar = false, quitarTxt = 'Quitar' }: { ruta: Ruta; i: number; n: number; soloQuitar?: boolean; quitarTxt?: string }) {
  const { editando, mover, quitar } = useDoc()
  if (!editando) return null
  return (
    <span className="inline-flex shrink-0 gap-1">
      {!soloQuitar && <>
        <button type="button" aria-label="Subir" title="Subir" disabled={i === 0} onClick={() => mover(ruta, i, -1)} className={BOTON_CTL} style={{ borderColor: COLOR.lineStrong, background: '#fff', color: COLOR.ink }}>↑</button>
        <button type="button" aria-label="Bajar" title="Bajar" disabled={i >= n - 1} onClick={() => mover(ruta, i, 1)} className={BOTON_CTL} style={{ borderColor: COLOR.lineStrong, background: '#fff', color: COLOR.ink }}>↓</button>
      </>}
      <button type="button" aria-label={quitarTxt} title={quitarTxt} onClick={() => quitar(ruta, i)} className={BOTON_CTL} style={{ borderColor: '#FECACA', background: '#fff', color: '#B91C1C' }}>✕</button>
    </span>
  )
}

/** «+ Agregar …»: mete `item` (o lo que devuelva la función) al final de la lista en `ruta` (solo en edición). */
export function Agregar({ ruta, item, texto, className = '' }: { ruta: Ruta; item: unknown | (() => unknown); texto: string; className?: string }) {
  const { editando, agregar } = useDoc()
  if (!editando) return null
  return (
    <button type="button" onClick={() => agregar(ruta, typeof item === 'function' ? (item as () => unknown)() : item)}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 min-h-10 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8A6420] ${className}`}
      style={{ borderColor: COLOR.gold, color: COLOR.goldText, background: 'rgba(194,147,58,.07)' }}>
      <span aria-hidden>＋</span>{texto}
    </button>
  )
}

/** Lista de textos sueltos (chips, viñetas, opciones): un campo por elemento. Solo en edición. */
export function ListaStr({ ruta, etq, ph = 'Texto', agregarTxt = 'Agregar' }: { ruta: Ruta; etq?: string; ph?: string; agregarTxt?: string }) {
  const { doc, editando, poner } = useDoc()
  if (!editando) return null
  const items = (leer(doc, ruta) as string[] | undefined) ?? []
  return (
    <div>
      {etq && <span className="block mb-0.5" style={{ font: '700 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: COLOR.muted }}>{etq}</span>}
      <ul className="space-y-1.5">
        {items.map((_, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <input type="text" value={items[i]} placeholder={ph} aria-label={`${etq ?? ph} ${i + 1}`} className={CAMPO} style={BORDE_CAMPO}
              onChange={e => poner([...ruta, i], e.target.value)} />
            <Ctl ruta={ruta} i={i} n={items.length} />
          </li>
        ))}
      </ul>
      <Agregar ruta={ruta} item="" texto={agregarTxt} className="mt-1.5" />
    </div>
  )
}

/** Tarjeta de formulario de un elemento (solo en edición): rótulo, controles y el contenido. */
export function CajaEd({ titulo, ctl, children }: { titulo: ReactNode; ctl?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl p-3 space-y-2.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.lineStrong}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate" style={{ font: '800 11px/1.2 var(--font-ui, system-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.goldText }}>{titulo}</span>
        {ctl}
      </div>
      {children}
    </div>
  )
}
