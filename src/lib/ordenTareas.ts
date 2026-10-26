import type { EpicaTask } from './supabase'

/* Orden manual de las tareas DENTRO de una épica ("cuál va primero") — columna `tareas.orden`
   (sql/epicas-04-orden-tareas.sql), la MISMA que usa "Orden manual" en Épicas. Funciones puras:
   las comparten el Roadmap y sus pruebas, y no tocan estado ni red. */

/** Separación entre posiciones al renumerar (10, 20, 30…), igual que Épicas. */
export const PASO_ORDEN = 10

/** Tareas de la épica en su orden actual: `orden` ascendente; las que aún no tienen (null) van al final,
 *  conservando el orden en que vienen (el API ya las manda por orden → fecha de creación). */
export function enOrden(tareas: EpicaTask[]): EpicaTask[] {
  return tareas
    .map((t, i) => ({ t, i }))
    .sort((a, b) => ((a.t.orden ?? 1e9) - (b.t.orden ?? 1e9)) || (a.i - b.i))
    .map(x => x.t)
}

/** Mueve el elemento en `desde` a la posición `hacia` (índices de la lista ya sin él). Devuelve una copia. */
export function mover<T>(lista: T[], desde: number, hacia: number): T[] {
  if (desde < 0 || desde >= lista.length) return lista.slice()
  const out = lista.slice()
  const [m] = out.splice(desde, 1)
  out.splice(Math.max(0, Math.min(hacia, out.length)), 0, m)
  return out
}

/** Reordena un SUBCONJUNTO de las tareas de la épica (p. ej. las de un feature o de una iniciativa) sin
 *  mover a las demás: las posiciones que el subconjunto ya ocupaba en el orden de la épica se reparten
 *  entre sus miembros según `nuevo` (ids en el orden deseado). Después se renumera la épica entera
 *  (10, 20, 30…) y se devuelve SÓLO lo que cambia: id → orden nuevo.
 *  Por eso reordenar "las de ERP" jamás cambia el lugar relativo de las de otro feature, aunque estén
 *  intercaladas. Los ids de `nuevo` que no existan en la épica se ignoran. */
export function reordenarSubconjunto(tareas: EpicaTask[], nuevo: string[]): Map<string, number> {
  const todas = enOrden(tareas)
  const ids = todas.map(t => t.id).filter((x): x is string => !!x)
  const enSub = new Set(nuevo.filter(id => ids.includes(id)))
  const posiciones = ids.map((id, i) => (enSub.has(id) ? i : -1)).filter(i => i >= 0)
  const secuencia = nuevo.filter(id => enSub.has(id)).filter((id, i, a) => a.indexOf(id) === i)
  // Si `nuevo` no cubre a todo el subconjunto detectado (ids repetidos), no se arriesga a perder tareas.
  if (secuencia.length !== posiciones.length) return new Map()
  const final = ids.slice()
  posiciones.forEach((pos, k) => { final[pos] = secuencia[k] })
  const actual = new Map(todas.map(t => [t.id, t.orden]))
  const cambios = new Map<string, number>()
  final.forEach((id, k) => { const o = k * PASO_ORDEN; if (actual.get(id) !== o) cambios.set(id, o) })
  return cambios
}

/** `orden` de una tarea NUEVA para que quede al final de la épica. Las tareas sin `orden` se ordenan
 *  DESPUÉS de las que sí lo tienen, así que numerar a la nueva mientras queden sin numerar la dejaría
 *  delante de ellas: en ese caso devuelve undefined (sin `orden` entra al final por fecha de creación,
 *  y el primer reordenamiento numera a todas). */
export function ordenAlFinal(tareas: EpicaTask[]): number | undefined {
  if (tareas.some(t => typeof t.orden !== 'number')) return undefined
  return tareas.reduce((m, t) => Math.max(m, t.orden as number), -PASO_ORDEN) + PASO_ORDEN
}
