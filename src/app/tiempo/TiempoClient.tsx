'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AREAS, AREA_IDS, areaOf, hm, clock, parseClock, todayISO, addDays,
  weekDays, longDate, shortLabel, nowMinutes, hourRange,
  type Actividad, type AreaId,
} from '@/lib/tiempo'

/* Paleta del sistema de diseño "Margen". Se usa inline para no acoplar la
   sección al Tailwind del resto de la app (que es navy/oro). */
const C = {
  page: '#f2ece2', surface: '#faf7f1', surfaceAlt: '#f5efe4', tint: '#f3ece1',
  line: '#e7dfd2', lineSoft: '#eee6da', lineInput: '#e2d9cb', dashed: '#ccc2b2',
  ink: '#1c1a17', inkHover: '#2e2a25', inkSoft: '#4c4741',
  muted: '#6b645b', faint: '#8b8379', ghost: '#a49b90',
  accent: '#b4653a', accentDeep: '#8a4b28', danger: '#8a3c2a', sage: '#6f8256',
}
const SERIF = 'var(--tiempo-serif), Georgia, serif'
const UI = 'var(--tiempo-ui), system-ui, sans-serif'
const PPH = 60           // píxeles por hora en la vista Día
const ROW_H = 76         // alto de cada mini-línea en la vista Semana

type Preview = { id: string; fecha: string; inicio: number | null }
type DragState = {
  id: string; dur: number; kind: 'block' | 'chip'; grab: number
  moved: boolean; sx: number; sy: number
}

