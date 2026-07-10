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
export type EpicaRoutine = { t: string; days: boolean[] }
export type EpicaTask = { t: string; status: string; due: string; note: string }
export type EpicaLink = { l: string; url: string; type: string; primary?: boolean }

export type Epica = {
  id: string
  name: string
  color: string
  description: string | null
  status: string            // En curso | En riesgo | Al día | En pausa
  source_table: string | null
  source_sync: string | null
  epic_order: number
  kpis: EpicaKpi[]
  routines: EpicaRoutine[]
  tasks: EpicaTask[]
  links: EpicaLink[]
}
