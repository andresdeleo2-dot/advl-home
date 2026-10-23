'use client'

// El visor: aquí se PROYECTA el HTML subido. Va dentro de un iframe con sandbox SIN allow-same-origin
// (origen opaco: el documento no puede leer cookies ni llamar a /api con tu sesión) y su alto se ajusta
// solo con el postMessage que manda el script embebido; el mismo canal lleva los enlaces de ancla (#seccion)
// del índice del documento, que scrollea esta página. Además: barra de acciones, edición en línea y
// confirmación para eliminar.

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import {
  MAX_DESCRIPCION, MAX_TITULO, PLAN_IFRAME_SANDBOX, PLAN_MSG_ALTO, PLAN_TIPOS, esMsgAncla, planHtmlUrl,
  type PesoPlanMeta, type PlanMsgAlto, type PlanTipo,
} from '@/lib/peso-planes'
import { COLOR, Eyebrow, INPUT, Panel, Segmented } from '../ui'
import { BTN_ICONO, EnUsoBadge, FOCO, Icono, Spinner, TIPO_COLOR, btn, tipoInfo } from './comun'
import { fechaRelativa, fmtBytes } from './util'

const ALTO_MIN = 320
const ALTO_MAX = 20_000
const ESPERA_ALTO_MS = 4000
/** Mensajes seguidos y siempre creciendo (cada <500 ms) a partir de los cuales se asume un bucle
 *  (p. ej. un body con min-height:100vh más margen, que crece cada vez que el iframe crece). */
const RACHA_MAX = 25

export type CambiosPlan = { titulo?: string; descripcion?: string; tipo?: PlanTipo }

type Props = {
  plan: PesoPlanMeta
  hoy: string | null
  /** Clave de la petición en curso ('uso' | 'editar' | 'borrar' | …) o null. Mientras haya una, se deshabilitan las acciones. */
  ocupado: string | null
  onProyectar: () => void
  onMarcarEnUso: () => void
  onEditar: (cambios: CambiosPlan) => Promise<boolean>
  onEliminar: () => Promise<boolean>
}

// ── Marco con el HTML ───────────────────────────────────────────────────────

