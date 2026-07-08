import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Momentos especiales = recuerdos personales de la app "mi-vida" (misma base Supabase).
// Devuelve los recuerdos con fecha para que el cliente calcule las efemérides de la semana.
export async function GET() {
  const { data, error } = await supabase
    .from('vida')
    .select('id, titulo, tipo, fecha, fecha_fin, nota, personas, importancia, outstanding')
    .eq('es_personal', true)
    .not('fecha', 'is', null)
    .order('fecha', { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}
