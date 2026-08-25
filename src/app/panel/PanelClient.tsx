'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import SectionNav from '@/components/SectionNav'
import FavoritosStrip from '@/components/FavoritosStrip'
import CalendarWidget from '@/components/CalendarWidget'
import QuoteWidget from '@/components/QuoteWidget'
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
const VIDA = 'https://mi-vida-neon.vercel.app/vida'
const PERSONAS = `${VIDA}?vista=personas`

type Tt = { e: Epica; t: EpicaTask }
type SlotState = 'normal' | 'collapsed'

const baseCard: CSSProperties = { borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 44px -34px rgba(15,35,64,0.5)' }

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

// Título de sección con regla + link opcional a "su parte".
function SectionTitle({ icon, children, href, cta, external }: { icon?: string; children: ReactNode; href?: string; cta?: string; external?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 2px 14px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: '800 12px var(--font-ui, system-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#10233F' }}>{icon && <span style={{ fontSize: 15 }}>{icon}</span>}{children}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(15,35,64,0.12)' }} />
      {href && (external
        ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: '#2E5A9E', textDecoration: 'none', whiteSpace: 'nowrap' }}>{cta || 'ver todo'} →</a>
        : <Link href={href} style={{ fontSize: 11, fontWeight: 700, color: '#2E5A9E', textDecoration: 'none', whiteSpace: 'nowrap' }}>{cta || 'ver todo'} →</Link>)}
    </div>
  )
}
export default function PanelClient() {
  const [epics, setEpics] = useState<Epica[] | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const [workedMin, setWorkedMin] = useState(0)
  const [runningName, setRunningName] = useState<string | null>(null)
  const [personas, setPersonas] = useState<{ id: string; nombre: string; apodo: string | null; cumple: string; excepcional?: boolean }[]>([])
  const [momentos, setMomentos] = useState<{ id: number; titulo: string; fecha: string | null; outstanding: boolean; recordar?: boolean | null; personas: string[] | null }[]>([])
  const [layout, setLayout] = useState<Record<string, SlotState>>({})
  const [weather, setWeather] = useState<{ temp: number; feels: number; humidity: number; label: string; icon: string; hourly: { h: number; temp: number; icon: string; pop: number | null }[]; cities: { name: string; temp: number; icon: string }[] } | null>(null)
  const [peek, setPeek] = useState<{ kind: 'task'; e: Epica; t: EpicaTask } | null>(null)
  const [enfEpic, setEnfEpic] = useState<string>('todas')   // filtro por épica en Actividades
  const [enfAll, setEnfAll] = useState(false)               // ver TODAS las actividades del día

  const today = todayISO()

  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id) }, [])
  useEffect(() => { try { const raw = localStorage.getItem('panel.layout.v1'); if (raw) setLayout(JSON.parse(raw)) } catch { /* noop */ } }, [])
  const setSlot = (id: string, s: SlotState) => setLayout(prev => { const next = { ...prev, [id]: s }; if (s === 'normal') delete next[id]; try { localStorage.setItem('panel.layout.v1', JSON.stringify(next)) } catch { /* noop */ } return next })

  useEffect(() => {
    let alive = true
    fetch('/api/epicas').then(r => r.json()).then(j => { if (alive && j?.ok) setEpics(j.data as Epica[]) }).catch(() => {})
    fetch('/api/cumples').then(r => r.json()).then(j => { if (alive && j?.ok) setPersonas(j.personas || []) }).catch(() => {})
    fetch('/api/momentos').then(r => r.json()).then(j => { if (alive && j?.ok) setMomentos(j.recuerdos || []) }).catch(() => {})
    fetch('/api/weather').then(r => r.json()).then(j => { if (alive && j && !j.error) setWeather(j) }).catch(() => {})
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
    // Orden por IMPORTANCIA: prioridad (alta→media→baja), luego vencimiento, luego orden manual.
    const prioRank = (p?: string) => (p === 'alta' ? 0 : p === 'baja' ? 2 : 1)
    return out.sort((a, b) => prioRank(a.t.priority) - prioRank(b.t.priority) || (a.t.due || '9999').localeCompare(b.t.due || '9999') || (a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9))
  }, [list, today])

  // Épicas presentes en las tareas de hoy (para el filtro) + tareas filtradas.
  const enfEpics = useMemo(() => { const seen = new Map<string, Epica>(); todayTasks.forEach(({ e }) => { if (!seen.has(e.id)) seen.set(e.id, e) }); return [...seen.values()] }, [todayTasks])
  const filteredTasks = useMemo(() => enfEpic === 'todas' ? todayTasks : todayTasks.filter(x => x.e.id === enfEpic), [todayTasks, enfEpic])

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
      return { id: p.id, nombre: p.apodo?.trim() || p.nombre, days, dia: d, mes: m - 1, anos: next.getFullYear() - y, exc: !!p.excepcional }
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
      return { id: mm.id, titulo: mm.titulo, personas: mm.personas || [], days, dia: d, mes: mo - 1, anos: next.getFullYear() - y }
    }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.days - b.days).slice(0, 7)
  }, [momentos])

  const hours = useMemo(() => {
    if (!weather?.hourly?.length) return []
    const h0 = (now ? now.getHours() : new Date().getHours())
    const rest = weather.hourly.filter(x => x.h >= h0)
    return (rest.length ? rest : weather.hourly).slice(0, 11)
  }, [weather, now])

  const routinesDone = routines.filter(r => r.done).length
  const greet = now ? (now.getHours() < 12 ? 'Buenos días' : now.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches') : ''
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

        {/* INFORMATIVO tras KPIs: Clima por HORA + Frase */}
        <div className="panel-info" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 16, alignItems: 'start', marginBottom: 4 }}>
          <Slot id="clima" title="Clima" icon="🌤️" accent="#2E5A9E" layout={layout} setSlot={setSlot}>
            {!weather ? <div style={{ height: 130, opacity: 0 }} /> : (<>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <span style={{ fontFamily: SERIF, fontSize: 42, lineHeight: 1, color: '#10233F' }}>{weather.temp}°</span>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#16365F', marginTop: 2 }}>{weather.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: 2 }}>Naucalpan · sens. {weather.feels}° · 💧 {weather.humidity}%</div>
                </div>
                <span style={{ fontSize: 42, lineHeight: 1 }}>{weather.icon}</span>
              </div>
              {hours.length > 0 && (
                <div style={{ display: 'flex', gap: 2, overflowX: 'auto', paddingTop: 10, borderTop: '1px solid rgba(15,35,64,0.07)' }}>
                  {hours.map((x, k) => (
                    <div key={k} style={{ flex: '0 0 auto', minWidth: 48, textAlign: 'center', padding: '5px 3px', borderRadius: 10, background: k === 0 ? 'rgba(46,90,158,0.09)' : 'transparent' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: k === 0 ? '#2E5A9E' : 'rgba(20,35,61,0.5)' }}>{k === 0 ? 'ahora' : `${x.h}h`}</div>
                      <div style={{ fontSize: 19, margin: '3px 0 1px' }}>{x.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#10233F' }}>{x.temp}°</div>
                      {x.pop != null && x.pop >= 20 && <div style={{ fontSize: 9, color: '#2E5A9E', fontWeight: 700 }}>💧{x.pop}%</div>}
                    </div>
                  ))}
                </div>
              )}
              {weather.cities?.length > 0 && (
                <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(15,35,64,0.07)' }}>
                  {weather.cities.map((c, k) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}><span style={{ fontSize: 15 }}>{c.icon}</span><span style={{ color: 'rgba(20,35,61,0.6)' }}>{c.name}</span><b style={{ color: '#10233F' }}>{c.temp}°</b></div>
                  ))}
                </div>
              )}
            </>)}
          </Slot>
          <Slot id="frase" title="Frase del día" icon="✍️" bare layout={layout} setSlot={setSlot}><QuoteWidget /></Slot>
        </div>

        {/* SECCIÓN · EL DÍA */}
        <SectionTitle icon="📅" href="/epicas" cta="ver en Épicas">El día</SectionTitle>

        {/* Enfoque de hoy = Actividades + Rutinas en UNA tarjeta grande, dividida */}
        <div style={{ marginBottom: 16 }}>
          <Slot id="enfoque" title="Enfoque de hoy" icon="📋" accent="#2E5A9E" layout={layout} setSlot={setSlot} right={<Link href="/epicas" style={{ fontSize: 10.5, fontWeight: 700, color: '#2E5A9E', textDecoration: 'none' }}>Épicas →</Link>}>
            <div className="enfoque-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) 1px minmax(0,1fr)', gap: 20, alignItems: 'stretch' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ font: '800 10px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: '#2E5A9E' }}>Actividades · {filteredTasks.length}</span>
                  {enfEpics.length > 1 && (
                    <select value={enfEpic} onChange={ev => { setEnfEpic(ev.target.value); setEnfAll(false) }} style={{ font: '600 11px var(--font-ui)', color: '#16365F', background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '3px 6px', cursor: 'pointer', maxWidth: 150 }}>
                      <option value="todas">Todas las épicas</option>
                      {enfEpics.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  )}
                </div>
                {epics === null ? <div style={{ height: 80, opacity: 0 }} /> : filteredTasks.length === 0 ? (
                  <div style={{ padding: '8px 0', color: 'rgba(20,35,61,0.5)', fontSize: 13 }}>{todayTasks.length === 0 ? <>Nada planeado. <Link href="/epicas" style={{ color: '#A87A2C', fontWeight: 700 }}>Elige tu enfoque →</Link></> : 'Nada en esta épica hoy.'}</div>
                ) : (<>
                  {(enfAll ? filteredTasks : filteredTasks.slice(0, 9)).map(({ e, t }, k, arr) => (
                    <div key={t.id || k} onClick={() => setPeek({ kind: 'task', e, t })} title={`Ver “${t.t}”`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', margin: '0 -4px', borderRadius: 8, cursor: 'pointer', borderBottom: k < arr.length - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none' }} onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(15,35,64,0.03)'} onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                      {t.priority === 'alta' && <span title="Prioridad alta" style={{ font: '800 8.5px var(--font-ui)', letterSpacing: '.05em', color: '#B0522E', background: 'rgba(176,82,46,0.1)', border: '1px solid rgba(176,82,46,0.25)', borderRadius: 5, padding: '1px 4px', flexShrink: 0 }}>ALTA</span>}
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                      <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.4)', flexShrink: 0 }}>{e.name}</span>
                    </div>
                  ))}
                  {filteredTasks.length > 9 && <button onClick={() => setEnfAll(v => !v)} style={{ cursor: 'pointer', border: 'none', background: 'transparent', font: '700 11.5px var(--font-ui)', color: '#2E5A9E', padding: '8px 0 0' }}>{enfAll ? 'ver menos ▴' : `ver todas (${filteredTasks.length}) ▾`}</button>}
                </>)}
              </div>
              <div className="enfoque-div" style={{ background: 'rgba(15,35,64,0.08)' }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ font: '800 10px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: '#2E6E6E' }}>Rutinas</span><span style={{ fontSize: 10.5, fontWeight: 700, color: '#2E6E6E' }}>{routinesDone}/{routines.length}</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {routines.map((r, k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, background: r.done ? 'rgba(46,110,110,0.12)' : 'rgba(15,35,64,0.05)', border: `1px solid ${r.done ? 'rgba(46,110,110,0.3)' : 'rgba(15,35,64,0.1)'}`, color: r.done ? '#2E6E6E' : 'rgba(20,35,61,0.6)' }}>{r.done ? '✓' : '○'} {r.name}</span>)}
                  {routines.length === 0 && <span style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Sin rutinas.</span>}
                </div>
                <Link href="/epicas" style={{ display: 'inline-block', marginTop: 12, fontSize: 11.5, fontWeight: 700, color: '#2E6E6E', textDecoration: 'none' }}>marcar en Épicas →</Link>
              </div>
            </div>
          </Slot>
        </div>

        {/* Calendario + (Por vencer + accesos) */}
        <div className="panel-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <Slot id="calendario" title="Calendario" icon="🗓️" bare layout={layout} setSlot={setSlot}><CalendarWidget /></Slot>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {dueSoon.length > 0 && (
              <Slot id="vence" title="Por vencer" icon="⏳" accent="#B0522E" layout={layout} setSlot={setSlot}>
                {dueSoon.map(({ e, t, days }, k) => (
                  <div key={t.id || k} onClick={() => setPeek({ kind: 'task', e, t })} title={`Ver “${t.t}”`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', margin: '0 -4px', borderRadius: 8, cursor: 'pointer', borderBottom: k < dueSoon.length - 1 ? '1px solid rgba(15,35,64,0.06)' : 'none' }} onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(15,35,64,0.03)'} onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: days === 0 ? '#B0522E' : days <= 3 ? '#A87A2C' : 'rgba(20,35,61,0.5)', flexShrink: 0 }}>{days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} d`}</span>
                  </div>
                ))}
              </Slot>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[{ href: '/tiempo', t: 'Tiempo', d: 'Planifica y cierra el día', c: '#8a4b28' }, { href: '/epicas', t: 'Épicas', d: 'Tus frentes y tareas', c: '#2E5A9E' }].map(q => (
                <Link key={q.href} href={q.href} style={{ ...baseCard, background: '#fff', border: '1px solid rgba(15,35,64,0.09)', padding: '14px 16px', textDecoration: 'none', color: 'inherit', display: 'block', transition: 'transform .14s ease, box-shadow .14s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 32px -22px rgba(15,35,64,0.6)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = baseCard.boxShadow as string }}>
                  <div style={{ fontFamily: SERIF, fontSize: 17, color: q.c }}>{q.t} →</div>
                  <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)', marginTop: 3 }}>{q.d}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* SECCIÓN · PERSONAS Y FECHAS (navy, 2-col grandes) */}
        <SectionTitle icon="👥" href={PERSONAS} external cta="ver en Mi Vida">Personas y fechas</SectionTitle>
        <div className="panel-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 16, alignItems: 'start' }}>
          {cumples.length > 0 && (
            <Slot id="cumples" title="Cumpleaños que vienen" icon="🎂" dark accent="#E7C56B" layout={layout} setSlot={setSlot} right={seeAll(PERSONAS)}>
              {cumples.map((c, k) => (
                <a key={k} href={`${PERSONAS}&persona=${c.id}`} target="_blank" rel="noopener noreferrer" title={`Ver a ${c.nombre} en Mi Vida`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', margin: '0 -4px', borderRadius: 8, cursor: 'pointer', textDecoration: 'none', borderBottom: k < cumples.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ width: 44, fontSize: 11, fontWeight: 700, color: c.days === 0 ? '#F1DB92' : '#E7C56B', flexShrink: 0 }}>{c.dia} {MES3[c.mes]}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: '#F3EFE6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.exc && <span style={{ color: '#E7C56B' }}>✦ </span>}{c.nombre}<span style={{ color: 'rgba(243,239,230,0.5)' }}> · cumple {c.anos}</span></span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.days <= 3 ? '#F1DB92' : 'rgba(243,239,230,0.55)', flexShrink: 0 }}>{rel(c.days)}</span>
                </a>
              ))}
            </Slot>
          )}
          {fechas.length > 0 && (
            <Slot id="fechas" title="Fechas a recordar" icon="✦" dark accent="#C2933A" layout={layout} setSlot={setSlot} right={seeAll(PERSONAS)}>
              {fechas.map((f, k) => (
                <a key={k} href={`${VIDA}?r=${f.id}`} target="_blank" rel="noopener noreferrer" title="Abrir este momento en Mi Vida" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 4px', margin: '0 -4px', borderRadius: 8, cursor: 'pointer', textDecoration: 'none', borderBottom: k < fechas.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ width: 44, fontSize: 11, fontWeight: 700, color: f.days === 0 ? '#F1DB92' : '#E7C56B', flexShrink: 0, paddingTop: 1 }}>{f.dia} {MES3[f.mes]}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: '#F3EFE6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.titulo}{f.anos > 0 ? <span style={{ color: 'rgba(243,239,230,0.5)' }}> · {f.anos} años</span> : ''}</div>
                    {f.personas.length > 0 && <div style={{ fontSize: 10.5, color: 'rgba(243,239,230,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>con {f.personas.join(', ')}</div>}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: f.days <= 3 ? '#F1DB92' : 'rgba(243,239,230,0.55)', flexShrink: 0, paddingTop: 1 }}>{rel(f.days)}</span>
                </a>
              ))}
            </Slot>
          )}
        </div>
      </main>

      {/* POPUP de info: primero muestra el detalle, con un botón para ir directo a la sección. */}
      {peek && (() => {
        const close = () => setPeek(null)
        const ctaStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', boxSizing: 'border-box', cursor: 'pointer', border: 'none', borderRadius: 11, padding: '12px 16px', font: '800 13px var(--font-ui, system-ui)', textDecoration: 'none' }
        const shell = (accent: string, dark: boolean, children: ReactNode) => (
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,22,42,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ ...baseCard, width: '100%', maxWidth: 480, background: dark ? 'linear-gradient(158deg,#16305a,#0f2242 62%,#0b1a35)' : '#fff', boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)' }}>
              <div style={{ height: 4, background: accent }} />
              <div style={{ padding: '18px 20px 20px' }}>{children}</div>
            </div>
          </div>
        )
        const closeBtn = (dark: boolean) => <button aria-label="Cerrar" onClick={close} style={{ cursor: 'pointer', border: 'none', background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,35,64,0.06)', borderRadius: 9, height: 30, width: 30, color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(20,35,61,0.55)', fontSize: 15, flexShrink: 0 }}>✕</button>

        if (peek.kind === 'task') {
          const { e, t } = peek
          const subs = t.subtasks || []; const done = subs.filter(s => s.done).length
          const noteText = (t.note || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
          const pm = t.priority === 'alta' ? { l: 'Prioridad alta', c: '#B0522E' } : t.priority === 'baja' ? { l: 'Prioridad baja', c: '#2E5A9E' } : { l: 'Prioridad media', c: '#A87A2C' }
          const chip = (txt: string, c: string) => <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 99, padding: '3px 10px', background: `${c}18`, color: c }}>{txt}</span>
          return shell(e.color, false, <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(20,35,61,0.55)', marginBottom: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}</div>
                <div className="serif" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2, color: '#10233F' }}>{t.t}</div>
              </div>
              {closeBtn(false)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {chip(t.status || 'Por hacer', '#16365F')}
              {chip(pm.l, pm.c)}
              {t.due && chip(`vence ${Number(t.due.slice(8))} ${MES3[Number(t.due.slice(5, 7)) - 1]}`, '#B0522E')}
              {typeof t.estMin === 'number' && t.estMin > 0 && chip(`~${Math.round(t.estMin / 60 * 10) / 10}h`, '#2E6E6E')}
            </div>
            {typeof t.progress === 'number' && t.progress > 0 && (
              <div style={{ marginTop: 12 }}><div style={{ height: 7, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, t.progress)}%`, height: '100%', background: e.color }} /></div><div style={{ marginTop: 3, fontSize: 10.5, color: 'rgba(20,35,61,0.5)', fontWeight: 700 }}>{Math.min(100, t.progress)}%</div></div>
            )}
            {!!(t.resumen && t.resumen.trim()) && <div style={{ marginTop: 12, fontSize: 12.5, color: 'rgba(20,35,61,0.7)', lineHeight: 1.5 }}>{t.resumen}</div>}
            {noteText && <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(20,35,61,0.55)', lineHeight: 1.5, maxHeight: 96, overflow: 'hidden' }}>{noteText}</div>}
            {subs.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ font: '800 10px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 6 }}>Subtareas · {done}/{subs.length}</div>
                {subs.map((s, si) => <div key={s.id || si} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}><span style={{ color: s.done ? '#2E6E6E' : 'rgba(20,35,61,0.3)', fontSize: 13 }}>{s.done ? '✓' : '○'}</span><span style={{ fontSize: 12.5, color: s.done ? 'rgba(20,35,61,0.45)' : '#16365F', textDecoration: s.done ? 'line-through' : 'none' }}>{s.t}</span></div>)}
              </div>
            )}
            <div style={{ marginTop: 16 }}><Link href={`/epicas?e=${e.id}&t=${t.id}`} onClick={close} style={{ ...ctaStyle, background: 'linear-gradient(135deg,#2E5A9E,#16365F)', color: '#fff' }}>Abrir en Épicas →</Link></div>
          </>)
        }

        return null
      })()}

      <style>{`@media (max-width: 720px){ .panel-info, .panel-2col{ grid-template-columns: 1fr !important; } .enfoque-split{ grid-template-columns: 1fr !important; } .enfoque-div{ display: none !important; } }`}</style>
    </div>
  )
}
