'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="band w-full max-w-sm rounded-3xl p-8 text-center text-white shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="ADVL" className="mx-auto h-20 w-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]" />
        <h1 className="mt-4 text-xl font-semibold">Panel Andres</h1>
        <p className="mt-1 text-sm text-white/55">Inicia sesión para continuar</p>

        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          autoFocus
          required
          className="mt-6 w-full rounded-2xl border border-white/20 bg-white px-4 py-3 text-center text-sm text-[#0f2340] outline-none placeholder:text-[#16365f]/40 focus:border-white"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Contraseña"
          required
          className="mt-3 w-full rounded-2xl border border-white/20 bg-white px-4 py-3 text-center text-sm text-[#0f2340] outline-none placeholder:text-[#16365f]/40 focus:border-white"
        />
        {error && <p className="mt-2 text-xs font-medium text-red-300">{error}</p>}

        <button type="submit" disabled={loading || !password || !email}
          className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-bold text-[#16365f] shadow-lg transition hover:bg-white/90 disabled:opacity-50">
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
