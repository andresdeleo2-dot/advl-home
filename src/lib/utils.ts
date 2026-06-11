import type { Item } from './supabase'

// Normaliza links de Google Drive a formato visible directo
export function normalizeImageUrl(url?: string | null): string | null {
  if (!url) return null
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
  if (driveMatch) {
    return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w200`
  }
  const openMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/)
  if (openMatch) {
    return `https://drive.google.com/thumbnail?id=${openMatch[1]}&sz=w200`
  }
  return url
}

// Favicon como fallback de imagen
export function getFaviconUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
  } catch {
    return null
  }
}

// Normaliza texto para búsqueda: minúsculas y sin acentos
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Búsqueda tolerante por título, url, categoría, subcategoría, descripción y keywords
// Soporta varias palabras: todas deben aparecer (en cualquier orden)
export function matchesQuery(item: Item, q: string): boolean {
  if (!q) return true
  const haystack = normalizeText(
    [
      item.title,
      item.url,
      item.section,
      item.subcategory,
      item.description,
      ...(item.keywords ?? []),
    ]
      .filter(Boolean)
      .join(' ')
  )
  const terms = normalizeText(q).split(/\s+/).filter(Boolean)
  return terms.every(t => haystack.includes(t))
}

// Etiqueta corta y legible para un link (host + tipo de recurso de Google)
export function shortLinkLabel(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host.includes('drive.google.com')) {
      if (/\/folders\//.test(u.pathname)) return 'Carpeta Drive'
      return 'Archivo Drive'
    }
    if (host.includes('docs.google.com')) {
      if (u.pathname.includes('/spreadsheets/')) return 'Hoja de cálculo'
      if (u.pathname.includes('/document/')) return 'Documento'
      if (u.pathname.includes('/presentation/')) return 'Presentación'
      return 'Google Docs'
    }
    if (host.includes('script.google.com')) return 'Apps Script'
    return host
  } catch {
    return 'Abrir link'
  }
}

// Separa la descripción en texto plano y la lista de links detectados
export type ParsedDescription = { text: string; links: { url: string; label: string }[] }
export function parseDescription(text?: string | null): ParsedDescription {
  if (!text) return { text: '', links: [] }
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const links: { url: string; label: string }[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = urlRegex.exec(text)) !== null) {
    const clean = m[0].replace(/[).,]+$/, '')
    if (seen.has(clean)) continue
    seen.add(clean)
    links.push({ url: clean, label: shortLinkLabel(clean) })
  }
  // Texto sin las URLs crudas, limpiando etiquetas tipo "Carpeta:" colgantes
  const cleanText = text
    .replace(urlRegex, '')
    .replace(/\s*[:|-]\s*$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return { text: cleanText, links }
}

// Agrupa items por sección (respetando section_order) y luego por subcategoría
export type SubGroup = { subcategory: string | null; items: Item[] }
export type SectionGroup = { section: string; order: number; subgroups: SubGroup[] }

export function groupItems(items: Item[]): SectionGroup[] {
  const sections = new Map<string, { order: number; items: Item[] }>()
  for (const item of items) {
    if (!sections.has(item.section)) {
      sections.set(item.section, { order: item.section_order ?? 999, items: [] })
    }
    sections.get(item.section)!.items.push(item)
  }

  return Array.from(sections.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([section, val]) => {
      const subs = new Map<string, Item[]>()
      for (const item of val.items) {
        const key = item.subcategory || ''
        if (!subs.has(key)) subs.set(key, [])
        subs.get(key)!.push(item)
      }
      const subgroups: SubGroup[] = Array.from(subs.entries()).map(([sub, its]) => ({
        subcategory: sub || null,
        items: its.sort((a, b) => (a.item_order ?? 999) - (b.item_order ?? 999)),
      }))
      // Items sin subcategoría primero
      subgroups.sort((a, b) => (a.subcategory ? 1 : 0) - (b.subcategory ? 1 : 0))
      return { section, order: val.order, subgroups }
    })
}

export const ACCENT_OPTIONS = ['copper', 'blue', 'green', 'purple', 'red', 'cyan', 'orange'] as const
