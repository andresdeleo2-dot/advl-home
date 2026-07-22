// Agrega los links de secciones del home a las conexiones de las épicas.
// Idempotente: no duplica por URL. No toca el link primario existente.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY)

// Sección del home  →  nombre de épica
const MAP = [
  ['Portafolio', 'Inversiones'],
  ['Flujo', 'Flujo'],
  ['Personal', 'Personales'],
]

function inferType(url = '') {
  const u = url.toLowerCase()
  if (u.includes('drive.google.com')) return 'Drive'
  if (u.includes('supabase.com')) return 'Supabase'
  if (u.includes('docs.google.com/spreadsheets')) return 'Excel'
  if (u.includes('vercel.app') || u.includes('script.google.com')) return 'Dashboard'
  return 'Otro'
}
const normUrl = (u = '') => u.trim().replace(/\/+$/, '').toLowerCase()

const { data: items } = await sb.from('items').select('title,url,section')
const { data: epics } = await sb.from('epicas').select('id,name,links')

for (const [section, epicName] of MAP) {
  const ep = epics.find(e => e.name === epicName)
  if (!ep) { console.log(`⚠ épica "${epicName}" no encontrada, salto`); continue }
  const links = [...(ep.links || [])]
  const seen = new Set(links.map(l => normUrl(l.url)).filter(Boolean))
  const secItems = items.filter(it => it.section === section && it.url)
  let added = 0
  for (const it of secItems) {
    const key = normUrl(it.url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    links.push({ l: it.title, url: it.url, type: inferType(it.url), primary: false })
    added++
  }
  const { error } = await sb.from('epicas').update({ links }).eq('id', ep.id)
  if (error) { console.log(`✗ ${epicName}: ${error.message}`); continue }
  console.log(`✓ ${epicName}: +${added} links (total ${links.length})  [de sección "${section}", ${secItems.length} disponibles]`)
}
console.log('\nListo.')
