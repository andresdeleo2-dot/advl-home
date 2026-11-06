'use client'

// Tarjeta del Resumen: lo de hoy sacado de tus tres documentos (la rutina del día, la dieta y la meta de esta semana).

import {
  diaDeFecha, fmtNum, minutosBici, semanaActual, seriesDelDia, totalesDieta,
  type ContenidoCarga, type DocId,
} from '@/lib/peso-contenido'
import { fmtFecha, type PesoRecord } from '@/lib/peso'
import { BTN, COLOR, Panel } from '../ui'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const kg = (n: number) => fmtNum(n, 1)

function fechaLarga(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${DIAS[d.getDay()]} ${Number(m[3])} de ${MESES[Number(m[2]) - 1]}`
}

function Tarjeta({ rotulo, titulo, children, onVer, verTxt }: { rotulo: string; titulo: string; children: React.ReactNode; onVer: () => void; verTxt: string }) {
  return (
    <div className="flex flex-col rounded-xl p-3.5 min-w-0" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
      <div style={{ font: '800 10.5px/1.2 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.goldText }}>{rotulo}</div>
      <div className="serif mt-1" style={{ fontSize: 21, lineHeight: 1.15, fontWeight: 600, color: COLOR.navy }}>{titulo}</div>
      <div className="mt-1.5 flex-1 space-y-0.5" style={{ fontSize: 13, lineHeight: 1.45, color: COLOR.ink }}>{children}</div>
      <button type="button" onClick={onVer} className={`${BTN.base} ${BTN.ghost} mt-3 min-h-10 self-start`}>{verTxt} →</button>
    </div>
  )
}

export default function ResumenNativo({ carga, data, hoy, onIr }: { carga: ContenidoCarga; data: PesoRecord[]; hoy: string; onIr: (id: DocId) => void }) {
  const { rutina, dieta, plan } = carga.contenido
  const dia = diaDeFecha(rutina, hoy)
  const tot = totalesDieta(dieta.comidas)
  const sem = semanaActual(plan.semanas, hoy)
  const ult = [...data].reverse().find(r => r.peso != null && r.fecha <= hoy) ?? null
  const dif = ult?.peso != null && sem ? ult.peso - sem.meta : null
  const series = dia ? seriesDelDia(dia) : 0
  const bici = dia ? minutosBici(dia) : 0

  return (
    <Panel eyebrow="Tu plan de hoy" icon="🏋️" title={fechaLarga(hoy) || 'Hoy'} subtitle="Sale de tu rutina, tu dieta y tu plan: cámbialos desde Rutinas y dietas.">
      <div className="grid gap-3 md:grid-cols-3">
        <Tarjeta rotulo="Rutina" titulo={dia ? `${dia.foco}` : 'Sin rutina para hoy'} onVer={() => onIr('rutina')} verTxt="Ver la rutina">
          {dia ? (<>
            <p>{dia.nombre} · {dia.resumen}</p>
            {(series > 0 || bici > 0) && <p className="tabular-nums" style={{ color: COLOR.muted }}>{[series > 0 ? `${series} series` : '', bici > 0 ? `${bici} min de bici` : ''].filter(Boolean).join(' · ')}</p>}
          </>) : <p style={{ color: COLOR.muted }}>Tu rutina no tiene un día para hoy.</p>}
        </Tarjeta>
        <Tarjeta rotulo="Dieta" titulo={`~${fmtNum(tot.kcal)} kcal`} onVer={() => onIr('dieta')} verTxt="Ver la dieta">
          <p className="tabular-nums">{fmtNum(tot.prot)} g de proteína · {dieta.comidas.length} comidas</p>
          <p style={{ color: COLOR.muted }}>{dieta.comidas.map(c => c.hora).join(' · ')}</p>
        </Tarjeta>
        <Tarjeta rotulo="Plan" titulo={sem ? `Meta ${kg(sem.meta)} kg` : 'Sin metas'} onVer={() => onIr('plan')} verTxt="Ver el plan">
          {sem ? (<>
            <p>Viernes {sem.fecha ? `${Number(sem.fecha.slice(8, 10))} ${MESES[Number(sem.fecha.slice(5, 7)) - 1]}` : ''} · banda de ±{kg(plan.ref.tol)} kg</p>
            <p className="tabular-nums" style={{ color: COLOR.muted }}>
              {ult?.peso != null ? `Último peso ${kg(ult.peso)} kg (${fmtFecha(ult.fecha)})${dif != null ? ` · ${dif > 0 ? '+' : dif < 0 ? '−' : ''}${kg(Math.abs(dif))} kg` : ''}` : 'Aún sin mediciones'}
            </p>
          </>) : <p style={{ color: COLOR.muted }}>Agrega los viernes en el plan.</p>}
        </Tarjeta>
      </div>
    </Panel>
  )
}
