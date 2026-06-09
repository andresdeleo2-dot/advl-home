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

// Búsqueda tolerante por título, url, categoría, subcategoría, descripción y keywords
export function matchesQuery(item: Item, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase().trim()
  const haystack = [
    item.title,
    item.url,
    item.section,
    item.subcategory,
    item.description,
    ...(item.keywords ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

// Detecta URLs en una descripción y las parte en segmentos para renderizar links
export type DescSegment = { type: 'text' | 'link'; content: string; href?: string }
export function parseDescription(text?: string | null): DescSegment[] {
  if (!text) return []
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const segments: DescSegment[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = urlRegex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, m.index) })
    }
    segments.push({ type: 'link', content: m[0], href: m[0] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }
  return segments
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
