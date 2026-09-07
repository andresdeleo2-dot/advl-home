import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rowToTask, taskToRow, type TareaRow } from '@/lib/tareas'
import { rowToFeature, type FeatureRow } from '@/lib/features'
import { rowToObjetivo, type ObjetivoRow } from '@/lib/objetivos'
import { rowToIniciativa, type IniciativaRow } from '@/lib/iniciativas'
import type { EpicaTask, EpicaFeature, EpicaMilestone } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const isMissingTable = (code?: string) => code === '42P01'
const byOrden = <T extends { orden?: number | null }>(a: T, b: T) => (a.orden ?? 1e9) - (b.orden ?? 1e9)
const groupBy = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    if (!k) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(r)
  }
  return m
}

export async function GET() {
  const { data, error } = await supabase
    .from('epicas')
    .select('*')
    .order('epic_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Las tareas viven en su propia tabla; se adjuntan a cada épica para que la UI
  // siga viendo `epica.tasks[]` exactamente como antes.
  // PAGINADO: PostgREST corta en 1000 filas por respuesta; se recorre con .range()
  // para no perder tareas cuando el histórico supera las 1000 (nunca se borran al cerrar).
  const tareas: TareaRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: e2 } = await supabase
      .from('tareas')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })   // desempate ÚNICO: created_at se repite (migración por lote); sin esto una fila podía salir en 2 páginas o en ninguna
      .range(from, from + PAGE - 1)
    if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 })
    tareas.push(...((page || []) as TareaRow[]))
    if (!page || page.length < PAGE) break
  }

  // Features/Objetivos/Iniciativas: tablas propias (sql/epicas-18/19/20-*.sql). Chicas, sin
  // paginar. Cada una tolera "la tabla todavía no existe" por separado, para que correr las
  // migraciones a medias (ej. sólo epicas-18) no tumbe /epicas entero.
  const [featRes, objRes, iniRes] = await Promise.all([
    supabase.from('features').select('*'),
    supabase.from('objetivos').select('*'),
    supabase.from('iniciativas').select('*'),
  ])
  const featuresTableReady = !featRes.error || !isMissingTable(featRes.error.code)
  const objetivosTableReady = !objRes.error || !isMissingTable(objRes.error.code)
  const iniciativasTableReady = !iniRes.error || !isMissingTable(iniRes.error.code)
  if (featRes.error && !isMissingTable(featRes.error.code)) return NextResponse.json({ ok: false, error: featRes.error.message }, { status: 500 })
  if (objRes.error && !isMissingTable(objRes.error.code)) return NextResponse.json({ ok: false, error: objRes.error.message }, { status: 500 })
  if (iniRes.error && !isMissingTable(iniRes.error.code)) return NextResponse.json({ ok: false, error: iniRes.error.message }, { status: 500 })

  const featureRows = (featuresTableReady ? (featRes.data as FeatureRow[]) : []) || []
  const objetivoRows = (objetivosTableReady ? (objRes.data as ObjetivoRow[]) : []) || []
  const iniciativaRows = (iniciativasTableReady ? (iniRes.data as IniciativaRow[]) : []) || []

  const objByEpica = groupBy(objetivoRows, r => r.epica_id)
  const objByFeature = groupBy(objetivoRows, r => r.feature_id)
  const featByEpica = groupBy(featureRows, r => r.epica_id)
  const iniByFeature = groupBy(iniciativaRows, r => r.feature_id)

  const byEpic = new Map<string, EpicaTask[]>()
  for (const r of (tareas || []) as TareaRow[]) {
    if (!byEpic.has(r.epica_id)) byEpic.set(r.epica_id, [])
    byEpic.get(r.epica_id)!.push(rowToTask(r))
  }
  // Orden propio de la épica: `orden` manual y, en su defecto, fecha de creación
  for (const arr of byEpic.values()) arr.sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9))

  const withTasks = (data || []).map(e => ({
    ...e,
    tasks: byEpic.get(e.id) || [],
    // kpis/features: si las tablas nuevas ya tienen algo para esta épica, GANAN sobre la columna
    // jsonb legado (que ya no se escribe, pero puede seguir ahí de antes de correr el backfill).
    ...(featuresTableReady ? {
      kpis: (objByEpica.get(e.id) || []).sort(byOrden).map(rowToObjetivo),
      features: (featByEpica.get(e.id) || []).sort(byOrden).map(f => ({
        ...rowToFeature(f),
        kpis: (objByFeature.get(f.id) || []).sort(byOrden).map(rowToObjetivo),
        iniciativas: (iniByFeature.get(f.id) || []).sort(byOrden).map(rowToIniciativa),
      })),
    } : {}),
  }))

  // ¿Existen ya las columnas gateadas? Con filas basta inspeccionar la primera (select * las
  // incluye como key). SIN filas (BD nueva o vaciada) hay que PROBAR la columna: un select de la
  // columna falla (42703) si no existe y devuelve vacío si existe → evita falsos-negativos que
  // bloqueaban orden/resumen/plan_hist tras correr la migración con la tabla vacía.
  const colReady = async (col: string): Promise<boolean> => {
    if (tareas.length) return col in (tareas[0] as object)
    const { error } = await supabase.from('tareas').select(col).limit(1)
    return !error
  }
  const [planHistReady, ordenReady, remindReady, comentariosReady, resumenReady, estMinReady, dayPlansReady, waitingReady, featureIdReady, waitingTaskReady, personaReady, blockedByReady, iniciativaIdReady] = await Promise.all([
    colReady('plan_hist'), colReady('orden'), colReady('remind_at'), colReady('comentarios'), colReady('resumen'), colReady('est_min'), colReady('day_plans'), colReady('waiting_for'), colReady('feature_id'), colReady('waiting_task_id'), colReady('persona_id'), colReady('blocked_by_task_id'), colReady('iniciativa_id'),
  ])
  // Gate del presupuesto (columna en la tabla EPICAS, no tareas): con épicas basta la primera fila;
  // sin épicas se prueba la columna directo.
  const weekBudgetReady = (data || []).length
    ? ('week_budget' in ((data || [])[0] as object))
    : !(await supabase.from('epicas').select('week_budget').limit(1)).error
  // "¿Puedo poner feature_id en una tarea?" — sigue siendo su propia pregunta, distinta de
  // featuresTableReady (que es "¿ya existe la tabla features de verdad?").
  const epicasFeaturesReady = (data || []).length
    ? ('features' in ((data || [])[0] as object))
    : !(await supabase.from('epicas').select('features').limit(1)).error
  const featuresReady = featureIdReady && epicasFeaturesReady
  // Roadmap: roadmap_start/roadmap_end (columnas en EPICAS), mismo patrón que weekBudgetReady.
  const roadmapReady = (data || []).length
    ? ('roadmap_start' in ((data || [])[0] as object))
    : !(await supabase.from('epicas').select('roadmap_start').limit(1)).error

  return NextResponse.json({
    ok: true, data: withTasks, planHistReady, ordenReady, remindReady, comentariosReady, resumenReady,
    estMinReady, dayPlansReady, waitingReady, weekBudgetReady, featuresReady, waitingTaskReady, personaReady,
    blockedByReady, roadmapReady, featuresTableReady, objetivosTableReady, iniciativasTableReady, iniciativaIdReady,
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.name) {
      return NextResponse.json({ ok: false, error: 'name es obligatorio' }, { status: 400 })
    }
    const payload = {
      name: body.name,
      color: body.color || '#2E5A9E',
      description: body.description || null,
      status: body.status || 'En curso',
      categoria: body.categoria || null,
      archived: !!body.archived,
      source_table: body.source_table || null,
      source_sync: body.source_sync || null,
      epic_order: Number(body.epic_order) || 0,
      // kpis/features ya NO se mandan al jsonb legado (esas tablas quedan sin uso a partir de
      // ahora) — se insertan aparte, después, en las tablas objetivos/features reales.
      routines: Array.isArray(body.routines) ? body.routines : [],
      tasks: [],                     // legado: la columna queda vacía (respaldo histórico)
      links: Array.isArray(body.links) ? body.links : [],
    }
    const { data, error } = await supabase.from('epicas').insert(payload).select().single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    // Las tareas que vengan en el alta se insertan en su propia tabla
    const tasks: EpicaTask[] = body.tasks ?? []
    if (tasks.length) {
      const { error: e2 } = await supabase.from('tareas').insert(tasks.map(t => taskToRow(t, data.id)))
      if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 })
    }

    // Features + sus objetivos (si vienen). Se espera a que existan los features ANTES de
    // insertar sus objetivos: objetivos.feature_id es un FK real, insertarlo en paralelo
    // arriesgaría un choque de llave foránea si el insert de objetivos le gana la carrera al de
    // features. Si algo de esto falla, la épica ya quedó creada sin su Feature/Objetivo (mismo
    // caso límite aceptado que ya existía con `tasks` arriba).
    const features: EpicaFeature[] = Array.isArray(body.features) ? body.features : []
    const kpiToRow = (k: EpicaMilestone, owner: { epicaId?: string; featureId?: string }) => ({
      id: k.id,
      epica_id: owner.epicaId || null,
      feature_id: owner.featureId || null,
      tipo: k.tipo === 'hito' ? 'hito' : 'metrica',
      t: k.t || '',
      target: typeof k.target === 'number' ? k.target : null,
      current: typeof k.current === 'number' ? k.current : null,
      unidad: k.unit || null,
      unidad_libre: k.unitLabel || null,
      fecha_objetivo: k.due || null,
      medir_con_tareas_cerradas: k.auto === 'tareas',
      menos_es_mejor: !!k.lowerIsBetter,
      valor_inicio: typeof k.start === 'number' ? k.start : null,
      task_ids: k.taskIds || [],
      hito_estado: k.hitoEstado || null,
      fecha_logrado: k.fechaLogrado || null,
      cumplido: !!k.done,
      cumplido_at: k.doneAt || null,
      orden: null,
    })
    if (features.length) {
      const { error: ef } = await supabase.from('features').insert(features.map(f => ({
        id: f.id, epica_id: data.id, t: f.t || '', color: f.color || null,
        estado: f.estado || 'en_curso',
        fecha_inicio: f.roadmapStart || null, fecha_fin_objetivo: f.roadmapEnd || null,
        orden: typeof f.orden === 'number' ? f.orden : null,
      })))
      if (ef) return NextResponse.json({ ok: false, error: ef.message }, { status: 500 })
    }
    const kpis: EpicaMilestone[] = Array.isArray(body.kpis) ? body.kpis : []
    const objetivoRows = [
      ...kpis.map(k => kpiToRow(k, { epicaId: data.id })),
      ...features.flatMap(f => (f.kpis || []).map(k => kpiToRow(k, { featureId: f.id }))),
    ]
    if (objetivoRows.length) {
      const { error: eo } = await supabase.from('objetivos').insert(objetivoRows)
      if (eo) return NextResponse.json({ ok: false, error: eo.message }, { status: 500 })
    }

    // Iniciativas de cada feature (si vienen) — igual que arriba, después de que su feature ya
    // exista (FK real). bloqueada_por se manda tal cual pero la UI de hoy no lo expone todavía.
    const iniciativaRows = features.flatMap(f => (f.iniciativas || []).map(ini => ({
      id: ini.id, feature_id: f.id, epica_id: data.id, nombre: ini.nombre || '',
      descripcion: ini.descripcion || null, estado: ini.estado || 'pendiente',
      fecha_inicio: ini.fechaInicio || null, fecha_fin_objetivo: ini.fechaFinObjetivo || null,
      responsable: ini.responsable || null, orden: typeof ini.orden === 'number' ? ini.orden : null,
      bloqueada_por: ini.bloqueadaPor || null,
    })))
    if (iniciativaRows.length) {
      const { error: ei } = await supabase.from('iniciativas').insert(iniciativaRows)
      if (ei) return NextResponse.json({ ok: false, error: ei.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data: { ...data, tasks, kpis, features: features.map(f => ({ ...f, iniciativas: f.iniciativas || [] })) } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 })
  }
}
