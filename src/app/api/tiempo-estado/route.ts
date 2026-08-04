import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/* Estado durable de "Margen" (un solo blob JSON, app de un usuario). */
export async function GET() {
  const { data, error } = await supabase.from('tiempo_estado').select('data, ts').eq('id', 'main').maybeSingle()
  // Si la tabla no existe todavía (falta correr el SQL), respondemos vacío sin romper.
  if (error) return NextResponse.json({ ok: true, ready: false, data: {}, ts: 0 })
  return NextResponse.json({ ok: true, ready: true, data: data?.data ?? {}, ts: data?.ts ?? 0 })
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const payload = {
      id: 'main',
      data: body.data ?? {},
      ts: Number(body.ts) || 0,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('tiempo_estado').upsert(payload, { onConflict: 'id' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
