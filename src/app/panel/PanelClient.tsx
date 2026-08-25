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
type SlotState = 'normal' | 'collapsed'

const baseCard: CSSProperties = { borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 44px -34px rgba(15,35,64,0.5)' }
const col: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }

// Tarjeta con COLOR propio + minimizar/expandir (–/+). `bare` = el widget ya trae su tarjeta.
function Slot({ id, title, icon, accent = '#2E5A9E', dark, bare, children, layout, setSlot, right }: { id: string; title: string; icon?: string; accent?: string; dark?: boolean; bare?: boolean; children: ReactNode; layout: Record<string, SlotState>; setSlot: (id: string, s: SlotState) => void; right?: ReactNode }) {
  const collapsed = layout[id] === 'collapsed'
  const toggle = (
    <button onClick={() => setSlot(id, collapsed ? 'normal' : 'collapsed')} title={collapsed ? 'Mostrar' : 'Minimizar'} style={{ cursor: 'pointer', border: 'none', background: dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,35,64,0.06)', borderRadius: 8, width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: dark ? 'rgba(255,255,255,0.75)' : 'rgba(20,35,61,0.55)', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{collapsed ? '+' : '–'}</button>
  )
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: bare ? '0 2px 8px' : '12px 15px 10px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: '800 10.5px/1 var(--font-ui, system-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.7)' : accent, minWidth: 0 }}>{icon && <span style={{ fontSize: 13 }}>{icon}</span>}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span></span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{!collapsed && right}{toggle}</span>
    </div>
  )
  if (bare) return <div style={{ display: 'flex', flexDirection: 'column' }}>{header}{!collapsed && children}</div>
  return (
    <section style={{ ...baseCard, background: dark ? 'linear-gradient(158deg,#16305a 0%,#0f2242 62%,#0b1a35 120%)' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(15,35,64,0.09)' }}>
      <div style={{ height: 3, background: accent }} />
      {header}
      {!collapsed && <div style={{ padding: '2px 15px 15px' }}>{children}</div>}
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
  const persLink = 'https://mi-vida-neon.vercel.app/vida?vista=personas'
  const seeAll = (href: string) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(231,197,107,0.9)', textDecoration: 'none' }}>ver todos →</a>

  return (
    <div style={{ minHeight: '100vh', background: '#f3efe6', color: '#10233F' }}>
      <BirthdayCelebration />

      <SiteHeader title="Panel" subtitle="Tu centro · ADVL" backHref="/" backLabel="← Accesos" extra={<SectionNav current="panel" />} />
      <div style={{ maxWidth: 1180, margin: '14px auto 0', padding: '0 20px' }}><FavoritosStrip /></div>

      <main style={{ maxWidth: 1180, margin: '18px auto 60px', padding: '0 20px' }}>
        {/* Encabezado grande */}
        <div style={{ ...baseCard, background: 'linear-gradient(135deg,#10233F 0%,#1c3a63 55%,#2E5A9E 120%)', color: '#fff', padding: '22px 26px', marginBottom: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { n: todayTasks.length, l: 'tareas de hoy', c: '#2E5A9E' },
            { n: `${routinesDone}/${routines.length}`, l: 'rutinas hechas', c: '#2E6E6E' },
            { n: hmm(workedMin), l: 'trabajado hoy', c: '#A87A2C' },
            { n: dueSoon.length, l: 'por vencer (14 d)', c: '#B0522E' },
          ].map((s, i) => (
            <div key={i} style={{ ...baseCard, background: '#fff', border: '1px solid rgba(15,35,64,0.09)', padding: '13px 16px', borderTop: `3px solid ${s.c}` }}>
              <div style={{ fontFamily: SERIF, fontSize: 27, lineHeight: .9, color: s.c }}>{s.n}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(20,35,61,0.55)', marginTop: 5 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* COLUMNAS TEMÁTICAS (empacan sin huecos): trabajo · personas · entorno */}
        <div className="panel-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>

          {/* ── Columna 1 · TU TRABAJO HOY ── */}
          <div style={col}>
            <Slot id="hoy" title="Actividades de hoy" icon="📋" accent="#2E5A9E" layout={layout} setSlot={setSlot} right={<Link href="/epicas" style={{ fontSize: 10.5, fontWeight: 700, color: '#2E5A9E', textDecoration: 'none' }}>Épicas →</Link>}>
              {epics === null ? <div style={{ height: 90, opacity: 0 }} /> : todayTasks.length === 0 ? (
                <div style={{ padding: '10px 0', textAlign: 'center', color: 'rgba(20,35,61,0.5)', fontSize: 13 }}>Nada planeado. <Link href="/epicas" style={{ color: '#A87A2C', fontWeight: 700 }}>Elige tu enfoque →</Link></div>
              ) : (<>
                {todayTasks.slice(0, 8).map(({ e, t }, k, arr) => (
                  <Link key={t.id || k} href="/epicas" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: k < arr.length - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                    <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.4)', flexShrink: 0 }}>{e.name}</span>
                  </Link>
                ))}
                {todayTasks.length > 8 && <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)', paddingTop: 8 }}>+{todayTasks.length - 8} más en Épicas</div>}
              </>)}
            </Slot>

            {routines.length > 0 && (
              <Slot id="rutinas" title="Rutinas de hoy" icon="🔁" accent="#2E6E6E" layout={layout} setSlot={setSlot} right={<span style={{ fontSize: 10.5, fontWeight: 700, color: '#2E6E6E' }}>{routinesDone}/{routines.length}</span>}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {routines.map((r, k) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, background: r.done ? 'rgba(46,110,110,0.12)' : 'rgba(15,35,64,0.05)', border: `1px solid ${r.done ? 'rgba(46,110,110,0.3)' : 'rgba(15,35,64,0.1)'}`, color: r.done ? '#2E6E6E' : 'rgba(20,35,61,0.6)' }}>{r.done ? '✓' : '○'} {r.name}</span>
                  ))}
                </div>
                <Link href="/epicas" style={{ display: 'inline-block', marginTop: 12, fontSize: 11.5, fontWeight: 700, color: '#2E6E6E', textDecoration: 'none' }}>marcar en Épicas →</Link>
              </Slot>
            )}

            {dueSoon.length > 0 && (
              <Slot id="vence" title="Por vencer" icon="⏳" accent="#B0522E" layout={layout} setSlot={setSlot}>
                {dueSoon.map(({ e, t, days }, k) => (
                  <Link key={t.id || k} href="/epicas" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: k < dueSoon.length - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: days === 0 ? '#B0522E' : days <= 3 ? '#A87A2C' : 'rgba(20,35,61,0.5)', flexShrink: 0 }}>{days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} d`}</span>
                  </Link>
                ))}
              </Slot>
            )}
          </div>

          {/* ── Columna 2 · PERSONAS Y FECHAS (navy) ── */}
          <div style={col}>
            {cumples.length > 0 && (
              <Slot id="cumples" title="Cumpleaños que vienen" icon="🎂" dark accent="#E7C56B" layout={layout} setSlot={setSlot} right={seeAll(persLink)}>
                {cumples.map((c, k) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: k < cumples.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                    <span style={{ width: 44, fontSize: 11, fontWeight: 700, color: c.days === 0 ? '#F1DB92' : '#E7C56B', flexShrink: 0 }}>{c.dia} {MES3[c.mes]}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: '#F3EFE6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.exc && <span style={{ color: '#E7C56B' }}>✦ </span>}{c.nombre}<span style={{ color: 'rgba(243,239,230,0.5)' }}> · cumple {c.anos}</span></span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.days <= 3 ? '#F1DB92' : 'rgba(243,239,230,0.55)', flexShrink: 0 }}>{rel(c.days)}</span>
                  </div>
                ))}
              </Slot>
            )}

            {fechas.length > 0 && (
              <Slot id="fechas" title="Fechas a recordar" icon="✦" dark accent="#C2933A" layout={layout} setSlot={setSlot} right={seeAll(persLink)}>
                {fechas.map((f, k) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 0', borderBottom: k < fechas.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                    <span style={{ width: 44, fontSize: 11, fontWeight: 700, color: f.days === 0 ? '#F1DB92' : '#E7C56B', flexShrink: 0, paddingTop: 1 }}>{f.dia} {MES3[f.mes]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: '#F3EFE6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.titulo}{f.anos > 0 ? <span style={{ color: 'rgba(243,239,230,0.5)' }}> · {f.anos} años</span> : ''}</div>
                      {f.personas.length > 0 && <div style={{ fontSize: 10.5, color: 'rgba(243,239,230,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>con {f.personas.join(', ')}</div>}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: f.days <= 3 ? '#F1DB92' : 'rgba(243,239,230,0.55)', flexShrink: 0, paddingTop: 1 }}>{rel(f.days)}</span>
                  </div>
                ))}
              </Slot>
            )}
          </div>

          {/* ── Columna 3 · TU ENTORNO ── */}
          <div style={col}>
            <Slot id="clima" title="Clima" icon="🌤️" bare layout={layout} setSlot={setSlot}><WeatherWidget /></Slot>
            <Slot id="frase" title="Frase del día" icon="✍️" bare layout={layout} setSlot={setSlot}><QuoteWidget /></Slot>
            <Slot id="calendario" title="Calendario" icon="🗓️" bare layout={layout} setSlot={setSlot}><CalendarWidget /></Slot>
          </div>
        </div>
      </main>

      <style>{`@media (max-width: 640px){ .panel-cols{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
