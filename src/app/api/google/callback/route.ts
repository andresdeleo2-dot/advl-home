import { NextRequest, NextResponse } from 'next/server'

// Paso 2 del OAuth: Google regresa aquí con ?code=… . Se canjea por tokens y se MUESTRA el
// refresh_token para que lo pegues en Vercel como GOOGLE_REFRESH_TOKEN (una sola vez). A partir de
// ahí /api/calendar lee TU calendario autenticado como tú, con títulos reales (incluidos privados),
// sin exponer nada público. No se guarda en base de datos: vive sólo en tu variable de entorno.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const err = url.searchParams.get('error')
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT || `${url.origin}/api/google/callback`

  const page = (title: string, body: string, ok = false) =>
    new NextResponse(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<body style="font:15px/1.6 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 18px;color:#16365F">` +
      `<h2 style="color:${ok ? '#2E6E6E' : '#B0522E'}">${title}</h2>${body}</body>`,
      { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } }
    )

  if (err) return page('Google canceló el permiso', `<p>Motivo: <code>${err}</code>. Vuelve a intentar en <code>/api/google/auth</code>.</p>`)
  if (!code) return page('Falta el código', `<p>Entra primero a <a href="/api/google/auth">/api/google/auth</a> para dar el permiso.</p>`)
  if (!clientId || !clientSecret) return page('Falta configurar el cliente', `<p>Agrega <code>GOOGLE_OAUTH_CLIENT_ID</code> y <code>GOOGLE_OAUTH_CLIENT_SECRET</code> en Vercel y reintenta.</p>`)

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    const j = await r.json() as { refresh_token?: string; access_token?: string; error?: string; error_description?: string }
    if (j.error) return page('Google rechazó el canje', `<p><code>${j.error}</code>: ${j.error_description || ''}</p><p>Revisa que el <b>redirect URI</b> registrado sea exactamente <code>${redirectUri}</code>.</p>`)
    if (!j.refresh_token) return page('No llegó refresh_token', `<p>Google no devolvió refresh_token (suele pasar si ya diste permiso antes). Ve a <a href="https://myaccount.google.com/permissions">tus permisos de Google</a>, quita el acceso de esta app y vuelve a <a href="/api/google/auth">/api/google/auth</a>.</p>`)
    // Éxito: muestra el refresh_token para pegarlo en Vercel.
    return page('✓ Listo — copia tu token', `
      <p>Pega esto en Vercel como variable de entorno <b>GOOGLE_REFRESH_TOKEN</b> y vuelve a desplegar:</p>
      <textarea readonly style="width:100%;height:90px;font:13px/1.4 monospace;padding:10px;border:1px solid #ccc;border-radius:8px" onclick="this.select()">${j.refresh_token}</textarea>
      <p style="color:#8a4b28">Es un secreto (acceso de lectura a tu calendario). No lo compartas. Al desplegar con esa variable, el calendario del Panel mostrará los títulos reales de todos tus eventos.</p>`, true)
  } catch (e) {
    return page('Error de red', `<p>${String(e)}</p>`)
  }
}
