/* Dominio de "Margen" (sección /tiempo). Portado fiel del prototipo del handoff.
   Todo el tiempo son MINUTOS DESDE MEDIANOCHE (0–1439) + fecha 'YYYY-MM-DD' local.
   El registro sólo existe para alimentar los patrones semanales. */

export type Area = 'trabajo' | 'cuerpo' | 'ocio' | 'personas' | 'cierre' | 'sueno'

/** Bloque protegido. `days` = 7 booleanos indexados por getDay() (0=Dom…6=Sáb);
 *  ausente = aplica TODOS los días. */
export type Block = { id: string; name: string; area: Area; start: number; dur: number; days?: boolean[] }
/** Sesión en curso. Si viene de una tarea de Épicas, guarda epicaId/taskId para
 *  marcarla como Terminada al cerrar el bloque. */
/** `start` = inicio del segmento en curso. `pausedAccum` = minutos ya acumulados de segmentos
 *  anteriores; si `pausedAt` está presente, la sesión está EN PAUSA (el reloj no corre). */
// startedAt = ms del inicio REAL original (no cambia al reanudar; para la hora/día del registro).
// segAt = ms del inicio del segmento en curso (se reinicia al reanudar; para el transcurrido real).
// mod = ms de la última modificación de la sesión (para que, entre pestañas/dispositivos, gane la
// copia MÁS reciente y no se pierda un pause/resume). segs = intervalos de trabajo YA cerrados (ms
// [inicio,fin]); el intervalo abierto va de segAt a ahora. Sirven para pintar los huecos de pausa.
export type Session = { name: string; area: Area; start: number; dur: number; epicaId?: string; taskId?: string; pausedAccum?: number; pausedAt?: number; origStart?: number; startedAt?: number; segAt?: number; routineRef?: { epicaId: string; rIdx: number }; mod?: number; segs?: [number, number][] } | null
// segments = intervalos trabajados en MINUTOS del día [inicio,fin] (para dibujar el registro con
// huecos donde pausaste). Ausente = bloque continuo (start..start+dur), como siempre.
export type HistoryRow = { date: string; name: string; area: Area; start: number; dur: number; epicaId?: string; taskId?: string; done?: boolean; logId?: string; segments?: [number, number][]; routineRef?: { epicaId: string; rIdx: number } }

/** Tarea de Épicas (o actividad libre) agendada para HOY a una hora concreta. Al llegar
 *  la hora, la app pregunta si la quieres iniciar. Vive sólo en el estado de Tiempo. */
export type ScheduledBlock = { id: string; name: string; area: Area; start: number; dur: number; date?: string; epicaId?: string; taskId?: string; started?: boolean }

/** Chips de día en el orden L M X J V S D con su índice getDay(). */
export const DOW_CHIPS: { lbl: string; i: number }[] = [
  { lbl: 'L', i: 1 }, { lbl: 'M', i: 2 }, { lbl: 'X', i: 3 }, { lbl: 'J', i: 4 }, { lbl: 'V', i: 5 }, { lbl: 'S', i: 6 }, { lbl: 'D', i: 0 },
]
/** ¿el bloque aplica el día `dow` (0=Dom…6=Sáb)? Sin `days` = todos los días. */
export const blockActiveOn = (b: Block, dow: number) => !b.days || b.days.length !== 7 || b.days[dow]
export function daysLabel(days?: boolean[]): string {
  if (!days || days.every(Boolean)) return 'todos los días'
  const on = DOW_CHIPS.filter(c => days[c.i])
  if (on.length === 5 && [1, 2, 3, 4, 5].every(i => days[i])) return 'entre semana'
  if (on.length === 2 && days[6] && days[0]) return 'fines de semana'
  if (on.length === 0) return 'ningún día'
  return on.map(c => c.lbl).join(' ')
}

export type AppData = {
  blocks: Block[]
  bed: number      // hora de dormir, ej. 1350 = 22:30
  sleep: number    // sueño objetivo en minutos, ej. 480 = 8h
  session: Session
  history: HistoryRow[]
  scheduled?: ScheduledBlock[]   // tareas/actividades agendadas a una hora hoy
  mit?: { date: string; ids: string[] }   // "lo más importante hoy": hasta 3 tareas foco del día
  backToTasks?: string[]   // claves `${fecha}·${taskId}` que el usuario devolvió a la lista pese a tener tiempo
  focusGoal?: number       // meta diaria de trabajo profundo en minutos (área Trabajo); 0/ausente = sin meta
  sessionEnd?: number      // ms de la ÚLTIMA vez que se cerró una sesión (tombstone): si es más nuevo que
                           // el startedAt de una sesión local, esa sesión ya terminó en otra pestaña/dispositivo
                           // → no la conserves (evita doble registro y "resurrección" del cronómetro)
}

