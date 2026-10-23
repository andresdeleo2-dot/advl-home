import type { ReactNode } from 'react'
import type { PesoRecord } from '@/lib/peso'
import { KCAL_POR_SESION, PROTEINA_G_KG, type PesoPerfil } from '@/lib/peso-perfil'
import { COLOR, Eyebrow, Panel, Pill } from '../ui'
import { calcularNumeros, etiquetaFecha, fmtNum, type NumerosVista } from './util'

// «Tus números base»: lo que el perfil y la última medición permiten calcular, cada cifra con su «cómo se calcula».
// Sin estado ni efectos: recibe el perfil (el guardado, o el borrador válido como vista previa), las mediciones y la
// fecha de referencia para la edad.

const COLOR_NIVEL = { ok: '#166534', moderada: '#92400e', grande: '#b91c1c' } as const
const ICONO_NIVEL = { ok: '✓', moderada: '≈', grande: '⚠' } as const

function Cifra({ etiqueta, como, ancha, children }: { etiqueta: string; como: ReactNode; ancha?: boolean; children: ReactNode }) {
  return (
    <div className={`min-w-0 rounded-xl p-3.5 ${ancha ? 'sm:col-span-2' : ''}`} style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
      <dt><Eyebrow>{etiqueta}</Eyebrow></dt>
      <dd className="mt-1">{children}</dd>
      <dd className="mt-1.5 leading-snug" style={{ fontSize: 12, color: COLOR.muted }}>
        <span style={{ fontWeight: 700 }}>Cómo se calcula: </span>{como}
      </dd>
    </div>
  )
}

const Grande = ({ children, unidad }: { children: ReactNode; unidad?: string }) => (
  <span>
    <span className="serif tabular-nums" style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 600, color: COLOR.navy }}>{children}</span>
    {unidad && <span style={{ fontSize: 13, color: COLOR.muted }}> {unidad}</span>}
  </span>
)

const Sin = ({ falta }: { falta: string }) => (
  <span>
    <span className="serif" style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 600, color: COLOR.faint }} aria-label="Sin dato">—</span>
    <span className="mt-0.5 block" style={{ fontSize: 12.5, color: COLOR.muted }}>{falta}</span>
  </span>
)

function BloqueBasal({ n }: { n: NumerosVista }) {
  const dosFuentes = n.tmb != null && n.rmr != null
  return (
    <Cifra
      etiqueta="Gasto basal" ancha
      como={<>Fórmula Mifflin-St Jeor: 10 × peso (kg) + 6.25 × estatura (cm) − 5 × edad + 5 en hombres o − 161 en mujeres. La báscula mide el suyo (RMR) por bioimpedancia. Son calorías en reposo, sin moverte.</>}
    >
      {n.tmb == null && n.rmr == null ? (
        <Sin falta="Necesita tu fecha de nacimiento y un peso, o el RMR de tu báscula." />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COLOR.muted }}>Fórmula</div>
            {n.tmb != null ? <Grande unidad="kcal">{fmtNum(n.tmb)}</Grande> : <span style={{ fontSize: 13, color: COLOR.muted }}>No disponible</span>}
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COLOR.muted }}>Tu báscula{n.fechaRmr ? ` (${etiquetaFecha(n.fechaRmr)})` : ''}</div>
            {n.rmr != null ? <Grande unidad="kcal">{fmtNum(n.rmr)}</Grande> : <span style={{ fontSize: 13, color: COLOR.muted }}>Sin RMR registrado</span>}
          </div>
        </div>
      )}
      {n.coherencia && (
        <p className="mt-2 leading-snug" style={{ fontSize: 13, fontWeight: 600, color: COLOR_NIVEL[n.coherencia.nivel] }}>
          <span aria-hidden>{ICONO_NIVEL[n.coherencia.nivel]} </span>{n.coherencia.texto}
        </p>
      )}
      {!dosFuentes && n.rmr == null && n.tmb != null && (
        <p className="mt-2 leading-snug" style={{ fontSize: 12.5, color: COLOR.muted }}>Tu báscula aún no registra un RMR confiable; se usa la fórmula.</p>
      )}
    </Cifra>
  )
}

