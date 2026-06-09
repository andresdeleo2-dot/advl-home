'use client'

import { useEffect, useRef, useState } from 'react'

const PRESETS = [
  { label: '+20m', min: 20 },
  { label: '+30m', min: 30 },
  { label: '+45m', min: 45 },
  { label: '+1h', min: 60 },
]

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 880; o.type = 'sine'
    g.gain.setValueAtTime(0.001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    o.start(); o.stop(ctx.currentTime + 0.6)
  } catch { /* noop */ }
}

export default function TimerWidget() {
  const [target, setTarget] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const firedRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (target === null) { firedRef.current = false; return }
    if (!firedRef.current && now >= target) {
      firedRef.current = true
      beep()
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⏰ Tiempo cumplido', { body: 'Tu temporizador llegó a cero.' })
      }
    }
  }, [now, target])

  const start = (min: number) => {
    firedRef.current = false
    setTarget(Date.now() + min * 60 * 1000)
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }
  const reset = () => { setTarget(null); firedRef.current = false }

  const diffMs = target ? target - now : 0
  const fired = target !== null && diffMs <= 0
  const abs = Math.abs(diffMs)
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const s = Math.floor((abs % 60000) / 1000)
  const fmt = `${h > 0 ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const targetTime = target ? new Date(target).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }) : null

  return (
    <div className={`rounded-2xl glass p-4 transition-colors ${fired ? 'ring-1 ring-red-400/40' : ''}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Temporizador</p>
        {target !== null && (
          <button onClick={reset} className="rounded-lg bg-white/8 px-2 py-0.5 text-[10px] font-medium text-white/60 hover:bg-white/15">
            Reiniciar
          </button>
        )}
      </div>

      {target === null ? (
        <>
          <p className="mb-2.5 text-xs text-white/45">Elige una alarma rápida:</p>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => start(p.min)}
                className="rounded-xl bg-white/8 py-2 text-xs font-semibold text-white/80 hover:bg-amber-500/20">
                {p.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center">
          <p className={`tabular-nums font-light tracking-tight ${fired ? 'text-red-300 text-3xl pulse-ring rounded-xl' : 'text-white text-4xl'}`}>
            {fired ? '+' : ''}{fmt}
          </p>
          <p className="mt-1 text-[11px] text-white/40">
            {fired ? 'Tiempo transcurrido desde la alarma' : `Suena a las ${targetTime}`}
          </p>
        </div>
      )}
    </div>
  )
}
