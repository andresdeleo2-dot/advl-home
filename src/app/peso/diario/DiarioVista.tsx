'use client'

// «Mi diario»: anotas cada día lo que comiste, tus gustos y tu ejercicio, y aquí ves cuánto ganaste o perdiste por día,
// semana, mes o año. Sin la tabla (sql/peso-06-diario.sql) la pantalla se ve pero no se puede anotar; con la lectura
// fallida tampoco (para no pisar lo que ya tenías anotado).

import { useMemo, useRef, useState } from 'react'
import type { ContenidoCarga } from '@/lib/peso-contenido'
import type { PesoRecord } from '@/lib/peso'
import {
  PERIODOS, barrasDelRango, diaNuevo, etiquetaRango, listaDias, mapaDias, mesesDelRango, moverAncla, rangoDe, resumenPeriodo,
  type DiaDiario, type DiarioCarga, type Periodo,
} from '@/lib/peso-diario'
import { usePerfil } from '../perfil-context'
import { BTN, COLOR, Panel, Segmented } from '../ui'
import { borrarDiaApi, guardarDiaApi, leerDiarioApi } from './api'
import DiaEditor from './DiaEditor'
import { Cifras, DetalleDia, Grafica, Gustos, Hero, ListaDias, ListaMeses } from './Bloques'

const ARCHIVO_SQL = 'peso-06-diario.sql'

/** Lo que se estaba escribiendo y no se guardó: vive mientras la página siga abierta, así que cambiar de pestaña no lo pierde. */
let borrador: { fecha: string; dia: DiaDiario } | null = null

/** ¿Quedó un día a medio anotar? Así «Rutinas y dietas» vuelve a abrir el diario al regresar a la pestaña. */
export const hayBorradorDiario = () => borrador !== null

type Editor = { fecha: string; base: DiaDiario; inicial: DiaDiario }
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null

