import { NextResponse } from 'next/server'
import { cargarDiario, ERROR_LECTURA_DIARIO } from '@/lib/peso-diario-server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

// Todos los días anotados (la pantalla lo usa para revisar si ya existe la tabla y para volver a leer tras un fallo).
export async function GET() {
  const c = await cargarDiario()
  // Con la lectura fallida `dias` viene vacío: no se hace pasar por «aún no hay días».
  if (c.error) return NextResponse.json({ ok: false, error: ERROR_LECTURA_DIARIO }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ ok: true, dias: c.dias, disponible: c.disponible }, { headers: NO_STORE })
}
