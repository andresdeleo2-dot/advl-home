'use client'

// Rutinas y dietas: biblioteca de documentos HTML (los que armas con Claude u otra herramienta) que
// /peso proyecta en un visor aislado. Este archivo orquesta el estado; las piezas viven en ./planes/.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { hoyMX } from '@/lib/peso'
import { PLAN_TIPOS, buildPromptPlan, contextoPrompt, type PesoPlanMeta, type PlanTipo } from '@/lib/peso-planes'
import type { PesoPlanesProps } from './contratos'
import { usePerfil } from './perfil-context'
import { COLOR, Panel, Segmented } from './ui'
import { actualizarPlan, eliminarPlan, listarPlanes, type ErrorApi } from './planes/api'
import Biblioteca from './planes/Biblioteca'
import { Estilos, Icono, btn, tipoInfo, type Ocupado } from './planes/comun'
import ErrorLista from './planes/ErrorLista'
import { copiarAlPortapapeles, useCopiado, useHoy } from './planes/hooks'
import PanelPrompt from './planes/PanelPrompt'
import Proyector from './planes/Proyector'
import SinTabla, { ARCHIVO_SQL } from './planes/SinTabla'
import SubirPlan from './planes/SubirPlan'
import { PLANES_EVENTO, aplicarPlan, elegirPlan, ordenarPlanes, siguienteTras, tipoInicial } from './planes/util'
import VacioPlanes from './planes/VacioPlanes'
import VisorPlan, { type CambiosPlan } from './planes/VisorPlan'

export { PlanesEnUso } from './planes/EnUso'

type Aviso = { tipo: 'ok' | 'error'; texto: string }

/** Última lista conocida en esta sesión del navegador. PesoClient monta esta pestaña de nuevo cada vez que se abre, con la
 *  lista que él tiene; si él no se entera de los cambios (ver PLANES_EVENTO), sin esto un documento borrado "reaparecería"
 *  al volver. Solo vale mientras el padre siga pasando el MISMO `inicial` (si lo actualiza, manda lo que él diga). El
 *  servidor nunca la escribe (solo se llena en acciones del cliente), así que no hay desajuste de hidratación. */
let memoria: { origen: PesoPlanMeta[]; planes: PesoPlanMeta[]; disponible: boolean } | null = null

function Paso({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-flex items-center justify-center rounded-full tabular-nums shrink-0"
        style={{ width: 18, height: 18, fontSize: 10.5, fontWeight: 800, background: 'rgba(194,147,58,.18)', color: COLOR.goldDark }}>{n}</span>
      <span>{children}</span>
    </li>
  )
}

