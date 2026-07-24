// Solo lectura: columnas de `epicas`, conteo de tareas y muestra de campos usados.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY)

const { data: epics, error } = await sb.from('epicas').select('*')
if (error) { console.error(error.message); process.exit(1) }

console.log('épicas:', epics.length)
console.log('columnas de epicas:', Object.keys(epics[0] || {}).join(', '))
console.log('¿tiene user_id?:', 'user_id' in (epics[0] || {}), '→', epics[0]?.user_id ?? '(sin columna)')

let total = 0, conId = 0
const campos = new Set()
const valores = { estado: new Set(), prioridad: new Set(), dificultad: new Set(), repeatUnit: new Set() }
for (const e of epics) {
  for (const t of (e.tasks || [])) {
    total++
    if (t.id) conId++
    Object.keys(t).forEach(k => campos.add(k))
    if (t.status) valores.estado.add(t.status)
    if (t.priority) valores.prioridad.add(t.priority)
    if (t.difficulty) valores.dificultad.add(t.difficulty)
    if (t.repeat?.unit) valores.repeatUnit.add(t.repeat.unit)
  }
}
console.log('\ntareas totales:', total, '| con id:', conId, '| sin id:', total - conId)
console.log('campos usados en tasks:', [...campos].sort().join(', '))
console.log('estados:', [...valores.estado].join(' | '))
console.log('prioridades:', [...valores.prioridad].join(' | '))
console.log('dificultades:', [...valores.dificultad].join(' | ') || '(ninguna)')
console.log('unidades de repetición:', [...valores.repeatUnit].join(' | ') || '(ninguna)')
console.log('\ntareas por épica:')
for (const e of epics) console.log(`  ${e.name}: ${(e.tasks || []).length}`)
