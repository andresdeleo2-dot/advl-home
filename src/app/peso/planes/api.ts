// Cliente de /api/peso/planes: una sola puerta para hablar con el servidor. Nunca lanza: devuelve
// { ok:false, error } con un mensaje claro en español (red caída, sesión vencida, archivo muy grande,
// falta la tabla…) para que la interfaz solo tenga que mostrarlo.

import { MAX_HTML_BYTES, type PesoPlanMeta, type PlanTipo } from '@/lib/peso-planes'
import { aMeta, aMetaLista, bytesDe, fmtBytes } from './util'

export type ErrorApi = { mensaje: string; codigo?: string; status?: number }
export type Resp<T> = { ok: true; data: T } | { ok: false; error: ErrorApi }

const MSG_SIN_TABLA = 'Falta crear la tabla de planes en Supabase: corre sql/peso-03-planes.sql y vuelve a intentar.'

function mensajeDe(status: number, j: Record<string, unknown> | null): string {
  const serv = j && typeof j.error === 'string' && j.error.trim() ? j.error.trim() : ''
  if (status === 503 && j?.codigo === 'sin_tabla') return MSG_SIN_TABLA
  if (status === 413) return `El archivo es demasiado grande para subirlo (máximo ${fmtBytes(MAX_HTML_BYTES)}).`
  if (status === 401 || status === 403) return 'Tu sesión venció o no tienes permiso. Recarga la página e inicia sesión de nuevo.'
  if (status === 404) return serv || 'Ese documento ya no existe. Recarga la página para ver la lista al día.'
  if (status === 400 || status === 422) return serv || 'Los datos enviados no son válidos. Revísalos e intenta de nuevo.'
  if (serv) return serv
  if (status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en un momento.'
  return 'No se pudo completar la acción. Intenta de nuevo.'
}

async function llamar(url: string, init: RequestInit, timeoutMs: number): Promise<Resp<Record<string, unknown>>> {
  let r: Response
  try {
    r = await fetch(url, { ...init, credentials: 'same-origin', signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    const tardo = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return {
      ok: false,
      error: { mensaje: tardo ? 'Tardó demasiado en responder. Revisa tu conexión e intenta de nuevo.' : 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.' },
    }
  }
  let j: Record<string, unknown> | null = null
  try {
    const crudo: unknown = await r.json()
    j = crudo && typeof crudo === 'object' ? (crudo as Record<string, unknown>) : null
  } catch { /* no era JSON (p. ej. el 413 que responde la plataforma antes de llegar a la ruta) */ }
  if (r.ok && j && j.ok !== false) return { ok: true, data: j }
  return { ok: false, error: { mensaje: mensajeDe(r.status, j), codigo: typeof j?.codigo === 'string' ? j.codigo : undefined, status: r.status } }
}

const JSON_HDR = { 'content-type': 'application/json' }
/** Las rutas de Vercel aceptan ~4.5 MB de cuerpo. Escapar comillas y saltos de línea en el JSON engorda el HTML,
 *  así que un archivo de 3.9 MB puede pasarse: se avisa aquí, sin gastar la subida, en vez de recibir un 413 pelón. */
const MAX_CUERPO_BYTES = 4_500_000
const RESP_RARA: ErrorApi = { mensaje: 'Se guardó, pero la respuesta del servidor no se pudo leer. Recarga la página para ver la lista al día.', codigo: 'respuesta' }

export async function listarPlanes(): Promise<Resp<{ planes: PesoPlanMeta[]; disponible: boolean }>> {
  const r = await llamar('/api/peso/planes', { cache: 'no-store' }, 20_000)
  if (!r.ok) return r
  return { ok: true, data: { planes: aMetaLista(r.data.planes), disponible: r.data.disponible !== false } }
}

/** `aviso`: el servidor guardó el plan pero no pudo dejarlo «en uso» (u otro detalle no fatal). */
export async function crearPlan(body: { tipo: PlanTipo; titulo?: string; descripcion?: string; html: string; activar?: boolean }): Promise<Resp<{ plan: PesoPlanMeta; aviso: string | null }>> {
  const cuerpo = JSON.stringify(body)
  const bytes = bytesDe(cuerpo)
  if (bytes > MAX_CUERPO_BYTES) {
    return {
      ok: false,
      error: {
        status: 413,
        mensaje: `Con el formato de envío este archivo pesa ${fmtBytes(bytes)} y el servidor acepta hasta ${fmtBytes(MAX_CUERPO_BYTES)}. Quítale imágenes incrustadas o recorta el HTML.`,
      },
    }
  }
  const r = await llamar('/api/peso/planes', { method: 'POST', headers: JSON_HDR, body: cuerpo }, 90_000)
  if (!r.ok) return r
  const plan = aMeta(r.data.plan)
  const aviso = typeof r.data.aviso === 'string' && r.data.aviso.trim() ? r.data.aviso.trim() : null
  return plan ? { ok: true, data: { plan, aviso } } : { ok: false, error: RESP_RARA }
}

export async function actualizarPlan(id: string, cambios: { titulo?: string; descripcion?: string; tipo?: PlanTipo; activo?: boolean }): Promise<Resp<PesoPlanMeta>> {
  const r = await llamar(`/api/peso/planes/${encodeURIComponent(id)}`, { method: 'PATCH', headers: JSON_HDR, body: JSON.stringify(cambios) }, 30_000)
  if (!r.ok) return r
  const plan = aMeta(r.data.plan)
  return plan ? { ok: true, data: plan } : { ok: false, error: RESP_RARA }
}

export async function eliminarPlan(id: string): Promise<Resp<null>> {
  const r = await llamar(`/api/peso/planes/${encodeURIComponent(id)}`, { method: 'DELETE' }, 30_000)
  return r.ok ? { ok: true, data: null } : r
}
