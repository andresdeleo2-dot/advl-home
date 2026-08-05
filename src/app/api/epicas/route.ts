import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToTask, taskToRow, type TareaRow } from '@/lib/tareas'
import type { EpicaTask } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('epicas')
    .select('*')
    .order('epic_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Las tareas viven en su propia tabla; se adjuntan a cada épica para que la UI
  // siga viendo `epica.tasks[]` exactamente como antes.
  // PAGINADO: PostgREST corta en 1000 filas por respuesta; se recorre con .range()
  // para no perder tareas cuando el histórico supera las 1000 (nunca se borran al cerrar).
  const tareas: TareaRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: e2 } = await supabase
      .from('tareas')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 })
    tareas.push(...((page || []) as TareaRow[]))
    if (!page || page.length < PAGE) break
  }

  const byEpic = new Map<string, EpicaTask[]>()
  for (const r of (tareas || []) as TareaRow[]) {
    if (!byEpic.has(r.epica_id)) byEpic.set(r.epica_id, [])
    byEpic.get(r.epica_id)!.push(rowToTask(r))
  }
  // Orden propio de la épica: `orden` manual y, en su defecto, fecha de creación
  for (const arr of byEpic.values()) arr.sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9))
  const withTasks = (data || []).map(e => ({ ...e, tasks: byEpic.get(e.id) || [] }))

  // ¿Existe ya la columna plan_hist? (select * la incluye como key si existe).
  // El cliente sólo registra el historial de plan cuando es true, para no escribir
  // plan_hist antes de correr la migración y romper el guardado.
  const planHistReady = tareas.length ? ('plan_hist' in (tareas[0] as object)) : false
  // Igual para `orden`: el cliente sólo estampa/manda `orden` cuando la columna existe.
  const ordenReady = tareas.length ? ('orden' in (tareas[0] as object)) : false
  const remindReady = tareas.length ? ('remind_at' in (tareas[0] as object)) : false
  const comentariosReady = tareas.length ? ('comentarios' in (tareas[0] as object)) : false
  const resumenReady = tareas.length ? ('resumen' in (tareas[0] as object)) : false

  return NextResponse.json({ ok: true, data: withTasks, planHistReady, ordenReady, remindReady, comentariosReady, resumenReady })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.name) {
      return NextResponse.json({ ok: false, error: 'name es obligatorio' }, { status: 400 })
    }
    const payload = {
      name: body.name,
      color: body.color || '#2E5A9E',
      description: body.description || null,
      status: body.status || 'En curso',
      categoria: body.categoria || null,
      archived: !!body.archived,
      source_table: body.source_table || null,
      source_sync: body.source_sync || null,
      epic_order: Number(body.epic_order) || 0,
      kpis: body.kpis ?? [],
      routines: body.routines ?? [],
      tasks: [],                     // legado: la columna queda vacía (respaldo histórico)
      links: body.links ?? [],
    }
    const { data, error } = await supabase.from('epicas').insert(payload).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    // Las tareas que vengan en el alta se insertan en su propia tabla
    const tasks: EpicaTask[] = body.tasks ?? []
    if (tasks.length) {
      const { error: e2 } = await supabase.from('tareas').insert(tasks.map(t => taskToRow(t, data.id)))
      if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: { ...data, tasks } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
