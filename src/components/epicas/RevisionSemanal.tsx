'use client'

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { EpicaFeature, EpicaMilestone, EpicaTask, Iniciativa } from '@/lib/supabase'
import type { CuandoPaso, FaltaPaso } from '@/lib/siguientePaso'
import SiguientePaso, { MarcaSinPaso, useRecienCreadas } from './SiguientePaso'
import { dayNum, fmtDue, prioStyle, weekdayAbbr, type Prio } from './core'

/* "Revisión semanal": stepper de 6 pasos que convierte el cierre de semana en arreglos de un
 * toque. No calcula ni escribe nada por su cuenta: la pantalla le pasa las listas ya armadas y
 * los callbacks (que escriben con Deshacer). Las listas son vivas: una fila desaparece en cuanto
 * su arreglo llega al estado. */

const NAVY = '#14233D'
const NAVY2 = '#16365F'
const GOLD = '#C2933A'
const GOLD_D = '#A87A2C'
const TEAL = '#2E6E6E'
const MAX_FILAS = 10

/** Tarea en una fila de la revisión, con su épica. `motivo` = por qué está estancada. */
export type RevTarea = { eId: string; eName: string; color: string; t: EpicaTask; motivo?: string }
/** Iniciativa abierta con el conteo de sus tareas (sin archivadas). */
export type RevIni = { eId: string; eName: string; fId: string; fName: string; ini: Iniciativa; total: number; hechas: number; enCurso: number }
export type RevSinPaso = FaltaPaso & { eName: string; fName: string }
export type RevFeature = { eId: string; eName: string; f: EpicaFeature; objetivos: number }
export type RevObjetivo = { eId: string; eName: string; fName?: string; k: EpicaMilestone; unidad: string }
/** Tarea abierta sin feature en una épica que sí tiene; `sugerido` = id del feature cuyo nombre sale en el título ('' = ninguno). */
export type RevSinFeature = RevTarea & { features: { id: string; t: string }[]; sugerido: string }

type Props = {
  semanaLabel: string
  /** "Semana cerrada · 28 sep" si ya tiene registro. */
  cerradaLabel?: string
  hoy: string
  /** Lunes de la semana siguiente a la revisada (paso 2 y el Ajuste del paso 6). */
  proxLunes: string
  /** Lunes de la semana que sigue a hoy (pasos 3 y 4). Igual a proxLunes salvo el lunes. */
  lunesSiguiente: string
  /** Paso 1: el resumen de la semana (lo arma la pantalla). */
  resumen: ReactNode
  arrastre: RevTarea[]
  estancadas: RevTarea[]
  sinFecha: RevTarea[]
  inisEnCurso: RevIni[]
  inisCerrar: RevIni[]
  inisSinPaso: RevSinPaso[]
  featsVacios: RevFeature[]
  objsSinMeta: RevObjetivo[]
  sinFeature: RevSinFeature[]
  /** Tareas abiertas ya planeadas en la semana de proxLunes. */
  proxPlaneadas: number
  /** Hay otra capa abierta encima (vistazo/editor): su Escape no es de la revisión. */
  capaEncima?: boolean
  /** El toast de la pantalla (con su Deshacer), pintado en la hoja para no tapar filas. */
  aviso?: { msg: string; error?: boolean; action?: { label: string } } | null
  onAvisoAccion?: () => void
  /** Planea la tarea a `dia`; '' = la deja sin día. */
  onPlanear: (eId: string, tid: string, dia: string) => void
  onPasarTodas: () => void
  onArchivar: (eId: string, tid: string) => void
  onAbrir: (eId: string, tid: string) => void
  onIniEstado: (x: RevIni, estado: Iniciativa['estado']) => void
  onCrearPaso: (fp: FaltaPaso, titulo: string, cuando: CuandoPaso) => boolean
  onCerrarFeature: (x: RevFeature) => void
  onMeta: (x: RevObjetivo, meta: number) => void
  onAsignarFeature: (eId: string, tid: string, fId: string) => void
  onAjuste: () => void
  onTerminar: () => void
  onClose: () => void
}

const PASOS = ['La semana', 'Lo que se arrastra', 'Estancadas', 'Sin fecha', 'Estructura', 'Siguiente semana'] as const

