import type { Epica, EpicaTask } from './supabase'

/* Un mismo orden en todas las listas de tareas: el del Roadmap ("Prioridad"), que vive en `tareas.orden` (por
   épica). Estas piezas lo llevan a las listas que mezclan épicas (Backlog, Detalle, Enfoque, Panel) y a la
   ubicación Épica › Feature › Iniciativa de una tarea. Todo puro: sin React ni red. */

type Fila = { e: Epica; t: EpicaTask; i?: number }

/** ¿La iniciativa cuelga de ESE feature de la épica? La cascada es Épica → Feature → Iniciativa → Tarea: una
 *  iniciativa de otro feature (o sin feature) no es una ubicación válida. */
export const iniEsDelFeature = (e: Epica | undefined, featureId?: string | null, iniId?: string | null): boolean =>
  !!iniId && !!featureId && !!(e?.features || []).find(f => f.id === featureId)?.iniciativas?.some(i => i.id === iniId)

/** Lugar de la tarea dentro de su épica cuando `orden` empata o falta: el que trae en `e.tasks`. */
const lugar = (x: Fila): number => (typeof x.i === 'number' ? x.i : x.e.tasks.indexOf(x.t))

/** Orden del Roadmap entre épicas: la épica (su orden en pantalla) y, dentro de ella, `orden` (las que aún no
 *  lo tienen, al final, como en la lista de Prioridad). */
export function cmpRoadmap(a: Fila, b: Fila): number {
  if (a.e.id !== b.e.id) return ((a.e.epic_order ?? 0) - (b.e.epic_order ?? 0)) || a.e.name.localeCompare(b.e.name, 'es')
  return ((a.t.orden ?? 1e9) - (b.t.orden ?? 1e9)) || (lugar(a) - lugar(b))
}

/** Posición de la tarea en la estructura de su épica: [feature, iniciativa] según el orden en que están
 *  definidos. Sin feature (o con uno que ya no existe) va al final; sin iniciativa, al final de su feature. */
function posicion(e: Epica, t: EpicaTask): [number, number] {
  const feats = e.features || []
  const f = t.featureId ? feats.findIndex(x => x.id === t.featureId) : -1
  if (f < 0) return [1e9, 1e9]
  const inis = feats[f].iniciativas || []
  const k = t.iniciativaId ? inis.findIndex(x => x.id === t.iniciativaId) : -1
  return [f, k < 0 ? 1e9 : k]
}

/** Agrupa por estructura: épica → feature → iniciativa y, dentro de cada una, el orden del Roadmap. */
export function cmpFeature(a: Fila, b: Fila): number {
  if (a.e.id !== b.e.id) return cmpRoadmap(a, b)
  const [fa, ia] = posicion(a.e, a.t), [fb, ib] = posicion(b.e, b.t)
  return (fa - fb) || (ia - ib) || cmpRoadmap(a, b)
}

/** Orden de las tareas de UNA épica al soltar una tarjeta del tablero en un lugar de una columna.
 *  `columna` = las tarjetas que se ven en esa columna, en su orden; `mover` = la que se suelta (puede venir de
 *  otra columna); `idx` = cuántas tarjetas de SU MISMA épica (sin contar la suelta) quedan arriba de ella.
 *  Las tarjetas de otras épicas no cuentan: la épica ya fija su lugar en la columna. Devuelve los ids de las
 *  tarjetas de esa épica en el orden nuevo, listos para `reordenarSubconjunto`. */
export function ordenAlSoltar(columna: { eId: string; id: string }[], mover: { eId: string; id: string }, idx: number): string[] {
  const grupo = columna.filter(c => c.eId === mover.eId && c.id !== mover.id).map(c => c.id)
  const k = Math.max(0, Math.min(Number.isFinite(idx) ? Math.floor(idx) : grupo.length, grupo.length))
  return [...grupo.slice(0, k), mover.id, ...grupo.slice(k)]
}
