'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { fmtFecha, type PesoAnalisisGuardado, type PesoInsight, type InsightTipo, type PesoMetrica } from '@/lib/peso'
import type { PesoIAProps } from './contratos'
import { usePerfil } from './perfil-context'
import { Panel, Pill, Eyebrow, COLOR, BTN, INPUT, CARD_SHADOW } from './ui'

// Análisis con IA del tracker de Peso (Gemini, el mismo motor que Noticias en el Panel). El servidor
// calcula las cifras y la IA las interpreta; aquí solo se muestra, se pide actualizar o se pregunta.
// Se compone de tres bloques: el titular (navy), los hallazgos + la lista de acciones, y la conversación.

// ── Paleta y textos ─────────────────────────────────────────────────────────

// `color` es el acento (barra, icono); `texto` es más oscuro para que las etiquetas chicas pasen 4.5:1 sobre blanco.
const TIPO: Record<InsightTipo, { color: string; texto: string; etiqueta: string }> = {
  positivo: { color: '#16a34a', texto: '#15803d', etiqueta: 'Va bien' },
  atencion: { color: '#d97706', texto: '#b45309', etiqueta: 'Ojo' },
  alerta:   { color: '#dc2626', texto: '#b91c1c', etiqueta: 'Atención' },
  dato:     { color: '#3E5C86', texto: '#3E5C86', etiqueta: 'Dato' },
}
const METRICA_NOMBRE: Record<PesoMetrica, string> = {
  peso: 'Peso', grasa: 'Grasa', musculo: 'Músculo', visceral: 'Grasa visceral',
  constancia: 'Constancia', meta: 'Meta', datos: 'Calidad del dato',
}
const ESTADO: Record<'bien' | 'mixto' | 'alerta', { label: string; color: string }> = {
  bien: { label: 'Vas bien', color: COLOR.goodOnDark },
  mixto: { label: 'Hay puntos por atender', color: COLOR.warnOnDark },
  alerta: { label: 'Atención', color: COLOR.badOnDark },
}
const PREGUNTAS = [
  '¿Lo que subí fue grasa o músculo?',
  '¿Cuánto me falta para un IMC saludable?',
  '¿Cada cuánto debería medirme?',
  '¿Qué dato mío debería preocuparme más?',
  '¿Qué ritmo de bajada es realista para mí?',
  '¿Cómo voy comparado con mi mejor racha?',
]
const PASOS = [
  'Leyendo tus mediciones…',
  'Comparando grasa y masa magra…',
  'Calculando ritmos y fechas…',
  'Redactando el análisis…',
]
const MEDIA_HORA = 30 * 60_000   // cuánto espera antes de reintentar con la IA si la última vez cayó al plan B
const MUTED = 'rgba(20,35,61,0.7)'   // COLOR.muted (0.58) no llega a 4.5:1 en texto chico sobre blanco
const DORADO_TEXTO = '#8A6217'       // el dorado de la marca es muy claro para texto chico
const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2933A] focus-visible:ring-offset-2'
const FOCO_OSCURO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E7C56B]'
const LS_HECHAS = 'advl.peso.ia.hechas'
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

// ── Iconos (trazo, 24×24) ───────────────────────────────────────────────────

type IconoKey = PesoMetrica | InsightTipo
const ICONOS: Record<IconoKey, ReactNode> = {
  peso: <><rect x="3" y="3.5" width="18" height="17" rx="4" /><path d="M8 9.5a5 5 0 0 1 8 0" /><path d="m12 9.5 1.6 2.2" /></>,
  grasa: <path d="M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3Z" />,
  musculo: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  visceral: <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />,
  constancia: <><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 9.5h18M9 15l2 2 4-4" /></>,
  meta: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  datos: <path d="M5 20V10M12 20V4M19 20v-7" />,
  positivo: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16 9.5" /></>,
  atencion: <><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  alerta: <><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  dato: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.8v.1" /></>,
}
function Icono({ k, size = 20 }: { k: IconoKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {ICONOS[k]}
    </svg>
  )
}

// ── Utilidades ──────────────────────────────────────────────────────────────

function hace(iso: string, ahora: number) {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000))
  if (min < 2) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

