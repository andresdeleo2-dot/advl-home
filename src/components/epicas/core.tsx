import type { CSSProperties, ReactNode } from 'react'
import type { Epica, EpicaTask, EpicaRoutine, EpicaProgressEntry, EpicaRepeat, EpicaMilestone } from '@/lib/supabase'

/* Núcleo de /epicas: constantes de marca, utilidades de fecha, estilos por estado
   y piezas de presentación sin estado. Se extrajo de EpicasDashboard para que ese
   archivo quede sólo con el componente y su estado. */

/* ─── Tokens de marca (del handoff) ─────────────────────────── */
export const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const DAYNAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const TS_ORDER = ['En curso', 'Esperando', 'Por hacer', 'Terminada']
export const EPIC_STATUSES = ['En curso', 'En riesgo', 'Al día', 'En pausa']
export const TASK_STATUSES = ['Por hacer', 'En curso', 'Esperando', 'Terminada']
// 'Archivada' es un estado seleccionable pero fuera de los flujos activos: no aparece
// como columna del tablero ni en el enfoque, y sólo se ve en el backlog al pedirlo.
export const ARCHIVED = 'Archivada'
export const PICK_STATUSES = [...TASK_STATUSES, ARCHIVED]
export const LINK_TYPES = ['Dashboard', 'Supabase', 'Excel', 'Drive', 'Otro']
export const SWATCHES = ['#2E5A9E', '#3E8E8E', '#C2933A', '#7A6FB0', '#B07A56', '#5B6B86']

export function statusStyle(s: string) {
  const m: Record<string, { bg: string; color: string }> = {
    'En curso': { bg: 'rgba(62,142,142,0.12)', color: '#2E6E6E' },
    'En riesgo': { bg: 'rgba(176,90,60,0.15)', color: '#B0522E' },
    'Al día': { bg: 'rgba(46,90,158,0.12)', color: '#2E5A9E' },
    'En pausa': { bg: 'rgba(91,107,134,0.15)', color: '#5B6B86' },
  }
  return m[s] || m['En curso']
}
export function taskStyle(s: string) {
  const m: Record<string, { c: string; bg: string; label: string; group: string }> = {
    'Por hacer': { c: '#5B6B86', bg: 'rgba(91,107,134,0.12)', label: 'Por hacer', group: 'Por hacer' },
    'En curso': { c: '#2E5A9E', bg: 'rgba(46,90,158,0.12)', label: 'En curso', group: 'En curso' },
    'Esperando': { c: '#A87A2C', bg: 'rgba(194,147,58,0.16)', label: 'Esperando', group: 'Esperando a otros' },
    'Terminada': { c: '#2E6E6E', bg: 'rgba(62,142,142,0.14)', label: 'Terminada', group: 'Terminadas' },
    'Archivada': { c: 'rgba(20,35,61,0.5)', bg: 'rgba(20,35,61,0.07)', label: 'Archivada', group: 'Archivadas' },
  }
  return m[s] || m['Por hacer']
}
export function typeColor(t: string) {
  const m: Record<string, string> = { Dashboard: '#C2933A', Supabase: '#3E8E8E', Excel: '#5B6B86', Drive: '#2E5A9E', Otro: '#7A6FB0' }
  return m[t] || '#7A6FB0'
}

// Las archivadas salen de todos los conteos: no cuentan como total, ni pendientes, ni progreso.
export const taskCount = (e: Epica) => (e.tasks || []).filter(t => t.status !== ARCHIVED).length
export const doneCount = (e: Epica) => (e.tasks || []).filter(t => t.status === 'Terminada').length
export const pendCount = (e: Epica) => (e.tasks || []).filter(t => t.status !== 'Terminada' && t.status !== ARCHIVED).length
export const pctOf = (e: Epica) => { const tot = taskCount(e); return tot > 0 ? Math.round((doneCount(e) / tot) * 100) : 0 }

export function fmtDue(s: string) {
  if (!s) return ''
  const d = new Date(s + 'T00:00:00'); if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
export function todayISO(): string {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** Etiqueta de mes ("Julio 2026") para agrupar terminadas; '' → "Sin fecha". */
export function monthLabel(s: string): string {
  if (!s) return 'Sin fecha'
  const d = new Date(s + 'T00:00:00'); if (isNaN(d.getTime())) return 'Sin fecha'
  const l = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  return l.charAt(0).toUpperCase() + l.slice(1)
}
export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/* ─── Recurrencia ─────────────────────────────────────────────
   Una tarea que se repite no se duplica: al completarla se reprograma
   a su siguiente fecha. Así el backlog no se llena de copias y la
   bitácora de la tarea conserva todo su historial en un solo lugar. */

/** Suma meses conservando el día; si el mes destino es más corto, cae en su último día
 *  (31 de enero + 1 mes → 28/29 de febrero, no el 3 de marzo). */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1 + n, 1)
  const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  t.setDate(Math.min(d, lastDay))
  const p = (x: number) => String(x).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}
