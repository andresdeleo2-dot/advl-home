'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { domingoDeSemana, type CuandoPaso } from '@/lib/siguientePaso'
import { fmtDue, todayISO } from './core'

/* "Siguiente paso" de una iniciativa: el prompt para convertir el plan en una tarea concreta, y
 * el marcador sutil que señala las iniciativas sin paso en chips, índices y barras. Cada pantalla
 * escribe con su propio mecanismo vía onCrear (Épicas con addTaskInline, Roadmap con su sync). */

const NAVY = '#14233D'
const NAVY2 = '#16365F'
const GOLD = '#C2933A'
const GOLD_D = '#A87A2C'

// Lo que inline no puede (hover, foco, móvil); React 19 lo sube al <head> una sola vez.
const SP_CSS = `
.sp-btn{transition:background .15s,border-color .15s,opacity .15s}
@media (hover:hover){
  .sp-btn--sec:hover{border-color:rgba(194,147,58,.6)!important;background:#FFFDF8!important}
  .sp-btn--pri:hover{background:#16365F!important}
}
.sp-btn:focus-visible{outline:2px solid #C2933A;outline-offset:2px}
.sp-input:focus{border-color:rgba(194,147,58,.7)!important;box-shadow:0 0 0 3px rgba(194,147,58,.14)}
@media (hover:hover){.sp-tap:hover{border-color:rgba(194,147,58,.75)!important;background:rgba(194,147,58,.12)!important}}
.sp-tap:focus-visible{outline:2px solid #C2933A;outline-offset:2px}
@media (max-width:640px){
  .sp-tap{min-height:36px!important}
  .sp-btns{width:100%}
  .sp-btns>.sp-btn{flex:1 1 0;min-height:36px!important}
  .sp-input{font-size:16px!important;min-height:38px}
}
`

/** Estilos compartidos (también los usa el aviso de la épica, .sp-tap, fuera del prompt). */
export function SiguientePasoStyles() {
  return <style href="advl-siguiente-paso" precedence="default">{SP_CSS}</style>
}

/** Lo que dura el "✓ Creada"; las pantallas mantienen el prompt montado ese tiempo tras crear. */
export const CREADA_MS = 1800

/** Marcador sutil "sin siguiente paso": círculo hueco dorado. */
export function MarcaSinPaso({ size = 7, color = GOLD, title = 'Sin siguiente paso', style }: { size?: number; color?: string; title?: string; style?: CSSProperties }) {
  return (
    <span role="img" aria-label={title} title={title}
      style={{ display: 'inline-block', width: size, height: size, borderRadius: 99, border: `1.5px solid ${color}`, boxSizing: 'border-box', flexShrink: 0, ...style }} />
  )
}

/** Ids recién resueltos: al crear el paso la iniciativa deja de estar "sin paso" y el prompt se
 *  desmontaría antes de enseñar el "✓ Creada"; esto lo deja montado CREADA_MS más. */
export function useRecienCreadas(ms = CREADA_MS) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const ts = timers.current
    return () => { ts.forEach(clearTimeout); ts.clear() }
  }, [])
  const marcar = useCallback((id: string) => {
    const prev = timers.current.get(id)
    if (prev) clearTimeout(prev)
    setIds(s => (s.has(id) ? s : new Set(s).add(id)))
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id)
      setIds(s => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n })
    }, ms))
  }, [ms])
  const tiene = useCallback((id: string) => ids.has(id), [ids])
  return { tiene, marcar }
}

type Props = {
  nombre: string
  /** Escribe la tarea. Devolver false = no se creó (el texto se queda para reintentar); una promesa
   *  que resuelve false = el alta optimista falló después (se quita el "✓ Creada"). */
  onCrear: (titulo: string, cuando: CuandoPaso) => boolean | void | Promise<boolean | void>
  /** Sólo cuando lo abrió un gesto (tocar el chip, el aviso…), nunca al montar solo. */
  autoFocus?: boolean
  /** Nombre de la iniciativa abierta que la bloquea: en vez del prompt, se dice a quién espera. */
  bloqueadaPor?: string | null
  /** id del input, para que la pantalla lo enfoque a mano si el prompt ya estaba montado. */
  inputId?: string
  hoy?: string
  style?: CSSProperties
}

