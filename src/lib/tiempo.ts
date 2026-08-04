/* Dominio de "Margen" (sección /tiempo). Portado fiel del prototipo del handoff.
   Todo el tiempo son MINUTOS DESDE MEDIANOCHE (0–1439) + fecha 'YYYY-MM-DD' local.
   El registro sólo existe para alimentar los patrones semanales. */

export type Area = 'trabajo' | 'cuerpo' | 'ocio' | 'personas' | 'cierre' | 'sueno'

/** Bloque protegido. `days` = 7 booleanos indexados por getDay() (0=Dom…6=Sáb);
 *  ausente = aplica TODOS los días. */
export type Block = { id: string; name: string; area: Area; start: number; dur: number; days?: boolean[] }
/** Sesión en curso. Si viene de una tarea de Épicas, guarda epicaId/taskId para
 *  marcarla como Terminada al cerrar el bloque. */
export type Session = { name: string; area: Area; start: number; dur: number; epicaId?: string; taskId?: string } | null
export type HistoryRow = { date: string; name: string; area: Area; start: number; dur: number; epicaId?: string; taskId?: string; done?: boolean }

/** Tarea de Épicas (o actividad libre) agendada para HOY a una hora concreta. Al llegar
 *  la hora, la app pregunta si la quieres iniciar. Vive sólo en el estado de Tiempo. */
export type ScheduledBlock = { id: string; name: string; area: Area; start: number; dur: number; epicaId?: string; taskId?: string }

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
}

export const KEY = 'margen.v1'

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
    history: seed(),
    scheduled: [],
  }
}

/** Semana de datos sembrados, para que Historial no arranque vacío. */
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
