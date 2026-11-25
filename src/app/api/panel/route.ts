import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sumarDias } from '@/lib/dia'

export const dynamic = 'force-dynamic'

// Datos extra del Panel (Tu semana): salud (peso y si ya anotaste hoy) y personas importantes con quienes no hablas
// hace tiempo (Mi Vida, misma base). Cada parte se lee por separado: si una tabla falta, esa parte viene en null.
function hoyEnMexico(): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const v = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${v('year')}-${v('month')}-${v('day')}`
}
const dias = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 86400000)

export async function GET() {
  const hoy = hoyEnMexico()
  const [pesos, diario, personas] = await Promise.all([
    supabase.from('peso_registros').select('fecha,peso').not('peso', 'is', null).gte('fecha', sumarDias(hoy, -60)).order('fecha', { ascending: false }).limit(60),
    supabase.from('peso_diario').select('data').eq('fecha', hoy).maybeSingle(),
    supabase.from('personas').select('id,nombre,apodo,importancia,excepcional,ultima_vez,fallecio').or('importancia.gte.4,excepcional.eq.true'),
  ])

  let salud: null | { peso: number; fecha: string; cambioSemana: number | null; hace: number; anotadoHoy: boolean | null } = null
  if (!pesos.error && pesos.data?.length) {
    const ult = pesos.data[0] as { fecha: string; peso: number }
    const antes = (pesos.data as { fecha: string; peso: number }[]).find(r => r.fecha <= sumarDias(ult.fecha, -6))
    const d = diario.error ? null : (diario.data?.data as { comidas?: { items?: unknown[] }[]; ejercicio?: unknown[] } | null)
    salud = {
      peso: Number(ult.peso), fecha: ult.fecha, hace: dias(ult.fecha, hoy),
      cambioSemana: antes ? Math.round((Number(ult.peso) - Number(antes.peso)) * 10) / 10 : null,
      anotadoHoy: diario.error ? null : !!d && ((d.comidas || []).some(c => (c.items || []).length) || (d.ejercicio || []).length > 0),
    }
  }

  let sinContacto: null | { id: string; nombre: string; dias: number }[] = null
  if (!personas.error) {
    sinContacto = ((personas.data || []) as { id: string; nombre: string; apodo: string | null; ultima_vez: string | null; fallecio: boolean | null }[])
      .filter(p => !p.fallecio && p.ultima_vez && /^\d{4}-\d{2}-\d{2}/.test(p.ultima_vez))
      .map(p => ({ id: p.id, nombre: p.apodo?.trim() || p.nombre.split(' ')[0], dias: dias(p.ultima_vez!, hoy) }))
      .filter(p => p.dias >= 30).sort((a, b) => b.dias - a.dias).slice(0, 5)
  }
  return NextResponse.json({ ok: true, salud, sinContacto }, { headers: { 'Cache-Control': 'no-store' } })
}
