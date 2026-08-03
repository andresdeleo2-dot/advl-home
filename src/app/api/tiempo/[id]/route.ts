import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const allowed = ['titulo', 'area', 'fecha', 'inicio', 'dur', 'nota', 'hecho', 'orden']
    const payload: Record<string, unknown> = {}
    for (const key of allowed) {
      if (!(key in body)) continue
      let v = body[key]
      if (key === 'inicio') v = v == null ? null : Math.max(0, Math.min(1439, Math.round(Number(v))))
      if (key === 'dur') v = Math.max(5, Math.min(1440, Math.round(Number(v))))
      if (key === 'hecho') v = !!v
      payload[key] = v
    }
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: false, error: 'nada que actualizar' }, { status: 400 })
    }
    const { data, error } = await supabase.from('tiempo_actividades').update(payload).eq('id', id).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('tiempo_actividades').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
