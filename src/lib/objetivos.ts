/* Objetivos: tabla propia desde sql/epicas-19-objetivos.sql (antes epicas.kpis y
 * epicas.features[].kpis, ambos jsonb con el shape EpicaMilestone). Un objetivo pertenece a UNA
 * épica O a UN feature (nunca ambos). Traducción fila ↔ EpicaMilestone, mismo patrón que
 * src/lib/tareas.ts. */

import type { EpicaMilestone, ObjetivoUnit } from './supabase'

export type ObjetivoRow = {
  id: string
  epica_id: string | null
  feature_id: string | null
  tipo: string
  t: string
  target: number | null
  current: number | null
  unidad: string | null
  unidad_libre: string | null
  fecha_objetivo: string | null
  medir_con_tareas_cerradas: boolean
  menos_es_mejor: boolean
  valor_inicio: number | null
  task_ids: string[] | null
  hito_estado: string | null
  fecha_logrado: string | null
  cumplido: boolean
  cumplido_at: string | null
  orden: number | null
}

export function rowToObjetivo(r: ObjetivoRow): EpicaMilestone {
  const m: EpicaMilestone = { id: r.id, t: r.t || '' }
  if (r.tipo === 'hito') m.tipo = 'hito'   // ausente = 'metrica' (default del cliente)
  if (typeof r.target === 'number') m.target = r.target
  if (typeof r.current === 'number') m.current = r.current
  if (r.unidad) m.unit = r.unidad as ObjetivoUnit
  if (r.unidad_libre) m.unitLabel = r.unidad_libre
  if (r.fecha_objetivo) m.due = r.fecha_objetivo
  if (r.cumplido) m.done = true
  if (r.cumplido_at) m.doneAt = r.cumplido_at
  if (r.medir_con_tareas_cerradas) m.auto = 'tareas'
  if (r.menos_es_mejor) m.lowerIsBetter = true
  if (typeof r.valor_inicio === 'number') m.start = r.valor_inicio
  if (r.task_ids?.length) m.taskIds = r.task_ids
  if (r.hito_estado) m.hitoEstado = r.hito_estado as EpicaMilestone['hitoEstado']
  if (r.fecha_logrado) m.fechaLogrado = r.fecha_logrado
  return m
}
