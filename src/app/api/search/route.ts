import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Fila = Record<string, unknown>
// Fuentes secundarias (features/iniciativas/ideas): si fallan o su tabla aún no existe, la búsqueda sigue sin ellas.
const filasOVacio = (r: { data: unknown; error: unknown }): Fila[] => (r.error ? [] : ((r.data as Fila[]) || []))

/** Búsqueda unificada (⌘K): tareas, features, iniciativas e ideas de Épicas + Accesos (bookmarks).
 *  Server-side con ILIKE — no hay tantas filas como para justificar un motor de búsqueda de verdad.
 *  Personas/Peso quedan fuera por ahora (Personas vive en la base de mi-vida, un cruce aparte;
 *  Peso no tiene nada "por nombre"). */
export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get('q') || '').trim()
    if (q.length < 2) return NextResponse.json({ ok: true, tasks: [], items: [], features: [], iniciativas: [], ideas: [] })
    // Sin comodines ni "\" (escape de LIKE: uno al final rompe el patrón). Cada campo va en su propio
    // .ilike(): dentro de .or() una coma o un paréntesis del texto partía el filtro de PostgREST.
    const like = `%${q.replace(/[%_\\]/g, '')}%`

    const [tasksRes, itemsTitleRes, itemsDescRes, featRes, iniRes, ideasRes, epicasRes] = await Promise.all([
      supabase.from('tareas').select('id,titulo,estado,epica_id').ilike('titulo', like).neq('estado', 'Archivada').order('creada', { ascending: false }).limit(8),
      supabase.from('items').select('id,title,url,section').ilike('title', like).limit(8),
      supabase.from('items').select('id,title,url,section').ilike('description', like).limit(8),
      supabase.from('features').select('id,epica_id,t,estado').ilike('t', like).limit(6),
      supabase.from('iniciativas').select('id,feature_id,epica_id,nombre,estado').ilike('nombre', like).limit(6),
      supabase.from('ideas').select('id,texto,creada,tarea_id').ilike('texto', like).eq('descartada', false).order('creada', { ascending: false }).limit(6),
      supabase.from('epicas').select('id,name,color,archived'),
    ])
    if (tasksRes.error) return NextResponse.json({ ok: false, error: tasksRes.error.message }, { status: 500 })
    if (itemsTitleRes.error) return NextResponse.json({ ok: false, error: itemsTitleRes.error.message }, { status: 500 })

    const epMap = new Map((epicasRes.data || []).map(e => [e.id as string, e as { name: string; color: string; archived: boolean }]))
    const epActiva = (id: unknown) => { const e = epMap.get(id as string); return e && !e.archived ? e : undefined }
    const tasks = (tasksRes.data || []).map(t => ({
      id: t.id as string, title: t.titulo as string, status: t.estado as string, epicaId: t.epica_id as string,
      epicaName: epMap.get(t.epica_id as string)?.name || '', color: epMap.get(t.epica_id as string)?.color || '#8b8379',
    }))

    // Primero los que coinciden por título, luego por descripción; sin repetir el mismo acceso.
    const vistos = new Set<string>()
    const items = [...(itemsTitleRes.data || []), ...filasOVacio(itemsDescRes)]
      .filter(i => { const id = String(i.id); if (vistos.has(id)) return false; vistos.add(id); return true })
      .slice(0, 8)
      .map(i => ({ id: String(i.id), title: i.title as string, url: i.url as string, section: i.section as string }))

    const featRows = filasOVacio(featRes).filter(f => epActiva(f.epica_id))
    const iniRows = filasOVacio(iniRes).filter(i => epActiva(i.epica_id))
    // Nombre del feature padre de cada iniciativa (featRows sólo trae los features que coinciden con q).
    const featNombre = new Map(featRows.map(f => [f.id as string, f.t as string]))
    const faltan = [...new Set(iniRows.map(i => i.feature_id as string))].filter(id => id && !featNombre.has(id))
    if (faltan.length) {
      const { data } = await supabase.from('features').select('id,t').in('id', faltan)
      for (const f of data || []) featNombre.set(f.id as string, f.t as string)
    }

    const enc = encodeURIComponent
    const features = featRows.map(f => {
      const ep = epActiva(f.epica_id)!
      return {
        id: f.id as string, title: (f.t as string) || '', estado: (f.estado as string) || '',
        epicaId: f.epica_id as string, epicaName: ep.name, color: ep.color || '#8b8379',
        href: `/epicas?e=${enc(f.epica_id as string)}&fe=${enc(f.id as string)}`,
      }
    })
    const iniciativas = iniRows.map(i => {
      const ep = epActiva(i.epica_id)!
      return {
        id: i.id as string, title: (i.nombre as string) || '', estado: (i.estado as string) || '',
        featureId: i.feature_id as string, featureName: featNombre.get(i.feature_id as string) || '',
        epicaId: i.epica_id as string, epicaName: ep.name, color: ep.color || '#8b8379',
        // Épicas › pestaña Objetivos con esa iniciativa seleccionada (os=i:<feature>:<iniciativa>).
        href: `/epicas?e=${enc(i.epica_id as string)}&et=obj&os=${enc(`i:${i.feature_id}:${i.id}`)}`,
      }
    })
    const ideas = filasOVacio(ideasRes).map(i => ({
      id: i.id as string, title: (i.texto as string) || '', creada: (i.creada as string) || '', convertida: !!i.tarea_id, href: '/ideas',
    }))

    return NextResponse.json({ ok: true, tasks, items, features, iniciativas, ideas })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
