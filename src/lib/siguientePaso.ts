/* "Siguiente paso por iniciativa": detecta las iniciativas que tienen plan pero ninguna acción
 * abierta. Puro: sin React ni red. Regla: una iniciativa está SIN SIGUIENTE PASO si está
 * pendiente/en curso, no la bloquea otra iniciativa abierta y no tiene tareas abiertas
 * (tareas con su iniciativaId que no estén Terminadas ni Archivadas). Épicas archivadas y
 * features cerrados no cuentan (mismo criterio que fechasClave en hitos.ts). */

import type { Epica, EpicaTask, Iniciativa } from './supabase'

/** Cuándo se agenda el primer paso: hoy (plan), esta semana (vence el domingo) o sin fecha. */
export type CuandoPaso = 'hoy' | 'semana' | 'sin'

/** Iniciativa abierta sin tareas abiertas. `bloqueadaPor` = la iniciativa abierta que la frena
 *  (entonces NO cuenta como "sin siguiente paso": lo que falta es cerrar la otra). */
export type FaltaPaso = {
  ini: Iniciativa
  epicaId: string
  featureId: string
  bloqueadaPor: Iniciativa | null
}

type EpicaPaso = Pick<Epica, 'id'> & {
  archived?: boolean
  features?: Epica['features'] | null
  tasks?: EpicaTask[] | null
}

const ABIERTA = new Set<Iniciativa['estado']>(['pendiente', 'en_curso'])
const CERRADA = new Set<string>(['cerrada', 'cancelada'])
const tareaAbierta = (t: EpicaTask) => t.status !== 'Terminada' && t.status !== 'Archivada'

/** La iniciativa abierta (no cerrada/cancelada) que bloquea a `ini` dentro de su épica, o null.
 *  Si `bloqueadaPor` apunta a una iniciativa borrada, no hay bloqueo. */
export function bloqueadaPorAbierta(ini: Iniciativa, epica: EpicaPaso): Iniciativa | null {
  if (!ini.bloqueadaPor) return null
  for (const f of epica.features || []) {
    const b = (f.iniciativas || []).find(x => x.id === ini.bloqueadaPor)
    if (b) return CERRADA.has(b.estado) ? null : b
  }
  return null
}

/** Iniciativas abiertas de la épica sin ninguna tarea abierta, en el orden de la pantalla
 *  (features y luego iniciativas tal cual vienen). Incluye las bloqueadas, marcadas. */
export function faltaPaso(epica: EpicaPaso): FaltaPaso[] {
  if (epica.archived) return []
  const conTarea = new Set<string>()
  for (const t of epica.tasks || []) if (t.iniciativaId && tareaAbierta(t)) conTarea.add(t.iniciativaId)
  const out: FaltaPaso[] = []
  for (const f of epica.features || []) {
    if (f.estado === 'cerrado') continue
    for (const ini of f.iniciativas || []) {
      if (!ABIERTA.has(ini.estado) || conTarea.has(ini.id)) continue
      out.push({ ini, epicaId: epica.id, featureId: f.id, bloqueadaPor: bloqueadaPorAbierta(ini, epica) })
    }
  }
  return out
}

/** Las iniciativas SIN SIGUIENTE PASO de una épica (excluye las bloqueadas por otra abierta). */
export function sinSiguientePaso(epica: EpicaPaso): Iniciativa[] {
  return faltaPaso(epica).filter(x => !x.bloqueadaPor).map(x => x.ini)
}

/** Conteo de iniciativas sin siguiente paso por featureId (sólo features con al menos una). */
export function sinPasoPorFeature(epica: EpicaPaso): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of faltaPaso(epica)) if (!x.bloqueadaPor) m.set(x.featureId, (m.get(x.featureId) || 0) + 1)
  return m
}

/** Cuántas iniciativas de la épica no tienen siguiente paso. */
export function conteoSinPaso(epica: EpicaPaso): number {
  return sinSiguientePaso(epica).length
}

/** Índice iniciativaId → FaltaPaso de varias épicas a la vez (para marcar chips, barras y filas
 *  sin recorrer la épica en cada una). Sin entrada = tiene paso, está cerrada o no existe. */
export function mapaFaltaPaso(epicas: ReadonlyArray<EpicaPaso>): Map<string, FaltaPaso> {
  const m = new Map<string, FaltaPaso>()
  for (const e of epicas) for (const x of faltaPaso(e)) m.set(x.ini.id, x)
  return m
}

/** Domingo (fecha local 'YYYY-MM-DD') de la semana lunes–domingo que contiene `hoy`; si hoy es
 *  domingo, hoy. Aritmética de calendario sobre los componentes: sin zona horaria de por medio. */
export function domingoDeSemana(hoy: string): string {
  const [y, m, d] = hoy.slice(0, 10).split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  const dow = new Date(t).getUTCDay()          // 0 dom … 6 sáb
  const dom = new Date(t + ((7 - dow) % 7) * 86400000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dom.getUTCFullYear()}-${p(dom.getUTCMonth() + 1)}-${p(dom.getUTCDate())}`
}

/** Tarea nueva para el primer paso de una iniciativa, con las reglas de plan/estado de Épicas:
 *  "Hoy" la planea hoy (prioridad media, al final del día) y la pasa a En curso recordando el
 *  previo; "Esta semana" no la planea y vence el domingo; "Sin fecha" no lleva fechas. Para las
 *  pantallas que no tienen el addTaskInline de Épicas (Roadmap). */
export function tareaPrimerPaso(o: {
  id: string
  titulo: string
  cuando: CuandoPaso
  hoy: string
  featureId?: string | null
  iniciativaId?: string | null
  planOrder?: number
}): EpicaTask {
  const t: EpicaTask = {
    id: o.id, t: o.titulo.trim(), status: 'Por hacer', due: '', note: '', createdAt: o.hoy,
    ...(o.featureId ? { featureId: o.featureId } : {}),
    ...(o.iniciativaId ? { iniciativaId: o.iniciativaId } : {}),
  }
  if (o.cuando === 'hoy') {
    t.plan = o.hoy
    t.priority = 'media'
    t.planOrder = o.planOrder ?? 1000
    t.planStatusPrev = 'Por hacer'
    t.status = 'En curso'
  } else if (o.cuando === 'semana') {
    t.due = domingoDeSemana(o.hoy)
  }
  return t
}
