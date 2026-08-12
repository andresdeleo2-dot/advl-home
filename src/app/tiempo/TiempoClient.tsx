'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import SiteHeader from '@/components/SiteHeader'
import SectionNav from '@/components/SectionNav'
import FavoritosStrip from '@/components/FavoritosStrip'
import {
  AREAS, ACTIVITIES, DAY_NAMES, KEY, defaults, hm, clock, parse, iso,
  DOW_CHIPS, blockActiveOn, daysLabel,
  type AppData, type Area, type ScheduledBlock, type Block, type HistoryRow,
} from '@/lib/tiempo'
import type { Epica, EpicaTask, EpicaSubtask, EpicaTaskLink, EpicaTaskComment, EpicaProgressEntry, EpicaMilestone, EpicaRoutine, EpicaLink } from '@/lib/supabase'
import { taskStyle, fmtDue, safeUrl, uid, isoToLocalInput, cap, typeColor, completeRecurring } from '@/components/epicas/core'
import { sanitizeHtml } from '@/lib/sanitize'

const TASK_STATUSES = ['Por hacer', 'En curso', 'Esperando', 'Terminada']
const PRIOS = ['alta', 'media', 'baja'] as const
const DIFFS = ['facil', 'media', 'dificil'] as const
const PRIO_TONE: Record<string, string> = { alta: '#B0522E', media: '#A87A2C', baja: '#5B6B86' }
type Filters = { epica: string | null; prio: Set<string>; diff: Set<string>; estado: Set<string> }

const TS_KEY = KEY + '.ts'
// Minutos transcurridos de una sesión, tolerando cruce de medianoche (now se reinicia
// a minutos-del-día). Si la resta es fuertemente negativa (cruzó medianoche), +1440.
const elapsedMin = (start: number, nowMin: number) => { let d = nowMin - start; if (d < -1) d += 1440; return d }
// Minutos transcurridos contando pausas: acumulado + segmento en curso (0 si está en pausa). Si la
// sesión trae `segAt` (ms), el segmento se mide con el RELOJ REAL — así una sesión que cruza medianoche
// o que se quedó corriendo >24h ya no da minutos erróneos (el modelo por minutos-del-día se envolvía).
const sessionElapsed = (s: { start: number; pausedAccum?: number; pausedAt?: number; segAt?: number }, nowMin: number) => {
  const banked = s.pausedAccum || 0
  if (s.pausedAt != null) return banked
  if (s.segAt != null) return banked + Math.max(0, (Date.now() - s.segAt) / 60000)
  return banked + Math.max(0, elapsedMin(s.start, nowMin))
}
const SERIF = 'var(--tiempo-serif), Georgia, serif'
// Luminancia de un color hex → elige texto claro/oscuro para etiquetas dentro de la barra.
const lum = (hex: string) => { const h = hex.replace('#', ''); if (h.length < 6) return 1; const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 }
const textOn = (hex: string) => lum(hex) > 0.62 ? '#4c4741' : '#faf7f1'
// Beep corto con WebAudio (sin assets); silencioso si el navegador lo bloquea.
function beep() {
  try {
    const AC: typeof AudioContext | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC(); ctx.resume?.()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55)
    o.start(); o.stop(ctx.currentTime + 0.55); o.onended = () => ctx.close()
  } catch {}
}
// Notificación del navegador (si el usuario dio permiso). No hace nada si no.
function notify(title: string, body: string) {
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, icon: '/icon.png' }) } catch {}
}
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
/** Reunión del calendario, en minutos desde medianoche + fecha local 'YYYY-MM-DD'. */
type Meeting = { id: string; name: string; start: number; dur: number; date: string; location?: string; description?: string; htmlLink?: string; hangoutLink?: string }

const durByDiff = (t?: EpicaTask) => t?.difficulty === 'facil' ? 30 : t?.difficulty === 'dificil' ? 120 : 60
const isDateStr = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
// Al marcar terminada, la fecha de término es la fecha en que se IBA A HACER (plan) si existe;
// si no, el día que se pasa (hoy/día visto). Así "terminó" queda en la fecha que decía "hacer".
const doneDayFor = (task: EpicaTask, fallback: string) => isDateStr(task.plan) ? task.plan! : fallback

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
  const [view, setView] = useState<'plan' | 'hoy' | 'semana' | 'rutina' | 'historial'>('hoy')
  const [hoyPanel, setHoyPanel] = useState<'both' | 'resumen' | 'tareas'>('both')   // vista Hoy: ambos paneles, o uno maximizado
  const [dur, setDur] = useState(90)
  const [act, setAct] = useState('Trabajo profundo')
  const [data, setData] = useState<AppData>(() => defaults())
  const [loaded, setLoaded] = useState(false)
  const [allTasks, setAllTasks] = useState<TodayTask[] | null>(null)   // null = cargando; TODAS las tareas abiertas
  const [taskDay, setTaskDay] = useState(iso(new Date()))              // día que se está viendo/planeando
  const [planDay, setPlanDay] = useState(iso(new Date()))              // día que se planifica en el Planificador
  const [epicasList, setEpicasList] = useState<{ id: string; name: string; color: string; kpis: EpicaMilestone[]; routines: EpicaRoutine[]; links: EpicaLink[] }[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selTaskId, setSelTaskId] = useState<string | null>(null)
  const [selMeetingId, setSelMeetingId] = useState<string | null>(null)
  const [editTask, setEditTask] = useState<{ epicaId: string; epicaName: string; color: string; task: EpicaTask; creating?: boolean } | null>(null)
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const [barPick, setBarPick] = useState<string>('')
  const [energyLearned, setEnergyLearned] = useState(true)   // curva aprendida vs. típica
  const [costOpen, setCostOpen] = useState(false)            // popup "el costo de empezar ahora"
  const [meetView, setMeetView] = useState<Meeting | null>(null)   // popup con el detalle de una junta
  const [scheduleAt, setScheduleAt] = useState<number | null>(null)   // hora (min) para agendar una tarea; abre el selector
  const [scheduleName, setScheduleName] = useState<string | null>(null)   // nombre preseleccionado (agendar una rutina como actividad libre)
  const [schedulePreset, setSchedulePreset] = useState<string | null>(null)  // tarea preseleccionada al agendar desde su fila
  const [promptedSched, setPromptedSched] = useState<Set<string>>(() => new Set())  // agendados ya preguntados esta sesión
  const [notifOn, setNotifOn] = useState(false)              // permiso de notificaciones del navegador
  const [saveErr, setSaveErr] = useState(false)              // último guardado falló (sin red / error)
  const [saveErrMsg, setSaveErrMsg] = useState('')           // mensaje exacto del error (diagnóstico)
  const [undo, setUndo] = useState<{ msg: string; fn: () => void } | null>(null)  // toast "deshacer"
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingStart, setPendingStart] = useState<string | null>(null)  // ?start=<taskId> desde Épicas
  const [focusOpen, setFocusOpen] = useState(false)          // Modo foco: overlay a pantalla completa de la sesión
  const [workedOpen, setWorkedOpen] = useState(false)        // dropdown "ya trabajadas hoy" bajo las tareas del día (cerrado por defecto)
  const [sessionMin, setSessionMin] = useState(false)        // popup de sesión minimizado a pastilla (clic para reabrir)
  const [pomoOn, setPomoOn] = useState(false)                // Pomodoro dentro del modo foco (25 trabajo / 5 descanso)
  const pomoNotified = useRef<Set<string>>(new Set())        // transiciones de pomodoro ya avisadas (una vez c/u)
  const endNotifiedFor = useRef<number | null>(null)         // session.start ya avisado por "fin de bloque"
  const dueNotifiedRef = useRef<string | null>(null)         // id de agendado ya notificado (llegó la hora)
  const remindNotified = useRef<Set<string>>(new Set())      // recordatorios (remindAt) ya avisados
  const meetNotified = useRef<Set<string>>(new Set())        // juntas ya avisadas (10 min antes / al empezar)
  const [filters, setFilters] = useState<Filters>({ epica: null, prio: new Set(), diff: new Set(), estado: new Set() })
  const [sortBy, setSortBy] = useState<'manual' | 'plan' | 'alfa' | 'prioridad' | 'dificultad'>('plan')
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPush = useRef<AppData | null>(null)
  const tasksRef = useRef<TodayTask[]>([])
  useEffect(() => { tasksRef.current = allTasks || [] }, [allTasks])
  // Espejo siempre-fresco de `data`: save() mezcla sobre ESTE (no sobre el `data` capturado por
  // closure), para que un "deshacer" diferido (toast 6s) restaure sólo su slice sin revertir
  // otros cambios hechos entre tanto.
  const dataRef = useRef<AppData>(data)
  useEffect(() => { dataRef.current = data }, [data])
  // Reintentos de sincronización de tarea que fallaron (para el botón "Reintentar").
  const pendingSync = useRef<Map<string, { epicaId: string; task: EpicaTask }>>(new Map())

  useEffect(() => {
    let d = defaults()
    try { const raw = localStorage.getItem(KEY); if (raw) d = Object.assign(defaults(), JSON.parse(raw)) } catch {}
    const tick = () => { const x = new Date(); setNow(x.getHours() * 60 + x.getMinutes() + x.getSeconds() / 60) }
    setData(d); setLoaded(true); tick()
    // El ritmo del reloj lo maneja otro efecto (1s en sesión activa, 15s en reposo).
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    // Flush del último push pendiente al salir/cerrar (keepalive), para no perder la
    // última edición si se desmonta o se cierra la pestaña dentro de la ventana del debounce.
    const flush = () => { if (!pendingPush.current) return; const body = pendingPush.current; pendingPush.current = null; fetch('/api/tiempo-estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }), keepalive: true }).catch(() => {}) }
    window.addEventListener('pagehide', flush)
    // Estado durable en Supabase: gana el más nuevo (por ts). Si el server no tiene
    // nada y aquí sí, se sube (migración). localStorage queda como caché offline.
    fetch('/api/tiempo-estado').then(r => r.json()).then(j => {
      if (!j?.ok) return
      const serverTs = Number(j.ts) || 0
      // Re-lee el ts local AHORA: el usuario pudo editar mientras el fetch estaba en vuelo.
      const curTs = Number(localStorage.getItem(TS_KEY) || 0)
      if (serverTs > curTs && j.data && Object.keys(j.data).length) {
        const merged = Object.assign(defaults(), j.data)
        setData(merged)
        try { localStorage.setItem(KEY, JSON.stringify(merged)); localStorage.setItem(TS_KEY, String(serverTs)) } catch {}
      } else if (j.ready && curTs > 0 && serverTs < curTs) {
        // Migración/subida SOLO si el server respondió bien (ready): usa el estado local MÁS
        // FRESCO (no el snapshot de montaje), para no reenviar datos pre-edición.
        let localData = d
        try { const raw = localStorage.getItem(KEY); if (raw) localData = Object.assign(defaults(), JSON.parse(raw)) } catch {}
        fetch('/api/tiempo-estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: localData }) })
          .then(r => r.json()).then(k => { if (k?.ts) try { localStorage.setItem(TS_KEY, String(k.ts)) } catch {} }).catch(() => {})
      }
    }).catch(() => {})
    return () => { if (pushTimer.current) clearTimeout(pushTimer.current); flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // Reloj: 1s mientras hay sesión activa (cronómetro vivo), 15s en reposo para ahorrar renders.
  const sessionActive = !!data.session
  useEffect(() => {
    const tick = () => { const x = new Date(); setNow(x.getHours() * 60 + x.getMinutes() + x.getSeconds() / 60) }
    tick()
    const id = setInterval(tick, sessionActive ? 1000 : 15000)
    return () => clearInterval(id)
  }, [sessionActive])

  // Rollover de medianoche: si la pestaña queda abierta y cambia el día, avanza `taskDay`
  // (solo si venía siguiendo a "hoy"), para que lo que hagas hoy no caiga en el día de ayer.
  const prevTodayRef = useRef(iso(new Date()))
  useEffect(() => {
    const rt = iso(new Date())
    if (rt !== prevTodayRef.current) {
      if (taskDay === prevTodayRef.current) setTaskDay(rt)
      if (planDay === prevTodayRef.current) setPlanDay(rt)   // el Planificador también avanza a "hoy"
      prevTodayRef.current = rt
    }
  }, [now, taskDay, planDay])

  // Estado inicial del permiso de notificaciones.
  useEffect(() => { try { if (typeof Notification !== 'undefined') setNotifOn(Notification.permission === 'granted') } catch {} }, [])

  // "Comenzar" desde Épicas (?start=<taskId>): al cargar las tareas, arranca el cronómetro
  // ligado a esa tarea (contador libre) y limpia la URL. No pisa una sesión ya en curso.
  useEffect(() => { try { const p = new URLSearchParams(window.location.search).get('start'); if (p) setPendingStart(p) } catch {} }, [])
  useEffect(() => {
    if (!pendingStart || !allTasks) return
    const tt = allTasks.find(x => x.task.id === pendingStart)
    try { window.history.replaceState({}, '', '/tiempo') } catch {}
    setPendingStart(null)
    if (!tt) return
    beginSession({ name: tt.task.t || 'Tarea', area: 'trabajo', start: Math.round(now), dur: 0, epicaId: tt.epicaId, taskId: tt.task.id })
    setView('hoy')
  }, [pendingStart, allTasks])   // eslint-disable-line react-hooks/exhaustive-deps
  const requestNotif = async () => {
    try {
      if (typeof Notification === 'undefined') { alert('Tu navegador no soporta notificaciones.'); return }
      const p = await Notification.requestPermission()
      setNotifOn(p === 'granted')
      if (p === 'granted') { beep(); new Notification('Avisos activados', { body: 'Te avisaré cuando llegue la hora de lo que agendes y cuando termine un bloque.', icon: '/icon.png' }) }
    } catch {}
  }

  // Fin de bloque: al cumplir la duración planeada, suena + notifica (una vez por sesión).
  useEffect(() => {
    const s = data.session
    if (!s || !s.dur) return
    const key = s.origStart ?? s.start   // llave estable que NO cambia al reanudar (evita re-avisar)
    if (s.pausedAt == null && sessionElapsed(s, now) >= s.dur && endNotifiedFor.current !== key) {
      endNotifiedFor.current = key
      beep(); notify('Terminó tu bloque', `${s.name}: ya se cumplieron los ${hm(s.dur)} que planeaste.`)
    }
  }, [now, data.session])

  // Recordatorios de tareas (remindAt de Épicas) del día: avisan al llegar la hora (ventana 30m).
  useEffect(() => {
    if (!allTasks) return
    const d = new Date(), today = iso(d), curMin = d.getHours() * 60 + d.getMinutes()
    for (const t of allTasks) {
      const ra = t.task.remindAt
      if (!ra || !ra.includes('T') || ra.slice(0, 10) !== today) continue
      const m = parse(ra.slice(11, 16)), key = t.task.id + '@' + ra
      if (curMin >= m && curMin <= m + 30 && !remindNotified.current.has(key)) {
        remindNotified.current.add(key)
        beep(); notify('Recordatorio', `${t.task.t || 'Tarea'} · ${ra.slice(11, 16)}`)
      }
    }
  }, [now, allTasks])

  // Carga (o recarga) tareas y épicas desde Épicas. NO toca día/filtros (van en su propio estado).
  const [refreshing, setRefreshing] = useState(false)
  const [tasksError, setTasksError] = useState(false)
  const [resumenReady, setResumenReady] = useState(false)   // true si existe la columna `resumen` (tras la migración)
  // Por defecto TRUE (optimista): si la columna no existe, el server lo dice y se bloquea el input
  // (evita el 500 de recordar/comentar sin migración) — sin parpadeo mientras carga si sí existe.
  const [remindReady, setRemindReady] = useState(true)
  const [comentariosReady, setComentariosReady] = useState(true)
  const refreshTasks = useCallback(() => {
    setRefreshing(true)
    fetch('/api/epicas').then(r => r.json()).then(j => {
      if (!j.ok) { setTasksError(true); setAllTasks(a => a || []); return }
      setResumenReady(!!j.resumenReady); setRemindReady(!!j.remindReady); setComentariosReady(!!j.comentariosReady)
      const out: TodayTask[] = []
      const epList: { id: string; name: string; color: string; kpis: EpicaMilestone[]; routines: EpicaRoutine[]; links: EpicaLink[] }[] = []
      for (const e of j.data as Epica[]) {
        if (!e.archived) epList.push({ id: e.id, name: e.name, color: e.color || '#b4653a', kpis: e.kpis || [], routines: e.routines || [], links: e.links || [] })
        // Guardamos TODAS (incl. Terminadas) para poder reabrir sin perder datos; la lista
        // del día ya las oculta por estado (useMemo `tasks`).
        for (const t of e.tasks || []) {
          out.push({ epicaId: e.id, epicaName: e.name, color: e.color || '#b4653a', task: t })
        }
      }
      setAllTasks(out); setEpicasList(epList); setTasksError(false)
    }).catch(() => { setTasksError(true); setAllTasks(a => a || []) }).finally(() => setRefreshing(false))
  }, [])
  useEffect(() => { refreshTasks() }, [refreshTasks])
  // Reuniones del calendario de Google (eventos con hora), de TODOS los días de la ventana,
  // con su fecha local — así el selector de día muestra las juntas del día que ves, no sólo hoy.
  const loadMeetings = useCallback(() => {
    fetch('/api/calendar').then(r => r.json()).then((evs: { id: string; title: string; start: string; end: string; allDay: boolean; location?: string; description?: string; htmlLink?: string; hangoutLink?: string }[]) => {
      if (!Array.isArray(evs)) return
      const mins = (s: string) => { const d = new Date(s); return d.getHours() * 60 + d.getMinutes() }
      const out: Meeting[] = []
      for (const e of evs) {
        if (e.allDay || !e.start) continue
        const start = mins(e.start)
        // Duración desde los timestamps completos (no minutos-del-día): soporta cruce de medianoche.
        const dur = e.end ? Math.max(15, Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000)) : 30
        out.push({ id: e.id, name: e.title || 'Reunión', start, dur, date: iso(new Date(e.start)), location: e.location, description: e.description, htmlLink: e.htmlLink, hangoutLink: e.hangoutLink })
      }
      setMeetings(out)
    }).catch(() => {})
  }, [])
  useEffect(() => { loadMeetings() }, [loadMeetings])
  // Mientras un editor (tarea/registro/agendar) o el MODO FOCO está abierto NO refrescamos: si no,
  // un poll en vuelo podría revertir una edición recién guardada (subtareas/links/comentarios del
  // foco) hasta que el server persista → "se ve tarde".
  const editorOpenRef = useRef(false)
  useEffect(() => { editorOpenRef.current = editTask !== null || histIdx !== null || scheduleAt !== null || focusOpen }, [editTask, histIdx, scheduleAt, focusOpen])
  // Al volver a la pestaña de Tiempo (tras editar en Épicas) se refresca solo.
  useEffect(() => {
    const canRefresh = () => document.visibilityState === 'visible' && !editorOpenRef.current
    // Re-lee el estado durable del servidor al volver: si OTRO dispositivo/pestaña lo dejó más
    // nuevo (serverTs > el ts local), lo ADOPTA antes de seguir editando aquí. Así una edición en
    // el teléfono no se pierde cuando la laptop (con estado viejo en memoria) guarde encima.
    // No adopta con un editor abierto ni con una sesión en curso (para no pisar trabajo en vuelo).
    const adopt = () => {
      if (!canRefresh() || dataRef.current.session) return
      fetch('/api/tiempo-estado').then(r => r.json()).then(j => {
        // Revalida TAMBIÉN el editor tras el fetch: si se abrió un registro/tarea mientras el fetch
        // estaba en vuelo, adoptar reemplazaría data.history y el autoguardado por índice pisaría otra fila.
        if (!j?.ok || !canRefresh() || dataRef.current.session) return
        const serverTs = Number(j.ts) || 0
        const curTs = Number(localStorage.getItem(TS_KEY) || 0)
        if (serverTs > curTs && j.data && Object.keys(j.data).length) {
          const merged = Object.assign(defaults(), j.data)
          setData(merged)
          try { localStorage.setItem(KEY, JSON.stringify(merged)); localStorage.setItem(TS_KEY, String(serverTs)) } catch {}
        }
      }).catch(() => {})
    }
    const onVis = () => { if (canRefresh()) { adopt(); refreshTasks(); loadMeetings() } }
    const onFocus = () => { if (canRefresh()) { adopt(); refreshTasks(); loadMeetings() } }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    // Poll "en vivo": cada 25s (salvo con un editor abierto) refleja cambios de Épicas sin recargar.
    const id = setInterval(() => { if (canRefresh()) refreshTasks() }, 25000)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onFocus) }
  }, [refreshTasks, loadMeetings])

  // Tareas del día visible (plan === día, o recurrente que aplica ese día).
  const tasks = useMemo<TodayTask[] | null>(() => {
    if (allTasks === null) return null
    const t0 = iso(new Date())
    // Tareas a las que YA les pusiste tiempo hoy: salen de "lo que hiciste hoy", así que se
    // quitan de la lista de tareas del día (sólo en la vista de hoy) para no duplicar.
    const worked = new Set(data.history.filter(h => h.date === t0 && h.taskId).map(h => h.taskId))
    const back = new Set(data.backToTasks || [])   // devueltas a la lista pese a tener tiempo
    return allTasks.filter(t => {
      if (t.task.status === 'Terminada' || t.task.status === 'Archivada') return false
      const backed = taskDay === t0 && back.has(`${t0}·${t.task.id}`)
      // Aparece si está planeada ese día, o es recurrente hoy, O la devolviste con "↩ A tareas".
      if (!(t.task.plan === taskDay || recurringDueToday(t.task, taskDay) || backed)) return false
      // Se oculta si ya tiene tiempo hoy y NO la devolviste.
      if (taskDay === t0 && worked.has(t.task.id) && !backed) return false
      return true
    }).map(t => ({ ...t, recurring: recurringDueToday(t.task, taskDay) }))
  }, [allTasks, taskDay, data.history, data.backToTasks])
  const selTask = (tasks || []).find(t => t.task.id === selTaskId) || null
  const selMeeting = meetings.find(m => m.id === selMeetingId) || null

  // Tareas del día que se PLANIFICA (Planificador): planeadas ese día o recurrentes ese día.
  const planTasks = useMemo<TodayTask[] | null>(() => {
    if (allTasks === null) return null
    // Las que ya se trabajaron ese día (tienen registro) NO deben salir en "por agendar".
    const workedDay = new Set((data.history || []).filter(h => h.date === planDay && h.taskId).map(h => h.taskId))
    return allTasks
      .filter(t => t.task.status !== 'Terminada' && t.task.status !== 'Archivada')
      .filter(t => t.task.plan === planDay || recurringDueToday(t.task, planDay))
      .filter(t => !workedDay.has(t.task.id))
      .map(t => ({ ...t, recurring: recurringDueToday(t.task, planDay) }))
  }, [allTasks, planDay, data.history])

  // Rutinas diarias de Épicas que aplican el día visible (para marcarlas / iniciarlas aquí).
  // Rutinas diarias como TRACKER SEMANAL (7 chips L-D con progreso, como en Épicas): por cada
  // rutina de cada épica, los 7 booleanos de la semana de `taskDay` + cuántos días lleva.
  const weekRoutines = useMemo(() => {
    const monday = mondayOfISO(taskDay)
    const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i))
    const list = epicasList.flatMap(e => (e.routines || []).map((r, rIdx) => {
      const week = (r.weeks && r.weeks[monday] && r.weeks[monday].length === 7) ? r.weeks[monday] : [false, false, false, false, false, false, false]
      return { epicaId: e.id, epicaName: e.name, color: e.color, rIdx, name: r.t, week, done: week.filter(Boolean).length }
    }))
    return { monday, dates, list }
  }, [epicasList, taskDay])

  // Épicas presentes en las tareas de hoy (para el filtro por épica).
  const todayEpicas = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string }>()
    for (const t of tasks || []) if (!seen.has(t.epicaId)) seen.set(t.epicaId, { id: t.epicaId, name: t.epicaName, color: t.color })
    return [...seen.values()]
  }, [tasks])
  // Rango GLOBAL en orden manual (planOrder) sobre TODAS las tareas del día — para que el número
  // muestre el lugar en toda la lista aunque estés filtrando por épica ("en qué lugar va del total").
  const manualRank = useMemo(() => {
    const m: Record<string, number> = {}
    const arr = [...(tasks || [])].sort((a, b) => (a.task.planOrder ?? 1e9) - (b.task.planOrder ?? 1e9))
    arr.forEach((t, i) => { if (t.task.id) m[t.task.id] = i + 1 })
    return m
  }, [tasks])
  // Tareas ESTANCADAS: las que empezaste (En curso / con avance / con bitácora) pero llevas ≥3 días
  // sin tocarlas (último avance o creación). Mapea taskId → días sin avanzar (para el badge).
  const staleByTask = useMemo(() => {
    const t0 = iso(new Date())
    const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
    const m: Record<string, number> = {}
    for (const t of allTasks || []) {
      const tk = t.task; if (!tk.id || tk.status === 'Terminada' || tk.status === 'Archivada') continue
      const log = (tk.progressLog as EpicaProgressEntry[] | undefined) || []
      const started = tk.status === 'En curso' || (typeof tk.progress === 'number' && tk.progress > 0) || log.length > 0
      if (!started) continue
      const lastD = log.length ? [...log].map(x => x.d).sort().slice(-1)[0] : (tk.createdAt || null)
      if (!lastD) continue
      const d = daysBetween(lastD, t0)
      if (d >= 3) m[tk.id] = d
    }
    return m
  }, [allTasks])
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
    else if (sortBy === 'plan') {
      // Orden en que las planeaste en el Planificador (por hora de agendado); las no agendadas al final.
      const ord = new Map<string, number>()
      for (const s of (data.scheduled || []).filter(s => (s.date || taskDay) === taskDay && s.taskId)) if (!ord.has(s.taskId!)) ord.set(s.taskId!, s.start)
      arr.sort((a, b) => (ord.get(a.task.id || '') ?? 1e9) - (ord.get(b.task.id || '') ?? 1e9) || (a.task.planOrder ?? 1e9) - (b.task.planOrder ?? 1e9))
    }
    else arr.sort((a, b) => (a.task.planOrder ?? 1e9) - (b.task.planOrder ?? 1e9))  // manual
    return arr
  }, [tasks, filters, sortBy, data.scheduled, taskDay])

  function save(patch: Partial<AppData>) {
    const nd = { ...dataRef.current, ...patch }
    dataRef.current = nd
    // Poda: conserva ~12 semanas de historial (Historial sólo usa la última semana); evita que
    // el blob de estado crezca sin fin. Sólo se poda cuando ya hay muchas entradas.
    if (nd.history && nd.history.length > 500) {
      const cutoff = addDaysISO(iso(new Date()), -84)
      nd.history = nd.history.filter(h => h.date >= cutoff)
    }
    // Los agendados son de un día concreto: descarta los de días pasados para que no se
    // acumulen (ni reaparezcan en la cinta). Los sin fecha (legado) se tratan como de hoy.
    const t0 = iso(new Date())
    if (nd.scheduled && nd.scheduled.length) nd.scheduled = nd.scheduled.filter(s => (s.date || t0) >= t0)
    // backToTasks son claves `fecha·id`: conserva sólo las de hoy (la lista de tareas es del día).
    if (nd.backToTasks && nd.backToTasks.length) nd.backToTasks = nd.backToTasks.filter(k => k.split('·')[0] === t0)
    setData(nd)
    try { localStorage.setItem(KEY, JSON.stringify(nd)); localStorage.setItem(TS_KEY, String(Date.now())) } catch {}
    // Push durable a Supabase (debounce): localStorage es el instantáneo/offline. El ts lo
    // asigna el servidor y lo guardamos al responder (fuente única de versión).
    pendingPush.current = nd
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      const body = pendingPush.current; pendingPush.current = null
      fetch('/api/tiempo-estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }) })
        .then(async r => { if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('estado ' + r.status + ' ' + t.slice(0, 160)) } return r.json() })
        .then(j => { if (j?.ts) try { localStorage.setItem(TS_KEY, String(j.ts)) } catch {} ; setSaveErr(pendingSync.current.size > 0); if (pendingSync.current.size === 0) setSaveErrMsg('') })
        .catch(e => { setSaveErr(true); setSaveErrMsg(String(e?.message || e).slice(0, 180)); console.error('[tiempo] guardado de estado falló:', e) })
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
    const todayStr = iso(new Date())
    const meetingBlocks = meetings.filter(m => m.date === todayStr).map(m => ({ id: 'cal:' + m.id, name: m.name, area: 'personas' as Area, start: m.start, dur: m.dur, cal: true }))
    const blocks = todayBlocks.concat(meetingBlocks).sort((a, b) => a.start - b.start)
    const sleepBlock = { id: '__sleep', name: 'Dormir', area: 'sueno' as Area, start: bed, dur: sleepGoal }
    const timeline = blocks.concat([sleepBlock])

    // Tiempo útil: minutos libres entre ahora y dormir. UNIÓN de bloques (blocks ya
    // está ordenado), para no restar dos veces lo que una reunión y la rutina comparten.
    let free = Math.max(0, bed - now)
    let coveredEnd = now
    for (const b of blocks) {
      const s = Math.max(b.start, now), e = Math.min(b.start + b.dur, bed)
      if (e <= s) continue
      const from = Math.max(s, coveredEnd)
      if (e > from) free -= (e - from)
      coveredEnd = Math.max(coveredEnd, e)
    }
    free = Math.max(0, free)

    // Cap en `bed`: un bloque/reunión que empieza DESPUÉS de dormir no cuenta como
    // "próxima interrupción" (si no, la ventana se pasaría del sueño).
    const nextBlock = blocks.find(b => b.start + b.dur > now && b.start < bed)
    const windowMins = nextBlock ? Math.max(0, nextBlock.start - now) : Math.max(0, bed - now)
    // Redondea HACIA ABAJO a múltiplos de 15 (malla del slider): la duración "segura"
    // nunca excede la ventana; si la ventana es <15, safeMax=0 y la píldora se deshabilita.
    const safeMax = Math.floor(windowMins / 15) * 15

    // Hora de corte inversa: la última hora en que puedes EMPEZAR `dur` sin tocar la
    // rutina ni el sueño. Se buscan las ventanas libres entre ahora y la hora de dormir.
    const freeWindows: { s: number; e: number }[] = []
    let fc = now
    for (const b of blocks) {
      const s = Math.max(b.start, now), e = b.start + b.dur
      if (e <= now) continue
      if (s > fc) freeWindows.push({ s: fc, e: s })
      fc = Math.max(fc, e)
    }
    if (fc < bed) freeWindows.push({ s: fc, e: bed })
    let cutoff: number | null = null
    for (const w of freeWindows) if (w.e - w.s >= dur) cutoff = Math.max(cutoff ?? -1, w.e - dur)
    // Huecos libres futuros (para sugerir dónde cabe una tarea al agendarla).
    const freeGaps = freeWindows.map(w => ({ s: w.s, e: w.e, len: w.e - w.s }))
    const nextGap = freeGaps.find(g => g.len >= 15 && g.e > now)

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
    // Minutos de tiempo PROTEGIDO (no sueño) realmente invadidos, en UNIÓN: si una
    // reunión cae dentro de un bloque de rutina, esos minutos no se cuentan dos veces.
    let invaded = 0, ic = simStart
    for (const b of blocks) {
      const s = Math.max(b.start, simStart), e = Math.min(b.start + b.dur, simEnd)
      if (e <= s) continue
      const from = Math.max(s, ic)
      if (e > from) invaded += (e - from)
      ic = Math.max(ic, e)
    }

    let verdictKicker, verdictTitle, verdictText, verdictBg, verdictBorder, verdictFg
    if (!hitAny) {
      verdictKicker = 'cabe sin costo'
      verdictTitle = 'Terminas a las ' + clock(simEnd) + ' y no tocas nada.'
      verdictText = (caring ? 'Después te quedan ' : 'Margen posterior: ') + hm(Math.max(0, free - dur)) + ' de tiempo útil, y tu rutina sigue intacta.'
      verdictBg = '#eef1e7'; verdictBorder = '#dbe2cd'; verdictFg = '#4f6238'
    } else if (sleepDebt < 1) {
      verdictKicker = 'cabe con costo'
      verdictTitle = 'Terminas a las ' + clock(simEnd) + ' invadiendo ' + hm(invaded) + ' de tiempo protegido.'
      verdictText = (caring ? 'Duermes igual, pero lo pagas con ' : 'Costo: ') + afectados.map(a => a.name.toLowerCase()).join(' y ') + '.'
      verdictBg = '#f7ece2'; verdictBorder = '#ecd9cb'; verdictFg = '#8a4b28'
    } else {
      verdictKicker = 'sale de tu sueño'
      verdictTitle = 'Terminarías a las ' + clock(simEnd) + ' y dormirías ' + hm(sleepGoal - sleepDebt) + '.'
      verdictText = (caring ? 'Esto ya no se paga con ocio: se paga con mañana. ' : 'Déficit de sueño: ' + hm(sleepDebt) + '. ') + (safeMax >= 1 ? hm(safeMax) + ' ahora deja el día intacto.' : 'Ahora ya no queda margen sin costo.')
      verdictBg = '#f6e3dd'; verdictBorder = '#e8cabf'; verdictFg = '#8a3c2a'
    }

    // barra del día: lo YA HECHO (pasado, por su hora) + protegido/agendado/libre (futuro)
    const dayISO = iso(new Date())
    const scheduled = (data.scheduled || []).filter(s => (s.date || dayISO) === dayISO).slice().sort((a, b) => a.start - b.start)
    const maxSchedEnd = scheduled.reduce((m, s) => Math.max(m, s.start + s.dur), 0)
    // Minutos ya COMPROMETIDOS por lo agendado que caen en tiempo libre (no en rutina protegida):
    // el tiempo útil "de verdad" descuenta esto, para que el número no mienta.
    let committed = 0
    for (const w of freeWindows) {
      let cvr = w.s
      for (const s of scheduled) {
        const a = Math.max(s.start, w.s, cvr), b = Math.min(s.start + s.dur, w.e)
        if (b > a) { committed += b - a; cvr = Math.max(cvr, b) }
      }
    }
    const freeUncommitted = Math.max(0, free - committed)
    const doneToday = data.history.filter(h => h.date === dayISO && h.start < now).sort((a, b) => a.start - b.start)
    const scaleEnd = Math.max(bed + 30, simEnd + 15, maxSchedEnd + 15)
    const barStart = doneToday.length ? Math.min(now, doneToday[0].start) : now
    const total = Math.max(1, scaleEnd - barStart)
    const raw: { s: number; e: number; kind: 'free' | 'prot' | 'done' | 'sched'; area?: Area; name?: string }[] = []
    let cursor = barStart
    for (const d of doneToday) {                       // tramo pasado = lo que hiciste
      const s = Math.max(d.start, cursor), e = Math.min(d.start + d.dur, now)
      if (e <= s) continue
      if (s > cursor) raw.push({ s: cursor, e: s, kind: 'free' })
      raw.push({ s, e, kind: 'done', area: d.area, name: d.name })
      cursor = Math.max(cursor, e)
    }
    if (cursor < now) { raw.push({ s: cursor, e: now, kind: 'free' }); cursor = now }
    // Futuro: protegido/reuniones (timeline) + lo agendado por ti, intercalado por hora.
    const futureItems: { start: number; dur: number; name: string; kind: 'prot' | 'sched' }[] = [
      ...timeline.map(b => ({ start: b.start, dur: b.dur, name: b.name, kind: 'prot' as const })),
      ...scheduled.map(s => ({ start: s.start, dur: s.dur, name: s.name, kind: 'sched' as const })),
    ].sort((a, b) => a.start - b.start)
    for (const b of futureItems) {
      const s = Math.max(b.start, cursor), e = Math.min(b.start + b.dur, scaleEnd)
      if (e <= s) continue
      if (s > cursor) raw.push({ s: cursor, e: s, kind: 'free' })
      raw.push({ s: Math.max(s, cursor), e, kind: b.kind, name: b.name })
      cursor = Math.max(cursor, e)
    }
    if (cursor < scaleEnd) raw.push({ s: cursor, e: scaleEnd, kind: 'free' })
    type Seg = { w: number; bg: string; name: string; kind: 'done' | 'sched' | 'sim' | 'prot' | 'free'; s: number; e: number; label: string }
    const seg = (s: number, e: number, bg: string, name: string, kind: Seg['kind']): Seg =>
      ({ w: ((e - s) / total) * 100, bg, name, kind, s, e, label: `${name} · ${clock(s)}–${clock(e)} · ${hm(e - s)}` })
    const segs: Seg[] = []
    // El bloque "evaluando" (simulación) sólo se dibuja mientras el popup de costo está abierto,
    // para que la barra no muestre un bloque fantasma cuando no estás evaluando nada.
    const simActive = costOpen
    for (const r of raw) {
      if (r.kind === 'done') { segs.push(seg(r.s, r.e, AREAS[r.area!]?.color || '#8b8379', r.name || 'Hecho', 'done')); continue }
      if (r.kind === 'sched') { segs.push(seg(r.s, r.e, '#c2933a', r.name || 'Agendado', 'sched')); continue }
      const parts: { s: number; e: number; work: boolean }[] = []
      const iS = simActive ? Math.max(r.s, simStart) : Infinity, iE = simActive ? Math.min(r.e, simEnd) : -Infinity
      if (iE > iS) {
        if (r.s < iS) parts.push({ s: r.s, e: iS, work: false })
        parts.push({ s: iS, e: iE, work: true })
        if (r.e > iE) parts.push({ s: iE, e: r.e, work: false })
      } else parts.push({ s: r.s, e: r.e, work: false })
      for (const p of parts) {
        if (p.e - p.s < 0.5) continue
        const bg = p.work ? (r.kind === 'prot' ? '#8a3c2a' : '#b4653a') : (r.kind === 'prot' ? '#6f8256' : '#eee6da')
        const nm = p.work ? 'El bloque que evalúas' : (r.kind === 'prot' ? (r.name || 'Protegido') : 'Libre')
        segs.push(seg(p.s, p.e, bg, nm, p.work ? 'sim' : (r.kind === 'prot' ? 'prot' : 'free')))
      }
    }
    // Marcas de hora para la barra del día
    const barTicks: { label: string; left: number }[] = []
    for (let h = Math.ceil(barStart / 60); h <= Math.floor(scaleEnd / 60); h++) barTicks.push({ label: clock(h * 60), left: ((h * 60 - barStart) / total) * 100 })

    const upcoming = timeline.filter(b => b.start + b.dur > now).map(b => {
      const hit = afectados.find(a => a.id === b.id)
      return {
        start: b.start, durMin: b.dur,
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
    const elapsed = session ? Math.max(0, sessionElapsed(session, now)) : 0
    const planned = session ? session.dur : 0
    const paused = !!(session && session.pausedAt != null)
    const sEnd = session ? Math.round(now) + Math.max(0, planned - elapsed) : 0

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
    let weekSleepDebt = 0, sleptDays = 0
    for (const w of week) {
      const rows = data.history.filter(h => h.date === w.date)
      const sl = rows.filter(r => r.area === 'sueno').reduce((s, r) => s + r.dur, 0)
      const body = rows.filter(r => r.area === 'cuerpo').reduce((s, r) => s + r.dur, 0)
      // El día EN CURSO queda pendiente (null): aún no duermes, así no rompe la racha.
      dayOk[w.date] = (rows.length === 0 || w.date === today) ? null : (sl >= sleepGoal - 30 && body >= 45)
      // Deuda de sueño: cuenta los días con registro de sueño (aunque sea 0h = deuda máxima);
      // los días sin registro (futuros/vacíos) no entran.
      const hasSleep = rows.some(r => r.area === 'sueno')
      if (hasSleep) { weekSleepDebt += Math.max(0, sleepGoal - sl); sleptDays++ }
    }
    let streak = 0
    for (let i = week.length - 1; i >= 0; i--) { const v = dayOk[week[i].date]; if (v === true) streak++; else if (v === false) break }
    const days = week.map(w => ({ label: DAY_NAMES[w.dow], bg: dayOk[w.date] === null ? '#e2d9cb' : dayOk[w.date] ? '#6f8256' : '#b4653a' }))
    const okCount = week.filter(w => dayOk[w.date] === true).length

    const todayLog = data.history.map((h, idx) => ({ h, idx })).filter(x => x.h.date === today).sort((a, b) => a.h.start - b.h.start).map(x => ({
      idx: x.idx, range: clock(x.h.start) + '–' + clock(x.h.start + x.h.dur), name: x.h.name, dur: hm(x.h.dur),
      dot: AREAS[x.h.area] ? AREAS[x.h.area].color : '#8b8379', done: x.h.done !== false, taskId: x.h.taskId,
    }))
    const workedToday = data.history.filter(h => h.date === today && h.area === 'trabajo').reduce((s, h) => s + h.dur, 0)

    // minutos trabajados por hora HOY (para ver si trabajas en tus horas buenas)
    const workedByHour: Record<number, number> = {}
    for (const hh of data.history) if (hh.date === dayISO && hh.area === 'trabajo') for (let h = Math.floor(hh.start / 60); h <= Math.floor((hh.start + hh.dur - 1) / 60); h++) {
      workedByHour[h] = (workedByHour[h] || 0) + Math.max(0, Math.min((h + 1) * 60, hh.start + hh.dur) - Math.max(h * 60, hh.start))
    }
    // Curva de energía APRENDIDA de tus horas reales de trabajo (área 'trabajo'), con una
    // curva típica como "previa" que domina cuando hay pocos datos. El peso de lo aprendido
    // crece con la cantidad de historial (tope 0.7).
    const workHist: Record<number, number> = {}
    let totalWork = 0
    for (const hh of data.history) {
      if (hh.area !== 'trabajo') continue
      for (let h = Math.floor(hh.start / 60); h <= Math.floor((hh.start + hh.dur - 1) / 60); h++) {
        if (h < 0 || h > 23) continue
        const ov = Math.max(0, Math.min((h + 1) * 60, hh.start + hh.dur) - Math.max(h * 60, hh.start))
        workHist[h] = (workHist[h] || 0) + ov; totalWork += ov
      }
    }
    const learnAvail = totalWork >= 240
    const useLearned = energyLearned && learnAvail
    const maxW = Math.max(1, ...Object.values(workHist))
    const wLearn = Math.min(0.7, totalWork / 2400)
    const prior = (h: number) => h < 9 ? 0.42 : h < 12 ? 1 : h < 13 ? 0.8 : h < 15 ? 0.5 : h < 18 ? 0.78 : h < 20 ? 0.52 : h < 22 ? 0.36 : 0.24
    const energyVal = (h: number) => useLearned ? (1 - wLearn) * prior(h) + wLearn * ((workHist[h] || 0) / maxW) : prior(h)
    const nowH = Math.floor(now / 60)
    const eBars: { h: number; bg: string; worked: boolean; title: string; cur: boolean }[] = []
    for (let h = 7; h <= 22; h++) {
      const val = energyVal(h), cur = nowH === h, pct = Math.round(val * 100), worked = Math.round(workedByHour[h] || 0)
      const base = val >= 0.9 ? '#b4653a' : val >= 0.7 ? '#c99a6f' : val >= 0.5 ? '#cdb79a' : '#dfceb8'
      eBars.push({ h: val * 100, bg: cur ? '#1c1a17' : now / 60 > h + 1 ? '#e4dcd0' : base, worked: worked > 0, cur, title: `${String(h).padStart(2, '0')}:00 · energía ${pct}%${worked ? ` · trabajaste ${hm(worked)}` : ''}` })
    }
    const nowPct = Math.round(energyVal(nowH) * 100)
    const energyNote = useLearned
      ? (nowPct >= 78 ? 'Según tus horas registradas, a esta hora sueles rendir alto: buen momento para lo difícil.'
        : nowPct >= 52 ? 'Según tu historial, rendimiento medio ahora: bien para lo mecánico, no para lo difícil.'
        : 'Según tu historial, a esta hora sueles rendir poco: lo que hagas cuesta más y vale menos.')
      : (nowH < 9 ? 'Aún no llegas a tu pico: calienta con algo ligero antes del trabajo profundo.'
        : nowH < 13 ? 'Estás dentro de tu pico de rendimiento: es el mejor momento para trabajo profundo.'
        : nowH < 15 ? 'Bajón de media tarde. Buen momento para lo mecánico, no para lo difícil.'
        : nowH < 18 ? 'Segunda ventana de foco. Tu pico ya pasó, rinde alrededor del 78%.'
        : 'Rendimiento en descenso: lo que hagas ahora te cuesta más y vale menos.')

    // Todos los bloques de la rutina de hoy con su cuenta regresiva (o "ya pasó") y su duración.
    const routineNext = todayBlocks.slice().sort((a, b) => a.start - b.start).map(b => {
      const past = b.start + b.dur <= now
      return {
        name: b.name, dot: AREAS[b.area]?.color || '#8b8379', at: clock(b.start), past, dur: hm(b.dur),
        when: b.start > now ? 'en ' + hm(b.start - now) : past ? 'ya pasó' : 'en curso',
      }
    })

    // Lo que agendaste hoy y aún no pasa (para verlo y arrancarlo desde la lista del día).
    const scheduledUpcoming = scheduled.filter(s => s.start + s.dur > now).map(s => ({
      id: s.id, name: s.name, taskId: s.taskId, epicaId: s.epicaId, start: s.start, dur: s.dur, area: s.area,
      range: clock(s.start) + '–' + clock(s.start + s.dur), durLabel: hm(s.dur),
      dot: AREAS[s.area]?.color || '#c2933a',
      when: s.start > now ? 'en ' + hm(s.start - now) : 'ahora',
    }))

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
      committed, committedLabel: hm(committed), freeUncommitted, freeUncommittedLabel: hm(freeUncommitted),
      freeGaps, nextGapLabel: nextGap ? clock(nextGap.s) + '–' + clock(nextGap.e) + ' · ' + hm(nextGap.len) : null,
      freeExplain: (() => {
        const gross = Math.max(0, bed - now), prot = Math.max(0, gross - free)
        return prot > 0
          ? 'De aquí a las ' + clock(bed) + ' hay ' + hm(gross) + ', pero tu rutina y juntas ocupan ' + hm(prot) + ' → quedan ' + hm(free) + ' libres para lo que tú decidas.'
          : 'Es lo que queda entre ahora y las ' + clock(bed) + '. No tienes rutina ni juntas de por medio.'
      })(),
      windowLabel: nextBlock ? hm(windowMins) + ' (hasta ' + clock(nextBlock.start) + ')' : hm(windowMins),
      bedLabel: clock(bed) + ' · despertar ' + clock(bed + sleepGoal),
      workedTodayLabel: workedToday ? hm(workedToday) : '—',
      energy: eBars, energyNote, energyNow: nowPct, energyLearnedActive: useLearned, energyLearnAvail: learnAvail,
      hasSession: !!session, sessionOpen: !!session && !planned, sessionPaused: paused, sessionName: session ? session.name : '',
      sessionStartLabel: session ? clock(session.start) : '',
      sessionElapsedLabel: session ? hm(elapsed) : '',
      sessionPct: session && planned ? Math.min(100, (elapsed / planned) * 100) : 0,
      sessionNote: session ? (paused
        ? 'En pausa · llevas ' + hm(elapsed) + '. Reanuda cuando sigas.'
        : !planned
          ? 'Llevas ' + hm(elapsed) + '. Termina cuando quieras.'
          : elapsed >= planned
            ? 'Ya pasaste los ' + hm(planned) + ' que planeaste. Cada minuto extra sale de lo que viene.'
            : 'Quedan ' + hm(planned - elapsed) + '. Terminarías a las ' + clock(sEnd) + '.') : '',
      durLabel: hm(dur), endLabel: clock(simEnd),
      verdictKicker, verdictTitle, verdictText, verdictBg, verdictBorder, verdictFg,
      hitAny, afectados, safeMax, altLabel: hitAny ? (safeMax >= 1 ? 'Reducir a ' + hm(safeMax) : 'Sin margen ahora') : 'Otra duración',
      cutoff, cutoffLabel: cutoff != null ? clock(cutoff) : null,
      segs, barTicks, upcoming, scheduledUpcoming, scaleEndLabel: clock(scaleEnd), barStartLabel: clock(barStart), barStart, scaleEnd,
      weekRange: week[0].date.slice(8) + '/' + week[0].date.slice(5, 7) + ' – ' + week[6].date.slice(8) + '/' + week[6].date.slice(5, 7),
      routineNext, allTotals, taskSummary,
      weekTotalLabel: hm(weekTotal), areaStats, days,
      weekSleepDebt, weekSleepDebtLabel: hm(weekSleepDebt), sleptDays,
      streakLabel: streak > 0 ? streak + (streak === 1 ? ' día seguido con la rutina protegida' : ' días seguidos con la rutina protegida') : 'Aún sin racha esta semana',
      streakNote: 'Protegiste sueño y cuerpo ' + okCount + ' de 7 días. Los días en terracota son los que costaron descanso o ejercicio.',
      todayLog, logEmpty: todayLog.length ? '' : 'Todavía no hay bloques cerrados hoy. Empieza uno desde Hoy y aparecerá aquí al terminarlo.',
    }
  }, [data, now, dur, meetings, energyLearned, costOpen])

  // Tiempo YA registrado por tarea (todas las sesiones previas, todos los días). Sirve para que,
  // al RETOMAR una tarea, el contador muestre lo acumulado + lo nuevo, y planeado vs real.
  const priorByTask = useMemo(() => {
    const m: Record<string, number> = {}
    for (const h of data.history) if (h.taskId) m[h.taskId] = (m[h.taskId] || 0) + h.dur
    return m
  }, [data.history])
  // Tiempo "de antes" de la sesión en curso. Para tareas RECURRENTES (hábitos) solo cuenta HOY:
  // si no, "planeado vs real" acumularía el tiempo de todos los días contra una estimación por ocurrencia.
  const priorForSession = (s: { taskId?: string }) => {
    if (!s.taskId) return 0
    const t = (allTasks || []).find(x => x.task.id === s.taskId)
    if (t?.task.repeat) { const d0 = iso(new Date()); return data.history.filter(h => h.taskId === s.taskId && h.date === d0).reduce((a, h) => a + h.dur, 0) }
    return priorByTask[s.taskId] || 0
  }

  // Metadatos para el Historial: cruza los registros (que sólo traen epicaId/taskId) con las tareas
  // y épicas para poder filtrar/agrupar por ÉPICA y por DIFICULTAD, y mostrar el nombre/color de la épica.
  const histMeta = useMemo<HistMeta>(() => {
    const task: HistMeta['task'] = {}
    const epica: HistMeta['epica'] = {}
    for (const t of allTasks || []) {
      if (t.task.id) task[t.task.id] = { epicaId: t.epicaId, difficulty: t.task.difficulty }
      if (t.epicaId && !epica[t.epicaId]) epica[t.epicaId] = { name: t.epicaName, color: t.color }
    }
    for (const e of epicasList || []) if (e.id && !epica[e.id]) epica[e.id] = { name: e.name, color: e.color || '#b4653a' }
    return { task, epica }
  }, [allTasks, epicasList])

  /* ── Vista Semana: 7 mini-líneas de tiempo ──
     Por día combina, con prioridad: lo que HICISTE (historial real, sólido) > reuniones/agendado
     (sólo hoy) > tu rutina protegida planeada (tenue). Un barrido por fronteras resuelve traslapes. */
  const WEEK = useMemo(() => {
    const bed = data.bed, sleepGoal = data.sleep
    const wake = (bed + sleepGoal) % 1440
    const winStart = wake > 0 && wake < bed ? wake : 360     // ventana despierto: de despertar a dormir
    const winEnd = bed
    const span = Math.max(60, winEnd - winStart)
    const todayISO = iso(new Date())
    const dowOf = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay() }
    type Ev = { start: number; end: number; color: string; name: string; prio: number; faded: boolean }
    const days = weekOfISO(taskDay).map(date => {
      const dow = dowOf(date)
      const ev: Ev[] = []
      // 1 · rutina protegida planeada (tenue)
      for (const b of data.blocks.filter(b => blockActiveOn(b, dow))) ev.push({ start: b.start, end: b.start + b.dur, color: AREAS[b.area]?.color || '#8b8379', name: b.name, prio: 1, faded: true })
      // 2 · reuniones del calendario de ESE día (cualquier día); agendado del día correspondiente
      for (const m of meetings.filter(x => x.date === date)) ev.push({ start: m.start, end: m.start + m.dur, color: AREAS.personas.color, name: m.name, prio: 2, faded: false })
      for (const s of (data.scheduled || []).filter(s => (s.date || todayISO) === date)) ev.push({ start: s.start, end: s.start + s.dur, color: '#c2933a', name: s.name, prio: 2, faded: false })
      // 3 · lo que hiciste ese día (historial real, sólido) — lo que pidió Andrés que se viera
      for (const h of data.history.filter(h => h.date === date && h.area !== 'sueno')) ev.push({ start: h.start, end: h.start + h.dur, color: AREAS[h.area]?.color || '#8b8379', name: h.name, prio: 3, faded: false })

      const bset = new Set<number>([winStart, winEnd])
      for (const e of ev) { const s = Math.max(e.start, winStart), en = Math.min(e.end, winEnd); if (en > s) { bset.add(s); bset.add(en) } }
      const pts = [...bset].filter(x => x >= winStart && x <= winEnd).sort((a, b) => a - b)
      const segs: { w: number; bg: string; faded: boolean; label: string }[] = []
      let doneMin = 0, protMin = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const s = pts[i], e = pts[i + 1]; if (e <= s) continue
        const mid = (s + e) / 2
        const top = ev.filter(x => x.start <= mid && x.end > mid).sort((a, b) => b.prio - a.prio || (a.end - a.start) - (b.end - b.start))[0]
        if (top) {
          if (top.prio === 3) doneMin += (e - s); else protMin += (e - s)
          segs.push({ w: ((e - s) / span) * 100, bg: top.color, faded: top.faded, label: `${top.name} · ${clock(s)}–${clock(e)}` })
        } else segs.push({ w: ((e - s) / span) * 100, bg: '#eee6da', faded: false, label: 'libre · ' + clock(s) + '–' + clock(e) })
      }
      const free = Math.max(0, (winEnd - winStart) - doneMin - protMin)
      const nTasks = (allTasks || []).filter(t => t.task.status !== 'Terminada' && t.task.status !== 'Archivada' && (t.task.plan === date || recurringDueToday(t.task, date))).length
      return { date, letter: dowLetterOf(date), num: Number(date.slice(8)), isToday: date === todayISO, segs, freeLabel: hm(free), doneLabel: hm(doneMin), doneMin, nTasks }
    })
    return { winStartLabel: clock(winStart), winEndLabel: clock(winEnd), days }
  }, [data.blocks, data.bed, data.sleep, data.scheduled, data.history, allTasks, meetings, taskDay])

  // Insights de la semana vista: promedios y patrones a partir del historial real. Sin números
  // inventados: si un día no tiene registro, no cuenta para su promedio.
  const insights = useMemo(() => {
    const week = weekOfISO(taskDay)
    const dowOf = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay() }
    const dowName = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const workByDay = week.map(d => ({ date: d, work: (data.history || []).filter(h => h.date === d && h.area === 'trabajo').reduce((s, h) => s + h.dur, 0) }))
    const sleepByDay = week.map(d => (data.history || []).filter(h => h.date === d && h.area === 'sueno').reduce((s, h) => s + h.dur, 0)).filter(m => m > 0)
    const workedDays = workByDay.filter(d => d.work > 0)
    const avgWork = workedDays.length ? Math.round(workedDays.reduce((s, d) => s + d.work, 0) / workedDays.length) : 0
    const best = workByDay.reduce((m, d) => d.work > m.work ? d : m, { date: '', work: 0 })
    const avgSleep = sleepByDay.length ? Math.round(sleepByDay.reduce((s, m) => s + m, 0) / sleepByDay.length) : 0
    // Reparto por área en la semana (sin sueño): para saber en qué se te va el tiempo.
    const byArea: Record<string, number> = {}
    for (const h of (data.history || [])) { if (week.includes(h.date) && h.area !== 'sueno') byArea[h.area] = (byArea[h.area] || 0) + h.dur }
    const areaRank = (Object.entries(byArea) as [Area, number][]).sort((a, b) => b[1] - a[1])
    const totalNonSleep = areaRank.reduce((s, [, m]) => s + m, 0)
    const doneCount = (data.history || []).filter(h => week.includes(h.date) && h.done).length
    // Racha: días consecutivos HASTA HOY con algo de trabajo registrado (mira hacia atrás desde hoy).
    let streak = 0
    for (let i = 0; i < 60; i++) {
      const d = addDaysISO(iso(new Date()), -i)
      const hasWork = (data.history || []).some(h => h.date === d && h.area === 'trabajo' && h.dur > 0)
      if (hasWork) streak++
      else if (i === 0) continue   // hoy aún puede no tener trabajo; no rompe la racha de ayer
      else break
    }
    return {
      avgWork, avgSleep, doneCount, totalNonSleep,
      bestDay: best.work > 0 ? { name: dowName[dowOf(best.date)], label: hm(best.work) } : null,
      areaRank: areaRank.slice(0, 4).map(([a, m]) => ({ area: a, label: AREAS[a]?.label || a, color: AREAS[a]?.color || '#8b8379', pct: totalNonSleep ? Math.round((m / totalNonSleep) * 100) : 0, min: m })),
      streak, workedDays: workedDays.length,
    }
  }, [data.history, taskDay])

  // Datos de ritmo (vista Semana): curva de desempeño por día (semana, seleccionable) +
  // DETALLE del día seleccionado (KPIs, histograma por hora, reparto por área, actividades).
  const ritmo = useMemo(() => {
    const week = weekOfISO(taskDay)
    const rt = iso(new Date())
    const dowOf = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay() }
    const weekly = week.map(d => {
      const work = (data.history || []).filter(h => h.date === d && h.area === 'trabajo').reduce((s, h) => s + h.dur, 0)
      const total = (data.history || []).filter(h => h.date === d && h.area !== 'sueno').reduce((s, h) => s + h.dur, 0)
      return { date: d, work, total, isToday: d === rt, selected: d === taskDay, future: d > rt, num: Number(d.slice(8)), letter: DAY_NAMES[dowOf(d)] }
    })
    const goal = data.focusGoal ?? 0
    const maxWork = Math.max(60, goal, ...weekly.map(w => w.work))

    // ── DETALLE del día visto (taskDay) ────────────────────────────────
    const day = taskDay
    const entries = (data.history || []).filter(h => h.date === day)
    const prod = entries.filter(h => h.area !== 'sueno').slice().sort((a, b) => a.start - b.start)
    const sleep = entries.filter(h => h.area === 'sueno').reduce((s, h) => s + h.dur, 0)
    const deep = prod.filter(h => h.area === 'trabajo').reduce((s, h) => s + h.dur, 0)
    const total = prod.reduce((s, h) => s + h.dur, 0)
    // Tareas terminadas ese día (distinct), SIN doble conteo entre días: una tarea con día
    // canónico de término (doneAt/repeatDone) se cuenta SOLO ese día; las cerradas por registro
    // cronometrado sin día canónico, el día del registro. (`done !== false` incluye legacy sin campo).
    const doneIds = new Set<string>()
    const canonDone = new Set<string>()
    ;(allTasks || []).forEach(t => { if (t.task.id && (t.task.doneAt || (t.task.repeatDone || []).length)) canonDone.add(t.task.id) })
    prod.forEach(h => { if (h.done !== false && h.taskId && !canonDone.has(h.taskId)) doneIds.add(h.taskId) })
    ;(allTasks || []).forEach(t => { if (t.task.id && (t.task.doneAt === day || (t.task.repeatDone || []).includes(day))) doneIds.add(t.task.id) })
    // Subtareas completadas ese día (doneAt local).
    let subDone = 0
    ;(allTasks || []).forEach(t => (t.task.subtasks || []).forEach(s => { if (s.done && s.doneAt && iso(new Date(s.doneAt)) === day) subDone++ }))
    // Reparto por área (minutos, sin sueño).
    const byArea: Partial<Record<Area, number>> = {}
    prod.forEach(h => { byArea[h.area] = (byArea[h.area] || 0) + h.dur })
    const areaRank = (Object.entries(byArea) as [Area, number][]).sort((a, b) => b[1] - a[1])
      .map(([a, m]) => ({ area: a, label: AREAS[a]?.label || a, color: AREAS[a]?.color || '#8b8379', min: m, pct: total ? Math.round((m / total) * 100) : 0 }))
    // Histograma por hora = minutos de RELOJ ocupados en cada hora. Ocupación por minuto: dedup de
    // bloques solapados (una hora nunca pasa de 60) y recorte a [0,1440] (bloques que cruzan
    // medianoche no descuadran contra el total ni se salen del arreglo).
    const occ = new Uint8Array(1440)
    prod.forEach(h => { const s = Math.max(0, h.start), e = Math.min(1440, h.start + h.dur); for (let m = s; m < e; m++) occ[m] = 1 })
    const hours: number[] = Array.from({ length: 24 }, (_, hr) => { let c = 0; for (let m = hr * 60; m < hr * 60 + 60; m++) c += occ[m]; return c })
    const active = hours.map((m, i) => ({ m, i })).filter(x => x.m > 0).map(x => x.i)
    const hasHours = active.length > 0
    const hFrom = active.length ? Math.min(...active) : 7
    const hTo = active.length ? Math.max(...active) : 22
    const firstStart = prod.length ? prod[0].start : null
    const lastEnd = prod.length ? Math.max(...prod.map(e => e.start + e.dur)) : null
    const acts = prod.map((h, i) => ({ id: i, name: h.name, start: h.start, end: h.start + h.dur, dur: h.dur, area: h.area, color: AREAS[h.area]?.color || '#8b8379', done: h.done !== false, taskId: h.taskId }))
    return { weekly, maxWork, goal, detail: { deep, total, sleep, tasksDone: doneIds.size, subDone, sessions: prod.length, areaRank, hours, hasHours, hFrom, hTo, firstStart, lastEnd, acts } }
  }, [data.history, allTasks, taskDay, data.focusGoal])

  // Tareas TERMINADAS en Épicas el DÍA VISTO (doneAt, o recurrente con repeatDone) que NO tienen
  // un registro con tiempo ese día: se muestran igual como "hecho" en el día.
  const epicDoneToday = useMemo(() => {
    const histIds = new Set((data.history || []).filter(h => h.date === taskDay && h.taskId).map(h => h.taskId))
    return (allTasks || []).filter(x => {
      const done = x.task.doneAt === taskDay || (x.task.repeatDone || []).includes(taskDay)
      return done && !histIds.has(x.task.id)
    })
  }, [allTasks, data.history, taskDay])

  // Registro del DÍA QUE SE ESTÁ VIENDO (taskDay): "lo que hiciste ese día" + trabajo del día.
  // Cuando taskDay === hoy es idéntico a lo de siempre; en otro día muestra lo de ESE día.
  const isTodayView = taskDay === iso(new Date())
  const dayLog = useMemo(() =>
    data.history.map((h, idx) => ({ h, idx })).filter(x => x.h.date === taskDay).sort((a, b) => a.h.start - b.h.start).map(x => ({
      idx: x.idx, range: clock(x.h.start) + '–' + clock(x.h.start + x.h.dur), name: x.h.name, dur: hm(x.h.dur), startMin: x.h.start,
      dot: AREAS[x.h.area] ? AREAS[x.h.area].color : '#8b8379', done: x.h.done !== false, taskId: x.h.taskId,
    })), [data.history, taskDay])
  const dayWorkedMin = useMemo(() => data.history.filter(h => h.date === taskDay && h.area === 'trabajo').reduce((s, h) => s + h.dur, 0), [data.history, taskDay])
  // Horas PLANEADAS a trabajar ese día = estimación (por dificultad) de las tareas planeadas para el día.
  // Sirve para el "planeado vs real" (real = dayWorkedMin).
  const plannedDay = useMemo(() => {
    const list = (allTasks || []).filter(t => t.task.status !== 'Archivada' && (t.task.plan === taskDay || recurringDueToday(t.task, taskDay)))
    return { min: list.reduce((s, t) => s + durByDiff(t.task), 0), count: list.length }
  }, [allTasks, taskDay])
  const dayLabel = isTodayView ? 'hoy' : longDayOf(taskDay)

  // Subtareas COMPLETADAS el día visto (con su hora) — para verlas en el registro del día.
  const daySubtasksDone = useMemo(() => {
    const out: { key: string; taskId?: string; epicaId: string; epicaName: string; color: string; taskName: string; sub: string; at: number }[] = []
    for (const t of allTasks || []) for (const s of t.task.subtasks || []) {
      const da = s.doneAt
      if (s.done && da && iso(new Date(da)) === taskDay) {
        const d = new Date(da)
        out.push({ key: (t.task.id || '') + '·' + (s.id || s.t), taskId: t.task.id, epicaId: t.epicaId, epicaName: t.epicaName, color: t.color, taskName: t.task.t || 'Tarea', sub: s.t, at: d.getHours() * 60 + d.getMinutes() })
      }
    }
    return out.sort((a, b) => a.at - b.at)
  }, [allTasks, taskDay])
  const visibleTaskIds = useMemo(() => new Set((tasks || []).map(t => t.task.id)), [tasks])   // tareas que ya se ven en la lista del día

  // Resumen de las juntas de HOY: cuántas, cuánto ocupan, la próxima, y conflictos con tu rutina.
  const meetInfo = useMemo(() => {
    const t0 = iso(new Date())
    const todayM = meetings.filter(m => m.date === t0).sort((a, b) => a.start - b.start)
    const totalMin = todayM.reduce((s, m) => s + m.dur, 0)
    const next = todayM.find(m => m.start + m.dur > now) || null   // en curso o la siguiente
    const dow = new Date().getDay()
    const prot = data.blocks.filter(b => blockActiveOn(b, dow))
    const ov = (aS: number, aE: number, bS: number, bE: number) => Math.max(0, Math.min(aE, bE) - Math.max(aS, bS))
    const conflicts: { meet: string; block: string; mins: number }[] = []
    for (const m of todayM) {
      for (const b of prot) { const o = ov(m.start, m.start + m.dur, b.start, b.start + b.dur); if (o >= 5) conflicts.push({ meet: m.name, block: b.name, mins: o }) }
      const os = ov(m.start, m.start + m.dur, data.bed, data.bed + data.sleep); if (os >= 5) conflicts.push({ meet: m.name, block: 'tu hora de dormir', mins: os })
    }
    return { count: todayM.length, totalMin, next, conflicts }
  }, [meetings, now, data.blocks, data.bed, data.sleep])

  /* ── Acciones ──────────────────────────────────────────────────────────── */
  const start = () => {
    if (selMeeting) beginSession({ name: selMeeting.name, area: 'personas', start: Math.round(now), dur })
    else if (selTask) beginSession({ name: selTask.task.t || 'Tarea', area: 'trabajo', start: Math.round(now), dur, epicaId: selTask.epicaId, taskId: selTask.task.id })
    else { const a = ACTIVITIES.find(x => x.id === act) || ACTIVITIES[0]; beginSession({ name: a.id, area: a.area, start: Math.round(now), dur }) }
  }
  // Escribe cambios de una tarea de vuelta a Épicas con CONTROL DE CHOQUE (mismo estándar que
  // Épicas): manda el `updatedAt` real; el server rechaza si otra pestaña/Épicas ganó (conflicts)
  // y devuelve `stamps` (updated_at fresco) para no chocar consigo mismo en la siguiente edición.
  // `force` sólo para el auto-guardado del editor (escribe cada tecla y no puede re-sellar por tecla).
  const syncTask = (epicaId: string, task: EpicaTask, force = false) => {
    const rest: EpicaTask = { ...task }
    if (force) delete (rest as { updatedAt?: string }).updatedAt
    return fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, update: [rest] }) })
      .then(async r => {
        if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('tarea ' + r.status + ' ' + t.slice(0, 160)) }
        const j = await r.json().catch(() => null) as { conflicts?: string[]; stamps?: Record<string, string> } | null
        // Sella el updated_at fresco en la copia local (evita falso choque en la próxima escritura).
        const stamp = task.id ? j?.stamps?.[task.id] : undefined
        if (stamp && task.id) { const st = stamp; setAllTasks(prev => (prev || []).map(x => x.task.id === task.id ? { ...x, task: { ...x.task, updatedAt: st } } : x)) }
        // Choque real: NO forzamos encima; recargamos lo último de la BD y avisamos (respeta el otro cambio).
        if (task.id && j?.conflicts?.includes(task.id)) { setSaveErr(true); setSaveErrMsg('«' + (task.t || 'tarea') + '» cambió en otra pestaña; recargué la última versión.'); refreshTasks(); return }
        if (task.id) pendingSync.current.delete(task.id); setSaveErr(pendingSync.current.size > 0); if (pendingSync.current.size === 0) setSaveErrMsg('')
      })
      .catch(e => { if (task.id) pendingSync.current.set(task.id, { epicaId, task }); setSaveErr(true); setSaveErrMsg(String(e?.message || e).slice(0, 180)); console.error('[tiempo] sync de tarea falló:', e) })
  }
  // Empieza una sesión NUEVA. Si ya hay una en curso, la cierra REGISTRANDO su tiempo (no la
  // descarta) tras confirmar, y arranca la nueva en UNA sola escritura (más `extraPatch`, p. ej.
  // sacar un bloque de agendados). Devuelve true si arrancó (false si el usuario canceló).
  const beginSession = (nsIn: NonNullable<AppData['session']>, extraPatch: Partial<AppData> = {}): boolean => {
    const t0ms = Date.now()
    const ns = { ...nsIn, origStart: nsIn.start, startedAt: t0ms, segAt: t0ms }   // ancla al reloj real
    const s = data.session
    if (s) {
      const el = Math.max(1, Math.round(sessionElapsed(s, now)))
      const msg = el > 480
        ? `«${s.name}» lleva ${hm(el)} — parece que el cronómetro se quedó corriendo. Si acepto GUARDO todo ese tiempo y empiezo «${ns.name}». Cancela si no trabajaste todo eso (luego usa "Descartar" en la sesión).`
        : `Tienes «${s.name}» en curso (${hm(el)}). ¿La guardo y empiezo «${ns.name}»?`
      if (!window.confirm(msg)) return false
      const today0 = iso(new Date())
      const logId = uid()
      const startD = s.startedAt != null ? new Date(s.startedAt) : null
      const histDay = startD ? iso(startD) : today0
      const histStart = startD ? startD.getHours() * 60 + startD.getMinutes() : Math.min(Math.round(s.origStart ?? s.start), Math.round(now))
      const hist: HistoryRow = { date: histDay, name: s.name, area: s.area, start: histStart, dur: el, done: s.taskId ? false : true, ...(s.taskId ? { epicaId: s.epicaId, taskId: s.taskId, logId } : {}) }
      save({ session: ns, history: dataRef.current.history.concat([hist]), ...extraPatch })
      showUndo(`✓ Guardé ${hm(el)} de «${s.name}» y empecé «${ns.name}»`, () => save({ history: dataRef.current.history.filter(h => h !== hist) }))
      if (s.taskId && s.epicaId) {
        const tt = tasksRef.current.find(x => x.task.id === s.taskId)
        if (tt) {
          const log = [...((tt.task.progressLog as EpicaProgressEntry[]) || []), { d: histDay, note: `⏱ ${hm(el)} trabajado`, pct: tt.task.progress, min: el, logId } as EpicaProgressEntry]
          const upd: EpicaTask = { ...tt.task, progressLog: log }
          syncTask(s.epicaId, upd)
          setAllTasks(prev => (prev || []).map(x => x.task.id === s.taskId ? { ...x, task: upd } : x))
        }
      }
    } else {
      save({ session: ns, ...extraPatch })
    }
    // El registro caerá en el día REAL de hoy; salta la vista a hoy para que se vea (si estabas
    // viendo otro día del selector, o la pestaña quedó abierta desde ayer, si no parecería perdido).
    setTaskDay(iso(new Date()))
    return true
  }
  // Auto-guardado del editor de tarea: escribe a Épicas y refresca la copia local SIN cerrar.
  const autoSaveTask = (epicaId: string, task: EpicaTask) => {
    syncTask(epicaId, task, true)   // editor: fuerza (guarda cada tecla; el que edita en Tiempo manda)
    setAllTasks(prev => (prev || []).map(x => x.task.id === task.id ? { ...x, task } : x))
  }
  const unplanTask = (epicaId: string, task: EpicaTask) => {
    syncTask(epicaId, { ...task, plan: '' })
    setAllTasks(prev => (prev || []).filter(x => x.task.id !== task.id))
    setSelTaskId(id => id === task.id ? null : id); setEditTask(null)
  }
  // Mantiene la bitácora de Épicas en sync con un registro de Tiempo: al BORRAR (newDur=null) quita
  // su entrada de progressLog; al EDITAR la duración, ajusta el `min`. Liga por `logId`. Así el
  // "tiempo invertido" de Épicas no diverge de lo que ves en Tiempo (bug de la revisión).
  const adjustEpicLog = (row: HistoryRow, newDur: number | null) => {
    if (!row.taskId || !row.epicaId || !row.logId) return
    const tt = tasksRef.current.find(x => x.task.id === row.taskId); if (!tt) return
    const cur = (tt.task.progressLog as EpicaProgressEntry[] | undefined) || []
    if (!cur.some(l => l.logId === row.logId)) return
    const log = newDur == null
      ? cur.filter(l => l.logId !== row.logId)
      : cur.map(l => l.logId === row.logId ? { ...l, min: newDur, note: `⏱ ${hm(newDur)} trabajado` } : l)
    const upd: EpicaTask = { ...tt.task, progressLog: log }
    syncTask(row.epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === row.taskId ? { ...x, task: upd } : x))
  }
  // Registro de hoy (localStorage): editar entradas (auto-guardado, NO cierra el editor).
  const saveHist = (idx: number, patch: Partial<AppData['history'][number]>) => {
    const row = dataRef.current.history[idx]
    save({ history: dataRef.current.history.map((h, i) => i === idx ? { ...h, ...patch } : h) })
    if (row && typeof patch.dur === 'number' && patch.dur !== row.dur) adjustEpicLog(row, patch.dur)
  }
  // Toast "deshacer": guarda una acción de restauración por ~6s.
  const showUndo = (msg: string, fn: () => void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo({ msg, fn })
    undoTimer.current = setTimeout(() => setUndo(null), 6000)
  }
  // Deshacer re-agrega el ELEMENTO borrado sobre el estado actual (dataRef), no restaura un
  // snapshot completo del arreglo (que pisaría cualquier cambio hecho mientras el toast estaba visible).
  // skipEpicSync = la llamó reopenTask, que YA ajustó Épicas en una sola escritura (evita la 2ª
  // escritura encadenada que, con tasksRef aún sin actualizar, revertía el reopen a "Terminada").
  const delHist = (idx: number, skipEpicSync = false) => {
    const row = data.history[idx]; if (!row) return
    // guarda la entrada de bitácora ligada (para poder restaurarla al deshacer) y quítala de Épicas
    let removedLog: EpicaProgressEntry | undefined
    if (!skipEpicSync && row.taskId && row.logId) { removedLog = ((tasksRef.current.find(x => x.task.id === row.taskId)?.task.progressLog as EpicaProgressEntry[] | undefined) || []).find(l => l.logId === row.logId) }
    if (!skipEpicSync) adjustEpicLog(row, null)
    save({ history: data.history.filter((_, i) => i !== idx) }); setHistIdx(null)
    showUndo('Registro borrado', () => {
      save({ history: [...dataRef.current.history, row] })
      if (removedLog && row.taskId && row.epicaId) {   // restaura también el tiempo en Épicas
        const tt = tasksRef.current.find(x => x.task.id === row.taskId); if (!tt) return
        const cur = (tt.task.progressLog as EpicaProgressEntry[] | undefined) || []
        if (cur.some(l => l.logId === row.logId)) return
        const upd: EpicaTask = { ...tt.task, progressLog: [...cur, removedLog!] }
        syncTask(row.epicaId, upd); setAllTasks(prev => (prev || []).map(x => x.task.id === row.taskId ? { ...x, task: upd } : x))
      }
    })
  }
  const deleteBlock = (id: string) => { const blk = data.blocks.find(x => x.id === id); if (!blk) return; save({ blocks: data.blocks.filter(x => x.id !== id) }); showUndo('Bloque borrado', () => save({ blocks: [...dataRef.current.blocks, blk] })) }
  // Reabre una tarea en Épicas (En curso, sin doneAt) SIN clobber: usa el objeto completo.
  const reopenByTask = (epicaId: string, taskId: string) => {
    const tt = tasksRef.current.find(x => x.task.id === taskId)
    if (!tt) return
    const upd: EpicaTask = { ...tt.task, status: 'En curso', doneAt: undefined }
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
  }
  // "No estaba terminada": reabre la tarea en Épicas y LUEGO quita el registro
  // (así, si algo falla, no se pierde el registro).
  const reopenTask = (idx: number) => {
    const row = data.history[idx]; if (!row) return
    // Reabrir + quitar su tiempo de la bitácora en UNA sola escritura (si lo hiciéramos en dos, la
    // 2ª leería tasksRef aún sin actualizar y revertiría el reopen). Luego se borra la fila local.
    if (row.taskId && row.epicaId) {
      const tt = tasksRef.current.find(x => x.task.id === row.taskId)
      if (tt) {
        const cur = (tt.task.progressLog as EpicaProgressEntry[] | undefined) || []
        const progressLog = row.logId ? cur.filter(l => l.logId !== row.logId) : cur
        const upd: EpicaTask = { ...tt.task, status: 'En curso', doneAt: undefined, progressLog }
        syncTask(row.epicaId, upd)
        setAllTasks(prev => (prev || []).map(x => x.task.id === row.taskId ? { ...x, task: upd } : x))
      }
    }
    delHist(idx, true)   // Épicas ya quedó sincronizado arriba
  }
  // Al guardar el registro con el check "se terminó" cambiado, sincroniza a Épicas.
  const syncHistDone = (row: AppData['history'][number], done: boolean) => {
    if (!row.taskId || !row.epicaId) return
    if (done) markEpicTaskDone(row.epicaId, row.taskId, row.date)
    else reopenByTask(row.epicaId, row.taskId)
  }

  // Crea la reunión como tarea de HOY en la épica elegida.
  const meetingToEpica = (m: Meeting, epicaId: string) => {
    const t: EpicaTask = { id: (crypto?.randomUUID?.() || 'm' + Date.now()), t: m.name, status: 'Por hacer', due: '', note: '', plan: iso(new Date()), links: [] }
    fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, create: [t] }) }).catch(() => {})
    const ep = epicasList.find(e => e.id === epicaId)
    setAllTasks(prev => [...(prev || []), { epicaId, epicaName: ep?.name || '', color: ep?.color || '#b4653a', task: t }])
  }
  // planOrder al final del día destino (para reprogramar recurrentes semanales/mensuales).
  const nextPlanOrderFor = (day: string) => { let mx = 0; for (const x of tasksRef.current) if (x.task.plan === day && typeof x.task.planOrder === 'number') mx = Math.max(mx, x.task.planOrder!); return mx + 1000 }
  // Al COMPLETAR una recurrente: los hábitos DIARIOS solo marcan el día en repeatDone (reaparecen
  // mañana solos); los SEMANALES/MENSUALES se REPROGRAMAN a su próxima fecha (como en Épicas), si no
  // se quedaban pegados con plan=hoy y no volvían a salir nunca.
  const completeTaskFields = (task: EpicaTask, day2: string): EpicaTask => {
    const rd = task.repeatDone || []
    if (task.repeat && task.repeat.unit !== 'dia') return completeRecurring(task, day2, nextPlanOrderFor)
    if (task.repeat) return { ...task, repeatDone: rd.includes(day2) ? rd : [...rd, day2] }
    return { ...task, status: 'Terminada', doneAt: day2 }
  }
  // Marca hecha en Épicas (ver completeTaskFields para la lógica de recurrencia).
  const markEpicTaskDone = (epicaId: string, taskId: string, day: string = iso(new Date())) => {
    const tt = tasksRef.current.find(x => x.task.id === taskId)
    if (!tt) return
    const day2 = doneDayFor(tt.task, day)
    const upd: EpicaTask = completeTaskFields(tt.task, day2)
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
    setSelTaskId(id => id === taskId ? null : id)
  }
  // Quitar una terminada de Épicas del día ("me equivoqué, no se trabajó"): la reabre
  // (recurrente = saca el día de repeatDone; normal = En curso, sin doneAt).
  const unmarkEpicDone = (tt: TodayTask) => {
    const t0 = iso(new Date())
    const upd: EpicaTask = tt.task.repeat
      ? { ...tt.task, repeatDone: (tt.task.repeatDone || []).filter(d => d !== t0 && d !== tt.task.plan) }
      : { ...tt.task, status: 'En curso', doneAt: undefined }
    syncTask(tt.epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === tt.task.id ? { ...x, task: upd } : x))
  }
  // Cierra el bloque en curso: lo registra en el día y, si es una tarea de Épicas,
  // le SUMA el tiempo invertido (entra a la bitácora de avances). markDone la cierra.
  const finish = (markDone = false) => {
    const s = data.session; if (!s) return
    const elapsed = Math.max(1, Math.round(sessionElapsed(s, now)))
    const today = iso(new Date())
    // Cronómetro olvidado: una sola sesión de >8h casi siempre quedó corriendo (p. ej. toda la
    // noche). Avisa antes de registrar semejante bloque; si cancelas, se descarta (no se registra).
    if (elapsed > 480 && !window.confirm(`Llevas ${hm(elapsed)} en «${s.name}». Parece que el cronómetro se quedó corriendo (¿toda la noche?). ¿Registrar TODO ese tiempo como trabajado?\n\nAceptar = registrarlo · Cancelar = descartarlo sin registrar.`)) {
      save({ session: null }); showUndo(`Descarté «${s.name}» sin registrar`, () => save({ session: s }))
      return
    }
    const logId = uid()   // liga el registro de Tiempo con su entrada en la bitácora de Épicas
    // Inicio REAL desde el reloj (día + minuto). Antes se acotaba con Math.min(...,now), lo que
    // corrompía el inicio de una sesión que cruzaba medianoche (lo mandaba al futuro).
    const startD = s.startedAt != null ? new Date(s.startedAt) : null
    const entryDay = startD ? iso(startD) : today
    const startMin = startD ? startD.getHours() * 60 + startD.getMinutes() : Math.min(Math.round(s.origStart ?? s.start), Math.round(now))
    const entry: HistoryRow = { date: entryDay, name: s.name, area: s.area, start: startMin, dur: elapsed, done: s.taskId ? markDone : true, ...(s.taskId ? { epicaId: s.epicaId, taskId: s.taskId, logId } : {}) }
    save({ session: null, history: dataRef.current.history.concat([entry]) })
    setTaskDay(entryDay)   // salta al día donde cayó el registro (normalmente hoy)
    showUndo(`✓ Registré ${hm(elapsed)} en «${s.name}»${markDone ? ' · marcada hecha' : ''}`, () => save({ history: dataRef.current.history.filter(h => h !== entry) }))
    if (s.taskId && s.epicaId) {
      const tt = tasksRef.current.find(x => x.task.id === s.taskId)
      if (tt) {
        const log = [...((tt.task.progressLog as EpicaProgressEntry[]) || []), { d: entryDay, note: `⏱ ${hm(elapsed)} trabajado`, pct: tt.task.progress, min: elapsed, logId } as EpicaProgressEntry]
        const withLog: EpicaTask = { ...tt.task, progressLog: log }
        const upd: EpicaTask = markDone ? completeTaskFields(withLog, doneDayFor(tt.task, today)) : withLog
        syncTask(s.epicaId, upd)
        setAllTasks(prev => (prev || []).map(x => x.task.id === s.taskId ? { ...x, task: upd } : x))
        if (markDone) setSelTaskId(id => id === s.taskId ? null : id)
      }
    }
    // Si la sesión venía de una RUTINA, marca su día como hecho (llena el chip de hoy).
    if (s.routineRef) setRoutineDone(s.routineRef.epicaId, s.routineRef.rIdx, today)
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
    fetch(`/api/epicas/${epicaId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routines }) })
      .then(async r => { if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('rutina ' + r.status + ' ' + t.slice(0, 140)) } })
      .catch(e => { setSaveErr(true); setSaveErrMsg(String(e?.message || e).slice(0, 180)); console.error('[tiempo] marcar rutina falló:', e) })
  }
  // Togglear un día CONCRETO de la semana de una rutina (tracker semanal, como en Épicas).
  const toggleRoutineDay = (epicaId: string, rIdx: number, monday: string, dayIdx: number) => {
    const ep = epicasList.find(e => e.id === epicaId); if (!ep) return
    const routines = ep.routines.map((r, i) => {
      if (i !== rIdx) return r
      const weeks = { ...(r.weeks || {}) }
      const arr = (weeks[monday] && weeks[monday].length === 7) ? [...weeks[monday]] : [false, false, false, false, false, false, false]
      arr[dayIdx] = !arr[dayIdx]; weeks[monday] = arr
      const out: EpicaRoutine = { ...r, weeks }
      if (monday === mondayOfISO(iso(new Date()))) out.days = arr   // mantiene `days` (legado) sincronizado con la semana actual
      return out
    })
    setEpicasList(prev => prev.map(e => e.id === epicaId ? { ...e, routines } : e))
    fetch(`/api/epicas/${epicaId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routines }) })
      .then(async r => { if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('rutina ' + r.status + ' ' + t.slice(0, 140)) } })
      .catch(e => { setSaveErr(true); setSaveErrMsg(String(e?.message || e).slice(0, 180)); console.error('[tiempo] marcar rutina falló:', e) })
  }
  const startRoutine = (name: string, epicaId?: string, rIdx?: number) => { if (beginSession({ name, area: 'trabajo', start: Math.round(now), dur: 0, ...(epicaId != null && rIdx != null ? { routineRef: { epicaId, rIdx } } : {}) })) setView('hoy') }
  // Empezar una actividad GENERAL (revisar cosas, algo sin tarea): timer libre al instante.
  // Empieza una actividad "general" (contador libre). NO cambia de vista: la sesión se ve como
  // popup flotante y como banda EN CURSO en el Planificador, así funciona en Hoy o en el Planificador.
  const startGeneral = (name: string) => { beginSession({ name: name.trim() || 'General', area: 'trabajo', start: Math.round(now), dur: 0 }) }
  // Marca una rutina como HECHA en un día (idempotente: no la desmarca). Usado al Terminar una
  // sesión de rutina y por el botón "✓ Terminada".
  const setRoutineDone = (epicaId: string, rIdx: number, dayISO: string) => {
    const ep = epicasList.find(e => e.id === epicaId); if (!ep) return
    const monday = mondayOfISO(dayISO), idx = dayIdxMon(dayISO)
    const r = ep.routines[rIdx]
    const already = !!(r?.weeks && r.weeks[monday] && r.weeks[monday][idx])
    if (already) return
    toggleRoutineDay(epicaId, rIdx, monday, idx)
  }
  // Agendar una rutina a una hora del día (como actividad libre con su nombre).
  const scheduleRoutineAt = (name: string) => { setScheduleName(name); setSchedulePreset(null); setScheduleAt(nextChainStart()) }
  // Reordenar manualmente las tareas: reasigna planOrder 1000,2000,… y persiste.
  const reorderTasks = (ids: string[]) => {
    const byId = new Map((allTasks || []).map(t => [t.task.id!, t]))
    // Si hay un filtro activo, `ids` es solo el subconjunto filtrado. Renumerar solo esos
    // corrompe el orden global (colisiones/huecos con las tareas ocultas). Se FUSIONA el
    // subconjunto reordenado dentro del orden COMPLETO del día (por planOrder), reemplazando
    // únicamente los slots que ocupaba el subconjunto.
    const subset = new Set(ids)
    const dayFull = [...(tasks || [])].map(t => t.task).filter(t => t.id).sort((a, b) => (a.planOrder ?? 1e9) - (b.planOrder ?? 1e9)).map(t => t.id!)
    let finalIds: string[]
    if (dayFull.length && !dayFull.every(id => subset.has(id))) {
      const queue = ids.filter(id => byId.has(id))
      finalIds = dayFull.map(id => subset.has(id) ? (queue.shift() ?? id) : id)
      queue.forEach(id => finalIds.push(id))   // ids del subconjunto que no estaban en dayFull (borde)
    } else {
      finalIds = ids
    }
    const byEpic = new Map<string, EpicaTask[]>()
    finalIds.forEach((id, i) => {
      const tt = byId.get(id); if (!tt) return
      const po = (i + 1) * 1000
      if (tt.task.planOrder !== po) { const nt = { ...tt.task, planOrder: po }; byId.set(id, { ...tt, task: nt }); if (!byEpic.has(tt.epicaId)) byEpic.set(tt.epicaId, []); byEpic.get(tt.epicaId)!.push(nt) }
    })
    setAllTasks(prev => (prev || []).map(t => { const u = byId.get(t.task.id!); return u ? u : t }))
    // Se quita updatedAt para FORZAR la escritura (si no, la API la descarta por "choque"
    // cuando el updatedAt local quedó viejo tras otra escritura de esta sesión).
    byEpic.forEach((arr, epicaId) => {
      const upd = arr.map(t => { const r = { ...t }; delete (r as { updatedAt?: string }).updatedAt; return r })
      fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, update: upd }) }).catch(() => {})
    })
  }
  // Comenzar una tarea desde su detalle. dur = 0 → contador libre (hasta que pares).
  const startTask = (info: { epicaId: string; task: EpicaTask }, d: number) => {
    if (beginSession({ name: info.task.t || 'Tarea', area: 'trabajo', start: Math.round(now), dur: d, epicaId: info.epicaId, taskId: info.task.id })) { setEditTask(null); setView('hoy') }
  }
  // Crear una tarea nueva en la épica elegida (mismos campos que Épicas).
  const createTask = (epicaId: string, task: EpicaTask) => {
    if (!epicaId) return
    const ep = epicasList.find(e => e.id === epicaId)
    fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, create: [task] }) })
      .then(async r => { if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('crear ' + r.status + ' ' + t.slice(0, 140)) } })
      .catch(e => { setSaveErr(true); setSaveErrMsg(String(e?.message || e).slice(0, 180)); console.error('[tiempo] crear tarea falló:', e) })
    setAllTasks(prev => [...(prev || []), { epicaId, epicaName: ep?.name || '', color: ep?.color || '#b4653a', task }])
    setEditTask(null)
  }
  const extend = () => { const s = data.session; if (s) save({ session: { ...s, dur: s.dur + 15 } }) }
  // Marca/desmarca una subtarea de la tarea en foco (desde el Modo foco): fija/limpia doneAt y
  // sincroniza a Épicas para que se vea completada en todos lados (incl. "subtareas completadas hoy").
  const toggleSubtaskOf = (taskId: string, epicaId: string, subKey: string) => {
    const tt = tasksRef.current.find(x => x.task.id === taskId); if (!tt) return
    const subs = (tt.task.subtasks || []).map(s => ((s.id || s.t) === subKey ? { ...s, done: !s.done, doneAt: !s.done ? new Date().toISOString() : undefined } : s))
    const upd: EpicaTask = { ...tt.task, subtasks: subs }
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
  }
  // Crea una subtarea sobre la marcha desde el Modo foco (para que "elegir qué hacer" no obligue a ir a Épicas).
  const addSubtaskOf = (taskId: string, epicaId: string, text: string) => {
    const t = text.trim(); if (!t) return
    const tt = tasksRef.current.find(x => x.task.id === taskId); if (!tt) return
    const subs = [...(tt.task.subtasks || []), { id: uid(), t, done: false }]
    const upd: EpicaTask = { ...tt.task, subtasks: subs }
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
  }
  // Reordenar una subtarea PENDIENTE (↑↓) entre las pendientes, como en Épicas. Intercambia con
  // la pendiente vecina en su posición REAL del arreglo (las hechas se quedan en su lugar).
  const moveSubtaskOf = (taskId: string, epicaId: string, subKey: string, dir: -1 | 1) => {
    const tt = tasksRef.current.find(x => x.task.id === taskId); if (!tt) return
    const subs = [...(tt.task.subtasks || [])]
    const pend = subs.map((s, i) => ({ s, i })).filter(x => !x.s.done)
    const k = pend.findIndex(x => (x.s.id || x.s.t) === subKey); if (k < 0) return
    const j = k + dir; if (j < 0 || j >= pend.length) return
    const a = pend[k].i, b = pend[j].i; [subs[a], subs[b]] = [subs[b], subs[a]]
    const upd: EpicaTask = { ...tt.task, subtasks: subs }
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
  }
  // Agregar comentario a la tarea en foco (mismo patrón: sincroniza a Épicas).
  const addCommentOf = (taskId: string, epicaId: string, text: string) => {
    if (!comentariosReady) { setSaveErr(true); setSaveErrMsg('Para comentar corre sql/epicas-07-comentarios.sql en Supabase.'); return }
    const t = text.trim(); if (!t) return
    const tt = tasksRef.current.find(x => x.task.id === taskId); if (!tt) return
    const comentarios = [...(tt.task.comentarios || []), { at: new Date().toISOString(), text: t }]
    const upd: EpicaTask = { ...tt.task, comentarios }
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
  }
  // Editar campos de la tarea en foco (fechas: vence/hacer, etc.) y sincronizar a Épicas.
  const patchFocusTask = (taskId: string, epicaId: string, patch: Partial<EpicaTask>) => {
    const tt = tasksRef.current.find(x => x.task.id === taskId); if (!tt) return
    const upd: EpicaTask = { ...tt.task, ...patch }
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
  }
  // Agregar un link a la tarea en foco.
  const addLinkOf = (taskId: string, epicaId: string, label: string, url: string) => {
    const u = url.trim(), l = label.trim(); if (!u && !l) return
    const tt = tasksRef.current.find(x => x.task.id === taskId); if (!tt) return
    const links = [...(tt.task.links || []), { label: l, url: u }]
    const upd: EpicaTask = { ...tt.task, links }
    syncTask(epicaId, upd)
    setAllTasks(prev => (prev || []).map(x => x.task.id === taskId ? { ...x, task: upd } : x))
  }
  const cancel = () => save({ session: null })
  // Pausar: banca lo transcurrido en pausedAccum y detiene el reloj. Reanudar: nuevo segmento.
  const pauseSession = () => { const s = data.session; if (!s || s.pausedAt != null) return; const seg = s.segAt != null ? (Date.now() - s.segAt) / 60000 : elapsedMin(s.start, now); save({ session: { ...s, pausedAccum: (s.pausedAccum || 0) + Math.max(0, seg), pausedAt: Math.round(now) } }) }
  const resumeSession = () => { const s = data.session; if (!s || s.pausedAt == null) return; save({ session: { ...s, start: Math.round(now), segAt: Date.now(), pausedAt: undefined } }) }
  // Corregir la hora en que empezó la actividad en curso (desde el Planificador o "el día"): reancla
  // el inicio real a esa hora de HOY, así el transcurrido pasa a ser "ahora − ese inicio".
  const setSessionStart = (startMin: number) => {
    const s = data.session; if (!s) return
    const m = Math.max(0, Math.min(1439, Math.round(startMin)))
    const d = new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0)
    if (d.getTime() > Date.now()) return   // no dejar un inicio en el futuro
    save({ session: { ...s, origStart: m, start: m, startedAt: d.getTime(), segAt: d.getTime(), pausedAccum: 0, pausedAt: undefined } })
  }
  // Inicio (minuto del día) y transcurrido de la sesión en curso, para pintarla en el Planificador/"el día".
  const sessStartMin = data.session ? (data.session.startedAt != null ? (() => { const d = new Date(data.session.startedAt!); return d.getHours() * 60 + d.getMinutes() })() : Math.round(data.session.origStart ?? data.session.start)) : 0
  const sessElapsed = data.session ? Math.max(1, Math.round(sessionElapsed(data.session, now))) : 0
  // Volver a trabajar una actividad YA registrada hoy (la hiciste a las 11 y la retomas a las 3):
  // arranca una NUEVA sesión con el mismo nombre/área (y su tarea de Épicas si venía de una),
  // contador libre. Se ACUMULA: al terminar genera otro bloque en el día y otra entrada de tiempo.
  const resumeActivity = (row: AppData['history'][number]) => {
    // NO cambia de vista: se queda donde estás (la sesión en curso sale como popup flotante).
    if (beginSession({ name: row.name, area: row.area, start: Math.round(now), dur: 0, ...(row.taskId ? { epicaId: row.epicaId, taskId: row.taskId } : {}) })) setHistIdx(null)
  }
  // Devolver una tarea (a la que ya le pusiste tiempo hoy) a "tus tareas del día".
  const sendBackToTasks = (taskId: string) => {
    const key = `${today}·${taskId}`
    if ((data.backToTasks || []).includes(key)) return
    save({ backToTasks: [...(data.backToTasks || []), key] })
  }
  // Quitarla de nuevo de la lista (deshace "↩ A tareas"): se vuelve a ocultar por tener tiempo.
  const removeBackToTasks = (taskId: string) => {
    const key = `${today}·${taskId}`
    save({ backToTasks: (data.backToTasks || []).filter(k => k !== key) })
  }
  // Quitar una tarea de "tus tareas del día" desde la lista misma. Si la habías devuelto
  // (backToTasks), la vuelve a ocultar; si no, le quita el plan de hoy (con confirmación).
  const removeFromDayList = (t: TodayTask) => {
    if ((data.backToTasks || []).includes(`${today}·${t.task.id}`)) { removeBackToTasks(t.task.id!); return }
    if (window.confirm(`¿Quitar «${t.task.t || 'tarea'}» de tus tareas de hoy? (le quita el plan de hoy en Épicas)`)) unplanTask(t.epicaId, t.task)
  }
  // Ver el detalle COMPLETO de una entrada del día: si vino de una tarea de Épicas, abre el
  // editor completo (avance, subtareas, bitácora, links…, incl. tareas ya Terminadas). Si es
  // actividad libre (sin tarea), abre el editor del registro.
  const viewLog = (row: AppData['history'][number], idx: number) => {
    if (row.taskId) {
      const tt = tasksRef.current.find(x => x.task.id === row.taskId)
      if (tt) { setHistIdx(null); setEditTask({ epicaId: tt.epicaId, epicaName: tt.epicaName, color: tt.color, task: { ...tt.task } }); return }
    }
    setHistIdx(idx)
  }
  // Agendar en la cinta: abre el selector para elegir una tarea de Épicas (o actividad libre)
  // a esa hora. Al llegar la hora, la app pregunta si la quieres iniciar.
  const addActivityAt = (startMin: number) => { setSchedulePreset(null); setScheduleAt(Math.max(0, Math.min(1425, Math.round(startMin / 15) * 15))) }
  // Agrega un REGISTRO nuevo (actividad ya hecha) al día visto y abre el editor para completarlo.
  const addWorkedActivity = () => {
    const base = isTodayView ? Math.max(0, Math.round(now / 15) * 15 - 30) : 9 * 60
    const entry: HistoryRow = { date: taskDay, name: 'Actividad', area: 'trabajo', start: base, dur: 30, done: true }
    const next = [...(data.history || []), entry]
    save({ history: next })
    setHistIdx(next.length - 1)
  }
  // Default para "+ actividad": justo después del ÚLTIMO agendado de hoy (para encadenar), o ahora
  // si no hay ninguno o ya pasó. Así una nueva empieza donde terminó la anterior.
  const nextChainStart = () => {
    const t0 = iso(new Date())
    const ends = (data.scheduled || []).filter(s => (s.date || t0) === t0).map(s => s.start + s.dur)
    return Math.max(Math.round(now / 15) * 15, ...(ends.length ? [Math.round(Math.max(...ends) / 15) * 15] : [0]))
  }
  // Filas normalizadas para la tabla ordenable "el día" (registro + hechas en Épicas + subtareas).
  const diaRows: WorkedRow[] = [
    ...dayLog.map(l => {
      const fut = isTodayView && l.startMin > now && !l.done
      const st = fut ? { statusLabel: '⚠ futura', statusColor: '#8a3c2a', statusRank: 3 } : l.done ? { statusLabel: 'hecho ✓', statusColor: '#4f6238', statusRank: 0 } : { statusLabel: 'trabajado', statusColor: '#8a4b28', statusRank: 1 }
      return {
        key: 'done' + l.idx, sortTime: l.startMin, timeLabel: l.range, color: l.dot, name: l.name, durMin: data.history[l.idx]?.dur ?? 0, durLabel: l.dur, ...st,
        onClick: () => setHistIdx(l.idx),
        actions: (<>
          {l.taskId && <button onClick={() => viewLog(data.history[l.idx], l.idx)} title="Ver la tarea completa" style={dtBtn}>Ver</button>}
          {l.taskId && isTodayView && (visibleTaskIds.has(l.taskId)
            ? (data.backToTasks || []).includes(`${today}·${l.taskId}`) && <button onClick={() => removeBackToTasks(l.taskId!)} title="Quitarla de 'tus tareas del día'" style={{ ...dtBtn, borderColor: '#e6cfa4', background: '#f7ece2', color: '#8a4b28' }}>Quitar de tareas</button>
            : <button onClick={() => sendBackToTasks(l.taskId!)} title="Devolverla a 'tus tareas del día'" style={{ ...dtBtn, borderColor: '#cfe0c4', background: '#eef1e7', color: '#4f6238' }}>↩ A tareas</button>)}
          <button onClick={() => setHistIdx(l.idx)} title="Editar el registro (hora/duración/terminada/borrar)" style={dtBtn}>Editar</button>
          <button onClick={() => resumeActivity(data.history[l.idx])} title="Volver a trabajar en esto ahora (se acumula)" style={{ ...dtBtn, color: '#8a4b28' }}>↻ Retomar</button>
        </>),
      }
    }),
    ...epicDoneToday.map(t => ({
      key: 'epc' + t.task.id, sortTime: 24 * 60 + 1, timeLabel: 'en Épicas', color: t.color, name: t.task.t || 'Tarea', sub: t.epicaName, durMin: 0, durLabel: '',
      statusLabel: 'hecho ✓', statusColor: '#4f6238', statusRank: 0,
      onClick: () => setEditTask({ epicaId: t.epicaId, epicaName: t.epicaName, color: t.color, task: { ...t.task } }),
      actions: (<>
        <button onClick={() => setEditTask({ epicaId: t.epicaId, epicaName: t.epicaName, color: t.color, task: { ...t.task } })} title="Ver / editar la tarea" style={dtBtn}>Ver</button>
        <button onClick={() => unmarkEpicDone(t)} title="No se trabajó / me equivoqué: quitarla del día" style={{ ...dtBtn, color: '#8a3c2a' }}>Quitar</button>
        <button onClick={() => resumeActivity({ date: today, name: t.task.t || 'Tarea', area: 'trabajo', start: 0, dur: 0, epicaId: t.epicaId, taskId: t.task.id })} title="Volver a trabajar en esto ahora" style={{ ...dtBtn, color: '#8a4b28' }}>↻ Retomar</button>
      </>),
    })),
    ...daySubtasksDone.map(st => ({
      key: 'std' + st.key, sortTime: st.at, timeLabel: clock(st.at), icon: '✓', color: '#2E6E6E', name: st.sub, sub: 'subtarea de ' + st.taskName, durMin: 0, durLabel: '',
      statusLabel: 'subtarea ✓', statusColor: '#2E6E6E', statusRank: 2,
      onClick: () => { const tt = (allTasks || []).find(x => x.task.id === st.taskId); if (tt) setEditTask({ epicaId: tt.epicaId, epicaName: tt.epicaName, color: tt.color, task: { ...tt.task } }) },
      actions: (<button onClick={() => { const tt = (allTasks || []).find(x => x.task.id === st.taskId); if (tt) setEditTask({ epicaId: tt.epicaId, epicaName: tt.epicaName, color: tt.color, task: { ...tt.task } }) }} title="Ver / editar la tarea" style={dtBtn}>Ver</button>),
    })),
  ]
  // Filas del día COMPLETO (Tarjeta C): la sesión EN CURSO (arriba) + lo trabajado + lo agendado + rutina/juntas.
  const diaFullRows: WorkedRow[] = [
    ...(isTodayView && data.session ? [{
      key: 'session', sortTime: sessStartMin, timeLabel: clock(sessStartMin) + '–' + clock(Math.round(now)), color: AREAS[data.session.area]?.color || '#c0392b', icon: '▶',
      name: data.session.name, durMin: sessElapsed, durLabel: hm(sessElapsed),
      statusLabel: 'en curso', statusColor: '#8a4b28', statusRank: -1,
      onClick: data.session.taskId ? () => { const tt = (allTasks || []).find(x => x.task.id === data.session!.taskId); if (tt) setEditTask({ epicaId: tt.epicaId, epicaName: tt.epicaName, color: tt.color, task: { ...tt.task } }) } : undefined,
      actions: (<>
        <input type="time" value={clock(sessStartMin)} onChange={e => setSessionStart(parse(e.target.value))} title="Corrige la hora en que empezaste" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, padding: '3px 6px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }} />
        {data.session.taskId && <button onClick={() => { const tt = (allTasks || []).find(x => x.task.id === data.session!.taskId); if (tt) setEditTask({ epicaId: tt.epicaId, epicaName: tt.epicaName, color: tt.color, task: { ...tt.task } }) }} title="Ver la tarea" style={dtBtn}>Ver</button>}
        <button onClick={() => finish(false)} title="Terminar la sesión" style={{ ...dtBtn, color: '#8a4b28' }}>Terminar</button>
      </>),
    } as WorkedRow] : []),
    ...diaRows,
    ...(isTodayView ? V.scheduledUpcoming.map(s => ({
      key: 'sch' + s.id, sortTime: s.start, timeLabel: s.range, color: '#c2933a', name: s.name, durMin: s.dur, durLabel: s.durLabel,
      statusLabel: 'agendado ' + s.when, statusColor: '#8a4b28', statusRank: 4,
      actions: (<>
        <button onClick={() => startScheduled({ id: s.id, name: s.name, area: s.area, start: s.start, dur: s.dur, epicaId: s.epicaId, taskId: s.taskId })} title="Empezar ahora" style={{ ...dtBtn, color: '#8a4b28' }}>▶ Iniciar</button>
        {s.taskId && <button onClick={() => { const tt = (allTasks || []).find(x => x.task.id === s.taskId); if (tt) setEditTask({ epicaId: tt.epicaId, epicaName: tt.epicaName, color: tt.color, task: { ...tt.task } }) }} title="Ver la tarea" style={dtBtn}>Ver</button>}
        <button onClick={() => removeScheduled(s.id)} title="Quitar de agendados" style={dtBtn}>×</button>
      </>),
    })) : []),
    ...(isTodayView ? V.upcoming.map((b, i) => ({
      key: 'up' + i, sortTime: b.start, timeLabel: b.range, color: b.dot, name: b.name + (b.cal ? '  🗓' : ''), durMin: b.durMin, durLabel: b.dur,
      statusLabel: b.state, statusColor: b.stateColor, statusRank: 5,
    })) : []),
  ]
  // Agendar una tarea concreta (desde su fila o su detalle): abre el selector ya con ella elegida,
  // sugiriendo el PRÓXIMO HUECO donde cabe (por su dificultad); si no hay, el próximo cuarto de hora.
  const scheduleTaskAt = (taskId: string) => {
    setSchedulePreset(taskId)
    const t = (tasks || []).find(x => x.task.id === taskId)
    const d = durByDiff(t?.task)
    const q = Math.min(1425, Math.ceil(now / 15) * 15)
    const gap = V.freeGaps.find(g => g.len >= d && g.e > now)
    setScheduleAt(gap ? Math.min(1425, Math.max(q, Math.round(gap.s / 15) * 15)) : q)
  }
  // "Lo más importante hoy" (MIT): hasta 3 tareas foco del día (persiste en el estado).
  const todayISO = iso(new Date())
  const mitIds = (data.mit && data.mit.date === todayISO) ? data.mit.ids : []
  const toggleMit = (taskId: string) => {
    const cur = mitIds
    const ids = cur.includes(taskId) ? cur.filter(x => x !== taskId) : (cur.length >= 3 ? cur : [...cur, taskId])
    save({ mit: { date: todayISO, ids } })
  }
  const scheduleActivity = (b: ScheduledBlock, createInCal = false) => {
    save({ scheduled: [...(data.scheduled || []), { ...b, date: taskDay }] }); setScheduleAt(null); setSchedulePreset(null)
    if (createInCal) {
      const [y, mo, d] = taskDay.split('-').map(Number)
      const startISO = new Date(y, mo - 1, d, Math.floor(b.start / 60), b.start % 60).toISOString()
      const endISO = new Date(y, mo - 1, d, Math.floor((b.start + b.dur) / 60), (b.start + b.dur) % 60).toISOString()
      fetch('/api/calendar/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: b.name, startISO, endISO }) })
        .then(r => r.json()).then(j => { if (!j.ok) window.alert('No se creó el evento en Google Calendar:\n' + (j.hint || j.error || 'error')) })
        .catch(() => window.alert('No se pudo crear el evento en Google Calendar (revisa tu conexión).'))
    }
  }
  const removeScheduled = (id: string) => { const blk = (data.scheduled || []).find(s => s.id === id); if (!blk) return; save({ scheduled: (data.scheduled || []).filter(s => s.id !== id) }); showUndo('Agendado quitado', () => save({ scheduled: [...(dataRef.current.scheduled || []), blk] })) }
  // Iniciar un bloque agendado: arranca la sesión (con su tarea si la tiene) y lo saca de agendados.
  const startScheduled = (s: ScheduledBlock) => {
    if (beginSession({ name: s.name, area: s.area, start: Math.round(now), dur: s.dur, ...(s.taskId ? { epicaId: s.epicaId, taskId: s.taskId } : {}) }, { scheduled: (data.scheduled || []).filter(x => x.id !== s.id) })) {
      setPromptedSched(p => { const n = new Set(p); n.add(s.id); return n }); setView('hoy')
    }
  }
  const dismissSched = (id: string) => setPromptedSched(p => { const n = new Set(p); n.add(id); return n })
  // Registrar (o reemplazar) el sueño de un día: alimenta la racha y la deuda de sueño.
  const logSleep = (date: string, mins: number) => {
    const rest = dataRef.current.history.filter(h => !(h.date === date && h.area === 'sueno'))
    // Siempre inserta (incluso 0h): registrar 0 significa "dormí 0", no borrar la noche.
    save({ history: [...rest, { date, name: 'Dormir', area: 'sueno' as Area, start: data.bed, dur: Math.max(0, Math.round(mins)) }] })
  }
  const areaOptions = (Object.keys(AREAS) as Area[]).filter(k => k !== 'sueno').map(k => ({ id: k, label: AREAS[k].label }))
  const bed = data.bed, sleepGoal = data.sleep
  const today = iso(new Date())

  const tabs: [typeof view, string][] = [['plan', 'Planificador'], ['hoy', 'Hoy'], ['semana', 'Semana'], ['rutina', 'Mi rutina'], ['historial', 'Historial']]

  // ── Planificador: helpers de agendado (fecha = día que se planifica) ───
  // save() poda los agendados de días pasados, así que agendar en el pasado se descartaría solo:
  // lo cortamos antes con un aviso claro en vez de que el arrastre "no haga nada".
  const planPastGuard = () => { if (planDay < iso(new Date())) { showUndo('No puedes agendar en un día que ya pasó', () => {}); return true } return false }
  const planAdd = (t: TodayTask, start: number, dur = 15) => {
    if (planPastGuard()) return
    save({ scheduled: [...(data.scheduled || []), { id: uid(), name: t.task.t || 'Tarea', area: 'trabajo', start, dur, date: planDay, epicaId: t.epicaId, taskId: t.task.id }] })
  }
  const planAddFree = (name: string, start: number, dur = 15) => {
    if (planPastGuard()) return
    save({ scheduled: [...(data.scheduled || []), { id: uid(), name: name || 'Actividad', area: 'trabajo', start, dur, date: planDay }] })
  }
  // Registrar en el Planificador una actividad YA HECHA (doble clic en la rejilla): entra al historial
  // del día planificado y, si viene de una tarea, suma su tiempo a la bitácora de Épicas (ligado por logId).
  const planAddDone = (p: { name: string; area: Area; start: number; dur: number; taskId?: string; epicaId?: string }) => {
    const logId = uid()
    const entry: HistoryRow = { date: planDay, name: p.name || 'Actividad', area: p.area, start: p.start, dur: p.dur, done: true, ...(p.taskId ? { epicaId: p.epicaId, taskId: p.taskId, logId } : {}) }
    save({ history: [...(data.history || []), entry] })
    if (p.taskId && p.epicaId) {
      const tt = tasksRef.current.find(x => x.task.id === p.taskId)
      if (tt) {
        const log = [...((tt.task.progressLog as EpicaProgressEntry[]) || []), { d: planDay, note: `⏱ ${hm(p.dur)} trabajado`, pct: tt.task.progress, min: p.dur, logId } as EpicaProgressEntry]
        const upd: EpicaTask = { ...tt.task, progressLog: log }
        syncTask(p.epicaId, upd)
        setAllTasks(prev => (prev || []).map(x => x.task.id === p.taskId ? { ...x, task: upd } : x))
      }
    }
    showUndo(`✓ Registré «${p.name || 'Actividad'}» (${hm(p.dur)})`, () => save({ history: dataRef.current.history.filter(h => h !== entry) }))
  }
  // Rutinas diarias de Épicas (hábitos) para planificar en el Planificador.
  const planRoutines = epicasList.flatMap(e => (e.routines || []).map(r => ({ name: r.t, epicaName: e.name, color: e.color })))
  const planPatch = (id: string, patch: Partial<ScheduledBlock>) =>
    save({ scheduled: (data.scheduled || []).map(s => s.id === id ? { ...s, ...patch } : s) })

  // Agendado cuya hora ya llegó y aún no preguntamos (y no hay sesión corriendo): dispara
  // el aviso "¿iniciar ahora?". La ventana termina en start+dur para no avisar de algo ya vencido.
  const dueSched = !data.session
    ? (data.scheduled || []).find(s => (s.date || iso(new Date())) === iso(new Date()) && !promptedSched.has(s.id) && now + 0.5 >= s.start && now <= s.start + Math.max(15, s.dur))
    : undefined

  // Aviso de juntas del calendario: ~10 min antes y al empezar (una vez cada uno, con la pestaña abierta).
  useEffect(() => {
    const t0 = iso(new Date())
    for (const m of meetings) {
      if (m.date !== t0) continue
      const toStart = m.start - now
      const k10 = m.id + ':10', k0 = m.id + ':0'
      if (toStart <= 10 && toStart > 1 && !meetNotified.current.has(k10)) { meetNotified.current.add(k10); beep(); notify('Junta en ' + Math.round(toStart) + ' min', `${m.name} · ${clock(m.start)}`) }
      if (toStart <= 1 && toStart > -3 && !meetNotified.current.has(k0)) { meetNotified.current.add(k0); beep(); notify('Empieza tu junta', `${m.name} · ${clock(m.start)}–${clock(m.start + m.dur)}`) }
    }
  }, [now, meetings])

  // Si la sesión termina, sal del modo foco (el overlay no tiene sentido sin sesión).
  useEffect(() => { if (!V.hasSession) setFocusOpen(false) }, [V.hasSession])
  useEffect(() => { if (!focusOpen) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusOpen(false) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [focusOpen])

  // Pomodoro: mientras la sesión corre y el Pomodoro está activo, avisa al entrar en descanso
  // (a los 25 min de cada ciclo de 30) y al retomar el trabajo (inicio del siguiente ciclo).
  useEffect(() => {
    const s = data.session
    if (!pomoOn || !s || s.pausedAt != null) return
    const el = sessionElapsed(s, now)
    const cycle = Math.floor(el / 30), pos = el % 30
    // Detección de FLANCO (no ventana estrecha): si la pestaña está en 2º plano el tick se
    // estrangula y `pos` puede saltarse [25,25.7); el Set por ciclo ya garantiza un solo aviso.
    if (pos >= 25) {
      const key = `${s.start}·${cycle}·break`
      if (!pomoNotified.current.has(key)) { pomoNotified.current.add(key); beep(); notify('Descanso 🌿', 'Llevas 25 min de foco. Tómate 5 para respirar.') }
    } else if (cycle >= 1) {
      const key = `${s.start}·${cycle}·work`
      if (!pomoNotified.current.has(key)) { pomoNotified.current.add(key); beep(); notify('De vuelta al foco 🎯', 'Se acabó el descanso. Otro bloque de 25 min.') }
    }
  }, [now, pomoOn, data.session])

  // Al llegar la hora de un agendado: suena + notifica del navegador (una vez por id),
  // útil sobre todo si la pestaña de Tiempo está en segundo plano.
  useEffect(() => {
    if (dueSched && dueNotifiedRef.current !== dueSched.id) {
      dueNotifiedRef.current = dueSched.id
      beep(); notify('Es hora de lo que agendaste', `${dueSched.name} · ${clock(dueSched.start)}`)
    }
  }, [dueSched])

  return (
    <div className="margen-root" style={{ minHeight: '100vh', background: '#f2ece2', fontFamily: 'var(--tiempo-ui), system-ui, sans-serif', color: '#1c1a17', WebkitFontSmoothing: 'antialiased' }}>
      <style>{MARGEN_CSS}</style>

      {/* Header de marca compartido (banda ADVL) */}
      <SiteHeader title="Tiempo" subtitle="Tu día · ADVL" backHref="/" backLabel="← Accesos" extra={<SectionNav current="tiempo" />} />

      {/* Cinta de accesos rápidos (favoritos del home), igual que en Épicas */}
      <div style={{ maxWidth: 1180, margin: '14px auto 0', padding: '0 20px' }}><FavoritosStrip /></div>

      <div className="tiempo-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 20px 64px' }}>
        {/* Sub-encabezado propio de la sección: fecha + reloj + pestañas */}
        <div className="tiempo-sub" style={{ width: '100%', maxWidth: 1180, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 26px' }}>
          <span style={{ fontSize: 14, color: '#a49b90', textTransform: 'capitalize' }}>{loaded ? V.dateLabel : ''}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button onClick={refreshTasks} title="Actualizar tareas de Épicas (mantiene día y filtros)" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '7px 13px', fontSize: 13, color: '#6b645b', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', transition: 'transform .6s', transform: refreshing ? 'rotate(360deg)' : 'none' }}>↻</span>{refreshing ? 'Actualizando…' : 'Actualizar'}</button>
            <button onClick={requestNotif} title={notifOn ? 'Avisos del navegador activados' : 'Activar avisos del navegador (agendados, recordatorios y fin de bloque)'} style={{ border: '1px solid ' + (notifOn ? '#cfe0c4' : '#e2d9cb'), background: notifOn ? '#eef1e7' : '#faf7f1', borderRadius: 999, padding: '7px 13px', fontSize: 13, color: notifOn ? '#4f6238' : '#6b645b', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{notifOn ? '🔔 Avisos on' : '🔔 Activar avisos'}</button>
            <span className="t-clock" style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{loaded ? V.nowLabel : '—'}</span>
            <div className="t-tabs" style={{ display: 'flex', gap: 4, background: '#e7dfd2', padding: 4, borderRadius: 999 }}>
              {tabs.map(([id, label]) => (
                <div key={id} onClick={() => setView(id)} style={{ padding: '9px 20px', borderRadius: 999, fontSize: 14, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', background: view === id ? '#faf7f1' : 'transparent', color: view === id ? '#1c1a17' : '#6b645b' }}>{label}</div>
              ))}
            </div>
          </div>
        </div>

        {!loaded ? <div style={{ height: 320 }} /> : view === 'plan' ? (
          /* ── PLANIFICADOR (calendario de arrastre por día) ─────────── */
          <PlanDia
            day={planDay}
            today={today}
            onPickDay={setPlanDay}
            tasks={planTasks}
            routines={planRoutines}
            scheduled={(data.scheduled || []).filter(s => (s.date || today) === planDay)}
            worked={data.history.filter(h => h.date === planDay)}
            blocks={data.blocks.filter(b => blockActiveOn(b, new Date(planDay + 'T12:00:00').getDay()))}
            meetings={meetings.filter(m => m.date === planDay)}
            now={now}
            session={data.session && planDay === today ? { name: data.session.name, start: sessStartMin, dur: sessElapsed, plannedDur: data.session.dur || 0, area: data.session.area, taskId: data.session.taskId } : null}
            onSessionStart={setSessionStart}
            allOpenTasks={allTasks}
            onGeneral={startGeneral}
            onAddDone={planAddDone}
            onOpenMeeting={setMeetView}
            onAdd={planAdd}
            onAddFree={planAddFree}
            onPatch={planPatch}
            onRemove={removeScheduled}
            onStart={startScheduled}
            onResume={resumeActivity}
            onEdit={(t) => setEditTask({ epicaId: t.epicaId, epicaName: t.epicaName, color: t.color, task: { ...t.task } })}
            onOpenTask={(tid) => { const tt = (allTasks || []).find(x => x.task.id === tid); if (tt) setEditTask({ epicaId: tt.epicaId, epicaName: tt.epicaName, color: tt.color, task: { ...tt.task } }) }}
            onNewTask={(epId) => { const e = epicasList.find(x => x.id === epId) || epicasList[0]; setEditTask({ creating: true, epicaId: e?.id || '', epicaName: e?.name || '', color: e?.color || '#b4653a', task: { id: uid(), t: '', status: 'Por hacer', due: '', note: '', plan: planDay, links: [] } }) }}
          />
        ) : view === 'hoy' ? (
          /* ── HOY ──────────────────────────────────────────────────── */
          <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 20 }}>
           <div className="hoy-panels">
           {hoyPanel === 'tareas' ? (
             <div className="hoy-rail">
               <button onClick={() => setHoyPanel('resumen')} title="Ver el resumen del día en grande" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a4b28', cursor: 'pointer', flexShrink: 0 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg></button>
               <span className="hoy-rail-txt" onClick={() => setHoyPanel('resumen')} style={{ cursor: 'pointer' }}>Resumen del día</span>
               <button onClick={() => setHoyPanel('both')} title="Ver ambos paneles" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b645b', cursor: 'pointer', flexShrink: 0 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="7" height="16" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /></svg></button>
             </div>
           ) : (<section className="hoy-panel" style={{ flex: 1 }}>
             <div className="hoy-panel-head">
               <span style={{ fontFamily: SERIF, fontSize: 20, color: '#1c1a17', flex: 1 }}>Resumen del día</span>
               {hoyPanel === 'resumen'
                 ? <button onClick={() => setHoyPanel('both')} title="Ver ambos paneles" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, padding: '5px 12px', fontSize: 12.5, color: '#6b645b', cursor: 'pointer' }}>⤢ ver ambos</button>
                 : <>
                   <button onClick={() => setHoyPanel('resumen')} title="Maximizar el resumen" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, width: 30, height: 30, fontSize: 14, color: '#6b645b', cursor: 'pointer', lineHeight: 1 }}>⤢</button>
                   <button onClick={() => setHoyPanel('tareas')} title="Minimizar el resumen (ver solo tareas)" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, width: 30, height: 30, fontSize: 18, color: '#6b645b', cursor: 'pointer', lineHeight: 1 }}>–</button>
                 </>}
             </div>
            {isTodayView && (() => {
              const gHr = Math.floor(now / 60)
              const greeting = gHr < 12 ? 'Buenos días' : gHr < 19 ? 'Buenas tardes' : 'Buenas noches'
              const mitTasks = mitIds.map(id => (allTasks || []).find(t => t.task.id === id)).filter(Boolean) as NonNullable<typeof allTasks>
              const nTasksToday = (tasks || []).length
              const next = (meetInfo.next && meetInfo.next.start > now)
                ? { name: meetInfo.next.name, at: meetInfo.next.start, kind: 'junta' as const }
                : (() => { const r = V.routineNext.find(x => !x.past && x.when !== 'en curso'); return r ? { name: r.name, at: null as number | null, kind: 'rutina' as const, when: r.when } : null })()
              return (
                <div style={{ ...card(24), background: 'linear-gradient(135deg,#faf7f1,#f4ece0)', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.05, color: '#1c1a17' }}>{greeting}, Andrés.</span>
                      <span style={{ fontSize: 13.5, color: '#8b8379', textTransform: 'capitalize' }}>{longDayOf(today)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ fontFamily: SERIF, fontSize: 34, lineHeight: .9, color: '#8a4b28' }}>{V.freeLabel}</span>
                      <span style={{ fontSize: 11.5, color: '#a49b90', textTransform: 'uppercase', letterSpacing: '.06em' }}>de tiempo útil</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#4c4741', background: '#fff', border: '1px solid #ece3d5', borderRadius: 999, padding: '6px 13px' }}>📋 {nTasksToday} {nTasksToday === 1 ? 'tarea' : 'tareas'} para hoy</span>
                    {meetInfo.count > 0 && <span style={{ fontSize: 13, color: '#2E5A9E', background: 'rgba(46,90,158,0.06)', border: '1px solid rgba(46,90,158,0.2)', borderRadius: 999, padding: '6px 13px' }}>🗓 {meetInfo.count} {meetInfo.count === 1 ? 'junta' : 'juntas'} · {hm(meetInfo.totalMin)}</span>}
                    {dayWorkedMin > 0 && <span style={{ fontSize: 13, color: '#4f6238', background: '#eef1e7', border: '1px solid #cfe0c4', borderRadius: 999, padding: '6px 13px' }}>✓ {hm(dayWorkedMin)} ya trabajado</span>}
                    {insights.streak > 1 && <span style={{ fontSize: 13, color: '#8a4b28', background: '#f7ece2', border: '1px solid #ecd9cb', borderRadius: 999, padding: '6px 13px' }}>🔥 racha de {insights.streak} días</span>}
                  </div>
                  {(data.focusGoal ?? 0) > 0 && (() => {
                    const goal = data.focusGoal!, pct = Math.min(100, Math.round((dayWorkedMin / goal) * 100)), met = dayWorkedMin >= goal
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: '1px solid #ece3d5', paddingTop: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={LBL}>meta de trabajo profundo</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: met ? '#4f6238' : '#8a4b28' }}>{met ? '✓ cumplida' : `${hm(dayWorkedMin)} / ${hm(goal)}`}</span>
                        </div>
                        <div style={{ height: 8, background: '#efe7d9', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: met ? 'linear-gradient(90deg,#6f8256,#8fae74)' : 'linear-gradient(90deg,#b4653a,#d98a55)', borderRadius: 999, transition: 'width .4s' }} />
                        </div>
                        {!met && <span style={{ fontSize: 12.5, color: '#8b8379' }}>Te faltan {hm(goal - dayWorkedMin)} para tu meta de hoy.</span>}
                      </div>
                    )
                  })()}
                  {mitTasks.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: '1px solid #ece3d5', paddingTop: 13 }}>
                      <span style={LBL}>lo más importante hoy</span>
                      {mitTasks.map(t => (
                        <div key={t!.task.id} onClick={() => setEditTask({ epicaId: t!.epicaId, epicaName: t!.epicaName, color: t!.color, task: { ...t!.task } })} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, cursor: 'pointer' }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: t!.color, display: 'block', flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t!.task.t || 'Tarea'}</span>
                          <button onClick={e => { e.stopPropagation(); startTask({ epicaId: t!.epicaId, task: t!.task }, durByDiff(t!.task)) }} style={{ border: '1px solid #e6cfa4', background: '#f7ece2', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer', flexShrink: 0 }}>▶ Empezar</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {next && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#6b645b', borderTop: '1px solid #ece3d5', paddingTop: 13 }}>
                      <span style={{ color: '#a49b90' }}>Lo siguiente:</span>
                      <b style={{ fontWeight: 600, color: '#1c1a17' }}>{next.name}</b>
                      <span style={{ color: '#a49b90' }}>{next.kind === 'junta' && next.at != null ? `· ${clock(next.at)} · en ${hm(next.at - now)}` : next.kind === 'rutina' ? `· ${next.when}` : ''}</span>
                    </div>
                  )}
                </div>
              )
            })()}
              {/* Tarjeta A — Tiempo útil */}
              <div style={card(26)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={LBL}>tiempo útil restante hoy</span>
                  <span className="t-hero" style={{ fontFamily: SERIF, fontSize: 84, lineHeight: .88, letterSpacing: '-.02em' }}>{V.freeLabel}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.55, color: '#6b645b', maxWidth: 380 }}>{V.freeExplain}</span>
                  {V.committed > 0 && <span style={{ fontSize: 13.5, color: '#8a4b28', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f7ece2', border: '1px solid #ecd9cb', borderRadius: 999, padding: '5px 12px', alignSelf: 'flex-start' }}>De eso ya agendaste <b style={{ fontWeight: 600 }}>{V.committedLabel}</b> → quedan <b style={{ fontWeight: 600 }}>{V.freeUncommittedLabel}</b> sin comprometer.</span>}
                  {isTodayView && meetInfo.count > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(46,90,158,0.05)', border: '1px solid rgba(46,90,158,0.18)', borderRadius: 14, padding: '10px 13px' }}>
                      <span style={{ fontSize: 13, color: '#2E5A9E', fontWeight: 600 }}>🗓 {meetInfo.count} {meetInfo.count === 1 ? 'junta hoy' : 'juntas hoy'} · {hm(meetInfo.totalMin)} ocupadas</span>
                      {meetInfo.next && <span style={{ fontSize: 13.5, color: '#1c1a17' }}>Próxima: <b style={{ fontWeight: 600 }}>{meetInfo.next.name}</b> · {clock(meetInfo.next.start)} {meetInfo.next.start <= now ? '· en curso' : `· en ${hm(meetInfo.next.start - now)}`}</span>}
                      {meetInfo.conflicts.map((c, i) => <span key={i} style={{ fontSize: 12.5, color: '#8a3c2a' }}>⚠ <b style={{ fontWeight: 600 }}>{c.meet}</b> se encima con {c.block}.</span>)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span style={LBL}>tu energía por hora</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {V.energyLearnAvail && (
                        <div style={{ display: 'flex', gap: 2, background: '#e7dfd2', padding: 2, borderRadius: 999 }}>
                          {([['learned', 'Aprendida'], ['typical', 'Típica']] as const).map(([k, lbl]) => { const on = (k === 'learned') === energyLearned; return (
                            <button key={k} onClick={() => setEnergyLearned(k === 'learned')} style={{ border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: on ? '#faf7f1' : 'transparent', color: on ? '#1c1a17' : '#8b8379' }}>{lbl}</button>
                          ) })}
                        </div>
                      )}
                      <span style={{ fontSize: 12, color: '#8a4b28', fontWeight: 600 }}>ahora ~{V.energyNow}%</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 54 }}>
                    {V.energy.map((e, i) => <div key={i} title={e.title} style={{ flex: 1, height: `${e.h}%`, background: e.bg, borderRadius: '4px 4px 2px 2px', minHeight: 4, outline: e.cur ? '2px solid #b4653a' : 'none', outlineOffset: 1 }} />)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, height: 8 }}>
                    {V.energy.map((e, i) => <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>{e.worked && <span style={{ width: 5, height: 5, borderRadius: 999, background: '#6f8256', display: 'block' }} />}</div>)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, fontSize: 9.5, color: '#a49b90', fontVariantNumeric: 'tabular-nums' }}>
                    {V.energy.map((_, i) => <span key={i} className={(7 + i) % 3 === 1 ? undefined : 'nrg-lbl-min'} style={{ flex: 1, textAlign: 'center' }}>{String(7 + i).padStart(2, '0')}</span>)}
                  </div>
                  <span style={{ fontSize: 13, color: '#8b8379', lineHeight: 1.5 }}>{V.energyNote} <span style={{ color: '#6f8256' }}>● marca las horas en que trabajaste hoy</span></span>
                  <span style={{ fontSize: 12, color: '#a49b90', lineHeight: 1.45 }}>{V.energyLearnedActive
                    ? <><b style={{ fontWeight: 600 }}>Aprendida de tus horas</b>: pondera cuándo sueles trabajar de verdad (área Trabajo del historial), mezclado con una curva típica; cuanto más historial, más se ajusta a ti.</>
                    : <>Es una <b style={{ fontWeight: 600 }}>curva típica</b> del día (mañana alta, bajón post-comida, segunda ventana en la tarde), igual para todos.{V.energyLearnAvail ? ' Cambia a “Aprendida” para usar tus horas reales.' : ' Aprenderá de ti cuando acumules historial de trabajo.'}</>}</span>
                </div>
                <div style={{ borderTop: '1px solid #eee6da', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Row label="Ventana continua sin interrupciones" value={V.windowLabel} />
                  <Row label="Hora de dormir" value={V.bedLabel} />
                  <Row label={`Planeado ${dayLabel} · estimado`} value={plannedDay.min ? '~' + hm(plannedDay.min) : '—'} />
                  <Row label={`Trabajo registrado ${dayLabel}`} value={dayWorkedMin ? hm(dayWorkedMin) : '—'} />
                  {plannedDay.min > 0 && (() => {
                    const pct = Math.min(100, Math.round((dayWorkedMin / plannedDay.min) * 100)); const over = dayWorkedMin > plannedDay.min
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ height: 6, background: '#eee6da', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: over ? '#8a4b28' : '#6f8256', borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 12.5, color: '#8b8379' }}>{over ? `Llevas ${hm(dayWorkedMin)} · te pasaste ${hm(dayWorkedMin - plannedDay.min)} de lo planeado` : `Llevas ${hm(dayWorkedMin)} de ~${hm(plannedDay.min)} planeadas · ${pct}%`}</span>
                      </div>
                    )
                  })()}
                </div>
                {V.routineNext.length > 0 && (
                  <div style={{ borderTop: '1px solid #eee6da', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={LBL}>cuánto falta para tu rutina</span>
                    {V.routineNext.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, opacity: r.past ? 0.5 : 1 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: r.dot, display: 'block', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                        <span style={{ color: '#a49b90', flexShrink: 0 }}>{r.dur}</span>
                        <span style={{ color: '#a49b90', fontVariantNumeric: 'tabular-nums', width: 46, textAlign: 'right', flexShrink: 0 }}>{r.at}</span>
                        <span style={{ fontWeight: 600, color: r.when === 'en curso' ? '#8a4b28' : '#6b645b', width: 82, textAlign: 'right', flexShrink: 0 }}>{r.when}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(dayLog.length > 0 || epicDoneToday.length > 0 || daySubtasksDone.length > 0) && (
                  <div style={{ borderTop: '1px solid #eee6da', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={LBL}>lo que hiciste {dayLabel}</span>
                    {daySubtasksDone.map(st => (
                      <div key={'st' + st.key} className="t-dayrow" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                        <span style={{ color: '#2E6E6E', flexShrink: 0, fontSize: 13 }}>✓</span>
                        <span className="t-dayrow-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.sub} <span style={{ color: '#a49b90', fontSize: 12 }}>· subtarea de {st.taskName}</span></span>
                        <span style={{ color: '#a49b90', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{clock(st.at)}</span>
                        <span style={{ fontWeight: 600, color: '#2E6E6E', width: 62, textAlign: 'right', fontSize: 12.5, flexShrink: 0 }}>subtarea ✓</span>
                      </div>
                    ))}
                    {[...dayLog].reverse().map(l => (
                      <div key={l.idx} onClick={() => setHistIdx(l.idx)} title="Editar registro" className="t-dayrow" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: l.dot, display: 'block', flexShrink: 0 }} />
                        <span className="t-dayrow-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                        <span style={{ color: '#a49b90', flexShrink: 0 }}>{l.dur}</span>
                        {l.taskId && <button onClick={e => { e.stopPropagation(); viewLog(data.history[l.idx], l.idx) }} title="Ver la tarea completa" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, color: '#6b645b', cursor: 'pointer', flexShrink: 0 }}>Ver</button>}
                        {l.taskId && isTodayView && (visibleTaskIds.has(l.taskId)
                          ? (data.backToTasks || []).includes(`${today}·${l.taskId}`) && <button onClick={e => { e.stopPropagation(); removeBackToTasks(l.taskId!) }} title="Quitarla de tus tareas del día" style={{ border: '1px solid #e6cfa4', background: '#f7ece2', borderRadius: 999, padding: '3px 9px', fontSize: 11.5, color: '#8a4b28', cursor: 'pointer', flexShrink: 0 }}>✕tarea</button>
                          : <button onClick={e => { e.stopPropagation(); sendBackToTasks(l.taskId!) }} title="Devolverla a tus tareas del día" style={{ border: '1px solid #cfe0c4', background: '#eef1e7', borderRadius: 999, padding: '3px 9px', fontSize: 11.5, color: '#4f6238', cursor: 'pointer', flexShrink: 0 }}>↩</button>)}
                        <button onClick={e => { e.stopPropagation(); resumeActivity(data.history[l.idx]) }} title="Volver a trabajar en esto ahora (se acumula)" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '3px 9px', fontSize: 11.5, color: '#8a4b28', cursor: 'pointer', flexShrink: 0 }}>↻</button>
                        <span style={{ fontWeight: 600, color: l.done ? '#4f6238' : '#8a4b28', width: 62, textAlign: 'right', fontSize: 12.5, flexShrink: 0 }}>{l.done ? 'hecho ✓' : 'trabajado'}</span>
                      </div>
                    ))}
                    {epicDoneToday.map(t => (
                      <div key={'epc' + t.task.id} className="t-dayrow" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, display: 'block', flexShrink: 0 }} />
                        <span className="t-dayrow-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task.t || 'Tarea'}</span>
                        <span style={{ fontSize: 11, color: '#c2b9ab', flexShrink: 0 }}>en Épicas</span>
                        <button onClick={() => setEditTask({ epicaId: t.epicaId, epicaName: t.epicaName, color: t.color, task: { ...t.task } })} title="Ver la tarea completa" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, color: '#6b645b', cursor: 'pointer', flexShrink: 0 }}>Ver</button>
                        <span style={{ fontWeight: 600, color: '#4f6238', width: 62, textAlign: 'right', fontSize: 12.5, flexShrink: 0 }}>hecho ✓</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Resumen: planeado vs real + cómo está planeado el día */}
              {(() => {
                const pf = (data.scheduled || []).filter(s => (s.date || today) === taskDay).slice().sort((a, b) => a.start - b.start)
                const sched = pf.reduce((a, s) => a + s.dur, 0)
                const est = plannedDay.min, real = dayWorkedMin
                const base = est || sched                 // barra planeado→real
                const pct = base ? Math.min(100, Math.round((real / base) * 100)) : 0
                const over = base > 0 && real > base
                return (
                  <div className="t-card" style={{ ...card(14), padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span style={LBL}>planeado vs real · {dayLabel}</span>
                      <button onClick={() => { setPlanDay(taskDay); setView('plan') }} style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer' }}>Abrir Planificador →</button>
                    </div>
                    {/* Números grandes: planeado (estimado de tus tareas) y trabajado */}
                    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1 }}>{est ? '~' + hm(est) : '—'}</span>
                        <span style={{ fontSize: 12.5, color: '#a49b90' }}>planeadas · {plannedDay.count} {plannedDay.count === 1 ? 'tarea' : 'tareas'}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1, color: '#6f8256' }}>{real ? hm(real) : '0m'}</span>
                        <span style={{ fontSize: 12.5, color: '#a49b90' }}>trabajadas (real)</span>
                      </div>
                      {sched > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1, color: '#c2933a' }}>{hm(sched)}</span>
                          <span style={{ fontSize: 12.5, color: '#a49b90' }}>agendadas</span>
                        </div>
                      )}
                    </div>
                    {base > 0 && (<>
                      <div style={{ height: 8, background: '#eee6da', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: over ? '#8a4b28' : '#6f8256', borderRadius: 999 }} />
                      </div>
                      <span style={{ fontSize: 13, color: '#6b645b' }}>{over ? `Te pasaste ${hm(real - base)} de lo planeado.` : `Llevas ${hm(real)} de ~${hm(base)} planeadas · ${pct}%.`}</span>
                    </>)}
                    {/* Agenda del Planificador (si la hay) */}
                    {pf.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, borderTop: '1px solid #eee6da', paddingTop: 12 }}>
                        <span style={{ fontSize: 12.5, color: '#a49b90', marginBottom: 4 }}>agenda del día · de {clock(pf[0].start)} a {clock(pf[pf.length - 1].start + pf[pf.length - 1].dur)}</span>
                        {pf.map(s => (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f2ece0' }}>
                            <span style={{ fontSize: 12.5, color: '#8b8379', width: 92, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{clock(s.start)}–{clock(s.start + s.dur)}</span>
                            <span style={{ width: 7, height: 7, borderRadius: 999, background: AREAS[s.area]?.color || '#c2933a', flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: '#4c4741', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            <span style={{ fontSize: 12.5, color: '#a49b90', flexShrink: 0 }}>{hm(s.dur)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 13, color: '#a49b90', lineHeight: 1.5 }}>{est > 0 ? `Tienes ${plannedDay.count} ${plannedDay.count === 1 ? 'tarea planeada' : 'tareas planeadas'} (~${hm(est)}). Ábrelas en el Planificador para acomodarlas por hora.` : `Aún no planeas ${dayLabel}. Planea tareas en Épicas o agrégalas en el Planificador.`}</span>
                    )}
                  </div>
                )
              })()}
            </section>)}
            {hoyPanel === 'resumen' ? (
              <div className="hoy-rail">
                <button onClick={() => setHoyPanel('tareas')} title="Ver tareas y agenda en grande" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a4b28', cursor: 'pointer', flexShrink: 0 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg></button>
                <span className="hoy-rail-txt" onClick={() => setHoyPanel('tareas')} style={{ cursor: 'pointer' }}>Tareas y agenda</span>
                <button onClick={() => setHoyPanel('both')} title="Ver ambos paneles" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b645b', cursor: 'pointer', flexShrink: 0 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="7" height="16" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /></svg></button>
              </div>
            ) : (<section className="hoy-panel" style={{ flex: hoyPanel === 'tareas' ? 1 : 1.15 }}>
              <div className="hoy-panel-head">
                <span style={{ fontFamily: SERIF, fontSize: 20, color: '#1c1a17', flex: 1 }}>Tareas y agenda</span>
                {hoyPanel === 'tareas'
                  ? <button onClick={() => setHoyPanel('both')} title="Ver ambos paneles" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, padding: '5px 12px', fontSize: 12.5, color: '#6b645b', cursor: 'pointer' }}>⤢ ver ambos</button>
                  : <>
                    <button onClick={() => setHoyPanel('tareas')} title="Maximizar tareas y agenda" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, width: 30, height: 30, fontSize: 14, color: '#6b645b', cursor: 'pointer', lineHeight: 1 }}>⤢</button>
                    <button onClick={() => setHoyPanel('resumen')} title="Minimizar tareas (ver solo resumen)" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 8, width: 30, height: 30, fontSize: 18, color: '#6b645b', cursor: 'pointer', lineHeight: 1 }}>–</button>
                  </>}
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
                    <QuickStart onStart={startGeneral} />
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
                    {weekRoutines.list.length > 0 && (
                      <Collapsible title="rutinas diarias" count={`${weekRoutines.list.reduce((s, r) => s + r.done, 0)}/${weekRoutines.list.length * 7}`} defaultOpen={true}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {weekRoutines.list.map(r => { const nc = r.done >= 5 ? '#4f6238' : r.done > 0 ? '#8a4b28' : '#a49b90'; return (
                            <div key={r.epicaId + r.rIdx} style={{ border: '1px solid #eee6da', borderRadius: 14, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 9, background: '#fff' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 999, background: r.color, display: 'block', flexShrink: 0 }} />
                                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1c1a17' }}>{r.name}</span>
                                <span style={{ fontSize: 12.5, color: '#a49b90', flexShrink: 0 }}>{r.epicaName}</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: nc, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{r.done}/7</span>
                              </div>
                              <div style={{ display: 'flex', gap: 5 }}>
                                {weekRoutines.dates.map((d, di) => { const on = r.week[di]; const isToday = d === today; return (
                                  <button key={di} onClick={() => toggleRoutineDay(r.epicaId, r.rIdx, weekRoutines.monday, di)} title={`${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][di]} ${Number(d.slice(8))}${on ? ' · hecha' : ''}`} style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 9, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, border: isToday ? '1.5px solid #c2933a' : '1px solid transparent', background: on ? r.color : '#f2ece0', color: on ? '#fff' : '#a49b90' }}>
                                    <span style={{ fontSize: 11, fontWeight: 700 }}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'][di]}</span>
                                    <span style={{ fontSize: 11, opacity: .85, fontVariantNumeric: 'tabular-nums' }}>{Number(d.slice(8))}</span>
                                  </button>
                                ) })}
                              </div>
                              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                                {(() => { const doneToday = r.week[dayIdxMon(taskDay)]; return (
                                  <button onClick={() => toggleRoutineDay(r.epicaId, r.rIdx, weekRoutines.monday, dayIdxMon(taskDay))} title={doneToday ? 'Marcada hecha hoy · clic para deshacer' : 'Marcar hecha hoy'} style={{ border: 'none', background: doneToday ? '#6f8256' : '#1c1a17', color: '#faf7f1', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{doneToday ? '✓ Hecha hoy' : '✓ Terminada'}</button>
                                ) })()}
                                <button onClick={() => startRoutine(r.name, r.epicaId, r.rIdx)} title="Empezar ahora (al terminar se marca hecha hoy)" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer' }}>▶ Empezar</button>
                                <button onClick={() => scheduleRoutineAt(r.name)} title="Agendar a una hora del día" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer' }}>⏰ Agendar</button>
                              </div>
                            </div>
                          ) })}
                        </div>
                      </Collapsible>
                    )}
                    <FilterBar epicas={todayEpicas} filters={filters} setFilters={setFilters} sortBy={sortBy} setSortBy={setSortBy} />
                    {(() => {
                      const dayMeetings = meetings.filter(m => m.date === taskDay).sort((a, b) => a.start - b.start)
                      if (!isTodayView && dayMeetings.length === 0) return null
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #eee6da', paddingTop: 10 }}>
                          <span style={{ ...LBL, letterSpacing: '.1em' }}>reuniones {isTodayView ? 'de hoy' : `· ${longDayOf(taskDay)}`} · de tu calendario 🗓</span>
                          {dayMeetings.length === 0 && <span style={{ fontSize: 13, color: '#a49b90', padding: '2px 0' }}>No hay juntas en tu calendario para {dayLabel}.</span>}
                          {dayMeetings.map(m => (
                            <div key={m.id} onClick={() => setMeetView(m)} title="Ver detalle de la junta" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 12, cursor: 'pointer', background: 'rgba(46,90,158,0.06)', border: '1px solid rgba(46,90,158,0.18)' }}>
                              <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: '#2E5A9E', fontWeight: 700, border: '1px solid rgba(46,90,158,0.3)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>🗓 junta</span>
                              <span style={{ fontSize: 13, color: '#6b6f7a', width: 96, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{clock(m.start)}–{clock(m.start + m.dur)}</span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: '#1c1a17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                              <span style={{ fontSize: 13, color: '#a49b90', flexShrink: 0 }}>{hm(m.dur)}</span>
                              {isTodayView && <button onClick={e => { e.stopPropagation(); if (beginSession({ name: m.name, area: 'personas', start: Math.round(now), dur: m.dur })) setView('hoy') }} title="Empezar ahora con su duración" style={{ border: '1px solid rgba(46,90,158,0.3)', background: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, color: '#2E5A9E', cursor: 'pointer', flexShrink: 0 }}>▶</button>}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                    {V.nextGapLabel && <div style={{ fontSize: 12.5, color: '#6f8256', display: 'flex', alignItems: 'center', gap: 6 }}>🕓 Próximo hueco libre: <b style={{ fontWeight: 600 }}>{V.nextGapLabel}</b>. Arrastra una tarea a la cinta de abajo o usa ⏰ para agendarla.</div>}
                    <TaskPicker tasks={filteredTasks} rank={manualRank} stale={staleByTask} selId={selTaskId} draggable={sortBy === 'manual'} mitIds={mitIds} onToggleMit={t => toggleMit(t.task.id!)} onReorder={reorderTasks} onQuick={t => startTask({ epicaId: t.epicaId, task: t.task }, 0)} onSchedule={t => scheduleTaskAt(t.task.id!)} onRemove={removeFromDayList} onPick={t => { setSelTaskId(t.task.id!); setSelMeetingId(null); setDur(durByDiff(t.task)); setCostOpen(true) }} onEdit={t => setEditTask({ epicaId: t.epicaId, epicaName: t.epicaName, color: t.color, task: { ...t.task } })} />
                    <div onClick={() => { const e = epicasList.find(x => x.id === filters.epica) || epicasList[0]; setEditTask({ creating: true, epicaId: e?.id || '', epicaName: e?.name || '', color: e?.color || '#b4653a', task: { id: uid(), t: '', status: 'Por hacer', due: '', note: '', plan: taskDay, links: [] } }) }} style={{ alignSelf: 'flex-start', border: '1px dashed #ccc2b2', borderRadius: 999, padding: '10px 18px', fontSize: 14, color: '#6b645b', cursor: 'pointer' }}>+ Nueva tarea{filters.epica ? ` en ${todayEpicas.find(e => e.id === filters.epica)?.name || ''}` : ''}</div>
                  </>}
                  {act === 'Reuniones' && <MeetingsList meetings={meetings.filter(m => m.date === taskDay)} selId={selMeetingId} onPick={m => { setSelMeetingId(m.id); setSelTaskId(null); setDur(m.dur); setCostOpen(true) }} epicas={epicasList} onAddEpica={meetingToEpica} />}
                  {(act === 'Trámites' || act === 'Aprendizaje') && <div onClick={() => { setSelTaskId(null); setSelMeetingId(null); setCostOpen(true) }} style={{ alignSelf: 'flex-start', background: '#1c1a17', color: '#faf7f1', borderRadius: 999, padding: '10px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Ver costo y empezar {act} →</div>}
                  {act === 'Trabajo profundo' && <div onClick={() => { setSelTaskId(null); setSelMeetingId(null); setCostOpen(true) }} style={{ alignSelf: 'flex-start', fontSize: 13, color: '#8a4b28', cursor: 'pointer', borderBottom: '1px solid #ddd4c6' }}>o empezar un bloque de foco sin tarea →</div>}

                  {/* Desplegable "ya trabajadas hoy" — cerrado por defecto, bajo las tareas del día */}
                  {act === 'Trabajo profundo' && (dayLog.length + epicDoneToday.length + daySubtasksDone.length) > 0 && (() => {
                    const wc = dayLog.length + epicDoneToday.length + daySubtasksDone.length
                    const fn = dayLog.filter(l => isTodayView && l.startMin > now && !l.done).length
                    return (
                      <div style={{ borderTop: '1px solid #eee6da', paddingTop: 12, marginTop: 2 }}>
                        <button onClick={() => setWorkedOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }}>
                          <span style={{ display: 'inline-block', transform: workedOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: '#a49b90', fontSize: 12 }}>▸</span>
                          <span style={{ ...LBL }}>ya trabajadas{isTodayView ? ' hoy' : ''}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#8a4b28', background: '#f5ece2', borderRadius: 999, padding: '2px 9px' }}>{wc}</span>
                          {fn > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#8a3c2a', background: '#f6e3dd', border: '1px solid #e8cabf', borderRadius: 999, padding: '2px 8px' }}>⚠ {fn} con hora futura</span>}
                          <span style={{ flex: 1 }} />
                          <span style={{ fontSize: 12.5, color: '#a49b90' }}>{workedOpen ? 'ocultar' : 'ver'}</span>
                        </button>
                        {workedOpen && (
                          <div style={{ marginTop: 8 }}>
                            <WorkedTable rows={diaRows} compact />
                          </div>
                        )}
                      </div>
                    )
                  })()}
              </div>
            </section>)}
           </div>

            {/* Tarjeta C — el resto del día (siempre visible, fuera de los paneles) */}
            <div className="t-card" style={card(22)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
                <span style={LBL}>el día{!isTodayView ? ` · ${longDayOf(taskDay)}` : ''}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {!isTodayView && <button onClick={() => setTaskDay(today)} style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer' }}>Hoy</button>}
                  <span style={{ fontSize: 13, color: '#a49b90' }}>de {isTodayView ? V.barStartLabel : WEEK.winStartLabel} a {isTodayView ? V.scaleEndLabel : WEEK.winEndLabel}</span>
                  <button onClick={addWorkedActivity} title="Registrar una actividad ya hecha (se abre para editar hora, duración y demás)" style={{ border: '1px solid #d9b48a', background: '#f7ece2', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer', fontWeight: 500 }}>+ Nueva actividad</button>
                  {isTodayView && <button onClick={() => addActivityAt(nextChainStart())} title="Agendar algo a una hora futura" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer' }}>+ Agendar</button>}
                </div>
              </div>
              {isTodayView ? (<>
                <div style={{ position: 'relative', paddingTop: 20 }}>
                  <div onDoubleClick={e => { const r = e.currentTarget.getBoundingClientRect(); const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); addActivityAt(Math.round((V.barStart + frac * (V.scaleEnd - V.barStart)) / 15) * 15) }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/taskid'); if (!id) return; const r = e.currentTarget.getBoundingClientRect(); const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); setSchedulePreset(id); setScheduleAt(Math.min(1425, Math.round((V.barStart + frac * (V.scaleEnd - V.barStart)) / 15) * 15)) }} title="Doble clic para agendar aquí · o arrastra una tarea a este punto" style={{ display: 'flex', height: 56, gap: 2, alignItems: 'stretch' }}>
                    {V.segs.map((s, i) => {
                      const past = s.e <= now && s.kind !== 'done' && s.kind !== 'sim'
                      const showLabel = s.w > 6.5 && s.kind !== 'free'
                      return (
                        <div key={i} onClick={() => setBarPick(s.label)} title={s.label} style={{ width: `${s.w}%`, background: s.bg, borderRadius: 6, minWidth: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', overflow: 'hidden', opacity: past ? 0.55 : 1, outline: s.kind === 'sched' ? '1.5px dashed rgba(255,255,255,.55)' : 'none', outlineOffset: -3 }}>
                          {showLabel && <span style={{ fontSize: 11, fontWeight: 600, color: textOn(s.bg), padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }}>{s.name}{s.w > 13 ? ` · ${hm(s.e - s.s)}` : ''}</span>}
                        </div>
                      )
                    })}
                  </div>
                  {(() => { const nl = Math.max(0, Math.min(100, ((now - V.barStart) / Math.max(1, V.scaleEnd - V.barStart)) * 100)); return (<>
                    <div style={{ position: 'absolute', top: 20, bottom: 0, left: `${nl}%`, width: 2, background: '#1c1a17', borderRadius: 2, pointerEvents: 'none', boxShadow: '0 0 0 1.5px rgba(242,236,226,.75)' }} />
                    <div style={{ position: 'absolute', top: 0, left: `${nl}%`, transform: `translateX(${nl > 90 ? '-100%' : nl < 6 ? '0' : '-50%'})`, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: '#faf7f1', background: '#1c1a17', padding: '2px 8px', borderRadius: 999, pointerEvents: 'none', whiteSpace: 'nowrap' }}>ahora {V.nowLabel}</div>
                  </>) })()}
                </div>
                <div style={{ position: 'relative', height: 14, marginTop: 8 }}>
                  {V.barTicks.map((tk, i) => <span key={i} style={{ position: 'absolute', left: `${tk.left}%`, transform: 'translateX(-50%)', fontSize: 10.5, color: '#a49b90', fontVariantNumeric: 'tabular-nums' }}>{tk.label}</span>)}
                </div>
                <div style={{ fontSize: 13.5, color: barPick ? '#4c4741' : '#a49b90', minHeight: 20 }}>{barPick || 'La línea marca “ahora”. Toca un bloque para ver el detalle · doble clic para agendar algo en ese punto.'}</div>
              </>) : (<>
                <div style={{ display: 'flex', height: 56, gap: 2, borderRadius: 7, overflow: 'hidden', background: '#efe7d9' }}>
                  {(WEEK.days.find(d => d.date === taskDay)?.segs || []).map((s, i) => <div key={i} onClick={() => setBarPick(s.label)} title={s.label} style={{ width: `${s.w}%`, background: s.bg, opacity: s.faded ? 0.4 : 1, cursor: 'pointer' }} />)}
                </div>
                <div style={{ fontSize: 13.5, color: barPick ? '#4c4741' : '#a49b90', minHeight: 20 }}>{barPick || `Lo que hiciste el ${longDayOf(taskDay)}: en sólido lo real, tenue tu rutina planeada.`}</div>
              </>)}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: '#6b645b' }}>
                <Legend c="#8b8379">lo que ya hiciste</Legend>
                <Legend c="#b4653a">el bloque que estás evaluando</Legend>
                <Legend c="#c2933a">agendado por ti</Legend>
                <Legend c="#8a3c2a">protegido que invadirías</Legend>
                <Legend c="#6f8256">protegido intacto</Legend>
                <Legend c="#eee6da">libre</Legend>
              </div>
              {diaFullRows.length > 0 && <WorkedTable rows={diaFullRows} defaultDir={1} />}
            </div>
          </div>
        ) : view === 'semana' ? (
          /* ── SEMANA ───────────────────────────────────────────────── */
          <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="t-card" style={card(22)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.1 }}>Tu semana</span>
                  <span style={{ fontSize: 14, color: '#6b645b', lineHeight: 1.55, maxWidth: 580 }}>Cada línea es un día de {WEEK.winStartLabel} a {WEEK.winEndLabel}: en color lo que proteges, en claro lo que te queda libre. Toca un día para planearlo en Hoy.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => setTaskDay(addDaysISO(taskDay, -7))} title="Semana anterior" style={{ width: 36, height: 36, border: '1px solid #e2d9cb', background: 'transparent', borderRadius: 10, color: '#a49b90', cursor: 'pointer', fontSize: 16 }}>‹</button>
                  <button onClick={() => setTaskDay(today)} style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '8px 14px', fontSize: 13, color: '#8a4b28', cursor: 'pointer' }}>Esta semana</button>
                  <button onClick={() => setTaskDay(addDaysISO(taskDay, 7))} title="Semana siguiente" style={{ width: 36, height: 36, border: '1px solid #e2d9cb', background: 'transparent', borderRadius: 10, color: '#a49b90', cursor: 'pointer', fontSize: 16 }}>›</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {WEEK.days.map(d => (
                  <div key={d.date} onClick={() => { setTaskDay(d.date); setView('hoy') }} title="Planear este día" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 16, cursor: 'pointer', background: d.isToday ? '#f5ece2' : '#f5efe4', border: `1px solid ${d.isToday ? '#e6cfa4' : '#ebe3d6'}` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: '#a49b90', textTransform: 'uppercase' }}>{d.letter}</span>
                      <span style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1, color: d.isToday ? '#8a4b28' : '#1c1a17' }}>{d.num}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', height: 24, gap: 1.5, borderRadius: 7, overflow: 'hidden', background: '#efe7d9' }}>
                      {d.segs.map((s, i) => <div key={i} title={s.label} style={{ width: `${s.w}%`, background: s.bg, opacity: s.faded ? 0.4 : 1 }} />)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, width: 118, flexShrink: 0 }}>
                      {d.doneMin > 0 && <span style={{ fontSize: 12.5, fontWeight: 600, color: '#8a4b28' }}>{d.doneLabel} hecho</span>}
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#4f6238' }}>{d.freeLabel} libre</span>
                      <span style={{ fontSize: 12, color: '#a49b90' }}>{d.nTasks} {d.nTasks === 1 ? 'tarea' : 'tareas'}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: '#6b645b' }}>
                <Legend c="#b4653a">lo que hiciste (sólido)</Legend>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#6f8256', opacity: 0.4, display: 'block' }} />tu rutina planeada (tenue)</span>
                <Legend c="#c2933a">agendado (hoy)</Legend>
                <Legend c="#eee6da">libre</Legend>
              </div>
              <span style={{ fontSize: 12.5, color: '#a49b90', lineHeight: 1.55 }}>En <b>sólido</b> ves lo que realmente hiciste cada día (tu registro); en <b>tenue</b>, la rutina que tienes planeada según “Mi rutina”. Reuniones y agendado sólo aparecen en hoy.</span>
            </div>

            {/* Insights de la semana — patrones a partir de tu historial real */}
            <div className="t-card" style={card(22)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1.1 }}>Cómo va tu semana</span>
                <span style={{ fontSize: 13.5, color: '#8b8379' }}>Todo sale de lo que registraste; los días sin registro no cuentan.</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
                {[
                  { lbl: 'Trabajo profundo / día', val: insights.avgWork ? hm(insights.avgWork) : '—', sub: insights.workedDays ? `en ${insights.workedDays} ${insights.workedDays === 1 ? 'día' : 'días'} activos` : 'sin registro aún', c: '#8a4b28' },
                  { lbl: 'Tu mejor día', val: insights.bestDay ? insights.bestDay.label : '—', sub: insights.bestDay ? insights.bestDay.name : 'sin datos', c: '#b4653a' },
                  { lbl: 'Sueño promedio', val: insights.avgSleep ? hm(insights.avgSleep) : '—', sub: insights.avgSleep >= data.sleep ? 'llegas a tu meta' : insights.avgSleep ? `meta ${hm(data.sleep)}` : 'sin registro', c: '#1c1a17' },
                  { lbl: 'Tareas terminadas', val: String(insights.doneCount), sub: 'esta semana', c: '#4f6238' },
                ].map((k, i) => (
                  <div key={i} style={{ background: '#f7f2e8', border: '1px solid #ece3d5', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 11, color: '#a49b90', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.lbl}</span>
                    <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, color: k.c }}>{k.val}</span>
                    <span style={{ fontSize: 12, color: '#8b8379' }}>{k.sub}</span>
                  </div>
                ))}
              </div>
              {insights.areaRank.length > 0 && insights.totalNonSleep > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #eee6da', paddingTop: 16 }}>
                  <span style={LBL}>en qué se te fue el tiempo · {hm(insights.totalNonSleep)} registrados</span>
                  <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: '#efe7d9' }}>
                    {insights.areaRank.map(a => <div key={a.area} title={`${a.label} · ${hm(a.min)} · ${a.pct}%`} style={{ width: `${a.pct}%`, background: a.color }} />)}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {insights.areaRank.map(a => (
                      <span key={a.area} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#6b645b' }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: a.color, display: 'block' }} />{a.label} · <b style={{ fontWeight: 600 }}>{a.pct}%</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {insights.streak > 0 && <span style={{ fontSize: 13.5, color: '#8a4b28', background: '#f7ece2', border: '1px solid #ecd9cb', borderRadius: 12, padding: '10px 14px' }}>🔥 Llevas una racha de <b style={{ fontWeight: 700 }}>{insights.streak} {insights.streak === 1 ? 'día' : 'días'}</b> seguidos con trabajo registrado. {insights.streak >= 3 ? 'No la rompas.' : 'Vas empezando — sostenla.'}</span>}
            </div>

            {/* Ritmo: curva de desempeño por día (seleccionable) + detalle del día elegido */}
            <div className="t-card" style={{ ...card(22), gap: 20 }}>
              <WeekPerfChart weekly={ritmo.weekly} maxWork={ritmo.maxWork} goal={ritmo.goal} onPickDay={setTaskDay} />
              <DayDetail d={ritmo.detail} dayLabel={dayLabel} />
            </div>

            <PeriodSummary history={data.history} />
          </div>
        ) : view === 'rutina' ? (
          /* ── MI RUTINA ────────────────────────────────────────────── */
          <div style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="t-card" style={card(24)}>
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
                      <div onClick={() => deleteBlock(b.id)} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, color: '#a49b90', cursor: 'pointer', fontSize: 18 }}>×</div>
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
              <div style={{ borderTop: '1px solid #eee6da', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
                <span style={{ ...LBL, letterSpacing: '.1em' }}>meta de trabajo profundo · {(data.focusGoal ?? 0) > 0 ? hm(data.focusGoal!) + ' al día' : 'sin meta'}</span>
                <input type="range" min={0} max={480} step={15} value={data.focusGoal ?? 0} onChange={e => save({ focusGoal: Number(e.target.value) })} style={{ width: '100%', height: 26, accentColor: '#8a4b28' }} />
                <span style={{ fontSize: 12.5, color: '#a49b90', lineHeight: 1.5 }}>Cuánto trabajo (área Trabajo) quieres registrar cada día. El Brief de Hoy te muestra el avance. Ponlo en 0 para no fijar meta.</span>
              </div>
              <div onClick={() => { if (window.confirm('¿Restaurar la rutina de ejemplo? Se reemplazan tus bloques y el historial.')) save(defaults()) }} style={{ alignSelf: 'flex-start', fontSize: 13, color: '#a49b90', cursor: 'pointer', borderBottom: '1px solid #ddd4c6' }}>Restaurar la rutina de ejemplo</div>
            </div>
          </div>
        ) : (
          /* ── HISTORIAL (analítica por periodo) ─────────────────────── */
          <HistorialView history={data.history} meta={histMeta} onLogSleep={logSleep} onOpenTask={(tid) => { const tt = (allTasks || []).find(x => x.task.id === tid); if (tt) setEditTask({ epicaId: tt.epicaId, epicaName: tt.epicaName, color: tt.color, task: { ...tt.task } }) }} />
        )}
      </div>

      {editTask && <TaskDetail info={editTask} epicas={epicasList} resumenReady={resumenReady} remindReady={remindReady} comentariosReady={comentariosReady} nextPlanOrder={nextPlanOrderFor} onAutoSave={autoSaveTask} onUnplan={unplanTask} onCreate={createTask} onStart={startTask} onLinkObjetivo={linkObjetivo} onClose={() => setEditTask(null)} />}
      {histIdx !== null && data.history[histIdx] && <HistoryEditor row={data.history[histIdx]} idx={histIdx} onSave={saveHist} onDelete={delHist} onReopen={reopenTask} onSyncDone={syncHistDone} onResume={resumeActivity} onClose={() => setHistIdx(null)} />}

      {/* Popup: el costo de empezar ahora */}
      {costOpen && !V.hasSession && (
        <div onClick={() => setCostOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 90 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="El costo de empezar ahora" style={{ width: 'min(460px,100%)', background: '#faf7f1', border: '1px solid #e7dfd2', borderRadius: 24, padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={LBL}>antes de empezar, mira el costo</span>
              <button onClick={() => setCostOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#a49b90', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {selTask && <span style={{ fontSize: 14, color: '#8a4b28', lineHeight: 1.5 }}>Vas a trabajar en <b>{selTask.task.t}</b> · {selTask.epicaName}. Al terminar se marca hecha en Épicas.</span>}
            {selMeeting && <span style={{ fontSize: 14, color: '#8a4b28', lineHeight: 1.5 }}>Vas a registrar <b>{selMeeting.name}</b> ({hm(selMeeting.dur)}).</span>}
            {!selTask && !selMeeting && <span style={{ fontSize: 14, color: '#6b645b', lineHeight: 1.5 }}>Un bloque de <b>{act}</b>. Ajusta cuánto va a durar y mira el costo.</span>}

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: SERIF, fontSize: 56, lineHeight: .9 }}>{V.durLabel}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'right' }}>
                <span style={{ ...LBL, letterSpacing: '.1em' }}>terminarías</span>
                <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{V.endLabel}</span>
              </div>
            </div>
            <input type="range" min={15} max={420} step={15} value={dur} onChange={e => setDur(Number(e.target.value))} aria-label="Duración del bloque" aria-valuetext={`${hm(dur)}, terminarías ${V.endLabel}${V.hitAny ? `, invade ${V.afectados.map(a => a.name.toLowerCase()).join(' y ')}` : ', sin costo'}`} style={{ width: '100%', height: 26, accentColor: '#b4653a' }} />

            <div style={{ borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: V.verdictBg, border: `1px solid ${V.verdictBorder}` }}>
              <span style={{ ...LBL, color: V.verdictFg }}>{V.verdictKicker}</span>
              <span style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1.2 }}>{V.verdictTitle}</span>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: '#4c4741' }}>{V.verdictText}</span>
            </div>
            {V.hitAny && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ ...LBL, letterSpacing: '.1em' }}>sacrificarías</span>
                {V.afectados.map((a, i) => <span key={i} style={{ fontSize: 13.5, color: '#8a3c2a', fontWeight: 500 }}>{a.name} {a.detail}{i < V.afectados.length - 1 ? ' ·' : ''}</span>)}
              </div>
            )}
            <span style={{ fontSize: 12.5, color: '#6f8256', lineHeight: 1.45 }}>{V.cutoff != null && V.cutoff > now
              ? <>⏳ Hora de corte: empieza a más tardar <b>{V.cutoffLabel}</b> para no tocar tu rutina.</>
              : <span style={{ color: '#8a3c2a' }}>⏳ Ya no cabe {V.durLabel} sin tocar tu rutina.</span>}</span>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
              <div onClick={() => { start(); setCostOpen(false) }} style={{ flex: 1, minWidth: 160, textAlign: 'center', background: '#1c1a17', color: '#faf7f1', borderRadius: 999, padding: 15, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Empezar {V.durLabel}</div>
              <div onClick={() => { if (V.safeMax >= 1) setDur(V.safeMax) }} title={V.altLabel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ddd4c6', borderRadius: 999, padding: '15px 20px', fontSize: 14, cursor: V.safeMax >= 1 ? 'pointer' : 'default', whiteSpace: 'nowrap', opacity: V.safeMax >= 1 ? 1 : 0.5 }}>{V.altLabel}</div>
            </div>
          </div>
        </div>
      )}

      {/* Sesión minimizada: pastilla compacta abajo-derecha (clic para reabrir el popup) */}
      {V.hasSession && sessionMin && (
        <button onClick={() => setSessionMin(false)} title="Abrir la sesión en curso" className="t-abovenav" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 80, display: 'flex', alignItems: 'center', gap: 10, background: '#1c1a17', color: '#faf7f1', border: 'none', borderRadius: 999, padding: '11px 16px 11px 14px', boxShadow: '0 14px 34px -12px rgba(0,0,0,.55)', cursor: 'pointer' }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: V.sessionPaused ? '#d98a55' : '#6f8256', display: 'block', flexShrink: 0, boxShadow: V.sessionPaused ? 'none' : '0 0 0 3px rgba(111,130,86,.25)' }} />
          <span style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1 }}>{V.sessionElapsedLabel}</span>
          <span style={{ fontSize: 13, color: '#cdc4b8', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{V.sessionName}</span>
          <span style={{ fontSize: 15, color: '#a49b90', marginLeft: 2 }}>▴</span>
        </button>
      )}

      {/* Popup flotante de la sesión en curso (siempre visible mientras corre) */}
      {V.hasSession && !sessionMin && (
        <div className="t-abovenav" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 80, width: 'min(340px, calc(100vw - 40px))', background: '#1c1a17', color: '#faf7f1', borderRadius: 22, padding: 20, boxShadow: '0 22px 55px -15px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ ...LBL, color: V.sessionPaused ? '#d98a55' : '#a49b90' }}>{V.sessionPaused ? '⏸ en pausa' : 'en curso'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: '#a49b90' }}>empezó {V.sessionStartLabel}</span>
              <button onClick={() => setSessionMin(true)} title="Minimizar (queda como pastilla)" aria-label="Minimizar la sesión" style={{ border: '1px solid #4a443c', background: 'transparent', color: '#cdc4b8', borderRadius: 999, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>–</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{V.sessionName}</span>
            <span style={{ fontFamily: SERIF, fontSize: 48, lineHeight: .9, opacity: V.sessionPaused ? 0.55 : 1 }}>{V.sessionElapsedLabel}</span>
            {(() => { const s = data.session!; const prior = priorForSession(s); if (prior <= 0) return null; const el = Math.max(0, sessionElapsed(s, now)); return <span style={{ fontSize: 12, color: '#E7C56B' }}>+{hm(prior)} de antes · {hm(prior + el)} en total en la tarea</span> })()}
            <span style={{ fontSize: 12.5, color: '#cdc4b8', lineHeight: 1.45 }}>{V.sessionNote}</span>
          </div>
          <button onClick={() => setFocusOpen(true)} style={{ border: '1px solid #4a443c', background: 'rgba(231,197,107,0.10)', color: '#E7C56B', borderRadius: 999, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>🎯 Modo foco</button>
          {!V.sessionOpen && (
            <div style={{ height: 5, background: '#35302a', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${V.sessionPct}%`, height: '100%', background: '#d98a55', borderRadius: 999, transition: 'width .3s' }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div onClick={V.sessionPaused ? resumeSession : pauseSession} style={{ flex: 1, minWidth: 110, textAlign: 'center', background: V.sessionPaused ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : '#35302a', color: V.sessionPaused ? '#1B1305' : '#faf7f1', borderRadius: 999, padding: '11px 12px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{V.sessionPaused ? '▶ Reanudar' : '⏸ Pausar'}</div>
            <div onClick={() => finish(false)} style={{ flex: 1, minWidth: 100, textAlign: 'center', background: '#faf7f1', color: '#1c1a17', borderRadius: 999, padding: '11px 12px', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>Terminar</div>
            {data.session?.taskId && <div onClick={() => finish(true)} style={{ textAlign: 'center', border: '1px solid #4a443c', borderRadius: 999, padding: '11px 12px', fontSize: 12.5, cursor: 'pointer' }}>✓ y hecha</div>}
            {!V.sessionOpen && <div onClick={extend} style={{ textAlign: 'center', border: '1px solid #4a443c', borderRadius: 999, padding: '11px 12px', fontSize: 12.5, cursor: 'pointer' }}>+15m</div>}
            <div onClick={cancel} title="Descartar" style={{ textAlign: 'center', border: '1px solid #4a443c', borderRadius: 999, padding: '11px 12px', fontSize: 12.5, color: '#a49b90', cursor: 'pointer' }}>Descartar</div>
          </div>
        </div>
      )}

      {/* Modo foco: overlay a pantalla completa con temporizador grande y Pomodoro opcional */}
      {focusOpen && V.hasSession && (() => {
        const s = data.session!
        const el = sessionElapsed(s, now)
        const cycle = Math.floor(el / 30) + 1
        const pos = el % 30
        const inBreak = pos >= 25
        const phaseRemain = Math.max(0, inBreak ? 30 - pos : 25 - pos)
        const phasePct = inBreak ? ((pos - 25) / 5) * 100 : (pos / 25) * 100
        const focusTask = s.taskId ? (allTasks || []).find(x => x.task.id === s.taskId) : null
        const focusSubs = focusTask?.task.subtasks || []
        const subsDone = focusSubs.filter(x => x.done).length
        // Acumulado de la tarea: lo YA registrado en sesiones previas + lo de esta sesión.
        const prior = priorForSession(s)
        const totalTask = prior + Math.max(0, el)
        // Planeado (cuánto se estima que dure): por dificultad de la tarea, o si no, la duración
        // planeada de ESTA sesión (la que fijaste al empezar). Así siempre se ve "cuánto va a durar".
        const planned = focusTask?.task.difficulty ? durByDiff(focusTask.task) : (s.dur || 0)
        const plannedPct = planned ? Math.min(100, Math.round((totalTask / planned) * 100)) : 0
        const overPlan = planned > 0 && totalTask > planned
        // Hora actual + (si la sesión tenía duración planeada) a qué hora terminaría.
        const nowClock = clock(Math.round(now))
        const sitPlan = s.dur   // duración planeada de ESTA sesión (0 = contador libre)
        const sitRemain = Math.max(0, sitPlan - Math.max(0, el))
        const endClock = clock(Math.round(now) + sitRemain)
        const overSit = sitPlan > 0 && Math.max(0, el) >= sitPlan
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'radial-gradient(120% 120% at 50% 0%, #26221d 0%, #17140f 60%, #0f0d0a 100%)', color: '#faf7f1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 22 }}>
            <button onClick={() => setFocusOpen(false)} title="Salir del modo foco (Esc)" style={{ position: 'absolute', top: 20, right: 22, border: '1px solid #3a352e', background: 'transparent', color: '#a49b90', borderRadius: 999, padding: '9px 16px', fontSize: 13.5, cursor: 'pointer' }}>✕ Salir</button>
            <span style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: pomoOn ? (inBreak ? '#8fae74' : '#E7C56B') : '#a49b90' }}>{V.sessionPaused ? '⏸ en pausa' : pomoOn ? (inBreak ? '🌿 descanso' : '🎯 foco') : 'en curso'}</span>
            <span style={{ fontSize: 'clamp(18px,3vw,26px)', fontWeight: 500, textAlign: 'center', maxWidth: 700, lineHeight: 1.2 }}>{V.sessionName}</span>
            <span style={{ fontSize: 14, color: '#a49b90' }}>🕐 son las {nowClock}{sitPlan > 0 ? (overSit ? ` · pasaste tu plan de ${hm(sitPlan)}` : <> · terminarías a las <b style={{ color: '#cdc4b8' }}>{endClock}</b></>) : ' · contador libre'}</span>
            <span style={{ fontFamily: SERIF, fontSize: 'clamp(88px,20vw,190px)', lineHeight: .82, letterSpacing: '-.02em', opacity: V.sessionPaused ? 0.5 : 1 }}>{V.sessionElapsedLabel || '0m'}</span>
            {/* Acumulado de la tarea (retomar) + planeado vs real */}
            {(prior > 0 || planned > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, width: 'min(460px,90vw)', marginTop: -6 }}>
                <span style={{ fontSize: 14.5, color: '#cdc4b8', textAlign: 'center' }}>
                  {prior > 0
                    ? <>En total <b style={{ color: '#faf7f1' }}>{hm(totalTask)}</b> en la tarea · <span style={{ color: '#E7C56B' }}>{hm(prior)} antes</span> + {hm(Math.max(0, el))} ahora</>
                    : <>Llevas <b style={{ color: '#faf7f1' }}>{hm(totalTask)}</b> en la tarea</>}
                </span>
                {planned > 0 && (
                  <>
                    <div style={{ width: '100%', height: 7, background: '#2a251f', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(3, plannedPct)}%`, height: '100%', background: overPlan ? 'linear-gradient(90deg,#C2933A,#d98a55)' : 'linear-gradient(90deg,#6f8256,#8fae74)', borderRadius: 999, transition: 'width .4s' }} />
                    </div>
                    <span style={{ fontSize: 12.5, color: overPlan ? '#d98a55' : '#8b8379' }}>
                      {overPlan
                        ? `Planeado ${hm(planned)} · te pasaste ${hm(totalTask - planned)}`
                        : `Planeado ${hm(planned)} · quedan ${hm(planned - totalTask)} (${plannedPct}%)`}
                    </span>
                  </>
                )}
              </div>
            )}
            {pomoOn && !V.sessionPaused && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 'min(460px,90vw)' }}>
                <span style={{ fontSize: 15, color: inBreak ? '#8fae74' : '#E7C56B' }}>{inBreak ? `Descanso · quedan ${hm(phaseRemain)}` : `Bloque ${cycle} · quedan ${hm(phaseRemain)} de foco`}</span>
                <div style={{ width: '100%', height: 8, background: '#2a251f', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${phasePct}%`, height: '100%', background: inBreak ? 'linear-gradient(90deg,#6f8256,#8fae74)' : 'linear-gradient(90deg,#C2933A,#E7C56B)', borderRadius: 999, transition: 'width .5s' }} />
                </div>
                <span style={{ fontSize: 12.5, color: '#8b8379' }}>Ciclos de 25 min de foco · 5 de descanso · te aviso en cada cambio</span>
              </div>
            )}
            {!pomoOn && !V.sessionOpen && (
              <div style={{ width: 'min(460px,90vw)', height: 6, background: '#2a251f', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${V.sessionPct}%`, height: '100%', background: '#d98a55', borderRadius: 999, transition: 'width .3s' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              <button onClick={() => setPomoOn(v => !v)} title="Técnica Pomodoro: trabaja en bloques de 25 min de foco + 5 min de descanso, con aviso en cada cambio. Actívalo para que el temporizador te guíe." style={{ border: `1px solid ${pomoOn ? '#C2933A' : '#3a352e'}`, background: pomoOn ? 'rgba(231,197,107,0.12)' : 'transparent', color: pomoOn ? '#E7C56B' : '#cdc4b8', borderRadius: 999, padding: '13px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>🍅 Pomodoro {pomoOn ? 'activado' : 'apagado'}</button>
              <button onClick={V.sessionPaused ? resumeSession : pauseSession} style={{ border: 'none', background: V.sessionPaused ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : '#35302a', color: V.sessionPaused ? '#1B1305' : '#faf7f1', borderRadius: 999, padding: '13px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{V.sessionPaused ? '▶ Reanudar' : '⏸ Pausar'}</button>
              {!V.sessionOpen && <button onClick={extend} style={{ border: '1px solid #3a352e', background: 'transparent', color: '#cdc4b8', borderRadius: 999, padding: '13px 20px', fontSize: 14, cursor: 'pointer' }}>+15m</button>}
              <button onClick={() => finish(false)} style={{ border: 'none', background: '#faf7f1', color: '#1c1a17', borderRadius: 999, padding: '13px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Terminar</button>
              {data.session?.taskId && <button onClick={() => finish(true)} style={{ border: '1px solid #6f8256', background: 'rgba(111,130,86,0.15)', color: '#a9c48c', borderRadius: 999, padding: '13px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✓ y hecha</button>}
            </div>

            {/* Subtareas de la tarea en foco: márcalas conforme avanzas y agrega nuevas sin salir del foco.
                Se muestra SIEMPRE que la sesión venga de una tarea de Épicas (aunque aún no tenga subtareas). */}
            {focusTask && (
              <FocusSubtasks
                subs={focusSubs}
                done={subsDone}
                onToggle={key => toggleSubtaskOf(focusTask.task.id!, focusTask.epicaId, key)}
                onAdd={text => addSubtaskOf(focusTask.task.id!, focusTask.epicaId, text)}
                onMove={(key, dir) => moveSubtaskOf(focusTask.task.id!, focusTask.epicaId, key, dir)}
              />
            )}
            {focusTask && (
              <FocusExtras
                due={focusTask.task.due || ''}
                plan={focusTask.task.plan || ''}
                links={focusTask.task.links || []}
                comentarios={focusTask.task.comentarios || []}
                onPatch={patch => patchFocusTask(focusTask.task.id!, focusTask.epicaId, patch)}
                onAddLink={(label, url) => addLinkOf(focusTask.task.id!, focusTask.epicaId, label, url)}
                onAddComment={text => addCommentOf(focusTask.task.id!, focusTask.epicaId, text)}
              />
            )}
          </div>
        )
      })()}

      {/* Selector para agendar una tarea (de Épicas) o actividad libre a una hora del día */}
      {scheduleAt !== null && <ScheduleModal tasks={tasks} defaultStart={scheduleAt} presetTaskId={schedulePreset} presetName={scheduleName} existing={[...(data.scheduled || []).filter(s => (s.date || taskDay) === taskDay).map(s => ({ name: s.name, start: s.start, dur: s.dur })), ...meetings.filter(m => m.date === taskDay).map(m => ({ name: m.name, start: m.start, dur: m.dur }))]} onSchedule={scheduleActivity} onClose={() => { setScheduleAt(null); setSchedulePreset(null); setScheduleName(null) }} />}

      {/* Detalle de una junta del calendario */}
      {meetView && (
        <div onClick={() => setMeetView(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 92 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Detalle de la junta" style={{ width: 'min(460px,100%)', maxHeight: '90vh', overflowY: 'auto', background: '#faf7f1', border: '1px solid #e7dfd2', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: '#2E5A9E', fontWeight: 700, border: '1px solid rgba(46,90,158,0.3)', borderRadius: 999, padding: '3px 9px' }}>🗓 junta · calendario</span>
              <button onClick={() => setMeetView(null)} style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#a49b90', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <span style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1.15, color: '#1c1a17' }}>{meetView.name}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, color: '#4c4741' }}>
              <span style={{ textTransform: 'capitalize' }}>🗓 {longDayOf(meetView.date)}</span>
              <span>🕐 {clock(meetView.start)}–{clock(meetView.start + meetView.dur)} · {hm(meetView.dur)}</span>
              {meetView.location && <span>📍 {meetView.location}</span>}
            </div>
            {meetView.description && meetView.description.trim() && <MeetingDescription raw={meetView.description} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {meetView.hangoutLink && <a href={meetView.hangoutLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', background: '#1c1a17', color: '#faf7f1', borderRadius: 999, padding: '10px 15px', fontSize: 13.5, fontWeight: 500 }}>Unirse a Meet ↗</a>}
              {meetView.htmlLink && <a href={meetView.htmlLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', border: '1px solid #e2d9cb', color: '#2E5A9E', borderRadius: 999, padding: '10px 15px', fontSize: 13.5, fontWeight: 500 }}>Abrir en Google Calendar ↗</a>}
              {isTodayView && meetView.date === today && <button onClick={() => { const m = meetView; setMeetView(null); if (beginSession({ name: m.name, area: 'personas', start: Math.round(now), dur: m.dur })) setView('hoy') }} style={{ border: '1px solid rgba(46,90,158,0.35)', background: 'rgba(46,90,158,0.08)', color: '#2E5A9E', borderRadius: 999, padding: '10px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>▶ Empezar</button>}
            </div>
          </div>
        </div>
      )}

      {/* Aviso: llegó la hora de algo que agendaste. ¿Iniciar ahora? */}
      {dueSched && !V.hasSession && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 95 }}>
          <div role="dialog" aria-modal="true" aria-label="Es hora de tu actividad agendada" style={{ width: 'min(420px,100%)', background: '#faf7f1', border: '1px solid #e7dfd2', borderRadius: 24, padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={LBL}>llegó la hora de lo que agendaste</span>
            <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.1 }}>{dueSched.name}</span>
            <span style={{ fontSize: 14, color: '#6b645b', lineHeight: 1.5 }}>La agendaste para las <b>{clock(dueSched.start)}</b> · {hm(dueSched.dur)}{dueSched.taskId ? '. Al terminar se marca hecha en Épicas.' : '.'} ¿La inicias ahora?</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
              <div onClick={() => startScheduled(dueSched)} style={{ flex: 1, minWidth: 150, textAlign: 'center', background: '#1c1a17', color: '#faf7f1', borderRadius: 999, padding: 14, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>▶ Iniciar ahora</div>
              <div onClick={() => dismissSched(dueSched.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ddd4c6', borderRadius: 999, padding: '14px 18px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ahora no</div>
              <div onClick={() => { removeScheduled(dueSched.id); dismissSched(dueSched.id) }} title="Quitar de agendados" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ddd4c6', borderRadius: 999, padding: '14px 16px', fontSize: 14, color: '#a49b90', cursor: 'pointer', whiteSpace: 'nowrap' }}>Quitar</div>
            </div>
          </div>
        </div>
      )}

      {/* Toast "deshacer" tras borrar (registro / bloque / agendado) */}
      {undo && (
        <div className="t-abovenav" style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 121, background: '#1c1a17', color: '#faf7f1', borderRadius: 999, padding: '10px 16px', boxShadow: '0 16px 44px -14px rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, maxWidth: 'calc(100vw - 32px)' }}>
          <span>{undo.msg}</span>
          <button onClick={() => { undo.fn(); setUndo(null); if (undoTimer.current) clearTimeout(undoTimer.current) }} style={{ border: 'none', background: 'transparent', color: '#E7C56B', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Deshacer</button>
        </div>
      )}

      {/* Aviso de guardado fallido (sin red / error): nada se pierde en localStorage, pero avisa. */}
      {saveErr && (
        <div className="t-abovenav" style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 120, maxWidth: 'min(360px, calc(100vw - 32px))', background: '#8a3c2a', color: '#faf7f1', borderRadius: 14, padding: '12px 14px', boxShadow: '0 16px 44px -14px rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <span style={{ flex: 1, lineHeight: 1.4 }}>⚠ No se pudo guardar el último cambio. Revisa tu conexión.{saveErrMsg && <><br /><span style={{ fontSize: 11.5, opacity: .85, fontFamily: 'monospace' }}>{saveErrMsg}</span></>}</span>
          <button onClick={() => { const items = [...pendingSync.current.values()]; items.forEach(v => syncTask(v.epicaId, v.task)); save({}) }} style={{ border: '1px solid rgba(255,255,255,.45)', background: 'transparent', color: '#faf7f1', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Reintentar</button>
        </div>
      )}
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

/* Empezar algo GENERAL al instante (revisar cosas, tareas sueltas sin épica): nombre opcional + ▶. */
function QuickStart({ onStart }: { onStart: (name: string) => void }) {
  const [name, setName] = useState('')
  const go = () => { onStart(name); setName('') }
  return (
    <div style={{ border: '1px solid #ece3d5', background: '#fff', borderRadius: 16, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a49b90' }}>empezar algo ahora · sin tarea</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go() }} placeholder="¿Qué estás haciendo? (revisar cosas, general…)" style={{ flex: 1, minWidth: 0, background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#1c1a17', outline: 'none' }} />
        <button onClick={go} title="Empezar un cronómetro libre ahora" style={{ border: 'none', background: '#1c1a17', color: '#faf7f1', borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>▶ Empezar</button>
      </div>
    </div>
  )
}

/* Panel de subtareas del Modo foco: marca las hechas y agrega nuevas sin salir del foco.
   Se muestra aunque la tarea aún no tenga subtareas (invita a dividirla en pasos). */
function FocusSubtasks({ subs, done, onToggle, onAdd, onMove }: { subs: EpicaSubtask[]; done: number; onToggle: (key: string) => void; onAdd: (text: string) => void; onMove?: (key: string, dir: -1 | 1) => void }) {
  const [txt, setTxt] = useState('')
  const add = () => { const t = txt.trim(); if (!t) return; onAdd(t); setTxt('') }
  // Pendientes arriba (reordenables), terminadas al fondo.
  const pend = subs.filter(s => !s.done)
  const doneL = subs.filter(s => s.done)
  const canMove = !!onMove && pend.length > 1
  const arrowBtn: CSSProperties = { border: 'none', background: 'transparent', color: '#a49b90', cursor: 'pointer', fontSize: 9, lineHeight: 1, padding: '1px 3px' }
  const row = (sub: EpicaSubtask, arrows: { up: boolean; down: boolean } | null) => { const key = sub.id || sub.t; return (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 4px', width: '100%' }}>
      <button onClick={() => onToggle(key)} title={sub.done ? 'desmarcar' : 'marcar hecha'} style={{ flexShrink: 0, width: 21, height: 21, borderRadius: 6, border: sub.done ? 'none' : '1.5px solid #5a534a', background: sub.done ? '#6f8256' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f0d0a', cursor: 'pointer' }}>{sub.done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"><path d="M20 6 9 17l-5-5" /></svg>}</button>
      <span onClick={() => onToggle(key)} style={{ flex: 1, fontSize: 15, color: sub.done ? '#7d766c' : '#faf7f1', textDecoration: sub.done ? 'line-through' : 'none', cursor: 'pointer' }}>{sub.t || 'Subtarea'}</span>
      {arrows && (
        <span style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <button onClick={() => onMove!(key, -1)} disabled={arrows.up} aria-label="Subir" title="Subir" style={{ ...arrowBtn, opacity: arrows.up ? 0.3 : 1, cursor: arrows.up ? 'default' : 'pointer' }}>▲</button>
          <button onClick={() => onMove!(key, 1)} disabled={arrows.down} aria-label="Bajar" title="Bajar" style={{ ...arrowBtn, opacity: arrows.down ? 0.3 : 1, cursor: arrows.down ? 'default' : 'pointer' }}>▼</button>
        </span>
      )}
    </div>
  ) }
  return (
    <div style={{ width: 'min(520px, 92vw)', maxHeight: '34vh', overflowY: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #33302a', borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a49b90' }}>subtareas</span>
        {subs.length > 0 && <span style={{ fontSize: 12, color: done === subs.length ? '#a9c48c' : '#cdc4b8' }}>{done}/{subs.length} hechas</span>}
      </div>
      {subs.length === 0 && <span style={{ fontSize: 13.5, color: '#8b8379', padding: '0 4px 8px', lineHeight: 1.4 }}>Divide esta tarea en pasos para ir marcando qué haces.</span>}
      {pend.map((sub, k) => row(sub, canMove ? { up: k === 0, down: k === pend.length - 1 } : null))}
      {doneL.map(sub => row(sub, null))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, borderTop: '1px solid #2a2620', paddingTop: 10 }}>
        <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="+ agregar subtarea" style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.25)', border: '1px solid #3a352e', borderRadius: 10, padding: '9px 12px', fontSize: 14, color: '#faf7f1', outline: 'none' }} />
        {txt.trim() && <button onClick={add} style={{ border: 'none', background: '#faf7f1', color: '#1c1a17', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Agregar</button>}
      </div>
    </div>
  )
}

/* Fechas, enlaces y comentarios de la tarea en foco: editar sin salir del foco. */
function FocusExtras({ due, plan, links, comentarios, onPatch, onAddLink, onAddComment }: { due: string; plan: string; links: EpicaTaskLink[]; comentarios: EpicaTaskComment[]; onPatch: (patch: Partial<EpicaTask>) => void; onAddLink: (label: string, url: string) => void; onAddComment: (text: string) => void }) {
  const [showLinkAdd, setShowLinkAdd] = useState(false)
  const [nlLabel, setNlLabel] = useState(''); const [nlUrl, setNlUrl] = useState('')
  const [comment, setComment] = useState('')
  const addLink = () => { if (!nlUrl.trim() && !nlLabel.trim()) return; onAddLink(nlLabel, nlUrl); setNlLabel(''); setNlUrl(''); setShowLinkAdd(false) }
  const addComment = () => { const t = comment.trim(); if (!t) return; onAddComment(t); setComment('') }
  const field: CSSProperties = { minWidth: 0, background: 'rgba(0,0,0,0.25)', border: '1px solid #3a352e', borderRadius: 10, padding: '9px 12px', fontSize: 14, color: '#faf7f1', outline: 'none' }
  const addBtn: CSSProperties = { border: 'none', background: '#faf7f1', color: '#1c1a17', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }
  const secLbl: CSSProperties = { fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a49b90' }
  return (
    <div style={{ width: 'min(520px, 92vw)', maxHeight: '38vh', overflowY: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #33302a', borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
      {/* Fechas: cuándo se hace (plan) y cuándo se termina (vence) — editables aquí mismo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span style={secLbl}>fechas</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 130 }}>
            <span style={{ fontSize: 12, color: '#a49b90' }}>Hacer (plan)</span>
            <input type="date" value={plan} onChange={e => onPatch({ plan: e.target.value })} style={{ ...field, colorScheme: 'dark' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 130 }}>
            <span style={{ fontSize: 12, color: '#a49b90' }}>Vence (se termina)</span>
            <input type="date" value={due} onChange={e => onPatch({ due: e.target.value })} style={{ ...field, colorScheme: 'dark' }} />
          </label>
        </div>
      </div>

      {/* Enlaces */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={secLbl}>enlaces</span>
          <button onClick={() => setShowLinkAdd(v => !v)} style={{ border: '1px solid #4a443c', background: 'transparent', color: '#cdc4b8', borderRadius: 999, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}>{showLinkAdd ? 'cancelar' : '+ link'}</button>
        </div>
        {links.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {links.map((l, i) => (
              <a key={i} href={safeUrl(l.url)} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 13, fontWeight: 500, color: '#E7C56B', background: 'rgba(231,197,107,0.10)', border: '1px solid #4a443c', borderRadius: 999, padding: '6px 12px', maxWidth: '100%' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔗 {l.label || l.url}</span>
              </a>
            ))}
          </div>
        )}
        {links.length === 0 && !showLinkAdd && <span style={{ fontSize: 13, color: '#8b8379' }}>Sin enlaces. Agrega uno con “+ link”.</span>}
        {showLinkAdd && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <input value={nlLabel} onChange={e => setNlLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }} placeholder="Etiqueta" style={{ ...field, flex: '0 0 120px', width: 120 }} />
            <input value={nlUrl} onChange={e => setNlUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }} placeholder="https://…" style={{ ...field, flex: 1 }} />
            <button onClick={addLink} style={addBtn}>Agregar</button>
          </div>
        )}
      </div>

      {/* Comentarios */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #2a2620', paddingTop: 12 }}>
        <span style={secLbl}>comentarios</span>
        {comentarios.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {comentarios.map((c, i) => (
              <div key={i} style={{ fontSize: 13.5, color: '#e4ddd2', lineHeight: 1.5 }}><span style={{ color: '#8b8379' }}>{new Date(c.at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · {new Date(c.at).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })} · </span>{c.text}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addComment() } }} placeholder="Escribe un comentario…  (⌘/Ctrl + Enter para enviar)" rows={3} style={{ ...field, width: '100%', minHeight: 76, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }} />
          {comment.trim() && <button onClick={addComment} style={{ ...addBtn, alignSelf: 'flex-end' }}>Comentar</button>}
        </div>
      </div>
    </div>
  )
}

// Curva suave (Catmull-Rom → Bézier) para una serie de puntos {x,y}.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`
  }
  return d
}

type RWeek = { date: string; work: number; total: number; isToday: boolean; selected: boolean; future: boolean; num: number; letter: string }
type RAct = { id: number; name: string; start: number; end: number; dur: number; area: Area; color: string; done: boolean; taskId?: string }
type RDetail = { deep: number; total: number; sleep: number; tasksDone: number; subDone: number; sessions: number; areaRank: { area: Area; label: string; color: string; min: number; pct: number }[]; hours: number[]; hasHours: boolean; hFrom: number; hTo: number; firstStart: number | null; lastEnd: number | null; acts: RAct[] }

// Metadatos que cruzan los registros del historial (sólo traen epicaId/taskId) con las tareas/épicas.
type HistMeta = {
  task: Record<string, { epicaId?: string; difficulty?: 'facil' | 'media' | 'dificil' }>
  epica: Record<string, { name: string; color: string }>
}
const DIFF_META: Record<string, { label: string; color: string }> = {
  facil: { label: 'Fácil', color: '#5f8a52' }, media: { label: 'Media', color: '#A87A2C' }, dificil: { label: 'Difícil', color: '#B0522E' },
}

const CHART_INK = '#1c1a17', CHART_MUT = '#8b8379', CHART_FAINT = '#a49b90', CHART_GRID = '#eee6da', CHART_LINE = '#b4653a', CHART_GOAL = '#6f8256'

/* Curva de desempeño (trabajo) por día de la semana. SELECCIONABLE: clic en un día lo elige y
   el detalle de abajo se actualiza. Serie única → sin leyenda; el título la nombra. */
function WeekPerfChart({ weekly, maxWork, goal, onPickDay }: { weekly: RWeek[]; maxWork: number; goal: number; onPickDay: (d: string) => void }) {
  const [hw, setHw] = useState<number | null>(null)
  const VBW = 700, VBH = 190, padL = 12, padR = 12, padT = 20, padB = 30
  const innerW = VBW - padL - padR, innerH = VBH - padT - padB, baseY = padT + innerH
  const wx = (i: number) => padL + (weekly.length > 1 ? i * (innerW / (weekly.length - 1)) : innerW / 2)
  const wy = (v: number) => baseY - (v / maxWork) * innerH
  const wpts = weekly.map((w, i) => ({ x: wx(i), y: wy(w.work), ...w }))
  const worked = weekly.filter(w => !w.future && w.work > 0)
  const avg = worked.length ? Math.round(worked.reduce((s, w) => s + w.work, 0) / worked.length) : 0
  const idxFromX = (e: React.MouseEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); const vx = ((e.clientX - r.left) / r.width) * VBW; return Math.max(0, Math.min(weekly.length - 1, Math.round((vx - padL) / (innerW / (weekly.length - 1))))) }
  const axisLbl: CSSProperties = { fontSize: 10, fill: CHART_FAINT }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: SERIF, fontSize: 20, color: CHART_INK }}>Tu desempeño por día</span>
        <span style={{ fontSize: 12.5, color: CHART_MUT }}>trabajo profundo · promedio {avg ? hm(avg) : '—'}{goal > 0 ? ` · meta ${hm(goal)}` : ''} · toca un día</span>
      </div>
      <svg viewBox={`0 0 ${VBW} ${VBH}`} role="group" aria-label={`Trabajo por día esta semana; promedio ${hm(avg)}.`} style={{ width: '100%', height: 'auto', display: 'block', cursor: 'pointer' }} onMouseMove={e => setHw(idxFromX(e))} onMouseLeave={() => setHw(null)} onClick={e => { const i = idxFromX(e); if (!weekly[i].future) onPickDay(weekly[i].date) }}>
        <defs><linearGradient id="rw-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_LINE} stopOpacity="0.22" /><stop offset="100%" stopColor={CHART_LINE} stopOpacity="0.02" /></linearGradient></defs>
        {[0.5, 1].map((f, i) => <line key={i} x1={padL} x2={VBW - padR} y1={wy(maxWork * f)} y2={wy(maxWork * f)} stroke={CHART_GRID} strokeWidth="1" />)}
        <line x1={padL} x2={VBW - padR} y1={baseY} y2={baseY} stroke={CHART_GRID} strokeWidth="1" />
        {goal > 0 && goal <= maxWork && <line x1={padL} x2={VBW - padR} y1={wy(goal)} y2={wy(goal)} stroke={CHART_GOAL} strokeWidth="1.5" strokeDasharray="5 5" opacity="0.7" />}
        {(() => { const shown = wpts.filter(p => !p.future); if (shown.length < 2) return null; const line = smoothPath(shown); return (<>
          <path d={`${line} L ${shown[shown.length - 1].x} ${baseY} L ${shown[0].x} ${baseY} Z`} fill="url(#rw-fill)" />
          <path d={line} fill="none" stroke={CHART_LINE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>) })()}
        {/* Guía vertical del día seleccionado */}
        {wpts.filter(p => p.selected && !p.future).map((p, i) => <line key={'sel' + i} x1={p.x} x2={p.x} y1={padT - 4} y2={baseY} stroke="#C2933A" strokeWidth="1.5" opacity="0.55" />)}
        {wpts.map((p, i) => p.future ? null : (
          <circle key={i} cx={p.x} cy={p.y} r={p.selected ? 6 : 3.5} fill={p.selected ? '#C2933A' : '#faf7f1'} stroke={p.selected ? '#faf7f1' : CHART_LINE} strokeWidth="2" />
        ))}
        {wpts.map((p, i) => <text key={i} x={p.x} y={VBH - 10} textAnchor="middle" style={{ ...axisLbl, fill: p.selected ? '#8a4b28' : p.isToday ? '#b4653a' : CHART_FAINT, fontWeight: p.selected || p.isToday ? 700 : 400 }}>{p.letter}{' '}{p.num}{p.isToday && !p.selected ? ' •' : ''}</text>)}
        {hw != null && !wpts[hw].future && (() => { const p = wpts[hw]; const tw = 92, tx = Math.max(padL, Math.min(VBW - padR - tw, p.x - tw / 2)); const ty = Math.max(2, p.y - 42); return (
          <g>
            <line x1={p.x} x2={p.x} y1={padT} y2={baseY} stroke={CHART_FAINT} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={p.x} cy={p.y} r={4.5} fill={CHART_LINE} stroke="#faf7f1" strokeWidth="2" />
            <rect x={tx} y={ty} width={tw} height="34" rx="8" fill={CHART_INK} />
            <text x={tx + tw / 2} y={ty + 14} textAnchor="middle" style={{ fontSize: 10.5, fill: '#cdc4b8' }}>{p.letter} {p.num}</text>
            <text x={tx + tw / 2} y={ty + 27} textAnchor="middle" style={{ fontSize: 12.5, fontWeight: 700, fill: '#faf7f1' }}>{p.work ? hm(p.work) : 'sin registro'}</text>
          </g>
        ) })()}
      </svg>
      {/* Selector de día accesible por teclado (mismo que tocar la curva) */}
      <div role="group" aria-label="Elegir un día" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {weekly.map(w => (
          <button key={w.date} type="button" disabled={w.future} aria-pressed={w.selected} onClick={() => onPickDay(w.date)}
            title={w.future ? `${w.letter} ${w.num}` : `${w.letter} ${w.num} · ${w.work ? hm(w.work) : 'sin registro'}`}
            style={{ flex: '1 1 0', minWidth: 40, cursor: w.future ? 'default' : 'pointer', borderRadius: 10, padding: '6px 4px', fontSize: 12, fontWeight: 700,
              border: `1px solid ${w.selected ? '#C2933A' : '#e2d9cb'}`, background: w.selected ? 'linear-gradient(135deg,#f2e2bf,#e8cf9c)' : '#faf7f1',
              color: w.future ? '#c9c0b3' : w.selected ? '#8a4b28' : w.isToday ? '#b4653a' : '#6b645b', opacity: w.future ? 0.5 : 1 }}>
            {w.letter} {w.num}{w.isToday && !w.selected ? ' •' : ''}
          </button>
        ))}
      </div>
    </div>
  )
}

/* Detalle del DÍA seleccionado: KPIs + histograma por hora + reparto por área + actividades. */
function DayDetail({ d, dayLabel }: { d: RDetail; dayLabel: string }) {
  const [hh, setHh] = useState<number | null>(null)
  const empty = d.sessions === 0 && d.tasksDone === 0 && d.subDone === 0
  const kpis = [
    { lbl: 'Trabajo profundo', val: d.deep ? hm(d.deep) : '—', c: '#8a4b28' },
    { lbl: 'Total activo', val: d.total ? hm(d.total) : '—', c: '#b4653a' },
    { lbl: 'Tareas terminadas', val: String(d.tasksDone), c: '#4f6238' },
    { lbl: 'Subtareas ✓', val: String(d.subDone), c: '#2E6E6E' },
    { lbl: 'Bloques', val: String(d.sessions), c: '#7A6FB0' },
    ...(d.sleep ? [{ lbl: 'Sueño', val: hm(d.sleep), c: '#1c1a17' }] : []),
  ]
  // Histograma por hora
  const HW = 700, HH = 158, hpadL = 30, hpadR = 8, hpadT = 12, hpadB = 22
  const hIW = HW - hpadL - hpadR, hIH = HH - hpadT - hpadB, hBase = hpadT + hIH
  const hrs: number[] = []; for (let h = d.hFrom; h <= d.hTo; h++) hrs.push(h)
  const bw = hIW / Math.max(1, hrs.length)
  const capH = (m: number) => (Math.min(60, m) / 60) * hIH
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, borderTop: '1px solid #eee6da', paddingTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: SERIF, fontSize: 22, color: CHART_INK }}>Detalle de {dayLabel}</span>
        {!empty && d.firstStart != null && <span style={{ fontSize: 12.5, color: CHART_MUT }}>de {clock(d.firstStart)} a {clock(d.lastEnd!)}</span>}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(116px,1fr))', gap: 10 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ background: '#f7f2e8', border: '1px solid #ece3d5', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10.5, color: '#a49b90', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.lbl}</span>
            <span style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1, color: k.c }}>{k.val}</span>
          </div>
        ))}
      </div>

      {empty ? (
        <div style={{ fontSize: 13.5, color: CHART_FAINT, padding: '16px 0', textAlign: 'center' }}>No registraste actividad {dayLabel}. Cronometra algo o marca tareas y verás aquí el detalle por hora.</div>
      ) : (
        <>
          {/* Histograma por hora (solo si hubo tiempo cronometrado ese día) */}
          {d.hasHours && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={LBL}>en qué horas trabajaste · pasa el cursor para ver las actividades de esa hora</span>
            <div style={{ position: 'relative' }}>
            <svg viewBox={`0 0 ${HW} ${HH}`} role="img" aria-label="Minutos de actividad por hora" style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHh(null)}>
              {[0, 0.5, 1].map((f, i) => <line key={i} x1={hpadL} x2={HW - hpadR} y1={hBase - f * hIH} y2={hBase - f * hIH} stroke={CHART_GRID} strokeWidth="1" />)}
              {[[0, '0'], [0.5, '30m'], [1, '1h']].map(([f, lb], i) => <text key={i} x={hpadL - 6} y={hBase - (f as number) * hIH + 3} textAnchor="end" style={{ fontSize: 9.5, fill: CHART_FAINT }}>{lb}</text>)}
              {hrs.map((hr, i) => { const m = d.hours[hr] || 0; const bh = capH(m); const x = hpadL + i * bw; return (
                <g key={hr}>
                  {m > 0 && <rect x={x + 2} y={hBase - bh} width={Math.max(2, bw - 4)} height={bh} rx="3" fill={hh === hr ? '#8a4b28' : CHART_LINE} />}
                  <rect x={x} y={hpadT} width={bw} height={hIH} fill="transparent" onMouseEnter={() => setHh(hr)} />
                  {hr % 2 === 0 && <text x={x + bw / 2} y={HH - 7} textAnchor="middle" style={{ fontSize: 9.5, fill: CHART_FAINT }}>{String(hr).padStart(2, '0')}</text>}
                </g>
              ) })}
            </svg>
            {hh != null && (() => {
              const acts = d.acts.map(a => ({ ...a, ov: Math.min(a.end, hh * 60 + 60) - Math.max(a.start, hh * 60) })).filter(a => a.ov > 0).sort((x, y) => y.ov - x.ov)
              const i = hrs.indexOf(hh); if (i < 0) return null
              const leftPct = Math.max(16, Math.min(84, ((hpadL + i * bw + bw / 2) / HW) * 100))
              return (
                <div style={{ position: 'absolute', top: 2, left: `${leftPct}%`, transform: 'translateX(-50%)', background: CHART_INK, color: '#faf7f1', borderRadius: 10, padding: '8px 11px', minWidth: 150, maxWidth: 260, boxShadow: '0 12px 28px -10px rgba(0,0,0,.5)', pointerEvents: 'none', zIndex: 5 }}>
                  <div style={{ fontSize: 11, color: '#cdc4b8', marginBottom: acts.length ? 5 : 0 }}>{clock(hh * 60)}–{clock(hh * 60 + 60)} · {d.hours[hh] ? hm(d.hours[hh]) : 'sin actividad'}</div>
                  {acts.map((a, k) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, marginTop: 3 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: a.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span style={{ color: '#cdc4b8', fontWeight: 700, flexShrink: 0 }}>{hm(a.ov)}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
            </div>
          </div>}

          {/* Reparto por área */}
          {d.areaRank.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <span style={LBL}>en qué se te fue · {hm(d.total)}</span>
              <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
                {d.areaRank.map(a => <div key={a.area} title={`${a.label} · ${hm(a.min)} · ${a.pct}%`} style={{ width: `${a.pct}%`, background: a.color, minWidth: a.pct > 0 ? 4 : 0 }} />)}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {d.areaRank.map(a => <span key={a.area} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#6b645b' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: a.color, display: 'block' }} />{a.label} · <b style={{ fontWeight: 600 }}>{hm(a.min)}</b> · {a.pct}%</span>)}
              </div>
            </div>
          )}

          {/* Actividades del día */}
          {d.acts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={LBL}>actividades · {d.acts.length} {d.acts.length === 1 ? 'bloque' : 'bloques'}</span>
              {d.acts.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <span style={{ fontSize: 12.5, color: '#a49b90', fontVariantNumeric: 'tabular-nums', width: 96, flexShrink: 0 }}>{clock(a.start)}–{clock(a.end)}</span>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: a.color, display: 'block', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <span style={{ color: '#a49b90', flexShrink: 0 }}>{hm(a.dur)}</span>
                  <span style={{ fontWeight: 600, color: a.done ? '#4f6238' : '#8a4b28', width: 62, textAlign: 'right', fontSize: 12, flexShrink: 0 }}>{a.done ? 'hecho ✓' : 'trabajado'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const MON_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MON_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/* Resumen de TODAS las actividades de un periodo (semana o mes, navegable) con el total de tiempo
   de cada una, ordenado. Reemplaza la lista pobre del Historial con selector de fechas. */
function PeriodSummary({ history }: { history: AppData['history'] }) {
  const [mode, setMode] = useState<'semana' | 'mes'>('semana')
  const [anchor, setAnchor] = useState(() => iso(new Date()))
  const [hideSleep, setHideSleep] = useState(false)
  const today = iso(new Date())
  const [ay, am] = anchor.split('-').map(Number)

  let start: string, end: string, label: string, isCurrent: boolean
  if (mode === 'semana') {
    const wk = weekOfISO(anchor); start = wk[0]; end = wk[6]
    const [sy, sm, sd] = start.split('-').map(Number); const [ey, em, ed] = end.split('-').map(Number)
    const yr = new Date().getFullYear()   // muestra el año sólo si la semana no es de este año (evita ambigüedad al navegar)
    const yrTag = (ey !== yr || sy !== yr) ? ` ${ey}` : ''
    label = (sm === em ? `${sd}–${ed} ${MON_ABBR[em - 1]}` : `${sd} ${MON_ABBR[sm - 1]}–${ed} ${MON_ABBR[em - 1]}`) + yrTag
    isCurrent = wk.includes(today)
  } else {
    const mm = String(am).padStart(2, '0')
    start = `${ay}-${mm}-01`
    end = `${ay}-${mm}-${String(new Date(ay, am, 0).getDate()).padStart(2, '0')}`
    label = `${MON_FULL[am - 1]} ${ay}`
    isCurrent = today.slice(0, 7) === `${ay}-${mm}`
  }

  const entries = history.filter(h => h.date >= start && h.date <= end && !(hideSleep && h.area === 'sueno'))
  // Agrupa por nombre (consistente con el resto de la app). El color se toma del ÁREA DOMINANTE
  // del grupo (la de más minutos), no de la primera entrada registrada (que dependía del orden).
  const byName: Record<string, { name: string; total: number; count: number; areaMin: Partial<Record<Area, number>> }> = {}
  entries.forEach(h => { const k = h.name || '—'; const g = byName[k] || (byName[k] = { name: k, total: 0, count: 0, areaMin: {} }); g.total += h.dur; g.count++; g.areaMin[h.area] = (g.areaMin[h.area] || 0) + h.dur })
  const list = Object.values(byName).map(g => {
    const domArea = (Object.entries(g.areaMin) as [Area, number][]).sort((a, b) => b[1] - a[1])[0]?.[0]
    return { name: g.name, total: g.total, count: g.count, color: (domArea && AREAS[domArea]?.color) || '#8b8379' }
  }).sort((a, b) => b.total - a.total)
  const totalAll = list.reduce((s, x) => s + x.total, 0)
  const maxT = Math.max(1, list.length ? list[0].total : 1)

  const move = (dir: 1 | -1) => {
    if (mode === 'semana') setAnchor(a => addDaysISO(a, dir * 7))
    else { let y = ay, m = am + dir; if (m < 1) { m = 12; y-- } if (m > 12) { m = 1; y++ } setAnchor(`${y}-${String(m).padStart(2, '0')}-01`) }
  }
  const btn = (on: boolean): CSSProperties => ({ cursor: 'pointer', border: `1px solid ${on ? '#1c1a17' : '#ddd4c6'}`, background: on ? '#1c1a17' : 'transparent', color: on ? '#faf7f1' : '#6b645b', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600 })
  const navBtn: CSSProperties = { width: 34, height: 34, border: '1px solid #e2d9cb', background: 'transparent', borderRadius: 10, color: '#a49b90', cursor: 'pointer', fontSize: 16 }

  return (
    <div className="t-card" style={{ background: '#fff', border: '1px solid #ece3d5', borderRadius: 28, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.1 }}>Resumen de actividad</span>
          <span style={{ fontSize: 13.5, color: '#8b8379' }}>todas las actividades del periodo y el tiempo total de cada una</span>
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#f2ece0', padding: 3, borderRadius: 999 }}>
          {(['semana', 'mes'] as const).map(m => <button key={m} onClick={() => setMode(m)} style={btn(mode === m)}>{m === 'semana' ? 'Semana' : 'Mes'}</button>)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => move(-1)} title={mode === 'semana' ? 'Semana anterior' : 'Mes anterior'} style={navBtn}>‹</button>
        <span style={{ fontFamily: SERIF, fontSize: 20, color: '#1c1a17', textTransform: 'capitalize', minWidth: 120, textAlign: 'center' }}>{label}</span>
        <button onClick={() => move(1)} title={mode === 'semana' ? 'Semana siguiente' : 'Mes siguiente'} style={navBtn}>›</button>
        {!isCurrent && <button onClick={() => setAnchor(today)} style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '7px 13px', fontSize: 13, color: '#8a4b28', cursor: 'pointer' }}>{mode === 'semana' ? 'Esta semana' : 'Este mes'}</button>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#6b645b' }}>{hm(totalAll)} registradas</span>
        <button onClick={() => setHideSleep(s => !s)} title="Mostrar u ocultar el sueño" style={{ border: '1px solid #e2d9cb', background: hideSleep ? '#faf7f1' : '#eef1e7', borderRadius: 999, padding: '5px 11px', fontSize: 12, color: hideSleep ? '#a49b90' : '#4f6238', cursor: 'pointer' }}>{hideSleep ? 'sin sueño' : 'con sueño'}</button>
      </div>

      {list.length === 0 ? (
        <div style={{ fontSize: 13.5, color: '#a49b90', padding: '20px 0', textAlign: 'center' }}>No hay actividad registrada en {mode === 'semana' ? 'esta semana' : 'este mes'}.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {list.map((a, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: a.color, display: 'block', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span style={{ fontSize: 11.5, color: '#a49b90', flexShrink: 0 }}>{a.count}×</span>
                <span style={{ fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums', minWidth: 62, textAlign: 'right' }}>{hm(a.total)}</span>
                <span style={{ fontSize: 12, color: '#a49b90', flexShrink: 0, width: 40, textAlign: 'right' }}>{totalAll ? Math.round((a.total / totalAll) * 100) : 0}%</span>
              </div>
              <div style={{ height: 6, background: '#f0e8da', borderRadius: 999, overflow: 'hidden', marginLeft: 19 }}>
                <div style={{ width: `${Math.max(2, (a.total / maxT) * 100)}%`, height: '100%', background: a.color, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* HISTORIAL rediseñado: analítica por PERIODO (Semana o Mes, navegable) con banner-resumen,
   reparto por área, por actividad, por tarea (completada/solo tiempo) y racha + sueño. Un solo
   selector de periodo manda todo. Reemplaza el historial disperso y de periodo fijo. */
function HistorialView({ history, meta, onLogSleep, onOpenTask }: { history: AppData['history']; meta: HistMeta; onLogSleep: (date: string, mins: number) => void; onOpenTask: (taskId: string) => void }) {
  const [mode, setMode] = useState<'dia' | 'semana' | 'mes'>('semana')
  const [anchor, setAnchor] = useState(() => iso(new Date()))
  const [areaFilter, setAreaFilter] = useState<Area | 'all'>('all')
  const [epicaFilter, setEpicaFilter] = useState<string>('all')   // epicaId | '__free__' | 'all'
  const [diffFilter, setDiffFilter] = useState<string>('all')     // 'facil' | 'media' | 'dificil' | 'all'
  const today = iso(new Date())
  const diffOf = useCallback((h: AppData['history'][number]) => (h.taskId ? meta.task[h.taskId]?.difficulty : undefined), [meta])
  const D = useMemo(() => {
    const [ay, am] = anchor.split('-').map(Number); const pad = (n: number) => String(n).padStart(2, '0')
    let start: string, end: string, days: string[], label: string, isCurrent: boolean
    if (mode === 'dia') {
      start = end = anchor; days = [anchor]
      label = anchor === today ? 'hoy' : longDayOf(anchor)
      isCurrent = anchor === today
    } else if (mode === 'semana') {
      const wk = weekOfISO(anchor); start = wk[0]; end = wk[6]; days = wk
      const [sy, sm, sd] = start.split('-').map(Number); const [ey, em, ed] = end.split('-').map(Number)
      const yr = new Date().getFullYear(); const yrTag = (ey !== yr || sy !== yr) ? ` ${ey}` : ''
      label = (sm === em ? `${sd}–${ed} ${MON_ABBR[em - 1]}` : `${sd} ${MON_ABBR[sm - 1]}–${ed} ${MON_ABBR[em - 1]}`) + yrTag
      isCurrent = wk.includes(today)
    } else {
      const lastD = new Date(ay, am, 0).getDate(); start = `${ay}-${pad(am)}-01`; end = `${ay}-${pad(am)}-${pad(lastD)}`
      days = Array.from({ length: lastD }, (_, i) => `${ay}-${pad(am)}-${pad(i + 1)}`)
      label = `${MON_FULL[am - 1]} ${ay}`; isCurrent = today.slice(0, 7) === `${ay}-${pad(am)}`
    }
    // Todo el análisis es sobre tiempo PRODUCTIVO (sin sueño; el sueño se registra aparte abajo).
    const prodAll = history.filter(h => h.date >= start && h.date <= end && h.area !== 'sueno')

    // Opciones de filtro (del periodo completo, para que los chips no desaparezcan al filtrar).
    const areaAll: Partial<Record<Area, number>> = {}; const epMin: Record<string, number> = {}; const diffMin: Record<string, number> = {}; let freeMin = 0
    prodAll.forEach(h => {
      areaAll[h.area] = (areaAll[h.area] || 0) + h.dur
      if (h.epicaId) epMin[h.epicaId] = (epMin[h.epicaId] || 0) + h.dur; else freeMin += h.dur
      const df = diffOf(h); if (df) diffMin[df] = (diffMin[df] || 0) + h.dur
    })
    const areaOpts = (Object.entries(areaAll) as [Area, number][]).sort((a, b) => b[1] - a[1]).map(([a]) => ({ key: a, label: AREAS[a]?.label || a, color: AREAS[a]?.color || '#8b8379' }))
    const epicaOpts = [
      ...Object.entries(epMin).sort((a, b) => b[1] - a[1]).map(([id]) => ({ key: id, label: meta.epica[id]?.name || 'Épica', color: meta.epica[id]?.color || '#8b8379' })),
      ...(freeMin > 0 ? [{ key: '__free__', label: 'Libre / sin épica', color: '#9a9187' }] : []),
    ]
    // Dificultad: siempre las tres (para que el filtro sea visible/pedible); las sin datos se grisan.
    const diffOpts = (['facil', 'media', 'dificil'] as const).map(d => ({ key: d as string, label: DIFF_META[d].label, color: DIFF_META[d].color, min: diffMin[d] || 0 }))
    const hasTaskActivity = Object.keys(epMin).length > 0   // hay tiempo ligado a tareas de Épicas

    // Filtros combinados (AND): afectan TODO (banner, reparto, épica, actividades).
    const match = (h: AppData['history'][number]) => {
      if (areaFilter !== 'all' && h.area !== areaFilter) return false
      if (epicaFilter !== 'all') { if (epicaFilter === '__free__') { if (h.epicaId) return false } else if (h.epicaId !== epicaFilter) return false }
      if (diffFilter !== 'all' && diffOf(h) !== diffFilter) return false
      return true
    }
    const fil = prodAll.filter(match)
    const total = fil.reduce((s, h) => s + h.dur, 0)

    // Reparto por ÁREA
    const byArea: Partial<Record<Area, number>> = {}; fil.forEach(h => { byArea[h.area] = (byArea[h.area] || 0) + h.dur })
    const areaStats = (Object.entries(byArea) as [Area, number][]).sort((a, b) => b[1] - a[1]).map(([a, m]) => ({ area: a, label: AREAS[a]?.label || a, color: AREAS[a]?.color || '#8b8379', min: m, pct: total ? Math.round((m / total) * 100) : 0 }))

    // Reparto por ÉPICA (lo que pidió: tiempo por épica, no sólo por tarea)
    const byEp: Record<string, { key: string; min: number; n: number }> = {}
    fil.forEach(h => { const k = h.epicaId || '__free__'; const g = byEp[k] || (byEp[k] = { key: k, min: 0, n: 0 }); g.min += h.dur; g.n++ })
    const epicaStats = Object.values(byEp).map(g => ({
      key: g.key, min: g.min, n: g.n, pct: total ? Math.round((g.min / total) * 100) : 0,
      label: g.key === '__free__' ? 'Libre / sin épica' : (meta.epica[g.key]?.name || 'Épica'),
      color: g.key === '__free__' ? '#9a9187' : (meta.epica[g.key]?.color || '#8b8379'),
    })).sort((a, b) => b.min - a.min)

    // Actividades UNIFICADO (por nombre): junta "por tarea" y "por actividad". Marca las de Épicas
    // (taskId para abrirlas + estado completada/solo-tiempo).
    const nameG: Record<string, { name: string; total: number; n: number; areaMin: Partial<Record<Area, number>>; taskId?: string; done: boolean }> = {}
    fil.forEach(h => { const k = h.name || '—'; const g = nameG[k] || (nameG[k] = { name: k, total: 0, n: 0, areaMin: {}, done: false }); g.total += h.dur; g.n++; g.areaMin[h.area] = (g.areaMin[h.area] || 0) + h.dur; if (h.taskId) { g.taskId = g.taskId || h.taskId; g.done = g.done || h.done === true } })
    const activities = Object.values(nameG).map(g => { const dom = (Object.entries(g.areaMin) as [Area, number][]).sort((a, b) => b[1] - a[1])[0]?.[0]; return { name: g.name, total: g.total, n: g.n, color: (dom && AREAS[dom]?.color) || '#8b8379', taskId: g.taskId, done: g.done } }).sort((a, b) => b.total - a.total)

    const dominant = areaStats[0]
    const activeDays = days.filter(d => fil.some(h => h.date === d && h.dur > 0)).length
    // Racha global de trabajo hasta hoy (independiente del periodo/filtros).
    let streak = 0
    for (let i = 0; i < 120; i++) { const d = addDaysISO(today, -i); const has = history.some(h => h.date === d && h.area === 'trabajo' && h.dur > 0); if (has) streak++; else if (i === 0) continue; else break }
    const maxAct = activities.length ? activities[0].total : 1
    const maxEp = epicaStats.length ? epicaStats[0].min : 1
    const filtered = areaFilter !== 'all' || epicaFilter !== 'all' || diffFilter !== 'all'
    const filterLabel = [
      areaFilter !== 'all' ? (AREAS[areaFilter as Area]?.label || areaFilter) : null,
      epicaFilter !== 'all' ? (epicaFilter === '__free__' ? 'libre' : (meta.epica[epicaFilter]?.name || 'épica')) : null,
      diffFilter !== 'all' ? DIFF_META[diffFilter]?.label : null,
    ].filter(Boolean).join(' · ')
    return { label, isCurrent, total, areaStats, epicaStats, activities, dominant, activeDays, nDays: days.length, streak, maxAct, maxEp, areaOpts, epicaOpts, diffOpts, hasTaskActivity, filtered, filterLabel }
  }, [history, mode, anchor, areaFilter, epicaFilter, diffFilter, meta, diffOf, today])

  const move = (dir: 1 | -1) => {
    const [ay, am] = anchor.split('-').map(Number)
    if (mode === 'dia') setAnchor(a => addDaysISO(a, dir))
    else if (mode === 'semana') setAnchor(a => addDaysISO(a, dir * 7))
    else { let y = ay, m = am + dir; if (m < 1) { m = 12; y-- } if (m > 12) { m = 1; y++ } setAnchor(`${y}-${String(m).padStart(2, '0')}-01`) }
  }
  const clearFilters = () => { setAreaFilter('all'); setEpicaFilter('all'); setDiffFilter('all') }
  const periodWord = mode === 'dia' ? 'el día' : mode === 'semana' ? 'la semana' : 'el mes'
  const resetWord = mode === 'dia' ? 'Hoy' : mode === 'semana' ? 'Esta semana' : 'Este mes'
  const card2: CSSProperties = { background: '#fff', border: '1px solid #ece3d5', borderRadius: 24, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }
  const modeBtn = (on: boolean): CSSProperties => ({ cursor: 'pointer', border: 'none', background: on ? '#faf7f1' : 'transparent', color: on ? '#1c1a17' : '#6b645b', borderRadius: 999, padding: '7px 15px', fontSize: 13, fontWeight: 600 })
  const navBtn: CSSProperties = { width: 36, height: 36, border: '1px solid #e2d9cb', background: '#fff', borderRadius: 10, color: '#a49b90', cursor: 'pointer', fontSize: 16 }
  const filterChip = (on: boolean, color: string): CSSProperties => ({ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? color : '#e2d9cb'}`, background: on ? color + '22' : '#faf7f1', color: on ? '#1c1a17' : '#6b645b', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 600 })
  const rowLbl: CSSProperties = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#a49b90', width: 62, flexShrink: 0, paddingTop: 7 }

  return (
    <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Banner resumen del periodo */}
      <div style={{ background: '#1c1a17', borderRadius: 24, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ ...LBL, color: '#a49b90' }}>{periodWord} en una línea{D.filtered ? <span style={{ color: '#e7c56b', textTransform: 'none', letterSpacing: 0 }}> · filtrado: {D.filterLabel}</span> : ''}</span>
        <span style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1.4, color: '#faf7f1' }}>
          {D.total ? <>Registraste {hm(D.total)} en {D.label}{D.dominant ? <>, sobre todo en <span style={{ color: '#e7c56b' }}>{D.dominant.label.toLowerCase()}</span> ({D.dominant.pct}%)</> : ''}. </> : <>Sin actividad{D.filtered ? ' con esos filtros' : ' registrada'} en {D.label}. </>}
          {D.streak > 0 ? <><span style={{ color: '#e7c56b' }}>{D.streak}</span> {D.streak === 1 ? 'día' : 'días'} seguidos trabajando.</> : 'Aún sin racha.'}
        </span>
      </div>

      {/* Selector de periodo + filtros (área · épica · dificultad) que afectan TODO el historial */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: '#e7dfd2', padding: 4, borderRadius: 999 }}>
            {(['dia', 'semana', 'mes'] as const).map(m => <button key={m} onClick={() => setMode(m)} style={modeBtn(mode === m)}>{m === 'dia' ? 'Día' : m === 'semana' ? 'Semana' : 'Mes'}</button>)}
          </div>
          <button onClick={() => move(-1)} title="Anterior" style={navBtn}>‹</button>
          <span style={{ fontFamily: SERIF, fontSize: 22, textTransform: 'capitalize', minWidth: 130, textAlign: 'center' }}>{D.label}</span>
          <button onClick={() => move(1)} title="Siguiente" style={navBtn}>›</button>
          {!D.isCurrent && <button onClick={() => setAnchor(today)} style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '8px 14px', fontSize: 13, color: '#8a4b28', cursor: 'pointer' }}>{resetWord}</button>}
          <span style={{ flex: 1 }} />
          {mode !== 'dia' && <span style={{ fontSize: 13.5, color: '#6b645b' }}>{D.activeDays} de {D.nDays} días con actividad</span>}
        </div>
        {/* Filas de filtros: cada una aparece sólo si hay más de una opción */}
        {(D.areaOpts.length > 1 || D.epicaOpts.length > 1 || D.hasTaskActivity) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#fff', border: '1px solid #ece3d5', borderRadius: 18, padding: '14px 16px' }}>
            {D.areaOpts.length > 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={rowLbl}>Área</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setAreaFilter('all')} style={filterChip(areaFilter === 'all', '#1c1a17')}>Todas</button>
                  {D.areaOpts.map(a => <button key={a.key} onClick={() => setAreaFilter(areaFilter === a.key ? 'all' : a.key)} style={filterChip(areaFilter === a.key, a.color)}><span style={{ width: 8, height: 8, borderRadius: 999, background: a.color, display: 'block' }} />{a.label}</button>)}
                </div>
              </div>
            )}
            {D.epicaOpts.length > 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={rowLbl}>Épica</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setEpicaFilter('all')} style={filterChip(epicaFilter === 'all', '#1c1a17')}>Todas</button>
                  {D.epicaOpts.map(e => <button key={e.key} onClick={() => setEpicaFilter(epicaFilter === e.key ? 'all' : e.key)} style={filterChip(epicaFilter === e.key, e.color)}><span style={{ width: 8, height: 8, borderRadius: 999, background: e.color, display: 'block' }} />{e.label}</button>)}
                </div>
              </div>
            )}
            {D.hasTaskActivity && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={rowLbl}>Dificultad</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => setDiffFilter('all')} style={filterChip(diffFilter === 'all', '#1c1a17')}>Todas</button>
                  {D.diffOpts.map(d => d.min > 0
                    ? <button key={d.key} onClick={() => setDiffFilter(diffFilter === d.key ? 'all' : d.key)} style={filterChip(diffFilter === d.key, d.color)}><span style={{ width: 8, height: 8, borderRadius: 999, background: d.color, display: 'block' }} />{d.label}</button>
                    : <span key={d.key} title="Sin tareas de esta dificultad en el periodo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px dashed #e2d9cb', background: 'transparent', color: '#c3bbae', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 600 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: '#e2d9cb', display: 'block' }} />{d.label}</span>)}
                  {D.diffOpts.every(d => d.min === 0) && <span style={{ fontSize: 12, color: '#a49b90', marginLeft: 4 }}>· asigna dificultad en Épicas para usar este filtro</span>}
                </div>
              </div>
            )}
            {D.filtered && <button onClick={clearFilters} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: '#8a4b28', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '2px 0' }}>✕ limpiar filtros</button>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Columna izquierda: reparto por área + por épica + racha */}
        <div style={{ flex: '1 1 300px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Reparto por área (toca una barra para filtrar por esa área) */}
        <div style={card2}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: SERIF, fontSize: 22 }}>Por área</span>
            <span style={{ fontSize: 12.5, color: '#a49b90' }}>{hm(D.total)}</span>
          </div>
          {D.areaStats.length ? D.areaStats.map((s, i) => (
            <div key={i} onClick={() => setAreaFilter(areaFilter === s.area ? 'all' : s.area)} title="Filtrar por esta área" style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 14.5 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: s.color, display: 'block' }} />{s.label}</span>
                <span style={{ color: '#6b645b' }}>{hm(s.min)} · {s.pct}%</span>
              </div>
              <div style={{ height: 8, background: '#f0e8da', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${Math.max(2, s.pct)}%`, height: '100%', background: s.color, borderRadius: 999 }} /></div>
            </div>
          )) : <span style={{ fontSize: 13.5, color: '#a49b90' }}>Sin datos en {periodWord}.</span>}
        </div>

        {/* Reparto por ÉPICA (toca para filtrar por esa épica) */}
        <div style={card2}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: SERIF, fontSize: 22 }}>Por épica</span>
            <span style={{ fontSize: 12.5, color: '#a49b90' }}>tiempo dedicado a cada épica</span>
          </div>
          {D.epicaStats.length ? D.epicaStats.map((s, i) => (
            <div key={i} onClick={() => setEpicaFilter(epicaFilter === s.key ? 'all' : s.key)} title="Filtrar por esta épica" style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 14.5 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: s.color, display: 'block', flexShrink: 0 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span></span>
                <span style={{ color: '#6b645b', flexShrink: 0 }}>{hm(s.min)} · {s.pct}%</span>
              </div>
              <div style={{ height: 8, background: '#f0e8da', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${Math.max(2, (s.min / D.maxEp) * 100)}%`, height: '100%', background: s.color, borderRadius: 999 }} /></div>
            </div>
          )) : <span style={{ fontSize: 13.5, color: '#a49b90' }}>Sin actividad de épicas en {periodWord}.</span>}
        </div>

        {/* Racha */}
        <div style={card2}>
          <span style={{ fontFamily: SERIF, fontSize: 22 }}>Racha</span>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 1, color: D.streak > 0 ? '#8a4b28' : '#a49b90' }}>{D.streak || '—'}</span>
              <span style={{ fontSize: 12, color: '#a49b90' }}>{D.streak === 1 ? 'día seguido' : 'días seguidos'} trabajando</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 1, color: '#1c1a17' }}>{D.activeDays}<span style={{ fontSize: 20, color: '#a49b90' }}>/{D.nDays}</span></span>
              <span style={{ fontSize: 12, color: '#a49b90' }}>días con actividad</span>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #eee6da', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ ...LBL }}>registrar cuánto dormiste</span>
            <SleepLogger onLog={onLogSleep} />
          </div>
        </div>
        </div>

        {/* Columna derecha: Actividades (junta "por tarea" y "por actividad") */}
        <div style={{ flex: '1.3 1 340px', minWidth: 300 }}>
          <div style={card2}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: SERIF, fontSize: 22 }}>Actividades</span>
              <span style={{ fontSize: 12.5, color: '#a49b90' }}>tiempo por actividad · toca una tarea de Épicas para abrirla</span>
            </div>
            {D.activities.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {D.activities.map((a, i) => { const clickable = !!a.taskId; return (
                  <div key={i} onClick={clickable ? () => onOpenTask(a.taskId!) : undefined} title={clickable ? 'Abrir la tarea' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 5, cursor: clickable ? 'pointer' : 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14.5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: a.color, display: 'block', flexShrink: 0, marginTop: 5 }} />
                      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{a.name}</span>
                      {a.taskId && <span style={{ fontSize: 11, fontWeight: 700, color: a.done ? '#4f6238' : '#8a4b28', flexShrink: 0, whiteSpace: 'nowrap' }}>{a.done ? 'completada' : 'solo tiempo'}</span>}
                      <span style={{ fontSize: 11.5, color: '#a49b90', flexShrink: 0 }}>{a.n}×</span>
                      <span style={{ fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums', minWidth: 58, textAlign: 'right' }}>{hm(a.total)}</span>
                    </div>
                    <div style={{ height: 6, background: '#f0e8da', borderRadius: 999, overflow: 'hidden', marginLeft: 19 }}><div style={{ width: `${Math.max(2, (a.total / D.maxAct) * 100)}%`, height: '100%', background: a.color, borderRadius: 999 }} /></div>
                  </div>
                ) })}
              </div>
            ) : <span style={{ fontSize: 13.5, color: '#a49b90' }}>Sin actividad{D.filtered ? ' con esos filtros' : ` registrada en ${periodWord}`}.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Descripción de una junta con sus LINKS clicables (soporta <a href> y URLs sueltas). */
function MeetingDescription({ raw }: { raw: string }) {
  // Normaliza saltos y quita etiquetas EXCEPTO <a>…</a>; luego tokeniza links (anchors o URLs sueltas).
  const s = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<(?!\/?a\b)[^>]+>/gi, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const linkStyle: CSSProperties = { color: '#2E5A9E', fontWeight: 600, textDecoration: 'underline', wordBreak: 'break-all' }
  const tokenRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>|(https?:\/\/[^\s<]+)/gi
  const parts: React.ReactNode[] = []
  let last = 0, m: RegExpExecArray | null, key = 0
  while ((m = tokenRe.exec(s))) {
    if (m.index > last) parts.push(<span key={key++}>{s.slice(last, m.index)}</span>)
    const url = m[1] || m[3]
    const label = m[1] ? (m[2].replace(/<[^>]*>/g, '').trim() || m[1]) : m[3]
    parts.push(<a key={key++} href={safeUrl(url)} target="_blank" rel="noopener noreferrer" style={linkStyle}>{label}</a>)
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push(<span key={key++}>{s.slice(last)}</span>)
  return <div style={{ fontSize: 13.5, color: '#4c4741', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', borderTop: '1px solid #eee6da', paddingTop: 10, maxHeight: 220, overflowY: 'auto' }}>{parts}</div>
}

/** Agendar en el día: elige una TAREA de Épicas (de hoy) o una actividad libre, a una hora.
 *  Al llegar la hora, la app pregunta si la quieres iniciar. */
/** Fila normalizada de la tabla del día (registro/hecho/subtarea). */
type WorkedRow = {
  key: string; sortTime: number; timeLabel: string; color?: string; icon?: string
  name: string; sub?: string; durMin: number; durLabel: string
  statusRank: number; statusLabel: string; statusColor: string
  onClick?: () => void; actions?: ReactNode
}
type WorkedCol = 'time' | 'name' | 'dur' | 'status'
/** Tabla ordenable de "lo que pasó en el día": encabezados clicables (Hora/Actividad/Duración/Estado). */
function WorkedTable({ rows, compact = false, actionsLabel = 'acciones', defaultDir = -1 }: { rows: WorkedRow[]; compact?: boolean; actionsLabel?: string; defaultDir?: 1 | -1 }) {
  const [col, setCol] = useState<WorkedCol>('time')
  const [dir, setDir] = useState<1 | -1>(defaultDir)
  const click = (c: WorkedCol) => { if (c === col) setDir(d => (d === 1 ? -1 : 1)); else { setCol(c); setDir(c === 'time' ? -1 : 1) } }
  const sorted = [...rows].sort((a, b) => {
    let d = 0
    if (col === 'name') d = a.name.localeCompare(b.name, 'es')
    else if (col === 'dur') d = a.durMin - b.durMin
    else if (col === 'status') d = (a.statusRank - b.statusRank) || (a.sortTime - b.sortTime)
    else d = a.sortTime - b.sortTime
    return d * dir || a.sortTime - b.sortTime
  })
  const arrow = (c: WorkedCol) => col === c ? (dir === 1 ? ' ↑' : ' ↓') : ''
  const th: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#a49b90', fontWeight: 600, padding: 0, textAlign: 'left', whiteSpace: 'nowrap' }
  const timeW = compact ? 84 : 92, durW = compact ? 52 : 64, stW = compact ? 72 : 96, pad = compact ? '8px 0' : '13px 0', fs = compact ? 13.5 : 16
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Encabezados */}
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 16, padding: compact ? '0 0 7px' : '0 0 9px', borderBottom: '1px solid #e7dfd2' }}>
        <button onClick={() => click('time')} style={{ ...th, width: timeW, flexShrink: 0 }}>Hora{arrow('time')}</button>
        {!compact && <span style={{ width: 8, flexShrink: 0 }} />}
        <button onClick={() => click('name')} style={{ ...th, flex: 1, minWidth: 0 }}>Actividad{arrow('name')}</button>
        <button onClick={() => click('dur')} style={{ ...th, width: durW, flexShrink: 0, textAlign: 'right' }}>Dur.{arrow('dur')}</button>
        <button onClick={() => click('status')} style={{ ...th, width: stW, flexShrink: 0, textAlign: 'right' }}>Estado{arrow('status')}</button>
        {!compact && <span style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c9c0b3', fontWeight: 600 }}>{actionsLabel}</span>}
      </div>
      {sorted.map(r => (
        <div key={r.key} onClick={r.onClick} title={r.onClick ? 'Abrir' : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 16, padding: pad, borderBottom: '1px solid #eee6da', cursor: r.onClick ? 'pointer' : 'default' }}>
          <span style={{ fontSize: compact ? 12.5 : 14, color: '#8b8379', width: timeW, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{r.timeLabel}</span>
          {!compact && (r.icon
            ? <span style={{ fontSize: 14, flexShrink: 0, color: r.color || '#8b8379', width: 8, textAlign: 'center' }}>{r.icon}</span>
            : <span style={{ width: 8, height: 8, borderRadius: 999, background: r.color || '#8b8379', display: 'block', flexShrink: 0 }} />)}
          <span style={{ fontSize: fs, flex: 1, minWidth: 0, color: '#6b645b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}{r.sub && <span style={{ fontSize: compact ? 12 : 13, color: '#a49b90' }}> · {r.sub}</span>}</span>
          <span style={{ fontSize: compact ? 12.5 : 14, color: '#a49b90', width: durW, flexShrink: 0, textAlign: 'right' }}>{r.durLabel}</span>
          <span style={{ fontSize: compact ? 12 : 13, fontWeight: 500, color: r.statusColor, width: stW, flexShrink: 0, textAlign: 'right' }}>{r.statusLabel}</span>
          {!compact && r.actions && <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{r.actions}</div>}
        </div>
      ))}
    </div>
  )
}
const dtBtn: CSSProperties = { border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, color: '#6b645b', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }

/** Plan de hoy: calendario de UN día. Se arrastran las tareas (columna derecha) a la rejilla
 *  de horas; ya colocadas se pueden mover y redimensionar (con popup en vivo de inicio–fin/duración). */
type PlanRoutine = { name: string; epicaName: string; color: string }
type PlanSession = { name: string; start: number; dur: number; plannedDur: number; area: Area; taskId?: string }
type PlanDrag =
  | { kind: 'new'; task: TodayTask; dur: number; moved: boolean; curMin: number | null; x: number; y: number }
  | { kind: 'newfree'; name: string; dur: number; moved: boolean; curMin: number | null; x: number; y: number }
  | { kind: 'move'; id: string; dur: number; grab: number; curMin: number; x: number; y: number }
  | { kind: 'resize'; id: string; start: number; curDur: number; x: number; y: number }
  | { kind: 'session'; grab: number; start0: number; curMin: number; moved: boolean; x: number; y: number }
function PlanDia({ day, today, onPickDay, tasks, routines, scheduled, worked, blocks, meetings, now, session, onSessionStart, allOpenTasks, onGeneral, onAddDone, onOpenMeeting, onAdd, onAddFree, onPatch, onRemove, onStart, onResume, onEdit, onOpenTask, onNewTask }: {
  day: string; today: string; onPickDay: (d: string) => void
  tasks: TodayTask[] | null; routines: PlanRoutine[]; scheduled: ScheduledBlock[]; worked: HistoryRow[]; blocks: Block[]; meetings: Meeting[]; now: number
  onAdd: (t: TodayTask, start: number, dur?: number) => void
  onAddFree: (name: string, start: number, dur?: number) => void
  onPatch: (id: string, patch: Partial<ScheduledBlock>) => void
  onRemove: (id: string) => void
  onStart: (s: ScheduledBlock) => void
  onResume: (row: HistoryRow) => void
  onEdit: (t: TodayTask) => void
  onOpenTask: (taskId: string) => void
  onNewTask: (epicaId?: string) => void
  session: PlanSession | null
  onSessionStart: (startMin: number) => void
  allOpenTasks: TodayTask[] | null
  onGeneral: (name: string) => void
  onAddDone: (p: { name: string; area: Area; start: number; dur: number; taskId?: string; epicaId?: string }) => void
  onOpenMeeting: (m: Meeting) => void
}) {
  const [epFilter, setEpFilter] = useState<string | null>(null)
  const [doneAt, setDoneAt] = useState<number | null>(null)   // doble clic en la rejilla → registrar algo ya hecho
  const isToday = day === today
  const week = weekOfISO(day)
  const DN = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const PXM = 1.2, SNAP = 15
  const gridRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<PlanDrag | null>(null)
  const dragRef = useRef<PlanDrag | null>(null); dragRef.current = drag
  const [selTask, setSelTask] = useState<string | null>(null)
  const [selFree, setSelFree] = useState<string | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number; txt: string } | null>(null)

  // Ventana visible de la rejilla: de la hora más temprana a la más tardía entre eventos, ahora y 7–22h.
  const [gridStart, gridEnd] = useMemo(() => {
    let minS = 7 * 60, maxE = 22 * 60
    const ev = [...scheduled, ...worked, ...meetings.map(m => ({ start: m.start, dur: m.dur })), ...blocks.map(b => ({ start: b.start, dur: b.dur }))]
    for (const e of ev) { if (e.start < minS) minS = e.start; if (e.start + e.dur > maxE) maxE = e.start + e.dur }
    if (session) minS = Math.min(minS, session.start)   // no recortar una sesión que empezó temprano
    if (isToday) { minS = Math.min(minS, Math.round(now) - 30); maxE = Math.max(maxE, Math.round(now) + 90) }
    return [Math.max(0, Math.floor(minS / 60) * 60), Math.min(1440, Math.ceil(maxE / 60) * 60)]
  }, [scheduled, worked, meetings, blocks, now, isToday, session])

  const snap = (m: number) => Math.round(m / SNAP) * SNAP
  const yToMin = (clientY: number) => { const r = gridRef.current?.getBoundingClientRect(); if (!r) return gridStart; return Math.max(gridStart, Math.min(gridEnd, gridStart + snap((clientY - r.top) / PXM))) }
  const overGrid = (clientX: number) => { const r = gridRef.current?.getBoundingClientRect(); return !!r && clientX >= r.left && clientX <= r.right }
  const topOf = (m: number) => (m - gridStart) * PXM
  const hOf = (d: number) => Math.max(SNAP * PXM, d * PXM)

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const m = yToMin(e.clientY)
      setDrag(d => {
        if (!d) return d
        if (d.kind === 'new' || d.kind === 'newfree') return { ...d, moved: true, curMin: overGrid(e.clientX) ? m : null, x: e.clientX, y: e.clientY }
        if (d.kind === 'move') return { ...d, curMin: Math.max(gridStart, Math.min(gridEnd - d.dur, m - d.grab)), x: e.clientX, y: e.clientY }
        if (d.kind === 'session') return { ...d, moved: true, curMin: Math.max(gridStart, Math.min(Math.round(now), m - d.grab)), x: e.clientX, y: e.clientY }
        return { ...d, curDur: Math.max(SNAP, Math.min(gridEnd - d.start, snap(m - d.start))), x: e.clientX, y: e.clientY }
      })
    }
    const up = () => {
      const d = dragRef.current
      if (d) {
        if (d.kind === 'new') { if (d.moved && d.curMin != null) onAdd(d.task, d.curMin, d.dur); else { setSelFree(null); setSelTask(p => p === d.task.task.id ? null : (d.task.task.id || null)) } }
        else if (d.kind === 'newfree') { if (d.moved && d.curMin != null) onAddFree(d.name, d.curMin, d.dur); else { setSelTask(null); setSelFree(p => p === d.name ? null : d.name) } }
        else if (d.kind === 'move') onPatch(d.id, { start: d.curMin })
        else if (d.kind === 'session') { if (d.curMin !== d.start0) onSessionStart(d.curMin); else if (session?.taskId) onOpenTask(session.taskId) }
        else onPatch(d.id, { dur: d.curDur })
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [drag !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const schedIds = new Set(scheduled.map(s => s.taskId).filter(Boolean))
  // Épicas presentes en las tareas por agendar (para el filtro).
  const planEpicas = [...new Map((tasks || []).filter(t => !schedIds.has(t.task.id)).map(t => [t.epicaId, { id: t.epicaId, name: t.epicaName, color: t.color }])).values()]
  const pending = (tasks || []).filter(t => !schedIds.has(t.task.id) && (!epFilter || t.epicaId === epFilter))
  const colorFor = (s: ScheduledBlock) => (tasks || []).find(t => t.task.id === s.taskId)?.color || AREAS[s.area]?.color || '#8b8379'
  const hours: number[] = []; for (let h = gridStart; h <= gridEnd; h += 60) hours.push(h)
  const gridH = (gridEnd - gridStart) * PXM

  // Popup en vivo con la hora/duración mientras se arrastra o redimensiona.
  const dragLabel = (() => {
    if (!drag) return null
    if (drag.kind === 'new' || drag.kind === 'newfree') { if (drag.curMin == null) return null; return { x: drag.x, y: drag.y, txt: `${clock(drag.curMin)}–${clock(drag.curMin + drag.dur)} · ${hm(drag.dur)}` } }
    if (drag.kind === 'move') return { x: drag.x, y: drag.y, txt: `${clock(drag.curMin)}–${clock(drag.curMin + drag.dur)} · ${hm(drag.dur)}` }
    if (drag.kind === 'session') return { x: drag.x, y: drag.y, txt: `empezó ${clock(drag.curMin)} · ${hm(Math.max(0, Math.round(now) - drag.curMin))}` }
    return { x: drag.x, y: drag.y, txt: `${clock(drag.start)}–${clock(drag.start + drag.curDur)} · ${hm(drag.curDur)}` }
  })()

  const chip = (t: TodayTask, onDown: (e: ReactPointerEvent) => void) => {
    const sel = selTask === t.task.id
    return (
      <div key={t.task.id} onPointerDown={onDown}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 14, cursor: 'grab', touchAction: 'none',
          background: sel ? '#f5ece2' : '#faf7f1', border: `1px solid ${sel ? '#b4653a' : '#e7dfd2'}` }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: t.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task.t || 'Tarea'}</div>
          <div style={{ fontSize: 11.5, color: '#a49b90', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.epicaName}</div>
        </div>
        <button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(t)} title="Ver la actividad completa" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '4px 10px', fontSize: 12, color: '#6b645b', cursor: 'pointer', flexShrink: 0 }}>Ver</button>
        <span style={{ fontSize: 16, color: '#c9c0b3', flexShrink: 0 }}>⠿</span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.1 }}>Planificador</span>
        <span style={{ fontSize: 14, color: '#6b645b', lineHeight: 1.5, maxWidth: 640 }}>Arrastra una tarea o rutina a la hora en que la vas a hacer. Estira su borde inferior para fijar cuánto durará (por defecto 15 min). <b>Doble clic</b> en una hora registra algo que <b>ya hiciste</b>. Lo que ya hiciste sale a la izquierda (clic para abrir o ↻ volver a empezar).{(selTask || selFree) ? ' — Toca una hora en el calendario para colocarla.' : ''}</span>
        {/* Selector de día de la semana */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => onPickDay(addDaysISO(week[0], -7))} title="Semana anterior" style={weekNav}>‹</button>
          <div className="plan-days">
            {week.map((d, i) => {
              const on = d === day, isTd = d === today
              return (
                <button key={d} onClick={() => onPickDay(d)} title={longDayOf(d)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 40, padding: '6px 4px', borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${on ? '#b4653a' : isTd ? '#d9b48a' : '#e7dfd2'}`, background: on ? '#b4653a' : '#faf7f1', color: on ? '#faf7f1' : '#6b645b' }}>
                  <span style={{ fontSize: 10.5, opacity: .8 }}>{DN[i]}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Number(d.slice(8, 10))}</span>
                </button>
              )
            })}
          </div>
          <button onClick={() => onPickDay(addDaysISO(week[0], 7))} title="Semana siguiente" style={weekNav}>›</button>
          {!isToday && <button onClick={() => onPickDay(today)} style={{ border: '1px solid #ddd4c6', background: 'transparent', borderRadius: 999, padding: '7px 13px', fontSize: 13, color: '#6b645b', cursor: 'pointer' }}>Hoy</button>}
          <span style={{ fontSize: 13.5, color: '#a49b90', marginLeft: 4, textTransform: 'capitalize' }}>{longDayOf(day)}</span>
        </div>
        {/* Leyenda de carriles */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#a49b90' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#e9f0e6', border: '1px solid #b6cbab' }} />hecho (izquierda)</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: '#fff', border: '1px solid #b4653a' }} />plan (derecha)</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: 'repeating-linear-gradient(45deg,#f2ece0,#f2ece0 4px,#efe8db 4px,#efe8db 8px)', border: '1px solid #e7dfd2' }} />rutina · 🗓 juntas</span>
        </div>
      </div>

      <div className="plan-wrap">
        {/* Rejilla de horas */}
        <div className="t-card" style={{ ...card(0), padding: 0, overflow: 'hidden', flex: 1, minWidth: 0 }}>
          <div ref={gridRef}
            onPointerDown={e => { if (selTask) { const t = (tasks || []).find(x => x.task.id === selTask); if (t) { onAdd(t, yToMin(e.clientY)); setSelTask(null) } } else if (selFree) { onAddFree(selFree, yToMin(e.clientY)); setSelFree(null) } }}
            onDoubleClick={e => { if (!selTask && !selFree) setDoneAt(yToMin(e.clientY)) }}
            title="Doble clic en una hora para registrar algo que ya hiciste"
            style={{ position: 'relative', height: gridH, marginLeft: 52, borderLeft: '1px solid #eee6da', cursor: (selTask || selFree) ? 'copy' : 'default' }}>
            {/* Líneas de hora */}
            {hours.map(h => (
              <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: topOf(h), height: 1, background: '#eee6da' }}>
                <span style={{ position: 'absolute', left: -50, top: -8, fontSize: 11.5, color: '#a49b90', fontVariantNumeric: 'tabular-nums' }}>{clock(h)}</span>
              </div>
            ))}
            {/* Fondo: bloques protegidos (rutina) */}
            {blocks.map(b => (
              <div key={'b' + b.id} title={b.name} style={{ position: 'absolute', left: 2, right: 6, top: topOf(b.start), height: hOf(b.dur), background: 'repeating-linear-gradient(45deg,#f2ece0,#f2ece0 6px,#efe8db 6px,#efe8db 12px)', border: '1px solid #e7dfd2', borderRadius: 8, padding: '3px 8px', overflow: 'hidden', pointerEvents: 'none' }}>
                <span style={{ fontSize: 11, color: '#a49b90' }}>🛡 {b.name} · {clock(b.start)}</span>
              </div>
            ))}
            {/* Reuniones del calendario (clic → detalle con lugar/links/Meet) */}
            {meetings.map(m => (
              <div key={'m' + m.id} onClick={() => onOpenMeeting(m)} title={`${m.name || 'Ocupado'} · clic para ver el detalle`} style={{ position: 'absolute', left: 2, right: 6, top: topOf(m.start), height: hOf(m.dur), background: 'rgba(46,90,158,.10)', border: '1px solid rgba(46,90,158,.28)', borderRadius: 8, padding: '3px 8px', overflow: 'hidden', cursor: 'pointer', zIndex: 3 }}>
                <span style={{ fontSize: 11, color: '#2E5A9E' }}>🗓 {m.name || 'Ocupado'} · {clock(m.start)}</span>
              </div>
            ))}
            {/* Divisor de carriles hecho | plan */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#f0e8db', pointerEvents: 'none' }} />
            {/* Actividades YA HECHAS ese día (registro real, carril izquierdo) */}
            {worked.map((w, i) => {
              const col = AREAS[w.area]?.color || '#7a9e6a'; const tall = w.dur * PXM >= 40
              const future = isToday && w.start > now && !w.done
              const openable = !!w.taskId
              return (
                <div key={'w' + i} title={`${w.name} · ${clock(w.start)}–${clock(w.start + w.dur)} · ${hm(w.dur)}${openable ? ' · clic para abrir' : ''}`}
                  onClick={() => { if (openable) onOpenTask(w.taskId!) }}
                  onPointerMove={e => setHover({ x: e.clientX, y: e.clientY, txt: `${w.name} · ${clock(w.start)}–${clock(w.start + w.dur)} · ${hm(w.dur)}` })}
                  onPointerLeave={() => setHover(null)}
                  style={{ position: 'absolute', left: 2, width: 'calc(50% - 8px)', top: topOf(w.start), height: hOf(w.dur), background: future ? '#fbeeee' : '#eef3ea', border: `1px solid ${future ? '#e0a6a0' : '#c1d4b6'}`, borderLeft: `4px solid ${future ? '#c0392b' : col}`, borderRadius: 8, padding: tall ? '5px 8px' : '2px 8px', overflow: 'hidden', cursor: openable ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: future ? '#c0392b' : '#5c7a4e', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{future ? '⚠ ' : '✓ '}{clock(w.start)}–{clock(w.start + w.dur)} · {hm(w.dur)}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); onResume(w) }} title="Volver a empezar" style={planBtn}>↻</button>
                      {openable && <button onClick={e => { e.stopPropagation(); onOpenTask(w.taskId!) }} title="Ver actividad" style={planBtn}>✎</button>}
                    </div>
                  </div>
                  {tall && <div style={{ fontSize: 12.5, color: '#3f4a37', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>}
                </div>
              )
            })}
            {/* Línea de ahora (sólo hoy) */}
            {isToday && now >= gridStart && now <= gridEnd && (
              <div style={{ position: 'absolute', left: -6, right: 0, top: topOf(now), height: 2, background: '#c0392b', pointerEvents: 'none', zIndex: 5 }}>
                <span style={{ position: 'absolute', left: -46, top: -8, fontSize: 11, color: '#c0392b', fontWeight: 600 }}>{clock(Math.round(now))}</span>
              </div>
            )}
            {/* Actividad EN CURSO. La banda cubre la EXTENSIÓN PLANEADA (start→start+planeado) para
                ver "lo que estaba planificado"; adentro, relleno sólido de lo que ya llevas (start→ahora).
                Clic = abre el popup de la tarea · arrastrar = corrige la hora de inicio. */}
            {session && (() => {
              const start = drag?.kind === 'session' ? drag.curMin : session.start
              const nowM = Math.round(now)
              const plannedEnd = session.plannedDur > 0 ? start + session.plannedDur : nowM
              const endM = Math.max(start + SNAP, plannedEnd, nowM)   // llega a lo planeado o a ahora (si te pasaste)
              const doneH = Math.max(0, Math.min(endM, nowM) - start) // lo transcurrido dentro de la banda
              return (
                <div onPointerDown={e => { setHover(null); e.stopPropagation(); setDrag({ kind: 'session', grab: yToMin(e.clientY) - session.start, start0: start, curMin: start, moved: false, x: e.clientX, y: e.clientY }) }}
                  onPointerMove={e => { if (!drag) setHover({ x: e.clientX, y: e.clientY, txt: `${session.name} · en curso · empezó ${clock(start)}${session.plannedDur > 0 ? ` · planeado ${hm(session.plannedDur)}` : ''} · llevas ${hm(session.dur)}` }) }}
                  onPointerLeave={() => setHover(null)}
                  title="Actividad en curso — clic para abrir · arrastra para corregir la hora en que empezaste"
                  style={{ position: 'absolute', left: 2, right: 6, top: topOf(start), height: hOf(endM - start), background: 'rgba(192,57,43,.05)', border: '1.5px solid #c0392b', borderRadius: 10, cursor: 'grab', touchAction: 'none', zIndex: 26, overflow: 'hidden' }}>
                  {/* relleno de lo transcurrido */}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: hOf(doneH), background: 'rgba(192,57,43,.13)', pointerEvents: 'none' }} />
                  <div style={{ position: 'relative', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: '#c0392b', flexShrink: 0 }}>▶ EN CURSO</span>
                    <span style={{ fontSize: 11.5, color: '#8b8379', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{clock(start)}{session.plannedDur > 0 ? `–${clock(plannedEnd)} · planeado ${hm(session.plannedDur)}` : ''} · llevas {hm(session.dur)}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</span>
                  </div>
                </div>
              )
            })()}
            {/* Bloques agendados (arrastrables) */}
            {scheduled.map(s => {
              const start = drag?.kind === 'move' && drag.id === s.id ? drag.curMin : s.start
              const dur = drag?.kind === 'resize' && drag.id === s.id ? drag.curDur : s.dur
              const t = (tasks || []).find(x => x.task.id === s.taskId)
              const col = colorFor(s); const tall = dur * PXM >= 46
              const active = drag && 'id' in drag && drag.id === s.id
              return (
                <div key={s.id}
                  onPointerDown={e => { setHover(null); e.stopPropagation(); setDrag({ kind: 'move', id: s.id, dur: s.dur, grab: yToMin(e.clientY) - s.start, curMin: s.start, x: e.clientX, y: e.clientY }) }}
                  onPointerMove={e => { if (!drag) setHover({ x: e.clientX, y: e.clientY, txt: `${s.name} · ${clock(s.start)}–${clock(s.start + s.dur)} · ${hm(s.dur)}` }) }}
                  onPointerLeave={() => setHover(null)}
                  style={{ position: 'absolute', left: '50%', right: 6, top: topOf(start), height: hOf(dur), background: '#fff', border: `1px solid ${col}`, borderLeft: `4px solid ${col}`, borderRadius: 10, padding: tall ? '7px 10px' : '3px 10px', overflow: 'hidden', cursor: 'grab', touchAction: 'none', boxShadow: active ? '0 6px 18px rgba(28,26,23,.16)' : '0 1px 3px rgba(28,26,23,.06)', zIndex: active ? 20 : 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, color: '#a49b90', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{clock(start)}–{clock(start + dur)} · {hm(dur)}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button onPointerDown={e => e.stopPropagation()} onClick={() => onStart(s)} title="Comenzar ahora" style={planBtn}>▶</button>
                      {t && <button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(t)} title="Ver actividad" style={planBtn}>✎</button>}
                      <button onPointerDown={e => e.stopPropagation()} onClick={() => onRemove(s.id)} title="Quitar del plan" style={planBtn}>×</button>
                    </div>
                  </div>
                  {/* Asa para redimensionar */}
                  <div onPointerDown={e => { e.stopPropagation(); setDrag({ kind: 'resize', id: s.id, start: s.start, curDur: s.dur, x: e.clientX, y: e.clientY }) }}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 12, cursor: 'ns-resize', touchAction: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 1 }}>
                    <span style={{ width: 26, height: 3, borderRadius: 3, background: col, opacity: .5 }} />
                  </div>
                </div>
              )
            })}
            {/* Fantasma al arrastrar una tarjeta nueva */}
            {(drag?.kind === 'new' || drag?.kind === 'newfree') && drag.curMin != null && (
              <div style={{ position: 'absolute', left: '50%', right: 6, top: topOf(drag.curMin), height: hOf(drag.dur), background: 'rgba(180,101,58,.14)', border: '1.5px dashed #b4653a', borderRadius: 10, pointerEvents: 'none', zIndex: 30 }} />
            )}
          </div>
        </div>

        {/* Columna: tareas por agendar + rutinas diarias */}
        <div className="t-card plan-side" style={{ ...card(12), padding: 18 }}>
          {/* Empezar algo GENERAL al instante (siempre disponible) */}
          <QuickStart onStart={onGeneral} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, borderTop: '1px solid #eee6da', paddingTop: 12 }}>
            <span style={LBL}>por agendar · {isToday ? 'hoy' : longDayOf(day)}</span>
            <span style={{ fontSize: 12, color: '#a49b90' }}>{pending.length}</span>
          </div>
          {/* Nueva tarea + filtro por épica */}
          <button onClick={() => onNewTask(epFilter || undefined)} style={{ alignSelf: 'flex-start', border: '1px dashed #ccc2b2', borderRadius: 999, padding: '8px 14px', fontSize: 13, color: '#8a4b28', cursor: 'pointer', background: 'transparent' }}>+ Nueva tarea{epFilter ? ` en ${planEpicas.find(e => e.id === epFilter)?.name || ''}` : ''}</button>
          {planEpicas.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <button onClick={() => setEpFilter(null)} style={{ border: `1px solid ${!epFilter ? '#b4653a' : '#e7dfd2'}`, background: !epFilter ? '#f5ece2' : '#faf7f1', color: !epFilter ? '#8a4b28' : '#6b645b', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer' }}>Todas</button>
              {planEpicas.map(e => { const on = epFilter === e.id; return (
                <button key={e.id} onClick={() => setEpFilter(on ? null : e.id)} title={e.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${on ? '#b4653a' : '#e7dfd2'}`, background: on ? '#f5ece2' : '#faf7f1', color: on ? '#8a4b28' : '#6b645b', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', maxWidth: 130 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: e.color, flexShrink: 0 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                </button>
              ) })}
            </div>
          )}
          {pending.length ? pending.map(t => chip(t, e => setDrag({ kind: 'new', task: t, dur: 15, moved: false, curMin: null, x: e.clientX, y: e.clientY }))) : (
            <span style={{ fontSize: 13, color: '#a49b90', lineHeight: 1.5 }}>{epFilter ? 'Sin tareas por agendar en esa épica.' : 'No hay tareas planeadas para este día. Crea una con "+ Nueva tarea", cámbiala en Épicas, o arrastra una rutina de abajo.'}</span>
          )}
          {routines.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, borderTop: '1px solid #eee6da', paddingTop: 12, marginTop: 4 }}>
                <span style={LBL}>rutinas diarias</span>
                <span style={{ fontSize: 12, color: '#a49b90' }}>{routines.length}</span>
              </div>
              {routines.map((r, i) => {
                const sel = selFree === r.name
                return (
                  <div key={'r' + i} onPointerDown={e => setDrag({ kind: 'newfree', name: r.name, dur: 15, moved: false, curMin: null, x: e.clientX, y: e.clientY })}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 14, cursor: 'grab', touchAction: 'none', background: sel ? '#f5ece2' : '#faf7f1', border: `1px solid ${sel ? '#b4653a' : '#e7dfd2'}` }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>🔁</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: '#a49b90', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.epicaName}</div>
                    </div>
                    <span style={{ fontSize: 16, color: '#c9c0b3', flexShrink: 0 }}>⠿</span>
                  </div>
                )
              })}
            </>
          )}
          {scheduled.length > 0 && <div style={{ borderTop: '1px solid #eee6da', paddingTop: 10, fontSize: 12, color: '#a49b90' }}>{scheduled.length} en el calendario · {hm(scheduled.reduce((a, s) => a + s.dur, 0))} planeadas</div>}
        </div>
      </div>

      {dragLabel && (
        <div style={{ position: 'fixed', left: dragLabel.x + 14, top: dragLabel.y + 14, zIndex: 99, background: '#1c1a17', color: '#faf7f1', fontSize: 12.5, fontWeight: 600, padding: '6px 10px', borderRadius: 8, pointerEvents: 'none', fontVariantNumeric: 'tabular-nums', boxShadow: '0 4px 14px rgba(0,0,0,.25)' }}>{dragLabel.txt}</div>
      )}
      {hover && !drag && (
        <div style={{ position: 'fixed', left: hover.x + 14, top: hover.y + 14, zIndex: 98, background: '#1c1a17', color: '#faf7f1', fontSize: 12, fontWeight: 500, padding: '6px 10px', borderRadius: 8, pointerEvents: 'none', maxWidth: 280, boxShadow: '0 4px 14px rgba(0,0,0,.25)' }}>{hover.txt}</div>
      )}
      {doneAt !== null && <PlanAddDone tasks={allOpenTasks} defaultStart={doneAt} onConfirm={p => { onAddDone(p); setDoneAt(null) }} onClose={() => setDoneAt(null)} />}
    </div>
  )
}
/** Registrar una actividad YA HECHA en el Planificador (doble clic en la rejilla): elegir una tarea
 *  (buscable + filtro por épica) o "General" libre, hora y duración. */
function PlanAddDone({ tasks, defaultStart, onConfirm, onClose }: {
  tasks: TodayTask[] | null; defaultStart: number
  onConfirm: (p: { name: string; area: Area; start: number; dur: number; taskId?: string; epicaId?: string }) => void
  onClose: () => void
}) {
  const list = (tasks || []).filter(t => t.task.status !== 'Terminada' && t.task.status !== 'Archivada')
  const [mode, setMode] = useState<'task' | 'free'>('task')
  const [q, setQ] = useState(''); const [epF, setEpF] = useState<string | null>(null)
  const [sel, setSel] = useState<string>('')
  const [name, setName] = useState(''); const [area, setArea] = useState<Area>('trabajo')
  const [startStr, setStartStr] = useState(clock(defaultStart))
  const [dur, setDur] = useState(30)
  const eps = [...new Map(list.map(t => [t.epicaId, { id: t.epicaId, name: t.epicaName, color: t.color }])).values()]
  const filtered = list.filter(t => (!epF || t.epicaId === epF) && (!q.trim() || (t.task.t || '').toLowerCase().includes(q.trim().toLowerCase())))
  const areaOpts = (Object.keys(AREAS) as Area[]).filter(k => k !== 'sueno')
  const canSave = mode === 'task' ? !!sel : name.trim().length > 0
  const save = () => {
    if (!canSave) return
    const start = parse(startStr), d = Math.max(5, Math.min(600, dur || 5))
    if (mode === 'task') { const t = list.find(x => x.task.id === sel); if (!t) return; onConfirm({ name: t.task.t || 'Tarea', area: 'trabajo', start, dur: d, taskId: t.task.id, epicaId: t.epicaId }) }
    else onConfirm({ name: name.trim() || 'Actividad', area, start, dur: d })
  }
  const field: CSSProperties = { background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontVariantNumeric: 'tabular-nums' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 95 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ width: 'min(460px,100%)', maxHeight: '90vh', overflowY: 'auto', background: '#faf7f1', border: '1px solid #e7dfd2', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={LBL}>registrar algo hecho · a las {clock(parse(startStr))}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#a49b90', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#e7dfd2', padding: 4, borderRadius: 999, alignSelf: 'flex-start' }}>
          {([['task', 'Tarea de Épicas'], ['free', 'General / libre']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setMode(k)} style={{ border: 'none', cursor: 'pointer', padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: mode === k ? '#faf7f1' : 'transparent', color: mode === k ? '#1c1a17' : '#6b645b' }}>{lbl}</button>
          ))}
        </div>
        {mode === 'task' ? (
          list.length ? (<>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tarea…" style={field} />
            {eps.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <button onClick={() => setEpF(null)} style={{ border: `1px solid ${!epF ? '#b4653a' : '#e2d9cb'}`, background: !epF ? '#f5ece2' : '#faf7f1', color: !epF ? '#8a4b28' : '#6b645b', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer' }}>Todas</button>
                {eps.map(e => { const on = epF === e.id; return <button key={e.id} onClick={() => setEpF(on ? null : e.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${on ? '#b4653a' : '#e2d9cb'}`, background: on ? '#f5ece2' : '#faf7f1', color: on ? '#8a4b28' : '#6b645b', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', maxWidth: 140 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: e.color, flexShrink: 0 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span></button> })}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', border: '1px solid #eee6da', borderRadius: 14, padding: 8 }}>
              {filtered.length ? filtered.map(t => { const on = t.task.id === sel; return (
                <button key={t.task.id} onClick={() => setSel(t.task.id!)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', border: `1px solid ${on ? '#b4653a' : 'transparent'}`, background: on ? '#f5ece2' : 'transparent', borderRadius: 12, padding: '9px 11px', cursor: 'pointer' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task.t || 'Tarea'}</span>
                  <span style={{ fontSize: 12, color: '#a49b90', flexShrink: 0 }}>{t.epicaName}</span>
                </button>
              ) }) : <span style={{ fontSize: 13, color: '#a49b90', padding: 8 }}>Sin coincidencias.</span>}
            </div>
          </>) : <span style={{ fontSize: 13.5, color: '#a49b90' }}>No hay tareas abiertas. Usa “General / libre”.</span>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="¿Qué hiciste? (general…)" style={{ ...field, flex: 1, minWidth: 180 }} />
            <select value={area} onChange={e => setArea(e.target.value as Area)} style={{ ...field, cursor: 'pointer' }}>{areaOpts.map(k => <option key={k} value={k}>{AREAS[k].label}</option>)}</select>
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={LBL}>empezó</span><input type="time" value={startStr} onChange={e => setStartStr(e.target.value)} style={field} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={LBL}>duró</span><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="number" min={5} max={600} step={5} value={dur} onChange={e => setDur(Math.max(5, Math.min(600, Number(e.target.value) || 5)))} style={{ ...field, width: 78 }} /><span style={{ fontSize: 13, color: '#a49b90' }}>min</span></div></div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{[15, 30, 45, 60, 90].map(p => <button key={p} onClick={() => setDur(p)} style={{ border: `1px solid ${dur === p ? '#c2933a' : '#e2d9cb'}`, background: dur === p ? 'rgba(194,147,58,.12)' : '#faf7f1', color: dur === p ? '#8a4b28' : '#6b645b', borderRadius: 999, padding: '5px 11px', fontSize: 12, cursor: 'pointer' }}>{hm(p)}</button>)}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <button disabled={!canSave} onClick={save} style={{ flex: 1, textAlign: 'center', background: canSave ? '#1c1a17' : '#c9c0b3', color: '#faf7f1', border: 'none', borderRadius: 999, padding: 14, fontSize: 15, fontWeight: 500, cursor: canSave ? 'pointer' : 'default' }}>✓ Registrar como hecho</button>
          <button onClick={onClose} style={{ border: '1px solid #ddd4c6', background: 'transparent', borderRadius: 999, padding: '14px 18px', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
const planBtn: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#8b8379', width: 22, height: 22, borderRadius: 6, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const weekNav: CSSProperties = { border: '1px solid #e7dfd2', background: '#faf7f1', borderRadius: 999, width: 32, height: 36, fontSize: 18, color: '#6b645b', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }

function ScheduleModal({ tasks, defaultStart, presetTaskId, presetName, existing = [], onSchedule, onClose }: {
  tasks: TodayTask[] | null; defaultStart: number; presetTaskId?: string | null; presetName?: string | null
  existing?: { name: string; start: number; dur: number }[]
  onSchedule: (b: ScheduledBlock, createInCal: boolean) => void; onClose: () => void
}) {
  const [inCal, setInCal] = useState(false)   // también crear el evento en Google Calendar
  const list = (tasks || [])
  const presetTask = presetTaskId ? list.find(t => t.task.id === presetTaskId) : undefined
  const [mode, setMode] = useState<'task' | 'free'>(presetTask ? 'task' : presetName ? 'free' : list.length ? 'task' : 'free')
  const [sel, setSel] = useState<string>(presetTask?.task.id || list[0]?.task.id || '')
  const [name, setName] = useState(presetName || 'Actividad')
  const [area, setArea] = useState<Area>(presetName ? 'trabajo' : 'ocio')
  const [startStr, setStartStr] = useState(clock(defaultStart))
  const [dur, setDur] = useState<number>(durByDiff((presetTask || list[0])?.task))
  // Campo de texto de duración independiente: permite BORRAR y teclear libremente (el número real
  // `dur` se actualiza al vuelo si es válido y se acota [5,600] al salir del campo). Antes el
  // `|| 5` en cada tecla lo forzaba a 5 y no se podía borrar.
  const [durStr, setDurStr] = useState(String(dur))
  const setDuration = (n: number) => { const c = Math.max(5, Math.min(600, Math.round(n))); setDur(c); setDurStr(String(c)) }
  const startMin = parse(startStr)
  const endStr = clock(startMin + dur)
  const areaOpts = (Object.keys(AREAS) as Area[]).filter(k => k !== 'sueno')
  const canSave = mode === 'task' ? !!sel : name.trim().length > 0
  const confirm = () => {
    if (!canSave) return
    const d = Math.max(5, Math.min(600, dur || 5))   // acota siempre, aunque teclee y dé Agendar sin salir del campo
    if (mode === 'task') {
      const t = list.find(x => x.task.id === sel); if (!t) return
      onSchedule({ id: uid(), name: t.task.t || 'Tarea', area: 'trabajo', start: startMin, dur: d, epicaId: t.epicaId, taskId: t.task.id }, inCal)
    } else {
      onSchedule({ id: uid(), name: name.trim() || 'Actividad', area, start: startMin, dur: d }, inCal)
    }
  }
  const field: CSSProperties = { background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontVariantNumeric: 'tabular-nums' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 92 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Agendar en tu día" style={{ width: 'min(460px,100%)', maxHeight: '90vh', overflowY: 'auto', background: '#faf7f1', border: '1px solid #e7dfd2', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={LBL}>agendar a las {clock(startMin)}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#a49b90', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 4, background: '#e7dfd2', padding: 4, borderRadius: 999, alignSelf: 'flex-start' }}>
          {([['task', 'Tarea de Épicas'], ['free', 'Actividad libre']] as const).map(([k, lbl]) => {
            const on = mode === k
            return <button key={k} onClick={() => setMode(k)} style={{ border: 'none', cursor: 'pointer', padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: on ? '#faf7f1' : 'transparent', color: on ? '#1c1a17' : '#6b645b' }}>{lbl}</button>
          })}
        </div>

        {mode === 'task' ? (
          list.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', border: '1px solid #eee6da', borderRadius: 14, padding: 8 }}>
              {list.map(t => { const on = t.task.id === sel; return (
                <button key={t.task.id} onClick={() => { setSel(t.task.id!); setDuration(durByDiff(t.task)) }} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', border: `1px solid ${on ? '#b4653a' : 'transparent'}`, background: on ? '#f5ece2' : 'transparent', borderRadius: 12, padding: '9px 11px', cursor: 'pointer' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, display: 'block', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task.t || 'Tarea'}</span>
                  <span style={{ fontSize: 12, color: '#a49b90', flexShrink: 0 }}>{t.epicaName}</span>
                </button>
              ) })}
            </div>
          ) : <span style={{ fontSize: 13.5, color: '#a49b90', lineHeight: 1.5 }}>No tienes tareas para este día. Cambia a “Actividad libre” o plánealas en Épicas.</span>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="¿Qué vas a hacer?" style={{ ...field, flex: 1, minWidth: 180 }} />
            <select value={area} onChange={e => setArea(e.target.value as Area)} style={{ ...field, cursor: 'pointer' }}>
              {areaOpts.map(k => <option key={k} value={k}>{AREAS[k].label}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={LBL}>a las</span>
            <input type="time" value={startStr} onChange={e => setStartStr(e.target.value)} style={field} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={LBL}>termina</span>
            <input type="time" value={endStr} onChange={e => { let end = parse(e.target.value); if (end <= startMin) end += 1440; setDuration(end - startMin) }} style={field} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={LBL}>duración</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" min={5} max={600} step={5} inputMode="numeric" value={durStr}
                onChange={e => { const v = e.target.value; setDurStr(v); const n = parseInt(v, 10); if (Number.isFinite(n) && n > 0) setDur(n) }}
                onBlur={() => { let n = parseInt(durStr, 10); if (!Number.isFinite(n) || n < 5) n = 5; if (n > 600) n = 600; setDur(n); setDurStr(String(n)) }}
                style={{ ...field, width: 78 }} />
              <span style={{ fontSize: 13, color: '#a49b90' }}>min</span>
            </div>
          </div>
        </div>
        {/* Presets rápidos de duración */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[15, 30, 45, 60, 90, 120].map(p => { const on = dur === p; return (
            <button key={p} onClick={() => setDuration(p)} style={{ cursor: 'pointer', border: `1px solid ${on ? '#c2933a' : '#e2d9cb'}`, background: on ? 'rgba(194,147,58,0.12)' : '#faf7f1', color: on ? '#8a4b28' : '#6b645b', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 600 }}>{hm(p)}</button>
          ) })}
        </div>
        <input type="range" min={15} max={300} step={15} value={Math.min(300, dur)} onChange={e => setDuration(Number(e.target.value))} aria-label="Duración" style={{ width: '100%', height: 24, accentColor: '#c2933a' }} />

        {(() => {
          const clash = existing.filter(b => startMin < b.start + b.dur && startMin + dur > b.start)
          if (!clash.length) return null
          return <div style={{ fontSize: 12.5, color: '#8a3c2a', background: '#f7ece2', border: '1px solid #ecd9cb', borderRadius: 12, padding: '9px 12px', lineHeight: 1.45 }}>⚠ Se encima con {clash.map(c => `«${c.name}» (${clock(c.start)}–${clock(c.start + c.dur)})`).join(', ')}. Puedes moverla más tarde.</div>
        })()}

        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: '#2E5A9E', cursor: 'pointer' }}>
          <input type="checkbox" checked={inCal} onChange={e => setInCal(e.target.checked)} />
          🗓 Crear también el evento en Google Calendar
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <button disabled={!canSave} onClick={confirm} style={{ flex: 1, textAlign: 'center', background: canSave ? '#1c1a17' : '#c9c0b3', color: '#faf7f1', border: 'none', borderRadius: 999, padding: 14, fontSize: 15, fontWeight: 500, cursor: canSave ? 'pointer' : 'default' }}>Agendar a las {clock(startMin)}</button>
          <button onClick={onClose} style={{ border: '1px solid #ddd4c6', background: 'transparent', borderRadius: 999, padding: '14px 18px', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

/** Tareas del día (de Épicas): elegir una para trabajarla, editarla, o arrastrarla para reordenar. */
function TaskPicker({ tasks, rank, stale, selId, draggable, mitIds, onToggleMit, onReorder, onQuick, onSchedule, onRemove, onPick, onEdit }: { tasks: TodayTask[] | null; rank?: Record<string, number>; stale?: Record<string, number>; selId: string | null; draggable: boolean; mitIds: string[]; onToggleMit: (t: TodayTask) => void; onReorder: (ids: string[]) => void; onQuick: (t: TodayTask) => void; onSchedule: (t: TodayTask) => void; onRemove: (t: TodayTask) => void; onPick: (t: TodayTask) => void; onEdit: (t: TodayTask) => void }) {
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

  // Reordenar con botones ▲▼ (móvil: arrastrar el ⠿ es difícil al tocar).
  const moveRow = (id: string, dir: 1 | -1) => {
    const cur = (order && order.length ? order : tasks.map(t => t.task.id!))
    const i = cur.indexOf(id); if (i < 0) return
    const j = i + dir; if (j < 0 || j >= cur.length) return
    const next = cur.slice();[next[i], next[j]] = [next[j], next[i]]
    setOrder(next); onReorder(next)
  }
  const arrowBtn: CSSProperties = { border: 'none', background: 'transparent', color: '#a49b90', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '3px 4px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 0 4px', width: '100%' }}>
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: '#a49b90', fontSize: 12 }}>▸</span>
        <span style={{ ...LBL, letterSpacing: '.1em' }}>tus tareas del día</span>
        <span style={{ fontSize: 12, color: '#a49b90' }}>{display.length}{draggable ? ' · ▲▼ para reordenar' : ' · toca una'}</span>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {display.map(t => {
        const on = t.task.id === selId
        const ts = taskStyle(t.task.status)
        const dragging = dragId.current === t.task.id
        const isMit = mitIds.includes(t.task.id!)
        const pos = display.findIndex(x => x.task.id === t.task.id); const n = display.length
        return (
          <div key={t.task.id} data-taskid={t.task.id} draggable onDragStart={e => { e.dataTransfer.setData('text/taskid', t.task.id!); e.dataTransfer.effectAllowed = 'copy' }} title="Arrástrala a la cinta “el día” para agendarla" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 12, borderLeft: isMit ? '3px solid #c2933a' : undefined, border: `1px solid ${on ? '#b4653a' : 'transparent'}`, background: dragging ? '#efe6d8' : isMit ? '#f8efdc' : on ? '#f7ece2' : 'transparent' }}>
            <div className="t-dayrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {draggable && (
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <button onClick={() => moveRow(t.task.id!, -1)} disabled={pos === 0} aria-label="Subir" title="Subir" style={{ ...arrowBtn, opacity: pos === 0 ? 0.25 : 1, cursor: pos === 0 ? 'default' : 'pointer' }}>▲</button>
                    <button onClick={() => moveRow(t.task.id!, 1)} disabled={pos === n - 1} aria-label="Bajar" title="Bajar" style={{ ...arrowBtn, opacity: pos === n - 1 ? 0.25 : 1, cursor: pos === n - 1 ? 'default' : 'pointer' }}>▼</button>
                  </span>
                  <span onPointerDown={e => startDrag(e, t.task.id!)} title="Arrastrar para reordenar" style={{ cursor: 'grab', color: '#c2b9ab', fontSize: 15, touchAction: 'none', padding: '0 2px' }}>⠿</span>
                </span>
              )}
              <button onClick={() => onToggleMit(t)} title={isMit ? 'Quitar de foco de hoy' : 'Marcar como foco de hoy (máx 3)'} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 15, flexShrink: 0, padding: 0, lineHeight: 1, color: isMit ? '#c2933a' : '#c9c0b3' }}>{isMit ? '★' : '☆'}</button>
              <span onClick={() => onPick(t)} className="t-dayrow-name" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, flex: 1, cursor: 'pointer', minWidth: 0 }}>
                {draggable && (() => { const num = rank?.[t.task.id!] ?? (pos + 1); return <span title={`Lugar ${num} en tu orden del día`} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 999, background: '#efe6d8', color: '#8a4b28', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>{num}</span> })()}
                <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, display: 'block', flexShrink: 0, marginTop: 5 }} />
                <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: '#1c1a17', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{t.task.t || 'Sin título'}</span>
              </span>
              <button onClick={() => onQuick(t)} title="Empezar ahora (contador libre)" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer', flexShrink: 0 }}>▶</button>
              <button onClick={() => onSchedule(t)} title="Agendar a una hora del día" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, color: '#8a4b28', cursor: 'pointer', flexShrink: 0 }}>⏰</button>
              <button onClick={() => onEdit(t)} title="Ver / trabajar la tarea" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, color: '#6b645b', cursor: 'pointer', flexShrink: 0 }}>Ver</button>
              <button onClick={() => onRemove(t)} title="Quitar de tus tareas de hoy" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, width: 28, height: 28, fontSize: 15, color: '#a49b90', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: draggable ? 28 : 20 }}>
              <Tag c={t.color} bg={t.color + '22'}>{t.epicaName}</Tag>
              <Tag c={ts.c} bg={ts.bg}>{ts.label}</Tag>
              {t.recurring && <Tag c="#7A6FB0" bg="rgba(122,111,176,0.14)">diaria</Tag>}
              {stale?.[t.task.id!] != null && <span title={`La empezaste pero llevas ${stale[t.task.id!]} días sin avanzarla`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#8a3c2a', background: '#f6e3dd', border: '1px solid #e8cabf', borderRadius: 999, padding: '2px 8px' }}>⏳ {stale[t.task.id!]}d sin avanzar</span>}
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
function FilterBar({ epicas, filters, setFilters, sortBy, setSortBy }: { epicas: { id: string; name: string; color: string }[]; filters: Filters; setFilters: (f: (p: Filters) => Filters) => void; sortBy: string; setSortBy: (s: 'manual' | 'plan' | 'alfa' | 'prioridad' | 'dificultad') => void }) {
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
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'manual' | 'plan' | 'alfa' | 'prioridad' | 'dificultad')} style={{ border: '1px solid #e2d9cb', background: '#faf7f1', borderRadius: 999, padding: '5px 10px', fontSize: 12, color: '#6b645b', cursor: 'pointer' }}>
            <option value="plan">Plan del día</option>
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
function TaskDetail({ info, epicas, resumenReady, remindReady, comentariosReady, nextPlanOrder, onAutoSave, onUnplan, onCreate, onStart, onLinkObjetivo, onClose }: {
  info: { epicaId: string; epicaName: string; color: string; task: EpicaTask; creating?: boolean }
  epicas: { id: string; name: string; color: string; kpis: EpicaMilestone[]; links?: EpicaLink[] }[]
  resumenReady: boolean
  remindReady: boolean
  comentariosReady: boolean
  nextPlanOrder: (day: string) => number
  onAutoSave: (epicaId: string, t: EpicaTask) => void
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
  const [epLinksOpen, setEpLinksOpen] = useState(true)   // dropdown "Enlaces de {épica}" (abierto por defecto para que se vean)
  const [nlLabel, setNlLabel] = useState('')              // nuevo link: etiqueta
  const [nlUrl, setNlUrl] = useState('')                  // nuevo link: url
  const [subPop, setSubPop] = useState<number | null>(null)  // subtarea abierta (editar nota/links/%)
  const [slLabel, setSlLabel] = useState('')             // nuevo link de subtarea: etiqueta
  const [slUrl, setSlUrl] = useState('')                 // nuevo link de subtarea: url
  const noteRef = useRef<HTMLDivElement>(null)
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushRef = useRef<() => void>(() => {})   // guarda pendiente lo último (usado al cerrar)
  // La nota es contentEditable NO controlado: se fija una sola vez al abrir; así el
  // re-render del reloj (cada segundo) no reescribe ni borra lo que estás tecleando.
  useEffect(() => { if (noteRef.current) noteRef.current.innerHTML = sanitizeHtml(info.task.note || '') }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (subPop !== null) { setSubPop(null); return } flushRef.current(); onClose() } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose, subPop])
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
  // Auto-guardado: cada cambio se escribe solo a Épicas (debounce 600ms); no hay que picar "Guardar".
  flushRef.current = () => { if (saveT.current) { clearTimeout(saveT.current); saveT.current = null } if (!creating) onAutoSave(epId, withNote()) }
  useEffect(() => {
    if (creating) return
    if (saveT.current) clearTimeout(saveT.current)
    saveT.current = setTimeout(() => onAutoSave(epId, withNote()), 600)
    return () => { if (saveT.current) clearTimeout(saveT.current) }
  }, [t, epId])   // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { flushRef.current(); onClose() }
  const invested = (t.progressLog || []).reduce((s, e) => s + ((e as { min?: number }).min || 0), 0)
  const epObj = epicas.find(e => e.id === epId)
  const epColor = epObj?.color || info.color
  const epLinks = (epObj?.links || []).filter(l => l.url && l.url !== '#')   // conexiones de la épica (Personas, etc.)
  const diasTrab = new Set((t.progressLog || []).map(l => l.d)).size          // días distintos trabajados
  const diasCon = t.createdAt ? Math.max(0, Math.round((Date.parse(iso(new Date()) + 'T00:00:00') - Date.parse(t.createdAt + 'T00:00:00')) / 86400000)) : 0
  const addLink = () => { const url = nlUrl.trim(), label = nlLabel.trim(); if (!url && !label) return; setLinks(a => [...a, { label, url }]); setNlLabel(''); setNlUrl('') }
  const setSubs = (fn: (a: NonNullable<EpicaTask['subtasks']>) => NonNullable<EpicaTask['subtasks']>) => setT(p => ({ ...p, subtasks: fn(p.subtasks || []) }))
  const setLinks = (fn: (a: NonNullable<EpicaTask['links']>) => NonNullable<EpicaTask['links']>) => setT(p => ({ ...p, links: fn(p.links || []) }))
  const addComment = () => { if (!comment.trim()) return; setT(p => ({ ...p, comentarios: [...(p.comentarios || []), { at: new Date().toISOString(), text: comment.trim() }] })); setComment('') }
  // Marcar terminada desde aquí: guarda TODO (edits + terminada en la fecha "hacer") en una escritura y cierra.
  const markDoneHere = () => {
    if (saveT.current) { clearTimeout(saveT.current); saveT.current = null }
    const base = withNote(); const day = doneDayFor(base, iso(new Date()))
    // Recurrente semanal/mensual → reprograma; diaria → repeatDone; normal → Terminada.
    const done: EpicaTask = base.repeat
      ? (base.repeat.unit !== 'dia'
          ? completeRecurring(base, day, nextPlanOrder)
          : { ...base, repeatDone: (base.repeatDone || []).includes(day) ? base.repeatDone! : [...(base.repeatDone || []), day] })
      : { ...base, status: 'Terminada', doneAt: day }
    onAutoSave(epId, done); onClose()
  }

  return (
    <div onClick={creating ? onClose : close} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 10px', overflow: 'auto', fontFamily: 'var(--tiempo-ui), system-ui, sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-label={creating ? 'Nueva tarea' : 'Editar tarea'} onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 1160, maxHeight: '96vh', background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 4, background: epColor, flexShrink: 0 }} />
        <div style={{ padding: '20px 24px 22px', display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'sticky', top: -20, background: '#fff', zIndex: 3, paddingTop: 20, marginTop: -20 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: epColor }} />{creating ? 'Nueva tarea' : info.epicaName}{!creating && <span style={{ color: 'rgba(20,35,61,0.4)' }}>· se guarda solo</span>}</div>
            <button aria-label="Cerrar" onClick={creating ? onClose : close} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 15 }}>✕</button>
          </div>

          {creating && (<><NLbl>Épica</NLbl><select value={epId} onChange={e => setEpId(e.target.value)} style={{ ...nf, width: '100%' }}>{epicas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></>)}

          <input autoFocus value={t.t} placeholder="¿Qué hay que hacer?" onChange={e => setT({ ...t, t: e.target.value })} style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 24, lineHeight: 1.1, color: '#10233F', border: 'none', outline: 'none', background: 'transparent', margin: '8px 0 4px', padding: 0, width: '100%' }} />

          {/* Resumen de la actividad (qué es y qué se quiere lograr) — distinto de la nota */}
          <div style={{ margin: '8px 0 14px' }}>
            <NLbl>Resumen</NLbl>
            {resumenReady
              ? <textarea value={t.resumen || ''} onChange={e => setT({ ...t, resumen: e.target.value })} rows={3} placeholder="¿Qué es esta actividad y qué quieres lograr?" style={{ ...nf, width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, marginTop: 4 }} />
              : <div style={{ ...nf, width: '100%', color: 'rgba(20,35,61,0.5)', fontSize: 12, marginTop: 4 }}>Corre <code>sql/tareas-resumen.sql</code> en Supabase para activar este campo.</div>}
          </div>

          {!creating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '2px 0 10px' }}>
              {t.createdAt && <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)' }}>Creada · {cap(new Date(t.createdAt + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }))}</span>}
              {invested > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#2E6E6E' }}>⏱ {hm(invested)} invertidos</span>}
              {t.status !== 'Terminada' && diasCon >= 1 && <span style={{ fontSize: 11, fontWeight: 700, color: '#A87A2C' }}>🕐 llevas {diasCon} {diasCon === 1 ? 'día' : 'días'} en esto</span>}
              {diasTrab >= 2 && <span title="Días distintos en que le has metido mano" style={{ fontSize: 11, fontWeight: 700, color: '#7A6FB0' }}>⧗ trabajada en {diasTrab} días</span>}
              {t.repeat && <span style={{ fontSize: 11, fontWeight: 700, color: '#7A6FB0', background: 'rgba(122,111,176,0.10)', border: '1px solid rgba(122,111,176,0.28)', borderRadius: 99, padding: '2px 9px' }}>↻ Se repite{t.repeat.unit === 'dia' ? ' cada día' : t.repeat.unit === 'semana' ? ' cada semana' : t.repeat.unit === 'mes' ? ' cada mes' : ''}{(t.repeatDone?.length ?? 0) > 0 ? ` · ${t.repeatDone!.length} ${t.repeatDone!.length === 1 ? 'ciclo' : 'ciclos'}` : ''}</span>}
            </div>
          )}

          {/* Enlaces de la épica (conexiones: Personas, Dashboard, etc.) — igual que en Épicas */}
          {!creating && epLinks.length > 0 && (
            <div style={{ marginBottom: 14, borderRadius: 12, border: '1px solid rgba(15,35,64,0.10)', overflow: 'hidden' }}>
              <button onClick={() => setEpLinksOpen(o => !o)} aria-expanded={epLinksOpen} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: 'none', background: '#FBFAF6', padding: '10px 12px' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: epColor, flexShrink: 0 }} />
                <span style={{ font: '700 10px/1 var(--tiempo-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.6)' }}>Enlaces de {epObj?.name || info.epicaName}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(20,35,61,0.45)' }}>{epLinks.length}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.45)', transform: epLinksOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
              </button>
              {epLinksOpen && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px', borderTop: '1px solid rgba(15,35,64,0.08)' }}>
                  {epLinks.map((l, li) => (
                    <a key={li} href={safeUrl(l.url)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600, color: '#16365F', background: '#fff', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 99, padding: '5px 11px' }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: typeColor(l.type), flexShrink: 0 }} />{l.l}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="td-grid" style={{ marginTop: 6 }}>
          <div className="td-col">
          <NLbl>Estado</NLbl>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[...TASK_STATUSES, 'Archivada'].map(s => { const ts = taskStyle(s); const on = t.status === s; return <button key={s} onClick={() => setT(p => {
              // Terminar una RECURRENTE marca el día en repeatDone (sigue repitiéndose), no la cierra.
              if (s === 'Terminada' && p.repeat) { const day = doneDayFor(p, iso(new Date())); return { ...p, repeatDone: (p.repeatDone || []).includes(day) ? p.repeatDone : [...(p.repeatDone || []), day] } }
              return { ...p, status: s, doneAt: s === 'Terminada' ? (p.doneAt || doneDayFor(p, iso(new Date()))) : undefined }
            })} style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, border: on ? `1px solid ${ts.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? ts.bg : '#fff', color: on ? ts.c : 'rgba(20,35,61,0.55)' }}>{ts.label}</button> })}
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
            <button onClick={() => setT(p => {
              const day = doneDayFor(p, iso(new Date()))
              return p.repeat
                ? { ...p, progress: 100, repeatDone: (p.repeatDone || []).includes(day) ? p.repeatDone : [...(p.repeatDone || []), day] }
                : { ...p, progress: 100, status: 'Terminada', doneAt: p.doneAt || day }
            })} style={{ border: '1px solid rgba(62,142,142,0.35)', background: 'rgba(62,142,142,0.10)', color: '#2E6E6E', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>100%</button>
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

          </div>
          <div className="td-col">
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
            {t.status === 'Terminada' && <label style={{ display: 'flex', flexDirection: 'column' }}><NLbl>Terminada el</NLbl><input type="date" value={t.doneAt || ''} onChange={e => setT({ ...t, doneAt: e.target.value || undefined })} style={{ ...nf, border: '1px solid rgba(62,142,142,0.4)', color: t.doneAt ? '#2E6E6E' : 'rgba(20,35,61,0.4)', background: t.doneAt ? 'rgba(62,142,142,0.08)' : '#fff' }} /></label>}
            <label style={{ display: 'flex', flexDirection: 'column' }}><NLbl>Hacer (plan)</NLbl><input type="date" value={t.plan || ''} onChange={e => setT({ ...t, plan: e.target.value })} style={nf} /></label>
            <label style={{ display: 'flex', flexDirection: 'column' }}><NLbl>Vence</NLbl><input type="date" value={t.due || ''} onChange={e => setT({ ...t, due: e.target.value })} style={nf} /></label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column' }}><NLbl>Recordarme 🔔</NLbl><input type="datetime-local" disabled={!remindReady} title={remindReady ? undefined : 'Corre sql/epicas-06-remind.sql en Supabase para usar recordatorios'} value={isoToLocalInput(t.remindAt)} onChange={e => setT({ ...t, remindAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} style={{ ...nf, width: '100%', opacity: remindReady ? 1 : 0.5 }} /></label>

          <NLbl>Repetición</NLbl>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {([['', 'No se repite'], ['dia', 'Cada día'], ['semana', 'Cada semana'], ['mes', 'Cada mes']] as const).map(([u, lbl]) => {
              const on = u ? t.repeat?.unit === u : !t.repeat
              return <button key={u || 'no'} onClick={() => setT({ ...t, repeat: u ? { every: 1, unit: u } : undefined, ...(u ? {} : { repeatUntil: undefined }) })} style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, border: on ? '1px solid #7A6FB0' : '1px solid rgba(15,35,64,0.14)', background: on ? 'rgba(122,111,176,0.12)' : '#fff', color: on ? '#5E5490' : 'rgba(20,35,61,0.55)' }}>{lbl}</button>
            })}
            {t.repeat && <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(20,35,61,0.55)' }}>hasta<input type="date" value={t.repeatUntil || ''} onChange={e => setT({ ...t, repeatUntil: e.target.value || undefined })} style={{ ...nf, padding: '6px 8px' }} /></label>}
          </div>

          <NLbl>Nota</NLbl>
          <div ref={noteRef} className="ep-note" contentEditable suppressContentEditableWarning onBlur={() => { if (!creating) onAutoSave(epId, withNote()) }} style={{ ...nf, minHeight: 60, maxHeight: 200, overflowY: 'auto', lineHeight: 1.55, width: '100%', display: 'block' }} />

          <div style={{ marginTop: 14 }}><NLbl>Subtareas · {(t.subtasks || []).filter(s => s.done).length}/{(t.subtasks || []).length}</NLbl></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {(t.subtasks || []).map((s, i) => ({ s, i })).sort((a, b) => (a.s.done ? 1 : 0) - (b.s.done ? 1 : 0)).map(({ s, i }) => (
              <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <button onClick={() => setSubs(a => a.map((x, j) => { if (j !== i) return x; const nd = !x.done; return { ...x, done: nd, doneAt: nd ? new Date().toISOString() : undefined } }))} style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid ' + (s.done ? '#3E8E8E' : 'rgba(15,35,64,0.25)'), background: s.done ? '#3E8E8E' : '#fff', cursor: 'pointer', flexShrink: 0 }} />
                <input value={s.t} onChange={e => setSubs(a => a.map((x, j) => j === i ? { ...x, t: e.target.value } : x))} style={{ ...nf, flex: 1, textDecoration: s.done ? 'line-through' : 'none' }} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {typeof s.progress === 'number' && s.progress > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{s.progress}%</span>}
                  {s.note && <span title="Tiene nota" style={{ fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>✎</span>}
                  {(s.links?.length ?? 0) > 0 && <span title={`${s.links!.length} link(s)`} style={{ fontSize: 10, fontWeight: 700, color: '#A87A2C' }}>🔗{s.links!.length}</span>}
                </span>
                <button onClick={() => { setSlLabel(''); setSlUrl(''); setSubPop(i) }} title="Nota, links y % de la subtarea" style={{ border: '1px solid rgba(15,35,64,0.1)', background: '#fff', borderRadius: 8, height: 30, width: 30, color: 'rgba(20,35,61,0.55)', cursor: 'pointer', flexShrink: 0, fontSize: 14 }}>⋯</button>
                <button onClick={() => setSubs(a => a.filter((_, j) => j !== i))} style={{ border: '1px solid rgba(15,35,64,0.1)', background: '#fff', borderRadius: 8, height: 30, width: 30, color: 'rgba(20,35,61,0.5)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px dashed rgba(15,35,64,0.25)', flexShrink: 0 }} />
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSubQuick() }} placeholder="Agregar subtarea y Enter…" style={{ ...nf, flex: 1 }} />
            </div>
          </div>

          <div style={{ marginTop: 14, marginBottom: 6 }}><span style={eb}>Links</span></div>
          {(t.links || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 8 }}>
              {(t.links || []).map((l, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)', borderRadius: 99, padding: '6px 6px 6px 12px' }}>
                  <a href={safeUrl(l.url)} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>🔗 {l.label || l.url}</a>
                  <button onClick={() => setLinks(a => a.filter((_, j) => j !== i))} aria-label="Quitar link" style={{ border: 'none', background: 'transparent', color: 'rgba(168,122,44,0.75)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 2px' }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <input value={nlLabel} placeholder="Etiqueta" onChange={e => setNlLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }} style={{ ...nf, flex: '0 0 120px', width: 120 }} />
            <input value={nlUrl} placeholder="https://…" onChange={e => setNlUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }} style={{ ...nf, flex: 1, minWidth: 0 }} />
            <button onClick={addLink} style={smallBtn}>+ Link</button>
          </div>

          <NLbl>Comentarios</NLbl>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(t.comentarios || []).map((c, i) => (
              <div key={i} style={{ fontSize: 13, color: '#3a4a63', lineHeight: 1.5 }}><span style={{ color: 'rgba(20,35,61,0.45)' }}>{new Date(c.at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · </span>{c.text}</div>
            ))}
            {comentariosReady ? (
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={comment} placeholder="Escribe un comentario…" onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment() }} style={{ ...nf, flex: 1 }} />
                <button onClick={addComment} style={smallBtn}>Comentar</button>
              </div>
            ) : <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.5)' }}>Para comentar, corre <code>sql/epicas-07-comentarios.sql</code> en Supabase.</span>}
          </div>

          </div>
          </div>

          {/* Comenzar (contador). dur 0 = libre */}
          {!creating && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(15,35,64,0.08)', paddingTop: 14, marginTop: 16 }}>
              <div style={eb}>Comenzar · {startDur ? 'estimo ' + hm(startDur) : 'contador libre'}</div>
              <input type="range" min={0} max={240} step={15} value={startDur} onChange={e => setStartDur(Number(e.target.value))} style={{ width: '100%', accentColor: '#C2933A' }} />
              <button onClick={() => { if (saveT.current) { clearTimeout(saveT.current); saveT.current = null } onStart({ epicaId: epId, task: withNote() }, startDur) }} style={{ background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>▶ Comenzar {startDur ? hm(startDur) : 'ahora'}</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', borderTop: '1px solid rgba(15,35,64,0.08)', paddingTop: 14 }}>
            {creating
              ? <button onClick={() => onCreate(epId, withNote())} disabled={!t.t.trim() || !epId} style={{ flex: 1, minWidth: 130, background: '#16365F', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!t.t.trim() || !epId) ? .5 : 1 }}>Crear tarea</button>
              : <>
                <button onClick={markDoneHere} style={{ flex: 1, minWidth: 120, background: '#2E6E6E', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>✓ Terminar</button>
                <button onClick={() => { if (saveT.current) { clearTimeout(saveT.current); saveT.current = null } onUnplan(epId, withNote()) }} style={{ border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.06)', color: '#B0522E', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, cursor: 'pointer' }}>Quitar de hoy</button>
                <button onClick={close} style={{ border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.6)', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Listo</button>
              </>}
          </div>
          {!creating && <a href={`/epicas?v=dia&d=${t.plan || iso(new Date())}&e=${epId}&t=${t.id}`} target="_blank" rel="noopener noreferrer" style={{ textAlign: 'center', fontSize: 12, color: 'rgba(20,35,61,0.45)', marginTop: 10 }}>También abrir en Épicas ↗</a>}
        </div>
      </div>

      {/* Popup de subtarea: nota, links y % (como en Épicas) */}
      {subPop !== null && (t.subtasks || [])[subPop] && (() => {
        const s = (t.subtasks || [])[subPop!]
        const upd = (patch: Partial<NonNullable<EpicaTask['subtasks']>[number]>) => setSubs(a => a.map((x, j) => j === subPop ? { ...x, ...patch } : x))
        const addSl = () => { const url = slUrl.trim(), label = slLabel.trim(); if (!url && !label) return; upd({ links: [...(s.links || []), { label, url }] }); setSlLabel(''); setSlUrl('') }
        return (
          <div onClick={e => { e.stopPropagation(); setSubPop(null) }} style={{ position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflow: 'auto' }}>
            <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Subtarea" style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <input value={s.t} onChange={e => upd({ t: e.target.value })} placeholder="Subtarea" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 20, color: '#10233F', border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: 0, padding: 0 }} />
                <button onClick={() => setSubPop(null)} style={{ flexShrink: 0, border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 30, width: 30, color: 'rgba(20,35,61,0.55)', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!s.done} onChange={e => upd({ done: e.target.checked, doneAt: e.target.checked ? new Date().toISOString() : undefined })} /> Completada
              </label>
              <div><NLbl>Avance · {s.progress || 0}%</NLbl><input type="range" min={0} max={100} step={5} value={s.progress || 0} onChange={e => upd({ progress: Number(e.target.value) })} style={{ width: '100%', accentColor: '#3E8E8E' }} /></div>
              <div><NLbl>Nota</NLbl><textarea value={s.note || ''} onChange={e => upd({ note: e.target.value })} rows={3} placeholder="Nota de la subtarea…" style={{ ...nf, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} /></div>
              <NLbl>Links</NLbl>
              {(s.links || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {(s.links || []).map((l, li) => (
                    <span key={li} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)', borderRadius: 99, padding: '6px 6px 6px 12px' }}>
                      <a href={safeUrl(l.url)} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>🔗 {l.label || l.url}</a>
                      <button onClick={() => upd({ links: (s.links || []).filter((_, j) => j !== li) })} style={{ border: 'none', background: 'transparent', color: 'rgba(168,122,44,0.75)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 2px' }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <input value={slLabel} onChange={e => setSlLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSl() }} placeholder="Etiqueta" style={{ ...nf, flex: '0 0 120px', width: 120 }} />
                <input value={slUrl} onChange={e => setSlUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSl() }} placeholder="https://…" style={{ ...nf, flex: 1, minWidth: 0 }} />
                <button onClick={addSl} style={smallBtn}>+ Link</button>
              </div>
              <button onClick={() => setSubPop(null)} style={{ marginTop: 4, background: '#16365F', color: '#fff', border: 'none', borderRadius: 10, padding: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Listo</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/** Editor de una entrada del registro de hoy (localStorage). */
function HistoryEditor({ row, idx, onSave, onDelete, onReopen, onSyncDone, onResume, onClose }: {
  row: AppData['history'][number]; idx: number
  onSave: (idx: number, patch: Partial<AppData['history'][number]>) => void; onDelete: (idx: number) => void; onReopen: (idx: number) => void
  onSyncDone: (row: AppData['history'][number], done: boolean) => void; onResume: (row: AppData['history'][number]) => void; onClose: () => void
}) {
  const [r, setR] = useState(row)
  // Auto-guardado (debounce): cada cambio se guarda solo, sin picar "Guardar".
  useEffect(() => { const id = setTimeout(() => onSave(idx, { name: r.name, area: r.area, start: r.start, dur: r.dur, done: r.done !== false }), 450); return () => clearTimeout(id) }, [r])   // eslint-disable-line react-hooks/exhaustive-deps
  const flush = () => onSave(idx, { name: r.name, area: r.area, start: r.start, dur: r.dur, done: r.done !== false })
  const close = () => { flush(); onClose() }
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const field: CSSProperties = { background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 12, padding: '10px 12px', fontSize: 14, color: '#1c1a17', boxSizing: 'border-box' }
  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(28,26,23,.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 90 }}>
      <div role="dialog" aria-modal="true" aria-label="Editar registro" onClick={e => e.stopPropagation()} style={{ width: 'min(440px,100%)', background: '#f5efe4', border: '1px solid #e7dfd2', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: SERIF, fontSize: 22 }}>Editar registro <span style={{ fontFamily: 'inherit', fontSize: 12, color: '#a49b90' }}>· se guarda solo</span></span>
          <button onClick={close} style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#a49b90', cursor: 'pointer', lineHeight: 1 }}>×</button>
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
          <input type="checkbox" checked={r.done !== false} onChange={e => { const v = e.target.checked; setR({ ...r, done: v }); if (row.taskId) onSyncDone(row, v) }} />
          Se terminó la actividad {r.done === false && <span style={{ color: '#8a4b28' }}>· solo se le invirtió tiempo</span>}
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
          <button onClick={close} style={{ flex: 1, minWidth: 120, background: '#1c1a17', color: '#faf7f1', border: 'none', borderRadius: 999, padding: 13, fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Listo</button>
          <button onClick={() => onDelete(idx)} style={{ border: '1px solid #e2d9cb', background: 'transparent', color: '#8a3c2a', borderRadius: 999, padding: '13px 18px', fontSize: 14, cursor: 'pointer' }}>Borrar</button>
        </div>
        <button onClick={() => onResume(row)} title="Arranca una nueva sesión de esto ahora; se acumula al tiempo anterior" style={{ border: '1px solid #e2d9cb', background: '#faf7f1', color: '#8a4b28', borderRadius: 999, padding: '11px 16px', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>↻ Volver a trabajar en esto ahora</button>
        {row.taskId && <button onClick={() => onReopen(idx)} style={{ border: '1px solid #e2d9cb', background: 'transparent', color: '#8a4b28', borderRadius: 999, padding: '11px 16px', fontSize: 13.5, cursor: 'pointer' }}>No estaba terminada · reabrir la tarea en Épicas</button>}
      </div>
    </div>
  )
}

/** Registrar cuánto dormiste una noche (alimenta racha y deuda de sueño). */
function SleepLogger({ onLog }: { onLog: (date: string, mins: number) => void }) {
  const [h, setH] = useState('')
  const [date, setDate] = useState(addDaysISO(iso(new Date()), -1))
  const field: CSSProperties = { background: '#faf7f1', border: '1px solid #e2d9cb', borderRadius: 999, padding: '7px 11px', fontSize: 13, color: '#1c1a17', boxSizing: 'border-box' }
  const submit = () => { const hrs = parseFloat(h.replace(',', '.')); if (!isNaN(hrs) && hrs >= 0 && hrs <= 24) { onLog(date, Math.round(hrs * 60)); setH('') } }
  return (
    <div style={{ borderTop: '1px solid #ebe3d6', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ ...LBL }}>registrar cuánto dormiste</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...field, fontVariantNumeric: 'tabular-nums' }} />
        <input type="number" min={0} max={24} step={0.25} value={h} placeholder="horas" onChange={e => setH(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} style={{ ...field, width: 84 }} />
        <span style={{ fontSize: 13, color: '#a49b90' }}>h</span>
        <button onClick={submit} style={{ background: '#1c1a17', color: '#faf7f1', border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Registrar</button>
      </div>
    </div>
  )
}

const MARGEN_CSS = `
.hoy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 20px; align-items: start; }
.hoy-grid > * { min-width: 0; }
/* Vista Hoy en 2 paneles (Resumen | Tareas) con minimizar/maximizar. */
.hoy-panels { display: flex; gap: 20px; align-items: flex-start; }
.hoy-panel { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.hoy-panel-head { display: flex; align-items: center; gap: 8px; padding: 2px 2px 0; }
.hoy-rail { flex: 0 0 48px; align-self: flex-start; position: sticky; top: 12px; max-height: calc(100dvh - 24px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 14px 0; border: 1px solid #ece3d5; border-radius: 18px; background: #fff; box-shadow: 0 6px 18px -12px rgba(28,26,23,.4); }
.hoy-rail-txt { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 12px; font-weight: 600; letter-spacing: .04em; color: #6b645b; white-space: nowrap; }
@media (max-width: 860px) { .hoy-panels { flex-direction: column; } .hoy-panel { width: 100% !important; } .hoy-rail { flex-direction: row; align-self: auto; width: 100%; height: 44px; padding: 0 14px; } .hoy-rail-txt { writing-mode: horizontal-tb; transform: none; } }
/* Plan de hoy: rejilla + columna de tareas por agendar. */
.plan-wrap { display: flex; gap: 16px; align-items: flex-start; }
.plan-side { flex: 0 0 288px; display: flex; flex-direction: column; gap: 8px; position: sticky; top: 12px; max-height: calc(100dvh - 24px); overflow-y: auto; }
.plan-days { display: flex; gap: 5px; flex-wrap: wrap; }
@media (max-width: 820px) { .plan-wrap { flex-direction: column-reverse; } .plan-side { flex: none; width: 100%; position: static; max-height: none; } }
/* Editor de tarea a 2 columnas en pantallas anchas (se apila en móvil). */
.td-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 32px; align-items: start; }
.td-grid > .td-col { min-width: 0; display: flex; flex-direction: column; }
@media (max-width: 760px) { .td-grid { grid-template-columns: 1fr; } }
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
/* Con el nav como barra fija abajo (≤700px), los elementos anclados abajo suben para no taparse. */
@media (max-width: 700px) {
  .t-abovenav { bottom: calc(92px + env(safe-area-inset-bottom)) !important; }
  .t-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; max-width: 100%; }
  .t-tabs::-webkit-scrollbar { display: none; }
  .t-tabs > div { padding: 8px 14px !important; font-size: 13px !important; }
}
@media (max-width: 640px) {
  .tiempo-body { padding: 14px 12px 24px !important; }
  .tiempo-sub { gap: 10px !important; }
  .hoy-grid { gap: 12px !important; }
  .hoy-grid > *, .t-card { padding: 18px !important; border-radius: 20px !important; }
  .t-hero { font-size: 56px !important; line-height: .9 !important; }
  .t-clock { font-size: 24px !important; }
  .t-daychip { min-width: 0 !important; }
  /* Filas del día / de tareas: el nombre ocupa la 1ª línea; hora y botones bajan a la 2ª (no se aplasta el título). */
  .t-dayrow { flex-wrap: wrap !important; row-gap: 7px !important; }
  .t-dayrow-name { flex-basis: 62% !important; white-space: normal !important; }
  .t-dayrow > button { min-height: 32px; }
  /* Etiquetas de energía: sólo cada 3 horas en móvil (no se enciman). */
  .nrg-lbl-min { visibility: hidden; }
}
@media (max-width: 400px) {
  .t-hero { font-size: 46px !important; }
  .hoy-grid > *, .t-card { padding: 15px !important; }
}
`
