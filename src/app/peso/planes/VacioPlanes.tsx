'use client'

// Estado vacío de la biblioteca (uno por tipo): invita a subir el primer HTML o a pedírselo a Claude.

import type { PlanTipo } from '@/lib/peso-planes'
import { COLOR, DARK_BG } from '../ui'
import { FOCO, Icono, btn, tipoInfo } from './comun'

const TEXTOS: Record<PlanTipo, { titulo: string; cuerpo: string }> = {
  rutina: {
    titulo: 'Aún no tienes rutinas',
    cuerpo: 'Sube la rutina de ejercicio que te arme Claude: días, ejercicios, series, descansos y técnica, siempre a la mano para el gimnasio.',
  },
  dieta: {
    titulo: 'Aún no tienes dietas',
    cuerpo: 'Sube una dieta bien explicada: comidas, porciones, equivalencias y lista del súper, lista para consultarla en la cocina.',
  },
  otro: {
    titulo: 'Nada por aquí todavía',
    cuerpo: 'Guarda cualquier documento HTML que quieras tener a la mano: estiramientos, suplementos, guías, estudios.',
  },
}

const PASOS = [
  { t: 'Copia el prompt', d: 'Ya lleva tu peso, tu composición y tus metas.' },
  { t: 'Pégalo en Claude', d: 'Guarda el archivo HTML que te entrega.' },
  { t: 'Súbelo aquí', d: 'Se proyecta con buen diseño y queda guardado.' },
]

export default function VacioPlanes({ tipo, copiado, onSubir, onCopiarPrompt }: {
  tipo: PlanTipo
  copiado: boolean
  onSubir: () => void
  onCopiarPrompt: () => void
}) {
  const info = tipoInfo(tipo)
  const t = TEXTOS[tipo]
  return (
    <div className="relative overflow-hidden rounded-2xl px-5 py-8 sm:px-10 sm:py-11 text-center"
      style={{ background: DARK_BG, border: '1px solid rgba(255,255,255,.09)', color: COLOR.onDark }}>
      <div aria-hidden className="absolute left-1/2 -top-28 -translate-x-1/2 w-[560px] h-[280px] max-w-none rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(closest-side, rgba(231,197,107,.26), transparent)' }} />
      <div className="relative">
        <span aria-hidden className="mx-auto inline-flex items-center justify-center rounded-2xl"
          style={{ width: 68, height: 68, fontSize: 32, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(231,197,107,.45)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.7)' }}>
          {info.icon}
        </span>
        <h3 className="serif mt-4" style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 600 }}>{t.titulo}</h3>
        <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed" style={{ color: COLOR.onDarkMuted }}>{t.cuerpo}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <button type="button" data-foco-vacio onClick={onSubir} className={btn('gold')}><Icono n="subir" size={16} />Subir HTML</button>
          <button type="button" onClick={onCopiarPrompt}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl min-h-10 px-4 py-2.5 text-sm font-semibold transition-colors border hover:bg-white/10 ${FOCO}`}
            style={{ borderColor: 'rgba(255,255,255,.28)', color: COLOR.onDark }}>
            <Icono n={copiado ? 'check' : 'chispa'} size={16} />{copiado ? '¡Copiado!' : 'Copiar prompt para Claude'}
          </button>
        </div>

        <ol className="mx-auto mt-8 grid max-w-2xl gap-2.5 sm:grid-cols-3 text-left" aria-label="Cómo funciona">
          {PASOS.map((p, i) => (
            <li key={p.t} className="flex sm:flex-col items-start gap-3 sm:gap-2 rounded-xl p-3.5"
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>
              <span aria-hidden className="inline-flex items-center justify-center rounded-full shrink-0 tabular-nums"
                style={{ width: 24, height: 24, fontSize: 12, fontWeight: 800, background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305' }}>{i + 1}</span>
              <span>
                <span className="block text-[13px] font-bold">{p.t}</span>
                <span className="block mt-0.5 text-xs leading-snug" style={{ color: COLOR.onDarkMuted }}>{p.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
