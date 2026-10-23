// Primitivas de diseño de /peso — el lenguaje visual del Panel (navy + dorado, serif editorial,
// etiquetas en versalitas) para que todas las secciones se vean de la misma familia.
// SOLO LECTURA para los demás archivos: se importan, no se modifican.
// Sin 'use client' a propósito: page.tsx (servidor) lee COLOR y BTN para el aviso de lectura fallida, y los
// valores de un módulo de cliente no se pueden leer desde el servidor. Nada aquí usa hooks ni APIs del navegador.

import type { CSSProperties, ReactNode } from 'react'

export const COLOR = {
  navy: '#0F2340', navy2: '#16365F', navy3: '#173A63',
  gold: '#C2933A', goldLight: '#E7C56B',
  // Dorado para TEXTO sobre fondo claro: 5.35:1 en blanco y 4.87:1 en crema (el #A87A2C anterior
  // se quedaba en 3.8:1). goldDark es alias porque todos sus usos son texto; así se arregla de una vez.
  goldText: '#8A6420', goldDark: '#8A6420',
  // Texto secundario/terciario con contraste AA (antes 0.58 y 0.38 daban 4.0:1 y 2.3:1 en blanco):
  // muted = 5.9:1 en blanco y 5.6:1 en crema; faint = 4.8:1 y 4.7:1.
  ink: '#14233D', muted: 'rgba(20,35,61,0.70)', faint: 'rgba(20,35,61,0.64)',
  line: 'rgba(15,35,64,0.09)', lineStrong: 'rgba(15,35,64,0.16)',
  cream: '#F6F4EE', card2: '#FBFAF6',
  good: '#16a34a', warn: '#d97706', bad: '#dc2626', info: '#2D6CDF',
  // Sobre fondo navy: onDarkFaint estaba en .4 (3.1:1 sobre el navy claro del degradado); por debajo de .6 no llega a
  // 4.5:1 en navy3 (#173A63), así que queda igual a onDarkMuted (4.9:1 en navy3, 5.3:1 en #16305a). Para algo
  // puramente decorativo sobre navy usa una opacidad propia, no este token.
  onDark: '#F3EFE6', onDarkMuted: 'rgba(243,239,230,0.62)', onDarkFaint: 'rgba(243,239,230,0.62)',
  goodOnDark: '#86efac', warnOnDark: '#fcd34d', badOnDark: '#fca5a5',
} as const

export const DARK_BG = 'linear-gradient(158deg,#16305a 0%,#0f2242 62%,#0b1a35 120%)'
export const CARD_SHADOW = '0 20px 44px -34px rgba(15,35,64,0.5)'

/** Etiqueta en versalitas espaciadas (la voz de los encabezados del Panel). */
export function Eyebrow({ children, color = COLOR.goldText, className = '' }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={className} style={{ font: '800 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.13em', textTransform: 'uppercase', color }}>
      {children}
    </span>
  )
}

/** Tarjeta de sección: barra de acento arriba, eyebrow + título serif opcional, slot derecho.
 *  `dark` = navy como los paneles oscuros del Panel; `flush` = sin padding interno (tablas, iframes). */
