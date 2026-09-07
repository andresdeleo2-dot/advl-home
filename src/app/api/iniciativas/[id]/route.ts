import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToIniciativa, type IniciativaRow } from '@/lib/iniciativas'

export const dynamic = 'force-dynamic'

/** Body sparse: sólo se escribe lo que venga. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const payload: Record<string, unknown> = {}
    if ('nombre' in body) payload.nombre = String(body.nombre || '').trim()
    if ('descripcion' in body) payload.descripcion = body.descripcion || null
    if ('estado' in body) payload.estado = body.estado || 'pendiente'
    if ('fechaInicio' in body) payload.fecha_inicio = body.fechaInicio || null
    if ('fechaFinObjetivo' in body) payload.fecha_fin_objetivo = body.fechaFinObjetivo || null
    if ('responsable' in body) payload.responsable = body.responsable || null
    if ('orden' in body) payload.orden = typeof body.orden === 'number' ? body.orden : null
    if ('bloqueadaPor' in body) payload.bloqueada_por = body.bloqueadaPor || null
    if (Object.keys(payload).length === 0) return NextResponse.json({ ok: false, error: 'nada que actualizar' }, { status: 400 })
    const { data, error } = await supabase.from('iniciativas').update(payload).eq('id', id).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data: rowToIniciativa(data as IniciativaRow) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('iniciativas').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
