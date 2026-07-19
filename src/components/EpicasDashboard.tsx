'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import type { Epica, EpicaKpi, EpicaRoutine, EpicaTask, EpicaLink, EpicaTaskLink, EpicaSubtask, EpicaProgressEntry, EpicaRepeat } from '@/lib/supabase'
import HeaderStats from './HeaderStats'
import CumplesWidget from './CumplesWidget'
import ExcepcionalesWidget from './ExcepcionalesWidget'
import FavoritosStrip from './FavoritosStrip'
import { WidgetsDropdown, SpecialsDropdown } from './HeaderWidgets'

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
function todayISO(): string {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** Etiqueta de mes ("Julio 2026") para agrupar terminadas; '' → "Sin fecha". */
function monthLabel(s: string): string {
  if (!s) return 'Sin fecha'
  const d = new Date(s + 'T00:00:00'); if (isNaN(d.getTime())) return 'Sin fecha'
  const l = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  return l.charAt(0).toUpperCase() + l.slice(1)
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/* ─── Recurrencia ─────────────────────────────────────────────
   Una tarea que se repite no se duplica: al completarla se reprograma
   a su siguiente fecha. Así el backlog no se llena de copias y la
   bitácora de la tarea conserva todo su historial en un solo lugar. */

/** Suma meses conservando el día; si el mes destino es más corto, cae en su último día
 *  (31 de enero + 1 mes → 28/29 de febrero, no el 3 de marzo). */
function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1 + n, 1)
  const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  t.setDate(Math.min(d, lastDay))
  const p = (x: number) => String(x).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}
/** Siguiente ocurrencia después de `after`. Si completaste con retraso, salta los
 *  ciclos perdidos en vez de dejarte una fecha ya vencida. */
function nextOccurrence(from: string, r: EpicaRepeat, after: string): string {
  const every = Math.max(1, Math.round(r.every || 1))
  const step = (iso: string) => r.unit === 'mes'
    ? addMonths(iso, every)
    : addDays(iso, every * (r.unit === 'semana' ? 7 : 1))
  let d = step(from)
  for (let guard = 0; d <= after && guard < 500; guard++) d = step(d)
  return d
}
function repeatLabel(r: EpicaRepeat): string {
  const n = Math.max(1, Math.round(r.every || 1))
  if (r.unit === 'dia') return n === 1 ? 'cada día' : `cada ${n} días`
  if (r.unit === 'semana') return n === 1 ? 'cada semana' : `cada ${n} semanas`
  return n === 1 ? 'cada mes' : `cada ${n} meses`
}
const REPEAT_TONE = { c: '#7A6FB0', bg: 'rgba(122,111,176,0.10)', border: 'rgba(122,111,176,0.32)' }

/** Registra el % del día de hoy en la bitácora (upsert). No muta arrays compartidos. */
function upsertProgressPct(task: EpicaTask, pct: number) {
  const today = todayISO()
  const log = [...(task.progressLog || [])]
  const idx = log.findIndex(x => x.d === today)
  if (idx >= 0) log[idx] = { ...log[idx], pct }
  else log.push({ d: today, pct })
  log.sort((a, b) => b.d.localeCompare(a.d))
  task.progressLog = log
}
/** Delta por día (asc): cada entrada con pct guarda cuánto cambió respecto a la anterior con pct. */
function progressDeltas(log: EpicaProgressEntry[]): Record<string, number> {
  const asc = [...log].filter(e => typeof e.pct === 'number').sort((a, b) => a.d.localeCompare(b.d))
  const out: Record<string, number> = {}
  let last = 0
  asc.forEach(e => { out[e.d] = (e.pct as number) - last; last = e.pct as number })
  return out
}

