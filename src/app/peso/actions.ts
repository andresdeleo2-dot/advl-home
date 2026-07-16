'use server'
import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function addRegistro(formData: FormData) {
  const num = (key: string) => {
    const v = formData.get(key) as string
    return v ? parseFloat(v) : null
  }
  const int = (key: string) => {
    const v = formData.get(key) as string
    return v ? parseInt(v, 10) : null
  }
  await supabase.from('peso_registros').insert({
    fecha: formData.get('fecha') as string,
    peso: num('peso'),
    pct_grasa: num('pct_grasa'),
    pct_musculo: num('pct_musculo'),
    imc: num('imc'),
    rmr: int('rmr'),
    edad_corporal: int('edad_corporal'),
    grasa_visceral: int('grasa_visceral'),
  })
  revalidatePath('/peso')
}

export async function updateRegistro(formData: FormData) {
  const num = (key: string) => {
    const v = formData.get(key) as string
    return v ? parseFloat(v) : null
  }
  const int = (key: string) => {
    const v = formData.get(key) as string
    return v ? parseInt(v, 10) : null
  }
  const id = formData.get('id') as string
  if (!id) return
  await supabase.from('peso_registros').update({
    fecha: formData.get('fecha') as string,
    peso: num('peso'),
    pct_grasa: num('pct_grasa'),
    pct_musculo: num('pct_musculo'),
    imc: num('imc'),
    rmr: int('rmr'),
    edad_corporal: int('edad_corporal'),
    grasa_visceral: int('grasa_visceral'),
  }).eq('id', id)
  revalidatePath('/peso')
}

export async function deleteRegistro(id: string) {
  if (!id) return
  await supabase.from('peso_registros').delete().eq('id', id)
  revalidatePath('/peso')
}
