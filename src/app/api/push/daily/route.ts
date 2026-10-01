import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import webpush from 'web-push'
import { supabase } from '@/lib/supabase'
import { VAPID_PUBLIC_KEY } from '@/lib/push'
import { esAndres, mmdd } from '@/lib/cumple'

export const dynamic = 'force-dynamic'   // un cron nunca se cachea

// Resumen diario por push: Vercel Cron lo llama a las 13:00 UTC = 7:00 en México (vercel.json; en
// Hobby puede caer en cualquier minuto de esa hora). ?dry=1 devuelve el resumen en JSON sin enviar.
// Cada sección lee su tabla por separado: si una tabla/columna no existe, esa sección se omite.

const CUENTAS_CON_ACCESO = ['andresdeleo2@gmail.com', 'andres@a-dvl.com']   // misma lista que src/middleware.ts
const PRIO: Record<string, number> = { alta: 0, media: 1, baja: 2 }
const DIAS_CLAVE = 3          // fechas clave que vencen en <= 3 días
const DIAS_SIN_PESO = 7
const MAX_LINEAS = 4
const PAGE = 1000

type Fila = Record<string, unknown>
type Tarea = { id: string; titulo: string; prioridad: string; plan: string | null; vence: string | null; planOrder: number; epica: string | null }
type Clave = { tipo: 'hito' | 'meta' | 'feature' | 'iniciativa'; titulo: string; fecha: string; dias: number; epica: string | null }

