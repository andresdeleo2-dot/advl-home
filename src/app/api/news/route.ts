import { NextResponse } from 'next/server'

export const revalidate = 3600 // 1h — noticias no necesitan refrescar más seguido, y cuida la cuota gratis de Gemini

// Temas a seguir. Para cambiarlos: edita esta lista (no hay UI para esto — es de un solo usuario).
const TOPICS = ['Videojuegos', 'Finanzas y economía', 'Política (México y mundo)', 'Series y TV']

export type NewsItem = { topic: string; title: string; summary: string; source: string; url: string }

const MODEL = 'gemini-3.6-flash'

export async function GET() {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'falta GEMINI_API_KEY en Vercel' }, { status: 500 })

  const prompt = `Eres un asistente de noticias. Busca y dame las noticias MÁS RECIENTES de hoy (o de los últimos 1-2 días) sobre estos temas: ${TOPICS.join(' · ')}.
Para CADA tema dame 2-3 noticias reales, verificables y relevantes (usa la búsqueda, no inventes nada).
Responde ÚNICAMENTE con un JSON array (sin markdown, sin texto antes o después), cada elemento con EXACTAMENTE estos campos:
{"topic": "<uno de los temas de arriba, tal cual>", "title": "<titular corto en español>", "summary": "<resumen de 1-2 oraciones en español>", "source": "<nombre del medio>", "url": "<link real y directo a la noticia>"}`

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
      next: { revalidate: 3600 },
    })
    const j = await r.json()
    if (j.error) return NextResponse.json({ error: j.error.message || 'error de Gemini' }, { status: 502 })

    const text: string = (j?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('')
    // Gemini a veces envuelve el JSON en ```json … ``` pese a pedirle que no lo haga.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    let items: NewsItem[] = []
    try {
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) items = parsed.filter((x): x is NewsItem => x && typeof x.title === 'string' && typeof x.url === 'string')
    } catch { /* respuesta no vino en JSON limpio — se regresa vacío, no se rompe la ruta */ }

    return NextResponse.json({ items, topics: TOPICS, updatedAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
