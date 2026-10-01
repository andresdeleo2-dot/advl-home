/* Features: tabla propia desde sql/epicas-18-features.sql (antes vivían en epicas.features,
 * jsonb). Traducción fila ↔ EpicaFeature, mismo patrón que src/lib/tareas.ts. */

import type { EpicaFeature, EpicaLink } from './supabase'

export type FeatureRow = {
  id: string
  epica_id: string
  t: string
  color: string | null
  estado: string
  fecha_inicio: string | null
  fecha_fin_objetivo: string | null
  orden: number | null
  links?: unknown   // jsonb; ausente hasta correr sql/epicas-25-feature-links.sql
}

const LINK_TYPES = ['Dashboard', 'Supabase', 'Excel', 'Drive', 'Otro']
export const MAX_FEATURE_LINKS = 12

/** Solo http(s), con tope de cantidad y largo: lo que entra aquí se pinta como <a href> en la app. */
export function sanitizeFeatureLinks(v: unknown): EpicaLink[] {
  if (!Array.isArray(v)) return []
  const out: EpicaLink[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const url = String(o.url ?? '').trim().slice(0, 2000)
    if (!/^https?:\/\//i.test(url)) continue
    const type = LINK_TYPES.includes(String(o.type)) ? String(o.type) : 'Otro'
    out.push({ l: String(o.l ?? '').trim().slice(0, 80), url, type })
    if (out.length >= MAX_FEATURE_LINKS) break
  }
  return out
}

export function rowToFeature(r: FeatureRow): EpicaFeature {
  const f: EpicaFeature = { id: r.id, t: r.t || '' }
  if (r.color) f.color = r.color
  if (r.estado) f.estado = r.estado
  if (r.fecha_inicio) f.roadmapStart = r.fecha_inicio
  if (r.fecha_fin_objetivo) f.roadmapEnd = r.fecha_fin_objetivo
  if (typeof r.orden === 'number') f.orden = r.orden
  const links = sanitizeFeatureLinks(r.links)
  if (links.length) f.links = links
  return f
}
