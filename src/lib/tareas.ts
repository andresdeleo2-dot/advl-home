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
  resumen?: string | null
  est_min?: number | null
  day_plans?: unknown[] | null
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
  plan_hist?: string[] | null
  remind_at?: string | null
  comentarios?: unknown[] | null
  waiting_for?: string | null
  updated_at?: string | null
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
  if (r.resumen) t.resumen = r.resumen
  if (typeof r.est_min === 'number') t.estMin = r.est_min
  if (r.day_plans?.length) t.dayPlans = r.day_plans as EpicaTask['dayPlans']
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
  if (r.plan_hist?.length) t.planHist = r.plan_hist as string[]
  if (r.remind_at) t.remindAt = r.remind_at
  if (r.comentarios?.length) t.comentarios = r.comentarios as EpicaTask['comentarios']
  if (r.waiting_for) t.waitingFor = r.waiting_for
  if (r.updated_at) t.updatedAt = r.updated_at
  return t
}

const dateOrNull = (v?: string) => (v && v.trim() ? v.trim() : null)

/** Tarea de la UI → fila para insertar/actualizar. */
export function taskToRow(t: EpicaTask, epicaId: string): Record<string, unknown> {
  return {
    // `orden` sólo viaja si la tarea lo tiene: así, mientras no se corra
    // sql/epicas-04-orden-tareas.sql, las escrituras normales siguen pasando.
    ...(typeof t.orden === 'number' ? { orden: t.orden } : {}),
    // plan_hist sólo viaja si la tarea lo tiene: así, antes de correr la migración
    // (o si nunca se movió), las escrituras normales siguen pasando sin la columna.
    ...(Array.isArray(t.planHist) && t.planHist.length ? { plan_hist: t.planHist } : {}),
    // remind_at viaja sólo si la tarea tiene la propiedad (así se puede LIMPIAR con null);
    // el cliente sólo la fija cuando la columna existe (gate remindReady) → seguro sin migrar.
    ...('remindAt' in t ? { remind_at: (t.remindAt || null) } : {}),
    // comentarios: viaja si la tarea tiene la propiedad (permite vaciar con []); el
    // cliente sólo la fija cuando la columna existe (gate) → seguro sin migrar.
    ...('comentarios' in t ? { comentarios: (t.comentarios || []) } : {}),
    // resumen: viaja sólo si la tarea tiene la propiedad (así se puede LIMPIAR con null);
    // el cliente sólo la fija cuando la columna existe (gate resumenReady) → seguro sin migrar.
    ...('resumen' in t ? { resumen: (t.resumen || null) } : {}),
    // est_min: viaja sólo si la tarea tiene la propiedad (permite LIMPIAR con null); el cliente
    // sólo la fija cuando la columna existe (gate estMinReady) → seguro sin migrar.
    ...('estMin' in t ? { est_min: (typeof t.estMin === 'number' ? t.estMin : null) } : {}),
    // day_plans: viaja sólo si la tarea tiene la propiedad; el cliente sólo la fija cuando la
    // columna existe (gate dayPlansReady) → seguro sin migrar.
    ...('dayPlans' in t ? { day_plans: (t.dayPlans || []) } : {}),
    // waiting_for: "qué esperas" (email/respuesta/comentario/otro) para las tareas "En espera".
    // Viaja sólo si la tarea tiene la propiedad (permite LIMPIAR con null); el cliente sólo la fija
    // cuando la columna existe (gate waitingReady) → seguro sin migrar.
    ...('waitingFor' in t ? { waiting_for: (t.waitingFor || null) } : {}),
    id: t.id,
    epica_id: epicaId,
    titulo: t.t || '',
    estado: t.status || 'Por hacer',
    prioridad: t.priority ?? null,
    dificultad: t.difficulty ?? null,
    nota: t.note ?? null,
    // Clamp 0-100: la columna tiene CHECK; un valor fuera de rango abortaba TODO el sync.
    avance: typeof t.progress === 'number' ? Math.max(0, Math.min(100, Math.round(t.progress))) : null,
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
