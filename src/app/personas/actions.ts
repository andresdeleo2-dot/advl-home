'use server'
import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

type PersonaInput = {
  id?: string
  nombre: string
  categoria: string | null
  importancia: number | null
  excepcional: boolean
  significado: string | null
  conocimos: string | null
  gusta: string | null
  notas: string | null
  ultima_vez: string | null
  cumple: string | null
  celular: string | null
  email: string | null
  direccion_actual: string | null
  direcciones_previas: string[]
  links: { label: string; url: string }[]
}

export async function upsertPersona(data: PersonaInput) {
  const { id, ...rest } = data
  const payload = { ...rest, updated_at: new Date().toISOString() }
  if (id) {
    const { error } = await supabase.from('personas').update(payload).eq('id', id)
    if (error) throw new Error(`personas update: ${error.message}`)
  } else {
    const { error } = await supabase.from('personas').insert(payload)
    if (error) throw new Error(`personas insert: ${error.message}`)
  }
  revalidatePath('/personas')
}

export async function deletePersona(id: string) {
  const { error } = await supabase.from('personas').delete().eq('id', id)
  if (error) throw new Error(`personas delete: ${error.message}`)
  revalidatePath('/personas')
}

export async function marcarVistoHoy(id: string) {
  const iso = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('personas').update({ ultima_vez: iso, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`personas visto: ${error.message}`)
  revalidatePath('/personas')
}

export async function addCategoria(data: { name: string; locked: boolean; password: string }) {
  const slug = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1000)
  const { error } = await supabase.from('categorias').insert({
    id: slug,
    name: data.name.trim(),
    locked: !!data.locked,
    password: data.locked ? (data.password || '') : '',
    orden: 99,
  })
  if (error) throw new Error(`categorias insert: ${error.message}`)
  revalidatePath('/personas')
}

// "Juntar las personas que ya se tienen": crea una ficha básica por cada nombre que
// aparece en los recuerdos (vida.personas[]) y que todavía no está en el archivo.
export async function importarDeRecuerdos(nombres: string[]) {
  if (!nombres.length) return
  const rows = nombres.map(nombre => ({
    nombre: nombre.trim(),
    categoria: 'otros',
    importancia: 3,
    excepcional: false,
  }))
  const { error } = await supabase.from('personas').insert(rows)
  if (error) throw new Error(`personas import: ${error.message}`)
  revalidatePath('/personas')
}
