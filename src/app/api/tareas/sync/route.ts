import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { taskToRow } from '@/lib/tareas'
import type { EpicaTask } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** Aplica un diff de tareas de UNA épica: sólo lo que cambió.
 *  Además detecta choques entre pestañas: si una tarea que vas a actualizar fue
 *  modificada en otro lado desde que la cargaste (su updated_at es más nuevo que
 *  el que traes), NO la sobrescribe y la reporta en `conflicts`.
 *  Body: { epicaId, create, update, remove } — create/update = EpicaTask[]. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const epicaId: string = body.epicaId
    if (!epicaId) return NextResponse.json({ ok: false, error: 'epicaId es obligatorio' }, { status: 400 })

    const create: EpicaTask[] = Array.isArray(body.create) ? body.create : []
    let update: EpicaTask[] = Array.isArray(body.update) ? body.update : []
    const remove: string[] = Array.isArray(body.remove) ? body.remove : []
    const conflicts: string[] = []

    // Choque: comparar el updated_at que trae el cliente contra el de la BD
    if (update.length) {
      const ids = update.map(t => t.id).filter(Boolean) as string[]
      const { data: cur } = await supabase.from('tareas').select('id,updated_at').in('id', ids)
      const dbStamp = new Map((cur || []).map(r => [r.id as string, r.updated_at as string]))
      update = update.filter(t => {
        const db = t.id ? dbStamp.get(t.id) : undefined
        if (!db) {
          // No existe en BD. Si el cliente la tenía cargada (updatedAt), fue BORRADA en
          // otra pestaña → conflicto: NO la resucites con el upsert. Sin base → se permite.
          if (t.updatedAt) { conflicts.push(t.id!); return false }
          return true
        }
        // Base más vieja que la BD → otra pestaña ganó: se reporta y no se escribe.
        if (t.updatedAt && new Date(db).getTime() > new Date(t.updatedAt).getTime()) { conflicts.push(t.id!); return false }
        return true
      })
    }

    if (remove.length) {
      const { error } = await supabase.from('tareas').delete().in('id', remove).eq('epica_id', epicaId)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    if (create.length) {
      // upsert (no insert plano) para ser IDEMPOTENTE: si el id ya existe (mover tarea
      // entre épicas con dos patch en carrera, o un reintento tras fallo parcial) no choca
      // la PK; reasigna epica_id. El .eq('epica_id') del delete evita borrar la ya movida.
      const { error } = await supabase.from('tareas').upsert(create.map(t => taskToRow(t, epicaId)), { onConflict: 'id' })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    if (update.length) {
      const { error } = await supabase.from('tareas').upsert(update.map(t => taskToRow(t, epicaId)), { onConflict: 'id' })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    // Devuelve los updated_at frescos de lo escrito, para que el cliente actualice
    // su base y no choque consigo mismo en la siguiente edición.
    const touched = [...create.map(t => t.id), ...update.map(t => t.id)].filter(Boolean) as string[]
    const stamps: Record<string, string> = {}
    if (touched.length) {
      const { data } = await supabase.from('tareas').select('id,updated_at').in('id', touched)
      for (const r of data || []) stamps[r.id as string] = r.updated_at as string
    }

    return NextResponse.json({ ok: true, conflicts, stamps })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
