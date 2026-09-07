import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToObjetivo, type ObjetivoRow } from '@/lib/objetivos'

export const dynamic = 'force-dynamic'

const isMissingTable = (code?: string) => code === '42P01'

/** Crea (o re-sincroniza) un Objetivo, de épica O de feature (exactamente uno de epicaId/
 *  featureId). El id lo manda el cliente (uid()), mismo criterio que /api/features — upsert
 *  idempotente. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const id = String(body.id || '').trim()
    const epicaId = body.epicaId ? String(body.epicaId).trim() : ''
    const featureId = body.featureId ? String(body.featureId).trim() : ''
    const t = String(body.t || '').trim()
    if (!id || !t) return NextResponse.json({ ok: false, error: 'id y t son obligatorios' }, { status: 400 })
    if ((epicaId ? 1 : 0) + (featureId ? 1 : 0) !== 1) return NextResponse.json({ ok: false, error: 'manda exactamente uno de epicaId o featureId' }, { status: 400 })
    const row = {
      id,
      epica_id: epicaId || null,
      feature_id: featureId || null,
      tipo: body.tipo === 'hito' ? 'hito' : 'metrica',
      t,
      target: typeof body.target === 'number' ? body.target : null,
      current: typeof body.current === 'number' ? body.current : null,
      unidad: body.unit || null,
      unidad_libre: body.unitLabel || null,
      fecha_objetivo: body.due || null,
      medir_con_tareas_cerradas: body.auto === 'tareas',
      menos_es_mejor: !!body.lowerIsBetter,
      valor_inicio: typeof body.start === 'number' ? body.start : null,
      task_ids: Array.isArray(body.taskIds) ? body.taskIds : [],
      hito_estado: body.hitoEstado || null,
      fecha_logrado: body.fechaLogrado || null,
      cumplido: !!body.done,
      cumplido_at: body.doneAt || null,
      orden: typeof body.orden === 'number' ? body.orden : null,
    }
    const { data, error } = await supabase.from('objetivos').upsert(row, { onConflict: 'id' }).select().single()
    if (error) {
      if (isMissingTable(error.code)) return NextResponse.json({ ok: false, needsMigration: true })
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: rowToObjetivo(data as ObjetivoRow) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
