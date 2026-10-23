'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import {
  etapaActual, fmtFecha, hoyMX,
  type PesoRecord, type PesoPlan, type PesoAnalisisGuardado,
} from '@/lib/peso'
import type { PesoPlanMeta } from '@/lib/peso-planes'
import { deleteRegistro } from './actions'
import { PESO_TABS, type PesoTab } from './contratos'
import { BTN, COLOR, Eyebrow, Panel } from './ui'
import PesoHero from './PesoHero'
import PesoFormulario from './PesoFormulario'
import PesoTabs, { panelId, tabId } from './PesoTabs'
import PesoIA from './PesoIA'
import PesoVisuales from './PesoVisuales'
import PesoMeta from './PesoMeta'
import PesoTiles from './PesoTiles'
import PesoHistorial from './PesoHistorial'
import PesoPlanTexto from './PesoPlanTexto'
import PlanesEnUso from './planes/EnUso'
import { PLANES_EVENTO } from './planes/util'

// Shell de /peso: título, formulario, franja de estado (siempre visible) y pestañas. Solo la pestaña
// activa monta su contenido: las gráficas necesitan el ancho real de su contenedor, y así la página
// no carga ni repinta lo que no se está viendo. Los datos llegan del servidor (page.tsx) y cada
// guardado/borrado revalida la ruta, así que aquí no hay copia local de las mediciones.

/** Alto aproximado de la barra de pestañas pegajosa + aire: el contenido se alinea debajo de ella. */
const MARGEN_BARRA = 62
const ID_META = 'peso-meta'

const esTab = (v: string): v is PesoTab => PESO_TABS.some(t => t.id === v)

// Constante a nivel de módulo: un `= []` en los parámetros crearía un arreglo nuevo en cada render.
const SIN_PLANES: PesoPlanMeta[] = []

/** Mientras baja el código de una pestaña pesada. Alto fijo para que la página no brinque al llegar. */
function CargandoPestana({ nombre }: { nombre: string }) {
  return (
    <Panel>
      <div role="status" className="flex h-72 items-center justify-center" style={{ fontSize: 13, color: 'rgba(20,35,61,0.7)' }}>
        Cargando {nombre}…
      </div>
    </Panel>
  )
}

// Pestañas pesadas con carga diferida: Progreso trae recharts (el único archivo de la app que lo usa) y
// Rutinas y dietas trae todo el visor/subida de HTML. La mayoría de las visitas aterriza en Resumen y no
// las necesita. Con ssr activo, un enlace ?tab=progreso sigue pintándose ya desde el servidor.
const PesoProgreso = dynamic(() => import('./PesoProgreso'), { loading: () => <CargandoPestana nombre="el progreso" /> })
const PesoPlanes = dynamic(() => import('./PesoPlanes'), { loading: () => <CargandoPestana nombre="tus rutinas y dietas" /> })

/** Refleja la pestaña en la URL (?tab= para que el servidor la pinte directo; #hash para enlazar)
 *  sin recargar ni ensuciar el historial. "Resumen" es la de por defecto y deja la URL limpia. */
function sincronizarUrl(t: PesoTab) {
  try {
    const u = new URL(window.location.href)
    if (t === 'resumen') { u.searchParams.delete('tab'); u.hash = '' }
    else { u.searchParams.set('tab', t); u.hash = t }
    if (t !== 'planes') u.searchParams.delete('plan')
    const destino = u.pathname + u.search + u.hash
    if (destino !== window.location.pathname + window.location.search + window.location.hash) {
      // `null` y no `window.history.state`: Next ignora un replaceState que trae su propio estado interno (__NA),
      // y entonces su router conserva la URL vieja y la restaura tras cada acción del servidor (guardar, borrar…).
      window.history.replaceState(null, '', destino)
    }
  } catch { /* sin History API: la pestaña funciona igual, solo no queda en la URL */ }
}

/** ¿La persona pidió menos movimiento? Solo se llama desde efectos/eventos (nunca al renderizar: SSR). */
function reducirMovimiento() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Foto de las mediciones al abrir el formulario, para saber si al cerrarlo hubo un guardado. PesoFormulario
 *  llama a onCerrar igual al guardar que al cancelar, así que el guardado se deduce de los datos. */
type SesionForm = { cerradaEn: number | null } & (
  | { modo: 'nueva'; ids: Set<string> }
  | { modo: 'editada'; id: string; antes: string }
)
/** Cuánto después de cerrar el formulario se sigue esperando a que lleguen del servidor las mediciones nuevas. */
const VENTANA_GUARDADO_MS = 8000

