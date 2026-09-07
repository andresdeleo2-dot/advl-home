/* Iniciativas: tabla nueva desde sql/epicas-20-iniciativas.sql (Feature → Iniciativa → Tarea).
 * Traducción fila ↔ Iniciativa, mismo patrón que src/lib/tareas.ts. */

import type { Iniciativa } from './supabase'

export type IniciativaRow = {
  id: string
  feature_id: string
  epica_id: string
  nombre: string
  descripcion: string | null
  estado: string
  fecha_inicio: string | null
  fecha_fin_objetivo: string | null
  responsable: string | null
  orden: number | null
  bloqueada_por: string | null
}

export function rowToIniciativa(r: IniciativaRow): Iniciativa {
  return {
    id: r.id,
    featureId: r.feature_id,
    epicaId: r.epica_id,
    nombre: r.nombre || '',
    descripcion: r.descripcion || undefined,
    estado: (r.estado as Iniciativa['estado']) || 'pendiente',
    fechaInicio: r.fecha_inicio || undefined,
    fechaFinObjetivo: r.fecha_fin_objetivo || undefined,
    responsable: r.responsable || undefined,
    orden: typeof r.orden === 'number' ? r.orden : undefined,
    bloqueadaPor: r.bloqueada_por || undefined,
  }
}