/** Clave estable de una acción para recordar si ya la marcaste (hash djb2 de su texto). */
function claveAccion(texto: string) {
  let h = 5381
  const s = texto.trim().toLowerCase()
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// Las casillas se guardan por huella de datos (firma): si llega un análisis nuevo, la lista arranca limpia.
// Todo en try/catch: en modo privado o con el almacenamiento bloqueado la página funciona igual, sin recordar.
function leerHechas(firma: string): string[] {
  try {
    const raw = window.localStorage.getItem(LS_HECHAS)
    if (!raw) return []
    const o = JSON.parse(raw) as { firma?: unknown; hechas?: unknown }
    return o.firma === firma && Array.isArray(o.hechas) ? o.hechas.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
function guardarHechas(firma: string, hechas: string[]) {
  try { window.localStorage.setItem(LS_HECHAS, JSON.stringify({ firma, hechas })) } catch { /* sin almacenamiento: no pasa nada */ }
}

/** Orden de los hallazgos: prioridad 1 → 3 (sin prioridad = 2, así se ven los análisis guardados antes), respetando el orden original. */
function ordenarInsights(items: PesoInsight[]) {
  return items.map((x, i) => ({ x, i })).sort((a, b) => (a.x.prioridad ?? 2) - (b.x.prioridad ?? 2) || a.i - b.i).map(o => o.x)
}

/** Texto plano del análisis para pegarlo en notas o en un mensaje. */
function textoPlano(a: PesoAnalisisGuardado, hechas: string[], insights: PesoInsight[]) {
  const c = a.contenido
  const L: string[] = []
  L.push(`ANÁLISIS DE PESO${FECHA_ISO.test(a.fecha_base) ? ` (mediciones hasta el ${fmtFecha(a.fecha_base)})` : ''}`)
  L.push('', c.titular, '')
  for (const i of insights) L.push(`• ${TIPO[i.tipo]?.etiqueta ?? 'Dato'} — ${i.titulo}: ${i.detalle}`)
  if (c.acciones?.length) {
    L.push('', 'QUÉ HACER')
    for (const x of c.acciones) L.push(`[${hechas.includes(claveAccion(x.accion)) ? 'x' : ' '}] ${x.accion}${x.porque ? ` — ${x.porque}` : ''}`)
  }
  L.push('', `Fuente: ${a.fuente === 'ia' ? 'Gemini' : 'lectura automática'}. Orientativo: no sustituye a un médico o nutriólogo.`)
  return L.join('\n')
}

// ── Piezas visuales ─────────────────────────────────────────────────────────

function InsightCard({ ins, ancho }: { ins: PesoInsight; ancho: boolean }) {
  const t = TIPO[ins.tipo] ?? TIPO.dato
  const metrica = ins.metrica && METRICA_NOMBRE[ins.metrica] ? ins.metrica : null
  return (
    <article
      className={`relative overflow-hidden rounded-2xl bg-white ${ancho ? 'sm:col-span-2' : ''}`}
      style={{ border: `1px solid ${COLOR.line}`, boxShadow: CARD_SHADOW }}
    >
      <span aria-hidden className="absolute left-0 top-0 bottom-0" style={{ width: 4, background: t.color }} />
      <div className="flex gap-3.5 py-4 pl-5 pr-4">
        <span className="shrink-0 grid place-items-center rounded-xl" style={{ width: 40, height: 40, background: `${t.color}14`, color: t.color }}>
          <Icono k={metrica ?? ins.tipo} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
            <Eyebrow color={t.texto}>{t.etiqueta}</Eyebrow>
            {metrica && <span style={{ fontSize: 11.5, color: MUTED }}>· {METRICA_NOMBRE[metrica]}</span>}
            {ins.prioridad === 1 && <Pill color={DORADO_TEXTO}>Clave</Pill>}
          </div>
          <h3 className="mt-1 font-semibold leading-snug" style={{ fontSize: 15, color: COLOR.navy }}>{ins.titulo}</h3>
          <p className="mt-1.5 leading-relaxed" style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.8)' }}>{ins.detalle}</p>
        </div>
      </div>
    </article>
  )
}

function InsightSkeleton() {
  const barra = 'rounded animate-pulse motion-reduce:animate-none'
  return (
    <div className="rounded-2xl bg-white p-4 flex gap-3.5" style={{ border: `1px solid ${COLOR.line}` }} aria-hidden>
      <div className={`shrink-0 rounded-xl ${barra}`} style={{ width: 40, height: 40, background: COLOR.line }} />
      <div className="flex-1 space-y-2.5 pt-1">
        <div className={`h-2.5 ${barra}`} style={{ width: '28%', background: COLOR.line }} />
        <div className={`h-3.5 ${barra}`} style={{ width: '70%', background: COLOR.line }} />
        <div className={`h-3 ${barra}`} style={{ width: '96%', background: COLOR.line }} />
        <div className={`h-3 ${barra}`} style={{ width: '62%', background: COLOR.line }} />
      </div>
    </div>
  )
}

function Spinner() {
  return <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin motion-reduce:animate-none" aria-hidden />
}

function BurbujaUsuario({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[88%] rounded-2xl rounded-br-md px-3.5 py-2.5 whitespace-pre-wrap break-words" style={{ background: COLOR.navy, color: COLOR.onDark, fontSize: 13.5, lineHeight: 1.5 }}>{children}</p>
    </div>
  )
}

// ── Sesión (sobrevive a que el componente se desmonte) ──────────────────────
// PesoClient solo monta la pestaña activa: al irte de Resumen este componente se desmonta y todo su estado
// local se pierde. Sin esto, cada vuelta a Resumen veía un `inicial` viejo (las props del servidor no se
// refrescan al generar), volvía a llamar a Gemini (hasta ~54 s de cuota) y borraba tu conversación.
// Por eso el análisis recién generado, la conversación y lo que está en vuelo viven aquí, a nivel de módulo,
// y el componente los lee con useSyncExternalStore. Seguro con SSR: solo se escriben desde eventos y efectos
// del navegador (nunca al renderizar), así que en el servidor siempre valen lo de SESION_VACIA y la
// hidratación coincide.

type Turno = { q: string; a: string }
type Sesion = {
  local: PesoAnalisisGuardado | null   // el último análisis generado desde esta página
  aviso: string                        // aviso de esa generación (p. ej. cayó al plan B)
  respuestas: Turno[]                  // conversación, del más antiguo al más reciente
  generando: boolean
  preguntando: string                  // texto de la pregunta en vuelo; '' = ninguna
}
const SESION_VACIA: Sesion = { local: null, aviso: '', respuestas: [], generando: false, preguntando: '' }
let sesion = SESION_VACIA
let intentoAuto: { firma: string; en: number } | null = null   // último análisis automático pedido: huella y hora
// Un fallo ya en español, listo para mostrar. `reintentable: false` = reintentar no lo arregla (p. ej. la IA no
// está configurada): entonces no se ofrece «Reintentar».
type Fallo = { mensaje: string; reintentable: boolean }
let analisisEnVuelo: Promise<Fallo | null> | null = null   // resuelve con el fallo; null = salió bien
let respuestaEnVuelo: Promise<Fallo | null> | null = null
const oyentes = new Set<() => void>()

function cambiarSesion(cambio: Partial<Sesion>) {
  sesion = { ...sesion, ...cambio }   // objeto nuevo: useSyncExternalStore compara por referencia
  oyentes.forEach(f => f())
}
function suscribirSesion(f: () => void) {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}
const leerSesion = () => sesion
const leerSesionServidor = () => SESION_VACIA

/** true solo si no se pidió ya el análisis automático para esta huella de datos en la última media hora. Así volver a
 *  Resumen no lo repite (aunque haya fallado), pero la lectura por reglas sí se reintenta sola pasado ese rato. */
function reclamarAuto(firma: string) {
  const t = Date.now()
  if (intentoAuto && intentoAuto.firma === firma && t - intentoAuto.en < MEDIA_HORA) return false
  intentoAuto = { firma, en: t }
  return true
}

/** El más reciente de dos análisis (cualquiera puede faltar). */
function masNuevo(a: PesoAnalisisGuardado | null, b: PesoAnalisisGuardado | null) {
  if (!a || !b) return a ?? b
  return (Date.parse(a.created_at) || 0) >= (Date.parse(b.created_at) || 0) ? a : b
}

async function consultarAnalisis(): Promise<Fallo | null> {
  try {
    const r = await fetch('/api/peso/analisis', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      signal: AbortSignal.timeout(70_000),
    })
    const j = await r.json()
    if (!j.ok) return { mensaje: j.error || 'No se pudo generar el análisis.', reintentable: j.reintentable !== false }
    cambiarSesion({ local: j.analisis as PesoAnalisisGuardado, aviso: j.aviso || '' })
    return null
  } catch {
    return { mensaje: 'No se pudo generar el análisis (tardó demasiado o falló la conexión).', reintentable: true }
  }
}

/** Pide el análisis; si ya hay una petición en vuelo (otro clic, o volviste a la pestaña mientras corría) se une a ella. */
function pedirAnalisis(): Promise<Fallo | null> {
  if (analisisEnVuelo) return analisisEnVuelo
  cambiarSesion({ generando: true, aviso: '' })
  // El .then corre siempre después de la asignación (aunque consultarAnalisis termine al instante).
  const p = consultarAnalisis().then(e => {
    analisisEnVuelo = null
    cambiarSesion({ generando: false })
    return e
  })
  analisisEnVuelo = p
  return p
}

async function consultarRespuesta(texto: string, historial: Turno[]): Promise<Fallo | null> {
  try {
    const r = await fetch('/api/peso/analisis', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pregunta: texto, historial }),
      signal: AbortSignal.timeout(70_000),
    })
    const j = await r.json()
    if (!j.ok) return { mensaje: j.error || 'No se pudo responder.', reintentable: j.reintentable !== false }
    cambiarSesion({ respuestas: [...sesion.respuestas, { q: texto, a: j.respuesta as string }] })
    return null
  } catch {
    return { mensaje: 'No se pudo responder (tardó demasiado o falló la conexión).', reintentable: true }
  }
}

