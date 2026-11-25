'use client'

/* Bloques que venían del Panel y ahora usa «Mi día» (/dia): tu semana en gráficas, salud y «Pregúntale a tu cerebro».
 * (El Panel se juntó con Mi día el 2026-11-25; /panel redirige a /dia.) Datos: /api/dia, /api/panel y /api/tiempo-estado. */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import type { Epica } from '@/lib/supabase'
import { sumarDias, type DiaGet } from '@/lib/dia'
import { useDictado, juntar } from '@/lib/useDictado'

const SERIF = 'var(--dia-serif, var(--font-serif), Georgia, serif)'
const NAVY = 'var(--md-tinta, #10233F)', AZUL = '#2E5A9E', ORO = '#A87A2C', ROJO = '#B0522E', VERDE = '#2E6E6E'
const MUTED = 'rgba(20,35,61,0.55)', TENUE = 'rgba(20,35,61,0.4)', LINEA = 'rgba(15,35,64,0.08)'
const DN3 = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const fecha0 = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
const tarjeta: CSSProperties = { borderRadius: 16, background: '#fff', border: '1px solid var(--md-linea, rgba(15,35,64,0.09))' }

export type PanelExtra = { salud: null | { peso: number; fecha: string; cambioSemana: number | null; hace: number; anotadoHoy: boolean | null }; sinContacto: null | { id: string; nombre: string; dias: number }[] }

