'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import {
  etapaActual, fmtFecha, hoyMX,
  type PesoRecord, type PesoPlan, type PesoAnalisisGuardado,
} from '@/lib/peso'
import type { PesoPlanMeta } from '@/lib/peso-planes'
import { PERFIL_DEFAULT, type PerfilEstado, type PesoPerfil as PerfilDatos } from '@/lib/peso-perfil'
import { deleteRegistro } from './actions'
import { PESO_TABS, type PesoTab } from './contratos'
import { PerfilProvider } from './perfil-context'
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
import PesoPerfil from './PesoPerfil'
import InvitacionPerfil from './perfil/Invitacion'
import PlanesEnUso from './planes/EnUso'
import { PLANES_EVENTO } from './planes/util'
import { conImcDelPerfil } from './perfil/util'

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
// Igual para el perfil: sin la prop (pruebas, páginas de carga) se usa lo que valía antes de que existiera el perfil.
const PERFIL_ESTADO_INICIAL: PerfilEstado = { perfil: PERFIL_DEFAULT, configurado: false, disponible: false, actualizado: null }

/** Instante ISO → milisegundos; -1 si no hay (o no se entiende). Sirve para saber qué estado del perfil es más nuevo. */
const marcaDe = (e: PerfilEstado) => { const t = e.actualizado ? Date.parse(e.actualizado) : NaN; return Number.isFinite(t) ? t : -1 }

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
  /** Perfil personal (estatura, sexo, edad, hábitos) que cargó el servidor; sin él se usan los datos supuestos de siempre. */
  perfil?: PerfilEstado
  /** La lectura del perfil falló (no es lo mismo que «aún no hay perfil»): la pestaña bloquea el formulario para no pisarlo. */
  perfilError?: string | null
  tabInicial?: PesoTab
  planInicial?: string | null
}

// ── Contenido de la pestaña activa ───────────────────────────────────────────
// memo: abrir/cerrar el formulario o mostrar un aviso no debe repintar las secciones.

const Contenido = memo(function Contenido({
  tab, data, datosVista, plan, analisis, persistencia, firma, planes, planesDisponible, planesError, planSel, deletingId,
  perfilEstado, perfilError, onEdit, onDelete, onVerPlan, onIrAPlanes, onIrAPerfil, onPerfilGuardado,
}: {
  tab: PesoTab
  /** Las mediciones tal como están guardadas (lo que marcó la báscula): Historial, formulario y números base. */
  data: PesoRecord[]
  /** Las mismas, con el IMC puesto al día para la estatura del perfil (conImcDelPerfil): tarjetas, Progreso, Meta y visuales. */
  datosVista: PesoRecord[]
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
  perfilEstado: PerfilEstado
  perfilError: string | null
  onEdit: (r: PesoRecord) => void
  onDelete: (r: PesoRecord) => void
  onVerPlan: (id: string) => void
  onIrAPlanes: () => void
  onIrAPerfil: () => void
  onPerfilGuardado: (perfil: PerfilDatos, estado?: PerfilEstado) => void
}) {
  if (tab === 'perfil') return <PesoPerfil estado={perfilEstado} data={data} onGuardado={onPerfilGuardado} error={perfilError} />
  if (tab === 'progreso') return <PesoProgreso data={datosVista} plan={plan} />
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
      <PesoTiles data={datosVista} />
      {/* Debajo de las tarjetas y no encima: aparece tras montar (lee localStorage) y así no empuja lo que ya se está leyendo. */}
      {!perfilEstado.configurado && !perfilError && <InvitacionPerfil onCompletar={onIrAPerfil} />}
      <PesoIA
        firma={firma} inicial={analisis} persistencia={persistencia} nMediciones={data.length}
        perfilConfigurado={perfilEstado.configurado} perfilSinLeer={!!perfilError && !perfilEstado.configurado}
      />
      {/* PlanesEnUso recibe TODOS los planes: él elige el activo de cada tipo y cuenta los guardados
          para decidir entre "Elegir una en uso" y "Subir la primera". */}
      {planesDisponible && <PlanesEnUso planes={planes} error={planesError} onVer={onVerPlan} onIrAPlanes={onIrAPlanes} />}
      {/* El hero salta aquí cuando el siguiente paso es definir o ajustar la meta */}
      <div id={ID_META} style={{ scrollMarginTop: MARGEN_BARRA }}>
        <PesoMeta plan={plan} data={datosVista} />
      </div>
      <PesoVisuales data={datosVista} plan={plan} />
    </>
  )
})

