'use client'

import { useEffect, useState } from 'react'

export default function Clock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    function tick() {
      const now = new Date()
      setTime(now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }))
      setDate(now.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-3 text-right">
      <span className="text-xs text-white/30 capitalize">{date}</span>
      <span className="text-sm font-semibold tabular-nums text-white/70">{time}</span>
    </div>
  )
}
