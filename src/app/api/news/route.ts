import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DEFAULT_TRACKS, type NewsTrack } from '@/lib/newsTracks'

export const revalidate = 3600 // 1h — los RSS/Google News son gratis/sin límite; lo único con cuota es el pulido de Gemini (generación simple, no búsqueda)

const PER_TRACK = 3
const MODEL = 'gemini-3.6-flash'

export type NewsItem = { topic: string; label: string; title: string; summary: string; source: string; url: string; pubDate?: string; instructions?: string }

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

async function fetchTrack(t: NewsTrack): Promise<NewsItem[]> {
  const url = t.feedUrl || gnewsUrl(t.query!)
  try {
    // Límite de tiempo por fuente: un tema agregado a mano con una URL/búsqueda que se cuelga NO
    // debe bloquear toda la sección — con 8s, si esta fuente no responde, se omite y siguen las demás.
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (advl-home panel)' }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) })
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
        // Más margen que antes (era 260): entre más texto crudo tenga Gemini para trabajar,
        // más sustancioso puede ser el resumen — no es sólo cosmético, es la materia prima.
        summary: stripHtml(tag(block, 'description')).slice(0, 600),
        source: src, url: decodeEntities(tag(block, 'link')),
        pubDate: tag(block, 'pubDate') || undefined,
        instructions: t.instructions,
      }
    }).filter(x => x.title && x.url)
  } catch { return [] }
}

/** Una sola llamada a Gemini; puede fallar (503 "high demand" es frecuente con modelos nuevos). */
async function callGemini(key: string, prompt: string): Promise<unknown[] | null> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    signal: AbortSignal.timeout(20000),
  })
  const j = await r.json()
  if (j.error) return null
  const text: string = (j?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('')
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const parsed = JSON.parse(cleaned)
  return Array.isArray(parsed) ? parsed : null
}

/** Pule los resúmenes con Gemini (generación simple, SIN búsqueda — esa parte de la cuota gratis
 *  sí funciona). Reintenta una vez si falla (el modelo nuevo da 503 "high demand" seguido — suele
 *  ser cosa de segundos). Si de plano no responde, se quedan los resúmenes crudos del RSS — nunca
 *  se rompe la sección por esto. */
async function polishWithGemini(items: NewsItem[]): Promise<NewsItem[]> {
  const key = process.env.GEMINI_API_KEY
  if (!key || items.length === 0) return items
  const prompt = `Para cada noticia de esta lista, escribe un resumen en español de 3 a 5 oraciones que saque lo MÁS IMPORTANTE: qué pasó exactamente, cifras/fechas/nombres concretos si los hay, y por qué importa — no una frase genérica, sino los datos reales que trae el extracto. Basado ÚNICAMENTE en el título y el extracto dados (no inventes nada que no esté ahí; si el extracto es corto, saca todo el jugo posible sin inventar). Si la noticia trae unas "Instrucciones" propias, dales prioridad a esos aspectos en el resumen. Responde SOLO con un JSON array en el MISMO ORDEN, cada elemento: {"summary": "…"}.\n\n${items.map((it, i) => `${i + 1}. Título: ${it.title}\nExtracto: ${it.summary}${it.instructions ? `\nInstrucciones para este tema: ${it.instructions}` : ''}`).join('\n\n')}`
  let parsed: unknown[] | null = null
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    if (attempt > 0) await new Promise(res => setTimeout(res, 2500))
    try { parsed = await callGemini(key, prompt) } catch { parsed = null }
  }
  if (!parsed || parsed.length !== items.length) return items
  return items.map((it, i) => {
    const s = (parsed![i] as { summary?: string } | undefined)?.summary
    return (typeof s === 'string' && s.trim()) ? { ...it, summary: s.trim() } : it
  })
}

async function loadTracks(): Promise<NewsTrack[]> {
  try {
    const { data } = await supabase.from('news_config').select('tracks').eq('id', 'main').maybeSingle()
    const saved = data?.tracks as NewsTrack[] | undefined
    return Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_TRACKS
  } catch { return DEFAULT_TRACKS }   // tabla no existe todavía (falta correr sql/news-config.sql) — no rompe la sección
}

export async function GET() {
  const tracks = await loadTracks()
  const results = await Promise.all(tracks.map(fetchTrack))
  const raw = results.flat()
  const items = await polishWithGemini(raw)
  const topics = [...new Set(tracks.map(t => t.topic))]
  return NextResponse.json({ items, topics, updatedAt: new Date().toISOString() })
}