/** Siguiente ocurrencia después de `after`. Si completaste con retraso, salta los
 *  ciclos perdidos en vez de dejarte una fecha ya vencida. */
export function nextOccurrence(from: string, r: EpicaRepeat, after: string): string {
  const every = Math.max(1, Math.round(r.every || 1))
  const step = (iso: string) => r.unit === 'mes'
    ? addMonths(iso, every)
    : addDays(iso, every * (r.unit === 'semana' ? 7 : 1))
  let d = step(from)
  for (let guard = 0; d <= after && guard < 500; guard++) d = step(d)
  return d
}
export function repeatLabel(r: EpicaRepeat): string {
  const n = Math.max(1, Math.round(r.every || 1))
  if (r.unit === 'dia') return n === 1 ? 'cada día' : `cada ${n} días`
  if (r.unit === 'semana') return n === 1 ? 'cada semana' : `cada ${n} semanas`
  return n === 1 ? 'cada mes' : `cada ${n} meses`
}
export const REPEAT_TONE = { c: '#7A6FB0', bg: 'rgba(122,111,176,0.10)', border: 'rgba(122,111,176,0.32)' }

/** Registra el % del día de hoy en la bitácora (upsert). No muta arrays compartidos. */
export function upsertProgressPct(task: EpicaTask, pct: number) {
  const today = todayISO()
  const log = [...(task.progressLog || [])]
  const idx = log.findIndex(x => x.d === today)
  if (idx >= 0) log[idx] = { ...log[idx], pct }
  else log.push({ d: today, pct })
  log.sort((a, b) => b.d.localeCompare(a.d))
  task.progressLog = log
}
/** Delta por día (asc): cada entrada con pct guarda cuánto cambió respecto a la anterior con pct. */
export function progressDeltas(log: EpicaProgressEntry[]): Record<string, number> {
  const asc = [...log].filter(e => typeof e.pct === 'number').sort((a, b) => a.d.localeCompare(b.d))
  const out: Record<string, number> = {}
  let last = 0
  asc.forEach(e => { out[e.d] = (e.pct as number) - last; last = e.pct as number })
  return out
}

/** Id estable para una tarea. Las tareas se referencian por id (no por índice),
 *  para que borrar o mover una no invalide las referencias abiertas. */
export function uid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return c?.randomUUID ? c.randomUUID() : 't' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
/** Rellena arrays faltantes por si algún registro viejo trae null. */
export function normalize(e: Epica): Epica {
  return {
    ...e,
    categoria: e.categoria ?? null,
    archived: !!e.archived,
    kpis: (e.kpis || []).map(normalizeMilestone),
    routines: (e.routines || []).map(r => {
      const days = (r.days && r.days.length === 7) ? r.days : [false, false, false, false, false, false, false]
      // Migra el progreso legado (days) a la semana actual si aún no hay historial por semana
      const weeks = (r.weeks && typeof r.weeks === 'object') ? r.weeks : (days.some(Boolean) ? { [mondayISO(todayISO())]: days } : {})
      return { t: r.t, days, weeks }
    }),
    tasks: (e.tasks || []).map(t => {
      const nt = t.id ? { ...t } : { ...t, id: uid() }
      // Las subtareas también llevan id estable (se persisten al primer guardado)
      if (nt.subtasks?.some(s => !s.id)) nt.subtasks = nt.subtasks.map(s => (s.id ? s : { ...s, id: uid() }))
      return nt
    }),
    links: e.links || [],
  }
}

/** Días hasta una fecha YYYY-MM-DD (negativo = ya pasó, null = sin fecha). */
export function daysUntil(s: string): number | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00'); if (isNaN(d.getTime())) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

/** Color de una fecha de entrega según qué tan cerca está el vencimiento.
 *  Rangos finos para que un abanico de fechas se vea como un abanico de colores. */
