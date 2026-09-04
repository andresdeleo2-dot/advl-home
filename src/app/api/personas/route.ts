import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Lista ligera de personas del archivo "Mi Vida" (mismo Supabase, tabla `personas`) — sólo lo
// necesario para ligar una tarea a alguien (Épicas). El expediente completo sigue siendo
// /api/persona/[id] (ya existente, usado por PersonaExpediente).
export async function GET() {
  const { data, error } = await supabase.from('personas').select('id, nombre, categoria').order('nombre', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data || [] })
}
