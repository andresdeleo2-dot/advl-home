'use client'

import {
  PESO_IMC_25, H2, addDays, daysBetween, etapaActual, fmtFecha, hoyMX, mejorMarca, pendienteSemanal, classifyIMC,
  type PesoRecord, type PesoPlan,
} from '@/lib/peso'

// Franja de estado al tope de /peso: lo que importa hoy en un vistazo (dónde estás, hace cuánto no
// te mides, hacia dónde va el peso y qué tan lejos está tu mejor marca). Mismo estilo navy del header.

const DIAS_SIN_MEDIR = 7   // igual que el recordatorio push diario (DIAS_SIN_PESO en api/push/daily)

const MUTED = 'rgba(243,239,230,0.58)'
const GOLD = '#E7C56B'

function Etiqueta({ children }: { children: string }) {
  return <div className="text-[10px] font-bold uppercase tracking-[.14em] mb-1.5" style={{ color: MUTED }}>{children}</div>
}

export default function PesoHero({ data, plan, onMedir }: { data: PesoRecord[]; plan: PesoPlan | null; onMedir: () => void }) {
  const ultima = data[data.length - 1]
  const conPeso = [...data].reverse().find(r => r.peso != null)
  if (!ultima || !conPeso) return null
  const peso = conPeso.peso as number

  const hoy = hoyMX()
  const diasSin = Math.max(0, daysBetween(ultima.fecha, hoy))
  const colorSin = diasSin <= DIAS_SIN_MEDIR ? '#86efac' : diasSin <= 30 ? '#fcd34d' : '#fca5a5'
  const textoSin = diasSin === 0 ? 'hoy' : diasSin === 1 ? 'ayer' : `hace ${diasSin} días`

  const imc = conPeso.imc ?? peso / H2
  const cls = classifyIMC(imc)

  const quiereBajar = plan?.meta_peso != null ? plan.meta_peso < peso : peso > PESO_IMC_25
  const faltaMeta = plan?.meta_peso != null ? Math.abs(peso - plan.meta_peso) : null
  const faltaIMC = peso - PESO_IMC_25

  const slope = pendienteSemanal(data, r => r.peso, addDays(ultima.fecha, -90), ultima.fecha)
  const nEn90 = data.filter(r => r.peso != null && r.fecha >= addDays(ultima.fecha, -90)).length
  const estable = slope != null && Math.abs(slope) < 0.1
  const bueno = slope != null && (quiereBajar ? slope < 0 : slope > 0)
  const colorSlope = slope == null || estable ? 'rgba(243,239,230,0.9)' : bueno ? '#86efac' : '#fca5a5'

  // Mejor marca de la etapa actual (desde que se retomó el registro), no la de hace años.
  const etapa = etapaActual(data)
  const mejor = mejorMarca(etapa, 'peso')
  const sobreMejor = mejor ? Math.round((peso - mejor.valor) * 10) / 10 : null
  const historico = mejorMarca(data, 'peso')
  const hayOtraEtapa = etapa.length < data.length && historico != null && mejor != null && historico.valor < mejor.valor

  return (
    <div className="band rounded-2xl px-5 sm:px-7 py-5 animate-fade" style={{ color: '#F3EFE6' }}>
      <div className="grid gap-x-8 gap-y-5 grid-cols-2 md:grid-cols-4">
        {/* Peso actual */}
        <div className="col-span-2 md:col-span-1">
          <Etiqueta>Peso actual</Etiqueta>
          <div className="flex items-baseline gap-1.5">
            <span className="serif text-5xl font-semibold leading-none tabular-nums" style={{ color: GOLD }}>{peso}</span>
            <span className="text-sm" style={{ color: MUTED }}>kg</span>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${cls.color}26`, color: cls.level === 'good' ? '#86efac' : cls.level === 'warn' ? '#fcd34d' : '#fca5a5' }}>
              IMC {imc.toFixed(1)} · {cls.label}
            </span>
          </div>
          <div className="text-xs mt-1.5" style={{ color: MUTED }}>
            {faltaMeta != null
              ? faltaMeta < 0.1 ? 'En tu meta' : `${faltaMeta.toFixed(1)} kg para tu meta de ${plan!.meta_peso} kg`
              : faltaIMC > 0 ? `${faltaIMC.toFixed(1)} kg para IMC 25 (${PESO_IMC_25.toFixed(1)} kg)` : 'IMC en rango saludable'}
          </div>
        </div>

        {/* Última medición */}
        <div>
          <Etiqueta>Última medición</Etiqueta>
          <div className="text-2xl font-semibold leading-none" style={{ color: colorSin }}>{textoSin}</div>
          <div className="text-xs mt-1.5" style={{ color: MUTED }}>{fmtFecha(ultima.fecha)}</div>
          {diasSin >= DIAS_SIN_MEDIR && (
            <button onClick={onMedir} className="gold-fill mt-2.5 text-xs font-bold px-3 py-1.5 rounded-lg">+ Medirme hoy</button>
          )}
        </div>

        {/* Tendencia */}
        <div>
          <Etiqueta>Tendencia · 90 días</Etiqueta>
          {slope == null ? (
            <>
              <div className="text-2xl font-semibold leading-none" style={{ color: MUTED }}>—</div>
              <div className="text-xs mt-1.5" style={{ color: MUTED }}>Faltan mediciones: se necesitan 3 en 90 días (hay {nEn90}).</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-semibold leading-none tabular-nums" style={{ color: colorSlope }}>
                {estable ? 'Estable' : `${slope > 0 ? '+' : ''}${slope.toFixed(2)}`}
                {!estable && <span className="text-sm font-normal ml-1" style={{ color: MUTED }}>kg/sem</span>}
              </div>
              <div className="text-xs mt-1.5" style={{ color: MUTED }}>
                {estable ? 'Casi sin cambio' : bueno ? (quiereBajar ? 'Bajando' : 'Subiendo') + ', en la dirección correcta' : quiereBajar ? 'Subiendo, contra tu objetivo' : 'Bajando, contra tu objetivo'} · {nEn90} mediciones
              </div>
            </>
          )}
        </div>

        {/* Mejor marca */}
        <div>
          <Etiqueta>{`Tu mejor marca · desde ${fmtFecha(etapa[0].fecha)}`}</Etiqueta>
          {mejor ? (
            <>
              <div className="text-2xl font-semibold leading-none tabular-nums">{mejor.valor}<span className="text-sm font-normal ml-1" style={{ color: MUTED }}>kg</span></div>
              <div className="text-xs mt-1.5" style={{ color: MUTED }}>
                {fmtFecha(mejor.fecha)} · {sobreMejor != null && sobreMejor > 0.05 ? `hoy ${sobreMejor} kg arriba` : 'estás en ella'}
              </div>
              {hayOtraEtapa && <div className="text-[11px] mt-0.5" style={{ color: 'rgba(243,239,230,0.4)' }}>Mínimo histórico: {historico!.valor} kg ({fmtFecha(historico!.fecha)})</div>}
            </>
          ) : <div className="text-2xl font-semibold leading-none" style={{ color: MUTED }}>—</div>}
        </div>
      </div>
    </div>
  )
}
