'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Epica, EpicaTask } from '@/lib/supabase'
import { ARCHIVED, PrioBars, addDays, addMonths, dateLabel, dayNum, fmtDue, hexA, mondayISO, monthGrid, plazoLabel, popoverStyle, prioFromDue, taskStyle, weekRangeLabel } from '@/components/epicas/core'
import { enOrden } from '@/lib/ordenTareas'
import { alcanceDe } from '@/lib/alcanceTareas'
import { diasDeTarea, estMinDia, ordenarDia, parcheAgendar, parcheQuitar, ubicarEnDia, type EntradaDia, type ParcheTarea } from '@/lib/planTarea'

/* ═══════════════════════════════════════════════════════════════════════════
   /roadmap · vista "Calendario" — las tareas de cada épica/feature/iniciativa sobre un calendario
   (día · semana · mes). A la izquierda, "Por agendar": lo que no tiene fecha y lo que ya se atrasó.
   Se ARRASTRA una tarea a un día para fijar cuándo se hace (`plan`, el "Hacer" de Épicas) y se suelta
   entre otras para fijar el ORDEN de ese día (`planOrder`). Arrastrar a "Por agendar" le quita la fecha.
   Las reglas de agendado son las de Épicas (lib/planTarea); aquí sólo se decide QUÉ se mueve y dónde.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ZoomCal = 'dia' | 'semana' | 'mes'

type Props = {
  /** TODAS las épicas: el orden de un día cruza épicas, así que se calcula con todas aunque se filtre. */
  epicas: Epica[]
  /** Las que pasan el filtro de archivadas (las que se muestran). */
  lista: Epica[]
  epicaFilter: string
  featureFilter: string
  iniFilter: string
  today: string
  planHistReady: boolean
  zoom: ZoomCal
  setZoom: (z: ZoomCal) => void
  ancla: string
  setAncla: (d: string) => void
  narrow: boolean
  onAbrir: (epicaId: string, taskId: string) => void
  /** Escribe los parches (un POST por épica). `msg` = aviso con «Deshacer». */
  onAplicar: (items: ParcheTarea[], msg?: string) => void
}

