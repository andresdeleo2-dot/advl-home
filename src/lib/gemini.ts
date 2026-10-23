// Llamada a Gemini para análisis de texto/JSON (la misma llave GEMINI_API_KEY y el mismo modelo que
// usa Noticias en el Panel). Los modelos nuevos dan 503 "high demand" seguido, así que hay reintento
// y, como último recurso, el alias `gemini-flash-latest` sin modo JSON.

export const GEMINI_MODEL = 'gemini-3.6-flash'
const FALLBACK_MODEL = 'gemini-flash-latest'

export class GeminiError extends Error {
  /** true = reintentar no lo arregla (falta la llave o Google la rechaza): hay que configurarla, no esperar. */
  readonly permanente: boolean
  constructor(message: string, permanente = false) {
    super(message)
    this.permanente = permanente
  }
}

type Intento = { model: string; json: boolean; timeoutMs: number; esperaMs: number }
const INTENTOS: Intento[] = [
  { model: GEMINI_MODEL, json: true, timeoutMs: 22_000, esperaMs: 0 },
  { model: GEMINI_MODEL, json: true, timeoutMs: 20_000, esperaMs: 1_500 },
  { model: FALLBACK_MODEL, json: false, timeoutMs: 14_000, esperaMs: 0 },
]
const PRESUPUESTO_MS = 54_000   // la ruta tiene maxDuration = 60 s: dejar margen para guardar y responder

/** Texto de salida del modelo, sin cercas ```json. */
function textoDe(j: unknown): string {
  const parts = (j as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts ?? []
  return parts.map(p => p.text || '').join('').replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
}

async function unaLlamada(key: string, prompt: string, it: Intento): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${it.model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: it.json ? { responseMimeType: 'application/json', temperature: 0.4 } : { temperature: 0.4 },
    }),
    signal: AbortSignal.timeout(it.timeoutMs),
  })
  const j = await r.json().catch(() => null)
  const err = (j as { error?: { message?: string } } | null)?.error
  if (!r.ok || err) {
    // 401/403 = llave rechazada o sin permiso; 400 que menciona la llave = llave inválida. Ninguno se arregla reintentando.
    const permanente = r.status === 401 || r.status === 403 || (r.status === 400 && /api[ _-]?key/i.test(err?.message ?? ''))
    throw new GeminiError(`${r.status}${err?.message ? ` · ${err.message.slice(0, 120)}` : ''}`, permanente)
  }
  const txt = textoDe(j)
  if (!txt) throw new GeminiError('respuesta vacía')
  return txt
}

/** Pide a Gemini y devuelve el texto (JSON si `json`). Lanza GeminiError si todos los intentos fallan. */
export async function gemini(prompt: string, opts: { json: boolean }): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiError('falta GEMINI_API_KEY en Vercel', true)
  const inicio = Date.now()
  let ultimo = 'sin respuesta'
  let intentos = 0, permanentes = 0
  for (const base of INTENTOS) {
    const it = { ...base, json: base.json && opts.json }
    if (it.esperaMs) await new Promise(res => setTimeout(res, it.esperaMs))
    const restante = PRESUPUESTO_MS - (Date.now() - inicio)
    if (restante < 5_000) break
    intentos++
    try {
      return await unaLlamada(key, prompt, { ...it, timeoutMs: Math.min(it.timeoutMs, restante) })
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e)
      if (e instanceof GeminiError && e.permanente) permanentes++
    }
  }
  // Permanente solo si TODOS los intentos fueron rechazos de configuración: un 503 en alguno ya es un fallo temporal.
  throw new GeminiError(ultimo, intentos > 0 && permanentes === intentos)
}
