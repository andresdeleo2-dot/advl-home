// Solo lectura: lista secciones/títulos de items y épicas con sus links actuales.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY)

const { data: items, error: e1 } = await sb.from('items').select('title,url,section,subcategory').order('section')
if (e1) { console.error('items', e1.message); process.exit(1) }
const bySection = {}
for (const it of items) (bySection[it.section] ||= []).push(it)
console.log('=== SECCIONES DE ITEMS (home) ===')
for (const [s, arr] of Object.entries(bySection)) {
  console.log(`\n[${s}] (${arr.length})`)
  for (const it of arr) console.log(`  - ${it.title}  →  ${it.url}`)
}

const { data: epics, error: e2 } = await sb.from('epicas').select('id,name,links').order('name')
if (e2) { console.error('epicas', e2.message); process.exit(1) }
console.log('\n\n=== ÉPICAS y sus links actuales ===')
for (const ep of epics) {
  console.log(`\n${ep.name} (${ep.id})`)
  for (const l of (ep.links || [])) console.log(`  · ${l.l} [${l.type}${l.primary ? ',primary' : ''}]  ${l.url}`)
}
