import { NextResponse } from 'next/server'

export const revalidate = 3600 // 1h — los RSS/Google News son gratis/sin límite; lo único con cuota es el pulido de Gemini (generación simple, no búsqueda)

/* Cada tema puede tener VARIOS focos específicos (lo que de verdad quieres seguir) más uno general
 * de respaldo. `query` arma un feed de Google News (búsqueda, gratis, sin API key — cubre lo
 * específico: un juego, una empresa, un país…); `feedUrl` es un RSS directo de un medio (para lo
 * general/amplio del tema). Para agregar/quitar seguimientos: edita esta lista. */
const TRACKS: { topic: string; label: string; query?: string; feedUrl?: string }[] = [
  // Videojuegos
  { topic: 'Videojuegos', label: 'GTA VI', query: 'GTA 6 OR "GTA VI" OR "Grand Theft Auto VI"' },
  { topic: 'Videojuegos', label: 'Wolverine', query: '"Marvel\'s Wolverine" juego OR videojuego' },
  { topic: 'Videojuegos', label: 'Más lanzamientos', feedUrl: 'https://es.ign.com/feed.xml' },
  // Finanzas y economía
  { topic: 'Finanzas y economía', label: 'Microsoft', query: 'Microsoft empresa OR acciones OR Nasdaq' },
  { topic: 'Finanzas y economía', label: 'Mercado Libre', query: '"Mercado Libre" empresa OR acciones OR MELI' },
  { topic: 'Finanzas y economía', label: 'Economía general', feedUrl: 'https://expansion.mx/rss' },
  // Política
  { topic: 'Política', label: 'México', query: 'política México' },
  { topic: 'Política', label: 'Reino Unido', query: 'política "Reino Unido" OR UK politics' },
  { topic: 'Política', label: 'Estados Unidos', query: 'política "Estados Unidos"' },
  // Series y TV
  { topic: 'Series y TV', label: 'Series y TV', feedUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/television/portada' },
]
const PER_TRACK = 3
const MODEL = 'gemini-3.6-flash'

export type NewsItem = { topic: string; label: string; title: string; summary: string; source: string; url: string; pubDate?: string }

// Decodificar ANTES de quitar tags: algunos feeds (IGN) traen el <img> del extracto ESCAPADO
// (&lt;img …&gt;) dentro del texto — si se quitan tags primero, ese escape sobrevive y al
// decodificar entidades DESPUÉS reaparece como una etiqueta HTML cruda en el resumen.
const decodeEntities = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
const stripHtml = (s: string) => decodeEntities(decodeEntities(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`, 'i'))
  return m ? m[1].trim() : ''
}
const gnewsUrl = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=MX&ceid=MX:es-419`

async function fetchTrack(t: (typeof TRACKS)[number]): Promise<NewsItem[]> {
  const url = t.feedUrl || gnewsUrl(t.query!)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (advl-home panel)' }, next: { revalidate: 3600 } })
    if (!r.ok) return []
    const xml = await r.text()
    // Google News mete "- Fuente" al final del título; un feed directo (feedUrl) no.
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
    return items.slice(0, PER_TRACK).map(block => {
      const rawTitle = stripHtml(tag(block, 'title'))
      const src = t.feedUrl ? (() => { try { return new URL(url).hostname.replace(/^(feeds\.|es\.)/, '') } catch { return '' } })() : (rawTitle.split(' - ').pop() || '')
      const title = t.feedUrl ? rawTitle : rawTitle.replace(/\s-\s[^-]+$/, '')
      return {
        topic: t.topic, label: t.label, title,
        summary: stripHtml(tag(block, 'description')).slice(0, 260),
        source: src, url: decodeEntities(tag(block, 'link')),
        pubDate: tag(block, 'pubDate') || undefined,
      }
    }).filter(x => x.title && x.url)
  } catch { return [] }
}

/** Pule los resúmenes con Gemini (generación simple, SIN búsqueda — esa parte de la cuota gratis
 *  sí funciona). Si falla por lo que sea, se quedan los resúmenes crudos del RSS — nunca se rompe. */
async function polishWithGemini(items: NewsItem[]): Promise<NewsItem[]> {
  const key = process.env.GEMINI_API_KEY
  if (!key || items.length === 0) return items
  const prompt = `Para cada noticia de esta lista, escribe un resumen de 1-2 oraciones en español, claro y neutral, basado ÚNICAMENTE en el título y el extracto dados (no inventes datos que no estén ahí; si el extracto no da para más, resume solo el título). Responde SOLO con un JSON array en el MISMO ORDEN, cada elemento: {"summary": "…"}.\n\n${items.map((it, i) => `${i + 1}. Título: ${it.title}\nExtracto: ${it.summary}`).join('\n\n')}`
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    })
    const j = await r.json()
    const text: string = (j?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('')
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed) || parsed.length !== items.length) return items
    return items.map((it, i) => (typeof parsed[i]?.summary === 'string' && parsed[i].summary.trim()) ? { ...it, summary: parsed[i].summary.trim() } : it)
  } catch { return items }
}

export async function GET() {
  const results = await Promise.all(TRACKS.map(fetchTrack))
  const raw = results.flat()
  const items = await polishWithGemini(raw)
  const topics = [...new Set(TRACKS.map(t => t.topic))]
  return NextResponse.json({ items, topics, updatedAt: new Date().toISOString() })
}
