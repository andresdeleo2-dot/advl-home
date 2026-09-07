import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToFeature, type FeatureRow } from '@/lib/features'

export const dynamic = 'force-dynamic'

/** Body sparse: sólo se escribe lo que venga. Body: { t?, color?, estado?, roadmapStart?,
 *  roadmapEnd?, orden? }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const payload: Record<string, unknown> = {}
    if ('t' in body) payload.t = String(body.t || '').trim()
    if ('color' in body) payload.color = body.color || null
    if ('estado' in body) payload.estado = body.estado || 'en_curso'
    if ('roadmapStart' in body) payload.fecha_inicio = body.roadmapStart || null
    if ('roadmapEnd' in body) payload.fecha_fin_objetivo = body.roadmapEnd || null
    if ('orden' in body) payload.orden = typeof body.orden === 'number' ? body.orden : null
    if (Object.keys(payload).length === 0) return NextResponse.json({ ok: false, error: 'nada que actualizar' }, { status: 400 })
    const { data, error } = await supabase.from('features').update(payload).eq('id', id).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data: rowToFeature(data as FeatureRow) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}

/** Borra el Feature. objetivos/iniciativas de ese feature se van solos (on delete cascade). Las
 *  tareas que tenían feature_id/iniciativaId apuntando aquí NO se tocan (quedan huérfanas — mismo
 *  comportamiento que ya existía cuando Features vivía en el jsonb: se borraba el feature y las
 *  tareas conservaban un featureId que ya no resolvía a nada). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('features').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
