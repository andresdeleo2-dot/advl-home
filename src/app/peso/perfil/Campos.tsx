'use client'

import { useId } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { COLOR, INPUT } from '../ui'

// Campos del formulario de «Mi perfil»: cada uno trae su etiqueta asociada (htmlFor/id), su pista y su mensaje de
// error enlazados con aria-describedby, objetivos táctiles de 44 px y texto de 16 px (iOS no hace zoom al enfocar).

/** Input/select/textarea de 44 px de alto y 16 px de letra, igual que el formulario de mediciones. */
// El foco accesible (goldText #8A6420, 5.35:1 en blanco, anillo al 40 %) ya viene en el token INPUT de ui.tsx: aquí solo
// se ajusta el tamaño al de 44 px.
const CAMPO = INPUT.replace('px-3 py-2 text-sm', 'px-3 py-2.5 text-base min-h-[44px]')
const ROJO = '#b91c1c'
const AMBAR = '#92400e'   // 7:1 sobre blanco; el COLOR.warn de la marca no llega a AA como texto

function Etiqueta({ htmlFor, children, opcional }: { htmlFor: string; children: ReactNode; opcional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-baseline gap-2 text-xs font-bold" style={{ color: COLOR.ink, letterSpacing: '.01em' }}>
      {children}
      {opcional && <span style={{ fontWeight: 500, color: COLOR.muted }}>(opcional)</span>}
    </label>
  )
}

function Pista({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} className="mt-1 leading-snug" style={{ fontSize: 12, color: COLOR.muted }}>{children}</p>
}

function MensajeError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 leading-snug" style={{ fontSize: 12, fontWeight: 600, color: ROJO }}>
      <span aria-hidden>⛔ </span>{children}
    </p>
  )
}

type Base = { id: string; label: string; ayuda?: string; error?: string; opcional?: boolean }
const describe = (id: string, ayuda?: string, error?: string) => [error && `${id}-error`, ayuda && `${id}-ayuda`].filter(Boolean).join(' ') || undefined

/** Número o fecha en un <input>. Con `type="number"` el teclado del teléfono es el numérico. */
export function CampoEntrada({ id, label, ayuda, error, opcional, requerido, type, value, onChange, onBlur, unidad, min, max, step, placeholder }: Base & {
  type: 'number' | 'date'
  /** Dato obligatorio: se anuncia como requerido (el formulario va con noValidate, así que el aviso visual lo da nuestro mensaje). */
  requerido?: boolean
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  unidad?: string
  min?: number; max?: number; step?: string
  placeholder?: string
}) {
  return (
    <div className="min-w-0">
      <Etiqueta htmlFor={id} opcional={opcional}>{label}</Etiqueta>
      <div className="relative">
        <input
          id={id} type={type} value={value} placeholder={placeholder} required={requerido}
          inputMode={type === 'number' ? 'decimal' : undefined}
          min={min} max={max} step={step}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} onBlur={onBlur}
          aria-invalid={error ? true : undefined} aria-describedby={describe(id, ayuda, error)}
          className={`${CAMPO} ${unidad ? 'pr-12' : ''} tabular-nums`}
          style={error ? { borderColor: ROJO } : undefined}
        />
        {unidad && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center" style={{ fontSize: 13, color: COLOR.muted }}>{unidad}</span>}
      </div>
      {error && <MensajeError id={`${id}-error`}>{error}</MensajeError>}
      {ayuda && <Pista id={`${id}-ayuda`}>{ayuda}</Pista>}
    </div>
  )
}

/** Lista desplegable para un dato opcional: la primera opción es «Sin especificar» (valor vacío). */
export function CampoLista({ id, label, ayuda, error, opcional = true, value, onChange, onBlur, opciones, vacio = 'Sin especificar' }: Base & {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  opciones: { value: string; label: string }[]
  vacio?: string
}) {
  return (
    <div className="min-w-0">
      <Etiqueta htmlFor={id} opcional={opcional}>{label}</Etiqueta>
      <select
        id={id} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur}
        aria-invalid={error ? true : undefined} aria-describedby={describe(id, ayuda, error)}
        className={CAMPO} style={error ? { borderColor: ROJO } : undefined}
      >
        <option value="">{vacio}</option>
        {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <MensajeError id={`${id}-error`}>{error}</MensajeError>}
      {ayuda && <Pista id={`${id}-ayuda`}>{ayuda}</Pista>}
    </div>
  )
}

