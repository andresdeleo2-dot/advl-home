import { NextResponse } from 'next/server'

export const revalidate = 3600 // 1h — los RSS son gratis/sin límite; lo único con cuota es el pulido de Gemini (generación simple, no búsqueda)

// Un feed RSS real y gratis por tema — no necesita API key ni tiene límite. Para cambiar temas/fuentes: edita esta lista.
const FEEDS: { topic: string; url: string }[] = [
  { topic: 'Videojuegos', url: 'https://es.ign.com/feed.xml' },
  { topic: 'Finanzas y economía', url: 'https://expansion.mx/rss' },
  { topic: 'Política (México y mundo)', url: 'https://feeds.bbci.co.uk/mundo/rss.xml' },
  { topic: 'Series y TV', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/television/portada' },
]
const PER_TOPIC = 4
const MODEL = 'gemini-3.6-flash'

export type NewsItem = { topic: string; title: string; summary: string; source: string; url: string }

// Decodificar ANTES de quitar tags: algunos feeds (IGN) traen el <img> del extracto ESCAPADO
// (&lt;img …&gt;) dentro del texto — si se quitan tags primero, ese escape sobrevive y al
// decodificar entidades DESPUÉS reaparece como una etiqueta HTML cruda en el resumen.
const decodeEntities = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
const stripHtml = (s: string) => decodeEntities(decodeEntities(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`, 'i'))
  return m ? m[1].trim() : ''
}

async function fetchFeed(topic: string, url: string): Promise<NewsItem[]> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (advl-home panel)' }, next: { revalidate: 3600 } })
    if (!r.ok) return []
    const xml = await r.text()
    const host = (() => { try { return new URL(url).hostname.replace(/^(feeds\.|es\.)/, '') } catch { return '' } })()
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
    return items.slice(0, PER_TOPIC).map(block => ({
      topic,
      title: stripHtml(tag(block, 'title')),
      summary: stripHtml(tag(block, 'description')).slice(0, 220),
      source: host,
      url: decodeEntities(tag(block, 'link')),
    })).filter(x => x.title && x.url)
  } catch { return [] }
}

/** Pule los resúmenes con Gemini (generación simple, SIN búsqueda — esa parte de la cuota gratis
 *  sí funciona). Si falla por lo que sea, se quedan los resúmenes crudos del RSS — nunca se rompe. */
async function polishWithGemini(items: NewsItem[]): Promise<NewsItem[]> {
  const key = process.env.GEMINI_API_KEY
  if (!key || items.length === 0) return items
  const prompt = `Para cada noticia de esta lista, escribe un resumen de 1 sola oración en español, claro y neutral, basado ÚNICAMENTE en el título y el extracto dados (no inventes datos que no estén ahí). Responde SOLO con un JSON array en el MISMO ORDEN, cada elemento: {"summary": "…"}.\n\n${items.map((it, i) => `${i + 1}. Título: ${it.title}\nExtracto: ${it.summary}`).join('\n\n')}`
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
  const results = await Promise.all(FEEDS.map(f => fetchFeed(f.topic, f.url)))
  const raw = results.flat()
  const items = await polishWithGemini(raw)
  return NextResponse.json({ items, topics: FEEDS.map(f => f.topic), updatedAt: new Date().toISOString() })
}
