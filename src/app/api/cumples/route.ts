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

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, personas: data ?? [] })
}