// Lo que inline no puede: hover, foco, hoja a pantalla completa en celular. React 19 lo sube al <head>.
const RV_CSS = `
.rv-ov{position:fixed;inset:0;z-index:78;background:rgba(10,22,42,.5);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px}
.rv-sheet{width:100%;max-width:580px;max-height:calc(100dvh - 80px);display:flex;flex-direction:column;background:#fff;border-radius:18px;box-shadow:0 40px 80px -30px rgba(8,18,36,.7);overflow:hidden;font-family:var(--font-ui)}
.rv-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:2px 22px 18px}
.rv-body:focus{outline:none}
.rv-btn{transition:background .15s,border-color .15s}
.rv-seg{min-height:26px}
.rv-only-sm{display:none}
@media (hover:hover){
  .rv-btn--sec:hover,.rv-btn--quiet:hover{border-color:rgba(194,147,58,.6)!important;background:#FFFDF8!important}
  .rv-btn--pri:hover{background:#16365F!important}
  .rv-btn--gold:hover{background:rgba(194,147,58,.18)!important}
  .rv-tit:hover .rv-tit-t{text-decoration:underline}
}
.rv-btn:focus-visible,.rv-seg:focus-visible,.rv-tit:focus-visible{outline:2px solid #C2933A;outline-offset:2px}
.rv-input:focus,.rv-select:focus{border-color:rgba(194,147,58,.7)!important;box-shadow:0 0 0 3px rgba(194,147,58,.14);outline:none}
@media (max-width:640px){
  .rv-ov{padding:0;align-items:stretch}
  .rv-sheet{max-width:none;max-height:none;height:100dvh;border-radius:0;box-shadow:none}
  .rv-head{padding:calc(14px + env(safe-area-inset-top)) 16px 8px!important}
  .rv-body{padding:2px 16px 16px}
  .rv-foot{padding:10px 16px calc(10px + env(safe-area-inset-bottom))!important}
  .rv-seg,.rv-chip{min-height:34px!important}
  .rv-acts{width:100%}
  .rv-acts>.rv-btn{flex:1 1 0;padding:0 8px!important}
  .rv-acts>.rv-select{flex:2 1 0;min-width:0;max-width:none!important}
  .rv-input,.rv-select{font-size:16px!important}
  .rv-hide-sm{display:none}
  .rv-only-sm{display:inline}
}
@media (max-width:700px){body:has(.rv-sheet) .section-nav{display:none!important}}
/* La tarjeta de foco (fija abajo a la derecha, z 80) tapa el pie de la hoja; desde 1300px ya no se enciman. */
@media (max-width:1300px){body:has(.rv-sheet) .ep-focus-card>:not([role=status]){display:none!important}}
`

type Kind = 'pri' | 'sec' | 'gold' | 'quiet' | 'ok'
const btn = (kind: Kind, disabled?: boolean): CSSProperties => ({
  cursor: disabled ? 'default' : 'pointer', minHeight: 34, boxSizing: 'border-box', borderRadius: 9, padding: '0 12px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, whiteSpace: 'nowrap',
  font: '700 12px var(--font-ui)', opacity: disabled ? 0.5 : 1,
  ...(kind === 'pri' ? { border: `1px solid ${NAVY}`, background: NAVY, color: '#fff' }
    : kind === 'ok' ? { border: 'none', background: 'linear-gradient(135deg,#3E8E8E,#2E6E6E)', color: '#fff', boxShadow: '0 8px 20px -8px rgba(46,110,110,.6)' }
    : kind === 'gold' ? { border: '1px solid rgba(194,147,58,0.45)', background: 'rgba(194,147,58,0.10)', color: GOLD_D }
    : kind === 'quiet' ? { border: '1px solid rgba(15,35,64,0.10)', background: 'transparent', color: 'rgba(20,35,61,0.55)' }
    : { border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: NAVY2 }),
})
function Btn({ kind = 'sec', disabled, onClick, title, style, children }: { kind?: Kind; disabled?: boolean; onClick: () => void; title?: string; style?: CSSProperties; children: ReactNode }) {
  return <button type="button" className={`rv-btn rv-btn--${kind}`} disabled={disabled} onClick={onClick} title={title} style={{ ...btn(kind, disabled), ...style }}>{children}</button>
}
/** "Próxima semana" cabe completo en escritorio; en celular se abrevia para que la fila no se parta. */
const ProxSemana = ({ larga = 'Próxima semana', corta = 'Próx. semana' }: { larga?: string; corta?: string }) => (
  <><span className="rv-hide-sm">{larga}</span><span className="rv-only-sm">{corta}</span></>
)

