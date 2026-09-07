'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import SiteHeader from '@/components/SiteHeader'
import SectionNav from '@/components/SectionNav'
import type { Epica } from '@/lib/supabase'
import { pctOf, taskCount, doneCount, hexA } from '@/components/epicas/core'

const DAY_MS = 86400000
const DAY_W = 7   // px por día en el Gantt
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const parseD = (s?: string | null) => (s ? new Date(s + 'T00:00:00') : null)
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS)
const fmtD = (s?: string | null) => { if (!s) return '?'; const d = parseD(s)!; return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}` }

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 14 }
const eb: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }
const field: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.16)', borderRadius: 8, padding: '6px 8px', fontSize: 12.5, color: '#16365F', background: '#fff', outline: 'none' }
const banner: CSSProperties = { marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: 'rgba(176,82,46,0.08)', border: '1px solid rgba(176,82,46,0.3)', fontSize: 12.5, color: '#B0522E' }
const iconBtn: CSSProperties = { flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', borderRadius: 8, height: 28, width: 28, color: 'rgba(20,35,61,0.5)', fontSize: 12.5 }

export default function RoadmapClient() {
  const [epicas, setEpicas] = useState<Epica[] | null>(null)
  const [roadmapReady, setRoadmapReady] = useState(true)
  const [err, setErr] = useState('')
  const [editKey, setEditKey] = useState<string | null>(null)   // epicaId, o `${epicaId}:${featureId}`
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    fetch('/api/epicas').then(r => r.json()).then(j => {
      if (!j.ok) { setErr(j.error || 'No se pudo cargar'); return }
      setEpicas(j.data || []); setRoadmapReady(!!j.roadmapReady)
    }).catch(() => setErr('No se pudo cargar'))
  }, [])

  const startEdit = (key: string, start?: string | null, end?: string | null) => {
    setEditKey(editKey === key ? null : key); setEditStart(start || ''); setEditEnd(end || '')
  }

  const saveEpicaDates = async (id: string) => {
    const body = { roadmap_start: editStart || null, roadmap_end: editEnd || null }
    const r = await fetch(`/api/epicas/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => null)
    if (r?.ok) { setEpicas(prev => (prev || []).map(e => e.id === id ? { ...e, roadmap_start: body.roadmap_start, roadmap_end: body.roadmap_end } : e)); setEditKey(null) }
    else setErr(r?.error || 'No se pudo guardar')
  }
  const saveFeatureDates = async (epicaId: string, featureId: string) => {
    const e = (epicas || []).find(x => x.id === epicaId); if (!e) return
    const features = (e.features || []).map(f => f.id === featureId ? { ...f, roadmapStart: editStart || undefined, roadmapEnd: editEnd || undefined } : f)
    const r = await fetch(`/api/epicas/${epicaId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ features }) }).then(x => x.json()).catch(() => null)
    if (r?.ok) { setEpicas(prev => (prev || []).map(x => x.id === epicaId ? { ...x, features } : x)); setEditKey(null) }
    else setErr(r?.error || 'No se pudo guardar')
  }

  const active = (epicas || []).filter(e => !e.archived).sort((a, b) => a.epic_order - b.epic_order)
  const archived = (epicas || []).filter(e => e.archived)

  // Rango del Gantt: entre lo más antiguo/nuevo de lo que SÍ tiene fecha (+ hoy), con un mes de margen.
  const allDates: Date[] = []
  active.forEach(e => {
    const s = parseD(e.roadmap_start), en = parseD(e.roadmap_end)
    if (s) allDates.push(s); if (en) allDates.push(en)
    ;(e.features || []).forEach(f => { const fs = parseD(f.roadmapStart), fe = parseD(f.roadmapEnd); if (fs) allDates.push(fs); if (fe) allDates.push(fe) })
  })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const hasDates = allDates.length > 0
  const rangeStart = hasDates ? addMonths(new Date(Math.min(...allDates.map(d => d.getTime()), today.getTime())), -1) : addMonths(today, -1)
  const rangeEnd = hasDates ? addMonths(new Date(Math.max(...allDates.map(d => d.getTime()), today.getTime())), 2) : addMonths(today, 6)
  const totalDays = Math.max(30, daysBetween(rangeStart, rangeEnd))
  const xOf = (d: Date) => daysBetween(rangeStart, d) * DAY_W
  const wOf = (a: Date, b: Date) => Math.max(DAY_W * 2, daysBetween(a, b) * DAY_W)

  const months: Date[] = []
  { let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1); while (m <= rangeEnd) { months.push(m); m = addMonths(m, 1) } }

  const ganttEpicas = active.filter(e => e.roadmap_start || e.roadmap_end || (e.features || []).some(f => f.roadmapStart || f.roadmapEnd))

  const dateEditor = (onSave: () => void) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
      <input type="date" value={editStart} onChange={ev => setEditStart(ev.target.value)} style={field} />
      <span style={{ color: 'rgba(20,35,61,0.4)' }}>→</span>
      <input type="date" value={editEnd} onChange={ev => setEditEnd(ev.target.value)} style={field} />
      <button onClick={onSave} style={{ cursor: 'pointer', border: 'none', borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 700, background: '#10233F', color: '#fff' }}>Guardar</button>
      <button onClick={() => setEditKey(null)} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>Cancelar</button>
    </div>
  )

  const row = (e: Epica) => {
    const pct = pctOf(e)
    const editing = editKey === e.id
    const feats = e.features || []
    const isOpen = expanded.has(e.id)
    return (
      <div key={e.id} style={{ ...card, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {feats.length > 0 && (
            <button onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n })} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.4)', fontSize: 11, flexShrink: 0 }}>{isOpen ? '▾' : '▸'}</button>
          )}
          <span style={{ width: 10, height: 10, borderRadius: 99, background: e.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: '#16365F' }}>{e.name}</span>
          {feats.length > 0 && <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>{feats.length} feature{feats.length === 1 ? '' : 's'}</span>}
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{doneCount(e)}/{taskCount(e)} · {pct}%</span>
          <button onClick={() => startEdit(e.id, e.roadmap_start, e.roadmap_end)} title="Fechas objetivo" style={iconBtn}>✎</button>
        </div>
        {(e.roadmap_start || e.roadmap_end) && !editing && (
          <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.5)', marginTop: 6, marginLeft: feats.length > 0 ? 34 : 20 }}>{fmtD(e.roadmap_start)} → {fmtD(e.roadmap_end)}</div>
        )}
        {editing && dateEditor(() => saveEpicaDates(e.id))}
        {isOpen && feats.length > 0 && (
          <div style={{ marginTop: 10, marginLeft: 34, paddingLeft: 12, borderLeft: '2px solid rgba(15,35,64,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {feats.map(f => {
              const fkey = `${e.id}:${f.id}`
              const fediting = editKey === fkey
              return (
                <div key={f.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: f.color || e.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#16365F' }}>{f.t}</span>
                    <button onClick={() => startEdit(fkey, f.roadmapStart, f.roadmapEnd)} title="Fechas objetivo del feature" style={{ ...iconBtn, height: 24, width: 24, fontSize: 11 }}>✎</button>
                  </div>
                  {(f.roadmapStart || f.roadmapEnd) && !fediting && <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: 4, marginLeft: 15 }}>{fmtD(f.roadmapStart)} → {fmtD(f.roadmapEnd)}</div>}
                  {fediting && dateEditor(() => saveFeatureDates(e.id, f.id))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3efe6', color: '#10233F' }}>
      <SiteHeader title="Roadmap" subtitle="A dónde vamos · ADVL" backHref="/" backLabel="← Accesos" extra={<SectionNav current="roadmap" />} />
      <main style={{ maxWidth: 1080, margin: '18px auto 60px', padding: '0 20px' }}>
        <div style={{ marginBottom: 18 }}>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: '#10233F' }}>🗺️ Roadmap</div>
          <div style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.55)', marginTop: 4 }}>Hacia dónde va cada épica (y sus features) y cuándo. Ponle fecha objetivo a una desde la lista de abajo — aparece arriba en la línea de tiempo.</div>
        </div>

        {!roadmapReady && <div style={banner}>Corre <code>sql/epicas-17-roadmap.sql</code> en Supabase para guardar fechas objetivo.</div>}
        {err && <div onClick={() => setErr('')} style={{ ...banner, cursor: 'pointer' }}>{err} · toca para cerrar</div>}

        {epicas === null ? (
          <div style={{ fontSize: 13, color: 'rgba(20,35,61,0.45)' }}>Cargando…</div>
        ) : (
          <>
            <div style={{ ...card, padding: 16, marginBottom: 24, overflowX: 'auto' }}>
              {ganttEpicas.length === 0 ? (
                <div style={{ fontSize: 13, color: 'rgba(20,35,61,0.45)', padding: '16px 4px' }}>Sin fechas puestas todavía. Ponle fecha objetivo a una épica en la lista de abajo para verla aquí.</div>
              ) : (
                <div style={{ position: 'relative', width: totalDays * DAY_W, minWidth: '100%' }}>
                  <div style={{ position: 'relative', height: 24, borderBottom: '1px solid rgba(15,35,64,0.10)', marginBottom: 10 }}>
                    {months.map((m, i) => (
                      <div key={i} style={{ position: 'absolute', left: xOf(m), top: 0, bottom: 0, borderLeft: '1px solid rgba(15,35,64,0.08)', paddingLeft: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.5)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{MES[m.getMonth()]} {m.getFullYear()}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div title="Hoy" style={{ position: 'absolute', left: xOf(today), top: 0, bottom: 0, width: 2, background: '#B0522E', zIndex: 2 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                      {ganttEpicas.map(e => {
                        const s = parseD(e.roadmap_start) || parseD(e.roadmap_end) || today
                        const en = parseD(e.roadmap_end) || parseD(e.roadmap_start) || today
                        const feats = (e.features || []).filter(f => f.roadmapStart || f.roadmapEnd)
                        return (
                          <div key={e.id} style={{ position: 'relative', height: feats.length ? 26 + feats.length * 22 : 26 }}>
                            <div title={`${e.name} · ${fmtD(e.roadmap_start)} → ${fmtD(e.roadmap_end)}`} style={{ position: 'absolute', left: xOf(s), width: wOf(s, en), height: 26, borderRadius: 8, background: e.color, display: 'flex', alignItems: 'center', padding: '0 10px', overflow: 'hidden' }}>
                              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{e.name}</span>
                            </div>
                            {feats.map((f, fi) => {
                              const fs = parseD(f.roadmapStart) || parseD(f.roadmapEnd) || today
                              const fe = parseD(f.roadmapEnd) || parseD(f.roadmapStart) || today
                              return (
                                <div key={f.id} title={`${f.t} · ${fmtD(f.roadmapStart)} → ${fmtD(f.roadmapEnd)}`} style={{ position: 'absolute', left: xOf(fs), top: 28 + fi * 22, width: wOf(fs, fe), height: 18, borderRadius: 6, background: hexA(f.color || e.color, 0.6), display: 'flex', alignItems: 'center', padding: '0 8px', overflow: 'hidden' }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{f.t}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={eb}>Épicas · en orden</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {active.length === 0 && <div style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.45)' }}>Sin épicas activas.</div>}
              {active.map(row)}
            </div>

            {archived.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <button onClick={() => setShowArchived(v => !v)} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.5)', fontSize: 12, fontWeight: 700 }}>
                  {showArchived ? '▾' : '▸'} {archived.length} archivada{archived.length === 1 ? '' : 's'}
                </button>
                {showArchived && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>{archived.map(row)}</div>}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
