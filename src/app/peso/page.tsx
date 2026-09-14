import { supabase } from '@/lib/supabase'
import PesoClient from './PesoClient'

export const revalidate = 0

export type PesoRecord = {
  id: string
  fecha: string
  peso: number | null
  pct_grasa: number | null
  pct_musculo: number | null
  imc: number | null
  rmr: number | null
  edad_corporal: number | null
  grasa_visceral: number | null
}

export type PesoPlan = {
  id: string
  rutina: string | null
  dieta: string | null
  notas: string | null
  meta_peso: number | null
  meta_fecha: string | null
  meta_grasa: number | null
}

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

export default async function PesoPage() {
  const [registros, plan] = await Promise.all([getRegistros(), getPlan()])
  return <PesoClient initialData={registros} initialPlan={plan} />
}
