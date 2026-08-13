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
    const p = body.data ?? {}
    // El blob DEBE ser un objeto: un data string/número/array reemplazaría todo margen.v1
    // (sesión + historial) por basura que TODOS los dispositivos adoptarían. Se rechaza.
    if (typeof p !== 'object' || Array.isArray(p) || p === null) {
      return NextResponse.json({ ok: false, error: 'data debe ser un objeto' }, { status: 400 })
    }
    // 1) Preferir la función RPC: el ts lo asigna el SERVIDOR de forma atómica y monótona
    //    (evita carrera TOCTOU y reloj de cliente desfasado). Devuelve el ts asignado.
    const rpc = await supabase.rpc('tiempo_estado_put', { p_data: p })
    if (!rpc.error) return NextResponse.json({ ok: true, ts: Number(rpc.data) || 0 })
    // 2) Fallback si la función no existe (falta correr sql/tiempo-02-estado.sql): upsert directo.
    //    App de un usuario → la carrera read-then-write es despreciable.
    const { data: cur } = await supabase.from('tiempo_estado').select('ts').eq('id', 'main').maybeSingle()
    const ts = Math.max((Number(cur?.ts) || 0) + 1, Date.now())
    const up = await supabase.from('tiempo_estado').upsert({ id: 'main', data: p, ts, updated_at: new Date().toISOString() })
    if (up.error) return NextResponse.json({ ok: false, error: `${up.error.message} · corre sql/tiempo-02-estado.sql en Supabase` }, { status: 500 })
    return NextResponse.json({ ok: true, ts })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