export function Panel({
  eyebrow, title, subtitle, icon, accent = COLOR.gold, dark = false, right, children, flush = false, className = '', id, style,
}: {
  eyebrow?: string; title?: ReactNode; subtitle?: ReactNode; icon?: string; accent?: string; dark?: boolean
  right?: ReactNode; children?: ReactNode; flush?: boolean; className?: string; id?: string; style?: CSSProperties
}) {
  const hasHeader = !!(eyebrow || title || right)
  return (
    <section
      id={id}
      className={`rounded-2xl overflow-hidden animate-fade ${className}`}
      style={{
        background: dark ? DARK_BG : '#fff',
        border: dark ? '1px solid rgba(255,255,255,0.09)' : `1px solid ${COLOR.line}`,
        boxShadow: CARD_SHADOW,
        color: dark ? COLOR.onDark : COLOR.ink,
        ...style,
      }}
    >
      <div style={{ height: 3, background: accent }} />
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 flex-wrap px-5 sm:px-6 pt-4 pb-1">
          <div className="min-w-0">
            {eyebrow && (
              <div className="flex items-center gap-1.5">
                {icon && <span aria-hidden style={{ fontSize: 13 }}>{icon}</span>}
                <Eyebrow color={dark ? COLOR.onDarkMuted : COLOR.goldText}>{eyebrow}</Eyebrow>
              </div>
            )}
            {title && (
              <h2 className="serif mt-1" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600, color: dark ? COLOR.onDark : COLOR.navy }}>{title}</h2>
            )}
            {subtitle && <p className="mt-1" style={{ fontSize: 12.5, color: dark ? COLOR.onDarkMuted : COLOR.muted }}>{subtitle}</p>}
          </div>
          {right && <div className="shrink-0 flex items-center gap-2 flex-wrap">{right}</div>}
        </div>
      )}
      <div className={flush ? '' : 'px-5 sm:px-6 pb-5 pt-3'}>{children}</div>
    </section>
  )
}

/** Cápsula de estado/etiqueta. `color` es el color del texto; el fondo se deriva de él. */
export function Pill({ children, color = COLOR.info, solid = false, className = '' }: { children: ReactNode; color?: string; solid?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full ${className}`}
      style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', background: solid ? color : `${color}12`, color: solid ? '#fff' : color }}
    >
      {children}
    </span>
  )
}

/** Control segmentado (filtros, pestañas pequeñas). */
export function Segmented<T extends string | number>({
  value, onChange, options, ariaLabel, dark = false, className = '',
}: {
  value: T; onChange: (v: T) => void; ariaLabel: string; dark?: boolean; className?: string
  options: { value: T; label: ReactNode; count?: number }[]
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`inline-flex flex-wrap gap-1 rounded-xl p-1 ${className}`}
      style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,35,64,0.05)' }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={String(o.value)} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className="rounded-lg px-3 py-1.5 min-h-10 text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C2933A]"
            style={on
              ? { background: dark ? COLOR.goldLight : '#fff', color: dark ? '#1B1305' : COLOR.navy, boxShadow: '0 1px 3px rgba(15,35,64,0.18)' }
              : { background: 'transparent', color: dark ? COLOR.onDarkMuted : COLOR.muted }}>
            {o.label}
            {o.count != null && <span className="ml-1.5 opacity-60 tabular-nums">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Clases de botones (Tailwind). Primario = navy, dorado = acción destacada, fantasma = secundaria. */
export const BTN = {
  base: 'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
  primary: 'px-4 py-2.5 text-sm text-white bg-[var(--ink-900)] hover:bg-[var(--ink-950)]',
  gold: 'gold-fill px-4 py-2.5 text-sm',
  ghost: 'px-3.5 py-2 text-xs border border-[var(--line)] text-[var(--ink-700)] bg-white hover:border-[var(--gold-500)] hover:text-[var(--ink-950)]',
  danger: 'px-3.5 py-2 text-xs border border-red-200 text-red-700 bg-white hover:bg-red-50',
} as const

/** Clase para inputs/textarea/select. Con `max-sm:text-base` el campo mide 16 px en el teléfono: con
 *  menos, iOS (Safari y PWA instalada) hace zoom al enfocar y desacomoda la página. Va DESPUÉS de
 *  `text-sm` y Tailwind lo emite después, así que gana aunque quien consuma INPUT agregue `text-xs`
 *  (textareas monoespaciados). Se conserva la subcadena `px-3 py-2 text-sm` porque PesoFormulario
 *  la reemplaza con `.replace` para su variante de 44 px.
 *  El placeholder usa tinta al 64 % (4.8:1 sobre el fondo blanco del campo) en lugar de `var(--faint)` de globals.css
 *  (.34, ~2:1): globals.css lo comparten otras páginas, por eso el valor va aquí y no se cambia el token. */
export const INPUT = 'w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm max-sm:text-base text-[var(--text)] placeholder:text-[rgba(20,35,61,0.64)] focus:outline-none focus:border-[var(--gold-500)] focus:ring-2 focus:ring-[var(--gold-500)]/20'
