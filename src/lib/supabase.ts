import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_KEY!

export const supabase = createClient(url, key)

export type Item = {
  id: string
  title: string
  url: string
  url2?: string
  url3?: string
  section: string
  subcategory?: string
  item_order: number
  section_order: number
  featured: boolean
  description?: string
  image?: string
  badge?: string
  accent: string
}