/** Días de `a` a `b` ('YYYY-MM-DD') por componentes, sin zona horaria de por medio. */
const diasEntre = (a: string, b: string) => {
  const f = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((f(b) - f(a)) / 86400000)
}
const diaCorto = (iso: string) => `${weekdayAbbr(iso)} ${dayNum(iso)}`
/** Meta tecleada → número > 0. Acepta "1,500", "1.5", "2,5", "$3 000". */
const parseMeta = (s: string): number | null => {
  let v = s.replace(/[\s$%]/g, '')
  v = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v) ? v.replace(/,/g, '') : v.replace(',', '.')
  const n = Number(v)
  return v !== '' && Number.isFinite(n) && n > 0 ? n : null
}

const ellipsis: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const pill: CSSProperties = { font: '800 10.5px/1 var(--font-ui)', padding: '3px 8px', borderRadius: 99, background: 'rgba(194,147,58,0.14)', color: GOLD_D }

function Nada() {
  return <div style={{ padding: '16px 2px', font: '700 13px var(--font-ui)', color: TEAL }}>✓ Nada pendiente</div>
}
function Intro({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(20,35,61,0.6)', margin: '4px 0 8px' }}>{children}</div>
}
function Mas({ n }: { n: number }) {
  if (n <= 0) return null
  return <div style={{ padding: '10px 2px 0', fontSize: 11.5, fontWeight: 600, color: 'rgba(20,35,61,0.45)' }}>y {n} más · aparecen al resolver éstas</div>
}

/** Fila de tarea: título (abre el vistazo), épica + meta y las acciones a la derecha (abajo en celular). */
function FilaTarea({ x, meta, onAbrir, children }: { x: RevTarea; meta?: string; onAbrir: () => void; children: ReactNode }) {
  const ps = prioStyle(x.t.priority as Prio | undefined)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px 10px', flexWrap: 'wrap', padding: '10px 2px', borderTop: '1px solid rgba(15,35,64,0.06)' }}>
      <button type="button" className="rv-tit" onClick={onAbrir} title="Ver la tarea"
        style={{ flex: '1 1 210px', minWidth: 0, display: 'flex', gap: 9, alignItems: 'stretch', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
        <span aria-hidden style={{ flexShrink: 0, width: 3, borderRadius: 99, background: ps.accent === 'transparent' ? 'rgba(15,35,64,0.10)' : ps.accent }} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="rv-tit-t" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: NAVY2, ...ellipsis }}>{x.t.t}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 10.5, color: 'rgba(20,35,61,0.5)', minWidth: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: x.color, flexShrink: 0 }} />
            <span style={ellipsis}>{x.eName}{meta ? ` · ${meta}` : ''}</span>
          </span>
        </span>
      </button>
      <div className="rv-acts" style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

