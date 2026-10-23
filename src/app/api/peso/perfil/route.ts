import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { hoyMX } from '@/lib/peso'
import { validarPerfil } from '@/lib/peso-perfil'
import { cargarPerfil, guardarPerfil, ERROR_LECTURA_PERFIL, type FalloPerfil } from '@/lib/peso-perfil-server'

export const dynamic = 'force-dynamic'

// El perfil entero (con sus cuatro textos de 500 caracteres) cabe de sobra en 20 KB, aun con el escapado del JSON.
const MAX_CUERPO = 20_000
const DEMASIADO_GRANDE = { ok: false, error: 'La petición es demasiado grande.' }
const NO_STORE = { 'Cache-Control': 'no-store' }

/** Mensajes fijos en español: el detalle del error se queda en el log del servidor. */
function respuestaFallo(fallo: FalloPerfil): NextResponse {
  if (fallo === 'sin_tabla') {
    return NextResponse.json({ ok: false, codigo: 'sin_tabla', error: 'Falta correr sql/peso-04-perfil.sql en Supabase.' }, { status: 503, headers: NO_STORE })
  }
  return NextResponse.json({ ok: false, error: 'No se pudo guardar tu perfil. Inténtalo de nuevo en un momento.' }, { status: 500, headers: NO_STORE })
}

/** Lee el cuerpo SIN pasar de `max` bytes: corta la lectura en cuanto se excede (un cuerpo sin Content-Length, o
 *  que lo declare mal, no llega a ocupar memoria). null = se pasó del tope. */
async function leerCuerpoAcotado(req: Request, max: number): Promise<string | null> {
  const declarado = Number(req.headers.get('content-length') ?? 0)
  if (declarado > max) return null
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

// Perfil vigente. Si la tabla no existe responde 200 con disponible:false (como la página); si la lectura falla,
// 500 (no se manda el PERFIL_DEFAULT haciéndolo pasar por el guardado).
export async function GET() {
  try {
    const { error, ...estado } = await cargarPerfil()
    if (error) return NextResponse.json({ ok: false, error: ERROR_LECTURA_PERFIL }, { status: 500, headers: NO_STORE })
    return NextResponse.json({ ok: true, estado }, { headers: NO_STORE })
  } catch (e) {
    console.error('[peso-perfil] GET:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ ok: false, error: ERROR_LECTURA_PERFIL }, { status: 500, headers: NO_STORE })
  }
}

// Guarda el perfil completo (reemplaza al anterior): el mismo cuerpo que valida el formulario.
export async function PUT(req: Request) {
  try {
    const crudo = await leerCuerpoAcotado(req, MAX_CUERPO)
    if (crudo === null) return NextResponse.json(DEMASIADO_GRANDE, { status: 413, headers: NO_STORE })

    let body: unknown
    try { body = JSON.parse(crudo) } catch { return NextResponse.json({ ok: false, error: 'La petición no es un JSON válido.' }, { status: 400, headers: NO_STORE }) }

    const v = validarPerfil(body, hoyMX())
    if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400, headers: NO_STORE })

    const r = await guardarPerfil(v.valor)
    if (!r.ok) return respuestaFallo(r.fallo)

    try { revalidatePath('/peso') } catch { /* no crítico: el cliente además hace router.refresh() */ }
    return NextResponse.json({ ok: true, estado: r.estado }, { headers: NO_STORE })
  } catch (e) {
    console.error('[peso-perfil] PUT:', e instanceof Error ? e.message : String(e))
    return respuestaFallo('error')
  }
}
