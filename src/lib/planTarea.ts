import type { EpicaTask } from './supabase'

/* Agendar tareas en el calendario del Roadmap: las MISMAS reglas que "planTaskToDay" / "removeFromPlan"
   de Épicas (plan, planOrder, prioridad por defecto, estado "En curso" al planear para hoy, sesiones por
   día y historial de reprogramaciones), pero como funciones PURAS que devuelven el parche a aplicar.
   Sin React ni red: las usa el Roadmap y sus pruebas. */

type Prio = 'alta' | 'media' | 'baja'

/** Un cambio a UNA tarea de UNA épica: lo que necesita el escritor por lotes del Roadmap. */
export type ParcheTarea = { epicaId: string; taskId: string; patch: Partial<EpicaTask> }

/** Separación entre posiciones de `planOrder` dentro de un día (1000, 2000, 3000…), igual que Épicas. */
export const PASO_PLAN = 1000

/** Estimado por dificultad cuando la tarea no trae uno propio (misma tabla que WEEK_EST_MIN de Épicas). */
export const estPorDificultad = (d?: string): number => (d === 'facil' ? 45 : d === 'media' ? 120 : d === 'dificil' ? 240 : 0)

/** Minutos de una tarea ESE día: el estimado de su sesión del día, si no el propio, si no el de su dificultad. */
export function estMinDia(t: EpicaTask, dia: string): number {
  const dp = (t.dayPlans || []).find(d => d.day === dia)
  if (dp && typeof dp.estMin === 'number' && dp.estMin > 0) return dp.estMin
  if (typeof t.estMin === 'number' && t.estMin > 0) return t.estMin
  return estPorDificultad(dp?.difficulty || t.difficulty)
}

/** Días en que la tarea aparece en el calendario: su `plan` (día primario) más sus sesiones (dayPlans).
 *  Una sesión pasada sólo cuenta si ya se trabajó/marcó (queda de registro); una pasada sin trabajar ya no
 *  la retiene (misma regla que `taskDays` en Épicas). */
export function diasDeTarea(t: EpicaTask, hoy: string): { plan: string; sesiones: string[] } {
  const plan = t.plan || ''
  const sesiones = (t.dayPlans || [])
    .filter(d => d.day && d.day !== plan && (d.day >= hoy || d.done || (t.progressLog || []).some(x => x.d === d.day)))
    .map(d => d.day)
  return { plan, sesiones }
}

/** Parche de ESTADO por el plan: planear para HOY pasa la tarea a "En curso" recordando el estado previo;
 *  planearla para otro día (o quitarla, dia = '') deshace ese forzado. Terminada/Esperando no se tocan. */
export function parcheEstadoPorPlan(t: EpicaTask, dia: string, hoy: string): Partial<EpicaTask> {
  if (t.status === 'Terminada' || t.status === 'Esperando') return {}
  if (dia && dia === hoy) {
    if (t.status === 'En curso') return {}
    return { planStatusPrev: t.planStatusPrev ?? t.status, status: 'En curso' }
  }
  const p: Partial<EpicaTask> = {}
  if (t.status === 'En curso' && t.planStatusPrev != null) p.status = t.planStatusPrev
  if (t.planStatusPrev !== undefined) p.planStatusPrev = undefined
  return p
}

export type AgendarOpts = {
  hoy: string
  /** planOrder que le toca en el día destino (ver `ubicarEnDia`). */
  planOrder: number
  /** Prioridad que se le pone si no tiene (en Épicas sale de la fecha de entrega). */
  prioPorDefecto: Prio
  /** Sólo si la columna plan_hist ya existe (gate): guardar el día que deja en `planHist`. */
  guardarHistorial: boolean
}

/** Parche que deja la tarea agendada en `dia`. Las claves con `undefined` son BORRADOS (viajan como null). */
export function parcheAgendar(t: EpicaTask, dia: string, o: AgendarOpts): Partial<EpicaTask> {
  const prev = t.plan || ''
  const p: Partial<EpicaTask> = { plan: dia, planOrder: o.planOrder }
  if (!t.priority) p.priority = o.prioPorDefecto
  // La sesión del día de origen se lleva a la tarea al destino: si no, un dayPlan pasado ya trabajado la seguiría anclando allá.
  if (prev && prev !== dia && t.dayPlans?.some(d => d.day === prev)) {
    const mover = !t.dayPlans.some(d => d.day === dia)
    p.dayPlans = (mover ? t.dayPlans.map(d => (d.day === prev ? { ...d, day: dia } : d)) : t.dayPlans.filter(d => d.day !== prev))
      .sort((a, b) => a.day.localeCompare(b.day))
  }
  Object.assign(p, parcheEstadoPorPlan(t, dia, o.hoy))
  if (o.guardarHistorial && prev && prev !== dia) p.planHist = [...(t.planHist || []).filter(d => d !== prev), prev].slice(-40)
  return p
}

/** Parche que quita la tarea del calendario. Conserva su prioridad (por si se vuelve a agendar). */
export function parcheQuitar(t: EpicaTask, o: { hoy: string; guardarHistorial: boolean }): Partial<EpicaTask> {
  const p: Partial<EpicaTask> = { plan: undefined, planOrder: undefined, ...parcheEstadoPorPlan(t, '', o.hoy) }
  if (o.guardarHistorial && t.plan) p.planHist = [...(t.planHist || []).filter(d => d !== t.plan), t.plan].slice(-40)
  return p
}

