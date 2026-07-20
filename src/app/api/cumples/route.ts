import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Cumpleaños del archivo de personas de mi-vida (misma base Supabase compartida).
// Solo lo necesario para el widget del header: nombre, apodo y fecha.
export async function GET() {
  const { data, error } = await supabase
    .from('personas')
    .select('id, nombre, apodo, cumple')
    .not('cumple', 'is', null)
    // No felicitar a quien falleció (mismo criterio que mi-vida). El filtro va
    // en la consulta para no mandar esos registros al navegador siquiera.
    .or('fallecio.is.null,fallecio.eq.false')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, personas: data ?? [] })
}
