// Compara la tarea RECONSTRUIDA desde la tabla `tareas` contra la del JSON de
// respaldo (epicas.tasks). Replica el mapeo de src/lib/tareas.ts (rowToTask).
// Si sale todo ✓, la app verá exactamente lo mismo que antes del cambio.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY)

function rowToTask(r) {
  const t = { id: r.id, t: r.titulo || '', status: r.estado || 'Por hacer', due: r.vence || '', note: r.nota || '', links: r.links || [] }
  if (r.prioridad) t.priority = r.prioridad
  if (r.dificultad) t.difficulty = r.dificultad
  if (typeof r.avance === 'number') t.progress = r.avance
  if (r.plan) t.plan = r.plan
  if (typeof r.plan_order === 'number') t.planOrder = r.plan_order
  if (r.done_at) t.doneAt = r.done_at
  if (r.creada) t.createdAt = r.creada
  if (r.plan_prev) t.planPrev = r.plan_prev
  if (r.plan_status_prev) t.planStatusPrev = r.plan_status_prev
  if (r.repeat_every && r.repeat_unit) t.repeat = { every: r.repeat_every, unit: r.repeat_unit }
  if (r.repeat_until) t.repeatUntil = r.repeat_until
  if (r.repeat_done?.length) t.repeatDone = r.repeat_done
  if (r.subtasks?.length) t.subtasks = r.subtasks
  if (r.progress_log?.length) t.progressLog = r.progress_log
  return t
}

// Normaliza la tarea original del JSON al mismo criterio (quita vacíos que el
// mapeo no reconstruye por diseño: '' , [] y undefined).
function normJson(t) {
  const o = { id: t.id, t: t.t || '', status: t.status || 'Por hacer', due: t.due || '', note: t.note || '', links: t.links || [] }
  if (t.priority) o.priority = t.priority
  if (t.difficulty) o.difficulty = t.difficulty
  if (typeof t.progress === 'number') o.progress = t.progress
  if (t.plan) o.plan = t.plan
  if (typeof t.planOrder === 'number') o.planOrder = t.planOrder
  if (t.doneAt) o.doneAt = t.doneAt
  if (t.createdAt) o.createdAt = t.createdAt
  if (t.planPrev) o.planPrev = t.planPrev
  if (t.planStatusPrev) o.planStatusPrev = t.planStatusPrev
  if (t.repeat?.every && t.repeat?.unit) o.repeat = { every: t.repeat.every, unit: t.repeat.unit }
  if (t.repeatUntil) o.repeatUntil = t.repeatUntil
  if (t.repeatDone?.length) o.repeatDone = t.repeatDone
  if (t.subtasks?.length) o.subtasks = t.subtasks
  if (t.progressLog?.length) o.progressLog = t.progressLog
  return o
}

const sorted = (o) => JSON.stringify(o, Object.keys(o).sort())

const { data: epics } = await sb.from('epicas').select('id,name,tasks')
const { data: rows } = await sb.from('tareas').select('*')
const byId = new Map(rows.map(r => [r.id, r]))

let ok = 0, bad = 0
for (const e of epics) {
  for (const t of (e.tasks || [])) {
    const r = byId.get(t.id)
    if (!r) { console.log(`✗ ${e.name} · "${t.t}": no está en la tabla`); bad++; continue }
    const a = sorted(normJson(t)), b = sorted(rowToTask(r))
    if (a === b) { ok++; continue }
    bad++
    console.log(`✗ ${e.name} · "${t.t}"`)
    console.log(`   json:  ${a}`)
    console.log(`   tabla: ${b}`)
  }
}
console.log(`\n${ok} tareas idénticas · ${bad} con diferencias`)
console.log(bad === 0 ? '✓ La app verá exactamente lo mismo que antes.' : '✗ Revisar antes de desplegar.')
