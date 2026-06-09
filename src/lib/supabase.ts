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
