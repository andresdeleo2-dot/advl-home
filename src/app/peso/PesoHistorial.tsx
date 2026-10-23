'use client'

import { useMemo, useState } from 'react'
import { etapaActual, fmtFecha, hoyMX, mejorMarca } from '@/lib/peso'
import { UMBRAL_HUECO } from '@/lib/peso-visuals'
import { PERFIL_DEFAULT } from '@/lib/peso-perfil'
import type { PesoHistorialProps } from './contratos'
import { BTN, COLOR, Panel, Pill, Segmented } from './ui'
import { usePerfil } from './perfil-context'
import {
  DATO_COLOR, FOCO, TONO_COLOR, aniosDe, colorTexto, csvDeFilas, extremosPeso, filasHistorial, fmtGap, fmtSigned, tonoDelta,
} from './metricas'

// Pestaña Historial: tabla con encabezado fijo, primera columna fija en móvil, marcas del mejor y el peor peso,
// filtro por año y exportación a CSV. Δ peso e Intervalo se calculan contra la medición anterior de TODO el
// historial (ver filasHistorial), así que no cambian al filtrar.

const COLUMNAS = ['Fecha', 'Intervalo', 'Peso', 'Δ peso', '% Grasa', '% Músculo', 'IMC (báscula)', 'RMR', 'Edad corp.', 'Gr. visc.'] as const

// Fondos sólidos (no transparentes): la primera columna es sticky y no debe dejar ver lo que pasa por debajo al hacer scroll.
const FONDO = {
  normal: 'bg-white group-hover:bg-[#F6F3EA]',
  zebra: 'bg-[#FBFAF6] group-hover:bg-[#F6F3EA]',
  mejor: 'bg-[#EAF5EE] group-hover:bg-[#DFF0E5]',
  peor: 'bg-[#FBEDED] group-hover:bg-[#F6E0E0]',
} as const

// «Hueco» = intervalo de más de UMBRAL_HUECO días (la misma constante de la pestaña Resumen, en lib/peso-visuals). Antes
// aquí eran 90 d y allá 45 d: el mismo tramo de, p. ej., 69 días salía en ámbar en Constancia y sin marcar en esta tabla.
// El «días sin medirte» del hero (7 y 30 d) es otra cosa: mide cuánto llevas SIN medirte hoy, no un intervalo entre
// dos mediciones, por eso no comparte esta constante.
const COLOR_PCT_GRASA = colorTexto(DATO_COLOR.pct_grasa)       // versión AA para texto sobre las filas claras
const COLOR_PCT_MUSCULO = colorTexto(DATO_COLOR.pct_musculo)

