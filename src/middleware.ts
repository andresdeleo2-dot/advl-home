import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Protege toda la página y la API con una contraseña simple (cookie).
// Si SITE_PASSWORD no está definida, no bloquea nada (útil en desarrollo).
export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD
  if (!password) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (pathname === '/login' || pathname === '/api/auth') return NextResponse.next()

  const cookie = req.cookies.get('advl_auth')?.value
  if (cookie === password) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|logo.png|icon-.*\\.png).*)'],
}
