'use client'

import { useMemo } from 'react'
import { classifyIMC, fmtFecha, masaGrasa, masaMagra, type PesoRecord } from '@/lib/peso'
import { tallaCuadrada } from '@/lib/peso-perfil'
import { imcEquipo } from '@/lib/peso-visuals'
import type { PesoTilesProps } from './contratos'
import { usePerfil } from './perfil-context'
import { COLOR, Eyebrow, Panel } from './ui'
import {
  EXTRA_SERIES, METRIC_BY_KEY, TONO_COLOR, colorTexto, flecha, fmtGap, fmtNum, fmtSigned, referenciaAntigua, tonoDelta, useMetricas, valoresDe,
  type MetricKey, type SerieValor,
} from './metricas'

// Las 6 tarjetas de métricas (pestaña Resumen): valor grande, clasificación, cambio contra hace ~30 días y una mini
// gráfica con las últimas mediciones de ESA métrica. Cada métrica usa sus propios datos: una captura rápida con solo
// peso no debe hacer desaparecer el % de grasa ni la visceral (se muestra el último dato que sí exista).

type TileDef = {
  key: string
  label: string
  unit: string
  decimals: number
  color: string
  goodDir: 'up' | 'down' | 'neutral'
  get: (r: PesoRecord) => number | null
  /** Métrica cuya clasificación usa la tarjeta. Se resuelve con las métricas del PERFIL (useMetricas): el % de grasa
   *  clasifica distinto según el sexo, así que no se puede fijar aquí a nivel de módulo. */
  clasifica?: MetricKey
  nota?: string
}

// Los colores de dato salen SIEMPRE de metricas.tsx (METRICS y EXTRA_SERIES), sin hex propios aquí: así cada métrica
// conserva el mismo color en las tarjetas y en la gráfica de Progreso, y rojo/verde quedan solo para el semáforo
// (deltas y clasificaciones). Si se cambia la paleta de dato, se cambia allá y esta pantalla la sigue.
const colorExtra = (key: string) => EXTRA_SERIES.find(s => s.key === key)?.color ?? COLOR.muted

const TILES: TileDef[] = [
  // Peso no trae clasificación propia: se lee como IMC (ver abajo) para que la tarjeta diga dónde estás.
  { key: 'peso', label: 'Peso', unit: 'kg', decimals: 1, color: METRIC_BY_KEY.peso.color, goodDir: 'down', get: r => r.peso },
  { key: 'pct_grasa', label: '% Grasa', unit: '%', decimals: 1, color: METRIC_BY_KEY.pct_grasa.color, goodDir: 'down', get: r => r.pct_grasa, clasifica: 'pct_grasa' },
  { key: 'grasa_visceral', label: 'Grasa visceral', unit: '', decimals: 0, color: METRIC_BY_KEY.grasa_visceral.color, goodDir: 'down', get: r => r.grasa_visceral, clasifica: 'grasa_visceral' },
  { key: 'pct_musculo', label: '% Músculo', unit: '%', decimals: 1, color: METRIC_BY_KEY.pct_musculo.color, goodDir: 'up', get: r => r.pct_musculo, clasifica: 'pct_musculo' },
  { key: 'masa_grasa', label: 'Masa grasa', unit: 'kg', decimals: 1, color: colorExtra('masa_grasa'), goodDir: 'down', get: masaGrasa, nota: 'peso × % grasa' },
  { key: 'masa_magra', label: 'Masa magra', unit: 'kg', decimals: 1, color: colorExtra('masa_magra'), goodDir: 'up', get: masaMagra, nota: 'peso − grasa' },
]

const MAX_PUNTOS = 12

/** Mini gráfica: últimas ≤12 mediciones con el eje X en tiempo real y el último punto resaltado. El trazo se estira
 *  con el ancho de la tarjeta (preserveAspectRatio="none" + non-scaling-stroke) y el punto final es un elemento HTML
 *  aparte para que se vea redondo sin importar la proporción. */
