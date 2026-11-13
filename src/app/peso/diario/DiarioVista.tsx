'use client'

// «Mi diario»: el DÍA es lo principal (comida por comida, ejercicio, y qué tanto movió cada cosa tu balance); con la barra de
// arriba cambias de día o miras la semana, el mes o el año. Sin la tabla (sql/peso-06-diario.sql) la pantalla se ve pero no
// se puede anotar; con la lectura fallida tampoco (para no pisar lo que ya tenías anotado).

import { useMemo, useRef, useState } from 'react'
import type { ContenidoCarga } from '@/lib/peso-contenido'
import type { PesoRecord } from '@/lib/peso'
import {
  PERIODOS, acumuladoDelRango, barrasDelRango, etiquetaRango, listaDias, lunesDe, mapaDias, mesesDelRango, moverAncla, rangoDe, resumenPeriodo, sumaDias, totalesDia,
  type DiaDiario, type DiarioCarga, type Periodo,
} from '@/lib/peso-diario'
import { usePerfil } from '../perfil-context'
import { BTN, COLOR, Panel, Segmented } from '../ui'
import { leerDiarioApi } from './api'
import { AcumuladoGrafica, Cascada, Cifras, Grafica, Gustos, Hero, ListaDias, ListaMeses } from './Bloques'
import DiaVista, { fechaPendienteDiario } from './DiaVista'

export { hayBorradorDiario } from './DiaVista'

const ARCHIVO_SQL = 'peso-06-diario.sql'
const LETRAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null