export const KEY = 'margen.v1'

/** Marca durable de "/tiempo tiene cambios hechos sin una lectura válida del servidor" (sobrevive a
 *  recargas/cierres de la PWA). `rows` = renglones de historial creados entonces y aún no confirmados
 *  en el server: se conservan al reconciliar aunque el server traiga algo más nuevo. `base` = el estado
 *  contra el que se miden esas ediciones (KEY ya las trae); un PUT confirmado la descarta (settleDirty). */
export const DIRTY_KEY = KEY + '.dirty'
/** Identidad de un renglón de historial: su logId o, si no tiene, su contenido. */
export const rowKey = (h: HistoryRow) => h.logId || `${h.date}|${h.start}|${h.dur}|${h.area}|${h.name}`
/** Agrega a `base` los renglones de `rows` que no tenga (por rowKey). El sueño es UNO por fecha: un
 *  renglón de sueño agregado reemplaza al de esa fecha en `base` (si no, se sumarían dos noches). */
export function addRows(base: HistoryRow[], rows: HistoryRow[]): HistoryRow[] {
  const have = new Set(base.map(rowKey))
  const add = rows.filter(r => !have.has(rowKey(r)))
  if (!add.length) return base
  const sleepDays = new Set(add.filter(r => r.area === 'sueno').map(r => r.date))
  return (sleepDays.size ? base.filter(h => !(h.area === 'sueno' && sleepDays.has(h.date))) : base).concat(add)
}
/** Tras un PUT CONFIRMADO de `uploaded`: los renglones pendientes que ese blob ya llevaba dejan de
 *  estarlo; sin pendientes se borra la marca. Devuelve los que siguen pendientes. */
export function settleDirty(uploaded: HistoryRow[]): HistoryRow[] {
  try {
    const raw = localStorage.getItem(DIRTY_KEY); if (!raw) return []
    const rows = JSON.parse(raw)?.rows
    const have = new Set(uploaded.map(rowKey))
    const left: HistoryRow[] = Array.isArray(rows) ? rows.filter((r: HistoryRow) => !have.has(rowKey(r))) : []
    if (left.length) localStorage.setItem(DIRTY_KEY, JSON.stringify({ rows: left })); else localStorage.removeItem(DIRTY_KEY)
    return left
  } catch { return [] }
}

export const AREAS: Record<Area, { label: string; color: string }> = {
  trabajo: { label: 'Trabajo', color: '#b4653a' },
  cuerpo: { label: 'Cuerpo', color: '#6f8256' },
  ocio: { label: 'Ocio y descanso', color: '#c99a6f' },
  personas: { label: 'Personas', color: '#8b8379' },
  cierre: { label: 'Cierre del día', color: '#a49b90' },
  sueno: { label: 'Sueño', color: '#1c1a17' },
}

export const ACTIVITIES: { id: string; area: Area }[] = [
  { id: 'Trabajo profundo', area: 'trabajo' },
  { id: 'Reuniones', area: 'trabajo' },
  { id: 'Trámites', area: 'trabajo' },
  { id: 'Aprendizaje', area: 'trabajo' },
]

export const DAY_NAMES = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

/** 195 → "3h 15m", 120 → "2h", 45 → "45m". Redondea, mínimo 0. */
export function hm(m: number): string {
  m = Math.max(0, Math.round(m))
  const h = Math.floor(m / 60), r = m % 60
  if (h && r) return `${h}h ${r}m`
  if (h) return `${h}h`
  return `${r}m`
}

/** 1350 → "22:30". Módulo 1440. */
export function clock(m: number): string {
  const t = ((Math.round(m) % 1440) + 1440) % 1440
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0')
}

export type ResultadoInicio = 'ok' | 'futuro' | 'espera' | 'sin-sesion'

/** Corrige a qué hora empezó la sesión en curso. Si el inicio se adelanta, ese rato se suma como
 *  trabajado; si se atrasa, solo cuenta lo trabajado desde el nuevo inicio (las pausas nunca cuentan).
 *  null = hora futura. */
