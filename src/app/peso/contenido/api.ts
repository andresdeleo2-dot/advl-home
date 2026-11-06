// Llamadas del navegador a /api/peso/contenido/[id]. Devuelven siempre un resultado (nunca lanzan) con mensajes en español.

import type { Doc, DocId } from '@/lib/peso-contenido'

export type ErrorApi = { codigo?: string; mensaje: string }
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: ErrorApi }

const SIN_RED = 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
const GENERICO = 'No se pudo completar. Inténtalo de nuevo en un momento.'

async function llamar<T>(id: DocId, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const r = await fetch(`/api/peso/contenido/${id}`, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json' } })
    const j = (await r.json().catch(() => null)) as (T & { ok?: boolean; codigo?: string; error?: string }) | null
    if (r.ok && j?.ok) return { ok: true, data: j }
    return { ok: false, error: { codigo: j?.codigo, mensaje: typeof j?.error === 'string' ? j.error : GENERICO } }
  } catch {
    return { ok: false, error: { mensaje: SIN_RED } }
  }
}

export const guardarDocumento = (doc: Doc) => llamar<{ doc: Doc }>(doc.id, { method: 'PUT', body: JSON.stringify(doc) })
export const restaurarDocumento = (id: DocId) => llamar<{ doc: Doc }>(id, { method: 'DELETE' })
export const leerDocumento = (id: DocId) => llamar<{ doc: Doc; guardado: boolean; disponible: boolean }>(id)
