'use client'

import { useEffect, useMemo, useState } from 'react'
import Confetti from './Confetti'
import { esAndres, esHoyCumple, edadQueCumple, waNumero, fiestaForzada, MI_CUMPLE, PALETA_FIESTA } from '@/lib/cumple'

/* Celebración de la portada. Si hoy es el cumpleaños de Andrés → banner grande
   con confeti. Si hoy cumple alguna Persona excepcional → banner con su nombre,
   edad y botón para felicitar. Se puede cerrar (guarda el cierre por día) y se
   puede previsualizar con ?fiesta=1 sin esperar la fecha.
   Lee /api/cumples (personas de mi-vida, base compartida). */

const PERSONAS_URL = 'https://mi-vida-neon.vercel.app/vida?vista=personas'

type P = { id: string; nombre: string; apodo: string | null; cumple: string; excepcional?: boolean; foto?: string | null; celular?: string | null }

export default function BirthdayCelebration() {
  const [personas, setPersonas] = useState<P[]>([])
  const [mounted, setMounted] = useState(false)
  const [cerrado, setCerrado] = useState(false)
  const force = typeof window !== 'undefined' ? fiestaForzada() : null

  // Solo cliente (evita desajustes de hidratación con el confeti aleatorio) y,
  // como no guarda nada, en CADA recarga la fiesta vuelve completa.
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let alive = true
    fetch('/api/cumples').then(r => r.json()).then(j => { if (alive && j?.ok) setPersonas(j.personas || []) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const andresHoy = force === 'andres' || (force !== 'off' && esHoyCumple(MI_CUMPLE))
  const excepcionalesHoy = useMemo(
    () => (force === 'off' ? [] : personas.filter(p => !esAndres(p.nombre) && p.excepcional && esHoyCumple(p.cumple))),
    [personas, force]
  )

  // El cierre (✕) es solo temporal: NO se guarda, así que al recargar la fiesta
  // reaparece completa. Dura todo el día del cumpleaños pase lo que pase.
  if (!mounted || cerrado) return null
  if (!andresHoy && excepcionalesHoy.length === 0) return null

  const cerrar = () => setCerrado(true)
  const edadAndres = edadQueCumple(MI_CUMPLE)

  return (
    <>
      <Confetti count={andresHoy ? 90 : 50} />
      <div className="fiesta-in" style={{ margin: '14px 14px 0', position: 'relative', zIndex: 30 }}>
        <div style={{ maxWidth: 1500, margin: '0 auto' }}>
          <div style={{
            position: 'relative', borderRadius: 18, overflow: 'hidden',
            border: '1px solid rgba(231,197,107,.5)', boxShadow: '0 22px 50px -22px rgba(120,80,10,.6)',
            background: andresHoy
              ? 'linear-gradient(110deg,#2A1E06,#5A3F0E,#8A5E12,#C2933A,#8A5E12,#5A3F0E,#2A1E06)'
              : 'linear-gradient(110deg,#10233F,#193965,#26507f,#193965,#10233F)',
            backgroundSize: '220% 100%', animation: 'fiestaShimmer 6s linear infinite',
            padding: andresHoy ? '22px 22px 20px' : '16px 18px',
          }}>
            {/* globos flotando de fondo */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: .5 }}>
              {['🎈', '🎉', '✨', '🎊', '🎂'].map((e, i) => (
                <span key={i} style={{ position: 'absolute', left: `${8 + i * 20}%`, top: '50%', fontSize: 26, animation: `fiestaBob ${1.8 + i * 0.3}s ease-in-out ${i * 0.2}s infinite` }}>{e}</span>
              ))}
            </div>

            <button onClick={cerrar} title="Cerrar" aria-label="Cerrar felicitación"
              style={{ position: 'absolute', top: 10, right: 12, zIndex: 3, height: 30, width: 30, borderRadius: 99, border: 'none', background: 'rgba(0,0,0,.28)', color: '#fff', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>✕</button>

            {/* ── Andrés ── */}
            {andresHoy && (
              <div style={{ position: 'relative', textAlign: 'center', padding: '6px 0 2px' }}>
                <div style={{ fontSize: 34, letterSpacing: 6, marginBottom: 2 }}>
                  <span className="fiesta-bob">🎂</span> <span className="fiesta-bob" style={{ animationDelay: '.2s' }}>🎉</span> <span className="fiesta-bob" style={{ animationDelay: '.4s' }}>🥳</span>
                </div>
                <div className="serif" style={{ fontStyle: 'italic', fontWeight: 700, fontSize: 'clamp(26px,5vw,42px)', lineHeight: 1.05, color: '#FFF7E6', textShadow: '0 2px 14px rgba(0,0,0,.4)' }}>
                  ¡Feliz cumpleaños, Andrés!
                </div>
                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600, color: '#FCEFC9' }}>
                  {edadAndres != null ? <>Hoy cumples <b style={{ fontSize: 20 }}>{edadAndres}</b> años · que sea un año extraordinario ✨</> : 'Que sea un año extraordinario ✨'}
                </div>
              </div>
            )}

            {/* ── Personas excepcionales ── */}
            {excepcionalesHoy.length > 0 && (
              <div style={{ position: 'relative', marginTop: andresHoy ? 16 : 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {!andresHoy && (
                  <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.22em', textTransform: 'uppercase', color: '#E7C56B', marginBottom: 2 }}>
                    ✦ Hoy cumple alguien especial
                  </div>
                )}
                {excepcionalesHoy.map(p => {
                  const nombre = p.apodo?.trim() || p.nombre
                  const edad = edadQueCumple(p.cumple)
                  const inicial = (p.nombre || '?').trim().charAt(0).toUpperCase()
                  const wa = waNumero(p.celular)
                  const texto = encodeURIComponent(`¡Feliz cumpleaños, ${nombre}! 🎉🎂 Que tengas un día increíble.`)
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(231,197,107,.35)', borderRadius: 13, padding: '10px 12px' }}>
                      <div className="fiesta-glow" style={{ flex: 'none', height: 44, width: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#231703', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 19 }}>{inicial}</div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#FFF7E6' }}><span className="fiesta-bob">🎂</span> ¡Hoy cumple {nombre}!</div>
                        <div style={{ fontSize: 12.5, color: '#F3E7C9', opacity: .9 }}>{edad != null ? `Cumple ${edad} años` : 'Es su cumpleaños'} · no olvides felicitarlo</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {wa && (
                          <a href={`https://wa.me/${wa}?text=${texto}`} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10, background: '#25D366', color: '#06331a', fontSize: 12.5, fontWeight: 800, textDecoration: 'none' }}>
                            💬 Felicitar
                          </a>
                        )}
                        <a href={`${PERSONAS_URL}&persona=${p.id}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.28)', color: '#FFF7E6', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                          Ver ficha →
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* filo dorado inferior */}
            <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: `linear-gradient(90deg, ${PALETA_FIESTA.join(',')})` }} />
          </div>
        </div>
      </div>
    </>
  )
}
