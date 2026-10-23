'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, getNiceTickValues,
} from 'recharts'
import { PESO_IMC_25, addMonths, etapaActual, fmtFecha, pendienteSemanal, type PesoRecord } from '@/lib/peso'
import type { PesoProgresoProps } from './contratos'
import { BTN, COLOR, Eyebrow, INPUT, Panel, Pill, Segmented } from './ui'
import {
  DATO_COLOR, DEFAULT_ACTIVE, EXTRA_SERIES, FOCO, METRICS, PRESETS, RefTable, TONO_COLOR,
  colorTexto, construirSerie, estadoOms, extremosMetrica, flecha, fmtNum, fmtSigned, fmtTick, fmtTooltipFecha, fmtValor,
  getOmsContext, porFecha, recomendacionGeneral, resumenTendencia, ticksMensuales, tonoDelta, useReducirMovimiento,
  type MetricDef, type PuntoSerie,
} from './metricas'

// Pestaña Progreso: rango (estado LOCAL) + gráfica con eje de tiempo real + análisis de tendencia del mismo rango.
// El rango por defecto es el último año: con 4 meses solo caben ~3 mediciones y cualquier pendiente es ruido.

type Preset = number | 'todo' | 'custom'

const EJE = 'rgba(20,35,61,0.62)'   // texto de los ejes (≥4.5:1 sobre blanco)

/** ¿La fecha cae en [from, to]? Un extremo vacío = sin límite; un rango invertido no contiene nada. */
function dentro(f: string, from: string, to: string) {
  if (from && to && from > to) return false
  return (!from || f >= from) && (!to || f <= to)
}

/** ¿La línea de IMC 25 cabe en el eje de kg? La línea usa ifOverflow="discard" (si queda fuera del eje no se pinta; no
 *  queremos estirar el eje y aplastar la curva), así que la leyenda debe anunciarla solo cuando de verdad se dibuja.
 *  Replica el dominio 'auto' de Recharts: extremos de las series de kg visibles (y la meta, que sí extiende el eje)
 *  redondeados a marcas "bonitas" con los mismos parámetros por defecto del YAxis (5 marcas, decimales, 'adaptive'). */
function imcCabeEnEje(serie: readonly PuntoSerie[], activos: ReadonlySet<string>, metaPeso: number | null): boolean {
  const claves = ['peso', 'peso_ma', ...EXTRA_SERIES.filter(s => activos.has(s.key)).map(s => s.key)] as const
  const vals: number[] = []
  for (const d of serie) for (const k of claves) { const v = d[k]; if (v != null && Number.isFinite(v)) vals.push(v) }
  if (metaPeso != null && Number.isFinite(metaPeso)) vals.push(metaPeso)
  if (!vals.length) return false
  const min = Math.min(...vals), max = Math.max(...vals)
  const marcas = getNiceTickValues([min, max], 5, true, 'adaptive')
  const lo = marcas.length ? Math.min(min, marcas[0]) : min
  const hi = marcas.length ? Math.max(max, marcas[marcas.length - 1]) : max
  const EPS = 1e-9   // tolera el ruido de coma flotante en los bordes
  return PESO_IMC_25 >= lo - EPS && PESO_IMC_25 <= hi + EPS
}

// ── Tooltip de la gráfica ────────────────────────────────────────────────────

type EntradaTooltip = { dataKey?: unknown; name?: unknown; value?: unknown; color?: string; stroke?: string }

