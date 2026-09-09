'use client'

// Resumen de "hoy" (tareas del día, rutinas, tiempo trabajado) — antes vivía SOLO dentro de
// PanelClient.tsx, así que la home ('/') no sabía nada de Épicas/Tiempo pese a que la lógica ya
// existía y funcionaba en /panel. Un solo hook para que ambas pantallas muestren EXACTAMENTE lo
// mismo (mismo criterio de "tarea de hoy", misma fuente de tiempo trabajado).
import { useEffect, useMemo, useState } from 'react'
import type { Epica, EpicaTask } from '@/lib/supabase'
import { todayISO, mondayISO } from '@/components/epicas/core'

export type TodayTask = { e: Epica; t: EpicaTask }
export type TodayRoutine = { e: Epica; name: string; done: boolean }
export type DueSoonTask = { e: Epica; t: EpicaTask; days: number }

const dayIdxMon = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return (new Date(y, m - 1, d).getDay() + 6) % 7 }
export const hmm = (min: number) => min >= 60 ? `${Math.round(min / 60 * 10) / 10}h` : `${min}m`

export function useTodayResumen() {
  const [epics, setEpics] = useState<Epica[] | null>(null)
  const [workedMin, setWorkedMin] = useState(0)
  const [runningName, setRunningName] = useState<string | null>(null)
  const today = todayISO()

  useEffect(() => {
    let alive = true
    fetch('/api/epicas').then(r => r.json()).then(j => { if (alive && j?.ok) setEpics(j.data as Epica[]) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Tiempo trabajado hoy: mismo localStorage que /tiempo y Épicas (margen.v1) — se refresca al
  // volver a la pestaña y cada 20s por si hay una sesión corriendo en otra pestaña/dispositivo.
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem('margen.v1'); if (!raw) return
        const data = JSON.parse(raw)
        setWorkedMin((data.history || []).filter((h: { date: string; area: string }) => h.date === today && h.area === 'trabajo').reduce((s: number, h: { dur: number }) => s + h.dur, 0))
        const s = data.session
        setRunningName(s && s.area === 'trabajo' ? (s.name || 'Trabajo') : null)
      } catch { /* noop */ }
    }
    read(); window.addEventListener('focus', read); window.addEventListener('storage', read)
    const id = setInterval(read, 20000)
    return () => { window.removeEventListener('focus', read); window.removeEventListener('storage', read); clearInterval(id) }
  }, [today])

  const list = epics || []

  const todayTasks = useMemo<TodayTask[]>(() => {
    const out: TodayTask[] = []
    for (const e of list) for (const t of (e.tasks || [])) {
      if (t.status === 'Terminada' || t.status === 'Archivada') continue
      if (t.plan === today || (Array.isArray(t.dayPlans) && t.dayPlans.some(d => d.day === today))) out.push({ e, t })
    }
    // Orden por IMPORTANCIA: prioridad (alta→media→baja), luego vencimiento, luego orden manual.
    const prioRank = (p?: string) => (p === 'alta' ? 0 : p === 'baja' ? 2 : 1)
    return out.sort((a, b) => prioRank(a.t.priority) - prioRank(b.t.priority) || (a.t.due || '9999').localeCompare(b.t.due || '9999') || (a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9))
  }, [list, today])

  const routines = useMemo<TodayRoutine[]>(() => {
    const mon = mondayISO(today), di = dayIdxMon(today)
    const out: TodayRoutine[] = []
    for (const e of list) for (const r of (e.routines || [])) if ((r.t || '').trim()) out.push({ e, name: r.t, done: !!(r.weeks?.[mon]?.[di]) })
    return out
  }, [list, today])

  const dueSoon = useMemo<DueSoonTask[]>(() => {
    const out: DueSoonTask[] = []
    for (const e of list) for (const t of (e.tasks || [])) {
      if (t.status === 'Terminada' || t.status === 'Archivada' || !t.due) continue
      const d = Math.round((new Date(t.due + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
      if (d >= 0 && d <= 14) out.push({ e, t, days: d })
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 6)
  }, [list, today])

  const routinesDone = routines.filter(r => r.done).length

  return { epics, loading: epics === null, today, todayTasks, routines, routinesDone, dueSoon, workedMin, runningName }
}
