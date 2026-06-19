'use client'

import { useEffect, useState } from 'react'

type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean }

const DAY_NAMES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

function getWeekDays() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysFromMonday)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function evDayKey(ev: CalEvent) {
  return ev.allDay ? ev.start : ev.start.slice(0, 10)
}

function fmtTime(start: string) {
  return new Date(start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

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

function todayMidnight() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

export default function CalendarWidget() {
  const [view, setView] = useState<'agenda' | 'semana'>('agenda')
  const [events, setEvents] = useState<CalEvent[] | null>(null)

  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(d => setEvents(Array.isArray(d) ? d : []))
      .catch(() => setEvents([]))
  }, [])

  const weekDays = getWeekDays()
  const todayMs = todayMidnight().getTime()

  const upcomingEvents = events?.filter(ev => {
    const d = new Date(ev.allDay ? ev.start + 'T23:59:00' : ev.start)
    return d.getTime() >= todayMs
  })

  return (
    <div className="flex flex-col rounded-2xl glass overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <p className="eyebrow">Calendario</p>
        <div className="flex items-center gap-1">
          <div className="flex gap-0.5 rounded-[9px] bg-[#F1EFE7] p-0.5">
            {(['agenda', 'semana'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-[7px] px-2.5 py-1 text-[10px] font-semibold capitalize transition ${view === v ? 'bg-white text-[#16365F] shadow-sm' : 'text-[rgba(20,35,61,0.5)]'}`}>
                {v}
              </button>
            ))}
          </div>
          <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener noreferrer"
            title="Abrir Google Calendar"
            className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-lg text-[rgba(15,35,64,0.45)] hover:bg-[rgba(15,35,64,0.06)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17 17 7M7 7h10v10"/></svg>
          </a>
        </div>
      </div>

      {view === 'agenda' ? (
        <div className="flex flex-col divide-y divide-[rgba(15,35,64,0.07)] overflow-y-auto" style={{ maxHeight: 280 }}>
          {!events && <p className="px-4 py-6 text-center text-sm text-[rgba(20,35,61,0.4)]">Cargando…</p>}
          {events && upcomingEvents?.length === 0 && <p className="px-4 py-6 text-center text-sm text-[rgba(20,35,61,0.4)]">Sin eventos próximos</p>}
          {upcomingEvents?.map(ev => (
            <div key={ev.id} className={`flex items-start gap-3 px-4 py-2.5 ${isToday(ev.start, ev.allDay) ? 'bg-[rgba(194,147,58,0.06)]' : ''}`}>
              <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${isToday(ev.start, ev.allDay) ? 'bg-[#C2933A]' : 'bg-[rgba(15,35,64,0.22)]'}`} />
              <div className="min-w-0">
                <p className="clamp-1 text-[12.5px] font-semibold text-[#14233D]">{ev.title}</p>
                <p className="mt-0.5 text-[11px] text-[rgba(20,35,61,0.46)]">{fmt(ev.start, ev.allDay)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-2 pb-3 pt-1">
          {!events && <p className="py-6 text-center text-sm text-[rgba(20,35,61,0.4)]">Cargando…</p>}
          {events && (
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => {
                const key = dayKey(day)
                const isCurrentDay = day.getTime() === todayMs
                const isPast = day.getTime() < todayMs
                const dayEvents = events.filter(ev => evDayKey(ev) === key)
                return (
                  <div key={i} className="flex flex-col items-stretch min-w-0">
                    <div className={`flex flex-col items-center rounded-[10px] py-1.5 mb-1 ${isCurrentDay ? '' : isPast ? 'bg-[rgba(15,35,64,0.04)]' : 'bg-[#FBFAF6]'}`}
                      style={isCurrentDay ? { background: 'linear-gradient(135deg,#E7C56B,#C2933A)' } : undefined}>
                      <span className={`text-[8px] font-bold uppercase tracking-[.06em] ${isCurrentDay ? 'text-[rgba(27,19,5,0.6)]' : 'text-[rgba(20,35,61,0.4)]'}`}>{DAY_NAMES[i]}</span>
                      <span className={`text-sm font-bold leading-tight ${isCurrentDay ? 'text-[#1B1305]' : isPast ? 'text-[rgba(20,35,61,0.35)]' : 'text-[#14233D]'}`}>{day.getDate()}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {dayEvents.map(ev => (
                        <div key={ev.id} title={ev.title}
                          className={`rounded px-1 py-0.5 ${isPast ? 'bg-[rgba(15,35,64,0.05)] text-[rgba(15,35,64,0.35)]' : 'bg-[rgba(194,147,58,0.12)] text-[#A87A2C]'}`}>
                          {!ev.allDay && (
                            <p className="text-[8px] font-semibold leading-tight opacity-70 tabular-nums">{fmtTime(ev.start)}</p>
                          )}
                          <p className="text-[9px] font-medium leading-tight overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{ev.title}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
