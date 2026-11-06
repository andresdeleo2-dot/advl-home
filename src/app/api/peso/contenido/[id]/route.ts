import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { MAX_BYTES_DOC, esDocId, normalizarDoc } from '@/lib/peso-contenido'
import { cargarContenido, guardarDoc, restaurarDoc, ERROR_LECTURA_CONTENIDO, type FalloContenido } from '@/lib/peso-contenido-server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_CUERPO = MAX_BYTES_DOC + 20_000
const idInvalido = () => NextResponse.json({ ok: false, error: 'Ese documento no existe.' }, { status: 404, headers: NO_STORE })
const revalidar = () => { try { revalidatePath('/peso') } catch { /* no crítico: el cliente además hace router.refresh() */ } }

/** Mensajes fijos en español: el detalle del error se queda en el log del servidor. */
function respuestaFallo(fallo: FalloContenido): NextResponse {
  if (fallo === 'sin_tabla') {
    return NextResponse.json({ ok: false, codigo: 'sin_tabla', error: 'Falta correr sql/peso-05-contenido.sql en Supabase para poder guardar.' }, { status: 503, headers: NO_STORE })
  }
  return NextResponse.json({ ok: false, error: 'No se pudo guardar. Inténtalo de nuevo en un momento.' }, { status: 500, headers: NO_STORE })
}

/** Lee el cuerpo SIN pasar de `max` bytes: corta la lectura en cuanto se excede. null = se pasó del tope. */
async function leerCuerpoAcotado(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null
  if (!req.body) return ''
  const lector = req.body.getReader()
  const trozos: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    total += value.byteLength
    if (total > max) { try { await lector.cancel() } catch { /* ya se cortó */ } return null }
    trozos.push(value)
  }
  const todo = new Uint8Array(total)
  let pos = 0
  for (const t of trozos) { todo.set(t, pos); pos += t.byteLength }
  return new TextDecoder().decode(todo)
}

// El documento vigente (guardado, o el original si no hay nada guardado).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esDocId(id)) return idInvalido()
  const c = await cargarContenido()
  // Con la lectura fallida `contenido` es el original, no lo guardado: no se hace pasar por la versión vigente.
  if (c.error) return NextResponse.json({ ok: false, error: ERROR_LECTURA_CONTENIDO }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ ok: true, doc: c.contenido[id], guardado: c.guardados[id], disponible: c.disponible }, { headers: NO_STORE })
}

// Guarda el documento completo (reemplaza al anterior). Pasa por normalizarDoc: lo que no encaja se descarta.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!esDocId(id)) return idInvalido()

    const crudo = await leerCuerpoAcotado(req, MAX_CUERPO)
    if (crudo === null) return NextResponse.json({ ok: false, error: 'El documento es demasiado grande.' }, { status: 413, headers: NO_STORE })
    let body: unknown
    try { body = JSON.parse(crudo) } catch { return NextResponse.json({ ok: false, error: 'La petición no es un JSON válido.' }, { status: 400, headers: NO_STORE }) }

    const doc = normalizarDoc(id, body)
    if (!doc) return NextResponse.json({ ok: false, error: 'La petición no tiene el formato esperado.' }, { status: 400, headers: NO_STORE })
    if (!doc.titulo.trim()) return NextResponse.json({ ok: false, error: 'El documento necesita un título.' }, { status: 400, headers: NO_STORE })
    if (JSON.stringify(doc).length > MAX_BYTES_DOC) return NextResponse.json({ ok: false, error: 'El documento es demasiado grande.' }, { status: 413, headers: NO_STORE })

    const r = await guardarDoc(doc)
    if (!r.ok) return respuestaFallo(r.fallo)
    revalidar()
    return NextResponse.json({ ok: true, doc }, { headers: NO_STORE })
  } catch (e) {
    console.error('[peso-contenido] PUT:', e instanceof Error ? e.message : String(e))
    return respuestaFallo('error')
  }
}

// «Restaurar original»: borra lo guardado; el documento vuelve a ser el de fábrica.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!esDocId(id)) return idInvalido()
    const r = await restaurarDoc(id)
    if (!r.ok) return respuestaFallo(r.fallo)
    revalidar()
    const c = await cargarContenido()
    return NextResponse.json({ ok: true, doc: c.contenido[id] }, { headers: NO_STORE })
  } catch (e) {
    console.error('[peso-contenido] DELETE:', e instanceof Error ? e.message : String(e))
    return respuestaFallo('error')
  }
}
