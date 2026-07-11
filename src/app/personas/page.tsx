import { supabase } from '@/lib/supabase'
import PersonasArchive from './PersonasArchive'
import { Persona, Categoria } from './types'

export const revalidate = 0

export default async function PersonasPage() {
  const { data: personas } = await supabase.from('personas').select('*')
  const { data: categorias } = await supabase.from('categorias').select('*')

  // "Juntar las personas que ya se tienen": nombres mencionados en los recuerdos
  // (tabla vida, columna personas[]) que aún no tienen ficha en el archivo.
  const { data: recuerdos } = await supabase.from('vida').select('personas')
  const yaConFicha = new Set((personas ?? []).map((p: Persona) => (p.nombre ?? '').trim().toLowerCase()))
  const pendientes = [...new Set((recuerdos ?? []).flatMap((r: { personas: string[] | null }) => r.personas ?? []))]
    .map(n => (n ?? '').trim())
    .filter(n => n && !yaConFicha.has(n.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))

  return (
    <PersonasArchive
      personas={(personas ?? []) as Persona[]}
      categorias={(categorias ?? []) as Categoria[]}
      pendientes={pendientes}
    />
  )
}
