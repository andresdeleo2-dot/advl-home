'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import SectionNav from '@/components/SectionNav'
import FavoritosStrip from '@/components/FavoritosStrip'
import CalendarWidget from '@/components/CalendarWidget'
import CumplesWidget from '@/components/CumplesWidget'
import type { Epica, EpicaTask } from '@/lib/supabase'
import { todayISO, mondayISO } from '@/components/epicas/core'

const SERIF = 'var(--epica-serif, Georgia, serif)'
const dayIdxMon = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return (new Date(y, m - 1, d).getDay() + 6) % 7 }
const hmm = (min: number) => min >= 60 ? `${Math.round(min / 60 * 10) / 10}h` : `${min}m`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const longDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); const dn = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; const mn = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; return `${dn[dt.getDay()]}, ${d} de ${mn[m - 1]}` }
const PRIO = ['#B0522E', '#A87A2C', '#2E5A9E'] // alta / media / baja acentos

type Tt = { e: Epica; t: EpicaTask }

export default function PanelClient() {
  const [epics, setEpics] = useState<Epica[] | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const [workedMin, setWorkedMin] = useState(0)
  const [runningName, setRunningName] = useState<string | null>(null)

  const today = todayISO()

  // Reloj vivo
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id) }, [])

  // Épicas (tareas + rutinas) desde la API
  useEffect(() => {
    let alive = true
    fetch('/api/epicas').then(r => r.json()).then(j => { if (alive && j?.ok) setEpics(j.data as Epica[]) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Tiempo trabajado hoy + sesión en curso (desde margen.v1, se refresca al volver a la pestaña)
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem('margen.v1'); if (!raw) return
        const data = JSON.parse(raw)
        const wm = (data.history || []).filter((h: { date: string; area: string; dur: number }) => h.date === today && h.area === 'trabajo').reduce((s: number, h: { dur: number }) => s + h.dur, 0)
        setWorkedMin(wm)
        const s = data.session
        setRunningName(s && s.area === 'trabajo' ? (s.name || 'Trabajo') : null)
      } catch { /* noop */ }
    }
    read()
    window.addEventListener('focus', read); window.addEventListener('storage', read)
    const id = setInterval(read, 20000)
    return () => { window.removeEventListener('focus', read); window.removeEventListener('storage', read); clearInterval(id) }
  }, [today])

  const list = epics || []

  // Tareas de HOY: planeadas hoy (plan) o con sesión por día hoy; sin terminar.
  const todayTasks = useMemo<Tt[]>(() => {
    const out: Tt[] = []
    for (const e of list) for (const t of (e.tasks || [])) {
      if (t.status === 'Terminada' || t.status === 'Archivada') continue
      const onDay = t.plan === today || (Array.isArray(t.dayPlans) && t.dayPlans.some(d => d.day === today))
      if (onDay) out.push({ e, t })
    }
    return out.sort((a, b) => (a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9))
  }, [list, today])

  // Rutinas de hoy (de todas las épicas) con su estado del día
  const routines = useMemo(() => {
    const mon = mondayISO(today), di = dayIdxMon(today)
    const out: { e: Epica; name: string; done: boolean }[] = []
    for (const e of list) for (const r of (e.routines || [])) if ((r.t || '').trim()) out.push({ e, name: r.t, done: !!(r.weeks?.[mon]?.[di]) })
    return out
  }, [list, today])

  // Próximos vencimientos (due) de tareas abiertas — "por vencer"
  const dueSoon = useMemo(() => {
    const out: { e: Epica; t: EpicaTask; days: number }[] = []
    for (const e of list) for (const t of (e.tasks || [])) {
      if (t.status === 'Terminada' || t.status === 'Archivada' || !t.due) continue
      const d = Math.round((new Date(t.due + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
      if (d >= 0 && d <= 14) out.push({ e, t, days: d })
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 6)
  }, [list, today])

  const routinesDone = routines.filter(r => r.done).length
  const greet = now ? (now.getHours() < 12 ? 'Buenos días' : now.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches') : ''

  const card: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.09)', borderRadius: 18, boxShadow: '0 24px 50px -38px rgba(15,35,64,0.5)', overflow: 'hidden' }
  const secLbl: CSSProperties = { font: '700 10px/1 var(--font-ui, system-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }

  return (
    <div style={{ minHeight: '100vh', background: '#f3efe6', color: '#10233F' }}>
      <SiteHeader title="Panel" subtitle="Tu centro · ADVL" backHref="/" backLabel="← Accesos" extra={<SectionNav current="panel" />} />

      <div style={{ maxWidth: 1180, margin: '14px auto 0', padding: '0 20px' }}><FavoritosStrip /></div>

      <main style={{ maxWidth: 1180, margin: '18px auto 60px', padding: '0 20px' }}>
        {/* Encabezado grande: saludo + fecha + reloj */}
        <div style={{ ...card, background: 'linear-gradient(135deg,#10233F 0%,#1c3a63 55%,#2E5A9E 120%)', color: '#fff', padding: '22px 26px', marginBottom: 18, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Panel de hoy</div>
            <div style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1.05 }}>{greet}, Andrés.</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.72)', textTransform: 'capitalize', marginTop: 4 }}>{cap(longDay(today))}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{now ? now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{runningName ? `▶ ${runningName} en curso` : `⏱ ${hmm(workedMin)} trabajadas hoy`}</div>
          </div>
        </div>

        {/* Tiras de resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
          {[
            { n: todayTasks.length, l: 'tareas de hoy', c: '#2E5A9E' },
            { n: `${routinesDone}/${routines.length}`, l: 'rutinas hechas', c: '#2E6E6E' },
            { n: hmm(workedMin), l: 'trabajado hoy', c: '#A87A2C' },
            { n: dueSoon.length, l: 'por vencer (14 d)', c: '#B0522E' },
          ].map((s, i) => (
            <div key={i} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ fontFamily: SERIF, fontSize: 28, lineHeight: .9, color: s.c }}>{s.n}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(20,35,61,0.55)', marginTop: 5 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Cuerpo: 2 columnas */}
        <div className="panel-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
          {/* IZQUIERDA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Actividades de hoy */}
            <section style={card}>
              <div style={{ height: 3, background: 'linear-gradient(90deg,#10233F,#C2933A)' }} />
              <div style={{ padding: '16px 20px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 19 }}>Actividades de hoy</span>
                  <Link href="/epicas" style={{ fontSize: 11.5, fontWeight: 700, color: '#2E5A9E', textDecoration: 'none' }}>abrir Épicas →</Link>
                </div>
                {epics === null ? <div style={{ height: 120, opacity: 0 }} /> : todayTasks.length === 0 ? (
                  <div style={{ padding: '18px 0', textAlign: 'center', color: 'rgba(20,35,61,0.5)', fontSize: 13.5 }}>Nada planeado para hoy. <Link href="/epicas" style={{ color: '#A87A2C', fontWeight: 700 }}>Elige tu enfoque →</Link></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {todayTasks.slice(0, 9).map(({ e, t }, k) => {
                      const done = t.status === 'Terminada'
                      const acc = PRIO[t.priority === 'alta' ? 0 : t.priority === 'baja' ? 2 : 1]
                      return (
                        <Link key={t.id || k} href="/epicas" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderBottom: k < Math.min(9, todayTasks.length) - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                          <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color || acc, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: done ? 'rgba(20,35,61,0.4)' : '#16365F', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                          <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.4)', flexShrink: 0 }}>{e.name}</span>
                        </Link>
                      )
                    })}
                    {todayTasks.length > 9 && <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)', paddingTop: 8 }}>+{todayTasks.length - 9} más en Épicas</div>}
                  </div>
                )}
              </div>
            </section>

            {/* Rutinas de hoy */}
            {routines.length > 0 && (
              <section style={{ ...card, padding: '16px 20px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={secLbl}>Rutinas de hoy</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#2E6E6E' }}>{routinesDone}/{routines.length}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {routines.map((r, k) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, background: r.done ? 'rgba(46,110,110,0.12)' : 'rgba(15,35,64,0.05)', border: `1px solid ${r.done ? 'rgba(46,110,110,0.3)' : 'rgba(15,35,64,0.1)'}`, color: r.done ? '#2E6E6E' : 'rgba(20,35,61,0.6)' }}>
                      {r.done ? '✓' : '○'} {r.name}
                    </span>
                  ))}
                </div>
                <Link href="/epicas" style={{ display: 'inline-block', marginTop: 12, fontSize: 11.5, fontWeight: 700, color: '#2E5A9E', textDecoration: 'none' }}>marcar en Épicas →</Link>
              </section>
            )}

            {/* Por vencer */}
            {dueSoon.length > 0 && (
              <section style={{ ...card, padding: '16px 20px 18px' }}>
                <div style={{ ...secLbl, marginBottom: 10 }}>⏳ Por vencer</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {dueSoon.map(({ e, t, days }, k) => (
                    <Link key={t.id || k} href="/epicas" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', borderBottom: k < dueSoon.length - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: days === 0 ? '#B0522E' : days <= 3 ? '#A87A2C' : 'rgba(20,35,61,0.5)', flexShrink: 0 }}>{days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} d`}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Accesos rápidos a las secciones */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12 }}>
              {[
                { href: '/tiempo', t: 'Tiempo', d: 'Planifica y cierra tu día', c: '#8a4b28' },
                { href: '/epicas', t: 'Épicas', d: 'Tus frentes y tareas', c: '#2E5A9E' },
              ].map(q => (
                <Link key={q.href} href={q.href} style={{ ...card, padding: '16px 18px', textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div style={{ fontFamily: SERIF, fontSize: 18, color: q.c }}>{q.t} →</div>
                  <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)', marginTop: 4 }}>{q.d}</div>
                </Link>
              ))}
            </div>
          </div>

          {/* DERECHA: calendario + fechas a recordar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <section style={{ ...card, padding: 4 }}><CalendarWidget /></section>
            <section style={{ ...card, padding: 4 }}><CumplesWidget /></section>
          </div>
        </div>
      </main>

      <style>{`@media (max-width: 860px){ .panel-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
