'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import type { Epica, EpicaKpi, EpicaRoutine, EpicaTask, EpicaLink } from '@/lib/supabase'

/* ─── Tokens de marca (del handoff) ─────────────────────────── */
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DAYNAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const TS_ORDER = ['En curso', 'Esperando', 'Por hacer', 'Terminada']
const EPIC_STATUSES = ['En curso', 'En riesgo', 'Al día', 'En pausa']
const TASK_STATUSES = ['Por hacer', 'En curso', 'Esperando', 'Terminada']
const LINK_TYPES = ['Dashboard', 'Supabase', 'Excel', 'Drive', 'Otro']
const SWATCHES = ['#2E5A9E', '#3E8E8E', '#C2933A', '#7A6FB0', '#B07A56', '#5B6B86']

function statusStyle(s: string) {
  const m: Record<string, { bg: string; color: string }> = {
    'En curso': { bg: 'rgba(62,142,142,0.12)', color: '#2E6E6E' },
    'En riesgo': { bg: 'rgba(176,90,60,0.15)', color: '#B0522E' },
    'Al día': { bg: 'rgba(46,90,158,0.12)', color: '#2E5A9E' },
    'En pausa': { bg: 'rgba(91,107,134,0.15)', color: '#5B6B86' },
  }
  return m[s] || m['En curso']
}
function taskStyle(s: string) {
  const m: Record<string, { c: string; bg: string; label: string; group: string }> = {
    'Por hacer': { c: '#5B6B86', bg: 'rgba(91,107,134,0.12)', label: 'Por hacer', group: 'Por hacer' },
    'En curso': { c: '#2E5A9E', bg: 'rgba(46,90,158,0.12)', label: 'En curso', group: 'En curso' },
    'Esperando': { c: '#A87A2C', bg: 'rgba(194,147,58,0.16)', label: 'Esperando', group: 'Esperando a otros' },
    'Terminada': { c: '#2E6E6E', bg: 'rgba(62,142,142,0.14)', label: 'Terminada', group: 'Terminadas' },
  }
  return m[s] || m['Por hacer']
}
function typeColor(t: string) {
  const m: Record<string, string> = { Dashboard: '#C2933A', Supabase: '#3E8E8E', Excel: '#5B6B86', Drive: '#2E5A9E', Otro: '#7A6FB0' }
  return m[t] || '#7A6FB0'
}

const taskCount = (e: Epica) => (e.tasks || []).length
const doneCount = (e: Epica) => (e.tasks || []).filter(t => t.status === 'Terminada').length
const pendCount = (e: Epica) => (e.tasks || []).filter(t => t.status !== 'Terminada').length
const pctOf = (e: Epica) => { const tot = taskCount(e); return tot > 0 ? Math.round((doneCount(e) / tot) * 100) : 0 }