export default function TiempoClient({ initial, ready }: { initial: Actividad[]; ready: boolean }) {
  const [acts, setActs] = useState<Actividad[]>(initial)
  const [view, setView] = useState<'dia' | 'semana'>('dia')
  const [viewDate, setViewDate] = useState<string>(todayISO())
  const [now, setNow] = useState<number>(nowMinutes())
  const [edit, setEdit] = useState<Actividad | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [toast, setToast] = useState<string>('')

  // Refs espejo para los handlers globales de puntero (no dependen del render).
  const actsRef = useRef(acts); useEffect(() => { actsRef.current = acts }, [acts])
  const previewRef = useRef(preview); useEffect(() => { previewRef.current = preview }, [preview])
  const dragRef = useRef<DragState | null>(null)
  const suppressClick = useRef(0)

  // Reloj: la línea de "ahora" y el resaltado del día se refrescan solos.
  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 20000)
    const onVis = () => setNow(nowMinutes())
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }, [])

  /* ── Persistencia (optimista) ───────────────────────────────────────────── */
  const refetch = useCallback(async () => {
    try {
      const r = await fetch('/api/tiempo'); const j = await r.json()
      if (j.ok) setActs(j.data)
    } catch { /* sin red: se queda con lo local */ }
  }, [])

  const patch = useCallback(async (id: string, p: Partial<Actividad>) => {
    setActs(prev => prev.map(a => a.id === id ? { ...a, ...p } : a))
    try {
      const r = await fetch(`/api/tiempo/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      })
      if (!(await r.json()).ok) throw new Error()
    } catch { flash('No se pudo guardar · reintenta'); refetch() }
  }, [flash, refetch])

  const createAt = useCallback(async (fecha: string, inicio: number | null) => {
    const body = { fecha, area: 'ocio' as AreaId, titulo: '', inicio, dur: 30, hecho: false, nota: '' }
    try {
      const r = await fetch('/api/tiempo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      setActs(prev => [...prev, j.data]); setEdit(j.data)
    } catch { flash('No se pudo crear la actividad') }
  }, [flash])

  const remove = useCallback(async (id: string) => {
    setActs(prev => prev.filter(a => a.id !== id)); setEdit(null)
    try { await fetch(`/api/tiempo/${id}`, { method: 'DELETE' }) } catch { flash('No se pudo borrar'); refetch() }
  }, [flash, refetch])

  /* ── Actividades "efectivas" (aplican el preview del arrastre en vivo) ───── */
  const eff = useMemo<Actividad[]>(() => {
    if (!preview) return acts
    return acts.map(a => a.id === preview.id ? { ...a, fecha: preview.fecha, inicio: preview.inicio } : a)
  }, [acts, preview])

  /* ── Arrastre unificado (Día y Semana; hora + entre días + agendar) ─────── */
  const startDrag = (e: React.PointerEvent, a: Actividad, kind: 'block' | 'chip') => {
    e.preventDefault()
    let grab = 0
    if (kind === 'block' && a.inicio != null) {
      const r = e.currentTarget.getBoundingClientRect()
      grab = view === 'dia'
        ? ((e.clientY - r.top) / Math.max(1, r.height)) * a.dur
        : ((e.clientX - r.left) / Math.max(1, r.width)) * a.dur
    }
    dragRef.current = { id: a.id, dur: a.dur, kind, grab, moved: false, sx: e.clientX, sy: e.clientY }
    setDragId(a.id)
  }

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true
      if (!d.moved) return
      e.preventDefault()
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const drop = el?.closest('[data-drop]') as HTMLElement | null
      if (!drop) return
      const fecha = drop.getAttribute('data-fecha')!
      if (drop.getAttribute('data-drop') === 'backlog') { setPreview({ id: d.id, fecha, inicio: null }); return }
      const lo = +drop.dataset.lo!, hi = +drop.dataset.hi!, orient = drop.dataset.orient
      const r = drop.getBoundingClientRect()
      const frac = orient === 'v' ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width
      let mins = lo + Math.max(0, Math.min(1, frac)) * (hi - lo) - d.grab
      mins = Math.round(mins / 15) * 15
      mins = Math.max(0, Math.min(1440 - d.dur, mins))
      setPreview({ id: d.id, fecha, inicio: mins })
    }
    const onUp = () => {
      const d = dragRef.current; dragRef.current = null; setDragId(null)
      if (!d) return
      if (!d.moved) {                                   // fue un clic → abrir editor
        const a = actsRef.current.find(x => x.id === d.id)
        setPreview(null); if (a) setEdit({ ...a }); return
      }
      suppressClick.current = Date.now()                // evita crear al soltar sobre el track
      const p = previewRef.current; setPreview(null)
      const a = actsRef.current.find(x => x.id === d.id)
      if (!a || !p) return
      if (a.fecha === p.fecha && a.inicio === p.inicio) return
      patch(a.id, { fecha: p.fecha, inicio: p.inicio })
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [view, patch])

  const trackClick = (fecha: string, lo: number, hi: number, orient: 'v' | 'h') =>
    (e: React.MouseEvent) => {
      if (Date.now() - suppressClick.current < 300) return
      if ((e.target as HTMLElement).closest('[data-block]')) return
      const r = e.currentTarget.getBoundingClientRect()
      const frac = orient === 'v' ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width
      const mins = Math.max(0, Math.min(1425, Math.round((lo + frac * (hi - lo)) / 15) * 15))
      createAt(fecha, mins)
    }

  const today = todayISO()

  return (
    <div style={{ minHeight: '100vh', background: C.page, color: C.ink, fontFamily: UI, paddingBottom: 72 }}>
      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 20px 8px', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1 }}>Tiempo</span>
          <span style={{ fontSize: 13, color: C.ghost }}>tu día y tu semana, con margen</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: SERIF, fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{clock(now)}</span>
          <div style={{ display: 'flex', gap: 4, background: '#e7dfd2', padding: 4, borderRadius: 999 }}>
            {(['dia', 'semana'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                border: 'none', cursor: 'pointer', padding: '8px 18px', borderRadius: 999, fontSize: 14, fontWeight: 500, fontFamily: UI,
                background: view === v ? C.surface : 'transparent', color: view === v ? C.ink : C.muted,
              }}>{v === 'dia' ? 'Día' : 'Semana'}</button>
            ))}
          </div>
          <Link href="/" style={{ fontSize: 12, fontWeight: 600, color: C.muted, textDecoration: 'none', border: `1px solid ${C.lineInput}`, borderRadius: 10, padding: '8px 12px' }}>← Accesos</Link>
        </div>
      </div>

      {!ready && (
        <div style={{ maxWidth: 1180, margin: '10px auto 0', padding: '0 20px' }}>
          <div style={{ background: '#f6e3dd', border: `1px solid #e8cabf`, borderRadius: 16, padding: '14px 18px', fontSize: 14, color: C.danger }}>
            Falta crear la tabla en Supabase. Corre <b>sql/tiempo-01-schema.sql</b> en el SQL editor y recarga.
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 20px 0' }}>
        {view === 'dia'
          ? <DayView date={viewDate} today={today} acts={eff} now={now}
              setDate={setViewDate} startDrag={startDrag} previewId={preview?.id ?? null}
              trackClick={trackClick} onNew={() => createAt(viewDate, null)} />
          : <WeekView date={viewDate} today={today} acts={eff}
              setDate={setViewDate} startDrag={startDrag} previewId={preview?.id ?? null}
              trackClick={trackClick} />}
      </div>

      {edit && (
        <Editor a={edit} onChange={setEdit}
          onSave={() => { const e = edit; setEdit(null); patch(e.id, { titulo: e.titulo, area: e.area, fecha: e.fecha, inicio: e.inicio, dur: e.dur, nota: e.nota, hecho: e.hecho }) }}
          onClose={() => setEdit(null)} onDelete={() => remove(edit.id)} />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: C.ink, color: C.surface, padding: '12px 20px', borderRadius: 999, fontSize: 14, zIndex: 60 }}>{toast}</div>
      )}
      {dragId && <style>{`body{user-select:none;-webkit-user-select:none;}`}</style>}
    </div>
  )
}

