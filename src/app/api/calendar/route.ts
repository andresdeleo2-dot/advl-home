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

  return NextResponse.json(events)
}
