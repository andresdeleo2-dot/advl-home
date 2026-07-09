import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const FIELDS = 'id, titulo, tipo, fecha, fecha_fin, nota, descripcion, personas, fotos, importancia, outstanding, relevancia'

// Momentos especiales = datos de la app "mi-vida" (misma base Supabase).
// Devuelve el dataset completo: recuerdos personales + contexto (mundo),
// para que el popup pueda mostrar la misma info que el lector de mi-vida.
export async function GET() {
  const [rec, ctx] = await Promise.all([
    supabase.from('vida').select(FIELDS).eq('es_personal', true).order('fecha', { ascending: true }),
    supabase.from('vida').select(FIELDS).eq('es_personal', false).order('fecha', { ascending: true }),
  ])

  if (rec.error) return NextResponse.json({ ok: false, error: rec.error.message }, { status: 500 })
  if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, recuerdos: rec.data ?? [], contexto: ctx.data ?? [] })
}
