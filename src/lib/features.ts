/* Features: tabla propia desde sql/epicas-18-features.sql (antes vivían en epicas.features,
 * jsonb). Traducción fila ↔ EpicaFeature, mismo patrón que src/lib/tareas.ts. */

import type { EpicaFeature } from './supabase'

export type FeatureRow = {
  id: string
  epica_id: string
  t: string
  color: string | null
  estado: string
  fecha_inicio: string | null
  fecha_fin_objetivo: string | null
  orden: number | null
}

export function rowToFeature(r: FeatureRow): EpicaFeature {
  const f: EpicaFeature = { id: r.id, t: r.t || '' }
  if (r.color) f.color = r.color
  if (r.estado) f.estado = r.estado
  if (r.fecha_inicio) f.roadmapStart = r.fecha_inicio
  if (r.fecha_fin_objetivo) f.roadmapEnd = r.fecha_fin_objetivo
  if (typeof r.orden === 'number') f.orden = r.orden
  return f
}
