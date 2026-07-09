// Tipos y helpers portados de mi-vida para mostrar el mismo detalle de un recuerdo.

export type Vida = {
  id: number
  titulo: string
  tipo: string
  fecha: string | null
  fecha_fin: string | null
  nota: string | null
  descripcion: string | null
  personas: string[] | null
  fotos: string[] | null
  importancia: number | null
  outstanding: boolean
  relevancia: string | null
}

export const FECHA_NACIMIENTO = '1989-08-16'

export const ETAPAS: { label: string; max: number }[] = [
  { label: 'Antes de nacer', max: -1 },
  { label: 'Primeros años', max: 2 },
  { label: 'Primera infancia', max: 5 },
  { label: 'Infancia / niñez', max: 11 },
  { label: 'Adolescencia', max: 17 },
  { label: 'Juventud / primera adultez', max: 29 },
  { label: 'Adultez joven', max: 39 },
  { label: 'Adultez media', max: 59 },
  { label: 'Adultez mayor', max: Infinity },
]

export const TIPO_COLORES: Record<string, string> = {
  Familia: '#b06a44', Escuela: '#5b7794', Amor: '#a85a6a', Trabajo: '#6f8158',
  Viaje: '#4f8a86', Logro: '#bf8f3c', Amistad: '#876da0', Amistades: '#876da0',
  Hobby: '#7a9b6f', Mudanza: '#9a7b53', Pérdida: '#7c7268', Salud: '#5f8a9b',
  Relación: '#a85a6a', Ralación: '#a85a6a', Recuerdo: '#9a8a6c',
  'Punto clave': '#bb6a47', 'Evento importante': '#bf8f3c', 'Evento/Fiesta': '#876da0',
  Cumpleaños: '#bb6a47', Nace: '#b06a44',
  Historia: '#7c7268', Película: '#5b7794', Serie: '#6d6a96', Música: '#4f8a86',
  Tecnología: '#5f8a9b', Cultura: '#bf8f3c', Actor: '#9a8a6c',
}
export function colorTipo(tipo: string) {
  return TIPO_COLORES[tipo] ?? '#9a8a6c'
}

export function edadEnFecha(fecha: string): { años: number; meses: number; etapa: string } {
  const nac = new Date(FECHA_NACIMIENTO + 'T12:00:00')
  const f = new Date(fecha.length <= 10 ? fecha + 'T12:00:00' : fecha)

  if (f < nac) {
    const añosAntes = Math.floor((nac.getTime() - f.getTime()) / (365.25 * 24 * 3600 * 1000))
    return { años: -añosAntes, meses: 0, etapa: 'Antes de nacer' }
  }

  let años = f.getFullYear() - nac.getFullYear()
  let meses = f.getMonth() - nac.getMonth()
  const dias = f.getDate() - nac.getDate()
  if (dias < 0) meses--
  if (meses < 0) { años--; meses += 12 }

  const etapa = ETAPAS.find(e => años <= e.max)?.label ?? 'Adultez mayor'
  return { años, meses, etapa }
}

export function añoDe(fecha: string): number {
  return new Date(fecha + 'T12:00:00').getFullYear()
}

export function diffFechas(desde: string, hasta: string): { años: number; meses: number; dias: number } {
  let a = new Date(desde + (desde.length <= 10 ? 'T12:00:00' : ''))
  let b = new Date(hasta + (hasta.length <= 10 ? 'T12:00:00' : ''))
  if (a > b) [a, b] = [b, a]

  let años = b.getFullYear() - a.getFullYear()
  let meses = b.getMonth() - a.getMonth()
  let dias = b.getDate() - a.getDate()

  if (dias < 0) {
    meses--
    const diasMesAnterior = new Date(b.getFullYear(), b.getMonth(), 0).getDate()
    dias += diasMesAnterior
  }
  if (meses < 0) { años--; meses += 12 }

  return { años, meses, dias }
}

export function formatDiff(d: { años: number; meses: number; dias: number }): string {
  const partes: string[] = []
  if (d.años) partes.push(`${d.años} ${d.años === 1 ? 'año' : 'años'}`)
  if (d.meses) partes.push(`${d.meses} ${d.meses === 1 ? 'mes' : 'meses'}`)
  if (d.dias) partes.push(`${d.dias} ${d.dias === 1 ? 'día' : 'días'}`)
  if (!partes.length) return 'mismo día'
  return partes.join(', ')
}

export function sanitizeNota(raw: string): string {
  if (!raw) return ''
  let s = raw
  if (s.includes('&lt;') && !s.includes('<')) {
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
  }
  s = s.replace(/\s(class|style|data-[\w-]+)="[^"]*"/gi, '')
  return s.trim()
}

export function fotoSrc(url: string): string {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`
  return url
}
