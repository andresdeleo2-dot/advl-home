/* Respaldo de «Mi día» en la nube: si a las 7:00 la Mac no armó el día (estaba apagada), lo arma Gemini con lo que
 * sí está en la nube: lo que anotaste en la página, tus épicas y tareas, y tus respuestas. Gratis (GEMINI_API_KEY).
 * Cuando prendes la Mac, cierre-del-dia.mjs ve `origen: 'gemini'` y Claude lo mejora con tu nota de Obsidian,
 * sin tocar lo que ya contestaste. Solo servidor (service key). Nunca lanza: devuelve qué pasó. */

import { supabase } from './supabase'
import { gemini } from './gemini'
import { sumarDias, type DiaData, type DiaTarjeta, type DiaPrioridad } from './dia'

type Fila = Record<string, unknown>
const s = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const arr = (v: unknown): Fila[] => (Array.isArray(v) ? (v as Fila[]) : [])
const PR: Record<string, number> = { alta: 0, media: 1, baja: 2 }
const DN = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const dias = (a: string, b: string) => { const u = (x: string) => { const [y, m, d] = x.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }; return Math.round((u(b) - u(a)) / 86400000) }

const PROMPT = `Eres el asistente de Andrés. Su Mac estuvo apagada, así que esta mañana armas su día SOLO con lo que anotó en su página, sus épicas y tareas. Devuelve SOLO un objeto JSON.
Reglas: español de México, claro y corto, háblale de tú, sin signos de admiración ni relleno. No inventes hechos ni fechas. Cita tareas y épicas SOLO por su id corto (t12, e3). Tarjetas nuevas con id n1, n2…; las demás s1, s2…; decisiones d1, d2… Temas legales o médicos en corto, sin detalles. No propongas nada de «No volver a proponer». Máximo 6 hechos, 3 prioridades, 6 tarjetas, 2 decisiones.
Claves (listas vacías si no hay):
{"frase": "ayer en una frase de máx. 25 palabras; si no anotó nada, dilo amable y habla de sus épicas",
 "hechos": [{"t": "qué hizo, 4–10 palabras"}],
 "prioridades": [{"t": "qué hacer hoy", "tarea": "t12", "nuevo": "n1", "min": 30, "porque": "3–8 palabras"}],
 "tarjetas": [{"id": "n1", "tipo": "nuevo|sugerencia|limpieza|evitando|esperando", "titulo": "para nuevo: la tarea con verbo primero; si no: la propuesta", "detalle": "una línea", "epica": "e3", "tarea": "t12", "cambio": {"plan": "hoy|manana|AAAA-MM-DD", "estado": "Por hacer|En curso|Esperando|Terminada", "prioridad": "alta|media|baja", "archivar": true}}],
 "decisiones": [{"id": "d1", "pregunta": "...", "opciones": ["2 a 3 respuestas cortas"]}],
 "fechas": [{"t": "...", "fecha": "AAAA-MM-DD"}],
 "pregunta": "UNA pregunta para conocerlo mejor (valores, prioridades, cómo decide), que no repita las ya hechas"}
«nuevo» = pendiente concreto de lo que anotó (si ya hay tarea parecida, usa «sugerencia» sobre ella). «sugerencia» = reagendar vencidas, marcar Terminada lo que dijo que hizo, Esperando si espera a alguien. «prioridades» = lo que más importa hoy por fechas, esperas largas y lo que lleva evitando; siempre una acción que Andrés hace él mismo, con verbo (nunca «esperar» ni tareas en Esperando: en su lugar, darle seguimiento).`

export type ResultadoNube = { hecho: boolean; motivo: string }

