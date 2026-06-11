import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }))
  const expected = process.env.SITE_PASSWORD

  if (!expected || password !== expected) {
    return NextResponse.json({ ok: false, error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('advl_auth', expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 año
    path: '/',
  })
  return res
}
