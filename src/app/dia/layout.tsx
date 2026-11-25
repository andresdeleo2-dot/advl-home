import type { Metadata } from 'next'
import { Instrument_Serif, Figtree } from 'next/font/google'

/* «Mi día» usa el mismo sistema de diseño que Tiempo (Margen): Instrument Serif + Figtree. */
const display = Instrument_Serif({ subsets: ['latin'], weight: ['400'], style: ['normal', 'italic'], variable: '--dia-serif', display: 'swap' })
const ui = Figtree({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--dia-ui', display: 'swap' })

export const metadata: Metadata = {
  title: 'Mi día · ADVL',
  description: 'Lo que hiciste ayer, tus 3 de hoy y lo que falta decidir',
}

export default function DiaLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${ui.variable}`}>{children}</div>
}
