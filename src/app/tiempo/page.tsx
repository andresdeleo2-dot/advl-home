import { supabase } from '@/lib/supabase'
import type { Actividad } from '@/lib/tiempo'
import TiempoClient from './TiempoClient'

export const dynamic = 'force-dynamic'

async function getActividades(): Promise<{ rows: Actividad[]; ready: boolean }> {
  const { data, error } = await supabase
    .from('tiempo_actividades')
    .select('*')
    .order('fecha', { ascending: true })
    .order('inicio', { ascending: true, nullsFirst: false })

  // Si la tabla aún no existe (falta correr el SQL), no reventamos la página:
  // el cliente muestra un aviso amable y sigue funcionando en vacío.
  if (error) return { rows: [], ready: false }
  return { rows: (data ?? []) as Actividad[], ready: true }
}

export default async function TiempoPage() {
  const { rows, ready } = await getActividades()
  return <TiempoClient initial={rows} ready={ready} />
}
