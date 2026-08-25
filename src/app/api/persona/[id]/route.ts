import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Persona, Vida } from '@/lib/persona-card'

export const dynamic = 'force-dynamic'

// Ficha de una persona del archivo "Mi Vida" (misma Supabase, service key) para
// mostrarla como popup de SOLO LECTURA dentro de advl-home.
//   persona   → fila completa de `personas`
//   recuerdos → filas de `vida` (personales) que mencionan a esta persona
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: persona, error } = await supabase
    .from('personas')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!persona) return NextResponse.json({ ok: false }, { status: 404 })

  const { data: recuerdos, error: recErr } = await supabase
    .from('vida')
    .select('*')
    .eq('es_personal', true)
    .contains('personas', [persona.nombre])
    .order('fecha', { ascending: false, nullsFirst: false })

  // Si falla la consulta de recuerdos, se devuelve la persona igual (sin momentos).
  return NextResponse.json({
    ok: true,
    persona: persona as Persona,
    recuerdos: (recErr ? [] : recuerdos ?? []) as Vida[],
  })
}
