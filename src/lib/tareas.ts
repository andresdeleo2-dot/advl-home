import type { EpicaTask } from './supabase'

/* Traducción entre la fila de la tabla `tareas` (columnas reales) y la forma
   que usa la UI (EpicaTask). La UI no cambia: sigue viendo epica.tasks[]. */

export type TareaRow = {
  id: string
  epica_id: string
  user_id: string | null
  titulo: string
  estado: string
  prioridad: string | null
  dificultad: string | null
  nota: string | null
  avance: number | null
  plan: string | null
  plan_order: number | null
  orden?: number | null
  vence: string | null
  done_at: string | null
  creada: string | null
  plan_prev: string | null
  plan_status_prev: string | null
  repeat_every: number | null
  repeat_unit: string | null
  repeat_until: string | null
  repeat_done: string[] | null
  subtasks: unknown[] | null
  links: unknown[] | null
  progress_log: unknown[] | null
}

/** Fila → tarea de la UI. Los nulos vuelven a ser `undefined` (o '' donde el
 *  tipo lo exige), para que las comprobaciones tipo `if (!t.plan)` sigan igual. */
export function rowToTask(r: TareaRow): EpicaTask {
  const t: EpicaTask = {
    id: r.id,
    t: r.titulo || '',
    status: r.estado || 'Por hacer',
    due: r.vence || '',
    note: r.nota || '',
    links: (r.links as EpicaTask['links']) || [],
  }
  if (r.prioridad) t.priority = r.prioridad as EpicaTask['priority']
  if (r.dificultad) t.difficulty = r.dificultad as EpicaTask['difficulty']
  if (typeof r.avance === 'number') t.progress = r.avance
  if (r.plan) t.plan = r.plan
  if (typeof r.plan_order === 'number') t.planOrder = r.plan_order
  if (typeof r.orden === 'number') t.orden = r.orden
  if (r.done_at) t.doneAt = r.done_at
  if (r.creada) t.createdAt = r.creada
  if (r.plan_prev) t.planPrev = r.plan_prev
  if (r.plan_status_prev) t.planStatusPrev = r.plan_status_prev
  if (r.repeat_every && r.repeat_unit) t.repeat = { every: r.repeat_every, unit: r.repeat_unit as 'dia' | 'semana' | 'mes' }
  if (r.repeat_until) t.repeatUntil = r.repeat_until
  if (r.repeat_done?.length) t.repeatDone = r.repeat_done
  if (r.subtasks?.length) t.subtasks = r.subtasks as EpicaTask['subtasks']
  if (r.progress_log?.length) t.progressLog = r.progress_log as EpicaTask['progressLog']
  return t
}

const dateOrNull = (v?: string) => (v && v.trim() ? v.trim() : null)

/** Tarea de la UI → fila para insertar/actualizar. */
export function taskToRow(t: EpicaTask, epicaId: string): Record<string, unknown> {
  return {
    // `orden` sólo viaja si la tarea lo tiene: así, mientras no se corra
    // sql/epicas-04-orden-tareas.sql, las escrituras normales siguen pasando.
    ...(typeof t.orden === 'number' ? { orden: t.orden } : {}),
    id: t.id,
    epica_id: epicaId,
    titulo: t.t || '',
    estado: t.status || 'Por hacer',
    prioridad: t.priority ?? null,
    dificultad: t.difficulty ?? null,
    nota: t.note ?? null,
    avance: typeof t.progress === 'number' ? t.progress : null,
    plan: dateOrNull(t.plan),
    plan_order: typeof t.planOrder === 'number' ? t.planOrder : null,
    vence: dateOrNull(t.due),
    done_at: dateOrNull(t.doneAt),
    creada: dateOrNull(t.createdAt),
    plan_prev: t.planPrev ?? null,
    plan_status_prev: t.planStatusPrev ?? null,
    repeat_every: t.repeat?.every ?? null,
    repeat_unit: t.repeat?.unit ?? null,
    repeat_until: dateOrNull(t.repeatUntil),
    repeat_done: t.repeatDone ?? [],
    subtasks: t.subtasks ?? [],
    links: t.links ?? [],
    progress_log: t.progressLog ?? [],
  }
}

/** ¿Cambió algo entre dos versiones de la misma tarea? (para no escribir de más) */
export function sameTask(a: EpicaTask, b: EpicaTask): boolean {
  return JSON.stringify(taskToRow(a, '')) === JSON.stringify(taskToRow(b, ''))
}
