'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import SiteHeader from '@/components/SiteHeader'
import {
  AREAS, ACTIVITIES, DAY_NAMES, KEY, defaults, hm, clock, parse, iso,
  DOW_CHIPS, blockActiveOn, daysLabel,
  type AppData, type Area,
} from '@/lib/tiempo'
import type { Epica, EpicaTask, EpicaProgressEntry, EpicaMilestone, EpicaRoutine } from '@/lib/supabase'
import { taskStyle, fmtDue, safeUrl, uid, isoToLocalInput, cap } from '@/components/epicas/core'
import { sanitizeHtml } from '@/lib/sanitize'

const TASK_STATUSES = ['Por hacer', 'En curso', 'Esperando', 'Terminada']
const PRIOS = ['alta', 'media', 'baja'] as const
const DIFFS = ['facil', 'media', 'dificil'] as const
const PRIO_TONE: Record<string, string> = { alta: '#B0522E', media: '#A87A2C', baja: '#5B6B86' }
type Filters = { epica: string | null; prio: Set<string>; diff: Set<string>; estado: Set<string> }

const TS_KEY = KEY + '.ts'
const SERIF = 'var(--tiempo-serif), Georgia, serif'
const card = (gap: number): CSSProperties => ({ background: '#faf7f1', border: '1px solid #e7dfd2', borderRadius: 28, padding: 32, display: 'flex', flexDirection: 'column', gap })
const LBL: CSSProperties = { fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a49b90', fontWeight: 600 }

/** Tarea de hoy sacada de Épicas (plan === hoy o recurrente diaria). */
type TodayTask = { epicaId: string; epicaName: string; color: string; task: EpicaTask; recurring?: boolean }
/** ¿la tarea recurrente aplica HOY? (soporta "cada día"; semanal/mensual usan plan). */
function recurringDueToday(t: EpicaTask, today: string): boolean {
  if (!t.repeat || t.status === 'Archivada') return false
  if (t.repeatDone?.includes(today)) return false
  if (t.repeatUntil && today > t.repeatUntil) return false
  return t.repeat.unit === 'dia'
}
/** Reunión del calendario de hoy, ya en minutos desde medianoche. */
type Meeting = { id: string; name: string; start: number; dur: number }

const durByDiff = (t?: EpicaTask) => t?.difficulty === 'facil' ? 30 : t?.difficulty === 'dificil' ? 120 : 60

// Helpers de fecha local (sin UTC) para el selector de día.
const addDaysISO = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)) }
const weekOfISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; const mon = addDaysISO(s, -dow); return Array.from({ length: 7 }, (_, i) => addDaysISO(mon, i)) }
const DOW_LETTER = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const dowLetterOf = (s: string) => { const [y, m, d] = s.split('-').map(Number); return DOW_LETTER[new Date(y, m - 1, d).getDay()] }
const longDayOf = (s: string) => { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); const dn = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; const mn = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']; return `${dn[dt.getDay()]} ${d} de ${mn[m - 1]}` }
const mondayOfISO = (s: string) => weekOfISO(s)[0]
const dayIdxMon = (s: string) => { const [y, m, d] = s.split('-').map(Number); return (new Date(y, m - 1, d).getDay() + 6) % 7 }  // 0=Lun…6=Dom

