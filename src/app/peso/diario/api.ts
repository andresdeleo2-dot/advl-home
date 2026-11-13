// Llamadas del navegador a /api/peso/diario. Devuelven siempre un resultado (nunca lanzan) con mensajes en español.

import type { DiaDiario } from '@/lib/peso-diario'

export type ErrorApi = { codigo?: string; mensaje: string }
export type Resultado<T> = { ok: true; data: T } | { ok: false; error: ErrorApi }

const SIN_RED = 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
const GENERICO = 'No se pudo completar. Inténtalo de nuevo en un momento.'

async function llamar<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const r = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json' } })
    const j = (await r.json().catch(() => null)) as (T & { ok?: boolean; codigo?: string; error?: string }) | null
    if (r.ok && j?.ok) return { ok: true, data: j }
    return { ok: false, error: { codigo: j?.codigo, mensaje: typeof j?.error === 'string' ? j.error : GENERICO } }
  } catch {
    return { ok: false, error: { mensaje: SIN_RED } }
  }
}

export const guardarDiaApi = (dia: DiaDiario) => llamar<{ dia: DiaDiario }>(`/api/peso/diario/${dia.fecha}`, { method: 'PUT', body: JSON.stringify(dia) })
export const borrarDiaApi = (fecha: string) => llamar<Record<string, never>>(`/api/peso/diario/${fecha}`, { method: 'DELETE' })
export const leerDiarioApi = () => llamar<{ dias: DiaDiario[]; disponible: boolean }>('/api/peso/diario')
