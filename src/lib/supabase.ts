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
  start?: number            // valor de PARTIDA (baseline) para medir el avance de metas que bajan
  taskIds?: string[]        // tareas que cuentan para este objetivo (los "key results")
}
export type EpicaRoutine = {
  t: string
  days: boolean[]                        // legado / semana actual (compat)
  weeks?: Record<string, boolean[]>      // progreso por semana: lunesISO -> 7 booleanos (L…D)
  estMin?: number                        // estimado de minutos que le dedicas al día (opcional; se guarda en el jsonb de rutinas, sin migración)
}
export type EpicaFeature = { id: string; t: string; color?: string; kpis?: EpicaMilestone[] }
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
/** "Sesión por día": la MISMA tarea agendada en varios días, cada uno con SUS horas, SU dificultad
 *  y su propio "hecho ese día" (sin cerrar toda la tarea). Ausente/vacío = tarea de un solo día (`plan`). */
export type EpicaDayPlan = {
  day: string                                   // 'YYYY-MM-DD'
  estMin?: number                               // horas estimadas ESE día (minutos); si falta, usa el estimado general
  difficulty?: 'facil' | 'media' | 'dificil'    // dificultad ESE día; si falta, usa la general
  done?: boolean                                // marcaste "trabajé/terminé este día" (no cierra la tarea completa)
}
export type EpicaTask = {
  id?: string                          // identidad estable (los índices se recorren al borrar/mover)
  t: string; status: string; due: string; note: string
  resumen?: string                     // resumen/objetivo de la actividad (qué es y qué se quiere lograr); distinto de `note`
  links?: EpicaTaskLink[]; doneAt?: string
  plan?: string                        // 'YYYY-MM-DD' del día para el que se planeó (vista "Plan de hoy")
  priority?: 'alta' | 'media' | 'baja' // prioridad dentro del plan
  difficulty?: 'facil' | 'media' | 'dificil' // dificultad estimada de la tarea
  estMin?: number                      // estimado PROPIO en minutos (cuánto crees que te tomará); si falta, se usa el default por dificultad
  dayPlans?: EpicaDayPlan[]            // sesiones por día: la misma tarea en varios días, con horas/dificultad/hecho por día
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
  waitingFor?: string                  // "En espera / Por revisar": qué esperas ('email'|'respuesta'|'comentario'|'otro'|'tarea' o texto). Vacío/ausente = no está en espera
  waitingTaskId?: string               // si waitingFor === 'tarea': el id de la tarea de la que depende (dependencia real, no sólo texto)
  waitingSince?: string                // ISO datetime: espejo en servidor de "esperando desde" (fuente: localStorage vía markWaitSince). Sólo LECTURA aquí — la escribe /api/tareas/wait-since, no el sync normal de la tarea. Requiere sql/epicas-14-waiting-since.sql
  featureId?: string                   // Feature al que pertenece dentro de su épica (opcional: puede no tener)
  personaId?: string                   // ligada a una persona del archivo "Mi Vida" (mismo Supabase, tabla personas) — ej. "regalo para mamá"
  personaNombre?: string               // nombre de esa persona AL LIGARLA (denormalizado, para mostrar el chip sin otro fetch)
  repeat?: EpicaRepeat                 // si existe, al completarla se reprograma en vez de terminarse
  repeatUntil?: string                 // 'YYYY-MM-DD' opcional: fin de la serie
  repeatDone?: string[]                // días en que se cumplió el ciclo (historial, se recortan los últimos 60)
}
export type EpicaProgressEntry = { d: string; note?: string; pct?: number; min?: number; logId?: string } // d = 'YYYY-MM-DD', pct = % al final de ese día; min = minutos trabajados (desde Tiempo); logId = liga con el registro de Tiempo
export type EpicaTaskComment = { at: string; text: string; editedAt?: string[] }   // at = creación (ISO); editedAt = ISO de cada edición
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
  features?: EpicaFeature[]   // Features dentro de la épica (Épica → Feature → Tarea). Requiere sql/epicas-12-features.sql
  week_budget?: number | null   // meta de horas/semana (presupuesto de tiempo). Requiere sql/epicas-08-week-budget.sql
}
