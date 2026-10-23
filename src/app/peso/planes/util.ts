// Lógica pura de la biblioteca de rutinas y dietas (fechas, tamaños, validación del HTML y manejo de
// la lista). Sin React ni imports de valores: solo tipos, para poder probarla directo con node.

import type { PesoPlanMeta, PlanTipo } from '@/lib/peso-planes'

/** Evento de window que emite la pestaña «Rutinas y dietas» cada vez que cambia la lista (detail = PesoPlanMeta[]), para
 *  que PesoClient (contador de la pestaña, «Planes en uso» del Resumen) se mantenga al día sin conocer al hijo. Vive aquí,
 *  en un módulo diminuto y sin React, para que PesoClient lo importe sin arrastrar PesoPlanes (que carga con import dinámico). */
export const PLANES_EVENTO = 'peso:planes'

const TIPOS: readonly PlanTipo[] = ['rutina', 'dieta', 'otro']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// ── Tamaños ─────────────────────────────────────────────────────────────────

/** Tamaño legible en unidades decimales (como Finder y como MAX_HTML_BYTES: 4,000,000 B = "4 MB"). */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1000) return `${Math.round(n)} B`
  const quitaCero = (s: string) => s.replace(/\.0$/, '')
  if (n < 1_000_000) {
    const kb = n / 1000
    return `${kb < 10 ? quitaCero(kb.toFixed(1)) : Math.round(kb)} KB`
  }
  const mb = n / 1_000_000
  return `${mb < 100 ? quitaCero(mb.toFixed(1)) : Math.round(mb)} MB`
}

/** Bytes reales (UTF-8) de un texto: lo que pesará en el cuerpo de la petición. */
export function bytesDe(texto: string): number {
  return new TextEncoder().encode(texto).length
}

// ── Fechas (siempre en hora de México, igual en servidor y cliente → sin desajuste de hidratación) ──

let _fmtMX: Intl.DateTimeFormat | null = null

/** 'YYYY-MM-DD' en America/Mexico_City de un instante ISO. */
export function fechaMX(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  _fmtMX ??= new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' })
  return _fmtMX.format(d)
}

/** '2026-07-12' → '12 jul 2026'. */
export function fmtFechaCorta(f: string): string {
  const [y, m, d] = f.split('-')
  const mes = MESES[Number(m) - 1]
  if (!y || !mes || !d) return f
  return `${Number(d)} ${mes} ${y}`
}