function Sparkline({ serie, color, etiqueta, unidad }: { serie: SerieValor[]; color: string; etiqueta: string; unidad: string }) {
  const pts = serie.slice(-MAX_PUNTOS)
  const n = pts.length
  const vals = pts.map(p => p.valor)
  const min = Math.min(...vals), max = Math.max(...vals)
  const t0 = Date.parse(pts[0].fecha), t1 = Date.parse(pts[n - 1].fecha)   // 'YYYY-MM-DD' se interpreta en UTC: determinista
  const W = 100, H = 36, PAD = 5
  const x = (f: string) => (t1 === t0 ? W / 2 : ((Date.parse(f) - t0) / (t1 - t0)) * W)
  const y = (v: number) => (max === min ? H / 2 : PAD + (1 - (v - min) / (max - min)) * (H - 2 * PAD))
  const coords = pts.map(p => [x(p.fecha), y(p.valor)] as const)
  const linea = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(2)} ${cy.toFixed(2)}`).join(' ')
  const area = `${linea} L${coords[n - 1][0].toFixed(2)} ${H} L${coords[0][0].toFixed(2)} ${H} Z`
  const [lx, ly] = coords[n - 1]
  const desc = n === 1
    ? `${etiqueta}: un solo dato, ${fmtNum(vals[0])}${unidad} el ${fmtFecha(pts[0].fecha)}`
    : `${etiqueta} en las últimas ${n} mediciones: de ${fmtNum(vals[0])}${unidad} el ${fmtFecha(pts[0].fecha)} a ${fmtNum(vals[n - 1])}${unidad} el ${fmtFecha(pts[n - 1].fecha)}; mínimo ${fmtNum(min)}${unidad}, máximo ${fmtNum(max)}${unidad}`

  return (
    <div role="img" aria-label={desc} className="relative mx-1 mt-3" style={{ height: 40 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
        {n > 1 && <path d={area} fill={color} opacity={0.1} />}
        {n > 1 && (
          <path d={linea} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          left: `${(lx / W) * 100}%`, top: `${(ly / H) * 100}%`, width: 9, height: 9, transform: 'translate(-50%, -50%)',
          background: color, boxShadow: '0 0 0 2.5px #fff, 0 1px 3px rgba(15,35,64,.35)',
        }}
      />
    </div>
  )
}

export default function PesoTiles({ data }: PesoTilesProps) {
  const perfil = usePerfil()
  const { byKey } = useMetricas()
  const talla2 = tallaCuadrada(perfil)
  const tarjetas = useMemo(() => {
    const ultimaFecha = data.reduce((m, r) => (r.fecha > m ? r.fecha : m), '')
    return TILES.flatMap(def => {
      const serie = valoresDe(data, def.get)
      if (!serie.length) return []   // sin dato de esta métrica: se omite la tarjeta
      const cur = serie[serie.length - 1]
      const ref = referenciaAntigua(serie)
      const delta = ref ? Math.round((cur.valor - ref.ref.valor) * 100) / 100 : null
      // IMC del peso: el que anotó la báscula ese día, pero solo si sigue valiendo para la estatura del perfil (imcEquipo,
      // la misma regla de la franja de estado: así los dos nunca se contradicen); si no hay o ya no vale, peso / talla² con la del perfil,
      // redondeado a 1 decimal como en la franja: el número que se ve y la clasificación salen del mismo valor (24.96 se muestra 25.0 y es «Sobrepeso»).
      let imc: number | null = null
      if (def.key === 'peso') {
        for (const r of data) {
          if (r.fecha !== cur.fecha || r.peso !== cur.valor) continue
          imc = imcEquipo(r, perfil)
          if (imc != null) break
        }
        imc ??= Math.round((cur.valor / talla2) * 10) / 10
      }
      const cls = imc != null ? classifyIMC(imc) : def.clasifica ? byKey[def.clasifica].classify?.(cur.valor) ?? null : null
      return [{ def, serie, cur, ref, delta, imc, cls, desfasado: cur.fecha !== ultimaFecha }]
    })
  }, [data, byKey, perfil, talla2])

  if (!tarjetas.length) return null
  const n = tarjetas.length

  // Grilla de 2 columnas en móvil y de 6 (tarjetas de 2) en ≥1024px: así la última fila nunca queda coja
  // (1 tarjeta suelta ocupa todo el ancho; 2 sueltas se reparten la fila).
  const span = (i: number) => {
    const ultima = i === n - 1, penultima = i === n - 2
    let c = 'lg:col-span-2'
    if (n % 3 === 1 && ultima) c = 'lg:col-span-6'
    if (n % 3 === 2 && (ultima || penultima)) c = 'lg:col-span-3'
    return n % 2 === 1 && ultima ? `col-span-2 ${c}` : `col-span-1 ${c}`
  }

  return (
    <section aria-label="Métricas de composición corporal">
      <div className="mb-2.5 flex items-baseline justify-between gap-x-3 gap-y-0.5 flex-wrap px-1">
        <Eyebrow>Tu cuerpo de un vistazo</Eyebrow>
        <span className="text-[11px]" style={{ color: COLOR.muted }}>Último dato de cada métrica · cambio contra hace ~30 días</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {tarjetas.map(({ def, serie, cur, ref, delta, imc, cls, desfasado }, i) => {
          const tono = tonoDelta(delta, def.goodDir)
          const valor = def.decimals ? fmtNum(cur.valor, def.decimals) : String(Math.round(cur.valor))
          const sufijo = def.unit
          const unidadDelta = def.unit === '%' ? ' pts' : def.unit ? ` ${def.unit}` : ''
          const deltaTxt = delta == null ? null : `${fmtSigned(delta, def.decimals || 1)}${unidadDelta}`
          return (
            <Panel key={def.key} flush accent={def.color} className={span(i)} style={{ animationDelay: `${i * 45}ms` }}>
              <div className="px-3.5 pb-3.5 pt-3 sm:px-4">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: def.color }} />
                  <Eyebrow color={COLOR.muted} className="truncate">{def.label}</Eyebrow>
                </div>

                <div className="mt-1.5 flex items-baseline gap-1">
                  {/* Cormorant Garamond usa numerales de estilo antiguo por defecto (el 3, 4, 5, 7 y 9 bajan de la línea base):
                      la regla `.peso-root .serif` de globals.css fuerza los alineados (lnum) en todas las cifras serif de /peso;
                      aquí solo se añade el ancho tabular. */}
                  <span className="serif tabular-nums" style={{ fontSize: 38, lineHeight: 1, fontWeight: 600, color: COLOR.navy }}>{valor}</span>
                  {sufijo && <span style={{ fontSize: 13, fontWeight: 600, color: COLOR.muted }}>{sufijo}</span>}
                </div>
                {(imc != null || def.nota) && (
                  <div className="mt-0.5 text-[10.5px]" style={{ color: COLOR.muted }}>{imc != null ? `IMC ${imc.toFixed(1)}` : def.nota}</div>
                )}

                {cls && (
                  // Etiqueta propia (no Pill): las clasificaciones largas ("Obesidad por grasa") deben poder partirse en 2 líneas en una tarjeta de 158px.
                  <div className="mt-1.5">
                    <span className="inline-block max-w-full rounded-xl px-2 py-0.5 text-[11px] font-bold leading-tight" style={{ background: `${cls.color}1c`, color: colorTexto(cls.color) }}>
                      {cls.label}
                    </span>
                  </div>
                )}

                <div className="mt-2 text-xs tabular-nums leading-snug" style={{ color: TONO_COLOR[tono] }}>
                  {deltaTxt && ref && delta != null ? (
                    <>
                      <span className="font-bold">{flecha(delta)} {deltaTxt}</span>
                      <span style={{ color: COLOR.muted }}> · vs hace {fmtGap(ref.ref.fecha, ref.cur.fecha)}</span>
                    </>
                  ) : (
                    <span style={{ color: COLOR.muted }}>Sin dato previo para comparar</span>
                  )}
                </div>

                <Sparkline serie={serie} color={def.color} etiqueta={def.label} unidad={def.unit === '%' ? '%' : def.unit ? ` ${def.unit}` : ''} />

                {desfasado && (
                  <div className="mt-2 text-[10.5px]" style={{ color: '#b45309' }}>Último dato: {fmtFecha(cur.fecha)}</div>
                )}
              </div>
            </Panel>
          )
        })}
      </div>
    </section>
  )
}
