import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { DEFAULT_TRACKS, type NewsTrack } from '@/lib/newsTracks'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data } = await supabase.from('news_config').select('tracks').eq('id', 'main').maybeSingle()
    const saved = data?.tracks as NewsTrack[] | undefined
    return NextResponse.json({ ok: true, tracks: Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_TRACKS })
  } catch {
    return NextResponse.json({ ok: true, tracks: DEFAULT_TRACKS })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const tracks = body.tracks
    if (!Array.isArray(tracks)) return NextResponse.json({ ok: false, error: 'tracks debe ser un array' }, { status: 400 })
    for (const t of tracks) {
      if (typeof t?.topic !== 'string' || !t.topic.trim() || typeof t?.label !== 'string' || !t.label.trim()) {
        return NextResponse.json({ ok: false, error: 'cada tema necesita topic y label' }, { status: 400 })
      }
      if (!t.query?.trim() && !t.feedUrl?.trim()) return NextResponse.json({ ok: false, error: `"${t.label}" necesita una búsqueda o un link de RSS` }, { status: 400 })
    }
    const { error } = await supabase.from('news_config').upsert({ id: 'main', tracks, updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ ok: false, error: `${error.message} · corre sql/news-config.sql en Supabase` }, { status: 500 })
    try { revalidatePath('/api/news') } catch { /* no crítico: si falla, el cambio igual se ve en máximo 1h */ }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
