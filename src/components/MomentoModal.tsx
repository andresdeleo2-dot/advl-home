'use client'

import { useState, useEffect, useRef } from 'react'
import {
  type Vida, TIPO_COLORES, edadEnFecha, añoDe, fotoSrc,
  diffFechas, formatDiff, sanitizeNota,
} from '@/lib/vida'

export type Momento = Vida

const VIDA_URL = 'https://mi-vida-neon.vercel.app/vida'
const FONTS = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Instrument+Sans:wght@400;600;700&display=swap'

type Props = {
  recuerdo: Vida
  todos: Vida[]            // para navegación prev/next (los momentos del widget)
  allRecuerdos: Vida[]     // pool para referencias cruzadas
  contexto: Vida[]
  onClose: () => void
}

function formatFecha(f: string) {
  return new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}
function getAño(f: string) { return new Date(f + 'T12:00:00').getFullYear() }

export default function MomentoModal({ recuerdo, todos, allRecuerdos, contexto, onClose }: Props) {
  const [current, setCurrent] = useState(recuerdo)
  const [fotoIdx, setFotoIdx] = useState(0)
  const [openPersona, setOpenPersona] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const pool = allRecuerdos.length ? allRecuerdos : todos
  const idx = todos.findIndex(r => r.id === current.id)
  const prev = idx > 0 ? todos[idx - 1] : null
  const next = idx >= 0 && idx < todos.length - 1 ? todos[idx + 1] : null

  const edad = current.fecha ? edadEnFecha(current.fecha) : null
  const color = TIPO_COLORES[current.tipo] ?? '#9a8a6c'
  const fotos = current.fotos ?? []

  const hoyISO = new Date().toISOString().slice(0, 10)
  const tieneFin = !!current.fecha_fin && current.fecha_fin !== current.fecha
  const fechaAncla = tieneFin ? current.fecha_fin! : current.fecha
  const haceCuanto = fechaAncla ? formatDiff(diffFechas(fechaAncla, hoyISO)) : null
  const esFuturo = fechaAncla ? new Date(fechaAncla + 'T12:00:00') > new Date() : false
  const duracion = tieneFin && current.fecha ? formatDiff(diffFechas(current.fecha, current.fecha_fin!)) : null

  const ctxCercano = current.fecha ? contexto.filter(c => {
    if (!c.fecha) return false
    return Math.abs(getAño(c.fecha) - getAño(current.fecha!)) <= 1
  }).sort((a, b) => (b.importancia ?? 0) - (a.importancia ?? 0) || (a.fecha ?? '').localeCompare(b.fecha ?? '')).slice(0, 6) : []

  const recuerdosCercanos = current.fecha ? pool
    .filter(r => r.id !== current.id && r.fecha && Math.abs(getAño(r.fecha) - getAño(current.fecha!)) <= 1)
    .sort((a, b) => ((b.importancia ?? 0) - (a.importancia ?? 0)) || (a.fecha ?? '').localeCompare(b.fecha ?? ''))
    .slice(0, 6) : []

  const personaTimelines = (current.personas ?? []).map(persona => ({
    persona,
    eventos: pool.filter(r => r.personas?.includes(persona)).sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '')),
  }))

  useEffect(() => {
    setFotoIdx(0)
    setOpenPersona(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [current.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && prev) setCurrent(prev)
      if (e.key === 'ArrowRight' && next) setCurrent(next)
    }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = '' }
  }, [prev, next, onClose])

  const notaHtml = current.nota ? (() => {
    const clean = sanitizeNota(current.nota!)
    return clean.startsWith('<') ? clean : `<p style="font-style:italic">${clean}</p>`
  })() : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '"Instrument Sans",sans-serif' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <link href={FONTS} rel="stylesheet" />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,38,32,.6)', backdropFilter: 'blur(6px)' }} onClick={onClose} />

      <div ref={scrollRef} style={{
        position: 'relative', background: '#fffdf8', borderRadius: 22,
        width: '100%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 40px 90px -30px rgba(40,33,26,.7)',
        animation: 'modalIn .3s cubic-bezier(.2,.7,.2,1)',
      }}>
        <style>{`
          @keyframes modalIn { from { opacity:0; transform: scale(.985) translateY(10px) } to { opacity:1; transform:none } }
          .nota-rich a { color:#bb6a47; text-decoration:underline }
          .nota-rich ul,.nota-rich ol { padding-left:22px; margin:8px 0 }
          .nota-rich li { margin:4px 0 }
          .nota-rich strong,.nota-rich b { font-weight:700 }
          .nota-rich p { margin:0 0 10px }
          .nota-rich p:last-child { margin-bottom:0 }
        `}</style>

        {/* Cerrar */}
        <button onClick={onClose} aria-label="Cerrar" style={{
          position: 'absolute', top: 16, right: 16, zIndex: 10, width: 36, height: 36, borderRadius: '50%',
          border: 'none', background: 'rgba(44,38,32,.35)', color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>

        {/* Galería */}
        {fotos.length > 0 ? (
          <div style={{ position: 'relative', height: 280, background: '#1a1512', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${fotoSrc(fotos[fotoIdx])})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(18px) brightness(.5)', transform: 'scale(1.1)' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoSrc(fotos[fotoIdx])} alt="" referrerPolicy="no-referrer"
              style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain' }}
              onError={e => (e.currentTarget.style.display = 'none')} />
            {fotos.length > 1 && (
              <>
                <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 3 }}>
                  {fotos.map((_, i) => (
                    <button key={i} onClick={() => setFotoIdx(i)} style={{ width: i === fotoIdx ? 20 : 8, height: 8, borderRadius: 999, background: i === fotoIdx ? '#fff' : 'rgba(255,255,255,.5)', border: 'none', cursor: 'pointer', padding: 0, transition: 'all .2s' }} />
                  ))}
                </div>
                <button onClick={() => setFotoIdx(i => Math.max(0, i - 1))} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 3, opacity: fotoIdx > 0 ? 1 : .2, ...navBtn }}>←</button>
                <button onClick={() => setFotoIdx(i => Math.min(fotos.length - 1, i + 1))} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 3, opacity: fotoIdx < fotos.length - 1 ? 1 : .2, ...navBtn }}>→</button>
              </>
            )}
          </div>
        ) : (
          <div style={{ height: 110, background: 'repeating-linear-gradient(45deg,#e7dcc7,#e7dcc7 4px,#ece3d3 4px,#ece3d3 12px)' }} />
        )}

        {/* Contenido */}
        <div style={{ padding: '24px 32px' }}>
          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            {edad && (
              <span style={{ padding: '4px 12px', borderRadius: 999, background: '#fbf6ec', border: '1px solid #e7dcc7', fontSize: 13, fontWeight: 600, color: '#79705f' }}>
                {edad.años >= 0 ? `${edad.años} años` : `${Math.abs(edad.años)}a antes de nacer`}
              </span>
            )}
            {current.fecha && <span style={{ fontSize: 13, color: '#a0967f', textTransform: 'capitalize' }}>{formatFecha(current.fecha)}</span>}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, background: color + '18', fontSize: 13, fontWeight: 600, color }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />{current.tipo}
            </span>
            {current.outstanding && <span style={{ color: '#bb6a47', fontSize: 16 }}>✦</span>}
          </div>

          {/* Título */}
          <h2 style={{ fontFamily: '"Newsreader",serif', fontSize: 30, fontWeight: 500, color: '#2c2620', margin: '0 0 20px', lineHeight: 1.2 }}>{current.titulo}</h2>

          {/* 3 cajas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            <div style={kpiBox}><p style={kpiLabel}>Cuándo</p><p style={kpiVal}>{current.fecha ? new Date(current.fecha + 'T12:00:00').toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }) : '—'}</p></div>
            <div style={kpiBox}><p style={kpiLabel}>Etapa</p><p style={kpiVal}>{edad?.etapa ?? '—'}</p></div>
            <div style={kpiBox}><p style={kpiLabel}>Importancia</p><p style={kpiVal}>{current.importancia != null ? `${current.importancia}/10` : '—'}</p></div>
          </div>

          {/* Hace cuánto */}
          {haceCuanto && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '14px 18px', borderRadius: 14, background: 'linear-gradient(120deg,#fbeee7,#f6e7dd)', border: '1px solid #f0d5c8' }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{esFuturo ? '⏳' : '🕰️'}</span>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9c5436', margin: '0 0 2px' }}>
                  {esFuturo ? (tieneFin ? 'Termina en' : 'Falta') : (tieneFin ? 'Terminó hace' : 'Hace')}
                </p>
                <p style={{ fontFamily: '"Newsreader",serif', fontSize: 22, fontWeight: 400, color: '#2c2620', margin: 0, lineHeight: 1.1 }}>{haceCuanto}</p>
              </div>
            </div>
          )}

          {/* Detalle temporal si hay fin */}
          {tieneFin && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
              <div style={detalleBox}><p style={kpiLabel}>Duración</p><p style={detalleVal}>{duracion}</p></div>
              {edad && <div style={detalleBox}><p style={kpiLabel}>Edad al inicio</p><p style={detalleVal}>{edad.años >= 0 ? `${edad.años} ${edad.años === 1 ? 'año' : 'años'}` : 'antes de nacer'}</p></div>}
              {current.fecha_fin && (() => {
                const ef = edadEnFecha(current.fecha_fin)
                return <div style={detalleBox}><p style={kpiLabel}>Edad al final</p><p style={detalleVal}>{ef.años >= 0 ? `${ef.años} ${ef.años === 1 ? 'año' : 'años'}` : 'antes de nacer'}</p></div>
              })()}
            </div>
          )}

          {/* Nota */}
          {notaHtml && (
            <div className="nota-rich" style={{ fontFamily: '"Newsreader",serif', fontSize: 18, color: '#2c2620', lineHeight: 1.7, margin: '0 0 20px' }}
              dangerouslySetInnerHTML={{ __html: notaHtml }} />
          )}

          {/* Personas */}
          {(current.personas?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {current.personas!.map(p => (
                <span key={p} style={{ padding: '5px 14px', borderRadius: 999, background: '#e7dcc7', fontSize: 13, color: '#6a6052', fontWeight: 500 }}>{p}</span>
              ))}
            </div>
          )}

          {/* Por esos días en el mundo */}
          {ctxCercano.length > 0 && (
            <div style={{ borderTop: '1px solid #e7dcc7', paddingTop: 20, marginTop: 4 }}>
              <p style={seccionLabel}>Por esos días en el mundo</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
                {ctxCercano.map(c => {
                  const cc = TIPO_COLORES[c.tipo] ?? '#9a8a6c'
                  return (
                    <div key={c.id} style={{ background: '#fbf8f1', borderRadius: 10, padding: '10px 12px', border: '1px solid #ece1cd' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: cc }}>{c.tipo}</span>
                        <span style={{ fontSize: 11, color: '#bcb098' }}>{c.fecha ? getAño(c.fecha) : ''}</span>
                      </div>
                      <p style={{ fontFamily: '"Newsreader",serif', fontSize: 13, fontWeight: 500, color: '#2c2620', margin: 0, lineHeight: 1.3 }}>{c.titulo}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Por esas fechas en tu vida */}
          {recuerdosCercanos.length > 0 && (
            <div style={{ borderTop: '1px solid #e7dcc7', paddingTop: 20, marginTop: 20 }}>
              <p style={seccionLabel}>Por esas fechas en tu vida</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
                {recuerdosCercanos.map(r => {
                  const rc = TIPO_COLORES[r.tipo] ?? '#9a8a6c'
                  return (
                    <button key={r.id} onClick={() => setCurrent(r)} style={{ textAlign: 'left', background: '#fffdf8', borderRadius: 10, padding: '10px 12px', border: '1px solid #ece1cd', cursor: 'pointer', transition: 'transform .12s, box-shadow .12s' }}
                      onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 10px 24px -16px rgba(83,62,38,.5)' }}
                      onMouseLeave={e => { const el = e.currentTarget; el.style.transform = ''; el.style.boxShadow = 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: rc }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: rc }} />{r.tipo}
                        </span>
                        <span style={{ fontSize: 11, color: '#bcb098' }}>{r.outstanding ? '✦ ' : ''}{r.fecha ? getAño(r.fecha) : ''}</span>
                      </div>
                      <p style={{ fontFamily: '"Newsreader",serif', fontSize: 13, fontWeight: 500, color: '#2c2620', margin: 0, lineHeight: 1.3 }}>{r.titulo}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Historia con cada persona */}
          {personaTimelines.length > 0 && (
            <div style={{ borderTop: '1px solid #e7dcc7', paddingTop: 20, marginTop: 20 }}>
              <p style={seccionLabel}>Historia con cada persona</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {personaTimelines.map(({ persona, eventos }) => {
                  const isOpen = openPersona === persona
                  return (
                    <div key={persona} style={{ border: '1px solid #ece1cd', borderRadius: 12, overflow: 'hidden', background: '#fbf8f1' }}>
                      <button onClick={() => setOpenPersona(isOpen ? null : persona)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#e7dcc7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#79705f', flexShrink: 0 }}>{persona[0]?.toUpperCase()}</span>
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#2c2620' }}>{persona}</span>
                        <span style={{ fontSize: 12, color: '#a0967f', fontWeight: 600 }}>{eventos.length} recuerdo{eventos.length !== 1 ? 's' : ''}</span>
                        <span style={{ fontSize: 14, color: '#bb6a47', transition: 'transform .2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>›</span>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid #ece1cd', padding: '8px 14px 12px' }}>
                          {eventos.map(ev => {
                            const ec = TIPO_COLORES[ev.tipo] ?? '#9a8a6c'
                            const isCurrent = ev.id === current.id
                            return (
                              <button key={ev.id} onClick={() => !isCurrent && setCurrent(ev)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', background: isCurrent ? '#fff3ef' : 'transparent', border: 'none', borderRadius: 8, cursor: isCurrent ? 'default' : 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = '#f5efe4' }}
                                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent' }}>
                                <span style={{ fontSize: 12, color: '#a0967f', fontWeight: 600, minWidth: 64, fontVariantNumeric: 'tabular-nums' }}>{ev.fecha ? new Date(ev.fecha + 'T12:00:00').toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }) : '—'}</span>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ec, flexShrink: 0 }} />
                                <span style={{ flex: 1, fontSize: 14, color: '#2c2620', fontWeight: isCurrent ? 700 : 500 }}>{ev.titulo}</span>
                                {ev.outstanding && <span style={{ fontSize: 12, color: '#bb6a47' }}>✦</span>}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer — navegación + ir a mi-vida */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 32px', borderTop: '1px solid #e7dcc7', position: 'sticky', bottom: 0, background: '#fffdf8' }}>
          <button onClick={() => prev && setCurrent(prev)} disabled={!prev} aria-label="Anterior"
            style={{ ...navFlat, opacity: prev ? 1 : .3 }}>← {prev ? prev.titulo.slice(0, 24) : ''}</button>
          <a href={`${VIDA_URL}?r=${current.id}`} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 999, flexShrink: 0,
            background: '#bb6a47', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none',
          }}>Ver en Mi Vida ↗</a>
          <button onClick={() => next && setCurrent(next)} disabled={!next} aria-label="Siguiente"
            style={{ ...navFlat, opacity: next ? 1 : .3, textAlign: 'right' }}>{next ? next.titulo.slice(0, 24) : ''} →</button>
        </div>
      </div>
    </div>
  )
}

const kpiBox: React.CSSProperties = { background: '#fbf8f1', borderRadius: 12, padding: '14px 16px', border: '1px solid #ece1cd' }
const kpiLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a0967f', margin: '0 0 4px' }
const kpiVal: React.CSSProperties = { fontFamily: '"Newsreader",serif', fontSize: 18, fontWeight: 400, color: '#2c2620', margin: 0 }
const detalleBox: React.CSSProperties = { background: '#fbf8f1', borderRadius: 12, padding: '12px 14px', border: '1px solid #ece1cd' }
const detalleVal: React.CSSProperties = { fontFamily: '"Newsreader",serif', fontSize: 16, fontWeight: 400, color: '#2c2620', margin: 0, lineHeight: 1.2 }
const seccionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#9c5436', margin: '0 0 14px' }
const navBtn: React.CSSProperties = { background: 'rgba(44,38,32,.4)', color: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const navFlat: React.CSSProperties = { background: 'none', border: 'none', color: '#79705f', fontSize: 13, cursor: 'pointer', fontWeight: 500, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }
