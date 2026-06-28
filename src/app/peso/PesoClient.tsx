'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { addRegistro } from './actions'
import type { PesoRecord } from './page'

// ── Constants ────────────────────────────────────────────────────────────────

const HEIGHT_M = 1.81
const H2 = HEIGHT_M * HEIGHT_M

function fmtDate(d: string) {
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y.slice(2)}`
}

// ── Classification ───────────────────────────────────────────────────────────

type Level = 'good' | 'warn' | 'alert'
type Classification = { label: string; color: string; level: Level }

function classifyIMC(v: number): Classification {
  if (v < 18.5) return { label: 'Bajo peso', color: '#f59e0b', level: 'warn' }
  if (v < 25)   return { label: 'Normal', color: '#22c55e', level: 'good' }
  if (v < 30)   return { label: 'Sobrepeso', color: '#f59e0b', level: 'warn' }
  if (v < 35)   return { label: 'Obesidad I', color: '#ef4444', level: 'alert' }
  return         { label: 'Obesidad II+', color: '#dc2626', level: 'alert' }
}
function classifyFat(v: number): Classification {
  if (v < 10)  return { label: 'Muy bajo', color: '#f59e0b', level: 'warn' }
  if (v < 15)  return { label: 'Atlético', color: '#22c55e', level: 'good' }
  if (v < 20)  return { label: 'Fitness', color: '#22c55e', level: 'good' }
  if (v < 25)  return { label: 'Saludable', color: '#84cc16', level: 'good' }
  if (v < 30)  return { label: 'Alto', color: '#f59e0b', level: 'warn' }
  return        { label: 'Obesidad por grasa', color: '#ef4444', level: 'alert' }
}
function classifyMuscle(v: number): Classification {
  if (v < 30)  return { label: 'Bajo', color: '#ef4444', level: 'alert' }
  if (v < 33)  return { label: 'Normal', color: '#84cc16', level: 'warn' }
  if (v < 36)  return { label: 'Bueno', color: '#22c55e', level: 'good' }
  return        { label: 'Atlético', color: '#2d6cdf', level: 'good' }
}
function classifyVisceral(v: number): Classification {
  if (v <= 9)  return { label: 'Saludable', color: '#22c55e', level: 'good' }
  if (v <= 14) return { label: 'Alto', color: '#f59e0b', level: 'warn' }
  return        { label: 'Muy alto', color: '#ef4444', level: 'alert' }
}

// ── Reference rows ───────────────────────────────────────────────────────────

type RefRow = { range: string; label: string; color: string; kg?: string }

function isCurrentRow(range: string, val: number): boolean {
  if (range.startsWith('< '))  return val < parseFloat(range.slice(2))
  if (range.startsWith('≥ '))  return val >= parseFloat(range.slice(2))
  if (range.startsWith('> '))  return val > parseFloat(range.slice(2))
  const m = range.match(/^([\d.]+)\s*[–-]\s*([\d.]+)/)
  if (m) return val >= parseFloat(m[1]) && val <= parseFloat(m[2])
  return false
}

function RefTable({ title, note, rows, currentVal }: {
  title: string; note?: string; rows: RefRow[]; currentVal: number | null
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-[var(--ink-700)] mb-1.5">{title}</div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(row => {
            const isCurrent = currentVal != null && isCurrentRow(row.range, currentVal)
            return (
              <tr key={row.range} style={isCurrent ? { background: `${row.color}18` } : {}}>
                <td className="py-1 pr-2 tabular-nums font-medium" style={{ color: row.color }}>{row.range}</td>
                {row.kg && <td className="py-1 pr-2 tabular-nums text-[var(--ink-700)]">{row.kg}</td>}
                <td className="py-1 text-[var(--ink-950)]">
                  {row.label}{isCurrent ? <span className="ml-1 font-bold">◀ tú</span> : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {note && <p className="text-xs text-[var(--ink-700)] mt-1.5 italic">{note}</p>}
    </div>
  )
}

// ── Metric definitions ───────────────────────────────────────────────────────

type MetricDef = {
  key: keyof PesoRecord
  label: string
  unit: string
  color: string
  yAxis: 'kg' | 'pct' | 'other'
  goodDir: 'up' | 'down' | 'neutral'
  info: { mide: string; leer: string; hacer: string }
  classify?: (v: number) => Classification
  refs?: { title: string; note?: string; rows: RefRow[] }
}

const METRICS: MetricDef[] = [
  {
    key: 'peso', label: 'Peso (kg)', unit: 'kg', color: '#2d6cdf', yAxis: 'kg', goodDir: 'down',
    info: {
      mide: 'Masa corporal total; incluye agua, glucógeno y contenido digestivo.',
      leer: 'Usa tendencia de 2–4 semanas, no una sola mañana.',
      hacer: 'Si también sube grasa, reduce 150–250 kcal y aumenta pasos diarios.',
    },
    refs: {
      title: 'Clasificación OMS — por peso (talla 1.81 m)',
      note: `Meta: bajar de ${(25 * H2).toFixed(1)} kg para IMC < 25 (salir de sobrepeso).`,
      rows: [
        { range: `< ${(18.5 * H2).toFixed(1)}`, label: 'Bajo peso  (IMC < 18.5)', color: '#f59e0b' },
        { range: `${(18.5 * H2).toFixed(1)} – ${(24.9 * H2).toFixed(1)}`, label: 'Normal  (IMC 18.5–24.9)', color: '#22c55e' },
        { range: `${(25 * H2).toFixed(1)} – ${(29.9 * H2).toFixed(1)}`, label: 'Sobrepeso  (IMC 25–29.9)', color: '#f59e0b' },
        { range: `${(30 * H2).toFixed(1)} – ${(34.9 * H2).toFixed(1)}`, label: 'Obesidad I  (IMC 30–34.9)', color: '#ef4444' },
        { range: `≥ ${(35 * H2).toFixed(1)}`, label: 'Obesidad II+  (IMC ≥ 35)', color: '#dc2626' },
      ],
    },
  },
  {
    key: 'pct_grasa', label: '% Grasa', unit: '%', color: '#ef4444', yAxis: 'pct', goodDir: 'down',
    info: {
      mide: 'Proporción de grasa corporal estimada por bioimpedancia.',
      leer: 'Baja sostenida es mejor señal que bajar peso sin contexto.',
      hacer: 'Buena señal: conserva adherencia y evita recortes agresivos.',
    },
    classify: classifyFat,
    refs: {
      title: '% Grasa — hombres (30–40 años)',
      rows: [
        { range: '< 10%', label: 'Muy bajo', color: '#f59e0b' },
        { range: '10 – 14%', label: 'Atlético marcado', color: '#22c55e' },
        { range: '15 – 19%', label: 'Fitness saludable', color: '#22c55e' },
        { range: '20 – 24%', label: 'Promedio saludable', color: '#84cc16' },
        { range: '25 – 29%', label: 'Alto', color: '#f59e0b' },
        { range: '≥ 30%', label: 'Obesidad por grasa', color: '#ef4444' },
      ],
    },
  },
  {
    key: 'pct_musculo', label: '% Músculo', unit: '%', color: '#22c55e', yAxis: 'pct', goodDir: 'up',
    info: {
      mide: 'Masa magra relativa; señal de si estás preservando músculo.',
      leer: 'En déficit, mantener o subir es positivo.',
      hacer: 'Mantén fuerza 3–4 veces/semana y proteína 1.6–2.2 g/kg.',
    },
    classify: classifyMuscle,
    refs: {
      title: '% Músculo (bioimpedancia)',
      rows: [
        { range: '< 30%', label: 'Bajo', color: '#ef4444' },
        { range: '30 – 33%', label: 'Normal', color: '#84cc16' },
        { range: '33 – 36%', label: 'Bueno', color: '#22c55e' },
        { range: '36 – 40%', label: 'Atlético', color: '#2d6cdf' },
      ],
    },
  },
  {
    key: 'imc', label: 'IMC', unit: '', color: '#8b5cf6', yAxis: 'other', goodDir: 'down',
    info: {
      mide: 'Relación peso/altura. No distingue músculo de grasa.',
      leer: 'Úsalo como contexto, no como único objetivo.',
      hacer: 'Interprétalo siempre junto con % grasa y grasa visceral.',
    },
    classify: classifyIMC,
    refs: {
      title: 'IMC — Clasificación OMS',
      note: `Tu talla: 1.81 m. IMC < 25 = ${(25 * H2).toFixed(1)} kg.`,
      rows: [
        { range: '< 18.5', kg: `< ${(18.5 * H2).toFixed(1)} kg`, label: 'Bajo peso', color: '#f59e0b' },
        { range: '18.5 – 24.9', kg: `${(18.5 * H2).toFixed(1)} – ${(24.9 * H2).toFixed(1)} kg`, label: 'Normal', color: '#22c55e' },
        { range: '25.0 – 29.9', kg: `${(25 * H2).toFixed(1)} – ${(29.9 * H2).toFixed(1)} kg`, label: 'Sobrepeso', color: '#f59e0b' },
        { range: '30.0 – 34.9', kg: `${(30 * H2).toFixed(1)} – ${(34.9 * H2).toFixed(1)} kg`, label: 'Obesidad I', color: '#ef4444' },
        { range: '≥ 35', kg: `> ${(35 * H2).toFixed(1)} kg`, label: 'Obesidad II+', color: '#dc2626' },
      ],
    },
  },
  {
    key: 'rmr', label: 'RMR (kcal)', unit: 'kcal/día', color: '#f59e0b', yAxis: 'other', goodDir: 'neutral',
    info: {
      mide: 'Calorías que quemas en reposo absoluto estimadas por la báscula.',
      leer: 'Valora solo cambios sostenidos de varias semanas, no picos sueltos.',
      hacer: 'Evalúa en bloques de 3–4 semanas; un dato solo no dice nada.',
    },
  },
  {
    key: 'edad_corporal', label: 'Edad corporal', unit: 'años', color: '#06b6d4', yAxis: 'other', goodDir: 'down',
    info: {
      mide: 'Índice del fabricante basado en composición y metabolismo.',
      leer: 'Solo tiene valor si mejora junto con grasa y visceral.',
      hacer: 'Tómala como indicador secundario, no como meta principal.',
    },
  },
  {
    key: 'grasa_visceral', label: 'Grasa visceral', unit: '', color: '#f97316', yAxis: 'other', goodDir: 'down',
    info: {
      mide: 'Grasa alrededor de órganos internos. Escala del fabricante (1–59).',
      leer: 'Más relevante que la grasa subcutánea para riesgo metabólico.',
      hacer: 'Prioridad alta: revisar adherencia, alcohol y actividad diaria.',
    },
    classify: classifyVisceral,
    refs: {
      title: 'Grasa visceral',
      rows: [
        { range: '1 – 9', label: 'Saludable', color: '#22c55e' },
        { range: '10 – 14', label: 'Alto', color: '#f59e0b' },
        { range: '≥ 15', label: 'Muy alto', color: '#ef4444' },
      ],
    },
  },
]

const DEFAULT_ACTIVE = new Set<string>(['peso', 'pct_grasa', 'pct_musculo'])

// ── Form fields ──────────────────────────────────────────────────────────────

const FORM_FIELDS = [
  { name: 'fecha', label: 'Fecha', type: 'date', required: true },
  { name: 'peso', label: 'Peso (kg)', type: 'number', step: '0.1' },
  { name: 'pct_grasa', label: '% Grasa', type: 'number', step: '0.1' },
  { name: 'pct_musculo', label: '% Músculo', type: 'number', step: '0.1' },
  { name: 'imc', label: 'IMC', type: 'number', step: '0.1' },
  { name: 'rmr', label: 'RMR (kcal)', type: 'number' },
  { name: 'edad_corporal', label: 'Edad corporal', type: 'number' },
  { name: 'grasa_visceral', label: 'Grasa visceral', type: 'number' },
] as const

// ── Main component ───────────────────────────────────────────────────────────

export default function PesoClient({ initialData }: { initialData: PesoRecord[] }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(DEFAULT_ACTIVE)
  const lastDate = initialData[initialData.length - 1]?.fecha ?? ''
  const defaultFrom = useMemo(() => {
    if (!lastDate) return ''
    const d = new Date(lastDate)
    d.setMonth(d.getMonth() - 4)
    return d.toISOString().slice(0, 10)
  }, [lastDate])
  const [trendFrom, setTrendFrom] = useState(defaultFrom)
  const [trendTo, setTrendTo] = useState(lastDate)

  // Chart data — filter RMR outlier (17775)
  const chartData = useMemo(() =>
    initialData.map(r => ({
      fecha: fmtDate(r.fecha),
      peso: r.peso,
      pct_grasa: r.pct_grasa,
      pct_musculo: r.pct_musculo,
      imc: r.imc,
      rmr: r.rmr && r.rmr < 5000 ? r.rmr : null,
      edad_corporal: r.edad_corporal,
      grasa_visceral: r.grasa_visceral,
    })),
    [initialData]
  )

  // Range data for trend analysis
  const inRange = useMemo(() =>
    initialData.filter(r => r.fecha >= trendFrom && r.fecha <= trendTo),
    [initialData, trendFrom, trendTo]
  )
  const rangeFirst = inRange[0] ?? null
  const rangeLast = inRange[inRange.length - 1] ?? null

  function toggleMetric(key: string) {
    setActiveMetrics(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const hasKg = activeMetrics.has('peso')
  const hasPct = activeMetrics.has('pct_grasa') || activeMetrics.has('pct_musculo')
  const hasOther = METRICS.filter(m => m.yAxis === 'other').some(m => activeMetrics.has(m.key))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    await addRegistro(new FormData(e.currentTarget))
    setSaving(false)
    setShowForm(false)
  }

  if (!initialData.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-2xl p-10 text-center max-w-md">
          <h1 className="text-xl font-bold text-[var(--ink-950)] mb-2">Sin datos aún</h1>
          <p className="text-sm text-[var(--ink-700)]">Crea la tabla en Supabase e inserta registros.</p>
        </div>
      </div>
    )
  }

  const first = initialData[0]
  const latest = initialData[initialData.length - 1]

  return (
    <div className="min-h-screen px-4 py-10 max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div>
        <Link href="/" className="text-sm text-[var(--ink-700)] hover:text-[var(--blue-500)] transition-colors mb-3 inline-block">
          ← Inicio
        </Link>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[var(--ink-950)]">Tracking de Peso</h1>
            <p className="text-sm text-[var(--ink-700)] mt-1">
              {initialData.length} mediciones · {fmtDate(first.fecha)} → {fmtDate(latest.fecha)}
            </p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-[var(--blue-500)] hover:bg-[var(--ink-800)] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            {showForm ? 'Cancelar' : '+ Nueva medición'}
          </button>
        </div>
      </div>

      {/* ── Add form ── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass rounded-2xl px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade">
          {FORM_FIELDS.map(f => (
            <div key={f.name}>
              <label className="text-xs font-medium text-[var(--ink-700)] block mb-1">{f.label}</label>
              <input
                name={f.name} type={f.type}
                step={'step' in f ? f.step : undefined}
                required={'required' in f ? f.required : false}
                className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[var(--blue-500)] focus:ring-1 focus:ring-[var(--blue-500)]/20"
              />
            </div>
          ))}
          <div className="col-span-2 md:col-span-4 flex justify-end pt-1">
            <button type="submit" disabled={saving}
              className="bg-[var(--blue-500)] disabled:opacity-60 text-white text-sm font-medium px-6 py-2 rounded-xl hover:bg-[var(--ink-800)] transition-colors"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {/* ── Combined chart ── */}
      <div className="glass rounded-2xl p-6 animate-fade">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-base font-semibold text-[var(--ink-950)]">Evolución</h2>
          <div className="flex flex-wrap gap-2">
            {METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                className="text-xs font-medium px-3 py-1.5 rounded-full border transition-all"
                style={activeMetrics.has(m.key)
                  ? { background: m.color, color: '#fff', borderColor: m.color }
                  : { background: 'transparent', color: '#5278ab', borderColor: 'rgba(22,54,95,0.15)' }
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {hasOther && !hasPct && !hasKg && (
          <p className="text-xs text-[var(--ink-700)] mb-2">
            ⚠ RMR, IMC, edad corporal y grasa visceral se muestran en el eje derecho con escala automática.
          </p>
        )}

        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(22,54,95,0.07)" />
            <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#5278ab' }} interval="preserveStartEnd" />

            {/* Left axis: peso (kg) */}
            {hasKg && (
              <YAxis yAxisId="kg" domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#5278ab' }} unit=" kg" width={54} />
            )}
            {/* Right axis: percentages */}
            {hasPct && (
              <YAxis yAxisId="pct" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#5278ab' }} unit="%" width={38} />
            )}
            {/* Right axis: other metrics (IMC, RMR, edad, visceral) */}
            {hasOther && (
              <YAxis yAxisId="other" orientation={hasPct ? 'left' : 'right'} domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#5278ab' }} width={44} />
            )}

            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid rgba(22,54,95,0.1)', boxShadow: '0 4px 12px rgba(15,35,64,0.08)' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />

            {METRICS.map(m => activeMetrics.has(m.key) && (
              <Line
                key={m.key}
                yAxisId={m.yAxis === 'kg' ? 'kg' : m.yAxis === 'pct' ? 'pct' : 'other'}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={m.color}
                strokeWidth={2.5}
                dot={{ r: 3, fill: m.color }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Range selector ── */}
      <div className="glass rounded-2xl px-6 py-4">
        <div className="flex items-center flex-wrap gap-4">
          <span className="text-sm font-semibold text-[var(--ink-950)] shrink-0">Rango de análisis</span>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-[var(--ink-700)]">Desde</label>
            <input type="date" value={trendFrom} onChange={e => setTrendFrom(e.target.value)}
              className="border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[var(--blue-500)]"
            />
            <label className="text-xs text-[var(--ink-700)]">Hasta</label>
            <input type="date" value={trendTo} onChange={e => setTrendTo(e.target.value)}
              className="border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[var(--blue-500)]"
            />
          </div>
          {[{ label: '1 mes', months: 1 }, { label: '3 meses', months: 3 }, { label: '6 meses', months: 6 }, { label: 'Todo', months: 999 }]
            .map(({ label, months }) => (
              <button key={label} onClick={() => {
                const from = new Date(lastDate)
                if (months < 999) from.setMonth(from.getMonth() - months)
                else from.setFullYear(from.getFullYear() - 10)
                setTrendFrom(from.toISOString().slice(0, 10))
                setTrendTo(lastDate)
              }}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--blue-500)] hover:text-[var(--blue-500)] transition-colors text-[var(--ink-700)]"
              >
                {label}
              </button>
            ))}
        </div>
      </div>

      {/* ── Trend analysis ── */}
      <div className="glass rounded-2xl overflow-hidden animate-fade">
        <div className="px-6 pt-5 pb-4 border-b border-[var(--line)]">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-[var(--ink-950)]">Análisis de tendencia</h2>
            <span className="text-xs text-[var(--ink-700)]">
              {fmtDate(rangeFirst?.fecha ?? trendFrom)} → {fmtDate(rangeLast?.fecha ?? trendTo)} · {inRange.length} mediciones
            </span>
          </div>
          <p className="text-xs text-[var(--ink-700)]">
            Cambios del primer al último valor en el rango. Las gráficas muestran todo el histórico.
          </p>
        </div>

        {inRange.length < 2 ? (
          <div className="px-6 py-5 text-sm text-[var(--ink-700)]">
            Selecciona un rango con al menos 2 mediciones para ver el análisis.
          </div>
        ) : (
          <>
            {/* OMS status — always visible */}
            <OmsStatus record={inRange[inRange.length - 1]} />
            {/* Trend summary — always visible */}
            <TrendSummary rangeFirst={inRange[0]} rangeLast={inRange[inRange.length - 1]} />
            {/* Detail — single collapsible */}
            <DetailAccordion rangeFirst={inRange[0]} rangeLast={inRange[inRange.length - 1]} />
          </>
        )}
      </div>

      {/* ── History table ── */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--line)]">
          <h2 className="text-base font-semibold text-[var(--ink-950)]">Historial completo</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-700)]">
                {['Fecha', 'Peso', '% Grasa', '% Músculo', 'IMC', 'RMR', 'Edad corp.', 'Gr. visc.'].map(h => (
                  <th key={h} className="px-4 py-3 text-right first:text-left border-b border-[var(--line)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...initialData].reverse().map((r, i) => (
                <tr key={r.id} className={`border-b border-[var(--line)] last:border-0 hover:bg-blue-50/30 transition-colors ${i % 2 !== 0 ? 'bg-[var(--line)]/10' : ''}`}>
                  <td className="px-4 py-3 font-medium tabular-nums">{fmtDate(r.fecha)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--blue-500)] tabular-nums">{r.peso ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-red-500 tabular-nums">{r.pct_grasa ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-green-600 tabular-nums">{r.pct_musculo ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.imc ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.rmr ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.edad_corporal ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.grasa_visceral ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── OMS status block ─────────────────────────────────────────────────────────

function OmsStatus({ record }: { record: PesoRecord }) {
  const items: { label: string; value: string; cls: Classification }[] = []

  if (record.imc != null) {
    const c = classifyIMC(record.imc)
    items.push({ label: 'IMC', value: `${record.imc}`, cls: c })
  }
  if (record.pct_grasa != null) {
    const c = classifyFat(record.pct_grasa)
    items.push({ label: '% Grasa', value: `${record.pct_grasa}%`, cls: c })
  }
  if (record.pct_musculo != null) {
    const c = classifyMuscle(record.pct_musculo)
    items.push({ label: '% Músculo', value: `${record.pct_musculo}%`, cls: c })
  }
  if (record.grasa_visceral != null) {
    const c = classifyVisceral(record.grasa_visceral)
    items.push({ label: 'Gr. visceral', value: `${record.grasa_visceral}`, cls: c })
  }

  // Headline summary text
  const imcLabel = record.imc != null ? classifyIMC(record.imc).label : null
  const grasaLabel = record.pct_grasa != null ? classifyFat(record.pct_grasa).label : null
  const muscLabel = record.pct_musculo != null ? classifyMuscle(record.pct_musculo).label : null

  const headline = [imcLabel, grasaLabel, muscLabel ? `músculo ${muscLabel.toLowerCase()}` : null]
    .filter(Boolean).join(' · ')

  const worstLevel = items.reduce<Level>((acc, i) => {
    if (i.cls.level === 'alert') return 'alert'
    if (i.cls.level === 'warn' && acc === 'good') return 'warn'
    return acc
  }, 'good')

  const overallColor = worstLevel === 'good' ? '#22c55e' : worstLevel === 'warn' ? '#f59e0b' : '#ef4444'

  return (
    <div className="px-6 py-4 border-b border-[var(--line)]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-700)]">Cómo estás según referencias</span>
      </div>
      {headline && (
        <p className="text-sm font-semibold mb-3" style={{ color: overallColor }}>{headline}</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.map(item => (
          <div key={item.label}
            className="rounded-xl px-3 py-2.5 border"
            style={{ background: `${item.cls.color}0d`, borderColor: `${item.cls.color}30` }}
          >
            <div className="text-xs text-[var(--ink-700)] mb-0.5">{item.label}</div>
            <div className="text-base font-bold tabular-nums" style={{ color: item.cls.color }}>{item.value}</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: item.cls.color }}>{item.cls.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Detail accordion (single toggle for all metrics) ─────────────────────────

function DetailAccordion({ rangeFirst, rangeLast }: { rangeFirst: PesoRecord; rangeLast: PesoRecord }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-[var(--line)]">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-blue-50/20 transition-colors text-left"
      >
        <span className="text-sm font-medium text-[var(--ink-800)]">Ver detalle por métrica</span>
        <span className="text-xs text-[var(--ink-700)]">{open ? '▲ Cerrar' : '▼ Abrir'}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--line)]">
          <TrendRows rangeFirst={rangeFirst} rangeLast={rangeLast} />
          <GeneralRec rangeFirst={rangeFirst} rangeLast={rangeLast} />
        </div>
      )}
    </div>
  )
}

// ── Trend summary (always visible) ───────────────────────────────────────────

function TrendSummary({ rangeFirst, rangeLast }: { rangeFirst: PesoRecord; rangeLast: PesoRecord }) {
  const get = (key: keyof PesoRecord) => {
    const f = rangeFirst[key] as number | null
    const l = rangeLast[key] as number | null
    if (f == null || l == null) return null
    return { delta: l - f, first: f, last: l }
  }

  const peso = get('peso')
  const grasa = get('pct_grasa')
  const musculo = get('pct_musculo')
  const imc = get('imc')
  const visceral = get('grasa_visceral')
  const edad = get('edad_corporal')

  const imcClass = imc ? classifyIMC(imc.last) : null
  const grasaClass = grasa ? classifyFat(grasa.last) : null
  const muscClass = musculo ? classifyMuscle(musculo.last) : null
  const visceralClass = visceral ? classifyVisceral(visceral.last) : null

  // Build narrative sentences
  const sentences: { text: string; good: boolean | null }[] = []

  if (peso) {
    const dir = peso.delta > 0 ? 'subió' : peso.delta < 0 ? 'bajó' : 'se mantuvo'
    const isGood = peso.delta <= 0
    sentences.push({
      text: `El peso ${dir} ${peso.delta > 0 ? '+' : ''}${peso.delta.toFixed(1)} kg (${peso.first} → ${peso.last} kg)${imcClass ? `, IMC en ${imcClass.label.toLowerCase()}` : ''}.`,
      good: isGood,
    })
  }

  if (grasa) {
    const dir = grasa.delta > 0 ? 'subió' : grasa.delta < 0 ? 'bajó' : 'se mantuvo'
    const isGood = grasa.delta <= 0
    sentences.push({
      text: `La grasa ${dir} ${grasa.delta > 0 ? '+' : ''}${grasa.delta.toFixed(1)}% → actualmente ${grasa.last}%${grasaClass ? ` (${grasaClass.label.toLowerCase()})` : ''}.`,
      good: isGood,
    })
  }

  if (musculo) {
    const dir = musculo.delta > 0 ? 'subió' : musculo.delta < 0 ? 'bajó' : 'se mantuvo'
    const isGood = musculo.delta >= 0
    sentences.push({
      text: `El músculo ${dir} ${musculo.delta > 0 ? '+' : ''}${musculo.delta.toFixed(1)}% → ${musculo.last}%${muscClass ? ` (${muscClass.label.toLowerCase()})` : ''}.`,
      good: isGood,
    })
  }

  if (visceral) {
    const dir = visceral.delta > 0 ? 'subió' : visceral.delta < 0 ? 'bajó' : 'se mantuvo'
    const isGood = visceral.delta <= 0
    sentences.push({
      text: `Grasa visceral ${dir} a ${visceral.last}${visceralClass ? ` (${visceralClass.label.toLowerCase()})` : ''}.`,
      good: isGood,
    })
  }

  if (edad) {
    const dir = edad.delta > 0 ? 'subió' : edad.delta < 0 ? 'bajó' : 'se mantuvo'
    sentences.push({
      text: `Edad corporal ${dir} ${edad.delta > 0 ? '+' : ''}${edad.delta} → ${edad.last} años.`,
      good: edad.delta <= 0,
    })
  }

  // Insight line
  const recomp = peso && grasa && peso.delta > 0 && grasa.delta < 0
  const deficit = peso && grasa && peso.delta < 0 && grasa.delta < 0
  let insight: string | null = null
  if (recomp) insight = 'Peso al alza con grasa bajando: posible recomposición corporal.'
  else if (deficit) insight = 'Peso y grasa bajando juntos: déficit calórico funcionando.'
  else if (grasa && grasa.delta < 0 && musculo && musculo.delta >= 0) insight = 'Grasa baja y músculo sostenido: buena dirección.'

  const badCount = sentences.filter(s => s.good === false).length
  const overallColor = badCount === 0 ? '#22c55e' : badCount <= 2 ? '#f59e0b' : '#ef4444'
  const overallLabel = badCount === 0 ? 'Buena tendencia' : badCount <= 2 ? 'Tendencia mixta' : 'Tendencia de alerta'

  return (
    <div className="px-6 py-4 border-b border-[var(--line)]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: `${overallColor}18`, color: overallColor }}>
          {overallLabel}
        </span>
        <span className="text-xs text-[var(--ink-700)]">
          {fmtDate(rangeFirst.fecha)} → {fmtDate(rangeLast.fecha)}
        </span>
      </div>
      <ul className="space-y-1.5">
        {sentences.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--ink-900)]">
            <span className="mt-0.5 text-xs" style={{ color: s.good === null ? '#5278ab' : s.good ? '#22c55e' : '#ef4444' }}>
              {s.good === null ? '●' : s.good ? '↓' : '↑'}
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ul>
      {insight && (
        <div className="mt-3 text-xs text-[var(--ink-700)] bg-blue-50/60 rounded-lg px-3 py-2 italic">
          {insight}
        </div>
      )}
    </div>
  )
}

// ── OMS context thresholds per metric ────────────────────────────────────────

function getOmsContext(key: string, val: number): { lines: { text: string; color: string }[] } {
  const lines: { text: string; color: string }[] = []

  if (key === 'peso') {
    const imc = val / H2
    const cls = classifyIMC(imc)
    lines.push({ text: `Estás en: ${cls.label} (tu IMC actual es ${imc.toFixed(1)})`, color: cls.color })
    if (imc >= 30) {
      lines.push({ text: `Para salir de obesidad I: bajar de ${(30 * H2).toFixed(1)} kg (IMC < 30)`, color: '#f59e0b' })
      lines.push({ text: `Para salir del sobrepeso: bajar de ${(25 * H2).toFixed(1)} kg (IMC < 25)`, color: '#22c55e' })
    } else if (imc >= 25) {
      lines.push({ text: `Para salir del sobrepeso: bajar de ${(25 * H2).toFixed(1)} kg (IMC < 25)`, color: '#22c55e' })
      lines.push({ text: `Obesidad I empieza en ${(30 * H2).toFixed(1)} kg (IMC ≥ 30)`, color: '#ef4444' })
    } else {
      lines.push({ text: `Sobrepeso empieza en ${(25 * H2).toFixed(1)} kg (IMC ≥ 25)`, color: '#f59e0b' })
    }
  } else if (key === 'imc') {
    const cls = classifyIMC(val)
    lines.push({ text: `Estás en: ${cls.label} (IMC ${val.toFixed(1)})`, color: cls.color })
    if (val >= 25) lines.push({ text: `Para salir del sobrepeso: IMC < 25 (${(25 * H2).toFixed(1)} kg)`, color: '#22c55e' })
    if (val >= 30) lines.push({ text: `Para salir de obesidad I: IMC < 30 (${(30 * H2).toFixed(1)} kg)`, color: '#f59e0b' })
    if (val < 25) lines.push({ text: `Sobrepeso empieza en IMC 25 (${(25 * H2).toFixed(1)} kg)`, color: '#f59e0b' })
    if (val >= 25 && val < 30) lines.push({ text: `Obesidad I empieza en IMC 30 (${(30 * H2).toFixed(1)} kg)`, color: '#ef4444' })
  } else if (key === 'pct_grasa') {
    const cls = classifyFat(val)
    lines.push({ text: `Estás en: ${cls.label} (${val}%)`, color: cls.color })
    if (val >= 30) lines.push({ text: 'Para salir de obesidad grasa: bajar de 30%', color: '#f59e0b' })
    if (val >= 25) lines.push({ text: 'Para llegar a promedio saludable: bajar de 25%', color: '#84cc16' })
    if (val >= 20) lines.push({ text: 'Fitness saludable: entre 15–19%', color: '#22c55e' })
    if (val < 30 && val >= 25) lines.push({ text: 'Obesidad grasa empieza en 30%', color: '#ef4444' })
  } else if (key === 'pct_musculo') {
    const cls = classifyMuscle(val)
    lines.push({ text: `Estás en: ${cls.label} (${val}%)`, color: cls.color })
    if (val < 33) lines.push({ text: `Para llegar a "Bueno": ≥ 33% (te faltan ${(33 - val).toFixed(1)}%)`, color: '#22c55e' })
    if (val < 36 && val >= 33) lines.push({ text: `Para llegar a "Atlético": ≥ 36% (te faltan ${(36 - val).toFixed(1)}%)`, color: '#2d6cdf' })
    if (val < 30) lines.push({ text: `Para llegar a "Normal": ≥ 30% (te faltan ${(30 - val).toFixed(1)}%)`, color: '#84cc16' })
  } else if (key === 'grasa_visceral') {
    const cls = classifyVisceral(val)
    lines.push({ text: `Estás en: ${cls.label} (nivel ${val})`, color: cls.color })
    if (val >= 10) lines.push({ text: 'Para volver a saludable: bajar a ≤ 9', color: '#22c55e' })
    if (val >= 15) lines.push({ text: 'Muy alto empieza en 15 — riesgo metabólico elevado', color: '#ef4444' })
    if (val < 10) lines.push({ text: 'Alto empieza en 10 · Muy alto en 15', color: '#f59e0b' })
  }

  return { lines }
}

// ── Trend rows (always expanded, no per-metric toggle) ───────────────────────

function TrendRows({ rangeFirst, rangeLast }: {
  rangeFirst: PesoRecord
  rangeLast: PesoRecord
}) {
  return (
    <div className="divide-y divide-[var(--line)]">
      {METRICS.map(def => {
        const firstVal = rangeFirst[def.key] as number | null
        const lastVal = rangeLast[def.key] as number | null
        if (firstVal == null || lastVal == null) return null

        const delta = lastVal - firstVal
        const isGood = def.goodDir === 'neutral'
          ? true
          : def.goodDir === 'down' ? delta <= 0 : delta >= 0
        const direction = delta > 0 ? 'Subiendo' : delta < 0 ? 'Bajando' : 'Estable'
        const classification = def.classify ? def.classify(lastVal) : undefined
        const deltaStr = `${delta > 0 ? '+' : ''}${Number.isInteger(delta) ? delta : delta.toFixed(1)}${def.unit ? ' ' + def.unit : ''}`
        const omsCtx = getOmsContext(def.key, lastVal)

        return (
          <MetricRow
            key={def.key}
            def={def}
            firstVal={firstVal}
            lastVal={lastVal}
            isGood={isGood}
            direction={direction}
            classification={classification}
            deltaStr={deltaStr}
            rangeFirstFecha={rangeFirst.fecha}
            rangeLastFecha={rangeLast.fecha}
            omsLines={omsCtx.lines}
          />
        )
      })}
    </div>
  )
}

function MetricRow({
  def, firstVal, lastVal, isGood, direction, classification, deltaStr,
  rangeFirstFecha, rangeLastFecha, omsLines,
}: {
  def: MetricDef
  firstVal: number
  lastVal: number
  isGood: boolean
  direction: string
  classification: Classification | undefined
  deltaStr: string
  rangeFirstFecha: string
  rangeLastFecha: string
  omsLines: { text: string; color: string }[]
}) {
  return (
    <div className="px-6 py-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-[var(--ink-950)]">{def.label}</span>
          <span className={`text-xs font-medium ${isGood ? 'text-green-600' : 'text-orange-600'}`}>{direction}</span>
          {classification && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: `${classification.color}18`, color: classification.color }}>
              {classification.label}
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-bold tabular-nums" style={{ color: isGood ? '#22c55e' : '#ef4444' }}>
            {deltaStr}
          </div>
          <div className="text-xs text-[var(--ink-700)]">
            {firstVal}{def.unit ? ' ' + def.unit : ''} → {lastVal}{def.unit ? ' ' + def.unit : ''}
          </div>
          <div className="text-xs text-[var(--ink-700)]">
            {fmtDate(rangeFirstFecha)} → {fmtDate(rangeLastFecha)}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="text-xs text-[var(--ink-700)] space-y-0.5 mb-3">
        <div><span className="font-medium text-[var(--ink-800)]">Qué mide:</span> {def.info.mide}</div>
        <div><span className="font-medium text-[var(--ink-800)]">Cómo leer:</span> {def.info.leer}</div>
        <div><span className="font-medium text-[var(--ink-800)]">Qué hacer:</span> {def.info.hacer}</div>
      </div>

      {/* OMS context thresholds */}
      {omsLines.length > 0 && (
        <div className="rounded-xl border border-[var(--line)] overflow-hidden">
          {omsLines.map((line, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs border-b border-[var(--line)] last:border-0"
              style={{ background: `${line.color}08` }}>
              <span className="mt-0.5 shrink-0" style={{ color: line.color }}>●</span>
              <span className="text-[var(--ink-900)]">{line.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Full reference table (always visible if refs exist) */}
      {def.refs && (
        <div className="mt-3 pt-3 border-t border-[var(--line)]/60">
          <RefTable title={def.refs.title} note={def.refs.note} rows={def.refs.rows} currentVal={lastVal} />
        </div>
      )}
    </div>
  )
}

// ── General recommendation ───────────────────────────────────────────────────

function GeneralRec({ rangeFirst, rangeLast }: { rangeFirst: PesoRecord; rangeLast: PesoRecord }) {
  const get = (key: keyof PesoRecord) => {
    const f = rangeFirst[key] as number | null
    const l = rangeLast[key] as number | null
    if (f == null || l == null) return null
    return l - f
  }
  const fatD = get('pct_grasa')
  const muscleD = get('pct_musculo')
  const pesoD = get('peso')
  const visceralLast = rangeLast.grasa_visceral

  const bullets: string[] = []
  if (fatD != null && fatD < 0) bullets.push('La grasa corporal muestra descenso neto.')
  if (muscleD != null && muscleD > 0) bullets.push('El porcentaje de músculo sube en el periodo.')
  if (pesoD != null && pesoD > 0 && fatD != null && fatD < 0) bullets.push('Peso al alza con grasa a la baja: posible recomposición.')
  if (pesoD != null && pesoD < 0 && fatD != null && fatD < 0) bullets.push('Peso y grasa bajando juntos: buen déficit calórico.')
  if (visceralLast != null && visceralLast >= 10) bullets.push('Grasa visceral alta: prioriza adherencia y reducción de alcohol.')

  const alertCount = METRICS.filter(m => {
    if (m.goodDir === 'neutral') return false
    const d = get(m.key as keyof PesoRecord)
    if (d == null) return false
    return m.goodDir === 'down' ? d > 0 : d < 0
  }).length
  if (alertCount >= 2) bullets.push('Hay más de una métrica en alerta: conviene ajustar el plan esta semana.')

  const summary = bullets.length === 0
    ? 'Tendencia mixta, conviene sostener consistencia y revisar métricas clave.'
    : null

  return (
    <div className="px-6 py-5 bg-blue-50/40 border-t border-[var(--line)]">
      <div className="text-sm font-semibold text-[var(--ink-950)] mb-2">Recomendación general</div>
      {summary
        ? <p className="text-xs text-[var(--ink-700)] mb-3">{summary}</p>
        : <ul className="space-y-1 mb-3">{bullets.map((b, i) => (
            <li key={i} className="text-xs text-[var(--ink-800)] flex gap-1.5"><span>•</span><span>{b}</span></li>
          ))}</ul>
      }
      <div className="text-xs font-semibold text-[var(--ink-950)] mb-1">Siguiente paso:</div>
      <ul className="space-y-0.5 text-xs text-[var(--ink-700)] mb-4">
        <li>• Mide siempre en horario y condiciones similares.</li>
        <li>• Sostén fuerza 3–4 veces/semana y proteína 1.6–2.2 g/kg para preservar músculo.</li>
        <li>• Si no mejoras en 2–3 semanas, recorta 150–250 kcal o sube 2 000–3 000 pasos diarios.</li>
      </ul>

      {/* Priority metrics explanation */}
      <div className="rounded-xl bg-[var(--blue-400)]/8 border border-[var(--blue-400)]/20 px-4 py-3 space-y-2">
        <div className="text-xs font-semibold text-[var(--ink-800)] mb-2">¿Qué métricas reflejan mejor la realidad?</div>
        {[
          { num: '1', label: '% Grasa corporal — el más honesto', desc: 'El IMC no distingue músculo de grasa. El % grasa te dice directamente cuánta masa no es metabólicamente útil.' },
          { num: '2', label: 'Grasa visceral — el más crítico para salud', desc: 'Grasa alrededor de órganos = riesgo cardiovascular, resistencia a insulina y diabetes. Si eliges uno solo para vigilar, que sea este.' },
          { num: '3', label: '% Músculo — el que confirma si vas bien', desc: 'Si bajas peso pero también pierdes músculo, vas mal. Si la grasa baja y el músculo se mantiene, vas bien aunque la báscula se mueva poco.' },
          { num: '4', label: 'Peso (kg) — el más ruidoso', desc: 'Sube y baja 1–2 kg en un día por agua, sal y glucógeno. Solo tiene valor como tendencia de 3–4 semanas, nunca como dato único.' },
          { num: '5', label: 'IMC — el menos útil a nivel individual', desc: 'Diseñado para poblaciones, no personas. Con masa muscular sobreestima el riesgo. Úsalo solo como referencia OMS, no para decisiones.' },
        ].map(item => (
          <div key={item.num} className="flex gap-2.5">
            <span className="text-xs font-bold text-[var(--blue-500)] shrink-0 w-4">{item.num}.</span>
            <div>
              <span className="text-xs font-semibold text-[var(--ink-900)]">{item.label} </span>
              <span className="text-xs text-[var(--ink-700)]">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
