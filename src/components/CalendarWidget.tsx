'use client'

import { useEffect, useState } from 'react'
import { CONFIG } from '@/lib/config'

type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean }

function fmt(start: string, allDay: boolean) {
  const d = new Date(allDay ? start + 'T12:00:00' : start)
  const date = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
  if (allDay) return date
  return date + ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
function isToday(start: string, allDay: boolean) {
  const d = new Date(allDay ? start + 'T12:00:00' : start)
  return d.toDateString() === new Date().toDateString()
}

const EMBED_BASE = 'https://calendar.google.com/calendar/embed'
const srcParams =
  `src=${encodeURIComponent(CONFIG.calendars.primary)}&src=${encodeURIComponent(CONFIG.calendars.secondary)}` +
  `&ctz=America%2FMexico_City&showTitle=0&showPrint=0&showCalendars=0&showTz=0`

export default function CalendarWidget() {
  const [view, setView] = useState<'agenda' | 'semana'>('agenda')
  const [events, setEvents] = useState<CalEvent[] | null>(null)

  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(d => setEvents(Array.isArray(d) ? d : []))
      .catch(() => setEvents([]))
  }, [])

  return (
    <div className="flex flex-col rounded-2xl glass overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#16365f]/45">Calendario</p>
        <div className="flex items-center gap-1">
          {(['agenda', 'semana'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold capitalize ${view === v ? 'bg-[#2d6cdf] text-white' : 'text-[#16365f]/55 hover:bg-[#16365f]/8'}`}>
              {v}
            </button>
          ))}
          <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener noreferrer"
            title="Abrir Google Calendar"
            className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-lg text-[#16365f]/55 hover:bg-[#16365f]/8">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17 17 7M7 7h10v10"/></svg>
          </a>
        </div>
      </div>

      {view === 'agenda' ? (
        <div className="flex flex-col divide-y divide-[#16365f]/8 overflow-y-auto" style={{ maxHeight: 280 }}>
          {!events && <p className="px-4 py-6 text-center text-sm text-[#16365f]/40">Cargando…</p>}
          {events && events.length === 0 && <p className="px-4 py-6 text-center text-sm text-[#16365f]/40">Sin eventos esta semana</p>}
          {events?.map(ev => (
            <div key={ev.id} className={`flex items-start gap-3 px-4 py-2.5 ${isToday(ev.start, ev.allDay) ? 'bg-[#2d6cdf]/8' : ''}`}>
              <div className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${isToday(ev.start, ev.allDay) ? 'bg-[#2d6cdf]' : 'bg-[#16365f]/25'}`} />
              <div className="min-w-0">
                <p className="clamp-1 text-sm font-medium text-[#0f2340]">{ev.title}</p>
                <p className="text-[11px] text-[#16365f]/45">{fmt(ev.start, ev.allDay)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <iframe
          title="Google Calendar"
          src={`${EMBED_BASE}?${srcParams}&mode=WEEK`}
          className="w-full border-0"
          style={{ height: 320 }}
        />
      )}
    </div>
  )
}
