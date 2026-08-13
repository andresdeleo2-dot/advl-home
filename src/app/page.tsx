import { supabase } from '@/lib/supabase'
import type { Item } from '@/lib/supabase'
import Dashboard from '@/components/Dashboard'

export const revalidate = 300

async function getItems(): Promise<Item[]> {
  // PAGINADO con desempate id (igual que /api/items): PostgREST corta en 1000.
  const items: Item[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from('items')
      .select('*')
      .order('section_order', { ascending: true })
      .order('item_order', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    items.push(...((page || []) as Item[]))
    if (!page || page.length < PAGE) break
  }
  return items
}

export default async function Home() {
  const items = await getItems()
  return <Dashboard initialItems={items} />
}
