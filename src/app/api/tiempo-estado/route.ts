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
    const ts = Number(body.ts) || 0
    // "Gana el más nuevo": no sobrescribir un estado con ts igual o más nuevo. Esto evita
    // que un push viejo (reloj atrasado, reintento) haga retroceder el estado durable.
    const { data: cur } = await supabase.from('tiempo_estado').select('ts').eq('id', 'main').maybeSingle()
    if (cur && Number(cur.ts) >= ts) return NextResponse.json({ ok: true, skipped: true })
    const { error } = await supabase.from('tiempo_estado').upsert(
      { id: 'main', data: body.data ?? {}, ts, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