export default function TiempoClient() {
  const [now, setNow] = useState(0)
  const [view, setView] = useState<'hoy' | 'rutina' | 'historial'>('hoy')
  const [dur, setDur] = useState(90)
  const [act, setAct] = useState('Trabajo profundo')
  const [data, setData] = useState<AppData>(() => defaults())
  const [loaded, setLoaded] = useState(false)
  const [allTasks, setAllTasks] = useState<TodayTask[] | null>(null)   // null = cargando; TODAS las tareas abiertas
  const [taskDay, setTaskDay] = useState(iso(new Date()))              // día que se está viendo/planeando
  const [epicasList, setEpicasList] = useState<{ id: string; name: string; color: string; kpis: EpicaMilestone[]; routines: EpicaRoutine[] }[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selTaskId, setSelTaskId] = useState<string | null>(null)
  const [selMeetingId, setSelMeetingId] = useState<string | null>(null)
  const [editTask, setEditTask] = useState<{ epicaId: string; epicaName: string; color: string; task: EpicaTask; creating?: boolean } | null>(null)
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const [barPick, setBarPick] = useState<string>('')
  const [filters, setFilters] = useState<Filters>({ epica: null, prio: new Set(), diff: new Set(), estado: new Set() })
  const [sortBy, setSortBy] = useState<'manual' | 'alfa' | 'prioridad' | 'dificultad'>('manual')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tasksRef = useRef<TodayTask[]>([])
  useEffect(() => { tasksRef.current = allTasks || [] }, [allTasks])

  useEffect(() => {
    let d = defaults()
    try { const raw = localStorage.getItem(KEY); if (raw) d = Object.assign(defaults(), JSON.parse(raw)) } catch {}
    const localTs = Number(localStorage.getItem(TS_KEY) || 0)
    const tick = () => { const x = new Date(); setNow(x.getHours() * 60 + x.getMinutes() + x.getSeconds() / 60) }
    setData(d); setLoaded(true); tick()
    // Todo se muestra al minuto (0m, veredicto, cronómetro en hm), así que tickear
    // cada 15s en vez de cada 1s reduce ~15x los re-renders sin cambio visible.
    timer.current = setInterval(tick, 15000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    // Estado durable en Supabase: gana el más nuevo (por ts). Si el server no tiene
    // nada y aquí sí, se sube (migración). localStorage queda como caché offline.
    fetch('/api/tiempo-estado').then(r => r.json()).then(j => {
      if (!j?.ok) return
      const serverTs = Number(j.ts) || 0
      if (serverTs > localTs && j.data && Object.keys(j.data).length) {
        const merged = Object.assign(defaults(), j.data)
        setData(merged)
        try { localStorage.setItem(KEY, JSON.stringify(merged)); localStorage.setItem(TS_KEY, String(serverTs)) } catch {}
      } else if (localTs > 0 && serverTs < localTs) {
        fetch('/api/tiempo-estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: d, ts: localTs }) }).catch(() => {})
      }
    }).catch(() => {})
    return () => { if (timer.current) clearInterval(timer.current); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // Carga (o recarga) tareas y épicas desde Épicas. NO toca día/filtros (van en su propio estado).
  const [refreshing, setRefreshing] = useState(false)
  const [tasksError, setTasksError] = useState(false)
  const refreshTasks = useCallback(() => {
    setRefreshing(true)
    fetch('/api/epicas').then(r => r.json()).then(j => {
      if (!j.ok) { setTasksError(true); setAllTasks(a => a || []); return }
      const out: TodayTask[] = []
      const epList: { id: string; name: string; color: string; kpis: EpicaMilestone[]; routines: EpicaRoutine[] }[] = []
      for (const e of j.data as Epica[]) {
        if (!e.archived) epList.push({ id: e.id, name: e.name, color: e.color || '#b4653a', kpis: e.kpis || [], routines: e.routines || [] })
        for (const t of e.tasks || []) {
          if (t.status === 'Terminada' || t.status === 'Archivada') continue
          out.push({ epicaId: e.id, epicaName: e.name, color: e.color || '#b4653a', task: t })
        }
      }
      setAllTasks(out); setEpicasList(epList); setTasksError(false)
    }).catch(() => { setTasksError(true); setAllTasks(a => a || []) }).finally(() => setRefreshing(false))
  }, [])
  useEffect(() => { refreshTasks() }, [refreshTasks])
  // Al volver a la pestaña de Tiempo (tras editar en Épicas) se refresca solo.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') refreshTasks() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', refreshTasks)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', refreshTasks) }
  }, [refreshTasks])

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

  // Tareas del día visible (plan === día, o recurrente que aplica ese día).
  const tasks = useMemo<TodayTask[] | null>(() => {
    if (allTasks === null) return null
    return allTasks.filter(t => t.task.status !== 'Terminada' && t.task.status !== 'Archivada' && (t.task.plan === taskDay || recurringDueToday(t.task, taskDay)))
      .map(t => ({ ...t, recurring: recurringDueToday(t.task, taskDay) }))
  }, [allTasks, taskDay])
  const selTask = (tasks || []).find(t => t.task.id === selTaskId) || null
  const selMeeting = meetings.find(m => m.id === selMeetingId) || null

  // Rutinas diarias de Épicas que aplican el día visible (para marcarlas / iniciarlas aquí).
  const todayRoutines = useMemo(() => {
    const monday = mondayOfISO(taskDay), idx = dayIdxMon(taskDay)
    const out: { epicaId: string; epicaName: string; color: string; rIdx: number; name: string; done: boolean }[] = []
    for (const e of epicasList) (e.routines || []).forEach((r, rIdx) => {
      if (r.days && r.days.length === 7 && !r.days[idx]) return
      out.push({ epicaId: e.id, epicaName: e.name, color: e.color, rIdx, name: r.t, done: !!(r.weeks && r.weeks[monday] && r.weeks[monday][idx]) })
    })
    return out
  }, [epicasList, taskDay])

  // Épicas presentes en las tareas de hoy (para el filtro por épica).
  const todayEpicas = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string }>()
    for (const t of tasks || []) if (!seen.has(t.epicaId)) seen.set(t.epicaId, { id: t.epicaId, name: t.epicaName, color: t.color })
    return [...seen.values()]
  }, [tasks])
  const filteredTasks = useMemo(() => {
    if (tasks === null) return null
    const arr = tasks.filter(t => {
      if (filters.epica && t.epicaId !== filters.epica) return false
      if (filters.prio.size && !filters.prio.has(t.task.priority || '')) return false
      if (filters.diff.size && !filters.diff.has(t.task.difficulty || '')) return false
      if (filters.estado.size && !filters.estado.has(t.task.status || '')) return false
      return true
    })
    const PR: Record<string, number> = { alta: 0, media: 1, baja: 2 }
    const DF: Record<string, number> = { facil: 0, media: 1, dificil: 2 }
    if (sortBy === 'alfa') arr.sort((a, b) => (a.task.t || '').localeCompare(b.task.t || '', 'es'))
    else if (sortBy === 'prioridad') arr.sort((a, b) => (PR[a.task.priority || ''] ?? 9) - (PR[b.task.priority || ''] ?? 9))
    else if (sortBy === 'dificultad') arr.sort((a, b) => (DF[a.task.difficulty || ''] ?? 9) - (DF[b.task.difficulty || ''] ?? 9))
    else arr.sort((a, b) => (a.task.planOrder ?? 1e9) - (b.task.planOrder ?? 1e9))  // manual
    return arr
  }, [tasks, filters, sortBy])

  function save(patch: Partial<AppData>) {
    const nd = { ...data, ...patch }
    const ts = Date.now()
    setData(nd)
    try { localStorage.setItem(KEY, JSON.stringify(nd)); localStorage.setItem(TS_KEY, String(ts)) } catch {}
    // Push durable a Supabase (debounce): localStorage es el instantáneo/offline.
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      fetch('/api/tiempo-estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: nd, ts }) }).catch(() => {})
    }, 900)
  }
  const patchBlock = (id: string, patch: Partial<AppData['blocks'][number]>) =>
    save({ blocks: data.blocks.map(b => b.id === id ? { ...b, ...patch } : b) })
  const toggleDay = (id: string, i: number) => {
    const b = data.blocks.find(x => x.id === id); if (!b) return
    const days = (b.days && b.days.length === 7) ? [...b.days] : [true, true, true, true, true, true, true]
    days[i] = !days[i]; patchBlock(id, { days })
  }
  const daysPreset = (id: string, p: 'all' | 'week' | 'weekend') =>
    patchBlock(id, { days: p === 'all' ? [true, true, true, true, true, true, true] : p === 'week' ? [false, true, true, true, true, true, false] : [true, false, false, false, false, false, true] })

  /* ── Cálculo (portado de renderVals, tono "cuidadora") ─────────────────── */
  const V = useMemo(() => {
    const caring = true
    const bed = data.bed, sleepGoal = data.sleep, session = data.session
    // Sólo los bloques protegidos que aplican HOY (según sus días) + reuniones del calendario.
    const dow = new Date().getDay()
    const todayBlocks = data.blocks.filter(b => blockActiveOn(b, dow))
    const meetingBlocks = meetings.map(m => ({ id: 'cal:' + m.id, name: m.name, area: 'personas' as Area, start: m.start, dur: m.dur, cal: true }))
    const blocks = todayBlocks.concat(meetingBlocks).sort((a, b) => a.start - b.start)
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

    // barra del día: lo YA HECHO (pasado, por su hora) + protegido/libre (futuro)
    const dayISO = iso(new Date())
    const doneToday = data.history.filter(h => h.date === dayISO && h.start < now).sort((a, b) => a.start - b.start)
    const scaleEnd = Math.max(bed + 30, simEnd + 15)
    const barStart = doneToday.length ? Math.min(now, doneToday[0].start) : now
    const total = Math.max(1, scaleEnd - barStart)
    const raw: { s: number; e: number; kind: 'free' | 'prot' | 'done'; area?: Area; name?: string }[] = []
    let cursor = barStart
    for (const d of doneToday) {                       // tramo pasado = lo que hiciste
      const s = Math.max(d.start, cursor), e = Math.min(d.start + d.dur, now)
      if (e <= s) continue
      if (s > cursor) raw.push({ s: cursor, e: s, kind: 'free' })
      raw.push({ s, e, kind: 'done', area: d.area, name: d.name })
      cursor = Math.max(cursor, e)
    }
    if (cursor < now) { raw.push({ s: cursor, e: now, kind: 'free' }); cursor = now }
    for (const b of timeline) {                        // tramo futuro = protegido/libre
      const s = Math.max(b.start, cursor), e = Math.min(b.start + b.dur, scaleEnd)
      if (e <= s) continue
      if (s > cursor) raw.push({ s: cursor, e: s, kind: 'free' })
      raw.push({ s: Math.max(s, cursor), e, kind: 'prot', name: b.name })
      cursor = Math.max(cursor, e)
    }
    if (cursor < scaleEnd) raw.push({ s: cursor, e: scaleEnd, kind: 'free' })
    const seg = (s: number, e: number, bg: string, name: string): { w: number; bg: string; label: string } =>
      ({ w: ((e - s) / total) * 100, bg, label: `${name} · ${clock(s)}–${clock(e)}` })
    const segs: { w: number; bg: string; label: string }[] = []
    for (const r of raw) {
      if (r.kind === 'done') { segs.push(seg(r.s, r.e, AREAS[r.area!]?.color || '#8b8379', r.name || 'Hecho')); continue }
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
        const nm = p.work ? 'El bloque que evalúas' : (r.kind === 'prot' ? (r.name || 'Protegido') : 'Libre')
        segs.push(seg(p.s, p.e, bg, nm))
      }
    }
    // Marcas de hora para la barra del día
    const barTicks: { label: string; left: number }[] = []
    for (let h = Math.ceil(barStart / 60); h <= Math.floor(scaleEnd / 60); h++) barTicks.push({ label: clock(h * 60), left: ((h * 60 - barStart) / total) * 100 })

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
      dot: AREAS[x.h.area] ? AREAS[x.h.area].color : '#8b8379', done: x.h.done !== false,
    }))
    const workedToday = data.history.filter(h => h.date === today && h.area === 'trabajo').reduce((s, h) => s + h.dur, 0)

    // minutos trabajados por hora HOY (para ver si trabajas en tus horas buenas)
    const workedByHour: Record<number, number> = {}
    for (const hh of data.history) if (hh.date === dayISO) for (let h = Math.floor(hh.start / 60); h <= Math.floor((hh.start + hh.dur - 1) / 60); h++) {
      workedByHour[h] = (workedByHour[h] || 0) + Math.max(0, Math.min((h + 1) * 60, hh.start + hh.dur) - Math.max(h * 60, hh.start))
    }
    const energyVal = (h: number) => h < 9 ? 0.42 : h < 12 ? 1 : h < 13 ? 0.8 : h < 15 ? 0.5 : h < 18 ? 0.78 : h < 20 ? 0.52 : h < 22 ? 0.36 : 0.24
    const nowH = Math.floor(now / 60)
    const eBars: { h: number; bg: string; worked: boolean; title: string; cur: boolean }[] = []
    for (let h = 7; h <= 22; h++) {
      const val = energyVal(h), cur = nowH === h, pct = Math.round(val * 100), worked = Math.round(workedByHour[h] || 0)
      const base = val >= 0.9 ? '#b4653a' : val >= 0.7 ? '#c99a6f' : val >= 0.5 ? '#cdb79a' : '#dfceb8'
      eBars.push({ h: val * 100, bg: cur ? '#1c1a17' : now / 60 > h + 1 ? '#e4dcd0' : base, worked: worked > 0, cur, title: `${String(h).padStart(2, '0')}:00 · energía ${pct}%${worked ? ` · trabajaste ${hm(worked)}` : ''}` })
    }
    const nowPct = Math.round(energyVal(nowH) * 100)
    const energyNote = nowH < 13 ? 'Estás dentro de tu pico de rendimiento: es el mejor momento para trabajo profundo.'
      : nowH < 15 ? 'Bajón de media tarde. Buen momento para lo mecánico, no para lo difícil.'
      : nowH < 18 ? 'Segunda ventana de foco. Tu pico ya pasó, rinde alrededor del 78%.'
      : 'Rendimiento en descenso: lo que hagas ahora te cuesta más y vale menos.'

    // Todos los bloques de la rutina de hoy con su cuenta regresiva (o "ya pasó").
    const routineNext = todayBlocks.slice().sort((a, b) => a.start - b.start).map(b => {
      const past = b.start + b.dur <= now
      return {
        name: b.name, dot: AREAS[b.area]?.color || '#8b8379', at: clock(b.start), past,
        when: b.start > now ? 'en ' + hm(b.start - now) : past ? 'ya pasó' : 'en curso',
      }
    })

    // Totales de TODO lo trabajado, agrupado por actividad (para el Historial).
    const totalsMap: Record<string, { min: number; n: number; area: Area }> = {}
    for (const h of data.history) totalsMap[h.name] = { min: (totalsMap[h.name]?.min || 0) + h.dur, n: (totalsMap[h.name]?.n || 0) + 1, area: h.area }
    const allTotals = Object.entries(totalsMap).map(([name, v]) => ({ name, mins: v.min, label: hm(v.min), n: v.n, dot: AREAS[v.area]?.color || '#8b8379' })).sort((a, b) => b.mins - a.mins)

    // Resumen de TAREAS (de Épicas) trabajadas: tiempo invertido + si se completaron.
    const taskWork: Record<string, { min: number; done: boolean; area: Area }> = {}
    for (const h of data.history) if (h.taskId) { const k = h.name; taskWork[k] = { min: (taskWork[k]?.min || 0) + h.dur, done: (taskWork[k]?.done || false) || h.done === true, area: h.area } }
    const taskSummary = Object.entries(taskWork).map(([name, v]) => ({ name, mins: v.min, label: hm(v.min), done: v.done, dot: AREAS[v.area]?.color || '#8b8379' })).sort((a, b) => b.mins - a.mins)

    return {
      nowLabel: clock(now),
      dateLabel: new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
      free, freeLabel: hm(free),
      freeExplain: 'Es lo que queda entre ahora y las ' + clock(bed) + ', descontando todo lo que decidiste proteger.',
      windowLabel: nextBlock ? hm(windowMins) + ' (hasta ' + clock(nextBlock.start) + ')' : hm(windowMins),
      bedLabel: clock(bed) + ' · despertar ' + clock(bed + sleepGoal),
      workedTodayLabel: workedToday ? hm(workedToday) : '—',
      energy: eBars, energyNote, energyNow: nowPct,
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
      segs, barTicks, upcoming, scaleEndLabel: clock(scaleEnd), barStartLabel: clock(barStart),
      weekRange: week[0].date.slice(8) + '/' + week[0].date.slice(5, 7) + ' – ' + week[6].date.slice(8) + '/' + week[6].date.slice(5, 7),
      routineNext, allTotals, taskSummary,
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
  const syncTask = (epicaId: string, task: EpicaTask) => {
    // Se omite `updatedAt` para FORZAR la escritura: si no, la API detecta "choque"
    // (updatedAt viejo tras varias operaciones) y descarta el cambio.
    const rest: EpicaTask = { ...task }; delete (rest as { updatedAt?: string }).updatedAt
    return fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, update: [rest] }) }).catch(() => {})
  }
  const saveTaskEdit = (epicaId: string, task: EpicaTask) => {
    syncTask(epicaId, task)
    setAllTasks(prev => (prev || []).map(x => x.task.id === task.id ? { ...x, task } : x))
    setEditTask(null)
  }
  const unplanTask = (epicaId: string, task: EpicaTask) => {
    syncTask(epicaId, { ...task, plan: '' })
    setAllTasks(prev => (prev || []).filter(x => x.task.id !== task.id))
    setSelTaskId(id => id === task.id ? null : id); setEditTask(null)
  }
  // Registro de hoy (localStorage): editar y borrar entradas.
  const saveHist = (idx: number, patch: Partial<AppData['history'][number]>) => {
    save({ history: data.history.map((h, i) => i === idx ? { ...h, ...patch } : h) }); setHistIdx(null)
  }
  const delHist = (idx: number) => { save({ history: data.history.filter((_, i) => i !== idx) }); setHistIdx(null) }
  // Reabre una tarea en Épicas (En curso, sin doneAt) SIN clobber: usa el objeto completo.
  const reopenByTask = (epicaId: string, taskId: string) => {
    const tt = tasksRef.current.find(x => x.task.id === taskId)
    if (!tt) return
    const upd: EpicaTask = { ...tt.task, status: 'En curso', doneAt: undefined }
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
  }
  // "No estaba terminada": quita el registro y reabre la tarea en Épicas.
  const reopenTask = (idx: number) => {
    const row = data.history[idx]; if (!row) return
    delHist(idx)
    if (row.taskId && row.epicaId) reopenByTask(row.epicaId, row.taskId)
  }
  // Al guardar el registro con el check "se terminó" cambiado, sincroniza a Épicas.
  const syncHistDone = (row: AppData['history'][number], done: boolean) => {
    if (!row.taskId || !row.epicaId) return
    if (done) markEpicTaskDone(row.epicaId, row.taskId)
    else reopenByTask(row.epicaId, row.taskId)
  }

  // Crea la reunión como tarea de HOY en la épica elegida.
  const meetingToEpica = (m: Meeting, epicaId: string) => {
    const t: EpicaTask = { id: (crypto?.randomUUID?.() || 'm' + Date.now()), t: m.name, status: 'Por hacer', due: '', note: '', plan: iso(new Date()), links: [] }
    fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, create: [t] }) }).catch(() => {})
    const ep = epicasList.find(e => e.id === epicaId)
    setAllTasks(prev => [...(prev || []), { epicaId, epicaName: ep?.name || '', color: ep?.color || '#b4653a', task: t }])
  }
  // Marca hecha en Épicas. Si es recurrente (diaria), marca el DÍA en repeatDone
  // (no la cierra); si no, la pone Terminada.
  const markEpicTaskDone = (epicaId: string, taskId: string) => {
    const tt = tasksRef.current.find(x => x.task.id === taskId)
    if (!tt) return
    const today = iso(new Date())
    const rd = tt.task.repeatDone || []
    const upd: EpicaTask = tt.task.repeat
      ? { ...tt.task, repeatDone: rd.includes(today) ? rd : [...rd, today] }
      : { ...tt.task, status: 'Terminada', doneAt: today }
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
    setSelTaskId(id => id === taskId ? null : id)
  }
  // Cierra el bloque en curso: lo registra en el día y, si es una tarea de Épicas,
  // le SUMA el tiempo invertido (entra a la bitácora de avances). markDone la cierra.
  const finish = (markDone = false) => {
    const s = data.session; if (!s) return
    const elapsed = Math.max(1, Math.round(now - s.start))
    const today = iso(new Date())
    save({ session: null, history: data.history.concat([{ date: today, name: s.name, area: s.area, start: Math.round(s.start), dur: elapsed, done: s.taskId ? markDone : true, ...(s.taskId ? { epicaId: s.epicaId, taskId: s.taskId } : {}) }]) })
    if (s.taskId && s.epicaId) {
      const tt = tasksRef.current.find(x => x.task.id === s.taskId)
      if (tt) {
        const log = [...((tt.task.progressLog as EpicaProgressEntry[]) || []), { d: today, note: `⏱ ${hm(elapsed)} trabajado`, pct: tt.task.progress, min: elapsed } as EpicaProgressEntry]
        const doneChange = markDone ? (tt.task.repeat ? { repeatDone: [...(tt.task.repeatDone || []), today] } : { status: 'Terminada', doneAt: today }) : {}
        const upd: EpicaTask = { ...tt.task, progressLog: log, ...doneChange }
        syncTask(s.epicaId, upd)
        setAllTasks(prev => (prev || []).map(x => x.task.id === s.taskId ? { ...x, task: upd } : x))
        if (markDone) setSelTaskId(id => id === s.taskId ? null : id)
      }
    }
  }
  // Vincular una tarea a un objetivo (KPI) de su épica ("Contribuye a"). Escribe a la épica.
  const linkObjetivo = (epicaId: string, taskId: string, milestoneId: string | null) => {
    const ep = epicasList.find(e => e.id === epicaId); if (!ep) return
    const kpis = ep.kpis.map(k => {
      const ids = (k.taskIds || []).filter(id => id !== taskId)
      if (k.id === milestoneId) ids.push(taskId)
      return { ...k, taskIds: ids }
    })
    setEpicasList(prev => prev.map(e => e.id === epicaId ? { ...e, kpis } : e))
    fetch(`/api/epicas/${epicaId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kpis }) }).catch(() => {})
  }
  // Rutinas diarias: marcar hecha el día visible (weeks[lunes][idx]) y persistir a la épica.
  const markRoutineDone = (epicaId: string, rIdx: number) => {
    const ep = epicasList.find(e => e.id === epicaId); if (!ep) return
    const monday = mondayOfISO(taskDay), idx = dayIdxMon(taskDay)
    const routines = ep.routines.map((r, i) => {
      if (i !== rIdx) return r
      const weeks = { ...(r.weeks || {}) }
      const arr = (weeks[monday] && weeks[monday].length === 7) ? [...weeks[monday]] : [false, false, false, false, false, false, false]
      arr[idx] = !arr[idx]; weeks[monday] = arr
      return { ...r, weeks }
    })
    setEpicasList(prev => prev.map(e => e.id === epicaId ? { ...e, routines } : e))
    fetch(`/api/epicas/${epicaId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routines }) }).catch(() => {})
  }
  const startRoutine = (name: string) => { save({ session: { name, area: 'trabajo', start: Math.round(now), dur: 0 } }); setView('hoy') }
  // Reordenar manualmente las tareas: reasigna planOrder 1000,2000,… y persiste.
  const reorderTasks = (ids: string[]) => {
    const byId = new Map((allTasks || []).map(t => [t.task.id!, t]))
    const byEpic = new Map<string, EpicaTask[]>()
    ids.forEach((id, i) => {
      const tt = byId.get(id); if (!tt) return
      const po = (i + 1) * 1000
      if (tt.task.planOrder !== po) { const nt = { ...tt.task, planOrder: po }; byId.set(id, { ...tt, task: nt }); if (!byEpic.has(tt.epicaId)) byEpic.set(tt.epicaId, []); byEpic.get(tt.epicaId)!.push(nt) }
    })
    setAllTasks(prev => (prev || []).map(t => { const u = byId.get(t.task.id!); return u ? u : t }))
    byEpic.forEach((arr, epicaId) => fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, update: arr }) }).catch(() => {}))
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
    setAllTasks(prev => [...(prev || []), { epicaId, epicaName: ep?.name || '', color: ep?.color || '#b4653a', task }])
    setEditTask(null)
  }
  const extend = () => { const s = data.session; if (s) save({ session: { ...s, dur: s.dur + 15 } }) }
  const cancel = () => save({ session: null })
  const areaOptions = (Object.keys(AREAS) as Area[]).filter(k => k !== 'sueno').map(k => ({ id: k, label: AREAS[k].label }))
  const bed = data.bed, sleepGoal = data.sleep
  const today = iso(new Date())

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button onClick={refreshTasks} title="Actualizar tareas de Épicas (mantiene día y filtros)" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '7px 13px', fontSize: 13, color: '#6b645b', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', transition: 'transform .6s', transform: refreshing ? 'rotate(360deg)' : 'none' }}>↻</span>{refreshing ? 'Actualizando…' : 'Actualizar'}</button>
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
            <div className="hoy-grid">

              {/* Tarjeta A — Tiempo útil */}
              <div style={card(26)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={LBL}>tiempo útil restante hoy</span>
                  <span style={{ fontFamily: SERIF, fontSize: 84, lineHeight: .88, letterSpacing: '-.02em' }}>{V.freeLabel}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.55, color: '#6b645b', maxWidth: 380 }}>{V.freeExplain}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={LBL}>tu energía estimada por hora</span>
                    <span style={{ fontSize: 12, color: '#8a4b28', fontWeight: 600 }}>ahora ~{V.energyNow}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 54 }}>
                    {V.energy.map((e, i) => <div key={i} title={e.title} style={{ flex: 1, height: `${e.h}%`, background: e.bg, borderRadius: '4px 4px 2px 2px', minHeight: 4, outline: e.cur ? '2px solid #b4653a' : 'none', outlineOffset: 1 }} />)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, height: 8 }}>
                    {V.energy.map((e, i) => <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>{e.worked && <span style={{ width: 5, height: 5, borderRadius: 999, background: '#6f8256', display: 'block' }} />}</div>)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, fontSize: 9.5, color: '#a49b90', fontVariantNumeric: 'tabular-nums' }}>
                    {V.energy.map((_, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{String(7 + i).padStart(2, '0')}</span>)}
                  </div>
                  <span style={{ fontSize: 13, color: '#8b8379', lineHeight: 1.5 }}>{V.energyNote} <span style={{ color: '#6f8256' }}>● marca las horas en que trabajaste hoy</span></span>
                  <span style={{ fontSize: 12, color: '#a49b90', lineHeight: 1.45 }}>Es una <b style={{ fontWeight: 600 }}>curva típica</b> del día (mañana alta, bajón post-comida, segunda ventana en la tarde), igual para todos — todavía no aprende de ti.</span>
                </div>
                <div style={{ borderTop: '1px solid #eee6da', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Row label="Ventana continua sin interrupciones" value={V.windowLabel} />
                  <Row label="Hora de dormir" value={V.bedLabel} />
                  <Row label="Trabajo registrado hoy" value={V.workedTodayLabel} />
                </div>
                {V.routineNext.length > 0 && (
                  <div style={{ borderTop: '1px solid #eee6da', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={LBL}>cuánto falta para tu rutina</span>
                    {V.routineNext.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, opacity: r.past ? 0.5 : 1 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: r.dot, display: 'block' }} />
                        <span style={{ flex: 1 }}>{r.name}</span>
                        <span style={{ color: '#a49b90', fontVariantNumeric: 'tabular-nums' }}>{r.at}</span>
                        <span style={{ fontWeight: 600, color: r.when === 'en curso' ? '#8a4b28' : '#6b645b', width: 92, textAlign: 'right' }}>{r.when}</span>
                      </div>
                    ))}
                  </div>
                )}
                {V.todayLog.length > 0 && (
                  <div style={{ borderTop: '1px solid #eee6da', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={LBL}>lo que hiciste hoy</span>
                    {V.todayLog.map(l => (
                      <div key={l.idx} onClick={() => setHistIdx(l.idx)} title="Editar registro" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: l.dot, display: 'block' }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                        <span style={{ color: '#a49b90', flexShrink: 0 }}>{l.dur}</span>
                        <span style={{ fontWeight: 600, color: l.done ? '#4f6238' : '#8a4b28', width: 72, textAlign: 'right', fontSize: 12.5, flexShrink: 0 }}>{l.done ? 'hecho ✓' : 'trabajado'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tarjeta B — workspace: elige qué vas a hacer */}
              <div style={card(24)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <span style={LBL}>¿qué vas a hacer?</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {ACTIVITIES.map(a => {
                      const on = a.id === act
                      return <div key={a.id} onClick={() => { setAct(a.id); if (a.id !== 'Trabajo profundo') setSelTaskId(null); if (a.id !== 'Reuniones') setSelMeetingId(null) }} style={{ fontSize: 14, padding: '9px 16px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? '#1c1a17' : '#ddd4c6'}`, background: on ? '#1c1a17' : 'transparent', color: on ? '#faf7f1' : '#6b645b' }}>{a.id}</div>
                    })}
                  </div>
                </div>

                  {tasksError && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#f6e3dd', border: '1px solid #e8cabf', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: '#8a3c2a' }}>No se pudieron cargar las tareas.<button onClick={refreshTasks} style={{ border: '1px solid #e8cabf', background: '#faf7f1', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#8a3c2a', cursor: 'pointer' }}>Reintentar</button></div>}

                  {act === 'Trabajo profundo' && <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 13.5, color: '#6b645b', textTransform: 'capitalize' }}>{taskDay === today ? 'Tareas de hoy' : `Tareas · ${longDayOf(taskDay)}`}</span>
                        {taskDay !== today && <button onClick={() => setTaskDay(today)} style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '4px 12px', fontSize: 12, color: '#8a4b28', cursor: 'pointer' }}>Hoy</button>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setTaskDay(addDaysISO(taskDay, -7))} title="Semana anterior" style={{ width: 28, height: 40, border: '1px solid #e2d9cb', background: 'transparent', borderRadius: 10, color: '#a49b90', cursor: 'pointer' }}>‹</button>
                        {weekOfISO(taskDay).map(d => { const sel = d === taskDay, isT = d === today; return (
                          <button key={d} onClick={() => setTaskDay(d)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 0', borderRadius: 10, border: `1px solid ${sel ? '#b4653a' : 'transparent'}`, background: sel ? '#b4653a' : isT ? '#f3ece1' : 'transparent', color: sel ? '#faf7f1' : '#6b645b', cursor: 'pointer' }}>
                            <span style={{ fontSize: 10, opacity: .8 }}>{dowLetterOf(d)}</span>
                            <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Number(d.slice(8))}</span>
                          </button>
                        ) })}
                        <button onClick={() => setTaskDay(addDaysISO(taskDay, 7))} title="Semana siguiente" style={{ width: 28, height: 40, border: '1px solid #e2d9cb', background: 'transparent', borderRadius: 10, color: '#a49b90', cursor: 'pointer' }}>›</button>
                      </div>
                    </div>
                    {todayRoutines.length > 0 && (
                      <Collapsible title="rutinas diarias" count={`${todayRoutines.filter(r => r.done).length}/${todayRoutines.length}`} defaultOpen={true}>
                        {todayRoutines.map(r => (
                          <div key={r.epicaId + r.rIdx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px' }}>
                            <button onClick={() => markRoutineDone(r.epicaId, r.rIdx)} title="Marcar hecha hoy" style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid ' + (r.done ? '#6f8256' : '#c2b9ab'), background: r.done ? '#6f8256' : 'transparent', cursor: 'pointer', flexShrink: 0 }} />
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: r.color, display: 'block', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: r.done ? 'line-through' : 'none', color: r.done ? '#a49b90' : '#1c1a17' }}>{r.name}</span>
                            <span style={{ fontSize: 12.5, color: '#a49b90', flexShrink: 0 }}>{r.epicaName}</span>
                            <button onClick={() => startRoutine(r.name)} title="Empezar ahora" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer', flexShrink: 0 }}>▶ Empezar</button>
                          </div>
                        ))}
                      </Collapsible>
                    )}
                    <FilterBar epicas={todayEpicas} filters={filters} setFilters={setFilters} sortBy={sortBy} setSortBy={setSortBy} />
                    <TaskPicker tasks={filteredTasks} selId={selTaskId} draggable={sortBy === 'manual'} onReorder={reorderTasks} onQuick={t => startTask({ epicaId: t.epicaId, task: t.task }, 0)} onPick={t => { setSelTaskId(t.task.id!); setSelMeetingId(null); setDur(durByDiff(t.task)) }} onEdit={t => setEditTask({ epicaId: t.epicaId, epicaName: t.epicaName, color: t.color, task: { ...t.task } })} />
                    <div onClick={() => { const e = epicasList.find(x => x.id === filters.epica) || epicasList[0]; setEditTask({ creating: true, epicaId: e?.id || '', epicaName: e?.name || '', color: e?.color || '#b4653a', task: { id: uid(), t: '', status: 'Por hacer', due: '', note: '', plan: taskDay, links: [] } }) }} style={{ alignSelf: 'flex-start', border: '1px dashed #ccc2b2', borderRadius: 999, padding: '10px 18px', fontSize: 14, color: '#6b645b', cursor: 'pointer' }}>+ Nueva tarea{filters.epica ? ` en ${todayEpicas.find(e => e.id === filters.epica)?.name || ''}` : ''}</div>
                  </>}
                  {act === 'Reuniones' && <MeetingsList meetings={meetings} selId={selMeetingId} onPick={m => { setSelMeetingId(m.id); setSelTaskId(null); setDur(m.dur) }} epicas={epicasList} onAddEpica={meetingToEpica} />}
              </div>

              {/* Tarjeta SIM — sesión en curso o simulador de costo */}
              {V.hasSession ? (
                <div style={{ background: '#1c1a17', color: '#faf7f1', borderRadius: 28, padding: 32, display: 'flex', flexDirection: 'column', gap: 22 }}>
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
                <div style={{ background: '#faf7f1', border: '1px solid #e7dfd2', borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ ...LBL, fontSize: 11 }}>el costo de empezar ahora</span>
                  {selTask && <span style={{ fontSize: 12.5, color: '#8a4b28', lineHeight: 1.45 }}>Vas a trabajar en <b>{selTask.task.t}</b> · {selTask.epicaName}</span>}
                  {selMeeting && <span style={{ fontSize: 12.5, color: '#8a4b28', lineHeight: 1.45 }}>Vas a registrar <b>{selMeeting.name}</b> ({hm(selMeeting.dur)})</span>}
                  {!selTask && !selMeeting && <span style={{ fontSize: 12.5, color: '#a49b90', lineHeight: 1.45 }}>Ajusta la duración; elige una tarea a la izquierda para vincularla.</span>}

                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1 }}>{V.durLabel}</span>
                    <span style={{ fontSize: 12.5, color: '#8b8379' }}>termina <b style={{ fontVariantNumeric: 'tabular-nums', color: '#1c1a17' }}>{V.endLabel}</b></span>
                  </div>
                  <input type="range" min={15} max={420} step={15} value={dur} onChange={e => setDur(Number(e.target.value))} aria-label="Duración del bloque" aria-valuetext={`${hm(dur)}, terminarías ${V.endLabel}${V.hitAny ? `, invade ${V.afectados.map(a => a.name.toLowerCase()).join(' y ')}` : ', sin costo'}`} style={{ width: '100%', height: 20, accentColor: '#b4653a' }} />
                  <div style={{ borderRadius: 12, padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: 3, background: V.verdictBg, border: `1px solid ${V.verdictBorder}` }}>
                    <span style={{ ...LBL, color: V.verdictFg, fontSize: 10 }}>{V.verdictKicker}</span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.35, color: '#3a352f' }}>{V.verdictTitle}</span>
                  </div>
                  {V.hitAny && <span style={{ fontSize: 12, color: '#8a3c2a' }}><span style={{ color: '#a49b90' }}>sacrificas: </span>{V.afectados.map(a => `${a.name} ${a.detail}`).join(' · ')}</span>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <div onClick={start} style={{ flex: 1, textAlign: 'center', background: '#1c1a17', color: '#faf7f1', borderRadius: 999, padding: '11px 12px', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>Empezar {V.durLabel}</div>
                    <div onClick={() => setDur(V.safeMax)} title={V.altLabel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ddd4c6', borderRadius: 999, padding: '11px 14px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>{V.altLabel}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Tarjeta C — el resto del día */}
            <div style={card(22)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
                <span style={LBL}>el día</span>
                <span style={{ fontSize: 13, color: '#a49b90' }}>de {V.barStartLabel} a {V.scaleEndLabel}</span>
              </div>
              <div style={{ display: 'flex', height: 52, gap: 2 }}>
                {V.segs.map((s, i) => <div key={i} onClick={() => setBarPick(s.label)} title={s.label} style={{ width: `${s.w}%`, background: s.bg, borderRadius: 5, minWidth: 2, cursor: 'pointer' }} />)}
              </div>
              <div style={{ position: 'relative', height: 14 }}>
                {V.barTicks.map((tk, i) => <span key={i} style={{ position: 'absolute', left: `${tk.left}%`, transform: 'translateX(-50%)', fontSize: 10.5, color: '#a49b90', fontVariantNumeric: 'tabular-nums' }}>{tk.label}</span>)}
              </div>
              <div style={{ fontSize: 13.5, color: barPick ? '#4c4741' : '#a49b90', minHeight: 20 }}>{barPick || 'Toca un segmento de la barra para ver qué es.'}</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: '#6b645b' }}>
                <Legend c="#8b8379">lo que ya hiciste</Legend>
                <Legend c="#b4653a">el bloque que estás evaluando</Legend>
                <Legend c="#8a3c2a">protegido que invadirías</Legend>
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
                    <span style={{ fontSize: 13, fontWeight: 500, color: l.done ? '#4f6238' : '#8a4b28', width: 120, textAlign: 'right' }}>{l.done ? 'hecho ✓' : 'trabajado'}</span>
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
                  <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#f5efe4', border: '1px solid #ebe3d6', borderRadius: 18, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: AREAS[b.area]?.color || '#8b8379', display: 'block' }} />
                      <input type="text" value={b.name} onChange={e => patchBlock(b.id, { name: e.target.value })} style={{ flex: 1, minWidth: 160, background: 'transparent', border: 'none', borderBottom: '1px solid transparent', padding: '6px 0', fontSize: 16 }} />
                      <select value={b.area} onChange={e => patchBlock(b.id, { area: e.target.value as Area })} style={{ background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 999, padding: '8px 12px', fontSize: 14, cursor: 'pointer' }}>
                        {areaOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                      <input type="time" value={clock(b.start)} onChange={e => { const s = parse(e.target.value); const end = b.start + b.dur; let nd = end - s; if (nd < 5) nd += 1440; patchBlock(b.id, { start: s, dur: Math.max(5, nd) }) }} style={{ background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 999, padding: '8px 12px', fontSize: 14, fontVariantNumeric: 'tabular-nums' }} />
                      <span style={{ color: '#a49b90', fontSize: 13 }}>→</span>
                      <input type="time" value={clock(b.start + b.dur)} onChange={e => { let end = parse(e.target.value); if (end <= b.start) end += 1440; patchBlock(b.id, { dur: Math.max(5, end - b.start) }) }} style={{ background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 999, padding: '8px 12px', fontSize: 14, fontVariantNumeric: 'tabular-nums' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="number" min={5} max={600} step={5} value={b.dur} onChange={e => patchBlock(b.id, { dur: Math.max(5, Number(e.target.value) || 5) })} style={{ width: 72, background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 999, padding: '8px 12px', fontSize: 14 }} />
                        <span style={{ fontSize: 14, color: '#a49b90' }}>min{b.dur >= 60 ? ` · ${hm(b.dur)}` : ''}</span>
                      </div>
                      <div onClick={() => save({ blocks: data.blocks.filter(x => x.id !== b.id) })} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, color: '#a49b90', cursor: 'pointer', fontSize: 18 }}>×</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {DOW_CHIPS.map(c => { const on = !b.days || b.days[c.i]; return (
                        <button key={c.i} onClick={() => toggleDay(b.id, c.i)} title={daysLabel(b.days)} style={{ width: 30, height: 30, borderRadius: 999, border: `1px solid ${on ? '#b4653a' : '#e2d9cb'}`, background: on ? '#b4653a' : 'transparent', color: on ? '#faf7f1' : '#a49b90', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{c.lbl}</button>
                      ) })}
                      <span style={{ width: 1, height: 18, background: '#e2d9cb', margin: '0 2px' }} />
                      <button onClick={() => daysPreset(b.id, 'week')} style={{ border: '1px solid #e2d9cb', background: 'transparent', borderRadius: 999, padding: '5px 11px', fontSize: 12, color: '#6b645b', cursor: 'pointer' }}>Entre semana</button>
                      <button onClick={() => daysPreset(b.id, 'all')} style={{ border: '1px solid #e2d9cb', background: 'transparent', borderRadius: 999, padding: '5px 11px', fontSize: 12, color: '#6b645b', cursor: 'pointer' }}>Todos</button>
                      <span style={{ fontSize: 12.5, color: '#a49b90', marginLeft: 'auto' }}>{daysLabel(b.days)}</span>
                    </div>
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

            {V.taskSummary.length > 0 && (
              <div style={card(20)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1.1 }}>Tus tareas trabajadas</span>
                  <span style={{ fontSize: 12.5, color: '#a49b90' }}>tiempo invertido y si se completaron</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {V.taskSummary.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid #eee6da' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: a.dot, display: 'block' }} />
                      <span style={{ fontSize: 15, flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: a.done ? '#4f6238' : '#8a4b28' }}>{a.done ? 'completada' : 'solo tiempo'}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, width: 70, textAlign: 'right' }}>{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {V.allTotals.length > 0 && (
              <div style={card(20)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1.1 }}>En qué has trabajado</span>
                  <span style={{ fontSize: 12.5, color: '#a49b90' }}>todo lo registrado, por actividad</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {V.allTotals.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid #eee6da' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: a.dot, display: 'block' }} />
                      <span style={{ fontSize: 15, flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: 12.5, color: '#a49b90' }}>{a.n}×</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {editTask && <TaskDetail info={editTask} epicas={epicasList} onSave={saveTaskEdit} onDone={markEpicTaskDone} onUnplan={unplanTask} onCreate={createTask} onStart={startTask} onLinkObjetivo={linkObjetivo} onClose={() => setEditTask(null)} />}
      {histIdx !== null && data.history[histIdx] && <HistoryEditor row={data.history[histIdx]} idx={histIdx} onSave={saveHist} onDelete={delHist} onReopen={reopenTask} onSyncDone={syncHistDone} onClose={() => setHistIdx(null)} />}
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

/** Tareas del día (de Épicas): elegir una para trabajarla, editarla, o arrastrarla para reordenar. */
function TaskPicker({ tasks, selId, draggable, onReorder, onQuick, onPick, onEdit }: { tasks: TodayTask[] | null; selId: string | null; draggable: boolean; onReorder: (ids: string[]) => void; onQuick: (t: TodayTask) => void; onPick: (t: TodayTask) => void; onEdit: (t: TodayTask) => void }) {
  const [order, setOrder] = useState<string[] | null>(null)
  const [open, setOpen] = useState(true)
  const orderRef = useRef<string[] | null>(null)
  const dragId = useRef<string | null>(null)
  useEffect(() => { orderRef.current = order }, [order])
  useEffect(() => { setOrder(null) }, [tasks])

  if (tasks === null) return <span style={{ fontSize: 13, color: '#a49b90' }}>Cargando tus tareas…</span>
  if (!tasks.length) return (
    <div style={{ fontSize: 13.5, color: '#8b8379', lineHeight: 1.5 }}>No hay tareas para este día. Créala abajo o <a href="/epicas" style={{ color: '#8a4b28' }}>planéala en Épicas</a>.</div>
  )
  const display = (order && draggable) ? (order.map(id => tasks.find(t => t.task.id === id)).filter(Boolean) as TodayTask[]) : tasks

  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault(); dragId.current = id; setOrder(tasks.map(t => t.task.id!))
    const move = (ev: PointerEvent) => {
      if (!dragId.current) return
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const row = el?.closest('[data-taskid]') as HTMLElement | null
      if (!row) return
      const overId = row.getAttribute('data-taskid')!
      if (overId === dragId.current) return
      setOrder(prev => {
        const cur = prev || tasks.map(t => t.task.id!)
        const from = cur.indexOf(dragId.current!), to = cur.indexOf(overId)
        if (from < 0 || to < 0) return cur
        const next = cur.slice(); next.splice(from, 1); next.splice(to, 0, dragId.current!)
        return next
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      const final = orderRef.current; dragId.current = null
      if (final) onReorder(final)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 0 4px', width: '100%' }}>
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: '#a49b90', fontSize: 12 }}>▸</span>
        <span style={{ ...LBL, letterSpacing: '.1em' }}>tus tareas del día</span>
        <span style={{ fontSize: 12, color: '#a49b90' }}>{display.length}{draggable ? ' · arrastra ⠿' : ' · toca una'}</span>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {display.map(t => {
        const on = t.task.id === selId
        const ts = taskStyle(t.task.status)
        const dragging = dragId.current === t.task.id
        return (
          <div key={t.task.id} data-taskid={t.task.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 12, border: `1px solid ${on ? '#b4653a' : 'transparent'}`, background: dragging ? '#efe6d8' : on ? '#f7ece2' : 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {draggable && <span onPointerDown={e => startDrag(e, t.task.id!)} title="Arrastrar para reordenar" style={{ cursor: 'grab', color: '#c2b9ab', fontSize: 15, touchAction: 'none', flexShrink: 0, padding: '0 2px' }}>⠿</span>}
              <span onClick={() => onPick(t)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, display: 'block', flexShrink: 0 }} />
                <span style={{ fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task.t || 'Sin título'}</span>
                <span style={{ fontSize: 12.5, color: '#a49b90', flexShrink: 0 }}>{t.epicaName}</span>
              </span>
              <button onClick={() => onQuick(t)} title="Empezar ahora (contador libre)" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer', flexShrink: 0 }}>▶</button>
              <button onClick={() => onEdit(t)} title="Ver / trabajar la tarea" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#6b645b', cursor: 'pointer', flexShrink: 0 }}>Ver</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: draggable ? 28 : 20 }}>
              <Tag c={ts.c} bg={ts.bg}>{ts.label}</Tag>
              {t.recurring && <Tag c="#7A6FB0" bg="rgba(122,111,176,0.14)">diaria</Tag>}
              {t.task.priority && <Tag c={PRIO_TONE[t.task.priority]} bg={PRIO_TONE[t.task.priority] + '22'}>{t.task.priority}</Tag>}
              {t.task.difficulty && <Tag c="#5B6B86" bg="rgba(91,107,134,0.12)">{t.task.difficulty}</Tag>}
              {t.task.due && <Tag c="#A87A2C" bg="rgba(194,147,58,0.14)">vence {fmtDue(t.task.due)}</Tag>}
              {typeof t.task.progress === 'number' && t.task.progress > 0 && <Tag c="#2E6E6E" bg="rgba(62,142,142,0.14)">{t.task.progress}%</Tag>}
            </div>
          </div>
        )
      })}
      </div>}
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
function NLbl({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 7, marginTop: 4 }}>{children}</div>
}
function Collapsible({ title, count, defaultOpen, children }: { title: string; count?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: open ? 8 : 0, borderTop: '1px solid #eee6da', paddingTop: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, width: '100%' }}>
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: '#a49b90', fontSize: 12 }}>▸</span>
        <span style={{ ...LBL, letterSpacing: '.1em' }}>{title}</span>
        {count && <span style={{ fontSize: 12, color: '#a49b90' }}>{count}</span>}
      </button>
      {open && children}
    </div>
  )
}
function PrioIcon({ p, on }: { p: string; on: boolean }) {
  const c = on ? PRIO_TONE[p] : '#a49b90'
  return <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }}>{[6, 10, 14].map((h, i) => <span key={i} style={{ width: 3, height: h, background: c, borderRadius: 1, display: 'block' }} />)}</span>
}
function DiffIcon({ n }: { n: number }) {
  return <span style={{ display: 'inline-flex', gap: 3, height: 14, alignItems: 'center' }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: i < n ? '#B0522E' : '#d8cfc0', display: 'block' }} />)}</span>
}

/** Barra de filtros de las tareas de hoy (por épica, prioridad, dificultad, estado). */
function FilterBar({ epicas, filters, setFilters, sortBy, setSortBy }: { epicas: { id: string; name: string; color: string }[]; filters: Filters; setFilters: (f: (p: Filters) => Filters) => void; sortBy: string; setSortBy: (s: 'manual' | 'alfa' | 'prioridad' | 'dificultad') => void }) {
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
        {any && <button onClick={() => setFilters(() => ({ epica: null, prio: new Set(), diff: new Set(), estado: new Set() }))} style={{ border: 'none', background: 'transparent', color: '#a49b90', fontSize: 12, cursor: 'pointer' }}>limpiar</button>}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 12, color: '#a49b90' }}>orden
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'manual' | 'alfa' | 'prioridad' | 'dificultad')} style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 10px', fontSize: 12, color: '#6b645b', cursor: 'pointer' }}>
            <option value="manual">Manual</option>
            <option value="alfa">A–Z</option>
            <option value="prioridad">Prioridad</option>
            <option value="dificultad">Dificultad</option>
          </select>
        </label>
      </div>
    </div>
  )
}

