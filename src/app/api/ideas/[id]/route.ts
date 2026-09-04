import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToIdea, type IdeaRow } from '@/lib/ideas'

export const dynamic = 'force-dynamic'

/** Cambia el estado de una idea: convertirla en tarea (tareaId+epicaId), descartarla, o
 *  deshacer cualquiera de las dos (vuelve a activa). Body: { tareaId?, epicaId?, descartada? }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const payload: Record<string, unknown> = {}
    if ('tareaId' in body) payload.tarea_id = body.tareaId || null
    if ('epicaId' in body) payload.epica_id = body.epicaId || null
    if ('descartada' in body) payload.descartada = !!body.descartada
    if (Object.keys(payload).length === 0) return NextResponse.json({ ok: false, error: 'nada que actualizar' }, { status: 400 })
    const { data, error } = await supabase.from('ideas').update(payload).eq('id', id).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data: rowToIdea(data as IdeaRow) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('ideas').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
