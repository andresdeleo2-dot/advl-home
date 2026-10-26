import type { Epica, EpicaTask } from './supabase'
import { enOrden, PASO_ORDEN } from './ordenTareas'

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

/** Lo que hay que escribir al MOVER una tarea a otra épica.
 *  El Feature y la Iniciativa son de la épica vieja: no existen en la nueva y se limpian (mismo criterio que
 *  Épicas). La tarea entra AL FINAL del orden de la épica destino; si ahí hay tareas sin numerar, se numera
 *  la épica entera (10, 20, 30…) y `renumeradas` trae sólo las que cambian. Con `restaurar` (deshacer) la
 *  tarea vuelve con los valores que tenía. */
export function planMoverTarea(
  destino: Epica, tarea: EpicaTask,
  o: { ordenReady: boolean; restaurar?: Pick<EpicaTask, 'featureId' | 'iniciativaId' | 'orden'> },
): { movida: EpicaTask; renumeradas: Map<string, number> } {
  const movida: EpicaTask = { ...tarea }
  if (o.restaurar) {
    if ('featureId' in o.restaurar) movida.featureId = o.restaurar.featureId || ''
    if ('iniciativaId' in o.restaurar) movida.iniciativaId = o.restaurar.iniciativaId || ''
  } else {
    if (movida.featureId) movida.featureId = ''
    if (movida.iniciativaId) movida.iniciativaId = ''
  }
  const renumeradas = new Map<string, number>()
  if (!o.ordenReady) return { movida, renumeradas }
  if (o.restaurar && typeof o.restaurar.orden === 'number') { movida.orden = o.restaurar.orden; return { movida, renumeradas } }
  const base = destino.tasks || []
  if (base.every(t => typeof t.orden === 'number')) {
    movida.orden = base.reduce((m, t) => Math.max(m, t.orden as number), -PASO_ORDEN) + PASO_ORDEN
    return { movida, renumeradas }
  }
  // Hay tareas sin numerar: ordenarían DESPUÉS de las numeradas y la movida quedaría en medio. Se numera todo.
  const sinOrden: EpicaTask = { ...movida }; delete sinOrden.orden
  const todas = enOrden([...base, sinOrden])
  todas.forEach((t, k) => {
    const n = k * PASO_ORDEN
    if (t.id === movida.id) movida.orden = n
    else if (t.orden !== n && t.id) renumeradas.set(t.id, n)
  })
  return { movida, renumeradas }
}
