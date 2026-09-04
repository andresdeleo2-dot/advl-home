/* Sección "Ideas": captura rápida sin estructura. Ver sql/ideas.sql. */

export type Idea = {
  id: string
  texto: string
  creada: string          // ISO datetime
  tareaId?: string        // si se convirtió: la tarea creada
  epicaId?: string        // épica de esa tarea (denormalizado, para el link de vuelta sin otro fetch)
  descartada: boolean
}

export type IdeaRow = {
  id: string
  texto: string
  creada: string
  tarea_id: string | null
  epica_id: string | null
  descartada: boolean
}

export function rowToIdea(r: IdeaRow): Idea {
  const idea: Idea = { id: r.id, texto: r.texto, creada: r.creada, descartada: !!r.descartada }
  if (r.tarea_id) idea.tareaId = r.tarea_id
  if (r.epica_id) idea.epicaId = r.epica_id
  return idea
}
