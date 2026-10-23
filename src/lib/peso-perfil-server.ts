// Acceso a la tabla peso_perfil desde el servidor (service key). Lo usan la página /peso, la ruta del análisis con IA
// y /api/peso/perfil. CONTRATO: `cargarPerfil` NUNCA lanza; si la tabla no existe devuelve disponible:false y el
// perfil por defecto (PERFIL_DEFAULT = lo que valía antes de que existiera el perfil).
//
// Son datos de salud: los errores se registran en el log del servidor SOLO con código y mensaje (nunca el perfil
// ni los textos libres), y al cliente solo llegan categorías con mensajes fijos en español.

import { supabase } from '@/lib/supabase'
import { hoyMX } from '@/lib/peso'
import { PERFIL_DEFAULT, validarPerfil, type PerfilEstado, type PesoPerfil } from '@/lib/peso-perfil'

/** Lo que devuelve `cargarPerfil`: un PerfilEstado más `error`, que NO es lo mismo que «tabla inexistente»:
 *  distingue «la lectura falló» (red, proyecto pausado…) de «aún no hay perfil». Con error, `perfil` es el
 *  PERFIL_DEFAULT pero no se sabe si hay uno guardado: la página no debe invitar a sobrescribirlo ni comparar la
 *  huella del análisis contra «sin perfil». Es un PerfilEstado válido: quien no lo necesite lo ignora. */
export type PerfilCarga = PerfilEstado & { error: string | null }

export const ERROR_LECTURA_PERFIL = 'No se pudo leer tu perfil guardado.'

/** Columnas que se leen (sin `id`): explícitas para que una columna agregada a futuro no se cuele al cliente. */
const COLUMNAS = 'estatura_cm,fecha_nacimiento,sexo,actividad,dias_entrenamiento,experiencia,equipo,comidas_dia,alcohol,sueno_horas,lesiones,restricciones,preferencias,notas_salud,updated_at'

type ErrorSb = { code?: string | null; message?: string | null } | null | undefined

/** ¿El error de Supabase significa «la tabla peso_perfil no existe»? Por código (42P01 de Postgres, PGRST205 de
 *  PostgREST) o, si no hay código útil, por un mensaje que mencione la tabla Y que no exista / no esté en el schema
 *  cache. Un mensaje que solo diga «peso_perfil» no basta: el de un check violado también lo contiene. */
export function esErrorSinTabla(error: unknown): boolean {
  const e = error as ErrorSb
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  if (typeof e.code === 'string' && /^23/.test(e.code)) return false   // violaciones de integridad
  const msg = String(e.message ?? '')
  return /peso_perfil/i.test(msg) && /(does not exist|no existe|schema cache|could not find|not found)/i.test(msg)
}

const SIN_TABLA: PerfilCarga = { perfil: PERFIL_DEFAULT, configurado: false, disponible: false, actualizado: null, error: null }
const NO_LEIDO: PerfilCarga = { perfil: PERFIL_DEFAULT, configurado: false, disponible: true, actualizado: null, error: ERROR_LECTURA_PERFIL }

/** Una fila de la tabla → PesoPerfil válido. Pasa por validarPerfil (los mismos límites que el formulario) para
 *  tolerar filas viejas o editadas a mano; si solo la fecha de nacimiento es la inválida se descarta ella y se
 *  conserva el resto (mejor perder la edad que todo el perfil). null = la fila no tiene arreglo. */
function normalizarFila(fila: unknown): PesoPerfil | null {
  const hoy = hoyMX()
  const r = validarPerfil(fila, hoy)
  if (r.ok) return r.valor
  if (fila && typeof fila === 'object') {
    const sinFecha = validarPerfil({ ...(fila as Record<string, unknown>), fecha_nacimiento: null }, hoy)
    if (sinFecha.ok) return sinFecha.valor
  }
  return null
}

const marca = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** Lee el perfil guardado. NUNCA lanza. */
export async function cargarPerfil(): Promise<PerfilCarga> {
  try {
    const { data, error } = await supabase.from('peso_perfil').select(COLUMNAS).eq('id', 'main').maybeSingle()
    if (error) {
      if (esErrorSinTabla(error)) return { ...SIN_TABLA }
      console.error('[peso-perfil] leer:', error.code ?? '', error.message ?? '')
      return { ...NO_LEIDO }
    }
    if (!data) return { perfil: PERFIL_DEFAULT, configurado: false, disponible: true, actualizado: null, error: null }
    const perfil = normalizarFila(data)
    if (!perfil) {
      // Hay una fila pero no se pudo interpretar: se trata como lectura fallida (no como «sin perfil») para no
      // invitar a sobrescribirla sin que se sepa por qué.
      console.error('[peso-perfil] leer: la fila guardada no es válida')
      return { ...NO_LEIDO }
    }
    return { perfil, configurado: true, disponible: true, actualizado: marca((data as { updated_at?: unknown }).updated_at), error: null }
  } catch (e) {
    if (esErrorSinTabla(e)) return { ...SIN_TABLA }
    console.error('[peso-perfil] leer (excepción):', e instanceof Error ? e.message : String(e))
    return { ...NO_LEIDO }
  }
}

export type FalloPerfil = 'sin_tabla' | 'error'
export type ResGuardarPerfil = { ok: true; estado: PerfilEstado } | { ok: false; fallo: FalloPerfil }

/** Guarda el perfil (upsert de la fila 'main'). `valor` debe venir ya validado con validarPerfil. NUNCA lanza. */
export async function guardarPerfil(valor: PesoPerfil): Promise<ResGuardarPerfil> {
  try {
    const { data, error } = await supabase
      .from('peso_perfil')
      .upsert({ id: 'main', ...valor }, { onConflict: 'id' })
      .select(COLUMNAS)
      .single()
    if (error || !data) {
      if (error && esErrorSinTabla(error)) return { ok: false, fallo: 'sin_tabla' }
      console.error('[peso-perfil] guardar:', error?.code ?? '', error?.message ?? 'sin fila de vuelta')
      return { ok: false, fallo: 'error' }
    }
    // Lo guardado es `valor` (ya normalizado); de la base solo se toma la marca de tiempo que puso el trigger.
    return { ok: true, estado: { perfil: valor, configurado: true, disponible: true, actualizado: marca((data as { updated_at?: unknown }).updated_at) } }
  } catch (e) {
    if (esErrorSinTabla(e)) return { ok: false, fallo: 'sin_tabla' }
    console.error('[peso-perfil] guardar (excepción):', e instanceof Error ? e.message : String(e))
    return { ok: false, fallo: 'error' }
  }
}