function Esqueleto() {
  return (
    <div aria-hidden className="absolute inset-0 z-10 p-6 sm:p-10 space-y-4 pointer-events-none motion-safe:animate-pulse" style={{ background: '#fff' }}>
      <div className="h-3 w-24 rounded-full" style={{ background: '#EFE9D8' }} />
      <div className="h-8 w-2/3 rounded-lg" style={{ background: '#EFEBDF' }} />
      <div className="h-3 w-full rounded-full" style={{ background: '#F3F0E7' }} />
      <div className="h-3 w-5/6 rounded-full" style={{ background: '#F3F0E7' }} />
      <div className="grid grid-cols-3 gap-3 pt-3">
        {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-xl" style={{ background: '#F6F3EA' }} />)}
      </div>
      <div className="h-40 rounded-xl" style={{ background: '#F6F3EA' }} />
    </div>
  )
}

function MarcoHtml({ plan }: { plan: PesoPlanMeta }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [alto, setAlto] = useState<number | null>(null)
  const [cargado, setCargado] = useState(false)
  const [sinAviso, setSinAviso] = useState(false)     // pasó la espera y no llegó ningún alto
  const [desbocado, setDesbocado] = useState(false)   // el alto crecía sin parar → se fija y se hace scroll adentro
  // El iframe se crea hasta DESPUÉS de registrar el listener. Si viniera en el HTML del servidor (recarga
  // en ?tab=planes), el navegador lo cargaría antes de hidratar y su primer aviso de alto (el script solo
  // publica cuando el alto cambia) se perdería: el plan se quedaría en 80vh con doble scroll.
  const [montado, setMontado] = useState(false)
  const altoRef = useRef<number | null>(null)
  const racha = useRef({ n: 0, t: 0 })

  useEffect(() => {
    function alMensaje(e: MessageEvent) {
      // Solo se confía en el iframe de ESTE visor (su origen es opaco, así que no hay origin que comparar).
      const w = ref.current?.contentWindow
      if (!w || e.source !== w) return
      // Enlace de ancla (#seccion) del índice del documento: el iframe mide todo el documento y no tiene scroll
      // propio, así que el scroll lo hace esta página. `y` = distancia del destino al inicio del documento.
      if (esMsgAncla(e.data, plan.id)) {
        const marco = ref.current
        if (!marco) return
        const barra = document.getElementById('peso-tabs')?.offsetHeight ?? 0   // la barra de pestañas es pegajosa: tapa lo de arriba
        const reducido = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const y = Math.min(e.data.y, marco.offsetHeight)                        // un y absurdo no manda la página más allá del marco
        window.scrollTo({ top: Math.max(0, marco.getBoundingClientRect().top + window.scrollY + y - barra - 12), behavior: reducido ? 'auto' : 'smooth' })
        return
      }
      const d = e.data as Partial<PlanMsgAlto> | null
      if (!d || typeof d !== 'object' || d.type !== PLAN_MSG_ALTO || d.id !== plan.id) return
      if (typeof d.alto !== 'number' || !Number.isFinite(d.alto)) return
      const v = Math.ceil(Math.min(ALTO_MAX, Math.max(ALTO_MIN, d.alto)))
      const prev = altoRef.current
      if (prev != null && Math.abs(v - prev) < 2) return
      const t = performance.now()
      racha.current.n = prev != null && v > prev && t - racha.current.t < 500 ? racha.current.n + 1 : 0
      racha.current.t = t
      if (racha.current.n > RACHA_MAX) { setDesbocado(true); return }
      altoRef.current = v
      setAlto(v)
    }
    window.addEventListener('message', alMensaje)
    const espera = setTimeout(() => setSinAviso(true), ESPERA_ALTO_MS)
    return () => { window.removeEventListener('message', alMensaje); clearTimeout(espera) }
  }, [plan.id])

  // Declarado DESPUÉS del efecto del listener: los efectos corren en orden, así que al crearse el iframe
  // (siguiente render) el listener ya existe.
  useEffect(() => { setMontado(true) }, [])

  const fase: 'esperando' | 'auto' | 'fijo' = desbocado ? 'fijo' : alto != null ? 'auto' : sinAviso ? 'fijo' : 'esperando'
  const altoCss = fase === 'auto' ? `${alto}px` : fase === 'fijo' ? '80vh' : '70vh'

  return (
    // Mientras no hay iframe (SSR y primer render) el contenedor reserva el mismo alto para que el esqueleto
    // tenga dónde pintarse y no haya salto de layout al montarlo.
    <div className="relative" aria-busy={fase === 'esperando' && !cargado} style={montado ? undefined : { height: altoCss }}>
      {fase === 'esperando' && !cargado && <Esqueleto />}
      {montado && (
        <iframe
          ref={ref}
          src={planHtmlUrl(plan.id, { embed: true })}
          title={`${tipoInfo(plan.tipo).label}: ${plan.titulo}`}
          sandbox={PLAN_IFRAME_SANDBOX}
          referrerPolicy="no-referrer"
          onLoad={() => setCargado(true)}
          className="block w-full border-0"
          style={{ height: altoCss, background: '#fff' }}
        />
      )}
    </div>
  )
}

// ── Edición en línea ────────────────────────────────────────────────────────

function EditorPlan({ plan, ocupado, onGuardar, onCancelar }: {
  plan: PesoPlanMeta; ocupado: boolean
  onGuardar: (c: CambiosPlan) => Promise<boolean>; onCancelar: () => void
}) {
  const [titulo, setTitulo] = useState(plan.titulo)
  const [descripcion, setDescripcion] = useState(plan.descripcion ?? '')
  const [tipo, setTipo] = useState<PlanTipo>(plan.tipo)
  const idT = useId(), idD = useId()
  const t = titulo.trim()
  const d = descripcion.trim()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!t || ocupado) return
    const cambios: CambiosPlan = {}
    if (t !== plan.titulo) cambios.titulo = t
    if (d !== (plan.descripcion ?? '')) cambios.descripcion = d
    if (tipo !== plan.tipo) cambios.tipo = tipo
    if (!Object.keys(cambios).length) { onCancelar(); return }
    if (await onGuardar(cambios)) onCancelar()
  }
  const alTeclear = (e: ReactKeyboardEvent) => { if (e.key === 'Escape' && !ocupado) { e.stopPropagation(); onCancelar() } }

  return (
    <form onSubmit={enviar} onKeyDown={alTeclear} aria-label="Editar documento" className="rounded-xl p-3.5 sm:p-4 space-y-3.5"
      style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
      <div>
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <label htmlFor={idT}><Eyebrow>Título</Eyebrow></label>
          <span className="text-[11px] tabular-nums" style={{ color: COLOR.faint }}>{titulo.length}/{MAX_TITULO}</span>
        </div>
        <input id={idT} className={INPUT} value={titulo} maxLength={MAX_TITULO} autoFocus aria-invalid={!t}
          onChange={e => setTitulo(e.target.value)} aria-describedby={!t ? `${idT}-e` : undefined} />
        {!t && <p id={`${idT}-e`} className="mt-1 text-xs" style={{ color: COLOR.bad }}>Escribe un título.</p>}
      </div>
      <div>
        <div className="mb-1"><Eyebrow>Tipo</Eyebrow></div>
        <Segmented<PlanTipo> ariaLabel="Tipo de documento" value={tipo} onChange={setTipo}
          className="[&_button]:min-h-10"
          options={PLAN_TIPOS.map(o => ({ value: o.value, label: <>{o.icon} {o.label}</> }))} />
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <label htmlFor={idD}><Eyebrow>Descripción <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, color: COLOR.faint }}>(opcional)</span></Eyebrow></label>
          <span className="text-[11px] tabular-nums" style={{ color: COLOR.faint }}>{descripcion.length}/{MAX_DESCRIPCION}</span>
        </div>
        <textarea id={idD} className={`${INPUT} resize-y`} rows={3} value={descripcion} maxLength={MAX_DESCRIPCION}
          placeholder="¿De qué trata? Aparece en la tarjeta de la biblioteca." onChange={e => setDescripcion(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancelar} disabled={ocupado} className={btn('ghost')}>Cancelar</button>
        <button type="submit" disabled={!t || ocupado} className={btn('gold')}>
          {ocupado ? <><Spinner />Guardando…</> : <><Icono n="check" />Guardar cambios</>}
        </button>
      </div>
    </form>
  )
}

