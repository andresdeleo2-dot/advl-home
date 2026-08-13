import { supabase } from '@/lib/supabase'
import type { Epica, EpicaTask } from '@/lib/supabase'
import { rowToTask, type TareaRow } from '@/lib/tareas'
import EpicasDashboard from '@/components/EpicasDashboard'

export const revalidate = 60

async function getEpicas(): Promise<Epica[]> {
  const { data } = await supabase
    .from('epicas')
    .select('*')
    .order('epic_order', { ascending: true })
    .order('created_at', { ascending: true })
  // Las tareas viven en su propia tabla: se adjuntan a cada épica.
  // PAGINADO igual que /api/epicas: PostgREST corta en 1000; sin esto el SSR entregaba un
  // snapshot truncado (faltaban las tareas más nuevas) hasta que loadEpics del cliente terminara.
  const tareas: TareaRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from('tareas')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    tareas.push(...((page || []) as TareaRow[]))
    if (!page || page.length < PAGE) break
  }
  const byEpic = new Map<string, EpicaTask[]>()
  for (const r of (tareas || []) as TareaRow[]) {
    if (!byEpic.has(r.epica_id)) byEpic.set(r.epica_id, [])
    byEpic.get(r.epica_id)!.push(rowToTask(r))
  }
  // Orden propio de la épica: `orden` manual y, en su defecto, fecha de creación
  for (const arr of byEpic.values()) arr.sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9))
  return (data ?? []).map(e => ({ ...e, tasks: byEpic.get(e.id) || [] }))
}

export default async function EpicasPage() {
  const epics = await getEpicas()
  return <EpicasDashboard initialEpics={epics} />
}
