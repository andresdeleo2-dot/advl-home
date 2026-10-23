'use client'

// Tarjeta de un documento en la biblioteca (una "portada" por rutina o dieta).

import { planHtmlUrl, type PesoPlanMeta } from '@/lib/peso-planes'
import { CARD_SHADOW, COLOR, Pill } from '../ui'
import { EnUsoBadge, FOCO, Icono, Spinner, TIPO_COLOR, tipoInfo } from './comun'
import { fechaRelativa, fmtBytes } from './util'

const ACCION = `inline-flex items-center justify-center w-10 h-10 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${FOCO}`
const ACCION_ESTILO = { borderColor: COLOR.line, color: COLOR.navy2, background: '#fff' } as const

export default function TarjetaPlan({ plan, seleccionado, hoy, bloqueado, marcando, onSeleccionar, onProyectar, onMarcarEnUso }: {
  plan: PesoPlanMeta
  seleccionado: boolean
  hoy: string | null
  bloqueado: boolean          // hay una petición en curso: las acciones se deshabilitan
  marcando: boolean           // la petición en curso es "marcar en uso" de ESTA tarjeta
  onSeleccionar: () => void
  onProyectar: () => void
  onMarcarEnUso: () => void
}) {
  const c = TIPO_COLOR[plan.tipo]
  const info = tipoInfo(plan.tipo)

  return (
    <article
      className="flex flex-col w-full rounded-2xl overflow-hidden transition-shadow"
      style={{
        background: seleccionado ? '#FFFCF4' : '#fff',
        border: `1px solid ${seleccionado ? COLOR.gold : COLOR.line}`,
        boxShadow: seleccionado ? `0 0 0 3px rgba(194,147,58,.2), ${CARD_SHADOW}` : CARD_SHADOW,
      }}
    >
      <div style={{ height: 3, background: c }} />

      <button
        type="button"
        onClick={onSeleccionar}
        aria-pressed={seleccionado}
        aria-label={`${plan.titulo}, ${info.label.toLowerCase()}${plan.activo ? ', en uso' : ''}${seleccionado ? ', mostrándose ahora' : ''}`}
        className={`flex-1 text-left px-4 pt-3.5 pb-2.5 min-h-[10.5rem] flex flex-col ${FOCO}`}
      >
        <span className="flex items-center gap-1.5 flex-wrap">
          <Pill color={c}><span aria-hidden>{info.icon}</span>{info.label}</Pill>
          {plan.activo && <EnUsoBadge />}
        </span>
        <span className="serif clamp-2 mt-2 block" style={{ fontSize: 21, lineHeight: 1.12, fontWeight: 600, color: COLOR.navy }}>{plan.titulo}</span>
        <span className="clamp-2 mt-1.5 block" style={{ fontSize: 12.5, lineHeight: 1.4, color: plan.descripcion ? COLOR.muted : COLOR.faint }}>
          {plan.descripcion ?? 'Sin descripción'}
        </span>
        <span className="mt-auto pt-2.5 block tabular-nums" style={{ fontSize: 11.5, color: COLOR.faint }}>
          {fechaRelativa(plan.created_at, hoy)} · {fmtBytes(plan.bytes)}
        </span>
      </button>

      <div role="group" aria-label={`Acciones de ${plan.titulo}`} className="flex items-center gap-1.5 px-2.5 pb-2.5">
        <button type="button" onClick={onProyectar} disabled={bloqueado} aria-label={`Proyectar ${plan.titulo} a pantalla completa`} title="Proyectar"
          className={`${ACCION} hover:border-[var(--gold-500)]!`} style={ACCION_ESTILO}>
          <Icono n="proyectar" size={17} />
        </button>
        <a href={planHtmlUrl(plan.id)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${plan.titulo} en pestaña nueva`} title="Abrir en pestaña"
          className={`${ACCION} hover:border-[var(--gold-500)]!`} style={ACCION_ESTILO}>
          <Icono n="externo" size={16} />
        </a>
        {!plan.activo && (
          <button type="button" onClick={onMarcarEnUso} disabled={bloqueado} aria-label={`Marcar ${plan.titulo} como en uso`} title="Marcar en uso"
            className={`${ACCION} hover:border-[var(--gold-500)]! hover:text-[var(--gold-700)]!`} style={ACCION_ESTILO}>
            {marcando ? <Spinner size={15} /> : <Icono n="estrella" size={16} />}
          </button>
        )}
        {seleccionado && (
          <span className="ml-auto inline-flex items-center gap-1 pr-1.5" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: COLOR.goldDark }}>
            <Icono n="ojo" size={13} />Viendo
          </span>
        )}
      </div>
    </article>
  )
}
