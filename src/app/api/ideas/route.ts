import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToIdea, type IdeaRow } from '@/lib/ideas'

export const dynamic = 'force-dynamic'

// 42P01 = undefined_table (Postgres): sql/ideas.sql aún no se ha corrido. Se distingue del resto
// de errores para que el cliente muestre "corre la migración" en vez de un error genérico.
const isMissingTable = (code?: string) => code === '42P01'

export async function GET() {
  const { data, error } = await supabase.from('ideas').select('*').order('creada', { ascending: false })
  if (error) {
    if (isMissingTable(error.code)) return NextResponse.json({ ok: false, needsMigration: true })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const rows = data as IdeaRow[]
  // feature_id/links/comentarios llegaron en sql/ideas-02-links-comentarios.sql: con filas basta
  // ver la primera; sin filas se prueba la columna directo (mismo patrón que /api/epicas).
  const richReady = rows.length ? ('feature_id' in rows[0]) : !(await supabase.from('ideas').select('feature_id').limit(1)).error
  return NextResponse.json({ ok: true, data: rows.map(rowToIdea), richReady })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const texto = String(body.texto || '').trim()
    if (!texto) return NextResponse.json({ ok: false, error: 'texto es obligatorio' }, { status: 400 })
    const row = { id: crypto.randomUUID(), texto }
    const { data, error } = await supabase.from('ideas').insert(row).select().single()
    if (error) {
      if (isMissingTable(error.code)) return NextResponse.json({ ok: false, needsMigration: true })
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: rowToIdea(data as IdeaRow) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