function fmtDue(s: string) {
  if (!s) return ''
  const d = new Date(s + 'T00:00:00'); if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/** Rellena arrays faltantes por si algún registro viejo trae null. */
function normalize(e: Epica): Epica {
  return {
    ...e,
    categoria: e.categoria ?? null,
    archived: !!e.archived,
    kpis: e.kpis || [],
    routines: (e.routines || []).map(r => ({ t: r.t, days: (r.days && r.days.length === 7) ? r.days : [false, false, false, false, false, false, false] })),
    tasks: e.tasks || [],
    links: e.links || [],
  }
}

/** Días hasta una fecha YYYY-MM-DD (negativo = ya pasó, null = sin fecha). */
function daysUntil(s: string): number | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00'); if (isNaN(d.getTime())) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

/** Color de una fecha de entrega según qué tan cerca está el vencimiento.
 *  Rangos finos para que un abanico de fechas se vea como un abanico de colores. */
function dueTone(due: string, done: boolean) {
  if (done) return { c: '#2E6E6E', border: 'rgba(62,142,142,0.35)', bg: '#fff', label: 'lista' }
  const dl = daysUntil(due)
  if (dl == null) return { c: 'rgba(20,35,61,0.5)', border: 'rgba(15,35,64,0.12)', bg: '#fff', label: 'sin fecha' }
  if (dl < 0)   return { c: '#B0522E', border: 'rgba(176,82,46,0.6)',  bg: 'rgba(176,82,46,0.10)', label: 'vencida' }
  if (dl <= 7)  return { c: '#C2410C', border: 'rgba(194,65,12,0.5)',  bg: 'rgba(194,65,12,0.08)',  label: 'esta semana' }
  if (dl <= 21) return { c: '#A87A2C', border: 'rgba(194,147,58,0.55)', bg: 'rgba(194,147,58,0.12)', label: 'próximas semanas' }
  if (dl <= 45) return { c: '#6F7F3E', border: 'rgba(111,127,62,0.5)',  bg: 'rgba(111,127,62,0.09)', label: 'este mes' }
  return { c: '#2E6E6E', border: 'rgba(62,142,142,0.35)', bg: 'rgba(62,142,142,0.06)', label: 'al día' }
}
function primaryDash(e: Epica) {
  const prim = (e.links || []).find(l => l.primary)
  return prim ? (prim.url || '#') : ((e.links || [])[0]?.url || '#')
}

type EpicDraft = Omit<Epica, 'id'> & { id: string | null }

export default function EpicasDashboard({ initialEpics }: { initialEpics: Epica[] }) {
  const [epics, setEpics] = useState<Epica[]>(initialEpics.map(normalize))
  const [featuredId, setFeaturedId] = useState<string | null>(initialEpics[0]?.id ?? null)
  const [editing, setEditing] = useState<EpicDraft | null>(null)
  const [editMode, setEditMode] = useState<'new' | 'edit' | null>(null)
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const [sortBy, setSortBy] = useState<'Pendientes' | 'Progreso' | 'Nombre'>('Pendientes')
  const [compact, setCompact] = useState(false)
  const [showRowKpi, setShowRowKpi] = useState(true)
  const [estadoFilter, setEstadoFilter] = useState<'activas' | 'archivadas' | 'todas'>('activas')
  const [catFilter, setCatFilter] = useState<string>('todas')
  const [taskEdit, setTaskEdit] = useState<{ epicId: string; index: number | null } | null>(null)
  const [taskDraft, setTaskDraft] = useState<EpicaTask>({ t: '', status: 'Por hacer', due: '', note: '' })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // refresca desde el server al montar (revalidate corto en el page)
  useEffect(() => {
    fetch('/api/epicas').then(r => r.json()).then(j => {
      if (j.ok && Array.isArray(j.data)) {
        const norm = (j.data as Epica[]).map(normalize)
        setEpics(norm)
        setFeaturedId(prev => (prev && norm.some(e => e.id === prev)) ? prev : (norm[0]?.id ?? null))
      }
    }).catch(() => {})
  }, [])

  function showToast(msg: string, error?: boolean) {
    setToast({ msg, error })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  /* ─── Persistencia optimista ─────────────────────────────── */
  async function patchEpic(id: string, changes: Partial<Epica>) {
    const prev = epics
    setEpics(list => list.map(e => (e.id === id ? { ...e, ...changes } : e)))
    try {
      const r = await fetch(`/api/epicas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
    } catch {
      setEpics(prev)
      showToast('No se pudo guardar', true)
    }
  }

  /* ─── Derivados de filtros (activas / archivadas / categoría) ─ */
  const activeEpics = useMemo(() => epics.filter(e => !e.archived), [epics])
  const archivedCount = useMemo(() => epics.filter(e => e.archived).length, [epics])
  const categorias = useMemo(() => {
    const m: Record<string, number> = {}
    activeEpics.forEach(e => { const c = (e.categoria || '').trim(); if (c) m[c] = (m[c] || 0) + 1 })
    return m
  }, [activeEpics])
  const visibleEpics = useMemo(() => epics.filter(e => {
    if (estadoFilter === 'activas' && e.archived) return false
    if (estadoFilter === 'archivadas' && !e.archived) return false
    if (catFilter !== 'todas' && (e.categoria || '') !== catFilter) return false
    return true
  }), [epics, estadoFilter, catFilter])

  const featured = useMemo(() => visibleEpics.find(e => e.id === featuredId) || visibleEpics[0] || epics[0] || null, [visibleEpics, featuredId, epics])

  /* ─── Próximos vencimientos (tareas con fecha ≤45d o vencidas) ─ */
  const vencimientos = useMemo(() => {
    const items: { id: string; epica: string; color: string; task: string; due: string; dl: number }[] = []
    activeEpics.forEach(e => {
      (e.tasks || []).forEach(t => {
        if (t.status === 'Terminada' || !t.due) return
        const dl = daysUntil(t.due)
        if (dl == null || dl > 45) return
        items.push({ id: e.id, epica: e.name, color: e.color, task: t.t, due: t.due, dl })
      })
    })
    return items.sort((a, b) => a.dl - b.dl)
  }, [activeEpics])

  /* ─── Overview (sobre épicas activas, no archivadas) ─────────── */
  const overview = useMemo(() => {
    const src = activeEpics
    const total = src.length
    const activas = src.filter(e => e.status !== 'En pausa').length
    const tareasActivas = src.reduce((n, e) => n + pendCount(e), 0)
    const prom = total ? Math.round(src.reduce((n, e) => n + pctOf(e), 0) / total) : 0
    const riesgo = src.filter(e => e.status === 'En riesgo').length
    return [
      { label: 'Épicas activas', value: String(activas), hint: `de ${total}`, hintColor: 'rgba(20,35,61,0.45)' },
      { label: 'Tareas activas', value: String(tareasActivas), hint: 'por hacer', hintColor: 'rgba(20,35,61,0.45)' },
      { label: 'Progreso prom.', value: `${prom}%`, hint: 'global', hintColor: '#2E6E6E' },
      { label: 'En riesgo', value: String(riesgo), hint: riesgo ? 'requieren foco' : 'todo bien', hintColor: riesgo ? '#B0522E' : '#2E6E6E' },
    ]
  }, [activeEpics])

  const sourceCount = useMemo(
    () => epics.reduce((n, e) => n + (e.source_table ? 1 : 0) + (e.links?.length || 0), 0),
    [epics],
  )

  /* ─── Lista (resto, ordenada) ────────────────────────────── */
  const rest = useMemo(() => {
    const others = visibleEpics.filter(e => e.id !== (featured?.id))
    const sorted = [...others]
    if (sortBy === 'Pendientes') sorted.sort((a, b) => pendCount(b) - pendCount(a))
    else if (sortBy === 'Progreso') sorted.sort((a, b) => pctOf(b) - pctOf(a))
    else sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return sorted
  }, [visibleEpics, featured, sortBy])

  /* ─── Interacciones inline en la destacada ───────────────── */
  const setTaskStatus = (e: Epica, ti: number, v: string) => {
    const tasks = clone(e.tasks); tasks[ti].status = v
    patchEpic(e.id, { tasks })
  }
  const setTaskDue = (e: Epica, ti: number, v: string) => {
    const tasks = clone(e.tasks); tasks[ti].due = v
    patchEpic(e.id, { tasks })
  }
  const toggleRoutineDay = (e: Epica, ri: number, di: number) => {
    const routines = clone(e.routines); routines[ri].days[di] = !routines[ri].days[di]
    patchEpic(e.id, { routines })
  }
  const toggleArchive = (e: Epica) => {
    patchEpic(e.id, { archived: !e.archived })
    showToast(e.archived ? 'Épica reactivada' : 'Épica archivada')
  }

  /* ─── Popup de edición por tarea ─────────────────────────── */
  const openTaskEdit = (epicId: string, index: number | null) => {
    const e = epics.find(x => x.id === epicId)
    setTaskDraft(index != null && e ? clone(e.tasks[index]) : { t: '', status: 'Por hacer', due: '', note: '' })
    setTaskEdit({ epicId, index })
  }
  const closeTaskEdit = () => setTaskEdit(null)
  const saveTask = () => {
    if (!taskEdit) return
    const e = epics.find(x => x.id === taskEdit.epicId); if (!e) { closeTaskEdit(); return }
    const t = { t: (taskDraft.t || '').trim(), status: taskDraft.status || 'Por hacer', due: taskDraft.due || '', note: (taskDraft.note || '').trim() }
    if (!t.t) { closeTaskEdit(); return }
    const tasks = clone(e.tasks)
    if (taskEdit.index != null) tasks[taskEdit.index] = t
    else tasks.push(t)
    patchEpic(e.id, { tasks })
    closeTaskEdit()
  }
  const deleteTask = () => {
    if (!taskEdit || taskEdit.index == null) { closeTaskEdit(); return }
    const e = epics.find(x => x.id === taskEdit.epicId); if (!e) { closeTaskEdit(); return }
    const tasks = clone(e.tasks).filter((_, i) => i !== taskEdit.index)
    patchEpic(e.id, { tasks })
    closeTaskEdit()
  }

  /* ─── Modal ──────────────────────────────────────────────── */
  const openNew = () => {
    setEditMode('new')
    setEditing({
      id: null, name: '', color: '#2E5A9E', description: '', status: 'En curso',
      categoria: '', archived: false,
      source_table: '', source_sync: null, epic_order: epics.length,
      kpis: [{ v: '', l: '' }], routines: [], tasks: [{ t: '', status: 'Por hacer', due: '', note: '' }],
      links: [{ l: 'Dashboard', url: '', primary: true, type: 'Dashboard' }],
    })
  }
  const openEdit = (id: string) => {
    const e = epics.find(x => x.id === id); if (!e) return
    setEditMode('edit'); setEditing(clone(normalize(e)) as EpicDraft)
  }
  const closeEdit = () => { setEditing(null); setEditMode(null) }
  const patchDraft = (fn: (d: EpicDraft) => EpicDraft) => setEditing(d => (d ? fn(clone(d)) : d))

  async function save() {
    if (!editing) return
    const d = clone(editing)
    d.name = (d.name || '').trim() || 'Nueva épica'
    d.kpis = (d.kpis || []).filter(k => (k.v || '').trim() || (k.l || '').trim())
    d.routines = (d.routines || []).filter(r => (r.t || '').trim()).map(r => ({ t: r.t, days: r.days || [false, false, false, false, false, false, false] }))
    d.tasks = (d.tasks || []).filter(t => (t.t || '').trim()).map(t => ({ t: t.t, status: t.status || 'Por hacer', due: t.due || '', note: t.note || '' }))
    d.links = (d.links || []).filter(l => (l.l || '').trim() || (l.url || '').trim())
    d.links.forEach(l => { if (!l.type) l.type = 'Otro' })
    if (!d.links.some(l => l.primary) && d.links.length) d.links[0].primary = true

    const payload = {
      name: d.name, color: d.color, description: d.description || null, status: d.status,
      categoria: (d.categoria || '').trim() || null, archived: !!d.archived,
      source_table: d.source_table || null, source_sync: d.source_sync || null, epic_order: d.epic_order,
      kpis: d.kpis, routines: d.routines, tasks: d.tasks, links: d.links,
    }

    if (editMode === 'new') {
      closeEdit()
      try {
        const r = await fetch('/api/epicas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error)
        const created = normalize(j.data as Epica)
        setEpics(list => [...list, created])
        setFeaturedId(created.id)
        showToast('Épica creada')
      } catch {
        showToast('No se pudo crear', true)
      }
    } else if (d.id) {
      const id = d.id
      closeEdit()
      patchEpic(id, payload)
      showToast('Cambios guardados')
    }
  }

  async function deleteEpic() {
    if (!editing?.id) { closeEdit(); return }
    const id = editing.id
    const prev = epics
    const next = epics.filter(e => e.id !== id)
    setEpics(next)
    setFeaturedId(cur => (cur === id ? (next[0]?.id ?? null) : cur))
    closeEdit()
    try {
      const r = await fetch(`/api/epicas/${id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      showToast('Épica eliminada')
    } catch {
      setEpics(prev)
      showToast('No se pudo eliminar', true)
    }
  }

  /* ─── Estilos compartidos ────────────────────────────────── */
  const lbl: CSSProperties = { display: 'block', font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 7, marginTop: 16 }
  const inpBig: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 11, padding: '11px 13px', fontSize: 15, color: '#14233D', background: '#fff', outline: 'none' }
  const areaBig: CSSProperties = { ...inpBig, resize: 'vertical' }
  const inpSmall: CSSProperties = { flex: 1, minWidth: 0, boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '8px 10px', fontSize: 13, color: '#14233D', background: '#fff', outline: 'none' }
  const inpNarrow: CSSProperties = { ...inpSmall, flex: '0 0 64px', width: 64 }
  const monoInp: CSSProperties = { ...inpSmall, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12 }
  const dateInp: CSSProperties = { border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '6px 8px', fontSize: 12.5, color: '#14233D', background: '#fff', outline: 'none' }
  const delBtn: CSSProperties = { flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 8, height: 32, width: 32, color: 'rgba(20,35,61,0.5)', fontSize: 13 }
  const addBtn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '6px 11px', fontSize: 12, fontWeight: 700 }
  const cardEd: CSSProperties = { background: '#FBFAF6', border: '1px solid rgba(15,35,64,0.08)', borderRadius: 14, padding: '14px 15px', marginTop: 16 }
  const secHead: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }

  if (!featured) {
    return (
      <div style={{ minHeight: '100%' }}>
        <TopBar sourceCount={0} onNew={openNew} />
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '60px 18px', textAlign: 'center', color: 'rgba(20,35,61,0.5)' }}>
          <p style={{ fontSize: 15, marginBottom: 18 }}>Aún no hay épicas. Crea tu primer gran frente.</p>
          <button onClick={openNew} style={goldBtn}>+ Nueva épica</button>
        </div>
        {editing && renderEditor()}
      </div>
    )
  }

  const fSt = statusStyle(featured.status)
  const fPct = pctOf(featured)
  const fDone = doneCount(featured)
  const fTotal = taskCount(featured)

  // conteos por estado para chips
  const fStateCounts = TS_ORDER.map(s => ({ s, n: featured.tasks.filter(t => t.status === s).length })).filter(x => x.n > 0)

  // grupos de tareas (con índice original para editar)
  const indexed = featured.tasks.map((t, i) => ({ ...t, _i: i }))
  const taskGroups = TS_ORDER.map(s => {
    const ts = taskStyle(s)
    return { key: s, color: ts.c, label: ts.group, items: indexed.filter(t => t.status === s) }
  }).filter(g => g.items.length > 0)

  function renderEditor() {
    if (!editing) return null
    const d = editing
    const isEdit = editMode === 'edit'
    return (
      <div onClick={closeEdit} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,22,42,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 20px', overflow: 'auto' }}>
        <div onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 660, background: '#fff', borderRadius: 22, boxShadow: '0 50px 90px -30px rgba(8,18,36,.75)', overflow: 'hidden' }}>
          <div style={{ height: 5, background: d.color }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 16px', borderBottom: '1px solid rgba(15,35,64,0.08)' }}>
            <div>
              <div style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.4)', marginBottom: 5 }}>{isEdit ? 'Editar frente' : 'Nuevo frente'}</div>
              <h3 className="serif" style={{ fontWeight: 600, fontSize: 30, margin: 0, lineHeight: 1, color: '#10233F' }}>{d.name || 'Nueva épica'}</h3>
            </div>
            <button onClick={closeEdit} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 10, height: 36, width: 36, color: 'rgba(20,35,61,0.55)', fontSize: 17 }}>✕</button>
          </div>

          <div style={{ padding: '10px 28px 22px', maxHeight: '72vh', overflow: 'auto' }}>
            <label style={lbl}>Nombre de la épica</label>
            <input value={d.name} onChange={e => patchDraft(x => ({ ...x, name: e.target.value }))} placeholder="Ej. Inmuebles" style={inpBig} />

            <label style={lbl}>Descripción</label>
            <textarea value={d.description || ''} onChange={e => patchDraft(x => ({ ...x, description: e.target.value }))} placeholder="Qué abarca esta épica…" rows={2} style={areaBig} />

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={lbl}>Color</label>
                <div style={{ display: 'flex', gap: 9, marginTop: 2 }}>
                  {SWATCHES.map(c => (
                    <button key={c} onClick={() => patchDraft(x => ({ ...x, color: c }))} style={{ cursor: 'pointer', height: 30, width: 30, borderRadius: 8, background: c, border: d.color === c ? '2px solid #10233F' : '2px solid transparent', boxShadow: d.color === c ? '0 0 0 2px #fff inset' : 'none' }} />
                  ))}
                </div>
              </div>
              <div style={{ flex: '1 1 240px' }}>
                <label style={lbl}>Estado de la épica</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                  {EPIC_STATUSES.map(s => {
                    const on = d.status === s
                    return <button key={s} onClick={() => patchDraft(x => ({ ...x, status: s }))} style={{ cursor: 'pointer', borderRadius: 8, padding: '7px 11px', fontSize: 12, fontWeight: 700, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{s}</button>
                  })}
                </div>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={lbl}>Categoría</label>
                <input list="ep-cats" value={d.categoria || ''} onChange={e => patchDraft(x => ({ ...x, categoria: e.target.value }))} placeholder="Ej. Finanzas, Patrimonio…" style={inpBig} />
                <datalist id="ep-cats">{Object.keys(categorias).map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>

            {/* Fuente de datos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 4px', padding: '12px 14px', borderRadius: 12, background: 'rgba(62,142,142,0.06)', border: '1px solid rgba(62,142,142,0.2)' }}>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 38, width: 38, borderRadius: 10, background: 'rgba(62,142,142,0.12)', color: '#2E6E6E' }}><DbIcon /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '700 9px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#2E6E6E', marginBottom: 6 }}>Fuente de datos · tabla Supabase</div>
                <input value={d.source_table || ''} onChange={e => patchDraft(x => ({ ...x, source_table: e.target.value }))} placeholder="nombre_de_tabla" style={{ ...monoInp, width: '100%' }} />
              </div>
            </div>

            {/* KPIs */}
            <div style={cardEd}>
              <div style={secHead}><label style={{ ...lbl, marginTop: 0 }}>KPIs</label><button onClick={() => patchDraft(x => ({ ...x, kpis: [...x.kpis, { v: '', l: '' }] }))} style={addBtn}>+ KPI</button></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {d.kpis.map((k, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={k.v} onChange={e => patchDraft(x => { x.kpis[i].v = e.target.value; return x })} placeholder="8" style={inpNarrow} />
                    <input value={k.l} onChange={e => patchDraft(x => { x.kpis[i].l = e.target.value; return x })} placeholder="Etiqueta" style={inpSmall} />
                    <button onClick={() => patchDraft(x => ({ ...x, kpis: x.kpis.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Rutinas */}
            <div style={cardEd}>
              <div style={secHead}>
                <div><label style={{ ...lbl, marginTop: 0 }}>Rutinas diarias</label><div style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)', marginTop: 3 }}>Tareas repetitivas que marcas cada día. Se cuentan por semana.</div></div>
                <button onClick={() => patchDraft(x => ({ ...x, routines: [...x.routines, { t: '', days: [false, false, false, false, false, false, false] }] }))} style={addBtn}>+ Rutina</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {d.routines.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, width: 34, borderRadius: 9, background: 'rgba(62,142,142,0.1)', color: '#2E6E6E' }}><RefreshIcon /></span>
                    <input value={r.t} onChange={e => patchDraft(x => { x.routines[i].t = e.target.value; return x })} placeholder="Ej. Revisar mensajes" style={inpSmall} />
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.4)', whiteSpace: 'nowrap' }}>{r.days.filter(Boolean).length}/7</span>
                    <button onClick={() => patchDraft(x => ({ ...x, routines: x.routines.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tareas */}
            <div style={cardEd}>
              <div style={secHead}><label style={{ ...lbl, marginTop: 0 }}>Tareas</label><button onClick={() => patchDraft(x => ({ ...x, tasks: [...x.tasks, { t: '', status: 'Por hacer', due: '', note: '' }] }))} style={addBtn}>+ Tarea</button></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {d.tasks.map((t, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={t.t} onChange={e => patchDraft(x => { x.tasks[i].t = e.target.value; return x })} placeholder="Nombre de la tarea" style={inpSmall} />
                      <button onClick={() => patchDraft(x => ({ ...x, tasks: x.tasks.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {TASK_STATUSES.map(s => {
                        const on = t.status === s; const ts = taskStyle(s)
                        return <button key={s} onClick={() => patchDraft(x => { x.tasks[i].status = s; return x })} style={{ cursor: 'pointer', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, border: on ? `1px solid ${ts.c}` : '1px solid rgba(15,35,64,0.12)', background: on ? ts.bg : '#fff', color: on ? ts.c : 'rgba(20,35,61,0.55)' }}>{ts.label}</button>
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>Entrega</span>
                        <input type="date" value={t.due} onChange={e => patchDraft(x => { x.tasks[i].due = e.target.value; return x })} style={dateInp} />
                      </div>
                      <input value={t.note} onChange={e => patchDraft(x => { x.tasks[i].note = e.target.value; return x })} placeholder="Nota (opcional)" style={inpSmall} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Conexiones */}
            <div style={cardEd}>
              <div style={secHead}>
                <div><label style={{ ...lbl, marginTop: 0 }}>Conexiones</label><div style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)', marginTop: 3 }}>Otras bases y dashboards. La ★ es el dashboard principal.</div></div>
                <button onClick={() => patchDraft(x => ({ ...x, links: [...x.links, { l: '', url: '', type: 'Otro', primary: false }] }))} style={addBtn}>+ Conexión</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
                {d.links.map((l, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <button onClick={() => patchDraft(x => ({ ...x, links: x.links.map((y, j) => ({ ...y, primary: j === i })) }))} title="Dashboard principal" style={{ cursor: 'pointer', flexShrink: 0, height: 32, width: 32, borderRadius: 8, border: l.primary ? '1px solid #C2933A' : '1px solid rgba(15,35,64,0.12)', background: l.primary ? 'rgba(194,147,58,0.14)' : '#fff', color: l.primary ? '#C2933A' : 'rgba(20,35,61,0.3)', fontSize: 14 }}>★</button>
                      <select value={l.type} onChange={e => patchDraft(x => { x.links[i].type = e.target.value; return x })} style={{ ...inpSmall, flex: '0 0 116px', cursor: 'pointer' }}>
                        {LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input value={l.l} onChange={e => patchDraft(x => { x.links[i].l = e.target.value; return x })} placeholder="Nombre" style={inpSmall} />
                      <button onClick={() => patchDraft(x => ({ ...x, links: x.links.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                    </div>
                    <input value={l.url} onChange={e => patchDraft(x => { x.links[i].url = e.target.value; return x })} placeholder="https://…" style={{ ...monoInp, width: '100%' }} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(15,35,64,0.08)' }}>
              {isEdit && <button onClick={deleteEpic} style={{ cursor: 'pointer', border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.08)', color: '#B0522E', borderRadius: 11, padding: '12px 16px', fontSize: 13, fontWeight: 700 }}>Eliminar</button>}
              <span style={{ flex: 1 }} />
              <button onClick={closeEdit} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 11, padding: '12px 18px', fontSize: 13, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>Cancelar</button>
              <button onClick={save} style={{ ...goldBtn, padding: '12px 24px' }}>Guardar</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100%' }}>
      <TopBar sourceCount={sourceCount} onNew={openNew} />

      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '22px 18px 60px' }}>
        {/* SELECTOR DE ÉPICA — lo primero: elige el frente a ver */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9, flexWrap: 'wrap' }}>
            <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.4)' }}>Elige una épica</div>
            <button onClick={openNew} style={{ cursor: 'pointer', border: '1px dashed rgba(15,35,64,0.22)', background: 'transparent', borderRadius: 10, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)' }}>+ Nueva épica</button>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {visibleEpics.map(e => {
              const on = !!featured && e.id === featured.id
              const pend = pendCount(e)
              return (
                <button key={e.id} onClick={() => setFeaturedId(e.id)} title={e.name} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 12, padding: '9px 14px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: on ? `1.5px solid ${e.color}` : '1px solid rgba(15,35,64,0.12)', background: on ? '#fff' : 'rgba(255,255,255,0.55)', color: on ? '#10233F' : 'rgba(20,35,61,0.6)', boxShadow: on ? '0 6px 16px -10px rgba(15,35,64,0.5)' : 'none' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                  {e.name}
                  {pend > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: on ? e.color : 'rgba(20,35,61,0.4)' }}>{pend}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* OVERVIEW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 26 }}>
          {overview.map((t, i) => (
            <div key={i} className="glass" style={{ borderRadius: 15, padding: '15px 17px' }}>
              <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.42)' }}>{t.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 9 }}>
                <span className="serif" style={{ fontWeight: 600, fontSize: 34, lineHeight: .9, color: '#10233F' }}>{t.value}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: t.hintColor }}>{t.hint}</span>
              </div>
            </div>
          ))}
        </div>

        {/* PRÓXIMOS VENCIMIENTOS */}
        {vencimientos.length > 0 && (
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px', marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
              <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>Próximos vencimientos</span>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {([['#B0522E', 'Vencida'], ['#C2410C', 'Esta semana'], ['#A87A2C', '≤3 sem'], ['#6F7F3E', 'Este mes'], ['#2E6E6E', 'Al día']] as const).map(([c, l]) => (
                  <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(20,35,61,0.5)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: c }} />{l}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {vencimientos.slice(0, 8).map((v, i) => {
                const dt = dueTone(v.due, false)
                return (
                  <div key={i} onClick={() => setFeaturedId(v.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 2px', borderBottom: '1px solid rgba(15,35,64,0.06)', cursor: 'pointer', fontSize: 13 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 99, flexShrink: 0, background: dt.c }} />
                    <span style={{ width: 150, flexShrink: 0, fontWeight: 600, color: '#16365F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.epica}</span>
                    <span style={{ flex: 1, minWidth: 0, color: 'rgba(20,35,61,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.task}</span>
                    <span style={{ flexShrink: 0, fontWeight: 700, color: dt.c }}>{v.dl < 0 ? `Vencida · ${fmtDue(v.due)}` : v.dl === 0 ? 'Hoy' : `En ${v.dl} d · ${fmtDue(v.due)}`}</span>
                  </div>
                )
              })}
            </div>
            {vencimientos.length > 8 && <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)', paddingTop: 9 }}>+ {vencimientos.length - 8} más</div>}
          </div>
        )}

        {/* DESTACADA */}
        <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.20em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.4)', marginBottom: 10 }}>Épica destacada</div>
        <div className="ep-pop" style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 20, boxShadow: '0 24px 50px -34px rgba(15,35,64,0.5)', overflow: 'hidden', marginBottom: 34 }}>
          <div style={{ height: 4, background: featured.color }} />
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {/* LEFT */}
            <div style={{ flex: '1 1 360px', minWidth: 300, padding: '26px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ height: 11, width: 11, borderRadius: 99, background: featured.color }} />
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.45)' }}>Épica</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: fSt.bg, color: fSt.color }}>{featured.status}</span>
                {featured.categoria && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: 'rgba(15,35,64,0.06)', color: 'rgba(20,35,61,0.6)' }}>{featured.categoria}</span>}
                {featured.archived && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: 'rgba(20,35,61,0.08)', color: 'rgba(20,35,61,0.5)' }}>Archivada</span>}
                <button onClick={() => openEdit(featured.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}><PencilIcon /> Editar</button>
                <button onClick={() => toggleArchive(featured)} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.55)', borderRadius: 9, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>{featured.archived ? 'Desarchivar' : 'Archivar'}</button>
              </div>
              <h1 className="serif" style={{ fontWeight: 600, fontSize: 46, lineHeight: 1, margin: '0 0 8px', color: '#10233F' }}>{featured.name}</h1>
              {featured.description && <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(20,35,61,0.6)', margin: '0 0 22px', maxWidth: 440 }}>{featured.description}</p>}

              {featured.kpis.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 14, marginBottom: 22 }}>
                  {featured.kpis.map((k, i) => (
                    <div key={i} style={{ borderLeft: '2px solid rgba(15,35,64,0.10)', paddingLeft: 12 }}>
                      <div className="serif" style={{ fontWeight: 600, fontSize: 30, lineHeight: 1, color: '#10233F' }}>{k.v}</div>
                      <div style={{ font: '600 10px/1.2 var(--font-ui)', letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(15,35,61,0.46)', marginTop: 6 }}>{k.l}</div>
                    </div>
                  ))}
                </div>
              )}

              {fStateCounts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                  {fStateCounts.map(({ s, n }) => {
                    const ts = taskStyle(s)
                    return <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, padding: '5px 10px', background: ts.bg, color: ts.c, fontSize: 11.5, fontWeight: 600 }}><span style={{ height: 6, width: 6, borderRadius: 99, background: ts.c }} />{ts.label} <b>{n}</b></span>
                  })}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)' }}>{fDone} / {fTotal} tareas terminadas</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#10233F' }}>{fPct}%</span>
              </div>
              <div style={{ height: 9, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden', marginBottom: 22 }}>
                <div style={{ width: `${fPct}%`, height: '100%', background: featured.color, transition: 'width .4s' }} />
              </div>

              {featured.source_table && (
                <div style={{ border: '1px solid rgba(62,142,142,0.28)', background: 'rgba(62,142,142,0.06)', borderRadius: 12, padding: '11px 13px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="ep-live" style={{ height: 8, width: 8, borderRadius: 99, background: '#3E8E8E' }} />
                    <span style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.16em', textTransform: 'uppercase', color: '#2E6E6E' }}>Fuente de datos</span>
                    {featured.source_sync && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'rgba(20,35,61,0.45)' }}>sync {featured.source_sync}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                    <DbIcon stroke="#2E6E6E" />
                    <span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12.5, fontWeight: 600, color: '#16365F' }}>{featured.source_table}</span>
                    <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.42)' }}>· {featured.links.length} conexiones</span>
                  </div>
                </div>
              )}

              <a href={primaryDash(featured)} target={primaryDash(featured).startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ ...goldBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, fontSize: 13.5 }}>
                Abrir dashboard <ArrowIcon />
              </a>
              {featured.links.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
                  {featured.links.map((ln, i) => {
                    const c = typeColor(ln.type)
                    return (
                      <a key={i} href={ln.url || '#'} target={(ln.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${c}55`, borderRadius: 99, padding: '5px 11px', fontSize: 11.5, fontWeight: 600, color: '#14233D' }}>
                        <span style={{ height: 6, width: 6, borderRadius: 99, background: c }} />{ln.l || ln.type}
                        {ln.primary && <span style={{ color: '#C2933A', fontSize: 11 }}>★</span>}
                      </a>
                    )
                  })}
                </div>
              )}
            </div>

            {/* RIGHT */}
            <div style={{ flex: '1 1 360px', minWidth: 300, padding: '24px 26px', background: '#FBFAF6', borderLeft: '1px solid rgba(15,35,64,0.08)' }}>
              {featured.routines.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                    <RefreshIcon stroke="rgba(15,35,64,0.42)" />
                    <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.42)' }}>Rutinas diarias</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {featured.routines.map((r, ri) => {
                      const n = r.days.filter(Boolean).length
                      const cc = n >= 5 ? '#2E6E6E' : n >= 3 ? '#A87A2C' : 'rgba(20,35,61,0.4)'
                      return (
                        <div key={ri} className="glass" style={{ borderRadius: 12, padding: '11px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#16365F' }}>{r.t}</span>
                            <span style={{ fontSize: 11, fontWeight: 800, color: cc }}>{n}/7</span>
                          </div>
                          <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
                            {r.days.map((on, di) => (
                              <button key={di} onClick={() => toggleRoutineDay(featured, ri, di)} title={DAYNAMES[di]} style={{ flex: 1, height: 24, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: on ? featured.color : 'rgba(15,35,64,0.06)', color: on ? '#fff' : 'rgba(20,35,61,0.4)' }}>{DAYS[di]}</button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.42)' }}>Tareas</span>
                <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>{pendCount(featured)} activas · {fDone} terminadas</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => openTaskEdit(featured.id, null)} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>+ Tarea</button>
              </div>

              {taskGroups.map(g => (
                <div key={g.key} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <span style={{ height: 7, width: 7, borderRadius: 99, background: g.color }} />
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', color: g.color, textTransform: 'uppercase' }}>{g.label}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.3)' }}>{g.items.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {g.items.map(t => {
                      const ts = taskStyle(t.status)
                      const done = t.status === 'Terminada'
                      const dt = dueTone(t.due, done)
                      return (
                        <div key={t._i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid rgba(15,35,64,0.06)' }}>
                          <select value={t.status} onChange={e => setTaskStatus(featured, t._i, e.target.value)} title="Cambiar estado" style={{ flexShrink: 0, cursor: 'pointer', border: `1px solid ${ts.c}44`, background: ts.bg, color: ts.c, borderRadius: 8, padding: '4px 6px', fontSize: 11, fontWeight: 700, outline: 'none' }}>
                            {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <div onClick={() => openTaskEdit(featured.id, t._i)} title="Editar tarea" style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'rgba(20,35,61,0.4)' : '#16365F', textDecoration: done ? 'line-through' : 'none' }}>{t.t}</div>
                            {t.note && <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.42)', marginTop: 2 }}>{t.note}</div>}
                          </div>
                          <input type="date" value={t.due} onChange={e => setTaskDue(featured, t._i, e.target.value)} title={t.due ? `${fmtDue(t.due)} · ${dt.label}` : 'Sin fecha de entrega'} style={{ flexShrink: 0, border: `1px solid ${dt.border}`, borderRadius: 8, padding: '5px 7px', fontSize: 11.5, fontWeight: 600, color: dt.c, background: dt.bg, outline: 'none' }} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* LISTA */}
        {/* filtros: estado (activas/archivadas) + categoría */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'inline-flex', background: 'rgba(15,35,64,0.05)', borderRadius: 11, padding: 3 }}>
            {([['activas', 'Activas', activeEpics.length], ['archivadas', 'Archivadas', archivedCount], ['todas', 'Todas', epics.length]] as const).map(([k, label, n]) => (
              <button key={k} onClick={() => setEstadoFilter(k)} style={{ border: 'none', cursor: 'pointer', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, background: estadoFilter === k ? '#fff' : 'transparent', color: estadoFilter === k ? '#10233F' : 'rgba(20,35,61,0.5)', boxShadow: estadoFilter === k ? '0 1px 2px rgba(15,35,64,0.1)' : 'none' }}>{label} <span style={{ opacity: .55, fontWeight: 500 }}>{n}</span></button>
            ))}
          </div>
          {Object.keys(categorias).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
              {([['todas', 'Todas']] as [string, string][]).concat(Object.keys(categorias).sort().map(c => [c, c] as [string, string])).map(([k, label]) => {
                const on = catFilter === k; const n = k === 'todas' ? null : categorias[k]
                return <button key={k} onClick={() => setCatFilter(k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: 600, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{label}{n != null ? ' · ' + n : ''}</button>
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 14, color: '#B58B35' }}>{rest.length}</span>
          <h2 style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', margin: 0 }}>Todas las épicas</h2>
          <span style={{ height: 1, flex: 1, minWidth: 40, background: 'rgba(15,35,64,0.09)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(['Pendientes', 'Progreso', 'Nombre'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: sortBy === s ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>{s}</button>
            ))}
            <span style={{ width: 1, height: 14, background: 'rgba(15,35,64,0.12)' }} />
            <button onClick={() => setCompact(v => !v)} title="Compacto" style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: compact ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>Compacto</button>
            <button onClick={() => setShowRowKpi(v => !v)} title="Mostrar KPI" style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: showRowKpi ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>KPI</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10 }}>
          {rest.map(e => {
            const st = statusStyle(e.status); const pct = pctOf(e); const pend = pendCount(e)
            const k0 = e.kpis[0]
            return (
              <div key={e.id} onClick={() => setFeaturedId(e.id)} className="glass glass-hover" style={{ display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, padding: compact ? '11px 16px' : '15px 18px', cursor: 'pointer' }}>
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 99, background: e.color, flexShrink: 0 }} />
                <div style={{ flex: '0 0 210px', minWidth: 170 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="serif" style={{ fontWeight: 600, fontSize: 18, color: '#10233F', lineHeight: 1 }}>{e.name}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: st.bg, color: st.color }}>{e.status}</span>
                    {e.categoria && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(15,35,64,0.06)', color: 'rgba(20,35,61,0.55)' }}>{e.categoria}</span>}
                    {e.archived && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(20,35,61,0.08)', color: 'rgba(20,35,61,0.45)' }}>Archivada</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)' }}>{pend > 0 ? `${pend} tareas activas` : 'Al corriente'}</span>
                    {e.routines.length > 0 && <span style={{ fontSize: 10.5, color: '#2E6E6E', fontWeight: 600 }}>↻ {e.routines.length} rutinas</span>}
                    {e.source_table && <><span style={{ height: 5, width: 5, borderRadius: 99, background: '#3E8E8E' }} /><span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 10.5, color: 'rgba(20,35,61,0.42)' }}>{e.source_table}</span></>}
                  </div>
                </div>

                {showRowKpi && k0 && (
                  <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 70 }}>
                    <span className="serif" style={{ fontWeight: 600, fontSize: 22, color: '#10233F', lineHeight: 1 }}>{k0.v}</span>
                    <span style={{ font: '600 9.5px/1.2 var(--font-ui)', letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(15,35,61,0.44)' }}>{k0.l}</span>
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>{doneCount(e)} / {taskCount(e)}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#10233F' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: e.color, transition: 'width .4s' }} />
                  </div>
                </div>

                <button onClick={ev => { ev.stopPropagation(); openEdit(e.id) }} title="Editar" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, width: 34, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 10, color: 'rgba(20,35,61,0.5)' }}><PencilIcon /></button>
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, width: 34, borderRadius: 10, background: 'rgba(194,147,58,0.12)', color: '#A87A2C' }}><ArrowIcon /></span>
              </div>
            )
          })}

          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', border: '1.5px dashed rgba(15,35,64,0.18)', background: 'transparent', borderRadius: 14, padding: 16, fontSize: 13, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Nueva épica
          </button>
        </div>
      </div>

      {editing && renderEditor()}

      {taskEdit && (() => {
        const ep = epics.find(e => e.id === taskEdit.epicId)
        const isNew = taskEdit.index == null
        const dt = dueTone(taskDraft.due, taskDraft.status === 'Terminada')
        return (
          <div onClick={closeTaskEdit} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
            <div onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: ep?.color || '#2E5A9E' }} />
              <div style={{ padding: '18px 22px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.4)', marginBottom: 5 }}>{isNew ? 'Nueva tarea' : 'Editar tarea'}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>{ep?.name}</div>
                  </div>
                  <button onClick={closeTaskEdit} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>

                <label style={lbl}>Tarea</label>
                <input autoFocus value={taskDraft.t} onChange={e => setTaskDraft(d => ({ ...d, t: e.target.value }))} placeholder="¿Qué hay que hacer?" style={inpBig} />

                <label style={lbl}>Estado</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {TASK_STATUSES.map(s => {
                    const on = taskDraft.status === s; const ts = taskStyle(s)
                    return <button key={s} onClick={() => setTaskDraft(d => ({ ...d, status: s }))} style={{ cursor: 'pointer', borderRadius: 8, padding: '7px 11px', fontSize: 12, fontWeight: 700, border: on ? `1px solid ${ts.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? ts.bg : '#fff', color: on ? ts.c : 'rgba(20,35,61,0.55)' }}>{ts.label}</button>
                  })}
                </div>

                <label style={lbl}>Fecha de entrega</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="date" value={taskDraft.due} onChange={e => setTaskDraft(d => ({ ...d, due: e.target.value }))} style={{ ...inpBig, flex: 1, fontWeight: 600, border: `1px solid ${dt.border}`, color: dt.c, background: dt.bg }} />
                  {taskDraft.due && <button onClick={() => setTaskDraft(d => ({ ...d, due: '' }))} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 9, padding: '9px 12px', fontSize: 12, fontWeight: 700, color: 'rgba(20,35,61,0.5)', whiteSpace: 'nowrap' }}>Quitar</button>}
                </div>

                <label style={lbl}>Nota</label>
                <textarea value={taskDraft.note} onChange={e => setTaskDraft(d => ({ ...d, note: e.target.value }))} placeholder="Opcional…" rows={2} style={areaBig} />

                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  {!isNew && <button onClick={deleteTask} style={{ cursor: 'pointer', border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.08)', color: '#B0522E', borderRadius: 10, padding: '11px 14px', fontSize: 12.5, fontWeight: 700 }}>Eliminar</button>}
                  <span style={{ flex: 1 }} />
                  <button onClick={closeTaskEdit} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 10, padding: '11px 16px', fontSize: 12.5, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>Cancelar</button>
                  <button onClick={saveTask} style={{ ...goldBtn, padding: '11px 20px', fontSize: 12.5 }}>Guardar</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 80, background: toast.error ? '#B0522E' : '#16365F', color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 16px 30px -14px rgba(8,18,36,.6)' }}>{toast.msg}</div>
      )}
    </div>
  )
}

/* ─── Header ─────────────────────────────────────────────────── */
function TopBar({ sourceCount, onNew }: { sourceCount: number; onNew: () => void }) {
  return (
    <>
      <div className="brand-rule" />
      <header className="band" style={{ margin: '14px 14px 0', borderRadius: 18, padding: '16px 22px', color: '#fff' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ADVL" style={{ height: 40, width: 'auto', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.4))' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 26, lineHeight: 1, color: '#F3EFE6' }}>Épicas</span>
              <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.24em', textTransform: 'uppercase', color: '#C8A24C' }}>Grandes frentes · ADVL</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 10, background: 'rgba(62,142,142,0.16)', border: '1px solid rgba(120,200,190,0.25)', padding: '8px 12px', fontSize: 11.5, fontWeight: 700, color: '#B9E2DA' }}>
              <span className="ep-live" style={{ height: 7, width: 7, borderRadius: 99, background: '#5FD0BE' }} />Supabase · {sourceCount} fuentes
            </span>
            <Link href="/" className="band-glass" style={{ borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>← Accesos</Link>
            <button onClick={onNew} style={{ ...goldBtn, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 15px', fontSize: 12 }}>
              <span style={{ fontSize: 16, lineHeight: 1, marginTop: -1 }}>+</span> Nueva épica
            </button>
          </div>
        </div>
      </header>
    </>
  )
}

const goldBtn: CSSProperties = {
  border: 'none', cursor: 'pointer', borderRadius: 12, fontWeight: 800, color: '#1B1305',
  background: 'linear-gradient(135deg,#E7C56B,#C2933A)', boxShadow: '0 10px 20px -10px rgba(194,147,58,.9)',
  fontFamily: 'inherit', padding: '10px 16px', fontSize: 13,
}

/* ─── Íconos ─────────────────────────────────────────────────── */
function PencilIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
}
function ArrowIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M7 17 17 7M7 7h10v10" /></svg>
}
function RefreshIcon({ stroke = 'currentColor' }: { stroke?: string }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
}
function DbIcon({ stroke = 'currentColor' }: { stroke?: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></svg>
}