/* ─────────────────────────── Vista Día ─────────────────────────── */
function DayView({ date, today, acts, now, setDate, startDrag, previewId, trackClick, onNew }: {
  date: string; today: string; acts: Actividad[]; now: number
  setDate: (d: string) => void
  startDrag: (e: React.PointerEvent, a: Actividad, k: 'block' | 'chip') => void
  previewId: string | null
  trackClick: (fecha: string, lo: number, hi: number, o: 'v' | 'h') => (e: React.MouseEvent) => void
  onNew: () => void
}) {
  const dayActs = acts.filter(a => a.fecha === date)
  const scheduled = dayActs.filter(a => a.inicio != null)
  const backlog = dayActs.filter(a => a.inicio == null)
  const [lo, hi] = hourRange(scheduled)
  const height = ((hi - lo) / 60) * PPH
  const totalDur = scheduled.reduce((s, a) => s + a.dur, 0)
  const isToday = date === today

  return (
    <>
      <SummaryBar
        title={longDate(date)}
        meta={`${dayActs.length} ${dayActs.length === 1 ? 'actividad' : 'actividades'} · ${hm(totalDur)} agendadas`}
        onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))}
        onToday={() => setDate(today)} todayLabel="Hoy" isToday={isToday}
        action={<GhostBtn onClick={onNew}>+ Nueva actividad</GhostBtn>} />

      {/* Por acomodar (backlog) — también es zona para soltar y quitar la hora */}
      <div data-drop="backlog" data-fecha={date} style={{
        marginTop: 14, background: C.surfaceAlt, border: `1px dashed ${C.dashed}`, borderRadius: 16,
        padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minHeight: 52,
      }}>
        <span style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ghost, fontWeight: 600, marginRight: 4 }}>por acomodar</span>
        {backlog.length === 0 && <span style={{ fontSize: 13, color: C.ghost }}>Arrastra aquí para quitar la hora, o crea una nueva.</span>}
        {backlog.map(a => <Chip key={a.id} a={a} startDrag={startDrag} previewId={previewId} />)}
      </div>

      {/* Línea de tiempo vertical */}
      <div style={{ marginTop: 16, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 24, padding: 20, display: 'flex' }}>
        <div style={{ width: 46, flexShrink: 0, position: 'relative', height }}>
          {Array.from({ length: (hi - lo) / 60 + 1 }, (_, i) => (
            <span key={i} style={{ position: 'absolute', top: i * PPH - 7, right: 8, fontSize: 11, color: C.ghost, fontVariantNumeric: 'tabular-nums' }}>{clock(lo + i * 60)}</span>
          ))}
        </div>
        <div data-drop="day" data-fecha={date} data-orient="v" data-lo={lo} data-hi={hi}
          onClick={trackClick(date, lo, hi, 'v')}
          style={{ position: 'relative', flex: 1, height, borderLeft: `1px solid ${C.lineSoft}`, cursor: 'copy' }}>
          {Array.from({ length: (hi - lo) / 60 + 1 }, (_, i) => (
            <div key={i} style={{ position: 'absolute', top: i * PPH, left: 0, right: 0, borderTop: `1px solid ${C.lineSoft}` }} />
          ))}
          {isToday && now >= lo && now <= hi && (
            <div style={{ position: 'absolute', top: ((now - lo) / 60) * PPH, left: 0, right: 0, height: 0, borderTop: `2px solid ${C.accent}`, zIndex: 5 }}>
              <span style={{ position: 'absolute', left: -6, top: -4, width: 8, height: 8, borderRadius: 999, background: C.accent }} />
            </div>
          )}
          {scheduled.map(a => {
            const area = areaOf(a.area)
            const top = ((a.inicio! - lo) / 60) * PPH
            const h = Math.max(26, (a.dur / 60) * PPH)
            return (
              <div key={a.id} data-block onPointerDown={e => startDrag(e, a, 'block')}
                style={{
                  position: 'absolute', top, left: 8, right: 8, height: h, boxSizing: 'border-box',
                  background: area.soft, borderLeft: `3px solid ${area.color}`, borderRadius: 12, padding: '5px 10px',
                  overflow: 'hidden', cursor: 'grab', touchAction: 'none', zIndex: previewId === a.id ? 20 : 10,
                  opacity: a.hecho ? 0.5 : 1, pointerEvents: previewId === a.id ? 'none' : 'auto',
                  boxShadow: previewId === a.id ? '0 8px 20px rgba(28,26,23,.18)' : 'none',
                }}>
                <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.25, textDecoration: a.hecho ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo || 'Sin título'}</div>
                {h > 34 && <div style={{ fontSize: 11, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{clock(a.inicio!)}–{clock(a.inicio! + a.dur)} · {hm(a.dur)}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

/* ─────────────────────────── Vista Semana ─────────────────────────── */
function WeekView({ date, today, acts, setDate, startDrag, previewId, trackClick }: {
  date: string; today: string; acts: Actividad[]
  setDate: (d: string) => void
  startDrag: (e: React.PointerEvent, a: Actividad, k: 'block' | 'chip') => void
  previewId: string | null
  trackClick: (fecha: string, lo: number, hi: number, o: 'v' | 'h') => (e: React.MouseEvent) => void
}) {
  const days = weekDays(date)
  const set = new Set(days)
  const weekActs = acts.filter(a => set.has(a.fecha) && a.inicio != null)
  const [lo, hi] = hourRange(weekActs)
  const span = hi - lo
  const hours = Array.from({ length: (hi - lo) / 60 + 1 }, (_, i) => lo + i * 60)

  return (
    <>
      <SummaryBar
        title={`Semana del ${Number(days[0].slice(8))} al ${Number(days[6].slice(8))}`}
        meta={`${weekActs.length} agendadas · ${hm(weekActs.reduce((s, a) => s + a.dur, 0))}`}
        onPrev={() => setDate(addDays(date, -7))} onNext={() => setDate(addDays(date, 7))}
        onToday={() => setDate(today)} todayLabel="Esta semana" isToday={set.has(today)} />

      <div style={{ marginTop: 16, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 24, padding: '16px 18px' }}>
        {/* Cabecera de horas alineada con los tracks */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ width: 68, flexShrink: 0 }} />
          <div style={{ position: 'relative', flex: 1, height: 14 }}>
            {hours.map(h => (
              <span key={h} style={{ position: 'absolute', left: `${((h - lo) / span) * 100}%`, transform: 'translateX(-50%)', fontSize: 10, color: C.ghost, fontVariantNumeric: 'tabular-nums' }}>{clock(h)}</span>
            ))}
          </div>
        </div>

        {days.map(iso => {
          const dayActs = acts.filter(a => a.fecha === iso && a.inicio != null)
          const nUn = acts.filter(a => a.fecha === iso && a.inicio == null).length
          const isToday = iso === today
          return (
            <div key={iso} style={{ display: 'flex', alignItems: 'stretch', borderTop: `1px solid ${C.lineSoft}` }}>
              <button onClick={() => { setDate(iso) }} title="Ver este día"
                style={{ width: 68, flexShrink: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', padding: '8px 6px 8px 2px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: isToday ? C.accent : C.ink }}>{shortLabel(iso)}</span>
                {nUn > 0 && <span style={{ fontSize: 10, color: C.ghost }}>+{nUn} sin hora</span>}
              </button>
              <div data-drop="day" data-fecha={iso} data-orient="h" data-lo={lo} data-hi={hi}
                onClick={trackClick(iso, lo, hi, 'h')}
                style={{ position: 'relative', flex: 1, height: ROW_H, cursor: 'copy', background: isToday ? 'rgba(180,101,58,0.04)' : 'transparent' }}>
                {hours.map(h => (
                  <div key={h} style={{ position: 'absolute', left: `${((h - lo) / span) * 100}%`, top: 6, bottom: 6, borderLeft: `1px solid ${C.lineSoft}` }} />
                ))}
                {isToday && (() => { const n = nowMinutes(); return n >= lo && n <= hi ? <div style={{ position: 'absolute', left: `${((n - lo) / span) * 100}%`, top: 2, bottom: 2, borderLeft: `2px solid ${C.accent}` }} /> : null })()}
                {dayActs.map(a => {
                  const area = areaOf(a.area)
                  const left = ((a.inicio! - lo) / span) * 100
                  const width = (a.dur / span) * 100
                  return (
                    <div key={a.id} data-block onPointerDown={e => startDrag(e, a, 'block')}
                      style={{
                        position: 'absolute', left: `${left}%`, width: `${width}%`, minWidth: 8, top: 8, bottom: 8, boxSizing: 'border-box',
                        background: area.soft, borderLeft: `3px solid ${area.color}`, borderRadius: 9, padding: '3px 7px',
                        overflow: 'hidden', cursor: 'grab', touchAction: 'none', zIndex: previewId === a.id ? 20 : 10,
                        opacity: a.hecho ? 0.5 : 1, pointerEvents: previewId === a.id ? 'none' : 'auto',
                        boxShadow: previewId === a.id ? '0 8px 20px rgba(28,26,23,.18)' : 'none',
                      }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: a.hecho ? 'line-through' : 'none' }}>{a.titulo || 'Sin título'}</div>
                      <div style={{ fontSize: 10, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{clock(a.inicio!)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 12.5, color: C.ghost, margin: '12px 4px 0' }}>Arrastra una actividad dentro de su día para cambiar la hora, o hacia otro día para moverla. Toca el nombre del día para abrirlo. Las de “sin hora” se acomodan desde la vista Día.</p>
    </>
  )
}

/* ─────────────────────────── Piezas compartidas ─────────────────────────── */
function SummaryBar({ title, meta, onPrev, onNext, onToday, todayLabel, isToday, action }: {
  title: string; meta: string
  onPrev: () => void; onNext: () => void; onToday: () => void; todayLabel: string; isToday: boolean
  action?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <NavBtn onClick={onPrev}>‹</NavBtn>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1.1, textTransform: 'capitalize' }}>{title}</span>
          <span style={{ fontSize: 12.5, color: C.ghost }}>{meta}</span>
        </div>
        <NavBtn onClick={onNext}>›</NavBtn>
        {!isToday && <button onClick={onToday} style={{ marginLeft: 4, border: `1px solid ${C.lineInput}`, background: C.tint, color: C.accentDeep, borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: UI }}>{todayLabel}</button>}
      </div>
      {action}
    </div>
  )
}

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${C.lineInput}`, background: C.surface, color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1, fontFamily: UI }}>{children}</button>
}
function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ border: `1px dashed ${C.dashed}`, borderRadius: 999, background: 'transparent', color: C.muted, padding: '10px 18px', fontSize: 14, cursor: 'pointer', fontFamily: UI }}>{children}</button>
}

function Chip({ a, startDrag, previewId }: { a: Actividad; startDrag: (e: React.PointerEvent, a: Actividad, k: 'chip') => void; previewId: string | null }) {
  const area = areaOf(a.area)
  return (
    <div data-block onPointerDown={e => startDrag(e, a, 'chip')} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, background: C.surface, border: `1px solid ${C.lineInput}`,
      borderRadius: 999, padding: '7px 13px', fontSize: 13, cursor: 'grab', touchAction: 'none',
      opacity: previewId === a.id ? 0.5 : (a.hecho ? 0.5 : 1), pointerEvents: previewId === a.id ? 'none' : 'auto',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: area.color }} />
      <span style={{ fontWeight: 500 }}>{a.titulo || 'Sin título'}</span>
      <span style={{ color: C.ghost }}>{hm(a.dur)}</span>
    </div>
  )
}

/* ─────────────────────────── Editor (modal) ─────────────────────────── */
function Editor({ a, onChange, onSave, onClose, onDelete }: {
  a: Actividad; onChange: (a: Actividad) => void; onSave: () => void; onClose: () => void; onDelete: () => void
}) {
  const scheduled = a.inicio != null
  const field: React.CSSProperties = { background: C.surface, border: `1px solid ${C.lineInput}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, fontFamily: UI, color: C.ink, width: '100%', boxSizing: 'border-box' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 100%)', background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: UI }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: SERIF, fontSize: 22 }}>Actividad</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, color: C.ghost, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <input autoFocus value={a.titulo} placeholder="¿Qué vas a hacer?" onChange={e => onChange({ ...a, titulo: e.target.value })} style={{ ...field, fontSize: 16 }} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AREA_IDS.map(id => {
            const ar = AREAS[id], on = a.area === id
            return (
              <button key={id} onClick={() => onChange({ ...a, area: id })} style={{
                border: `1px solid ${on ? ar.color : C.lineInput}`, background: on ? ar.soft : 'transparent',
                color: on ? C.ink : C.muted, borderRadius: 999, padding: '7px 13px', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: UI,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: ar.color }} />{ar.label}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 130, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ghost, fontWeight: 600 }}>Día</span>
            <input type="date" value={a.fecha} onChange={e => onChange({ ...a, fecha: e.target.value })} style={field} />
          </label>
          <label style={{ width: 118, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ghost, fontWeight: 600 }}>Duración</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" min={5} max={1440} step={5} value={a.dur} onChange={e => onChange({ ...a, dur: Math.max(5, Number(e.target.value) || 5) })} style={{ ...field, width: 74 }} />
              <span style={{ fontSize: 13, color: C.ghost }}>min</span>
            </div>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={scheduled} onChange={e => onChange({ ...a, inicio: e.target.checked ? (a.inicio ?? 9 * 60) : null })} />
            Con hora
          </label>
          {scheduled && (
            <input type="time" value={clock(a.inicio!)} onChange={e => onChange({ ...a, inicio: parseClock(e.target.value) })} style={{ ...field, width: 130, fontVariantNumeric: 'tabular-nums' }} />
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginLeft: 'auto' }}>
            <input type="checkbox" checked={a.hecho} onChange={e => onChange({ ...a, hecho: e.target.checked })} />
            Hecha
          </label>
        </div>

        <textarea value={a.nota ?? ''} placeholder="Nota (opcional)" onChange={e => onChange({ ...a, nota: e.target.value })} rows={2} style={{ ...field, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <button onClick={onSave} style={{ flex: 1, background: C.ink, color: C.surface, border: 'none', borderRadius: 999, padding: 14, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: UI }}>Guardar</button>
          <button onClick={onDelete} style={{ border: `1px solid ${C.lineInput}`, background: 'transparent', color: C.danger, borderRadius: 999, padding: '14px 20px', fontSize: 15, cursor: 'pointer', fontFamily: UI }}>Borrar</button>
        </div>
      </div>
    </div>
  )
}
