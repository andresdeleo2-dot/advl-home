'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { fmtFecha, hoyMX } from '@/lib/peso'
import {
  ACTIVIDADES, ALCOHOLES, EQUIPOS, EXPERIENCIAS, MAX_TEXTO_PERFIL, PERFIL_DEFAULT, edadEn,
} from '@/lib/peso-perfil'
import type { PesoPerfilProps } from './contratos'
import { BTN, COLOR, Panel, Pill } from './ui'
import { CampoEntrada, CampoLista, CampoTexto, GrupoOpciones } from './perfil/Campos'
import NumerosBase from './perfil/NumerosBase'
import {
  CAMPOS, aForm, evaluarForm, formsIguales, masReciente, resumenGuardado,
  type CampoPerfil, type FormPerfil,
} from './perfil/util'

// Pestaña «Mi perfil»: los datos personales que antes estaban fijos en el código (estatura, sexo, edad, hábitos) y
// que ahora alimentan el IMC, los pesos objetivo, el gasto energético, el análisis con IA y los prompts de
// rutina y dieta. Guardar = PUT /api/peso/perfil; al éxito se avisa a PesoClient (onGuardado) y todo se recalcula.

// Cambios sin guardar. Cambiar de pestaña desmonta este componente y, sin esto, escribir un párrafo de lesiones y
// ir a mirar otra cosa lo perdería. Solo el navegador lo escribe (en un efecto): el servidor y la hidratación ven siempre null.
let borradorPerfil: FormPerfil | null = null

const ETIQUETA_CAMPO: Partial<Record<CampoPerfil, string>> = {
  estatura_cm: 'Estatura', fecha_nacimiento: 'Fecha de nacimiento', sexo: 'Sexo', actividad: 'Nivel de actividad',
  dias_entrenamiento: 'Días de entrenamiento',
}

const MSG_RED = 'No se pudo guardar tu perfil. Revisa tu conexión e inténtalo de nuevo.'
const MSG_SERVIDOR = 'No se pudo guardar tu perfil. Inténtalo de nuevo en un momento.'
const MSG_TARDA = 'El guardado tardó demasiado y se canceló. Inténtalo de nuevo.'
const ESPERA_MAX_MS = 20_000
const ESPERA_REVISION_MS = 12_000   // la comprobación de la tabla es una lectura corta: no hace falta esperar tanto como al guardar
const AMBAR_TEXTO = '#92400e'   // AA sobre el fondo ámbar claro; COLOR.warn solo sirve como relleno
const VERDE_TEXTO = '#166534'   // AA sobre blanco

const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A6420]'

const HORAS_SUENO = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 3), label: `${i + 3} horas` }))
const COMIDAS = Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? '1 comida' : `${i + 1} comidas` }))
const DIAS = Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: String(i) }))
const SEXOS = [{ value: 'hombre' as const, label: 'Hombre' }, { value: 'mujer' as const, label: 'Mujer' }]
const OPCIONES_ACTIVIDAD = ACTIVIDADES.map(a => ({ value: a.value, label: a.label, detalle: a.detalle }))

// La fecha de hoy no cambia "sola" mientras se mira la pestaña; no hay nada a qué suscribirse.
const sinSuscripcion = () => () => {}

/** Fecha en México ('YYYY-MM-DD') de un instante ISO. México no tiene horario de verano desde 2022 (UTC−6 todo el año), así
 *  que basta restar 6 h: sin Intl, el servidor y el navegador imprimen exactamente lo mismo. */
function fechaMX(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? new Date(ms - 6 * 3600_000).toISOString().slice(0, 10) : null
}

