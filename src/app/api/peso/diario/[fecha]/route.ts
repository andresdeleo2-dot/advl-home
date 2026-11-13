import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { hoyMX } from '@/lib/peso'
import { fechaDeDiarioValida, normalizarDia } from '@/lib/peso-diario'
import { borrarDia, guardarDia, type FalloDiario } from '@/lib/peso-diario-server'
import { leerCuerpoAcotado } from '@/lib/leer-cuerpo-acotado'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_CUERPO = 40_000
const fechaInvalida = () => NextResponse.json({ ok: false, error: 'Esa fecha no es válida.' }, { status: 400, headers: NO_STORE })
const revalidar = () => { try { revalidatePath('/peso') } catch { /* no crítico: el cliente además hace router.refresh() */ } }

/** Mensajes fijos en español: el detalle del error se queda en el log del servidor. */
function respuestaFallo(fallo: FalloDiario): NextResponse {
  if (fallo === 'sin_tabla') {
    return NextResponse.json({ ok: false, codigo: 'sin_tabla', error: 'Falta correr sql/peso-06-diario.sql en Supabase para poder guardar.' }, { status: 503, headers: NO_STORE })
  }
  return NextResponse.json({ ok: false, error: 'No se pudo guardar. Inténtalo de nuevo en un momento.' }, { status: 500, headers: NO_STORE })
}

// Guarda el día completo (reemplaza al anterior de esa fecha). Pasa por normalizarDia: lo que no encaja se descarta.
export async function PUT(req: Request, { params }: { params: Promise<{ fecha: string }> }) {
  try {
    const { fecha } = await params
    if (!fechaDeDiarioValida(fecha, hoyMX())) return fechaInvalida()

    const crudo = await leerCuerpoAcotado(req, MAX_CUERPO)
    if (crudo === null) return NextResponse.json({ ok: false, error: 'El día es demasiado grande.' }, { status: 413, headers: NO_STORE })
    let body: unknown
    try { body = JSON.parse(crudo) } catch { return NextResponse.json({ ok: false, error: 'La petición no es un JSON válido.' }, { status: 400, headers: NO_STORE }) }

    const dia = normalizarDia(body, fecha)   // la fecha manda la de la dirección, no la del cuerpo
    if (!dia) return NextResponse.json({ ok: false, error: 'La petición no tiene el formato esperado.' }, { status: 400, headers: NO_STORE })

    const r = await guardarDia(dia)
    if (!r.ok) return respuestaFallo(r.fallo)
    revalidar()
    return NextResponse.json({ ok: true, dia }, { headers: NO_STORE })
  } catch (e) {
    console.error('[peso-diario] PUT:', e instanceof Error ? e.message : String(e))
    return respuestaFallo('error')
  }
}

// Borra lo anotado de ese día.
export async function DELETE(_req: Request, { params }: { params: Promise<{ fecha: string }> }) {
  try {
    const { fecha } = await params
    if (!fechaDeDiarioValida(fecha, hoyMX())) return fechaInvalida()
    const r = await borrarDia(fecha)
    if (!r.ok) return respuestaFallo(r.fallo)
    revalidar()
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) {
    console.error('[peso-diario] DELETE:', e instanceof Error ? e.message : String(e))
    return respuestaFallo('error')
  }
}
