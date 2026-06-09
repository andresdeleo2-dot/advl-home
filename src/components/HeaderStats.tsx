'use client'

import { useEffect, useRef, useState } from 'react'
import { CONFIG } from '@/lib/config'

type Weather = { temp: number; icon: string; label: string }
type Sun = { sunrise: string; sunset: string }

function timeIn(tz: string, withSeconds = true) {
  return new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: true, timeZone: tz,
  })
}
function dateIn(tz: string) {
  return new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: tz,
  })
}

export default function HeaderStats() {
  const [, setTick] = useState(0)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [sun, setSun] = useState<Sun | null>(null)
  const [open, setOpen] = useState(false)
  const [zoneIdx, setZoneIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    fetch('/api/weather').then(r => r.json()).then(d => {
      if (d && typeof d.temp === 'number') setWeather({ temp: d.temp, icon: d.icon, label: d.label })
      if (d?.sun) setSun(d.sun)
    }).catch(() => {})
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const active = CONFIG.clocks[zoneIdx] ?? CONFIG.clocks[0]

  return (
    <div className="flex items-center gap-2">
      {weather && (
        <div className="hidden sm:flex items-center gap-1.5 rounded-xl band-glass px-2.5 py-1.5 text-white">
          <span className="text-base leading-none">{weather.icon}</span>
          <span className="text-sm font-semibold">{weather.temp}°</span>
        </div>
      )}

      {sun && (
        <div className="hidden md:flex items-center gap-2 rounded-xl band-glass px-2.5 py-1.5 text-[11px] text-white/75">
          <span title="Amanecer">🌅 {sun.sunrise}</span>
          <span title="Atardecer">🌇 {sun.sunset}</span>
        </div>
      )}

      <div className="relative" ref={ref}>
        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 rounded-xl band-glass band-glass-hover px-3 py-1.5 text-white">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/55">{active.short}</span>
          <span className="text-sm font-semibold tabular-nums">{timeIn(active.tz)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-white/60 transition-transform ${open ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
        </button>

        {open && (
          <div className="animate-fade absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-[#16365f]/10 bg-white p-2 shadow-2xl">
            {CONFIG.clocks.map((c, i) => {
              const isActive = i === zoneIdx
              return (
                <button key={c.tz} onClick={() => { setZoneIdx(i); }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${isActive ? 'bg-[#2d6cdf]/10 ring-1 ring-[#2d6cdf]/20' : 'hover:bg-[#f1f6fc]'}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0f2340]">{c.label}</p>
                    <p className="text-[11px] capitalize text-[#16365f]/55">{dateIn(c.tz)}</p>
                  </div>
                  <span className="ml-3 whitespace-nowrap text-sm font-bold tabular-nums text-[#2d6cdf]">{timeIn(c.tz)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
