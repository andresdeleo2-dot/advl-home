'use client'

import { useEffect, useState } from 'react'

type WeatherData = {
  temp: number
  feels: number
  humidity: number
  wind: number
  label: string
  icon: string
  forecast: { date: string; max: number; min: number; icon: string }[]
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function WeatherWidget() {
  const [data, setData] = useState<WeatherData | null>(null)

  useEffect(() => {
    fetch('/api/weather').then(r => r.json()).then(setData)
  }, [])

  if (!data) return (
    <div className="h-full animate-pulse rounded-xl bg-white/5" />
  )

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-gradient-to-b from-sky-900/30 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-4xl font-light">{data.temp}°</p>
          <p className="text-sm text-white/50">{data.label}</p>
          <p className="text-xs text-white/30 mt-1">
            Sensación {data.feels}° · Humedad {data.humidity}% · Viento {data.wind} km/h
          </p>
        </div>
        <span className="text-4xl">{data.icon}</span>
      </div>

      <div className="grid grid-cols-4 gap-1 border-t border-white/5 pt-3">
        {data.forecast.map(d => {
          const day = DAYS[new Date(d.date + 'T12:00:00').getDay()]
          return (
            <div key={d.date} className="flex flex-col items-center gap-0.5 text-center">
              <span className="text-[10px] text-white/30">{day}</span>
              <span className="text-base">{d.icon}</span>
              <span className="text-xs font-medium">{d.max}°</span>
              <span className="text-[10px] text-white/30">{d.min}°</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
