'use client'

import { useEffect, useMemo, useState } from 'react'
import Confetti from './Confetti'
import { esAndres, esHoyCumple, edadQueCumple, waNumero, fiestaForzada, MI_CUMPLE, PALETA_FIESTA } from '@/lib/cumple'

/* Celebración de cumpleaños. Dos niveles, MUY distintos a propósito:
   · Andrés (su cumple) → un HERO a pantalla completa, dedicado y grande.
   · Persona excepcional → un banner con su nombre, edad y felicitar por WhatsApp.
   Se cierra solo temporalmente (al recargar vuelve). Vista previa con ?fiesta=1.
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

  if (!mounted || cerrado) return null
  if (!andresHoy && excepcionalesHoy.length === 0) return null

  const cerrar = () => setCerrado(true)

  return (
    <>
      <Confetti count={andresHoy ? 120 : 52} zIndex={9999} />
      {andresHoy && <AndresHero edad={edadQueCumple(MI_CUMPLE)} onClose={cerrar} />}
      {excepcionalesHoy.length > 0 && <ExcepcionalBanner items={excepcionalesHoy} onClose={andresHoy ? undefined : cerrar} />}
    </>
  )
}

/* ── HERO de Andrés: festejo a pantalla completa, centrado y grande ── */
function AndresHero({ edad, onClose }: { edad: number | null; onClose: () => void }) {
  return (
    <div className="fiesta-in" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9980, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'radial-gradient(circle at 50% 38%, rgba(120,84,18,.55), rgba(9,17,34,.86))', backdropFilter: 'blur(5px)' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 560, textAlign: 'center', borderRadius: 26, overflow: 'hidden',
          border: '1px solid rgba(231,197,107,.6)', boxShadow: '0 40px 110px -30px rgba(0,0,0,.85)',
          background: 'linear-gradient(135deg,#2A1E06,#5A3F0E,#8A5E12,#C2933A,#8A5E12,#5A3F0E,#2A1E06)', backgroundSize: '220% 100%', animation: 'fiestaShimmer 7s linear infinite',
          padding: '46px 30px 40px' }}>
        <button onClick={onClose} title="Cerrar" aria-label="Cerrar"
          style={{ position: 'absolute', top: 12, right: 14, height: 34, width: 34, borderRadius: 99, border: 'none', background: 'rgba(0,0,0,.3)', color: '#fff', fontSize: 17, cursor: 'pointer', lineHeight: 1, zIndex: 2 }}>✕</button>

        {/* emblema */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="ADVL" style={{ height: 52, width: 'auto', margin: '0 auto 6px', display: 'block', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.5))' }} />

        <div style={{ fontSize: 66, lineHeight: 1, marginTop: 6 }}><span className="fiesta-bob">🎂</span></div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, fontSize: 30, margin: '4px 0 6px' }}>
          <span className="fiesta-bob">🎉</span>
          <span className="fiesta-bob" style={{ animationDelay: '.15s' }}>🥳</span>
          <span className="fiesta-bob" style={{ animationDelay: '.3s' }}>🎈</span>
        </div>

        <div className="serif" style={{ fontStyle: 'italic', fontWeight: 700, fontSize: 'clamp(30px,6vw,50px)', lineHeight: 1.04, color: '#FFF7E6', textShadow: '0 2px 18px rgba(0,0,0,.55)' }}>
          ¡Feliz cumpleaños,<br />Andrés!
        </div>

        {edad != null && (
          <div style={{ marginTop: 16, fontSize: 17, fontWeight: 600, color: '#FCEFC9' }}>
            Hoy cumples <b style={{ fontSize: 36, display: 'inline-block', verticalAlign: '-8px', margin: '0 3px', color: '#FFF7E6' }}>{edad}</b> años
          </div>
        )}
        <p style={{ margin: '12px auto 0', maxWidth: 380, fontSize: 15, lineHeight: 1.5, color: '#F3E7C9' }}>
          Que este año traiga salud, aventuras y grandes logros. ✨ Hoy la app entera es tuya.
        </p>

        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: `linear-gradient(90deg, ${PALETA_FIESTA.join(',')})` }} />
      </div>
    </div>
  )
}

/* ── Banner de personas excepcionales que cumplen hoy ── */
function ExcepcionalBanner({ items, onClose }: { items: P[]; onClose?: () => void }) {
  return (
    <div className="fiesta-in" style={{ margin: '14px 14px 0', position: 'relative', zIndex: 30 }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden',
          border: '1px solid rgba(231,197,107,.5)', boxShadow: '0 22px 50px -22px rgba(8,18,36,.7)',
          background: 'linear-gradient(110deg,#10233F,#193965,#26507f,#193965,#10233F)', backgroundSize: '220% 100%', animation: 'fiestaShimmer 6s linear infinite',
          padding: '16px 18px' }}>
          {onClose && (
            <button onClick={onClose} title="Cerrar" aria-label="Cerrar"
              style={{ position: 'absolute', top: 10, right: 12, zIndex: 3, height: 30, width: 30, borderRadius: 99, border: 'none', background: 'rgba(0,0,0,.28)', color: '#fff', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          )}
          <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.22em', textTransform: 'uppercase', color: '#E7C56B', marginBottom: 10 }}>✦ Hoy cumple alguien especial</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(p => {
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
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10, background: '#25D366', color: '#06331a', fontSize: 12.5, fontWeight: 800, textDecoration: 'none' }}>💬 Felicitar</a>
                    )}
                    <a href={`${PERSONAS_URL}&persona=${p.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.28)', color: '#FFF7E6', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>Ver ficha →</a>
                  </div>
                </div>
              )
            })}
          </div>
          <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: `linear-gradient(90deg, ${PALETA_FIESTA.join(',')})` }} />
        </div>
      </div>
    </div>
  )
}