type Item = { e: Epica; t: EpicaTask; key: string }
type Entrada = { it: Item; sesion: boolean }
type Variante = 'bandeja' | 'mes' | 'semana' | 'dia'
type Sobre = { dia: string; antes: string | null }

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 14 }
const eb: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.62)' }
const navBtn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 9, padding: '6px 11px', fontSize: 12.5, fontWeight: 700, color: '#16365F', fontFamily: 'var(--font-ui)' }
const chipBtn = (on: boolean): CSSProperties => ({
  cursor: 'pointer', borderRadius: 99, padding: '5px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-ui)',
  border: on ? '1px solid transparent' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#F3EFE6' : 'rgba(20,35,61,0.62)',
})
const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DIA_LLENO_MIN = 8 * 60
const fmtHoras = (min: number): string => { const h = min / 60; return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} h` }
const etiquetaDia = (d: string): string => new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
const esFinde = (d: string) => { const g = new Date(d + 'T00:00:00').getDay(); return g === 0 || g === 6 }

export default function CalendarioRoadmap({ epicas, lista, epicaFilter, featureFilter, iniFilter, today, planHistReady, zoom, setZoom, ancla, setAncla, narrow, onAbrir, onAplicar }: Props) {
  const [drag, setDrag] = useState<{ key: string; titulo: string; color: string } | null>(null)
  const [over, setOver] = useState<Sobre | null>(null)
  const [overBandeja, setOverBandeja] = useState(false)
  const [verHechas, setVerHechas] = useState(true)
  const [picker, setPicker] = useState<{ key: string; rect: DOMRect } | null>(null)
  const dragRef = useRef<{ key: string; x: number; y: number; moved: boolean; origen: 'bandeja' | 'cal' } | null>(null)
  const sinClic = useRef(false)   // tras un arrastre el navegador igual dispara `click`: se ignora
  const ptr = useRef({ x: 0, y: 0 })
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const overRef = useRef<Sobre | null>(null)
  const overBandejaRef = useRef(false)

  /* ─── Datos ───────────────────────────────────────────────────────────── */
  // Las tareas que se ven: de las épicas que pasan el filtro, en el orden de cada épica (tareas.orden).
  const items = useMemo(() => {
    const out: Item[] = []
    for (const e of lista) {
      if (epicaFilter !== 'todas' && e.id !== epicaFilter) continue
      const al = alcanceDe(epicaFilter === 'todas' ? undefined : e, featureFilter, iniFilter)
      for (const t of enOrden(e.tasks || [])) if (t.id && t.status !== ARCHIVED && al.pasa(t)) out.push({ e, t, key: `${e.id}:${t.id}` })
    }
    return out
  }, [lista, epicaFilter, featureFilter, iniFilter])
  const porKey = useMemo(() => new Map(items.map(i => [i.key, i])), [items])

  const porDia = useMemo(() => {
    const m = new Map<string, Entrada[]>()
    const push = (d: string, en: Entrada) => { const a = m.get(d); if (a) a.push(en); else m.set(d, [en]) }
    for (const it of items) {
      const hecha = it.t.status === 'Terminada'
      if (hecha && !verHechas) continue
      const { plan, sesiones } = diasDeTarea(it.t, today)
      if (plan) push(plan, { it, sesion: false })
      if (!hecha) sesiones.forEach(d => push(d, { it, sesion: true }))
    }
    const rango = (x: Entrada) => (x.it.t.status === 'Terminada' ? 2 : x.sesion ? 1 : 0)
    m.forEach(arr => {
      const base = new Map(arr.map((x, i) => [x, i]))
      arr.sort((a, b) => (rango(a) - rango(b)) || ((a.it.t.planOrder ?? 1e9) - (b.it.t.planOrder ?? 1e9)) || (base.get(a)! - base.get(b)!))
    })
    return m
  }, [items, today, verHechas])

  const carga = useCallback((d: string) => {
    let n = 0, min = 0
    for (const x of porDia.get(d) || []) { if (x.it.t.status === 'Terminada') continue; n++; min += estMinDia(x.it.t, d) }
    return { n, min }
  }, [porDia])

  // Bandeja: lo atrasado (planeado en un día que ya pasó y sin terminar) y lo que no tiene fecha.
  const bandeja = useMemo(() => {
    const atrasadas: Item[] = []
    const sin: Item[] = []
    for (const it of items) {
      if (it.t.status === 'Terminada') continue
      if (it.t.plan && it.t.plan < today) atrasadas.push(it)
      else if (!it.t.plan) sin.push(it)
    }
    atrasadas.sort((a, b) => (a.t.plan || '').localeCompare(b.t.plan || ''))
    const grupos: { e: Epica; porFeature: { fid: string; items: Item[] }[] }[] = []
    for (const it of sin) {
      let g = grupos.find(x => x.e.id === it.e.id)
      if (!g) { g = { e: it.e, porFeature: [] }; grupos.push(g) }
      const fid = it.e.features?.some(f => f.id === it.t.featureId) ? it.t.featureId! : ''
      let pf = g.porFeature.find(x => x.fid === fid)
      if (!pf) { pf = { fid, items: [] }; g.porFeature.push(pf) }
      pf.items.push(it)
    }
    // dentro de cada épica, los features en el orden en que están definidos y "sin feature" al final
    grupos.forEach(g => g.porFeature.sort((a, b) => {
      const ia = a.fid ? (g.e.features || []).findIndex(f => f.id === a.fid) : 1e9
      const ib = b.fid ? (g.e.features || []).findIndex(f => f.id === b.fid) : 1e9
      return ia - ib
    }))
    return { atrasadas, grupos, sinCount: sin.length }
  }, [items, today])

  /* ─── Escritura: agendar / reordenar / quitar ─────────────────────────── */
  /** Abiertas de ese día de TODAS las épicas (también las que el filtro esconde), en su orden: el `planOrder` es del DÍA, no de la épica. */
  const abiertasDelDia = useCallback((dia: string) => {
    const l: { e: Epica; t: EpicaTask; key: string }[] = []
    for (const e of epicas) for (const t of e.tasks || []) if (t.id && t.plan === dia && t.status !== 'Terminada' && t.status !== ARCHIVED) l.push({ e, t, key: `${e.id}:${t.id}` })
    return ordenarDia(l.map(x => ({ ...x, planOrder: x.t.planOrder })))
  }, [epicas])

  /** Mueve `key` al día `dia`, ANTES de `antes` (null = al final). Un solo aviso con «Deshacer». */
  const soltarEnDia = useCallback((key: string, dia: string, antes: string | null) => {
    const it = porKey.get(key)
    if (!it) return
    const delDia = abiertasDelDia(dia)
    const entradas: EntradaDia[] = delDia.map(x => ({ key: x.key, planOrder: x.t.planOrder }))
    const cambios = ubicarEnDia(entradas, key, antes)
    if (!cambios.size) return
    const items2: ParcheTarea[] = []
    cambios.forEach((orden, k) => {
      if (k === key) items2.push({ epicaId: it.e.id, taskId: it.t.id!, patch: parcheAgendar(it.t, dia, { hoy: today, planOrder: orden, prioPorDefecto: prioFromDue(it.t.due), guardarHistorial: planHistReady }) })
      else { const o = delDia.find(x => x.key === k); if (o) items2.push({ epicaId: o.e.id, taskId: o.t.id!, patch: { planOrder: orden } }) }
    })
    const mismoDia = it.t.plan === dia
    const tarde = !!it.t.due && dia > it.t.due
    const msg = mismoDia ? `«${it.t.t}» reordenada en ${etiquetaDia(dia)}`
      : `«${it.t.t}» → ${etiquetaDia(dia)}${tarde ? ` · ⚠ vence el ${fmtDue(it.t.due)}` : ''}`
    onAplicar(items2, msg)
  }, [porKey, abiertasDelDia, today, planHistReady, onAplicar])

  const quitarFecha = useCallback((key: string) => {
    const it = porKey.get(key)
    if (!it || !it.t.plan) return
    onAplicar([{ epicaId: it.e.id, taskId: it.t.id!, patch: parcheQuitar(it.t, { hoy: today, guardarHistorial: planHistReady }) }], `«${it.t.t}» sin fecha`)
  }, [porKey, today, planHistReady, onAplicar])

  /* ─── Arrastre (pointer events: sirve con ratón y con la manija en táctil) ─ */
  const golpe = useCallback((x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const zona = el?.closest('[data-cal-drop]') as HTMLElement | null
    const dia = zona?.dataset.calDrop
    let nuevo: Sobre | null = null
    let enBandeja = false
    // Soltar en «Por agendar» quita la fecha, pero sólo si la tarea venía del calendario (una de la bandeja que sueltas ahí mismo = cancelar).
    if (zona && dia === 'bandeja') enBandeja = dragRef.current?.origen === 'cal'
    else if (zona && dia) {
      let antes: string | null = null
      const chips = Array.from(zona.querySelectorAll('[data-cal-chip]')) as HTMLElement[]
      for (const c of chips) {
        if (c.dataset.calKey === dragRef.current?.key) continue
        const r = c.getBoundingClientRect()
        if (y < r.top + r.height / 2) { antes = c.dataset.calKey || null; break }
      }
      nuevo = { dia, antes }
    }
    const a = overRef.current
    if (a?.dia !== nuevo?.dia || a?.antes !== nuevo?.antes) { overRef.current = nuevo; setOver(nuevo) }
    if (overBandejaRef.current !== enBandeja) { overBandejaRef.current = enBandeja; setOverBandeja(enBandeja) }
  }, [])
  const termina = useCallback(() => {
    dragRef.current = null; overRef.current = null; overBandejaRef.current = false
    setDrag(null); setOver(null); setOverBandeja(false)
  }, [])
  const onDown = (ev: ReactPointerEvent<HTMLElement>, it: Item, origen: 'bandeja' | 'cal') => {
    if (ev.button !== 0) return
    const tgt = ev.target as HTMLElement
    if (tgt.closest('button, input, select, a')) return                    // los controles de adentro no inician arrastre
    if (ev.pointerType === 'touch' && !tgt.closest('[data-cal-grip]')) return   // en táctil, sólo la manija (el resto desplaza)
    dragRef.current = { key: it.key, x: ev.clientX, y: ev.clientY, moved: false, origen }
    ptr.current = { x: ev.clientX, y: ev.clientY }
    try { ev.currentTarget.setPointerCapture(ev.pointerId) } catch { /* sin captura el arrastre sigue dentro de la pieza */ }
  }
  const onMove = (ev: ReactPointerEvent<HTMLElement>, it: Item) => {
    const d = dragRef.current
    if (!d || d.key !== it.key) return
    ptr.current = { x: ev.clientX, y: ev.clientY }
    if (!d.moved) {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return
      d.moved = true
      setDrag({ key: it.key, titulo: it.t.t, color: it.e.color })
    }
    if (ghostRef.current) ghostRef.current.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 10}px)`
    golpe(ev.clientX, ev.clientY)
  }
  const onUp = (it: Item) => {
    const d = dragRef.current
    if (!d || d.key !== it.key) return
    const destino = overRef.current
    const enBandeja = overBandejaRef.current
    const movio = d.moved
    termina()
    if (!movio) return                                       // fue un clic: lo atiende onClick de la pieza
    sinClic.current = true
    window.setTimeout(() => { sinClic.current = false }, 60)
    if (enBandeja) quitarFecha(it.key)
    else if (destino) soltarEnDia(it.key, destino.dia, destino.antes)
  }
  // Escape cancela; arrastrar hasta el borde de la pantalla desplaza la página (el mes y la bandeja son más altos que ella).
  useEffect(() => {
    if (!drag) return
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') termina() }
    // Si la pieza que arrastras se desmonta a media arrastrada (llegó una relectura), su pointerup ya no existe: se libera aquí.
    const suelta = () => { if (dragRef.current) window.setTimeout(() => { if (dragRef.current) termina() }, 0) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerup', suelta)
    window.addEventListener('pointercancel', suelta)
    let raf = 0
    const tick = () => {
      const { x, y } = ptr.current, h = window.innerHeight, borde = 90
      const dy = y < borde ? -Math.ceil((borde - y) / 6) : y > h - borde ? Math.ceil((y - (h - borde)) / 6) : 0
      if (dy) { window.scrollBy(0, dy); golpe(x, y) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerup', suelta); window.removeEventListener('pointercancel', suelta); cancelAnimationFrame(raf) }
  }, [drag, golpe, termina])
  // El selector rápido de fecha se cierra al tocar fuera o al desplazar (se ancla por coordenadas de pantalla).
  useEffect(() => {
    if (!picker) return
    const fuera = (ev: MouseEvent) => { if (!(ev.target as HTMLElement | null)?.closest?.('[data-cal-pop]')) setPicker(null) }
    const scroll = () => setPicker(null)
    document.addEventListener('mousedown', fuera)
    window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('scroll', scroll, true) }
  }, [picker])

  /* ─── Piezas ──────────────────────────────────────────────────────────── */
  const pieza = (en: Entrada, dia: string | null, v: Variante, rank?: number): ReactNode => {
    const { it, sesion } = en
    const t = it.t
    const hecha = t.status === 'Terminada'
    const arrastrable = !hecha && !sesion
    const st = taskStyle(t.status)
    const f = it.e.features?.find(x => x.id === t.featureId)
    const ini = f?.iniciativas?.find(x => x.id === t.iniciativaId)
    const fc = f?.color || '#5B6B86'
    const vence = !!t.due && dia !== null && t.due === dia
    const tarde = !!t.due && dia !== null && dia > t.due && !hecha
    const pz = t.due && !hecha ? plazoLabel(t.due, today, { hecho: false, verbo: 'seco' }) : null
    const arrastrando = drag?.key === it.key
    const min = estMinDia(t, dia || t.plan || '')
    const onKey = (ev: React.KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onAbrir(it.e.id, t.id!) } }
    const kk = `${it.key}${sesion ? ':s' : ''}`
    const props = {
      role: 'button' as const, tabIndex: 0, onKeyDown: onKey,
      'aria-label': `${t.t}. ${sesion ? 'Sesión de trabajo' : 'Abrir'}`,
      onClick: () => { if (!sinClic.current) onAbrir(it.e.id, t.id!) },
      ...(arrastrable ? {
        ...(dia ? { 'data-cal-chip': '', 'data-cal-key': it.key } : {}),
        onPointerDown: (ev: ReactPointerEvent<HTMLElement>) => onDown(ev, it, dia ? 'cal' : 'bandeja'),
        onPointerMove: (ev: ReactPointerEvent<HTMLElement>) => onMove(ev, it),
        onPointerUp: () => onUp(it),
        onPointerCancel: termina,
      } : {}),
    }
    const barra = it.e.color
    const base: CSSProperties = {
      cursor: arrastrable ? 'grab' : 'pointer', userSelect: 'none', WebkitUserSelect: 'none', boxSizing: 'border-box', minWidth: 0,
      opacity: arrastrando ? 0.35 : hecha ? 0.55 : 1, transition: 'opacity .12s',
    }
    const grip = arrastrable && v !== 'mes' ? (
      <span data-cal-grip aria-hidden title="Arrastra" style={{ flexShrink: 0, touchAction: 'none', color: 'rgba(20,35,61,0.4)', display: 'flex', padding: '2px 0' }}>
        <svg width="10" height="14" viewBox="0 0 14 18" fill="currentColor">{[3, 9, 15].map(y => <g key={y}><circle cx="3.5" cy={y} r="1.7" /><circle cx="10.5" cy={y} r="1.7" /></g>)}</svg>
      </span>
    ) : null
    const metaFeature = f && (
      <span title={`Feature: ${f.t}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: fc, minWidth: 0, maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: fc, flexShrink: 0 }} />{f.t}{ini ? ` › ${ini.nombre}` : ''}
      </span>
    )

    if (v === 'mes') {
      return (
        <div key={kk} {...props} title={`${t.t}${f ? ` · ${f.t}` : ''}${t.due ? ` · vence ${fmtDue(t.due)}` : ''}${sesion ? ' (sesión)' : ''}`}
          style={{ ...base, display: 'flex', alignItems: 'center', gap: 4, height: 21, padding: '0 6px 0 5px', borderRadius: 6, borderLeft: `3px solid ${barra}`, background: sesion ? 'repeating-linear-gradient(135deg, rgba(15,35,64,0.04) 0 4px, transparent 4px 8px)' : hexA(barra, 0.1), fontSize: 11, fontWeight: 600, color: tarde ? '#B0522E' : '#16365F', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {vence && <span aria-label="vence este día" style={{ color: '#B0522E', flexShrink: 0 }}>⚑</span>}
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: hecha ? 'line-through' : 'none' }}>{t.t}</span>
        </div>
      )
    }
    if (v === 'bandeja') {
      return (
        <div key={kk} {...props} style={{ ...base, display: 'flex', alignItems: 'flex-start', gap: 6, padding: '7px 8px', borderRadius: 10, border: '1px solid rgba(15,35,64,0.10)', borderLeft: `4px solid ${barra}`, background: '#fff' }}>
          {grip}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#16365F', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.t}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 3 }}>
              {t.plan && t.plan < today && <span style={{ fontSize: 10, fontWeight: 800, color: '#B0522E' }}>⏳ era {etiquetaDia(t.plan)}</span>}
              {metaFeature}
              <span title={`Prioridad ${t.priority || 'media'}`} style={{ display: 'flex' }}><PrioBars p={t.priority} size={11} /></span>
              {min > 0 && <span style={{ fontSize: 10, color: 'rgba(20,35,61,0.5)' }}>{fmtHoras(min)}</span>}
              {pz && <span style={{ fontSize: 10, fontWeight: 700, color: pz.c }} title={`Vence ${fmtDue(t.due)}`}>⚑ {pz.corto}</span>}
            </div>
          </div>
          <button type="button" aria-label="Elegir fecha" title="Elegir fecha"
            onClick={ev => { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); setPicker(p => (p?.key === it.key ? null : { key: it.key, rect: r })) }}
            style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 7, width: 26, height: 26, padding: 0, fontSize: 12 }}>📅</button>
        </div>
      )
    }
    // semana y día: tarjeta completa
    const grande = v === 'dia'
    return (
      <div key={kk} {...props} style={{ ...base, display: 'flex', alignItems: 'flex-start', gap: 6, padding: grande ? '9px 10px' : '7px 8px', borderRadius: 10, border: '1px solid rgba(15,35,64,0.10)', borderLeft: `4px solid ${barra}`, background: sesion ? 'repeating-linear-gradient(135deg, rgba(15,35,64,0.04) 0 5px, #fff 5px 10px)' : '#fff' }}>
        {grip}
        {grande && rank != null && <span title={`Lugar ${rank} del día`} style={{ flexShrink: 0, width: 22, textAlign: 'right', font: '800 13px var(--font-ui)', fontVariantNumeric: 'tabular-nums', color: rank === 1 ? '#A87A2C' : 'rgba(20,35,61,0.5)' }}>{rank}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: grande ? 13.5 : 12.5, fontWeight: 600, color: tarde ? '#B0522E' : '#16365F', lineHeight: 1.3, textDecoration: hecha ? 'line-through' : 'none', ...(grande ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>{t.t}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 99, padding: '1px 7px', background: st.bg, color: st.c }}>{sesion ? 'Sesión' : st.label}</span>
            {lista.length > 1 && epicaFilter === 'todas' && <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.55)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: 2, background: barra }} />{it.e.name}</span>}
            {metaFeature}
            <span title={`Prioridad ${t.priority || 'media'}`} style={{ display: 'flex' }}><PrioBars p={t.priority} size={11} /></span>
            {min > 0 && <span style={{ fontSize: 10, color: 'rgba(20,35,61,0.5)' }}>{fmtHoras(min)}</span>}
            {vence && <span style={{ fontSize: 10, fontWeight: 800, color: '#B0522E' }}>⚑ vence hoy</span>}
            {tarde && <span style={{ fontSize: 10, fontWeight: 800, color: '#B0522E' }} title={`Vence ${fmtDue(t.due)}`}>⚠ después de su entrega</span>}
            {!vence && !tarde && pz && <span style={{ fontSize: 10, fontWeight: 700, color: pz.c }} title={`Vence ${fmtDue(t.due)}`}>⚑ {pz.corto}</span>}
          </div>
        </div>
        {arrastrable && (
          <button type="button" aria-label="Quitar la fecha" title="Quitar la fecha (vuelve a «Por agendar»)" onClick={ev => { ev.stopPropagation(); quitarFecha(it.key) }}
            style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.4)', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>✕</button>
        )}
      </div>
    )
  }

  const linea = <div key="ins" aria-hidden style={{ height: 3, background: '#C2933A', borderRadius: 99, margin: '1px 0', flexShrink: 0 }} />

  /** Lista de piezas de un día (con la línea dorada de dónde caería lo que arrastras). */
  const piezasDe = (d: string, v: Variante, maxVis = Infinity): { nodos: ReactNode[]; ocultas: number } => {
    const ents = porDia.get(d) || []
    const esOver = over?.dia === d
    const nodos: ReactNode[] = []
    let shown = 0, puesta = false, rank = 0
    for (const en of ents) {
      const abiertaPrim = !en.sesion && en.it.t.status !== 'Terminada'
      if (shown >= maxVis) break
      if (esOver && abiertaPrim && over!.antes === en.it.key) { nodos.push(linea); puesta = true }
      if (esOver && over!.antes == null && !puesta && !abiertaPrim) { nodos.push(linea); puesta = true }
      if (abiertaPrim) rank++
      nodos.push(pieza(en, d, v, abiertaPrim ? rank : undefined))
      shown++
    }
    if (esOver && !puesta) nodos.push(linea)
    return { nodos, ocultas: Math.max(0, ents.length - shown) }
  }

  const irADia = (d: string) => { setAncla(d); setZoom('dia') }
  const cargaTxt = (d: string) => {
    const c = carga(d)
    if (!c.n) return null
    const lleno = c.min > DIA_LLENO_MIN
    return <span title={lleno ? `Más de ${DIA_LLENO_MIN / 60} h agendadas ese día` : 'Tareas agendadas · estimado total'} style={{ fontSize: 10, fontWeight: 700, color: lleno ? '#B0522E' : 'rgba(20,35,61,0.5)', whiteSpace: 'nowrap' }}>{c.n}{c.min > 0 ? ` · ≈${fmtHoras(c.min)}` : ''}</span>
  }
  const colorZona = (d: string): CSSProperties => {
    const sobre = over?.dia === d
    return { outline: sobre ? '2px solid #C2933A' : 'none', outlineOffset: -2, background: sobre ? 'rgba(194,147,58,0.08)' : d === today ? 'rgba(194,147,58,0.05)' : esFinde(d) ? 'rgba(15,35,64,0.025)' : '#fff' }
  }

  /* ─── Vistas ──────────────────────────────────────────────────────────── */
  const celdaMes = (d: string, mesISO: string) => {
    const { nodos, ocultas } = piezasDe(d, 'mes', narrow ? 2 : 4)
    const fuera = d.slice(0, 7) !== mesISO
    return (
      <div key={d} data-cal-drop={d} style={{ ...colorZona(d), minHeight: narrow ? 84 : 124, padding: '4px 4px 5px', borderRadius: 8, border: d === today ? '1.5px solid rgba(194,147,58,0.6)' : '1px solid rgba(15,35,64,0.08)', display: 'flex', flexDirection: 'column', gap: 3, opacity: fuera ? 0.55 : 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <button onClick={() => irADia(d)} title="Ver el día" aria-label={`Ver ${dateLabel(d)}`} style={{ cursor: 'pointer', border: 'none', background: d === today ? '#10233F' : 'transparent', color: d === today ? '#fff' : fuera ? 'rgba(20,35,61,0.45)' : '#10233F', borderRadius: 99, minWidth: 22, height: 22, padding: '0 5px', font: '800 12px var(--font-ui)' }}>{dayNum(d)}</button>
          {cargaTxt(d)}
        </div>
        {nodos}
        {ocultas > 0 && <button onClick={() => irADia(d)} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 10.5, fontWeight: 800, textAlign: 'left', padding: '1px 2px', fontFamily: 'var(--font-ui)' }}>+{ocultas} más</button>}
      </div>
    )
  }
  const vistaMes = () => {
    const mesISO = ancla.slice(0, 7)
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4, marginBottom: 4 }}>
          {DIAS_CORTO.map(n => <div key={n} style={{ ...eb, textAlign: 'center', padding: '4px 0' }}>{n}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4 }}>
          {monthGrid(mesISO).map(d => celdaMes(d, mesISO))}
        </div>
      </div>
    )
  }
  const vistaSemana = () => {
    const lunes = mondayISO(ancla)
    const dias = Array.from({ length: 7 }, (_, i) => addDays(lunes, i))
    return (
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(7, minmax(0,1fr))', gap: 6 }}>
        {dias.map((d, i) => {
          const { nodos } = piezasDe(d, 'semana')
          return (
            <div key={d} data-cal-drop={d} style={{ ...colorZona(d), minHeight: narrow ? 70 : 280, padding: 6, borderRadius: 10, border: d === today ? '1.5px solid rgba(194,147,58,0.6)' : '1px solid rgba(15,35,64,0.08)', display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingBottom: 3 }}>
                <button onClick={() => irADia(d)} title="Ver el día" style={{ cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, textAlign: 'left', fontFamily: 'var(--font-ui)' }}>
                  <span style={{ ...eb, color: d === today ? '#A87A2C' : undefined }}>{DIAS_CORTO[i]}</span>{' '}
                  <span style={{ font: '800 15px var(--font-ui)', color: '#10233F' }}>{dayNum(d)}</span>
                </button>
                {cargaTxt(d)}
              </div>
              {nodos}
            </div>
          )
        })}
      </div>
    )
  }
  const vistaDia = () => {
    const lunes = mondayISO(ancla)
    const { nodos } = piezasDe(ancla, 'dia')
    const c = carga(ancla)
    return (
      <div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {Array.from({ length: 7 }, (_, i) => addDays(lunes, i)).map((d, i) => {
            const k = carga(d), on = d === ancla
            return (
              <button key={d} onClick={() => setAncla(d)} aria-pressed={on} style={{ ...chipBtn(on), padding: '5px 10px', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 52, borderColor: !on && d === today ? 'rgba(194,147,58,0.7)' : undefined }}>
                <span style={{ fontSize: 10, opacity: 0.8 }}>{DIAS_CORTO[i]}</span>
                <span style={{ fontSize: 13 }}>{dayNum(d)}</span>
                <span style={{ fontSize: 9.5, opacity: 0.75 }}>{k.n || '·'}</span>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', marginBottom: 6 }}>
          {c.n === 0 ? 'Nada agendado este día. Arrastra tareas de «Por agendar».' : <>{c.n} tarea{c.n === 1 ? '' : 's'}{c.min > 0 && <> · ≈ {fmtHoras(c.min)}{c.min > DIA_LLENO_MIN && <span style={{ color: '#B0522E', fontWeight: 700 }}> · más de {DIA_LLENO_MIN / 60} h</span>}</>} · el 1 va primero</>}
        </div>
        <div data-cal-drop={ancla} style={{ ...colorZona(ancla), minHeight: 160, padding: 8, borderRadius: 12, border: ancla === today ? '1.5px solid rgba(194,147,58,0.6)' : '1px solid rgba(15,35,64,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {nodos}
        </div>
      </div>
    )
  }

  /* ─── Cabecera y bandeja ──────────────────────────────────────────────── */
  const mover = (dir: -1 | 1) => setAncla(zoom === 'dia' ? addDays(ancla, dir) : zoom === 'semana' ? addDays(ancla, 7 * dir) : addMonths(ancla.slice(0, 7) + '-01', dir))
  const titulo = zoom === 'mes'
    ? new Date(ancla.slice(0, 7) + '-01T00:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    : zoom === 'semana' ? weekRangeLabel(mondayISO(ancla)) : dateLabel(ancla)

  const verBandeja = () => {
    const { atrasadas, grupos, sinCount } = bandeja
    return (
      <aside data-cal-drop="bandeja" aria-label="Por agendar" className="rm-noprint"
        style={{ ...card, padding: '10px 10px 12px', alignSelf: 'start', ...(narrow ? {} : { position: 'sticky', top: 10, maxHeight: 'calc(100vh - 20px)', overflowY: 'auto' }),
          outline: overBandeja ? '2px solid #C2933A' : 'none', outlineOffset: -2, background: overBandeja ? 'rgba(194,147,58,0.07)' : '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={eb}>Por agendar · {sinCount + atrasadas.length}</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: 4, marginBottom: 8 }}>
          {overBandeja ? 'Suelta aquí para quitarle la fecha.' : 'Arrastra una tarea a un día, o toca 📅. Suéltala entre otras para fijar el orden.'}
        </div>
        {atrasadas.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...eb, color: '#B0522E', marginBottom: 5 }}>⏳ Atrasadas · {atrasadas.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{atrasadas.map(it => pieza({ it, sesion: false }, null, 'bandeja'))}</div>
          </div>
        )}
        {grupos.map(g => (
          <div key={g.e.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 3, background: g.e.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#16365F' }}>{g.e.name}</span>
              <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)' }}>{g.porFeature.reduce((s, x) => s + x.items.length, 0)}</span>
            </div>
            {g.porFeature.map(pf => {
              const f = g.e.features?.find(x => x.id === pf.fid)
              return (
                <div key={pf.fid || 'sin'} style={{ marginBottom: 8 }}>
                  {(g.e.features || []).length > 0 && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: f?.color || 'rgba(20,35,61,0.5)', margin: '0 0 4px 2px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {f && <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: f.color || '#5B6B86' }} />}{f ? f.t : 'Sin feature'}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{pf.items.map(it => pieza({ it, sesion: false }, null, 'bandeja'))}</div>
                </div>
              )
            })}
          </div>
        ))}
        {sinCount + atrasadas.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)', padding: '8px 2px' }}>Todo lo de esta selección ya tiene día. Crea tareas en la pestaña «Prioridad» o en Épicas.</div>}
      </aside>
    )
  }

  // Selector rápido de fecha de una tarjeta de la bandeja: los próximos 7 días + cualquier fecha.
  const itPicker = picker ? porKey.get(picker.key) : undefined
  const selector = picker && itPicker ? createPortal(
    <div data-cal-pop role="dialog" aria-label="Elegir fecha" style={{ ...popoverStyle(picker.rect, 248, 160), display: 'flex', flexWrap: 'wrap', gap: 5, padding: 10, boxSizing: 'border-box', background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 12, boxShadow: '0 20px 38px -18px rgba(15,35,64,0.62)' }}>
      <span style={{ ...eb, flexBasis: '100%' }}>¿Cuándo?</span>
      {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d, i) => (
        <button key={d} onClick={() => { setPicker(null); soltarEnDia(itPicker.key, d, null) }}
          style={{ cursor: 'pointer', borderRadius: 8, padding: '5px 9px', font: '700 11.5px var(--font-ui)', border: '1px solid rgba(15,35,64,0.14)', background: i === 0 ? 'rgba(194,147,58,0.12)' : '#fff', color: '#16365F' }}>{i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : etiquetaDia(d)}</button>
      ))}
      <input type="date" aria-label="Otra fecha" defaultValue={itPicker.t.plan || ''}
        onChange={ev => { const v = ev.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v <= '2100-12-31') { setPicker(null); soltarEnDia(itPicker.key, v, null) } }}
        style={{ flexBasis: '100%', border: '1px solid rgba(15,35,64,0.16)', borderRadius: 8, padding: '6px 8px', fontSize: 12.5, color: '#16365F', fontFamily: 'var(--font-ui)' }} />
    </div>, document.body) : null

  const destinoGhost = overBandeja ? 'Quitar la fecha' : over ? etiquetaDia(over.dia) : ''
  const ghost = drag ? createPortal(
    <div ref={el => { ghostRef.current = el; if (el) el.style.transform = `translate(${ptr.current.x + 14}px, ${ptr.current.y + 10}px)` }}
      style={{ position: 'fixed', left: 0, top: 0, zIndex: 200, pointerEvents: 'none', maxWidth: 260, padding: '7px 10px', borderRadius: 10, background: '#10233F', color: '#fff', borderLeft: `4px solid ${drag.color}`, boxShadow: '0 18px 34px -14px rgba(8,18,36,.7)', fontSize: 12.5, fontWeight: 600 }}>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{drag.titulo}</div>
      {destinoGhost && <div style={{ fontSize: 10.5, color: '#E7C56B', marginTop: 2, fontWeight: 700 }}>→ {destinoGhost}</div>}
    </div>, document.body) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(250px, 310px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
      {!narrow && verBandeja()}
      <div style={{ ...card, padding: '10px 12px 14px', minWidth: 0 }}>
        <div className="rm-noprint" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={() => mover(-1)} style={navBtn} aria-label="Anterior">◀</button>
          <button onClick={() => setAncla(today)} style={{ ...navBtn, fontWeight: 800 }}>Hoy</button>
          <button onClick={() => mover(1)} style={navBtn} aria-label="Siguiente">▶</button>
          <span className="serif" style={{ fontSize: 17, fontWeight: 600, color: '#10233F', textTransform: 'capitalize', marginLeft: 4 }}>{titulo}</span>
          <div role="tablist" aria-label="Escala del calendario" style={{ display: 'inline-flex', gap: 2, background: 'rgba(15,35,64,0.05)', borderRadius: 99, padding: 3, marginLeft: 6 }}>
            {([['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']] as const).map(([z, l]) => (
              <button key={z} role="tab" aria-selected={zoom === z} onClick={() => setZoom(z)} style={{ ...chipBtn(zoom === z), padding: '4px 12px', fontSize: 11.5 }}>{l}</button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'rgba(20,35,61,0.6)' }}>
            <input type="checkbox" checked={verHechas} onChange={ev => setVerHechas(ev.target.checked)} />Terminadas
          </label>
        </div>
        {zoom === 'mes' ? vistaMes() : zoom === 'semana' ? vistaSemana() : vistaDia()}
        <div className="rm-noprint" style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)', marginTop: 10 }}>
          ⚑ fecha de entrega · franjas = sesión de trabajo de otra tarea · toca una tarea para editarla · Esc cancela un arrastre
        </div>
      </div>
      {narrow && verBandeja()}
      {selector}
      {ghost}
    </div>
  )
}
