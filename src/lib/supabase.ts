import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_KEY!

export const supabase = createClient(url, key)

export type Item = {
  id: string
  title: string
  url: string
  url2?: string | null
  url3?: string | null
  section: string
  subcategory?: string | null
  item_order: number
  section_order: number
  fav_order?: number | null   // orden dentro de la barra de favoritos (independiente del catálogo)
  featured: boolean
  description?: string | null
  image?: string | null
  badge?: string | null
  accent: string
  keywords?: string[] | null
}

// ─── Épicas (grandes frentes) ────────────────────────────────
/** Objetivo medible de una épica (reemplaza a los KPIs de texto libre).
 *  Se guarda en la columna `kpis` (jsonb) por compatibilidad; el nombre de la
 *  columna es lo único que quedó del modelo anterior. */
export type EpicaMilestone = {
  id: string
  t: string                 // qué se quiere lograr
  target?: number           // meta
  current?: number          // valor actual (manual, o calculado si auto = 'tareas')
  unit?: string             // kg, %, MXN, tareas…
  due?: string              // 'YYYY-MM-DD' fecha objetivo
  done?: boolean            // marcado a mano
  doneAt?: string
  auto?: 'tareas'           // el avance se calcula con las tareas cerradas de la épica
  lowerIsBetter?: boolean   // para metas que bajan (peso, deuda…)
  taskIds?: string[]        // tareas que cuentan para este objetivo (los "key results")
}
export type EpicaRoutine = {
  t: string
  days: boolean[]                        // legado / semana actual (compat)
  weeks?: Record<string, boolean[]>      // progreso por semana: lunesISO -> 7 booleanos (L…D)
}
export type EpicaTaskLink = { label: string; url: string }
export type EpicaSubtask = {
  id?: string            // identidad estable (para reordenar sin que se recorran los índices)
  t: string
  done: boolean
  doneAt?: string        // fecha+hora ISO en que se completó (para el registro del día)
  progress?: number      // % de avance manual (0-100)
  note?: string          // nota (HTML de contentEditable, se sanitiza)
  links?: EpicaTaskLink[]
  priority?: 'alta' | 'media' | 'baja'        // prioridad (como las tareas)
  difficulty?: 'facil' | 'media' | 'dificil'  // dificultad (como las tareas)
  plan?: string          // 'YYYY-MM-DD' del día en que se trabajará esta subtarea
}
/** Recurrencia de una tarea: "cada N días / semanas / meses".
 *  La tarea NO se duplica: al completarla se reprograma sola a la siguiente fecha. */
export type EpicaRepeat = { every: number; unit: 'dia' | 'semana' | 'mes' }
export type EpicaTask = {
  id?: string                          // identidad estable (los índices se recorren al borrar/mover)
  t: string; status: string; due: string; note: string
  resumen?: string                     // resumen/objetivo de la actividad (qué es y qué se quiere lograr); distinto de `note`
  links?: EpicaTaskLink[]; doneAt?: string
  plan?: string                        // 'YYYY-MM-DD' del día para el que se planeó (vista "Plan de hoy")
  priority?: 'alta' | 'media' | 'baja' // prioridad dentro del plan
  difficulty?: 'facil' | 'media' | 'dificil' // dificultad estimada de la tarea
  planOrder?: number                   // orden dentro del plan (se reasigna 1000,2000,3000… al reordenar)
  orden?: number                       // orden manual dentro de su épica (cuál va primero)
  updatedAt?: string                   // última modificación (server); base para detectar choques entre pestañas
  planPrev?: string                    // estado previo al completar desde el plan (para deshacer)
  subtasks?: EpicaSubtask[]            // checklist dentro de la tarea
  progress?: number                    // % de avance manual (0-100)
  progressLog?: EpicaProgressEntry[]   // bitácora: días en que se avanzó (con nota opcional)
  createdAt?: string                   // 'YYYY-MM-DD' de creación de la tarea
  planStatusPrev?: string              // estado previo a que el plan de HOY lo forzara a "En curso"
  planHist?: string[]                  // días en que estuvo planeada antes de moverla (para el resumen: "se movió a otra semana")
  remindAt?: string                    // ISO datetime: recordatorio (con la app abierta dispara notificación y se limpia)
  comentarios?: EpicaTaskComment[]     // comentarios rápidos (sin abrir el editor)
  repeat?: EpicaRepeat                 // si existe, al completarla se reprograma en vez de terminarse
  repeatUntil?: string                 // 'YYYY-MM-DD' opcional: fin de la serie
  repeatDone?: string[]                // días en que se cumplió el ciclo (historial, se recortan los últimos 60)
}
export type EpicaProgressEntry = { d: string; note?: string; pct?: number } // d = 'YYYY-MM-DD', pct = % al final de ese día
export type EpicaTaskComment = { at: string; text: string }                 // at = ISO datetime
export type EpicaLink = { l: string; url: string; type: string; primary?: boolean }

export type Epica = {
  id: string
  name: string
  color: string
  description: string | null
  status: string            // En curso | En riesgo | Al día | En pausa
  categoria: string | null
  archived: boolean
  source_table: string | null
  source_sync: string | null
  epic_order: number
  kpis: EpicaMilestone[]   // objetivos de la épica (la columna conserva el nombre viejo)
  routines: EpicaRoutine[]
  tasks: EpicaTask[]
  links: EpicaLink[]
}
