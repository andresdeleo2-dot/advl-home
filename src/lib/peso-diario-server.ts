// Acceso a la tabla peso_diario desde el servidor (service key): una fila por día anotado. CONTRATO: `cargarDiario`
// NUNCA lanza. Si la tabla no existe (falta correr sql/peso-06-diario.sql) devuelve disponible:false: la pantalla se ve,
// solo no se puede guardar. Si la lectura falla por otra causa devuelve `error` (no se hace pasar por «aún no hay días»).

import { supabase } from '@/lib/supabase'
import { normalizarDia, type DiaDiario, type DiarioCarga } from '@/lib/peso-diario'

export const ERROR_LECTURA_DIARIO = 'No se pudo leer tu diario. Lo que tenías guardado no se borró.'

/** PostgREST entrega como máximo 1,000 filas por consulta: se leen los 1,000 días más recientes (más de dos años y medio). */
const MAX_DIAS = 1000

type ErrorSb = { code?: string | null; message?: string | null } | null | undefined

/** ¿El error significa «la tabla peso_diario no existe»? Por código (42P01 de Postgres, PGRST205 de PostgREST) o, sin código útil, por el mensaje. */
export function esErrorSinTablaDiario(error: unknown): boolean {
  const e = error as ErrorSb
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  if (typeof e.code === 'string' && /^23/.test(e.code)) return false
  const msg = String(e.message ?? '')
  return /peso_diario/i.test(msg) && /(does not exist|no existe|schema cache|could not find|not found)/i.test(msg)
}

/** Lee los días anotados (en orden de fecha). NUNCA lanza. */
export async function cargarDiario(): Promise<DiarioCarga> {
  try {
    const { data, error } = await supabase.from('peso_diario').select('fecha,data').order('fecha', { ascending: false }).limit(MAX_DIAS)
    if (error) {
      if (esErrorSinTablaDiario(error)) return { dias: [], disponible: false }
      console.error('[peso-diario] leer:', error.code ?? '', error.message ?? '')
      return { dias: [], disponible: true, error: ERROR_LECTURA_DIARIO }
    }
    const dias: DiaDiario[] = []
    for (const fila of (data ?? []) as { fecha: string; data: unknown }[]) {
      const d = normalizarDia(fila.data, String(fila.fecha).slice(0, 10))
      if (d) dias.push(d); else console.error('[peso-diario] leer: día no válido:', fila.fecha)
    }
    return { dias: dias.reverse(), disponible: true }
  } catch (e) {
    if (esErrorSinTablaDiario(e)) return { dias: [], disponible: false }
    console.error('[peso-diario] leer (excepción):', e instanceof Error ? e.message : String(e))
    return { dias: [], disponible: true, error: ERROR_LECTURA_DIARIO }
  }
}

export type FalloDiario = 'sin_tabla' | 'error'
export type ResDiario = { ok: true } | { ok: false; fallo: FalloDiario }

/** Guarda un día (upsert por fecha). `dia` debe venir ya normalizado con normalizarDia. NUNCA lanza. */
export async function guardarDia(dia: DiaDiario): Promise<ResDiario> {
  try {
    const { error } = await supabase.from('peso_diario').upsert({ fecha: dia.fecha, data: dia }, { onConflict: 'fecha' })
    if (error) {
      if (esErrorSinTablaDiario(error)) return { ok: false, fallo: 'sin_tabla' }
      console.error('[peso-diario] guardar:', error.code ?? '', error.message ?? '')
      return { ok: false, fallo: 'error' }
    }
    return { ok: true }
  } catch (e) {
    if (esErrorSinTablaDiario(e)) return { ok: false, fallo: 'sin_tabla' }
    console.error('[peso-diario] guardar (excepción):', e instanceof Error ? e.message : String(e))
    return { ok: false, fallo: 'error' }
  }
}

/** Borra un día anotado. NUNCA lanza. */
export async function borrarDia(fecha: string): Promise<ResDiario> {
  try {
    const { error } = await supabase.from('peso_diario').delete().eq('fecha', fecha)
    if (error) {
      if (esErrorSinTablaDiario(error)) return { ok: false, fallo: 'sin_tabla' }
      console.error('[peso-diario] borrar:', error.code ?? '', error.message ?? '')
      return { ok: false, fallo: 'error' }
    }
    return { ok: true }
  } catch (e) {
    if (esErrorSinTablaDiario(e)) return { ok: false, fallo: 'sin_tabla' }
    console.error('[peso-diario] borrar (excepción):', e instanceof Error ? e.message : String(e))
    return { ok: false, fallo: 'error' }
  }
}
