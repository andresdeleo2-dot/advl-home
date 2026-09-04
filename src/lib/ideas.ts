/* Sección "Ideas": captura rápida sin estructura. Ver sql/ideas.sql + sql/ideas-02-links-comentarios.sql. */

import type { EpicaTaskLink, EpicaTaskComment } from './supabase'

export type Idea = {
  id: string
  texto: string
  creada: string          // ISO datetime
  tareaId?: string        // si se convirtió: la tarea creada
  epicaId?: string        // épica — etiqueta (independiente de convertir); si ya se convirtió, es la de esa tarea
  featureId?: string      // feature dentro de esa épica — mismo criterio
  links: EpicaTaskLink[]  // mismo tipo que las tareas: reusa el componente TaskLinks tal cual
  comentarios: EpicaTaskComment[]
  descartada: boolean
}

export type IdeaRow = {
  id: string
  texto: string
  creada: string
  tarea_id: string | null
  epica_id: string | null
  feature_id?: string | null
  links?: unknown[] | null
  comentarios?: unknown[] | null
  descartada: boolean
}

export function rowToIdea(r: IdeaRow): Idea {
  const idea: Idea = { id: r.id, texto: r.texto, creada: r.creada, descartada: !!r.descartada, links: (r.links as EpicaTaskLink[]) || [], comentarios: (r.comentarios as EpicaTaskComment[]) || [] }
  if (r.tarea_id) idea.tareaId = r.tarea_id
  if (r.epica_id) idea.epicaId = r.epica_id
  if (r.feature_id) idea.featureId = r.feature_id
  return idea
}
