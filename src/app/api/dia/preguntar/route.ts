import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { gemini, GeminiError } from '@/lib/gemini'
import { sumarDias, type DiaData } from '@/lib/dia'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// «Pregúntale a tu cerebro» (Panel): contesta con tus resúmenes de Mi día de los últimos 60 días, lo que anotaste en
// la página y el estado de tus épicas. Gemini (gratis, GEMINI_API_KEY). No ve tus notas de Obsidian completas:
// solo lo que Claude resumió cada madrugada.
function hoyEnMexico(): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const v = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${v('year')}-${v('month')}-${v('day')}`
}

export async function POST(req: Request) {
  let pregunta = ''
  try { pregunta = String((await req.json())?.pregunta || '').trim().slice(0, 500) } catch { /* cuerpo inválido */ }
  if (pregunta.length < 3) return NextResponse.json({ ok: false, error: 'Escribe una pregunta primero' }, { status: 400 })
  const hoy = hoyEnMexico()
  const [res, caps, ep, tar] = await Promise.all([
    supabase.from('dia_resumen').select('fecha,data').gte('fecha', sumarDias(hoy, -60)).order('fecha', { ascending: false }),
    supabase.from('dia_capturas').select('fecha,tipo,texto').gte('fecha', sumarDias(hoy, -60)).order('created_at', { ascending: false }).limit(60),
    supabase.from('epicas').select('id,name,status,archived'),
    supabase.from('tareas').select('epica_id,titulo,estado,done_at,plan,vence').or(`estado.not.in.(Terminada,Archivada),done_at.gte.${sumarDias(hoy, -30)}`).limit(400),
  ])
  if (res.error) return NextResponse.json({ ok: false, error: 'Todavía no hay resúmenes de Mi día.' }, { status: 500 })
  const nombre = new Map(((ep.data || []) as { id: string; name: string }[]).map(e => [e.id, e.name]))
  const L: string[] = [`HOY: ${hoy}`, '', '## Resúmenes de Mi día (fecha = día para el que se armó; el diario es del día anterior)']
  for (const r of (res.data || []) as { fecha: string; data: DiaData }[]) {
    const d = r.data
    L.push(`### ${r.fecha} (diario ${d.diario || '?'})`, `Frase: ${d.frase}`)
    if (d.hechos?.length) L.push(`Hechos: ${d.hechos.map(h => h.t + (h.nota ? ` [${h.nota}]` : '')).join('; ')}`)
    if (d.prioridades?.length) L.push(`Prioridades: ${d.prioridades.map(p => p.t).join('; ')}`)
    if (d.tarjetas?.length) L.push(`Pendientes propuestos: ${d.tarjetas.map(c => c.titulo).join('; ')}`)
    if (d.decisiones?.length) L.push(`Por decidir: ${d.decisiones.map(x => x.pregunta).join('; ')}`)
  }
  if (caps.data?.length) L.push('', '## Lo que anotó en la página', ...(caps.data as { fecha: string; tipo: string; texto: string }[]).map(c => `- ${c.fecha} (${c.tipo}): ${c.texto.slice(0, 600)}`))
  const tareas = (tar.data || []) as { epica_id: string; titulo: string; estado: string; done_at: string | null; plan: string | null; vence: string | null }[]
  L.push('', '## Tareas (épica | título | estado | terminada | agendada | vence)', ...tareas.slice(0, 300).map(t => `${nombre.get(t.epica_id) || '?'} | ${t.titulo} | ${t.estado} | ${t.done_at || '—'} | ${t.plan || '—'} | ${t.vence || '—'}`))
  const prompt = `Eres el asistente de Andrés. Contesta su pregunta SOLO con los datos de abajo (sus resúmenes diarios, lo que anotó y sus tareas). Español de México, de tú, claro y corto (máx. 6 líneas). Si no está en los datos, dilo y sugiere dónde buscar (su bóveda de Obsidian). No inventes. Devuelve JSON: {"respuesta": "...", "fuentes": ["fechas AAAA-MM-DD o nombres de notas/épicas que usaste"]}

PREGUNTA: ${pregunta}

${L.join('\n')}`
  try {
    const txt = await gemini(prompt, { json: true })
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}')
    const j = JSON.parse(a >= 0 ? txt.slice(a, b + 1) : txt) as { respuesta?: unknown; fuentes?: unknown }
    return NextResponse.json({ ok: true, respuesta: String(j.respuesta || '').slice(0, 2000), fuentes: Array.isArray(j.fuentes) ? j.fuentes.map(String).slice(0, 8) : [] })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof GeminiError ? `Gemini no respondió: ${e.message}` : 'No pude contestar ahora. Intenta de nuevo.' }, { status: 502 })
  }
}
