'use client'

import { useEffect, useState } from 'react'

const QUOTES: { text: string; author: string }[] = [
  { text: 'La disciplina es el puente entre las metas y los logros.', author: 'Jim Rohn' },
  { text: 'No cuentes los días, haz que los días cuenten.', author: 'Muhammad Ali' },
  { text: 'El riesgo viene de no saber lo que estás haciendo.', author: 'Warren Buffett' },
  { text: 'Lo que se mide, se mejora.', author: 'Peter Drucker' },
  { text: 'El interés compuesto es la octava maravilla del mundo.', author: 'A. Einstein' },
  { text: 'Sé temeroso cuando otros son codiciosos.', author: 'Warren Buffett' },
  { text: 'La calidad no es un acto, es un hábito.', author: 'Aristóteles' },
  { text: 'El precio es lo que pagas, el valor es lo que recibes.', author: 'Warren Buffett' },
  { text: 'Hazlo simple, pero significativo.', author: 'Don Draper' },
  { text: 'La paciencia es amarga, pero su fruto es dulce.', author: 'Aristóteles' },
  { text: 'Un objetivo sin un plan es solo un deseo.', author: 'A. de Saint-Exupéry' },
  { text: 'El mejor momento para empezar fue ayer. El segundo mejor es hoy.', author: 'Proverbio' },
]

export default function QuoteWidget() {
  const [i, setI] = useState(0)

  useEffect(() => {
    setI(Math.floor(Math.random() * QUOTES.length))
  }, [])

  const q = QUOTES[i]
  const next = () => setI(prev => (prev + 1 + Math.floor(Math.random() * (QUOTES.length - 1))) % QUOTES.length)

  return (
    <div className="rounded-2xl glass p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35">Frase del día</p>
        <button onClick={next} className="rounded-lg bg-white/8 px-2 py-0.5 text-[10px] font-medium text-white/60 hover:bg-white/15">
          Nueva
        </button>
      </div>
      <p className="text-sm leading-relaxed text-white/85">“{q.text}”</p>
      <p className="mt-1.5 text-[11px] text-white/40">— {q.author}</p>
    </div>
  )
}