export default function SiguientePaso({ nombre, onCrear, autoFocus, bloqueadaPor, inputId, hoy, style }: Props) {
  const [txt, setTxt] = useState('')
  const [creada, setCreada] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const altas = useRef(0)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (bloqueadaPor) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', borderRadius: 10, padding: '8px 11px', background: 'rgba(176,82,46,0.06)', border: '1px dashed rgba(176,82,46,0.3)', font: '600 12px var(--font-ui)', color: 'rgba(20,35,61,0.65)', ...style }}>
        <span aria-hidden style={{ color: '#B0522E' }}>⛓</span>
        <span><b style={{ color: '#B0522E', fontWeight: 800 }}>Bloqueada</b> · espera «{bloqueadaPor}»</span>
      </div>
    )
  }

  const dia = hoy || todayISO()
  const domingo = domingoDeSemana(dia)
  const vacio = !txt.trim()
  const crear = (cuando: CuandoPaso) => {
    const v = txt.trim()
    if (!v) { inputRef.current?.focus(); return }
    const r = onCrear(v, cuando)
    if (r === false) return
    setTxt('')
    setCreada(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCreada(false), CREADA_MS)
    const n = ++altas.current
    if (r instanceof Promise) void r.then(ok => { if (ok === false && altas.current === n) setCreada(false) })
  }
  const onKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    // Escape suelta el campo (conserva lo escrito) sin llegar a los Escape globales que cierran vistas.
    if (ev.key === 'Escape') { ev.stopPropagation(); ev.currentTarget.blur(); return }
    if (ev.key !== 'Enter' || ev.nativeEvent.isComposing) return
    ev.preventDefault()
    crear('hoy')
  }
  const btn = (pri: boolean): CSSProperties => ({
    cursor: 'pointer', minHeight: 32, borderRadius: 9, padding: '0 12px', whiteSpace: 'nowrap',
    font: '700 12px var(--font-ui)', opacity: vacio ? 0.55 : 1,
    border: pri ? `1px solid ${NAVY}` : '1px solid rgba(15,35,64,0.14)',
    background: pri ? NAVY : '#fff', color: pri ? '#fff' : NAVY2,
  })

  return (
    <div style={{ borderRadius: 12, padding: '10px 12px', background: 'rgba(194,147,58,0.06)', border: '1px dashed rgba(194,147,58,0.45)', fontFamily: 'var(--font-ui)', ...style }}>
      <SiguientePasoStyles />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 8, fontSize: 12.5, lineHeight: 1.4, color: 'rgba(20,35,61,0.7)' }}>
        <MarcaSinPaso size={8} style={{ position: 'relative', top: -1 }} />
        <span style={{ minWidth: 0 }}>
          <b style={{ color: NAVY2, fontWeight: 800 }}>{nombre}</b> no tiene siguiente paso.{' '}
          <span style={{ color: GOLD_D, fontWeight: 700 }}>¿Cuál es el primer paso?</span>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input ref={inputRef} id={inputId} className="sp-input" autoFocus={autoFocus} value={txt} onChange={ev => setTxt(ev.target.value)} onKeyDown={onKey}
          enterKeyHint="done" aria-label={`Primer paso de ${nombre}`} placeholder="Ej. Llamar a… / Revisar… (Enter = Hoy)"
          style={{ flex: '1 1 200px', minWidth: 0, minHeight: 32, border: '1px solid rgba(15,35,64,0.16)', borderRadius: 9, padding: '6px 10px', fontSize: 13, fontWeight: 600, color: NAVY2, background: '#fff', outline: 'none' }} />
        <div className="sp-btns" style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="sp-btn sp-btn--pri" onClick={() => crear('hoy')} title="Planearla para hoy" style={btn(true)}>Hoy</button>
          <button type="button" className="sp-btn sp-btn--sec" onClick={() => crear('semana')} title={`Sin día; vence el domingo ${fmtDue(domingo)}`} style={btn(false)}>Esta semana</button>
          <button type="button" className="sp-btn sp-btn--sec" onClick={() => crear('sin')} title="Sin fecha" style={btn(false)}>Sin fecha</button>
        </div>
      </div>
      <div role="status" aria-live="polite" style={{ minHeight: creada ? 16 : 0, marginTop: creada ? 6 : 0, font: '700 11.5px var(--font-ui)', color: '#2E6E6E' }}>
        {creada ? '✓ Creada' : ''}
      </div>
    </div>
  )
}

