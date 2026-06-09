import { supabase } from '@/lib/supabase'
import type { Item } from '@/lib/supabase'
import Dashboard from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

async function getItems(): Promise<Item[]> {
  const { data } = await supabase
    .from('items')
    .select('*')
    .order('section_order', { ascending: true })
    .order('item_order', { ascending: true })
  return data ?? []
}

export default async function Home() {
  const items = await getItems()
  return <Dashboard initialItems={items} />
}
