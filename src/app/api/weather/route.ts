import { NextResponse } from 'next/server'

export const revalidate = 1800 // 30 min

// Naucalpan de Juárez, México
const LAT = 19.4794
const LON = -99.2314

const WMO: Record<number, { label: string; icon: string }> = {
  0:  { label: 'Despejado', icon: '☀️' },
  1:  { label: 'Mayormente despejado', icon: '🌤️' },
  2:  { label: 'Parcialmente nublado', icon: '⛅' },
  3:  { label: 'Nublado', icon: '☁️' },
  45: { label: 'Neblina', icon: '🌫️' },
  48: { label: 'Neblina con escarcha', icon: '🌫️' },
  51: { label: 'Llovizna ligera', icon: '🌦️' },
  53: { label: 'Llovizna', icon: '🌦️' },
  55: { label: 'Llovizna intensa', icon: '🌧️' },
  61: { label: 'Lluvia ligera', icon: '🌧️' },
  63: { label: 'Lluvia', icon: '🌧️' },
  65: { label: 'Lluvia intensa', icon: '🌧️' },
  80: { label: 'Chubascos', icon: '🌦️' },
  81: { label: 'Chubascos moderados', icon: '🌧️' },
  82: { label: 'Chubascos fuertes', icon: '⛈️' },
  95: { label: 'Tormenta', icon: '⛈️' },
  99: { label: 'Tormenta con granizo', icon: '⛈️' },
}

export async function GET() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset&timezone=America%2FMexico_City&forecast_days=4`

  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) return NextResponse.json({ error: 'weather fetch failed' }, { status: 500 })

  const d = await res.json()
  const code = d.current.weathercode
  const meta = WMO[code] ?? { label: 'Desconocido', icon: '🌡️' }

  const fmtSun = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })

  return NextResponse.json({
    temp: Math.round(d.current.temperature_2m),
    feels: Math.round(d.current.apparent_temperature),
    humidity: d.current.relative_humidity_2m,
    wind: Math.round(d.current.windspeed_10m),
    label: meta.label,
    icon: meta.icon,
    sun: { sunrise: fmtSun(d.daily.sunrise[0]), sunset: fmtSun(d.daily.sunset[0]) },
    forecast: d.daily.time.map((date: string, i: number) => ({
      date,
      max: Math.round(d.daily.temperature_2m_max[i]),
      min: Math.round(d.daily.temperature_2m_min[i]),
      icon: (WMO[d.daily.weathercode[i]] ?? { icon: '🌡️' }).icon,
    })),
  })
}
