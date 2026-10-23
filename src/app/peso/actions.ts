'use server'
import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

type Resultado = { ok: true } | { ok: false; error: string }
type ErrorSb = { code?: string | null; message?: string | null }

// Los errores de Supabase llegan en inglés y con detalles internos: no se muestran tal cual. El texto
// técnico queda en el log del servidor y a la interfaz solo sube un mensaje en español según el código.
// La UI lo antepone con «No se pudo guardar…: », así que aquí va solo la causa y qué hacer.
// `sinTabla` es el aviso (con el SQL por correr) únicamente cuando la tabla de verdad no existe
// (42P01 de Postgres, PGRST205 de PostgREST): un fallo de red o de valores no debe mandar a correr SQL.
function falla(contexto: string, e: ErrorSb, sinTabla: string): { ok: false; error: string } {
  console.error(`[peso] ${contexto}:`, e.code ?? '', e.message ?? '')
  switch (e.code) {
    case '42P01':
    case 'PGRST205':
      return { ok: false, error: sinTabla }
    case '23505':
      return { ok: false, error: 'Ya existe ese registro.' }
    case '22003': // numeric fuera de rango
    case '22001': // texto demasiado largo
    case '22P02': // formato inválido
    case '23514': // check constraint
      return { ok: false, error: 'Algún valor está fuera de rango. Revísalos e inténtalo de nuevo.' }
    default:
      return { ok: false, error: 'Hubo un problema en el servidor. Inténtalo de nuevo en un momento.' }
  }
}
const SIN_TABLA_REGISTROS = 'Falta crear la tabla peso_registros en Supabase.'
const SIN_TABLA_PLAN = 'Falta crear la tabla del plan: corre sql/peso-01-plan.sql en Supabase.'

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

export async function addRegistro(formData: FormData): Promise<Resultado> {
  const reg = leerRegistro(formData)
  if (!reg) return { ok: false, error: 'Fecha inválida' }
  const { error } = await supabase.from('peso_registros').insert(reg)
  if (error) return falla('addRegistro', error, SIN_TABLA_REGISTROS)
  revalidatePath('/peso')
  return { ok: true }
}

export async function updateRegistro(formData: FormData): Promise<Resultado> {
  const id = formData.get('id') as string
  const reg = leerRegistro(formData)
  if (!id || !reg) return { ok: false, error: 'Datos inválidos' }
  const { error } = await supabase.from('peso_registros').update(reg).eq('id', id)
  if (error) return falla('updateRegistro', error, SIN_TABLA_REGISTROS)
  revalidatePath('/peso')
  return { ok: true }
}

export async function deleteRegistro(id: string): Promise<Resultado> {
  if (!id) return { ok: false, error: 'Falta el id' }
  const { error } = await supabase.from('peso_registros').delete().eq('id', id)
  if (error) return falla('deleteRegistro', error, SIN_TABLA_REGISTROS)
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
  if (error) return falla('savePlan', error, SIN_TABLA_PLAN)
  revalidatePath('/peso')
  return { ok: true }
}
