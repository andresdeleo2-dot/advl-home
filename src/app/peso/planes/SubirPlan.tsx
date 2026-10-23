'use client'

// Subir documentos HTML a la biblioteca: arrastrar y soltar (también clic y teclado), pegar el código,
// varios archivos en cola, validación ANTES de enviar y vista previa aislada (iframe srcDoc con el mismo
// sandbox que el visor, sin allow-same-origin) para ver cómo quedará antes de guardar.

import { useId, useMemo, useRef, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  MAX_DESCRIPCION, MAX_HTML_BYTES, MAX_TITULO, PLAN_IFRAME_SANDBOX, PLAN_TIPOS, adivinarTipo, htmlPareceCortado, limpiarHtml, tituloDesdeHtml,
  type PesoPlanMeta, type PlanTipo,
} from '@/lib/peso-planes'
import { COLOR, Eyebrow, INPUT, Segmented } from '../ui'
import { crearPlan } from './api'
import { FOCO, Icono, Spinner, TIPO_COLOR, btn, tipoInfo } from './comun'
import { useModal } from './hooks'
import { bytesDe, esArchivoHtml, fmtBytes, tituloDeArchivo, validarHtml } from './util'

const MAX_COLA = 10

type Estado = 'listo' | 'enviando' | 'ok' | 'fallo'
type Item = {
  key: string
  origen: 'archivo' | 'pegado'
  nombre: string
  html: string
  bytes: number
  cortado: boolean           // el HTML empieza como documento pero no termina en </html>: aviso no bloqueante
  titulo: string
  descripcion: string
  tipo: PlanTipo
  activar: boolean
  activarTocado: boolean     // si la persona ya decidió la casilla, cambiar el tipo no la mueve
  estado: Estado
  errorEnvio: string
}

let contador = 0
const nuevaClave = () => `it${++contador}`

const AVISO_CORTADO = 'Parece cortado: no termina en </html>. Pídele a Claude que lo termine.'

type Props = {
  planes: PesoPlanMeta[]
  /** Tipo que se estaba viendo: es el que se propone cuando el nombre y el título no dicen nada. */
  tipoActual: PlanTipo
  onCreado: (plan: PesoPlanMeta) => void
  /** Se llama una sola vez al cerrar, con cuántos documentos se alcanzaron a guardar y los avisos no fatales del servidor
   *  (p. ej. «se guardó pero no se pudo dejar en uso»). */
  onCerrar: (creados: number, avisos: string[]) => void
  onSinTabla: () => void
}

