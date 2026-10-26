import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { taskToRow } from '@/lib/tareas'
import type { EpicaTask } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** Coherencia de la cascada Feature → Iniciativa → Tarea. Hay varias superficies que escriben una tarea
 *  (peek y ficha de Épicas, Tiempo), así que la regla vive AQUÍ y no sólo en cada cliente: una tarea no
 *  puede quedar en una iniciativa que (a) cuelga de OTRO feature, (b) es de OTRA épica, o (c) se queda sin
 *  feature. En esos casos se limpia SÓLO la iniciativa (el feature es el nivel de arriba y se respeta).
 *  Sólo actúa con evidencia: si la iniciativa todavía no existe en la BD (alta al vuelo cuyo POST va en
 *  paralelo) o falla la consulta (tabla sin migrar), no toca nada. Devuelve los ids que limpió. */
async function sanearIniciativas(rows: Record<string, unknown>[]): Promise<string[]> {
  const limpiadas: string[] = []
  try {
    const conIni = rows.filter(r => typeof r.iniciativa_id === 'string' && r.iniciativa_id)
    if (!conIni.length) return limpiadas
    const ids = [...new Set(conIni.map(r => r.iniciativa_id as string))]
    const { data, error } = await supabase.from('iniciativas').select('id,feature_id,epica_id').in('id', ids)
    if (error) return limpiadas
    const porId = new Map((data || []).map(r => [r.id as string, r as { feature_id: string | null; epica_id: string | null }]))
    for (const r of conIni) {
      const ini = porId.get(r.iniciativa_id as string)
      // La fila sólo trae feature_id si el cliente lo manda (gate de la migración): sin la clave, no hay con qué comparar.
      const traeFeature = 'feature_id' in r
      const sinFeature = traeFeature && !r.feature_id
      const otroFeature = !!ini && traeFeature && !!r.feature_id && ini.feature_id !== r.feature_id
      const otraEpica = !!ini && !!ini.epica_id && ini.epica_id !== r.epica_id
      if (sinFeature || otroFeature || otraEpica) { r.iniciativa_id = null; limpiadas.push(r.id as string) }
    }
  } catch { /* sin red de seguridad no se rompe el guardado: se escribe como vino */ }
  return limpiadas
}

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
    const iniciativasLimpiadas: string[] = []   // tareas cuya iniciativa no cuadraba con su feature (ver sanearIniciativas)

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
      const rows = create.map(t => taskToRow(t, epicaId))
      iniciativasLimpiadas.push(...await sanearIniciativas(rows))
      const { error } = await supabase.from('tareas').upsert(rows, { onConflict: 'id' })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    if (update.length) {
      const rows = update.map(t => taskToRow(t, epicaId))
      iniciativasLimpiadas.push(...await sanearIniciativas(rows))
      const { error } = await supabase.from('tareas').upsert(rows, { onConflict: 'id' })
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

    return NextResponse.json({ ok: true, conflicts, stamps, iniciativasLimpiadas })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