// Cada grupo (menos el primero) lleva un filete arriba. `first-of-type` y no `first-child`: el <legend> de la fieldset
// cuenta como hijo, pero no es una <section>.
function Grupo({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="min-w-0 border-t pt-6 first-of-type:border-t-0 first-of-type:pt-0" style={{ borderColor: COLOR.line }}>
      <h3 id={id} className="serif" style={{ fontSize: 20, lineHeight: 1.2, fontWeight: 600, color: COLOR.navy }}>{titulo}</h3>
      <p className="mt-0.5 leading-snug" style={{ fontSize: 12.5, color: COLOR.muted }}>{descripcion}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

// ── «Reintentar» / «Ya la creé, volver a revisar» ────────────────────────────
// Ambos botones tienen que decir que están trabajando y, al terminar, qué pasó: sin eso una relectura lenta se toca dos
// veces y una que vuelve a fallar deja el mismo panel sin que se sepa si hizo algo.
//   'terminada'     un router.refresh() acabó; el resultado se deduce de las props ya frescas (error / disponible)
//   'tabla_ausente' la comprobación directa dijo que la tabla sigue sin existir
//   'sin_respuesta' la comprobación directa no pudo leerse (red, tiempo agotado, error del servidor)
type Revision = 'terminada' | 'tabla_ausente' | 'sin_respuesta'
type Resultado = 'revisando' | 'tabla_ausente' | 'sin_lectura' | 'listo'

const TEXTO_REVISION: Record<Exclude<Resultado, 'listo'>, string> = {
  revisando: 'Revisando…',
  tabla_ausente: 'Sigue sin encontrarse la tabla. Confirma que se ejecutó completo sql/peso-04-perfil.sql y vuelve a revisar.',
  sin_lectura: 'Todavía no se puede leer el perfil. Revisa tu conexión e inténtalo de nuevo en un momento.',
}

// Región viva siempre montada mientras el panel exista: un aviso que nace junto con su región no siempre lo anuncia el
// lector de pantalla. Vacía no ocupa espacio (el margen solo se pone con texto).
function EstadoRevision({ resultado }: { resultado: Resultado | null }) {
  const texto = resultado && resultado !== 'listo' ? TEXTO_REVISION[resultado] : ''
  return (
    <p
      role="status" aria-live="polite" className={texto ? 'mt-3 leading-snug' : undefined}
      style={{ fontSize: 13, fontWeight: 600, color: resultado === 'revisando' ? COLOR.muted : AMBAR_TEXTO }}
    >
      {texto}
    </p>
  )
}

export default function PesoPerfil({ estado, data, onGuardado, error = null }: PesoPerfilProps) {
  const router = useRouter()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const idDe = (c: CampoPerfil) => `${uid}-${c}`

  // ── Fecha de referencia para la edad ─────────────────────────────────────────
  // Servidor e hidratación usan la fecha de la última medición, que llega en las props y por tanto es idéntica en los
  // dos lados (con hoyMX() ahí habría desajuste si la página se sirve justo antes de medianoche y se hidrata después).
  // Ya en el navegador se pasa a la fecha de hoy: useSyncExternalStore hace ese cambio sin aviso de hidratación, y al
  // abrir la pestaña desde la página (sin hidratar) usa hoy desde el primer render, sin parpadeo. Solo difiere si el
  // cumpleaños cae entre la última medición y hoy, y entonces lo correcto es hoy.
  const fechaServidor = masReciente(data, () => true)?.fecha ?? '2000-01-01'
  const hoy = useSyncExternalStore(sinSuscripcion, hoyMX, () => fechaServidor)

  // ── Estado del formulario ────────────────────────────────────────────────────
  const base = useMemo(() => aForm(estado.perfil), [estado.perfil])
  const [form, setForm] = useState<FormPerfil>(() => borradorPerfil ?? base)
  // El perfil guardado puede cambiar por debajo (p. ej. «Reintentar» logra leer lo que antes no se pudo): un formulario sin
  // tocar sigue a la base nueva —si no, quedaría con los datos supuestos marcado como «cambios sin guardar» y guardarlo
  // pisaría el perfil real—; uno con cambios propios no se pisa. Ajuste durante el render para no pintar un cuadro viejo.
  const [baseVista, setBaseVista] = useState(base)
  if (baseVista !== base) {
    setBaseVista(base)
    if (formsIguales(form, baseVista) && !formsIguales(form, base)) setForm(base)
  }
  const [tocados, setTocados] = useState<ReadonlySet<CampoPerfil>>(() => new Set())
  const [intentado, setIntentado] = useState(false)
  const [fase, setFase] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')
  const [faltaTabla, setFaltaTabla] = useState(false)

  // Revisión pedida con los botones de los paneles de aviso. `pendiente` dura hasta que el servidor responde al refresh;
  // `verificando` cubre la comprobación directa de la tabla que se hace antes.
  const [pendiente, iniciarRefresh] = useTransition()
  const [verificando, setVerificando] = useState(false)
  const [revision, setRevision] = useState<Revision | null>(null)
  const esperaRefresh = useRef(false)
  const revisando = verificando || pendiente
  const tituloRef = useRef<HTMLSpanElement>(null)   // encabezado del formulario: a dónde va el foco cuando se quita el panel de aviso

  const ev = useMemo(() => evaluarForm(form, hoy), [form, hoy])
  const dirty = !formsIguales(form, base)
  const bloqueado = !estado.disponible || faltaTabla || !!error

  useEffect(() => { borradorPerfil = formsIguales(form, base) ? null : form }, [form, base])

  // Al terminar el refresh se marca la revisión como hecha. Este efecto del hijo corre en la misma tanda que el del
  // padre que adopta el perfil nuevo (PesoClient), así que el primer render con 'terminada' ya trae el estado fresco.
  useEffect(() => {
    if (pendiente || !esperaRefresh.current) return
    esperaRefresh.current = false
    setRevision('terminada')
  }, [pendiente])

  const cambiar = useCallback((c: CampoPerfil, v: string) => {
    setForm(f => (f[c] === v ? f : { ...f, [c]: v }))
    setFase(f => (f === 'ok' || f === 'error' ? 'idle' : f))
    setRevision(null)
  }, [])
  const tocar = useCallback((c: CampoPerfil) => setTocados(s => (s.has(c) ? s : new Set(s).add(c))), [])
  const cambiarYTocar = useCallback((c: CampoPerfil, v: string) => { cambiar(c, v); tocar(c) }, [cambiar, tocar])
  const ver = (c: CampoPerfil) => (intentado || tocados.has(c) ? ev.errores[c] : undefined)
  const conErrores = CAMPOS.filter(c => ev.errores[c])

  function deshacer() {
    setForm(base); setTocados(new Set()); setIntentado(false); setFase('idle'); setMensaje('')
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (fase === 'guardando' || bloqueado) return
    setIntentado(true)
    const valor = ev.valor
    if (!valor) {
      const primero = conErrores[0]
      if (primero) requestAnimationFrame(() => document.getElementById(idDe(primero))?.focus())
      else { setFase('error'); setMensaje(ev.errorGeneral ?? MSG_SERVIDOR) }
      return
    }

    const foto = form                                  // lo que se manda: si se edita durante el guardado, eso no se pisa
    const eraConfigurado = estado.configurado
    const anterior = estado.perfil
    setFase('guardando'); setMensaje(''); setRevision(null)
    const ctrl = new AbortController()
    const temporizador = setTimeout(() => ctrl.abort(), ESPERA_MAX_MS)
    try {
      const res = await fetch('/api/peso/perfil', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valor), signal: ctrl.signal,
      })
      let json: { ok?: boolean; error?: string; codigo?: string; estado?: { actualizado?: string | null } } | null = null
      try { json = await res.json() } catch { /* cuerpo que no es JSON: se usa el mensaje genérico */ }

      if (res.ok && json?.ok) {
        borradorPerfil = null
        setForm(f => (formsIguales(f, foto) ? aForm(valor) : f))
        setTocados(new Set()); setIntentado(false)
        setFase('ok'); setMensaje(resumenGuardado(anterior, valor, eraConfigurado))
        onGuardado(valor, {
          perfil: valor, configurado: true, disponible: true,
          actualizado: typeof json.estado?.actualizado === 'string' ? json.estado.actualizado : null,
        })
        return
      }
      setFase('error')
      if (res.status === 503 && json?.codigo === 'sin_tabla') { setFaltaTabla(true); setMensaje('Falta crear la tabla del perfil en Supabase (sql/peso-04-perfil.sql).') }
      else if (res.status === 401) setMensaje('Tu sesión expiró. Vuelve a iniciar sesión e inténtalo de nuevo.')
      else if (res.status === 403) setMensaje('Esta cuenta no tiene acceso para guardar el perfil.')
      else if (res.status === 400 || res.status === 413) setMensaje(typeof json?.error === 'string' ? json.error : MSG_SERVIDOR)
      else setMensaje(MSG_SERVIDOR)
    } catch (err) {
      setFase('error')
      setMensaje(err instanceof DOMException && err.name === 'AbortError' ? MSG_TARDA : MSG_RED)
    } finally {
      clearTimeout(temporizador)
    }
  }

  // «Reintentar» (la lectura del perfil falló): se vuelve a pedir la página al servidor; el resultado sale de las props nuevas.
  function reintentarLectura() {
    if (revisando) return
    setRevision(null)
    esperaRefresh.current = true
    iniciarRefresh(() => router.refresh())
  }

  // «Ya la creé, volver a revisar»: primero se confirma con el servidor que la tabla ya existe y SOLO entonces se quita
  // `faltaTabla`. Si se quitara antes (con un 503 del PUT la tabla seguía sin existir), el panel desaparecería y el
  // formulario se reactivaría sin explicación hasta fallar otra vez al guardar. Ya confirmada, el refresh hace que
  // PesoClient adopte `disponible` y recalcule la huella del análisis.
  async function revisarTabla() {
    if (revisando) return
    setRevision(null); setVerificando(true)
    const ctrl = new AbortController()
    const temporizador = setTimeout(() => ctrl.abort(), ESPERA_REVISION_MS)
    let existe = false
    let fin: Revision = 'sin_respuesta'
    try {
      const res = await fetch('/api/peso/perfil', { cache: 'no-store', signal: ctrl.signal })
      let json: { ok?: boolean; estado?: { disponible?: boolean } } | null = null
      try { json = await res.json() } catch { /* cuerpo que no es JSON: cuenta como sin respuesta */ }
      if (res.ok && json?.ok && json.estado) {
        existe = json.estado.disponible === true
        if (!existe) fin = 'tabla_ausente'
      }
    } catch { /* red caída o tiempo agotado: queda 'sin_respuesta' */ } finally {
      clearTimeout(temporizador)
    }
    if (existe) {
      if (faltaTabla) { setFase('idle'); setMensaje('') }   // el «Falta crear la tabla» del guardado ya no aplica
      setFaltaTabla(false)
      esperaRefresh.current = true
      iniciarRefresh(() => router.refresh())
    } else {
      setRevision(fin)
    }
    setVerificando(false)   // en la misma tanda que `pendiente`: el botón no se rehabilita entre una fase y otra
  }

  // ── Derivados para la vista ──────────────────────────────────────────────────
  // Qué decir de la última revisión. 'terminada' se juzga con las props actuales: si ya no hay error ni falta la tabla, el
  // panel desaparece y la confirmación queda en la línea de estado del formulario.
  const resultado: Resultado | null = revisando ? 'revisando'
    : revision === 'tabla_ausente' ? 'tabla_ausente'
      : revision === 'sin_respuesta' ? 'sin_lectura'
        : revision === 'terminada' ? (error ? 'sin_lectura' : !estado.disponible || faltaTabla ? 'tabla_ausente' : 'listo')
          : null
  // Al terminar con éxito una revisión, el panel de aviso desaparece junto con el botón que tenía el foco: sin esto el foco
  // cae al <body> y quien navega con teclado o lector de pantalla pierde su lugar. Se lleva al encabezado del formulario,
  // que es lo que se queda en su sitio (tabIndex=-1: recibe foco por código, no entra en el orden del Tab). Solo cuando
  // el foco de verdad se perdió (a quien ya se movió a otro lado no se le roba) y nunca en el primer render: `listo` solo
  // pasa a true tras una revisión, y el efecto corre únicamente en ese cambio.
  const listo = resultado === 'listo'
  useEffect(() => {
    if (!listo) return
    const activo = document.activeElement
    if (!activo || activo === document.body) tituloRef.current?.focus()
  }, [listo])
  const guardadoEl = fechaMX(estado.actualizado)
  const edadSupuesta = edadEn(PERFIL_DEFAULT.fecha_nacimiento, hoy)
  const actividadSupuesta = ACTIVIDADES.find(a => a.value === PERFIL_DEFAULT.actividad)?.label.toLowerCase()
  const etiquetaBoton = fase === 'guardando' ? 'Guardando…'
    : !dirty && estado.configurado ? (fase === 'ok' ? '✓ Guardado' : 'Sin cambios por guardar')
      : estado.configurado ? 'Guardar cambios' : 'Guardar mi perfil'
  const botonInactivo = bloqueado || fase === 'guardando' || (!dirty && estado.configurado)

  return (
    <>
      {/* (c) Aún no hay perfil guardado: se dice con qué datos se está calculando todo. */}
      {!estado.configurado && !error && (
        <aside
          aria-label="Datos supuestos"
          className="animate-fade rounded-2xl px-4 py-3.5 sm:px-5"
          style={{ background: '#FEF4E0', border: '1px solid #E6C27C', color: AMBAR_TEXTO }}
        >
          <p className="serif" style={{ fontSize: 17, lineHeight: 1.25, fontWeight: 600 }}>
            <span aria-hidden>⚠️ </span>Estás usando datos supuestos
          </p>
          <p className="mt-1 leading-snug" style={{ fontSize: 13.5 }}>
            Estatura {PERFIL_DEFAULT.estatura_cm} cm, {PERFIL_DEFAULT.sexo}, {edadSupuesta ?? '—'} años, actividad {actividadSupuesta} y {PERFIL_DEFAULT.dias_entrenamiento} días de entrenamiento.
            {' '}Completa y guarda tu perfil para que el IMC, los pesos objetivo, el gasto y el análisis con IA usen tus datos.
          </p>
        </aside>
      )}

      {error && (
        <Panel eyebrow="No se pudo leer" icon="⚠️" title="Tu perfil guardado no cargó" accent={COLOR.bad}>
          <div role="alert">
            <p style={{ fontSize: 14, lineHeight: 1.55, color: COLOR.ink }}>
              {error} Por seguridad el formulario queda bloqueado: así no se sobrescribe lo que ya tengas guardado con los datos supuestos.
            </p>
          </div>
          <div className="mt-4">
            <button
              type="button" onClick={reintentarLectura} disabled={revisando} aria-busy={revisando}
              className={`${BTN.base} ${BTN.gold} min-h-[46px] ${FOCO}`}
            >
              {revisando ? 'Revisando…' : 'Reintentar'}
            </button>
          </div>
          <EstadoRevision resultado={resultado} />
        </Panel>
      )}

      {(!estado.disponible || faltaTabla) && !error && (
        <Panel eyebrow="Configuración pendiente" icon="🛠️" title="Falta crear la tabla del perfil" accent={COLOR.warn}>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: COLOR.ink }}>
            Falta crear la tabla <code className="rounded px-1" style={{ background: 'rgba(15,35,64,0.06)' }}>peso_perfil</code>: corre{' '}
            <code className="rounded px-1" style={{ background: 'rgba(15,35,64,0.06)' }}>sql/peso-04-perfil.sql</code> en Supabase (SQL Editor, pegar el archivo y ejecutarlo).
          </p>
          <p className="mt-2" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.muted }}>
            Mientras tanto todo sigue funcionando con los datos supuestos y el formulario queda deshabilitado.
          </p>
          <div className="mt-4">
            <button
              type="button" onClick={revisarTabla} disabled={revisando} aria-busy={revisando}
              className={`${BTN.base} ${BTN.gold} min-h-[46px] ${FOCO}`}
            >
              {revisando ? 'Revisando…' : 'Ya la creé, volver a revisar'}
            </button>
          </div>
          <EstadoRevision resultado={resultado} />
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        {/* (a) Formulario */}
        <Panel
          eyebrow="Tus datos" icon="👤"
          title={<span ref={tituloRef} tabIndex={-1} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8A6420]">Mi perfil</span>}
          subtitle="Con esto se calculan tu IMC, tus pesos objetivo y tu gasto energético, y la IA deja de suponer."
          right={estado.configurado && guardadoEl ? <Pill color={VERDE_TEXTO}>✓ Guardado el {fmtFecha(guardadoEl)}</Pill> : undefined}
        >
          <form onSubmit={guardar} noValidate aria-busy={fase === 'guardando'}>
            <fieldset disabled={bloqueado} className="m-0 min-w-0 space-y-6 border-0 p-0">
              <legend className="sr-only">Datos del perfil</legend>

              <Grupo titulo="Lo esencial" descripcion="Con estos datos salen el IMC, los pesos objetivo y los rangos de grasa.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoEntrada
                    id={idDe('estatura_cm')} label="Estatura" type="number" requerido unidad="cm" step="0.1" min={120} max={230}
                    value={form.estatura_cm} onChange={v => cambiar('estatura_cm', v)} onBlur={() => tocar('estatura_cm')}
                    error={ver('estatura_cm')} ayuda="En centímetros y sin zapatos, por ejemplo 181."
                  />
                  <CampoEntrada
                    id={idDe('fecha_nacimiento')} label="Fecha de nacimiento" type="date" opcional
                    value={form.fecha_nacimiento} onChange={v => cambiar('fecha_nacimiento', v)} onBlur={() => tocar('fecha_nacimiento')}
                    error={ver('fecha_nacimiento')} ayuda="Da tu edad y permite calcular el gasto basal por fórmula."
                  />
                </div>
                <GrupoOpciones
                  id={idDe('sexo')} label="Sexo" ayuda="Cambia la fórmula del gasto basal y los rangos de % de grasa y de músculo de referencia."
                  value={form.sexo} onChange={v => cambiarYTocar('sexo', v)} opciones={SEXOS} columnas="grid-cols-2"
                  error={ver('sexo')}
                />
              </Grupo>

              <Grupo titulo="Tu día a día" descripcion="Ayuda a estimar tu gasto y a que las rutinas y dietas que generes se ajusten a ti.">
                <GrupoOpciones
                  id={idDe('actividad')} label="Nivel de actividad"
                  value={form.actividad} onChange={v => cambiarYTocar('actividad', v)}
                  opciones={OPCIONES_ACTIVIDAD} columnas="grid-cols-1 sm:grid-cols-2"
                  error={ver('actividad')}
                />
                <GrupoOpciones
                  id={idDe('dias_entrenamiento')} label="Días de entrenamiento por semana" variante="ficha" columnas="grid-cols-4 sm:grid-cols-8"
                  ayuda="Cuántos días haces ejercicio a propósito (0 si ninguno)."
                  value={form.dias_entrenamiento} onChange={v => cambiarYTocar('dias_entrenamiento', v)} opciones={DIAS}
                  error={ver('dias_entrenamiento')}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoLista
                    id={idDe('experiencia')} label="Experiencia entrenando" value={form.experiencia}
                    onChange={v => cambiar('experiencia', v)} opciones={EXPERIENCIAS}
                  />
                  <CampoLista
                    id={idDe('equipo')} label="Equipo disponible" value={form.equipo}
                    onChange={v => cambiar('equipo', v)} opciones={EQUIPOS}
                  />
                  <CampoLista
                    id={idDe('sueno_horas')} label="Sueño por noche" value={form.sueno_horas}
                    onChange={v => cambiar('sueno_horas', v)} opciones={HORAS_SUENO} ayuda="Horas en promedio."
                  />
                  <CampoLista
                    id={idDe('comidas_dia')} label="Comidas al día" value={form.comidas_dia}
                    onChange={v => cambiar('comidas_dia', v)} opciones={COMIDAS} ayuda="Contando colaciones."
                  />
                  <CampoLista
                    id={idDe('alcohol')} label="Alcohol" value={form.alcohol}
                    onChange={v => cambiar('alcohol', v)} opciones={ALCOHOLES}
                  />
                </div>
              </Grupo>

              <Grupo titulo="Cuidados y preferencias" descripcion="Texto libre y opcional. Mientras más claro, mejores recomendaciones.">
                <p
                  className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 leading-snug"
                  style={{ fontSize: 12.5, background: 'rgba(15,35,64,0.05)', color: COLOR.ink }}
                >
                  <span aria-hidden>🔒</span>
                  <span>Estos textos se incluyen en los análisis con IA y en los prompts que copias: escribe solo lo que quieras compartir.</span>
                </p>
                <CampoTexto
                  id={idDe('lesiones')} label="Lesiones o limitaciones" max={MAX_TEXTO_PERFIL}
                  value={form.lesiones} onChange={v => cambiar('lesiones', v)} onBlur={() => tocar('lesiones')}
                  placeholder="Ej. rodilla izquierda: evitar saltos y sentadilla profunda"
                />
                <CampoTexto
                  id={idDe('restricciones')} label="Alergias o restricciones alimentarias" max={MAX_TEXTO_PERFIL}
                  value={form.restricciones} onChange={v => cambiar('restricciones', v)} onBlur={() => tocar('restricciones')}
                  placeholder="Ej. intolerancia a la lactosa; no como mariscos"
                />
                <CampoTexto
                  id={idDe('preferencias')} label="Preferencias y presupuesto" max={MAX_TEXTO_PERFIL}
                  value={form.preferencias} onChange={v => cambiar('preferencias', v)} onBlur={() => tocar('preferencias')}
                  placeholder="Ej. cocino dos veces por semana; presupuesto de 1,500 pesos a la semana"
                />
                <CampoTexto
                  id={idDe('notas_salud')} label="Notas de salud" max={MAX_TEXTO_PERFIL}
                  value={form.notas_salud} onChange={v => cambiar('notas_salud', v)} onBlur={() => tocar('notas_salud')}
                  placeholder="Lo que tu médico quiere que se considere"
                  ayuda="Solo si quieres que el análisis lo tenga en cuenta."
                />
              </Grupo>
            </fieldset>

            {/* Resumen de errores tras un intento de guardar */}
            {intentado && conErrores.length > 0 && (
              <div role="alert" className="mt-5 rounded-xl px-4 py-3" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b' }}>
                <p style={{ fontSize: 13.5, fontWeight: 700 }}>Revisa {conErrores.length === 1 ? 'este dato' : `estos ${conErrores.length} datos`} antes de guardar:</p>
                <ul className="mt-1 list-disc pl-5" style={{ fontSize: 13 }}>
                  {conErrores.map(c => (
                    <li key={c}>
                      <button
                        type="button" className={`inline-flex min-h-[44px] items-center text-left underline underline-offset-2 ${FOCO}`}
                        onClick={() => document.getElementById(idDe(c))?.focus()}
                      >
                        {ETIQUETA_CAMPO[c] ?? c}
                      </button>
                      : {ev.errores[c]}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={botonInactivo} className={`${BTN.base} ${BTN.gold} min-h-[46px] ${FOCO}`}>
                {etiquetaBoton}
              </button>
              {dirty && !bloqueado && fase !== 'guardando' && (
                <button type="button" onClick={deshacer} className={`${BTN.base} ${BTN.ghost} min-h-[44px] ${FOCO}`}>Deshacer cambios</button>
              )}
              {/* Región viva siempre montada: el anuncio de un aviso que nace con su región no siempre llega al lector de pantalla. */}
              <p role="status" aria-live="polite" className="min-w-0 flex-1 leading-snug" style={{ fontSize: 13, fontWeight: 600, color: VERDE_TEXTO, flexBasis: 220 }}>
                {fase === 'guardando' ? <span style={{ color: COLOR.muted }}>Guardando…</span>
                  : fase === 'ok' ? <><span aria-hidden>✓ </span>{mensaje}</>
                    : resultado === 'listo' ? <><span aria-hidden>✓ </span>Listo: ya puedes editar y guardar tu perfil.</>
                      : dirty && !bloqueado ? <span style={{ color: COLOR.muted, fontWeight: 500 }}>Tienes cambios sin guardar.</span> : null}
              </p>
            </div>
            {fase === 'error' && mensaje && (
              <p role="alert" className="mt-3 leading-snug" style={{ fontSize: 13.5, fontWeight: 600, color: '#b91c1c' }}>
                <span aria-hidden>⛔ </span>{mensaje}
              </p>
            )}
          </form>
        </Panel>

        {/* (b) Números base: del perfil guardado, o del borrador válido como vista previa */}
        <NumerosBase
          perfil={ev.valor && dirty ? ev.valor : estado.perfil}
          data={data} hoy={hoy}
          vistaPrevia={dirty && !!ev.valor}
          supuestos={!estado.configurado && !dirty}
        />
      </div>
    </>
  )
}
