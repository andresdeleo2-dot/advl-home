/* Utilidades de cumpleaños / "fiesta" compartidas por los widgets del header y
   la celebración de la portada. El cumpleaños de Andrés es una constante (su
   tarjeta en Personas también lo trae, pero así la fiesta no depende de la base
   ni de un fetch). */

export const MI_NOMBRE = 'Andrés De Velasco Lozano'
export const MI_CUMPLE = '1989-08-16' // 16 de agosto

// Paleta festiva: el dorado de la marca + acentos alegres para el confeti.
export const PALETA_FIESTA = ['#E7C56B', '#C2933A', '#1F4F86', '#FFB4A2', '#3FB27F', '#F3EFE6', '#B23F3F', '#8E7CC3']

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

// ¿Este nombre es el del propio Andrés? (su cumpleaños se celebra distinto)
export const esAndres = (nombre?: string | null) => norm(nombre || '') === norm(MI_NOMBRE)

// 'MM-DD' de una fecha ISO 'YYYY-MM-DD'. '' si no sirve.
export function mmdd(iso?: string | null): string {
  const p = (iso || '').split('-')
  if (p.length < 3 || !p[1] || !p[2]) return ''
  return `${p[1]}-${p[2]}`
}

// 'MM-DD' de hoy en hora LOCAL (no UTC, para no saltar de día por la tarde).
export function hoyMMDD(): string {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ¿Hoy es el cumpleaños de esta persona? (compara mes-día, ignora el año)
export const esHoyCumple = (cumpleISO?: string | null) => {
  const m = mmdd(cumpleISO)
  return !!m && m === hoyMMDD()
}

// Edad que cumple hoy (si el cumple es hoy) o que tiene ahora. null sin año.
export function edadHoy(cumpleISO?: string | null): number | null {
  const p = (cumpleISO || '').split('-').map(Number)
  if (p.length < 3 || !p[0]) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - p[0]
  const aunNo = (hoy.getMonth() + 1 < p[1]) || (hoy.getMonth() + 1 === p[1] && hoy.getDate() < p[2])
  if (aunNo) edad -= 1
  return edad
}

// Edad que cumple ESTE año (año actual − año de nacimiento). Es el número del
// mensaje "hoy cumples N"; sirve también para previsualizar antes del día.
export function edadQueCumple(cumpleISO?: string | null): number | null {
  const y = Number((cumpleISO || '').slice(0, 4))
  return y ? new Date().getFullYear() - y : null
}

// Número a formato wa.me (solo dígitos; los celulares MX de 10 dígitos llevan 52).
export function waNumero(celular?: string | null): string | null {
  const d = (celular || '').replace(/\D/g, '')
  if (d.length < 10) return null
  return d.length === 10 ? `52${d}` : d
}

/* Fiesta forzada para PREVISUALIZAR sin esperar la fecha:
   ?fiesta=1 (o cualquier valor) → enciende la fiesta de Andrés hoy mismo.
   ?fiesta=off (o 0) → la apaga aunque sea el día. */
export function fiestaForzada(): 'andres' | 'off' | null {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('fiesta')
  if (v == null) return null
  if (v === 'off' || v === '0' || v === 'no') return 'off'
  return 'andres'
}
