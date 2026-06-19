'use client'

import { useEffect, useState } from 'react'

type WeatherData = {
  temp: number; feels: number; humidity: number; wind: number; label: string; icon: string
  forecast: { date: string; max: number; min: number; icon: string }[]
  cities?: { name: string; temp: number; icon: string; label: string }[]
}
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function WeatherWidget() {
  const [data, setData] = useState<WeatherData | null>(null)
  useEffect(() => { fetch('/api/weather').then(r => r.json()).then(setData).catch(() => {}) }, [])

  if (!data) return <div className="h-40 animate-pulse rounded-2xl glass" />

  return (
    <div className="rounded-2xl glass p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="serif font-semibold leading-none text-[#16365F]" style={{ fontSize: 44 }}>{data.temp}°</p>
          <p className="mt-1.5 text-sm font-semibold text-[#14233D]">{data.label}</p>
          <p className="mt-1 text-[11px] text-[rgba(20,35,61,0.46)]">Naucalpan · Sens. {data.feels}° · 💧{data.humidity}%</p>
        </div>
        <span className="text-3xl leading-none">{data.icon}</span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 border-t border-[rgba(15,35,64,0.08)] pt-3">
        {data.forecast.slice(0, 4).map(d => (
          <div key={d.date} className="flex flex-col items-center gap-1">
            <span className="eyebrow">{DAYS[new Date(d.date + 'T12:00:00').getDay()]}</span>
            <span className="text-base leading-none">{d.icon}</span>
            <span className="text-xs font-bold text-[#16365F]">{d.max}°</span>
            <span className="text-[10px] text-[rgba(20,35,61,0.4)]">{d.min}°</span>
          </div>
        ))}
      </div>

      {data.cities && data.cities.length > 0 && (
        <div className="mt-3 border-t border-[rgba(15,35,64,0.08)] pt-3">
          <p className="eyebrow mb-2">Otras ciudades</p>
          <div className="grid grid-cols-2 gap-2">
            {data.cities.map(c => (
              <div key={c.name} className="flex items-center gap-2.5 rounded-[11px] border border-[rgba(15,35,64,0.08)] bg-[#FBFAF6] px-2.5 py-2">
                <span className="text-xl leading-none">{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-[#14233D]">{c.name}</p>
                  <p className="mt-0.5 text-[9.5px] text-[rgba(20,35,61,0.46)]">{c.label}</p>
                </div>
                <span className="text-base font-bold text-[#16365F]">{c.temp}°</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
