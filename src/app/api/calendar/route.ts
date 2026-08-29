import { NextResponse } from 'next/server'

export const revalidate = 900 // 15 min

const CALENDAR_IDS = [
  'andres@a-dvl.com',
  'c_9a0b9f82cd2e9bd6c41a225430841a69e1435c5989659c9d70d9040b9bc629cb@group.calendar.google.com',
]

// OAuth (opcional): si están GOOGLE_REFRESH_TOKEN + CLIENT_ID + SECRET, obtiene un access_token para
// leer el calendario AUTENTICADO como el dueño → títulos reales de TODOS los eventos (incl. privados),
// sin depender del compartir público. Si no está configurado, devuelve null y se usa la API key.
async function getAccessToken(): Promise<string | null> {
  const rt = process.env.GOOGLE_REFRESH_TOKEN
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!rt || !id || !secret) return null
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: rt, grant_type: 'refresh_token' }),
      cache: 'no-store',
    })
    const j = await r.json() as { access_token?: string; error?: string }
    if (j.error) { console.error('[calendar] refresh_token error:', j.error); return null }
    return j.access_token || null
  } catch (e) { console.error('[calendar] no se pudo obtener access_token:', String(e)); return null }
}

export async function GET() {
  const key = process.env.GOOGLE_CALENDAR_API_KEY
  const accessToken = await getAccessToken()
  if (!key && !accessToken) return NextResponse.json({ error: 'no api key ni oauth' }, { status: 500 })

  const now = new Date()
  // Start from Monday of current week so the week view has full data
  const dayOfWeek = now.getDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - daysFromMonday)
  startOfWeek.setHours(0, 0, 0, 0)
  // Ventana amplia: 3 semanas atrás y 3 adelante, para que el selector de día/semana
  // muestre juntas de días pasados y futuros (no sólo hoy).
  const timeMin = new Date(startOfWeek.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(startOfWeek.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString()

  const results = await Promise.all(
    CALENDAR_IDS.map(id => {
      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?singleEvents=true&orderBy=startTime&timeMin=${timeMin}&timeMax=${timeMax}&maxResults=250`
      // Con OAuth: Bearer (títulos reales). Sin OAuth: la API key (títulos sólo de lo compartido con detalle).
      const uri = accessToken ? base : `${base}&key=${key}`
      const init: RequestInit = accessToken ? { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' } : { next: { revalidate: 900 } }
      return fetch(uri, init).then(r => r.json())
        // Un fetch que RECHAZA (red/DNS/timeout) reventaba Promise.all y tumbaba TODA la ruta
        // (500), perdiendo también el calendario que sí respondió. Se aísla por calendario.
        .catch((err: unknown) => ({ error: { message: String(err) } }))
    })
  )

  // Registra fallas de Google (llave inválida, cuota, calendario dejó de compartirse): antes
  // se tragaban y el endpoint devolvía [] indistinguible de "sin eventos".
  results.forEach((r, i) => { const err = (r as { error?: { message?: string } })?.error; if (err) console.error('[calendar] error en', CALENDAR_IDS[i], '·', err.message || JSON.stringify(err)) })

  const events = results
    .flatMap(r => (r.items ?? []).map((e: Record<string, unknown>) => ({
      id: e.id,
      title: e.summary,
      start: (e.start as Record<string, string>)?.dateTime ?? (e.start as Record<string, string>)?.date,
      end: (e.end as Record<string, string>)?.dateTime ?? (e.end as Record<string, string>)?.date,
      allDay: !(e.start as Record<string, string>)?.dateTime,
      color: (e as Record<string, unknown>).colorId,
      location: e.location,
      description: e.description,
      htmlLink: e.htmlLink,
      hangoutLink: e.hangoutLink,
    })))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  // Un evento puede estar en más de un calendario (invitación personal + entrada del calendario
  // de grupo) → mismo id. Antes se deduplicaba quedándose con el PRIMERO, pero la copia del
  // calendario personal (compartido "solo libre/ocupado") llega SIN summary/lugar/descripción →
  // salía "(sin título)". Ahora se MERGEAN por id prefiriendo el campo no vacío de cualquiera de
  // las copias, así el título/lugar/descripción del calendario que sí los expone gana.
  type Ev = typeof events[number]
  const mergeEv = (prev: Ev, e: Ev): Ev => ({
    ...prev,
    title: prev.title || e.title,
    location: prev.location || e.location,
    description: prev.description || e.description,
    hangoutLink: prev.hangoutLink || e.hangoutLink,
    htmlLink: prev.htmlLink || e.htmlLink,
    color: prev.color || e.color,
  })
  // 1) Fusiona por id (misma entrada en 2 calendarios).
  const byId = new Map<string, Ev>()
  const sinId: Ev[] = []
  for (const e of events) {
    const id = String(e.id ?? '')
    if (!id) { sinId.push(e); continue }
    const prev = byId.get(id)
    byId.set(id, prev ? mergeEv(prev, e) : e)
  }
  // 2) Fusiona por MISMA hora exacta (la copia del calendario personal llega sin título
  //    pero con OTRO id que la del grupo; comparten start+end). Solo eventos con hora
  //    (NO día completo, para no colapsar dos cumpleaños del mismo día).
  const byTime = new Map<string, Ev>()
  const passthrough: Ev[] = []
  for (const e of [...byId.values(), ...sinId]) {
    if (e.allDay || !e.start) { passthrough.push(e); continue }
    const k = `${e.start}|${e.end ?? ''}`
    const prev = byTime.get(k)
    if (!prev) { byTime.set(k, e); continue }
    // Sólo es la MISMA reunión repartida en 2 calendarios si al menos una copia no tiene título (la
    // copia "solo libre/ocupado" lo omite) o comparten título. Si AMBAS ya tienen título propio y
    // DISTINTO, son 2 eventos reales que sólo coinciden en horario — no se fusionan, se quedan los 2
    // (antes cualquier coincidencia de hora fusionaba, y una de las dos citas reales desaparecía).
    if (!prev.title || !e.title || prev.title === e.title) byTime.set(k, mergeEv(prev, e))
    else passthrough.push(e)
  }
  const deduped = [...byTime.values(), ...passthrough].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return NextResponse.json(deduped)
}