/** Lo que cambia en una tarea al aplicarle `parche`, para poder DESHACERLO: las mismas claves con el valor que tenían. */
export function parcheInverso(t: EpicaTask, parche: Partial<EpicaTask>): Partial<EpicaTask> {
  const inv: Record<string, unknown> = {}
  const src = t as unknown as Record<string, unknown>
  Object.keys(parche).forEach(k => { inv[k] = src[k] })
  return inv as Partial<EpicaTask>
}

/* ─── Orden dentro de un día ─────────────────────────────────────────────── */
export type EntradaDia = { key: string; planOrder?: number }

/** Orden de un día: por `planOrder` (las que no tienen, al final), respetando el orden en que vienen en el empate. */
export function ordenarDia<T extends { planOrder?: number }>(lista: T[]): T[] {
  return lista.map((x, i) => ({ x, i })).sort((a, b) => ((a.x.planOrder ?? 1e9) - (b.x.planOrder ?? 1e9)) || (a.i - b.i)).map(v => v.x)
}

/** `planOrder` que le toca a `mover` al soltarlo ANTES de `antesDe` (null = al final) entre las tareas ABIERTAS
 *  de ese día de TODAS las épicas (`dia`, en su orden). Intenta el punto medio entre sus vecinas (así sólo se
 *  escribe UNA tarea); si no hay hueco entero o una vecina no tiene número, renumera el día (1000, 2000…).
 *  Devuelve sólo lo que cambia (incluida `mover`); vacío = quedó exactamente donde estaba. */
export function ubicarEnDia(dia: EntradaDia[], mover: string, antesDe: string | null): Map<string, number> {
  const original = dia.map(x => x.key)
  const sin = dia.filter(x => x.key !== mover)
  let pos = antesDe == null ? sin.length : sin.findIndex(x => x.key === antesDe)
  if (pos < 0) pos = sin.length
  const final = sin.slice(0, pos).map(x => x.key).concat(mover, sin.slice(pos).map(x => x.key))
  const orig = dia.find(x => x.key === mover)
  if (orig && original.length === final.length && original.every((k, i) => k === final[i])) return new Map()
  const prev = sin[pos - 1], next = sin[pos]
  const numerico = (x?: EntradaDia) => !x || typeof x.planOrder === 'number'
  if (numerico(prev) && numerico(next)) {
    const lo = prev ? prev.planOrder! : 0
    const cand = next ? Math.floor((lo + next.planOrder!) / 2) : lo + PASO_PLAN
    if (!next || (cand > lo && cand < next.planOrder!)) return new Map([[mover, cand]])
  }
  const out = new Map<string, number>()
  const actual = new Map(dia.map(x => [x.key, x.planOrder]))
  final.forEach((k, i) => { const o = (i + 1) * PASO_PLAN; if (k === mover || actual.get(k) !== o) out.set(k, o) })
  return out
}

/* ─── Orden por prioridad / entrega ──────────────────────────────────────── */
/** Cómo se ordena lo que se ve: `manual` = el orden que fijaste (planOrder / orden); `prioridad` = alta → baja;
 *  `entrega` = la fecha de vencimiento más cercana primero. */
export type ModoOrden = 'manual' | 'prioridad' | 'entrega'

/** alta 0 · media 1 (también la que no tiene prioridad) · baja 2. */
export const rangoPrio = (p?: string): number => (p === 'alta' ? 0 : p === 'baja' ? 2 : 1)

/** Comparador de tareas por modo. En `manual` devuelve 0: el `sort` (estable) deja el orden en que vienen.
 *  Prioridad desempata por entrega; entrega, por prioridad. Sin fecha de entrega va al final. */
export function compararPorModo(a: EpicaTask, b: EpicaTask, modo: ModoOrden): number {
  if (modo === 'manual') return 0
  const due = (t: EpicaTask) => t.due || '9999-12-31'
  const porPrio = rangoPrio(a.priority) - rangoPrio(b.priority)
  const porDue = due(a).localeCompare(due(b))
  return modo === 'prioridad' ? (porPrio || porDue) : (porDue || porPrio)
}

/** Siguiente prioridad al tocar el medidor: alta → media → baja → alta. */
export const siguientePrio = (p?: string): Prio => (p === 'alta' ? 'media' : p === 'baja' ? 'alta' : 'baja')

/** FIJA el orden de un día: `dia` = TODAS las abiertas de ese día (de todas las épicas) en su orden actual y
 *  `nuevo` = las que se ven (un subconjunto) en el orden deseado. Los lugares que el subconjunto ocupaba se
 *  reparten entre sus miembros —las que el filtro esconde no se mueven— y se renumera el día (1000, 2000…).
 *  Devuelve sólo lo que cambia; vacío = ya estaba así. */
export function reordenarDia(dia: EntradaDia[], nuevo: string[]): Map<string, number> {
  const keys = dia.map(x => x.key)
  const enSub = new Set(nuevo.filter(k => keys.includes(k)))
  const posiciones = keys.map((k, i) => (enSub.has(k) ? i : -1)).filter(i => i >= 0)
  const secuencia = nuevo.filter(k => enSub.has(k)).filter((k, i, a) => a.indexOf(k) === i)
  if (secuencia.length !== posiciones.length) return new Map()
  const final = keys.slice()
  posiciones.forEach((pos, i) => { final[pos] = secuencia[i] })
  const actual = new Map(dia.map(x => [x.key, x.planOrder]))
  const out = new Map<string, number>()
  final.forEach((k, i) => { const o = (i + 1) * PASO_PLAN; if (actual.get(k) !== o) out.set(k, o) })
  return out
}