/** Detalle de tarea: TODA la info con el formato de Épicas; edita lo principal aquí. */
function TaskDetail({ info, epicas, onSave, onDone, onUnplan, onCreate, onStart, onLinkObjetivo, onClose }: {
  info: { epicaId: string; epicaName: string; color: string; task: EpicaTask; creating?: boolean }
  epicas: { id: string; name: string; color: string; kpis: EpicaMilestone[] }[]
  onSave: (epicaId: string, t: EpicaTask) => void; onDone: (epicaId: string, taskId: string) => void
  onUnplan: (epicaId: string, t: EpicaTask) => void
  onCreate: (epicaId: string, t: EpicaTask) => void; onStart: (info: { epicaId: string; task: EpicaTask }, dur: number) => void
  onLinkObjetivo: (epicaId: string, taskId: string, milestoneId: string | null) => void
  onClose: () => void
}) {
  const creating = !!info.creating
  const [t, setT] = useState<EpicaTask>(info.task)
  const [epId, setEpId] = useState(info.epicaId)
  const [startDur, setStartDur] = useState(0)
  const [comment, setComment] = useState('')
  const [newSub, setNewSub] = useState('')
  const [bitDate, setBitDate] = useState(iso(new Date()))
  const [bitNote, setBitNote] = useState('')
  const noteRef = useRef<HTMLDivElement>(null)
  // La nota es contentEditable NO controlado: se fija una sola vez al abrir; así el
  // re-render del reloj (cada segundo) no reescribe ni borra lo que estás tecleando.
  useEffect(() => { if (noteRef.current) noteRef.current.innerHTML = sanitizeHtml(info.task.note || '') }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  // Diseño navy idéntico al editor de Épicas.
  const nf: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '8px 10px', fontSize: 13, color: '#14233D', boxSizing: 'border-box' }
  const eb: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }
  const smallBtn: CSSProperties = { border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }
  const box = (on: boolean, c: string, bg: string): CSSProperties => ({ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: on ? `1px solid ${c}` : '1px solid rgba(15,35,64,0.14)', background: on ? bg : '#fff', color: on ? c : 'rgba(20,35,61,0.55)' })
  const objetivos = (epicas.find(e => e.id === epId)?.kpis) || []
  const linkedId = objetivos.find(k => (k.taskIds || []).includes(t.id!))?.id || ''
  const addSubQuick = () => { const v = newSub.trim(); if (!v) return; setT(p => ({ ...p, subtasks: [...(p.subtasks || []), { id: uid(), t: v, done: false }] })); setNewSub('') }
  const setLog = (fn: (a: EpicaProgressEntry[]) => EpicaProgressEntry[]) => setT(p => ({ ...p, progressLog: fn(p.progressLog || []) }))
  const logAdvance = () => {
    setLog(a => {
      const i = a.findIndex(e => e.d === bitDate && (e as { min?: number }).min == null)
      const entry: EpicaProgressEntry = { d: bitDate, pct: t.progress ?? 0, ...(bitNote.trim() ? { note: bitNote.trim() } : {}) }
      return i >= 0 ? a.map((x, j) => j === i ? { ...x, ...entry } : x) : [...a, entry]
    }); setBitNote('')
  }
  const withNote = (): EpicaTask => ({ ...t, note: sanitizeHtml(noteRef.current?.innerHTML ?? t.note ?? '') })
  const invested = (t.progressLog || []).reduce((s, e) => s + ((e as { min?: number }).min || 0), 0)
  const epColor = epicas.find(e => e.id === epId)?.color || info.color
  const setSubs = (fn: (a: NonNullable<EpicaTask['subtasks']>) => NonNullable<EpicaTask['subtasks']>) => setT(p => ({ ...p, subtasks: fn(p.subtasks || []) }))
  const setLinks = (fn: (a: NonNullable<EpicaTask['links']>) => NonNullable<EpicaTask['links']>) => setT(p => ({ ...p, links: fn(p.links || []) }))
  const addComment = () => { if (!comment.trim()) return; setT(p => ({ ...p, comentarios: [...(p.comentarios || []), { at: new Date().toISOString(), text: comment.trim() }] })); setComment('') }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflow: 'auto', fontFamily: 'var(--tiempo-ui), system-ui, sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-label={creating ? 'Nueva tarea' : 'Editar tarea'} onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
        <div style={{ height: 4, background: epColor }} />
        <div style={{ padding: '20px 24px 22px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: epColor }} />{creating ? 'Nueva tarea' : info.epicaName}</div>
            <button aria-label="Cerrar" onClick={onClose} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 15 }}>✕</button>
          </div>

          {creating && (<><NLbl>Épica</NLbl><select value={epId} onChange={e => setEpId(e.target.value)} style={{ ...nf, width: '100%' }}>{epicas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></>)}

          <input autoFocus value={t.t} placeholder="¿Qué hay que hacer?" onChange={e => setT({ ...t, t: e.target.value })} style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 24, lineHeight: 1.1, color: '#10233F', border: 'none', outline: 'none', background: 'transparent', margin: '8px 0 4px', padding: 0, width: '100%' }} />
          {!creating && <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginBottom: 8 }}>{t.createdAt ? `Creada · ${cap(new Date(t.createdAt + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }))}` : ''}{invested > 0 ? `  ·  ⏱ ${hm(invested)} invertidos` : ''}</div>}

          <NLbl>Estado</NLbl>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[...TASK_STATUSES, 'Archivada'].map(s => { const ts = taskStyle(s); const on = t.status === s; return <button key={s} onClick={() => setT({ ...t, status: s })} style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, border: on ? `1px solid ${ts.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? ts.bg : '#fff', color: on ? ts.c : 'rgba(20,35,61,0.55)' }}>{ts.label}</button> })}
          </div>

          {objetivos.length > 0 && (<><NLbl>Contribuye a</NLbl>
            <select value={linkedId} onChange={e => onLinkObjetivo(epId, t.id!, e.target.value || null)} style={{ ...nf, width: '100%', fontWeight: 600, color: linkedId ? '#16365F' : 'rgba(20,35,61,0.5)' }}>
              <option value="">— Ningún objetivo —</option>
              {objetivos.map(o => <option key={o.id} value={o.id}>{o.t}</option>)}
            </select></>)}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
            <div style={{ flex: 1, minWidth: 210 }}><NLbl>Prioridad</NLbl>
              <div style={{ display: 'flex', gap: 6 }}>{PRIOS.map(p => { const on = t.priority === p; return <button key={p} onClick={() => setT({ ...t, priority: on ? undefined : p })} style={box(on, PRIO_TONE[p], PRIO_TONE[p] + '1f')}><PrioIcon p={p} on={on} />{cap(p)}</button> })}</div>
            </div>
            <div style={{ flex: 1, minWidth: 210 }}><NLbl>Dificultad</NLbl>
              <div style={{ display: 'flex', gap: 6 }}>{DIFFS.map((d, di) => <button key={d} onClick={() => setT({ ...t, difficulty: t.difficulty === d ? undefined : d })} style={box(t.difficulty === d, '#5B6B86', 'rgba(91,107,134,0.12)')}><DiffIcon n={di + 1} />{cap(d)}</button>)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12, marginBottom: 6 }}>
            <span style={eb}>Avance</span><span style={{ fontSize: 12, fontWeight: 800, color: '#16365F' }}>{t.progress || 0}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={0} max={100} step={5} value={t.progress || 0} onChange={e => setT({ ...t, progress: Number(e.target.value) })} style={{ flex: 1, accentColor: '#3E8E8E' }} />
            <button onClick={() => setT({ ...t, progress: 100, status: 'Terminada' })} style={{ border: '1px solid rgba(62,142,142,0.35)', background: 'rgba(62,142,142,0.10)', color: '#2E6E6E', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>100%</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, marginBottom: 6 }}>
            <span style={eb}>Bitácora de avance</span><span style={{ flex: 1 }} />
            <input type="date" value={bitDate} onChange={e => setBitDate(e.target.value)} style={{ ...nf, padding: '6px 9px' }} />
            <button onClick={logAdvance} style={{ background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305', border: 'none', borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Avancé este día</button>
          </div>
          <input value={bitNote} onChange={e => setBitNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') logAdvance() }} placeholder="Nota del avance (opcional)…" style={{ ...nf, width: '100%', marginBottom: 6 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(t.progressLog || []).slice().reverse().map((e, ri) => { const i = (t.progressLog || []).length - 1 - ri; const min = (e as { min?: number }).min; return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <input type="date" value={e.d} onChange={ev => setLog(a => a.map((x, j) => j === i ? { ...x, d: ev.target.value } : x))} style={{ ...nf, padding: '6px 8px', fontSize: 12 }} />
                <input type="number" min={0} max={100} value={typeof e.pct === 'number' ? e.pct : ''} placeholder="—" onChange={ev => setLog(a => a.map((x, j) => j === i ? { ...x, pct: ev.target.value === '' ? undefined : Number(ev.target.value) } : x))} style={{ ...nf, width: 58, padding: '6px 8px', fontSize: 12 }} /><span style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}>%</span>
                <span style={{ flex: 1, minWidth: 80, fontSize: 12.5, color: '#4c5a70' }}>{min ? `⏱ ${hm(min)} trabajado` : e.note || ''}</span>
                <button onClick={() => setLog(a => a.filter((_, j) => j !== i))} style={{ border: '1px solid rgba(15,35,64,0.1)', background: '#fff', borderRadius: 8, height: 28, width: 28, color: 'rgba(20,35,61,0.5)', cursor: 'pointer' }}>✕</button>
              </div>
            ) })}
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column' }}><NLbl>Hacer (plan)</NLbl><input type="date" value={t.plan || ''} onChange={e => setT({ ...t, plan: e.target.value })} style={nf} /></label>
            <label style={{ display: 'flex', flexDirection: 'column' }}><NLbl>Vence</NLbl><input type="date" value={t.due || ''} onChange={e => setT({ ...t, due: e.target.value })} style={nf} /></label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column' }}><NLbl>Recordarme 🔔</NLbl><input type="datetime-local" value={isoToLocalInput(t.remindAt)} onChange={e => setT({ ...t, remindAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} style={{ ...nf, width: '100%' }} /></label>

          <NLbl>Nota</NLbl>
          <div ref={noteRef} className="ep-note" contentEditable suppressContentEditableWarning style={{ ...nf, minHeight: 60, maxHeight: 200, overflowY: 'auto', lineHeight: 1.55, width: '100%', display: 'block' }} />

          <div style={{ marginTop: 14 }}><NLbl>Subtareas · {(t.subtasks || []).filter(s => s.done).length}/{(t.subtasks || []).length}</NLbl></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {(t.subtasks || []).map((s, i) => (
              <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <button onClick={() => setSubs(a => a.map((x, j) => j === i ? { ...x, done: !x.done } : x))} style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid ' + (s.done ? '#3E8E8E' : 'rgba(15,35,64,0.25)'), background: s.done ? '#3E8E8E' : '#fff', cursor: 'pointer', flexShrink: 0 }} />
                <input value={s.t} onChange={e => setSubs(a => a.map((x, j) => j === i ? { ...x, t: e.target.value } : x))} style={{ ...nf, flex: 1, textDecoration: s.done ? 'line-through' : 'none' }} />
                <button onClick={() => setSubs(a => a.filter((_, j) => j !== i))} style={{ border: '1px solid rgba(15,35,64,0.1)', background: '#fff', borderRadius: 8, height: 30, width: 30, color: 'rgba(20,35,61,0.5)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px dashed rgba(15,35,64,0.25)', flexShrink: 0 }} />
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSubQuick() }} placeholder="Agregar subtarea y Enter…" style={{ ...nf, flex: 1 }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 }}>
            <span style={eb}>Links</span>
            <button onClick={() => setLinks(a => [...a, { label: '', url: '' }])} style={smallBtn}>+ Link</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {(t.links || []).map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <input value={l.label} placeholder="Etiqueta" onChange={e => setLinks(a => a.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ ...nf, flex: '0 0 110px', width: 110 }} />
                <input value={l.url} placeholder="https://…" onChange={e => setLinks(a => a.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} style={{ ...nf, flex: 1, minWidth: 0 }} />
                {l.url && <a href={safeUrl(l.url)} target="_blank" rel="noreferrer" style={{ color: '#A87A2C', fontSize: 14, textDecoration: 'none', flexShrink: 0 }}>↗</a>}
                <button onClick={() => setLinks(a => a.filter((_, j) => j !== i))} style={{ border: '1px solid rgba(15,35,64,0.1)', background: '#fff', borderRadius: 8, height: 30, width: 30, color: 'rgba(20,35,61,0.5)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>

          <NLbl>Comentarios</NLbl>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(t.comentarios || []).map((c, i) => (
              <div key={i} style={{ fontSize: 13, color: '#3a4a63', lineHeight: 1.5 }}><span style={{ color: 'rgba(20,35,61,0.45)' }}>{new Date(c.at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · </span>{c.text}</div>
            ))}
            <div style={{ display: 'flex', gap: 7 }}>
              <input value={comment} placeholder="Escribe un comentario…" onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment() }} style={{ ...nf, flex: 1 }} />
              <button onClick={addComment} style={smallBtn}>Comentar</button>
            </div>
          </div>

          {/* Comenzar (contador). dur 0 = libre */}
          {!creating && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(15,35,64,0.08)', paddingTop: 14, marginTop: 16 }}>
              <div style={eb}>Comenzar · {startDur ? 'estimo ' + hm(startDur) : 'contador libre'}</div>
              <input type="range" min={0} max={240} step={15} value={startDur} onChange={e => setStartDur(Number(e.target.value))} style={{ width: '100%', accentColor: '#C2933A' }} />
              <button onClick={() => onStart({ epicaId: epId, task: withNote() }, startDur)} style={{ background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>▶ Comenzar {startDur ? hm(startDur) : 'ahora'}</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', borderTop: '1px solid rgba(15,35,64,0.08)', paddingTop: 14 }}>
            {creating
              ? <button onClick={() => onCreate(epId, withNote())} disabled={!t.t.trim() || !epId} style={{ flex: 1, minWidth: 130, background: '#16365F', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!t.t.trim() || !epId) ? .5 : 1 }}>Crear tarea</button>
              : <>
                <button onClick={() => onSave(epId, withNote())} style={{ flex: 1, minWidth: 120, background: '#16365F', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
                <button onClick={() => onDone(epId, t.id!)} style={{ background: '#2E6E6E', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>✓ Terminar</button>
                <button onClick={() => onUnplan(epId, withNote())} style={{ border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.06)', color: '#B0522E', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, cursor: 'pointer' }}>Quitar de hoy</button>
              </>}
          </div>
          {!creating && <a href={`/epicas?v=dia&d=${t.plan || iso(new Date())}&e=${epId}&t=${t.id}`} target="_blank" rel="noopener noreferrer" style={{ textAlign: 'center', fontSize: 12, color: 'rgba(20,35,61,0.45)', marginTop: 10 }}>También abrir en Épicas ↗</a>}
        </div>
      </div>
    </div>
  )
}

/** Editor de una entrada del registro de hoy (localStorage). */
function HistoryEditor({ row, idx, onSave, onDelete, onReopen, onSyncDone, onClose }: {
  row: AppData['history'][number]; idx: number
  onSave: (idx: number, patch: Partial<AppData['history'][number]>) => void; onDelete: (idx: number) => void; onReopen: (idx: number) => void
  onSyncDone: (row: AppData['history'][number], done: boolean) => void; onClose: () => void
}) {
  const [r, setR] = useState(row)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const field: CSSProperties = { background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 12, padding: '10px 12px', fontSize: 14, color: '#1c1a17', boxSizing: 'border-box' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 90 }}>
      <div role="dialog" aria-modal="true" aria-label="Editar registro" onClick={e => e.stopPropagation()} style={{ width: 'min(440px,100%)', background: '#f5efe4', border: '1px solid #e7dfd2', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: SERIF, fontSize: 22 }}>Editar registro</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#a49b90', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <input autoFocus value={r.name} onChange={e => setR({ ...r, name: e.target.value })} style={{ ...field, width: '100%', fontSize: 16 }} />
        <select value={r.area} onChange={e => setR({ ...r, area: e.target.value as Area })} style={{ ...field, width: '100%' }}>
          {(Object.keys(AREAS) as Area[]).map(k => <option key={k} value={k}>{AREAS[k].label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={{ ...LBL, letterSpacing: '.1em' }}>empezó</span><input type="time" value={clock(r.start)} onChange={e => { const s = parse(e.target.value); setR(p => { const end = p.start + p.dur; let nd = end - s; if (nd < 1) nd += 1440; return { ...p, start: s, dur: Math.max(1, nd) } }) }} style={{ ...field, fontVariantNumeric: 'tabular-nums' }} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={{ ...LBL, letterSpacing: '.1em' }}>terminó</span><input type="time" value={clock(r.start + r.dur)} onChange={e => { let end = parse(e.target.value); if (end <= r.start) end += 1440; setR(p => ({ ...p, dur: Math.max(1, end - p.start) })) }} style={{ ...field, fontVariantNumeric: 'tabular-nums' }} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={{ ...LBL, letterSpacing: '.1em' }}>duración · {hm(r.dur)}</span><input type="number" min={1} max={1440} step={5} value={r.dur} onChange={e => setR({ ...r, dur: Math.max(1, Number(e.target.value) || 1) })} style={{ ...field, width: 92 }} /></label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={r.done !== false} onChange={e => setR({ ...r, done: e.target.checked })} />
          Se terminó la actividad {r.done === false && <span style={{ color: '#8a4b28' }}>· solo se le invirtió tiempo</span>}
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
          <button onClick={() => { const done = r.done !== false; if (row.taskId) onSyncDone(row, done); onSave(idx, { name: r.name, area: r.area, start: r.start, dur: r.dur, done }) }} style={{ flex: 1, minWidth: 120, background: '#1c1a17', color: '#faf7f1', border: 'none', borderRadius: 999, padding: 13, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Guardar</button>
          <button onClick={() => onDelete(idx)} style={{ border: '1px solid #e2d9cb', background: 'transparent', color: '#8a3c2a', borderRadius: 999, padding: '13px 18px', fontSize: 14, cursor: 'pointer' }}>Borrar</button>
        </div>
        {row.taskId && <button onClick={() => onReopen(idx)} style={{ border: '1px solid #e2d9cb', background: 'transparent', color: '#8a4b28', borderRadius: 999, padding: '11px 16px', fontSize: 13.5, cursor: 'pointer' }}>No estaba terminada · reabrir la tarea en Épicas</button>}
      </div>
    </div>
  )
}

const MARGEN_CSS = `
.hoy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; align-items: start; }
.hoy-grid > * { min-width: 0; }
@media (min-width: 1040px) { .hoy-grid { grid-template-columns: 1fr 1.4fr 0.8fr; } }
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
