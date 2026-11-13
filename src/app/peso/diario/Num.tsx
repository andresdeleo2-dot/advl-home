'use client'

import { useEffect, useState } from 'react'
import { INPUT } from '../ui'

/** Número que se puede teclear con calma (mientras escribes puede estar vacío o a medias) y que se acomoda al salir del campo. */
export default function Num({ valor, onValor, min = 0, max = 99999, paso = 1, etiqueta, className = '' }: {
  valor: number; onValor: (n: number) => void; min?: number; max?: number; paso?: number; etiqueta: string; className?: string
}) {
  const [txt, setTxt] = useState(String(valor))
  useEffect(() => { setTxt(prev => (Number(prev) === valor ? prev : String(valor))) }, [valor])
  return (
    <input
      type="number" inputMode="decimal" min={min} max={max} step={paso} value={txt} aria-label={etiqueta}
      onChange={e => { setTxt(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n)) onValor(Math.min(max, Math.max(min, n))) }}
      onBlur={() => setTxt(String(valor))}
      className={`${INPUT} min-h-11 tabular-nums ${className}`}
    />
  )
}