/** ¿Las mediciones actuales reflejan lo guardado? Nueva: apareció un id que no estaba. Editada: cambió la fila
 *  editada. Así un borrado de otra fila (o un refresh sin cambios) nunca se confunde con un guardado. */
function seGuardo(s: SesionForm, datos: PesoRecord[]) {
  if (s.modo === 'nueva') return datos.some(r => !s.ids.has(r.id))
  const r = datos.find(x => x.id === s.id)
  return !!r && JSON.stringify(r) !== s.antes
}

type AvisoEstado = { texto: string; tipo: 'ok' | 'error' } | null

type Props = {
  initialData: PesoRecord[]
  initialPlan: PesoPlan | null
  initialAnalisis: PesoAnalisisGuardado | null
  persistencia: boolean
  firma: string
  planes?: PesoPlanMeta[]
  planesDisponible?: boolean
  /** La tabla de planes existe pero su lectura falló: `planes` llega vacío por eso, no porque no haya documentos. */
  planesError?: string | null
  tabInicial?: PesoTab
  planInicial?: string | null
}

// ── Contenido de la pestaña activa ───────────────────────────────────────────
// memo: abrir/cerrar el formulario o mostrar un aviso no debe repintar las secciones.

const Contenido = memo(function Contenido({
  tab, data, plan, analisis, persistencia, firma, planes, planesDisponible, planesError, planSel, deletingId,
  onEdit, onDelete, onVerPlan, onIrAPlanes,
}: {
  tab: PesoTab
  data: PesoRecord[]
  plan: PesoPlan | null
  analisis: PesoAnalisisGuardado | null
  persistencia: boolean
  firma: string
  planes: PesoPlanMeta[]
  planesDisponible: boolean
  /** La lectura de planes falló: con la lista vacía, PesoPlanes y «Planes en uso» avisan en vez de pintar «aún no tienes rutinas». */
  planesError: string | null
  planSel: string | null
  deletingId: string | null
  onEdit: (r: PesoRecord) => void
  onDelete: (r: PesoRecord) => void
  onVerPlan: (id: string) => void
  onIrAPlanes: () => void
}) {
  if (tab === 'progreso') return <PesoProgreso data={data} plan={plan} />
  if (tab === 'historial') return <PesoHistorial data={data} onEdit={onEdit} onDelete={onDelete} deletingId={deletingId} />
  if (tab === 'planes') {
    return (
      <>
        <PesoPlanes inicial={planes} disponible={planesDisponible} data={data} plan={plan} seleccionInicial={planSel} error={planesError} />
        <PesoPlanTexto plan={plan} />
      </>
    )
  }
  // Orden del Resumen: primero lo que más se consulta tras el peso (grasa, músculo, visceral con su cambio
  // a 30 días; en móvil el hero solo muestra peso e IMC), luego la lectura de la IA y, al final, lo explicativo.
  return (
    <>
      <PesoTiles data={data} />
      <PesoIA firma={firma} inicial={analisis} persistencia={persistencia} nMediciones={data.length} />
      {/* PlanesEnUso recibe TODOS los planes: él elige el activo de cada tipo y cuenta los guardados
          para decidir entre "Elegir una en uso" y "Subir la primera". */}
      {planesDisponible && <PlanesEnUso planes={planes} error={planesError} onVer={onVerPlan} onIrAPlanes={onIrAPlanes} />}
      {/* El hero salta aquí cuando el siguiente paso es definir o ajustar la meta */}
      <div id={ID_META} style={{ scrollMarginTop: MARGEN_BARRA }}>
        <PesoMeta plan={plan} data={data} />
      </div>
      <PesoVisuales data={data} plan={plan} />
    </>
  )
})

// ── Aviso flotante (confirmación de guardado y errores de borrado) ────────────
// El rol vive en el contenedor que lo envuelve (ver el render): "status" para el éxito, "alert" para el error.
// El contenedor no captura toques (el aviso sí), para no tapar lo que queda debajo.

const POS_AVISO = 'pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md'

