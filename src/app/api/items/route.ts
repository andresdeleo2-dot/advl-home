import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('section_order', { ascending: true })
    .order('item_order', { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.title || !body.url) {
      return NextResponse.json({ ok: false, error: 'title y url son obligatorios' }, { status: 400 })
    }
    const payload = {
      title: body.title,
      url: body.url,
      url2: body.url2 || null,
      url3: body.url3 || null,
      section: body.section || 'General',
      subcategory: body.subcategory || null,
      item_order: Number(body.item_order) || 999,
      section_order: Number(body.section_order) || 999,
      featured: !!body.featured,
      description: body.description || null,
      image: body.image || null,
      badge: body.badge || null,
      accent: body.accent || 'blue',
      keywords: body.keywords || null,
    }
    const { data, error } = await supabase.from('items').insert(payload).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
