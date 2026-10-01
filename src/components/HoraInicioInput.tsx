'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { clock, parse, type ResultadoInicio } from '@/lib/tiempo'

/** Campo "empezó" de la sesión en curso. No guarda en cada tecla: escribir "11:30" pasa por "01:00" y
 *  "11:00", y una hora futura a medio teclear se rechazaba y el campo regresaba solo al valor anterior.
 *  Guarda al salir del campo, con Enter o tras 2 s sin teclear; vacío no cuenta; si la app está
 *  releyendo tu estado ('espera'), reintenta en lugar de perder el cambio. */
export default function HoraInicioInput({ value, onCommit, style, title }: {
  value: number
  onCommit: (min: number) => ResultadoInicio
  style?: CSSProperties
  title?: string
}) {
  const [draft, setDraft] = useState(clock(value))
  const [error, setError] = useState<string | null>(null)
  const editando = useRef(false)
  const sucio = useRef(false)      // sólo se guarda lo que tecleaste en esta edición, nunca un borrador viejo
  const cancelado = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentos = useRef(0)
  const valueRef = useRef(value)
  valueRef.current = value
  const onCommitRef = useRef(onCommit)   // un reintento debe ver la sesión vigente, no la de cuando tecleaste
  onCommitRef.current = onCommit

  useEffect(() => { if (!editando.current) setDraft(clock(value)) }, [value])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const soltar = () => { editando.current = false; sucio.current = false; setDraft(clock(valueRef.current)) }
  const commit = (v: string, final: boolean) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!sucio.current) { if (final) soltar(); return }
    if (!/^\d{1,2}:\d{2}/.test(v)) { if (final) { setError(null); soltar() } return }
    const m = parse(v)
    if (m === valueRef.current) { setError(null); if (final) soltar(); return }
    const r = onCommitRef.current(m)
    if (r === 'ok') { intentos.current = 0; setError(null); if (final) { editando.current = false; sucio.current = false } return }
    if (r === 'espera' && intentos.current < 6) { intentos.current++; timer.current = setTimeout(() => commit(v, final), 1200); return }
    intentos.current = 0
    if (r === 'futuro') {
      setError('Esa hora todavía no llega')
      if (final) { soltar(); timer.current = setTimeout(() => setError(null), 2500) }
      return
    }
    if (final) soltar()
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <input type="time" value={draft} title={error || title} aria-invalid={!!error} aria-label="Hora en que empezaste"
        onFocus={() => { editando.current = true; cancelado.current = false }}
        onChange={e => {
          editando.current = true; sucio.current = true; intentos.current = 0
          const v = e.target.value
          setDraft(v); setError(null)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => commit(v, false), 2000)
        }}
        onBlur={e => { if (cancelado.current) { cancelado.current = false; return } commit(e.target.value, true) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
          else if (e.key === 'Escape') {
            e.stopPropagation()
            if (timer.current) { clearTimeout(timer.current); timer.current = null }
            cancelado.current = true; setError(null); soltar(); e.currentTarget.blur()
          }
        }}
        style={{ ...style, ...(error ? { borderColor: '#E0715A' } : {}) }} />
      {error && <span role="status" style={{ fontSize: 11, lineHeight: 1.3, color: '#E0715A', marginTop: 3 }}>{error}</span>}
    </span>
  )
}
