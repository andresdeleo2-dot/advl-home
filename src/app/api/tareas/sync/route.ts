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

    let create: EpicaTask[] = Array.isArray(body.create) ? body.create : []
    let update: EpicaTask[] = Array.isArray(body.update) ? body.update : []
    const remove: string[] = Array.isArray(body.remove) ? body.remove : []
    const conflicts: string[] = []

    // Choque: comparar el updated_at que trae el cliente contra el de la BD. Se aplica a UPDATE y
    // también a CREATE (mover una tarea entre épicas viaja como create con su updatedAt): así una
    // edición reciente en otra pestaña no se pisa con la versión vieja del que mueve.
    const allIds = [...create, ...update].map(t => t.id).filter(Boolean) as string[]
    const dbStamp = new Map<string, string>()
    if (allIds.length) {
      const { data: cur } = await supabase.from('tareas').select('id,updated_at').in('id', allIds)
      for (const r of cur || []) dbStamp.set(r.id as string, r.updated_at as string)
    }
    // La BD tiene una versión MÁS NUEVA que la base del cliente → otra pestaña ganó.
    const staleClash = (t: EpicaTask) => { const db = t.id ? dbStamp.get(t.id) : undefined; return !!(db && t.updatedAt && new Date(db).getTime() > new Date(t.updatedAt).getTime()) }
    update = update.filter(t => {
      const db = t.id ? dbStamp.get(t.id) : undefined
      // No existe en BD → fue BORRADA en otra pestaña/dispositivo. Un UPDATE nunca debe re-insertarla
      // (el upsert lo haría). Se reporta como conflicto y no se escribe — así el autoguardado forzado
      // del editor (que quita `updatedAt`) ya no puede "resucitar" una tarea borrada.
      if (!db) { conflicts.push(t.id!); return false }
      if (staleClash(t)) { conflicts.push(t.id!); return false }
      return true
    })
    // CREATE: una tarea NUEVA (sin updatedAt) siempre pasa. Una MOVIDA (existe en BD) cuyo updatedAt
    // quedó viejo respecto a la BD → otra pestaña la editó → conflicto (no la pises con lo viejo).
    create = create.filter(t => { if (staleClash(t)) { conflicts.push(t.id!); return false } return true })

    // ORDEN: create/update PRIMERO, remove AL FINAL. Antes el delete se commiteaba primero y, si el
    // create/update fallaba después (error transitorio/valor inválido), la tarea quedaba borrada en
    // la BD pero "viva" en la UI (revert local) → desaparecía al recargar. Ahora, si algo falla
    // antes del remove, retornamos y el borrado no se aplica.
    if (create.length) {
      // upsert (no insert plano) para ser IDEMPOTENTE: si el id ya existe (mover tarea entre épicas
      // o reintento tras fallo parcial) no choca la PK; reasigna epica_id.
      const { error } = await supabase.from('tareas').upsert(create.map(t => taskToRow(t, epicaId)), { onConflict: 'id' })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    if (update.length) {
      const { error } = await supabase.from('tareas').upsert(update.map(t => taskToRow(t, epicaId)), { onConflict: 'id' })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    if (remove.length) {
      const { error } = await supabase.from('tareas').delete().in('id', remove).eq('epica_id', epicaId)
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
