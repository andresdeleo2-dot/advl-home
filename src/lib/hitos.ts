/* Fechas clave (hitos, objetivos, iniciativas y features con fecha límite) para las vistas donde
 * se planea el día. Puro: sin React ni red. Misma regla de "abierto" que /roadmap (placeObjects):
 * un hito vale por su hitoEstado, una métrica por done/meta alcanzada, una iniciativa abierta es
 * todo menos cerrada/cancelada, y un feature cerrado se lleva a todo lo que cuelga de él. */

import type { Epica, EpicaFeature, EpicaMilestone, EpicaTask } from './supabase'

export type FechaClaveKind = 'hito' | 'objetivo' | 'iniciativa' | 'feature'
export type FechaClave = {
  kind: FechaClaveKind
  id: string
  epicaId: string
  featureId?: string   // feature dueño (en kind 'feature' es el propio feature, para colgarle tareas)
  titulo: string
  ruta: string         // 'Inmuebles › Eugenia'
  fecha: string        // 'YYYY-MM-DD'
  dias: number         // fecha − hoy en días de calendario: negativo = vencido, 0 = hoy
  color: string
}

/** Lo mínimo que se necesita de una épica: Tiempo no carga el objeto Epica completo. */
export type EpicaFechas = Pick<Epica, 'id' | 'name' | 'color'> & {
  archived?: boolean
  kpis?: EpicaMilestone[] | null
  features?: EpicaFeature[] | null
  tasks?: EpicaTask[] | null
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
/** 'YYYY-MM-DD' → número de día de calendario (o null). Date.UTC sobre los COMPONENTES sólo hace
 *  aritmética de calendario: no hay zona horaria ni horario de verano que mueva el día. */
function diaNum(s?: string | null): number | null {
  const iso = (s || '').slice(0, 10)
  if (!ISO_RE.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  const back = new Date(t)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null
  return Math.round(t / 86400000)
}

/** Días de `desde` a `hasta` (ambas 'YYYY-MM-DD'); null si alguna no es válida. */
export function diasEntre(desde: string, hasta: string): number | null {
  const a = diaNum(desde), b = diaNum(hasta)
  return a == null || b == null ? null : b - a
}

const ARCHIVADA = 'Archivada'
// Espejo de milestoneDone (components/epicas/core): marcado a mano, o meta alcanzada.
function metricaCumplida(m: EpicaMilestone, tasks: EpicaTask[]): boolean {
  if (m.done) return true
  const ids = m.taskIds || []
  let cur: number, target: number
  if (m.auto === 'tareas') {
    const base = ids.length ? tasks.filter(t => t.id && ids.includes(t.id)) : tasks.filter(t => t.status !== ARCHIVADA)
    cur = base.filter(t => t.status === 'Terminada').length
    target = m.target ?? base.length
  } else {
    cur = m.current ?? 0
    target = m.target ?? 0
  }
  if (!target) return false
  return m.lowerIsBetter ? cur <= target : cur >= target
}
const hitoLogrado = (m: EpicaMilestone) => (m.hitoEstado || (m.done ? 'logrado' : 'pendiente')) === 'logrado'

const KIND_RANK: Record<FechaClaveKind, number> = { hito: 0, objetivo: 1, iniciativa: 2, feature: 3 }

/** Fechas clave abiertas: TODAS las vencidas (primero, de la más reciente a la más vieja) y luego las
 *  que caen dentro de `horizonteDias` desde `hoy`, por fecha. Excluye épicas archivadas. */
export function fechasClave(epicas: ReadonlyArray<EpicaFechas>, hoy: string, horizonteDias = 14): FechaClave[] {
  const out: FechaClave[] = []
  const push = (fc: Omit<FechaClave, 'dias' | 'fecha'>, fecha?: string | null) => {
    const f = (fecha || '').slice(0, 10)
    const dias = diasEntre(hoy, f)
    if (dias == null || dias > horizonteDias) return
    out.push({ ...fc, fecha: f, dias })
  }
  // `tasks` = alcance de la métrica: las de la épica, o sólo las del feature (como featScope en Épicas).
  const pushObjetivo = (k: EpicaMilestone, e: EpicaFechas, tasks: EpicaTask[], ruta: string, color: string, featureId?: string) => {
    if (!k.due) return
    const esHito = k.tipo === 'hito'
    if (esHito ? hitoLogrado(k) : metricaCumplida(k, tasks)) return
    push({ kind: esHito ? 'hito' : 'objetivo', id: k.id, epicaId: e.id, featureId, titulo: k.t || (esHito ? 'Hito' : 'Objetivo'), ruta, color }, k.due)
  }

  for (const e of epicas) {
    if (e.archived) continue
    const tasks = e.tasks || []
    ;(e.kpis || []).forEach(k => pushObjetivo(k, e, tasks, e.name, e.color))
    for (const f of e.features || []) {
      if ((f.estado || 'en_curso') === 'cerrado') continue
      const color = f.color || e.color
      const ruta = `${e.name} › ${f.t}`
      if (f.roadmapEnd) push({ kind: 'feature', id: f.id, epicaId: e.id, featureId: f.id, titulo: f.t || 'Feature', ruta: e.name, color }, f.roadmapEnd)
      const featTasks = tasks.filter(t => t.featureId === f.id)
      ;(f.kpis || []).forEach(k => pushObjetivo(k, e, featTasks, ruta, color, f.id))
      for (const ini of f.iniciativas || []) {
        if (ini.estado === 'cerrada' || ini.estado === 'cancelada' || !ini.fechaFinObjetivo) continue
        push({ kind: 'iniciativa', id: ini.id, epicaId: e.id, featureId: f.id, titulo: ini.nombre || 'Iniciativa', ruta, color }, ini.fechaFinObjetivo)
      }
    }
  }
  return out.sort((a, b) => {
    const va = a.dias < 0, vb = b.dias < 0
    if (va !== vb) return va ? -1 : 1
    // Vencidas de la más reciente a la más vieja (lo de hace meses no tapa lo de ayer); próximas por cercanía.
    return (va ? b.fecha.localeCompare(a.fecha) : a.fecha.localeCompare(b.fecha)) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.titulo.localeCompare(b.titulo, 'es')
  })
}

/** Las `n` que se ven sin expandir, en el orden de la lista: lo de ayer/hoy/mañana se asegura un
 *  lugar aunque haya más vencidas antes (si no, "vence hoy" quedaba escondida tras "+N más"). */
export function fechasClaveVisibles(fcs: ReadonlyArray<FechaClave>, n = 3): FechaClave[] {
  if (fcs.length <= n) return fcs.slice()
  const elegidas = new Set(fcs.filter(f => f.dias >= -1 && f.dias <= 1).slice(0, n))
  for (const f of fcs) { if (elegidas.size >= n) break; elegidas.add(f) }
  return fcs.filter(f => elegidas.has(f))
}

/** 'vence hoy' · 'vence mañana' · 'en 5 días' · 'venció ayer' · 'venció hace 3 días'. */
export function plazoFechaClave(dias: number): string {
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  if (dias === -1) return 'venció ayer'
  return dias > 0 ? `en ${dias} días` : `venció hace ${-dias} días`
}

/** Tono del plazo (cada vista lo pinta con su paleta): rojo vencido, ámbar hoy/mañana, gris después. */
export function tonoFechaClave(dias: number): 'vencido' | 'pronto' | 'despues' {
  return dias < 0 ? 'vencido' : dias <= 1 ? 'pronto' : 'despues'
}

export const ICONO_FECHA_CLAVE: Record<FechaClaveKind, string> = { hito: '⚑', iniciativa: '◆', feature: '▣', objetivo: '◎' }

/** Agrupa por fecha (para marcar días en tiras y calendarios). */
export function fechasClavePorDia(fcs: ReadonlyArray<FechaClave>): Map<string, FechaClave[]> {
  const m = new Map<string, FechaClave[]>()
  for (const fc of fcs) {
    const arr = m.get(fc.fecha)
    if (arr) arr.push(fc); else m.set(fc.fecha, [fc])
  }
  return m
}
