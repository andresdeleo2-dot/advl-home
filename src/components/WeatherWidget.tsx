'use client'

import { useEffect, useState } from 'react'

type WeatherData = {
  temp: number; feels: number; humidity: number; wind: number; label: string; icon: string
  forecast: { date: string; max: number; min: number; icon: string }[]
}
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function WeatherWidget() {
  const [data, setData] = useState<WeatherData | null>(null)
  useEffect(() => { fetch('/api/weather').then(r => r.json()).then(setData).catch(() => {}) }, [])

  if (!data) return <div className="h-36 animate-pulse rounded-2xl glass" />

  return (
    <div className="rounded-2xl glass p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-4xl font-light leading-none">{data.temp}°</p>
          <p className="mt-1 text-sm text-white/55">{data.label}</p>
          <p className="mt-0.5 text-[11px] text-white/35">Naucalpan · Sens. {data.feels}° · 💧{data.humidity}%</p>
        </div>
        <span className="text-4xl">{data.icon}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 border-t border-white/5 pt-3">
        {data.forecast.slice(0, 4).map(d => (
          <div key={d.date} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-white/35">{DAYS[new Date(d.date + 'T12:00:00').getDay()]}</span>
            <span className="text-base">{d.icon}</span>
            <span className="text-xs font-medium">{d.max}°</span>
            <span className="text-[10px] text-white/30">{d.min}°</span>
          </div>
        ))}
      </div>
    </div>
  )
}
