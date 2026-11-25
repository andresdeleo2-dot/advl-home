/* «Mi día» (/dia): el contrato de datos entre el cierre de la madrugada (script en la Mac que llama a
 * Claude, ~/dev/erp-herramientas/obsidian/cierre-del-dia.mjs) y la página. Más funciones puras que la
 * página calcula SOLA con las épicas (0 tokens): salud por épica, tareas esperando a otros.
 * Las notas viven en Obsidian; aquí solo hay resúmenes. */

import type { Epica, EpicaTask } from './supabase'

export const VAULT = 'Revan Vault'
/** Abre una nota de la bóveda (Mac y iPhone). `nota` = nombre sin .md, como en los [[links]]. */
export const obsidianUrl = (nota: string) =>
  `obsidian://open?vault=${encodeURIComponent(VAULT)}&file=${encodeURIComponent(nota)}`

export type DiaHecho = { t: string; nota?: string }
/** Una de «tus 3 de hoy». Apunta a una tarea que ya existe (tareaId) o a una tarjeta nueva (itemId). */
export type DiaPrioridad = { t: string; tareaId?: string; itemId?: string; epica?: string; min?: number; porque: string }
export type TipoTarjeta = 'nuevo' | 'sugerencia' | 'limpieza' | 'evitando' | 'esperando' | 'mover'
/** Tarjeta de «Decide». nuevo = pendiente sacado del diario/inbox (crea tarea); sugerencia/limpieza/
 *  evitando/esperando = cambio a una tarea existente; mover = nota del inbox a su carpeta. */
export type DiaTarjeta = {
  id: string
  tipo: TipoTarjeta
  titulo: string
  detalle?: string
  epicaId?: string
  epica?: string
  tareaId?: string
  /** Lo que se aplica con «Sí». plan: 'hoy' | 'manana' | 'AAAA-MM-DD'. */
  cambio?: { plan?: string; estado?: string; prioridad?: 'alta' | 'media' | 'baja'; titulo?: string; minutos?: number; archivar?: boolean }
  /** Nota de Obsidian de donde salió (para «Abrir nota»). */
  nota?: string
  /** Solo tipo mover: carpeta/nombre destino propuesto. */
  destino?: string
}
export type DiaDecision = { id: string; pregunta: string; nota?: string; opciones: string[] }
/** Pregunta para tu cerebro: llena un hueco de la bóveda (cómo haces las cosas, datos por confirmar).
 *  La respuesta la guarda el cierre de las 3:00 en `nota`. */
export type DiaPreguntaCerebro = { id: string; pregunta: string; nota?: string; porque?: string }
export type DiaCambio = { nota: string; que: string }
export type DiaFecha = { t: string; fecha: string; nota?: string }

export type DiaData = {
  diario?: string          // fecha del diario que se resumió (normalmente ayer)
  frase: string            // ayer en una frase
  hechos: DiaHecho[]
  prioridades: DiaPrioridad[]
  tarjetas: DiaTarjeta[]
  decisiones: DiaDecision[]
  cambios: DiaCambio[]
  fechas: DiaFecha[]
  pregunta?: string        // la pregunta de la noche para conocerte mejor
  cerebro?: DiaPreguntaCerebro[] // preguntas para que la bóveda aprenda cómo haces las cosas
  inbox?: number           // notas en 00-inbox
  sinDictado?: boolean     // no hubo texto nuevo: no se llamó a Claude
  modelo?: string
  origen?: 'claude' | 'gemini' // gemini = respaldo en la nube (Mac apagada); Claude lo mejora al prender la Mac
}

export type EstadoRespuesta = 'aceptada' | 'pospuesta' | 'descartada' | 'respondida'
export type DiaRespuesta = { item_id: string; tipo: string; estado: EstadoRespuesta; respuesta?: unknown; tarea_id?: string | null; aplicada_at?: string | null }
export type DiaCorrida = { at: string; ok: boolean; mensaje?: string; tokens?: number; epicas?: number }
export type BovedaItem = { titulo: string; detalle?: string; nota?: string; tono?: 'rojo' | 'ambar' | 'gris' }
export type BovedaGrupo = { titulo: string; items: BovedaItem[] }
export type BovedaDatos = { fecha: string; resumen: string[]; grupos: BovedaGrupo[] }

/** Lo que decidiste o contestaste en «Por decidir» y dónde quedó en Obsidian (Tu cerebro). */
export type DiaAprendido = { id: string; fecha: string; tipo: string; pregunta: string; respuesta: string; nota?: string; guardadoAt: string | null }

export type DiaGet = {
  ok: true
  disponible: boolean       // ¿existen las tablas?
  fecha: string
  resumen: { data: DiaData; tokens: number | null; procesado_at: string } | null
  respuestas: DiaRespuesta[]
  cierres: { fecha: string; calificacion: number | null }[]
  semana: { fecha: string; data: DiaData }[]
  corrida: DiaCorrida | null
  boveda: BovedaDatos | null
  capturasPendientes: number
  aprendido?: DiaAprendido[]   // últimos 14 días
}

/* ── Cálculos sobre las épicas (en la página, 0 tokens) ── */

const ABIERTA = (t: EpicaTask) => t.status !== 'Terminada' && t.status !== 'Archivada'
const diasEntre = (a: string, b: string) => {
  const u = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((u(b) - u(a)) / 86400000)
}