function TooltipGrafica({ active, payload, label }: { active?: boolean; payload?: readonly EntradaTooltip[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  const filas = payload.filter(p => typeof p.value === 'number')
  if (!filas.length) return null
  const fecha = fmtTooltipFecha(Number(label))
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: '#fff', border: `1px solid ${COLOR.lineStrong}`, boxShadow: '0 12px 28px -12px rgba(15,35,64,.45)', minWidth: 170 }}>
      <div style={{ font: '800 12px/1.3 var(--font-ui, system-ui)', color: COLOR.navy }}>{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</div>
      <ul className="mt-1.5 space-y-1">
        {filas.map(p => {
          const key = String(p.dataKey)
          const esMA = key === 'peso_ma'
          return (
            <li key={key} className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5" style={{ color: esMA ? COLOR.muted : COLOR.ink }}>
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.stroke, opacity: esMA ? 0.6 : 1 }} />
                {String(p.name)}
              </span>
              <span className="font-bold tabular-nums" style={{ color: esMA ? COLOR.muted : COLOR.navy }}>{fmtValor(key, p.value as number)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── Piezas del análisis ──────────────────────────────────────────────────────

function Kpi({ etiqueta, valor, sub, color }: { etiqueta: string; valor: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
      <Eyebrow color={COLOR.muted}>{etiqueta}</Eyebrow>
      <div className="serif mt-1 tabular-nums" style={{ fontSize: 24, lineHeight: 1.05, fontWeight: 600, color: color ?? COLOR.navy }}>{valor}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-tight" style={{ color: COLOR.muted }}>{sub}</div>}
    </div>
  )
}

function OmsStatus({ rows }: { rows: PesoRecord[] }) {
  const oms = estadoOms(rows)
  if (!oms.items.length) return null
  return (
    <div className="px-5 py-4 sm:px-6" style={{ borderTop: `1px solid ${COLOR.line}` }}>
      <Eyebrow>Cómo estás según referencias</Eyebrow>
      {oms.headline && (
        <p className="serif mt-1" style={{ fontSize: 22, lineHeight: 1.2, fontWeight: 600, color: oms.color }}>{oms.headline}</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {oms.items.map(item => {
          const c = colorTexto(item.cls.color)
          return (
            <div key={item.label} className="rounded-xl px-3 py-2.5" style={{ background: `${item.cls.color}10`, border: `1px solid ${item.cls.color}33`, borderLeft: `4px solid ${item.cls.color}` }}>
              <div className="text-[11px] font-semibold" style={{ color: COLOR.muted }}>{item.label}</div>
              <div className="serif tabular-nums" style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 600, color: c }}>{item.value}</div>
              <div className="text-xs font-semibold" style={{ color: c }}>{item.cls.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TrendSummary({ rows }: { rows: PesoRecord[] }) {
  const t = resumenTendencia(rows)
  return (
    <div className="px-5 py-4 sm:px-6" style={{ borderTop: `1px solid ${COLOR.line}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill color={t.color}>{t.etiqueta}</Pill>
        <span className="text-xs" style={{ color: COLOR.muted }}>{fmtFecha(rows[0].fecha)} → {fmtFecha(rows[rows.length - 1].fecha)}</span>
      </div>
      {t.frases.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: COLOR.muted }}>Ninguna métrica tiene dos datos en este rango para compararse.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {t.frases.map((f, i) => {
            const color = f.bueno == null ? COLOR.muted : f.bueno ? TONO_COLOR.bueno : TONO_COLOR.malo
            return (
              <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: COLOR.ink }}>
                <span aria-hidden className="mt-0.5 w-4 shrink-0 text-center text-sm font-extrabold" style={{ color }}>{f.bueno == null ? '→' : flecha(f.delta, 0)}</span>
                <span>
                  <span className="sr-only">{f.bueno == null ? 'Sin cambio: ' : f.bueno ? 'Mejora: ' : 'Empeora: '}</span>
                  {f.texto}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {t.insight && (
        <div className="mt-3 rounded-xl px-3.5 py-2.5 text-[13px] italic" style={{ background: `${COLOR.gold}14`, border: `1px solid ${COLOR.gold}40`, color: COLOR.ink }}>
          {t.insight}
        </div>
      )}
    </div>
  )
}

function MetricRow({ def, rows }: { def: MetricDef; rows: PesoRecord[] }) {
  const ex = extremosMetrica(rows, def.key)
  if (!ex) return null
  const { first, last } = ex
  const delta = last.valor - first.valor
  const d = Math.round(delta * (def.decimals ? 10 : 1)) / (def.decimals ? 10 : 1)
  const tono = tonoDelta(d, def.goodDir, 0.0001)
  const direccion = d > 0 ? 'Subiendo' : d < 0 ? 'Bajando' : 'Estable'
  const cls = def.classify ? def.classify(last.valor) : undefined
  const { lines } = getOmsContext(def.key, last.valor)
  const u = def.unit ? ` ${def.unit}` : ''
  const dec = def.decimals || 1
  const ancho = (v: number) => (def.decimals ? fmtNum(v, def.decimals) : String(Math.round(v)))

  return (
    <article className="px-5 py-5 sm:px-6" style={{ borderTop: `1px solid ${COLOR.line}` }}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: def.color }} />
            <h3 className="serif" style={{ fontSize: 21, lineHeight: 1.1, fontWeight: 600, color: COLOR.navy }}>{def.label}</h3>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold" style={{ color: TONO_COLOR[tono] }}>{direccion}</span>
            {cls && <Pill color={colorTexto(cls.color)}>{cls.label}</Pill>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="serif tabular-nums" style={{ fontSize: 28, lineHeight: 1, fontWeight: 600, color: TONO_COLOR[tono] }}>
            {d === 0 ? '0' : fmtSigned(d, dec)}<span style={{ fontSize: 13, fontWeight: 600 }}>{u}</span>
          </div>
          <div className="mt-1 text-xs tabular-nums" style={{ color: COLOR.muted }}>{ancho(first.valor)}{u} → {ancho(last.valor)}{u}</div>
          <div className="text-[11px] tabular-nums" style={{ color: COLOR.muted }}>{fmtFecha(first.fecha)} → {fmtFecha(last.fecha)}</div>
        </div>
      </header>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        {([['Qué mide', def.info.mide], ['Cómo leer', def.info.leer], ['Qué hacer', def.info.hacer]] as const).map(([k, v]) => (
          <div key={k} className="rounded-lg px-3 py-2" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
            <dt style={{ font: '800 10px/1.2 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: COLOR.goldDark }}>{k}</dt>
            <dd className="mt-1 leading-snug" style={{ color: COLOR.ink }}>{v}</dd>
          </div>
        ))}
      </dl>

      {(lines.length > 0 || def.refs) && (
        <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
          {lines.length > 0 && (
            <ul className="overflow-hidden rounded-xl" style={{ border: `1px solid ${COLOR.line}` }}>
              {lines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 px-3 py-2 text-xs" style={{ background: `${line.color}0d`, borderTop: i ? `1px solid ${COLOR.line}` : undefined, color: COLOR.ink }}>
                  <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: line.color }} />
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          )}
          {def.refs && <RefTable title={def.refs.title} note={def.refs.note} rows={def.refs.rows} currentVal={last.valor} />}
        </div>
      )}
    </article>
  )
}

const MAS_REALES = [
  { n: '1', t: '% Grasa corporal — el más honesto', d: 'El IMC no distingue músculo de grasa. El % grasa te dice directamente cuánta masa no es metabólicamente útil.' },
  { n: '2', t: 'Grasa visceral — el más crítico para salud', d: 'Grasa alrededor de órganos = riesgo cardiovascular, resistencia a insulina y diabetes. Si eliges uno solo para vigilar, que sea este.' },
  { n: '3', t: '% Músculo — el que confirma si vas bien', d: 'Si bajas peso pero también pierdes músculo, vas mal. Si la grasa baja y el músculo se mantiene, vas bien aunque la báscula se mueva poco.' },
  { n: '4', t: 'Peso (kg) — el más ruidoso', d: 'Sube y baja 1–2 kg en un día por agua, sal y glucógeno. Solo tiene valor como tendencia de 3–4 semanas, nunca como dato único.' },
  { n: '5', t: 'IMC — el menos útil a nivel individual', d: 'Diseñado para poblaciones, no personas. Con masa muscular sobreestima el riesgo. Úsalo solo como referencia OMS, no para decisiones.' },
]

function GeneralRec({ rows }: { rows: PesoRecord[] }) {
  const { bullets, resumen } = recomendacionGeneral(rows)
  return (
    <div className="px-5 py-5 sm:px-6" style={{ borderTop: `1px solid ${COLOR.line}`, background: COLOR.card2 }}>
      <h3 className="serif" style={{ fontSize: 21, fontWeight: 600, color: COLOR.navy }}>Recomendación general</h3>
      {resumen ? (
        <p className="mt-2 text-[13px]" style={{ color: COLOR.muted }}>{resumen}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[13px]" style={{ color: COLOR.ink }}><span aria-hidden style={{ color: COLOR.gold }}>●</span><span>{b}</span></li>
          ))}
        </ul>
      )}

      <div className="mt-4"><Eyebrow>Siguiente paso</Eyebrow></div>
      <ul className="mt-1.5 space-y-1 text-[13px]" style={{ color: COLOR.ink }}>
        <li className="flex gap-2"><span aria-hidden style={{ color: COLOR.gold }}>●</span>Mide siempre en horario y condiciones similares.</li>
        <li className="flex gap-2"><span aria-hidden style={{ color: COLOR.gold }}>●</span>Sostén fuerza 3–4 veces/semana y proteína 1.6–2.2 g/kg para preservar músculo.</li>
        <li className="flex gap-2"><span aria-hidden style={{ color: COLOR.gold }}>●</span>Si no mejoras en 2–3 semanas, recorta 150–250 kcal o sube 2 000–3 000 pasos diarios.</li>
      </ul>

      <div className="mt-5 rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${COLOR.line}` }}>
        <div className="serif" style={{ fontSize: 18, fontWeight: 600, color: COLOR.navy }}>¿Qué métricas reflejan mejor la realidad?</div>
        <ol className="mt-3 space-y-3">
          {MAS_REALES.map(item => (
            <li key={item.n} className="flex gap-3">
              <span aria-hidden className="serif flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: COLOR.navy, color: COLOR.goldLight, fontSize: 15, fontWeight: 700 }}>{item.n}</span>
              <div className="text-[13px] leading-snug">
                <span className="font-bold" style={{ color: COLOR.navy }}>{item.t}. </span>
                <span style={{ color: COLOR.muted }}>{item.d}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function DetalleMetricas({ rows }: { rows: PesoRecord[] }) {
  const [abierto, setAbierto] = useState(false)
  const id = useId()
  return (
    <div style={{ borderTop: `1px solid ${COLOR.line}` }}>
      <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto} aria-controls={id}
        className={`flex w-full min-h-12 items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-[#FBFAF6] sm:px-6 ${FOCO}`}>
        <span className="text-sm font-bold" style={{ color: COLOR.navy }}>Ver detalle por métrica</span>
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: COLOR.goldDark }}>
          {abierto ? 'Cerrar' : 'Abrir'}
          <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" style={{ transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }}>
            <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <div id={id} hidden={!abierto}>
        {abierto && (
          <>
            {METRICS.map(def => <MetricRow key={def.key} def={def} rows={rows} />)}
            <GeneralRec rows={rows} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Leyenda de la gráfica ────────────────────────────────────────────────────

function Muestra({ color, trazo }: { color: string; trazo?: string }) {
  return (
    <svg aria-hidden width="22" height="8" viewBox="0 0 22 8" className="shrink-0">
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={trazo} />
    </svg>
  )
}

// ── Sección ──────────────────────────────────────────────────────────────────

export default function PesoProgreso({ data, plan }: PesoProgresoProps) {
  const [preset, setPreset] = useState<Preset>(12)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [activos, setActivos] = useState<Set<string>>(() => new Set(DEFAULT_ACTIVE))
  const idDesde = useId(), idHasta = useId()
  // Menos movimiento: Recharts anima el trazo de cada línea al montar y al cambiar el rango, y eso no lo cubre el @media de
  // globals.css. Se lee ya montado (false en servidor e hidratación), así que no hay desajuste.
  const reducir = useReducirMovimiento()

  const sorted = useMemo(() => porFecha(data), [data])
  const firstDate = sorted[0]?.fecha ?? ''
  const lastDate = sorted[sorted.length - 1]?.fecha ?? ''
  const from = preset === 'custom' ? customFrom : preset === 'todo' ? firstDate : lastDate ? addMonths(lastDate, -preset) : ''
  const to = preset === 'custom' ? customTo : lastDate
  const invertido = !!(from && to && from > to)
  function editarRango(f: string, t: string) { setCustomFrom(f); setCustomTo(t); setPreset('custom') }

  const serieAll = useMemo(() => construirSerie(data), [data])   // el promedio móvil se calcula sobre TODO el historial
  const chartData = useMemo(() => serieAll.filter(d => dentro(d.iso, from, to)), [serieAll, from, to])
  const inRange = useMemo(() => sorted.filter(r => dentro(r.fecha, from, to)), [sorted, from, to])

  const ticks = chartData.length >= 2 ? ticksMensuales(chartData[0].t, chartData[chartData.length - 1].t) : []
  const rangoCorto = chartData.length >= 2 && chartData[chartData.length - 1].t - chartData[0].t < 120 * 86_400_000

  function toggle(key: string) {
    setActivos(prev => {
      const next = new Set(prev)
      if (next.has(key)) { if (next.size > 1) next.delete(key) } else next.add(key)
      return next
    })
  }

  const hasPeso = activos.has('peso')
  const hasKg = hasPeso || EXTRA_SERIES.some(s => activos.has(s.key))
  const hasPct = activos.has('pct_grasa') || activos.has('pct_musculo')
  const hasOther = METRICS.filter(m => m.yAxis === 'other').some(m => activos.has(m.key))
  const metaPeso = plan?.meta_peso ?? null
  const metaGrasa = plan?.meta_grasa ?? null
  const imcEnGrafica = hasPeso && imcCabeEnEje(chartData, activos, metaPeso)

  // KPIs del rango (solo peso). El ritmo se calcula con la etapa actual: una regresión que cruza el hueco de años miente.
  const kpi = useMemo(() => {
    const pesos = inRange.filter(r => r.peso != null)
    if (!pesos.length) return null
    const primero = pesos[0], ultimo = pesos[pesos.length - 1]
    const delta = pesos.length >= 2 ? Math.round(((ultimo.peso as number) - (primero.peso as number)) * 10) / 10 : null
    const mejor = pesos.reduce((m, r) => ((r.peso as number) < (m.peso as number) ? r : m), pesos[0])
    const etapa = etapaActual(pesos)
    const ritmo = etapa.length >= 3 ? pendienteSemanal(etapa, r => r.peso, etapa[0].fecha, etapa[etapa.length - 1].fecha) : null
    return { delta, mejor, ritmo, nRitmo: etapa.length, primero, ultimo }
  }, [inRange])

  if (!data.length) {
    return (
      <Panel eyebrow="Progreso" title="Evolución" icon="📈">
        <p className="py-8 text-center text-sm" style={{ color: COLOR.muted }}>Aún no hay mediciones. Registra la primera para ver tu progreso.</p>
      </Panel>
    )
  }

  const activas = METRICS.filter(m => activos.has(m.key))
  const descGrafica = `Gráfica de líneas con ${activas.map(m => m.corto).concat(EXTRA_SERIES.filter(s => activos.has(s.key)).map(s => s.corto)).join(', ')}: ${chartData.length} mediciones${chartData.length ? ` del ${fmtFecha(chartData[0].iso)} al ${fmtFecha(chartData[chartData.length - 1].iso)}` : ''}. Los mismos datos están en la pestaña Historial.`

  const chip = (key: string, label: string, color: string, title?: string): ReactNode => {
    const on = activos.has(key)
    return (
      <button key={key} type="button" aria-pressed={on} title={title} onClick={() => toggle(key)}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition-colors ${FOCO}`}
        style={on
          ? { background: `${color}1c`, border: `1.5px solid ${color}`, color: COLOR.navy }
          : { background: '#fff', border: `1.5px solid ${COLOR.lineStrong}`, color: COLOR.muted }}>
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: on ? color : 'transparent', border: `2px solid ${color}` }} />
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-5">
      <Panel eyebrow="Progreso" icon="📈" title="Evolución"
        subtitle={`${chartData.length} de ${data.length} mediciones · el eje horizontal respeta el tiempo real entre una y otra`}>
        {/* ── Rango ── */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <Segmented<Preset> ariaLabel="Rango de tiempo" value={preset} onChange={setPreset}
            options={PRESETS.map(p => ({ value: p.value as Preset, label: p.label }))} />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor={idDesde} className="mb-1 block text-[11px] font-semibold" style={{ color: COLOR.muted }}>Desde</label>
              <input id={idDesde} type="date" value={from} onChange={e => editarRango(e.target.value, to)}
                className={INPUT} style={{ minHeight: 40, borderColor: preset === 'custom' ? COLOR.gold : undefined }} />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor={idHasta} className="mb-1 block text-[11px] font-semibold" style={{ color: COLOR.muted }}>Hasta</label>
              <input id={idHasta} type="date" value={to} onChange={e => editarRango(from, e.target.value)}
                className={INPUT} style={{ minHeight: 40, borderColor: preset === 'custom' ? COLOR.gold : undefined }} />
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: COLOR.muted }}>
          {preset === 'custom' ? 'Rango personalizado. ' : ''}Aplica a la gráfica y al análisis de tendencia; la proyección de tu meta usa siempre tu ritmo reciente.
        </p>
        {invertido && (
          <div role="alert" className="mt-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: '#dc262612', color: '#b91c1c' }}>
            La fecha inicial es posterior a la final: no hay mediciones que mostrar.
          </div>
        )}

        {/* ── Resumen del rango ── */}
        {kpi && (
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Kpi etiqueta="Cambio de peso"
              valor={kpi.delta == null ? '—' : `${kpi.delta === 0 ? '0' : fmtSigned(kpi.delta)} kg`}
              color={kpi.delta == null ? undefined : TONO_COLOR[tonoDelta(kpi.delta, 'down')]}
              sub={kpi.delta == null ? 'Se necesitan 2 mediciones' : `${fmtNum(kpi.primero.peso as number)} → ${fmtNum(kpi.ultimo.peso as number)} kg`} />
            <Kpi etiqueta="Ritmo"
              valor={kpi.ritmo == null ? '—' : `${fmtSigned(kpi.ritmo, 2)} kg/sem`}
              color={kpi.ritmo == null ? undefined : TONO_COLOR[tonoDelta(kpi.ritmo, 'down', 0.03)]}
              sub={kpi.ritmo == null ? 'Faltan datos (3 en 2+ semanas)' : `Regresión · ${kpi.nRitmo} mediciones`} />
            <Kpi etiqueta="Mejor peso" valor={`${fmtNum(kpi.mejor.peso as number)} kg`} sub={fmtFecha(kpi.mejor.fecha)} />
            <Kpi etiqueta="Mediciones" valor={String(inRange.length)} sub={`de ${data.length} en total`} />
          </div>
        )}

        {/* ── Métricas a graficar ── */}
        <div className="mt-4">
          <div className="mb-2"><Eyebrow>Qué graficar</Eyebrow></div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Métricas en la gráfica">
            {METRICS.map(m => chip(m.key, m.label, m.color))}
            {EXTRA_SERIES.map(s => chip(s.key, s.label, s.color, 'Calculado: peso × % de grasa'))}
          </div>
          {hasOther && !hasPct && !hasKg && (
            <p className="mt-2 text-xs" style={{ color: COLOR.muted }}>RMR, IMC, edad corporal y grasa visceral se muestran en el eje derecho con escala automática.</p>
          )}
        </div>

        {/* ── Gráfica ── */}
        <div className="mt-4">
          {chartData.length === 0 ? (
            <div className="rounded-2xl px-5 py-12 text-center" style={{ border: `1.5px dashed ${COLOR.lineStrong}`, background: COLOR.card2 }}>
              <div aria-hidden style={{ fontSize: 28 }}>📉</div>
              <p className="serif mt-2" style={{ fontSize: 20, fontWeight: 600, color: COLOR.navy }}>No hay mediciones en este rango</p>
              <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: COLOR.muted }}>
                {invertido ? 'Corrige las fechas para ver tu evolución.' : 'Amplía el rango para ver tus datos.'}
              </p>
              <button type="button" onClick={() => setPreset('todo')} className={`${BTN.base} ${BTN.gold} mt-4 min-h-10 ${FOCO}`}>Ver todo el historial</button>
            </div>
          ) : (
            <div role="img" aria-label={descGrafica}>
              <ResponsiveContainer width="100%" height={330}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,35,64,0.08)" vertical={false} />
                  <XAxis
                    dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} padding={{ left: 8, right: 8 }}
                    ticks={ticks.length >= 2 ? ticks : undefined}
                    tickFormatter={(t: number) => fmtTick(t, rangoCorto)}
                    tick={{ fontSize: 10.5, fill: EJE }} tickLine={false} axisLine={{ stroke: COLOR.lineStrong }}
                  />

                  {/* Eje izquierdo: peso y masas (kg) */}
                  {hasKg && <YAxis yAxisId="kg" domain={['auto', 'auto']} tick={{ fontSize: 10.5, fill: EJE }} width={36} tickLine={false} axisLine={false} />}
                  {/* Eje derecho: porcentajes */}
                  {hasPct && <YAxis yAxisId="pct" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 10.5, fill: EJE }} unit="%" width={40} tickLine={false} axisLine={false} />}
                  {/* Otras métricas (IMC, RMR, edad, visceral) */}
                  {hasOther && <YAxis yAxisId="other" orientation={hasPct ? 'left' : 'right'} domain={['auto', 'auto']} tick={{ fontSize: 10.5, fill: EJE }} width={42} tickLine={false} axisLine={false} />}

                  <Tooltip
                    cursor={{ stroke: COLOR.lineStrong, strokeDasharray: '3 3' }}
                    wrapperStyle={{ outline: 'none' }} isAnimationActive={!reducir}
                    content={p => <TooltipGrafica active={p.active} payload={p.payload as unknown as readonly EntradaTooltip[]} label={p.label} />}
                  />

                  {/* Referencias: tu meta (amplía el eje para que se vea) y el umbral de IMC 25 (solo si cae en el rango). */}
                  {hasPeso && metaPeso != null && (
                    <ReferenceLine yAxisId="kg" y={metaPeso} stroke="#15803d" strokeDasharray="6 4" ifOverflow="extendDomain"
                      label={{ value: `Meta ${metaPeso} kg`, position: 'insideBottomRight', fontSize: 10.5, fill: '#15803d' }} />
                  )}
                  {hasPeso && (
                    <ReferenceLine yAxisId="kg" y={PESO_IMC_25} stroke="#b45309" strokeDasharray="2 4" ifOverflow="discard"
                      label={{ value: 'IMC 25', position: 'insideTopRight', fontSize: 10.5, fill: '#b45309' }} />
                  )}
                  {activos.has('pct_grasa') && hasPct && metaGrasa != null && (
                    <ReferenceLine yAxisId="pct" y={metaGrasa} stroke="#15803d" strokeDasharray="6 4" ifOverflow="extendDomain"
                      label={{ value: `Meta ${metaGrasa}% grasa`, position: 'insideBottomLeft', fontSize: 10.5, fill: '#15803d' }} />
                  )}

                  {METRICS.map(m => activos.has(m.key) && (
                    <Line key={m.key} yAxisId={m.yAxis === 'kg' ? 'kg' : m.yAxis === 'pct' ? 'pct' : 'other'}
                      type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2.5} isAnimationActive={!reducir}
                      dot={{ r: 3, fill: m.color, stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5.5, stroke: '#fff', strokeWidth: 2 }} connectNulls />
                  ))}
                  {EXTRA_SERIES.map(s => activos.has(s.key) && (
                    <Line key={s.key} yAxisId="kg" type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} isAnimationActive={!reducir}
                      dot={{ r: 3, fill: s.color, stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5.5, stroke: '#fff', strokeWidth: 2 }} connectNulls />
                  ))}
                  {/* Tendencia de peso (promedio móvil de 14 días): el texto de "Cómo leer" pide fijarse en la tendencia, no en un día. */}
                  {hasPeso && (
                    <Line yAxisId="kg" type="monotone" dataKey="peso_ma" name="Tendencia 14 d" stroke={DATO_COLOR.peso} strokeWidth={2} strokeDasharray="5 4"
                      dot={false} activeDot={false} connectNulls opacity={0.55} isAnimationActive={!reducir} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartData.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]" style={{ color: COLOR.muted }} aria-label="Leyenda de la gráfica">
              {activas.map(m => <li key={m.key} className="flex items-center gap-1.5"><Muestra color={m.color} />{m.label}</li>)}
              {EXTRA_SERIES.filter(s => activos.has(s.key)).map(s => <li key={s.key} className="flex items-center gap-1.5"><Muestra color={s.color} />{s.label}</li>)}
              {hasPeso && <li className="flex items-center gap-1.5"><Muestra color={DATO_COLOR.peso} trazo="4 3" />Tendencia 14 d (promedio móvil)</li>}
              {hasPeso && metaPeso != null && <li className="flex items-center gap-1.5"><Muestra color="#15803d" trazo="5 3" />Tu meta</li>}
              {imcEnGrafica && <li className="flex items-center gap-1.5"><Muestra color="#b45309" trazo="1.5 3" />IMC 25 ({PESO_IMC_25.toFixed(1)} kg)</li>}
            </ul>
          )}
        </div>
      </Panel>

      {/* ── Análisis de tendencia ── */}
      <Panel flush eyebrow="Según el rango elegido" icon="🔎" title="Análisis de tendencia"
        subtitle={inRange.length >= 2
          ? `Cambios del primer al último valor de cada métrica · ${fmtFecha(inRange[0].fecha)} → ${fmtFecha(inRange[inRange.length - 1].fecha)} · ${inRange.length} mediciones`
          : 'Cambios del primer al último valor de cada métrica dentro del rango.'}>
        <div className="pt-3">
          {inRange.length < 2 ? (
            <div className="px-5 pb-6 pt-2 text-sm sm:px-6" style={{ color: COLOR.muted }}>
              Selecciona un rango con al menos 2 mediciones para ver el análisis.
              <div className="mt-3"><button type="button" onClick={() => setPreset('todo')} className={`${BTN.base} ${BTN.ghost} min-h-10 ${FOCO}`}>Ver todo el historial</button></div>
            </div>
          ) : (
            <>
              <OmsStatus rows={inRange} />
              <TrendSummary rows={inRange} />
              <DetalleMetricas rows={inRange} />
            </>
          )}
        </div>
      </Panel>
    </div>
  )
}
