import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToIdea, type IdeaRow } from '@/lib/ideas'

export const dynamic = 'force-dynamic'

/** Edita una idea: texto, etiqueta de épica/feature (independiente de convertir), links,
 *  comentarios, o cambia su estado (convertirla → tareaId+epicaId, descartarla, deshacer
 *  cualquiera de las dos). Body: { texto?, epicaId?, featureId?, links?, comentarios?,
 *  tareaId?, descartada? } — sólo se escribe lo que venga. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const payload: Record<string, unknown> = {}
    if ('texto' in body) {
      const texto = String(body.texto || '').trim()
      if (!texto) return NextResponse.json({ ok: false, error: 'texto no puede quedar vacío' }, { status: 400 })
      payload.texto = texto
    }
    if ('tareaId' in body) payload.tarea_id = body.tareaId || null
    if ('epicaId' in body) payload.epica_id = body.epicaId || null
    if ('featureId' in body) payload.feature_id = body.featureId || null
    if ('links' in body) payload.links = Array.isArray(body.links) ? body.links : []
    if ('comentarios' in body) payload.comentarios = Array.isArray(body.comentarios) ? body.comentarios : []
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