export function corregirInicio(s: NonNullable<Session>, startMin: number, ahora = Date.now()): NonNullable<Session> | null {
  const m = Math.max(0, Math.min(1439, Math.round(startMin)))
  const d = new Date(ahora); d.setHours(Math.floor(m / 60), m % 60, 0, 0)
  let nuevo = d.getTime()
  const viejo = s.startedAt ?? s.segAt ?? nuevo
  const hoy0 = new Date(ahora); hoy0.setHours(0, 0, 0, 0)
  if (nuevo > ahora && viejo < hoy0.getTime()) nuevo -= 86400000   // sesión de ayer que cruzó la medianoche
  if (nuevo > ahora) return null
  const corriendo = s.pausedAt == null
  const abierto = s.segAt ?? viejo
  const segs = s.segs || []
  const sumMin = (xs: [number, number][]) => xs.reduce((t, [a, b]) => t + Math.max(0, b - a) / 60000, 0)
  const startDe = (ms: number) => { const x = new Date(ms); return x.getHours() * 60 + x.getMinutes() }
  // Los tramos sólo sirven si cuadran con lo acumulado (una corrección vieja o datos legados los vaciaron).
  const coherentes = Math.abs(sumMin(segs) - (s.pausedAccum || 0)) < 1.5
  const base = { ...s, origStart: m, startedAt: nuevo }
  if (!coherentes) {
    // Sin tramos fiables: desplaza lo trabajado lo mismo que se movió el inicio.
    let banked = (s.pausedAccum || 0) + (viejo - nuevo) / 60000
    if (!corriendo) return { ...base, start: m, pausedAccum: Math.max(0, banked), segs: [] }
    let segAt = abierto
    if (banked < 0) { segAt = Math.min(ahora, segAt - banked * 60000); banked = 0 }
    return { ...base, start: startDe(segAt), segAt, pausedAccum: banked, pausedAt: undefined, segs: [] }
  }
  if (nuevo <= viejo) {
    if (segs.length) {
      const [[, b0], ...resto] = segs
      return { ...base, start: corriendo ? s.start : m, pausedAccum: (s.pausedAccum || 0) + (viejo - nuevo) / 60000, segs: [[nuevo, b0], ...resto] }
    }
    // Sin pausas: el tramo en curso (o el acumulado, si está pausada) arranca en el nuevo inicio.
    if (corriendo) return { ...base, start: startDe(nuevo), segAt: nuevo, pausedAccum: 0, pausedAt: undefined, segs: [] }
    return { ...base, start: m, pausedAccum: (s.pausedAccum || 0) + (viejo - nuevo) / 60000, segs: [] }
  }
  // Se atrasa: recorta los tramos al nuevo inicio y cuenta solo lo que queda.
  const recortados = segs.map(([a, b]) => [Math.max(a, nuevo), b] as [number, number]).filter(([a, b]) => b > a)
  const banked = sumMin(recortados)
  if (!corriendo) return { ...base, start: m, pausedAccum: banked, segs: recortados }
  const segAt = Math.min(ahora, Math.max(abierto, nuevo))
  return { ...base, start: startDe(segAt), segAt, pausedAccum: banked, pausedAt: undefined, segs: recortados }
}

/** "22:30" → 1350. */
export function parse(s: string): number {
  const p = String(s || '').split(':')
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)
}

/** Fecha local 'YYYY-MM-DD' (sin UTC, para no correr el día en la tarde/noche MX). */
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function defaults(): AppData {
  return {
    blocks: [
      { id: 'ex', name: 'Ejercicio', area: 'cuerpo', start: 1140, dur: 45 },
      { id: 'ce', name: 'Cena', area: 'cuerpo', start: 1200, dur: 45 },
      { id: 'tp', name: 'Tiempo personal', area: 'ocio', start: 1245, dur: 75 },
      { id: 'rc', name: 'Rutina de cierre', area: 'cierre', start: 1320, dur: 30 },
    ],
    bed: 1350,
    sleep: 480,
    session: null,
    // Historial VACÍO (no seed()): un dispositivo sin datos no debe mostrar ni poder subir días inventados.
    history: [],
    scheduled: [],
    focusGoal: 180,
  }
}

/** Semana de datos de ejemplo. Ya no la usa defaults(): no debe mezclarse con el historial real. */
export function seed(): HistoryRow[] {
  const out: HistoryRow[] = [], today = new Date()
  for (let i = 7; i >= 1; i--) {
    const d = new Date(today.getTime() - i * 86400000)
    const day = iso(d), dow = d.getDay()
    const work = dow === 0 || dow === 6 ? 120 : 420 + ((i * 37) % 5) * 30
    out.push({ date: day, name: 'Trabajo profundo', area: 'trabajo', start: 540, dur: work })
    if (i !== 4 && dow !== 0) out.push({ date: day, name: 'Ejercicio', area: 'cuerpo', start: 1140, dur: 45 })
    out.push({ date: day, name: 'Cena', area: 'cuerpo', start: 1200, dur: 45 })
    out.push({ date: day, name: 'Tiempo personal', area: 'ocio', start: 1245, dur: i === 4 ? 20 : 75 })
    if (dow === 6 || dow === 3) out.push({ date: day, name: 'Personas', area: 'personas', start: 1140, dur: 150 })
    out.push({ date: day, name: 'Dormir', area: 'sueno', start: 1350, dur: i === 4 ? 380 : 460 - ((i * 13) % 3) * 15 })
  }
  return out
}