export type EstadoEpica = 'vencidas' | 'quieta' | 'detenida' | 'pausa' | 'al_dia'
export type SaludEpica = {
  e: Epica
  estado: EstadoEpica
  etiqueta: string
  abiertas: number
  vencidas: number
  diasQuieta: number | null
  siguiente: EpicaTask | null
}

const PRIO: Record<string, number> = { alta: 0, media: 1, baja: 2 }
const DIAS_QUIETA = 10

/** Última vez que se movió algo en la épica: tarea editada, terminada o con avance anotado. */
function ultimaActividad(e: Epica): string | null {
  let max: string | null = null
  const ver = (v?: string) => { if (v && /^\d{4}-\d{2}-\d{2}/.test(v) && (!max || v.slice(0, 10) > max)) max = v.slice(0, 10) }
  for (const t of e.tasks || []) {
    ver(t.updatedAt); ver(t.doneAt); ver(t.createdAt)
    for (const p of t.progressLog || []) ver(p.d)
  }
  return max
}

/** La siguiente tarea de la épica: la agendada más pronto, luego prioridad y vencimiento. Esperando no cuenta. */
export function siguienteDe(e: Epica, hoy: string): EpicaTask | null {
  const abiertas = (e.tasks || []).filter(t => ABIERTA(t) && t.status !== 'Esperando')
  abiertas.sort((a, b) =>
    (a.plan && a.plan >= hoy ? a.plan : '9999').localeCompare(b.plan && b.plan >= hoy ? b.plan : '9999')
    || (PRIO[a.priority || 'media'] - PRIO[b.priority || 'media'])
    || (a.due || '9999').localeCompare(b.due || '9999')
    || (a.orden ?? 1e9) - (b.orden ?? 1e9))
  return abiertas[0] || null
}

export function saludEpicas(epicas: Epica[], hoy: string): SaludEpica[] {
  const out: SaludEpica[] = []
  for (const e of epicas) {
    if (e.archived) continue
    const abiertas = (e.tasks || []).filter(ABIERTA)
    if (!abiertas.length) continue
    const vencidas = abiertas.filter(t => t.due && t.due < hoy).length
    const ult = ultimaActividad(e)
    const diasQuieta = ult ? Math.max(0, diasEntre(ult, hoy)) : null
    const soloEsperando = abiertas.every(t => t.status === 'Esperando')
    let estado: EstadoEpica = 'al_dia', etiqueta = 'al día'
    if (e.status === 'En pausa') { estado = 'pausa'; etiqueta = 'en pausa' }
    else if (vencidas) { estado = 'vencidas'; etiqueta = vencidas === 1 ? '1 vencida' : `${vencidas} vencidas` }
    else if (soloEsperando) { estado = 'detenida'; etiqueta = 'esperando a otros' }
    else if (diasQuieta != null && diasQuieta >= DIAS_QUIETA) { estado = 'quieta'; etiqueta = `${diasQuieta} días quieta` }
    out.push({ e, estado, etiqueta, abiertas: abiertas.length, vencidas, diasQuieta, siguiente: siguienteDe(e, hoy) })
  }
  const rango: Record<EstadoEpica, number> = { vencidas: 0, quieta: 1, detenida: 2, al_dia: 3, pausa: 4 }
  return out.sort((a, b) => rango[a.estado] - rango[b.estado] || b.vencidas - a.vencidas || (b.diasQuieta ?? 0) - (a.diasQuieta ?? 0))
}

export type Esperando = { e: Epica; t: EpicaTask; dias: number | null; quien: string | null }

/** Tareas en «Esperando», de la que lleva más días a la que menos. */
export function esperandoAOtros(epicas: Epica[], hoy: string): Esperando[] {
  const out: Esperando[] = []
  for (const e of epicas) {
    if (e.archived) continue
    for (const t of e.tasks || []) {
      if (t.status !== 'Esperando') continue
      const dias = t.waitingSince ? Math.max(0, diasEntre(t.waitingSince, hoy)) : null
      const quien = t.personaNombre || (t.responsable && t.responsable.toLowerCase() !== 'yo' ? t.responsable : null)
      out.push({ e, t, dias, quien })
    }
  }
  return out.sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1))
}

/** Racha de días cerrados seguidos que terminan ayer u hoy. */
export function racha(fechasCerradas: string[], hoy: string): number {
  const set = new Set(fechasCerradas)
  let d = set.has(hoy) ? hoy : sumarDias(hoy, -1)
  let n = 0
  while (set.has(d)) { n++; d = sumarDias(d, -1) }
  return n
}

export function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** 'hoy' | 'manana' | fecha → fecha real. */
export function resolverPlan(plan: string, hoy: string): string {
  if (plan === 'hoy') return hoy
  if (plan === 'manana') return sumarDias(hoy, 1)
  return /^\d{4}-\d{2}-\d{2}$/.test(plan) ? plan : hoy
}

export const diasHasta = (hoy: string, fecha: string) => diasEntre(hoy, fecha)

/** Texto de WhatsApp para recordarle algo a alguien (lo manda Andrés, no la app). */
export function textoRecordatorio(t: EpicaTask, quien: string | null): string {
  const saludo = quien ? `Hola ${quien.split(' ')[0]}` : 'Hola'
  return `${saludo}, ¿cómo vas con «${t.t}»? Quedo al pendiente.`
}