export default function DiarioVista({ carga, onCarga, data, hoy, contenido, onMedir }: {
  carga: DiarioCarga
  /** Cambia el diario con una función (así un guardado que llega tarde no pisa lo que ya cambió). */
  onCarga: (f: (prev: DiarioCarga) => DiarioCarga) => void
  data: PesoRecord[]; hoy: string; contenido: ContenidoCarga; onMedir: () => void
}) {
  const perfil = usePerfil()
  const { dieta, rutina } = contenido.contenido
  const mapa = useMemo(() => mapaDias(carga.dias), [carga.dias])
  const ctx = useMemo(() => ({ perfil, registros: data }), [perfil, data])
  const primera = carga.dias[0]?.fecha ?? null
  const bloqueado = !carga.disponible || !!carga.error

  const [periodo, setPeriodo] = useState<Periodo>('dia')
  // Si quedó un día sin guardar (cambiaste de pestaña), se vuelve a abrir ese día tal como lo dejaste.
  const [ancla, setAncla] = useState(() => fechaPendienteDiario() ?? hoy)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [revisando, setRevisando] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  const rango = useMemo(() => rangoDe(periodo, ancla, primera, hoy), [periodo, ancla, primera, hoy])
  const resumen = useMemo(() => (periodo === 'dia' ? null : resumenPeriodo(mapa, ctx, rango, hoy)), [periodo, mapa, ctx, rango, hoy])
  const barras = useMemo(() => (periodo === 'dia' ? [] : barrasDelRango(mapa, ctx, rango, hoy)), [periodo, mapa, ctx, rango, hoy])
  const acum = useMemo(() => (periodo === 'dia' ? null : acumuladoDelRango(mapa, ctx, rango, hoy)), [periodo, mapa, ctx, rango, hoy])
  const dias = useMemo(() => (periodo === 'semana' || periodo === 'mes' ? listaDias(mapa, ctx, rango, hoy) : []), [periodo, mapa, ctx, rango, hoy])
  const meses = useMemo(
    () => (periodo === 'anio' || periodo === 'todo' ? mesesDelRango(rango, hoy).map(r => ({ rango: r, r: resumenPeriodo(mapa, ctx, r, hoy) })) : []),
    [periodo, mapa, ctx, rango, hoy],
  )
  const semana = useMemo(() => Array.from({ length: 7 }, (_, i) => sumaDias(lunesDe(ancla), i)), [ancla])

  function irADia(fecha: string) {
    setPeriodo('dia'); setAncla(fecha); setAviso(null)
    requestAnimationFrame(() => raiz.current?.scrollIntoView({ block: 'start', behavior: 'auto' }))
  }

  // Un día se guardó (o se borró): la página actualiza su lista sin volver a leer la base.
  const alGuardar = (fecha: string, dia: DiaDiario | null) => onCarga(prev => {
    const resto = prev.dias.filter(d => d.fecha !== fecha)
    return { ...prev, dias: dia ? [...resto, dia].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)) : resto, disponible: true }
  })
  const alFaltarTabla = () => onCarga(prev => ({ ...prev, disponible: false }))

  async function revisar() {
    if (revisando) return
    setRevisando(true); setAviso(null)
    const r = await leerDiarioApi()
    setRevisando(false)
    if (!r.ok) { setAviso({ tipo: 'error', texto: r.error.mensaje }); return }
    onCarga(() => ({ dias: r.data.dias, disponible: r.data.disponible }))
    setAviso(r.data.disponible
      ? { tipo: 'ok', texto: carga.disponible ? 'Listo: se leyó tu diario.' : '¡Listo! Ya puedes anotar tus días.' }
      : { tipo: 'error', texto: 'Todavía no existe la tabla. Pega el SQL en Supabase y vuelve a intentar.' })
  }

  const esHoy = periodo === 'dia' ? ancla === hoy : periodo === 'semana' || periodo === 'mes' || periodo === 'anio' ? rango.ini <= hoy && hoy <= rango.fin : false
  const siguienteNo = periodo === 'todo' || rango.fin >= hoy
  const vacio = carga.dias.length === 0

  return (
    <div ref={raiz} className="space-y-5" style={{ scrollMarginTop: 70 }}>
      <Panel
        eyebrow="Tu progreso" icon="📓" title="Mi diario"
        subtitle="Anota lo que comes en cada comida y si entrenaste; mira cuánto movió cada cosa tu balance y cómo se acumula."
        right={periodo !== 'dia' || ancla !== hoy ? <button type="button" onClick={() => irADia(hoy)} disabled={bloqueado} className={`${BTN.base} ${BTN.gold} min-h-10`}>＋ Anotar hoy</button> : undefined}
      >
        {carga.error && (
          <div role="alert" className="mb-4 rounded-xl px-4 py-3" style={{ background: '#FEF2F1', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.bad}` }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#7F1D1D' }}>
              <strong>No se pudo leer tu diario.</strong> Lo que tenías anotado no se borró; para no pisarlo, anotar está bloqueado hasta que se lea bien.
            </p>
            <button type="button" onClick={() => void revisar()} disabled={revisando} className={`${BTN.base} ${BTN.ghost} mt-2.5 min-h-10`}>{revisando ? 'Reintentando…' : 'Reintentar'}</button>
          </div>
        )}
        {!carga.disponible && !carga.error && (
          <div role="note" className="mb-4 rounded-xl px-4 py-3" style={{ background: '#FFF8E6', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.warn}` }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#5A3205' }}>
              <strong>Para guardar tus días falta un paso único en Supabase.</strong> Pega el archivo <code style={{ fontWeight: 700 }}>{ARCHIVO_SQL}</code> en el SQL Editor (está en tu carpeta Descargas, dentro de «PEGAR-EN-SUPABASE-PESO»).
            </p>
            <button type="button" onClick={() => void revisar()} disabled={revisando} className={`${BTN.base} ${BTN.ghost} mt-2.5 min-h-10`}>{revisando ? 'Revisando…' : 'Ya lo pegué, revisar'}</button>
          </div>
        )}
        <div role="status" aria-live="polite">
          {aviso && (
            <p className="mb-4 rounded-xl px-4 py-2.5" role={aviso.tipo === 'error' ? 'alert' : undefined}
              style={aviso.tipo === 'ok'
                ? { background: '#EFF9F2', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.good}`, color: '#14532D', fontSize: 13.5 }
                : { background: '#FEF2F1', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.bad}`, color: '#7F1D1D', fontSize: 13.5 }}>
              {aviso.texto}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Segmented<Periodo> ariaLabel="Periodo" value={periodo} onChange={p => { setPeriodo(p); setAviso(null); if (p === 'dia' && ancla > hoy) setAncla(hoy) }} options={PERIODOS} />
          {periodo !== 'todo' && (
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Periodo anterior" onClick={() => setAncla(moverAncla(periodo, ancla, -1))} className={`${BTN.base} ${BTN.ghost} min-h-10 min-w-10 px-0 text-base`}>‹</button>
              <span className="serif px-1 text-center" style={{ fontSize: 17, fontWeight: 600, color: COLOR.navy, minWidth: 150, textTransform: periodo === 'mes' ? 'capitalize' : undefined }}>{etiquetaRango(periodo, rango)}</span>
              <button type="button" aria-label="Periodo siguiente" disabled={siguienteNo} onClick={() => setAncla(moverAncla(periodo, ancla, 1))} className={`${BTN.base} ${BTN.ghost} min-h-10 min-w-10 px-0 text-base`}>›</button>
              {!esHoy && <button type="button" onClick={() => setAncla(hoy)} className={`${BTN.base} ${BTN.ghost} min-h-10`}>Hoy</button>}
            </div>
          )}
        </div>

        {periodo === 'dia' && (
          <div className="mt-3 grid grid-cols-7 gap-1.5" role="group" aria-label="Días de la semana">
            {semana.map((f, i) => {
              const d = mapa.get(f)
              const sel = f === ancla
              const futuro = f > hoy
              const b = d ? totalesDia(d, ctx).balance : null
              return (
                <button key={f} type="button" disabled={futuro} aria-pressed={sel} aria-label={`${etiquetaRango('dia', { ini: f, fin: f })}${d ? ', anotado' : ''}`} onClick={() => setAncla(f)}
                  className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8A6420]"
                  style={sel ? { background: COLOR.navy, borderColor: COLOR.navy, color: '#fff' } : { background: '#fff', borderColor: COLOR.lineStrong, color: COLOR.ink }}>
                  <span style={{ fontSize: 11, fontWeight: 700, opacity: sel ? 0.8 : 0.65 }}>{LETRAS[i]}</span>
                  <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>{+f.slice(8, 10)}</span>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 7, background: d ? (b == null ? COLOR.gold : b <= 0 ? '#4ADE80' : '#F87171') : 'transparent', border: d ? 'none' : `1.5px solid ${sel ? 'rgba(255,255,255,.45)' : COLOR.lineStrong}` }} />
                </button>
              )
            })}
          </div>
        )}
      </Panel>

      {periodo === 'dia' ? (
        <DiaVista
          key={ancla}
          fecha={ancla} hoy={hoy} guardado={mapa.get(ancla) ?? null} mapa={mapa} dieta={dieta} rutina={rutina} ctx={ctx}
          disponible={!bloqueado} onGuardado={alGuardar} onSinTabla={alFaltarTabla} onMedir={onMedir}
        />
      ) : vacio ? (
        <Panel eyebrow="Para empezar" icon="🌱" title="Aún no hay días anotados">
          <p style={{ fontSize: 14, lineHeight: 1.6, color: COLOR.ink }}>
            Cada día anota lo que comiste en cada comida (con un toque si fue lo de tu dieta), suma tus gustos (una cerveza, un chocolate, un pastel…) y di si entrenaste.
            Con eso verás cuánto ganas o pierdes por día, semana y mes, qué movió tu balance y cómo se acumula.
          </p>
          {!bloqueado && <button type="button" onClick={() => irADia(hoy)} className={`${BTN.base} ${BTN.gold} mt-3 min-h-11`}>＋ Anotar mi primer día</button>}
        </Panel>
      ) : resumen && acum && (
        <>
          <Hero r={resumen} periodo={periodo} etiqueta={etiquetaRango(periodo, rango)} esHoy={esHoy} onAnotar={() => irADia(hoy)} puedeAnotar={!bloqueado} />
          {resumen.anotados > 0 && <Cifras r={resumen} periodo={periodo} dieta={dieta} />}
          {resumen.incompletos > 0 && (
            <p role="note" className="rounded-xl px-4 py-2.5" style={{ background: '#FFF8E6', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.warn}`, color: '#5A3205', fontSize: 13.5, lineHeight: 1.5 }}>
              {resumen.incompletos} {resumen.incompletos === 1 ? 'día tiene' : 'días tienen'} comidas de tu dieta sin anotar: en ellos la cuenta se ve mejor de lo que fue. Los ves marcados con ⚠ en la lista.
            </p>
          )}
          <Cascada titulo="Qué movió tu balance" ver="periodo" impacto={resumen.impacto} balance={resumen.balance} calculables={resumen.calculables}
            sinDatos={resumen.anotados === 0 ? 'No hay nada anotado en este periodo.' : 'Falta tu peso para estimar cuánto gastas: registra una medición.'} />
          <AcumuladoGrafica a={acum} titulo="Tu acumulado" subtitulo={`Cómo se fue sumando lo que ganas o pierdes${periodo === 'todo' ? ' desde que empezaste' : ' en este periodo'}.`} />
          {resumen.anotados > 0 && <Grafica barras={barras} />}
          {resumen.anotados > 0 && <Gustos r={resumen} />}
          {(periodo === 'semana' || periodo === 'mes') && <ListaDias filas={dias} hoy={hoy} onVer={irADia} />}
          {(periodo === 'anio' || periodo === 'todo') && <ListaMeses meses={meses} onVer={ini => { setPeriodo('mes'); setAncla(ini) }} />}
        </>
      )}
    </div>
  )
}
