import { supabase } from '@/lib/supabase'
import { firmaDatos, type PesoRecord, type PesoPlan, type PesoAnalisisGuardado } from '@/lib/peso'
import PesoClient from './PesoClient'

export const revalidate = 0

export type { PesoRecord, PesoPlan }

async function getRegistros(): Promise<PesoRecord[]> {
  const { data } = await supabase
    .from('peso_registros')
    .select('*')
    .order('fecha', { ascending: true })
  return data ?? []
}

// Tolera que sql/peso-01-plan.sql aún no se haya corrido (error 42P01 = tabla no existe): la
// página sigue funcionando igual que antes, sólo sin la sección de Plan/Resultados esperados.
async function getPlan(): Promise<PesoPlan | null> {
  const { data, error } = await supabase.from('peso_plan').select('*').eq('id', 'main').maybeSingle()
  if (error) return null
  return data
}

// Igual con sql/peso-02-analisis.sql: sin la tabla el análisis con IA se genera a demanda pero no
// queda guardado, y la página no lo regenera sola en cada visita (`persistencia: false`).
async function getAnalisis(): Promise<{ analisis: PesoAnalisisGuardado | null; persistencia: boolean }> {
  const { data, error } = await supabase.from('peso_analisis').select('*').eq('id', 'main').maybeSingle()
  if (error) return { analisis: null, persistencia: false }
  return { analisis: (data as PesoAnalisisGuardado | null) ?? null, persistencia: true }
}

export default async function PesoPage() {
  const [registros, plan, { analisis, persistencia }] = await Promise.all([getRegistros(), getPlan(), getAnalisis()])
  return (
    <PesoClient
      initialData={registros}
      initialPlan={plan}
      initialAnalisis={analisis}
      persistencia={persistencia}
      firma={registros.length ? firmaDatos(registros, plan) : ''}
    />
  )
}