export default function SubirPlan({ planes, tipoActual, onCreado, onCerrar, onSinTabla }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tituloModalId = useId()
  const idPegar = useId()
  const idT = useId(), idD = useId()

  const [modo, setModo] = useState<'archivo' | 'pegar'>('archivo')
  const [items, setItems] = useState<Item[]>([])
  const [selKey, setSelKey] = useState<string | null>(null)
  const [pegado, setPegado] = useState('')
  const [avisos, setAvisos] = useState<string[]>([])        // archivos rechazados al leerlos / validarlos
  const [leyendo, setLeyendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [errorGlobal, setErrorGlobal] = useState('')         // errores que cortan la cola (sesión, falta la tabla)
  const creados = useRef(0)
  const avisosServidor = useRef<string[]>([])

  const sinEnUso = (tipo: PlanTipo) => !planes.some(p => p.tipo === tipo && p.activo)
  const bytesPegado = useMemo(() => bytesDe(pegado), [pegado])
  const sel = items.find(i => i.key === selKey) ?? items[0] ?? null
  const pendientes = items.filter(i => i.estado !== 'ok')
  const puedeEnviar = !enviando && !leyendo && pendientes.length > 0 && pendientes.every(i => i.titulo.trim().length > 0)

  function intentarCerrar() {
    if (enviando) return
    const sinSubir = items.some(i => i.estado !== 'ok') || pegado.trim() !== ''
    if (sinSubir && !window.confirm('¿Descartar lo que aún no has subido?')) return
    onCerrar(creados.current, avisosServidor.current)
  }
  useModal(raiz, intentarCerrar, inputRef)

  const parchar = (key: string, p: Partial<Item>) => setItems(prev => prev.map(i => (i.key === key ? { ...i, ...p } : i)))

  function crearItem(origen: Item['origen'], nombre: string, html: string, bytes: number): Item {
    const titulo = tituloDesdeHtml(html) || (origen === 'archivo' ? tituloDeArchivo(nombre, MAX_TITULO) : '')
    const adivinado = adivinarTipo(`${origen === 'archivo' ? nombre : ''} ${titulo}`)
    const tipo = adivinado !== 'otro' ? adivinado : tipoActual
    return {
      key: nuevaClave(), origen, nombre, html, bytes, cortado: htmlPareceCortado(html), titulo, descripcion: '', tipo,
      activar: sinEnUso(tipo), activarTocado: false, estado: 'listo', errorEnvio: '',
    }
  }

  async function agregarArchivos(archivos: File[]) {
    if (!archivos.length) return
    setLeyendo(true)
    setErrorGlobal('')
    const nuevos: Item[] = []
    const rechazos: string[] = []
    const cupo = MAX_COLA - items.length
    for (const f of archivos) {
      if (nuevos.length >= cupo) { rechazos.push(`Caben ${MAX_COLA} archivos a la vez; «${f.name}» no se agregó.`); continue }
      if (!esArchivoHtml(f.name, f.type)) { rechazos.push(`«${f.name}» no es un archivo HTML (.html o .htm).`); continue }
      if (f.size > MAX_HTML_BYTES) { rechazos.push(`«${f.name}» pesa ${fmtBytes(f.size)} y el máximo es ${fmtBytes(MAX_HTML_BYTES)}.`); continue }
      let html = ''
      try { html = await f.text() } catch { rechazos.push(`No se pudo leer «${f.name}». Intenta de nuevo.`); continue }
      // Se quitan las cercas ``` y la prosa de la conversación que se cuelan al copiar desde Claude: así el título, el
      // tamaño y la vista previa muestran lo que se guardará (el servidor repite la limpieza; es idempotente).
      html = limpiarHtml(html)
      const bytes = bytesDe(html)
      const err = validarHtml(html, bytes, MAX_HTML_BYTES)
      if (err) { rechazos.push(`«${f.name}»: ${err}`); continue }
      nuevos.push(crearItem('archivo', f.name, html, bytes))
    }
    if (nuevos.length) { setItems(prev => [...prev, ...nuevos]); setSelKey(nuevos[0].key) }
    setAvisos(rechazos)
    setLeyendo(false)
  }

  function agregarPegado() {
    if (items.length >= MAX_COLA) { setAvisos([`Caben ${MAX_COLA} documentos a la vez.`]); return }
    const html = limpiarHtml(pegado)          // igual que con los archivos: lo que se previsualiza es lo que se guardará
    const bytes = bytesDe(html)
    const err = validarHtml(html, bytes, MAX_HTML_BYTES)
    if (err) { setAvisos([`El HTML pegado: ${err}`]); return }
    const it = crearItem('pegado', 'pegado.html', html, bytes)
    setItems(prev => [...prev, it])
    setSelKey(it.key)
    setPegado('')
    setAvisos([])
    setErrorGlobal('')
  }

  function quitar(key: string) {
    const resto = items.filter(i => i.key !== key)
    setItems(resto)
    setSelKey(resto[0]?.key ?? null)
  }

  function cambiarTipo(it: Item, tipo: PlanTipo) {
    parchar(it.key, { tipo, ...(it.activarTocado ? {} : { activar: sinEnUso(tipo) }) })
  }

  async function enviar() {
    if (!puedeEnviar) return
    const cola = [...pendientes]
    setEnviando(true)
    setErrorGlobal('')
    let primerFallo: string | null = null
    let cortado = false
    for (const it of cola) {
      parchar(it.key, { estado: 'enviando', errorEnvio: '' })
      const r = await crearPlan({
        tipo: it.tipo, titulo: it.titulo.trim(), descripcion: it.descripcion.trim() || undefined, html: it.html, activar: it.activar,
      })
      if (r.ok) {
        parchar(it.key, { estado: 'ok' })
        creados.current += 1
        if (r.data.aviso) avisosServidor.current.push(r.data.aviso)
        onCreado(r.data.plan)
        continue
      }
      primerFallo ??= it.key
      parchar(it.key, { estado: 'fallo', errorEnvio: r.error.mensaje })
      if (r.error.codigo === 'sin_tabla') onSinTabla()
      if (r.error.codigo === 'sin_tabla' || r.error.status === 401 || r.error.status === 403) { setErrorGlobal(r.error.mensaje); cortado = true; break }
    }
    setEnviando(false)
    if (!primerFallo && !cortado) { onCerrar(creados.current, avisosServidor.current); return }
    if (primerFallo) setSelKey(primerFallo)
  }

  // Arrastrar archivos sobre CUALQUIER parte del diálogo los agrega (y evita que el navegador los abra).
  const traeArchivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
  const alArrastrar = (e: DragEvent) => { if (traeArchivos(e)) { e.preventDefault(); if (!enviando) setArrastrando(true) } }
  const alSalir = (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false) }
  const alSoltar = (e: DragEvent) => {
    if (!traeArchivos(e)) return
    e.preventDefault()
    setArrastrando(false)
    if (enviando) return
    setModo('archivo')
    void agregarArchivos(Array.from(e.dataTransfer.files))
  }

  const totalBytes = items.reduce((s, i) => s + i.bytes, 0)
  const nOk = items.length - pendientes.length
  const resumen = !items.length
    ? 'Elige un archivo o pega el código para empezar.'
    : enviando
      ? `Subiendo ${Math.min(nOk + 1, items.length)} de ${items.length}…`
      : `${pendientes.length} ${pendientes.length === 1 ? 'documento listo' : 'documentos listos'} para subir${nOk ? ` · ${nOk} ya guardado${nOk === 1 ? '' : 's'}` : ''} · ${fmtBytes(totalBytes)}`

  return createPortal(
    <div ref={raiz} role="dialog" aria-modal="true" aria-labelledby={tituloModalId} tabIndex={-1}
      className="pp-in fixed inset-0 flex items-end sm:items-center justify-center outline-none"
      style={{ zIndex: 300 }}
      onDragEnter={alArrastrar} onDragOver={alArrastrar} onDragLeave={alSalir} onDrop={alSoltar}>
      <div aria-hidden className="absolute inset-0" style={{ background: 'rgba(8,18,38,.68)' }} onClick={intentarCerrar} />

      <div className="pp-rise relative flex flex-col w-full sm:max-w-4xl overflow-hidden rounded-t-3xl sm:rounded-2xl"
        style={{ maxHeight: 'min(94dvh, 920px)', background: '#fff', boxShadow: '0 44px 90px -34px rgba(0,0,0,.65)' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#16365F,#C2933A 60%,#E7C56B)' }} />

        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-4 pb-3 shrink-0">
          <div className="min-w-0">
            <Eyebrow>Rutinas y dietas</Eyebrow>
            <h2 id={tituloModalId} className="serif mt-1" style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 600, color: COLOR.navy }}>Subir HTML</h2>
            <p className="mt-1" style={{ fontSize: 12.5, color: COLOR.muted }}>
              Archivos .html o .htm de hasta {fmtBytes(MAX_HTML_BYTES)}. Revisa cómo se ven antes de guardarlos.
            </p>
          </div>
          <button type="button" onClick={intentarCerrar} disabled={enviando} aria-label="Cerrar" title="Cerrar (Esc)"
            className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border shrink-0 transition-colors hover:border-[var(--gold-500)] disabled:opacity-40 ${FOCO}`}
            style={{ borderColor: COLOR.line, color: COLOR.navy2 }}>
            <Icono n="cerrar" size={18} />
          </button>
        </div>

        {/* Cuerpo con scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-5 space-y-4">
          <Segmented<'archivo' | 'pegar'> ariaLabel="Cómo agregar el HTML" value={modo} onChange={setModo} className="[&_button]:min-h-10 [&_button]:px-4"
            options={[{ value: 'archivo', label: <>Subir archivos</> }, { value: 'pegar', label: <>Pegar HTML</> }]} />

          {modo === 'archivo' ? (
            <label className={`block cursor-pointer rounded-2xl text-center transition-colors focus-within:ring-2 focus-within:ring-[var(--gold-500)]/45 ${items.length ? 'px-4 py-4' : 'px-4 py-9 sm:py-11'}`}
              style={{ border: `2px dashed ${arrastrando ? COLOR.gold : 'rgba(194,147,58,.55)'}`, background: arrastrando ? 'rgba(231,197,107,.2)' : '#FFFBF1' }}>
              <input ref={inputRef} type="file" multiple accept=".html,.htm,text/html" className="sr-only" disabled={enviando}
                onChange={e => { const lista = Array.from(e.target.files ?? []); e.target.value = ''; void agregarArchivos(lista) }} />
              {leyendo ? (
                <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: COLOR.navy2 }}><Spinner size={16} />Leyendo archivos…</span>
              ) : items.length ? (
                <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: COLOR.navy2 }}>
                  <Icono n="subir" size={17} />Añadir más archivos <span className="font-normal" style={{ color: COLOR.muted }}>(clic o arrastra)</span>
                </span>
              ) : (
                <>
                  <span aria-hidden className="mx-auto mb-3 inline-flex items-center justify-center rounded-full"
                    style={{ width: 54, height: 54, background: 'linear-gradient(135deg,#16365F,#0F2340)', color: COLOR.goldLight, boxShadow: '0 10px 24px -12px rgba(15,35,64,.8)' }}>
                    <Icono n="subir" size={24} />
                  </span>
                  <span className="serif block" style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 600, color: COLOR.navy }}>Arrastra tus archivos HTML aquí</span>
                  <span className="block mt-1.5 text-[13px]" style={{ color: COLOR.muted }}>
                    o <u className="underline-offset-2 font-semibold" style={{ color: COLOR.goldDark }}>toca para elegirlos</u> · puedes subir varios a la vez
                  </span>
                </>
              )}
            </label>
          ) : (
            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <label htmlFor={idPegar}><Eyebrow>Código HTML</Eyebrow></label>
                <span className="text-[11px] tabular-nums" style={{ color: bytesPegado > MAX_HTML_BYTES ? COLOR.bad : COLOR.faint }}>
                  {fmtBytes(bytesPegado)} de {fmtBytes(MAX_HTML_BYTES)}
                </span>
              </div>
              <textarea id={idPegar} className={`${INPUT} font-mono text-xs resize-y`} rows={8} spellCheck={false} autoCapitalize="off" autoCorrect="off"
                disabled={enviando} placeholder={'<!DOCTYPE html>\n<html lang="es">\n  …pega aquí todo el código que te dio Claude'}
                value={pegado} onChange={e => setPegado(e.target.value)} />
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={agregarPegado} disabled={!pegado.trim() || enviando} className={btn('primary')}>
                  <Icono n="check" />Revisar este HTML
                </button>
              </div>
            </div>
          )}

          {avisos.length > 0 && (
            <ul role="alert" className="space-y-1.5 rounded-xl p-3 text-[13px]" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#7F1D1D' }}>
              {avisos.map((a, i) => <li key={i} className="flex gap-2"><Icono n="alerta" size={15} className="mt-0.5" /><span>{a}</span></li>)}
            </ul>
          )}
          {errorGlobal && (
            <p role="alert" className="flex gap-2 rounded-xl p-3 text-[13px]" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#7F1D1D' }}>
              <Icono n="alerta" size={15} className="mt-0.5" /><span>{errorGlobal}</span>
            </p>
          )}

          {/* Cola */}
          {items.length > 1 && (
            <ul aria-label="Documentos por subir" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {items.map(i => {
                const on = i.key === sel?.key
                return (
                  <li key={i.key} className="shrink-0">
                    <button type="button" aria-pressed={on} onClick={() => setSelKey(i.key)}
                      className={`flex items-center gap-2 rounded-xl border px-3 min-h-10 max-w-[15rem] text-left transition-colors ${FOCO}`}
                      style={{ borderColor: on ? COLOR.gold : COLOR.line, background: on ? '#FFFCF4' : '#fff', boxShadow: on ? '0 0 0 2px rgba(194,147,58,.18)' : undefined }}>
                      <span style={{ color: i.estado === 'ok' ? COLOR.good : i.estado === 'fallo' ? COLOR.bad : i.estado === 'listo' && i.cortado ? COLOR.warn : COLOR.navy2 }}>
                        {i.estado === 'ok' ? <Icono n="check" size={15} /> : i.estado === 'fallo' || (i.estado === 'listo' && i.cortado) ? <Icono n="alerta" size={15} /> : i.estado === 'enviando' ? <Spinner size={14} /> : <Icono n="archivo" size={15} />}
                      </span>
                      <span className="truncate text-[13px] font-semibold" style={{ color: COLOR.navy }}>{i.titulo.trim() || i.nombre}</span>
                      <span className="shrink-0 text-[11px] tabular-nums" style={{ color: COLOR.faint }}>{fmtBytes(i.bytes)}</span>
                      <span className="sr-only">
                        {i.estado === 'ok' ? '(guardado)' : i.estado === 'fallo' ? '(falló)' : i.estado === 'enviando' ? '(subiendo)' : i.cortado ? '(listo para subir, parece cortado)' : '(listo para subir)'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Datos + vista previa del documento seleccionado */}
          {sel && (
            <section aria-label={`Datos de ${sel.titulo.trim() || sel.nombre}`} className="grid gap-5 md:grid-cols-2 items-start">
              <div className="space-y-3.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <Icono n="archivo" size={15} className="shrink-0" />
                    <span className="truncate text-[13px] font-semibold" style={{ color: COLOR.navy2 }}>{sel.origen === 'pegado' ? 'HTML pegado' : sel.nombre}</span>
                  </div>
                  <button type="button" onClick={() => quitar(sel.key)} disabled={enviando || sel.estado === 'ok'}
                    className={`${btn('ghost')} min-h-9!`}>
                    <Icono n="basura" size={14} />Quitar
                  </button>
                </div>

                {sel.cortado && sel.estado !== 'ok' && (
                  // Aviso, no bloqueo: un HTML sin </html> es válido y el navegador lo acepta, pero casi siempre es que Claude se quedó sin espacio.
                  <p role="status" className="flex gap-2 rounded-xl p-3 text-[13px]" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#78350F' }}>
                    <Icono n="alerta" size={15} className="mt-0.5" /><span>{AVISO_CORTADO}</span>
                  </p>
                )}

                {sel.estado === 'ok' ? (
                  <p role="status" className="flex gap-2 rounded-xl p-3 text-[13px]" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#14532D' }}>
                    <Icono n="check" size={15} className="mt-0.5" /><span>Este documento ya quedó guardado en la biblioteca.</span>
                  </p>
                ) : (
                  <>
                    <div>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <label htmlFor={idT}><Eyebrow>Título</Eyebrow></label>
                        <span className="text-[11px] tabular-nums" style={{ color: COLOR.faint }}>{sel.titulo.length}/{MAX_TITULO}</span>
                      </div>
                      <input id={idT} className={INPUT} value={sel.titulo} maxLength={MAX_TITULO} disabled={enviando}
                        aria-invalid={!sel.titulo.trim()} aria-describedby={!sel.titulo.trim() ? `${idT}-e` : undefined}
                        onChange={e => parchar(sel.key, { titulo: e.target.value })} />
                      {!sel.titulo.trim() && <p id={`${idT}-e`} className="mt-1 text-xs" style={{ color: COLOR.bad }}>Escribe un título para poder subirlo.</p>}
                    </div>

                    <div>
                      <div className="mb-1"><Eyebrow>Tipo</Eyebrow></div>
                      <Segmented<PlanTipo> ariaLabel="Tipo de documento" value={sel.tipo} onChange={t => cambiarTipo(sel, t)} className="[&_button]:min-h-10"
                        options={PLAN_TIPOS.map(o => ({ value: o.value, label: <>{o.icon} {o.label}</> }))} />
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <label htmlFor={idD}><Eyebrow>Descripción <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, color: COLOR.faint }}>(opcional)</span></Eyebrow></label>
                        <span className="text-[11px] tabular-nums" style={{ color: COLOR.faint }}>{sel.descripcion.length}/{MAX_DESCRIPCION}</span>
                      </div>
                      <textarea id={idD} className={`${INPUT} resize-y`} rows={3} value={sel.descripcion} maxLength={MAX_DESCRIPCION} disabled={enviando}
                        placeholder="¿De qué trata? Se ve en la tarjeta de la biblioteca." onChange={e => parchar(sel.key, { descripcion: e.target.value })} />
                    </div>

                    <label className="flex items-start gap-3 rounded-xl p-3 cursor-pointer"
                      style={{ border: `1px solid ${sel.activar ? 'rgba(194,147,58,.55)' : COLOR.line}`, background: sel.activar ? '#FFFBF1' : COLOR.card2 }}>
                      <input type="checkbox" checked={sel.activar} disabled={enviando} onChange={e => parchar(sel.key, { activar: e.target.checked, activarTocado: true })}
                        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer" style={{ accentColor: COLOR.gold }} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: COLOR.navy }}>
                          Usar como {sel.tipo === 'otro' ? 'el documento' : `mi ${tipoInfo(sel.tipo).label.toLowerCase()}`} en uso
                        </span>
                        <span className="block text-xs mt-0.5" style={{ color: COLOR.muted }}>
                          {(() => {
                            const actual = planes.find(p => p.tipo === sel.tipo && p.activo)
                            return actual
                              ? <>Es el que verás en el Resumen. {sel.activar ? <>Reemplaza a «{actual.titulo}».</> : <>Hoy está en uso «{actual.titulo}».</>}</>
                              : <>Es el que verás en el Resumen. Aún no tienes uno en uso.</>
                          })()}
                        </span>
                      </span>
                    </label>

                    {sel.errorEnvio && (
                      <p role="alert" className="flex gap-2 rounded-xl p-3 text-[13px]" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#7F1D1D' }}>
                        <Icono n="alerta" size={15} className="mt-0.5" /><span>{sel.errorEnvio}</span>
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <Eyebrow>Vista previa</Eyebrow>
                  <span className="text-[11px] tabular-nums" style={{ color: COLOR.faint }}>{fmtBytes(sel.bytes)}</span>
                </div>
                <div className="rounded-xl p-1.5" style={{ background: 'linear-gradient(180deg,#EEEADF,#E7E2D4)', boxShadow: `0 18px 36px -26px rgba(15,35,64,.6), inset 0 0 0 1px ${COLOR.line}`, borderTop: `3px solid ${TIPO_COLOR[sel.tipo]}` }}>
                  <iframe
                    key={sel.key}
                    srcDoc={sel.html}
                    title={`Vista previa de ${sel.titulo.trim() || sel.nombre}`}
                    sandbox={PLAN_IFRAME_SANDBOX}
                    referrerPolicy="no-referrer"
                    className="block w-full rounded-lg border-0"
                    style={{ height: 'min(52vh, 460px)', background: '#fff' }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: COLOR.muted }}>
                  Así se verá. La vista previa está aislada: el documento no puede leer tu sesión ni tus datos.
                </p>
              </div>
            </section>
          )}
        </div>

        {/* Pie */}
        <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 px-5 sm:px-6 pt-3.5"
          style={{ borderTop: `1px solid ${COLOR.line}`, background: COLOR.card2, paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
          <p aria-live="polite" className="flex-1 basis-52 text-xs" style={{ color: COLOR.muted }}>{resumen}</p>
          <button type="button" onClick={intentarCerrar} disabled={enviando} className={btn('ghost')}>Cancelar</button>
          <button type="button" onClick={enviar} disabled={!puedeEnviar} className={btn('gold')}>
            {enviando
              ? <><Spinner />Subiendo…</>
              : <><Icono n="subir" size={16} />{pendientes.length > 1 ? `Subir ${pendientes.length} documentos` : 'Subir documento'}</>}
          </button>
        </div>

        {arrastrando && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4" style={{ background: 'rgba(255,251,241,.9)' }}>
            <div className="w-full h-full rounded-2xl flex flex-col items-center justify-center gap-2" style={{ border: `3px dashed ${COLOR.gold}` }}>
              <Icono n="subir" size={34} className="text-[var(--gold-700)]" />
              <span className="serif" style={{ fontSize: 26, fontWeight: 600, color: COLOR.navy }}>Suelta tus archivos HTML</span>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