function Aviso({ aviso, onCerrar }: { aviso: NonNullable<AvisoEstado>; onCerrar: () => void }) {
  const ok = aviso.tipo === 'ok'
  useEffect(() => {
    // El éxito se va solo pronto (es solo una confirmación); el error se queda lo suficiente para leerlo.
    const t = setTimeout(onCerrar, ok ? 4500 : 9000)
    return () => clearTimeout(t)
  }, [aviso, ok, onCerrar])
  return (
    <div className="pointer-events-auto animate-fade">
      <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={{ background: COLOR.navy, color: COLOR.onDark, border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 18px 40px -16px rgba(15,35,64,0.7)' }}>
        <span aria-hidden style={{ fontSize: 16, lineHeight: '22px', color: ok ? COLOR.goodOnDark : undefined, fontWeight: 800 }}>{ok ? '✓' : '⛔'}</span>
        <p className="flex-1 min-w-0" style={{ fontSize: 13.5, lineHeight: 1.45, fontWeight: 600 }}>{aviso.texto}</p>
        <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="shrink-0 rounded-lg min-w-[40px] min-h-[40px] -mr-2 -my-1.5 flex items-center justify-center" style={{ color: COLOR.onDarkMuted, fontSize: 20 }}>
          <span aria-hidden>×</span>
        </button>
      </div>
    </div>
  )
}

// ── Título ───────────────────────────────────────────────────────────────────

function Titulo({ children, subtitulo }: { children?: ReactNode; subtitulo: ReactNode }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-x-4 gap-y-3">
      <div className="min-w-0">
        <Eyebrow>Salud · composición corporal</Eyebrow>
        <h1 className="serif mt-1" style={{ fontSize: 'clamp(32px, 9vw, 42px)', lineHeight: 1.04, fontWeight: 600, color: COLOR.navy }}>
          Tracking de peso
        </h1>
        <p className="mt-1.5" style={{ fontSize: 13, color: COLOR.muted, lineHeight: 1.5 }}>{subtitulo}</p>
      </div>
      {children}
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function PesoClient({
  initialData, initialPlan, initialAnalisis, persistencia, firma,
  planes: planesServidor = SIN_PLANES, planesDisponible: disponibleServidor = false, planesError = null, tabInicial = 'resumen', planInicial = null,
}: Props) {
  const router = useRouter()

  // Lista de planes: arranca con lo del servidor y la pestaña "Rutinas y dietas" la mantiene al día
  // con el evento PLANES_EVENTO (subir, editar, marcar en uso, borrar), así el contador de la pestaña y
  // "Planes en uso" del Resumen no esperan al router.refresh(). Un evento solo se emite tras una
  // operación exitosa contra la tabla, o sea que si llega es que la tabla ya existe.
  const [planes, setPlanes] = useState<PesoPlanMeta[]>(planesServidor)
  const [planesDisponible, setPlanesDisponible] = useState(disponibleServidor)
  const [errorPlanes, setErrorPlanes] = useState<string | null>(planesError)
  useEffect(() => {
    setErrorPlanes(planesError)
    // Si la lectura falló, la lista llega vacía por eso (no porque no haya planes): no se pisa la que ya había.
    if (planesError) return
    setPlanes(planesServidor); setPlanesDisponible(disponibleServidor)
  }, [planesServidor, disponibleServidor, planesError])
  useEffect(() => {
    const alCambiar = (e: Event) => {
      const lista = (e as CustomEvent<PesoPlanMeta[]>).detail
      if (!Array.isArray(lista)) return
      setPlanes(lista)
      setPlanesDisponible(true)
      setErrorPlanes(null)   // si llega una lista es que la consulta ya funciona
    }
    window.addEventListener(PLANES_EVENTO, alCambiar)
    return () => window.removeEventListener(PLANES_EVENTO, alCambiar)
  }, [])

  const [tab, setTab] = useState<PesoTab>(tabInicial)
  const tabRef = useRef<PesoTab>(tabInicial)              // la versión "síncrona" de tab para los callbacks estables
  const [planSel, setPlanSel] = useState<string | null>(planInicial)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PesoRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [aviso, setAviso] = useState<AvisoEstado>(null)
  const [hoy, setHoy] = useState(hoyMX)
  const [scrollReq, setScrollReq] = useState<{ n: number; forzar: boolean; destino?: string } | null>(null)
  const [retorno, setRetorno] = useState<{ n: number; fila: string } | null>(null)

  const contenidoRef = useRef<HTMLDivElement>(null)
  const formWrapRef = useRef<HTMLDivElement>(null)
  const nuevaBtnRef = useRef<HTMLButtonElement>(null)
  const datosRef = useRef(initialData)                    // las mediciones más recientes, para los callbacks estables
  const sesionRef = useRef<SesionForm | null>(null)       // el formulario abierto, para confirmar el guardado al cerrarlo
  const filaRef = useRef<string | null>(null)             // etiqueta del botón «Editar» de la fila abierta desde el Historial

  // ── Pestañas ───────────────────────────────────────────────────────────────

  const cambiarTab = useCallback((t: PesoTab, o: { scroll?: 'no' | 'auto' | 'forzar'; destino?: string } = {}) => {
    const previa = tabRef.current
    if (t !== previa) {
      tabRef.current = t
      setTab(t)
      if (t !== 'planes') setPlanSel(null)
      // Al salir de "Rutinas y dietas" pudo haber subidas, cambios de "en uso" o borrados: se
      // refresca el servidor para que el contador y "Planes en uso" del Resumen no queden viejos.
      if (previa === 'planes') router.refresh()
      sincronizarUrl(t)
    }
    const modo = o.scroll ?? 'auto'
    if (modo !== 'no') setScrollReq(r => ({ n: (r?.n ?? 0) + 1, forzar: modo === 'forzar', destino: o.destino }))
  }, [router])

  // Tras pintar la pestaña nueva: si el contenido quedó escondido bajo la barra pegajosa (venías
  // scrolleado), se lleva el scroll a su inicio; si ya se ve completo no se mueve nada.
  useEffect(() => {
    if (!scrollReq) return
    const el = (scrollReq.destino ? document.getElementById(scrollReq.destino) : null) ?? contenidoRef.current
    if (!el) return
    const barra = document.getElementById('peso-tabs')?.offsetHeight ?? 0
    if (scrollReq.forzar || el.getBoundingClientRect().top < barra + 8) el.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [scrollReq])

  // Al abrir: el #hash manda (enlaces como /peso#planes). Mientras está abierto: responde a hashchange.
  useEffect(() => {
    const leer = () => {
      const h = window.location.hash.slice(1)
      return esTab(h) ? h : null
    }
    const h0 = leer()
    if (h0 && h0 !== tabRef.current) cambiarTab(h0, { scroll: 'no' })
    const alCambiarHash = () => { const h = leer(); if (h && h !== tabRef.current) cambiarTab(h, { scroll: 'no' }) }
    window.addEventListener('hashchange', alCambiarHash)
    return () => window.removeEventListener('hashchange', alCambiarHash)
  }, [cambiarTab])

  // Si dejas la pestaña abierta de un día para otro, "hoy" se actualiza al volver a ella.
  useEffect(() => {
    const actualizar = () => { if (document.visibilityState === 'visible') setHoy(hoyMX()) }
    document.addEventListener('visibilitychange', actualizar)
    window.addEventListener('focus', actualizar)
    return () => { document.removeEventListener('visibilitychange', actualizar); window.removeEventListener('focus', actualizar) }
  }, [])

  // ── Formulario ─────────────────────────────────────────────────────────────

  const editingId = editing?.id ?? null

  const abrirNueva = useCallback(() => { filaRef.current = null; setEditing(null); setShowForm(v => !v) }, [])
  const medirHoy = useCallback(() => { filaRef.current = null; setEditing(null); setShowForm(true) }, [])
  // La etiqueta es la misma que PesoHistorial pone en su botón «Editar»: sirve para volver a esa fila al cerrar.
  const abrirEditar = useCallback((r: PesoRecord) => {
    filaRef.current = `Editar la medición del ${fmtFecha(r.fecha)}`
    setEditing(r)
    setShowForm(true)
  }, [])

  // Las mediciones nuevas pueden haber llegado ya cuando se cierra el formulario (se confirma en `cerrar`) o
  // llegar un instante después (lo confirma este efecto, dentro de VENTANA_GUARDADO_MS).
  const confirmarGuardado = useCallback((modo: SesionForm['modo']) => {
    sesionRef.current = null
    setAviso({ texto: modo === 'editada' ? 'Medición actualizada' : 'Medición guardada', tipo: 'ok' })
  }, [])
  useEffect(() => {
    datosRef.current = initialData
    const s = sesionRef.current
    if (!s || s.cerradaEn == null) return
    if (Date.now() - s.cerradaEn > VENTANA_GUARDADO_MS) { sesionRef.current = null; return }
    if (seGuardo(s, initialData)) confirmarGuardado(s.modo)
  }, [initialData, confirmarGuardado])

  /** `volver`: tras editar desde el Historial, regresar a la fila editada (el formulario está arriba de la
   *  página y, al cerrarse, te dejaba lejos de la tabla). Al borrar la fila abierta no se mueve el scroll. */
  const cerrar = useCallback((volver: boolean) => {
    setShowForm(false)
    setEditing(null)
    const s = sesionRef.current
    if (s) {
      if (seGuardo(s, datosRef.current)) confirmarGuardado(s.modo)
      else s.cerradaEn = Date.now()
    }
    const fila = filaRef.current
    filaRef.current = null
    if (volver && fila && tabRef.current === 'historial') setRetorno(r => ({ n: (r?.n ?? 0) + 1, fila }))
    // El formulario desaparece con el foco dentro: se devuelve al botón que lo abre.
    else requestAnimationFrame(() => nuevaBtnRef.current?.focus({ preventScroll: true }))
  }, [confirmarGuardado])
  const cerrarForm = useCallback(() => cerrar(true), [cerrar])

  // Al abrirlo (sobre todo desde "Medirme hoy" o al editar desde el historial, lejos del tope) se
  // trae a la vista; si ya se ve, no se mueve nada. Aquí también arranca la "sesión" del formulario.
  useEffect(() => {
    if (!showForm) return
    const base = datosRef.current
    sesionRef.current = editingId
      ? { cerradaEn: null, modo: 'editada', id: editingId, antes: JSON.stringify(base.find(r => r.id === editingId) ?? null) }
      : { cerradaEn: null, modo: 'nueva', ids: new Set(base.map(r => r.id)) }
    const el = formWrapRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top < 0 || top > window.innerHeight * 0.5) el.scrollIntoView({ block: 'start', behavior: reducirMovimiento() ? 'auto' : 'smooth' })
  }, [showForm, editingId])

  // Tras cerrar la edición de una fila del Historial: se vuelve a ella y se le devuelve el foco. Si ya no se
  // encuentra (cambiaste su fecha y la etiqueta cambió), se queda al inicio del panel con el foco en su pestaña.
  useEffect(() => {
    if (!retorno) return
    const boton = Array.from(contenidoRef.current?.querySelectorAll<HTMLElement>('button[aria-label]') ?? [])
      .find(b => b.getAttribute('aria-label') === retorno.fila)
    if (boton) {
      boton.scrollIntoView({ block: 'center', behavior: 'auto' })
      boton.focus({ preventScroll: true })
    } else {
      contenidoRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
      document.getElementById(tabId(tabRef.current))?.focus({ preventScroll: true })
    }
  }, [retorno])

  // ── Borrado ────────────────────────────────────────────────────────────────

  const borrar = useCallback(async (r: PesoRecord) => {
    if (!window.confirm(`¿Borrar la medición del ${fmtFecha(r.fecha)}? Esta acción no se puede deshacer.`)) return
    setDeletingId(r.id)
    setAviso(null)
    try {
      const res = await deleteRegistro(r.id)
      if (!res.ok) setAviso({ texto: `No se pudo borrar la medición: ${res.error}`, tipo: 'error' })
      else if (editingId === r.id) cerrar(false)   // no dejar abierto el formulario de una fila que ya no existe
    } catch {
      setAviso({ texto: 'No se pudo borrar la medición. Revisa tu conexión e intenta de nuevo.', tipo: 'error' })
    } finally {
      setDeletingId(null)
    }
  }, [editingId, cerrar])

  // ── Enlaces entre pestañas ─────────────────────────────────────────────────

  const irDesdeHero = useCallback((t: PesoTab) => {
    cambiarTab(t, { scroll: 'forzar', destino: t === 'resumen' ? ID_META : undefined })
  }, [cambiarTab])
  const verPlan = useCallback((id: string) => { setPlanSel(id); cambiarTab('planes', { scroll: 'forzar' }) }, [cambiarTab])
  const irAPlanes = useCallback(() => { setPlanSel(null); cambiarTab('planes', { scroll: 'forzar' }) }, [cambiarTab])
  const cerrarAviso = useCallback(() => setAviso(null), [])

  // ── Derivados ──────────────────────────────────────────────────────────────

  const n = initialData.length
  const planesSinLeer = !!errorPlanes && !planes.length   // sin lista fiable: no se muestra un contador de 0
  const contadores = useMemo<Partial<Record<PesoTab, number>>>(
    () => ({ historial: n, ...(planesDisponible && !planesSinLeer ? { planes: planes.length } : {}) }),
    [n, planesDisponible, planesSinLeer, planes.length],
  )
  const etapa = useMemo(() => etapaActual(initialData), [initialData])

  // ── Estado vacío: aún no hay mediciones ────────────────────────────────────

  if (!n) {
    return (
      <>
        <SiteHeader title="Peso" subtitle="Salud · ADVL" />
        <main className="peso-root px-4 pt-6 pb-16 max-w-3xl mx-auto space-y-6">
          <Titulo subtitulo="Aún no hay mediciones. Registra la primera para empezar a ver tu progreso, el análisis con IA y tus rutinas y dietas." />
          <PesoFormulario data={initialData} hoy={hoy} editando={null} primera onCerrar={cerrarForm} />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icono: '📈', t: 'Tendencia y proyección', d: 'Tu curva, el ritmo de tus últimos 90 días y cuándo llegarías a tu meta.' },
              { icono: '🧠', t: 'Análisis con IA', d: 'Una lectura de tu composición: qué subió, qué bajó y qué hacer al respecto.' },
              { icono: '🏋️', t: 'Rutinas y dietas', d: 'Sube tus planes en HTML y revísalos aquí, bien explicados y a mano.' },
            ].map(c => (
              <Panel key={c.t} eyebrow="Lo que vas a ver" icon={c.icono} title={c.t}>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: COLOR.muted }}>{c.d}</p>
              </Panel>
            ))}
          </div>
        </main>
      </>
    )
  }

  const primera = initialData[0]
  const ultima = initialData[n - 1]

  return (
    <>
      <SiteHeader title="Peso" subtitle="Salud · ADVL" />
      {/* peso-root: ancla de reglas de estilo propias de /peso (p. ej. cifras serif alineadas en globals.css). */}
      <main className="peso-root px-4 pt-6 pb-20 max-w-5xl mx-auto flex flex-col">
        <div className="space-y-5 mb-6">
          <Titulo
            subtitulo={
              <>
                {n} {n === 1 ? 'medición' : 'mediciones'} · {fmtFecha(primera.fecha)} → {fmtFecha(ultima.fecha)}
                {etapa.length < n && <span> · etapa actual desde {fmtFecha(etapa[0].fecha)}</span>}
              </>
            }
          >
            <button
              ref={nuevaBtnRef} type="button" onClick={abrirNueva}
              aria-expanded={showForm} aria-controls="peso-formulario"
              className={`${BTN.base} ${showForm ? 'px-5 py-2.5 text-sm border text-[var(--ink-700)] bg-white hover:border-[var(--gold-500)]' : BTN.gold} min-h-[46px]`}
              style={showForm ? { borderColor: COLOR.lineStrong } : undefined}
            >
              {showForm ? 'Cancelar' : '+ Nueva medición'}
            </button>
          </Titulo>

          {showForm && (
            <div ref={formWrapRef} style={{ scrollMarginTop: 12 }}>
              <PesoFormulario key={editing?.id ?? 'nueva'} data={initialData} hoy={hoy} editando={editing} primera={false} onCerrar={cerrarForm} />
            </div>
          )}

          <PesoHero data={initialData} plan={initialPlan} onMedir={medirHoy} onIrA={irDesdeHero} hoy={hoy} />
        </div>

        <PesoTabs tab={tab} onChange={cambiarTab} contadores={contadores} />

        <div
          ref={contenidoRef}
          id={panelId(tab)} role="tabpanel" aria-labelledby={tabId(tab)}
          className="pt-5 space-y-5 min-h-[60vh] min-w-0"
          style={{ scrollMarginTop: MARGEN_BARRA }}
        >
          <Contenido
            tab={tab} data={initialData} plan={initialPlan} analisis={initialAnalisis} persistencia={persistencia} firma={firma}
            planes={planes} planesDisponible={planesDisponible} planesError={errorPlanes}
            planSel={planSel} deletingId={deletingId}
            onEdit={abrirEditar} onDelete={borrar} onVerPlan={verPlan} onIrAPlanes={irAPlanes}
          />
        </div>
      </main>
      {/* Región viva siempre montada: un aviso que nace junto con su región no siempre lo anuncia el lector de pantalla. */}
      <div role="status" aria-live="polite" className={POS_AVISO}>
        {aviso?.tipo === 'ok' && <Aviso aviso={aviso} onCerrar={cerrarAviso} />}
      </div>
      {aviso?.tipo === 'error' && (
        <div role="alert" className={POS_AVISO}>
          <Aviso aviso={aviso} onCerrar={cerrarAviso} />
        </div>
      )}
    </>
  )
}
