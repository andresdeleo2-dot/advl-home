'use client'

import { useEffect, useState } from 'react'
import { CONFIG } from '@/lib/config'

type Weather = { temp: number; icon: string; label: string }
type Sun = { sunrise: string; sunset: string }

function timeIn(tz: string) {
  return new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: tz,
  })
}

export default function HeaderStats() {
  const [now, setNow] = useState(Date.now())
  const [weather, setWeather] = useState<Weather | null>(null)
  const [sun, setSun] = useState<Sun | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    fetch('/api/weather').then(r => r.json()).then(d => {
      if (d && typeof d.temp === 'number') setWeather({ temp: d.temp, icon: d.icon, label: d.label })
      if (d?.sun) setSun(d.sun)
    }).catch(() => {})
    return () => clearInterval(id)
  }, [])

  void now // fuerza re-render cada segundo

  const [primary, ...rest] = CONFIG.clocks

  return (
    <div className="flex items-center gap-2">
      {/* Clima */}
      {weather && (
        <div className="hidden sm:flex items-center gap-1.5 rounded-xl glass px-2.5 py-1.5">
          <span className="text-base leading-none">{weather.icon}</span>
          <span className="text-sm font-semibold">{weather.temp}°</span>
        </div>
      )}

      {/* Sol */}
      {sun && (
        <div className="hidden md:flex items-center gap-2 rounded-xl glass px-2.5 py-1.5 text-[11px] text-white/60">
          <span title="Amanecer">🌅 {sun.sunrise}</span>
          <span title="Atardecer">🌇 {sun.sunset}</span>
        </div>
      )}

      {/* Reloj principal + dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 rounded-xl glass glass-hover px-3 py-1.5"
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">{primary.short}</span>
          <span className="text-sm font-semibold tabular-nums">{timeIn(primary.tz)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
        </button>

        {open && (
          <div className="animate-fade absolute right-0 z-30 mt-2 w-52 rounded-2xl glass p-2 shadow-2xl">
            {[primary, ...rest].map(c => (
              <div key={c.tz} className="flex items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/5">
                <div>
                  <p className="text-xs font-medium text-white/80">{c.label}</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/35">{c.short}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-white/90">{timeIn(c.tz)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
