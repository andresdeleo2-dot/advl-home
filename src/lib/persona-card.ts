// Tipos y helpers portados de mi-vida para replicar (SOLO LECTURA) la ficha de
// persona dentro de advl-home. Se copian aquí porque la versión de src/lib/vida.ts
// es una variante recortada (su `Vida` no trae es_personal/recordar, su `fotoSrc`
// no reconoce todos los formatos de Drive). Este archivo es autosuficiente.

import { sanitizeHtml } from '@/lib/sanitize'

export const FECHA_NACIMIENTO = '1989-08-16'

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// ───────────────────────── Tipos ─────────────────────────

export type Encuentro = { id: string; fecha: string; nota: string | null }

export type Estudio = {
  id: string
  nivel: string
  institucion?: string | null
  carrera?: string | null
  inicio?: string | null
  fin?: string | null
  nota?: string | null
}

export type Documento = {
  id: string
  nombre: string
  tipo: string
  texto?: string | null
  caducidad?: string | null
  noVence?: boolean
  docUrl?: string | null
  folderUrl?: string | null
  nota?: string | null
}

export type Persona = {
  id: string
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
  conocidos_desde: string | null
  celular: string | null
  email: string | null
  direccion_actual: string | null
  direcciones_previas: string[] | null
  links: { label: string; url: string }[] | null
  foto: string | null
  apodo: string | null
  tipo_sangre: string | null
  profesion: string | null
  estudios: Estudio[] | null
  color_favorito: string | null
  restaurante_favorito: string | null
  restaurantes_top: string[] | null
  lugares_top: string[] | null
  lugar_favorito: string | null
  comida_favorita: string | null
  bebida_favorita: string | null
  facilidad_ver: number | null
  motivo_ver: string | null
  encuentros: Encuentro[] | null
  no_dona_sangre: boolean
  motivo_no_dona: string | null
  etapa_union: string | null
  etapa_convivencia: string | null
  musica_favorita: string[] | null
  notas_rich: string | null
  fallecio: boolean
  fecha_fallecimiento: string | null
  documentos: Documento[] | null
  orden: number | null
  orden_excep: number | null
  created_at?: string
}

export type Vida = {
  id: number
  titulo: string
  tipo: string
  es_personal: boolean
  outstanding: boolean
  hito?: boolean
  recordar?: boolean | null
  importancia: number | null
  nota: string | null
  descripcion: string | null
  fecha: string | null
  fecha_fin: string | null
  personas: string[]
  lugares: string[] | null
  fotos: string[]
  relevancia: string | null
  orden: number | null
  created_at?: string
}

// ───────────────────────── Constantes ─────────────────────────

export const IMP_PERSONA: Record<number, string> = {
  1: 'Distante', 2: 'Ocasional', 3: 'Presente', 4: 'Cercano', 5: 'Núcleo',
}

export const FACILIDAD_VER: Record<number, { label: string; desc: string; color: string; bg: string }> = {
  1: { label: 'Muy fácil', desc: 'Cerca y disponible', color: '#2F7D54', bg: 'rgba(47,125,84,.12)' },
  2: { label: 'Fácil', desc: 'Casi siempre se puede', color: '#5E9E5E', bg: 'rgba(94,158,94,.13)' },
  3: { label: 'Hay que planearlo', desc: 'Requiere agenda', color: '#8A6417', bg: 'rgba(199,154,58,.15)' },
  4: { label: 'Difícil', desc: 'Ocupado/a o algo lejos', color: '#C2622B', bg: 'rgba(194,98,43,.13)' },
  5: { label: 'Muy difícil', desc: 'Lejos / otro país / casi no coincidimos', color: '#B23F3F', bg: 'rgba(178,63,63,.12)' },
}

// max = edad máxima (inclusive) que cae en la etapa.
export const ETAPAS: { label: string; max: number; rango: string; desc: string }[] = [
  { label: 'Antes de nacer', max: -1, rango: '—', desc: '' },
  { label: 'Primeros años', max: 2, rango: '0–3', desc: '' },
  { label: 'Primera infancia', max: 5, rango: '3–6', desc: '' },
  { label: 'Infancia / niñez', max: 11, rango: '6–12', desc: '' },
  { label: 'Adolescencia', max: 17, rango: '12–17', desc: '' },
  { label: 'Juventud / primera adultez', max: 29, rango: '18–29', desc: '' },
  { label: 'Adultez joven', max: 39, rango: '30–39', desc: '' },
  { label: 'Adultez media', max: 59, rango: '40–60', desc: '' },
  { label: 'Adultez mayor', max: Infinity, rango: '60+', desc: '' },
]