function hoyEnMexico(): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const v = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${v('year')}-${v('month')}-${v('day')}`
}
const fechaDe = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const utcDe = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const diasEntre = (desde: string, hasta: string) => Math.round((utcDe(hasta) - utcDe(desde)) / 86400000)
const corto = (s: unknown, n = 42) => { const t = String(s ?? '').trim() || 'Sin título'; return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t }
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const porPrioridad = (a: Tarea, b: Tarea) => (PRIO[a.prioridad] ?? 1) - (PRIO[b.prioridad] ?? 1)

const KIND: Record<Clave['tipo'], string> = { hito: 'Hito', meta: 'Meta', feature: 'Feature', iniciativa: 'Iniciativa' }
const VENCIDO: Record<Clave['tipo'], string> = { hito: 'Hito vencido', meta: 'Meta vencida', feature: 'Feature vencido', iniciativa: 'Iniciativa vencida' }

async function sesionDeAndres(req: NextRequest): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return false
  try {
    const sb = createServerClient(url, anon, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } })
    const { data: { user } } = await sb.auth.getUser()
    return !!user && CUENTAS_CON_ACCESO.includes((user.email ?? '').toLowerCase())
  } catch { return false }
}

// Tareas abiertas, paginadas (PostgREST corta en 1000). Si day_plans no existe, reintenta sin ella.
async function leerTareasAbiertas(): Promise<Fila[] | null> {
  const base = 'id, titulo, estado, prioridad, plan, plan_order, vence, epica_id'
  for (const cols of [`${base}, day_plans`, base]) {
    const filas: Fila[] = []
    let fallo = false
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from('tareas').select(cols)
        .not('estado', 'in', '("Terminada","Archivada")')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) { fallo = true; break }
      const page = (data || []) as unknown as Fila[]
      filas.push(...page)
      if (page.length < PAGE) break
    }
    if (!fallo) return filas
  }
  return null
}

// Todas las tareas (incl. Terminadas) de unas épicas: solo para métricas medidas con tareas cerradas.
async function leerEstadosTareas(epicaIds: string[]): Promise<Fila[] | null> {
  const filas: Fila[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('tareas').select('id, estado, epica_id')
      .in('epica_id', epicaIds)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return null
    const page = (data || []) as unknown as Fila[]
    filas.push(...page)
    if (page.length < PAGE) return filas
  }
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
// Espejo de milestoneDone (components/epicas/core.tsx) y metricaCumplida (lib/hitos.ts): a mano, o meta alcanzada.
function metricaCumplida(o: Fila, tareasEpica: Fila[]): boolean {
  if (o.cumplido === true) return true
  let cur: number, target: number
  if (o.medir_con_tareas_cerradas === true) {
    const ids = Array.isArray(o.task_ids) ? o.task_ids.map(String) : []
    const base = ids.length ? tareasEpica.filter(t => ids.includes(String(t.id))) : tareasEpica.filter(t => t.estado !== 'Archivada')
    cur = base.filter(t => t.estado === 'Terminada').length
    target = num(o.target) ?? base.length
  } else {
    cur = num(o.current) ?? 0
    target = num(o.target) ?? 0
  }
  if (!target) return false
  return o.menos_es_mejor === true ? cur <= target : cur >= target
}

async function armarResumen(hoy: string) {
  const omitidas: string[] = []

  // Épicas: nombre + archivada. Sin la columna archived, todas cuentan como activas.
  let epicas: Map<string, { name: string; archived: boolean }> | null = null
  {
    let r = await supabase.from('epicas').select('id, name, archived')
    if (r.error) r = await supabase.from('epicas').select('id, name') as typeof r
    if (r.error) omitidas.push('epicas')
    else epicas = new Map(((r.data || []) as unknown as Fila[]).map(e => [String(e.id), { name: String(e.name ?? ''), archived: e.archived === true }]))
  }
  const epicaActiva = (id: unknown) => !epicas?.get(String(id))?.archived
  const nombreEpica = (id: unknown) => (id ? epicas?.get(String(id))?.name || null : null)

  // ── Tareas ──
  const enHoy: Tarea[] = [], arrastradas: Tarea[] = [], vencidas: Tarea[] = [], venceHoy: Tarea[] = []
  const filas = await leerTareasAbiertas()
  if (!filas) omitidas.push('tareas')
  for (const r of filas || []) {
    if (!epicaActiva(r.epica_id)) continue
    const t: Tarea = {
      id: String(r.id), titulo: String(r.titulo ?? ''), prioridad: String(r.prioridad || 'media'),
      plan: fechaDe(r.plan), vence: fechaDe(r.vence), planOrder: typeof r.plan_order === 'number' ? r.plan_order : 1e9,
      epica: nombreEpica(r.epica_id),
    }
    // Igual que Épicas: lo "En espera" no se planea ni se arrastra (vive en su bandeja), pero sí puede vencer.
    const esperando = r.estado === 'Esperando'
    const sesionHoy = Array.isArray(r.day_plans) && r.day_plans.some(d => !!d && typeof d === 'object' && (d as Fila).day === hoy && !(d as Fila).done)
    if (!esperando && (t.plan === hoy || sesionHoy)) enHoy.push(t)
    else if (!esperando && t.plan && t.plan < hoy) arrastradas.push(t)
    if (t.vence && t.vence < hoy) vencidas.push(t)
    else if (t.vence === hoy) venceHoy.push(t)
  }
  enHoy.sort((a, b) => porPrioridad(a, b) || (a.vence || '9999').localeCompare(b.vence || '9999') || a.planOrder - b.planOrder)
  arrastradas.sort((a, b) => porPrioridad(a, b) || (b.plan || '').localeCompare(a.plan || ''))
  vencidas.sort((a, b) => porPrioridad(a, b) || (b.vence || '').localeCompare(a.vence || ''))
  venceHoy.sort(porPrioridad)

  // ── Fechas clave (mismo criterio de "hecho"/"cerrado" que el Roadmap) ──
  const claves: Clave[] = []
  const [featRes, objRes, iniRes] = await Promise.all([
    supabase.from('features').select('id, t, epica_id, estado, fecha_fin_objetivo'),
    supabase.from('objetivos').select('id, t, tipo, epica_id, feature_id, fecha_objetivo, cumplido, hito_estado, target, current, menos_es_mejor, medir_con_tareas_cerradas, task_ids'),
    supabase.from('iniciativas').select('id, nombre, epica_id, feature_id, estado, fecha_fin_objetivo'),
  ])
  const feats = new Map<string, Fila>()
  if (featRes.error) omitidas.push('features')
  else for (const f of (featRes.data || []) as unknown as Fila[]) feats.set(String(f.id), f)
  const featCerrado = (id: unknown) => !!id && feats.get(String(id))?.estado === 'cerrado'
  const cerca = (v: unknown): number | null => { const f = fechaDe(v); if (!f) return null; const d = diasEntre(hoy, f); return d <= DIAS_CLAVE ? d : null }
  const agregar = (tipo: Clave['tipo'], titulo: unknown, fecha: unknown, epicaId: unknown) => {
    const dias = cerca(fecha)
    if (dias != null) claves.push({ tipo, titulo: String(titulo ?? ''), fecha: fechaDe(fecha)!, dias, epica: nombreEpica(epicaId) })
  }
  for (const f of feats.values()) {
    if ((f.estado || 'en_curso') === 'cerrado' || !epicaActiva(f.epica_id)) continue
    agregar('feature', f.t, f.fecha_fin_objetivo, f.epica_id)
  }
  if (objRes.error) omitidas.push('objetivos')
  else {
    const objs = ((objRes.data || []) as unknown as Fila[])
      .map(o => ({ o, epicaId: o.epica_id || feats.get(String(o.feature_id))?.epica_id }))
      .filter(({ o, epicaId }) => !featCerrado(o.feature_id) && epicaActiva(epicaId) && cerca(o.fecha_objetivo) != null)
    const autoEpicas = [...new Set(objs
      .filter(({ o, epicaId }) => epicaId && o.tipo !== 'hito' && o.cumplido !== true && o.medir_con_tareas_cerradas === true)
      .map(({ epicaId }) => String(epicaId)))]
    const estados = autoEpicas.length ? await leerEstadosTareas(autoEpicas) : []
    for (const { o, epicaId } of objs) {
      const esHito = o.tipo === 'hito'
      const hecho = esHito
        ? (o.hito_estado || (o.cumplido ? 'logrado' : 'pendiente')) === 'logrado'
        : metricaCumplida(o, (estados || []).filter(t => String(t.epica_id) === String(epicaId)))
      if (!hecho) agregar(esHito ? 'hito' : 'meta', o.t, o.fecha_objetivo, epicaId)
    }
  }
  if (iniRes.error) omitidas.push('iniciativas')
  else for (const i of (iniRes.data || []) as unknown as Fila[]) {
    if (i.estado === 'cerrada' || i.estado === 'cancelada' || featCerrado(i.feature_id) || !epicaActiva(i.epica_id)) continue
    agregar('iniciativa', i.nombre, i.fecha_fin_objetivo, i.epica_id)
  }
  claves.sort((a, b) => a.dias - b.dias)

  // ── Cumpleaños de hoy (mismo filtro de fallecidos que /api/cumples) ──
  let cumples: { nombre: string; esYo: boolean }[] = []
  {
    const anio = Number(hoy.slice(0, 4))
    const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
    // En años sin 29 de febrero, ese cumpleaños se avisa el 28.
    const diasCumple = hoy.slice(5) === '02-28' && !bisiesto ? ['02-28', '02-29'] : [hoy.slice(5)]
    const { data, error } = await supabase.from('personas').select('nombre, apodo, cumple')
      .not('cumple', 'is', null)
      .or('fallecio.is.null,fallecio.eq.false')
    if (error) omitidas.push('personas')
    else cumples = ((data || []) as unknown as Fila[])
      .filter(p => diasCumple.includes(mmdd(String(p.cumple ?? ''))))
      .map(p => ({ nombre: String(p.apodo ?? '').trim() || String(p.nombre ?? '').trim(), esYo: esAndres(String(p.nombre ?? '')) }))
      .filter(p => p.nombre)
  }

  // ── Peso: días desde la última medición ──
  let pesoDias: number | null = null
  {
    const { data, error } = await supabase.from('peso_registros').select('fecha').order('fecha', { ascending: false }).limit(1)
    if (error) omitidas.push('peso')
    else { const f = fechaDe((data?.[0] as Fila | undefined)?.fecha); if (f) pesoDias = diasEntre(f, hoy) }
  }

  // ── Armado del push ──
  const urgentes: { texto: string; tareaId?: string; vencida: boolean }[] = [
    ...claves.filter(c => c.dias === 0).map(c => ({ texto: `${KIND[c.tipo]} vence hoy: ${corto(c.titulo)}`, vencida: false })),
    ...venceHoy.map(t => ({ texto: `Vence hoy: ${corto(t.titulo)}`, tareaId: t.id, vencida: false })),
    ...vencidas.map(t => ({ texto: `Vencida: ${corto(t.titulo)}`, tareaId: t.id, vencida: true })),
    ...claves.filter(c => c.dias < 0).sort((a, b) => b.dias - a.dias).map(c => ({ texto: `${VENCIDO[c.tipo]}: ${corto(c.titulo)}`, vencida: true })),
  ]
  let lineaUrgente: string | null = null
  if (urgentes.length) {
    const [primero, ...resto] = urgentes
    const masHoy = resto.filter(u => !u.vencida).length, masVencidas = resto.filter(u => u.vencida).length
    const extra = [masHoy ? `+${masHoy} hoy` : '', masVencidas ? `+${plural(masVencidas, 'vencida', 'vencidas')}` : ''].filter(Boolean)
    lineaUrgente = `⚠️ ${primero.texto}${extra.length ? ' · ' + extra.join(' · ') : ''}`
  } else {
    const proximas = claves.filter(c => c.dias > 0)
    if (proximas.length) {
      const c = proximas[0]
      lineaUrgente = `🗓 ${KIND[c.tipo]} ${c.dias === 1 ? 'mañana' : `en ${c.dias} días`}: ${corto(c.titulo)}${proximas.length > 1 ? ` · +${proximas.length - 1}` : ''}`
    }
  }

  let lineaCumple: string | null = null
  if (cumples.length) {
    const yo = cumples.some(p => p.esYo)
    const otros = cumples.filter(p => !p.esYo).map(p => p.nombre)
    const lista = otros.length <= 2 ? otros.join(' y ') : `${otros.slice(0, 2).join(', ')} y ${otros.length - 2} más`
    lineaCumple = yo
      ? `🎂 ¡Hoy es tu cumpleaños!${otros.length ? ` También ${otros.length === 1 ? 'cumple' : 'cumplen'} ${lista}` : ''}`
      : `🎂 Hoy ${otros.length === 1 ? 'cumple' : 'cumplen'} ${lista}`
  }
  const lineaPeso = pesoDias != null && pesoDias >= DIAS_SIN_PESO ? `⚖️ Hace ${pesoDias} días que no te pesas` : null

  const primeroId = urgentes[0]?.tareaId
  const candidatas = [...enHoy.map(t => ({ t, pre: '• ' })), ...arrastradas.map(t => ({ t, pre: '↪ ' }))].filter(x => x.t.id !== primeroId)
  const fijas = [lineaUrgente, lineaCumple, lineaPeso].filter(Boolean).length
  const lineasTareas = candidatas.slice(0, Math.max(0, Math.min(3, MAX_LINEAS - fijas))).map(x => `${x.pre}${corto(x.t.titulo)}`)
  const lineas = [lineaUrgente, ...lineasTareas, lineaCumple, lineaPeso].filter((l): l is string => !!l)

  const partes: string[] = []
  if (enHoy.length) partes.push(plural(enHoy.length, 'tarea', 'tareas'))
  if (arrastradas.length) partes.push(plural(arrastradas.length, 'arrastrada', 'arrastradas'))
  if (!partes.length && vencidas.length) partes.push(plural(vencidas.length, 'vencida', 'vencidas'))
  if (!partes.length && venceHoy.length) partes.push(`${venceHoy.length} ${venceHoy.length === 1 ? 'vence' : 'vencen'} hoy`)
  // Sin tareas, una fecha clave de hoy o vencida también le gana a "Día libre" (es la línea ⚠️ del cuerpo).
  const clavesHoy = claves.filter(c => c.dias === 0), clavesVencidas = claves.filter(c => c.dias < 0)
  if (!partes.length && clavesHoy.length) partes.push(clavesHoy.length === 1 ? `1 ${KIND[clavesHoy[0].tipo].toLowerCase()} vence` : `${clavesHoy.length} fechas clave vencen`)
  if (!partes.length && clavesVencidas.length) partes.push(clavesVencidas.length === 1 ? `1 ${VENCIDO[clavesVencidas[0].tipo].toLowerCase()}` : `${clavesVencidas.length} fechas clave vencidas`)
  const title = partes.length ? `☀️ Hoy: ${partes.join(' · ')}`
    : filas ? '☀️ Día libre de pendientes'
    : '☀️ Tu resumen del día'   // sin tareas legibles no se puede afirmar que el día está libre
  const body = lineas.length ? lineas.join('\n') : (filas ? 'Nada planeado ni vencido para hoy.' : '')

  return {
    push: { title, body, tag: `daily-${hoy}`, url: '/epicas' },
    detalle: {
      hoy,
      conteos: { hoy: enHoy.length, arrastradas: arrastradas.length, vencidas: vencidas.length, venceHoy: venceHoy.length, fechasClave: claves.length },
      tareasHoy: enHoy.map(t => ({ titulo: t.titulo, prioridad: t.prioridad, epica: t.epica })),
      arrastradas: arrastradas.map(t => ({ titulo: t.titulo, plan: t.plan, epica: t.epica })),
      vencidas: vencidas.map(t => ({ titulo: t.titulo, vence: t.vence, epica: t.epica })),
      venceHoy: venceHoy.map(t => ({ titulo: t.titulo, epica: t.epica })),
      fechasClave: claves,
      cumpleanos: cumples.map(p => p.nombre),
      pesoDias,
      omitidas,
    },
  }
}

export async function GET(req: NextRequest) {
  // Mismo candado que /api/push/send (header de Vercel Cron o ?secret=), salvo sesión de Andrés: así
  // ?dry=1 se puede probar logueado desde el navegador sin exponer el secreto.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const qs = new URL(req.url).searchParams.get('secret') || ''
    if (auth !== `Bearer ${secret}` && qs !== secret && !(await sesionDeAndres(req))) {
      return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
    }
  }

  try {
    const { push, detalle } = await armarResumen(hoyEnMexico())
    if (new URL(req.url).searchParams.get('dry') === '1') return NextResponse.json({ ok: true, dry: true, sent: 0, push, detalle })

    const priv = process.env.VAPID_PRIVATE_KEY
    if (!priv) return NextResponse.json({ ok: true, sent: 0, motivo: 'falta VAPID_PRIVATE_KEY (push apagado)', push, detalle })
    const { data: subsRows, error: subsErr } = await supabase.from('push_subs').select('endpoint, sub')
    if (subsErr) return NextResponse.json({ ok: true, sent: 0, motivo: `no se pudo leer push_subs: ${subsErr.message}`, push, detalle })
    const subs = subsRows || []
    if (!subs.length) return NextResponse.json({ ok: true, sent: 0, motivo: 'no hay dispositivos suscritos', push, detalle })

    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:andres@a-dvl.com', VAPID_PUBLIC_KEY, priv)
    const payload = JSON.stringify(push)
    const deadEndpoints = new Set<string>()
    // TTL de 12 h: un resumen "de hoy" que llega pasado mañana (teléfono sin señal) ya no sirve.
    const results = await Promise.allSettled(subs.map(s => webpush.sendNotification(s.sub as unknown as webpush.PushSubscription, payload, { TTL: 12 * 60 * 60 })
      .then(() => true)
      .catch((err: unknown) => {
        const code = (err as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) deadEndpoints.add(s.endpoint as string)   // suscripción muerta
        return false
      })))
    const sent = results.filter(r => r.status === 'fulfilled' && r.value).length
    if (deadEndpoints.size) await supabase.from('push_subs').delete().in('endpoint', [...deadEndpoints])
    return NextResponse.json({ ok: true, sent, dispositivos: subs.length, eliminadas: deadEndpoints.size, push, detalle })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
