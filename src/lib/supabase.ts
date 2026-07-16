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
  featured: boolean
  description?: string | null
  image?: string | null
  badge?: string | null
  accent: string
  keywords?: string[] | null
}

// ─── Épicas (grandes frentes) ────────────────────────────────
export type EpicaKpi = { v: string; l: string }
export type EpicaRoutine = {
  t: string
  days: boolean[]                        // legado / semana actual (compat)
  weeks?: Record<string, boolean[]>      // progreso por semana: lunesISO -> 7 booleanos (L…D)
}
export type EpicaTaskLink = { label: string; url: string }
export type EpicaSubtask = { t: string; done: boolean }
export type EpicaTask = {
  t: string; status: string; due: string; note: string
  links?: EpicaTaskLink[]; doneAt?: string
  plan?: string                        // 'YYYY-MM-DD' del día para el que se planeó (vista "Plan de hoy")
  priority?: 'alta' | 'media' | 'baja' // prioridad dentro del plan
  planOrder?: number                   // orden dentro del plan (se reasigna 1000,2000,3000… al reordenar)
  planPrev?: string                    // estado previo al completar desde el plan (para deshacer)
  subtasks?: EpicaSubtask[]            // checklist dentro de la tarea
  progress?: number                    // % de avance manual (0-100)
  progressLog?: EpicaProgressEntry[]   // bitácora: días en que se avanzó (con nota opcional)
  createdAt?: string                   // 'YYYY-MM-DD' de creación de la tarea
  planStatusPrev?: string              // estado previo a que el plan de HOY lo forzara a "En curso"
}
export type EpicaProgressEntry = { d: string; note?: string; pct?: number } // d = 'YYYY-MM-DD', pct = % al final de ese día
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
  kpis: EpicaKpi[]
  routines: EpicaRoutine[]
  tasks: EpicaTask[]
  links: EpicaLink[]
}
