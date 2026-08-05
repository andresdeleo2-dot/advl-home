import { NextResponse } from 'next/server'
import crypto from 'crypto'

export const runtime = 'nodejs'   // necesita crypto (firma RS256)

type SA = { client_email: string; private_key: string; token_uri?: string }

// Flujo OAuth2 de cuenta de servicio: firma un JWT con la private key y lo canjea por un access token.
async function getAccessToken(sa: SA): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token'
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const signingInput = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud, iat: nowSec, exp: nowSec + 3600,
  })}`
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(sa.private_key, 'base64url')
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${signingInput}.${signature}` }),
  })
  const j = await res.json()
  if (!res.ok || !j.access_token) throw new Error(j.error_description || j.error || 'token error')
  return j.access_token as string
}

export async function POST(req: Request) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return NextResponse.json({ ok: false, error: 'no_service_account', hint: 'Falta GOOGLE_SERVICE_ACCOUNT_JSON en Vercel (pega el JSON de la cuenta de servicio).' }, { status: 400 })
  let sa: SA
  try { sa = JSON.parse(raw) } catch { return NextResponse.json({ ok: false, error: 'El GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido.' }, { status: 400 }) }
  if (!sa.client_email || !sa.private_key) return NextResponse.json({ ok: false, error: 'El JSON no trae client_email/private_key.' }, { status: 400 })

  let body: { title?: string; startISO?: string; endISO?: string; calendarId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'bad_body' }, { status: 400 }) }
  const { title, startISO, endISO } = body
  if (!title || !startISO || !endISO) return NextResponse.json({ ok: false, error: 'Faltan title/startISO/endISO.' }, { status: 400 })
  const calendarId = body.calendarId || process.env.CALENDAR_ID || 'andres@a-dvl.com'

  try {
    const token = await getAccessToken(sa)
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: title, start: { dateTime: startISO }, end: { dateTime: endISO } }),
    })
    const j = await res.json()
    if (!res.ok) return NextResponse.json({ ok: false, error: j.error?.message || 'calendar error', hint: 'Comparte el calendario con el correo de la cuenta de servicio y dale permiso de "Hacer cambios en eventos".' }, { status: res.status })
    return NextResponse.json({ ok: true, id: j.id, htmlLink: j.htmlLink })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
