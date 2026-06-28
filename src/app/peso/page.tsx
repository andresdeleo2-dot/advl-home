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

async function getRegistros(): Promise<PesoRecord[]> {
  const { data } = await supabase
    .from('peso_registros')
    .select('*')
    .order('fecha', { ascending: true })
  return data ?? []
}

export default async function PesoPage() {
  const registros = await getRegistros()
  return <PesoClient initialData={registros} />
}
