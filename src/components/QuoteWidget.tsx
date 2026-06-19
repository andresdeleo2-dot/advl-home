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
  { text: 'La estrategia sin criterio es ruido; el criterio sin estrategia, indecisión.', author: 'Principio ADVL' },
]

export default function QuoteWidget() {
  const [i, setI] = useState(0)
  useEffect(() => { setI(Math.floor(Math.random() * QUOTES.length)) }, [])
  const q = QUOTES[i]
  const next = () => setI(prev => (prev + 1 + Math.floor(Math.random() * (QUOTES.length - 1))) % QUOTES.length)

  return (
    <div className="rounded-2xl glass p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="eyebrow">Frase del día</p>
        <button onClick={next}
          className="rounded-full border border-[rgba(194,147,58,0.4)] bg-[rgba(194,147,58,0.08)] px-2.5 py-1 text-[10px] font-semibold text-[#A87A2C] hover:bg-[rgba(194,147,58,0.16)]">
          Nueva
        </button>
      </div>
      <p className="serif mt-2 font-medium italic leading-snug text-[#16365F]" style={{ fontSize: 19, lineHeight: 1.32 }}>
        &ldquo;{q.text}&rdquo;
      </p>
      <p className="mt-2.5 text-[10px] font-semibold tracking-[.06em] text-[rgba(15,35,64,0.5)]">— {q.author}</p>
    </div>
  )
}