export default function PesoPlanes({ inicial, disponible: dispInicial, data, plan, seleccionInicial = null, error = null }: PesoPlanesProps) {
  const origenRef = useRef(inicial)                          // el `inicial` con el que arrancó este montaje
  const [arranque] = useState(() => (memoria && memoria.origen === inicial ? memoria : { planes: inicial, disponible: dispInicial }))
  const [planes, setPlanes] = useState<PesoPlanMeta[]>(arranque.planes)
  const planesRef = useRef<PesoPlanMeta[]>(arranque.planes)  // la última lista, para las acciones asíncronas
  const [disponible, setDisponible] = useState(arranque.disponible)
  const disponibleRef = useRef(arranque.disponible)
  // Si la lectura de la lista falló (`error`) y no hay ninguna lista conocida, `planes` está vacío por eso: se avisa en vez
  // de pintar «Aún no tienes rutinas». `recuperada` = un reintento local ya leyó la lista. Nada de esto toca `memoria`:
  // solo una lectura buena o una acción del servidor la escriben, así que un fallo nunca la pisa con [].
  const [recuperada, setRecuperada] = useState(false)
  const [tipo, setTipo] = useState<PlanTipo>(() => tipoInicial(arranque.planes, seleccionInicial))
  const [pref, setPref] = useState<string | null>(seleccionInicial)   // el documento que la persona eligió (si no, el "en uso" / el más reciente)
  const [subiendo, setSubiendo] = useState(false)
  const [proyectando, setProyectando] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<Ocupado | null>(null)
  const ocupadoRef = useRef(false)                            // freno síncrono: dos clics seguidos no lanzan dos peticiones
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const titulosCreados = useRef<string[]>([])
  const [panelPrompt, setPanelPrompt] = useState<{ tipo: PlanTipo; texto: string; fallo: boolean } | null>(null)
  const [anuncio, setAnuncio] = useState('')
  const raiz = useRef<HTMLDivElement>(null)
  const hoy = useHoy()
  const perfil = usePerfil()   // el prompt usa sus datos reales (edad, actividad, lesiones, restricciones...) en vez de supuestos
  const prompt = useCopiado()

  // ── Derivados ──────────────────────────────────────────────────────────────
  const lista = useMemo(() => ordenarPlanes(planes.filter(p => p.tipo === tipo)), [planes, tipo])
  const sel = useMemo(() => elegirPlan(planes, tipo, pref), [planes, tipo, pref])
  const conteo = useMemo(() => {
    const c: Record<PlanTipo, number> = { rutina: 0, dieta: 0, otro: 0 }
    for (const p of planes) c[p.tipo] += 1
    return c
  }, [planes])
  const proyectado = proyectando ? planes.find(p => p.id === proyectando) ?? null : null
  const sinLista = !!error && !recuperada && !planes.length

  // "Ver" desde la pestaña Resumen: si llega un id (también si cambia con el componente ya montado), se abre ese documento.
  useEffect(() => {
    if (!seleccionInicial) return
    const p = planesRef.current.find(x => x.id === seleccionInicial)
    if (p) { setTipo(p.tipo); setPref(p.id) }
  }, [seleccionInicial])

  useEffect(() => () => clearTimeout(avisoTimer.current), [])

  // ── Avisos ─────────────────────────────────────────────────────────────────
  const avisar = useCallback((t: Aviso['tipo'], texto: string) => {
    clearTimeout(avisoTimer.current)
    setAviso({ tipo: t, texto })
    if (t === 'ok') avisoTimer.current = setTimeout(() => setAviso(null), 4500)
  }, [])

  const anunciar = useCallback((texto: string) => {
    setAnuncio('')                                    // vacía primero para que el lector repita un mensaje igual
    requestAnimationFrame(() => setAnuncio(texto))
  }, [])

  const fijarDisponible = useCallback((v: boolean) => {
    disponibleRef.current = v
    memoria = { origen: origenRef.current, planes: planesRef.current, disponible: v }
    setDisponible(v)
  }, [])

  const falla = useCallback((e: ErrorApi) => {
    if (e.codigo === 'sin_tabla') fijarDisponible(false)
    avisar('error', e.mensaje)
  }, [avisar, fijarDisponible])

  // ── Lista ──────────────────────────────────────────────────────────────────
  const cambiarLista = useCallback((fn: (prev: PesoPlanMeta[]) => PesoPlanMeta[]) => {
    const nueva = fn(planesRef.current)
    planesRef.current = nueva
    memoria = { origen: origenRef.current, planes: nueva, disponible: disponibleRef.current }
    setPlanes(nueva)
    window.dispatchEvent(new CustomEvent<PesoPlanMeta[]>(PLANES_EVENTO, { detail: nueva }))
  }, [])

  /** Ejecuta una acción del servidor de a una a la vez (las demás se ignoran y los botones se deshabilitan). */
  async function correr(accion: Ocupado['accion'], id: string | null, tarea: () => Promise<boolean>) {
    if (ocupadoRef.current) return false
    ocupadoRef.current = true
    setOcupado({ accion, id })
    clearTimeout(avisoTimer.current)
    setAviso(null)
    try { return await tarea() } finally { ocupadoRef.current = false; setOcupado(null) }
  }

  function enfocarTrasBorrar() {
    requestAnimationFrame(() => {
      const el = raiz.current?.querySelector<HTMLElement>('[data-plan-id] button[aria-pressed="true"]')
        ?? raiz.current?.querySelector<HTMLElement>('[data-foco-vacio]')
      el?.focus()
    })
  }

  // ── Acciones ───────────────────────────────────────────────────────────────
  function marcarEnUso(id: string) {
    return correr('uso', id, async () => {
      const r = await actualizarPlan(id, { activo: true })
      if (!r.ok) { falla(r.error); return false }
      cambiarLista(prev => aplicarPlan(prev, r.data))
      avisar('ok', `«${r.data.titulo}» quedó como ${r.data.tipo === 'otro' ? 'documento' : tipoInfo(r.data.tipo).label.toLowerCase()} en uso.`)
      return true
    })
  }

  function editar(p: PesoPlanMeta, cambios: CambiosPlan) {
    return correr('editar', p.id, async () => {
      const r = await actualizarPlan(p.id, cambios)
      if (!r.ok) { falla(r.error); return false }
      cambiarLista(prev => aplicarPlan(prev, r.data))
      if (r.data.tipo !== tipo) { setTipo(r.data.tipo); setPref(r.data.id) }   // si cambió de tipo, lo seguimos hasta su nueva pestaña
      avisar('ok', 'Cambios guardados.')
      return true
    })
  }

  function eliminar(p: PesoPlanMeta) {
    return correr('borrar', p.id, async () => {
      const siguiente = siguienteTras(planesRef.current, p.id)
      const r = await eliminarPlan(p.id)
      if (!r.ok) { falla(r.error); return false }
      cambiarLista(prev => prev.filter(x => x.id !== p.id))
      setPref(siguiente?.id ?? null)
      setProyectando(cur => (cur === p.id ? null : cur))
      avisar('ok', `«${p.titulo}» se eliminó.`)
      enfocarTrasBorrar()
      return true
    })
  }

  function revisarTabla() {
    return correr('revisar', null, async () => {
      const r = await listarPlanes()
      if (!r.ok) { falla(r.error); return false }
      if (!r.data.disponible) { avisar('error', 'Todavía no existe la tabla. Corre el SQL en Supabase y vuelve a intentar.'); return false }
      cambiarLista(() => r.data.planes)
      setTipo(tipoInicial(r.data.planes, null))
      setPref(null)
      fijarDisponible(true)
      avisar('ok', '¡Listo! La tabla ya existe: ya puedes subir tus documentos.')
      return true
    })
  }

  /** «Reintentar» tras fallar la lectura de la lista: vuelve a consultar y, solo si funciona, reemplaza la lista. */
  function reintentarLista() {
    return correr('revisar', null, async () => {
      const r = await listarPlanes()
      if (!r.ok) { falla(r.error); return false }
      setRecuperada(true)
      if (!r.data.disponible) { fijarDisponible(false); return false }
      cambiarLista(() => r.data.planes)       // también avisa a PesoClient (PLANES_EVENTO), que así quita su propio aviso de error
      setTipo(tipoInicial(r.data.planes, null))
      setPref(null)
      return true
    })
  }

  // ── Prompt para Claude ─────────────────────────────────────────────────────
  /** El prompt con los datos de ahora. «Hoy» se toma AL ARMARLO (hoyMX, la misma fuente que useHoy y el resto de /peso)
   *  y no del estado `hoy`, que se fija al montar la pestaña y quedaría viejo si la dejas abierta de un día para otro. */
  const generarPrompt = (t: PlanTipo) => buildPromptPlan(t, contextoPrompt(data, plan, hoyMX(), perfil))

  async function copiarPrompt() {
    // Con el panel abierto este botón NO regenera el texto (se perdería lo que se editó): lleva el foco al cuadro,
    // que tiene su propio botón Copiar.
    if (panelPrompt) {
      raiz.current?.querySelector<HTMLTextAreaElement>('[data-panel-prompt]')?.focus()
      return
    }
    // «Otros» necesita un tema: nunca se copia a ciegas con el marcador sin editar. Se abre el panel, que enfoca el cuadro
    // con la línea del tema ya seleccionada.
    if (tipo === 'otro') {
      setPanelPrompt({ tipo, texto: generarPrompt(tipo), fallo: false })
      anunciar('Escribe el tema que quieres y toca Copiar.')
      return
    }
    const texto = generarPrompt(tipo)
    if (await copiarAlPortapapeles(texto)) {
      prompt.marcar('prompt')
      anunciar('¡Copiado! Pégalo en Claude.')
    } else {
      setPanelPrompt({ tipo, texto, fallo: true })
      anunciar('No se pudo copiar de forma automática. Selecciona el texto del prompt y cópialo.')
    }
  }

  function alternarPrompt() {
    if (panelPrompt) setPanelPrompt(null)
    else setPanelPrompt({ tipo, texto: generarPrompt(tipo), fallo: false })
  }

  async function copiarNombreSql() {
    if (await copiarAlPortapapeles(ARCHIVO_SQL)) { prompt.marcar('sql'); anunciar('¡Copiado!') }
    else avisar('error', `No se pudo copiar. El archivo es ${ARCHIVO_SQL}.`)
  }

  function cambiarTipo(t: PlanTipo) {
    setTipo(t)
    setPref(null)
    setPanelPrompt(null)
  }

  function alCerrarSubir(n: number, avisosServidor: string[]) {
    setSubiendo(false)
    const titulos = titulosCreados.current
    titulosCreados.current = []
    if (avisosServidor.length) avisar('error', avisosServidor[0])      // se guardó, pero algo no salió del todo (p. ej. no quedó «en uso»)
    else if (n === 1) avisar('ok', `«${titulos[titulos.length - 1] ?? 'El documento'}» quedó guardado en la biblioteca.`)
    else if (n > 1) avisar('ok', `Se guardaron ${n} documentos en la biblioteca.`)
  }

  function alCrearse(p: PesoPlanMeta) {
    cambiarLista(prev => aplicarPlan(prev, p))
    titulosCreados.current.push(p.titulo)
    setTipo(p.tipo)
    setPref(p.id)
    setPanelPrompt(null)
  }

  const ocupadoVisor = !ocupado ? null : sel && ocupado.id === sel.id ? ocupado.accion : 'otro'

  return (
    <div ref={raiz} className="pp-root">
      <Estilos />

      <div className="space-y-5">
        {!disponible ? (
          <SinTabla revisando={ocupado?.accion === 'revisar'} copiado={prompt.copiado === 'sql'} onCopiar={copiarNombreSql} onReintentar={revisarTabla} />
        ) : sinLista ? (
          <ErrorLista reintentando={ocupado?.accion === 'revisar'} onReintentar={() => void reintentarLista()} />
        ) : (
          <>
            <Panel
              eyebrow="Biblioteca"
              icon="🏋️"
              title="Rutinas y dietas"
              subtitle="Tus documentos en HTML, proyectados con buen diseño y siempre a la mano."
              right={
                <button type="button" onClick={() => setSubiendo(true)} className={btn('gold')}>
                  <Icono n="mas" size={16} />Subir HTML
                </button>
              }
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <Segmented<PlanTipo> ariaLabel="Tipo de documento" value={tipo} onChange={cambiarTipo} className="[&_button]:min-h-10 [&_button]:px-3.5"
                    options={PLAN_TIPOS.map(o => ({ value: o.value, label: <>{o.icon} {o.plural}</>, count: conteo[o.value] }))} />
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={alternarPrompt} aria-expanded={!!panelPrompt} title="Ver el texto del prompt"
                      className={`${btn('ghost')} w-10 px-0!`} aria-label="Ver el prompt para Claude">
                      <Icono n="ojo" size={16} />
                    </button>
                    <button type="button" onClick={copiarPrompt} className={btn('ghost')}
                      title={`Copia un prompt para pedirle a Claude ${tipo === 'rutina' ? 'una rutina' : tipo === 'dieta' ? 'una dieta' : 'un documento'} con tus datos`}>
                      <Icono n={prompt.copiado === 'prompt' ? 'check' : 'chispa'} size={15} />
                      {prompt.copiado === 'prompt' ? '¡Copiado!' : 'Copiar prompt'}
                    </button>
                  </div>
                </div>

                {panelPrompt && (
                  <PanelPrompt tipo={panelPrompt.tipo} texto={panelPrompt.texto} fallo={panelPrompt.fallo} copiado={prompt.copiado === 'prompt'}
                    onCopiado={() => prompt.marcar('prompt')} onCerrar={() => setPanelPrompt(null)} />
                )}

                {lista.length > 0 ? (
                  <>
                    <ol aria-label="Cómo agregar un documento" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] leading-snug" style={{ color: COLOR.muted }}>
                      <Paso n={1}>Copia el prompt</Paso>
                      <Paso n={2}>Pégalo en Claude y guarda el HTML que te da</Paso>
                      <Paso n={3}>Súbelo aquí</Paso>
                    </ol>
                    <Biblioteca
                      lista={lista}
                      selId={sel?.id ?? null}
                      hoy={hoy}
                      ocupado={ocupado}
                      onSel={setPref}
                      onProyectar={id => { setPref(id); setProyectando(id) }}
                      onMarcarEnUso={id => void marcarEnUso(id)}
                    />
                  </>
                ) : (
                  <VacioPlanes tipo={tipo} copiado={prompt.copiado === 'prompt'} onSubir={() => setSubiendo(true)} onCopiarPrompt={copiarPrompt} />
                )}
              </div>
            </Panel>

            {sel && (
              <VisorPlan
                key={sel.id}
                plan={sel}
                hoy={hoy}
                ocupado={ocupadoVisor}
                onProyectar={() => setProyectando(sel.id)}
                onMarcarEnUso={() => void marcarEnUso(sel.id)}
                onEditar={c => editar(sel, c)}
                onEliminar={() => eliminar(sel)}
              />
            )}
          </>
        )}
      </div>

      {/* Avisos: dos regiones siempre montadas (los lectores de pantalla solo anuncian cambios en regiones que ya existen). */}
      <div className="pointer-events-none fixed inset-x-0 flex justify-center px-4" style={{ bottom: 'max(16px, env(safe-area-inset-bottom))', zIndex: 320 }}>
        <div className="w-full max-w-md">
          <div role="status" aria-live="polite">
            {aviso?.tipo === 'ok' && (
              <div className="pp-in pointer-events-auto flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm"
                style={{ background: '#0F2340', color: COLOR.onDark, boxShadow: '0 18px 40px -16px rgba(0,0,0,.6)', border: '1px solid rgba(231,197,107,.35)' }}>
                <Icono n="check" size={17} className="mt-0.5 text-[var(--gold-300)]" />
                <span className="flex-1 min-w-0">{aviso.texto}</span>
                <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="-m-1.5 p-1.5 rounded-lg hover:bg-white/10"><Icono n="cerrar" size={15} /></button>
              </div>
            )}
          </div>
          <div role="alert">
            {aviso?.tipo === 'error' && (
              <div className="pp-in pointer-events-auto flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm"
                style={{ background: '#FEF2F2', color: '#7F1D1D', boxShadow: '0 18px 40px -16px rgba(127,29,29,.5)', border: '1px solid #FECACA' }}>
                <Icono n="alerta" size={17} className="mt-0.5" />
                <span className="flex-1 min-w-0">{aviso.texto}</span>
                <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="-m-1.5 p-1.5 rounded-lg hover:bg-red-100"><Icono n="cerrar" size={15} /></button>
              </div>
            )}
          </div>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{anuncio}</p>

      {subiendo && (
        <SubirPlan planes={planes} tipoActual={tipo} onCreado={alCrearse} onCerrar={alCerrarSubir} onSinTabla={() => fijarDisponible(false)} />
      )}
      {proyectado && <Proyector plan={proyectado} onCerrar={() => setProyectando(null)} />}
    </div>
  )
}
