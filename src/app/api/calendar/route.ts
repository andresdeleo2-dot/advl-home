import { NextResponse } from 'next/server'

export const revalidate = 900 // 15 min

const CALENDAR_IDS = [
  'andres@a-dvl.com',
  'c_9a0b9f82cd2e9bd6c41a225430841a69e1435c5989659c9d70d9040b9bc629cb@group.calendar.google.com',
]

export async function GET() {
  const key = process.env.GOOGLE_CALENDAR_API_KEY
  if (!key) return NextResponse.json({ error: 'no api key' }, { status: 500 })

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
    CALENDAR_IDS.map(id =>
      fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?singleEvents=true&orderBy=startTime&timeMin=${timeMin}&timeMax=${timeMax}&maxResults=250&key=${key}`,
        { next: { revalidate: 900 } }
      ).then(r => r.json())
        // Un fetch que RECHAZA (red/DNS/timeout) reventaba Promise.all y tumbaba TODA la ruta
        // (500), perdiendo también el calendario que sí respondió. Se aísla por calendario.
        .catch((err: unknown) => ({ error: { message: String(err) } }))
    )
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
    byTime.set(k, prev ? mergeEv(prev, e) : e)
  }
  const deduped = [...byTime.values(), ...passthrough].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return NextResponse.json(deduped)
}
