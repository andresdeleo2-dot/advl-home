import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Protege toda la página y la API con Supabase Auth (mismo patrón que dashboard-finanzas).
export async function middleware(request: NextRequest) {
  // Cron de recordatorios push: lo llama Vercel Cron (o un cron externo) SIN sesión de usuario, así
  // que se autentica con CRON_SECRET en vez de con Supabase Auth. Tiene que resolverse ANTES del
  // gate de abajo — si no, cualquier petición sin cookie de sesión cae en el 401 de "no autorizado"
  // antes de que la propia ruta llegue a revisar el secreto (el chequeo dentro de la ruta quedaba
  // inalcanzable). Sin CRON_SECRET configurado, esta ruta se queda detrás del login normal.
  if (request.nextUrl.pathname === '/api/push/send') {
    const secret = process.env.CRON_SECRET
    if (secret) {
      const auth = request.headers.get('authorization') || ''
      const qs = request.nextUrl.searchParams.get('secret') || ''
      if (auth === `Bearer ${secret}` || qs === secret) return NextResponse.next()
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    // Fail-OPEN sólo en desarrollo (para configurar sin fricción). En PRODUCCIÓN,
    // fail-CLOSED: una env faltante NUNCA debe dejar /api/* (service key, sin RLS) ni
    // las páginas abiertas al público. Se bloquea salvo /login.
    if (process.env.NODE_ENV !== 'production') return NextResponse.next()
    const { pathname } = request.nextUrl
    if (pathname.startsWith('/login')) return NextResponse.next()
    if (pathname.startsWith('/api/')) return NextResponse.json({ ok: false, error: 'auth no configurada' }, { status: 503 })
    const redirect = request.nextUrl.clone(); redirect.pathname = '/login'
    return NextResponse.redirect(redirect)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user) {
    if (pathname.startsWith('/login')) return supabaseResponse
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
    }
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/login'
    return NextResponse.redirect(redirect)
  }

  if (user && pathname.startsWith('/login')) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/'
    return NextResponse.redirect(redirect)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|logo.png|icon-.*\\.png|sw.js|manifest.json).*)'],
}
