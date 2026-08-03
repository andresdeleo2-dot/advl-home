/* Sección "Tiempo" (estilo Margen): actividades personales que se acomodan en el
   día y en la semana. Todo el tiempo se maneja como MINUTOS DESDE MEDIANOCHE
   (0–1439) + una fecha 'YYYY-MM-DD' local. Nada de UTC para la aritmética del día. */

export type Actividad = {
  id: string
  titulo: string
  area: AreaId
  fecha: string          // 'YYYY-MM-DD' local
  inicio: number | null  // minutos desde medianoche; null = sin agendar (en el "por acomodar")
  dur: number            // minutos
  nota: string | null
  hecho: boolean
  orden: number | null
}

export type AreaId = 'trabajo' | 'cuerpo' | 'ocio' | 'personas' | 'cierre' | 'sueno'

/* Áreas y su color (tomadas del sistema de diseño de Margen). */
export const AREAS: Record<AreaId, { label: string; color: string; soft: string }> = {
  trabajo:  { label: 'Trabajo',        color: '#b4653a', soft: '#f4e6db' },
  cuerpo:   { label: 'Cuerpo',         color: '#6f8256', soft: '#e7ecdd' },
  ocio:     { label: 'Ocio y descanso', color: '#c99a6f', soft: '#f2e7da' },
  personas: { label: 'Personas',       color: '#8b8379', soft: '#eae5dd' },
  cierre:   { label: 'Cierre del día',  color: '#a49b90', soft: '#ece7df' },
  sueno:    { label: 'Sueño',          color: '#1c1a17', soft: '#e0ddd6' },
}
export const AREA_IDS = Object.keys(AREAS) as AreaId[]
export function areaOf(id: string) { return AREAS[(id as AreaId)] ?? AREAS.ocio }

/* ── Formateadores de tiempo ─────────────────────────────────────────────── */

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

/** "22:30" → 1350. */
export function parseClock(s: string): number {
  const p = String(s || '').split(':')
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)
}

/* ── Fechas locales (sin UTC) ────────────────────────────────────────────── */

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return todayISO(dt)
}
/** Lunes de la semana que contiene `iso` (semana L→D). */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = (dt.getDay() + 6) % 7 // 0 = lunes
  return addDays(iso, -dow)
}
/** Los 7 ISO de la semana (L→D) que contiene `iso`. */
export function weekDays(iso: string): string[] {
  const mon = mondayOf(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DOW_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function dowShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return DOW_SHORT[new Date(y, m - 1, d).getDay()]
}
/** "lunes 3 de agosto" */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DOW_LONG[dt.getDay()]} ${d} de ${MONTHS[m - 1]}`
}
/** "L 3", "M 4"… para las cabeceras de la semana. */
export function shortLabel(iso: string): string {
  return `${dowShort(iso)} ${Number(iso.slice(8))}`
}

/** minutos "ahora" con decimales (para la línea de tiempo actual). */
export function nowMinutes(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/** Rango de horas [inicioH, finH] que cubre el timeline: 6→24 por defecto,
 *  ampliado para incluir cualquier actividad fuera de ese rango. */
export function hourRange(acts: Actividad[]): [number, number] {
  let lo = 6 * 60, hi = 24 * 60
  for (const a of acts) {
    if (a.inicio == null) continue
    lo = Math.min(lo, a.inicio)
    hi = Math.max(hi, a.inicio + a.dur)
  }
  return [Math.floor(lo / 60) * 60, Math.min(1440, Math.ceil(hi / 60) * 60)]
}
