import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { taskToRow } from '@/lib/tareas'
import type { EpicaTask } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** Aplica un diff de tareas de UNA épica: sólo lo que cambió.
 *  Antes cada edición reescribía el array completo de la épica (y dos pestañas
 *  se pisaban); ahora se tocan únicamente los renglones afectados.
 *  Body: { epicaId, create: EpicaTask[], update: EpicaTask[], remove: string[] } */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const epicaId: string = body.epicaId
    if (!epicaId) return NextResponse.json({ ok: false, error: 'epicaId es obligatorio' }, { status: 400 })

    const create: EpicaTask[] = Array.isArray(body.create) ? body.create : []
    const update: EpicaTask[] = Array.isArray(body.update) ? body.update : []
    const remove: string[] = Array.isArray(body.remove) ? body.remove : []

    if (remove.length) {
      const { error } = await supabase.from('tareas').delete().in('id', remove).eq('epica_id', epicaId)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    if (create.length) {
      const { error } = await supabase.from('tareas').insert(create.map(t => taskToRow(t, epicaId)))
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    if (update.length) {
      // upsert: si otra pestaña la borró, se vuelve a crear en vez de fallar
      const { error } = await supabase.from('tareas').upsert(update.map(t => taskToRow(t, epicaId)), { onConflict: 'id' })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, counts: { create: create.length, update: update.length, remove: remove.length } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