export default function NumerosBase({ perfil, data, hoy, vistaPrevia = false, supuestos = false }: {
  perfil: PesoPerfil
  data: PesoRecord[]
  /** Fecha ('YYYY-MM-DD') a la que se cuenta la edad. */
  hoy: string
  /** true = el perfil es un borrador aún sin guardar. */
  vistaPrevia?: boolean
  /** true = todavía no hay perfil guardado: son los datos supuestos de siempre. */
  supuestos?: boolean
}) {
  const n = calcularNumeros(perfil, data, hoy)
  const peso = n.pesoKg != null ? `${fmtNum(n.pesoKg, 1)} kg` : null
  const dias = perfil.dias_entrenamiento
  // El rango sale de la misma constante que usa el análisis con IA: la persona no debe ver dos rangos distintos.
  const rangoProteina = `${fmtNum(PROTEINA_G_KG.min, 1)} a ${fmtNum(PROTEINA_G_KG.max, 1)} g por kg`

  return (
    <Panel
      eyebrow="Calculado para ti" icon="🧮" title="Tus números base"
      subtitle={peso ? `Con tu perfil y tu medición del ${etiquetaFecha(n.fechaPeso)} (${peso}). Son estimaciones, no un diagnóstico.` : 'Con tu perfil. Registra tu peso para completar los que dependen de él.'}
      right={vistaPrevia ? <Pill color="#1d4ed8">Vista previa sin guardar</Pill> : supuestos ? <Pill color={COLOR_NIVEL.moderada}>Con datos supuestos</Pill> : undefined}
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <Cifra etiqueta="Edad" como="Años cumplidos a hoy según tu fecha de nacimiento.">
          {n.edad != null ? <Grande unidad="años">{n.edad}</Grande> : <Sin falta="Agrega tu fecha de nacimiento." />}
        </Cifra>

        <Cifra etiqueta="Estatura" como={<>La que escribiste. El IMC es peso ÷ estatura²: con {fmtNum(n.estaturaCm / 100, 2)} m, 1 cm de diferencia mueve el peso para IMC 25 unos {fmtNum(2 * 25 * (n.estaturaCm / 100) / 100, 1)} kg.</>}>
          <Grande unidad="cm">{fmtNum(n.estaturaCm, Number.isInteger(n.estaturaCm) ? 0 : 1)}</Grande>
        </Cifra>

        <Cifra
          etiqueta="Peso saludable" ancha
          como={<>IMC de 18.5 a 24.9 × estatura² ({fmtNum(n.estaturaCm / 100, 2)} m)². Es el rango «normal» del IMC según la OMS; no distingue músculo de grasa, así que es una referencia y no una meta.</>}
        >
          <Grande unidad="kg">{fmtNum(n.saludable.min, 1)} a {fmtNum(n.saludable.max, 1)}</Grande>
          <span className="mt-0.5 block" style={{ fontSize: 13, color: COLOR.ink }}>
            Peso para IMC 25: <strong className="tabular-nums">{fmtNum(n.saludable.imc25, 1)} kg</strong>
          </span>
        </Cifra>

        <BloqueBasal n={n} />

        <Cifra
          etiqueta="Gasto diario estimado"
          como={n.gastoDiario != null
            ? <>Gasto basal {n.gastoBase === 'bascula' ? '(el RMR de tu báscula)' : '(la fórmula)'} × factor de actividad fuera del entrenamiento ({String(n.factor)}, «{n.actividad.label}»: {n.actividad.detalle}) + calorías del entrenamiento ({dias} {dias === 1 ? 'día' : 'días'} por semana × {KCAL_POR_SESION} kcal por sesión ÷ 7). Sin sumar déficit ni superávit.</>
            : `Gasto basal × factor de actividad fuera del entrenamiento + calorías del entrenamiento (días por semana × ${KCAL_POR_SESION} kcal por sesión ÷ 7).`}
        >
          {n.gastoDiario != null ? (
            <>
              <Grande unidad="kcal al día">{fmtNum(n.gastoDiario)}</Grande>
              {n.gastoSinEntrenamiento != null && (
                <span className="mt-0.5 block tabular-nums" style={{ fontSize: 13, color: COLOR.ink }}>
                  {fmtNum(n.gastoSinEntrenamiento)} kcal de tu día a día
                  {n.entrenamientoKcalDia > 0 ? ` + ${fmtNum(n.entrenamientoKcalDia)} kcal de entrenamiento` : ' (sin días de entrenamiento no se suma nada más)'}
                </span>
              )}
            </>
          ) : <Sin falta="Necesita el gasto basal." />}
        </Cifra>

        <Cifra etiqueta="Proteína sugerida" como={peso ? <>De {rangoProteina} de tu peso actual ({peso}): el rango habitual para quien entrena y quiere conservar músculo.</> : `De ${rangoProteina} de tu peso actual.`}>
          {n.proteina ? <Grande unidad="g al día">{fmtNum(n.proteina.min)} a {fmtNum(n.proteina.max)}</Grande> : <Sin falta="Registra tu peso para calcularla." />}
        </Cifra>

        <Cifra etiqueta="Agua" como={peso ? <>35 ml por kg de tu peso actual ({peso}); más si hace calor o entrenas fuerte.</> : '35 ml por kg de tu peso actual.'}>
          {n.agua != null ? <Grande unidad="litros al día">{fmtNum(n.agua, 1)}</Grande> : <Sin falta="Registra tu peso para calcularla." />}
        </Cifra>
      </dl>
      <p className="mt-3 leading-snug" style={{ fontSize: 12, color: COLOR.muted }}>
        Son estimaciones generales para orientarte. No sustituyen la valoración de un médico o un nutriólogo.
      </p>
    </Panel>
  )
}
