import { NextResponse } from 'next/server'

export const revalidate = 1800 // 30 min

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

function wmoMeta(code: number) {
  return WMO[code] ?? { label: 'Desconocido', icon: '🌡️' }
}

function fetchCity(lat: number, lon: number) {
  return fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset&timezone=auto&forecast_days=4`,
    { next: { revalidate: 1800 } }
  ).then(r => r.json())
}

export async function GET() {
  const [nau, mty, sf] = await Promise.all([
    fetchCity(19.4794, -99.2314),  // Naucalpan
    fetchCity(25.6866, -100.3161), // Monterrey
    fetchCity(37.7749, -122.4194), // San Francisco
  ])

  if (!nau?.current) return NextResponse.json({ error: 'weather fetch failed' }, { status: 500 })

  const code = nau.current.weathercode
  const meta = wmoMeta(code)

  const fmtSun = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })

  const cityCard = (d: typeof nau, name: string) => {
    const m = wmoMeta(d?.current?.weathercode ?? 0)
    return { name, temp: Math.round(d?.current?.temperature_2m ?? 0), icon: m.icon, label: m.label }
  }

  return NextResponse.json({
    temp: Math.round(nau.current.temperature_2m),
    feels: Math.round(nau.current.apparent_temperature),
    humidity: nau.current.relative_humidity_2m,
    wind: Math.round(nau.current.windspeed_10m),
    label: meta.label,
    icon: meta.icon,
    sun: { sunrise: fmtSun(nau.daily.sunrise[0]), sunset: fmtSun(nau.daily.sunset[0]) },
    forecast: nau.daily.time.map((date: string, i: number) => ({
      date,
      max: Math.round(nau.daily.temperature_2m_max[i]),
      min: Math.round(nau.daily.temperature_2m_min[i]),
      icon: wmoMeta(nau.daily.weathercode[i]).icon,
    })),
    cities: [
      cityCard(mty, 'Monterrey'),
      cityCard(sf, 'San Francisco'),
    ],
  })
}