// Signos zodiacales: rango de fechas + resumen breve.
export const ZODIACO: { nombre: string; simbolo: string; rango: string; desde: [number, number]; hasta: [number, number]; desc: string }[] = [
  { nombre: 'Aries', simbolo: '♈', rango: '21 mar – 19 abr', desde: [3, 21], hasta: [4, 19], desc: 'Directos, valientes y de arranque rápido; les encanta iniciar cosas.' },
  { nombre: 'Tauro', simbolo: '♉', rango: '20 abr – 20 may', desde: [4, 20], hasta: [5, 20], desc: 'Leales y pacientes; disfrutan la comodidad y lo bueno de la vida.' },
  { nombre: 'Géminis', simbolo: '♊', rango: '21 may – 20 jun', desde: [5, 21], hasta: [6, 20], desc: 'Curiosos, sociables y de mente rápida; platican con todo el mundo.' },
  { nombre: 'Cáncer', simbolo: '♋', rango: '21 jun – 22 jul', desde: [6, 21], hasta: [7, 22], desc: 'Protectores y sentimentales; su familia y su gente van primero.' },
  { nombre: 'Leo', simbolo: '♌', rango: '23 jul – 22 ago', desde: [7, 23], hasta: [8, 22], desc: 'Carismáticos y generosos; les encanta brillar y consentir a los suyos.' },
  { nombre: 'Virgo', simbolo: '♍', rango: '23 ago – 22 sep', desde: [8, 23], hasta: [9, 22], desc: 'Detallistas y prácticos; resuelven y cuidan hasta lo más pequeño.' },
  { nombre: 'Libra', simbolo: '♎', rango: '23 sep – 22 oct', desde: [9, 23], hasta: [10, 22], desc: 'Diplomáticos y encantadores; buscan equilibrio y buena compañía.' },
  { nombre: 'Escorpión', simbolo: '♏', rango: '23 oct – 21 nov', desde: [10, 23], hasta: [11, 21], desc: 'Intensos y leales; todo o nada, con una intuición enorme.' },
  { nombre: 'Sagitario', simbolo: '♐', rango: '22 nov – 21 dic', desde: [11, 22], hasta: [12, 21], desc: 'Aventureros y optimistas; libres, directos y buenos para reír.' },
  { nombre: 'Capricornio', simbolo: '♑', rango: '22 dic – 19 ene', desde: [12, 22], hasta: [1, 19], desc: 'Disciplinados y ambiciosos; cumplen lo que prometen.' },
  { nombre: 'Acuario', simbolo: '♒', rango: '20 ene – 18 feb', desde: [1, 20], hasta: [2, 18], desc: 'Originales e independientes; piensan distinto y van a su ritmo.' },
  { nombre: 'Piscis', simbolo: '♓', rango: '19 feb – 20 mar', desde: [2, 19], hasta: [3, 20], desc: 'Soñadores y empáticos; sienten todo y acompañan bonito.' },
]

export const TIPO_COLORES: Record<string, string> = {
  Familia: '#b06a44', Escuela: '#5b7794', Amor: '#a85a6a', Trabajo: '#6f8158',
  Viaje: '#4f8a86', Logro: '#bf8f3c', Amistad: '#876da0', Amistades: '#876da0',
  Hobby: '#7a9b6f', Mudanza: '#9a7b53', Pérdida: '#7c7268', Salud: '#5f8a9b',
  Relación: '#a85a6a', Ralación: '#a85a6a', Recuerdo: '#5C6577',
  'Punto clave': '#C79A3A', 'Evento importante': '#bf8f3c', 'Evento/Fiesta': '#876da0',
  Cumpleaños: '#C79A3A', Nace: '#b06a44',
  Historia: '#7c7268', Película: '#5b7794', Serie: '#6d6a96', Música: '#4f8a86',
  Tecnología: '#5f8a9b', Cultura: '#bf8f3c', Actor: '#5C6577',
}

