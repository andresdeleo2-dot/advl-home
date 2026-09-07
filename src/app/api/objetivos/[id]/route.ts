import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToObjetivo, type ObjetivoRow } from '@/lib/objetivos'

export const dynamic = 'force-dynamic'

/** Body sparse: sólo se escribe lo que venga. No se permite mover un objetivo de dueño (épica↔
 *  feature) desde aquí — para eso se borra y se crea de nuevo, es un caso raro y así se evita
 *  tener que revalidar el CHECK owner-xor en cada PATCH parcial. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const payload: Record<string, unknown> = {}
    if ('tipo' in body) payload.tipo = body.tipo === 'hito' ? 'hito' : 'metrica'
    if ('t' in body) payload.t = String(body.t || '').trim()
    if ('target' in body) payload.target = typeof body.target === 'number' ? body.target : null
    if ('current' in body) payload.current = typeof body.current === 'number' ? body.current : null
    if ('unit' in body) payload.unidad = body.unit || null
    if ('unitLabel' in body) payload.unidad_libre = body.unitLabel || null
    if ('due' in body) payload.fecha_objetivo = body.due || null
    if ('auto' in body) payload.medir_con_tareas_cerradas = body.auto === 'tareas'
    if ('lowerIsBetter' in body) payload.menos_es_mejor = !!body.lowerIsBetter
    if ('start' in body) payload.valor_inicio = typeof body.start === 'number' ? body.start : null
    if ('taskIds' in body) payload.task_ids = Array.isArray(body.taskIds) ? body.taskIds : []
    if ('hitoEstado' in body) payload.hito_estado = body.hitoEstado || null
    if ('fechaLogrado' in body) payload.fecha_logrado = body.fechaLogrado || null
    if ('done' in body) payload.cumplido = !!body.done
    if ('doneAt' in body) payload.cumplido_at = body.doneAt || null
    if ('orden' in body) payload.orden = typeof body.orden === 'number' ? body.orden : null
    if (Object.keys(payload).length === 0) return NextResponse.json({ ok: false, error: 'nada que actualizar' }, { status: 400 })
    const { data, error } = await supabase.from('objetivos').update(payload).eq('id', id).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data: rowToObjetivo(data as ObjetivoRow) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('objetivos').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
