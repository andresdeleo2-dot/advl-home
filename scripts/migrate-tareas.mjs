// Copia las tareas de epicas.tasks (JSON) a la tabla `tareas` (un renglón por tarea).
// Es IDEMPOTENTE: hace upsert por id, así que se puede correr varias veces.
// NO borra ni modifica epicas.tasks — esa columna queda intacta como respaldo.
//
//   node scripts/migrate-tareas.mjs            → copia y verifica
//   node scripts/migrate-tareas.mjs --verify   → sólo verifica (no escribe)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
const onlyVerify = process.argv.includes('--verify')

const d = (v) => (v && String(v).trim() ? String(v).trim() : null)          // '' → null en fechas
const n = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)

const { data: epics, error } = await sb.from('epicas').select('id,name,user_id,tasks')
if (error) { console.error('leyendo epicas:', error.message); process.exit(1) }

const rows = []
for (const e of epics) {
  for (const t of (e.tasks || [])) {
    if (!t.id) { console.error(`✗ tarea sin id en "${e.name}": ${t.t}`); process.exit(1) }
    rows.push({
      id: t.id,
      epica_id: e.id,
      user_id: e.user_id ?? null,
      titulo: t.t || '',
      estado: t.status || 'Por hacer',
      prioridad: t.priority ?? null,
      dificultad: t.difficulty ?? null,
      nota: t.note ?? null,
      avance: n(t.progress),
      plan: d(t.plan),
      plan_order: n(t.planOrder),
      vence: d(t.due),
      done_at: d(t.doneAt),
      creada: d(t.createdAt),
      plan_prev: t.planPrev ?? null,
      plan_status_prev: t.planStatusPrev ?? null,
      repeat_every: n(t.repeat?.every),
      repeat_unit: t.repeat?.unit ?? null,
      repeat_until: d(t.repeatUntil),
      repeat_done: t.repeatDone ?? [],
      subtasks: t.subtasks ?? [],
      links: t.links ?? [],
      progress_log: t.progressLog ?? [],
    })
  }
}

if (!onlyVerify) {
  console.log(`Copiando ${rows.length} tareas…`)
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error: e2 } = await sb.from('tareas').upsert(chunk, { onConflict: 'id' })
    if (e2) { console.error('✗ upsert:', e2.message); process.exit(1) }
  }
  console.log('✓ copiado')
}

// ── Verificación ─────────────────────────────────────────────────────────────
const { data: tareas, error: e3 } = await sb.from('tareas').select('*')
if (e3) { console.error('leyendo tareas:', e3.message); process.exit(1) }

console.log('\n=== VERIFICACIÓN ===')
console.log(`JSON: ${rows.length} tareas   |   tabla: ${tareas.length} tareas   ${rows.length === tareas.length ? '✓' : '✗ NO CUADRA'}`)

const byId = new Map(tareas.map(t => [t.id, t]))
let difs = 0
for (const r of rows) {
  const t = byId.get(r.id)
  if (!t) { console.log(`  ✗ falta en la tabla: ${r.titulo}`); difs++; continue }
  for (const k of ['titulo', 'estado', 'prioridad', 'dificultad', 'plan', 'vence', 'done_at', 'creada', 'avance', 'plan_order']) {
    const a = r[k] ?? null, b = t[k] ?? null
    if (String(a) !== String(b)) { console.log(`  ✗ ${r.titulo} · ${k}: JSON="${a}" tabla="${b}"`); difs++ }
  }
}
console.log(difs === 0 ? '✓ todos los campos coinciden' : `✗ ${difs} diferencias`)

console.log('\ntareas por épica (tabla vs JSON):')
for (const e of epics) {
  const enTabla = tareas.filter(t => t.epica_id === e.id).length
  const enJson = (e.tasks || []).length
  console.log(`  ${e.name.padEnd(22)} tabla ${String(enTabla).padStart(3)}  |  json ${String(enJson).padStart(3)}  ${enTabla === enJson ? '✓' : '✗'}`)
}
