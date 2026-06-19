'use client'

import { useState } from 'react'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function dateOnly(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function addDays(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }
function diffDays(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function mondayIdx(d: Date) { return (d.getDay() + 6) % 7 }

function getPeriod(today: Date) {
  let start: Date, end: Date
  if (today.getDate() >= 23) {
    start = new Date(today.getFullYear(), today.getMonth(), 23)
    end = new Date(today.getFullYear(), today.getMonth() + 1, 22)
  } else {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 23)
    end = new Date(today.getFullYear(), today.getMonth(), 22)
  }
  return { start, end }
}

function countWeekends(from: Date, to: Date) {
  if (from > to) return 0
  let ref = dateOnly(from)
  if (ref.getDay() === 6) ref = addDays(ref, -1)
  else if (ref.getDay() === 0) ref = addDays(ref, -2)
  const delta = (5 - ref.getDay() + 7) % 7
  const firstFri = addDays(ref, delta)
  if (firstFri > to) return 0
  return Math.floor((to.getTime() - firstFri.getTime()) / (7 * 86400000)) + 1
}

export default function FlujoCalendar() {
  const [open, setOpen] = useState(false)

  const today = dateOnly(new Date())
  const now = new Date()
  const { start, end } = getPeriod(today)
  const periodEndExcl = addDays(end, 1)
  const totalDays = diffDays(start, periodEndExcl)
  const elapsed = Math.max(0, Math.min(totalDays, diffDays(start, addDays(today, 1))))
  const progress = Math.max(0, Math.min(100, Math.round((elapsed / totalDays) * 100)))
  const daysToCutoff = Math.max(0, Math.ceil((periodEndExcl.getTime() - now.getTime()) / 86400000))
  const weekends = countWeekends(addDays(today, 1), end)

  // Full current month calendar
  const calYear = today.getMonth() >= 0 ? today.getFullYear() : today.getFullYear() - 1
  const calMonth = today.getMonth()
  const firstOfMonth = new Date(calYear, calMonth, 1)
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const monthOffset = mondayIdx(firstOfMonth)

  const fmtShort = (d: Date) => `${MONTHS[d.getMonth()].slice(0, 3)}`
  const monthLabel = `${MONTHS[calMonth]} ${calYear}`

  return (
    <div className="rounded-2xl glass p-4">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
            className="flex-shrink-0 transition-transform duration-200"
            style={{ color: '#B58B35', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            <path d="m9 18 6-6-6-6"/>
          </svg>
          <span className="eyebrow">Periodo de gasto · {fmtShort(start)}→{fmtShort(end)}</span>
        </div>
        <span className="text-[11px] font-semibold text-[rgba(20,35,61,0.5)]">
          {daysToCutoff}d · {weekends} fin{weekends !== 1 ? 'es' : ''}
        </span>
      </button>

      {/* Always-visible: progress bar */}
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1EFE7]">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#E7C56B,#C2933A)' }} />
        </div>
        <p className="mt-1.5 text-[11px] text-[rgba(20,35,61,0.5)]">
          Día {elapsed} de {totalDays} · {daysToCutoff} restantes
        </p>
      </div>

      {/* Expandable: full month calendar */}
      {open && (
        <div className="mt-4 border-t border-[rgba(15,35,64,0.08)] pt-4 animate-fade">
          <div className="mb-3 flex items-center justify-between">
            <span className="serif font-semibold capitalize text-[#16365F]" style={{ fontSize: 19 }}>{monthLabel}</span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[rgba(20,35,61,0.5)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#C2933A]" />
              período
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['L', 'M', 'Mi', 'J', 'V', 'S', 'D'].map((d, i) => (
              <div key={i} className="eyebrow pb-1">{d}</div>
            ))}
            {Array.from({ length: monthOffset }).map((_, i) => <div key={`g-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1
              const date = new Date(calYear, calMonth, d)
              const isCurrentDay = date.getTime() === today.getTime()
              const isPast = date < today
              const isCutoff = date.getDate() === end.getDate() && date.getMonth() === end.getMonth()
              const isInPeriod = date >= start && date <= end

              let cls = 'aspect-square flex flex-col items-center justify-center rounded-lg border text-xs '
              if (isCurrentDay) {
                return (
                  <div key={d} className={cls + 'border-transparent font-bold text-[#1B1305]'}
                    style={{ background: 'linear-gradient(135deg,#E7C56B,#C2933A)' }}>
                    {d}
                  </div>
                )
              }
              if (isCutoff) cls += 'bg-[#FFF6EA] border-[#FFD29A] text-[#B06719] font-semibold '
              else if (isInPeriod) cls += 'bg-white border-[rgba(15,35,64,0.09)] text-[#14233D] '
              else cls += 'bg-transparent border-transparent text-[rgba(20,35,61,0.28)] '
              if (isPast && !isCurrentDay && !isCutoff) cls += 'opacity-45 '

              return <div key={d} className={cls}><span className="font-semibold">{d}</span></div>
            })}
          </div>
        </div>
      )}
    </div>
  )
}
