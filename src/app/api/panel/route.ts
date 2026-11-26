import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sumarDias } from '@/lib/dia'

export const dynamic = 'force-dynamic'

// Datos extra de Mi día: salud (peso y si ya anotaste hoy) y «Tu gente» (Mi Vida, misma base): cumpleaños de los
// próximos 30 días, aniversarios de momentos de las próximas 2 semanas y planes de las próximas 3 semanas.
// Cada parte se lee por separado: si una tabla falta, esa parte viene vacía.
function hoyEnMexico(): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const v = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${v('year')}-${v('month')}-${v('day')}`
}
const dias = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 86400000)

export async function GET() {
  const hoy = hoyEnMexico()
  const [pesos, diario, personas, momentos, planes] = await Promise.all([
    supabase.from('peso_registros').select('fecha,peso').not('peso', 'is', null).gte('fecha', sumarDias(hoy, -60)).order('fecha', { ascending: false }).limit(60),
    supabase.from('peso_diario').select('data').eq('fecha', hoy).maybeSingle(),
    supabase.from('personas').select('id,nombre,apodo,cumple,celular,importancia,excepcional').not('cumple', 'is', null).or('fallecio.is.null,fallecio.eq.false'),
    supabase.from('vida').select('id,titulo,tipo,fecha,personas,importancia').eq('es_personal', true).not('fecha', 'is', null),
    supabase.from('planes').select('id,titulo,tipo,fecha,hora_inicio,todo_el_dia,lugar_nombre,personas,estado').gte('fecha', hoy).lte('fecha', sumarDias(hoy, 21)).order('fecha'),
  ])

  let salud: null | { peso: number; fecha: string; cambioSemana: number | null; hace: number; anotadoHoy: boolean | null } = null
  if (!pesos.error && pesos.data?.length) {
    const ult = pesos.data[0] as { fecha: string; peso: number }
    const antes = (pesos.data as { fecha: string; peso: number }[]).find(r => r.fecha <= sumarDias(ult.fecha, -6) && r.fecha >= sumarDias(ult.fecha, -10))   // «en la semana»: una medición de hace 6–10 días; si no hay, no se inventa
    const d = diario.error ? null : (diario.data?.data as { comidas?: { items?: unknown[] }[]; ejercicio?: unknown[] } | null)
    salud = {
      peso: Number(ult.peso), fecha: ult.fecha, hace: dias(ult.fecha, hoy),
      cambioSemana: antes ? Math.round((Number(ult.peso) - Number(antes.peso)) * 10) / 10 : null,
      anotadoHoy: diario.error ? null : !!d && ((d.comidas || []).some(c => (c.items || []).length) || (d.ejercicio || []).length > 0),
    }
  }

  // Siguiente aniversario (mismo día y mes) de una fecha; null si cae fuera de la ventana.
  const proximo = (fecha: string, ventana: number) => {
    const md = fecha.slice(5, 10); if (!/^\d{2}-\d{2}$/.test(md)) return null
    let f = `${hoy.slice(0, 4)}-${md}`
    if (f < hoy) f = `${Number(hoy.slice(0, 4)) + 1}-${md}`
    const n = dias(hoy, f)
    return n >= 0 && n <= ventana ? { f, n, anios: Number(f.slice(0, 4)) - Number(fecha.slice(0, 4)) } : null
  }
  type Gente = { id: string; tipo: 'cumple' | 'momento' | 'plan'; fecha: string; dias: number; titulo: string; detalle: string | null; celular?: string | null }
  const gente: Gente[] = []
  if (!personas.error) for (const p of (personas.data || []) as { id: string; nombre: string; apodo: string | null; cumple: string; celular: string | null; importancia: number | null; excepcional: boolean | null }[]) {
    const x = proximo(p.cumple, 30); if (!x) continue
    const nombre = p.apodo?.trim() || p.nombre.split(' ')[0]
    const anioReal = Number(p.cumple.slice(0, 4)) > 1900   // algunos se guardan sin año real
    gente.push({ id: `c-${p.id}`, tipo: 'cumple', fecha: x.f, dias: x.n, titulo: `Cumple de ${nombre}`, detalle: anioReal && x.anios > 0 && x.anios < 110 ? `cumple ${x.anios}` : null, celular: p.celular })
  }
  if (!momentos.error) for (const m of (momentos.data || []) as { id: string; titulo: string; tipo: string; fecha: string; personas: string[] | null; importancia: number | null }[]) {
    if ((m.importancia ?? 0) < 5 || /^nace\b/i.test(m.titulo) || m.tipo === 'Cumpleaños') continue   // los nacimientos ya salen como cumpleaños
    const x = proximo(m.fecha, 14); if (!x || x.anios <= 0) continue
    const quien = (m.personas || []).filter(n => !/^andr[eé]s de velasco/i.test(n)).map(n => n.split(' ')[0]).slice(0, 3).join(', ')   // tú no cuentas
    gente.push({ id: `m-${m.id}`, tipo: 'momento', fecha: x.f, dias: x.n, titulo: m.titulo, detalle: [`hace ${x.anios} ${x.anios === 1 ? 'año' : 'años'}`, quien || null].filter(Boolean).join(' · ') })
  }
  if (!planes.error) for (const p of (planes.data || []) as { id: string; titulo: string; fecha: string; hora_inicio: string | null; todo_el_dia: boolean | null; lugar_nombre: string | null; personas: string[] | null; estado: string | null }[]) {
    if (p.estado === 'cancelado' || p.estado === 'hecho') continue
    const quien = (p.personas || []).map(n => n.split(' ')[0]).slice(0, 3).join(', ')
    gente.push({ id: `p-${p.id}`, tipo: 'plan', fecha: p.fecha, dias: dias(hoy, p.fecha), titulo: p.titulo, detalle: [!p.todo_el_dia && p.hora_inicio ? p.hora_inicio : null, quien ? `con ${quien}` : null, p.lugar_nombre, p.estado === 'idea' ? 'por confirmar' : null].filter(Boolean).join(' · ') || null })
  }
  const orden = { plan: 0, cumple: 1, momento: 2 }
  gente.sort((a, b) => a.dias - b.dias || orden[a.tipo] - orden[b.tipo])

  return NextResponse.json({ ok: true, salud, gente: gente.slice(0, 10) }, { headers: { 'Cache-Control': 'no-store' } })
}
