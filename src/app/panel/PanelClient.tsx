'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import SectionNav from '@/components/SectionNav'
import FavoritosStrip from '@/components/FavoritosStrip'
import CalendarWidget from '@/components/CalendarWidget'
import QuoteWidget from '@/components/QuoteWidget'
import WeatherWidget from '@/components/WeatherWidget'
import BirthdayCelebration from '@/components/BirthdayCelebration'
import type { Epica, EpicaTask } from '@/lib/supabase'
import { todayISO, mondayISO } from '@/components/epicas/core'

const SERIF = 'var(--epica-serif, Georgia, serif)'
const dayIdxMon = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return (new Date(y, m - 1, d).getDay() + 6) % 7 }
const hmm = (min: number) => min >= 60 ? `${Math.round(min / 60 * 10) / 10}h` : `${min}m`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const longDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); const dn = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; const mn = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; return `${dn[dt.getDay()]}, ${d} de ${mn[m - 1]}` }
const rel = (d: number) => (d === 0 ? '¡hoy! 🎉' : d === 1 ? 'mañana' : `en ${d}d`)

type Tt = { e: Epica; t: EpicaTask }
type SlotState = 'normal' | 'collapsed' | 'wide'

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.09)', borderRadius: 18, boxShadow: '0 24px 50px -38px rgba(15,35,64,0.5)', overflow: 'hidden' }
const ctrlBtn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 8, width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(20,35,61,0.55)', fontSize: 13, lineHeight: 1, flexShrink: 0 }

