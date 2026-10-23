'use server'
import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

type Resultado = { ok: true } | { ok: false; error: string }

// Un número del formulario: vacío o no numérico -> null (NaN rompería el insert en Postgres).
function num(fd: FormData, key: string) {
  const v = fd.get(key) as string | null
  if (!v) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}
function int(fd: FormData, key: string) {
  const n = num(fd, key)
  return n == null ? null : Math.round(n)
}

function leerRegistro(fd: FormData) {
  const fecha = String(fd.get('fecha') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  return {
    fecha,
    peso: num(fd, 'peso'),
    pct_grasa: num(fd, 'pct_grasa'),
    pct_musculo: num(fd, 'pct_musculo'),
    imc: num(fd, 'imc'),
    rmr: int(fd, 'rmr'),
    edad_corporal: int(fd, 'edad_corporal'),
    grasa_visceral: int(fd, 'grasa_visceral'),
  }
}

export async function addRegistro(formData: FormData) {
  const reg = leerRegistro(formData)
  if (!reg) return { ok: false as const, error: 'Fecha inválida' }
  const { error } = await supabase.from('peso_registros').insert(reg)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath('/peso')
  return { ok: true as const }
}

export async function updateRegistro(formData: FormData): Promise<Resultado> {
  const id = formData.get('id') as string
  const reg = leerRegistro(formData)
  if (!id || !reg) return { ok: false, error: 'Datos inválidos' }
  const { error } = await supabase.from('peso_registros').update(reg).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/peso')
  return { ok: true }
}

export async function deleteRegistro(id: string): Promise<Resultado> {
  if (!id) return { ok: false, error: 'Falta el id' }
  const { error } = await supabase.from('peso_registros').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/peso')
  return { ok: true }
}

// Una sola fila (id fijo 'main') con el plan de rutina/dieta y la meta — upsert, no insert, para
// no tener que distinguir "crear" de "editar" en el cliente (siempre hay a lo más una fila).
export async function savePlan(formData: FormData): Promise<Resultado> {
  const str = (key: string) => {
    const v = formData.get(key) as string
    return v && v.trim() ? v.trim() : null
  }
  const { error } = await supabase.from('peso_plan').upsert({
    id: 'main',
    rutina: str('rutina'),
    dieta: str('dieta'),
    notas: str('notas'),
    meta_peso: num(formData, 'meta_peso'),
    meta_fecha: str('meta_fecha'),
    meta_grasa: num(formData, 'meta_grasa'),
  })
  if (error) return { ok: false, error: `${error.message} · corre sql/peso-01-plan.sql en Supabase` }
  revalidatePath('/peso')
  return { ok: true }
}
