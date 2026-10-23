// Acceso a la tabla peso_planes desde el servidor (service key). Lo usan la página /peso y las rutas
// /api/peso/planes. CONTRATO: `listarPlanes` nunca lanza; si la tabla no existe devuelve disponible:false.
//
// Convención de las operaciones de escritura: devuelven { ok:true, valor } o { ok:false, fallo }, donde
// `fallo` es una categoría ('sin_tabla' | 'no_existe' | 'conflicto' | 'error'). Los detalles del error
// se registran en el log del servidor y NUNCA llegan al cliente (`respuestaFallo` manda mensajes fijos).

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { NuevoPlanValido, PesoPlanMeta, PlanTipo, PlanesLista } from '@/lib/peso-planes'

/** Columnas de los metadatos: NUNCA incluye `html` (pesa hasta varios MB). */
const COLUMNAS_META = 'id,tipo,titulo,descripcion,bytes,activo,created_at,updated_at'

type ErrorSb = { code?: string | null; message?: string | null } | null | undefined

/** ¿El error de Supabase significa "la tabla peso_planes no existe"? Se detecta por código
 *  (42P01 de Postgres, PGRST205 de PostgREST) o, si no hay código útil, por un mensaje que mencione la
 *  tabla Y que no exista / no esté en el schema cache. Un mensaje que solo diga "peso_planes" no basta:
 *  el de una violación del índice único también lo contiene. */
export function esErrorSinTabla(error: unknown): boolean {
  const e = error as ErrorSb
  if (!e) return false
  if (e.code === '42P01' || e.code === 'PGRST205') return true
  if (typeof e.code === 'string' && /^23/.test(e.code)) return false   // violaciones de integridad
  const msg = String(e.message ?? '')
  return /peso_planes/i.test(msg) && /(does not exist|no existe|schema cache|could not find|not found)/i.test(msg)
}

export type Fallo = 'sin_tabla' | 'no_existe' | 'conflicto' | 'error'
export type Res<T> = { ok: true; valor: T } | { ok: false; fallo: Fallo }

/** Registra el error (solo código y mensaje, jamás el html ni llaves) y lo clasifica. */
function falla(contexto: string, error?: ErrorSb | unknown): { ok: false; fallo: Fallo } {
  const e = error as ErrorSb
  if (error && esErrorSinTabla(error)) return { ok: false, fallo: 'sin_tabla' }
  console.error(`[peso-planes] ${contexto}:`, e?.code ?? '', e?.message ?? (error ? String(error) : ''))
  if (e?.code === '23505') return { ok: false, fallo: 'conflicto' }   // el índice único "uno en uso por tipo"
  return { ok: false, fallo: 'error' }
}

/** Respuesta JSON estándar para un fallo de escritura/lectura de la API. */
export function respuestaFallo(fallo: Fallo): NextResponse {
  switch (fallo) {
    case 'sin_tabla':
      return NextResponse.json({ ok: false, codigo: 'sin_tabla', error: 'Falta correr sql/peso-03-planes.sql en Supabase.' }, { status: 503 })
    case 'no_existe':
      return NextResponse.json({ ok: false, codigo: 'no_existe', error: 'Ese plan no existe (¿ya lo borraste?).' }, { status: 404 })
    case 'conflicto':
      return NextResponse.json({ ok: false, codigo: 'conflicto', error: 'Otro cambio se cruzó con este. Recarga la lista e inténtalo de nuevo.' }, { status: 409 })
    default:
      return NextResponse.json({ ok: false, error: 'No se pudo completar la operación. Inténtalo de nuevo en un momento.' }, { status: 500 })
  }
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/** Lista los planes (sin html), el más reciente primero. NUNCA lanza. */
export async function listarPlanes(): Promise<PlanesLista> {
  try {
    const { data, error } = await supabase
      .from('peso_planes')
      .select(COLUMNAS_META)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      if (esErrorSinTabla(error)) return { planes: [], disponible: false }
      console.error('[peso-planes] listar:', error.code ?? '', error.message ?? '')
      return { planes: [], disponible: true, error: 'No se pudieron cargar tus rutinas y dietas.' }
    }
    return { planes: (data ?? []) as PesoPlanMeta[], disponible: true }
  } catch (e) {
    if (esErrorSinTabla(e)) return { planes: [], disponible: false }
    console.error('[peso-planes] listar (excepción):', e instanceof Error ? e.message : String(e))
    return { planes: [], disponible: true, error: 'No se pudieron cargar tus rutinas y dietas.' }
  }
}

/** El documento de un plan, para servirlo en /html. Es lo ÚNICO que trae la columna html. */
export async function obtenerPlanHtml(id: string): Promise<Res<{ titulo: string; html: string }>> {
  try {
    const { data, error } = await supabase.from('peso_planes').select('titulo,html').eq('id', id).maybeSingle()
    if (error) return falla('html', error)
    if (!data || typeof data.html !== 'string') return { ok: false, fallo: 'no_existe' }
    return { ok: true, valor: { titulo: String(data.titulo ?? ''), html: data.html } }
  } catch (e) {
    return falla('html (excepción)', e)
  }
}

// ── Escritura ───────────────────────────────────────────────────────────────

/** Si algo falló a medias al activar, deja en uso lo que estaba (mejor esfuerzo, nunca lanza). */
async function restaurarActivos(ids: string[]) {
  if (!ids.length) return
  try { await supabase.from('peso_planes').update({ activo: true }).in('id', ids) } catch { /* mejor esfuerzo */ }
}