/** Rellena arrays faltantes por si algún registro viejo trae null. */
function normalize(e: Epica): Epica {
  return {
    ...e,
    categoria: e.categoria ?? null,
    archived: !!e.archived,
    kpis: e.kpis || [],
    routines: (e.routines || []).map(r => {
      const days = (r.days && r.days.length === 7) ? r.days : [false, false, false, false, false, false, false]
      // Migra el progreso legado (days) a la semana actual si aún no hay historial por semana
      const weeks = (r.weeks && typeof r.weeks === 'object') ? r.weeks : (days.some(Boolean) ? { [mondayISO(todayISO())]: days } : {})
      return { t: r.t, days, weeks }
    }),
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

/* ─── Plan de hoy ─────────────────────────────────────────────── */
type Prio = 'alta' | 'media' | 'baja'
const PRIO_RANK: Record<Prio, number> = { alta: 0, media: 1, baja: 2 }

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function addMonth(yyyyMM: string, n: number): string {
  const b = new Date(yyyyMM + '-01T00:00:00'); b.setMonth(b.getMonth() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${b.getFullYear()}-${p(b.getMonth() + 1)}`
}
function dateLabel(iso: string): string {   // "Miércoles 15 de julio"
  return cap(new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }))
}
function weekdayAbbr(iso: string): string { // "Mié"
  return cap(new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')).slice(0, 3)
}
const dayNum = (iso: string) => Number(iso.slice(8, 10))
function relShort(iso: string): string {    // etiqueta del chip de la tira
  const o = daysUntil(iso); return o === 0 ? 'Hoy' : o === 1 ? 'Mañana' : weekdayAbbr(iso)
}
function relLong(iso: string): string {     // frase del masthead
  const o = daysUntil(iso); if (o == null) return ''
  if (o === 0) return 'Hoy'; if (o === 1) return 'Mañana'; if (o === -1) return 'Ayer'
  return o > 0 ? `En ${o} días` : `Hace ${-o} días`
}
function weekendISO(fromISO: string): string {          // "Este finde": hoy si ya es finde; si no, próx. sábado
  const g = new Date(fromISO + 'T00:00:00').getDay()    // 0 dom … 6 sáb
  return (g === 6 || g === 0) ? fromISO : addDays(fromISO, 6 - g)
}
function monthGrid(yyyyMM: string): string[] {          // 42 celdas (6×7), lunes primero
  const lead = (new Date(yyyyMM + '-01T00:00:00').getDay() + 6) % 7
  const start = addDays(yyyyMM + '-01', -lead)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
function mondayISO(iso: string): string {               // lunes de la semana que contiene iso
  const g = new Date(iso + 'T00:00:00').getDay()        // 0 dom … 6 sáb
  return addDays(iso, -((g + 6) % 7))
}
function weekRangeLabel(monday: string): string {       // "14–20 jul" (o "28 jul – 3 ago")
  const sunday = addDays(monday, 6)
  const mM = cap(new Date(monday + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))
  const sM = cap(new Date(sunday + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))
  return mM === sM ? `${dayNum(monday)}–${dayNum(sunday)} ${mM}` : `${dayNum(monday)} ${mM} – ${dayNum(sunday)} ${sM}`
}
function getRoutineWeek(r: EpicaRoutine, monday: string): boolean[] {
  const w = r.weeks?.[monday]
  return (w && w.length === 7) ? w : [false, false, false, false, false, false, false]
}
function routineStats(r: EpicaRoutine) {
  const now = todayISO()
  const curMonth = now.slice(0, 7), curYear = now.slice(0, 4)
  const q = Math.floor((Number(now.slice(5, 7)) - 1) / 3)
  const curMon = mondayISO(now)
  let total = 0, week = 0, month = 0, quarter = 0, year = 0, best = 0, activeWeeks = 0
  const recent: { monday: string; count: number }[] = []
  Object.entries(r.weeks || {}).forEach(([monday, arr]) => {
    if (!Array.isArray(arr)) return
    let wc = 0
    arr.forEach((on, di) => {
      if (!on) return
      total++; wc++
      const d = addDays(monday, di)
      if (d.slice(0, 7) === curMonth) month++
      if (d.slice(0, 4) === curYear) { year++; if (Math.floor((Number(d.slice(5, 7)) - 1) / 3) === q) quarter++ }
    })
    if (wc > 0) activeWeeks++
    if (wc > best) best = wc
    if (monday === curMon) week = wc
    recent.push({ monday, count: wc })
  })
  recent.sort((a, b) => b.monday.localeCompare(a.monday))
  return { total, week, month, quarter, year, best, activeWeeks, recent: recent.slice(0, 8) }
}
function todayLabel(): string {
  const s = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}
/** Prioridad por defecto al agregar, inferida de la cercanía de la fecha. */
function prioFromDue(due: string): Prio {
  const dl = daysUntil(due)
  if (dl == null) return 'media'
  if (dl <= 3) return 'alta'
  if (dl <= 14) return 'media'
  return 'baja'
}
function prioStyle(p: Prio | undefined) {
  const m: Record<Prio, { n: number; c: string; accent: string; accentW: number; label: string }> = {
    alta:  { n: 3, c: '#C2933A', accent: 'linear-gradient(180deg,#E7C56B,#C2933A)', accentW: 3, label: 'Alta' },
    media: { n: 2, c: '#16365F', accent: 'rgba(16,54,95,0.42)', accentW: 2, label: 'Media' },
    baja:  { n: 1, c: '#5B6B86', accent: 'transparent', accentW: 0, label: 'Baja' },
  }
  return m[p || 'media']
}
/** Medidor de 3 barras ascendentes: codifica prioridad por forma + color (legible en gris). */
function PrioBars({ p, size = 14 }: { p: Prio | undefined; size?: number }) {
  const ps = prioStyle(p)
  const hs = [6, 10, 14]
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ display: 'block' }}>
      {hs.map((h, i) => (
        <rect key={i} x={i * 5} y={14 - h} width={3} height={h} rx={1}
          fill={i < ps.n ? ps.c : 'rgba(20,35,61,0.14)'} />
      ))}
    </svg>
  )
}
function ProgressRing({ pct, done }: { pct: number; done: boolean }) {
  const size = 42, sw = 4, r = (size - sw) / 2, c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(15,35,64,0.1)" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={done ? '#2E6E6E' : '#C2933A'} strokeWidth={sw}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .5s, stroke .3s' }} />
    </svg>
  )
}
function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>
  )
}
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Posición de un popover anclado a su fila: hacia abajo por defecto, hacia arriba
 *  cuando no cabe (en las últimas filas el menú se salía del borde visible). */
function popPos(up: boolean, gap: number): CSSProperties {
  return up
    ? { position: 'absolute', bottom: '100%', right: 0, marginBottom: gap }
    : { position: 'absolute', top: '100%', right: 0, marginTop: gap }
}
/** ¿Hay espacio bajo el botón para un popover de `h` px? */
function shouldFlipUp(el: HTMLElement, h: number) {
  const r = el.getBoundingClientRect()
  return window.innerHeight - r.bottom < h && r.top > h
}

/** Props para que un elemento clicable sea alcanzable y accionable por teclado.
 *  Varias filas de la página eran divs con onClick: invisibles para Tab y Enter.
 *  `asRow` omite role="button", que sobre un <tr> rompería la semántica de tabla. */
function clickable(fn: () => void, label?: string, asRow = false) {
  return {
    ...(asRow ? {} : { role: 'button' as const }),
    tabIndex: 0,
    'aria-label': label,
    onClick: fn,
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        if (ev.target !== ev.currentTarget) return   // deja pasar los controles internos
        ev.preventDefault(); fn()
      }
    },
  }
}

type EpicDraft = Omit<Epica, 'id'> & { id: string | null }

/* ─── Preferencias de vista (persisten entre recargas) ───────── */
const PREFS_KEY = 'advl_epicas_prefs_v1'
type Prefs = {
  sortBy: 'Pendientes' | 'Progreso' | 'Nombre'
  compact: boolean; showRowKpi: boolean
  estadoFilter: 'activas' | 'archivadas' | 'todas'; catFilter: string
  planSort: 'plan' | 'prioridad' | 'entrega' | 'avance' | 'epica'
  planFilter: 'todas' | 'alta' | 'vencidas' | 'avance'
  epicSort: 'grupo' | 'prioridad' | 'entrega' | 'hacer' | 'progreso' | 'nombre'
  epicFilter: 'todas' | 'planeadas' | 'sinplan' | 'vencidas' | 'alta'
  backlogOpen: boolean; backlogSort: { key: string; dir: 'asc' | 'desc' }
  backlogView: 'tabla' | 'tablero'
  backlogDone: boolean; backlogFEpica: string; backlogFStatus: string; backlogFPrio: string
  featuredId: string | null
}
const DEFAULT_PREFS: Prefs = {
  sortBy: 'Pendientes', compact: false, showRowKpi: true,
  estadoFilter: 'activas', catFilter: 'todas',
  planSort: 'plan', planFilter: 'todas', epicSort: 'grupo', epicFilter: 'todas',
  backlogOpen: false, backlogSort: { key: 'due', dir: 'asc' }, backlogView: 'tabla',
  backlogDone: false, backlogFEpica: 'todas', backlogFStatus: 'todas', backlogFPrio: 'todas',
  featuredId: null,
}
function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } }
  catch { return DEFAULT_PREFS }
}

export default function EpicasDashboard({ initialEpics }: { initialEpics: Epica[] }) {
  const [epics, setEpics] = useState<Epica[]>(initialEpics.map(normalize))
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [today, setToday] = useState<string>(todayISO())
  const todayRef = useRef(today)
  const [featuredId, setFeaturedId] = useState<string | null>(initialEpics[0]?.id ?? null)
  const [editing, setEditing] = useState<EpicDraft | null>(null)
  const [editMode, setEditMode] = useState<'new' | 'edit' | null>(null)
  const [toast, setToast] = useState<{ msg: string; error?: boolean; action?: { label: string; fn: () => void } } | null>(null)
  const [sortBy, setSortBy] = useState<'Pendientes' | 'Progreso' | 'Nombre'>('Pendientes')
  const [compact, setCompact] = useState(false)
  const [showRowKpi, setShowRowKpi] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [estadoFilter, setEstadoFilter] = useState<'activas' | 'archivadas' | 'todas'>('activas')
  const [catFilter, setCatFilter] = useState<string>('todas')
  const [taskEdit, setTaskEdit] = useState<{ epicId: string; index: number | null } | null>(null)
  // Épica DESTINO del editor. Se guarda aparte de taskEdit.epicId (que es la de origen)
  // porque el índice de la tarea sólo tiene sentido dentro del array de su épica actual.
  const [taskEditTarget, setTaskEditTarget] = useState<string>('')
  const [taskView, setTaskView] = useState<{ eId: string; i: number } | null>(null) // vista de tarea (solo lectura)
  const [taskDraft, setTaskDraft] = useState<EpicaTask>({ t: '', status: 'Por hacer', due: '', note: '', links: [] })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [routineWeek, setRoutineWeek] = useState<string>(() => mondayISO(todayISO())) // lunes de la semana de rutinas en vista
  const [routineStat, setRoutineStat] = useState<{ eId: string; ri: number } | null>(null) // popup de info de rutina

  /* ─── Plan de hoy ─── */
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQ, setPickerQ] = useState('')
  const [pickerEpica, setPickerEpica] = useState<string>('todas')
  const [prioMenu, setPrioMenu] = useState<string | null>(null)   // key con popover de prioridad abierto
  const [rowMenu, setRowMenu] = useState<string | null>(null)     // key con menú ⋯ abierto
  const [rowMenuUp, setRowMenuUp] = useState(false)               // ⋯ abre hacia arriba si no cabe abajo
  const [prioMenuUp, setPrioMenuUp] = useState(false)
  const [doneOpen, setDoneOpen] = useState(true)
  const [planSort, setPlanSort] = useState<'plan' | 'prioridad' | 'entrega' | 'avance' | 'epica'>('plan')  // orden del enfoque
  const [planFilter, setPlanFilter] = useState<'todas' | 'alta' | 'vencidas' | 'avance'>('todas')          // filtro del enfoque
  const [tasksExpanded, setTasksExpanded] = useState(false)   // ver todas las tareas activas de la épica destacada
  const [epicSort, setEpicSort] = useState<'grupo' | 'prioridad' | 'entrega' | 'hacer' | 'progreso' | 'nombre'>('grupo')
  const [epicFilter, setEpicFilter] = useState<'todas' | 'planeadas' | 'sinplan' | 'vencidas' | 'alta'>('todas')
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [backlogSort, setBacklogSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'due', dir: 'asc' })
  const [backlogDone, setBacklogDone] = useState(false)
  const [backlogFEpica, setBacklogFEpica] = useState<string>('todas')
  const [backlogFStatus, setBacklogFStatus] = useState<string>('todas')
  const [backlogFPrio, setBacklogFPrio] = useState<string>('todas')
  const [backlogQ, setBacklogQ] = useState('')                 // búsqueda de texto en el backlog
  const [backlogView, setBacklogView] = useState<'tabla' | 'tablero'>('tabla')
  const [boardDrag, setBoardDrag] = useState<string | null>(null)      // key de la tarjeta arrastrada
  const [boardOverCol, setBoardOverCol] = useState<string | null>(null)
  const boardDragRef = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null)
  const [backlogSel, setBacklogSel] = useState<Set<string>>(new Set())
  const [backlogEdit, setBacklogEdit] = useState(false)        // edición inline tipo Excel en el backlog
  const [editCell, setEditCell] = useState<{ key: string; field: 'title' | 'progress'; val: string } | null>(null) // celda en edición (input controlado)
  const [logExpanded, setLogExpanded] = useState(false)        // ver toda la bitácora de avance
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [planSel, setPlanSel] = useState<Set<string>>(new Set())   // selección múltiple del enfoque
  const [planMoveDay, setPlanMoveDay] = useState('')               // date input de la barra de acciones
  const [hideYesterday, setHideYesterday] = useState(false)
  const [viewDate, setViewDate] = useState<string>(todayISO())               // día del plan en vista
  const [calOpen, setCalOpen] = useState(false)                              // popover de mes (masthead)
  const [calMonth, setCalMonth] = useState<string>(() => todayISO().slice(0, 7)) // 'YYYY-MM'
  const [movePick, setMovePick] = useState<{ eId: string; i: number } | null>(null) // "Mover a otro día…"
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)        // chip de la tira bajo el drag
  const dayStripRef = useRef<HTMLDivElement>(null)
  const calRef = useRef<HTMLDivElement>(null)
  const dragKeyRef = useRef<string | null>(null)
  const planListRef = useRef<HTMLDivElement>(null)
  const epicsRef = useRef<Epica[]>(epics)
  const removeUndoRef = useRef<{ eId: string; i: number; tText: string; snap: Partial<EpicaTask> } | null>(null)
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressPending = useRef<{ id: string; tasks: EpicaTask[] } | null>(null)
  useEffect(() => { epicsRef.current = epics }, [epics])
  // Persiste un avance pendiente si el componente se desmonta a media edición
  useEffect(() => () => {
    if (progressTimer.current) clearTimeout(progressTimer.current)
    const p = progressPending.current
    if (p) fetch(`/api/epicas/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: p.tasks }), keepalive: true,
    }).catch(() => {})
  }, [])

  // refresca desde el server al montar (revalidate corto en el page)
  const loadEpics = useCallback(() => {
    setLoading(true)
    fetch('/api/epicas').then(r => r.json()).then(j => {
      if (!j.ok || !Array.isArray(j.data)) throw new Error(j.error || 'respuesta inválida')
      {
        const raw = j.data as Epica[]
        const normed = raw.map(normalize)
        setEpics(normed)
        setFeaturedId(prev => (prev && normed.some(e => e.id === prev)) ? prev : (normed[0]?.id ?? null))
        // Persiste UNA vez la migración de rutinas legadas (days → weeks[semana actual]),
        // para que normalize no re-atribuya el progreso a la semana equivocada en futuras cargas.
        raw.forEach(e => {
          const needs = (e.routines || []).some(r => (!r.weeks || typeof r.weeks !== 'object') && Array.isArray(r.days) && r.days.some(Boolean))
          if (needs) {
            const ep = normed.find(n => n.id === e.id)
            if (ep) fetch(`/api/epicas/${e.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routines: ep.routines }),
            }).catch(() => {})
          }
        })
        setLoadError(null)
      }
    }).catch(() => {
      // Antes esto era `.catch(() => {})`: si Supabase fallaba se veían los datos rancios
      // del SSR sin ninguna señal. Ahora se avisa y se ofrece reintentar.
      setLoadError('No se pudieron cargar las épicas.')
    }).finally(() => setLoading(false))
  }, [])
  useEffect(() => { loadEpics() }, [loadEpics])

  // Preferencias de vista: se aplican DESPUÉS de montar (leer localStorage en el
  // initializer de useState provocaría un desajuste de hidratación con el SSR).
  const prefsReady = useRef(false)
  useEffect(() => {
    const p = loadPrefs()
    setSortBy(p.sortBy); setCompact(p.compact); setShowRowKpi(p.showRowKpi)
    setEstadoFilter(p.estadoFilter); setCatFilter(p.catFilter)
    setPlanSort(p.planSort); setPlanFilter(p.planFilter)
    setEpicSort(p.epicSort); setEpicFilter(p.epicFilter)
    setBacklogOpen(p.backlogOpen); setBacklogSort(p.backlogSort); setBacklogDone(p.backlogDone)
    setBacklogView(p.backlogView)
    setBacklogFEpica(p.backlogFEpica); setBacklogFStatus(p.backlogFStatus); setBacklogFPrio(p.backlogFPrio)
    // La épica destacada se restaura tal cual: loadEpics conserva el valor previo
    // si el id sigue existiendo, y si no cae en la primera de la lista.
    if (p.featuredId) setFeaturedId(p.featuredId)
    prefsReady.current = true
  }, [])
  useEffect(() => {
    if (!prefsReady.current) return
    const prefs: Prefs = {
      sortBy, compact, showRowKpi, estadoFilter, catFilter, planSort, planFilter,
      epicSort, epicFilter, backlogOpen, backlogSort, backlogDone, backlogView,
      backlogFEpica, backlogFStatus, backlogFPrio, featuredId,
    }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* noop */ }
  }, [sortBy, compact, showRowKpi, estadoFilter, catFilter, planSort, planFilter,
      epicSort, epicFilter, backlogOpen, backlogSort, backlogDone, backlogView,
      backlogFEpica, backlogFStatus, backlogFPrio, featuredId])

  // El día se recalcula solo: una pestaña abierta pasada la medianoche seguía
  // mostrando "Hoy" del día anterior y no recalculaba las arrastradas.
  useEffect(() => {
    const id = setInterval(() => {
      const d = todayISO()
      if (d === todayRef.current) return
      const prev = todayRef.current
      todayRef.current = d
      setToday(d)
      setViewDate(v => (v === prev ? d : v))   // si estabas viendo "hoy", sigues viendo hoy
    }, 30000)
    return () => clearInterval(id)
  }, [])

  // Gestión de foco de los modales: al abrir uno, el foco entra al panel y Tab queda
  // atrapado dentro; al cerrarlo, vuelve al elemento que lo abrió. Antes el foco se
  // quedaba detrás del backdrop y con Tab se navegaba el contenido tapado.
  const anyModal = !!(editing || taskEdit || taskView || routineStat || pickerOpen)
  const lastFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!anyModal) {
      lastFocus.current?.focus?.()
      lastFocus.current = null
      return
    }
    lastFocus.current = document.activeElement as HTMLElement | null
    const panel = document.querySelector('[role="dialog"]') as HTMLElement | null
    if (!panel) return
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null)
    focusables()[0]?.focus()
    const onTab = (ev: KeyboardEvent) => {
      if (ev.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus() }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus() }
    }
    panel.addEventListener('keydown', onTab)
    return () => panel.removeEventListener('keydown', onTab)
  }, [anyModal])

  // ⌘K / Ctrl+K abre el picker; Escape cierra el overlay más superficial
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !typing) {
        e.preventDefault(); setPickerOpen(true)
      } else if (e.key === 'Escape') {
        // De más superficial a más profundo: un solo Escape no debe cerrar el modal
        // completo si sólo había un popover encima.
        if (rowMenu || prioMenu || calOpen) { setRowMenu(null); setPrioMenu(null); setCalOpen(false); return }
        if (movePick) { setMovePick(null); return }
        if (pickerOpen) { setPickerOpen(false); return }
        if (routineStat) { setRoutineStat(null); return }
        // Estos cuatro no cerraban con Escape: en un modal a pantalla completa
        // la tecla simplemente no hacía nada.
        if (taskEdit) { setTaskEdit(null); return }
        if (taskView) { setTaskView(null); return }
        if (editing) { setEditing(null); setEditMode(null); return }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rowMenu, prioMenu, calOpen, movePick, pickerOpen, routineStat, taskEdit, taskView, editing])

  // cierra menú ⋯ / popovers (prioridad, calendario, mover) al hacer clic fuera.
  // Detección por contención (data-pop) en vez de stopPropagation: así un clic en una flecha
  // del calendario no cierra el popover en el mousedown (lo que impedía navegar de mes/año).
  useEffect(() => {
    if (!rowMenu && !prioMenu && !calOpen && !movePick) return
    const onDoc = (ev: MouseEvent) => {
      if ((ev.target as HTMLElement | null)?.closest?.('[data-pop]')) return
      setRowMenu(null); setPrioMenu(null); setCalOpen(false); setMovePick(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [rowMenu, prioMenu, calOpen, movePick])

  // La selección son índices de tareas planeadas para el día en vista: al cambiar de día
  // dejan de tener sentido.
  useEffect(() => { setPlanSel(new Set()) }, [viewDate])

  // centra el chip del día seleccionado en la tira
  useEffect(() => {
    dayStripRef.current?.querySelector('[data-day-selected]')
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [viewDate])

  function showToast(msg: string, error?: boolean, action?: { label: string; fn: () => void }) {
    setToast({ msg, error, action })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2600)
  }

  /* ─── Persistencia optimista ─────────────────────────────── */
  async function patchEpic(id: string, changes: Partial<Epica>): Promise<boolean> {
    // Revierte SOLO esta épica en caso de fallo (update funcional), para no pisar
    // los updates optimistas concurrentes de otras épicas del mismo tick (reorden multi-épica).
    const prevEpic = epicsRef.current.find(e => e.id === id)
    setEpics(list => list.map(e => (e.id === id ? { ...e, ...changes } : e)))
    try {
      const r = await fetch(`/api/epicas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      return true
    } catch {
      if (prevEpic) setEpics(list => list.map(e => (e.id === id ? prevEpic : e)))
      showToast('No se pudo guardar', true)
      return false
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

  /* ─── Plan de hoy: derivados ─────────────────────────────── */
  const isToday = viewDate === today
  const planKey = (eId: string, i: number) => `${eId}:${i}`
  const planItems = useMemo(() => {
    const arr: { e: Epica; t: EpicaTask; i: number }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => { if (t.plan === viewDate) arr.push({ e, t, i }) }))
    return arr.sort((a, b) =>
      ((a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9)) ||
      ((daysUntil(a.t.due) ?? 1e9) - (daysUntil(b.t.due) ?? 1e9)))
  }, [activeEpics, viewDate])
  const planPend = useMemo(() => planItems.filter(x => x.t.status !== 'Terminada'), [planItems])
  const planDone = useMemo(() => planItems.filter(x => x.t.status === 'Terminada'), [planItems])
  const planTotal = planItems.length
  const planPct = planTotal ? Math.round((planDone.length / planTotal) * 100) : 0
  const planAllDone = planTotal > 0 && planDone.length === planTotal
  // planOrder máximo de CUALQUIER día (el modal y "Mover a…" planean a fechas ≠ viewDate)
  const maxPlanOrderFor = (dateISO: string) => {
    let m = 0
    epicsRef.current.forEach(e => (e.tasks || []).forEach(t => { if (t.plan === dateISO) m = Math.max(m, t.planOrder ?? 0) }))
    return m
  }
  // Días que llevas con una tarea (desde que la creaste; si no hay fecha de creación, desde que la planeaste).
  const diasCon = (t: EpicaTask): number => {
    const desde = t.createdAt || t.plan
    if (!desde) return 0
    const d = Math.floor((new Date(today + 'T00:00:00').getTime() - new Date(desde + 'T00:00:00').getTime()) / 86400000)
    return d > 0 ? d : 0
  }
  // ARRASTRADAS: tareas planeadas para un día YA PASADO y sin terminar → se muestran
  // en el enfoque de hoy (no se pierden), marcadas y con "desde hace N días".
  const arrastradas = useMemo(() => {
    if (viewDate !== today) return [] as { e: Epica; t: EpicaTask; i: number }[]
    const arr: { e: Epica; t: EpicaTask; i: number }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => { if (t.plan && t.plan < today && t.status !== 'Terminada') arr.push({ e, t, i }) }))
    return arr.sort((a, b) => (a.t.plan || '').localeCompare(b.t.plan || ''))
  }, [activeEpics, viewDate, today])
  // conteo de tareas por día (para la tira y el calendario)
  const planCounts = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>()
    activeEpics.forEach(e => (e.tasks || []).forEach(t => {
      if (!t.plan) return
      const c = m.get(t.plan) || { total: 0, done: 0 }
      c.total++; if (t.status === 'Terminada') c.done++
      m.set(t.plan, c)
    }))
    return m
  }, [activeEpics])
  // Ventana de la tira: 6 días atrás + hoy + 13 adelante. Los días pasados
  // importan para reprogramar lo que quedó pendiente sin abrir el calendario.
  const STRIP_BACK = 6
  const STRIP_LEN = 20
  const stripDays = useMemo(() => {
    const o = daysUntil(viewDate)
    const inBase = o != null && o >= -STRIP_BACK && o <= STRIP_LEN - STRIP_BACK - 1
    const start = inBase ? addDays(today, -STRIP_BACK) : addDays(viewDate, -STRIP_BACK)
    return Array.from({ length: STRIP_LEN }, (_, i) => addDays(start, i))
  }, [today, viewDate])

  /* ─── Plan de hoy: acciones (cada tarjeta = 1 patchEpic) ──── */
  // Reasigna planOrder=1000,2000,… agrupando por épica (1 patch por épica tocada).
  const applyPlanOrder = (ordered: { e: Epica; i: number }[]) => {
    const byEpic = new Map<string, { e: Epica; set: [number, number][] }>()
    ordered.forEach((x, pos) => {
      if (!byEpic.has(x.e.id)) byEpic.set(x.e.id, { e: x.e, set: [] })
      byEpic.get(x.e.id)!.set.push([x.i, (pos + 1) * 1000])
    })
    byEpic.forEach(({ e, set }) => {
      const tasks = clone(e.tasks)
      set.forEach(([i, o]) => { if (tasks[i]) tasks[i].planOrder = o })
      patchEpic(e.id, { tasks })
    })
  }
  // Planea (o mueve) una tarea a un día. Lee maxPlanOrderFor ANTES de mutar,
  // así la propia tarea (con su plan viejo) no infla el conteo del día destino.
  // Si la tarea queda planeada para HOY → estado "En curso" (recordando el previo); si sale → se revierte.
  const applyPlanStatus = (task: EpicaTask, newPlanDay: string) => {
    if (task.status === 'Terminada') return
    if (newPlanDay === todayISO()) {
      if (task.status !== 'En curso') { if (task.planStatusPrev == null) task.planStatusPrev = task.status; task.status = 'En curso' }
    } else {
      if (task.status === 'En curso' && task.planStatusPrev != null) task.status = task.planStatusPrev
      delete task.planStatusPrev
    }
  }
  const planTaskToDay = (e: Epica, i: number, dayISO: string, opts?: { toast?: boolean }) => {
    const tasks = clone(e.tasks)
    const prev = tasks[i].plan
    tasks[i].plan = dayISO
    if (!tasks[i].priority) tasks[i].priority = prioFromDue(tasks[i].due)
    if (prev !== dayISO || tasks[i].planOrder == null) tasks[i].planOrder = maxPlanOrderFor(dayISO) + 1000
    applyPlanStatus(tasks[i], dayISO)
    patchEpic(e.id, { tasks })
    if (opts?.toast && dayISO !== viewDate) {
      showToast(`Movida a ${relLong(dayISO).toLowerCase()}`, false, { label: 'Ver', fn: () => setViewDate(dayISO) })
    }
  }
  const addToPlan = (e: Epica, i: number) => planTaskToDay(e, i, viewDate)
  const removeFromPlan = (e: Epica, i: number, withToast = true) => {
    const snap: Partial<EpicaTask> = { plan: e.tasks[i].plan, priority: e.tasks[i].priority, planOrder: e.tasks[i].planOrder }
    const tasks = clone(e.tasks)
    delete tasks[i].plan; delete tasks[i].priority; delete tasks[i].planOrder
    applyPlanStatus(tasks[i], '')
    patchEpic(e.id, { tasks })
    setRowMenu(null)
    if (withToast) {
      removeUndoRef.current = { eId: e.id, i, tText: e.tasks[i].t, snap }
      showToast('Quitada del plan', false, {
        label: 'Deshacer', fn: () => {
          const u = removeUndoRef.current; if (!u) return
          const ep = epicsRef.current.find(x => x.id === u.eId); if (!ep) return
          const tk = clone(ep.tasks)
          // Verifica identidad por si el array cambió de orden durante la ventana del toast
          if (!tk[u.i] || tk[u.i].t !== u.tText) return
          tk[u.i].plan = u.snap.plan; tk[u.i].priority = u.snap.priority; tk[u.i].planOrder = u.snap.planOrder
          applyPlanStatus(tk[u.i], u.snap.plan || '')
          patchEpic(u.eId, { tasks: tk })
        },
      })
    }
  }
  const setPriority = (e: Epica, i: number, p: Prio) => {
    const tasks = clone(e.tasks); tasks[i].priority = p
    patchEpic(e.id, { tasks }); setPrioMenu(null); setRowMenu(null)
  }
  const setPriorityVal = (e: Epica, i: number, v: string) => {
    const tasks = clone(e.tasks); if (v) tasks[i].priority = v as Prio; else delete tasks[i].priority
    patchEpic(e.id, { tasks })
  }
  /** Completar una tarea. Si se repite, en vez de terminarse se reprograma a su
   *  siguiente fecha y se apunta el ciclo cumplido. Es el único camino de completado
   *  (plan y tablero), para que la recurrencia no dependa de por dónde la marcaste. */
  const completeFromPlan = (e: Epica, i: number) => {
    const snap = clone(e.tasks[i])
    const tasks = clone(e.tasks)
    const t = tasks[i]
    const done = todayISO()

    if (t.repeat && t.status !== 'Terminada') {
      const base = t.plan || done
      const next = nextOccurrence(base, t.repeat, done)
      const seriesOver = !!t.repeatUntil && next > t.repeatUntil
      t.repeatDone = [...(t.repeatDone || []), done].slice(-60)

      if (seriesOver) {
        t.planPrev = t.status; t.status = 'Terminada'; t.doneAt = done
        delete t.repeat
      } else {
        if (t.due && t.due === base) t.due = next    // la entrega acompaña al ciclo
        t.plan = next
        t.planOrder = maxPlanOrderFor(next) + 1000
        t.status = t.planStatusPrev || 'Por hacer'   // vuelve a su estado de reposo
        delete t.planStatusPrev; delete t.doneAt
        delete t.progress                            // el avance es de cada ciclo, no acumulado
      }
      patchEpic(e.id, { tasks })
      const undo = () => {
        const ep = epicsRef.current.find(x => x.id === e.id); if (!ep) return
        const back = clone(ep.tasks)
        if (back[i]?.t !== snap.t) return             // el array cambió: no toques otra tarea
        back[i] = snap
        patchEpic(e.id, { tasks: back })
      }
      showToast(
        seriesOver ? 'Hecha ✓ · serie terminada' : `Hecha ✓ · vuelve ${relLong(next).toLowerCase()}`,
        false, { label: 'Deshacer', fn: undo })
      return
    }

    t.planPrev = t.status
    t.status = 'Terminada'
    t.doneAt = done
    patchEpic(e.id, { tasks })
  }
  const uncompleteFromPlan = (e: Epica, i: number) => {
    const tasks = clone(e.tasks)
    tasks[i].status = tasks[i].planPrev || 'Por hacer'
    delete tasks[i].doneAt; delete tasks[i].planPrev
    patchEpic(e.id, { tasks })
  }
  const movePlan = (key: string, dir: 'up' | 'down') => {
    const list = planPend
    const idx = list.findIndex(x => planKey(x.e.id, x.i) === key)
    if (idx < 0) return
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= list.length) return
    const reordered = list.map(x => ({ e: x.e, i: x.i }))
    ;[reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    applyPlanOrder(reordered)
    setRowMenu(null)
  }
  const commitReorder = (key: string, destIndex: number) => {
    const list = planPend
    const from = list.findIndex(x => planKey(x.e.id, x.i) === key)
    if (from < 0) return
    const base = list.map(x => ({ e: x.e, i: x.i }))
    const without = base.filter((_, idx) => idx !== from)
    let insertAt = destIndex > from ? destIndex - 1 : destIndex
    insertAt = Math.max(0, Math.min(insertAt, without.length))
    if (insertAt === from) return
    const reordered = [...without.slice(0, insertAt), base[from], ...without.slice(insertAt)]
    applyPlanOrder(reordered)
  }
  // Fija el orden mostrado (vista ordenada) como el orden manual del plan
  const commitPlanOrder = (list: { e: Epica; i: number }[]) => {
    applyPlanOrder(list.map(x => ({ e: x.e, i: x.i })))
    setPlanSort('plan')
    showToast('Orden fijado')
  }
  // Trae al plan de hoy TODAS las pendientes de días anteriores (reprograma plan=hoy).
  const bringOverdue = () => {
    let base = maxPlanOrderFor(today)
    const byEpic = new Map<string, { e: Epica; idx: number[] }>()
    arrastradas.forEach(x => { if (!byEpic.has(x.e.id)) byEpic.set(x.e.id, { e: x.e, idx: [] }); byEpic.get(x.e.id)!.idx.push(x.i) })
    byEpic.forEach(({ e, idx }) => {
      const tasks = clone(e.tasks)
      idx.forEach(i => {
        base += 1000; tasks[i].plan = today
        if (!tasks[i].priority) tasks[i].priority = prioFromDue(tasks[i].due)
        tasks[i].planOrder = base
        applyPlanStatus(tasks[i], today)   // igual que planTaskToDay: planear para hoy → "En curso"
      })
      patchEpic(e.id, { tasks })
    })
    showToast(`${arrastradas.length} ${arrastradas.length === 1 ? 'pendiente traída' : 'pendientes traídas'} a hoy`)
  }

  /* ─── Selección múltiple en el enfoque ───────────────────── */
  const togglePlanSel = (key: string) => setPlanSel(prev => {
    const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n
  })
  const planSelGroup = () => {
    const m = new Map<string, number[]>()
    planSel.forEach(key => {
      const idx = key.lastIndexOf(':')
      const eId = key.slice(0, idx); const i = Number(key.slice(idx + 1))
      if (!m.has(eId)) m.set(eId, []); m.get(eId)!.push(i)
    })
    return m
  }
  /** Aplica una mutación a toda la selección: un patch por épica tocada. */
  const planBulk = (mutate: (t: EpicaTask) => void, msg: string) => {
    const count = planSel.size
    planSelGroup().forEach((idxs, eId) => {
      const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
      const tasks = clone(ep.tasks)
      idxs.forEach(i => { if (tasks[i]) mutate(tasks[i]) })
      patchEpic(eId, { tasks })
    })
    showToast(`${count} ${msg}`); setPlanSel(new Set())
  }
  const planBulkMove = (day: string) => {
    if (!day) return
    const count = planSel.size
    let base = maxPlanOrderFor(day)
    planSelGroup().forEach((idxs, eId) => {
      const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
      const tasks = clone(ep.tasks)
      idxs.forEach(i => {
        const t = tasks[i]; if (!t) return
        base += 1000
        t.plan = day
        if (!t.priority) t.priority = prioFromDue(t.due)
        t.planOrder = base
        applyPlanStatus(t, day)
      })
      patchEpic(eId, { tasks })
    })
    setPlanSel(new Set())
    showToast(`${count} ${count === 1 ? 'movida' : 'movidas'} a ${relLong(day).toLowerCase()}`, false,
      day !== viewDate ? { label: 'Ver', fn: () => setViewDate(day) } : undefined)
  }
  const planBulkDone = () => planBulk(t => {
    if (t.status === 'Terminada') return
    t.planPrev = t.status; t.status = 'Terminada'; t.doneAt = todayISO()
  }, 'marcadas como terminadas')
  const planBulkRemove = () => planBulk(t => {
    delete t.plan; delete t.priority; delete t.planOrder; applyPlanStatus(t, '')
  }, 'quitadas del plan')
  const planBulkPrio = (p: Prio) => planBulk(t => { t.priority = p }, `· prioridad ${p}`)

  /* ─── Tablero: arrastrar tarjetas entre columnas ──────────────
     Pointer events (no HTML5 drag) para que también funcione en táctil.
     Un umbral de 6px distingue "arrastrar" de "clic para abrir la tarea". */
  const onCardDown = (ev: React.PointerEvent, key: string) => {
    boardDragRef.current = { key, x: ev.clientX, y: ev.clientY, moved: false }
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId) } catch { /* noop */ }
  }
  const onCardMove = (ev: React.PointerEvent) => {
    const d = boardDragRef.current; if (!d) return
    if (!d.moved) {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return
      d.moved = true; setBoardDrag(d.key)
    }
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
    setBoardOverCol((el?.closest('[data-col]') as HTMLElement | null)?.dataset.col ?? null)
  }
  const onCardUp = (ev: React.PointerEvent, x: { e: Epica; t: EpicaTask; i: number }) => {
    const d = boardDragRef.current
    boardDragRef.current = null
    const col = boardOverCol
    setBoardDrag(null); setBoardOverCol(null)
    if (!d) return
    if (!d.moved) { setTaskView({ eId: x.e.id, i: x.i }); return }   // fue un clic
    if (!col || col === x.t.status) return
    // Soltar en "Terminada" pasa por el mismo camino que el check del plan,
    // para que una tarea recurrente se reprograme en vez de terminarse.
    if (col === 'Terminada') completeFromPlan(x.e, x.i)
    else setTaskStatus(x.e, x.i, col)
    void ev
  }
  const onCardCancel = () => { boardDragRef.current = null; setBoardDrag(null); setBoardOverCol(null) }

  /* Drag por manija (pointer events; mouse + touch con setPointerCapture) */
  const computeDropIndex = (clientY: number) => {
    const rows = Array.from(planListRef.current?.querySelectorAll('[data-plan-row]') || []) as HTMLElement[]
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return idx
    }
    return rows.length
  }
  const onGripDown = (ev: React.PointerEvent, key: string) => {
    ev.preventDefault(); ev.stopPropagation()
    dragKeyRef.current = key
    setDraggingKey(key)
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId) } catch { /* noop */ }
  }
  const onGripMove = (ev: React.PointerEvent) => {
    if (!dragKeyRef.current) return
    // ¿el puntero está sobre un chip de la tira de días? → mover de día (no reordenar)
    const overEl = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
    const over = overEl?.closest('[data-day]') as HTMLElement | null
    const day = over?.dataset.day ?? null
    setDragOverDay(day)
    setDropIndex(day && day !== viewDate ? null : computeDropIndex(ev.clientY))
  }
  const onGripUp = (ev: React.PointerEvent) => {
    const key = dragKeyRef.current
    if (!key) return
    const day = dragOverDay
    const di = computeDropIndex(ev.clientY)
    dragKeyRef.current = null
    setDraggingKey(null); setDropIndex(null); setDragOverDay(null)
    if (day && day !== viewDate) {
      const [eId, iStr] = key.split(':')
      const ep = epicsRef.current.find(x => x.id === eId)
      if (ep) planTaskToDay(ep, Number(iStr), day, { toast: true })
    } else {
      commitReorder(key, di)
    }
  }
  // pointercancel (el navegador se lleva el puntero) libera el estado del drag SIN confirmar reorden
  const onGripCancel = () => {
    if (!dragKeyRef.current) return
    dragKeyRef.current = null
    setDraggingKey(null); setDropIndex(null); setDragOverDay(null)
  }

  /* ─── Interacciones inline en la destacada ───────────────── */
  const setTaskStatus = (e: Epica, ti: number, v: string) => {
    const tasks = clone(e.tasks)
    // Recuerda el estado previo al completar, para que "descompletar" desde el plan lo restaure
    if (v === 'Terminada' && tasks[ti].status !== 'Terminada') tasks[ti].planPrev = tasks[ti].status
    tasks[ti].status = v
    if (v === 'Terminada') { if (!tasks[ti].doneAt) tasks[ti].doneAt = todayISO() }
    else { delete tasks[ti].doneAt; delete tasks[ti].planPrev }
    patchEpic(e.id, { tasks })
  }
  const setTaskDue = (e: Epica, ti: number, v: string) => {
    const tasks = clone(e.tasks); tasks[ti].due = v
    patchEpic(e.id, { tasks })
  }
  const setTaskTitle = (e: Epica, ti: number, v: string) => {
    const t = (v || '').trim(); if (!t) return
    const tasks = clone(e.tasks); tasks[ti].t = t
    patchEpic(e.id, { tasks })
  }
  /** Las tareas se referencian por índice (`epicaId:i`). Cualquier splice reindexa el array,
   *  así que toda referencia abierta a esa épica deja de ser confiable: se cierra. */
  const invalidateTaskRefs = (eId: string) => {
    const touches = (k: string | null) => !!k && k.slice(0, k.lastIndexOf(':')) === eId
    setTaskView(v => (v && v.eId === eId ? null : v))
    setTaskEdit(v => (v && v.epicId === eId ? null : v))
    setMovePick(v => (v && v.eId === eId ? null : v))
    setRoutineStat(v => (v && v.eId === eId ? null : v))
    setRowMenu(k => (touches(k) ? null : k))
    setPrioMenu(k => (touches(k) ? null : k))
    setEditCell(c => (touches(c?.key ?? null) ? null : c))
    setPlanSel(prev => {
      if (![...prev].some(touches)) return prev
      return new Set([...prev].filter(k => !touches(k)))
    })
    removeUndoRef.current = null
  }

  // Mueve una tarea a otra épica (saca de la actual, agrega a la destino). Limpia la selección (los índices cambian).
  const moveTaskToEpica = (fromE: Epica, i: number, toEId: string) => {
    if (fromE.id === toEId) return
    const toE = epicsRef.current.find(e => e.id === toEId); if (!toE) return
    const task = fromE.tasks[i]; if (!task) return
    const fromTasks = clone(fromE.tasks).filter((_, idx) => idx !== i)
    const toTasks = clone(toE.tasks); toTasks.push(clone(task))
    patchEpic(fromE.id, { tasks: fromTasks })
    patchEpic(toE.id, { tasks: toTasks })
    setBacklogSel(new Set())
    invalidateTaskRefs(fromE.id)
  }
  /** Cambia el avance de una tarea.
   *  `defer` (arrastre del slider): pinta al instante y persiste UNA sola vez al soltar.
   *  Sin debounce, un arrastre de 0→100 con step=5 disparaba 20 PATCH con el array
   *  completo de tareas; llegaban desordenados y el último en responder ganaba. */
  const setTaskProgress = (e: Epica, ti: number, v: number, defer = false) => {
    const tasks = clone(e.tasks)
    if (v > 0) {
      tasks[ti].progress = v
      upsertProgressPct(tasks[ti], v)   // registra el % de hoy en la bitácora
    } else {
      delete tasks[ti].progress
      // Poner el avance en 0 no es "avanzar": limpia la entrada de hoy si no tiene nota,
      // para que la tarea no aparezca en "Trabajadas hoy" ni con el badge "✎ avancé".
      const log = (tasks[ti].progressLog || []).filter(x => !(x.d === todayISO() && !x.note))
      if (log.length) tasks[ti].progressLog = log; else delete tasks[ti].progressLog
    }
    if (!defer) { patchEpic(e.id, { tasks }); return }
    setEpics(list => list.map(x => (x.id === e.id ? { ...x, tasks } : x)))
    progressPending.current = { id: e.id, tasks }
    if (progressTimer.current) clearTimeout(progressTimer.current)
    progressTimer.current = setTimeout(() => {
      const p = progressPending.current; progressPending.current = null
      if (p) patchEpic(p.id, { tasks: p.tasks })
    }, 450)
  }
  const toggleSubtask = (e: Epica, ti: number, si: number) => {
    const tasks = clone(e.tasks); const st = tasks[ti].subtasks
    if (!st || !st[si]) return
    st[si].done = !st[si].done
    patchEpic(e.id, { tasks })
  }
  // ── Bitácora de avance (días en que se avanzó en la tarea) ──
  const addProgressDay = (e: Epica, ti: number, d: string) => {
    if (!d) return
    const tasks = clone(e.tasks)
    const log = tasks[ti].progressLog || []
    if (log.some(x => x.d === d)) return
    log.push({ d }); log.sort((a, b) => b.d.localeCompare(a.d))
    tasks[ti].progressLog = log
    patchEpic(e.id, { tasks })
  }
  const removeProgressDay = (e: Epica, ti: number, d: string) => {
    const tasks = clone(e.tasks)
    const log = (tasks[ti].progressLog || []).filter(x => x.d !== d)
    if (log.length) tasks[ti].progressLog = log; else delete tasks[ti].progressLog
    patchEpic(e.id, { tasks })
  }
  const setProgressNote = (e: Epica, ti: number, d: string, note: string) => {
    const tasks = clone(e.tasks)
    const entry = (tasks[ti].progressLog || []).find(x => x.d === d)
    if (!entry) return
    if (note.trim()) entry.note = note; else delete entry.note
    patchEpic(e.id, { tasks })
  }
  const toggleRoutineDay = (e: Epica, ri: number, di: number) => {
    const routines = clone(e.routines)
    const r = routines[ri]
    if (!r.weeks) r.weeks = {}
    const wk = (r.weeks[routineWeek] && r.weeks[routineWeek].length === 7)
      ? r.weeks[routineWeek] : [false, false, false, false, false, false, false]
    wk[di] = !wk[di]
    r.weeks[routineWeek] = wk
    if (routineWeek === mondayISO(todayISO())) r.days = wk   // mantiene `days` sincronizado con la semana actual
    patchEpic(e.id, { routines })
  }
  // marca/desmarca HOY para una rutina (usado en "Rutinas de hoy" del enfoque), sin depender de routineWeek
  const toggleRoutineToday = (e: Epica, ri: number) => {
    const monday = mondayISO(todayISO())
    const di = (new Date(todayISO() + 'T00:00:00').getDay() + 6) % 7
    const routines = clone(e.routines)
    const r = routines[ri]
    if (!r.weeks) r.weeks = {}
    const wk = (r.weeks[monday] && r.weeks[monday].length === 7) ? r.weeks[monday] : [false, false, false, false, false, false, false]
    wk[di] = !wk[di]
    r.weeks[monday] = wk
    r.days = wk
    patchEpic(e.id, { routines })
  }
  const toggleArchive = (e: Epica) => {
    patchEpic(e.id, { archived: !e.archived })
    showToast(e.archived ? 'Épica reactivada' : 'Épica archivada')
  }

  /* ─── Popup de edición por tarea ─────────────────────────── */
  /** `seed` prellena el borrador de una tarea nueva (p. ej. el día del plan
   *  desde el que se creó), para no tener que elegirlo a mano. */
  const openTaskEdit = (epicId: string, index: number | null, seed?: Partial<EpicaTask>) => {
    const e = epics.find(x => x.id === epicId)
    if (index != null && e) {
      const t = clone(e.tasks[index])
      setTaskDraft({ ...t, links: t.links || [] })
    } else {
      setTaskDraft({ t: '', status: 'Por hacer', due: '', note: '', links: [], ...seed })
    }
    setTaskEdit({ epicId, index })
    setTaskEditTarget(epicId)
  }
  /** Crea una tarea ya planeada para el día que estás viendo en el enfoque. */
  const newTaskForDay = (day: string) => {
    const target = featured?.id || activeEpics[0]?.id
    if (!target) { showToast('Crea una épica primero', true); return }
    openTaskEdit(target, null, { plan: day })
  }
  const closeTaskEdit = () => setTaskEdit(null)
  const saveTask = () => {
    if (!taskEdit) return
    const e = epics.find(x => x.id === taskEdit.epicId); if (!e) { closeTaskEdit(); return }
    const links = (taskDraft.links || []).map(l => ({ label: (l.label || '').trim(), url: (l.url || '').trim() })).filter(l => l.label || l.url)
    // Preserva campos del plan (plan/priority/planOrder/planPrev) al reescribir la tarea
    const orig: Partial<EpicaTask> = (taskEdit.index != null ? e.tasks[taskEdit.index] : {}) || {}
    const t: EpicaTask = { ...orig, t: (taskDraft.t || '').trim(), status: taskDraft.status || 'Por hacer', due: taskDraft.due || '', note: taskDraft.note || '', links }
    if (t.status === 'Terminada') t.doneAt = taskDraft.doneAt || todayISO()
    else delete t.doneAt   // evita arrastrar una fecha de terminación obsoleta
    if (!t.t) { closeTaskEdit(); return }
    // Prioridad y día del plan editados desde el modal
    if (taskDraft.priority) t.priority = taskDraft.priority; else delete t.priority
    const newPlan = (taskDraft.plan || '').trim()
    if (newPlan) {
      if (orig.plan !== newPlan || t.planOrder == null) t.planOrder = maxPlanOrderFor(newPlan) + 1000  // al final de ese día
      t.plan = newPlan
      if (!t.priority) t.priority = prioFromDue(t.due)
    } else { delete t.plan; delete t.planOrder }   // se despega del plan (conserva priority por si se re-planea)
    if (t.status !== 'Terminada') applyPlanStatus(t, newPlan)   // plan de hoy ⇒ En curso
    // Subtareas y avance manual editados en el modal
    const subs = (taskDraft.subtasks || []).map(s => ({ t: (s.t || '').trim(), done: !!s.done })).filter(s => s.t)
    if (subs.length) t.subtasks = subs; else delete t.subtasks
    if (typeof taskDraft.progress === 'number' && taskDraft.progress > 0) t.progress = Math.max(0, Math.min(100, taskDraft.progress)); else delete t.progress
    if ((orig.progress ?? 0) !== (t.progress ?? 0)) upsertProgressPct(t, t.progress ?? 0)   // registra el cambio de avance de hoy
    // Recurrencia: se guarda sólo si sigue activa, y `hasta` sólo si hay recurrencia
    if (taskDraft.repeat) {
      t.repeat = { every: Math.max(1, Math.round(taskDraft.repeat.every || 1)), unit: taskDraft.repeat.unit }
      if (taskDraft.repeatUntil) t.repeatUntil = taskDraft.repeatUntil; else delete t.repeatUntil
    } else { delete t.repeat; delete t.repeatUntil }
    if (taskEdit.index == null && !t.createdAt) t.createdAt = todayISO()   // registra la creación

    // Épica destino: puede diferir de la de origen si la cambiaste en el editor.
    const target = epics.find(x => x.id === taskEditTarget) || e
    const moved = taskEdit.index != null && target.id !== e.id

    if (taskEdit.index == null) {
      const tasks = clone(target.tasks); tasks.push(t)
      patchEpic(target.id, { tasks })
    } else if (moved) {
      // Cambiar de épica es sacar de un array y meter en otro: dos patches.
      const fromTasks = clone(e.tasks).filter((_, idx) => idx !== taskEdit.index)
      const toTasks = clone(target.tasks); toTasks.push(t)
      patchEpic(e.id, { tasks: fromTasks })
      patchEpic(target.id, { tasks: toTasks })
      invalidateTaskRefs(e.id)   // el splice reindexa la épica de origen
      setFeaturedId(target.id)   // para que no "desaparezca" de la vista
    } else {
      const tasks = clone(e.tasks)
      tasks[taskEdit.index] = t
      patchEpic(e.id, { tasks })
    }
    closeTaskEdit()
    if (moved) showToast(`Movida a ${target.name}`)
    if (newPlan && newPlan !== viewDate && orig.plan !== newPlan) {
      showToast(`Planeada para ${relLong(newPlan).toLowerCase()}`, false, { label: 'Ver', fn: () => setViewDate(newPlan) })
    }
  }
  const deleteTask = () => {
    if (!taskEdit || taskEdit.index == null) { closeTaskEdit(); return }
    const e = epics.find(x => x.id === taskEdit.epicId); if (!e) { closeTaskEdit(); return }
    const idx = taskEdit.index
    if (!window.confirm(`¿Eliminar "${e.tasks[idx]?.t || 'esta tarea'}"? No se puede deshacer.`)) return
    const tasks = clone(e.tasks).filter((_, i) => i !== idx)
    patchEpic(e.id, { tasks })
    // El splice reindexa: cierra todo lo que referencia tareas por índice en esta épica,
    // o el siguiente clic actuaría sobre la tarea equivocada.
    invalidateTaskRefs(e.id)
    // El splice reindexa esta épica: remapea la selección del backlog para no golpear la tarea equivocada
    setBacklogSel(prev => {
      if (prev.size === 0) return prev
      const n = new Set<string>()
      prev.forEach(k => {
        const c = k.lastIndexOf(':'); const eId = k.slice(0, c); const i = Number(k.slice(c + 1))
        if (eId !== e.id) { n.add(k); return }
        if (i === idx) return
        n.add(eId + ':' + (i > idx ? i - 1 : i))
      })
      return n
    })
    closeTaskEdit()
  }

  /* ─── Modal ──────────────────────────────────────────────── */
  const openNew = () => {
    setEditMode('new')
    setEditing({
      id: null, name: '', color: '#2E5A9E', description: '', status: 'En curso',
      categoria: '', archived: false,
      source_table: '', source_sync: null, epic_order: epics.length,
      kpis: [{ v: '', l: '' }], routines: [], tasks: [{ t: '', status: 'Por hacer', due: '', note: '', createdAt: todayISO() }],
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
    d.routines = (d.routines || []).filter(r => (r.t || '').trim()).map(r => ({ t: r.t, days: r.days || [false, false, false, false, false, false, false], weeks: (r.weeks && typeof r.weeks === 'object') ? r.weeks : {} }))
    d.tasks = (d.tasks || []).filter(t => (t.t || '').trim()).map(t => {
      const st = t.status || 'Por hacer'
      // Conserva campos del plan (plan/priority/planOrder/planPrev) que no toca el editor
      const out: EpicaTask = { ...t, t: t.t, status: st, due: t.due || '', note: t.note || '', links: t.links || [] }
      if (st === 'Terminada') out.doneAt = t.doneAt || todayISO()
      else delete out.doneAt   // evita arrastrar una fecha de terminación obsoleta
      return out
    })
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
      // Espera el resultado: antes se anunciaba "guardado" antes de saber si el PATCH
      // había fallado, y el usuario veía un éxito falso seguido del error real.
      if (await patchEpic(id, payload)) showToast('Cambios guardados')
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

  // grupos de tareas activas (con índice original para editar)
  const indexed = featured.tasks.map((t, i) => ({ ...t, _i: i }))
  const ACTIVE_ORDER = ['En curso', 'Esperando', 'Por hacer']
  const taskGroups = ACTIVE_ORDER.map(s => {
    const ts = taskStyle(s)
    return { key: s, color: ts.c, label: ts.group, items: indexed.filter(t => t.status === s) }
  }).filter(g => g.items.length > 0)

  // Filtro + orden de tareas de la épica destacada
  const passEpicFilter = (t: (typeof indexed)[number]) => {
    if (epicFilter === 'planeadas') return !!t.plan
    if (epicFilter === 'sinplan') return !t.plan
    if (epicFilter === 'vencidas') { const dl = daysUntil(t.due); return dl != null && dl < 0 }
    if (epicFilter === 'alta') return t.priority === 'alta'
    return true
  }
  const filteredGroups = taskGroups.map(g => ({ ...g, items: g.items.filter(passEpicFilter) })).filter(g => g.items.length > 0)
  const filteredActive = indexed.filter(t => t.status !== 'Terminada' && passEpicFilter(t))
  const epicSortCmp = (a: (typeof indexed)[number], b: (typeof indexed)[number]) => {
    if (epicSort === 'prioridad') return (PRIO_RANK[a.priority || 'media'] - PRIO_RANK[b.priority || 'media']) || ((daysUntil(a.due) ?? 1e9) - (daysUntil(b.due) ?? 1e9))
    if (epicSort === 'entrega') return (a.due || '9999-99').localeCompare(b.due || '9999-99')
    if (epicSort === 'hacer') return (a.plan || '9999-99').localeCompare(b.plan || '9999-99')
    if (epicSort === 'progreso') return (b.progress || 0) - (a.progress || 0)
    return a.t.localeCompare(b.t, 'es')
  }
  const flatActive = epicSort === 'grupo' ? [] : [...filteredActive].sort(epicSortCmp)
  const totalActiveShown = filteredActive.length

  // Terminadas: por fecha (doneAt o due) desc, agrupadas por mes
  const doneItems = indexed.filter(t => t.status === 'Terminada')
  const doneKey = (t: (typeof indexed)[number]) => {
    const s = t.doneAt || t.due
    if (!s) return -Infinity
    const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? -Infinity : d.getTime()
  }
  const doneSorted = [...doneItems].sort((a, b) => doneKey(b) - doneKey(a))
  const doneMonths: { label: string; items: typeof doneSorted }[] = []
  doneSorted.forEach(t => {
    const lab = monthLabel(t.doneAt || t.due || '')
    const g = doneMonths.find(x => x.label === lab)
    if (g) g.items.push(t); else doneMonths.push({ label: lab, items: [t] })
  })

  const setTaskPlan = (e: Epica, ti: number, v: string) => {
    if (v) { planTaskToDay(e, ti, v); return }
    // se despega del plan pero conserva priority por si se re-planea (igual que el modal)
    const tasks = clone(e.tasks)
    delete tasks[ti].plan; delete tasks[ti].planOrder
    applyPlanStatus(tasks[ti], '')   // revierte el "En curso" forzado por el plan de hoy
    patchEpic(e.id, { tasks })
  }
  const renderTaskRow = (t: (typeof indexed)[number]) => {
    const ts = taskStyle(t.status)
    const done = t.status === 'Terminada'
    const dt = dueTone(t.due, done)
    const subs = t.subtasks || []
    const subsDone = subs.filter(s => s.done).length
    const dateLbl: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.55)', width: 30, flexShrink: 0 }
    return (
      <div key={t._i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 0', borderBottom: '1px solid rgba(15,35,64,0.06)' }}>
        <select value={t.status} onChange={e => setTaskStatus(featured, t._i, e.target.value)} title="Cambiar estado" style={{ flexShrink: 0, marginTop: 1, cursor: 'pointer', border: `1px solid ${ts.c}44`, background: ts.bg, color: ts.c, borderRadius: 8, padding: '4px 6px', fontSize: 11, fontWeight: 700, outline: 'none' }}>
          {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div {...clickable(() => setTaskView({ eId: featured.id, i: t._i }), `Ver tarea: ${t.t}`)} title="Ver tarea" style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'rgba(20,35,61,0.4)' : '#16365F', textDecoration: done ? 'line-through' : 'none' }}>{t.t}</div>
          {(subs.length > 0 || typeof t.progress === 'number') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 4 }}>
              {subs.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: subsDone === subs.length ? '#2E6E6E' : 'rgba(20,35,61,0.5)' }}>☑ {subsDone}/{subs.length} · {Math.round((subsDone / subs.length) * 100)}%</span>}
              {typeof t.progress === 'number' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flex: 1, maxWidth: 140 }}>
                  <span style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: featured.color }} />
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>
                </span>
              )}
            </div>
          )}
          {t.note && <div className="ep-note" style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)', marginTop: 3, maxHeight: 32, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg,#000 60%,transparent)' }} dangerouslySetInnerHTML={{ __html: t.note }} />}
          {t.links && t.links.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
              {t.links.map((l, li) => (
                <a key={li} href={l.url || '#'} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" onClick={ev => ev.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)', borderRadius: 99, padding: '2px 8px' }}>🔗 {l.label || l.url}</a>
              ))}
            </div>
          )}
        </div>
        {done
          ? <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#2E6E6E', marginTop: 2 }}>{(t.doneAt || t.due) ? '✓ ' + fmtDue(t.doneAt || t.due) : '✓'}</span>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Cuándo lo harás (aparece en tu enfoque)">
                <span style={dateLbl}>Hacer</span>
                <input type="date" value={t.plan || ''} onChange={e => setTaskPlan(featured, t._i, e.target.value)} style={{ border: '1px solid rgba(46,90,158,0.35)', borderRadius: 8, padding: '4px 6px', fontSize: 11, fontWeight: 600, color: t.plan ? '#2E5A9E' : 'rgba(20,35,61,0.4)', background: t.plan ? 'rgba(46,90,158,0.06)' : '#fff', outline: 'none' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={t.due ? `Vence ${fmtDue(t.due)} · ${dt.label}` : 'Fecha de entrega'}>
                <span style={dateLbl}>Vence</span>
                <input type="date" value={t.due} onChange={e => setTaskDue(featured, t._i, e.target.value)} style={{ border: `1px solid ${dt.border}`, borderRadius: 8, padding: '4px 6px', fontSize: 11, fontWeight: 600, color: dt.c, background: dt.bg, outline: 'none' }} />
              </label>
            </div>
          )}
      </div>
    )
  }

  /* ─── Plan de hoy: render ────────────────────────────────── */
  // Estos tres eran componentes declarados dentro del render: su identidad de tipo cambiaba
  // en cada render, así que React desmontaba y remontaba el subárbol (se perdía el foco y se
  // re-animaba todo). Como funciones que devuelven JSX se reconcilian normalmente.
  const insLine = <div style={{ height: 2, background: '#C2933A', borderRadius: 99, margin: '3px 0' }} />

  const renderPrioPopover = ({ current, onPick }: { current?: Prio; onPick: (p: Prio) => void }) => (
    <div data-pop className="animate-fade" style={{ ...popPos(prioMenuUp, 6), zIndex: 50, background: '#fff', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 12, boxShadow: '0 20px 40px -20px rgba(8,18,36,.5)', padding: 6, width: 152 }}>
      {(['alta', 'media', 'baja'] as Prio[]).map(p => {
        const ps = prioStyle(p); const on = (current || 'media') === p
        return (
          <button key={p} onClick={() => onPick(p)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', border: 'none', borderRadius: 8, cursor: 'pointer', background: on ? 'rgba(194,147,58,0.10)' : 'transparent', color: '#16365F', fontSize: 12.5, fontWeight: 600 }}>
            <PrioBars p={p} /> {ps.label}
            {on && <span style={{ marginLeft: 'auto', color: '#C2933A' }}>✓</span>}
          </button>
        )
      })}
    </div>
  )

  const renderRowMenu = ({ x, pos, total }: { x: { e: Epica; t: EpicaTask; i: number }; pos: number; total: number }) => {
    const { e, i } = x
    const key = planKey(e.id, i)
    const mi = (label: string, fn: () => void, disabled = false, danger = false) => (
      <button disabled={disabled} onClick={fn} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', background: 'transparent', color: disabled ? 'rgba(20,35,61,0.3)' : danger ? '#B0522E' : '#16365F', fontSize: 12.5, fontWeight: 600 }}>{label}</button>
    )
    return (
      <div data-pop className="animate-fade" style={{ ...popPos(rowMenuUp, 6), zIndex: 50, background: '#fff', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 12, boxShadow: '0 20px 40px -20px rgba(8,18,36,.5)', padding: 6, width: 196 }}>
        {planSort === 'plan' && <>
          {mi('↑  Subir', () => movePlan(key, 'up'), pos === 0)}
          {mi('↓  Bajar', () => movePlan(key, 'down'), pos === total - 1)}
          <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '5px 4px' }} />
        </>}
        <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', padding: '4px 10px 6px' }}>Mover a</div>
        {mi('→  Posponer a mañana', () => { planTaskToDay(e, i, addDays(viewDate, 1), { toast: true }); setRowMenu(null) })}
        {mi('Mover a otro día…', () => { setRowMenu(null); setCalMonth((e.tasks[i]?.plan || viewDate).slice(0, 7)); setMovePick({ eId: e.id, i }) })}
        <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '5px 4px' }} />
        <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', padding: '4px 10px 6px' }}>Prioridad</div>
        <div style={{ display: 'flex', gap: 5, padding: '0 8px 4px' }}>
          {(['alta', 'media', 'baja'] as Prio[]).map(p => {
            const ps = prioStyle(p); const on = (x.t.priority || 'media') === p
            return <button key={p} onClick={() => setPriority(e, i, p)} title={ps.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '7px 0', border: on ? `1px solid ${ps.c}` : '1px solid rgba(15,35,64,0.12)', borderRadius: 8, background: on ? 'rgba(194,147,58,0.08)' : '#fff', cursor: 'pointer' }}><PrioBars p={p} /><span style={{ fontSize: 10, fontWeight: 700, color: on ? ps.c : 'rgba(20,35,61,0.5)' }}>{ps.label}</span></button>
          })}
        </div>
        <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '5px 4px' }} />
        {mi('Quitar del plan', () => removeFromPlan(e, i), false, true)}
      </div>
    )
  }

  // Calendario mensual reutilizable (masthead y "Mover a otro día…")
  const renderMonthPopover = (value: string, onPick: (iso: string) => void) => {
    const arrow: CSSProperties = { height: 28, width: 28, borderRadius: 99, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', cursor: 'pointer', color: '#10233F', fontSize: 16, lineHeight: 1 }
    const title = cap(new Date(calMonth + '-01T00:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))
    const cell = (cd: string) => {
      const inMonth = cd.slice(0, 7) === calMonth
      const sel = cd === value
      const isTd = cd === today
      const c = planCounts.get(cd)
      const dot = c ? (c.done === c.total ? '#2E6E6E' : '#C2933A') : null
      return (
        <button key={cd} onClick={() => onPick(cd)} style={{ position: 'relative', height: 36, borderRadius: 9, border: sel ? 'none' : isTd ? '1.5px solid rgba(194,147,58,0.6)' : '1px solid transparent', background: sel ? '#10233F' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="serif" style={{ fontSize: 15, fontWeight: 600, color: sel ? '#fff' : isTd ? '#A87A2C' : inMonth ? '#10233F' : 'rgba(20,35,61,0.3)' }}>{dayNum(cd)}</span>
          {dot && <span style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 99, background: sel ? '#E7C56B' : dot }} />}
        </button>
      )
    }
    return (
      <div className="animate-fade" style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 16, boxShadow: '0 24px 50px -30px rgba(15,35,64,0.5)', padding: 14, width: 'min(300px, calc(100vw - 40px))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 4 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setCalMonth(m => addMonth(m, -12))} aria-label="Año anterior" title="Año anterior" style={arrow}>«</button>
            <button onClick={() => setCalMonth(m => addMonth(m, -1))} aria-label="Mes anterior" title="Mes anterior" style={arrow}>‹</button>
          </div>
          <span className="serif" style={{ fontWeight: 600, fontSize: 18, color: '#10233F', whiteSpace: 'nowrap' }}>{title}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setCalMonth(m => addMonth(m, 1))} aria-label="Mes siguiente" title="Mes siguiente" style={arrow}>›</button>
            <button onClick={() => setCalMonth(m => addMonth(m, 12))} aria-label="Año siguiente" title="Año siguiente" style={arrow}>»</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 2 }}>
          {DAYS.map((d, i) => <span key={i} style={{ textAlign: 'center', font: '700 10px/1 var(--font-ui)', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', padding: '4px 0' }}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>{monthGrid(calMonth).map(cell)}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {([['Hoy', today], ['Mañana', addDays(today, 1)], ['Este finde', weekendISO(today)]] as [string, string][]).map(([lbl, iso]) => {
            const on = iso === value
            return <button key={lbl} onClick={() => onPick(iso)} style={{ borderRadius: 99, padding: '6px 12px', font: '700 11.5px var(--font-ui)', cursor: 'pointer', border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{lbl}</button>
          })}
        </div>
      </div>
    )
  }

  // Tira de días (navegación) + botón de calendario
  const renderDayStrip = () => (
    <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'stretch', position: 'relative' }}>
      <button data-pop onClick={() => { setCalOpen(v => !v); setCalMonth(viewDate.slice(0, 7)) }} aria-label="Elegir fecha" title="Elegir fecha"
        style={{ flexShrink: 0, width: 46, minWidth: 46, height: 62, borderRadius: 14, border: calOpen ? '1px solid rgba(194,147,58,0.5)' : '1px solid rgba(15,35,64,0.12)', background: calOpen ? 'rgba(194,147,58,0.10)' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10233F" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        <span style={{ font: '700 10px/1 var(--font-ui)', textTransform: 'uppercase', color: '#A87A2C' }}>{cap(new Date(viewDate + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))}</span>
      </button>
      {calOpen && (
        <div ref={calRef} data-pop style={{ position: 'absolute', top: 68, left: 0, zIndex: 55 }}>
          {renderMonthPopover(viewDate, iso => { setViewDate(iso); setCalMonth(iso.slice(0, 7)); setCalOpen(false) })}
        </div>
      )}
      <div ref={dayStripRef} className="plan-daystrip" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x proximity' }}>
        {stripDays.map(d => {
          const sel = d === viewDate
          const isT = d === today
          const c = planCounts.get(d)
          const allDone = !!c && c.done === c.total
          const over = dragOverDay === d && !sel
          const past = d < today
          const pend = c ? c.total - c.done : 0
          const pastPend = past && pend > 0            // día pasado con tareas sin terminar
          const lblColor = sel ? '#E7C56B' : isT ? '#A87A2C' : pastPend ? '#B0522E' : 'rgba(20,35,61,0.5)'
          const numColor = sel ? '#F3EFE6' : pastPend ? '#B0522E' : ((c && c.total > 0) || isT ? '#10233F' : 'rgba(16,35,64,0.4)')
          return (
            <button key={d} data-day={d} data-day-selected={sel || undefined} onClick={() => { setViewDate(d); setCalMonth(d.slice(0, 7)) }} className="plan-day"
              style={{ flexShrink: 0, minWidth: 58, height: 62, padding: '0 6px', borderRadius: 14, border: over ? '1.5px solid #C2933A' : sel ? '1px solid #10233F' : isT ? '1px solid rgba(194,147,58,0.45)' : pastPend ? '1px solid rgba(176,82,46,0.35)' : '1px solid rgba(15,35,64,0.10)', background: over ? 'rgba(194,147,58,0.12)' : sel ? '#10233F' : pastPend ? 'rgba(176,82,46,0.05)' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, scrollSnapAlign: 'start', opacity: past && !sel && !pastPend ? 0.55 : 1, boxShadow: sel ? '0 8px 18px -10px rgba(15,35,64,.55)' : 'none' }}>
              <span className="plan-day-lbl" style={{ font: '700 10px/1 var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.06em', color: lblColor }}>{relShort(d)}</span>
              <span className="serif plan-day-num" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: numColor }}>{dayNum(d)}</span>
              {c && c.total > 0
                ? <span title={pastPend ? `${pend} sin terminar` : undefined} style={{ height: 16, padding: '0 6px', borderRadius: 99, display: 'flex', alignItems: 'center', font: '700 10px/1 var(--font-ui)', background: allDone ? (sel ? 'rgba(231,197,107,0.22)' : 'rgba(62,142,142,0.14)') : pastPend && !sel ? 'rgba(176,82,46,0.14)' : (sel ? 'rgba(255,255,255,0.16)' : 'rgba(194,147,58,0.14)'), color: allDone ? (sel ? '#E7C56B' : '#2E6E6E') : pastPend && !sel ? '#B0522E' : (sel ? '#F3EFE6' : '#A87A2C') }}>{allDone ? '✓' : pastPend ? pend : c.total}</span>
                : <span style={{ width: 3, height: 3, borderRadius: 99, background: sel ? 'rgba(255,255,255,0.3)' : 'rgba(15,35,64,0.16)' }} />}
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderPlanRow = (x: { e: Epica; t: EpicaTask; i: number }, pos: number, noDrag = false) => {
    const { e, t, i } = x
    const key = planKey(e.id, i)
    const ps = prioStyle(t.priority)
    const dt = dueTone(t.due, false)
    const dragging = draggingKey === key
    const selected = planSel.has(key)
    return (
      <div key={key} data-plan-row data-key={key} className="plan-row"
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 6px', borderBottom: '1px solid rgba(15,35,64,0.06)', transition: 'background .18s, box-shadow .12s', borderRadius: dragging || selected ? 12 : 0, background: dragging ? '#FFFDF8' : selected ? 'rgba(16,35,64,0.045)' : 'transparent', boxShadow: dragging ? '0 18px 30px -18px rgba(15,35,64,0.45)' : 'none', opacity: draggingKey && !dragging ? 0.7 : 1 }}>
        <button onClick={() => togglePlanSel(key)} className="plan-sel" data-on={selected || undefined}
          aria-label={selected ? 'Quitar de la selección' : 'Seleccionar tarea'} title="Seleccionar (para acciones en lote)"
          style={{ flexShrink: 0, height: 20, width: 20, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: selected ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: selected ? '#10233F' : '#fff', color: '#fff' }}>
          {selected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
        </button>
        <button onClick={ev => { if (ev.detail > 1) return; completeFromPlan(e, i) }} aria-label="Marcar terminada" title="Marcar terminada" className="plan-check"
          style={{ flexShrink: 0, height: 30, width: 30, borderRadius: 99, border: '1.5px solid rgba(15,35,64,0.25)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'transparent', transition: 'border-color .15s, color .15s' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
          <span style={{ width: ps.accentW, height: 30, borderRadius: 99, background: ps.accent, flexShrink: 0 }} />
          <span className="serif plan-num" style={{ fontSize: 26, lineHeight: 1, fontWeight: 600, color: '#10233F', fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{String(pos + 1).padStart(2, '0')}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {pos === 0 && <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: '#A87A2C', marginBottom: 3 }}>Empieza aquí</div>}
          <div className="plan-title" onClick={() => setTaskView({ eId: e.id, i })} title="Ver tarea" style={{ fontSize: 15, fontWeight: 600, color: '#16365F', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
            <button onClick={() => setFeaturedId(e.id)} title={`Ver ${e.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 11, color: 'rgba(20,35,61,0.5)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}
            </button>
            <span style={{ padding: '2px 8px', borderRadius: 99, font: '700 10.5px var(--font-ui)', color: dt.c, background: dt.bg, border: `1px solid ${dt.border}` }}>{t.due ? fmtDue(t.due) : 'sin fecha'}</span>
            {t.plan && t.plan < today && (
              <span title={`Se planeó para el ${fmtDue(t.plan)} y sigue pendiente`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: '#B0522E', background: 'rgba(176,82,46,0.10)', border: '1px solid rgba(176,82,46,0.4)', borderRadius: 99, padding: '1px 8px' }}>⏳ de días anteriores</span>
            )}
            {diasCon(t) >= 1 && (
              <span title={`Llevas ${diasCon(t)} día${diasCon(t) === 1 ? '' : 's'} con esta tarea${t.createdAt ? ` (creada el ${fmtDue(t.createdAt)})` : ''}`} style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>🕐 {diasCon(t)}d</span>
            )}
            {t.repeat && (
              <span title={`Se repite ${repeatLabel(t.repeat)}${t.repeatUntil ? ` hasta el ${fmtDue(t.repeatUntil)}` : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: REPEAT_TONE.c, background: REPEAT_TONE.bg, border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 99, padding: '1px 8px' }}>↻ {repeatLabel(t.repeat)}</span>
            )}
            {(t.progressLog || []).some(x => x.d === viewDate) && <span title="Avanzaste en esta tarea este día" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)', borderRadius: 99, padding: '1px 7px' }}>✎ avancé</span>}
            {t.subtasks && t.subtasks.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: t.subtasks.every(s => s.done) ? '#2E6E6E' : 'rgba(20,35,61,0.5)' }}>☑ {t.subtasks.filter(s => s.done).length}/{t.subtasks.length} · {Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100)}%</span>}
            {typeof t.progress === 'number' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 80 }}>
                <span style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: e.color }} /></span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>
              </span>
            )}
          </div>
          {t.links && t.links.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
              {t.links.map((l, li) => (
                <a key={li} href={l.url || '#'} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" onClick={ev => ev.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)', borderRadius: 99, padding: '2px 8px' }}>🔗 {l.label || l.url}</a>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, position: 'relative' }}>
          <button data-pop onClick={ev => { ev.stopPropagation(); setPrioMenuUp(shouldFlipUp(ev.currentTarget, 150)); setPrioMenu(prioMenu === key ? null : key); setRowMenu(null) }} title={`Prioridad: ${ps.label}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
            <PrioBars p={t.priority} />
          </button>
          {prioMenu === key && renderPrioPopover({ current: t.priority, onPick: p => setPriority(e, i, p) })}
          {!noDrag && <span className="plan-grip" onPointerDown={ev => onGripDown(ev, key)} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripCancel} title="Arrastra para reordenar" style={{ color: 'rgba(20,35,61,0.55)', cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center' }}><GripIcon /></span>}
          <button data-pop onClick={ev => { ev.stopPropagation(); setRowMenuUp(shouldFlipUp(ev.currentTarget, 330)); setRowMenu(rowMenu === key ? null : key); setPrioMenu(null) }} aria-label="Más acciones" title="Más acciones" style={{ height: 30, width: 30, border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 8, cursor: 'pointer', color: 'rgba(20,35,61,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, lineHeight: 1 }}>⋯</button>
          {rowMenu === key && renderRowMenu({ x, pos, total: planPend.length })}
        </div>
      </div>
    )
  }

  const renderDoneRow = (x: { e: Epica; t: EpicaTask; i: number }) => {
    const { e, t, i } = x
    return (
      <div key={planKey(e.id, i)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px', borderBottom: '1px solid rgba(15,35,64,0.05)' }}>
        <button onClick={() => uncompleteFromPlan(e, i)} aria-label="Marcar sin terminar" title="Marcar sin terminar" style={{ flexShrink: 0, height: 22, width: 22, borderRadius: 99, border: 'none', background: '#2E6E6E', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={() => setTaskView({ eId: e.id, i })} style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(20,35,61,0.55)', textDecoration: 'line-through', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} /><span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>{e.name}</span>
          </div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#2E6E6E' }}>✓ {fmtDue(t.doneAt || viewDate)}</span>
      </div>
    )
  }

  const renderPlanToday = () => {
    const empty = planTotal === 0
    const suggestions: { e: Epica; i: number; t: EpicaTask }[] = []
    if (empty) {
      activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
        if (t.status === 'Terminada' || t.plan === viewDate) return
        if (!t.due) return
        const ok = isToday ? (daysUntil(t.due) ?? 1e9) <= 7 : t.due <= viewDate
        if (ok) suggestions.push({ e, i, t })
      }))
      suggestions.sort((a, b) => (a.t.due || '').localeCompare(b.t.due || ''))
    }
    return (
      <div className="ep-pop" style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 20, boxShadow: '0 24px 50px -34px rgba(15,35,64,0.5)', overflow: 'hidden', marginBottom: 26 }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#10233F 0%,#C2933A 55%,#E7C56B 100%)' }} />
        <div className="plan-body" style={{ padding: '26px 28px' }}>
          <div className="plan-mast" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="serif" style={{ fontStyle: 'italic', fontSize: 14, color: '#A87A2C' }}>{isToday ? greeting() : relLong(viewDate)}</span>
              <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.22em', textTransform: 'uppercase', color: '#A87A2C' }}>{isToday ? 'Enfoque de hoy' : 'Plan del día'}</span>
              {isToday && planAllDone
                ? <span className="serif plan-date" style={{ fontStyle: 'italic', fontSize: 26, lineHeight: 1, color: '#A87A2C' }}>Enfoque cumplido ✦</span>
                : <span className="serif plan-date" style={{ fontWeight: 600, fontSize: 30, lineHeight: 1, color: '#10233F' }}>{dateLabel(viewDate)}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {!isToday && (
                <button onClick={() => setViewDate(today)} style={{ border: '1px solid rgba(194,147,58,0.4)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 10, padding: '9px 14px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>‹ Hoy</button>
              )}
              {planTotal > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <ProgressRing pct={planPct} done={planAllDone} />
                  <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', whiteSpace: 'nowrap' }}><span className="serif" style={{ fontSize: 18, color: '#10233F' }}>{planDone.length}</span> de {planTotal} hechas</span>
                </div>
              )}
              {/* Dos caminos distintos: traer algo que ya existe, o crear algo nuevo.
                  Antes sólo existía el primero y "+ Agregar" no dejaba crear nada. */}
              <button onClick={() => setPickerOpen(true)} title="Traer al plan una tarea que ya existe" style={{ border: '1px solid rgba(194,147,58,0.4)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 10, padding: '9px 15px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Del backlog</button>
              <button onClick={() => newTaskForDay(viewDate)} title={`Crear una tarea nueva planeada para ${relLong(viewDate).toLowerCase()}`} style={{ ...goldBtn, padding: '9px 15px', font: '700 12.5px var(--font-ui)', whiteSpace: 'nowrap' }}>+ Nueva tarea</button>
            </div>
          </div>

          {renderDayStrip()}

          {isToday && (() => {
            const monday = mondayISO(today)
            const todayIdx = (new Date(today + 'T00:00:00').getDay() + 6) % 7
            const all = activeEpics.flatMap(e => (e.routines || []).map((r, ri) => ({ e, r, ri })))
            if (all.length === 0) return null
            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 8 }}>Rutinas de hoy</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {all.map(({ e, r, ri }) => {
                    const wk = getRoutineWeek(r, monday)
                    const on = wk[todayIdx]; const n = wk.filter(Boolean).length
                    const nc = n >= 5 ? '#2E6E6E' : n >= 3 ? '#A87A2C' : 'rgba(20,35,61,0.4)'
                    return (
                      <span key={e.id + ':' + ri} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 99, padding: '5px 6px 5px 9px', border: on ? `1px solid ${e.color}` : '1px solid rgba(15,35,64,0.12)', background: on ? 'rgba(15,35,64,0.02)' : '#fff' }}>
                        <button onClick={() => toggleRoutineToday(e, ri)} title={on ? 'Hecha hoy' : 'Marcar hoy'} style={{ height: 18, width: 18, borderRadius: 5, cursor: 'pointer', border: on ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: on ? e.color : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}</button>
                        <button onClick={() => setRoutineStat({ eId: e.id, ri })} aria-label="Ver estadísticas" title="Ver estadísticas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#16365F' }}>{r.t}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: nc }}>{n}/7</span>
                        </button>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {isToday && arrastradas.length > 0 && !hideYesterday && (
            <div style={{ marginTop: 16, borderRadius: 13, background: 'rgba(176,82,46,0.06)', border: '1px solid rgba(176,82,46,0.28)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', background: 'rgba(176,82,46,0.08)' }}>
                <span style={{ fontSize: 14 }}>⏳</span>
                <span style={{ font: '800 10.5px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: '#B0522E' }}>De días anteriores</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(176,82,46,0.6)' }}>{arrastradas.length}</span>
                <span style={{ flex: 1 }} />
                <button onClick={bringOverdue} aria-label="Reprogramar todas para hoy" title="Reprogramar todas para hoy" style={{ border: 'none', background: 'transparent', color: '#B0522E', font: '800 11.5px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Traer todas a hoy →</button>
                <button onClick={() => setHideYesterday(true)} aria-label="Ocultar por ahora" title="Ocultar por ahora" style={{ border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.55)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ padding: '2px 6px 4px' }}>
                {arrastradas.map(({ e, t, i }) => {
                  const dc = diasCon(t)
                  const late = Math.round((new Date(today + 'T00:00:00').getTime() - new Date((t.plan || today) + 'T00:00:00').getTime()) / 86400000)
                  const dt = dueTone(t.due, false)
                  return (
                    <div key={planKey(e.id, i)} onClick={() => setTaskView({ eId: e.id, i })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 9, cursor: 'pointer' }}
                      onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(176,82,46,0.05)')} onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                      <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 99, background: e.color }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>{e.name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#B0522E' }}>· se planeó hace {late}{late === 1 ? ' día' : ' días'}</span>
                          {dc >= 1 && <span title="Desde que empezaste con esta tarea" style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>· 🕐 {dc}{dc === 1 ? ' día' : ' días'} en esto</span>}
                          {t.due && <span style={{ fontSize: 10, fontWeight: 700, color: dt.c }}>· {fmtDue(t.due)}</span>}
                        </div>
                      </div>
                      <button onClick={ev => { ev.stopPropagation(); planTaskToDay(e, i, today) }} aria-label="Traer solo esta a hoy" title="Traer solo esta a hoy" style={{ flexShrink: 0, border: '1px solid rgba(176,82,46,0.4)', background: '#fff', color: '#B0522E', borderRadius: 8, padding: '4px 9px', font: '800 11px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Hoy →</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {empty ? (
            <div style={{ padding: '28px 12px 12px', textAlign: 'center' }}>
              <div className="serif" style={{ fontSize: 27, color: '#10233F', margin: '4px 0 6px', lineHeight: 1.1 }}>{isToday ? 'Aún no defines tu enfoque de hoy.' : `Nada planeado para ${daysUntil(viewDate) === 1 ? 'mañana' : 'el ' + weekdayAbbr(viewDate).toLowerCase()}.`}</div>
              <div style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.55)', maxWidth: 380, margin: '0 auto 18px' }}>{isToday ? 'Elige las pocas cosas que de verdad moverán la aguja hoy.' : 'Adelántate: agenda lo que quieras avanzar ese día.'}</div>
              <div style={{ display: 'flex', gap: 9, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => setPickerOpen(true)} style={{ ...goldBtn, padding: '11px 22px' }}>Elegir del backlog</button>
                <button onClick={() => newTaskForDay(viewDate)} style={{ border: '1px solid rgba(15,35,64,0.16)', background: '#fff', color: '#16365F', borderRadius: 11, padding: '11px 20px', font: '700 13px var(--font-ui)', cursor: 'pointer' }}>+ Nueva tarea</button>
              </div>
              {suggestions.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 9 }}>{isToday ? 'Sugerencias para hoy' : 'Para ese día'}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }}>
                    {suggestions.slice(0, 4).map(s => {
                      const dt = dueTone(s.t.due, false)
                      return (
                        <button key={planKey(s.e.id, s.i)} onClick={() => addToPlan(s.e, s.i)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#16365F' }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: s.e.color }} />{s.t.t}
                          <span style={{ fontSize: 10, fontWeight: 700, color: dt.c }}>{fmtDue(s.t.due)}</span>
                          <span style={{ color: '#A87A2C', fontWeight: 800 }}>+</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {isToday && arrastradas.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <button onClick={bringOverdue} style={{ border: 'none', background: 'transparent', color: '#B0522E', font: '700 12.5px var(--font-ui)', cursor: 'pointer' }}>Traer {arrastradas.length} {arrastradas.length === 1 ? 'pendiente' : 'pendientes'} de días anteriores →</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '18px 0 8px' }} />
              {(() => {
                const passF = (t: EpicaTask) => planFilter === 'alta' ? t.priority === 'alta' : planFilter === 'vencidas' ? (() => { const dl = daysUntil(t.due); return dl != null && dl < 0 })() : planFilter === 'avance' ? (t.progressLog || []).some(x => x.d === viewDate) : true
                const filtered = planPend.filter(x => passF(x.t))
                const cmp = (a: typeof planPend[number], b: typeof planPend[number]) => {
                  if (planSort === 'prioridad') return (PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']) || ((daysUntil(a.t.due) ?? 1e9) - (daysUntil(b.t.due) ?? 1e9))
                  if (planSort === 'entrega') return (a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')
                  if (planSort === 'avance') return (b.t.progress || 0) - (a.t.progress || 0)
                  if (planSort === 'epica') return a.e.name.localeCompare(b.e.name, 'es')
                  return 0
                }
                const manual = planSort === 'plan'
                const list = manual ? filtered : [...filtered].sort(cmp)
                return (
                  <>
                    {planPend.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        <select value={planSort} onChange={e => setPlanSort(e.target.value as typeof planSort)} title="Ordenar el enfoque" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
                          <option value="plan">Orden manual</option>
                          <option value="prioridad">Prioridad</option>
                          <option value="entrega">Entrega</option>
                          <option value="avance">Avance</option>
                          <option value="epica">Épica</option>
                        </select>
                        {([['todas', 'Todas'], ['alta', 'Alta'], ['vencidas', 'Vencidas'], ['avance', 'Con avance']] as [typeof planFilter, string][]).map(([k, label]) => {
                          const on = planFilter === k
                          return <button key={k} onClick={() => setPlanFilter(k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.55)' }}>{label}</button>
                        })}
                        <span style={{ flex: 1 }} />
                        {!manual && planFilter === 'todas' && list.length > 1 && <button onClick={() => commitPlanOrder(list)} aria-label="Guardar este orden como el orden manual" title="Guardar este orden como el orden manual" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', font: '700 11px var(--font-ui)' }}>Fijar este orden</button>}
                      </div>
                    )}
                    {manual && planFilter === 'todas' && filtered.length > 1 && planSel.size === 0 && (
                      <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)', marginBottom: 4 }}>En orden de arriba hacia abajo · el 01 es por dónde empiezas · arrastra para reordenar.</div>
                    )}

                    {/* ACCIONES EN LOTE — aparece al seleccionar filas del enfoque */}
                    {planSel.size > 0 && (() => {
                      const listKeys = list.map(x => planKey(x.e.id, x.i))
                      const allSel = listKeys.length > 0 && listKeys.every(k => planSel.has(k))
                      const btn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.10)', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }
                      return (
                        <div className="animate-fade" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#10233F', borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
                          <span style={{ font: '800 11.5px var(--font-ui)', color: '#E7C56B', whiteSpace: 'nowrap' }}>{planSel.size} {planSel.size === 1 ? 'seleccionada' : 'seleccionadas'}</span>
                          <button onClick={() => setPlanSel(allSel ? new Set() : new Set(listKeys))} style={btn}>{allSel ? 'Ninguna' : 'Todas'}</button>
                          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.16)' }} />

                          <button onClick={() => planBulkMove(addDays(viewDate, 1))} style={btn}>→ Mañana</button>
                          {viewDate !== today && <button onClick={() => planBulkMove(today)} style={btn}>Hoy</button>}
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Mover a</span>
                            <input type="date" value={planMoveDay} aria-label="Mover la selección a una fecha"
                              onChange={ev => { const v = ev.target.value; setPlanMoveDay(''); planBulkMove(v) }}
                              style={{ ...btn, cursor: 'pointer', colorScheme: 'dark' }} />
                          </label>
                          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.16)' }} />

                          <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Prioridad</span>
                          {(['alta', 'media', 'baja'] as Prio[]).map(p => (
                            <button key={p} onClick={() => planBulkPrio(p)} style={btn}>{prioStyle(p).label}</button>
                          ))}
                          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.16)' }} />

                          <button onClick={planBulkDone} style={{ ...btn, border: '1px solid rgba(62,142,142,0.5)', background: 'rgba(62,142,142,0.25)' }}>✓ Terminar</button>
                          <button onClick={planBulkRemove} style={{ ...btn, border: '1px solid rgba(176,82,46,0.5)', background: 'rgba(176,82,46,0.22)' }}>Quitar del plan</button>
                          <span style={{ flex: 1 }} />
                          <button onClick={() => setPlanSel(new Set())} aria-label="Limpiar selección" style={{ ...btn, padding: '6px 9px' }}>✕</button>
                        </div>
                      )
                    })()}
                    <div ref={planListRef}>
                      {list.map((x, pos) => (
                        <div key={planKey(x.e.id, x.i)}>
                          {manual && draggingKey && dropIndex === pos && insLine}
                          {renderPlanRow(x, pos, !manual)}
                        </div>
                      ))}
                      {manual && draggingKey && dropIndex === list.length && insLine}
                    </div>
                    {filtered.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.55)', padding: '6px 0' }}>Ninguna tarea del plan coincide con el filtro.</div>}
                  </>
                )
              })()}
              {planPend.length === 0 && planDone.length > 0 && (
                <div style={{ fontSize: 13, color: '#2E6E6E', fontWeight: 600, padding: '10px 6px' }}>{isToday ? 'Todo hecho por hoy ✦' : 'Todo hecho este día ✦'}</div>
              )}

              {/* TRABAJADAS — tareas con avance registrado este día que NO están en el plan del día */}
              {(() => {
                const inPlanKeys = new Set(planItems.map(x => planKey(x.e.id, x.i)))
                const worked: { e: Epica; t: EpicaTask; i: number }[] = []
                activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
                  if ((t.progressLog || []).some(x => x.d === viewDate) && !inPlanKeys.has(planKey(e.id, i))) worked.push({ e, t, i })
                }))
                if (worked.length === 0) return null
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ height: 7, width: 7, borderRadius: 99, background: '#A87A2C' }} />
                      <span style={{ font: '800 10.5px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: '#A87A2C' }}>{isToday ? 'Trabajadas hoy' : 'Trabajadas ese día'}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)' }}>{worked.length}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}>avanzaste, aunque estén en otro día</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {worked.map(({ e, t, i }) => {
                        const done = t.status === 'Terminada'; const st = taskStyle(t.status)
                        return (
                          <div key={planKey(e.id, i)} onClick={() => setTaskView({ eId: e.id, i })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer' }}>
                            <span style={{ flexShrink: 0, height: 18, width: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(194,147,58,0.14)', color: '#A87A2C', fontSize: 11 }}>✎</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'rgba(20,35,61,0.45)' : '#16365F', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, flexWrap: 'wrap' }}>
                                <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} />
                                <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>{e.name}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: st.bg, color: st.c }}>{st.label}</span>
                                {t.plan && <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>· para {relShort(t.plan)}</span>}
                              </div>
                            </div>
                            {typeof t.progress === 'number' && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {planDone.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => setDoneOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.08)', background: '#fff', borderRadius: 10, padding: '9px 12px', font: '800 10.5px var(--font-ui)', letterSpacing: '.06em', color: '#2E6E6E', textTransform: 'uppercase' }}>
                    <span style={{ height: 7, width: 7, borderRadius: 99, background: '#2E6E6E' }} />
                    {isToday ? 'Hechas hoy' : 'Hechas este día'} <span style={{ color: 'rgba(20,35,61,0.55)' }}>{planDone.length}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', transform: doneOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                  </button>
                  {doneOpen && <div style={{ marginTop: 4 }}>{planDone.map(renderDoneRow)}</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  const renderPicker = () => {
    const q = norm(pickerQ)
    const pool: { e: Epica; t: EpicaTask; i: number }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => { if (t.status !== 'Terminada') pool.push({ e, t, i }) }))
    const match = (x: { e: Epica; t: EpicaTask }) => {
      if (pickerEpica !== 'todas' && x.e.id !== pickerEpica) return false
      if (!q) return true
      return norm(x.t.t).includes(q) || norm(x.e.name).includes(q)
    }
    const filtered = pool.filter(match)
    const inPlan = (x: { t: EpicaTask }) => x.t.plan === viewDate
    const parV = filtered.filter(x => !inPlan(x)).filter(x => x.t.due && (isToday ? (daysUntil(x.t.due) ?? 1e9) <= 7 : x.t.due <= viewDate)).sort((a, b) => (a.t.due || '').localeCompare(b.t.due || ''))
    const groups = new Map<string, { e: Epica; items: typeof pool }>()
    filtered.forEach(x => { if (!groups.has(x.e.id)) groups.set(x.e.id, { e: x.e, items: [] }); groups.get(x.e.id)!.items.push(x) })
    const row = (x: { e: Epica; t: EpicaTask; i: number }) => {
      const on = inPlan(x); const dt = dueTone(x.t.due, false)
      const otherDay = !!x.t.plan && x.t.plan !== viewDate
      return (
        <button key={planKey(x.e.id, x.i)} onClick={ev => { if (ev.detail > 1) return; on ? removeFromPlan(x.e, x.i, false) : planTaskToDay(x.e, x.i, viewDate) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '10px 11px', borderRadius: 10, cursor: 'pointer', border: on ? '1px solid rgba(194,147,58,0.35)' : '1px solid transparent', background: on ? 'rgba(194,147,58,0.08)' : 'transparent', borderLeft: on ? '2px solid #C2933A' : '2px solid transparent' }}>
          <span style={{ flexShrink: 0, height: 20, width: 20, borderRadius: 99, border: on ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: on ? '#C2933A' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.t.t}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: x.e.color }} />
              <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>{x.e.name}</span>
              {x.t.due && <span style={{ padding: '1px 6px', borderRadius: 99, font: '700 9.5px var(--font-ui)', color: dt.c, background: dt.bg, border: `1px solid ${dt.border}` }}>{fmtDue(x.t.due)}</span>}
              {otherDay && <span title={`Planeada para ${dateLabel(x.t.plan!)}`} style={{ padding: '1px 7px', borderRadius: 99, font: '700 10px var(--font-ui)', color: '#5A6B82', background: 'rgba(90,107,130,0.10)', border: '1px solid rgba(90,107,130,0.22)' }}>{relShort(x.t.plan!)}</span>}
            </span>
          </span>
        </button>
      )
    }
    return (
      <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 75, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
        <div role="dialog" aria-modal="true" aria-label="Buscar tarea" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
          <div style={{ height: 4, background: 'linear-gradient(90deg,#E7C56B,#C2933A)' }} />
          <div style={{ padding: '18px 22px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>Agregar al plan</div>
                <div className="serif" style={{ fontWeight: 600, fontSize: 22, lineHeight: 1, color: '#10233F' }}>{isToday ? `Hoy · ${fmtDue(today)}` : dateLabel(viewDate)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#A87A2C', whiteSpace: 'nowrap' }}>{planTotal} en el plan</span>
                <button aria-label="Cerrar buscador" onClick={() => setPickerOpen(false)} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
              </div>
            </div>
            <input autoFocus value={pickerQ} onChange={e => setPickerQ(e.target.value)} placeholder="Buscar tarea o épica…" style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, border: '1px solid rgba(15,35,64,0.15)', borderRadius: 10, padding: '10px 12px', fontSize: 16, color: '#14233D', background: '#fff', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2, marginTop: 10 }}>
              <button onClick={() => setPickerEpica('todas')} style={{ flexShrink: 0, cursor: 'pointer', borderRadius: 99, padding: '6px 11px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', border: pickerEpica === 'todas' ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: pickerEpica === 'todas' ? '#10233F' : '#fff', color: pickerEpica === 'todas' ? '#fff' : 'rgba(20,35,61,0.6)' }}>Todas</button>
              {activeEpics.map(e => {
                const on = pickerEpica === e.id
                return <button key={e.id} onClick={() => setPickerEpica(e.id)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 99, padding: '6px 11px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}</button>
              })}
            </div>
          </div>
          <div className="ep-modal-body" style={{ padding: '4px 14px 8px', maxHeight: '56vh', overflow: 'auto' }}>
            {filtered.length === 0 && <div style={{ padding: '26px 10px', textAlign: 'center', fontSize: 13, color: 'rgba(20,35,61,0.5)' }}>{pickerQ ? <>Nada coincide con «{pickerQ}»</> : 'No hay tareas activas'}</div>}
            {!pickerQ && parV.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#B0522E', padding: '8px 11px 4px' }}>{isToday ? 'Para hoy · urgentes' : 'Vencen para esta fecha'}</div>
                {parV.slice(0, 6).map(row)}
                <div style={{ height: 1, background: 'rgba(15,35,64,0.07)', margin: '8px 8px 2px' }} />
              </div>
            )}
            {Array.from(groups.values()).map(g => (
              <div key={g.e.id} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px 4px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: g.e.color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>{g.e.name}</span>
                  <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}>{g.items.length}</span>
                </div>
                {g.items.map(row)}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid rgba(15,35,64,0.08)' }}>
            <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}>{planTotal} en el plan</span>
            <button onClick={() => setPickerOpen(false)} style={{ ...goldBtn, padding: '10px 20px' }}>Listo</button>
          </div>
        </div>
      </div>
    )
  }

  /** Tablero tipo Trello: una columna por estado, tarjetas arrastrables entre ellas.
   *  Comparte los filtros y la búsqueda del backlog; el filtro de estado se ignora
   *  aquí porque las columnas SON los estados. */
  const renderBoard = (rows: { e: Epica; t: EpicaTask; i: number }[]) => {
    const DONE_CAP = 12
    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 17px 18px', alignItems: 'flex-start' }}>
        {TASK_STATUSES.map(status => {
          const ts = taskStyle(status)
          const all = rows.filter(x => x.t.status === status)
          const isDone = status === 'Terminada'
          // Las terminadas se acumulan sin fin: se muestran las más recientes.
          const sorted = isDone
            ? [...all].sort((a, b) => (b.t.doneAt || '').localeCompare(a.t.doneAt || ''))
            : [...all].sort((a, b) =>
                (PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']) ||
                ((a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')))
          const shown = isDone ? sorted.slice(0, DONE_CAP) : sorted
          const over = boardOverCol === status && !!boardDrag

          return (
            <div key={status} data-col={status}
              style={{ flex: '1 1 250px', minWidth: 250, maxWidth: 420, borderRadius: 15, background: over ? 'rgba(194,147,58,0.07)' : '#FBFAF6', border: over ? '1.5px dashed #C2933A' : '1px solid rgba(15,35,64,0.08)', overflow: 'hidden', transition: 'background .15s, border-color .15s' }}>
              <div style={{ height: 3, background: ts.c }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px 9px' }}>
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.16em', textTransform: 'uppercase', color: ts.c }}>{ts.label}</span>
                <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 14, color: 'rgba(20,35,61,0.5)' }}>{all.length}</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => { const target = featured?.id || activeEpics[0]?.id; if (target) openTaskEdit(target, null, { status }) }}
                  aria-label={`Nueva tarea en ${ts.label}`} title={`Nueva tarea en ${ts.label}`}
                  style={{ height: 24, width: 24, borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 9px 11px', minHeight: 76 }}>
                {shown.length === 0 && (
                  <div style={{ borderRadius: 11, border: '1px dashed rgba(15,35,64,0.14)', padding: '18px 10px', textAlign: 'center', fontSize: 11.5, color: 'rgba(20,35,61,0.5)' }}>
                    {over ? 'Suelta aquí' : 'Sin tareas'}
                  </div>
                )}
                {shown.map(x => {
                  const { e, t, i } = x
                  const k = e.id + ':' + i
                  const dragging = boardDrag === k
                  const dt = dueTone(t.due, t.status === 'Terminada')
                  const ps = prioStyle(t.priority)
                  const subs = t.subtasks || []
                  return (
                    <div key={k}
                      onPointerDown={ev => onCardDown(ev, k)} onPointerMove={onCardMove}
                      onPointerUp={ev => onCardUp(ev, x)} onPointerCancel={onCardCancel}
                      title={`${t.t} — arrastra para cambiar de estado`}
                      style={{ position: 'relative', background: '#fff', border: '1px solid rgba(15,35,64,0.09)', borderLeft: `3px solid ${ps.accent}`, borderRadius: 11, padding: '10px 11px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', boxShadow: dragging ? '0 18px 30px -16px rgba(15,35,64,0.5)' : '0 1px 2px rgba(15,35,64,0.04)', opacity: boardDrag && !dragging ? 0.55 : 1, transform: dragging ? 'rotate(-1.2deg)' : 'none', transition: 'opacity .15s, box-shadow .15s' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.status === 'Terminada' ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: t.status === 'Terminada' ? 'line-through' : 'none', lineHeight: 1.3 }}>{t.t}</div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} />{e.name}
                        </span>
                        {t.due && <span style={{ font: '700 10px var(--font-ui)', color: dt.c, background: dt.bg, border: `1px solid ${dt.border}`, borderRadius: 99, padding: '1px 7px' }}>{fmtDue(t.due)}</span>}
                        {t.plan && <span title={`Planeada para ${fmtDue(t.plan)}`} style={{ font: '700 10px var(--font-ui)', color: '#2E5A9E', background: 'rgba(46,90,158,0.08)', border: '1px solid rgba(46,90,158,0.28)', borderRadius: 99, padding: '1px 7px' }}>◷ {fmtDue(t.plan)}</span>}
                        {t.repeat && <span title={`Se repite ${repeatLabel(t.repeat)}`} style={{ font: '700 10px var(--font-ui)', color: REPEAT_TONE.c, background: REPEAT_TONE.bg, border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 99, padding: '1px 7px' }}>↻ {repeatLabel(t.repeat)}</span>}
                        {subs.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: subs.every(s => s.done) ? '#2E6E6E' : 'rgba(20,35,61,0.5)' }}>☑ {subs.filter(s => s.done).length}/{subs.length}</span>}
                      </div>

                      {typeof t.progress === 'number' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                          <span style={{ flex: 1, height: 4, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: e.color }} />
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                {isDone && all.length > DONE_CAP && (
                  <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', padding: '2px 4px' }}>+ {all.length - DONE_CAP} más terminadas · véelas en la tabla</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderBacklog = () => {
    const bq = norm(backlogQ.trim())
    const isBoard = backlogView === 'tablero'
    const rows: { e: Epica; t: EpicaTask; i: number }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
      // En el tablero las terminadas son una columna, así que siempre entran;
      // y el filtro de estado se ignora porque las columnas SON los estados.
      if (!backlogDone && !isBoard && t.status === 'Terminada') return
      if (backlogFEpica !== 'todas' && e.id !== backlogFEpica) return
      if (!isBoard && backlogFStatus !== 'todas' && t.status !== backlogFStatus) return
      if (backlogFPrio !== 'todas' && (t.priority || '') !== backlogFPrio) return
      if (bq && !(norm(t.t).includes(bq) || norm(e.name).includes(bq)
        || norm(t.note || '').includes(bq)
        || (t.subtasks || []).some(s => norm(s.t).includes(bq)))) return
      rows.push({ e, t, i })
    }))
    const dirMul = backlogSort.dir === 'asc' ? 1 : -1
    const cmp = (a: typeof rows[number], b: typeof rows[number]) => {
      const k = backlogSort.key; let r = 0
      if (k === 't') r = a.t.t.localeCompare(b.t.t, 'es')
      else if (k === 'epica') r = a.e.name.localeCompare(b.e.name, 'es')
      else if (k === 'status') r = TASK_STATUSES.indexOf(a.t.status) - TASK_STATUSES.indexOf(b.t.status)
      else if (k === 'priority') r = PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']
      else if (k === 'progress') r = (a.t.progress || 0) - (b.t.progress || 0)
      else if (k === 'plan') r = (a.t.plan || '9999-99').localeCompare(b.t.plan || '9999-99')
      else r = (a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')
      return r * dirMul || a.t.t.localeCompare(b.t.t, 'es')
    }
    const sorted = [...rows].sort(cmp)
    const setSort = (key: string) => setBacklogSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
    const th = (key: string, label: string) => (
      <th onClick={() => setSort(key)} style={{ cursor: 'pointer', textAlign: 'left', padding: '8px 10px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: backlogSort.key === key ? '#A87A2C' : 'rgba(15,35,64,0.5)', whiteSpace: 'nowrap', userSelect: 'none' }}>{label}{backlogSort.key === key ? (backlogSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
    )
    const keyOf = (x: { e: Epica; i: number }) => x.e.id + ':' + x.i
    const allKeys = sorted.map(keyOf)
    const allSel = allKeys.length > 0 && allKeys.every(k => backlogSel.has(k))
    const someSel = backlogSel.size > 0
    const toggleAll = () => setBacklogSel(() => allSel ? new Set() : new Set(allKeys))
    const toggleOne = (k: string) => setBacklogSel(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

    // Edición masiva: agrupa la selección por épica y aplica en un patch por épica
    const bulkGroup = () => {
      const m = new Map<string, number[]>()
      backlogSel.forEach(key => { const idx = key.lastIndexOf(':'); const eId = key.slice(0, idx); const i = Number(key.slice(idx + 1)); if (!m.has(eId)) m.set(eId, []); m.get(eId)!.push(i) })
      return m
    }
    const bulkField = (mutate: (t: EpicaTask) => void, msg: string) => {
      const count = backlogSel.size
      bulkGroup().forEach((idxs, eId) => {
        const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
        const tasks = clone(ep.tasks)
        idxs.forEach(i => { if (tasks[i]) mutate(tasks[i]) })
        patchEpic(eId, { tasks })
      })
      showToast(`${count} ${msg}`); setBacklogSel(new Set())
    }
    const bulkStatus = (v: string) => bulkField(t => { if (v === 'Terminada' && t.status !== 'Terminada') t.planPrev = t.status; t.status = v; if (v === 'Terminada') { if (!t.doneAt) t.doneAt = todayISO() } else { delete t.doneAt; delete t.planPrev } }, `→ ${v}`)
    const bulkPrio = (v: Prio) => bulkField(t => { t.priority = v }, `· prioridad ${v}`)
    const bulkDue = (v: string) => bulkField(t => { t.due = v }, '· entrega')
    const bulkPlan = (v: string) => {
      const count = backlogSel.size
      let base = v ? maxPlanOrderFor(v) : 0
      bulkGroup().forEach((idxs, eId) => {
        const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
        const tasks = clone(ep.tasks)
        idxs.forEach(i => { const t = tasks[i]; if (!t) return; if (v) { base += 1000; t.plan = v; if (!t.priority) t.priority = prioFromDue(t.due); t.planOrder = base } else { delete t.plan; delete t.planOrder }; applyPlanStatus(t, v) })
        patchEpic(eId, { tasks })
      })
      showToast(`${count} · ${v ? 'planeadas' : 'sin planear'}`); setBacklogSel(new Set())
    }
    const bulkDelete = () => {
      const count = backlogSel.size
      if (!window.confirm(`¿Eliminar ${count} ${count === 1 ? 'tarea' : 'tareas'}? No se puede deshacer.`)) return
      bulkGroup().forEach((idxs, eId) => {
        const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
        const tasks = clone(ep.tasks)
        idxs.sort((a, b) => b - a).forEach(i => { if (tasks[i]) tasks.splice(i, 1) })
        patchEpic(eId, { tasks })
        invalidateTaskRefs(eId)
      })
      showToast(`${count} tareas eliminadas`); setBacklogSel(new Set())
    }
    const bulkSelStyle: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.10)', color: '#fff', borderRadius: 8, padding: '6px 9px', fontSize: 11.5, fontWeight: 600, outline: 'none' }
    const filterSel: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '5px 8px', fontSize: 11.5, fontWeight: 600, color: 'rgba(20,35,61,0.65)', background: '#fff', outline: 'none' }
    const editInp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.16)', borderRadius: 7, padding: '5px 7px', fontSize: 12, fontWeight: 600, color: '#14233D', background: '#fff', outline: 'none' }

    return (
      <div id="backlog" className="glass" style={{ borderRadius: 16, overflow: 'hidden', marginTop: 34, scrollMarginTop: 16 }}>
        {/* El interruptor de vista es interactivo, así que no puede ir DENTRO del
            botón que pliega: el encabezado es un contenedor con dos controles. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 17px' }}>
          <button onClick={() => setBacklogOpen(v => !v)} aria-expanded={backlogOpen} aria-controls="backlog-body"
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, textAlign: 'left' }}>
            <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 14, color: '#B58B35' }}>{rows.length}</span>
            <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Backlog · todas las tareas</span>
          </button>
          {backlogOpen && (
            <div role="group" aria-label="Vista del backlog" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 9, background: 'rgba(15,35,64,0.05)', border: '1px solid rgba(15,35,64,0.08)' }}>
              {([['tabla', 'Tabla'], ['tablero', 'Tablero']] as const).map(([v, label]) => {
                const on = backlogView === v
                return (
                  <button key={v} aria-pressed={on} onClick={() => setBacklogView(v)}
                    style={{ cursor: 'pointer', border: 'none', borderRadius: 7, padding: '5px 12px', font: '700 11px var(--font-ui)', background: on ? '#10233F' : 'transparent', color: on ? '#F3EFE6' : 'rgba(20,35,61,0.55)', transition: 'background .15s' }}>{label}</button>
                )
              })}
            </div>
          )}
          <button onClick={() => setBacklogOpen(v => !v)} aria-label={backlogOpen ? 'Plegar backlog' : 'Desplegar backlog'}
            style={{ cursor: 'pointer', border: 'none', background: 'transparent', padding: 4, fontSize: 12, color: 'rgba(20,35,61,0.55)', transform: backlogOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</button>
        </div>
        {backlogOpen && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 17px 10px', flexWrap: 'wrap' }}>
              <input value={backlogQ} onChange={e => setBacklogQ(e.target.value)} aria-label="Buscar en el backlog"
                placeholder="Buscar tarea, épica, nota…"
                style={{ ...filterSel, cursor: 'text', minWidth: 190, flex: '1 1 190px', fontWeight: 500 }} />
              {backlogQ && (
                <button onClick={() => setBacklogQ('')} aria-label="Limpiar búsqueda"
                  style={{ ...filterSel, cursor: 'pointer', padding: '5px 9px' }}>✕</button>
              )}
              <select value={backlogFEpica} onChange={e => setBacklogFEpica(e.target.value)} title="Filtrar por épica" style={filterSel}>
                <option value="todas">Todas las épicas</option>
                {activeEpics.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {/* En el tablero las columnas son los estados: el filtro sobraría */}
              {!isBoard && (
                <select value={backlogFStatus} onChange={e => setBacklogFStatus(e.target.value)} title="Filtrar por estado" style={filterSel}>
                  <option value="todas">Todo estado</option>
                  {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <select value={backlogFPrio} onChange={e => setBacklogFPrio(e.target.value)} title="Filtrar por prioridad" style={filterSel}>
                <option value="todas">Toda prioridad</option>
                <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(20,35,61,0.6)', cursor: 'pointer' }}>
                <input type="checkbox" checked={backlogDone} onChange={e => setBacklogDone(e.target.checked)} /> Terminadas
              </label>
              {(backlogFEpica !== 'todas' || backlogFStatus !== 'todas' || backlogFPrio !== 'todas') && (
                <button onClick={() => { setBacklogFEpica('todas'); setBacklogFStatus('todas'); setBacklogFPrio('todas') }} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11.5, fontWeight: 700 }}>Limpiar filtros</button>
              )}
              {/* La edición tipo hoja de cálculo sólo aplica a la tabla */}
              {!isBoard && (
                <button onClick={() => setBacklogEdit(v => !v)} aria-label="Editar la tabla como hoja de cálculo" title="Editar la tabla como hoja de cálculo" style={{ cursor: 'pointer', borderRadius: 9, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, border: backlogEdit ? 'none' : '1px solid rgba(15,35,64,0.14)', ...(backlogEdit ? { background: '#10233F', color: '#fff' } : { background: '#fff', color: 'rgba(20,35,61,0.65)' }) }}>{backlogEdit ? '✓ Listo' : '✎ Editar tabla'}</button>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>{isBoard ? 'Arrastra una tarjeta a otra columna para cambiar su estado · clic para abrirla' : backlogEdit ? 'Edita cualquier celda · las fechas abren calendario' : 'Clic en encabezado = ordenar · en fila = ver/editar · casilla = seleccionar'}</span>
            </div>

            {someSel && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 12px 10px', padding: '9px 12px', borderRadius: 12, background: '#16365F', color: '#fff' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{backlogSel.size} seleccionada{backlogSel.size === 1 ? '' : 's'}</span>
                <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.18)' }} />
                <select value="" onChange={e => e.target.value && bulkStatus(e.target.value)} style={bulkSelStyle}>
                  <option value="" disabled>Estado…</option>
                  {TASK_STATUSES.map(s => <option key={s} value={s} style={{ color: '#14233D' }}>{s}</option>)}
                </select>
                <select value="" onChange={e => e.target.value && bulkPrio(e.target.value as Prio)} style={bulkSelStyle}>
                  <option value="" disabled>Prioridad…</option>
                  <option value="alta" style={{ color: '#14233D' }}>Alta</option><option value="media" style={{ color: '#14233D' }}>Media</option><option value="baja" style={{ color: '#14233D' }}>Baja</option>
                </select>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600 }}>Hacer <input type="date" value="" onChange={e => bulkPlan(e.target.value)} style={{ ...bulkSelStyle, colorScheme: 'dark' }} /></label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600 }}>Vence <input type="date" value="" onChange={e => e.target.value && bulkDue(e.target.value)} style={{ ...bulkSelStyle, colorScheme: 'dark' }} /></label>
                <button onClick={() => bulkPlan('')} style={{ ...bulkSelStyle }}>Quitar plan</button>
                <button onClick={bulkDelete} style={{ cursor: 'pointer', border: '1px solid rgba(255,150,120,0.4)', background: 'rgba(255,120,90,0.18)', color: '#FFD9CC', borderRadius: 8, padding: '6px 11px', fontSize: 11.5, fontWeight: 700 }}>Eliminar</button>
                <span style={{ flex: 1 }} />
                <button onClick={() => setBacklogSel(new Set())} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: 700 }}>Limpiar</button>
              </div>
            )}

            {isBoard ? renderBoard(rows) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr style={{ borderTop: '1px solid rgba(15,35,64,0.08)', borderBottom: '1px solid rgba(15,35,64,0.08)', background: 'rgba(15,35,64,0.02)' }}>
                    <th style={{ width: 34, padding: '8px 0 8px 12px' }}><input type="checkbox" checked={allSel} onChange={toggleAll} title="Seleccionar todo" style={{ cursor: 'pointer' }} /></th>
                    {th('t', 'Tarea')}{th('epica', 'Épica')}{th('status', 'Estado')}{th('priority', 'Prioridad')}{th('progress', 'Avance')}{th('plan', 'Hacer')}{th('due', 'Vence')}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ e, t, i }) => {
                    const ts = taskStyle(t.status); const dt = dueTone(t.due, t.status === 'Terminada'); const ps = prioStyle(t.priority)
                    const k = e.id + ':' + i; const sel = backlogSel.has(k)
                    return (
                      <tr key={k} {...(backlogEdit ? {} : clickable(() => setTaskView({ eId: e.id, i }), `Ver tarea: ${t.t}`, true))} className="backlog-row" style={{ cursor: backlogEdit ? 'default' : 'pointer', borderBottom: '1px solid rgba(15,35,64,0.05)', background: sel ? 'rgba(194,147,58,0.10)' : undefined }}>
                        <td onClick={ev => ev.stopPropagation()} style={{ padding: '9px 0 9px 12px' }}><input type="checkbox" checked={sel} onChange={() => toggleOne(k)} style={{ cursor: 'pointer' }} /></td>
                        {backlogEdit ? (<>
                          <td style={{ padding: '6px 8px', minWidth: 200 }}>{(() => { const act = editCell?.key === k && editCell.field === 'title'; return <input value={act ? editCell!.val : t.t} onFocus={() => setEditCell({ key: k, field: 'title', val: t.t })} onChange={ev => setEditCell({ key: k, field: 'title', val: ev.target.value })} onBlur={() => { if (act) setTaskTitle(e, i, editCell!.val); setEditCell(null) }} style={editInp} /> })()}</td>
                          <td style={{ padding: '6px 8px' }}><select value={e.id} onChange={ev => moveTaskToEpica(e, i, ev.target.value)} title="Mover a otra épica" style={{ ...editInp, cursor: 'pointer' }}>{activeEpics.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                          <td style={{ padding: '6px 8px' }}><select value={t.status} onChange={ev => setTaskStatus(e, i, ev.target.value)} style={{ ...editInp, cursor: 'pointer' }}>{TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                          <td style={{ padding: '6px 8px' }}><select value={t.priority || ''} onChange={ev => setPriorityVal(e, i, ev.target.value)} style={{ ...editInp, cursor: 'pointer' }}><option value="">—</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></td>
                          <td style={{ padding: '6px 8px' }}>{(() => { const act = editCell?.key === k && editCell.field === 'progress'; return <input type="number" min={0} max={100} step={5} value={act ? editCell!.val : String(t.progress ?? 0)} onFocus={() => setEditCell({ key: k, field: 'progress', val: String(t.progress ?? 0) })} onChange={ev => setEditCell({ key: k, field: 'progress', val: ev.target.value })} onBlur={() => { if (act) setTaskProgress(e, i, Math.max(0, Math.min(100, Number(editCell!.val) || 0))); setEditCell(null) }} style={{ ...editInp, width: 66 }} /> })()}</td>
                          <td style={{ padding: '6px 8px' }}><input type="date" value={t.plan || ''} onChange={ev => setTaskPlan(e, i, ev.target.value)} style={{ ...editInp, cursor: 'pointer' }} /></td>
                          <td style={{ padding: '6px 8px' }}><input type="date" value={t.due} onChange={ev => setTaskDue(e, i, ev.target.value)} style={{ ...editInp, cursor: 'pointer' }} /></td>
                        </>) : (<>
                          <td style={{ padding: '9px 10px', fontSize: 12.5, fontWeight: 600, color: t.status === 'Terminada' ? 'rgba(20,35,61,0.4)' : '#16365F', textDecoration: t.status === 'Terminada' ? 'line-through' : 'none', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</td>
                          <td style={{ padding: '9px 10px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(20,35,61,0.7)', whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}</span></td>
                          <td style={{ padding: '9px 10px' }}><span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: ts.bg, color: ts.c, whiteSpace: 'nowrap' }}>{ts.label}</span></td>
                          <td style={{ padding: '9px 10px' }}>{t.priority ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PrioBars p={t.priority} size={12} /><span style={{ fontSize: 11, fontWeight: 600, color: ps.c }}>{ps.label}</span></span> : <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>—</span>}</td>
                          <td style={{ padding: '9px 10px' }}>{typeof t.progress === 'number' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 44, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden', display: 'inline-block' }}><span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: e.color }} /></span><span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span></span> : <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>—</span>}</td>
                          <td style={{ padding: '9px 10px', fontSize: 11.5, fontWeight: 600, color: t.plan ? '#2E5A9E' : 'rgba(20,35,61,0.3)', whiteSpace: 'nowrap' }}>{t.plan ? fmtDue(t.plan) : '—'}</td>
                          <td style={{ padding: '9px 10px', fontSize: 11.5, fontWeight: 600, color: t.due ? dt.c : 'rgba(20,35,61,0.3)', whiteSpace: 'nowrap' }}>{t.due ? fmtDue(t.due) : '—'}</td>
                        </>)}
                      </tr>
                    )
                  })}
                  {sorted.length === 0 && <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', fontSize: 12.5, color: 'rgba(20,35,61,0.55)' }}>No hay tareas que coincidan.</td></tr>}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderEditor() {
    if (!editing) return null
    const d = editing
    const isEdit = editMode === 'edit'
    return (
      <div onClick={closeEdit} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,22,42,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 20px', overflow: 'auto' }}>
        <div role="dialog" aria-modal="true" aria-label="Editar épica" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 660, background: '#fff', borderRadius: 22, boxShadow: '0 50px 90px -30px rgba(8,18,36,.75)', overflow: 'hidden' }}>
          <div style={{ height: 5, background: d.color }} />
          <div className="ep-modal-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 16px', borderBottom: '1px solid rgba(15,35,64,0.08)' }}>
            <div>
              <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>{isEdit ? 'Editar frente' : 'Nuevo frente'}</div>
              <h3 className="serif" style={{ fontWeight: 600, fontSize: 30, margin: 0, lineHeight: 1, color: '#10233F' }}>{d.name || 'Nueva épica'}</h3>
            </div>
            <button aria-label="Cerrar editor de épica" onClick={closeEdit} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 10, height: 36, width: 36, color: 'rgba(20,35,61,0.55)', fontSize: 17 }}>✕</button>
          </div>

          <div className="ep-modal-body" style={{ padding: '10px 28px 22px', maxHeight: '72vh', overflow: 'auto' }}>
            <label style={lbl}>Nombre de la épica</label>
            <input value={d.name} onChange={e => patchDraft(x => ({ ...x, name: e.target.value }))} placeholder="Ej. Inmuebles" style={inpBig} />

            <label style={lbl}>Descripción</label>
            <RichText value={d.description || ''} onChange={v => patchDraft(x => ({ ...x, description: v }))} placeholder="Qué abarca esta épica… (negritas, cursiva, viñetas)" />

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
                <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#2E6E6E', marginBottom: 6 }}>Fuente de datos · tabla Supabase</div>
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
                    <button aria-label="Eliminar KPI" onClick={() => patchDraft(x => ({ ...x, kpis: x.kpis.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Rutinas */}
            <div style={cardEd}>
              <div style={secHead}>
                <div><label style={{ ...lbl, marginTop: 0 }}>Rutinas diarias</label><div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: 3 }}>Tareas repetitivas que marcas cada día. Se cuentan por semana.</div></div>
                <button onClick={() => patchDraft(x => ({ ...x, routines: [...x.routines, { t: '', days: [false, false, false, false, false, false, false] }] }))} style={addBtn}>+ Rutina</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {d.routines.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, width: 34, borderRadius: 9, background: 'rgba(62,142,142,0.1)', color: '#2E6E6E' }}><RefreshIcon /></span>
                    <input value={r.t} onChange={e => patchDraft(x => { x.routines[i].t = e.target.value; return x })} placeholder="Ej. Revisar mensajes" style={inpSmall} />
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.55)', whiteSpace: 'nowrap' }} title="Esta semana">{getRoutineWeek(r, mondayISO(todayISO())).filter(Boolean).length}/7</span>
                    <button aria-label="Eliminar rutina" onClick={() => patchDraft(x => ({ ...x, routines: x.routines.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tareas */}
            <div style={cardEd}>
              <div style={secHead}><label style={{ ...lbl, marginTop: 0 }}>Tareas</label><button onClick={() => patchDraft(x => ({ ...x, tasks: [...x.tasks, { t: '', status: 'Por hacer', due: '', note: '', createdAt: todayISO() }] }))} style={addBtn}>+ Tarea</button></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {d.tasks.map((t, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={t.t} onChange={e => patchDraft(x => { x.tasks[i].t = e.target.value; return x })} placeholder="Nombre de la tarea" style={inpSmall} />
                      <button aria-label="Eliminar tarea" onClick={() => patchDraft(x => ({ ...x, tasks: x.tasks.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {TASK_STATUSES.map(s => {
                        const on = t.status === s; const ts = taskStyle(s)
                        return <button key={s} onClick={() => patchDraft(x => { x.tasks[i].status = s; return x })} style={{ cursor: 'pointer', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, border: on ? `1px solid ${ts.c}` : '1px solid rgba(15,35,64,0.12)', background: on ? ts.bg : '#fff', color: on ? ts.c : 'rgba(20,35,61,0.55)' }}>{ts.label}</button>
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>Entrega</span>
                      <input type="date" value={t.due} onChange={e => patchDraft(x => { x.tasks[i].due = e.target.value; return x })} style={dateInp} />
                    </div>
                    <RichText value={t.note || ''} onChange={v => patchDraft(x => { x.tasks[i].note = v; return x })} placeholder="Nota (negritas, cursiva, viñetas)…" />
                  </div>
                ))}
              </div>
            </div>

            {/* Conexiones */}
            <div style={cardEd}>
              <div style={secHead}>
                <div><label style={{ ...lbl, marginTop: 0 }}>Conexiones</label><div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: 3 }}>Otras bases y dashboards. La ★ es el dashboard principal.</div></div>
                <button onClick={() => patchDraft(x => ({ ...x, links: [...x.links, { l: '', url: '', type: 'Otro', primary: false }] }))} style={addBtn}>+ Conexión</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
                {d.links.map((l, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <button onClick={() => patchDraft(x => ({ ...x, links: x.links.map((y, j) => ({ ...y, primary: j === i })) }))} aria-label="Dashboard principal" title="Dashboard principal" style={{ cursor: 'pointer', flexShrink: 0, height: 32, width: 32, borderRadius: 8, border: l.primary ? '1px solid #C2933A' : '1px solid rgba(15,35,64,0.12)', background: l.primary ? 'rgba(194,147,58,0.14)' : '#fff', color: l.primary ? '#C2933A' : 'rgba(20,35,61,0.3)', fontSize: 14 }}>★</button>
                      <select value={l.type} onChange={e => patchDraft(x => { x.links[i].type = e.target.value; return x })} style={{ ...inpSmall, flex: '0 0 116px', cursor: 'pointer' }}>
                        {LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input value={l.l} onChange={e => patchDraft(x => { x.links[i].l = e.target.value; return x })} placeholder="Nombre" style={inpSmall} />
                      <button aria-label="Eliminar enlace" onClick={() => patchDraft(x => ({ ...x, links: x.links.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
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

      <div className="ep-shell" style={{ maxWidth: 1360, margin: '0 auto', padding: '22px 18px 60px' }}>
        {/* Aviso de carga fallida: antes el error se tragaba y se veían datos rancios del SSR */}
        {loadError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16, borderRadius: 13, padding: '12px 15px', background: 'rgba(176,82,46,0.08)', border: '1px solid rgba(176,82,46,0.32)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#B0522E' }}>{loadError}</span>
            <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)' }}>Lo que ves puede estar desactualizado.</span>
            <button onClick={loadEpics} disabled={loading} style={{ marginLeft: 'auto', cursor: loading ? 'default' : 'pointer', border: '1px solid rgba(176,82,46,0.4)', background: '#fff', color: '#B0522E', borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 700 }}>
              {loading ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        )}

        {/* ACCESOS RÁPIDOS — favoritos del home, plegables para no robar espacio */}
        <FavoritosStrip />

        {/* PLAN DE HOY — enfoque del día, lo primero de la página */}
        {renderPlanToday()}

        {/* SELECTOR DE ÉPICA — elige el frente a ver */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9, flexWrap: 'wrap' }}>
            <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Elige una épica</div>
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
              <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>{t.label}</div>
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
                  <div key={i} {...clickable(() => setFeaturedId(v.id), `${v.epica}: ${v.task}`)} className="ep-venc-row" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 2px', borderBottom: '1px solid rgba(15,35,64,0.06)', cursor: 'pointer', fontSize: 13 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 99, flexShrink: 0, background: dt.c }} />
                    <span className="ep-venc-epica" style={{ width: 150, flexShrink: 0, fontWeight: 600, color: '#16365F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.epica}</span>
                    <span className="ep-venc-task" style={{ flex: 1, minWidth: 0, color: 'rgba(20,35,61,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.task}</span>
                    <span className="ep-venc-date" style={{ flexShrink: 0, fontWeight: 700, color: dt.c }}>{v.dl < 0 ? `Vencida · ${fmtDue(v.due)}` : v.dl === 0 ? 'Hoy' : `En ${v.dl} d · ${fmtDue(v.due)}`}</span>
                  </div>
                )
              })}
            </div>
            {vencimientos.length > 8 && (
              // Antes era un texto muerto: ahora lleva al backlog ordenado por entrega.
              <button
                onClick={() => {
                  setBacklogOpen(true); setBacklogSort({ key: 'due', dir: 'asc' })
                  setBacklogFEpica('todas'); setBacklogFStatus('todas'); setBacklogFPrio('todas'); setBacklogQ('')
                  requestAnimationFrame(() => document.getElementById('backlog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                }}
                style={{ marginTop: 9, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, fontSize: 12, fontWeight: 700, color: '#A87A2C', textDecoration: 'underline' }}>
                Ver las {vencimientos.length - 8} restantes en el backlog →
              </button>
            )}
          </div>
        )}

        {/* DESTACADA */}
        <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.20em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 10 }}>Épica destacada</div>
        <div className="ep-pop" style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 20, boxShadow: '0 24px 50px -34px rgba(15,35,64,0.5)', overflow: 'hidden', marginBottom: 34 }}>
          <div style={{ height: 4, background: featured.color }} />
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {/* LEFT */}
            <div className="ep-featured-panel" style={{ flex: '1 1 360px', minWidth: 300, padding: '26px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ height: 11, width: 11, borderRadius: 99, background: featured.color }} />
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>Épica</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: fSt.bg, color: fSt.color }}>{featured.status}</span>
                {featured.categoria && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: 'rgba(15,35,64,0.06)', color: 'rgba(20,35,61,0.6)' }}>{featured.categoria}</span>}
                {featured.archived && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: 'rgba(20,35,61,0.08)', color: 'rgba(20,35,61,0.5)' }}>Archivada</span>}
                <button onClick={() => openEdit(featured.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}><PencilIcon /> Editar</button>
                <button onClick={() => toggleArchive(featured)} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.55)', borderRadius: 9, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>{featured.archived ? 'Desarchivar' : 'Archivar'}</button>
              </div>
              <h1 className="serif ep-featured-title" style={{ fontWeight: 600, fontSize: 46, lineHeight: 1, margin: '0 0 8px', color: '#10233F' }}>{featured.name}</h1>
              {featured.description && <div className="ep-note" style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(20,35,61,0.6)', margin: '0 0 22px', maxWidth: 440 }} dangerouslySetInnerHTML={{ __html: featured.description }} />}

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
                    <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.16em', textTransform: 'uppercase', color: '#2E6E6E' }}>Fuente de datos</span>
                    {featured.source_sync && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>sync {featured.source_sync}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                    <DbIcon stroke="#2E6E6E" />
                    <span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12.5, fontWeight: 600, color: '#16365F' }}>{featured.source_table}</span>
                    <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>· {featured.links.length} conexiones</span>
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
            <div className="ep-featured-panel ep-featured-right" style={{ flex: '1 1 360px', minWidth: 300, padding: '24px 26px', background: '#FBFAF6', borderLeft: '1px solid rgba(15,35,64,0.08)' }}>
              {featured.routines.length > 0 && (() => {
                const curMon = mondayISO(todayISO())
                const isCurWeek = routineWeek === curMon
                const todayIdx = isCurWeek ? (new Date(todayISO() + 'T00:00:00').getDay() + 6) % 7 : -1
                const weekArrow: CSSProperties = { cursor: 'pointer', height: 32, width: 32, borderRadius: 8, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: '#10233F', fontSize: 15, lineHeight: 1 }
                return (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
                    <RefreshIcon stroke="rgba(15,35,64,0.42)" />
                    <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Rutinas diarias</span>
                    <span style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <button onClick={() => setRoutineWeek(w => addDays(w, -7))} aria-label="Semana anterior" title="Semana anterior" style={weekArrow}>‹</button>
                      <button onClick={() => setRoutineWeek(curMon)} title={isCurWeek ? 'Semana actual' : 'Volver a esta semana'} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 11px', font: '700 11px var(--font-ui)', whiteSpace: 'nowrap', border: isCurWeek ? '1px solid rgba(194,147,58,0.5)' : '1px solid rgba(15,35,64,0.12)', background: isCurWeek ? 'rgba(194,147,58,0.10)' : '#fff', color: isCurWeek ? '#A87A2C' : 'rgba(20,35,61,0.6)' }}>{isCurWeek ? 'Esta semana' : weekRangeLabel(routineWeek)}</button>
                      <button onClick={() => setRoutineWeek(w => addDays(w, 7))} aria-label="Semana siguiente" title="Semana siguiente" style={weekArrow}>›</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {featured.routines.map((r, ri) => {
                      const wk = getRoutineWeek(r, routineWeek)
                      const n = wk.filter(Boolean).length
                      const cc = n >= 5 ? '#2E6E6E' : n >= 3 ? '#A87A2C' : 'rgba(20,35,61,0.4)'
                      return (
                        <div key={ri} className="glass" style={{ borderRadius: 12, padding: '11px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <button onClick={() => setRoutineStat({ eId: featured.id, ri })} aria-label="Ver estadísticas de la rutina" title="Ver estadísticas de la rutina" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t}</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(20,35,61,0.35)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
                            </button>
                            <span style={{ fontSize: 11, fontWeight: 800, color: cc, flexShrink: 0 }}>{n}/7</span>
                          </div>
                          <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
                            {wk.map((on, di) => (
                              <button key={di} onClick={() => toggleRoutineDay(featured, ri, di)} title={`${DAYNAMES[di]} ${dayNum(addDays(routineWeek, di))}`} style={{ flex: 1, height: 34, borderRadius: 7, border: di === todayIdx ? '1.5px solid rgba(194,147,58,0.7)' : '1px solid transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: on ? featured.color : 'rgba(15,35,64,0.06)', color: on ? '#fff' : 'rgba(20,35,61,0.4)' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>{DAYS[di]}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1, opacity: on ? 0.85 : 0.6 }}>{dayNum(addDays(routineWeek, di))}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                )
              })()}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Tareas</span>
                <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>{pendCount(featured)} activas · {fDone} terminadas</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => openTaskEdit(featured.id, null)} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>+ Tarea</button>
              </div>

              {pendCount(featured) > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11, flexWrap: 'wrap' }}>
                  <select value={epicSort} onChange={e => setEpicSort(e.target.value as typeof epicSort)} title="Ordenar tareas" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
                    <option value="grupo">Por estado</option>
                    <option value="prioridad">Prioridad</option>
                    <option value="entrega">Entrega</option>
                    <option value="hacer">Cuándo hacer</option>
                    <option value="progreso">Avance</option>
                    <option value="nombre">Nombre</option>
                  </select>
                  {([['todas', 'Todas'], ['planeadas', 'Planeadas'], ['sinplan', 'Sin plan'], ['vencidas', 'Vencidas'], ['alta', 'Alta']] as [typeof epicFilter, string][]).map(([k, label]) => {
                    const on = epicFilter === k
                    return <button key={k} onClick={() => setEpicFilter(k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.55)' }}>{label}</button>
                  })}
                </div>
              )}

              {(() => {
                const CAP = 5
                const collapsed = totalActiveShown > CAP && !tasksExpanded
                const toggleBtn = totalActiveShown > CAP ? (
                  <button onClick={() => setTasksExpanded(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.55)', marginBottom: 6 }}>
                    {collapsed ? `Ver ${totalActiveShown - CAP} tareas más` : 'Ver menos'}
                    <span style={{ fontSize: 12, transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform .15s' }}>▾</span>
                  </button>
                ) : null
                const emptyMsg = totalActiveShown === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.55)', padding: '4px 0 8px' }}>{pendCount(featured) === 0 && doneItems.length === 0 ? 'Sin tareas aún. Usa “+ Tarea”.' : 'Ninguna tarea activa coincide con el filtro.'}</div>
                ) : null
                if (epicSort === 'grupo') {
                  let budget = collapsed ? CAP : Infinity
                  return (
                    <>
                      {filteredGroups.map(g => {
                        if (budget <= 0) return null
                        const show = g.items.slice(0, budget)
                        budget -= show.length
                        return (
                          <div key={g.key} style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                              <span style={{ height: 7, width: 7, borderRadius: 99, background: g.color }} />
                              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', color: g.color, textTransform: 'uppercase' }}>{g.label}</span>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)' }}>{g.items.length}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>{show.map(renderTaskRow)}</div>
                          </div>
                        )
                      })}
                      {emptyMsg}{toggleBtn}
                    </>
                  )
                }
                const show = collapsed ? flatActive.slice(0, CAP) : flatActive
                return (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 8 }}>{show.map(renderTaskRow)}</div>
                    {emptyMsg}{toggleBtn}
                  </>
                )
              })()}

              {/* TERMINADAS — colapsable, por mes */}
              {doneItems.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={() => setShowDone(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.08)', background: '#fff', borderRadius: 10, padding: '9px 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: '#2E6E6E', textTransform: 'uppercase' }}>
                    <span style={{ height: 7, width: 7, borderRadius: 99, background: '#2E6E6E' }} />
                    Terminadas <span style={{ color: 'rgba(20,35,61,0.55)' }}>{doneItems.length}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                  </button>
                  {showDone && (
                    <div style={{ marginTop: 8 }}>
                      {doneMonths.map(mg => (
                        <div key={mg.label} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.55)', margin: '4px 0 2px' }}>{mg.label} · {mg.items.length}</div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {mg.items.map(renderTaskRow)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
            <button onClick={() => setCompact(v => !v)} aria-label="Compacto" title="Compacto" style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: compact ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>Compacto</button>
            <button onClick={() => setShowRowKpi(v => !v)} aria-label="Mostrar KPI" title="Mostrar KPI" style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: showRowKpi ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>KPI</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10 }}>
          {rest.map(e => {
            const st = statusStyle(e.status); const pct = pctOf(e); const pend = pendCount(e)
            const k0 = e.kpis[0]
            return (
              <div key={e.id} {...clickable(() => setFeaturedId(e.id), `Ver épica ${e.name}`)} className="glass glass-hover ep-row" style={{ display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, padding: compact ? '11px 16px' : '15px 18px', cursor: 'pointer' }}>
                <span className="ep-row-bar" style={{ width: 4, alignSelf: 'stretch', borderRadius: 99, background: e.color, flexShrink: 0 }} />
                <div className="ep-row-name" style={{ flex: '0 0 210px', minWidth: 170 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="serif" style={{ fontWeight: 600, fontSize: 18, color: '#10233F', lineHeight: 1 }}>{e.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: st.bg, color: st.color }}>{e.status}</span>
                    {e.categoria && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(15,35,64,0.06)', color: 'rgba(20,35,61,0.55)' }}>{e.categoria}</span>}
                    {e.archived && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(20,35,61,0.08)', color: 'rgba(20,35,61,0.5)' }}>Archivada</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)' }}>{pend > 0 ? `${pend} tareas activas` : 'Al corriente'}</span>
                    {e.routines.length > 0 && <span style={{ fontSize: 10.5, color: '#2E6E6E', fontWeight: 600 }}>↻ {e.routines.length} rutinas</span>}
                    {e.source_table && <><span style={{ height: 5, width: 5, borderRadius: 99, background: '#3E8E8E' }} /><span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}>{e.source_table}</span></>}
                  </div>
                </div>

                {showRowKpi && k0 && (
                  <div className="ep-row-kpi" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 70 }}>
                    <span className="serif" style={{ fontWeight: 600, fontSize: 22, color: '#10233F', lineHeight: 1 }}>{k0.v}</span>
                    <span style={{ font: '600 10px/1.2 var(--font-ui)', letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(15,35,61,0.44)' }}>{k0.l}</span>
                  </div>
                )}

                <div className="ep-row-progress" style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>{doneCount(e)} / {taskCount(e)}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#10233F' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: e.color, transition: 'width .4s' }} />
                  </div>
                </div>

                <button onClick={ev => { ev.stopPropagation(); openEdit(e.id) }} aria-label="Editar" title="Editar" className="ep-row-edit" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, width: 34, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 10, color: 'rgba(20,35,61,0.5)' }}><PencilIcon /></button>
                <span className="ep-row-arrow" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, width: 34, borderRadius: 10, background: 'rgba(194,147,58,0.12)', color: '#A87A2C' }}><ArrowIcon /></span>
              </div>
            )
          })}

          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', border: '1.5px dashed rgba(15,35,64,0.18)', background: 'transparent', borderRadius: 14, padding: 16, fontSize: 13, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Nueva épica
          </button>
        </div>

        {renderBacklog()}
      </div>

      {editing && renderEditor()}

      {pickerOpen && renderPicker()}

      {movePick && (() => {
        const ep = epicsRef.current.find(x => x.id === movePick.eId)
        const cur = ep?.tasks[movePick.i]?.plan || viewDate
        return (
          <div onClick={() => setMovePick(null)} style={{ position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(10,22,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
            <div data-pop onClick={e => e.stopPropagation()}>
              {renderMonthPopover(cur, iso => { if (ep) planTaskToDay(ep, movePick.i, iso, { toast: true }); setMovePick(null) })}
            </div>
          </div>
        )
      })()}

      {taskView && (() => {
        const ep = epics.find(x => x.id === taskView.eId)   // estado en vivo para reflejar ediciones inline
        const i = taskView.i
        const t = ep?.tasks[i]
        if (!ep || !t) return null
        const dt = dueTone(t.due, t.status === 'Terminada')
        const eb: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 9 }
        const openEditFromView = () => { setTaskView(null); openTaskEdit(taskView.eId, i) }
        return (
          <div onClick={() => setTaskView(null)} style={{ position: 'fixed', inset: 0, zIndex: 72, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Detalle de la tarea" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: ep.color }} />
              <div style={{ padding: '20px 26px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(20,35,61,0.55)', marginBottom: 7 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: ep.color }} />{ep.name}</div>
                    <div className="serif" style={{ fontWeight: 600, fontSize: 27, lineHeight: 1.05, color: '#10233F', textDecoration: t.status === 'Terminada' ? 'line-through' : 'none' }}>{t.t}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
                      {t.createdAt && <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>Creada · {cap(new Date(t.createdAt + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }))}</span>}
                      {t.status !== 'Terminada' && diasCon(t) >= 1 && <span style={{ fontSize: 11, fontWeight: 700, color: '#A87A2C' }}>🕐 llevas {diasCon(t)} {diasCon(t) === 1 ? 'día' : 'días'} en esto</span>}
                      {t.plan && t.plan < today && t.status !== 'Terminada' && <span style={{ fontSize: 11, fontWeight: 700, color: '#B0522E' }}>⏳ pendiente de días anteriores</span>}
                    </div>
                    {t.repeat && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9, padding: '6px 11px', borderRadius: 99, background: REPEAT_TONE.bg, border: `1px solid ${REPEAT_TONE.border}` }}>
                        <span style={{ font: '700 11.5px var(--font-ui)', color: REPEAT_TONE.c }}>↻ Se repite {repeatLabel(t.repeat)}</span>
                        {(t.repeatDone?.length ?? 0) > 0 && <span style={{ fontSize: 11, color: REPEAT_TONE.c }}>· {t.repeatDone!.length} {t.repeatDone!.length === 1 ? 'ciclo cumplido' : 'ciclos cumplidos'}</span>}
                        {t.repeatUntil && <span style={{ fontSize: 11, color: REPEAT_TONE.c }}>· hasta {fmtDue(t.repeatUntil)}</span>}
                      </div>
                    )}
                  </div>
                  <button aria-label="Cerrar detalle de tarea" onClick={() => setTaskView(null)} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 34, width: 34, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>

                {/* Estado (editable) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={eb}>Estado</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {TASK_STATUSES.map(s => { const on = t.status === s; const st2 = taskStyle(s); return <button key={s} onClick={() => setTaskStatus(ep, i, s)} style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, border: on ? `1px solid ${st2.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? st2.bg : '#fff', color: on ? st2.c : 'rgba(20,35,61,0.55)' }}>{st2.label}</button> })}
                  </div>
                </div>

                {/* Prioridad (editable) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={eb}>Prioridad</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['alta', 'media', 'baja'] as Prio[]).map(p => { const on = t.priority === p; const ps2 = prioStyle(p); return <button key={p} onClick={() => setPriority(ep, i, p)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', borderRadius: 9, cursor: 'pointer', border: on ? `1px solid ${ps2.c}` : '1px solid rgba(15,35,64,0.12)', background: on ? 'rgba(194,147,58,0.08)' : '#fff' }}><PrioBars p={p} /><span style={{ font: '700 10px var(--font-ui)', color: on ? ps2.c : 'rgba(20,35,61,0.5)' }}>{ps2.label}</span></button> })}
                  </div>
                </div>

                {/* Avance (editable) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={eb}>Avance</span><span style={{ fontSize: 12, fontWeight: 800, color: '#10233F' }}>{t.progress ?? 0}%</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="range" min={0} max={100} step={5} value={t.progress ?? 0} aria-label="Avance de la tarea"
                      onChange={e => setTaskProgress(ep, i, Number(e.target.value), true)} style={{ flex: 1, height: 6, cursor: 'pointer', accentColor: ep.color }} />
                    <button onClick={() => setTaskProgress(ep, i, 100)} style={{ cursor: 'pointer', border: '1px solid rgba(62,142,142,0.35)', background: 'rgba(62,142,142,0.10)', color: '#2E6E6E', borderRadius: 9, padding: '6px 11px', fontSize: 11.5, fontWeight: 700 }}>100%</button>
                  </div>
                </div>

                {/* Bitácora de avance (días trabajados + nota) */}
                {(() => {
                  const log = t.progressLog || []
                  const deltas = progressDeltas(log)
                  const todayLogged = log.some(x => x.d === todayISO())
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                        <span style={eb}>Bitácora de avance{log.length > 0 && <span style={{ color: '#A87A2C', fontWeight: 800 }}> {log.length} {log.length === 1 ? 'día' : 'días'}</span>}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <input type="date" value="" onChange={e => addProgressDay(ep, i, e.target.value)} title="Registrar otro día" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '6px 8px', fontSize: 11.5, fontWeight: 600, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }} />
                          <button onClick={() => addProgressDay(ep, i, todayISO())} disabled={todayLogged} style={{ cursor: todayLogged ? 'default' : 'pointer', borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: 800, border: todayLogged ? '1px solid rgba(62,142,142,0.35)' : 'none', ...(todayLogged ? { background: 'rgba(62,142,142,0.12)', color: '#2E6E6E' } : { background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305' }) }}>{todayLogged ? '✓ Avancé hoy' : 'Avancé hoy'}</button>
                        </div>
                      </div>
                      {log.length === 0
                        ? <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)' }}>Marca los días en que avanzaste en esta tarea, con una nota si quieres.</div>
                        : (() => {
                            const CAP = 4
                            const collapsed = log.length > CAP && !logExpanded
                            const shown = collapsed ? log.slice(0, CAP) : log
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: logExpanded ? 260 : undefined, overflowY: logExpanded ? 'auto' : 'visible' }}>
                                {shown.map(entry => {
                                  const isTd = entry.d === todayISO()
                                  return (
                                    <div key={entry.d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, background: isTd ? 'rgba(194,147,58,0.09)' : 'rgba(15,35,64,0.03)' }}>
                                      <span style={{ flexShrink: 0, width: 54, fontSize: 11.5, fontWeight: 700, color: isTd ? '#A87A2C' : '#16365F' }}>{isTd ? 'Hoy' : cap(new Date(entry.d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''))}</span>
                                      {typeof deltas[entry.d] === 'number'
                                        ? <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'baseline', gap: 4, minWidth: 62 }}>
                                            <span style={{ fontSize: 12, fontWeight: 800, color: deltas[entry.d] > 0 ? '#2E6E6E' : deltas[entry.d] < 0 ? '#B0522E' : 'rgba(20,35,61,0.4)' }}>{deltas[entry.d] > 0 ? '+' : ''}{deltas[entry.d]}%</span>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>→{entry.pct}%</span>
                                          </span>
                                        : <span style={{ flexShrink: 0, minWidth: 62, fontSize: 10, color: 'rgba(20,35,61,0.55)' }}>·</span>}
                                      <input defaultValue={entry.note || ''} onBlur={e => setProgressNote(ep, i, entry.d, e.target.value)} placeholder="Nota del día…" style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 12.5, color: '#14233D', outline: 'none' }} />
                                      <button onClick={() => removeProgressDay(ep, i, entry.d)} aria-label="Quitar día" title="Quitar día" style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.55)', fontSize: 13, lineHeight: 1 }}>✕</button>
                                    </div>
                                  )
                                })}
                                {log.length > CAP && (
                                  <button onClick={() => setLogExpanded(v => !v)} style={{ alignSelf: 'flex-start', cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11.5, fontWeight: 700, padding: '2px 0' }}>{collapsed ? `Ver ${log.length - CAP} días más ▾` : 'Ver menos ▴'}</button>
                                )}
                              </div>
                            )
                          })()
                      }
                    </div>
                  )
                })()}

                {/* Fechas (editables) */}
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div><div style={eb}>Hacer</div><input type="date" value={t.plan || ''} onChange={e => setTaskPlan(ep, i, e.target.value)} style={{ border: '1px solid rgba(46,90,158,0.35)', borderRadius: 9, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: t.plan ? '#2E5A9E' : 'rgba(20,35,61,0.4)', background: t.plan ? 'rgba(46,90,158,0.06)' : '#fff', outline: 'none' }} /></div>
                  <div><div style={eb}>Vence</div><input type="date" value={t.due} onChange={e => setTaskDue(ep, i, e.target.value)} style={{ border: `1px solid ${dt.border}`, borderRadius: 9, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: dt.c, background: dt.bg, outline: 'none' }} /></div>
                </div>

                {/* Subtareas (marcables) */}
                {t.subtasks && t.subtasks.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={eb}>Subtareas <span style={{ color: '#2E6E6E', fontWeight: 800 }}>{t.subtasks.filter(s => s.done).length}/{t.subtasks.length} · {Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100)}%</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {t.subtasks.map((s, si) => (
                        <button key={si} onClick={() => toggleSubtask(ep, i, si)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '3px 0' }}>
                          <span style={{ flexShrink: 0, height: 18, width: 18, borderRadius: 5, background: s.done ? '#2E6E6E' : '#fff', border: s.done ? 'none' : '1.5px solid rgba(15,35,64,0.25)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}</span>
                          <span style={{ fontSize: 13, color: s.done ? 'rgba(20,35,61,0.4)' : '#16365F', textDecoration: s.done ? 'line-through' : 'none' }}>{s.t}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {t.note && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={eb}>Nota</div>
                    <div className="ep-note" style={{ fontSize: 13.5, lineHeight: 1.55, color: '#14233D', maxHeight: 320, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: t.note }} />
                  </div>
                )}

                {t.links && t.links.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={eb}>Links</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {t.links.map((l, li) => (
                        <a key={li} href={l.url || '#'} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)', borderRadius: 99, padding: '6px 12px' }}>🔗 {l.label || l.url}</a>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, paddingTop: 16, borderTop: '1px solid rgba(15,35,64,0.08)' }}>
                  <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>Edita título, nota y subtareas en “Editar”.</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => setTaskView(null)} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 11, padding: '11px 18px', fontSize: 13, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>Cerrar</button>
                  <button onClick={openEditFromView} style={{ ...goldBtn, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 22px' }}><PencilIcon /> Editar</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {taskEdit && (() => {
        const ep = epics.find(e => e.id === taskEdit.epicId)        // épica de origen
        const target = epics.find(e => e.id === taskEditTarget) || ep // épica destino (editable)
        const isNew = taskEdit.index == null
        const willMove = !isNew && !!target && !!ep && target.id !== ep.id
        const dt = dueTone(taskDraft.due, taskDraft.status === 'Terminada')
        return (
          <div onClick={closeTaskEdit} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Editar tarea" onClick={e => e.stopPropagation()} className="ep-modal ep-task-modal" style={{ width: '100%', maxWidth: 620, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: target?.color || ep?.color || '#2E5A9E' }} />
              <div style={{ padding: '20px 26px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>{isNew ? 'Nueva tarea' : 'Editar tarea'}</div>
                    {/* La épica es editable en ambos casos: al crear porque el enfoque cruza
                        todas, y al editar porque una tarea puede haber caído en la equivocada. */}
                    {activeEpics.length > 1
                      ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ width: 9, height: 9, borderRadius: 99, background: target?.color || ep?.color, flexShrink: 0 }} />
                          <select value={taskEditTarget} aria-label="Épica de la tarea"
                            onChange={ev => setTaskEditTarget(ev.target.value)}
                            style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '5px 8px', fontSize: 12.5, fontWeight: 600, color: '#16365F', background: '#fff', outline: 'none', maxWidth: 240 }}>
                            {activeEpics.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                          {willMove && (
                            <span style={{ font: '700 10.5px var(--font-ui)', color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.32)', borderRadius: 99, padding: '2px 9px' }}>
                              se moverá desde {ep?.name}
                            </span>
                          )}
                        </div>
                      )
                      : <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>{ep?.name}</div>}
                  </div>
                  <button aria-label="Cerrar editor de tarea" onClick={closeTaskEdit} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
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

                <label style={lbl}>Avance</label>
                <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: -4, marginBottom: 9 }}>Qué tan completa la sientes. Arrastra la barra o fíjala al 100%.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <input type="range" min={0} max={100} step={5} value={taskDraft.progress ?? 0}
                    onChange={e => setTaskDraft(d => ({ ...d, progress: Number(e.target.value) }))}
                    style={{ flex: 1, height: 6, cursor: 'pointer', accentColor: target?.color || ep?.color || '#C2933A' }} />
                  <span className="serif" style={{ fontSize: 22, fontWeight: 600, color: '#10233F', minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{taskDraft.progress ?? 0}%</span>
                  <button onClick={() => setTaskDraft(d => ({ ...d, progress: 100 }))} style={{ cursor: 'pointer', border: '1px solid rgba(62,142,142,0.35)', background: 'rgba(62,142,142,0.10)', color: '#2E6E6E', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>100%</button>
                </div>

                <label style={lbl}>Planear para</label>
                <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: -4, marginBottom: 8 }}>El día en que aparecerá en tu enfoque.</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  {([['Sin planear', ''], ['Hoy', todayISO()], ['Mañana', addDays(todayISO(), 1)]] as [string, string][]).map(([label, iso]) => {
                    const on = (taskDraft.plan || '') === iso
                    return <button key={label} onClick={() => setTaskDraft(d => ({ ...d, plan: iso }))} style={{ borderRadius: 99, padding: '8px 13px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#F3EFE6' : 'rgba(20,35,61,0.6)' }}>{label}</button>
                  })}
                  {(() => {
                    const custom = !!taskDraft.plan && taskDraft.plan !== todayISO() && taskDraft.plan !== addDays(todayISO(), 1)
                    return <input type="date" value={taskDraft.plan || ''} onChange={e => setTaskDraft(d => ({ ...d, plan: e.target.value }))} style={{ borderRadius: 99, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none', border: custom ? '1px solid rgba(194,147,58,0.55)' : '1px solid rgba(15,35,64,0.14)', background: custom ? 'rgba(194,147,58,0.10)' : '#fff', color: custom ? '#A87A2C' : 'rgba(20,35,61,0.6)' }} />
                  })()}
                </div>

                {/* REPETIR — presets para lo común, personalizado para el resto */}
                <label style={lbl}>Repetir</label>
                <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: -4, marginBottom: 8 }}>
                  Al marcarla como hecha no se termina: vuelve sola a tu enfoque en la siguiente fecha.
                </div>
                {(() => {
                  const r = taskDraft.repeat
                  const presets: [string, EpicaRepeat | null][] = [
                    ['No se repite', null],
                    ['Cada día', { every: 1, unit: 'dia' }],
                    ['Cada semana', { every: 1, unit: 'semana' }],
                    ['Cada mes', { every: 1, unit: 'mes' }],
                  ]
                  const isPreset = (x: EpicaRepeat | null) =>
                    x === null ? !r : !!r && r.every === x.every && r.unit === x.unit
                  const custom = !!r && !presets.some(([, x]) => x !== null && isPreset(x))
                  return (
                    <>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                        {presets.map(([label, x]) => {
                          const on = isPreset(x)
                          return (
                            <button key={label} onClick={() => setTaskDraft(d => {
                              const n = { ...d }
                              if (x) n.repeat = { ...x }; else { delete n.repeat; delete n.repeatUntil }
                              return n
                            })} style={{ borderRadius: 99, padding: '8px 13px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', border: on ? `1px solid ${REPEAT_TONE.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? REPEAT_TONE.c : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{label}</button>
                          )
                        })}
                        <button onClick={() => setTaskDraft(d => ({ ...d, repeat: d.repeat ? { ...d.repeat, every: Math.max(2, d.repeat.every) } : { every: 2, unit: 'semana' } }))}
                          style={{ borderRadius: 99, padding: '8px 13px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', border: custom ? `1px solid ${REPEAT_TONE.c}` : '1px solid rgba(15,35,64,0.14)', background: custom ? REPEAT_TONE.bg : '#fff', color: custom ? REPEAT_TONE.c : 'rgba(20,35,61,0.6)' }}>Personalizado…</button>
                      </div>

                      {r && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 11, padding: '11px 13px', borderRadius: 12, background: REPEAT_TONE.bg, border: `1px solid ${REPEAT_TONE.border}` }}>
                          <span style={{ font: '700 12.5px var(--font-ui)', color: REPEAT_TONE.c }}>Cada</span>
                          <input type="number" min={1} max={99} value={r.every} aria-label="Cada cuántos"
                            onChange={ev => { const v = Math.max(1, Math.min(99, Number(ev.target.value) || 1)); setTaskDraft(d => (d.repeat ? { ...d, repeat: { ...d.repeat, every: v } } : d)) }}
                            style={{ width: 62, boxSizing: 'border-box', border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 9, padding: '7px 9px', fontSize: 13, fontWeight: 700, color: '#14233D', background: '#fff', outline: 'none' }} />
                          <select value={r.unit} aria-label="Unidad de repetición"
                            onChange={ev => { const u = ev.target.value as EpicaRepeat['unit']; setTaskDraft(d => (d.repeat ? { ...d, repeat: { ...d.repeat, unit: u } } : d)) }}
                            style={{ cursor: 'pointer', border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 9, padding: '7px 9px', fontSize: 13, fontWeight: 600, color: '#14233D', background: '#fff', outline: 'none' }}>
                            <option value="dia">{r.every === 1 ? 'día' : 'días'}</option>
                            <option value="semana">{r.every === 1 ? 'semana' : 'semanas'}</option>
                            <option value="mes">{r.every === 1 ? 'mes' : 'meses'}</option>
                          </select>
                          <span style={{ width: 1, alignSelf: 'stretch', background: REPEAT_TONE.border }} />
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: REPEAT_TONE.c }}>Hasta</span>
                            <input type="date" value={taskDraft.repeatUntil || ''} aria-label="Fin de la serie (opcional)"
                              onChange={ev => setTaskDraft(d => { const v = ev.target.value; const n = { ...d }; if (v) n.repeatUntil = v; else delete n.repeatUntil; return n })}
                              style={{ border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 9, padding: '6px 8px', fontSize: 12, fontWeight: 600, color: '#14233D', background: '#fff', outline: 'none' }} />
                          </label>
                          {taskDraft.plan && (
                            <span style={{ flexBasis: '100%', fontSize: 11.5, color: REPEAT_TONE.c }}>
                              Se repite <strong>{repeatLabel(r)}</strong> · la siguiente sería el {fmtDue(nextOccurrence(taskDraft.plan, r, taskDraft.plan))}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}

                <label style={lbl}>Prioridad</label>
                {!taskDraft.priority && <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: -4, marginBottom: 8 }}>Sugerida por la fecha — toca para fijarla.</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['alta', 'media', 'baja'] as Prio[]).map(p => {
                    const ps = prioStyle(p)
                    const on = taskDraft.priority === p
                    const suggested = !taskDraft.priority && prioFromDue(taskDraft.due) === p
                    return <button key={p} onClick={() => setTaskDraft(d => ({ ...d, priority: p }))} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 0', borderRadius: 9, cursor: 'pointer', border: on ? `1px solid ${ps.c}` : suggested ? `1.5px dashed ${ps.c}` : '1px solid rgba(15,35,64,0.12)', background: on ? 'rgba(194,147,58,0.08)' : '#fff' }}><PrioBars p={p} /><span style={{ font: '700 10px var(--font-ui)', color: on || suggested ? ps.c : 'rgba(20,35,61,0.5)' }}>{ps.label}</span></button>
                  })}
                </div>

                <label style={lbl}>Fecha de entrega</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="date" value={taskDraft.due} onChange={e => setTaskDraft(d => ({ ...d, due: e.target.value }))} style={{ ...inpBig, flex: 1, fontWeight: 600, border: `1px solid ${dt.border}`, color: dt.c, background: dt.bg }} />
                  {taskDraft.due && <button onClick={() => setTaskDraft(d => ({ ...d, due: '' }))} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 9, padding: '9px 12px', fontSize: 12, fontWeight: 700, color: 'rgba(20,35,61,0.5)', whiteSpace: 'nowrap' }}>Quitar</button>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={lbl}>Links</label>
                  <button onClick={() => setTaskDraft(d => ({ ...d, links: [...(d.links || []), { label: '', url: '' }] }))} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, marginTop: 16 }}>+ Link</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(taskDraft.links || []).map((l, i) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <input value={l.label} onChange={e => setTaskDraft(d => { const links = [...(d.links || [])]; links[i] = { ...links[i], label: e.target.value }; return { ...d, links } })} placeholder="Nombre" style={{ ...inpSmall, flex: '0 0 120px' }} />
                      <input value={l.url} onChange={e => setTaskDraft(d => { const links = [...(d.links || [])]; links[i] = { ...links[i], url: e.target.value }; return { ...d, links } })} placeholder="https://…" style={{ ...inpSmall, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12 }} />
                      <button aria-label="Eliminar enlace" onClick={() => setTaskDraft(d => ({ ...d, links: (d.links || []).filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                    </div>
                  ))}
                </div>

                {(() => { const st = taskDraft.subtasks || []; const done = st.filter(s => s.done).length; return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={lbl}>Subtareas{st.length > 0 && <span style={{ marginLeft: 7, color: '#2E6E6E', fontWeight: 800 }}>{done}/{st.length} · {Math.round((done / st.length) * 100)}%</span>}</label>
                    <button onClick={() => setTaskDraft(d => ({ ...d, subtasks: [...(d.subtasks || []), { t: '', done: false }] }))} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, marginTop: 16 }}>+ Subtarea</button>
                  </div>
                ) })()}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(taskDraft.subtasks || []).map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={() => setTaskDraft(d => { const st = [...(d.subtasks || [])]; st[i] = { ...st[i], done: !st[i].done }; return { ...d, subtasks: st } })} title={s.done ? 'Hecha' : 'Marcar hecha'} style={{ flexShrink: 0, height: 22, width: 22, borderRadius: 6, cursor: 'pointer', border: s.done ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: s.done ? '#2E6E6E' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}</button>
                      <input value={s.t} onChange={e => setTaskDraft(d => { const st = [...(d.subtasks || [])]; st[i] = { ...st[i], t: e.target.value }; return { ...d, subtasks: st } })} placeholder="Paso o subtarea…" style={{ ...inpSmall, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'rgba(20,35,61,0.4)' : '#14233D' }} />
                      <button aria-label="Eliminar subtarea" onClick={() => setTaskDraft(d => ({ ...d, subtasks: (d.subtasks || []).filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                    </div>
                  ))}
                </div>

                <label style={lbl}>Nota</label>
                <RichText value={taskDraft.note || ''} onChange={v => setTaskDraft(d => ({ ...d, note: v }))} placeholder="Negritas (B), cursiva (I) y viñetas (• Lista)…" minHeight={170} />

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

      {routineStat && (() => {
        const ep = epicsRef.current.find(x => x.id === routineStat.eId) || epics.find(x => x.id === routineStat.eId)
        const r = ep?.routines[routineStat.ri]
        if (!ep || !r) return null
        const s = routineStats(r)
        const tile = (label: string, value: string, sub?: string, hi?: boolean) => (
          <div className="glass" style={{ borderRadius: 13, padding: '13px 14px' }}>
            <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
              <span className="serif" style={{ fontWeight: 600, fontSize: 28, lineHeight: .9, color: hi ? '#A87A2C' : '#10233F' }}>{value}</span>
              {sub && <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>{sub}</span>}
            </div>
          </div>
        )
        return (
          <div onClick={() => setRoutineStat(null)} style={{ position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Estadísticas de la rutina" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: ep.color }} />
              <div style={{ padding: '18px 22px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>Rutina diaria</div>
                    <div className="serif" style={{ fontWeight: 600, fontSize: 24, lineHeight: 1, color: '#10233F' }}>{r.t}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: ep.color }} />{ep.name}</div>
                  </div>
                  <button aria-label="Cerrar estadísticas" onClick={() => setRoutineStat(null)} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {tile('Esta semana', `${s.week}/7`, undefined, true)}
                  {tile('Este mes', String(s.month), 'veces')}
                  {tile('Trimestre', String(s.quarter), 'veces')}
                  {tile('Este año', String(s.year), 'veces')}
                  {tile('Mejor semana', `${s.best}/7`)}
                  {tile('Total', String(s.total), `${s.activeWeeks} sem`)}
                </div>
                {s.recent.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 10 }}>Últimas semanas</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 72 }}>
                      {[...s.recent].reverse().map(w => {
                        const h = 8 + (w.count / 7) * 56
                        return (
                          <div key={w.monday} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }} title={`${weekRangeLabel(w.monday)} · ${w.count}/7`}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{w.count}</span>
                            <div style={{ width: '100%', maxWidth: 26, height: h, borderRadius: 6, background: w.count >= 5 ? '#2E6E6E' : w.count >= 3 ? '#C2933A' : 'rgba(15,35,64,0.18)' }} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>{dayNum(w.monday)}/{cap(new Date(w.monday + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 80, background: toast.error ? '#B0522E' : '#16365F', color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 16px 30px -14px rgba(8,18,36,.6)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span>{toast.msg}</span>
          {toast.action && (
            <button onClick={() => { toast.action!.fn(); setToast(null) }} style={{ border: 'none', background: 'transparent', color: '#E7C56B', fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>{toast.action.label}</button>
          )}
        </div>
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
            <HeaderStats />
            <CumplesWidget />
            <ExcepcionalesWidget />
            <WidgetsDropdown />
            <SpecialsDropdown />
            <span className="ep-hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 10, background: 'rgba(62,142,142,0.16)', border: '1px solid rgba(120,200,190,0.25)', padding: '8px 12px', fontSize: 11.5, fontWeight: 700, color: '#B9E2DA' }}>
              <span className="ep-live" style={{ height: 7, width: 7, borderRadius: 99, background: '#5FD0BE' }} />Supabase · {sourceCount} fuentes
            </span>
            <Link href="/" className="band-glass" style={{ borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>← Accesos</Link>
            <button onClick={onNew} style={{ ...goldBtn, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 15px', fontSize: 12 }}>
              <span style={{ fontSize: 16, lineHeight: 1, marginTop: -1 }}>+</span> <span className="ep-hide-xs">Nueva</span> épica
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

/* ─── Editor de notas: negritas + viñetas (contenteditable) ─────── */
function RichText({ value, onChange, placeholder, minHeight = 74 }: { value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== (value || '')) el.innerHTML = value || ''
  }, [value])
  const exec = (cmd: string) => {
    const el = ref.current; if (!el) return
    el.focus()
    document.execCommand(cmd, false)
    onChange(el.innerHTML)
  }
  const rtBtn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 7, padding: '4px 9px', fontSize: 12, color: 'rgba(20,35,61,0.7)', lineHeight: 1 }
  return (
    <div style={{ border: '1px solid rgba(15,35,64,0.14)', borderRadius: 11, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', gap: 5, padding: 6, borderBottom: '1px solid rgba(15,35,64,0.08)', background: '#FBFAF6' }}>
        <button type="button" aria-label="Negrita" title="Negrita" onMouseDown={e => { e.preventDefault(); exec('bold') }} style={{ ...rtBtn, fontWeight: 800 }}>B</button>
        <button type="button" aria-label="Cursiva" title="Cursiva" onMouseDown={e => { e.preventDefault(); exec('italic') }} style={{ ...rtBtn, fontStyle: 'italic' }}>I</button>
        <button type="button" aria-label="Viñetas" title="Viñetas" onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }} style={rtBtn}>• Lista</button>
      </div>
      <div
        ref={ref}
        className="ep-rt"
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder}
        onInput={e => onChange((e.target as HTMLDivElement).innerHTML)}
        style={{ minHeight, maxHeight: 360, overflowY: 'auto', padding: '10px 12px', fontSize: 13.5, lineHeight: 1.5, color: '#14233D', outline: 'none' }}
      />
    </div>
  )
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
