// Acceso a la tabla peso_contenido desde el servidor (service key): la rutina, la dieta y el plan maestro que se
// editan en /peso. CONTRATO: `cargarContenido` NUNCA lanza. Si la tabla no existe (falta correr
// sql/peso-05-contenido.sql) devuelve los documentos de fábrica con disponible:false: todo se ve, solo no se puede
// guardar. Lo guardado gana sobre el original; borrarlo («Restaurar original») vuelve al original.

import { supabase } from '@/lib/supabase'
import { DOC_IDS, normalizarDoc, type ContenidoCarga, type Doc, type DocId } from '@/lib/peso-contenido'
import { CONTENIDO_DEFAULT } from '@/lib/peso-contenido-default'

export const ERROR_LECTURA_CONTENIDO = 'No se pudo leer lo guardado; se muestra el original.'

type ErrorSb = { code?: string | null; message?: string | null } | null | undefined

/** ¿El error significa «la tabla peso_contenido no existe»? Por código (42P01 de Postgres, PGRST205 de PostgREST)
 *  o, sin código útil, por un mensaje que mencione la tabla Y que no exista / no esté en el schema cache. */
export function esErrorSinTablaContenido(error: unknown): boolean {
  const e = error as ErrorSb
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  if (typeof e.code === 'string' && /^23/.test(e.code)) return false
  const msg = String(e.message ?? '')
  return /peso_contenido/i.test(msg) && /(does not exist|no existe|schema cache|could not find|not found)/i.test(msg)
}

const original = (disponible: boolean, error?: string): ContenidoCarga => ({
  contenido: CONTENIDO_DEFAULT,
  guardados: { rutina: false, dieta: false, plan: false },
  disponible,
  ...(error ? { error } : {}),
})

/** Lee los documentos guardados y los mezcla con los de fábrica. NUNCA lanza. */
export async function cargarContenido(): Promise<ContenidoCarga> {
  try {
    const { data, error } = await supabase.from('peso_contenido').select('id,data').in('id', DOC_IDS)
    if (error) {
      if (esErrorSinTablaContenido(error)) return original(false)
      console.error('[peso-contenido] leer:', error.code ?? '', error.message ?? '')
      return original(true, ERROR_LECTURA_CONTENIDO)
    }
    const res = original(true)
    const contenido = { ...CONTENIDO_DEFAULT }
    for (const fila of (data ?? []) as { id: string; data: unknown }[]) {
      if (!(DOC_IDS as string[]).includes(fila.id)) continue
      const id = fila.id as DocId
      const doc = normalizarDoc(id, fila.data)
      if (!doc || doc.id !== id) { console.error('[peso-contenido] leer: el documento guardado no es válido:', id); continue }
      ;(contenido as Record<DocId, Doc>)[id] = doc
      res.guardados[id] = true
    }
    return { ...res, contenido }
  } catch (e) {
    if (esErrorSinTablaContenido(e)) return original(false)
    console.error('[peso-contenido] leer (excepción):', e instanceof Error ? e.message : String(e))
    return original(true, ERROR_LECTURA_CONTENIDO)
  }
}

export type FalloContenido = 'sin_tabla' | 'error'
export type ResContenido = { ok: true } | { ok: false; fallo: FalloContenido }

/** Guarda un documento (upsert por id). `doc` debe venir ya normalizado con normalizarDoc. NUNCA lanza. */
export async function guardarDoc(doc: Doc): Promise<ResContenido> {
  try {
    const { error } = await supabase.from('peso_contenido').upsert({ id: doc.id, data: doc }, { onConflict: 'id' })
    if (error) {
      if (esErrorSinTablaContenido(error)) return { ok: false, fallo: 'sin_tabla' }
      console.error('[peso-contenido] guardar:', error.code ?? '', error.message ?? '')
      return { ok: false, fallo: 'error' }
    }
    return { ok: true }
  } catch (e) {
    if (esErrorSinTablaContenido(e)) return { ok: false, fallo: 'sin_tabla' }
    console.error('[peso-contenido] guardar (excepción):', e instanceof Error ? e.message : String(e))
    return { ok: false, fallo: 'error' }
  }
}

/** Borra lo guardado de un documento: la página vuelve a mostrar el original. NUNCA lanza. */
export async function restaurarDoc(id: DocId): Promise<ResContenido> {
  try {
    const { error } = await supabase.from('peso_contenido').delete().eq('id', id)
    if (error) {
      if (esErrorSinTablaContenido(error)) return { ok: false, fallo: 'sin_tabla' }
      console.error('[peso-contenido] restaurar:', error.code ?? '', error.message ?? '')
      return { ok: false, fallo: 'error' }
    }
    return { ok: true }
  } catch (e) {
    if (esErrorSinTablaContenido(e)) return { ok: false, fallo: 'sin_tabla' }
    console.error('[peso-contenido] restaurar (excepción):', e instanceof Error ? e.message : String(e))
    return { ok: false, fallo: 'error' }
  }
}
