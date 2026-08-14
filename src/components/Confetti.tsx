'use client'

import { useMemo } from 'react'
import { PALETA_FIESTA } from '@/lib/cumple'

/* Lluvia de confeti: overlay fijo a toda la pantalla que NO bloquea clics.
   Cada pieza cae (confFall) mientras gira y se mece (confSpin) con valores al
   azar, así ninguna va igual que otra. Respeta prefers-reduced-motion (menos
   piezas y sin giro brusco). CSS puro: cero dependencias. */
export default function Confetti({ count = 44, zIndex = 55 }: { count?: number; zIndex?: number }) {
  const piezas = useMemo(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const n = reduce ? Math.min(16, count) : count
    return Array.from({ length: n }, (_, i) => ({
      i,
      color: PALETA_FIESTA[i % PALETA_FIESTA.length],
      left: Math.random() * 100,
      size: 6 + Math.random() * 8,
      dur: 3.6 + Math.random() * 3.4,
      delay: -Math.random() * 6,
      sway: 10 + Math.random() * 34,
      circle: Math.random() < 0.32,
    }))
  }, [count])

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex }}>
      {piezas.map(p => (
        <span key={p.i} style={{
          position: 'absolute', top: '-12vh', left: `${p.left}%`, willChange: 'transform',
          animation: `confFall ${p.dur}s linear ${p.delay}s infinite`,
        }}>
          <span style={{
            display: 'block', width: p.size, height: p.circle ? p.size : p.size * 0.55,
            background: p.color, borderRadius: p.circle ? '50%' : 2,
            boxShadow: '0 1px 2px rgba(11,26,51,.18)',
            animation: `confSpin ${(p.dur * 0.55).toFixed(2)}s ease-in-out ${p.delay}s infinite`,
            ['--sway' as string]: `${p.sway}px`,
          } as React.CSSProperties} />
        </span>
      ))}
    </div>
  )
}
