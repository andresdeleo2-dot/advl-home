import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToFeature, type FeatureRow } from '@/lib/features'

export const dynamic = 'force-dynamic'

// 42P01 = undefined_table: sql/epicas-18-features.sql aún no se ha corrido.
const isMissingTable = (code?: string) => code === '42P01'

/** Crea (o re-sincroniza) un Feature. El id lo manda el CLIENTE (uid(), no crypto.randomUUID en
 *  el servidor): commitQuickFeature/createFeatureQuick necesitan el id de vuelta sincrónicamente,
 *  antes de cualquier round-trip, para poder asignarlo a la tarea de inmediato. Por eso upsert
 *  (idempotente) en vez de insert — mismo criterio que /api/tareas/sync. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const id = String(body.id || '').trim()
    const epicaId = String(body.epicaId || '').trim()
    const t = String(body.t || '').trim()
    if (!id || !epicaId || !t) return NextResponse.json({ ok: false, error: 'id, epicaId y t son obligatorios' }, { status: 400 })
    const row = {
      id, epica_id: epicaId, t,
      color: body.color || null,
      estado: body.estado || 'en_curso',
      fecha_inicio: body.roadmapStart || null,
      fecha_fin_objetivo: body.roadmapEnd || null,
      orden: typeof body.orden === 'number' ? body.orden : null,
    }
    const { data, error } = await supabase.from('features').upsert(row, { onConflict: 'id' }).select().single()
    if (error) {
      if (isMissingTable(error.code)) return NextResponse.json({ ok: false, needsMigration: true })
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: rowToFeature(data as FeatureRow) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
