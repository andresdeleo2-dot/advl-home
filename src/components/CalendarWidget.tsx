'use client'

import { useEffect, useMemo, useState } from 'react'

type CalEvent = {
  id: string; title: string; start: string; end?: string; allDay: boolean
  location?: string; htmlLink?: string; hangoutLink?: string
}

const DAY_NAMES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

function getWeekDays() {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysFromMonday)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d
  })
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function evDayKey(ev: CalEvent) { return ev.allDay ? ev.start.slice(0, 10) : ev.start.slice(0, 10) }
function hhmm(s: string) { return new Date(s).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }
function fmtRange(ev: CalEvent) {
  if (ev.allDay) return 'Todo el día'
  return ev.end ? `${hhmm(ev.start)}–${hhmm(ev.end)}` : hhmm(ev.start)
}
// Etiqueta relativa de un día (Hoy / Mañana / "lunes 11 ago")
function relDay(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const diff = Math.round((dt.getTime() - t.getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  const s = dt.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function todayMidnight() { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

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

  // Agenda: próximos (>= hoy), agrupados por día y ordenados por hora dentro del día.
  const grouped = useMemo(() => {
    if (!events) return []
    const up = events.filter(ev => {
      const d = new Date(ev.allDay ? ev.start.slice(0, 10) + 'T23:59:00' : ev.start)
      return d.getTime() >= todayMs
    })
    const map = new Map<string, CalEvent[]>()
    up.forEach(ev => { const k = evDayKey(ev); if (!map.has(k)) map.set(k, []); map.get(k)!.push(ev) })
    for (const arr of map.values()) arr.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1))
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [events, todayMs])

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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17 17 7M7 7h10v10" /></svg>
          </a>
        </div>
      </div>

      {view === 'agenda' ? (
        <div className="flex flex-col overflow-y-auto" style={{ maxHeight: 320 }}>
          {!events && <p className="px-4 py-6 text-center text-sm text-[rgba(20,35,61,0.4)]">Cargando…</p>}
          {events && grouped.length === 0 && <p className="px-4 py-6 text-center text-sm text-[rgba(20,35,61,0.4)]">Sin eventos próximos</p>}
          {grouped.map(([key, evs]) => {
            const isTodayGroup = key === dayKey(new Date())
            return (
              <div key={key}>
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#FBFAF6]/95 px-4 py-1.5 backdrop-blur-sm">
                  <span className={`text-[10px] font-bold uppercase tracking-[.08em] ${isTodayGroup ? 'text-[#A87A2C]' : 'text-[rgba(20,35,61,0.5)]'}`}>{relDay(key)}</span>
                  <span className="text-[10px] font-semibold text-[rgba(20,35,61,0.32)]">{evs.length}</span>
                </div>
                <div className="divide-y divide-[rgba(15,35,64,0.06)]">
                  {evs.map(ev => (
                    <div key={ev.id}
                      onClick={() => { if (ev.htmlLink) window.open(ev.htmlLink, '_blank', 'noopener') }}
                      title={ev.htmlLink ? 'Abrir en Google Calendar' : ev.title}
                      className={`flex items-start gap-3 px-4 py-2.5 ${ev.htmlLink ? 'cursor-pointer hover:bg-[rgba(15,35,64,0.03)]' : ''} ${isTodayGroup ? 'bg-[rgba(194,147,58,0.05)]' : ''}`}>
                      <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${isTodayGroup ? 'bg-[#C2933A]' : 'bg-[rgba(15,35,64,0.22)]'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="clamp-1 text-[12.5px] font-semibold text-[#14233D]">{ev.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[rgba(20,35,61,0.46)]">
                          <span className="tabular-nums">{fmtRange(ev)}</span>
                          {ev.location && <span className="clamp-1 max-w-[150px]">📍 {ev.location}</span>}
                        </div>
                      </div>
                      {ev.hangoutLink && (
                        <a href={ev.hangoutLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          className="flex-shrink-0 rounded-full bg-[#16365F] px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-[#10233F]">
                          Meet
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
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
                const dayEvents = events.filter(ev => evDayKey(ev) === key).sort((a, b) => a.start.localeCompare(b.start))
                return (
                  <div key={i} className="flex flex-col items-stretch min-w-0">
                    <div className={`flex flex-col items-center rounded-[10px] py-1.5 mb-1 ${isCurrentDay ? '' : isPast ? 'bg-[rgba(15,35,64,0.04)]' : 'bg-[#FBFAF6]'}`}
                      style={isCurrentDay ? { background: 'linear-gradient(135deg,#E7C56B,#C2933A)' } : undefined}>
                      <span className={`text-[8px] font-bold uppercase tracking-[.06em] ${isCurrentDay ? 'text-[rgba(27,19,5,0.6)]' : 'text-[rgba(20,35,61,0.4)]'}`}>{DAY_NAMES[i]}</span>
                      <span className={`text-sm font-bold leading-tight ${isCurrentDay ? 'text-[#1B1305]' : isPast ? 'text-[rgba(20,35,61,0.35)]' : 'text-[#14233D]'}`}>{day.getDate()}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {dayEvents.map(ev => (
                        <div key={ev.id} title={`${ev.title}${ev.allDay ? '' : ' · ' + fmtRange(ev)}${ev.location ? ' · ' + ev.location : ''}`}
                          onClick={() => { if (ev.htmlLink) window.open(ev.htmlLink, '_blank', 'noopener') }}
                          className={`rounded px-1 py-0.5 ${ev.htmlLink ? 'cursor-pointer' : ''} ${isPast ? 'bg-[rgba(15,35,64,0.05)] text-[rgba(15,35,64,0.35)]' : 'bg-[rgba(194,147,58,0.12)] text-[#A87A2C]'}`}>
                          {!ev.allDay && (
                            <p className="text-[8px] font-semibold leading-tight opacity-70 tabular-nums">{hhmm(ev.start)}</p>
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
