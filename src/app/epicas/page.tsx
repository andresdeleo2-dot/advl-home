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
  // Las tareas viven en su propia tabla: se adjuntan a cada épica
  const { data: tareas } = await supabase
    .from('tareas')
    .select('*')
    .order('created_at', { ascending: true })
  const byEpic = new Map<string, EpicaTask[]>()
  for (const r of (tareas || []) as TareaRow[]) {
    if (!byEpic.has(r.epica_id)) byEpic.set(r.epica_id, [])
    byEpic.get(r.epica_id)!.push(rowToTask(r))
  }
  return (data ?? []).map(e => ({ ...e, tasks: byEpic.get(e.id) || [] }))
}

export default async function EpicasPage() {
  const epics = await getEpicas()
  return <EpicasDashboard initialEpics={epics} />
}