// Contenedor de widget colapsable/expandible (mecánica de la vista Hoy de /tiempo).
function Slot({ id, title, icon, children, layout, setSlot, bare }: { id: string; title: string; icon?: string; children: ReactNode; layout: Record<string, SlotState>; setSlot: (id: string, s: SlotState) => void; bare?: boolean }) {
  const st = layout[id] || 'normal'
  const wide = st === 'wide', collapsed = st === 'collapsed'
  const ctrl = (
    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
      <button onClick={() => setSlot(id, wide ? 'normal' : 'wide')} title={wide ? 'Tamaño normal' : 'Expandir a lo ancho'} style={ctrlBtn}>{wide ? '⤡' : '⤢'}</button>
      <button onClick={() => setSlot(id, collapsed ? 'normal' : 'collapsed')} title={collapsed ? 'Mostrar' : 'Minimizar'} style={{ ...ctrlBtn, fontSize: 16 }}>{collapsed ? '+' : '–'}</button>
    </div>
  )
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: bare ? '0 2px 8px' : '13px 16px', borderBottom: bare || collapsed ? 'none' : '1px solid rgba(15,35,64,0.06)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: '700 10.5px/1 var(--font-ui, system-ui)', letterSpacing: '.13em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', minWidth: 0 }}>{icon && <span style={{ fontSize: 13 }}>{icon}</span>}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span></span>
      {ctrl}
    </div>
  )
  // bare = widget que ya trae su propia tarjeta (Frase/Clima/Calendario): solo barra de control encima.
  if (bare) {
    return (
      <div style={{ gridColumn: wide ? '1 / -1' : 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {head}
        {!collapsed && children}
      </div>
    )
  }
  return (
    <section style={{ ...card, gridColumn: wide ? '1 / -1' : 'auto', alignSelf: 'start' }}>
      {head}
      {!collapsed && <div style={{ padding: '14px 16px 16px' }}>{children}</div>}
    </section>
  )
}

export default function PanelClient() {
  const [epics, setEpics] = useState<Epica[] | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const [workedMin, setWorkedMin] = useState(0)
  const [runningName, setRunningName] = useState<string | null>(null)
  const [personas, setPersonas] = useState<{ nombre: string; apodo: string | null; cumple: string; excepcional?: boolean }[]>([])
  const [momentos, setMomentos] = useState<{ id: number; titulo: string; fecha: string | null; outstanding: boolean; recordar?: boolean | null; personas: string[] | null }[]>([])
  const [layout, setLayout] = useState<Record<string, SlotState>>({})

  const today = todayISO()

  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id) }, [])
  useEffect(() => { try { const raw = localStorage.getItem('panel.layout.v1'); if (raw) setLayout(JSON.parse(raw)) } catch { /* noop */ } }, [])
  const setSlot = (id: string, s: SlotState) => setLayout(prev => { const next = { ...prev, [id]: s }; if (s === 'normal') delete next[id]; try { localStorage.setItem('panel.layout.v1', JSON.stringify(next)) } catch { /* noop */ } return next })

  useEffect(() => {
    let alive = true
    fetch('/api/epicas').then(r => r.json()).then(j => { if (alive && j?.ok) setEpics(j.data as Epica[]) }).catch(() => {})
    fetch('/api/cumples').then(r => r.json()).then(j => { if (alive && j?.ok) setPersonas(j.personas || []) }).catch(() => {})
    fetch('/api/momentos').then(r => r.json()).then(j => { if (alive && j?.ok) setMomentos(j.recuerdos || []) }).catch(() => {})
    return () => { alive = false }
  }, [])

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

  const todayTasks = useMemo<Tt[]>(() => {
    const out: Tt[] = []
    for (const e of list) for (const t of (e.tasks || [])) {
      if (t.status === 'Terminada' || t.status === 'Archivada') continue
      if (t.plan === today || (Array.isArray(t.dayPlans) && t.dayPlans.some(d => d.day === today))) out.push({ e, t })
    }
    return out.sort((a, b) => (a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9))
  }, [list, today])

  const routines = useMemo(() => {
    const mon = mondayISO(today), di = dayIdxMon(today)
    const out: { e: Epica; name: string; done: boolean }[] = []
    for (const e of list) for (const r of (e.routines || [])) if ((r.t || '').trim()) out.push({ e, name: r.t, done: !!(r.weeks?.[mon]?.[di]) })
    return out
  }, [list, today])

  const dueSoon = useMemo(() => {
    const out: { e: Epica; t: EpicaTask; days: number }[] = []
    for (const e of list) for (const t of (e.tasks || [])) {
      if (t.status === 'Terminada' || t.status === 'Archivada' || !t.due) continue
      const d = Math.round((new Date(t.due + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
      if (d >= 0 && d <= 14) out.push({ e, t, days: d })
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 6)
  }, [list, today])

  // Cumpleaños próximos (de /api/cumples)
  const cumples = useMemo(() => {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0)
    return personas.map(p => {
      const [y, m, d] = (p.cumple || '').split('-').map(Number)
      if (!m || !d) return null
      let next = new Date(hoy.getFullYear(), m - 1, d, 12)
      if (next.getTime() < hoy.getTime() - 43200000) next = new Date(hoy.getFullYear() + 1, m - 1, d, 12)
      const days = Math.round((next.getTime() - hoy.getTime()) / 86400000)
      return { nombre: p.apodo?.trim() || p.nombre, days, dia: d, mes: m - 1, anos: next.getFullYear() - y, exc: !!p.excepcional }
    }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.days - b.days).slice(0, 7)
  }, [personas])

  // Fechas a recordar (momentos ✦ con fecha, de /api/momentos)
  const fechas = useMemo(() => {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0)
    return momentos.map(mm => {
      if (!mm.fecha || !(mm.recordar === true || (mm.recordar !== false && mm.outstanding))) return null
      const [y, mo, d] = mm.fecha.split('-').map(Number)
      if (!y || !mo || !d) return null
      let next = new Date(hoy.getFullYear(), mo - 1, d, 12)
      if (next.getTime() < hoy.getTime() - 43200000) next = new Date(hoy.getFullYear() + 1, mo - 1, d, 12)
      const days = Math.round((next.getTime() - hoy.getTime()) / 86400000)
      return { titulo: mm.titulo, personas: mm.personas || [], days, dia: d, mes: mo - 1, anos: next.getFullYear() - y }
    }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.days - b.days).slice(0, 7)
  }, [momentos])

  const routinesDone = routines.filter(r => r.done).length
  const greet = now ? (now.getHours() < 12 ? 'Buenos días' : now.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches') : ''

  return (
    <div style={{ minHeight: '100vh', background: '#f3efe6', color: '#10233F' }}>
      {/* Fuegos artificiales + banner automáticos cuando hoy es un cumpleaños */}
      <BirthdayCelebration />

      <SiteHeader title="Panel" subtitle="Tu centro · ADVL" backHref="/" backLabel="← Accesos" extra={<SectionNav current="panel" />} />
      <div style={{ maxWidth: 1180, margin: '14px auto 0', padding: '0 20px' }}><FavoritosStrip /></div>

      <main style={{ maxWidth: 1180, margin: '18px auto 60px', padding: '0 20px' }}>
        {/* Encabezado grande */}
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

        {/* Rejilla de widgets colapsables/expandibles */}
        <div className="panel-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>

          <Slot id="hoy" title="Actividades de hoy" icon="📋" layout={layout} setSlot={setSlot}>
            {epics === null ? <div style={{ height: 100, opacity: 0 }} /> : todayTasks.length === 0 ? (
              <div style={{ padding: '10px 0', textAlign: 'center', color: 'rgba(20,35,61,0.5)', fontSize: 13 }}>Nada planeado. <Link href="/epicas" style={{ color: '#A87A2C', fontWeight: 700 }}>Elige tu enfoque →</Link></div>
            ) : (<>
              {todayTasks.slice(0, 8).map(({ e, t }, k, arr) => (
                <Link key={t.id || k} href="/epicas" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: k < arr.length - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                  <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.4)', flexShrink: 0 }}>{e.name}</span>
                </Link>
              ))}
              {todayTasks.length > 8 && <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)', paddingTop: 8 }}>+{todayTasks.length - 8} más</div>}
              <Link href="/epicas" style={{ display: 'inline-block', marginTop: 10, fontSize: 11.5, fontWeight: 700, color: '#2E5A9E', textDecoration: 'none' }}>abrir Épicas →</Link>
            </>)}
          </Slot>

          {routines.length > 0 && (
            <Slot id="rutinas" title="Rutinas de hoy" icon="🔁" layout={layout} setSlot={setSlot}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {routines.map((r, k) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, background: r.done ? 'rgba(46,110,110,0.12)' : 'rgba(15,35,64,0.05)', border: `1px solid ${r.done ? 'rgba(46,110,110,0.3)' : 'rgba(15,35,64,0.1)'}`, color: r.done ? '#2E6E6E' : 'rgba(20,35,61,0.6)' }}>{r.done ? '✓' : '○'} {r.name}</span>
                ))}
              </div>
              <Link href="/epicas" style={{ display: 'inline-block', marginTop: 12, fontSize: 11.5, fontWeight: 700, color: '#2E5A9E', textDecoration: 'none' }}>marcar en Épicas →</Link>
            </Slot>
          )}

          <Slot id="frase" title="Frase del día" icon="✍️" layout={layout} setSlot={setSlot} bare><QuoteWidget /></Slot>
          <Slot id="clima" title="Clima" icon="🌤️" layout={layout} setSlot={setSlot} bare><WeatherWidget /></Slot>

          {cumples.length > 0 && (
            <Slot id="cumples" title="Cumpleaños que vienen" icon="🎂" layout={layout} setSlot={setSlot}>
              {cumples.map((c, k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: k < cumples.length - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none' }}>
                  <span style={{ width: 42, fontSize: 11, fontWeight: 700, color: c.days === 0 ? '#B0522E' : '#A87A2C', flexShrink: 0 }}>{c.dia} {MES3[c.mes]}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.exc && <span style={{ color: '#C2933A' }}>✦ </span>}{c.nombre}<span style={{ color: 'rgba(20,35,61,0.4)', fontWeight: 400 }}> · cumple {c.anos}</span></span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.days <= 3 ? '#B0522E' : 'rgba(20,35,61,0.5)', flexShrink: 0 }}>{rel(c.days)}</span>
                </div>
              ))}
            </Slot>
          )}

          {fechas.length > 0 && (
            <Slot id="fechas" title="Fechas a recordar" icon="✦" layout={layout} setSlot={setSlot}>
              {fechas.map((f, k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: k < fechas.length - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none' }}>
                  <span style={{ width: 42, fontSize: 11, fontWeight: 700, color: f.days === 0 ? '#B0522E' : '#A87A2C', flexShrink: 0, paddingTop: 1 }}>{f.dia} {MES3[f.mes]}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.titulo}{f.anos > 0 ? <span style={{ color: 'rgba(20,35,61,0.4)' }}> · {f.anos} años</span> : ''}</div>
                    {f.personas.length > 0 && <div style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>con {f.personas.join(', ')}</div>}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: f.days <= 3 ? '#B0522E' : 'rgba(20,35,61,0.5)', flexShrink: 0, paddingTop: 1 }}>{rel(f.days)}</span>
                </div>
              ))}
            </Slot>
          )}

          {dueSoon.length > 0 && (
            <Slot id="vence" title="Por vencer" icon="⏳" layout={layout} setSlot={setSlot}>
              {dueSoon.map(({ e, t, days }, k) => (
                <Link key={t.id || k} href="/epicas" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: k < dueSoon.length - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: days === 0 ? '#B0522E' : days <= 3 ? '#A87A2C' : 'rgba(20,35,61,0.5)', flexShrink: 0 }}>{days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} d`}</span>
                </Link>
              ))}
            </Slot>
          )}

          <Slot id="calendario" title="Calendario" icon="🗓️" layout={layout} setSlot={setSlot} bare><CalendarWidget /></Slot>
        </div>
      </main>

      <style>{`@media (max-width: 720px){ .panel-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
