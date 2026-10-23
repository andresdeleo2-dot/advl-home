'use client'

// Piezas compartidas de la biblioteca de rutinas y dietas: iconos, colores por tipo, clases de botón,
// la insignia "En uso" y las animaciones (respetando prefers-reduced-motion).

import type { ReactNode } from 'react'
import { PLAN_TIPOS, type PlanTipo } from '@/lib/peso-planes'
import { BTN } from '../ui'

/** Petición en curso (a lo más una a la vez): qué acción y sobre qué documento. */
export type Ocupado = { accion: 'uso' | 'editar' | 'borrar' | 'revisar'; id: string | null }

/** Color de cada tipo. El dorado queda reservado para "En uso" y las acciones principales; el azul
 *  (#2D6CDF) es de la gráfica del peso, no de la interfaz. Sirve tanto de acento (barra, borde) como de
 *  texto (Pill, Eyebrow), así que los tres cumplen AA como texto: sobre el tinte de su propia Pill dan
 *  9.97:1 (rutina), 4.75:1 (dieta, #2F7373; el #3E8E8E anterior daba 3.41:1) y 4.68:1 (otro). */
export const TIPO_COLOR: Record<PlanTipo, string> = { rutina: '#16365F', dieta: '#2F7373', otro: '#5B6B86' }

export function tipoInfo(t: PlanTipo) {
  return PLAN_TIPOS.find(x => x.value === t) ?? PLAN_TIPOS[2]
}

/** Anillo de foco visible para teclado (el reset de Tailwind quita el del navegador en algunos elementos). */
export const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-500)]'

/** Botón de las primitivas de ui.tsx con objetivo táctil ≥ 40 px. */
export const btn = (k: keyof Omit<typeof BTN, 'base'>) => `${BTN.base} ${BTN[k]} min-h-10 ${FOCO}`

/** Botón cuadrado de solo icono en móvil, con etiqueta visible desde `sm`. */
export const BTN_ICONO = 'w-10 px-0! sm:w-auto sm:px-3.5!'

// ── Iconos (trazo, 24×24) ──────────────────────────────────────────────────

const PATHS = {
  proyectar: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><path d="M10.5 7.6v4.8l4-2.4z" fill="currentColor" stroke="none" /></>,
  externo: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  descargar: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />,
  editar: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  basura: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  subir: <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" />,
  mas: <path d="M12 5v14M5 12h14" />,
  copiar: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  estrella: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" />,
  archivo: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  izq: <path d="M15 5l-7 7 7 7" />,
  der: <path d="M9 5l7 7-7 7" />,
  alerta: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  chispa: <><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></>,
  base: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  ojo: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  reintentar: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4.5V9h-4.5" /></>,
} satisfies Record<string, ReactNode>

export type IconoNombre = keyof typeof PATHS

export function Icono({ n, size = 16, relleno = false, className = '' }: { n: IconoNombre; size?: number; relleno?: boolean; className?: string }) {
  return (
    <svg aria-hidden focusable="false" width={size} height={size} viewBox="0 0 24 24" fill={relleno ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {PATHS[n]}
    </svg>
  )
}

/** Anillo que gira mientras hay una petición en curso (sin giro con movimiento reducido: siempre va junto a texto). */
export function Spinner({ size = 14 }: { size?: number }) {
  return <span aria-hidden className="inline-block rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin shrink-0" style={{ width: size, height: size }} />
}

/** Insignia dorada "En uso". */
export function EnUsoBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full whitespace-nowrap ${className}`}
      style={{ background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305', fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', padding: '3px 9px 3px 7px' }}>
      <Icono n="estrella" size={11} relleno />En uso
    </span>
  )
}

/** Cuadro con el emoji del tipo (la "portada" de una tarjeta o de una fila). */
export function SelloTipo({ tipo, size = 40 }: { tipo: PlanTipo; size?: number }) {
  const c = TIPO_COLOR[tipo]
  return (
    <span aria-hidden className="inline-flex items-center justify-center shrink-0 rounded-xl"
      style={{ width: size, height: size, background: `${c}14`, border: `1px solid ${c}26`, fontSize: size * 0.46 }}>
      {tipoInfo(tipo).icon}
    </span>
  )
}

/** Animaciones de entrada solo si la persona no pidió movimiento reducido (globals.css no cubre .animate-fade). */
export function Estilos() {
  return (
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        .pp-in { animation: fadeIn .22s ease both; }
        .pp-rise { animation: ppRise .28s cubic-bezier(.2,.8,.2,1) both; }
      }
      @media (prefers-reduced-motion: reduce) {
        .pp-root .animate-fade { animation: none; }
      }
      @keyframes ppRise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
      .pp-rail { scrollbar-width: thin; scrollbar-color: rgba(15,35,64,.2) transparent; }
    `}</style>
  )
}