/** Tu semana: calificación por día y planeado contra trabajado (Tiempo). */
export function TuSemana({ dia, epics, hoy }: { dia: DiaGet | null; epics: Epica[] | null; hoy: string }) {
  const [trab, setTrab] = useState<Record<string, number>>({})
  useEffect(() => {
    // Lo trabajado sale de Tiempo: primero el guardado en el servidor (sirve en cualquier dispositivo);
    // si no hay, lo de este navegador.
    const sumar = (hist: unknown) => {
      const m: Record<string, number> = {}
      for (const h of (Array.isArray(hist) ? hist : []) as { date: string; area: string; dur: number }[]) if (h?.area === 'trabajo') m[h.date] = (m[h.date] || 0) + (Number(h.dur) || 0)
      return m
    }
    let vivo = true
    try { setTrab(sumar(JSON.parse(localStorage.getItem('margen.v1') || '{}').history)) } catch { /* sin Tiempo en este navegador */ }
    fetch('/api/tiempo-estado').then(r => r.json()).then(j => {
      const hist = j?.ok && j.ready ? j.data?.history : null
      if (vivo && Array.isArray(hist) && hist.length) setTrab(sumar(hist))
    }).catch(() => {})
    return () => { vivo = false }
  }, [])
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6))
  const cal = new Map((dia?.cierres || []).map(c => [c.fecha, c.calificacion]))
  const plan = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of epics || []) for (const t of e.tasks || []) {
      if (t.status === 'Archivada') continue
      const dp = (t.dayPlans || []).filter(x => dias.includes(x.day))
      if (dp.length) for (const x of dp) m[x.day] = (m[x.day] || 0) + (x.estMin || t.estMin || 45)
      else if (t.plan && dias.includes(t.plan)) m[t.plan] = (m[t.plan] || 0) + (t.estMin || 45)
    }
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epics, hoy])
  const maxH = Math.max(60, ...dias.map(d => Math.max(plan[d] || 0, trab[d] || 0)))
  const conPlan = dias.filter(d => d < hoy && (plan[d] || 0) > 0)
  const ratio = conPlan.length ? conPlan.reduce((s, d) => s + (trab[d] || 0), 0) / conPlan.reduce((s, d) => s + plan[d], 0) : null
  const califs = dias.map(d => cal.get(d)).filter((x): x is number => x != null)
  const prom = califs.length ? Math.round(califs.reduce((a, b) => a + b, 0) / califs.length * 10) / 10 : null
  const barra = (h: number, color: string) => <span style={{ display: 'block', width: '100%', height: Math.max(3, h), borderRadius: '4px 4px 0 0', background: color }} />
  return (
    <div className="panel-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 22 }}>
      <div>
        <Cab t="Cómo calificaste cada día" d={prom != null ? `promedio ${prom}` : 'cierra tu día para verlo'} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 96 }}>
          {dias.map(d => { const c = cal.get(d); return (
            <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11, color: MUTED }}>{c ?? ''}</span>
              {barra(c ? c * 7 : 3, c == null ? LINEA : c >= 7 ? VERDE : ORO)}
              <span style={{ fontSize: 10.5, color: d === hoy ? ROJO : TENUE, fontWeight: d === hoy ? 800 : 500 }}>{DN3[fecha0(d).getDay()]}</span>
            </div>
          ) })}
        </div>
      </div>
      <div>
        <Cab t="Planeado contra trabajado" d="gris = planeado · azul = trabajado" />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 96 }}>
          {dias.map(d => (
            <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%', height: 72 }}>
                {barra(((plan[d] || 0) / maxH) * 72, 'rgba(15,35,64,0.14)')}
                {barra(((trab[d] || 0) / maxH) * 72, AZUL)}
              </div>
              <span style={{ fontSize: 10.5, color: d === hoy ? ROJO : TENUE, fontWeight: d === hoy ? 800 : 500 }}>{DN3[fecha0(d).getDay()]}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
          {ratio == null ? 'Agenda tareas con tiempo estimado y registra en Tiempo para ver esto.' : ratio < 0.6 ? `Trabajas ${Math.round(ratio * 100)} % de lo que planeas. Claude te propone menos prioridades.` : ratio > 1.2 ? 'Trabajas más de lo que planeas: estimas de menos.' : 'Planeas más o menos lo que trabajas. Bien calibrado.'}
        </div>
      </div>
    </div>
  )
}

/** Salud: último peso, cambio de la semana y si ya anotaste hoy. */
export function SaludDia({ extra }: { extra: PanelExtra | null }) {
  const s = extra?.salud
  if (!s) return null
  const c = s.cambioSemana
  return (
    <Link href="/peso" style={{ ...tarjeta, padding: '14px 16px', textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <Cab t="Salud" d="/peso →" />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: SERIF, fontSize: 28, color: NAVY }}>{s.peso} kg</span>
        {c != null && <span style={{ fontSize: 12.5, fontWeight: 700, color: c <= 0 ? VERDE : ROJO }}>{c > 0 ? '+' : ''}{c} en la semana</span>}
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{s.hace === 0 ? 'Te pesaste hoy' : `Te pesaste hace ${s.hace} ${s.hace === 1 ? 'día' : 'días'}`}{s.anotadoHoy === false ? ' · hoy no has anotado comidas' : s.anotadoHoy ? ' · ya anotaste hoy' : ''}</div>
    </Link>
  )
}

/** «Pregúntale a tu cerebro»: Gemini con tus resúmenes de Mi día. */
export function Preguntale() {
  const [q, setQ] = useState('')
  const [r, setR] = useState<{ respuesta: string; fuentes: string[] } | null>(null)
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)
  const d = useDictado(f => setQ(v => juntar(v, f)))
  const preguntar = async () => {
    if (d.escuchando) d.parar()
    const p = q.trim(); if (p.length < 3) { setErr('Escribe una pregunta primero'); return }
    setErr(''); setCargando(true); setR(null)
    try {
      const j = await (await fetch('/api/dia/preguntar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: p }) })).json()
      if (!j.ok) setErr(j.error || 'No pude contestar'); else setR({ respuesta: j.respuesta, fuentes: j.fuentes || [] })
    } catch { setErr('No pude contestar. Revisa tu conexión.') }
    finally { setCargando(false) }
  }
  const ejemplos = ['¿Qué hice esta semana en el ERP?', '¿Qué me falta de lo de Eugenia?', '¿Qué he estado evitando?']
  return (
    <div style={{ ...tarjeta, padding: '16px 18px' }}>
      <Cab t="Pregúntale a tu cerebro" d="con tus resúmenes de Mi día · Gemini" />
      <form onSubmit={e => { e.preventDefault(); preguntar() }} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <MicBoton d={d} />
        <input value={d.parcial ? juntar(q, d.parcial) : q} onChange={e => { setQ(e.target.value); setErr('') }} placeholder={d.escuchando ? 'Te escucho…' : '¿Qué hice esta semana en el ERP?'} aria-label="Tu pregunta"
          style={{ flex: 1, minWidth: 0, border: '1px solid rgba(15,35,64,0.14)', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', color: NAVY }} />
        <button disabled={cargando} style={{ border: 'none', borderRadius: 10, padding: '10px 16px', background: NAVY, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: cargando ? 0.6 : 1 }}>{cargando ? 'Pensando…' : 'Preguntar'}</button>
      </form>
      {(err || d.error) && <div style={{ fontSize: 12.5, color: ROJO, marginTop: 6 }}>{err || d.error}</div>}
      {!r && !cargando && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{ejemplos.map(x => <button key={x} onClick={() => { setQ(x); setErr('') }} style={{ border: `1px solid ${LINEA}`, background: '#faf8f3', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, color: MUTED, cursor: 'pointer' }}>{x}</button>)}</div>}
      {r && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINEA}` }}>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: '#16365F', whiteSpace: 'pre-wrap' }}>{r.respuesta}</div>
          {r.fuentes.length > 0 && <div style={{ fontSize: 11, color: TENUE, marginTop: 6 }}>Fuentes: {r.fuentes.join(' · ')}</div>}
        </div>
      )}
    </div>
  )
}

function MicBoton({ d }: { d: ReturnType<typeof useDictado> }) {
  return (
    <button type="button" onClick={d.escuchando ? d.parar : d.iniciar} aria-label={d.escuchando ? 'Dejar de dictar' : 'Dictar con la voz'} title={d.escuchando ? 'Dejar de dictar' : 'Dictar con la voz'}
      style={{ width: 36, height: 36, borderRadius: 99, flexShrink: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: d.escuchando ? 'none' : '1px solid rgba(15,35,64,0.14)', background: d.escuchando ? ROJO : '#fff', color: d.escuchando ? '#fff' : MUTED }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
    </button>
  )
}

function Cab({ t, d, href }: { t: string; d?: string; href?: string }): ReactNode {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
      <span style={{ font: '800 10.5px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: AZUL }}>{t}</span>
      {d && (href ? <Link href={href} style={{ fontSize: 11, color: TENUE, textDecoration: 'none' }}>{d}</Link> : <span style={{ fontSize: 11, color: TENUE }}>{d}</span>)}
    </div>
  )
}
