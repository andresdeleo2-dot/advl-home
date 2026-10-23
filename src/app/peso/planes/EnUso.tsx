'use client'

// Tarjeta compacta para la pestaña Resumen: la rutina y la dieta que están "en uso" (con atajo para
// abrirlas) o, si no hay, una invitación a subir la primera.

import type { PesoPlanMeta, PlanTipo } from '@/lib/peso-planes'
import type { PlanesEnUsoProps } from '../contratos'
import { COLOR, Eyebrow, Panel } from '../ui'
import { FOCO, Icono, SelloTipo, TIPO_COLOR, btn, tipoInfo } from './comun'
import { useHoy } from './hooks'
import { fechaRelativa, fmtBytes } from './util'

const SLOTS: { tipo: PlanTipo; singular: string; plural: string; ninguna: string }[] = [
  { tipo: 'rutina', singular: 'rutina', plural: 'rutinas', ninguna: 'Sin rutina en uso' },
  { tipo: 'dieta', singular: 'dieta', plural: 'dietas', ninguna: 'Sin dieta en uso' },
]

const masReciente = (a: PesoPlanMeta, b: PesoPlanMeta) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)

export function PlanesEnUso({ planes, onVer, onIrAPlanes, error }: PlanesEnUsoProps) {
  const hoy = useHoy()

  // La lectura falló y no hay lista: «Subir el primero» sería falso (los documentos siguen guardados). El reintento
  // vive en la pestaña Rutinas y dietas; aquí solo se avisa y se lleva hacia allá.
  if (!planes.length && error) {
    return (
      <Panel
        eyebrow="Rutinas y dietas"
        icon="⚠️"
        title="Documentos no disponibles por ahora"
        accent={COLOR.warn}
        right={<button type="button" onClick={onIrAPlanes} className={btn('ghost')}>Ir a Rutinas y dietas<Icono n="der" size={14} /></button>}
      >
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: COLOR.ink }}>
          No se pudo cargar la lista. Tus rutinas y dietas no se borraron: suele ser algo pasajero y se puede reintentar desde su pestaña.
        </p>
      </Panel>
    )
  }

  if (!planes.length) {
    return (
      <Panel
        dark
        flush
        eyebrow="Rutinas y dietas"
        icon="🏋️"
        title="Tu rutina y tu dieta, a la mano"
        subtitle="Sube el HTML que te arme Claude y consúltalo desde aquí cada día."
        right={<button type="button" onClick={onIrAPlanes} className={btn('gold')}><Icono n="subir" size={16} />Subir el primero</button>}
      >
        <div className="h-4" />
      </Panel>
    )
  }

  return (
    <Panel
      eyebrow="En uso ahora"
      icon="🏋️"
      title="Tu rutina y tu dieta"
      right={
        <button type="button" onClick={onIrAPlanes} className={btn('ghost')}>
          Biblioteca<Icono n="der" size={14} />
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map(s => {
          const activo = planes.filter(p => p.tipo === s.tipo && p.activo).sort(masReciente)[0]
          const guardados = planes.filter(p => p.tipo === s.tipo).length
          const color = TIPO_COLOR[s.tipo]

          if (activo) {
            return (
              <div key={s.tipo} className="flex items-center gap-3 rounded-xl p-3" style={{ border: `1px solid ${COLOR.line}`, background: COLOR.card2, borderLeft: `3px solid ${color}` }}>
                <SelloTipo tipo={s.tipo} size={44} />
                <div className="min-w-0 flex-1">
                  <Eyebrow color={color}>{tipoInfo(s.tipo).label} en uso</Eyebrow>
                  <div className="serif clamp-2 mt-0.5" style={{ fontSize: 19, lineHeight: 1.15, fontWeight: 600, color: COLOR.navy }}>{activo.titulo}</div>
                  <div className="mt-0.5 tabular-nums" style={{ fontSize: 11.5, color: COLOR.faint }}>
                    Subida {fechaRelativa(activo.created_at, hoy)} · {fmtBytes(activo.bytes)}
                  </div>
                </div>
                <button type="button" onClick={() => onVer(activo.id)} aria-label={`Ver ${activo.titulo}`} className={btn('primary')}>
                  <Icono n="ojo" size={15} />Ver
                </button>
              </div>
            )
          }

          return (
            <div key={s.tipo} className="flex items-center gap-3 rounded-xl p-3" style={{ border: `1.5px dashed ${COLOR.lineStrong}` }}>
              <SelloTipo tipo={s.tipo} size={44} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold" style={{ color: COLOR.navy2 }}>{s.ninguna}</div>
                <div className="mt-0.5 text-xs leading-snug" style={{ color: COLOR.muted }}>
                  {guardados
                    ? `Tienes ${guardados} ${guardados === 1 ? s.singular : s.plural} guardada${guardados === 1 ? '' : 's'}; marca una como en uso.`
                    : `Sube tu primera ${s.singular} en HTML.`}
                </div>
              </div>
              <button type="button" onClick={onIrAPlanes} aria-label={guardados ? `Elegir una ${s.singular} en uso` : `Subir una ${s.singular}`} className={`${btn('ghost')} ${FOCO}`}>
                {guardados ? 'Elegir' : 'Subir'}
              </button>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export default PlanesEnUso