function utcMs(f: string) {
  const [y, m, d] = f.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Días de calendario de `a` a `b` ('YYYY-MM-DD'). */
export function diasEntre(a: string, b: string): number {
  return Math.round((utcMs(b) - utcMs(a)) / 86_400_000)
}

/** "hoy", "ayer", "hace 3 días", "hace 2 semanas", "hace 4 meses" o la fecha corta. Con `hoy` nulo
 *  (antes de montar) devuelve la fecha absoluta, que es idéntica en servidor y cliente. */
export function fechaRelativa(iso: string, hoy: string | null): string {
  const f = fechaMX(iso)
  if (!hoy) return fmtFechaCorta(f)
  const d = diasEntre(f, hoy)
  if (d <= 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  if (d < 30) { const s = Math.floor(d / 7); return `hace ${s} ${s === 1 ? 'semana' : 'semanas'}` }
  if (d < 365) { const m = Math.floor(d / 30); return `hace ${m} ${m === 1 ? 'mes' : 'meses'}` }
  return fmtFechaCorta(f)
}

// ── Validación del HTML subido ──────────────────────────────────────────────

/** ¿Parece un documento HTML? (no basta la extensión: un .html vacío o un binario renombrado no sirven). */
export function pareceHtml(texto: string): boolean {
  const t = texto.slice(0, 400_000)
  if (!t.trim() || t.includes('\u0000')) return false
  if (/<!doctype\s+html|<html[\s>]/i.test(t)) return true
  const tags = t.match(/<\/?(?:head|body|div|section|main|article|header|footer|nav|h[1-6]|p|ul|ol|li|table|tr|td|th|style|script|span|a|img|br|strong|em|b|i|form|button)\b[^>]*>/gi)
  return !!tags && tags.length >= 3
}

/** Mensaje de error local (antes de enviar) o null si el HTML es válido. */
export function validarHtml(html: string, bytes: number, maxBytes: number): string | null {
  if (!html.trim()) return 'El archivo está vacío.'
  if (bytes > maxBytes) return `Pesa ${fmtBytes(bytes)} y el máximo es ${fmtBytes(maxBytes)}.`
  if (!pareceHtml(html)) return 'No parece un documento HTML (no se encontraron etiquetas como <html>, <body> o <div>).'
  return null
}

/** ¿El archivo es HTML por extensión o por tipo MIME? */
export function esArchivoHtml(nombre: string, mime: string): boolean {
  return /\.(html?|xhtml)$/i.test(nombre) || /^(text\/html|application\/xhtml\+xml)$/i.test(mime)
}

/** Título legible a partir del nombre del archivo: "rutina_fuerza-3dias.html" → "Rutina fuerza 3dias". */
export function tituloDeArchivo(nombre: string, max = 120): string {
  const base = nombre.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!base) return ''
  return (base[0].toUpperCase() + base.slice(1)).slice(0, max)
}

// ── Lista de planes ─────────────────────────────────────────────────────────

/** El plan "en uso" va primero; luego los más recientes. */
export function ordenarPlanes(planes: PesoPlanMeta[]): PesoPlanMeta[] {
  return [...planes].sort((a, b) =>
    Number(b.activo) - Number(a.activo) || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

/** Inserta o reemplaza un plan; si queda "en uso", quita la marca a los demás de su tipo (a lo más uno por tipo). */
export function aplicarPlan(planes: PesoPlanMeta[], p: PesoPlanMeta): PesoPlanMeta[] {
  const base = planes.some(x => x.id === p.id) ? planes.map(x => (x.id === p.id ? p : x)) : [p, ...planes]
  return p.activo ? base.map(x => (x.id !== p.id && x.tipo === p.tipo && x.activo ? { ...x, activo: false } : x)) : base
}

/** Plan a proyectar de un tipo: el preferido si existe; si no, el "en uso"; si no, el más reciente. */
export function elegirPlan(planes: PesoPlanMeta[], tipo: PlanTipo, preferido: string | null): PesoPlanMeta | null {
  const lista = ordenarPlanes(planes.filter(p => p.tipo === tipo))
  return lista.find(p => p.id === preferido) ?? lista[0] ?? null
}

/** Tipo con el que se abre la pestaña: el del plan pedido; si no, el primero con plan "en uso"; si no, el primero con planes. */
export function tipoInicial(planes: PesoPlanMeta[], preferido: string | null): PlanTipo {
  const pedido = preferido ? planes.find(p => p.id === preferido) : null
  if (pedido) return pedido.tipo
  return TIPOS.find(t => planes.some(p => p.tipo === t && p.activo))
    ?? TIPOS.find(t => planes.some(p => p.tipo === t))
    ?? 'rutina'
}

/** Tras borrar `id`, el plan que conviene mostrar: el siguiente de su tipo (o el anterior si era el último). */
export function siguienteTras(planes: PesoPlanMeta[], id: string): PesoPlanMeta | null {
  const borrado = planes.find(p => p.id === id)
  if (!borrado) return null
  const lista = ordenarPlanes(planes.filter(p => p.tipo === borrado.tipo))
  const i = lista.findIndex(p => p.id === id)
  return lista[i + 1] ?? lista[i - 1] ?? null
}

/** Normaliza lo que devuelve la API a un PesoPlanMeta (y descarta cualquier campo extra, como un html accidental). */
export function aMeta(x: unknown): PesoPlanMeta | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.titulo !== 'string') return null
  const tipo = TIPOS.includes(o.tipo as PlanTipo) ? (o.tipo as PlanTipo) : 'otro'
  const creado = typeof o.created_at === 'string' ? o.created_at : ''
  return {
    id: o.id,
    tipo,
    titulo: o.titulo,
    descripcion: typeof o.descripcion === 'string' && o.descripcion.trim() ? o.descripcion : null,
    bytes: typeof o.bytes === 'number' && Number.isFinite(o.bytes) ? o.bytes : 0,
    activo: o.activo === true,
    created_at: creado,
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : creado,
  }
}

/** Normaliza una lista cruda de la API. */
export function aMetaLista(x: unknown): PesoPlanMeta[] {
  return Array.isArray(x) ? x.map(aMeta).filter((p): p is PesoPlanMeta => p !== null) : []
}
