import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('epicas')
    .select('*')
    .order('epic_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.name) {
      return NextResponse.json({ ok: false, error: 'name es obligatorio' }, { status: 400 })
    }
    const payload = {
      name: body.name,
      color: body.color || '#2E5A9E',
      description: body.description || null,
      status: body.status || 'En curso',
      categoria: body.categoria || null,
      archived: !!body.archived,
      source_table: body.source_table || null,
      source_sync: body.source_sync || null,
      epic_order: Number(body.epic_order) || 0,
      kpis: body.kpis ?? [],
      routines: body.routines ?? [],
      tasks: body.tasks ?? [],
      links: body.links ?? [],
    }
    const { data, error } = await supabase.from('epicas').insert(payload).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