// id de categoría → nombre bonito (según el seed de mi-vida). Se usa para pintar
// la categoría en versalitas; si el id no está aquí se prettifica el slug.
export const CAT_NAMES: Record<string, string> = {
  familia: 'Familia', politica: 'Familia Política', primaria: 'Primaria',
  secundaria: 'Secundaria', prepa: 'Prepa', universidad: 'Universidad', mba: 'MBA',
  trabajo: 'Trabajo', amigo_papa: 'Amigo Papá', papa_amigo: 'Papá de Amigo',
  amigos: 'Amigos', amistades: 'Amistades', pareja: 'Pareja', otros: 'Otros',
  privado: 'Privado', conocidos: 'Conocidos',
}

// Nombre visible de una categoría: mapa opcional del consumidor → seed → slug bonito.
export function catLabel(id: string | null | undefined, extra?: Record<string, string>): string {
  const key = (id || '').trim()
  if (!key) return '—'
  if (extra && extra[key]) return extra[key]
  if (CAT_NAMES[key]) return CAT_NAMES[key]
  return key.replace(/[_-]+/g, ' ')
}

// ───────────────────────── Fechas ─────────────────────────

const dosDigitos = (n: number) => String(n).padStart(2, '0')

export function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`
}

export function desdeISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
  return isNaN(d.getTime()) ? null : d
}

export function diasEntre(desde: Date, hasta: Date): number {
  const a = new Date(desde); a.setHours(12, 0, 0, 0)
  const b = new Date(hasta); b.setHours(12, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function añoDe(fecha: string): number {
  return new Date(fecha + 'T12:00:00').getFullYear()
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

// Años (calendario) que abarca una etapa, calculados desde FECHA_NACIMIENTO.
export function añosDeEtapa(label: string): string {
  const i = ETAPAS.findIndex(e => e.label === label)
  if (i < 0) return ''
  const nac = parseInt(FECHA_NACIMIENTO.slice(0, 4), 10)
  const e = ETAPAS[i]
  if (e.max < 0) return `hasta ${nac - 1}`
  const min = i >= 1 ? ETAPAS[i - 1].max + 1 : 0
  if (!isFinite(e.max)) return `${nac + Math.max(min, 0)}+`
  return `${nac + Math.max(min, 0)}–${nac + e.max}`
}

// "Adolescencia · 12–17 años · 2001–2006" (para las temporadas de la relación)
export function etapaTexto(label: string | null): string | null {
  if (!label?.trim()) return null
  const et = ETAPAS.find(x => x.label === label)
  return et ? `${et.label} · ${et.rango} años · ${añosDeEtapa(et.label)}` : label
}

export function signoZodiacal(fecha: string | null | undefined): (typeof ZODIACO)[number] | null {
  if (!fecha) return null
  const p = fecha.split('-').map(Number)
  const m = p[1], d = p[2]
  if (!m || !d) return null
  for (const z of ZODIACO) {
    const [m1, d1] = z.desde, [m2, d2] = z.hasta
    if (m1 <= m2) { if ((m === m1 && d >= d1) || (m === m2 && d <= d2) || (m > m1 && m < m2)) return z }
    else { if ((m === m1 && d >= d1) || (m === m2 && d <= d2) || m > m1 || m < m2) return z }
  }
  return null
}

export function memoriaDe(p: { cumple: string | null; fecha_fallecimiento: string | null }, hoy: string): {
  edadAlFallecer: number | null
  edadHoy: number | null
  añoNac: number | null
  añoMuerte: number | null
} {
  const cumple = p.cumple?.trim() || null
  const muerte = p.fecha_fallecimiento?.trim() || null
  return {
    edadAlFallecer: cumple && muerte ? diffFechas(cumple, muerte).años : null,
    edadHoy: cumple ? diffFechas(cumple, hoy).años : null,
    añoNac: cumple ? Number(cumple.slice(0, 4)) || null : null,
    añoMuerte: muerte ? Number(muerte.slice(0, 4)) || null : null,
  }
}

export function conocidosInfo(p: { conocidos_desde: string | null; cumple: string | null }, hoy: string): {
  hace: { años: number; meses: number; dias: number }
  miEdad: number
  suEdad: number | null
} | null {
  const d = p.conocidos_desde?.trim()
  if (!d) return null
  return {
    hace: diffFechas(d, hoy),
    miEdad: edadEnFecha(d).años,
    suEdad: p.cumple?.trim() ? diffFechas(p.cumple, d).años : null,
  }
}

// Cumpleaños "16 de agosto"
export function fmtCumple(iso: string | null): string {
  if (!iso) return ''
  const p = iso.split('-')
  if (p.length < 3) return ''
  const day = parseInt(p[2], 10), m = parseInt(p[1], 10) - 1
  if (isNaN(day) || isNaN(m) || !MESES[m]) return ''
  return `${day} de ${MESES[m]}`
}

// Días para el próximo cumpleaños (0 = hoy). null si no hay fecha.
export function diasParaCumple(cumple: string | null | undefined): number | null {
  if (!cumple) return null
  const p = cumple.split('-').map(Number)
  if (p.length < 3) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  let next = new Date(hoy.getFullYear(), p[1] - 1, p[2])
  if (next.getTime() < hoy.getTime()) next = new Date(hoy.getFullYear() + 1, p[1] - 1, p[2])
  return Math.round((next.getTime() - hoy.getTime()) / 86400000)
}

export function faltaCumpleLabel(cumple: string | null | undefined): string {
  const d = diasParaCumple(cumple)
  if (d == null) return ''
  if (d === 0) return '¡Es hoy! 🎉'
  if (d === 1) return 'Es mañana'
  if (d <= 30) return `Faltan ${d} días`
  const m = Math.round(d / 30)
  return `Faltan ${d} días (~${m} ${m === 1 ? 'mes' : 'meses'})`
}

// "Hace 3 semanas" a partir de una fecha ISO.
export function relTime(iso: string | null): string {
  if (!iso) return 'Sin registro'
  const then = desdeISO(iso)
  if (!then) return 'Sin registro'
  const d = diasEntre(then, new Date())
  if (d < 0) return 'Próximamente'
  if (d === 0) return 'Visto hoy'
  if (d === 1) return 'Visto ayer'
  if (d < 7) return `Hace ${d} días`
  if (d < 30) { const w = Math.floor(d / 7); return `Hace ${w} ${w === 1 ? 'semana' : 'semanas'}` }
  if (d < 365) { const m = Math.floor(d / 30); return `Hace ${m} ${m === 1 ? 'mes' : 'meses'}` }
  const y = Math.floor(d / 365); return `Hace ${y} ${y === 1 ? 'año' : 'años'}`
}

export function fmtFechaLarga(iso: string): string {
  const p = iso.split('-').map(Number)
  if (p.length < 3 || !MESES[p[1] - 1]) return iso
  return `${p[2]} de ${MESES[p[1] - 1]} de ${p[0]}`
}

// ───────────────────────── HTML / notas ─────────────────────────

export function sanitizeNota(raw: string): string {
  return sanitizeHtml(raw)
}

// Texto que puede ser HTML (del editor rico) o texto plano viejo.
export function comoHtml(v: string | null | undefined): string {
  if (!v?.trim()) return ''
  const s = sanitizeNota(v)
  if (/<[a-z][^>]*>/i.test(s)) return s
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return '<p>' + esc.replace(/\n/g, '<br>') + '</p>'
}

// ───────────────────────── Fotos ─────────────────────────

// Google Drive → miniatura directa, reconociendo varios formatos de link.
export function fotoSrc(url: string, ancho?: number): string {
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)
  if (!driveMatch) return url
  const w = ancho ? Math.min(1600, Math.max(64, Math.round(ancho * 2))) : 800
  return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w${w}`
}

// ───────────────────────── Color favorito ─────────────────────────

const COLORES_ES: Record<string, string> = {
  rojo: '#D33', azul: '#2E5EAA', 'azul marino': '#1B3A6B', 'azul cielo': '#6EB5E0',
  verde: '#3A8B4C', 'verde agua': '#4EA79B', amarillo: '#E8C33C', naranja: '#E2853C',
  morado: '#7A4E9E', lila: '#B08FD1', rosa: '#E28FB0', 'rosa mexicano': '#E4007C',
  negro: '#1A1A1A', blanco: '#FFFFFF', gris: '#8A8F98', café: '#7A5233', beige: '#DCCDB4',
  dorado: '#C79A3A', plata: '#B8BCC2', turquesa: '#3FB8AF', vino: '#6E1F32', coral: '#E9705E',
}

export function colorAHex(v: string): string | null {
  const s = (v || '').trim().toLowerCase()
  if (!s) return null
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s
  return COLORES_ES[s] ?? null
}

// ───────────────────────── Recuerdos ─────────────────────────

// "Fecha a recordar" (aniversario anual). Read-only: sin override.
export function esFechaRec(r: Vida): boolean {
  return !!r.fecha && (r.recordar === true || (r.recordar !== false && !!r.outstanding))
}
