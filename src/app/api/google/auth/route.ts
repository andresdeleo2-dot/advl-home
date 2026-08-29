import { NextRequest, NextResponse } from 'next/server'

// Paso 1 del OAuth de Google Calendar: manda a la pantalla de consentimiento.
// Requiere GOOGLE_OAUTH_CLIENT_ID (y el SECRET en el callback). El redirect_uri se arma con el
// origen de la petición → registra EXACTAMENTE https://<tu-dominio>/api/google/callback en Google Cloud.
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Falta GOOGLE_OAUTH_CLIENT_ID en las variables de entorno (Vercel).' }, { status: 500 })
  }
  const origin = new URL(req.url).origin
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT || `${origin}/api/google/callback`
  // state anti-CSRF: liga la respuesta de Google a ESTA petición. Sin esto, alguien podría iniciar
  // su PROPIO consentimiento, mandarte el link de vuelta con SU ?code=, y si lo abres logueado el
  // callback canjearía y mostraría el refresh_token de esa OTRA cuenta como si fuera el tuyo.
  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',   // pide refresh_token (lectura aunque no estés presente)
    prompt: 'consent',        // fuerza a que SIEMPRE devuelva refresh_token la primera vez
    include_granted_scopes: 'true',
    state,
  })
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  res.cookies.set('g_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/api/google' })
  return res
}