export default function DiarioVista({ carga, onCarga, data, hoy, contenido, onMedir }: {
  carga: DiarioCarga; onCarga: (c: DiarioCarga) => void; data: PesoRecord[]; hoy: string; contenido: ContenidoCarga; onMedir: () => void
}) {
  const perfil = usePerfil()
  const { dieta, rutina } = contenido.contenido
  const mapa = useMemo(() => mapaDias(carga.dias), [carga.dias])
  const ctx = useMemo(() => ({ perfil, registros: data }), [perfil, data])
  const primera = carga.dias[0]?.fecha ?? null
  const bloqueado = !carga.disponible || !!carga.error

  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [ancla, setAncla] = useState(hoy)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [revisando, setRevisando] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  const plantilla = (fecha: string) => diaNuevo(fecha, dieta.comidas)
  const abrir = (fecha: string): Editor => {
    const guardado = mapa.get(fecha) ?? null
    const base = guardado ?? plantilla(fecha)
    return { fecha, base, inicial: borrador && borrador.fecha === fecha ? borrador.dia : base }
  }
  // Si quedó un borrador sin guardar (cambiaste de pestaña), se vuelve a abrir tal como lo dejaste.
  const [editor, setEditor] = useState<Editor | null>(() => (borrador && !bloqueado ? abrir(borrador.fecha) : null))

  const rango = useMemo(() => rangoDe(periodo, ancla, primera, hoy), [periodo, ancla, primera, hoy])
  const resumen = useMemo(() => resumenPeriodo(mapa, ctx, rango, hoy), [mapa, ctx, rango, hoy])
  const barras = useMemo(() => (periodo === 'dia' ? [] : barrasDelRango(mapa, ctx, rango, hoy)), [periodo, mapa, ctx, rango, hoy])
  const dias = useMemo(() => (periodo === 'semana' || periodo === 'mes' ? listaDias(mapa, ctx, rango, hoy) : []), [periodo, mapa, ctx, rango, hoy])
  const meses = useMemo(
    () => (periodo === 'anio' || periodo === 'todo' ? mesesDelRango(rango, hoy).map(r => ({ rango: r, r: resumenPeriodo(mapa, ctx, r, hoy) })) : []),
    [periodo, mapa, ctx, rango, hoy],
  )

  const sinCambiosPendientes = () => {
    if (!editor || !borrador) return true
    return JSON.stringify(borrador.dia) === JSON.stringify(editor.base) || window.confirm('Tienes un día sin guardar. ¿Descartarlo y abrir otro?')
  }
  const irAlEditor = () => requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }))
  function anotar(fecha: string) {
    if (bloqueado) return
    if (editor && editor.fecha === fecha) { irAlEditor(); return }
    if (!sinCambiosPendientes()) return
    borrador = null
    setAviso(null)
    setEditor(abrir(fecha))
    irAlEditor()
  }
  function cerrarEditor() { borrador = null; setEditor(null) }

  async function guardar(dia: DiaDiario): Promise<string | null> {
    const r = await guardarDiaApi(dia)
    if (!r.ok) {
      if (r.error.codigo === 'sin_tabla') onCarga({ ...carga, disponible: false })
      return r.error.mensaje
    }
    const nuevos = [...carga.dias.filter(d => d.fecha !== dia.fecha), r.data.dia].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    onCarga({ dias: nuevos, disponible: true })
    borrador = null
    setEditor(null)
    // Si el día guardado queda fuera de lo que se está viendo, se lleva la vista a él.
    if (dia.fecha < rango.ini || dia.fecha > rango.fin) setAncla(dia.fecha)
    setAviso({ tipo: 'ok', texto: 'Día guardado.' })
    raiz.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
    return null
  }
  async function borrar(): Promise<string | null> {
    if (!editor) return null
    const r = await borrarDiaApi(editor.fecha)
    if (!r.ok) {
      if (r.error.codigo === 'sin_tabla') onCarga({ ...carga, disponible: false })
      return r.error.mensaje
    }
    onCarga({ dias: carga.dias.filter(d => d.fecha !== editor.fecha), disponible: true })
    borrador = null
    setEditor(null)
    setAviso({ tipo: 'ok', texto: 'Día borrado.' })
    return null
  }
  async function revisar() {
    if (revisando) return
    setRevisando(true); setAviso(null)
    const r = await leerDiarioApi()
    setRevisando(false)
    if (!r.ok) { setAviso({ tipo: 'error', texto: r.error.mensaje }); return }
    onCarga({ dias: r.data.dias, disponible: r.data.disponible })
    setAviso(r.data.disponible
      ? { tipo: 'ok', texto: carga.disponible ? 'Listo: se leyó tu diario.' : '¡Listo! Ya puedes anotar tus días.' }
      : { tipo: 'error', texto: 'Todavía no existe la tabla. Pega el SQL en Supabase y vuelve a intentar.' })
  }

  const anotarAncla = () => anotar(periodo === 'dia' ? ancla : hoy)
  const esHoy = periodo === 'dia' ? ancla === hoy : periodo === 'semana' || periodo === 'mes' || periodo === 'anio' ? rango.ini <= hoy && hoy <= rango.fin : false
  const siguienteNo = periodo === 'todo' || rango.fin >= hoy
  const pesoDelDia = periodo === 'dia' ? ([...data].reverse().find(r => r.fecha === ancla && r.peso != null)?.peso ?? null) : null
  const vacio = carga.dias.length === 0

  return (
    <div ref={raiz} className="space-y-5" style={{ scrollMarginTop: 70 }}>
      <Panel
        eyebrow="Tu progreso" icon="📓" title="Mi diario"
        subtitle="Anota lo que comes y entrenas, y mira cuánto ganas o pierdes por día, semana, mes o año."
        right={<button type="button" onClick={() => anotar(hoy)} disabled={bloqueado} className={`${BTN.base} ${BTN.gold} min-h-10`}>＋ Anotar mi día</button>}
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
              <strong>Para anotar tus días falta un paso único en Supabase.</strong> Pega el archivo <code style={{ fontWeight: 700 }}>{ARCHIVO_SQL}</code> en el SQL Editor (está en tu carpeta Descargas, dentro de «PEGAR-EN-SUPABASE-PESO»).
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
          <Segmented<Periodo> ariaLabel="Periodo" value={periodo} onChange={p => { setPeriodo(p); setAviso(null) }} options={PERIODOS} />
          {periodo !== 'todo' && (
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Periodo anterior" onClick={() => setAncla(moverAncla(periodo, ancla, -1))} className={`${BTN.base} ${BTN.ghost} min-h-10 min-w-10 px-0 text-base`}>‹</button>
              <span className="serif px-1 text-center" style={{ fontSize: 17, fontWeight: 600, color: COLOR.navy, minWidth: 150, textTransform: periodo === 'mes' ? 'capitalize' : undefined }}>{etiquetaRango(periodo, rango)}</span>
              <button type="button" aria-label="Periodo siguiente" disabled={siguienteNo} onClick={() => setAncla(moverAncla(periodo, ancla, 1))} className={`${BTN.base} ${BTN.ghost} min-h-10 min-w-10 px-0 text-base`}>›</button>
              {!esHoy && <button type="button" onClick={() => setAncla(hoy)} className={`${BTN.base} ${BTN.ghost} min-h-10`}>Hoy</button>}
            </div>
          )}
        </div>
      </Panel>

      {editor && (
        <div ref={editorRef} style={{ scrollMarginTop: 70 }}>
          <DiaEditor
            key={editor.fecha}
            fecha={editor.fecha} hoy={hoy} base={editor.base} inicial={editor.inicial} dieta={dieta} rutina={rutina} ctx={ctx}
            pesoDelDia={[...data].reverse().find(r => r.fecha === editor.fecha && r.peso != null)?.peso ?? null}
            disponible={!bloqueado} existe={mapa.has(editor.fecha)}
            onCambio={d => { borrador = { fecha: editor.fecha, dia: d } }}
            onCambiarFecha={f => { borrador = null; setEditor(abrir(f)) }}
            onGuardar={guardar} onBorrar={borrar} onCerrar={cerrarEditor} onMedir={onMedir}
          />
        </div>
      )}

      {vacio && !editor ? (
        <Panel eyebrow="Para empezar" icon="🌱" title="Aún no hay días anotados">
          <p style={{ fontSize: 14, lineHeight: 1.6, color: COLOR.ink }}>
            Cada día marca cuáles comidas de tu dieta comiste completas, a medias o no; suma tus gustos (una cerveza, un chocolate, un pastel…) y el ejercicio que hiciste.
            Con eso verás cuánto ganas o pierdes por día, semana y mes, y cuánto te costaron los gustos.
          </p>
          {!bloqueado && <button type="button" onClick={() => anotar(hoy)} className={`${BTN.base} ${BTN.gold} mt-3 min-h-11`}>＋ Anotar mi primer día</button>}
        </Panel>
      ) : (
        <>
          <Hero r={resumen} periodo={periodo} etiqueta={etiquetaRango(periodo, rango)} esHoy={esHoy && periodo === 'dia'} onAnotar={anotarAncla} puedeAnotar={!bloqueado} />
          {resumen.anotados > 0 && <Cifras r={resumen} periodo={periodo} dieta={dieta} />}
          {periodo === 'dia' && <DetalleDia dia={mapa.get(ancla) ?? null} ctx={ctx} pesoDelDia={pesoDelDia} puedeEditar={!bloqueado} onEditar={() => anotar(ancla)} fecha={ancla} />}
          {resumen.anotados > 0 && <Gustos r={resumen} />}
          {periodo !== 'dia' && resumen.anotados > 0 && <Grafica barras={barras} />}
          {(periodo === 'semana' || periodo === 'mes') && <ListaDias filas={dias} hoy={hoy} onEditar={anotar} />}
          {(periodo === 'anio' || periodo === 'todo') && <ListaMeses meses={meses} onVer={ini => { setPeriodo('mes'); setAncla(ini) }} />}
        </>
      )}
    </div>
  )
}