/** Deja este plan "en uso" y desactiva el que lo estaba en su tipo. Primero se desactiva y luego se
 *  activa (el índice único no admite dos activos ni por un instante); si la segunda mitad falla se
 *  restaura el anterior para no dejar al tipo sin plan en uso. */
export async function activarPlan(id: string, tipo: PlanTipo): Promise<Res<PesoPlanMeta>> {
  let previos: string[] = []
  try {
    const { data: desactivados, error: e1 } = await supabase
      .from('peso_planes').update({ activo: false })
      .eq('tipo', tipo).eq('activo', true).neq('id', id)
      .select('id')
    if (e1) return falla('activar:desactivar', e1)
    previos = ((desactivados ?? []) as { id: string }[]).map(r => r.id)

    const { data, error: e2 } = await supabase
      .from('peso_planes').update({ activo: true })
      .eq('id', id).eq('tipo', tipo)
      .select(COLUMNAS_META).maybeSingle()
    if (e2 || !data) {
      await restaurarActivos(previos)
      return e2 ? falla('activar:activar', e2) : { ok: false, fallo: 'no_existe' }
    }
    return { ok: true, valor: data as PesoPlanMeta }
  } catch (e) {
    await restaurarActivos(previos)
    return falla('activar (excepción)', e)
  }
}

/** Guarda un plan nuevo. Queda "en uso" si es el primero de su tipo o si se pidió `activar`. */
export async function crearPlan(v: NuevoPlanValido): Promise<Res<{ plan: PesoPlanMeta; aviso?: string }>> {
  try {
    // ¿Ya hay uno en uso de este tipo? Además, si falta la tabla se descubre aquí, con una consulta
    // chiquita, en vez de subir hasta 4 MB para nada.
    const { data: activos, error: eAct } = await supabase
      .from('peso_planes').select('id').eq('tipo', v.tipo).eq('activo', true).limit(1)
    if (eAct) return falla('crear:consulta', eAct)
    const hayActivo = (activos ?? []).length > 0

    const { data, error } = await supabase
      .from('peso_planes')
      .insert({ tipo: v.tipo, titulo: v.titulo, descripcion: v.descripcion, html: v.html, bytes: v.bytes, activo: false })
      .select(COLUMNAS_META).single()
    if (error || !data) return falla('crear:insert', error)
    let plan = data as PesoPlanMeta

    if (v.activar || !hayActivo) {
      const act = await activarPlan(plan.id, plan.tipo)
      if (act.ok) plan = act.valor
      else if (v.activar) {
        // El plan SÍ quedó guardado; solo no se pudo marcar en uso. Se avisa en vez de fallar.
        return { ok: true, valor: { plan, aviso: 'El plan se guardó, pero no se pudo dejar «en uso». Actívalo desde la lista.' } }
      }
    }
    return { ok: true, valor: { plan } }
  } catch (e) {
    return falla('crear (excepción)', e)
  }
}

export type CambiosPlan = { titulo?: string; descripcion?: string | null; tipo?: PlanTipo; activo?: boolean }

/** Edita título/descripción/tipo y/o el estado "en uso" de un plan. Cambiar de tipo lo deja sin uso
 *  (en el MISMO update: dejarlo activo chocaría con el índice único del tipo nuevo) salvo que se pida. */
export async function modificarPlan(id: string, c: CambiosPlan): Promise<Res<PesoPlanMeta>> {
  try {
    const { data: actual, error: e0 } = await supabase.from('peso_planes').select(COLUMNAS_META).eq('id', id).maybeSingle()
    if (e0) return falla('modificar:leer', e0)
    if (!actual) return { ok: false, fallo: 'no_existe' }
    let plan = actual as PesoPlanMeta

    const tipoFinal = c.tipo ?? plan.tipo
    const cambiaTipo = tipoFinal !== plan.tipo
    const campos: Record<string, unknown> = {}
    if (c.titulo !== undefined) campos.titulo = c.titulo
    if (c.descripcion !== undefined) campos.descripcion = c.descripcion
    if (cambiaTipo) { campos.tipo = tipoFinal; campos.activo = false }
    else if (c.activo === false) campos.activo = false

    if (Object.keys(campos).length) {
      const { data, error } = await supabase.from('peso_planes').update(campos).eq('id', id).select(COLUMNAS_META).maybeSingle()
      if (error) return falla('modificar:actualizar', error)
      if (!data) return { ok: false, fallo: 'no_existe' }
      plan = data as PesoPlanMeta
    }
    if (c.activo === true && !plan.activo) {
      const act = await activarPlan(id, tipoFinal)
      if (!act.ok) return act
      plan = act.valor
    }
    return { ok: true, valor: plan }
  } catch (e) {
    return falla('modificar (excepción)', e)
  }
}

/** Borra un plan. Si era el que estaba en uso, su tipo se queda sin plan en uso (no se elige otro solo). */
export async function borrarPlan(id: string): Promise<Res<true>> {
  try {
    const { data, error } = await supabase.from('peso_planes').delete().eq('id', id).select('id')
    if (error) return falla('borrar', error)
    if (!data || data.length === 0) return { ok: false, fallo: 'no_existe' }
    return { ok: true, valor: true }
  } catch (e) {
    return falla('borrar (excepción)', e)
  }
}
