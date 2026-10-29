'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Epica, EpicaTask } from '@/lib/supabase'
import { ARCHIVED, PrioBars, WEEK_EST_MIN, hexA, plazoLabel, taskStyle } from '@/components/epicas/core'
import { enOrden, mover } from '@/lib/ordenTareas'
import { compararPorModo, type ModoOrden } from '@/lib/planTarea'
import { alcanceDe } from '@/lib/alcanceTareas'

/* ═══════════════════════════════════════════════════════════════════════════
   /roadmap · vista "Tareas" — el último escalón de Épica → Feature → Iniciativa → TAREA.
   Se filtra por épica / feature / iniciativa (los mismos chips de la barra de mando), se ven sólo las
   tareas de esa selección y se decide cuál va primero ARRASTRANDO (o con ↑ ↓ ⤒). El orden es la columna
   `tareas.orden` — la MISMA de "Orden manual" en Épicas, así que lo que se ordena aquí se ve allá.
   Reordenar un subconjunto nunca mueve a las demás tareas de la épica (ver lib/ordenTareas).
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  /** Épicas que pasan el filtro de archivadas (las tarjetas de "elige una épica"). */
  lista: Epica[]
  epicas: Epica[]
  epicaFilter: string
  featureFilter: string
  iniFilter: string
  setEpicaFilter: (id: string) => void
  today: string
  ordenReady: boolean
  /** Abre el popup de la tarea (el mismo de Épicas). */
  onAbrir: (epicaId: string, taskId: string) => void
  /** Cambia el Feature y/o la Iniciativa de una tarea desde su fila (ver `ubicarTarea` en RoadmapClient). */
  onUbicar: (epicaId: string, taskId: string, cambio: { featureId?: string; iniciativaId?: string }) => void
  /** Las columnas feature_id / iniciativa_id existen (si no, los selectores se deshabilitan). */
  featuresReady: boolean
  iniciativaIdReady: boolean
  /** Persiste el nuevo orden del subconjunto (ids en el orden deseado). `msg` = aviso con «Deshacer». */
  onOrdenar: (epicaId: string, ids: string[], msg?: string) => void
  /** Crea una tarea ya colgada del feature/iniciativa elegidos, al final del orden. false = no se pudo (falta una migración): el texto se conserva. */
  onCrear: (epicaId: string, titulo: string, featureId: string | null, iniciativaId: string | null) => boolean
}

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 14 }
const eb: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.62)' }
const mini: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 7, width: 24, height: 24, padding: 0, fontSize: 12, lineHeight: 1, color: 'rgba(20,35,61,0.6)', fontFamily: 'var(--font-ui)' }
const estMinDe = (t: EpicaTask): number => (typeof t.estMin === 'number' ? t.estMin : WEEK_EST_MIN(t.difficulty))
const fmtHoras = (min: number): string => { const h = min / 60; return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} h` }

export default function TareasRoadmap({ lista, epicas, epicaFilter, featureFilter, iniFilter, setEpicaFilter, today, ordenReady, onAbrir, onUbicar, featuresReady, iniciativaIdReady, onOrdenar, onCrear }: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTo, setDropTo] = useState<number | null>(null)
  const [nueva, setNueva] = useState('')
  const [verTerminadas, setVerTerminadas] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null)
  const lastY = useRef(0)

  const ep = epicas.find(e => e.id === epicaFilter)
  const feats = useMemo(() => ep?.features || [], [ep])
  // El filtro de feature/iniciativa es el MISMO de la vista de calendario (lib/alcanceTareas).
  const alcance_ = useMemo(() => alcanceDe(ep, featureFilter, iniFilter), [ep, featureFilter, iniFilter])
  const { featKey, iniKey, featSel, iniSel } = alcance_
  const pasaFiltro = alcance_.pasa

  // Todas las de la épica en su orden actual: la lista visible es un recorte de ésta.
  const enOrdenEp = useMemo(() => enOrden(ep?.tasks || []).filter(t => !!t.id), [ep])
  const abiertas = useMemo(() => enOrdenEp.filter(t => t.status !== 'Terminada' && t.status !== ARCHIVED && pasaFiltro(t)), [enOrdenEp, pasaFiltro])
  const terminadas = useMemo(() => enOrdenEp.filter(t => t.status === 'Terminada' && pasaFiltro(t)), [enOrdenEp, pasaFiltro])
  const fuera = useMemo(() => enOrdenEp.filter(t => t.status !== 'Terminada' && t.status !== ARCHIVED && !pasaFiltro(t)).length, [enOrdenEp, pasaFiltro])
  const ids = useMemo(() => abiertas.map(t => t.id!), [abiertas])
  const estTotal = useMemo(() => abiertas.reduce((s, t) => s + estMinDe(t), 0), [abiertas])
  const puede = ordenReady && !!ep

  /* ─── Arrastre ─────────────────────────────────────────────────────────── */
  const dropIndex = useCallback((y: number) => {
    const rows = Array.from(listRef.current?.querySelectorAll('[data-rm-trow]') || []) as HTMLElement[]
    for (let k = 0; k < rows.length; k++) { const r = rows[k].getBoundingClientRect(); if (y < r.top + r.height / 2) return k }
    return rows.length
  }, [])
  const msgPos = (t: EpicaTask, pos: number) => `«${t.t}» ${pos === 0 ? 'va primero' : `va en el lugar ${pos + 1}`}`
  /** Mueve la tarea `id` a la posición final `pos` (0-based, ya sin ella en la lista). */
  const moverA = (id: string, pos: number) => {
    if (!ep) return
    const from = ids.indexOf(id)
    if (from < 0) return
    const to = Math.max(0, Math.min(pos, ids.length - 1))
    if (to === from) return
    const t = abiertas[from]
    onOrdenar(ep.id, mover(ids, from, to), msgPos(t, to))
  }
  /** Ordena las visibles por prioridad o entrega y lo GUARDA como su orden (las demás de la épica no se mueven). */
  const ordenarPor = (modo: Exclude<ModoOrden, 'manual'>) => {
    if (!ep) return
    const nuevo = [...abiertas].sort((a, b) => compararPorModo(a, b, modo)).map(t => t.id!)
    onOrdenar(ep.id, nuevo, modo === 'prioridad' ? 'Ordenadas por prioridad: alta primero' : 'Ordenadas por fecha de entrega')
  }
  const fin = () => { dragRef.current = null; setDragId(null); setDropTo(null) }
  const onDown = (ev: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (!puede) return
    ev.preventDefault(); ev.stopPropagation()
    dragRef.current = { id, moved: false }
    lastY.current = ev.clientY
    setDragId(id)
    try { ev.currentTarget.setPointerCapture(ev.pointerId) } catch { /* sin captura el arrastre sigue, sólo que sin seguir fuera del botón */ }
  }
  const onMove = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return
    lastY.current = ev.clientY
    dragRef.current.moved = true
    setDropTo(dropIndex(ev.clientY))
  }
  const onUp = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    const to = dropIndex(ev.clientY)
    fin()
    if (!d?.moved) return
    const from = ids.indexOf(d.id)
    moverA(d.id, to > from ? to - 1 : to)
  }
  // Con la lista más larga que la pantalla, arrastrar hasta el borde desplaza la página.
  useEffect(() => {
    if (!dragId) return
    let raf = 0
    const tick = () => {
      const y = lastY.current, h = window.innerHeight, borde = 90
      const dy = y < borde ? -Math.ceil((borde - y) / 6) : y > h - borde ? Math.ceil((y - (h - borde)) / 6) : 0
      if (dy) { window.scrollBy(0, dy); setDropTo(dropIndex(y)) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [dragId, dropIndex])
  const onGripKey = (ev: ReactKeyboardEvent<HTMLButtonElement>, id: string, pos: number) => {
    if (!puede) return
    if (ev.key === 'ArrowUp') { ev.preventDefault(); moverA(id, pos - 1) }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); moverA(id, pos + 1) }
    else if (ev.key === 'Home') { ev.preventDefault(); moverA(id, 0) }
    else if (ev.key === 'End') { ev.preventDefault(); moverA(id, ids.length - 1) }
  }

  /* ─── Sin épica elegida: el orden es POR ÉPICA, así que se elige una ──── */
  if (!ep) {
    return (
      <div className="rm-noprint" style={{ ...card, padding: '16px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#16365F' }}>Elige una épica para ver y ordenar sus tareas</div>
        <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.55)', marginTop: 4 }}>El orden es por épica: «cuál va primero» sólo tiene sentido entre tareas de la misma épica.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 10, marginTop: 14 }}>
          {lista.map(e => {
            const abiertasE = (e.tasks || []).filter(t => t.status !== 'Terminada' && t.status !== ARCHIVED).length
            return (
              <button key={e.id} onClick={() => setEpicaFilter(e.id)}
                style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid rgba(15,35,64,0.12)', borderLeft: `4px solid ${e.color}`, background: '#fff', borderRadius: 12, padding: '10px 12px', fontFamily: 'var(--font-ui)' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16365F' }}>{e.name}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)', marginTop: 3 }}>{abiertasE} abierta{abiertasE === 1 ? '' : 's'} · {(e.features || []).length} feature{(e.features || []).length === 1 ? '' : 's'}</div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  /* ─── Filas ────────────────────────────────────────────────────────────── */
  const alcance = [ep.name, featSel?.t, iniSel?.nombre].filter(Boolean).join(' › ')
  const ctxChip = (t: EpicaTask) => {
    const f = feats.find(x => x.id === t.featureId)
    const i = f?.iniciativas?.find(x => x.id === t.iniciativaId)
    // En el alcance ya está el feature/iniciativa filtrado: sólo se rotula el nivel que AÚN distingue filas.
    const verFeature = featKey === 'todas' && !!f
    const verIni = iniKey === 'todas' && !!i
    if (!verFeature && !verIni) return null
    const fc = f?.color || '#5B6B86'
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, flexShrink: 1, maxWidth: 260 }}>
        {verFeature && f && (
          <span title={`Feature: ${f.t}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: fc, background: hexA(fc, 0.12), border: `1px solid ${hexA(fc, 0.4)}`, borderRadius: 99, padding: '1px 8px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: fc, flexShrink: 0 }} />{f.t}
          </span>
        )}
        {verIni && i && <span title={`Iniciativa: ${i.nombre}`} style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(20,35,61,0.6)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>↳ {i.nombre}</span>}
      </span>
    )
  }
  /** Feature e Iniciativa de la fila, editables AHÍ MISMO con dos selectores en forma de chip (sin popup). Con un feature
   *  elegido, la iniciativa ofrece las suyas; sin feature, las de toda la épica agrupadas por feature y elegir una
   *  asigna los DOS niveles. Cambiar de feature limpia la iniciativa si no cuelga del nuevo (lo decide `ubicarTarea`). */
  const selChip = (tono: string, vacio: boolean): CSSProperties => ({
    appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', maxWidth: 170, fontFamily: 'var(--font-ui)', fontSize: 10.5, fontWeight: 700, lineHeight: 1.4,
    padding: '1px 20px 1px 9px', borderRadius: 99, textOverflow: 'ellipsis',
    color: vacio ? 'rgba(20,35,61,0.45)' : tono, backgroundColor: vacio ? 'transparent' : hexA(tono, 0.12),
    border: vacio ? '1px dashed rgba(15,35,64,0.28)' : `1px solid ${hexA(tono, 0.4)}`,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' fill='none' stroke='%2314233D' stroke-opacity='.45' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center',
  })
  const ubicacion = (t: EpicaTask) => {
    if (!feats.length) return null
    const f = feats.find(x => x.id === t.featureId)
    const inis = f?.iniciativas || []
    const iniOk = !!f && inis.some(x => x.id === t.iniciativaId)
    const epicaConInis = feats.some(x => (x.iniciativas || []).length > 0)
    const fc = f?.color || '#5B6B86'
    return (
      <span className="rm-noprint" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, flexWrap: 'wrap' }}>
        <select value={f?.id || ''} disabled={!featuresReady} aria-label={`Feature de «${t.t}»`} title={featuresReady ? 'Cambiar el feature' : 'Falta sql/epicas-12-features.sql'}
          onChange={ev => onUbicar(ep.id, t.id!, { featureId: ev.target.value })} style={selChip(fc, !f)}>
          <option value="">{f ? 'Sin feature' : '＋ Feature'}</option>
          {feats.map(x => <option key={x.id} value={x.id}>{x.t}{x.estado === 'cerrado' ? ' (cerrado)' : ''}</option>)}
        </select>
        {epicaConInis && (f ? inis.length > 0 : true) && (
          <select value={iniOk ? t.iniciativaId! : ''} disabled={!iniciativaIdReady} aria-label={`Iniciativa de «${t.t}»`} title={iniciativaIdReady ? 'Cambiar la iniciativa' : 'Falta sql/epicas-21-tarea-iniciativa.sql'}
            onChange={ev => onUbicar(ep.id, t.id!, { iniciativaId: ev.target.value })} style={selChip('#5B6B86', !iniOk)}>
            <option value="">{iniOk ? 'Sin iniciativa' : '＋ Iniciativa'}</option>
            {f
              ? inis.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)
              : feats.filter(x => (x.iniciativas || []).length > 0).map(x => (
                <optgroup key={x.id} label={x.t}>{(x.iniciativas || []).map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}</optgroup>
              ))}
          </select>
        )}
      </span>
    )
  }
  const fila = (t: EpicaTask, pos: number) => {
    const st = taskStyle(t.status)
    const pz = t.due ? plazoLabel(t.due, today, { hecho: false, verbo: 'seco' }) : null
    const arrastrando = dragId === t.id
    return (
      <div key={t.id} data-rm-trow style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 6px', borderBottom: '1px solid rgba(15,35,64,0.06)',
        borderRadius: arrastrando ? 10 : 0, background: arrastrando ? '#FFFDF8' : 'transparent',
        boxShadow: arrastrando ? '0 14px 26px -16px rgba(15,35,64,0.45)' : 'none', opacity: dragId && !arrastrando ? 0.62 : 1, transition: 'opacity .12s',
      }}>
        <button type="button" className="rm-noprint" disabled={!puede}
          onPointerDown={ev => onDown(ev, t.id!)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={fin} onKeyDown={ev => onGripKey(ev, t.id!, pos)}
          aria-label={`Reordenar «${t.t}»: arrastra, o usa las flechas ↑ ↓`} title={puede ? 'Arrastra para reordenar (o flechas ↑ ↓ con el foco aquí)' : 'Falta sql/epicas-04-orden-tareas.sql'}
          style={{ flexShrink: 0, border: 'none', background: 'transparent', padding: '4px 2px', color: 'rgba(20,35,61,0.45)', cursor: puede ? 'grab' : 'not-allowed', touchAction: 'none', display: 'flex' }}>
          <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden>{[3, 9, 15].map(y => <g key={y}><circle cx="3.5" cy={y} r="1.6" /><circle cx="10.5" cy={y} r="1.6" /></g>)}</svg>
        </button>
        <span title={`Lugar ${pos + 1} de ${ids.length}`} style={{ flexShrink: 0, width: 24, textAlign: 'right', font: '800 12px var(--font-ui)', fontVariantNumeric: 'tabular-nums', color: pos === 0 ? '#A87A2C' : 'rgba(20,35,61,0.5)' }}>{pos + 1}</span>
        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, borderRadius: 99, padding: '2px 8px', background: st.bg, color: st.c }}>{st.label}</span>
        <button type="button" onClick={() => onAbrir(ep.id, t.id!)} title={`Abrir «${t.t}»`}
          style={{ flex: '1 1 200px', minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: '2px 0', fontSize: 13, fontWeight: 600, color: '#16365F', fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</button>
        <span className="rm-printonly">{ctxChip(t)}</span>
        {ubicacion(t)}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span title={`Prioridad ${t.priority || 'media'}`} style={{ display: 'flex' }}><PrioBars p={t.priority} size={13} /></span>
          {pz && <span style={{ fontSize: 10.5, fontWeight: 700, color: pz.c }} title={t.due ? `Vence ${t.due}` : undefined}>{pz.corto}</span>}
          {estMinDe(t) > 0 && <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }} title="Estimado">{fmtHoras(estMinDe(t))}</span>}
        </span>
        <span className="rm-noprint" style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
          <button type="button" style={{ ...mini, opacity: puede && pos > 0 ? 1 : 0.35 }} disabled={!puede || pos === 0} onClick={() => moverA(t.id!, 0)} aria-label="Poner primero" title="Poner primero">⤒</button>
          <button type="button" style={{ ...mini, opacity: puede && pos > 0 ? 1 : 0.35 }} disabled={!puede || pos === 0} onClick={() => moverA(t.id!, pos - 1)} aria-label="Subir un lugar" title="Subir un lugar">↑</button>
          <button type="button" style={{ ...mini, opacity: puede && pos < ids.length - 1 ? 1 : 0.35 }} disabled={!puede || pos === ids.length - 1} onClick={() => moverA(t.id!, pos + 1)} aria-label="Bajar un lugar" title="Bajar un lugar">↓</button>
        </span>
      </div>
    )
  }
  const insLine = <div aria-hidden style={{ height: 2, background: '#C2933A', borderRadius: 99, margin: '1px 0' }} />

  return (
    <div style={{ ...card, padding: '12px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={eb}>Tareas · {abiertas.length}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#16365F' }}><span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: ep.color, marginRight: 6 }} />{alcance}</span>
        {estTotal > 0 && <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.5)' }}>≈ {fmtHoras(estTotal)} en total</span>}
      </div>
      <div className="rm-noprint" style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.5)', marginTop: 4 }}>
        {ordenReady
          ? <>El 1 va primero. Arrastra ⠿ o usa ↑ ↓ ⤒. {fuera > 0 ? `Las otras ${fuera} abiertas de la épica conservan su lugar. ` : ''}Es el mismo orden que «Orden manual» en Épicas.</>
          : <span style={{ color: '#B0522E' }}>Corre <code>sql/epicas-04-orden-tareas.sql</code> en Supabase: sin esa columna el orden no se puede guardar.</span>}
      </div>

      {abiertas.length > 1 && (
        <div className="rm-noprint" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={eb}>Ordenar</span>
          <button type="button" disabled={!puede} onClick={() => ordenarPor('prioridad')} title="Alta primero; a igual prioridad, la entrega más cercana"
            style={{ cursor: puede ? 'pointer' : 'not-allowed', border: '1px solid rgba(194,147,58,0.45)', background: 'rgba(194,147,58,0.10)', borderRadius: 99, padding: '3px 11px', fontSize: 11.5, fontWeight: 700, color: '#A87A2C', fontFamily: 'var(--font-ui)' }}>▲ Por prioridad</button>
          <button type="button" disabled={!puede} onClick={() => ordenarPor('entrega')} title="La fecha de entrega más cercana primero"
            style={{ cursor: puede ? 'pointer' : 'not-allowed', border: '1px solid rgba(194,147,58,0.45)', background: 'rgba(194,147,58,0.10)', borderRadius: 99, padding: '3px 11px', fontSize: 11.5, fontWeight: 700, color: '#A87A2C', fontFamily: 'var(--font-ui)' }}>⚑ Por entrega</button>
          <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)' }}>guarda ese orden; luego puedes ajustarlo arrastrando</span>
        </div>
      )}

      <div ref={listRef} style={{ marginTop: 8 }}>
        {abiertas.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)', padding: '14px 4px' }}>
            {enOrdenEp.length === 0 ? 'Esta épica aún no tiene tareas.' : 'Ninguna tarea abierta con este filtro.'} Escribe la primera aquí abajo.
          </div>
        )}
        {abiertas.map((t, k) => (
          <div key={t.id}>
            {dragId && dropTo === k && insLine}
            {fila(t, k)}
          </div>
        ))}
        {dragId && dropTo === abiertas.length && insLine}
      </div>

      {/* Alta: Enter crea la tarea YA colgada de lo que está filtrado y deja el foco para meter varias seguidas */}
      <div className="rm-noprint" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 6px 2px' }}>
        <span aria-hidden style={{ color: '#A87A2C', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>＋</span>
        <input value={nueva} onChange={ev => setNueva(ev.target.value)} aria-label="Nueva tarea"
          onKeyDown={ev => {
            if (ev.key !== 'Enter' || ev.nativeEvent.isComposing) return
            const v = nueva.trim(); if (!v) return
            if (onCrear(ep.id, v, featSel?.id ?? null, iniSel?.id ?? null)) setNueva('')
          }}
          placeholder={`Nueva tarea en «${iniSel?.nombre || featSel?.t || ep.name}»… (Enter para crear)`}
          style={{ flex: 1, minWidth: 0, border: '1px solid transparent', borderBottom: '1px dashed rgba(194,147,58,0.55)', padding: '6px 2px', fontSize: 13, fontWeight: 600, color: '#16365F', background: 'transparent', fontFamily: 'var(--font-ui)' }} />
      </div>

      {terminadas.length > 0 && (
        <div className="rm-noprint" style={{ marginTop: 12 }}>
          <button onClick={() => setVerTerminadas(v => !v)} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 99, padding: '3px 11px', fontSize: 11.5, fontWeight: 700, color: 'rgba(20,35,61,0.6)', fontFamily: 'var(--font-ui)' }}>
            {verTerminadas ? 'Ocultar' : 'Ver'} terminadas · {terminadas.length}
          </button>
          {verTerminadas && (
            <div style={{ marginTop: 6 }}>
              {terminadas.map(t => (
                <button key={t.id} onClick={() => onAbrir(ep.id, t.id!)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '5px 4px', border: 'none', borderBottom: '1px solid rgba(15,35,64,0.05)', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)' }}>
                  <span style={{ color: '#2E6E6E', fontWeight: 800, fontSize: 12 }}>✓</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'rgba(20,35,61,0.5)', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