// ── Aviso de perfil sin leer ──────────────────────────────────────────────────
// Si la lectura del perfil falló, el servidor manda los datos supuestos (PERFIL_DEFAULT) y el hero, las escalas y las
// tablas los usan sin que nada lo diga fuera de «Mi perfil». Esta franja vive en el armazón (se ve en todas las
// pestañas menos esa, que ya trae su propio panel). A propósito NO invita a completar el perfil: puede haber uno
// guardado que solo no se pudo leer, y el formulario sigue bloqueado hasta que la lectura funcione.

function AvisoPerfilSinLeer({ reintentando, onReintentar }: { reintentando: boolean; onReintentar: () => void }) {
  return (
    <div
      role="alert"
      className="animate-fade flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-4 py-3 sm:px-5"
      style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: `4px solid ${COLOR.warn}`, color: '#78350F' }}
    >
      <span aria-hidden style={{ fontSize: 18 }}>⚠️</span>
      <p className="min-w-0 flex-1" style={{ flexBasis: 220, fontSize: 13, lineHeight: 1.5 }}>
        <strong style={{ fontWeight: 700 }}>No se pudo leer tu perfil.</strong>{' '}
        Mientras tanto, el IMC, los rangos de grasa y el peso objetivo usan datos supuestos ({PERFIL_DEFAULT.estatura_cm} cm, {PERFIL_DEFAULT.sexo}). Lo que tengas guardado no se modificó.
      </p>
      <button
        type="button" onClick={onReintentar} disabled={reintentando}
        className={`${BTN.base} ${BTN.gold} min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A6420]`}
      >
        {reintentando ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  )
}

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
  planes: planesServidor = SIN_PLANES, planesDisponible: disponibleServidor = false, planesError = null,
  perfil: perfilServidor = PERFIL_ESTADO_INICIAL, perfilError = null, tabInicial = 'resumen', planInicial = null,
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

  // Perfil: arranca con lo del servidor y, al guardarlo, se actualiza al instante (todo lo que usa usePerfil se
  // recalcula sin esperar al servidor). Cuando el servidor vuelve a mandar el perfil (router.refresh) solo se adopta si
  // es MÁS NUEVO que el local (marca de tiempo de la base): un refresh que salió antes del guardado no debe devolver
  // el perfil viejo. Con lectura fallida (`perfilError`) no se toca nada: el estado de la prop son los datos supuestos.
  const [perfilEstado, setPerfilEstado] = useState<PerfilEstado>(perfilServidor)
  useEffect(() => {
    if (perfilError) return
    setPerfilEstado(local => {
      if (marcaDe(perfilServidor) > marcaDe(local) || (perfilServidor.disponible && !local.disponible)) return perfilServidor
      // Simétrico: si la lectura falló con error (el servidor mandó disponible: true) y un «Reintentar» encuentra que la tabla
      // no existe, el local se quedaba en disponible: true y no aparecía «Falta crear la tabla». Sin perfil guardado no hay
      // nada que pisar, así que se adopta el aviso.
      if (!perfilServidor.disponible && local.disponible && !local.configurado) return perfilServidor
      return local
    })
  }, [perfilServidor, perfilError])
  const alGuardarPerfil = useCallback((perfil: PerfilDatos, estado?: PerfilEstado) => {
    setPerfilEstado({ perfil, configurado: true, disponible: true, actualizado: estado?.actualizado ?? new Date().toISOString() })
    // El servidor recalcula la huella del análisis (incluye el perfil): sin esto «Análisis con IA» no notaría que cambió.
    router.refresh()
  }, [router])
  // «Reintentar» del aviso de perfil sin leer: dentro de una transición, `reintentandoPerfil` dura hasta que el servidor responde.
  const [reintentandoPerfil, iniciarReintentoPerfil] = useTransition()
  const reintentarPerfil = useCallback(() => iniciarReintentoPerfil(() => router.refresh()), [router])

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
  const irAPerfil = useCallback(() => cambiarTab('perfil', { scroll: 'forzar' }), [cambiarTab])
  const cerrarAviso = useCallback(() => setAviso(null), [])

  // ── Derivados ──────────────────────────────────────────────────────────────

  const n = initialData.length
  const planesSinLeer = !!errorPlanes && !planes.length   // sin lista fiable: no se muestra un contador de 0
  const contadores = useMemo<Partial<Record<PesoTab, number>>>(
    () => ({ historial: n, ...(planesDisponible && !planesSinLeer ? { planes: planes.length } : {}) }),
    [n, planesDisponible, planesSinLeer, planes.length],
  )
  const etapa = useMemo(() => etapaActual(initialData), [initialData])
  const avisosTabs = useMemo<Partial<Record<PesoTab, string>>>(
    () => (!perfilEstado.configurado && !perfilError ? { perfil: 'pendiente de completar' } : {}),
    [perfilEstado.configurado, perfilError],
  )
  // IMC unificado con la estatura del perfil: la franja, las tarjetas, Progreso (estado OMS, resumen de tendencia, métrica
  // IMC y su tabla de referencia), Meta y los visuales leen este IMC y jamás se contradicen. El Historial y el formulario
  // siguen con `initialData`: ahí se ve lo que marcó la báscula. Con la estatura de fábrica es la misma lista.
  const datosVista = useMemo(() => conImcDelPerfil(initialData, perfilEstado.perfil), [initialData, perfilEstado.perfil])
  // Lectura fallida Y sin un perfil bueno en memoria: los números salen de los datos supuestos. Si un refresh posterior
  // falla pero ya había un perfil leído (o recién guardado), ese sigue vigente y no hay nada que avisar.
  const perfilSinLeer = !!perfilError && !perfilEstado.configurado
  const avisoPerfil = perfilSinLeer
    ? <AvisoPerfilSinLeer reintentando={reintentandoPerfil} onReintentar={reintentarPerfil} />
    : null

  // ── Estado vacío: aún no hay mediciones ────────────────────────────────────

  if (!n) {
    return (
      <PerfilProvider perfil={perfilEstado.perfil}>
        <SiteHeader title="Peso" subtitle="Salud · ADVL" />
        <main className="peso-root px-4 pt-6 pb-16 max-w-3xl mx-auto space-y-6">
          <Titulo subtitulo="Aún no hay mediciones. Registra la primera para empezar a ver tu progreso, el análisis con IA y tus rutinas y dietas." />
          {avisoPerfil}
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
      </PerfilProvider>
    )
  }

  const primera = initialData[0]
  const ultima = initialData[n - 1]

  // El proveedor envuelve TODO (hero, formulario, pestañas): estatura, sexo y edad ya no están fijos en el código.
  return (
    <PerfilProvider perfil={perfilEstado.perfil}>
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

          <PesoHero data={datosVista} plan={initialPlan} onMedir={medirHoy} onIrA={irDesdeHero} hoy={hoy} />

          {/* En «Mi perfil» no: ahí el panel de error ya lo explica (y bloquea el formulario). */}
          {tab !== 'perfil' && avisoPerfil}
        </div>

        <PesoTabs tab={tab} onChange={cambiarTab} contadores={contadores} avisos={avisosTabs} />

        <div
          ref={contenidoRef}
          id={panelId(tab)} role="tabpanel" aria-labelledby={tabId(tab)}
          className="pt-5 space-y-5 min-h-[60vh] min-w-0"
          style={{ scrollMarginTop: MARGEN_BARRA }}
        >
          <Contenido
            tab={tab} data={initialData} datosVista={datosVista} plan={initialPlan} analisis={initialAnalisis} persistencia={persistencia} firma={firma}
            planes={planes} planesDisponible={planesDisponible} planesError={errorPlanes}
            planSel={planSel} deletingId={deletingId} perfilEstado={perfilEstado} perfilError={perfilError}
            onEdit={abrirEditar} onDelete={borrar} onVerPlan={verPlan} onIrAPlanes={irAPlanes}
            onIrAPerfil={irAPerfil} onPerfilGuardado={alGuardarPerfil}
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
    </PerfilProvider>
  )
}
