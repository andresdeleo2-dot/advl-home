'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const r = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (r.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError('Contraseña incorrecta')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="band w-full max-w-sm rounded-3xl p-8 text-center text-white shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="ADVL" className="mx-auto h-20 w-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]" />
        <h1 className="mt-4 text-xl font-semibold">Panel Andres</h1>
        <p className="mt-1 text-sm text-white/55">Ingresa tu contraseña para continuar</p>

        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoFocus
          className="mt-6 w-full rounded-2xl border border-white/20 bg-white px-4 py-3 text-center text-sm text-[#0f2340] outline-none placeholder:text-[#16365f]/40 focus:border-white"
        />
        {error && <p className="mt-2 text-xs font-medium text-red-300">{error}</p>}

        <button type="submit" disabled={loading || !password}
          className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-bold text-[#16365f] shadow-lg transition hover:bg-white/90 disabled:opacity-50">
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