export function dueTone(due: string, done: boolean) {
  if (done) return { c: '#2E6E6E', border: 'rgba(62,142,142,0.35)', bg: '#fff', label: 'lista' }
  const dl = daysUntil(due)
  if (dl == null) return { c: 'rgba(20,35,61,0.5)', border: 'rgba(15,35,64,0.12)', bg: '#fff', label: 'sin fecha' }
  if (dl < 0)   return { c: '#B0522E', border: 'rgba(176,82,46,0.6)',  bg: 'rgba(176,82,46,0.10)', label: 'vencida' }
  if (dl <= 7)  return { c: '#C2410C', border: 'rgba(194,65,12,0.5)',  bg: 'rgba(194,65,12,0.08)',  label: 'esta semana' }
  if (dl <= 21) return { c: '#A87A2C', border: 'rgba(194,147,58,0.55)', bg: 'rgba(194,147,58,0.12)', label: 'próximas semanas' }
  if (dl <= 45) return { c: '#6F7F3E', border: 'rgba(111,127,62,0.5)',  bg: 'rgba(111,127,62,0.09)', label: 'este mes' }
  return { c: '#2E6E6E', border: 'rgba(62,142,142,0.35)', bg: 'rgba(62,142,142,0.06)', label: 'al día' }
}
export function primaryDash(e: Epica) {
  const prim = (e.links || []).find(l => l.primary)
  return prim ? (prim.url || '#') : ((e.links || [])[0]?.url || '#')
}

/* ─── Plan de hoy ─────────────────────────────────────────────── */
export type Prio = 'alta' | 'media' | 'baja'
export const PRIO_RANK: Record<Prio, number> = { alta: 0, media: 1, baja: 2 }

export function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }
/** ISO (UTC) → valor para <input type="datetime-local"> en hora LOCAL (YYYY-MM-DDTHH:mm). */
export function isoToLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
/** URL segura para un href de link de tarea: bloquea javascript:/data:/vbscript: (XSS),
 *  deja pasar http(s)/mailto/tel y antepone https:// a un dominio escrito sin protocolo. */
