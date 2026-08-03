import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Actividad } from '@/lib/tiempo'

export const dynamic = 'force-dynamic'

/* Lista todas las actividades. `ready:false` cuando la tabla todavía no existe
   (falta correr sql/tiempo-01-schema.sql) — el cliente muestra un aviso. */
export async function GET() {
  const { data, error } = await supabase
    .from('tiempo_actividades')
    .select('*')
    .order('fecha', { ascending: true })
    .order('inicio', { ascending: true, nullsFirst: false })
    .order('orden', { ascending: true, nullsFirst: false })
    .order('creada', { ascending: true })

  if (error) {
    // 42P01 = tabla inexistente. Cualquier error → ready:false y lista vacía.
    return NextResponse.json({ ok: true, ready: false, data: [] as Actividad[], error: error.message })
  }
  return NextResponse.json({ ok: true, ready: true, data: data ?? [] })
}

const clampMin = (v: unknown, def: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? n : def
}

export async function POST(req: Request) {
  try {
    const b = await req.json()
    if (!b.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) {
      return NextResponse.json({ ok: false, error: 'fecha es obligatoria' }, { status: 400 })
    }
    const payload = {
      titulo: String(b.titulo ?? '').slice(0, 200),
      area: b.area || 'ocio',
      fecha: b.fecha,
      inicio: b.inicio == null ? null : Math.max(0, Math.min(1439, clampMin(b.inicio, 0))),
      dur: Math.max(5, Math.min(1440, clampMin(b.dur, 30))),
      nota: b.nota ?? null,
      hecho: !!b.hecho,
      orden: b.orden == null ? null : clampMin(b.orden, 0),
    }
    const { data, error } = await supabase.from('tiempo_actividades').insert(payload).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