/** Fila de estructura (iniciativa, feature, objetivo): nombre, ruta y su arreglo. */
function FilaSimple({ marca, titulo, ruta, detalle, children }: { marca?: ReactNode; titulo: string; ruta: string; detalle?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px 10px', flexWrap: 'wrap', padding: '9px 2px', borderTop: '1px solid rgba(15,35,64,0.06)' }}>
      <div style={{ flex: '1 1 210px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: NAVY2, minWidth: 0 }}>{marca}<span style={ellipsis}>{titulo}</span></div>
        <div style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)', marginTop: 3, ...ellipsis }}>{ruta}{detalle ? ` · ${detalle}` : ''}</div>
      </div>
      <div className="rv-acts" style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function Seccion({ titulo, n, nota, children }: { titulo: string; n: number; nota?: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: nota ? 3 : 4 }}>
        <span style={{ font: '800 10px/1.2 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>{titulo}</span>
        <span style={pill}>{n}</span>
      </div>
      {nota && <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.5)', marginBottom: 4 }}>{nota}</div>}
      {children}
    </section>
  )
}

/** Escape dentro de un campo: suelta el campo sin cerrar la revisión (preventDefault lo marca como atendido para el Escape global). */
const escSuelta = (ev: KeyboardEvent<HTMLElement>) => {
  if (ev.key !== 'Escape') return
  ev.preventDefault(); ev.stopPropagation(); (ev.target as HTMLElement).blur?.()
}

function FilaMeta({ x, onGuardar }: { x: RevObjetivo; onGuardar: (n: number) => void }) {
  const [v, setV] = useState('')
  const n = parseMeta(v)
  const guardar = () => { if (n != null) onGuardar(n) }
  return (
    <FilaSimple titulo={x.k.t} ruta={x.fName ? `${x.eName} › ${x.fName}` : x.eName} detalle={x.k.current != null ? `hoy: ${x.k.current}${x.unidad ? ' ' + x.unidad : ''}` : undefined}>
      <input className="rv-input" type="text" inputMode="decimal" enterKeyHint="done" value={v} placeholder="Meta" aria-label={`Meta de ${x.k.t}`}
        onChange={ev => setV(ev.target.value)}
        onKeyDown={ev => { escSuelta(ev); if (ev.key === 'Enter' && !ev.nativeEvent.isComposing) { ev.preventDefault(); guardar() } }}
        style={{ width: 96, minHeight: 34, boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.16)', borderRadius: 9, padding: '0 10px', fontSize: 13, fontWeight: 600, color: NAVY2, background: '#fff' }} />
      {x.unidad && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>{x.unidad}</span>}
      <Btn kind="pri" disabled={n == null} onClick={guardar}>Guardar</Btn>
    </FilaSimple>
  )
}

function FilaAsignar({ x, onAbrir, onAsignar }: { x: RevSinFeature; onAbrir: () => void; onAsignar: (fId: string) => void }) {
  const [elegido, setElegido] = useState(x.sugerido)
  // Si el feature elegido se cerró mientras tanto, ya no es opción: no se asigna a ciegas.
  const fId = x.features.some(f => f.id === elegido) ? elegido : ''
  return (
    <FilaTarea x={x} onAbrir={onAbrir} meta={x.sugerido ? 'sugerido por el título' : undefined}>
      <select className="rv-select" value={fId} onChange={ev => setElegido(ev.target.value)} onKeyDown={escSuelta} aria-label={`Feature para ${x.t.t}`}
        style={{ minHeight: 34, maxWidth: 190, boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.16)', borderRadius: 9, padding: '0 8px', font: '600 12px var(--font-ui)', color: NAVY2, background: '#fff', cursor: 'pointer' }}>
        <option value="">Feature…</option>
        {x.features.map(f => <option key={f.id} value={f.id}>{f.t}</option>)}
      </select>
      <Btn kind="pri" disabled={!fId} onClick={() => { if (fId) onAsignar(fId) }}>Asignar</Btn>
    </FilaTarea>
  )
}

export default function RevisionSemanal(p: Props) {
  const [paso, setPaso] = useState(0)
  // Tareas ya decididas en esta revisión (id → plan que les quedó): no se vuelven a ofrecer en otro
  // paso mientras sigan así. Un Deshacer les cambia el plan y reaparecen solas.
  const [hechas, setHechas] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [pasoAbierto, setPasoAbierto] = useState<string | null>(null)
  const recien = useRecienCreadas()
  const vistos = useRef(new Map<string, RevSinPaso>())
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }) }, [paso])
  // Si el botón con foco se desmonta (fila resuelta), el foco cae en <body> y Tab se sale de la hoja.
  useEffect(() => {
    if (p.capaEncima) return
    const a = document.activeElement
    if (!a || a === document.body) bodyRef.current?.focus({ preventScroll: true })
  })
  // "Ya arrancaron" se congela al entrar al paso: un primer paso "Hoy" la metería ARRIBA de donde se trabaja.
  const arrancaron = useRef<Set<string> | null>(null)
  if (paso !== 4) arrancaron.current = null
  else if (!arrancaron.current) arrancaron.current = new Set(p.inisEnCurso.map(x => x.ini.id))
  const inisEnCurso = arrancaron.current ? p.inisEnCurso.filter(x => arrancaron.current!.has(x.ini.id)) : p.inisEnCurso

  const decidida = (t: EpicaTask) => !!t.id && hechas.has(t.id) && hechas.get(t.id) === (t.plan || '')
  const marcar = (ids: string[], plan: string) => setHechas(m => { const n = new Map(m); ids.forEach(id => n.set(id, plan)); return n })
  const planear = (x: RevTarea, dia: string) => { if (!x.t.id) return; p.onPlanear(x.eId, x.t.id, dia); marcar([x.t.id], dia) }
  const archivar = (x: RevTarea) => { if (x.t.id) p.onArchivar(x.eId, x.t.id) }
  const abrir = (x: RevTarea) => { if (x.t.id) p.onAbrir(x.eId, x.t.id) }

  const estancadas = p.estancadas.filter(x => !decidida(x.t))
  const sinFecha = p.sinFecha.filter(x => !decidida(x.t))
  // Sin siguiente paso: orden estable; la recién resuelta se queda un momento para su "✓ Creada".
  for (const x of p.inisSinPaso) vistos.current.set(x.ini.id, x)
  const vivas = new Set(p.inisSinPaso.map(x => x.ini.id))
  const sinPaso = [...vistos.current.values()].filter(x => vivas.has(x.ini.id) || recien.tiene(x.ini.id))
  const nEstructura = inisEnCurso.length + p.inisCerrar.length + sinPaso.length + p.featsVacios.length + p.objsSinMeta.length + p.sinFeature.length
  const conteo: (number | null)[] = [null, p.arrastre.length, estancadas.length, sinFecha.length, nEstructura, null]
  const proxEsEsta = p.proxLunes <= p.hoy
  const lblProx = proxEsEsta ? 'esta semana' : 'la próxima semana'

  const abrirPaso = (id: string) => {
    if (pasoAbierto === id) { setPasoAbierto(null); return }
    // flushSync: el input existe dentro del mismo toque; sólo así iOS abre el teclado.
    flushSync(() => setPasoAbierto(id))
    document.getElementById(`rv-paso-${id}`)?.focus()
  }
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || p.capaEncima) return
    ev.preventDefault(); ev.stopPropagation(); p.onClose()
  }

  let cuerpo: ReactNode
  if (paso === 0) cuerpo = p.resumen
  else if (paso === 1) {
    // En bloque sólo lo atrasado: lo de hoy en adelante aún tiene su día y se decide una por una.
    const atrasadas = p.arrastre.filter(x => (x.t.plan || '') < p.hoy)
    const porVenir = p.arrastre.filter(x => (x.t.plan || '') >= p.hoy)
    const filaArrastre = (x: RevTarea) => {
      const pl = x.t.plan || ''
      const meta = [!pl ? '' : pl < p.hoy ? `era para ${diaCorto(pl)}` : pl === p.hoy ? 'planeada hoy' : `planeada ${diaCorto(pl)}`, x.t.status === 'Esperando' ? 'en espera' : '', x.t.due ? `vence ${fmtDue(x.t.due)}` : ''].filter(Boolean).join(' · ')
      return (
        <FilaTarea key={x.t.id} x={x} meta={meta} onAbrir={() => abrir(x)}>
          <Btn kind="gold" onClick={() => planear(x, p.proxLunes)} title={proxEsEsta ? 'Planearla para hoy' : `Al lunes ${fmtDue(p.proxLunes)}`}>
            {proxEsEsta ? 'Hoy' : <ProxSemana />}
          </Btn>
          <Btn onClick={() => planear(x, '')} title="Quitarle el día: vuelve al backlog">Sin fecha</Btn>
          <Btn kind="quiet" onClick={() => archivar(x)}>Archivar</Btn>
        </FilaTarea>
      )
    }
    const bloque = atrasadas.length > 0 && (
      <>
        <button type="button" className="rv-btn rv-btn--gold" onClick={() => { p.onPasarTodas(); marcar(atrasadas.flatMap(x => (x.t.id ? [x.t.id] : [])), p.proxLunes) }}
          style={{ ...btn('gold'), width: '100%', minHeight: 40, margin: '2px 0 8px', font: '800 12.5px var(--font-ui)' }}>
          {atrasadas.length === 1 ? `Pasarla a ${lblProx}` : `Pasar ${porVenir.length ? 'las atrasadas' : 'todas'} (${atrasadas.length}) a ${lblProx}`} →
        </button>
        {proxEsEsta && <div style={{ margin: '-2px 0 8px', fontSize: 11.5, color: 'rgba(20,35,61,0.5)' }}>Quedan en hoy sin cambiarles el estado: repártelas en el Ajuste del paso 6.</div>}
        {atrasadas.map(filaArrastre)}
      </>
    )
    cuerpo = !p.arrastre.length ? <Nada /> : (
      <>
        <Intro>Planeadas para la semana y sin terminar. Decide a dónde va cada una.</Intro>
        {atrasadas.length > 0 && porVenir.length > 0 ? <Seccion titulo="Atrasadas" n={atrasadas.length}>{bloque}</Seccion> : bloque}
        {porVenir.length > 0 && (
          <Seccion titulo="Hoy y lo que queda de la semana" n={porVenir.length} nota="Aún tienen su día: muévelas sólo si ya no van.">
            {porVenir.map(filaArrastre)}
          </Seccion>
        )}
      </>
    )
  } else if (paso === 2) {
    cuerpo = !estancadas.length ? <Nada /> : (
      <>
        <Intro>No se mueven: reprogramadas muchas veces o días sin avance. Dales un día, ábrelas para partirlas o suéltalas.</Intro>
        {estancadas.slice(0, MAX_FILAS).map(x => (
          <div key={x.t.id} style={{ border: '1px solid rgba(15,35,64,0.10)', borderRadius: 12, padding: '10px 12px', marginTop: 8, background: '#fff' }}>
            <button type="button" className="rv-tit" onClick={() => abrir(x)} title="Ver la tarea"
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
              <span className="rv-tit-t" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: NAVY2, ...ellipsis }}>{x.t.t}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 10.5, color: 'rgba(20,35,61,0.5)', minWidth: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: x.color, flexShrink: 0 }} />
                <span style={ellipsis}>{x.eName}{x.t.plan ? ` · planeada ${x.t.plan === p.hoy ? 'hoy' : diaCorto(x.t.plan)}` : ''}</span>
              </span>
            </button>
            {x.motivo && <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.4, fontWeight: 600, color: '#A15B2E' }}>🐌 {x.motivo}</div>}
            <div className="rv-acts" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
              <Btn kind="gold" onClick={() => planear(x, p.hoy)}>Hoy</Btn>
              <Btn onClick={() => planear(x, p.lunesSiguiente)} title={`Al lunes ${fmtDue(p.lunesSiguiente)}`}><ProxSemana /></Btn>
              <Btn onClick={() => abrir(x)}>Abrir</Btn>
              <Btn kind="quiet" onClick={() => archivar(x)}>Archivar</Btn>
            </div>
          </div>
        ))}
        <Mas n={estancadas.length - MAX_FILAS} />
      </>
    )
  } else if (paso === 3) {
    cuerpo = !sinFecha.length ? <Nada /> : (
      <>
        <Intro>Abiertas sin día ni fecha de entrega: primero las de más prioridad y las más viejas.</Intro>
        {sinFecha.slice(0, MAX_FILAS).map(x => {
          const d = x.t.createdAt ? diasEntre(x.t.createdAt, p.hoy) : null
          const meta = [x.t.priority === 'alta' ? 'prioridad alta' : '', d != null && d >= 1 ? `creada hace ${d}d` : ''].filter(Boolean).join(' · ')
          return (
            <FilaTarea key={x.t.id} x={x} meta={meta} onAbrir={() => abrir(x)}>
              <Btn kind="gold" onClick={() => planear(x, p.hoy)}>Hoy</Btn>
              <Btn onClick={() => planear(x, p.lunesSiguiente)} title={`Al lunes ${fmtDue(p.lunesSiguiente)}`}><ProxSemana /></Btn>
              <Btn kind="quiet" onClick={() => archivar(x)}>Archivar</Btn>
            </FilaTarea>
          )
        })}
        <Mas n={sinFecha.length - MAX_FILAS} />
      </>
    )
  } else if (paso === 4) {
    cuerpo = !nEstructura ? <Nada /> : (
      <>
        <Intro>Que el mapa diga la verdad: estados de iniciativas, features vacíos, metas y tareas sueltas.</Intro>
        {inisEnCurso.length > 0 && (
          <Seccion titulo="Iniciativas que ya arrancaron" n={inisEnCurso.length} nota="Siguen en «pendiente» pero ya tienen tareas en curso o terminadas.">
            {inisEnCurso.map(x => (
              <FilaSimple key={x.ini.id} titulo={x.ini.nombre} ruta={`${x.eName} › ${x.fName}`} detalle={[x.enCurso ? `${x.enCurso} en curso` : '', x.hechas ? `${x.hechas} ${x.hechas === 1 ? 'hecha' : 'hechas'}` : ''].filter(Boolean).join(' · ')}>
                <Btn kind="pri" onClick={() => p.onIniEstado(x, 'en_curso')}>Pasar a en curso</Btn>
              </FilaSimple>
            ))}
          </Seccion>
        )}
        {p.inisCerrar.length > 0 && (
          <Seccion titulo="Iniciativas terminadas" n={p.inisCerrar.length} nota="Todas sus tareas están terminadas.">
            {p.inisCerrar.map(x => (
              <FilaSimple key={x.ini.id} titulo={x.ini.nombre} ruta={`${x.eName} › ${x.fName}`} detalle={`${x.hechas}/${x.total} ${x.total === 1 ? 'tarea' : 'tareas'}`}>
                <Btn kind="pri" onClick={() => p.onIniEstado(x, 'cerrada')}>Cerrar iniciativa</Btn>
              </FilaSimple>
            ))}
          </Seccion>
        )}
        {sinPaso.length > 0 && (
          <Seccion titulo="Sin siguiente paso" n={p.inisSinPaso.length || sinPaso.length} nota="Abiertas y sin ninguna tarea abierta: el plan no tiene acción.">
            {sinPaso.map(x => {
              const abierto = pasoAbierto === x.ini.id
              return (
                <div key={x.ini.id}>
                  <FilaSimple marca={<MarcaSinPaso />} titulo={x.ini.nombre} ruta={`${x.eName} › ${x.fName}`}>
                    <Btn kind={abierto ? 'quiet' : 'gold'} onClick={() => abrirPaso(x.ini.id)}>{abierto ? 'Ocultar' : 'Primer paso'}</Btn>
                  </FilaSimple>
                  {(abierto || recien.tiene(x.ini.id)) && (
                    // preventDefault en captura: el Escape del campo (que lo suelta) no cierra la revisión.
                    <div onKeyDownCapture={ev => { if (ev.key === 'Escape' && (ev.target as HTMLElement).tagName === 'INPUT') ev.preventDefault() }} style={{ padding: '0 0 10px' }}>
                      <SiguientePaso nombre={x.ini.nombre} hoy={p.hoy} inputId={`rv-paso-${x.ini.id}`}
                        onCrear={(titulo, cuando) => { const ok = p.onCrearPaso(x, titulo, cuando); if (ok) recien.marcar(x.ini.id); return ok }} />
                    </div>
                  )}
                </div>
              )
            })}
          </Seccion>
        )}
        {p.featsVacios.length > 0 && (
          <Seccion titulo="Features vacíos" n={p.featsVacios.length} nota="Sin tareas ni iniciativas. Cerrarlo no borra nada y se puede deshacer.">
            {p.featsVacios.map(x => (
              <FilaSimple key={x.f.id} titulo={x.f.t} ruta={x.eName} detalle={x.objetivos ? `${x.objetivos} ${x.objetivos === 1 ? 'objetivo' : 'objetivos'}` : undefined}>
                <Btn onClick={() => p.onCerrarFeature(x)}>Cerrar feature</Btn>
              </FilaSimple>
            ))}
          </Seccion>
        )}
        {p.objsSinMeta.length > 0 && (
          <Seccion titulo="Objetivos sin meta" n={p.objsSinMeta.length} nota="Sin meta no hay avance que medir: captúrala aquí.">
            {p.objsSinMeta.map(x => <FilaMeta key={x.k.id} x={x} onGuardar={n => p.onMeta(x, n)} />)}
          </Seccion>
        )}
        {p.sinFeature.length > 0 && (
          <Seccion titulo="Tareas sin feature" n={p.sinFeature.length} nota="En épicas que sí tienen features.">
            {p.sinFeature.slice(0, MAX_FILAS).map(x => (
              <FilaAsignar key={x.t.id} x={x} onAbrir={() => abrir(x)} onAsignar={fId => { if (x.t.id) p.onAsignarFeature(x.eId, x.t.id, fId) }} />
            ))}
            <Mas n={p.sinFeature.length - MAX_FILAS} />
          </Seccion>
        )}
      </>
    )
  } else {
    cuerpo = (
      <>
        <Intro>{proxEsEsta ? 'Con la semana acomodada, revisa la carga de esta semana y repártela entre los días.' : 'Con la semana acomodada, revisa la carga de la próxima semana antes de que empiece.'}</Intro>
        <div style={{ borderRadius: 13, border: '1px solid rgba(15,35,64,0.09)', background: '#FBFAF6', padding: '12px 14px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="serif" style={{ fontSize: 26, lineHeight: 1, color: NAVY }}>{p.proxPlaneadas}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>{p.proxPlaneadas === 1 ? 'tarea planeada' : 'tareas planeadas'} para {lblProx}</span>
        </div>
        <button type="button" className="rv-btn rv-btn--gold" onClick={p.onAjuste}
          style={{ ...btn('gold'), width: '100%', minHeight: 44, marginTop: 12, font: '800 13px var(--font-ui)' }}>
          Abrir Ajuste de {lblProx} →
        </button>
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'rgba(20,35,61,0.45)', textAlign: 'center' }}>Abrir el Ajuste también da la revisión por terminada.</div>
      </>
    )
  }

  return (
    // Sin cerrar con clic en el fondo: un clic suelto perdería el paso y lo ya decidido (quedan ✕ y Escape).
    <div className="rv-ov">
      <style href="advl-revision-semanal" precedence="default">{RV_CSS}</style>
      <div role="dialog" aria-modal="true" aria-labelledby="rv-titulo" className="ep-modal rv-sheet" onClick={ev => ev.stopPropagation()} onKeyDown={onKey}>
        <div style={{ height: 4, flexShrink: 0, background: 'linear-gradient(90deg,#3E8E8E,#C2933A)' }} />
        <div className="rv-head" style={{ padding: '16px 22px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>📋 Revisión semanal</div>
              <div id="rv-titulo" className="serif" style={{ fontWeight: 600, fontSize: 22, lineHeight: 1, color: '#10233F' }}>{p.semanaLabel}</div>
              {p.cerradaLabel && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, borderRadius: 99, padding: '3px 11px', background: 'rgba(46,110,110,0.12)', border: '1px solid rgba(46,110,110,0.35)', font: '800 11.5px var(--font-ui)', color: TEAL }}>✓ {p.cerradaLabel}</div>
              )}
            </div>
            <button type="button" aria-label="Cerrar" onClick={p.onClose} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 34, width: 34, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, minWidth: 0 }}>
            <span style={{ flexShrink: 0, font: '800 11px var(--font-ui)', color: GOLD_D }}>Paso {paso + 1} de {PASOS.length}</span>
            <span style={{ font: '700 13px var(--font-ui)', color: NAVY, ...ellipsis }}>{PASOS[paso]}</span>
            {conteo[paso] ? <span style={pill}>{conteo[paso]}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {PASOS.map((nom, k) => (
              <button key={nom} type="button" className="rv-seg" onClick={() => setPaso(k)} aria-current={k === paso ? 'step' : undefined}
                aria-label={`Paso ${k + 1}: ${nom}${conteo[k] ? ` (${conteo[k]})` : ''}`} title={nom}
                style={{ flex: 1, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <span style={{ display: 'block', width: '100%', height: 5, borderRadius: 99, background: k === paso ? NAVY : k < paso ? GOLD : 'rgba(15,35,64,0.12)' }} />
              </button>
            ))}
          </div>
        </div>
        <div ref={bodyRef} tabIndex={-1} className="rv-body">{cuerpo}</div>
        {p.aviso && (
          <div role="status" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, boxSizing: 'border-box', padding: '5px 10px 5px 18px', background: p.aviso.error ? '#B0522E' : NAVY2, color: '#fff', font: '600 13px/1.35 var(--font-ui)' }}>
            <span style={{ flex: 1, minWidth: 0 }}>{p.aviso.msg}</span>
            {p.aviso.action && (
              <button type="button" className="rv-btn" onClick={p.onAvisoAccion}
                style={{ flexShrink: 0, minHeight: 34, padding: '0 10px', border: 'none', borderRadius: 9, background: 'transparent', color: '#E7C56B', font: '800 13px var(--font-ui)', cursor: 'pointer' }}>{p.aviso.action.label}</button>
            )}
          </div>
        )}
        <div className="rv-foot" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 22px', borderTop: '1px solid rgba(15,35,64,0.08)', background: '#FBFAF6', flexShrink: 0 }}>
          {paso > 0 && <Btn onClick={() => setPaso(paso - 1)}>‹ Atrás</Btn>}
          <span style={{ flex: 1 }} />
          {/* El mismo Btn en ambos casos: si cambia de componente se remonta y el foco se pierde. */}
          {paso < PASOS.length - 1
            ? <Btn kind="pri" onClick={() => setPaso(paso + 1)}>Siguiente ›</Btn>
            : <Btn kind="ok" onClick={p.onTerminar} style={{ font: '800 13px var(--font-ui)', minHeight: 40, padding: '0 18px' }}>✓ Terminar revisión</Btn>}
        </div>
      </div>
    </div>
  )
}
