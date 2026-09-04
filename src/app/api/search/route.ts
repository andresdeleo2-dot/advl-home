import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** Búsqueda unificada (⌘K): tareas de Épicas + Accesos (bookmarks). Server-side con ILIKE — no hay
 *  tantas filas como para justificar un motor de búsqueda de verdad. Personas/Peso quedan fuera por
 *  ahora (Personas vive en la base de mi-vida, un cruce aparte; Peso no tiene nada "por nombre"). */
export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get('q') || '').trim()
    if (q.length < 2) return NextResponse.json({ ok: true, tasks: [], items: [] })
    const like = `%${q.replace(/[%_]/g, '')}%`

    const [tasksRes, itemsRes, epicasRes] = await Promise.all([
      supabase.from('tareas').select('id,titulo,estado,epica_id').ilike('titulo', like).neq('estado', 'Archivada').order('creada', { ascending: false }).limit(8),
      supabase.from('items').select('id,title,url,section').or(`title.ilike.${like},description.ilike.${like}`).limit(8),
      supabase.from('epicas').select('id,name,color').eq('archived', false),
    ])
    if (tasksRes.error) return NextResponse.json({ ok: false, error: tasksRes.error.message }, { status: 500 })
    if (itemsRes.error) return NextResponse.json({ ok: false, error: itemsRes.error.message }, { status: 500 })

    const epMap = new Map((epicasRes.data || []).map(e => [e.id as string, e as { name: string; color: string }]))
    const tasks = (tasksRes.data || []).map(t => ({
      id: t.id as string, title: t.titulo as string, status: t.estado as string, epicaId: t.epica_id as string,
      epicaName: epMap.get(t.epica_id as string)?.name || '', color: epMap.get(t.epica_id as string)?.color || '#8b8379',
    }))
    const items = (itemsRes.data || []).map(i => ({ id: i.id as string, title: i.title as string, url: i.url as string, section: i.section as string }))
    return NextResponse.json({ ok: true, tasks, items })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