function pedirRespuesta(texto: string, historial: Turno[]): Promise<Fallo | null> {
  if (respuestaEnVuelo) return respuestaEnVuelo
  cambiarSesion({ preguntando: texto })
  const p = consultarRespuesta(texto, historial).then(e => {
    respuestaEnVuelo = null
    cambiarSesion({ preguntando: '' })
    return e
  })
  respuestaEnVuelo = p
  return p
}

// ── Componente ──────────────────────────────────────────────────────────────

// `perfilConfigurado` = PerfilEstado.configurado: hay una fila guardada. Es el mismo criterio que usan la ruta del
// análisis y la huella, así que el pie no puede contradecirlas. PesoClient siempre lo pasa (el contrato lo deja opcional
// para pruebas): guardar los valores de fábrica sin tocarlos también cuenta como perfil completo (la IA recibe
// perfil_configurado: true), y comparar por valor (esPerfilDeFabrica) no distingue ese caso de «nunca se guardó».
// `perfilSinLeer`: la lectura del perfil falló; los datos que se ven son los supuestos, pero puede haber uno guardado, así
// que el pie calla el fragmento del perfil en vez de afirmar algo que quizá no es cierto.
export default function PesoIA({ firma, inicial, persistencia, nMediciones, perfilConfigurado = false, perfilSinLeer = false }: PesoIAProps) {
  const ses = useSyncExternalStore(suscribirSesion, leerSesion, leerSesionServidor)
  const perfil = usePerfil()   // solo para decir en el pie con qué perfil se hizo el análisis (la ruta lo lee por su cuenta)
  const configurado = perfilConfigurado
  const { local, respuestas } = ses
  const cargando = ses.generando
  const preguntando = ses.preguntando !== ''
  const [error, setError] = useState<Fallo | null>(null)
  const [ahora, setAhora] = useState<number | null>(null)   // reloj solo en cliente: evita desajustes de hidratación
  const [paso, setPaso] = useState(0)
  const [pregunta, setPregunta] = useState('')
  const [errorPregunta, setErrorPregunta] = useState<Fallo | null>(null)
  const [ultimaPregunta, setUltimaPregunta] = useState('')
  const [hechas, setHechas] = useState<string[]>([])
  const [copiado, setCopiado] = useState<'ok' | 'error' | null>(null)
  const finChat = useRef<HTMLDivElement>(null)
  const previoChat = useRef({ n: respuestas.length, p: preguntando })   // lo que ya había al montar no mueve el scroll
  const timerCopia = useRef<number | undefined>(undefined)

  useEffect(() => { setAhora(Date.now()) }, [])
  useEffect(() => () => window.clearTimeout(timerCopia.current), [])

  // El análisis a mostrar: el que corresponde a los datos actuales; si no hay, el más reciente que exista
  // (marcado como desactualizado) mientras se genera el nuevo.
  const visible = [local, inicial].find(a => a?.firma === firma) ?? masNuevo(local, inicial)
  const vigente = visible?.firma === firma
  const aviso = visible === local ? ses.aviso : ''
  // Lectura por reglas (la IA falló la vez anterior): al abrir la página se reintenta sola pasada media hora.
  const reglasViejas = !!visible && visible.fuente === 'reglas' && ahora != null && ahora - new Date(visible.created_at).getTime() > MEDIA_HORA
  const autoGenerar = persistencia && !!firma && ahora != null && (!vigente || reglasViejas)

  async function generar() {
    setError(null); setPaso(0)
    const e = await pedirAnalisis()
    if (e) setError(e)
    else setAhora(Date.now())
  }

  // Con persistencia, el análisis se regenera solo cuando hay datos nuevos (una vez por huella de datos: volver a
  // esta pestaña no lo repite). Si los datos cambian mientras otro análisis está en vuelo no se junta con él (sería
  // de la huella vieja): se espera a que termine (`cargando` en las dependencias) y entonces se pide el nuevo.
  useEffect(() => {
    if (!autoGenerar || cargando || !reclamarAuto(firma)) return
    generar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerar, cargando, firma])

  // Si volviste a Resumen mientras el análisis se generaba, te unes a esa petición para mostrar su error si falla
  // (el resultado llega solo por la sesión). Lo mismo con una pregunta en vuelo.
  useEffect(() => {
    if (analisisEnVuelo) generar()
    const p = respuestaEnVuelo
    if (p) {
      setUltimaPregunta(sesion.preguntando)   // para que «Reintentar» sepa qué se preguntó
      p.then(e => { if (e) setErrorPregunta(e) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mensajes de progreso mientras la IA trabaja (tarda unos 15–25 s).
  useEffect(() => {
    if (!cargando) return
    const t = window.setInterval(() => setPaso(p => (p + 1) % PASOS.length), 3500)
    return () => window.clearInterval(t)
  }, [cargando])

  // Casillas de las acciones: se leen tras montar (localStorage no existe en el servidor) y por análisis mostrado.
  const firmaVista = visible?.firma ?? ''
  useEffect(() => { setHechas(firmaVista ? leerHechas(firmaVista) : []) }, [firmaVista])

  function alternar(clave: string) {
    const n = hechas.includes(clave) ? hechas.filter(x => x !== clave) : [...hechas, clave]
    setHechas(n)
    if (firmaVista) guardarHechas(firmaVista, n)
  }

  async function preguntar(q: string) {
    const texto = q.trim().slice(0, 500)
    if (!texto || preguntando) return
    setErrorPregunta(null); setUltimaPregunta(texto)
    const e = await pedirRespuesta(texto, respuestas.slice(-4))   // continuidad: las últimas 4 vueltas
    if (e) setErrorPregunta(e)
    else setPregunta('')
  }

  // Al llegar una respuesta, o al empezar/terminar de "pensar", la conversación se desplaza hasta el final.
  // Solo ante un cambio: la conversación que ya estaba al volver a Resumen no debe saltar el scroll hasta el chat.
  useEffect(() => {
    const { n, p } = previoChat.current
    previoChat.current = { n: respuestas.length, p: preguntando }
    if (respuestas.length > n || preguntando !== p) {
      // Se lee la preferencia aquí, en el efecto (no al renderizar): con «reducir movimiento» el scroll es instantáneo.
      const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      finChat.current?.scrollIntoView({ block: 'nearest', behavior: reducir ? 'auto' : 'smooth' })
    }
  }, [respuestas.length, preguntando])

  const c = visible?.contenido
  const insights = useMemo(() => (c?.insights ? ordenarInsights(c.insights) : []), [c])
  const acciones = c?.acciones ?? []
  const est = c ? (ESTADO[c.estado] ?? ESTADO.mixto) : null
  const desactualizado = !!visible && !vigente && !cargando
  const nHechas = acciones.filter(a => hechas.includes(claveAccion(a.accion))).length
  const preguntasLibres = PREGUNTAS.filter(q => !respuestas.some(r => r.q === q)).slice(0, 4)

  async function copiar() {
    if (!visible) return
    const texto = textoPlano(visible, hechas, insights)
    let ok = false
    try {
      await navigator.clipboard.writeText(texto)
      ok = true
    } catch {
      try {   // plan B para navegadores sin Clipboard API
        const ta = document.createElement('textarea')
        ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch { ok = false }
    }
    setCopiado(ok ? 'ok' : 'error')
    window.clearTimeout(timerCopia.current)
    timerCopia.current = window.setTimeout(() => setCopiado(null), 2400)
  }

  const destacarActualizar = desactualizado || !visible
  const botonOscuro = `${BTN.base} px-3.5 py-2 text-xs min-h-10 border hover:bg-white/10 ${FOCO_OSCURO}`
  const estiloBotonOscuro = { borderColor: 'rgba(255,255,255,0.22)', color: COLOR.onDark, background: 'rgba(255,255,255,0.05)' }
  const encabezadoBotones = (
    <>
      {c && (
        <button type="button" onClick={copiar} className={botonOscuro} style={estiloBotonOscuro}>
          {copiado === 'ok' ? '✓ Copiado' : copiado === 'error' ? 'No se pudo copiar' : 'Copiar análisis'}
        </button>
      )}
      <button type="button" onClick={generar} disabled={cargando}
        className={destacarActualizar ? `${BTN.base} gold-fill px-4 py-2 text-xs min-h-10 ${FOCO_OSCURO}` : botonOscuro}
        style={destacarActualizar ? undefined : estiloBotonOscuro}>
        {cargando && <Spinner />}
        {cargando ? 'Analizando…' : visible ? '↻ Actualizar' : '✨ Analizar mi progreso'}
      </button>
    </>
  )

  return (
    <section aria-label="Análisis con IA" aria-busy={cargando} className="space-y-4">
      <span className="sr-only" role="status" aria-live="polite">{copiado === 'ok' ? 'Análisis copiado al portapapeles' : ''}</span>

      {/* ── Titular (navy) ── */}
      <Panel dark eyebrow="Análisis con IA" icon="✨" accent="linear-gradient(90deg,#E7C56B,#C2933A)" right={encabezadoBotones}>
        {c && est ? (
          <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <Pill color={est.color}>● {est.label}</Pill>
              {desactualizado && <Pill color={COLOR.warnOnDark}>Desactualizado</Pill>}
              {visible!.fuente === 'reglas' && <Pill color={COLOR.warnOnDark}>Lectura automática</Pill>}
              <span style={{ fontSize: 12, color: COLOR.onDarkMuted }}>{nMediciones === 1 ? 'Lee tu medición' : `Lee tus ${nMediciones} mediciones`}</span>
            </div>
            <h2 className="serif mt-3" style={{ fontSize: 'clamp(25px, 6.6vw, 34px)', lineHeight: 1.14, fontWeight: 600, color: COLOR.onDark, textWrap: 'balance' }}>
              {c.titular}
            </h2>
            {cargando && (
              <p className="mt-3 flex items-center gap-2" style={{ fontSize: 12.5, color: COLOR.onDarkMuted }} role="status">
                <Spinner /> Actualizando el análisis… {PASOS[paso]}
              </p>
            )}
          </div>
        ) : cargando ? (
          <div role="status">
            <p className="serif" style={{ fontSize: 'clamp(23px, 6vw, 28px)', lineHeight: 1.2, fontWeight: 600, color: COLOR.onDark }}>{PASOS[paso]}</p>
            <div className="mt-4 space-y-2.5" aria-hidden>
              {[92, 100, 64].map((w, i) => (
                <div key={i} className="h-3.5 rounded animate-pulse motion-reduce:animate-none" style={{ width: `${w}%`, background: 'rgba(255,255,255,0.12)' }} />
              ))}
            </div>
            <p className="mt-4" style={{ fontSize: 12, color: COLOR.onDarkMuted }}>Suele tardar unos 20 segundos. Puedes seguir en la página.</p>
          </div>
        ) : (
          <div>
            <h2 className="serif" style={{ fontSize: 'clamp(23px, 6vw, 28px)', lineHeight: 1.2, fontWeight: 600, color: COLOR.onDark }}>
              {error ? 'No se pudo generar el análisis' : 'Todavía no hay un análisis'}
            </h2>
            <p className="mt-2" style={{ fontSize: 13.5, lineHeight: 1.6, color: COLOR.onDarkMuted }}>
              {error
                ? `Tus mediciones están a salvo; solo falló la lectura.${error.reintentable ? ' Inténtalo de nuevo.' : ''}`
                : 'Dale a «Analizar mi progreso» para que la IA revise tu peso, tu composición corporal y el ritmo con el que vas, y te diga qué importa y qué hacer.'}
            </p>
          </div>
        )}
      </Panel>

      {error && (
        <div role="alert" className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>{error.mensaje}</p>
          {error.reintentable && (
            <button type="button" onClick={generar} disabled={cargando} className={`${BTN.base} px-3.5 py-2 text-xs min-h-10 border border-red-300 bg-white text-red-800 hover:bg-red-50 ${FOCO}`}>
              {cargando && <Spinner />} Reintentar
            </button>
          )}
        </div>
      )}

      {desactualizado && (
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>Este análisis es de antes de tus últimos cambios en los datos. Actualízalo para que los incluya.</p>
          <button type="button" onClick={generar} className={`${BTN.base} gold-fill px-3.5 py-2 text-xs min-h-10 ${FOCO}`}>↻ Actualizar ahora</button>
        </div>
      )}

      {aviso && vigente && (
        <div role="status" className="rounded-2xl px-4 py-3" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>{aviso}</div>
      )}

      {/* ── Hallazgos ── */}
      {c && insights.length > 0 && (
        <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <div className="flex items-baseline justify-between gap-3 px-1 mb-2.5">
            <Eyebrow>Lo que encontró el análisis</Eyebrow>
            <span style={{ fontSize: 11.5, color: MUTED }}>{insights.length} {insights.length === 1 ? 'hallazgo' : 'hallazgos'}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {insights.map((ins, i) => (
              <InsightCard key={i} ins={ins} ancho={i === 0 && insights.length % 2 === 1} />
            ))}
          </div>
        </div>
      )}
      {!c && cargando && (
        <div className="grid sm:grid-cols-2 gap-3" aria-hidden>
          {[0, 1, 2, 3].map(i => <InsightSkeleton key={i} />)}
        </div>
      )}

      {/* ── Qué hacer (lista de casillas) ── */}
      {c && acciones.length > 0 && (
        <Panel
          eyebrow="Plan de acción" icon="✅" title="Qué hacer ahora"
          subtitle="Marca lo que vayas haciendo; se recuerda en este dispositivo."
          right={<Pill color={nHechas === acciones.length ? '#15803d' : DORADO_TEXTO}>{nHechas} de {acciones.length}</Pill>}
          className={cargando ? 'opacity-60' : ''}
        >
          <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(15,35,64,0.07)' }} aria-hidden>
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(nHechas / acciones.length) * 100}%`, background: 'linear-gradient(90deg,#E7C56B,#C2933A)' }} />
          </div>
          <ul role="list" className="-mx-2">
            {acciones.map((a, i) => {
              const k = claveAccion(a.accion)
              const hecho = hechas.includes(k)
              return (
                <li key={i}>
                  <button type="button" role="checkbox" aria-checked={hecho} aria-label={a.accion} onClick={() => alternar(k)}
                    className={`w-full text-left flex gap-3 items-start rounded-xl px-2 py-3 min-h-12 transition-colors hover:bg-[rgba(15,35,64,0.03)] ${FOCO}`}>
                    <span aria-hidden className="mt-0.5 grid place-items-center shrink-0 rounded-md transition-colors"
                      style={{ width: 24, height: 24, border: hecho ? '2px solid transparent' : '2px solid rgba(15,35,64,0.3)', background: hecho ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : '#fff' }}>
                      {hecho && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B1305" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold leading-snug" style={{ fontSize: 14.5, color: hecho ? 'rgba(20,35,61,0.5)' : COLOR.navy, textDecoration: hecho ? 'line-through' : 'none' }}>{a.accion}</span>
                      {a.porque && <span className="block mt-0.5 leading-relaxed" style={{ fontSize: 12.5, color: MUTED }}>{a.porque}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {nHechas === acciones.length && (
            <p className="mt-2 px-1" style={{ fontSize: 12.5, color: '#15803d', fontWeight: 600 }}>
              Todo marcado. Cuando registres una medición nueva, el análisis se actualiza solo.
            </p>
          )}
        </Panel>
      )}

      {/* ── Conversación ── */}
      <Panel eyebrow="Pregúntale a la IA" icon="💬" title="Sobre tus datos" accent={COLOR.navy2}
        right={respuestas.length > 0 ? (
          <button type="button" onClick={() => { cambiarSesion({ respuestas: [] }); setErrorPregunta(null) }}
            className={`${BTN.base} px-3 py-2 text-xs min-h-10 ${FOCO}`} style={{ color: MUTED }}>
            Limpiar conversación
          </button>
        ) : undefined}>
        {preguntasLibres.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Preguntas sugeridas">
            {preguntasLibres.map(q => (
              <button key={q} type="button" disabled={preguntando} onClick={() => preguntar(q)}
                className={`min-h-10 rounded-full px-3.5 py-2 text-left text-[13px] leading-snug border border-[var(--line)] bg-white hover:border-[var(--gold-500)] hover:bg-[#FBFAF6] disabled:opacity-50 transition-colors ${FOCO}`}
                style={{ color: COLOR.navy }}>
                {q}
              </button>
            ))}
          </div>
        )}

        {(respuestas.length > 0 || preguntando || errorPregunta) && (
          <div className="mt-4 space-y-3" role="log" aria-label="Conversación con la IA" aria-live="polite">
            {respuestas.map((r, i) => (
              <div key={i} className="space-y-2">
                <BurbujaUsuario>{r.q}</BurbujaUsuario>
                <div className="flex">
                  <div className="max-w-[94%] rounded-2xl rounded-bl-md px-3.5 py-2.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
                    <Eyebrow color={DORADO_TEXTO}>IA</Eyebrow>
                    <p className="mt-0.5 whitespace-pre-wrap break-words" style={{ fontSize: 13.5, lineHeight: 1.6, color: 'rgba(20,35,61,0.88)' }}>{r.a}</p>
                  </div>
                </div>
              </div>
            ))}
            {preguntando && (
              <div className="space-y-2">
                <BurbujaUsuario>{ses.preguntando}</BurbujaUsuario>
                <div className="flex">
                  <div className="rounded-2xl rounded-bl-md px-3.5 py-3 flex items-center gap-1.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }} role="status" aria-label="La IA está pensando">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="inline-block rounded-full animate-pulse motion-reduce:animate-none" style={{ width: 7, height: 7, background: COLOR.gold, animationDelay: `${i * 180}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {errorPregunta && (
              <div role="alert" className="rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
                <span>{errorPregunta.mensaje}</span>
                {ultimaPregunta && errorPregunta.reintentable && (
                  <button type="button" onClick={() => preguntar(ultimaPregunta)} disabled={preguntando}
                    className={`${BTN.base} px-3 py-2 text-xs min-h-10 border border-red-300 bg-white text-red-800 hover:bg-red-50 ${FOCO}`}>
                    Reintentar
                  </button>
                )}
              </div>
            )}
            <div ref={finChat} />
          </div>
        )}

        <form onSubmit={e => { e.preventDefault(); preguntar(pregunta) }} className="mt-4 flex gap-2">
          <input value={pregunta} onChange={e => setPregunta(e.target.value)} maxLength={500}
            aria-label="Escribe tu pregunta sobre tus datos" enterKeyHint="send" autoComplete="off"
            placeholder="Ej. ¿Qué pasó entre junio y noviembre de 2025?"
            className={`${INPUT} flex-1 min-w-0 min-h-11`} />
          <button type="submit" disabled={preguntando || !pregunta.trim()} className={`${BTN.base} ${BTN.primary} min-h-11 shrink-0 ${FOCO}`}>
            {preguntando && <Spinner />}
            {preguntando ? 'Pensando' : 'Preguntar'}
          </button>
        </form>
      </Panel>

      {/* ── Pie ── */}
      {visible && c && (
        <p className="px-1" style={{ fontSize: 11.5, lineHeight: 1.6, color: MUTED }}>
          {visible.fuente === 'ia' ? 'Gemini' : 'Lectura automática (la IA no respondió)'}
          {ahora != null ? ` · ${hace(visible.created_at, ahora)}` : ''}
          {` · con ${visible.n_registros} ${visible.n_registros === 1 ? 'medición' : 'mediciones'}${FECHA_ISO.test(visible.fecha_base) ? ` hasta el ${fmtFecha(visible.fecha_base)}` : ''}`}
          {/* Solo si el análisis corresponde a los datos y al perfil actuales (la huella incluye el perfil guardado). */}
          {vigente && !perfilSinLeer && (configurado
            ? ` · basado en tu perfil (${perfil.sexo}, ${perfil.estatura_cm} cm)`
            : ` · perfil sin completar: se usaron datos supuestos (${perfil.sexo}, ${perfil.estatura_cm} cm)`)}
          {' · Orientativo: no sustituye a un médico o nutriólogo.'}
        </p>
      )}
      {!persistencia && (
        <p className="px-1" style={{ fontSize: 11.5, lineHeight: 1.6, color: MUTED }}>
          Para que el análisis se guarde entre visitas y se actualice solo con cada medición nueva, corre <code>sql/peso-02-analisis.sql</code> en Supabase.
        </p>
      )}
    </section>
  )
}