/** Texto libre con contador de caracteres. El tope lo pone también el navegador (maxLength): pegar de más se corta. */
export function CampoTexto({ id, label, ayuda, error, value, onChange, onBlur, max, placeholder, filas = 3 }: Base & {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  max: number
  placeholder?: string
  filas?: number
}) {
  const n = value.length
  const cerca = n >= max * 0.9
  return (
    <div className="min-w-0">
      <Etiqueta htmlFor={id} opcional>{label}</Etiqueta>
      <textarea
        id={id} value={value} rows={filas} maxLength={max} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} onBlur={onBlur}
        aria-invalid={error ? true : undefined} aria-describedby={[describe(id, ayuda, error), `${id}-cuenta`].filter(Boolean).join(' ')}
        className={`${CAMPO} resize-y leading-snug`} style={error ? { borderColor: ROJO } : undefined}
      />
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {error && <MensajeError id={`${id}-error`}>{error}</MensajeError>}
          {ayuda && <Pista id={`${id}-ayuda`}>{ayuda}</Pista>}
        </div>
        {/* Sin aria-live a propósito: anunciar cada letra estorba; el tope lo impide el propio campo. */}
        <span id={`${id}-cuenta`} className="shrink-0 tabular-nums" style={{ fontSize: 12, fontWeight: cerca ? 700 : 500, color: n >= max ? ROJO : cerca ? AMBAR : COLOR.muted }}>
          {n}/{max}<span className="sr-only"> caracteres</span>
        </span>
      </div>
    </div>
  )
}

export type OpcionGrupo<T extends string> = { value: T; label: string; detalle?: string }

/** Grupo de opciones (radios nativos con aspecto de tarjeta o de ficha). Teclado: flechas entre opciones, como
 *  cualquier grupo de radios. El primer radio lleva `id` para poder enfocarlo cuando el grupo tiene un error. */
export function GrupoOpciones<T extends string>({ id, label, ayuda, error, value, onChange, opciones, columnas = 'grid-cols-1', variante = 'tarjeta' }: Omit<Base, 'opcional'> & {
  value: string
  onChange: (v: T) => void
  opciones: OpcionGrupo<T>[]
  columnas?: string
  variante?: 'tarjeta' | 'ficha'
}) {
  const name = useId()
  const ficha = variante === 'ficha'
  return (
    <fieldset className="min-w-0" aria-describedby={describe(id, ayuda, error)}>
      <legend className="mb-1.5 text-xs font-bold" style={{ color: COLOR.ink, letterSpacing: '.01em' }}>{label}</legend>
      <div className={`grid gap-2 ${columnas}`}>
        {opciones.map((o, i) => {
          const on = o.value === value
          return (
            <label
              key={o.value}
              className={`relative flex cursor-pointer items-center rounded-xl border transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#8A6420] ${ficha ? 'justify-center px-2 min-h-[44px]' : 'gap-3 px-3.5 py-2.5 min-h-[48px]'}`}
              style={{
                // La opción elegida usa goldText (5.35:1) y no gold (2.5:1 sobre el tinte): el estado no debe depender solo de la negrita.
                borderColor: error && !value ? ROJO : on ? COLOR.goldText : COLOR.lineStrong,
                background: on ? 'rgba(194,147,58,0.11)' : '#fff',
                boxShadow: on ? `inset 0 0 0 1px ${COLOR.goldText}` : undefined,
              }}
            >
              <input
                id={i === 0 ? id : undefined} type="radio" name={name} value={o.value} checked={on}
                onChange={() => onChange(o.value)} className="sr-only"
              />
              {!ficha && (
                <span
                  aria-hidden className="grid shrink-0 place-items-center rounded-full"
                  style={{ width: 18, height: 18, border: `2px solid ${on ? COLOR.goldText : COLOR.lineStrong}`, background: '#fff' }}
                >
                  {on && <span className="rounded-full" style={{ width: 8, height: 8, background: COLOR.goldText }} />}
                </span>
              )}
              <span className="min-w-0">
                <span className={ficha ? 'tabular-nums' : ''} style={{ display: 'block', fontSize: ficha ? 15 : 14, fontWeight: on ? 700 : 600, color: COLOR.navy }}>{o.label}</span>
                {o.detalle && <span className="mt-0.5 block leading-snug" style={{ fontSize: 12, color: COLOR.muted }}>{o.detalle}</span>}
              </span>
            </label>
          )
        })}
      </div>
      {error && <MensajeError id={`${id}-error`}>{error}</MensajeError>}
      {ayuda && <Pista id={`${id}-ayuda`}>{ayuda}</Pista>}
    </fieldset>
  )
}
