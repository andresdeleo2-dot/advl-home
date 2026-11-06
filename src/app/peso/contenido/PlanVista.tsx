'use client'

// El plan maestro: texto en secciones y, en «Meta de cada viernes», la tabla y la gráfica de las metas contra tu peso
// real (sale solo de tus mediciones: el viernes, o el día más cercano dentro de ±2 días).

import { useMemo } from 'react'
import { addDays, daysBetween, fmtFecha, type PesoRecord } from '@/lib/peso'
import { fmtNum, semanaActual, type DocPlan, type SemanaPlan } from '@/lib/peso-contenido'
import { COLOR } from '../ui'
import { Agregar, CajaEd, Ctl, Fecha, N, T, useDoc } from './edicion'
import { Indice, Portada, Secciones } from './Bloques'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const corta = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}` : '—')
const kg = (n: number) => fmtNum(n, 1)

type Estado = 'cumplido' | 'fuera' | 'sin-dato' | 'pendiente'
type Fila = { i: number; s: SemanaPlan; real: PesoRecord | null; estado: Estado; dif: number | null }

/** La medición de ese viernes: la del mismo día o, si no hay, la más cercana dentro de ±2 días (jueves a domingo). */
function pesoDe(fecha: string, data: PesoRecord[]): PesoRecord | null {
  if (!fecha) return null
  let mejor: PesoRecord | null = null
  let d = 99
  for (const r of data) {
    if (r.peso == null) continue
    const x = Math.abs(daysBetween(fecha, r.fecha))
    if (x <= 2 && x <= d) { mejor = r; d = x }   // con empate gana la más reciente (los datos vienen ordenados por fecha)
  }
  return mejor
}

function calcular(d: DocPlan, data: PesoRecord[], hoy: string): Fila[] {
  return d.semanas.map((s, i) => {
    const real = pesoDe(s.fecha, data)
    if (real?.peso != null) {
      const dif = real.peso - s.meta
      return { i, s, real, dif, estado: Math.abs(dif) <= d.ref.tol + 1e-9 ? 'cumplido' : 'fuera' }
    }
    return { i, s, real: null, dif: null, estado: s.fecha && s.fecha < hoy ? 'sin-dato' : 'pendiente' }
  })
}

const ESTADO: Record<Estado, { t: string; color: string; icono: string }> = {
  cumplido: { t: 'Cumplido', color: '#166534', icono: '✓' },
  fuera: { t: 'Fuera', color: '#991B1B', icono: '✕' },
  'sin-dato': { t: 'Sin pesaje', color: '#7A3E06', icono: '–' },
  pendiente: { t: 'Por llegar', color: COLOR.muted, icono: '·' },
}

// ── Gráfica ─────────────────────────────────────────────────────────────────

function Grafica({ d, filas, actual }: { d: DocPlan; filas: Fila[]; actual: number | null }) {
  const W = 640, H = 280, L = 44, R = 14, T0 = 14, B = 38
  const puntos = [{ x: 0, meta: d.ref.inicio, etq: 'Hoy' }, ...filas.map((f, k) => ({ x: k + 1, meta: f.s.meta, etq: corta(f.s.fecha) }))]
  const reales = filas.filter(f => f.real?.peso != null).map(f => f.real!.peso as number)
  const todos = [...puntos.map(p => p.meta), ...reales]
  const lo = Math.floor(Math.min(...todos) - d.ref.tol - 0.5), hi = Math.ceil(Math.max(...todos) + d.ref.tol + 0.5)
  const n = puntos.length - 1 || 1
  const X = (x: number) => L + (x / n) * (W - L - R)
  const Y = (v: number) => T0 + (1 - (v - lo) / (hi - lo || 1)) * (H - T0 - B)
  const banda = [...puntos.map(p => `${X(p.x)},${Y(p.meta + d.ref.tol)}`), ...[...puntos].reverse().map(p => `${X(p.x)},${Y(p.meta - d.ref.tol)}`)].join(' ')
  const linea = puntos.map((p, k) => `${k ? 'L' : 'M'}${X(p.x)},${Y(p.meta)}`).join(' ')
  const paso = hi - lo > 14 ? 4 : 2
  const marcas: number[] = []
  for (let v = Math.ceil(lo / paso) * paso; v <= hi; v += paso) marcas.push(v)
  const resumen = `Metas de peso de cada viernes, de ${kg(d.ref.inicio)} kg hoy a ${kg(d.ref.meta)} kg. ${filas.filter(f => f.estado === 'cumplido').length} de ${filas.filter(f => f.real).length} pesajes dentro de la banda de ±${kg(d.ref.tol)} kg. Los valores están en la tabla.`
  return (
    <figure className="rounded-xl p-3" style={{ background: '#fff', border: `1px solid ${COLOR.line}` }}>
      {/* En el teléfono la gráfica conserva su ancho (para que se lean los números) y se desliza de lado. */}
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={resumen} className="w-full h-auto" style={{ minWidth: 540, maxHeight: 340 }}>
        {marcas.map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="rgba(15,35,64,.1)" />
            <text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="#4A566E">{v}</text>
          </g>
        ))}
        <polygon points={banda} fill="rgba(194,147,58,.2)" />
        <path d={linea} fill="none" stroke={COLOR.navy2} strokeWidth="2.5" strokeLinejoin="round" />
        {puntos.map((p, k) => <circle key={k} cx={X(p.x)} cy={Y(p.meta)} r={k === 0 ? 5 : 3} fill={k === 0 ? COLOR.gold : COLOR.navy2} />)}
        {filas.map((f, k) => f.real?.peso != null && (
          <circle key={`r${k}`} cx={X(k + 1)} cy={Y(f.real.peso)} r="5.5" fill={f.estado === 'cumplido' ? COLOR.good : COLOR.bad} stroke="#fff" strokeWidth="2" />
        ))}
        {actual != null && <circle cx={X(actual + 1)} cy={Y(puntos[actual + 1].meta)} r="8.5" fill="none" stroke={COLOR.gold} strokeWidth="2" strokeDasharray="3 2" />}
        {puntos.map((p, k) => (k === 0 || k % 3 === 1 || k === puntos.length - 1) && (
          <text key={`t${k}`} x={X(p.x)} y={H - 16} textAnchor="middle" fontSize="11" fill="#4A566E">{p.etq}</text>
        ))}
      </svg>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: 12, color: COLOR.muted }}>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden style={{ width: 16, height: 3, background: COLOR.navy2, display: 'inline-block' }} />Meta del viernes (kg)</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden style={{ width: 16, height: 10, background: 'rgba(194,147,58,.3)', display: 'inline-block' }} />Banda de ±{kg(d.ref.tol)} kg</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: COLOR.good, display: 'inline-block' }} />Tu peso (dentro)</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: COLOR.bad, display: 'inline-block' }} />Tu peso (fuera)</li>
      </ul>
    </figure>
  )
}

// ── Metas de cada viernes ───────────────────────────────────────────────────

function Semanas({ data, hoy }: { data: PesoRecord[]; hoy: string }) {
  const { doc, editando } = useDoc()
  const d = doc as DocPlan
  const filas = useMemo(() => calcular(d, data, hoy), [d, data, hoy])

  if (editando) {
    return (
      <div className="space-y-3">
        <CajaEd titulo="Referencias del plan">
          <div className="grid gap-2 sm:grid-cols-3">
            <N ruta={['ref', 'inicio']} etq="Peso de salida (kg)" />
            <N ruta={['ref', 'meta']} etq="Peso meta (kg)" />
            <N ruta={['ref', 'tol']} etq="Tolerancia (± kg)" />
          </div>
        </CajaEd>
        {d.semanas.map((s, i) => (
          <CajaEd key={i} titulo={`Semana ${i + 1}`} ctl={<Ctl ruta={['semanas']} i={i} n={d.semanas.length} quitarTxt="Quitar semana" />}>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-[1fr_1fr_2fr]">
              <Fecha ruta={['semanas', i, 'fecha']} etq="Viernes" />
              <N ruta={['semanas', i, 'meta']} etq="Peso meta (kg)" />
              <T ruta={['semanas', i, 'nota']} etq="Nota (fiestas, meta…)" className="col-span-2 sm:col-span-1" />
            </div>
          </CajaEd>
        ))}
        <Agregar ruta={['semanas']} item={() => { const u = d.semanas[d.semanas.length - 1]; return { n: d.semanas.length + 1, fecha: u?.fecha ? addDays(u.fecha, 7) : '', meta: u?.meta ?? d.ref.meta } }} texto="Agregar semana" />
      </div>
    )
  }

  const act = semanaActual(d.semanas, hoy)
  const iAct = act ? d.semanas.indexOf(act) : -1
  const conDato = filas.filter(f => f.real)
  const cumplidas = filas.filter(f => f.estado === 'cumplido').length
  const ultimo = [...data].reverse().find(r => r.peso != null && r.fecha <= hoy) ?? null
  const difUlt = ultimo?.peso != null && act ? ultimo.peso - act.meta : null

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl px-3.5 py-3" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
          <div style={{ font: '800 10.5px/1.2 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.goldText }}>Esta semana</div>
          <div className="serif tabular-nums mt-1" style={{ fontSize: 26, lineHeight: 1.05, fontWeight: 600, color: COLOR.navy }}>{act ? `${kg(act.meta)} kg` : '—'}</div>
          <div className="mt-1" style={{ fontSize: 12, color: COLOR.muted }}>{act ? `meta del viernes ${corta(act.fecha)} (${kg(act.meta - d.ref.tol)} a ${kg(act.meta + d.ref.tol)})` : 'sin semanas'}</div>
        </div>
        <div className="rounded-xl px-3.5 py-3" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
          <div style={{ font: '800 10.5px/1.2 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.goldText }}>Tu último peso</div>
          <div className="serif tabular-nums mt-1" style={{ fontSize: 26, lineHeight: 1.05, fontWeight: 600, color: COLOR.navy }}>{ultimo?.peso != null ? `${kg(ultimo.peso)} kg` : '—'}</div>
          <div className="mt-1 tabular-nums" style={{ fontSize: 12, color: COLOR.muted }}>
            {ultimo ? `${fmtFecha(ultimo.fecha)}${difUlt != null ? ` · ${difUlt > 0 ? '+' : difUlt < 0 ? '−' : ''}${kg(Math.abs(difUlt))} kg contra la meta de esta semana` : ''}` : 'aún sin mediciones'}
          </div>
        </div>
        <div className="rounded-xl px-3.5 py-3" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
          <div style={{ font: '800 10.5px/1.2 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.goldText }}>Viernes cumplidos</div>
          <div className="serif tabular-nums mt-1" style={{ fontSize: 26, lineHeight: 1.05, fontWeight: 600, color: COLOR.navy }}>{cumplidas} <span style={{ fontSize: 15, fontWeight: 600, color: COLOR.muted }}>de {conDato.length}</span></div>
          <div className="mt-1" style={{ fontSize: 12, color: COLOR.muted }}>{conDato.length ? 'pesajes dentro de la banda' : 'todavía no hay viernes pesados'}</div>
        </div>
      </div>

      <Grafica d={d} filas={filas} actual={iAct >= 0 ? iAct : null} />

      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${COLOR.line}` }}>
        <table className="w-full text-left tabular-nums" style={{ fontSize: 13.5, borderCollapse: 'collapse' }}>
          <caption className="sr-only">Meta de cada viernes contra tu peso real</caption>
          <thead>
            <tr style={{ background: COLOR.navy, color: COLOR.onDark }}>
              {[['Viernes', ''], ['Meta', ''], ['Cuenta como cumplido', 'hidden md:table-cell'], ['Tu peso', ''], ['Estado', '']].map(([c, cls]) => <th key={c} scope="col" className={`px-2.5 sm:px-3 py-2 ${cls}`} style={{ fontSize: 12, fontWeight: 700 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const e = ESTADO[f.estado]
              const esAct = f.i === iAct
              return (
                <tr key={f.i} aria-current={esAct ? 'date' : undefined}
                  style={{ background: esAct ? '#FBF5E6' : f.i % 2 ? COLOR.card2 : '#fff', borderTop: `1px solid ${COLOR.line}`, boxShadow: esAct ? `inset 4px 0 0 ${COLOR.gold}` : 'none' }}>
                  <th scope="row" className="px-2.5 sm:px-3 py-2" style={{ fontWeight: 700, color: COLOR.navy }}>
                    <span style={{ color: COLOR.muted, fontWeight: 600, marginRight: 6 }}>{f.i + 1}</span>{corta(f.s.fecha)}
                    {esAct && <span className="ml-1.5 align-middle" style={{ font: '800 9.5px/1 var(--font-ui)', padding: '2px 5px', borderRadius: 99, background: COLOR.navy, color: '#fff' }}>ESTA</span>}
                  </th>
                  <td className="px-2.5 sm:px-3 py-2"><strong>{kg(f.s.meta)} kg</strong>{f.s.nota && <span className="block" style={{ fontSize: 11.5, color: COLOR.muted }}>{f.s.nota}</span>}</td>
                  <td className="px-3 py-2 hidden md:table-cell" style={{ color: COLOR.muted }}>{kg(f.s.meta - d.ref.tol)} a {kg(f.s.meta + d.ref.tol)} kg</td>
                  <td className="px-2.5 sm:px-3 py-2">{f.real?.peso != null ? <><strong>{kg(f.real.peso)} kg</strong>{f.dif != null && <span style={{ marginLeft: 6, fontSize: 12, color: COLOR.muted }}>{f.dif > 0 ? '+' : f.dif < 0 ? '−' : ''}{kg(Math.abs(f.dif))}</span>}</> : <span style={{ color: COLOR.muted }}>—</span>}</td>
                  <td className="px-2.5 sm:px-3 py-2 whitespace-nowrap" style={{ color: e.color, fontWeight: 700 }}><span aria-hidden style={{ marginRight: 4 }}>{e.icono}</span>{e.t}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Documento ───────────────────────────────────────────────────────────────

export default function PlanVista({ data, hoy }: { data: PesoRecord[]; hoy: string }) {
  return (
    <div className="space-y-5">
      <Portada />
      <Indice />
      <Secciones especial={tipo => tipo === 'semanas' ? <Semanas data={data} hoy={hoy} /> : null} />
    </div>
  )
}
