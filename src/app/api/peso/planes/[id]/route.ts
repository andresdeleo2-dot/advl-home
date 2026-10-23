import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { MAX_DESCRIPCION, MAX_TITULO, esUuid, normalizarTipo } from '@/lib/peso-planes'
import { modificarPlan, borrarPlan, respuestaFallo, type CambiosPlan } from '@/lib/peso-planes-server'

export const dynamic = 'force-dynamic'

const MAX_CUERPO = 20_000   // un PATCH solo lleva título, descripción, tipo y un booleano
const idInvalido = () => NextResponse.json({ ok: false, error: 'El identificador del plan no es válido.' }, { status: 400 })
const revalidar = () => { try { revalidatePath('/peso') } catch { /* no crítico */ } }

// Edita metadatos y/o el estado "en uso": { titulo?, descripcion?, tipo?, activo? }. Nunca devuelve el html.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!esUuid(id)) return idInvalido()

    const crudo = await req.text()
    if (crudo.length > MAX_CUERPO) return NextResponse.json({ ok: false, error: 'La petición es demasiado grande.' }, { status: 413 })
    let body: unknown
    try { body = JSON.parse(crudo) } catch { return NextResponse.json({ ok: false, error: 'La petición no es un JSON válido.' }, { status: 400 }) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'La petición no tiene el formato esperado.' }, { status: 400 })
    }
    const b = body as Record<string, unknown>
    const cambios: CambiosPlan = {}

    if (b.titulo !== undefined) {
      const t = typeof b.titulo === 'string' ? b.titulo.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : ''
      if (!t) return NextResponse.json({ ok: false, error: 'El título no puede quedar vacío.' }, { status: 400 })
      cambios.titulo = t.slice(0, MAX_TITULO)
    }
    if (b.descripcion !== undefined) {
      if (b.descripcion !== null && typeof b.descripcion !== 'string') {
        return NextResponse.json({ ok: false, error: 'La descripción debe ser texto.' }, { status: 400 })
      }
      const d = typeof b.descripcion === 'string' ? b.descripcion.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : ''
      cambios.descripcion = d ? d.slice(0, MAX_DESCRIPCION) : null
    }
    if (b.tipo !== undefined) {
      const tipo = normalizarTipo(b.tipo)
      if (!tipo) return NextResponse.json({ ok: false, error: 'El tipo debe ser «rutina», «dieta» u «otro».' }, { status: 400 })
      cambios.tipo = tipo
    }
    if (b.activo !== undefined) {
      if (typeof b.activo !== 'boolean') return NextResponse.json({ ok: false, error: '«activo» debe ser verdadero o falso.' }, { status: 400 })
      cambios.activo = b.activo
    }
    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ ok: false, error: 'No hay nada que cambiar.' }, { status: 400 })
    }

    const r = await modificarPlan(id, cambios)
    if (!r.ok) return respuestaFallo(r.fallo)
    revalidar()
    return NextResponse.json({ ok: true, plan: r.valor })
  } catch (e) {
    console.error('[peso-planes] PATCH:', e instanceof Error ? e.message : String(e))
    return respuestaFallo('error')
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!esUuid(id)) return idInvalido()
    const r = await borrarPlan(id)
    if (!r.ok) return respuestaFallo(r.fallo)
    revalidar()
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[peso-planes] DELETE:', e instanceof Error ? e.message : String(e))
    return respuestaFallo('error')
  }
}