export function safeUrl(u?: string | null): string {
  const s = (u || '').trim()
  if (!s) return '#'
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s
  if (/^[\w.-]+\.[a-z]{2,}([/?#]|$)/i.test(s)) return 'https://' + s   // dominio sin protocolo
  return '#'   // cualquier otro esquema (javascript:, data:, …) → inerte
}
/** Color hex (#rgb o #rrggbb) → rgba con la alpha dada. Para tintar con el color de la épica. */
export function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return hex
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function addMonth(yyyyMM: string, n: number): string {
  const b = new Date(yyyyMM + '-01T00:00:00'); b.setMonth(b.getMonth() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${b.getFullYear()}-${p(b.getMonth() + 1)}`
}
export function dateLabel(iso: string): string {   // "Miércoles 15 de julio"
  return cap(new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }))
}
export function weekdayAbbr(iso: string): string { // "Mié"
  return cap(new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')).slice(0, 3)
}
export const dayNum = (iso: string) => Number(iso.slice(8, 10))
export function relShort(iso: string): string {    // etiqueta del chip de la tira
  const o = daysUntil(iso); return o === 0 ? 'Hoy' : o === 1 ? 'Mañana' : weekdayAbbr(iso)
}
export function relLong(iso: string): string {     // frase del masthead
  const o = daysUntil(iso); if (o == null) return ''
  if (o === 0) return 'Hoy'; if (o === 1) return 'Mañana'; if (o === -1) return 'Ayer'
  return o > 0 ? `En ${o} días` : `Hace ${-o} días`
}
export function weekendISO(fromISO: string): string {          // "Este finde": hoy si ya es finde; si no, próx. sábado
  const g = new Date(fromISO + 'T00:00:00').getDay()    // 0 dom … 6 sáb
  return (g === 6 || g === 0) ? fromISO : addDays(fromISO, 6 - g)
}
export function monthGrid(yyyyMM: string): string[] {          // 42 celdas (6×7), lunes primero
  const lead = (new Date(yyyyMM + '-01T00:00:00').getDay() + 6) % 7
  const start = addDays(yyyyMM + '-01', -lead)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
export function mondayISO(iso: string): string {               // lunes de la semana que contiene iso
  const g = new Date(iso + 'T00:00:00').getDay()        // 0 dom … 6 sáb
  return addDays(iso, -((g + 6) % 7))
}
export function weekRangeLabel(monday: string): string {       // "14–20 jul" (o "28 jul – 3 ago")
  const sunday = addDays(monday, 6)
  const mM = cap(new Date(monday + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))
  const sM = cap(new Date(sunday + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))
  return mM === sM ? `${dayNum(monday)}–${dayNum(sunday)} ${mM}` : `${dayNum(monday)} ${mM} – ${dayNum(sunday)} ${sM}`
}
/** Etiqueta de un rango arbitrario ISO→ISO ("14 – 27 jul", "28 jul – 10 ago"). */
export function spanLabel(a: string, b: string): string {
  const aM = cap(new Date(a + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))
  const bM = cap(new Date(b + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))
  return aM === bM ? `${dayNum(a)} – ${dayNum(b)} ${aM}` : `${dayNum(a)} ${aM} – ${dayNum(b)} ${bM}`
}
/** Lunes de cada semana que toca el mes de `iso` (para la vista "Mes"). */
export function monthWeekMondays(iso: string): string[] {
  const [y, m] = iso.split('-').map(Number)
  const first = `${iso.slice(0, 7)}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const last = `${iso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
  const out: string[] = []
  for (let d = mondayISO(first); d <= mondayISO(last); d = addDays(d, 7)) out.push(d)
  return out
}
export function getRoutineWeek(r: EpicaRoutine, monday: string): boolean[] {
  const w = r.weeks?.[monday]
  return (w && w.length === 7) ? w : [false, false, false, false, false, false, false]
}
export function routineStats(r: EpicaRoutine) {
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
export function todayLabel(): string {
  const s = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}
/** Prioridad por defecto al agregar, inferida de la cercanía de la fecha. */
export function prioFromDue(due: string): Prio {
  const dl = daysUntil(due)
  if (dl == null) return 'media'
  if (dl <= 3) return 'alta'
  if (dl <= 14) return 'media'
  return 'baja'
}
export function prioStyle(p: Prio | undefined) {
  const m: Record<Prio, { n: number; c: string; accent: string; accentW: number; label: string }> = {
    alta:  { n: 3, c: '#C2933A', accent: 'linear-gradient(180deg,#E7C56B,#C2933A)', accentW: 3, label: 'Alta' },
    media: { n: 2, c: '#16365F', accent: 'rgba(16,54,95,0.42)', accentW: 2, label: 'Media' },
    baja:  { n: 1, c: '#5B6B86', accent: 'transparent', accentW: 0, label: 'Baja' },
  }
  return m[p || 'media']
}
/** Medidor de 3 barras ascendentes: codifica prioridad por forma + color (legible en gris). */
export function PrioBars({ p, size = 14 }: { p: Prio | undefined; size?: number }) {
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
/* ─── Dificultad de la tarea ───────────────────────────────── */
export type Dif = 'facil' | 'media' | 'dificil'
export function difStyle(d: Dif | undefined) {
  const m: Record<Dif, { n: number; c: string; bg: string; border: string; label: string }> = {
    facil:   { n: 1, c: '#2E6E6E', bg: 'rgba(62,142,142,0.10)',  border: 'rgba(62,142,142,0.32)', label: 'Fácil' },
    media:   { n: 2, c: '#A87A2C', bg: 'rgba(194,147,58,0.12)',  border: 'rgba(194,147,58,0.34)', label: 'Media' },
    dificil: { n: 3, c: '#B0522E', bg: 'rgba(176,82,46,0.10)',   border: 'rgba(176,82,46,0.34)', label: 'Difícil' },
  }
  return m[d || 'media']
}
/** Peso de una tarea para el "presupuesto del día": fácil 1, media 2, difícil 3.
 *  Sin dificultad se asume media, que es lo más común. */
export const DIF_WEIGHT: Record<string, number> = { facil: 1, media: 2, dificil: 3 }
export const taskWeight = (t: EpicaTask) => DIF_WEIGHT[t.difficulty || 'media'] ?? 2

/** Días distintos en que se trabajó la tarea (según la bitácora de avance).
 *  Sirve para distinguir lo que se resuelve en un día de lo que se arrastra. */
export const diasTrabajados = (t: EpicaTask) => (t.progressLog || []).length
export const MULTIDIA_TONE = { c: '#7A6FB0', bg: 'rgba(122,111,176,0.10)', border: 'rgba(122,111,176,0.30)' }

/** Tres puntos ascendentes (distintos de las barras de prioridad) para codificar dificultad. */
export function DifDots({ d, size = 12 }: { d: Dif | undefined; size?: number }) {
  const ds = difStyle(d)
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 22 12" style={{ display: 'block' }}>
      {[0, 1, 2].map(i => <circle key={i} cx={3 + i * 8} cy={6} r={2.6} fill={i < ds.n ? ds.c : 'rgba(20,35,61,0.16)'} />)}
    </svg>
  )
}
export function ProgressRing({ pct, done }: { pct: number; done: boolean }) {
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
export function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>
  )
}
export const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Estilo de un popover anclado a su botón, con coordenadas absolutas de viewport
 *  (left/top). Se usa dentro de un portal a document.body: así ningún ancestro con
 *  overflow:hidden ni transform (las animaciones ep-pop/animate-fade crean un bloque
 *  contenedor que rompía el `fixed`) lo desplaza o recorta. Se voltea hacia arriba si
 *  no cabe abajo, alinea su borde derecho con el del botón y se ciñe al viewport. */
export function popoverStyle(rect: DOMRect | null, width: number, estHeight: number): CSSProperties {
  if (typeof window === 'undefined' || !rect) return { position: 'fixed', top: -9999, left: -9999 }
  const gap = 6, margin = 8
  const vw = window.innerWidth, vh = window.innerHeight
  let left = rect.right - width                       // alinea el borde derecho con el botón
  left = Math.max(margin, Math.min(left, vw - width - margin))
  const spaceBelow = vh - rect.bottom
  const up = spaceBelow < estHeight + gap && rect.top > spaceBelow
  const top = up ? Math.max(margin, rect.top - gap - estHeight) : rect.bottom + gap
  const maxHeight = Math.max(140, (up ? rect.top - gap : vh - rect.bottom - gap) - margin)
  return { position: 'fixed', zIndex: 80, left, top, width, maxHeight, overflowY: 'auto' }
}

/** Props para que un elemento clicable sea alcanzable y accionable por teclado.
 *  Varias filas de la página eran divs con onClick: invisibles para Tab y Enter.
 *  `asRow` omite role="button", que sobre un <tr> rompería la semántica de tabla. */
export function clickable(fn: () => void, label?: string, asRow = false) {
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

export type EpicDraft = Omit<Epica, 'id'> & { id: string | null }

/* ─── Preferencias de vista (persisten entre recargas) ───────── */
export const PREFS_KEY = 'advl_epicas_prefs_v1'
export type Prefs = {
  sortBy: 'Pendientes' | 'Progreso' | 'Nombre'
  compact: boolean; showRowKpi: boolean
  estadoFilter: 'activas' | 'archivadas' | 'todas'; catFilter: string
  planSort: 'plan' | 'prioridad' | 'entrega' | 'avance' | 'epica'
  planFilter: 'todas' | 'alta' | 'vencidas' | 'avance'
  planMode: 'dia' | 'semana' | 'ajuste' | '2sem' | '3sem' | 'mes' | 'calendario' | 'timeline' | 'resumen' | 'agenda' | 'detalle'
  weekEpica: string; weekDif: 'todas' | Dif; routinesOpen: boolean; boardHideDone: boolean; dayView: 'lista' | 'tabla'; boardView: 'tablero' | 'tabla'; epicView: 'lista' | 'tabla'; dayCapacity: number
  epicSort: 'grupo' | 'manual' | 'prioridad' | 'entrega' | 'hacer' | 'progreso' | 'nombre'
  epicFilter: 'todas' | 'planeadas' | 'sinplan' | 'vencidas' | 'alta'
  backlogOpen: boolean; backlogSort: { key: string; dir: 'asc' | 'desc' }
  backlogView: 'tabla' | 'tablero' | 'tarjetas' | 'semana' | 'detalle' | 'calendario'
  backlogDone: boolean; backlogFEpica: string; backlogFStatus: string; backlogFPrio: string
  featuredId: string | null
}
export const DEFAULT_PREFS: Prefs = {
  sortBy: 'Pendientes', compact: false, showRowKpi: true,
  estadoFilter: 'activas', catFilter: 'todas',
  planSort: 'plan', planFilter: 'todas', planMode: 'dia', weekEpica: 'todas', weekDif: 'todas', routinesOpen: true, boardHideDone: false, dayView: 'lista', boardView: 'tablero', epicView: 'lista', dayCapacity: 8, epicSort: 'grupo', epicFilter: 'todas',
  backlogOpen: false, backlogSort: { key: 'due', dir: 'asc' }, backlogView: 'tabla',
  backlogDone: false, backlogFEpica: 'todas', backlogFStatus: 'todas', backlogFPrio: 'todas',
  featuredId: null,
}
export function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } }
  catch { return DEFAULT_PREFS }
}

/* ─── Objetivos de la épica (milestones) ─────────────────────── */

/** Convierte un KPI viejo `{v, l}` en objetivo, y rellena el id si falta. */
export function normalizeMilestone(k: EpicaMilestone | { v?: string; l?: string }): EpicaMilestone {
  const legacy = k as { v?: string; l?: string }
  const m = k as EpicaMilestone
  if (m.t !== undefined || m.id !== undefined) return { ...m, id: m.id || uid(), t: m.t || '' }
  const num = Number(String(legacy.v ?? '').replace(/[^0-9.-]/g, ''))
  return {
    id: uid(),
    t: (legacy.l || '').trim() || 'Objetivo',
    current: Number.isFinite(num) && String(legacy.v ?? '').trim() ? num : undefined,
  }
}

/** Avance 0..1 de un objetivo. Si `auto`, se alimenta de las tareas cerradas.
 *  `lowerIsBetter` invierte la lectura (bajar de 85 a 80 kg es progreso). */
export function milestoneProgress(m: EpicaMilestone, e: Epica): { cur: number; target: number; pct: number; hasMeta: boolean; linked: number } {
  const auto = m.auto === 'tareas'
  const ids = m.taskIds || []
  // Si hay tareas ligadas, el avance las cuenta a ellas; si no, a toda la épica.
  const linkedTasks = ids.length ? (e.tasks || []).filter(t => t.id && ids.includes(t.id)) : []
  const cur = auto
    ? (ids.length ? linkedTasks.filter(t => t.status === 'Terminada').length : doneCount(e))
    : (m.current ?? 0)
  const target = m.target ?? (auto ? (ids.length ? linkedTasks.length : taskCount(e)) : 0)
  if (!target) return { cur, target: 0, pct: 0, hasMeta: false, linked: ids.length }
  let pct: number
  if (m.lowerIsBetter) {
    const start = Math.max(m.current ?? target, target)
    pct = start === target ? 1 : (start - cur) / (start - target)
  } else pct = cur / target
  return { cur, target, pct: Math.max(0, Math.min(1, pct)), hasMeta: true, linked: ids.length }
}

/** ¿Está cumplido? Marcado a mano, o alcanzó la meta. */
export function milestoneDone(m: EpicaMilestone, e: Epica): boolean {
  if (m.done) return true
  const { hasMeta, cur, target } = milestoneProgress(m, e)
  if (!hasMeta) return false
  return m.lowerIsBetter ? cur <= target : cur >= target
}

/** Objetivo al que está ligada una tarea (o undefined). */
export function milestoneOfTask(e: Epica, taskId?: string): EpicaMilestone | undefined {
  if (!taskId) return undefined
  return (e.kpis || []).find(m => (m.taskIds || []).includes(taskId))
}

/* ─── Donut reutilizable (part-to-whole) ─────────────────────────
   SVG sin dependencias. Cada rebanada SIEMPRE lleva etiqueta en la leyenda
   (y opcionalmente un ícono de forma), para que la identidad nunca dependa
   sólo del color — validado con la skill de dataviz. Hueco de 2px entre arcos. */
export type DonutSeg = { label: string; value: number; color: string; icon?: ReactNode }
export function Donut({ segments, size = 116, thickness = 16, centerTop, centerBottom }: {
  segments: DonutSeg[]; size?: number; thickness?: number; centerTop?: string; centerBottom?: string
}) {
  const total = segments.reduce((n, s) => n + s.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const gap = total > 0 ? 2 : 0   // px de separación entre arcos
  let offset = 0
  const arcs = segments.filter(s => s.value > 0).map((s, i) => {
    const frac = total > 0 ? s.value / total : 0
    const len = Math.max(0, frac * c - gap)
    const el = (
      <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
        strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    )
    offset += frac * c
    return el
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ display: 'block' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(15,35,64,0.06)" strokeWidth={thickness} />
          {arcs}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span className="serif" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, color: '#10233F' }}>{centerTop}</span>
          {centerBottom && <span style={{ font: '700 8.5px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.45)', marginTop: 4 }}>{centerBottom}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 130 }}>
        {segments.map((s, i) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: s.value > 0 ? 1 : 0.4 }}>
              {s.icon ?? <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />}
              <span style={{ flex: 1, fontSize: 12, color: '#16365F' }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#10233F' }}>{s.value}</span>
              <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.45)', width: 30, textAlign: 'right' }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