// ── Visor ───────────────────────────────────────────────────────────────────

export default function VisorPlan({ plan, hoy, ocupado, onProyectar, onMarcarEnUso, onEditar, onEliminar }: Props) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'borrar'>('ver')
  const editarRef = useRef<HTMLButtonElement>(null)
  const borrarRef = useRef<HTMLButtonElement>(null)
  const bloqueado = !!ocupado
  const info = tipoInfo(plan.tipo)

  // Al cancelar, el foco vuelve al botón que abrió el modo (los botones se vuelven a montar).
  function volver(ref: RefObject<HTMLButtonElement | null>) {
    setModo('ver')
    requestAnimationFrame(() => ref.current?.focus())
  }

  return (
    <Panel
      flush
      accent={TIPO_COLOR[plan.tipo]}
      eyebrow={info.label}
      icon={info.icon}
      title={plan.titulo}
      subtitle={
        <>
          {plan.descripcion && <span className="block mb-0.5" style={{ whiteSpace: 'pre-line', color: COLOR.ink }}>{plan.descripcion}</span>}
          <span>Subido {fechaRelativa(plan.created_at, hoy)} · {fmtBytes(plan.bytes)}</span>
        </>
      }
      right={plan.activo ? <EnUsoBadge /> : undefined}
    >
      <div className="px-5 sm:px-6 pt-2 pb-4">
        {modo === 'ver' && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onProyectar} disabled={bloqueado} className={btn('primary')}>
              <Icono n="proyectar" size={17} />Proyectar
            </button>
            {!plan.activo && (
              <button type="button" onClick={onMarcarEnUso} disabled={bloqueado} className={btn('gold')}>
                {ocupado === 'uso' ? <><Spinner />Marcando…</> : <><Icono n="estrella" size={16} />Marcar en uso</>}
              </button>
            )}
            <span className="hidden sm:block flex-1" />
            <a href={planHtmlUrl(plan.id)} target="_blank" rel="noopener noreferrer" aria-label="Abrir en pestaña nueva" title="Abrir en pestaña"
              className={`${btn('ghost')} ${BTN_ICONO}`}>
              <Icono n="externo" size={16} /><span className="hidden sm:inline">Abrir en pestaña</span>
            </a>
            <a href={planHtmlUrl(plan.id, { descargar: true })} download aria-label="Descargar el HTML" title="Descargar"
              className={`${btn('ghost')} ${BTN_ICONO}`}>
              <Icono n="descargar" size={16} /><span className="hidden sm:inline">Descargar</span>
            </a>
            <button ref={editarRef} type="button" onClick={() => setModo('editar')} disabled={bloqueado} aria-label="Editar título, descripción y tipo" title="Editar"
              className={`${btn('ghost')} ${BTN_ICONO}`}>
              <Icono n="editar" size={16} /><span className="hidden sm:inline">Editar</span>
            </button>
            <button ref={borrarRef} type="button" onClick={() => setModo('borrar')} disabled={bloqueado} aria-label="Eliminar este documento" title="Eliminar"
              className={`${btn('danger')} ${BTN_ICONO}`}>
              <Icono n="basura" size={16} /><span className="hidden sm:inline">Eliminar</span>
            </button>
          </div>
        )}

        {modo === 'editar' && (
          <EditorPlan plan={plan} ocupado={ocupado === 'editar'} onGuardar={onEditar} onCancelar={() => volver(editarRef)} />
        )}

        {modo === 'borrar' && (
          <div role="group" aria-label="Confirmar eliminación" onKeyDown={e => { if (e.key === 'Escape' && !bloqueado) { e.stopPropagation(); volver(borrarRef) } }}
            className="flex flex-wrap items-center gap-3 rounded-xl p-3.5" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <p className="flex-1 basis-56 text-sm" style={{ color: '#7F1D1D' }}>
              <strong>¿Eliminar «{plan.titulo}»?</strong>{' '}
              {plan.activo ? 'Es tu documento en uso. ' : ''}Se borra el HTML guardado y no se puede deshacer.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" autoFocus onClick={() => volver(borrarRef)} disabled={bloqueado} className={btn('ghost')}>Cancelar</button>
              <button type="button" onClick={() => void onEliminar()} disabled={bloqueado}
                className={`${btn('danger')} bg-red-600! text-white! border-red-600! hover:bg-red-700!`}>
                {ocupado === 'borrar' ? <><Spinner />Eliminando…</> : <><Icono n="basura" size={15} />Sí, eliminar</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* El "paspartú": marco redondeado con sombra donde se proyecta el documento. */}
      <div className="px-2.5 sm:px-4 pt-3 pb-3.5" style={{ background: 'linear-gradient(180deg,#EEEADF,#E7E2D4)', borderTop: `1px solid ${COLOR.line}` }}>
        <div className="rounded-xl overflow-hidden"
          style={{ background: '#fff', boxShadow: '0 28px 50px -30px rgba(15,35,64,.65), 0 2px 6px rgba(15,35,64,.08), 0 0 0 1px rgba(15,35,64,.1)' }}>
          <MarcoHtml plan={plan} />
        </div>
        <p className="mt-2.5 px-1 text-[11.5px] leading-snug" style={{ color: COLOR.muted }}>
          Se muestra en un marco aislado: no puede leer tu sesión ni tus datos. ¿No se ve bien?{' '}
          <a href={planHtmlUrl(plan.id)} target="_blank" rel="noopener noreferrer" className={`font-semibold underline underline-offset-2 rounded ${FOCO}`} style={{ color: COLOR.goldDark }}>
            Ábrelo en una pestaña
          </a>.
        </p>
      </div>
    </Panel>
  )
}
