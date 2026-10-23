'use client'

// Tarjeta de configuración cuando la tabla peso_planes aún no existe en Supabase.

import type { ReactNode } from 'react'
import { COLOR, Panel } from '../ui'
import { Icono, Spinner, btn } from './comun'

export const ARCHIVO_SQL = 'sql/peso-03-planes.sql'

function Paso({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 inline-flex items-center justify-center rounded-full shrink-0 tabular-nums"
        style={{ width: 24, height: 24, fontSize: 12, fontWeight: 800, background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305' }}>{n}</span>
      <div className="min-w-0 text-sm leading-relaxed" style={{ color: COLOR.ink }}>{children}</div>
    </li>
  )
}

export default function SinTabla({ revisando, copiado, onCopiar, onReintentar }: {
  revisando: boolean
  copiado: boolean
  onCopiar: () => void
  onReintentar: () => void
}) {
  return (
    <Panel
      eyebrow="Falta un paso"
      icon="🛠️"
      accent={COLOR.warn}
      title="Falta crear la tabla"
      subtitle="Para guardar tus rutinas y dietas, la base de datos necesita una tabla nueva. Se hace una sola vez."
      right={
        <button type="button" disabled title="Se activa cuando exista la tabla" className={btn('gold')}>
          <Icono n="subir" size={16} />Subir HTML
        </button>
      }
    >
      <ol className="space-y-3.5">
        <Paso n={1}>Abre el <strong>SQL Editor</strong> de tu proyecto en Supabase.</Paso>
        <Paso n={2}>
          <span>Copia el contenido del archivo </span>
          <code className="rounded-md px-1.5 py-0.5 font-mono text-[12.5px] break-all" style={{ background: 'rgba(15,35,64,.06)', color: COLOR.navy }}>{ARCHIVO_SQL}</code>
          <span> (está en el repositorio de advl-home), pégalo en el editor y toca <strong>Run</strong>.</span>
          <div className="mt-2">
            <button type="button" onClick={onCopiar} className={btn('ghost')}>
              <Icono n={copiado ? 'check' : 'copiar'} size={14} />{copiado ? '¡Copiado!' : 'Copiar nombre del archivo'}
            </button>
          </div>
        </Paso>
        <Paso n={3}>Regresa aquí y toca el botón de abajo para que la página lo vuelva a revisar.</Paso>
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onReintentar} disabled={revisando} className={btn('gold')}>
          {revisando ? <><Spinner />Revisando…</> : <><Icono n="base" size={16} />Ya la creé, revisar de nuevo</>}
        </button>
        <p className="text-xs" style={{ color: COLOR.muted }}>El resto de /peso funciona normal mientras tanto.</p>
      </div>
    </Panel>
  )
}
