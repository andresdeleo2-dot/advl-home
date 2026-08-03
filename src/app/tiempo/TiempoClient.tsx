'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import SiteHeader from '@/components/SiteHeader'
import {
  AREAS, ACTIVITIES, DAY_NAMES, KEY, defaults, hm, clock, parse, iso,
  type AppData, type Area,
} from '@/lib/tiempo'
import type { Epica, EpicaTask, EpicaProgressEntry } from '@/lib/supabase'
import { taskStyle, fmtDue, safeUrl, uid } from '@/components/epicas/core'
import { sanitizeHtml } from '@/lib/sanitize'

const TASK_STATUSES = ['Por hacer', 'En curso', 'Esperando', 'Terminada']
const PRIOS = ['alta', 'media', 'baja'] as const
const DIFFS = ['facil', 'media', 'dificil'] as const
const PRIO_TONE: Record<string, string> = { alta: '#B0522E', media: '#A87A2C', baja: '#5B6B86' }
type Filters = { epica: string | null; prio: Set<string>; diff: Set<string>; estado: Set<string> }

const SERIF = 'var(--tiempo-serif), Georgia, serif'
const card = (gap: number): CSSProperties => ({ background: '#faf7f1', border: '1px solid #e7dfd2', borderRadius: 28, padding: 32, display: 'flex', flexDirection: 'column', gap })
const LBL: CSSProperties = { fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a49b90', fontWeight: 600 }

/** Tarea de hoy sacada de Épicas (plan === hoy, sin terminar). */
type TodayTask = { epicaId: string; epicaName: string; color: string; task: EpicaTask }
/** Reunión del calendario de hoy, ya en minutos desde medianoche. */
type Meeting = { id: string; name: string; start: number; dur: number }

const durByDiff = (t?: EpicaTask) => t?.difficulty === 'facil' ? 30 : t?.difficulty === 'dificil' ? 120 : 60

export default function TiempoClient() {
  const [now, setNow] = useState(0)
  const [view, setView] = useState<'hoy' | 'rutina' | 'historial'>('hoy')
  const [dur, setDur] = useState(90)
  const [act, setAct] = useState('Trabajo profundo')
  const [data, setData] = useState<AppData>(() => defaults())
  const [loaded, setLoaded] = useState(false)
  const [tasks, setTasks] = useState<TodayTask[] | null>(null)   // null = cargando
  const [epicasList, setEpicasList] = useState<{ id: string; name: string; color: string }[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selTaskId, setSelTaskId] = useState<string | null>(null)
  const [selMeetingId, setSelMeetingId] = useState<string | null>(null)
  const [editTask, setEditTask] = useState<{ epicaId: string; epicaName: string; color: string; task: EpicaTask; creating?: boolean } | null>(null)
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const [filters, setFilters] = useState<Filters>({ epica: null, prio: new Set(), diff: new Set(), estado: new Set() })
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const tasksRef = useRef<TodayTask[]>([])
  useEffect(() => { tasksRef.current = tasks || [] }, [tasks])

  useEffect(() => {
    let d = defaults()
    try { const raw = localStorage.getItem(KEY); if (raw) d = Object.assign(defaults(), JSON.parse(raw)) } catch {}
    const n = new Date()
    setData(d); setLoaded(true)
    setNow(n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60)
    timer.current = setInterval(() => {
      const x = new Date(); setNow(x.getHours() * 60 + x.getMinutes() + x.getSeconds() / 60)
    }, 1000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [])

  // Tareas de HOY desde Épicas (plan === hoy, sin terminar/archivar).
  useEffect(() => {
    const today = iso(new Date())
    fetch('/api/epicas').then(r => r.json()).then(j => {
      if (!j.ok) { setTasks([]); return }
      const out: TodayTask[] = []
      const epList: { id: string; name: string; color: string }[] = []
      for (const e of j.data as Epica[]) {
        if (!e.archived) epList.push({ id: e.id, name: e.name, color: e.color || '#b4653a' })
        for (const t of e.tasks || []) {
          if (t.plan === today && t.status !== 'Terminada' && t.status !== 'Archivada')
            out.push({ epicaId: e.id, epicaName: e.name, color: e.color || '#b4653a', task: t })
        }
      }
      setTasks(out); setEpicasList(epList)
    }).catch(() => setTasks([]))
  }, [])

  // Reuniones de HOY desde el calendario de Google (eventos con hora).
  useEffect(() => {
    const today = iso(new Date())
    fetch('/api/calendar').then(r => r.json()).then((evs: { id: string; title: string; start: string; end: string; allDay: boolean }[]) => {
      if (!Array.isArray(evs)) return
      const mins = (s: string) => { const d = new Date(s); return d.getHours() * 60 + d.getMinutes() }
      const out: Meeting[] = []
      for (const e of evs) {
        if (e.allDay || !e.start || e.start.slice(0, 10) !== today) continue
        const start = mins(e.start)
        const dur = e.end ? Math.max(15, mins(e.end) - start) : 30
        out.push({ id: e.id, name: e.title || 'Reunión', start, dur })
      }
      setMeetings(out)
    }).catch(() => {})
  }, [])

  const selTask = (tasks || []).find(t => t.task.id === selTaskId) || null
  const selMeeting = meetings.find(m => m.id === selMeetingId) || null

  // Épicas presentes en las tareas de hoy (para el filtro por épica).
  const todayEpicas = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string }>()
    for (const t of tasks || []) if (!seen.has(t.epicaId)) seen.set(t.epicaId, { id: t.epicaId, name: t.epicaName, color: t.color })
    return [...seen.values()]
  }, [tasks])
  const filteredTasks = useMemo(() => {
    if (tasks === null) return null
    return tasks.filter(t => {
      if (filters.epica && t.epicaId !== filters.epica) return false
      if (filters.prio.size && !filters.prio.has(t.task.priority || '')) return false
      if (filters.diff.size && !filters.diff.has(t.task.difficulty || '')) return false
      if (filters.estado.size && !filters.estado.has(t.task.status || '')) return false
      return true
    })
  }, [tasks, filters])

  function save(patch: Partial<AppData>) {
    const nd = { ...data, ...patch }
    setData(nd)
    try { localStorage.setItem(KEY, JSON.stringify(nd)) } catch {}
  }
  const patchBlock = (id: string, patch: Partial<AppData['blocks'][number]>) =>
    save({ blocks: data.blocks.map(b => b.id === id ? { ...b, ...patch } : b) })

  /* ── Cálculo (portado de renderVals, tono "cuidadora") ─────────────────── */
  const V = useMemo(() => {
    const caring = true
    const bed = data.bed, sleepGoal = data.sleep, session = data.session
    // Bloques protegidos (editables) + reuniones del calendario (fijas, no editables).
    const meetingBlocks = meetings.map(m => ({ id: 'cal:' + m.id, name: m.name, area: 'personas' as Area, start: m.start, dur: m.dur, cal: true }))
    const blocks = data.blocks.concat(meetingBlocks).sort((a, b) => a.start - b.start)
    const sleepBlock = { id: '__sleep', name: 'Dormir', area: 'sueno' as Area, start: bed, dur: sleepGoal }
    const timeline = blocks.concat([sleepBlock])

    let free = Math.max(0, bed - now)
    for (const b of blocks) free -= Math.max(0, Math.min(b.start + b.dur, bed) - Math.max(b.start, now))
    free = Math.max(0, free)

    const nextBlock = blocks.find(b => b.start + b.dur > now)
    const windowMins = nextBlock ? Math.max(0, nextBlock.start - now) : Math.max(0, bed - now)
    const safeMax = Math.max(15, Math.round(windowMins / 15) * 15)

    const simStart = now, simEnd = simStart + dur
    const overlap = (aS: number, aE: number, bS: number, bE: number) => Math.max(0, Math.min(aE, bE) - Math.max(aS, bS))
    const afectados: { name: string; detail: string; mins: number; id: string }[] = []
    const intactos: { name: string; detail: string; id: string }[] = []
    for (const b of timeline) {
      const o = overlap(simStart, simEnd, b.start, b.start + b.dur)
      if (o >= 1) afectados.push({ name: b.name, detail: o >= b.dur - 1 ? 'se elimina' : '−' + hm(o), mins: o, id: b.id })
      else if (b.start + b.dur > now) intactos.push({ name: b.name, detail: hm(b.dur), id: b.id })
    }
    const sleepDebt = overlap(simStart, simEnd, bed, bed + sleepGoal)
    const hitAny = afectados.length > 0

    let verdictKicker, verdictTitle, verdictText, verdictBg, verdictBorder, verdictFg
    if (!hitAny) {
      verdictKicker = 'cabe sin costo'
      verdictTitle = 'Terminas a las ' + clock(simEnd) + ' y no tocas nada.'
      verdictText = (caring ? 'Después te quedan ' : 'Margen posterior: ') + hm(Math.max(0, free - dur)) + ' de tiempo útil, y tu rutina sigue intacta.'
      verdictBg = '#eef1e7'; verdictBorder = '#dbe2cd'; verdictFg = '#4f6238'
    } else if (sleepDebt < 1) {
      verdictKicker = 'cabe con costo'
      verdictTitle = 'Terminas a las ' + clock(simEnd) + ' invadiendo ' + hm(afectados.reduce((s, a) => s + a.mins, 0)) + ' de tiempo protegido.'
      verdictText = (caring ? 'Duermes igual, pero lo pagas con ' : 'Costo: ') + afectados.map(a => a.name.toLowerCase()).join(' y ') + '.'
      verdictBg = '#f7ece2'; verdictBorder = '#ecd9cb'; verdictFg = '#8a4b28'
    } else {
      verdictKicker = 'sale de tu sueño'
      verdictTitle = 'Terminarías a las ' + clock(simEnd) + ' y dormirías ' + hm(sleepGoal - sleepDebt) + '.'
      verdictText = (caring ? 'Esto ya no se paga con ocio: se paga con mañana. ' : 'Déficit de sueño: ' + hm(sleepDebt) + '. ') + hm(safeMax) + ' ahora deja el día intacto.'
      verdictBg = '#f6e3dd'; verdictBorder = '#e8cabf'; verdictFg = '#8a3c2a'
    }

    // barra del resto del día
    const scaleEnd = Math.max(bed + 30, simEnd + 15)
    const total = Math.max(1, scaleEnd - now)
    const raw: { s: number; e: number; kind: 'free' | 'prot' }[] = []
    let cursor = now
    for (const b of timeline) {
      const s = Math.max(b.start, now), e = Math.min(b.start + b.dur, scaleEnd)
      if (e <= s) continue
      if (s > cursor) raw.push({ s: cursor, e: s, kind: 'free' })
      raw.push({ s: Math.max(s, cursor), e, kind: 'prot' })
      cursor = Math.max(cursor, e)
    }
    if (cursor < scaleEnd) raw.push({ s: cursor, e: scaleEnd, kind: 'free' })
    const segs: { w: number; bg: string }[] = []
    for (const r of raw) {
      const parts: { s: number; e: number; work: boolean }[] = []
      const iS = Math.max(r.s, simStart), iE = Math.min(r.e, simEnd)
      if (iE > iS) {
        if (r.s < iS) parts.push({ s: r.s, e: iS, work: false })
        parts.push({ s: iS, e: iE, work: true })
        if (r.e > iE) parts.push({ s: iE, e: r.e, work: false })
      } else parts.push({ s: r.s, e: r.e, work: false })
      for (const p of parts) {
        if (p.e - p.s < 0.5) continue
        const bg = p.work ? (r.kind === 'prot' ? '#8a3c2a' : '#b4653a') : (r.kind === 'prot' ? '#6f8256' : '#eee6da')
        segs.push({ w: ((p.e - p.s) / total) * 100, bg })
      }
    }

    const upcoming = timeline.filter(b => b.start + b.dur > now).map(b => {
      const hit = afectados.find(a => a.id === b.id)
      return {
        range: clock(b.start) + '–' + clock(b.start + b.dur),
        name: b.name, dur: hm(b.dur),
        dot: AREAS[b.area] ? AREAS[b.area].color : '#8b8379',
        nameColor: hit ? '#8a3c2a' : '#1c1a17',
        state: hit ? hit.detail : 'protegido',
        stateColor: hit ? '#8a3c2a' : '#4f6238',
        cal: !!(b as { cal?: boolean }).cal,
      }
    })

    // sesión
    const elapsed = session ? Math.max(0, now - session.start) : 0
    const planned = session ? session.dur : 0
    const sEnd = session ? session.start + planned : 0

    // semana
    const today = iso(new Date())
    const week: { date: string; dow: number }[] = []
    for (let i = 6; i >= 0; i--) { const dt = new Date(Date.now() - i * 86400000); week.push({ date: iso(dt), dow: dt.getDay() }) }
    const weekSet = week.map(w => w.date)
    const inWeek = data.history.filter(h => weekSet.indexOf(h.date) >= 0)
    const byArea: Record<string, number> = {}
    for (const h of inWeek) byArea[h.area] = (byArea[h.area] || 0) + h.dur
    const weekTotal = Object.values(byArea).reduce((a, b) => a + b, 0) || 1
    const maxArea = Math.max.apply(null, Object.values(byArea).concat([1]))
    const areaStats = (Object.keys(AREAS) as Area[]).filter(k => byArea[k]).sort((a, b) => byArea[b] - byArea[a]).map(k => ({
      label: AREAS[k].label, hours: hm(byArea[k]),
      share: Math.round((byArea[k] / weekTotal) * 100) + '%',
      pct: (byArea[k] / maxArea) * 100, bg: AREAS[k].color,
    }))

    const dayOk: Record<string, boolean | null> = {}
    for (const w of week) {
      const rows = data.history.filter(h => h.date === w.date)
      const sl = rows.filter(r => r.area === 'sueno').reduce((s, r) => s + r.dur, 0)
      const body = rows.filter(r => r.area === 'cuerpo').reduce((s, r) => s + r.dur, 0)
      dayOk[w.date] = rows.length === 0 ? null : (sl >= sleepGoal - 30 && body >= 45)
    }
    let streak = 0
    for (let i = week.length - 1; i >= 0; i--) { const v = dayOk[week[i].date]; if (v === true) streak++; else if (v === false) break }
    const days = week.map(w => ({ label: DAY_NAMES[w.dow], bg: dayOk[w.date] === null ? '#e2d9cb' : dayOk[w.date] ? '#6f8256' : '#b4653a' }))
    const okCount = week.filter(w => dayOk[w.date] === true).length

    const todayLog = data.history.map((h, idx) => ({ h, idx })).filter(x => x.h.date === today).sort((a, b) => a.h.start - b.h.start).map(x => ({
      idx: x.idx, range: clock(x.h.start) + '–' + clock(x.h.start + x.h.dur), name: x.h.name, dur: hm(x.h.dur),
      dot: AREAS[x.h.area] ? AREAS[x.h.area].color : '#8b8379',
    }))
    const workedToday = data.history.filter(h => h.date === today && h.area === 'trabajo').reduce((s, h) => s + h.dur, 0)

    const eBars: { h: number; bg: string }[] = []
    for (let h = 7; h <= 22; h++) {
      const val = h < 9 ? 0.42 : h < 12 ? 1 : h < 13 ? 0.8 : h < 15 ? 0.5 : h < 18 ? 0.78 : h < 20 ? 0.52 : h < 22 ? 0.36 : 0.24
      const cur = Math.floor(now / 60) === h
      eBars.push({ h: val * 100, bg: cur ? '#b4653a' : now / 60 > h ? '#e4dcd0' : '#ecd9cb' })
    }
    const nowH = Math.floor(now / 60)
    const energyNote = nowH < 13 ? 'Estás dentro de tu pico de rendimiento: es el mejor momento para trabajo profundo.'
      : nowH < 15 ? 'Bajón de media tarde. Buen momento para lo mecánico, no para lo difícil.'
      : nowH < 18 ? 'Segunda ventana de foco. Tu pico ya pasó, rinde alrededor del 78%.'
      : 'Rendimiento en descenso: lo que hagas ahora te cuesta más y vale menos.'

    return {
      nowLabel: clock(now),
      dateLabel: new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
      free, freeLabel: hm(free),
      freeExplain: 'Es lo que queda entre ahora y las ' + clock(bed) + ', descontando todo lo que decidiste proteger.',
      windowLabel: nextBlock ? hm(windowMins) + ' (hasta ' + clock(nextBlock.start) + ')' : hm(windowMins),
      bedLabel: clock(bed) + ' · despertar ' + clock(bed + sleepGoal),
      workedTodayLabel: workedToday ? hm(workedToday) : '—',
      energy: eBars, energyNote,
      hasSession: !!session, sessionOpen: !!session && !planned, sessionName: session ? session.name : '',
      sessionStartLabel: session ? clock(session.start) : '',
      sessionElapsedLabel: session ? hm(elapsed) : '',
      sessionPct: session && planned ? Math.min(100, (elapsed / planned) * 100) : 0,
      sessionNote: session ? (!planned
        ? 'Llevas ' + hm(elapsed) + '. Termina cuando quieras.'
        : elapsed >= planned
          ? 'Ya pasaste los ' + hm(planned) + ' que planeaste. Cada minuto extra sale de lo que viene.'
          : 'Quedan ' + hm(planned - elapsed) + '. Terminarías a las ' + clock(sEnd) + '.') : '',
      durLabel: hm(dur), endLabel: clock(simEnd),
      verdictKicker, verdictTitle, verdictText, verdictBg, verdictBorder, verdictFg,
      hitAny, afectados, safeMax, altLabel: hitAny ? 'Reducir a ' + hm(safeMax) : 'Otra duración',
      segs, upcoming, scaleEndLabel: clock(scaleEnd),
      weekRange: week[0].date.slice(8) + '/' + week[0].date.slice(5, 7) + ' – ' + week[6].date.slice(8) + '/' + week[6].date.slice(5, 7),
      weekTotalLabel: hm(weekTotal), areaStats, days,
      streakLabel: streak > 0 ? streak + (streak === 1 ? ' día seguido con la rutina protegida' : ' días seguidos con la rutina protegida') : 'Aún sin racha esta semana',
      streakNote: 'Protegiste sueño y cuerpo ' + okCount + ' de 7 días. Los días en terracota son los que costaron descanso o ejercicio.',
      todayLog, logEmpty: todayLog.length ? '' : 'Todavía no hay bloques cerrados hoy. Empieza uno desde Hoy y aparecerá aquí al terminarlo.',
    }
  }, [data, now, dur, meetings])

  /* ── Acciones ──────────────────────────────────────────────────────────── */
  const start = () => {
    if (selMeeting) {
      save({ session: { name: selMeeting.name, area: 'personas', start: Math.round(now), dur } })
    } else if (selTask) {
      save({ session: { name: selTask.task.t || 'Tarea', area: 'trabajo', start: Math.round(now), dur, epicaId: selTask.epicaId, taskId: selTask.task.id } })
    } else {
      const a = ACTIVITIES.find(x => x.id === act) || ACTIVITIES[0]
      save({ session: { name: a.id, area: a.area, start: Math.round(now), dur } })
    }
  }
  // Escribe cambios de una tarea de vuelta a Épicas (mismo canal que el resto).
  const syncTask = (epicaId: string, task: EpicaTask) =>
    fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, update: [task] }) }).catch(() => {})
  const saveTaskEdit = (epicaId: string, task: EpicaTask) => {
    syncTask(epicaId, task)
    setTasks(prev => (prev || []).map(x => x.task.id === task.id ? { ...x, task } : x))
    setEditTask(null)
  }
  const unplanTask = (epicaId: string, task: EpicaTask) => {
    syncTask(epicaId, { ...task, plan: '' })
    setTasks(prev => (prev || []).filter(x => x.task.id !== task.id))
    setSelTaskId(id => id === task.id ? null : id); setEditTask(null)
  }
  // Registro de hoy (localStorage): editar y borrar entradas.
  const saveHist = (idx: number, patch: Partial<AppData['history'][number]>) => {
    save({ history: data.history.map((h, i) => i === idx ? { ...h, ...patch } : h) }); setHistIdx(null)
  }
  const delHist = (idx: number) => { save({ history: data.history.filter((_, i) => i !== idx) }); setHistIdx(null) }

  // Crea la reunión como tarea de HOY en la épica elegida.
  const meetingToEpica = (m: Meeting, epicaId: string) => {
    const t: EpicaTask = { id: (crypto?.randomUUID?.() || 'm' + Date.now()), t: m.name, status: 'Por hacer', due: '', note: '', plan: iso(new Date()), links: [] }
    fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, create: [t] }) }).catch(() => {})
    const ep = epicasList.find(e => e.id === epicaId)
    setTasks(prev => [...(prev || []), { epicaId, epicaName: ep?.name || '', color: ep?.color || '#b4653a', task: t }])
  }
  // Marca la tarea como Terminada en Épicas (mismo canal que el resto de la app).
  const markEpicTaskDone = (epicaId: string, taskId: string) => {
    const tt = tasksRef.current.find(x => x.task.id === taskId)
    if (!tt) return
    const upd = { ...tt.task, status: 'Terminada', doneAt: iso(new Date()) }
    fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, update: [upd] }) }).catch(() => {})
    setTasks(prev => (prev || []).filter(x => x.task.id !== taskId))
    setSelTaskId(id => id === taskId ? null : id)
  }
  // Cierra el bloque en curso: lo registra en el día y, si es una tarea de Épicas,
  // le SUMA el tiempo invertido (entra a la bitácora de avances). markDone la cierra.
  const finish = (markDone = false) => {
    const s = data.session; if (!s) return
    const elapsed = Math.max(1, Math.round(now - s.start))
    const today = iso(new Date())
    save({ session: null, history: data.history.concat([{ date: today, name: s.name, area: s.area, start: Math.round(s.start), dur: elapsed }]) })
    if (s.taskId && s.epicaId) {
      const tt = tasksRef.current.find(x => x.task.id === s.taskId)
      if (tt) {
        const log = [...((tt.task.progressLog as EpicaProgressEntry[]) || []), { d: today, note: `⏱ ${hm(elapsed)} trabajado`, pct: tt.task.progress, min: elapsed } as EpicaProgressEntry]
        const upd: EpicaTask = { ...tt.task, progressLog: log, ...(markDone ? { status: 'Terminada', doneAt: today } : {}) }
        syncTask(s.epicaId, upd)
        setTasks(prev => markDone ? (prev || []).filter(x => x.task.id !== s.taskId) : (prev || []).map(x => x.task.id === s.taskId ? { ...x, task: upd } : x))
        if (markDone) setSelTaskId(id => id === s.taskId ? null : id)
      }
    }
  }
  // Comenzar una tarea desde su detalle. dur = 0 → contador libre (hasta que pares).
  const startTask = (info: { epicaId: string; task: EpicaTask }, d: number) => {
    save({ session: { name: info.task.t || 'Tarea', area: 'trabajo', start: Math.round(now), dur: d, epicaId: info.epicaId, taskId: info.task.id } })
    setEditTask(null); setView('hoy')
  }
  // Crear una tarea nueva en la épica elegida (mismos campos que Épicas).
  const createTask = (epicaId: string, task: EpicaTask) => {
    if (!epicaId) return
    const ep = epicasList.find(e => e.id === epicaId)
    fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, create: [task] }) }).catch(() => {})
    if (task.plan === iso(new Date())) setTasks(prev => [...(prev || []), { epicaId, epicaName: ep?.name || '', color: ep?.color || '#b4653a', task }])
    setEditTask(null)
  }
  const extend = () => { const s = data.session; if (s) save({ session: { ...s, dur: s.dur + 15 } }) }
  const cancel = () => save({ session: null })
  const areaOptions = (Object.keys(AREAS) as Area[]).filter(k => k !== 'sueno').map(k => ({ id: k, label: AREAS[k].label }))
  const bed = data.bed, sleepGoal = data.sleep

  const tabs: [typeof view, string][] = [['hoy', 'Hoy'], ['rutina', 'Mi rutina'], ['historial', 'Historial']]

  return (
    <div className="margen-root" style={{ minHeight: '100vh', background: '#f2ece2', fontFamily: 'var(--tiempo-ui), system-ui, sans-serif', color: '#1c1a17', WebkitFontSmoothing: 'antialiased' }}>
      <style>{MARGEN_CSS}</style>

      {/* Header de marca compartido (banda ADVL) */}
      <SiteHeader title="Tiempo" subtitle="Tu día · ADVL" backHref="/epicas" backLabel="← Épicas" />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 20px 64px' }}>
        {/* Sub-encabezado propio de la sección: fecha + reloj + pestañas */}
        <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 26px' }}>
          <span style={{ fontSize: 14, color: '#a49b90', textTransform: 'capitalize' }}>{loaded ? V.dateLabel : ''}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{loaded ? V.nowLabel : '—'}</span>
            <div style={{ display: 'flex', gap: 4, background: '#e7dfd2', padding: 4, borderRadius: 999 }}>
              {tabs.map(([id, label]) => (
                <div key={id} onClick={() => setView(id)} style={{ padding: '9px 20px', borderRadius: 999, fontSize: 14, fontWeight: 500, cursor: 'pointer', background: view === id ? '#faf7f1' : 'transparent', color: view === id ? '#1c1a17' : '#6b645b' }}>{label}</div>
              ))}
            </div>
          </div>
        </div>

        {!loaded ? <div style={{ height: 320 }} /> : view === 'hoy' ? (
          /* ── HOY ──────────────────────────────────────────────────── */
          <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 20, alignItems: 'start' }}>

              {/* Tarjeta A — Tiempo útil */}
              <div style={card(26)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={LBL}>tiempo útil restante hoy</span>
                  <span style={{ fontFamily: SERIF, fontSize: 84, lineHeight: .88, letterSpacing: '-.02em' }}>{V.freeLabel}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.55, color: '#6b645b', maxWidth: 380 }}>{V.freeExplain}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 54 }}>
                    {V.energy.map((e, i) => <div key={i} style={{ flex: 1, height: `${e.h}%`, background: e.bg, borderRadius: '4px 4px 2px 2px', minHeight: 4 }} />)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a49b90', letterSpacing: '.04em' }}>
                    <span>07</span><span>11</span><span>15</span><span>19</span><span>23</span>
                  </div>
                  <span style={{ fontSize: 13, color: '#8b8379', lineHeight: 1.5 }}>{V.energyNote}</span>
                </div>
                <div style={{ borderTop: '1px solid #eee6da', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Row label="Ventana continua sin interrupciones" value={V.windowLabel} />
                  <Row label="Hora de dormir" value={V.bedLabel} />
                  <Row label="Trabajo registrado hoy" value={V.workedTodayLabel} />
                </div>
              </div>

              {/* Tarjeta B — sesión o simulador */}
              {V.hasSession ? (
                <div style={{ background: '#1c1a17', color: '#faf7f1', borderRadius: 28, padding: 32, display: 'flex', flexDirection: 'column', gap: 26 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ ...LBL, color: '#a49b90' }}>en curso</span>
                    <span style={{ fontSize: 14, color: '#a49b90' }}>empezó {V.sessionStartLabel}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 500 }}>{V.sessionName}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 68, lineHeight: .9 }}>{V.sessionElapsedLabel}</span>
                    <span style={{ fontSize: 15, color: '#cdc4b8', lineHeight: 1.5 }}>{V.sessionNote}</span>
                  </div>
                  {!V.sessionOpen && (
                    <div style={{ height: 6, background: '#35302a', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${V.sessionPct}%`, height: '100%', background: '#d98a55', borderRadius: 999 }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div onClick={() => finish(false)} style={{ flex: 1, minWidth: 130, textAlign: 'center', background: '#faf7f1', color: '#1c1a17', borderRadius: 999, padding: 16, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Terminar</div>
                    {data.session?.taskId && <div onClick={() => finish(true)} style={{ textAlign: 'center', border: '1px solid #4a443c', borderRadius: 999, padding: '16px 18px', fontSize: 15, cursor: 'pointer' }}>Terminar y marcar hecha</div>}
                    {!V.sessionOpen && <div onClick={extend} style={{ textAlign: 'center', border: '1px solid #4a443c', borderRadius: 999, padding: '16px 20px', fontSize: 15, cursor: 'pointer' }}>+15m</div>}
                    <div onClick={cancel} style={{ textAlign: 'center', border: '1px solid #4a443c', borderRadius: 999, padding: '16px 20px', fontSize: 15, color: '#a49b90', cursor: 'pointer' }}>Descartar</div>
                  </div>
                </div>
              ) : (
                <div style={card(24)}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <span style={LBL}>antes de empezar, mira el costo</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {ACTIVITIES.map(a => {
                        const on = a.id === act
                        return <div key={a.id} onClick={() => { setAct(a.id); if (a.id !== 'Trabajo profundo') setSelTaskId(null); if (a.id !== 'Reuniones') setSelMeetingId(null) }} style={{ fontSize: 14, padding: '9px 16px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? '#1c1a17' : '#ddd4c6'}`, background: on ? '#1c1a17' : 'transparent', color: on ? '#faf7f1' : '#6b645b' }}>{a.id}</div>
                      })}
                    </div>
                  </div>

                  {act === 'Trabajo profundo' && <>
                    <FilterBar epicas={todayEpicas} filters={filters} setFilters={setFilters} />
                    <TaskPicker tasks={filteredTasks} selId={selTaskId} onPick={t => { setSelTaskId(t.task.id!); setSelMeetingId(null); setDur(durByDiff(t.task)) }} onEdit={t => setEditTask({ epicaId: t.epicaId, epicaName: t.epicaName, color: t.color, task: { ...t.task } })} />
                    <div onClick={() => { const e = epicasList[0]; setEditTask({ creating: true, epicaId: e?.id || '', epicaName: e?.name || '', color: e?.color || '#b4653a', task: { id: uid(), t: '', status: 'Por hacer', due: '', note: '', plan: iso(new Date()), links: [] } }) }} style={{ alignSelf: 'flex-start', border: '1px dashed #ccc2b2', borderRadius: 999, padding: '10px 18px', fontSize: 14, color: '#6b645b', cursor: 'pointer' }}>+ Nueva tarea</div>
                  </>}
                  {act === 'Reuniones' && <MeetingsList meetings={meetings} selId={selMeetingId} onPick={m => { setSelMeetingId(m.id); setSelTaskId(null); setDur(m.dur) }} epicas={epicasList} onAddEpica={meetingToEpica} />}
                  {selTask && <span style={{ fontSize: 13.5, color: '#8a4b28', lineHeight: 1.5 }}>Vas a trabajar en <b>{selTask.task.t}</b> · {selTask.epicaName}. Al terminar se marca hecha en Épicas.</span>}
                  {selMeeting && <span style={{ fontSize: 13.5, color: '#8a4b28', lineHeight: 1.5 }}>Vas a registrar <b>{selMeeting.name}</b> ({hm(selMeeting.dur)}). Al terminar queda en tu día y en el historial.</span>}

                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 62, lineHeight: .9 }}>{V.durLabel}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'right' }}>
                      <span style={{ ...LBL, letterSpacing: '.1em' }}>terminarías</span>
                      <span style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{V.endLabel}</span>
                    </div>
                  </div>
                  <input type="range" min={15} max={420} step={15} value={dur} onChange={e => setDur(Number(e.target.value))} style={{ width: '100%', height: 26, accentColor: '#b4653a' }} />
                  <div style={{ borderRadius: 22, padding: 22, display: 'flex', flexDirection: 'column', gap: 10, background: V.verdictBg, border: `1px solid ${V.verdictBorder}` }}>
                    <span style={{ ...LBL, color: V.verdictFg }}>{V.verdictKicker}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1.2 }}>{V.verdictTitle}</span>
                    <span style={{ fontSize: 15, lineHeight: 1.55, color: '#4c4741' }}>{V.verdictText}</span>
                  </div>
                  {V.hitAny && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ ...LBL, letterSpacing: '.1em', paddingBottom: 6 }}>sacrificarías</span>
                      {V.afectados.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #eee6da' }}>
                          <span style={{ width: 7, height: 7, borderRadius: 999, background: '#8a3c2a', display: 'block' }} />
                          <span style={{ fontSize: 16, flex: 1 }}>{a.name}</span>
                          <span style={{ fontSize: 14, color: '#8a3c2a', fontWeight: 500 }}>{a.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                    <div onClick={start} style={{ flex: 1, minWidth: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#1c1a17', color: '#faf7f1', borderRadius: 999, padding: 17, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}><span>Empezar</span><span>{V.durLabel}</span></div>
                    <div onClick={() => setDur(V.safeMax)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ddd4c6', borderRadius: 999, padding: '17px 22px', fontSize: 15, cursor: 'pointer' }}>{V.altLabel}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Tarjeta C — el resto del día */}
            <div style={card(22)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
                <span style={LBL}>el resto del día</span>
                <span style={{ fontSize: 13, color: '#a49b90' }}>de {V.nowLabel} a {V.scaleEndLabel}</span>
              </div>
              <div style={{ display: 'flex', height: 52, gap: 2 }}>
                {V.segs.map((s, i) => <div key={i} style={{ width: `${s.w}%`, background: s.bg, borderRadius: 5, minWidth: 2 }} />)}
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: '#6b645b' }}>
                <Legend c="#b4653a">el bloque que estás evaluando</Legend>
                <Legend c="#8a3c2a">tiempo protegido que invadirías</Legend>
                <Legend c="#6f8256">protegido intacto</Legend>
                <Legend c="#eee6da">libre</Legend>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {V.todayLog.map(l => (
                  <div key={'done' + l.idx} onClick={() => setHistIdx(l.idx)} title="Editar registro" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: '1px solid #eee6da', cursor: 'pointer' }}>
                    <span style={{ fontSize: 14, color: '#8b8379', width: 96, fontVariantNumeric: 'tabular-nums' }}>{l.range}</span>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: l.dot, display: 'block' }} />
                    <span style={{ fontSize: 16, flex: 1, color: '#6b645b' }}>{l.name}</span>
                    <span style={{ fontSize: 14, color: '#a49b90' }}>{l.dur}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#4f6238', width: 120, textAlign: 'right' }}>hecho ✓</span>
                  </div>
                ))}
                {V.upcoming.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: '1px solid #eee6da' }}>
                    <span style={{ fontSize: 14, color: '#8b8379', width: 96, fontVariantNumeric: 'tabular-nums' }}>{b.range}</span>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: b.dot, display: 'block' }} />
                    <span style={{ fontSize: 16, flex: 1, color: b.nameColor, display: 'flex', alignItems: 'center', gap: 8 }}>{b.name}{b.cal && <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8b8379', border: '1px solid #e2d9cb', borderRadius: 999, padding: '2px 7px' }}>calendario</span>}</span>
                    <span style={{ fontSize: 14, color: '#a49b90' }}>{b.dur}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: b.stateColor, width: 120, textAlign: 'right' }}>{b.state}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : view === 'rutina' ? (
          /* ── MI RUTINA ────────────────────────────────────────────── */
          <div style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={card(24)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.1 }}>Lo que decidiste proteger</span>
                <span style={{ fontSize: 15, color: '#6b645b', lineHeight: 1.55, maxWidth: 560 }}>Estos bloques no son tareas: son el suelo de tu día. Todo lo que trabajes por encima de ellos tiene un costo, y la app te lo va a mostrar antes de empezar.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.blocks.slice().sort((a, b) => a.start - b.start).map(b => (
                  <div key={b.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: '#f5efe4', border: '1px solid #ebe3d6', borderRadius: 18, padding: '14px 16px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: AREAS[b.area]?.color || '#8b8379', display: 'block' }} />
                    <input type="text" value={b.name} onChange={e => patchBlock(b.id, { name: e.target.value })} style={{ flex: 1, minWidth: 160, background: 'transparent', border: 'none', borderBottom: '1px solid transparent', padding: '6px 0', fontSize: 16 }} />
                    <select value={b.area} onChange={e => patchBlock(b.id, { area: e.target.value as Area })} style={{ background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 999, padding: '8px 12px', fontSize: 14, cursor: 'pointer' }}>
                      {areaOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <input type="time" value={clock(b.start)} onChange={e => patchBlock(b.id, { start: parse(e.target.value) })} style={{ background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 999, padding: '8px 12px', fontSize: 14, fontVariantNumeric: 'tabular-nums' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="number" min={5} max={600} step={5} value={b.dur} onChange={e => patchBlock(b.id, { dur: Math.max(5, Number(e.target.value) || 5) })} style={{ width: 76, background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 999, padding: '8px 12px', fontSize: 14 }} />
                      <span style={{ fontSize: 14, color: '#a49b90' }}>min</span>
                    </div>
                    <div onClick={() => save({ blocks: data.blocks.filter(x => x.id !== b.id) })} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, color: '#a49b90', cursor: 'pointer', fontSize: 18 }}>×</div>
                  </div>
                ))}
              </div>
              <div onClick={() => save({ blocks: data.blocks.concat([{ id: 'b' + Date.now(), name: 'Nuevo bloque', area: 'ocio', start: 1080, dur: 30 }]) })} style={{ alignSelf: 'flex-start', border: '1px dashed #ccc2b2', borderRadius: 999, padding: '13px 22px', fontSize: 15, color: '#6b645b', cursor: 'pointer' }}>+ Añadir bloque protegido</div>

              <div style={{ borderTop: '1px solid #eee6da', paddingTop: 24, display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ ...LBL, letterSpacing: '.1em' }}>hora de dormir</span>
                  <input type="time" value={clock(bed)} onChange={e => save({ bed: parse(e.target.value) })} style={{ background: '#f5efe4', border: '1px solid #e2d9cb', borderRadius: 999, padding: '12px 18px', fontSize: 17, fontVariantNumeric: 'tabular-nums' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 240 }}>
                  <span style={{ ...LBL, letterSpacing: '.1em' }}>sueño objetivo · {hm(sleepGoal)}</span>
                  <input type="range" min={300} max={600} step={15} value={sleepGoal} onChange={e => save({ sleep: Number(e.target.value) })} style={{ width: '100%', height: 26, accentColor: '#b4653a' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ ...LBL, letterSpacing: '.1em' }}>te despertarías</span>
                  <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{clock(bed + sleepGoal)}</span>
                </div>
              </div>
              <div onClick={() => { if (window.confirm('¿Restaurar la rutina de ejemplo? Se reemplazan tus bloques y el historial.')) save(defaults()) }} style={{ alignSelf: 'flex-start', fontSize: 13, color: '#a49b90', cursor: 'pointer', borderBottom: '1px solid #ddd4c6' }}>Restaurar la rutina de ejemplo</div>
            </div>
          </div>
        ) : (
          /* ── HISTORIAL ────────────────────────────────────────────── */
          <div style={{ width: '100%', maxWidth: 1180, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 20, alignItems: 'start' }}>
            <div style={card(26)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.1 }}>Cómo se repartió tu semana</span>
                <span style={{ fontSize: 13, color: '#a49b90' }}>{V.weekRange} · {V.weekTotalLabel} registradas</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {V.areaStats.map((s, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 15 }}>{s.label}</span>
                      <span style={{ fontSize: 14, color: '#6b645b' }}>{s.hours} · {s.share}</span>
                    </div>
                    <div style={{ height: 8, background: '#eee6da', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${s.pct}%`, height: '100%', background: s.bg, borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: '#f5efe4', border: '1px solid #ebe3d6', borderRadius: 28, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={LBL}>racha</span>
                  <span style={{ fontFamily: SERIF, fontSize: 28, lineHeight: 1.15 }}>{V.streakLabel}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {V.days.map((d, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center' }}>
                      <span style={{ width: '100%', height: 38, borderRadius: 10, background: d.bg, display: 'block' }} />
                      <span style={{ fontSize: 11, color: '#a49b90' }}>{d.label}</span>
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 14, color: '#6b645b', lineHeight: 1.55 }}>{V.streakNote}</span>
              </div>

              <div style={card(16)}>
                <span style={LBL}>registro de hoy</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {V.todayLog.map((l, i) => (
                    <div key={i} onClick={() => setHistIdx(l.idx)} title="Editar registro" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: '1px solid #eee6da', cursor: 'pointer' }}>
                      <span style={{ fontSize: 14, color: '#8b8379', width: 96, fontVariantNumeric: 'tabular-nums' }}>{l.range}</span>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: l.dot, display: 'block' }} />
                      <span style={{ fontSize: 16, flex: 1 }}>{l.name}</span>
                      <span style={{ fontSize: 14, color: '#a49b90' }}>{l.dur}</span>
                      <span style={{ fontSize: 12, color: '#c2b9ab' }}>editar</span>
                    </div>
                  ))}
                </div>
                {V.logEmpty && <span style={{ fontSize: 14, color: '#a49b90', lineHeight: 1.5 }}>{V.logEmpty}</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {editTask && <TaskDetail info={editTask} epicas={epicasList} onSave={saveTaskEdit} onDone={markEpicTaskDone} onUnplan={unplanTask} onCreate={createTask} onStart={startTask} onClose={() => setEditTask(null)} />}
      {histIdx !== null && data.history[histIdx] && <HistoryEditor row={data.history[histIdx]} idx={histIdx} onSave={saveHist} onDelete={delHist} onClose={() => setHistIdx(null)} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
      <span style={{ color: '#6b645b' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  )
}
function Legend({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c, display: 'block' }} />{children}</span>
}

/** Tareas de hoy (de Épicas) para elegir una y trabajarla, o editarla en la app. */
function TaskPicker({ tasks, selId, onPick, onEdit }: { tasks: TodayTask[] | null; selId: string | null; onPick: (t: TodayTask) => void; onEdit: (t: TodayTask) => void }) {
  if (tasks === null) return <span style={{ fontSize: 13, color: '#a49b90' }}>Cargando tus tareas de hoy…</span>
  if (!tasks.length) return (
    <div style={{ fontSize: 13.5, color: '#8b8379', lineHeight: 1.5 }}>No tienes tareas planeadas para hoy en Épicas. <a href="/epicas" style={{ color: '#8a4b28' }}>Planéalas ahí</a> y aparecerán aquí para trabajarlas.</div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...LBL, letterSpacing: '.1em', paddingBottom: 4 }}>tus tareas de hoy · toca una para trabajarla</span>
      {tasks.length === 0 && <span style={{ fontSize: 13, color: '#a49b90', padding: '4px 2px' }}>Ninguna tarea con esos filtros.</span>}
      {tasks.map(t => {
        const on = t.task.id === selId
        const ts = taskStyle(t.task.status)
        return (
          <div key={t.task.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 12, border: `1px solid ${on ? '#b4653a' : 'transparent'}`, background: on ? '#f7ece2' : 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span onClick={() => onPick(t)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, display: 'block', flexShrink: 0 }} />
                <span style={{ fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task.t || 'Sin título'}</span>
                <span style={{ fontSize: 12.5, color: '#a49b90', flexShrink: 0 }}>{t.epicaName}</span>
              </span>
              <button onClick={() => onEdit(t)} title="Ver / editar tarea" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#6b645b', cursor: 'pointer', flexShrink: 0 }}>Ver</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 20 }}>
              <Tag c={ts.c} bg={ts.bg}>{ts.label}</Tag>
              {t.task.priority && <Tag c={PRIO_TONE[t.task.priority]} bg={PRIO_TONE[t.task.priority] + '22'}>{t.task.priority}</Tag>}
              {t.task.difficulty && <Tag c="#5B6B86" bg="rgba(91,107,134,0.12)">{t.task.difficulty}</Tag>}
              {t.task.due && <Tag c="#A87A2C" bg="rgba(194,147,58,0.14)">vence {fmtDue(t.task.due)}</Tag>}
              {typeof t.task.progress === 'number' && t.task.progress > 0 && <Tag c="#2E6E6E" bg="rgba(62,142,142,0.14)">{t.task.progress}%</Tag>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Reuniones de hoy del calendario: se pueden iniciar (con su duración) o mandar a una épica. */
function MeetingsList({ meetings, selId, onPick, epicas, onAddEpica }: { meetings: Meeting[]; selId: string | null; onPick: (m: Meeting) => void; epicas: { id: string; name: string; color: string }[]; onAddEpica: (m: Meeting, epicaId: string) => void }) {
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [added, setAdded] = useState<Record<string, boolean>>({})
  if (!meetings.length) return <span style={{ fontSize: 13.5, color: '#8b8379' }}>No hay reuniones en tu calendario para hoy.</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...LBL, letterSpacing: '.1em', paddingBottom: 4 }}>reuniones de hoy · toca una para iniciarla con su duración</span>
      {meetings.slice().sort((a, b) => a.start - b.start).map(m => {
        const on = m.id === selId
        return (
          <div key={m.id} style={{ borderBottom: '1px solid #eee6da', padding: '4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 12, background: on ? '#f7ece2' : 'transparent', border: `1px solid ${on ? '#b4653a' : 'transparent'}` }}>
              <span onClick={() => onPick(m)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0 }}>
                <span style={{ fontSize: 14, color: '#8b8379', width: 96, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{clock(m.start)}–{clock(m.start + m.dur)}</span>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: '#8b8379', display: 'block', flexShrink: 0 }} />
                <span style={{ fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                <span style={{ fontSize: 13, color: '#a49b90', flexShrink: 0 }}>{hm(m.dur)}</span>
              </span>
              <button onClick={() => setOpenFor(openFor === m.id ? null : m.id)} disabled={added[m.id]} title="Agregar a una épica" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: added[m.id] ? '#6f8256' : '#6b645b', cursor: added[m.id] ? 'default' : 'pointer', flexShrink: 0 }}>{added[m.id] ? '✓ en Épicas' : '→ Épica'}</button>
            </div>
            {openFor === m.id && !added[m.id] && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 8px 6px 116px' }}>
                {epicas.length === 0 && <span style={{ fontSize: 12.5, color: '#a49b90' }}>No hay épicas.</span>}
                {epicas.map(e => (
                  <button key={e.id} onClick={() => { onAddEpica(m, e.id); setAdded(a => ({ ...a, [m.id]: true })); setOpenFor(null) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: e.color, display: 'block' }} />{e.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Editor rápido de una tarea de hoy (rename, dificultad, marcar hecha, quitar de hoy). */
function Tag({ c, bg, children }: { c: string; bg: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color: c, background: bg, borderRadius: 999, padding: '2px 9px', textTransform: 'capitalize' }}>{children}</span>
}
function Section({ title }: { title: string }) {
  return <span style={{ ...LBL, letterSpacing: '.1em', marginTop: 6 }}>{title}</span>
}

/** Barra de filtros de las tareas de hoy (por épica, prioridad, dificultad, estado). */
function FilterBar({ epicas, filters, setFilters }: { epicas: { id: string; name: string; color: string }[]; filters: Filters; setFilters: (f: (p: Filters) => Filters) => void }) {
  const toggle = (dim: 'prio' | 'diff' | 'estado', val: string) => setFilters(f => { const s = new Set(f[dim]); s.has(val) ? s.delete(val) : s.add(val); return { ...f, [dim]: s } })
  const chip = (on: boolean, c: string) => ({ border: `1px solid ${on ? c : '#e2d9cb'}`, background: on ? c + '20' : 'transparent', color: on ? c : '#6b645b', borderRadius: 999, padding: '5px 11px', fontSize: 12, cursor: 'pointer', textTransform: 'capitalize' as const })
  const any = filters.epica || filters.prio.size || filters.diff.size || filters.estado.size
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 2px 8px', borderBottom: '1px solid #eee6da' }}>
      {epicas.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {epicas.map(e => <button key={e.id} onClick={() => setFilters(f => ({ ...f, epica: f.epica === e.id ? null : e.id }))} style={{ ...chip(filters.epica === e.id, e.color), display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: e.color, display: 'block' }} />{e.name}</button>)}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {PRIOS.map(p => <button key={p} onClick={() => toggle('prio', p)} style={chip(filters.prio.has(p), PRIO_TONE[p])}>{p}</button>)}
        <span style={{ width: 1, height: 16, background: '#e2d9cb' }} />
        {DIFFS.map(d => <button key={d} onClick={() => toggle('diff', d)} style={chip(filters.diff.has(d), '#5B6B86')}>{d}</button>)}
        <span style={{ width: 1, height: 16, background: '#e2d9cb' }} />
        {TASK_STATUSES.map(s => { const ts = taskStyle(s); return <button key={s} onClick={() => toggle('estado', s)} style={chip(filters.estado.has(s), ts.c)}>{s}</button> })}
        {any && <button onClick={() => setFilters(() => ({ epica: null, prio: new Set(), diff: new Set(), estado: new Set() }))} style={{ border: 'none', background: 'transparent', color: '#a49b90', fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>limpiar</button>}
      </div>
    </div>
  )
}

/** Detalle de tarea: TODA la info con el formato de Épicas; edita lo principal aquí. */
function TaskDetail({ info, epicas, onSave, onDone, onUnplan, onCreate, onStart, onClose }: {
  info: { epicaId: string; epicaName: string; color: string; task: EpicaTask; creating?: boolean }
  epicas: { id: string; name: string; color: string }[]
  onSave: (epicaId: string, t: EpicaTask) => void; onDone: (epicaId: string, taskId: string) => void
  onUnplan: (epicaId: string, t: EpicaTask) => void
  onCreate: (epicaId: string, t: EpicaTask) => void; onStart: (info: { epicaId: string; task: EpicaTask }, dur: number) => void
  onClose: () => void
}) {
  const creating = !!info.creating
  const [t, setT] = useState<EpicaTask>(info.task)
  const [epId, setEpId] = useState(info.epicaId)
  const [startDur, setStartDur] = useState(0)
  const [comment, setComment] = useState('')
  const noteRef = useRef<HTMLDivElement>(null)
  const field: CSSProperties = { background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 12, padding: '10px 12px', fontSize: 14, color: '#1c1a17', boxSizing: 'border-box' }
  const smallBtn: CSSProperties = { border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, color: '#6b645b', cursor: 'pointer' }
  const chipS = (on: boolean, c: string): CSSProperties => ({ border: `1px solid ${on ? c : '#e2d9cb'}`, background: on ? c + '22' : 'transparent', color: on ? c : '#6b645b', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', textTransform: 'capitalize' })
  const withNote = (): EpicaTask => ({ ...t, note: sanitizeHtml(noteRef.current?.innerHTML ?? t.note ?? '') })
  const invested = (t.progressLog || []).reduce((s, e) => s + ((e as { min?: number }).min || 0), 0)
  const epColor = epicas.find(e => e.id === epId)?.color || info.color

  const setSubs = (fn: (a: NonNullable<EpicaTask['subtasks']>) => NonNullable<EpicaTask['subtasks']>) => setT(p => ({ ...p, subtasks: fn(p.subtasks || []) }))
  const setLinks = (fn: (a: NonNullable<EpicaTask['links']>) => NonNullable<EpicaTask['links']>) => setT(p => ({ ...p, links: fn(p.links || []) }))
  const addComment = () => { if (!comment.trim()) return; setT(p => ({ ...p, comentarios: [...(p.comentarios || []), { at: new Date().toISOString(), text: comment.trim() }] })); setComment('') }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 90 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px,100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f5efe4', border: '1px solid #e7dfd2', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: epColor, display: 'block' }} /><span style={{ fontSize: 13, color: '#6b645b' }}>{creating ? 'Nueva tarea' : info.epicaName}</span></span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#a49b90', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {creating && (<><Section title="épica" /><select value={epId} onChange={e => setEpId(e.target.value)} style={{ ...field, width: '100%' }}>{epicas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></>)}

        <input autoFocus value={t.t} placeholder="¿Qué hay que hacer?" onChange={e => setT({ ...t, t: e.target.value })} style={{ ...field, width: '100%', fontSize: 17 }} />

        <Section title="estado" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TASK_STATUSES.map(s => { const ts = taskStyle(s); return <button key={s} onClick={() => setT({ ...t, status: s })} style={chipS(t.status === s, ts.c)}>{ts.label}</button> })}
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Section title="prioridad" />
            <div style={{ display: 'flex', gap: 6 }}>{PRIOS.map(p => <button key={p} onClick={() => setT({ ...t, priority: t.priority === p ? undefined : p })} style={chipS(t.priority === p, PRIO_TONE[p])}>{p}</button>)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Section title="dificultad" />
            <div style={{ display: 'flex', gap: 6 }}>{DIFFS.map(d => <button key={d} onClick={() => setT({ ...t, difficulty: t.difficulty === d ? undefined : d })} style={chipS(t.difficulty === d, '#5B6B86')}>{d}</button>)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Section title="planeada para" /><input type="date" value={t.plan || ''} onChange={e => setT({ ...t, plan: e.target.value })} style={field} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Section title="vence" /><input type="date" value={t.due || ''} onChange={e => setT({ ...t, due: e.target.value })} style={field} /></label>
        </div>

        <Section title="nota" />
        <div ref={noteRef} className="ep-note" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.note) }} style={{ ...field, background: '#faf7f1', minHeight: 56, lineHeight: 1.55, width: '100%' }} />

        <Section title={`avance · ${t.progress || 0}%`} />
        <input type="range" min={0} max={100} step={5} value={t.progress || 0} onChange={e => setT({ ...t, progress: Number(e.target.value) })} style={{ width: '100%', accentColor: '#6f8256' }} />

        {/* Subtareas */}
        <Section title={`subtareas · ${(t.subtasks || []).filter(s => s.done).length}/${(t.subtasks || []).length}`} />
        {(t.subtasks || []).map((s, i) => (
          <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <button onClick={() => setSubs(a => a.map((x, j) => j === i ? { ...x, done: !x.done } : x))} style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid ' + (s.done ? '#6f8256' : '#c2b9ab'), background: s.done ? '#6f8256' : 'transparent', cursor: 'pointer', flexShrink: 0 }} />
            <input value={s.t} onChange={e => setSubs(a => a.map((x, j) => j === i ? { ...x, t: e.target.value } : x))} style={{ ...field, flex: 1, padding: '7px 10px', textDecoration: s.done ? 'line-through' : 'none' }} />
            <button onClick={() => setSubs(a => a.filter((_, j) => j !== i))} style={{ ...smallBtn, padding: '6px 10px' }}>×</button>
          </div>
        ))}
        <button onClick={() => setSubs(a => [...a, { id: uid(), t: '', done: false }])} style={{ ...smallBtn, alignSelf: 'flex-start' }}>+ subtarea</button>

        {/* Links */}
        <Section title="links" />
        {(t.links || []).map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input value={l.label} placeholder="nombre" onChange={e => setLinks(a => a.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ ...field, width: 130, padding: '7px 10px' }} />
            <input value={l.url} placeholder="https://…" onChange={e => setLinks(a => a.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} style={{ ...field, flex: 1, minWidth: 150, padding: '7px 10px' }} />
            <button onClick={() => setLinks(a => a.filter((_, j) => j !== i))} style={{ ...smallBtn, padding: '6px 10px' }}>×</button>
          </div>
        ))}
        <button onClick={() => setLinks(a => [...a, { label: '', url: '' }])} style={{ ...smallBtn, alignSelf: 'flex-start' }}>+ link</button>

        {/* Comentarios */}
        <Section title="comentarios" />
        {(t.comentarios || []).map((c, i) => (
          <div key={i} style={{ fontSize: 13.5, color: '#4c4741', lineHeight: 1.5 }}><span style={{ color: '#a49b90' }}>{new Date(c.at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · </span>{c.text}</div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={comment} placeholder="Añadir comentario…" onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment() }} style={{ ...field, flex: 1, padding: '7px 10px' }} />
          <button onClick={addComment} style={smallBtn}>Comentar</button>
        </div>

        {/* Bitácora de tiempo invertido */}
        {invested > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Section title={`tiempo invertido · ${hm(invested)}`} />
            {(t.progressLog || []).filter(e => (e as { min?: number }).min).slice(-6).map((e, i) => (
              <div key={i} style={{ fontSize: 13, color: '#6b645b' }}><span style={{ color: '#a49b90' }}>{e.d} · </span>{e.note || hm((e as { min?: number }).min || 0)}</div>
            ))}
          </div>
        )}

        {/* Comenzar (contador). dur 0 = libre */}
        {!creating && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #eee6da', paddingTop: 14 }}>
            <Section title={`comenzar · ${startDur ? 'estimo ' + hm(startDur) : 'contador libre'}`} />
            <input type="range" min={0} max={240} step={15} value={startDur} onChange={e => setStartDur(Number(e.target.value))} style={{ width: '100%', accentColor: '#b4653a' }} />
            <button onClick={() => onStart({ epicaId: epId, task: withNote() }, startDur)} style={{ background: '#b4653a', color: '#faf7f1', border: 'none', borderRadius: 999, padding: 13, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Comenzar {startDur ? hm(startDur) : 'ahora'}</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', borderTop: '1px solid #eee6da', paddingTop: 14 }}>
          {creating
            ? <button onClick={() => onCreate(epId, withNote())} disabled={!t.t.trim() || !epId} style={{ flex: 1, minWidth: 130, background: '#1c1a17', color: '#faf7f1', border: 'none', borderRadius: 999, padding: 13, fontSize: 15, fontWeight: 500, cursor: 'pointer', opacity: (!t.t.trim() || !epId) ? .5 : 1 }}>Crear tarea</button>
            : <>
              <button onClick={() => onSave(epId, withNote())} style={{ flex: 1, minWidth: 130, background: '#1c1a17', color: '#faf7f1', border: 'none', borderRadius: 999, padding: 13, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Guardar</button>
              <button onClick={() => onDone(epId, t.id!)} style={{ border: '1px solid #dbe2cd', background: '#eef1e7', color: '#4f6238', borderRadius: 999, padding: '13px 16px', fontSize: 14, cursor: 'pointer' }}>Marcar hecha</button>
              <button onClick={() => onUnplan(epId, withNote())} style={{ border: '1px solid #e2d9cb', background: 'transparent', color: '#8a4b28', borderRadius: 999, padding: '13px 16px', fontSize: 14, cursor: 'pointer' }}>Quitar de hoy</button>
            </>}
        </div>
        {!creating && <a href={`/epicas?v=dia&d=${t.plan || iso(new Date())}&e=${epId}`} style={{ fontSize: 13, color: '#8a4b28', textAlign: 'center' }}>Abrir en Épicas →</a>}
      </div>
    </div>
  )
}

/** Editor de una entrada del registro de hoy (localStorage). */
function HistoryEditor({ row, idx, onSave, onDelete, onClose }: {
  row: AppData['history'][number]; idx: number
  onSave: (idx: number, patch: Partial<AppData['history'][number]>) => void; onDelete: (idx: number) => void; onClose: () => void
}) {
  const [r, setR] = useState(row)
  const field: CSSProperties = { background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 12, padding: '10px 12px', fontSize: 14, color: '#1c1a17', boxSizing: 'border-box' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 90 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(440px,100%)', background: '#f5efe4', border: '1px solid #e7dfd2', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: SERIF, fontSize: 22 }}>Editar registro</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#a49b90', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <input autoFocus value={r.name} onChange={e => setR({ ...r, name: e.target.value })} style={{ ...field, width: '100%', fontSize: 16 }} />
        <select value={r.area} onChange={e => setR({ ...r, area: e.target.value as Area })} style={{ ...field, width: '100%' }}>
          {(Object.keys(AREAS) as Area[]).map(k => <option key={k} value={k}>{AREAS[k].label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={{ ...LBL, letterSpacing: '.1em' }}>empezó</span><input type="time" value={clock(r.start)} onChange={e => setR({ ...r, start: parse(e.target.value) })} style={{ ...field, fontVariantNumeric: 'tabular-nums' }} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={{ ...LBL, letterSpacing: '.1em' }}>duración (min)</span><input type="number" min={1} max={1440} step={5} value={r.dur} onChange={e => setR({ ...r, dur: Math.max(1, Number(e.target.value) || 1) })} style={{ ...field, width: 100 }} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <button onClick={() => onSave(idx, { name: r.name, area: r.area, start: r.start, dur: r.dur })} style={{ flex: 1, background: '#1c1a17', color: '#faf7f1', border: 'none', borderRadius: 999, padding: 13, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Guardar</button>
          <button onClick={() => onDelete(idx)} style={{ border: '1px solid #e2d9cb', background: 'transparent', color: '#8a3c2a', borderRadius: 999, padding: '13px 18px', fontSize: 14, cursor: 'pointer' }}>Borrar</button>
        </div>
      </div>
    </div>
  )
}

const MARGEN_CSS = `
.margen-root a:hover { color: #b4653a; }
.margen-root input, .margen-root select { font-family: inherit; font-size: inherit; color: inherit; }
.margen-root input:focus-visible, .margen-root select:focus-visible { outline: 2px solid #b4653a; outline-offset: 2px; }
.margen-root input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; }
.margen-root input[type=range]::-webkit-slider-runnable-track { height: 4px; background: #e2d9cb; border-radius: 999px; }
.margen-root input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 26px; height: 26px; margin-top: -11px; border-radius: 999px; background: #faf7f1; border: 1.5px solid #1c1a17; box-shadow: 0 2px 8px rgba(28,26,23,.16); cursor: grab; }
.margen-root input[type=range]::-moz-range-track { height: 4px; background: #e2d9cb; border-radius: 999px; }
.margen-root input[type=range]::-moz-range-thumb { width: 24px; height: 24px; border-radius: 999px; background: #faf7f1; border: 1.5px solid #1c1a17; }
.margen-root input[type=text]:hover { border-bottom-color: #ddd4c6 !important; }
.margen-root ::selection { background: #ecd9cb; }
`
