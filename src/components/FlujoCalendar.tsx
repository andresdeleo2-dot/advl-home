'use client'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function dateOnly(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function addDays(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }
function diffDays(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function mondayIdx(d: Date) { return (d.getDay() + 6) % 7 }

// Periodo de gasto: del 23 de un mes al 22 del siguiente
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
  const today = dateOnly(new Date())
  const now = new Date()
  const { start, end } = getPeriod(today)
  const periodEndExcl = addDays(end, 1)
  const totalDays = diffDays(start, periodEndExcl)
  const elapsed = Math.max(0, Math.min(totalDays, diffDays(start, addDays(today, 1))))
  const progress = Math.max(0, Math.min(100, Math.round((elapsed / totalDays) * 100)))
  const daysToCutoff = Math.max(0, Math.ceil((periodEndExcl.getTime() - now.getTime()) / 86400000))
  const weekends = countWeekends(addDays(today, 1), end)

  // Construir días del grid
  const cells: { date: Date }[] = []
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) cells.push({ date: new Date(d) })
  const offset = mondayIdx(start)

  const fmtLong = (d: Date) => `${d.getDate()}-${MONTHS[d.getMonth()]}`

  return (
    <div className="rounded-2xl glass p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#16365f]/45">Periodo de gasto</p>
          <h4 className="mt-0.5 text-2xl font-semibold text-[#0f2340]">{fmtLong(start)} → {fmtLong(end)}</h4>
        </div>
        <div className="flex gap-2">
          <div className="min-w-[84px] rounded-xl bg-[#f3f8ff] px-3 py-2 text-center ring-1 ring-[#16365f]/8">
            <p className="text-[10px] text-[#16365f]/60">Días al corte</p>
            <p className="text-2xl font-extrabold leading-none text-[#0f2340]">{daysToCutoff}</p>
          </div>
          <div className="min-w-[84px] rounded-xl bg-[#edf9fd] px-3 py-2 text-center ring-1 ring-[#b7e8ef]">
            <p className="text-[10px] text-[#16365f]/60">Fines de semana</p>
            <p className="text-2xl font-extrabold leading-none text-[#16798d]">{weekends}</p>
          </div>
        </div>
      </div>

      {/* Progreso */}
      <div className="mt-4">
        <p className="mb-1 text-xs text-[#16365f]/55">Progreso del periodo</p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[#dbe8f5]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#2d6cdf] to-[#22a6b6]" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-[#16365f]/55">{elapsed}/{totalDays} días transcurridos · {daysToCutoff} restantes</p>
      </div>

      {/* Calendario */}
      <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[#16365f]/45">Calendario 23 → 22</p>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-[#16365f]/40">
        {['L', 'M', 'Mi', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: offset }).map((_, i) => <div key={`gap-${i}`} />)}
        {cells.map(({ date }) => {
          const isToday = date.getTime() === today.getTime()
          const isPast = date < today
          const isWeekend = [5, 6, 0].includes(date.getDay())
          const isCutoff = date.getTime() === end.getTime()
          let cls = 'rounded-lg border py-1.5 text-center text-xs '
          if (isCutoff) cls += 'bg-[#fff6ea] border-[#ffd29a] text-[#b06719] '
          else if (isWeekend) cls += 'bg-[#edf9fd] border-[#b7e8ef] text-[#16798d] '
          else cls += 'bg-white border-[#dbe7ef] text-[#0f2340] '
          if (isPast && !isToday) cls += 'opacity-45 '
          if (isToday) cls += 'ring-2 ring-[#2d6cdf] ring-offset-1 '
          const showMonth = date.getDate() === 23 || date.getDate() === 1 || isCutoff
          return (
            <div key={date.getTime()} className={cls}>
              <div className="font-bold">{date.getDate()}</div>
              {showMonth && <div className="text-[8px] opacity-70">{MONTHS[date.getMonth()].slice(0, 3)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
