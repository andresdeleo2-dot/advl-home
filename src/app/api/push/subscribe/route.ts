import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Guarda (o quita) la suscripción de push del navegador. Requiere haber corrido sql/push-subs.sql.
export async function POST(req: NextRequest) {
  try {
    const sub = await req.json()
    if (!sub?.endpoint) return NextResponse.json({ ok: false, error: 'sin endpoint' }, { status: 400 })
    const { error } = await supabase.from('push_subs').upsert({ endpoint: sub.endpoint, sub }, { onConflict: 'endpoint' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json()
    if (endpoint) await supabase.from('push_subs').delete().eq('endpoint', endpoint)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
