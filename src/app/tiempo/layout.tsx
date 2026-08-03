import type { Metadata } from 'next'
import { Instrument_Serif, Figtree } from 'next/font/google'

/* Fuentes propias de la sección Tiempo (sistema de diseño "Margen"). Se cargan
   con next/font y se exponen como variables CSS sobre un contenedor propio. */
const display = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--tiempo-serif',
  display: 'swap',
})
const ui = Figtree({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--tiempo-ui',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tiempo · ADVL',
  description: 'Acomoda tu día y tu semana con margen',
}

export default function TiempoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${ui.variable}`}>{children}</div>
}