export default function PesoHistorial({ data, onEdit, onDelete, deletingId }: PesoHistorialProps) {
  const perfil = usePerfil()
  const [anio, setAnio] = useState('todos')
  const [aviso, setAviso] = useState<string | null>(null)

  const filas = useMemo(() => filasHistorial(data), [data])
  const anios = useMemo(() => aniosDe(data), [data])
  const efectivo = anios.some(a => a.anio === anio) ? anio : 'todos'   // si el año filtrado desaparece (se borró), vuelve a "Todos"
  const visibles = useMemo(() => (efectivo === 'todos' ? filas : filas.filter(f => f.r.fecha.startsWith(efectivo))), [filas, efectivo])
  const { mejor, peor } = useMemo(() => extremosPeso(visibles), [visibles])

  // Contexto de etapa: el mínimo "histórico" puede ser de otra época (otro cuerpo, otra vida).
  const etapa = useMemo(() => etapaActual(data), [data])
  const mejorEtapa = useMemo(() => mejorMarca(etapa, 'peso'), [etapa])
  const peorEtapa = useMemo(() => mejorMarca(etapa, 'peso', 'max'), [etapa])
  const hayOtraEtapa = efectivo === 'todos' && etapa.length < data.length && mejorEtapa != null && peorEtapa != null

  const ocupado = deletingId != null

  function exportar() {
    try {
      const blob = new Blob([csvDeFilas(visibles)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `peso-${hoyMX()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1500)
      setAviso(`CSV descargado · ${visibles.length} ${visibles.length === 1 ? 'medición' : 'mediciones'}${efectivo !== 'todos' ? ` de ${efectivo}` : ''}`)
    } catch {
      setAviso('No se pudo generar el CSV. Intenta de nuevo.')
    }
  }

  if (!data.length) {
    return (
      <Panel eyebrow="Historial" icon="🗂️" title="Todas tus mediciones">
        <p className="py-8 text-center text-sm" style={{ color: COLOR.muted }}>Aún no hay mediciones. Cuando registres la primera aparecerá aquí.</p>
      </Panel>
    )
  }

  const th = (i: number) => ({
    className: `sticky top-0 whitespace-nowrap px-4 py-3 ${i === 0 ? 'left-0 z-30 text-left' : 'z-20 text-right'} bg-[#FBFAF6]`,
    style: { borderBottom: `1px solid ${COLOR.lineStrong}`, font: '800 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase' as const, color: COLOR.muted },
  })

  return (
    <Panel flush eyebrow="Historial" icon="🗂️" title="Todas tus mediciones"
      subtitle="«Intervalo» es el tiempo desde la medición anterior; «Δ peso», cuánto cambió contra ella."
      right={
        <button type="button" onClick={exportar} className={`${BTN.base} ${BTN.ghost} min-h-10 ${FOCO}`}>
          <svg aria-hidden width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.5v7m0 0L4 5.8m3 2.7l3-2.7M2 10.5v1.2c0 .4.3.8.8.8h8.4c.5 0 .8-.4.8-.8v-1.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Exportar CSV{efectivo !== 'todos' ? ` · ${efectivo}` : ''}
        </button>
      }>
      <div className="px-5 pb-3 pt-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {anios.length > 1 ? (
            <Segmented ariaLabel="Filtrar por año" value={efectivo} onChange={v => { setAnio(v); setAviso(null) }}
              options={[{ value: 'todos', label: 'Todos', count: filas.length }, ...anios.map(a => ({ value: a.anio, label: a.anio, count: a.n }))]} />
          ) : <span />}
          <span className="text-xs tabular-nums" style={{ color: COLOR.muted }}>
            {visibles.length} {visibles.length === 1 ? 'medición' : 'mediciones'} · {fmtFecha(visibles[visibles.length - 1].r.fecha)} → {fmtFecha(visibles[0].r.fecha)}
          </span>
        </div>

        {(mejor || peor) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {mejor && (
              <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs" style={{ background: '#15803d14', border: '1px solid #15803d33', color: COLOR.ink }}>
                <Pill color="#15803d" solid>Mejor</Pill>
                <strong className="tabular-nums">{mejor.r.peso} kg</strong> · {fmtFecha(mejor.r.fecha)}
              </span>
            )}
            {peor && (
              <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs" style={{ background: '#b91c1c12', border: '1px solid #b91c1c33', color: COLOR.ink }}>
                <Pill color="#b91c1c" solid>Peor</Pill>
                <strong className="tabular-nums">{peor.r.peso} kg</strong> · {fmtFecha(peor.r.fecha)}
              </span>
            )}
          </div>
        )}
        {hayOtraEtapa && (
          <p className="mt-2 text-[11px]" style={{ color: COLOR.muted }}>
            Desde que retomaste el registro ({fmtFecha(etapa[0].fecha)}): mejor {mejorEtapa!.valor} kg ({fmtFecha(mejorEtapa!.fecha)}) · peor {peorEtapa!.valor} kg ({fmtFecha(peorEtapa!.fecha)}).
          </p>
        )}
        <div aria-live="polite" role="status" className="min-h-0 text-xs font-medium" style={{ color: '#15803d' }}>{aviso && <p className="mt-2">{aviso}</p>}</div>
      </div>

      {/* Scroll propio: así el encabezado se queda fijo arriba y la fecha fija a la izquierda en el teléfono.
          `isolate` encierra los z-index de la tabla (10/20/30) en su propio contexto: sin él, la celda «Fecha» (z-30)
          competía con la barra de pestañas pegajosa (z-30) y, al ir después en el DOM, se pintaba encima de ella. */}
      <div role="region" aria-label="Tabla del historial de mediciones; se desplaza en horizontal y vertical" tabIndex={0}
        className={`isolate overflow-auto ${FOCO}`} style={{ maxHeight: '70vh', borderTop: `1px solid ${COLOR.line}` }}>
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Historial de mediciones de peso y composición corporal, de la más reciente a la más antigua</caption>
          <thead>
            <tr>
              {COLUMNAS.map((h, i) => <th key={h} scope="col" {...th(i)}>{h}</th>)}
              <th scope="col" {...th(COLUMNAS.length)}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => {
              const { r } = f
              const esMejor = mejor?.r.id === r.id, esPeor = peor?.r.id === r.id
              const fondo = esMejor ? FONDO.mejor : esPeor ? FONDO.peor : i % 2 ? FONDO.zebra : FONDO.normal
              const borrando = deletingId === r.id
              const hueco = f.gapDias != null && f.gapDias > UMBRAL_HUECO
              const tono = tonoDelta(f.dPeso, 'down')
              const celda = `px-4 py-2.5 text-right tabular-nums whitespace-nowrap ${fondo}`
              const linea = { borderBottom: `1px solid ${COLOR.line}` }
              return (
                <tr key={r.id} className={`group transition-colors ${borrando ? 'opacity-50' : ''}`} aria-busy={borrando || undefined}>
                  <th scope="row" className={`sticky left-0 z-10 whitespace-nowrap px-4 py-2.5 text-left font-semibold tabular-nums ${fondo}`}
                    style={{ ...linea, color: COLOR.navy, boxShadow: '3px 0 5px -3px rgba(15,35,64,.18)' }}>
                    {fmtFecha(r.fecha)}
                  </th>
                  <td className={celda} style={{ ...linea, color: hueco ? '#b45309' : COLOR.muted, fontWeight: hueco ? 700 : 400 }}
                    title={f.older ? `${fmtGap(f.older.fecha, r.fecha)} desde la medición del ${fmtFecha(f.older.fecha)}${hueco ? ` · más de ${UMBRAL_HUECO} días sin medirte` : ''}` : undefined}>
                    {f.older ? fmtGap(f.older.fecha, r.fecha) : '—'}
                  </td>
                  <td className={celda} style={linea}>
                    <span className="inline-flex items-center justify-end gap-2">
                      {esMejor && <Pill color="#15803d" solid>Mejor</Pill>}
                      {esPeor && <Pill color="#b91c1c" solid>Peor</Pill>}
                      <span className="text-base font-extrabold" style={{ color: COLOR.navy }}>{r.peso ?? '—'}</span>
                    </span>
                  </td>
                  <td className={`${celda} text-xs font-bold`} style={{ ...linea, color: TONO_COLOR[tono] }}>
                    {f.dPeso == null ? <span style={{ color: COLOR.muted }}>—</span> : f.dPeso === 0 ? '=' : fmtSigned(f.dPeso)}
                  </td>
                  <td className={celda} style={{ ...linea, color: r.pct_grasa == null ? COLOR.muted : COLOR_PCT_GRASA }}>{r.pct_grasa ?? '—'}</td>
                  <td className={celda} style={{ ...linea, color: r.pct_musculo == null ? COLOR.muted : COLOR_PCT_MUSCULO }}>{r.pct_musculo ?? '—'}</td>
                  <td className={celda} style={{ ...linea, color: r.imc == null ? COLOR.muted : COLOR.ink }}>{r.imc ?? '—'}</td>
                  <td className={celda} style={{ ...linea, color: r.rmr == null ? COLOR.muted : r.rmr >= 5000 ? '#b45309' : COLOR.ink }}
                    title={r.rmr != null && r.rmr >= 5000 ? 'Valor atípico: probable error de captura (no se grafica)' : undefined}>
                    {r.rmr ?? '—'}{r.rmr != null && r.rmr >= 5000 ? ' ⚠' : ''}
                  </td>
                  <td className={celda} style={{ ...linea, color: r.edad_corporal == null ? COLOR.muted : COLOR.ink }}>{r.edad_corporal ?? '—'}</td>
                  <td className={celda} style={{ ...linea, color: r.grasa_visceral == null ? COLOR.muted : COLOR.ink }}>{r.grasa_visceral ?? '—'}</td>
                  <td className={`px-3 py-1.5 text-right whitespace-nowrap ${fondo}`} style={linea}>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => onEdit(r)} disabled={ocupado} aria-label={`Editar la medición del ${fmtFecha(r.fecha)}`}
                        className={`inline-flex min-h-10 min-w-[64px] items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors hover:bg-[#0F23400d] disabled:cursor-not-allowed disabled:opacity-40 ${FOCO}`}
                        style={{ color: COLOR.navy }}>
                        Editar
                      </button>
                      <button type="button" onClick={() => onDelete(r)} disabled={ocupado} aria-label={`Borrar la medición del ${fmtFecha(r.fecha)}`}
                        className={`inline-flex min-h-10 min-w-[64px] items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 ${FOCO}`}
                        style={{ color: '#b91c1c' }}>
                        {borrando ? 'Borrando…' : 'Borrar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs sm:hidden" style={{ borderTop: `1px solid ${COLOR.line}`, color: COLOR.muted }}>
        Desliza la tabla hacia los lados: la fecha se queda fija.
      </p>
      {perfil.estatura_cm !== PERFIL_DEFAULT.estatura_cm && (
        <p className="px-5 py-3 text-xs" style={{ borderTop: `1px solid ${COLOR.line}`, color: COLOR.muted }}>
          La columna «IMC (báscula)» es la que anotó tu báscula, con su propia estatura; en el resto de la página el IMC se calcula con tu estatura de {perfil.estatura_cm} cm.
        </p>
      )}
    </Panel>
  )
}
