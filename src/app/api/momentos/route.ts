import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const FIELDS = 'id, titulo, tipo, fecha, fecha_fin, nota, descripcion, personas, fotos, importancia, outstanding, relevancia'
// `recordar` (fecha a recordar 🔔) puede no existir aún en la BD → se intenta y se cae al set base.
const FIELDS_REC = FIELDS + ', recordar'

// Momentos especiales = datos de la app "mi-vida" (misma base Supabase).
// Devuelve el dataset completo: recuerdos personales + contexto (mundo),
// para que el popup pueda mostrar la misma info que el lector de mi-vida.
const query = (fields: string) => Promise.all([
  supabase.from('vida').select(fields).eq('es_personal', true).order('fecha', { ascending: true }),
  supabase.from('vida').select(fields).eq('es_personal', false).order('fecha', { ascending: true }),
])

export async function GET() {
  let [rec, ctx] = await query(FIELDS_REC)
  if (rec.error || ctx.error) [rec, ctx] = await query(FIELDS)

  if (rec.error) return NextResponse.json({ ok: false, error: rec.error.message }, { status: 500 })
  if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, recuerdos: rec.data ?? [], contexto: ctx.data ?? [] })
}
