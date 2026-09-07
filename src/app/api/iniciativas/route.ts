import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToIniciativa, type IniciativaRow } from '@/lib/iniciativas'

export const dynamic = 'force-dynamic'

const isMissingTable = (code?: string) => code === '42P01'

/** Crea (o re-sincroniza) una Iniciativa. El id lo manda el cliente (uid()), mismo criterio que
 *  /api/features — upsert idempotente. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const id = String(body.id || '').trim()
    const featureId = String(body.featureId || '').trim()
    const epicaId = String(body.epicaId || '').trim()
    const nombre = String(body.nombre || '').trim()
    if (!id || !featureId || !epicaId || !nombre) return NextResponse.json({ ok: false, error: 'id, featureId, epicaId y nombre son obligatorios' }, { status: 400 })
    const row = {
      id, feature_id: featureId, epica_id: epicaId, nombre,
      descripcion: body.descripcion || null,
      estado: body.estado || 'pendiente',
      fecha_inicio: body.fechaInicio || null,
      fecha_fin_objetivo: body.fechaFinObjetivo || null,
      responsable: body.responsable || null,
      orden: typeof body.orden === 'number' ? body.orden : null,
      bloqueada_por: body.bloqueadaPor || null,
    }
    const { data, error } = await supabase.from('iniciativas').upsert(row, { onConflict: 'id' }).select().single()
    if (error) {
      if (isMissingTable(error.code)) return NextResponse.json({ ok: false, needsMigration: true })
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: rowToIniciativa(data as IniciativaRow) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
