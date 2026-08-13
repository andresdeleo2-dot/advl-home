import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    // 'tasks' ya NO se acepta aquí: las tareas viven en la tabla `tareas` y se
    // escriben por /api/tareas/sync. epicas.tasks queda intacta como respaldo.
    const allowed = [
      'name', 'color', 'description', 'status', 'categoria', 'archived',
      'source_table', 'source_sync', 'epic_order', 'kpis', 'routines', 'links', 'week_budget',
    ]
    // Estas columnas jsonb DEBEN ser arrays: un valor no-array rompería normalize() (.map) en
    // el cliente y dejaría /epicas con error permanente. Se rechaza el write en ese caso.
    const arrayCols = ['kpis', 'routines', 'links']
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (!(key in body)) continue
      if (arrayCols.includes(key) && !Array.isArray(body[key])) {
        return NextResponse.json({ ok: false, error: `${key} debe ser un arreglo` }, { status: 400 })
      }
      payload[key] = body[key]
    }
    // Si sólo venían tareas, no hay nada que actualizar en la épica
    if (Object.keys(payload).length === 1) return NextResponse.json({ ok: true, data: null })
    const { data, error } = await supabase.from('epicas').update(payload).eq('id', id).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('epicas').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