/** Arma el día de `hoy` en la nube si nadie lo ha armado. Con `limiteMs` corta a Gemini y usa la versión sin IA. */
export async function armarDiaEnNube(hoy: string, limiteMs = 38_000): Promise<ResultadoNube> {
  try {
    const ya = await supabase.from('dia_resumen').select('fecha').eq('fecha', hoy).maybeSingle()
    if (ya.error) return { hecho: false, motivo: `sin tablas de Mi día: ${ya.error.message}` }
    if (ya.data) return { hecho: false, motivo: 'el día ya estaba armado' }
    const ayer = sumarDias(hoy, -1)

    const [ep, caps, resp, cier, prev] = await Promise.all([
      supabase.from('epicas').select('id,name,status,archived').order('epic_order'),
      supabase.from('dia_capturas').select('fecha,tipo,texto').is('procesada_at', null).order('created_at'),
      supabase.from('dia_respuestas').select('fecha,item_id,tipo,estado,respuesta').gte('fecha', sumarDias(hoy, -30)),
      supabase.from('dia_cierre').select('calificacion').eq('fecha', ayer).maybeSingle(),
      supabase.from('dia_resumen').select('fecha,data').gte('fecha', sumarDias(hoy, -30)).order('fecha', { ascending: false }),
    ])
    const epicas = ((ep.data || []) as Fila[]).filter(e => e.archived !== true)
    const tareas: Fila[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('tareas').select('id,epica_id,titulo,estado,prioridad,plan,vence,waiting_since,responsable,persona_nombre')
        .not('estado', 'in', '("Terminada","Archivada")').order('id').range(from, from + 999)
      if (error) return { hecho: false, motivo: `no pude leer tareas: ${error.message}` }
      tareas.push(...((data || []) as Fila[])); if (!data || data.length < 1000) break
    }

    const eId = new Map<string, string>(), eDe = new Map<string, Fila>()
    epicas.forEach((e, i) => { eId.set(String(e.id), `e${i + 1}`); eDe.set(`e${i + 1}`, e) })
    const señal = (t: Fila) => {
      const r: string[] = []
      const plan = t.plan as string | null, vence = t.vence as string | null
      if (vence && vence < hoy) r.push('vencida')
      if (plan && plan < hoy) r.push('arrastrada')
      if (plan === hoy) r.push('hoy')
      if (vence && vence >= hoy && vence <= sumarDias(hoy, 7)) r.push('vence pronto')
      if (t.estado === 'Esperando') r.push('esperando')
      if (t.prioridad === 'alta') r.push('alta')
      return r
    }
    const señaladas = tareas.filter(t => eId.has(String(t.epica_id))).map(t => ({ t, r: señal(t) })).filter(x => x.r.length)
      .sort((a, b) => b.r.length - a.r.length || (PR[String(a.t.prioridad || 'media')] - PR[String(b.t.prioridad || 'media')])).slice(0, 60)
    const tId = new Map<string, string>(), tDe = new Map<string, Fila>()
    señaladas.forEach((x, i) => { tId.set(String(x.t.id), `t${i + 1}`); tDe.set(`t${i + 1}`, x.t) })

    const resumenes = (prev.data || []) as { fecha: string; data: DiaData }[]
    const evitar: string[] = []
    for (const r of (resp.data || []) as Fila[]) {
      if (r.estado !== 'descartada' && !(r.estado === 'pospuesta' && s((r.respuesta as Fila | null)?.hasta) > hoy)) continue
      const c = resumenes.find(x => x.fecha === r.fecha)?.data.tarjetas?.find(x => x.id === r.item_id)
      if (c) evitar.push(c.titulo)
    }
    const capturas = (caps.data || []) as Fila[]
    const decisiones = ((resp.data || []) as Fila[]).filter(r => r.tipo === 'decision' && r.estado === 'respondida' && r.fecha === ayer)

    // Lo mecánico (sin IA): prioridades por plan, vencimiento y prioridad.
    const porDefecto: DiaPrioridad[] = tareas.filter(t => eId.has(String(t.epica_id)) && t.estado !== 'Esperando' && ((t.plan && String(t.plan) <= hoy) || (t.vence && String(t.vence) <= hoy)))
      .sort((a, b) => (PR[String(a.prioridad || 'media')] - PR[String(b.prioridad || 'media')]) || String(a.vence || '9999').localeCompare(String(b.vence || '9999')))
      .slice(0, 3).map(t => ({ t: String(t.titulo), tareaId: String(t.id), epica: String(eDe.get(eId.get(String(t.epica_id))!)?.name || ''), porque: t.vence && String(t.vence) < hoy ? 'está vencida' : 'agendada para hoy' }))

    let salida: Fila | null = null, motivoIA = 'sin texto nuevo: armado sin IA'
    if (capturas.length || decisiones.length) {
      const E: string[] = [`HOY: ${hoy} (${DN[new Date(hoy + 'T12:00:00').getDay()]}).`, '']
      for (const c of capturas) E.push(`## Anotado en la página (${c.fecha}, ${c.tipo})`, s(c.texto, 8000), '')
      if (decisiones.length) E.push('## Decisiones que contestó ayer', ...decisiones.map(d => `- ${s((d.respuesta as Fila | null)?.texto, 200)}`), '')
      if (cier.data?.calificacion) E.push(`## Calificó ayer con ${cier.data.calificacion}/10`, '')
      E.push('## Épicas (id | nombre | estado)', ...epicas.map(e => `${eId.get(String(e.id))} | ${e.name} | ${e.status || 'En curso'}`), '')
      E.push('## Tareas señaladas (id | épica | título | estado | plan | vence | prioridad | por qué)', ...señaladas.map(({ t, r }) => {
        const esp = t.estado === 'Esperando' && t.waiting_since ? ` ${dias(String(t.waiting_since), hoy)}d` : ''
        return `${tId.get(String(t.id))} | ${eId.get(String(t.epica_id))} | ${t.titulo} | ${t.estado}${esp} | ${t.plan || '—'} | ${t.vence || '—'} | ${t.prioridad || 'media'} | ${r.join(', ')}`
      }), '')
      if (evitar.length) E.push('## No volver a proponer', ...evitar.slice(0, 30).map(x => `- ${x}`), '')
      const preguntas = resumenes.map(r => r.data.pregunta).filter(Boolean).slice(0, 10)
      if (preguntas.length) E.push('## Preguntas ya hechas', ...preguntas.map(p => `- ${p}`), '')
      try {
        const txt = await Promise.race([
          gemini(`${PROMPT}\n\n${E.join('\n')}`, { json: true }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Gemini tardó demasiado')), limiteMs)),
        ])
        const a = txt.indexOf('{'), b = txt.lastIndexOf('}')
        salida = JSON.parse(a >= 0 ? txt.slice(a, b + 1) : txt) as Fila
        motivoIA = 'armado con Gemini'
      } catch (e) { motivoIA = `Gemini falló (${e instanceof Error ? e.message : String(e)}): armado sin IA` }
    }

    // Validar y traducir ids cortos a reales.
    const TIPOS = ['nuevo', 'sugerencia', 'limpieza', 'evitando', 'esperando']
    const tarjetas: DiaTarjeta[] = []
    for (const c of arr(salida?.tarjetas)) {
      const tipo = TIPOS.includes(String(c.tipo)) ? (c.tipo as DiaTarjeta['tipo']) : null
      if (!tipo || !s(c.titulo)) continue
      const tarea = tDe.get(String(c.tarea)); const e = eDe.get(String(c.epica)) || (tarea ? eDe.get(eId.get(String(tarea.epica_id))!) : undefined)
      if (tipo !== 'nuevo' && !tarea) continue
      const k = (c.cambio || {}) as Fila, cambio: DiaTarjeta['cambio'] = {}
      if (typeof k.plan === 'string' && /^(hoy|manana|\d{4}-\d{2}-\d{2})$/.test(k.plan)) cambio.plan = k.plan
      if (['Por hacer', 'En curso', 'Esperando', 'Terminada'].includes(String(k.estado))) cambio.estado = String(k.estado)
      if (['alta', 'media', 'baja'].includes(String(k.prioridad))) cambio.prioridad = k.prioridad as 'alta' | 'media' | 'baja'
      if (k.archivar === true) cambio.archivar = true
      if (s(k.titulo)) cambio.titulo = s(k.titulo, 200)
      let id = s(c.id, 12).replace(/[^a-z0-9-]/gi, '') || `g${tarjetas.length + 1}`
      if (tarjetas.some(x => x.id === id)) id = `${id}-${tarjetas.length}`
      tarjetas.push({ id, tipo, titulo: s(c.titulo, 220), detalle: s(c.detalle) || undefined, tareaId: tarea ? String(tarea.id) : undefined, epicaId: e ? String(e.id) : undefined, epica: e ? String(e.name) : undefined, cambio: Object.keys(cambio).length ? cambio : undefined })
    }
    const prioridades: DiaPrioridad[] = arr(salida?.prioridades).map(p => {
      const tarea = tDe.get(String(p.tarea)); const nuevo = tarjetas.find(c => c.id === p.nuevo && c.tipo === 'nuevo')
      if (!tarea && !nuevo) return null
      const min = Number(p.min)
      return { t: tarea ? String(tarea.titulo) : nuevo!.titulo, tareaId: tarea ? String(tarea.id) : undefined, itemId: nuevo?.id, epica: tarea ? String(eDe.get(eId.get(String(tarea.epica_id))!)?.name || '') : nuevo?.epica, min: Number.isFinite(min) && min > 0 ? Math.min(480, Math.round(min)) : undefined, porque: s(p.porque, 80) }
    }).filter((x): x is NonNullable<typeof x> => x !== null)
      // Regla fija: una prioridad es algo que Andrés hace; «esperar…» o en Esperando usa el título claro propuesto, o se quita.
      .map(p => {
        const t = p.tareaId ? tareas.find(x => String(x.id) === p.tareaId) : undefined
        if (!/^esperar\b/i.test(p.t) && t?.estado !== 'Esperando') return p
        const mejor = tarjetas.find(c => c.tareaId === p.tareaId && c.cambio && 'titulo' in c.cambio && c.cambio.titulo)
        return mejor ? { ...p, t: String(mejor.cambio!.titulo) } : null
      }).filter((x): x is NonNullable<typeof x> => x !== null).slice(0, 3)

    const data: DiaData = {
      origen: 'gemini',
      diario: ayer,
      frase: s(salida?.frase, 240) || (capturas.length ? 'Tu Mac estaba apagada; esto sale de lo que anotaste en la página y de tus épicas.' : 'Tu Mac estaba apagada y no anotaste nada en la página; tus épicas sí están al día.'),
      hechos: arr(salida?.hechos).map(h => ({ t: s(h.t, 160) })).filter(h => h.t).slice(0, 6),
      prioridades: prioridades.length ? prioridades : porDefecto,
      tarjetas: tarjetas.slice(0, 6),
      decisiones: arr(salida?.decisiones).map((d, i) => ({ id: s(d.id, 10) || `d${i + 1}`, pregunta: s(d.pregunta, 240), opciones: (Array.isArray(d.opciones) ? d.opciones : []).map(o => s(o, 40)).filter(Boolean).slice(0, 3) })).filter(d => d.pregunta).slice(0, 2),
      cambios: [],
      fechas: arr(salida?.fechas).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha)) && String(f.fecha) >= hoy).map(f => ({ t: s(f.t, 80), fecha: String(f.fecha) })).slice(0, 4),
      pregunta: s(salida?.pregunta, 240) || undefined,
      sinDictado: !capturas.length || undefined,
      modelo: salida ? 'gemini' : undefined,
    }
    // insert (no upsert): si la Mac lo armó mientras tanto, gana lo de la Mac.
    const ins = await supabase.from('dia_resumen').insert({ fecha: hoy, data, tokens: null })
    if (ins.error) return { hecho: false, motivo: ins.error.code === '23505' ? 'la Mac lo armó mientras tanto' : ins.error.message }
    return { hecho: true, motivo: motivoIA }
  } catch (e) {
    return { hecho: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}
