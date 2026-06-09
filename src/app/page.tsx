import { supabase } from '@/lib/supabase'
import type { Item } from '@/lib/supabase'
import ItemCard from '@/components/ItemCard'
import Clock from '@/components/Clock'

export const revalidate = 300

async function getItems(): Promise<Item[]> {
  const { data } = await supabase
    .from('items')
    .select('*')
    .order('section_order', { ascending: true })
    .order('item_order', { ascending: true })
  return data ?? []
}

function groupBySection(items: Item[]) {
  const map = new Map<string, { order: number; items: Item[] }>()
  for (const item of items) {
    if (!map.has(item.section)) {
      map.set(item.section, { order: item.section_order, items: [] })
    }
    map.get(item.section)!.items.push(item)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([section, val]) => ({ section, items: val.items }))
}

export default async function Home() {
  const items = await getItems()
  const featured = items.filter(i => i.featured)
  const sections = groupBySection(items.filter(i => !i.featured))

  return (
    <div className="min-h-screen bg-[#0f0f13] text-white">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-[#0f0f13]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <span className="text-sm font-semibold tracking-widest uppercase text-white/40">
            advl
          </span>
          <Clock />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-10">
        {featured.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/30">
              Destacados
            </h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {featured.map(item => (
                <ItemCard key={item.id} item={item} featured />
              ))}
            </div>
          </section>
        )}

        {sections.map(({ section, items: sectionItems }) => (
          <section key={section}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/30">
              {section}
            </h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {sectionItems.map(item => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
