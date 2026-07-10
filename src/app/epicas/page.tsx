import { supabase } from '@/lib/supabase'
import type { Epica } from '@/lib/supabase'
import EpicasDashboard from '@/components/EpicasDashboard'

export const revalidate = 60

async function getEpicas(): Promise<Epica[]> {
  const { data } = await supabase
    .from('epicas')
    .select('*')
    .order('epic_order', { ascending: true })
    .order('created_at', { ascending: true })
  return data ?? []
}

export default async function EpicasPage() {
  const epics = await getEpicas()
  return <EpicasDashboard initialEpics={epics} />
}
