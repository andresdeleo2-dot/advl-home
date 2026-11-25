import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sumarDias, type DiaGet, type DiaData, type DiaAprendido } from '@/lib/dia'

export const dynamic = 'force-dynamic'

// «Mi día»: lee lo que armó el cierre de la madrugada (dia_resumen) y guarda lo que respondes en la página.
// Las tareas NO se escriben aquí: la página usa /api/tareas/sync (mismo candado de choques que Épicas).
// Tablas en sql/dia-01.sql; sin ellas GET responde disponible:false y la página lo explica.

const NO_STORE = { 'Cache-Control': 'no-store' }
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const sinTabla = (e?: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))

function hoyEnMexico(): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const v = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${v('year')}-${v('month')}-${v('day')}`
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('fecha') || ''
  const fecha = FECHA.test(q) ? q : hoyEnMexico()
  const desde = sumarDias(fecha, -6)

  const [res, resp, cier, sem, kv, caps] = await Promise.all([
    supabase.from('dia_resumen').select('data,tokens,procesado_at').eq('fecha', fecha).maybeSingle(),
    supabase.from('dia_respuestas').select('item_id,tipo,estado,respuesta,tarea_id,aplicada_at').eq('fecha', fecha),
    supabase.from('dia_cierre').select('fecha,calificacion').gte('fecha', sumarDias(fecha, -60)).lte('fecha', fecha).order('fecha'),
    supabase.from('dia_resumen').select('fecha,data').gte('fecha', desde).lte('fecha', fecha).order('fecha', { ascending: false }),
    supabase.from('dia_kv').select('clave,data').in('clave', ['corrida', 'boveda']),
    supabase.from('dia_capturas').select('id', { count: 'exact', head: true }).is('procesada_at', null),
  ])

  if (sinTabla(res.error)) {
    const vacio: DiaGet = { ok: true, disponible: false, fecha, resumen: null, respuestas: [], cierres: [], semana: [], corrida: null, boveda: null, capturasPendientes: 0 }
    return NextResponse.json(vacio, { headers: NO_STORE })
  }
  const err = [res, resp, cier, sem, kv].find(r => r.error)?.error
  if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500, headers: NO_STORE })

  // Tu cerebro: decisiones y respuestas de los últimos 14 días, con la nota donde quedaron.
  const aprendido: DiaAprendido[] = []
  {
    const [rs, ress] = await Promise.all([
      supabase.from('dia_respuestas').select('id,fecha,item_id,tipo,estado,respuesta,aplicada_at').in('tipo', ['decision', 'cerebro', 'mover']).in('estado', ['respondida', 'aceptada']).gte('fecha', sumarDias(fecha, -14)).lte('fecha', fecha).order('created_at', { ascending: false }),
      supabase.from('dia_resumen').select('fecha,data').gte('fecha', sumarDias(fecha, -14)).lte('fecha', fecha),
    ])
    const porFecha = new Map(((ress.data || []) as { fecha: string; data: DiaData }[]).map(r => [r.fecha, r.data]))
    for (const r of (rs.data || []) as { id: string; fecha: string; item_id: string; tipo: string; respuesta: Record<string, unknown> | null; aplicada_at: string | null }[]) {
      const d = porFecha.get(r.fecha)
      const src = r.tipo === 'decision' ? d?.decisiones?.find(x => x.id === r.item_id) : r.tipo === 'cerebro' ? d?.cerebro?.find(x => x.id === r.item_id) : d?.tarjetas?.find(x => x.id === r.item_id)
      if (!src) continue
      const pregunta = 'pregunta' in src ? src.pregunta : src.titulo
      const respuesta = r.tipo === 'mover' ? `mover a ${String(r.respuesta?.destino || '')}` : String(r.respuesta?.texto || '')
      if (!respuesta) continue
      const nota = String(r.respuesta?.guardado_en || ('nota' in src ? src.nota || '' : '')) || undefined
      aprendido.push({ id: r.id, fecha: r.fecha, tipo: r.tipo, pregunta, respuesta, nota, guardadoAt: r.aplicada_at })
    }
  }

  const kvMap = new Map((kv.data || []).map(r => [r.clave as string, r.data]))
  const out: DiaGet = {
    ok: true,
    disponible: true,
    fecha,
    resumen: res.data ? { data: res.data.data, tokens: res.data.tokens, procesado_at: res.data.procesado_at } : null,
    respuestas: (resp.data || []) as DiaGet['respuestas'],
    cierres: (cier.data || []) as DiaGet['cierres'],
    semana: (sem.data || []) as DiaGet['semana'],
    corrida: (kvMap.get('corrida') as DiaGet['corrida']) ?? null,
    boveda: (kvMap.get('boveda') as DiaGet['boveda']) ?? null,
    capturasPendientes: caps.count ?? 0,
    aprendido,
  }
  return NextResponse.json(out, { headers: NO_STORE })
}

const ESTADOS = new Set(['aceptada', 'pospuesta', 'descartada', 'respondida'])
const TIPOS_CAPTURA = new Set(['nota', 'cierre', 'pregunta', 'tarea'])

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'cuerpo inválido' }, { status: 400 }) }
  const fecha = typeof body.fecha === 'string' && FECHA.test(body.fecha) ? body.fecha : null
  if (!fecha) return NextResponse.json({ ok: false, error: 'fecha inválida' }, { status: 400 })

  if (body.accion === 'responder') {
    const itemId = typeof body.itemId === 'string' ? body.itemId.slice(0, 120) : ''
    const estado = String(body.estado || '')
    if (!itemId || !ESTADOS.has(estado)) return NextResponse.json({ ok: false, error: 'respuesta inválida' }, { status: 400 })
    // Deshacer = borrar la respuesta.
    if (body.deshacer) {
      const { error } = await supabase.from('dia_respuestas').delete().eq('id', `${fecha}:${itemId}`)
      return error ? NextResponse.json({ ok: false, error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
    }
    const fila = {
      id: `${fecha}:${itemId}`, fecha, item_id: itemId,
      tipo: String(body.tipo || 'tarjeta').slice(0, 30), estado,
      respuesta: body.respuesta ?? null,
      tarea_id: typeof body.tareaId === 'string' && /^[0-9a-f-]{36}$/i.test(body.tareaId) ? body.tareaId : null,
      aplicada_at: null,
    }
    const { error } = await supabase.from('dia_respuestas').upsert(fila, { onConflict: 'id' })
    return error ? NextResponse.json({ ok: false, error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  if (body.accion === 'captura') {
    const texto = typeof body.texto === 'string' ? body.texto.trim() : ''
    const tipo = TIPOS_CAPTURA.has(String(body.tipo)) ? String(body.tipo) : 'nota'
    if (!texto) return NextResponse.json({ ok: false, error: 'escribe algo primero' }, { status: 400 })
    if (texto.length > 20000) return NextResponse.json({ ok: false, error: 'es demasiado largo (máx. 20 mil caracteres)' }, { status: 400 })
    const { error } = await supabase.from('dia_capturas').insert({ fecha, tipo, texto })
    return error ? NextResponse.json({ ok: false, error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  if (body.accion === 'cierre') {
    const n = Number(body.calificacion)
    if (!Number.isInteger(n) || n < 1 || n > 10) return NextResponse.json({ ok: false, error: 'calificación de 1 a 10' }, { status: 400 })
    const { error } = await supabase.from('dia_cierre').upsert({ fecha, calificacion: n, updated_at: new Date().toISOString() }, { onConflict: 'fecha' })
    return error ? NextResponse.json({ ok: false, error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'acción desconocida' }, { status: 400 })
}
