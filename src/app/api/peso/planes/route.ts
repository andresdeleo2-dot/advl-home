import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { validarNuevoPlan } from '@/lib/peso-planes'
import { listarPlanes, crearPlan, respuestaFallo } from '@/lib/peso-planes-server'

export const dynamic = 'force-dynamic'

// Vercel corta los cuerpos de más de ~4.5 MB antes de llegar aquí; este tope local hace lo mismo en
// desarrollo y evita leer a memoria algo enorme. El tope "de verdad" del HTML (4 MB) lo aplica
// validarNuevoPlan: aquí hay margen para el escapado del JSON (comillas, saltos de línea).
const MAX_CUERPO = 4_500_000
const DEMASIADO_GRANDE = { ok: false, error: 'El archivo es demasiado grande: el máximo es de 4 MB.' }

// Lista (sin el html). Si la tabla no existe responde 200 con disponible:false, igual que la página.
export async function GET() {
  const r = await listarPlanes()
  if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 500 })
  return NextResponse.json({ ok: true, planes: r.planes, disponible: r.disponible }, { headers: { 'Cache-Control': 'no-store' } })
}

// Sube un plan: { tipo?, titulo?, descripcion?, html, activar? }
export async function POST(req: Request) {
  try {
    // El tamaño se revisa antes de leer el cuerpo y de parsearlo (trabajo caro).
    const declarado = Number(req.headers.get('content-length') ?? 0)
    if (declarado > MAX_CUERPO) return NextResponse.json(DEMASIADO_GRANDE, { status: 413 })
    const crudo = await req.text()
    if (crudo.length > MAX_CUERPO) return NextResponse.json(DEMASIADO_GRANDE, { status: 413 })

    let body: unknown
    try { body = JSON.parse(crudo) } catch { return NextResponse.json({ ok: false, error: 'La petición no es un JSON válido.' }, { status: 400 }) }

    const v = validarNuevoPlan(body)
    if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: v.codigo === 'demasiado_grande' ? 413 : 400 })

    const r = await crearPlan(v.valor)
    if (!r.ok) return respuestaFallo(r.fallo)

    try { revalidatePath('/peso') } catch { /* no crítico */ }
    return NextResponse.json(
      { ok: true, plan: r.valor.plan, ...(r.valor.aviso ? { aviso: r.valor.aviso } : {}) },
      { status: 201 },
    )
  } catch (e) {
    console.error('[peso-planes] POST:', e instanceof Error ? e.message : String(e))
    return respuestaFallo('error')
  }
}
