'use client'

import { useEffect, useState } from 'react'

type CalEvent = {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
}

function formatStart(start: string, allDay: boolean) {
  const d = new Date(allDay ? start + 'T12:00:00' : start)
  if (allDay) return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function isToday(start: string, allDay: boolean) {
  const d = new Date(allDay ? start + 'T12:00:00' : start)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

export default function CalendarWidget() {
  const [events, setEvents] = useState<CalEvent[] | null>(null)

  useEffect(() => {
    fetch('/api/calendar').then(r => r.json()).then(setEvents)
  }, [])

  if (!events) return <div className="h-full animate-pulse rounded-xl bg-white/5" />

  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-gradient-to-b from-indigo-900/20 overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Próximos eventos</p>
      </div>
      <div className="flex flex-col divide-y divide-white/5 overflow-y-auto max-h-64">
        {events.length === 0 && (
          <p className="px-4 py-6 text-sm text-white/30 text-center">Sin eventos esta semana</p>
        )}
        {events.map(ev => (
          <div key={ev.id} className={`flex items-start gap-3 px-4 py-2.5 ${isToday(ev.start, ev.allDay) ? 'bg-indigo-500/10' : ''}`}>
            <div className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${isToday(ev.start, ev.allDay) ? 'bg-indigo-400' : 'bg-white/20'}`} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white/80">{ev.title}</p>
              <p className="text-xs text-white/30">{formatStart(ev.start, ev.allDay)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
