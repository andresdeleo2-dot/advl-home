'use client'

// El DÍA, comida por comida: cada comida de tu dieta es una tarjeta donde agregas lo que comiste (lo del plan con un toque,
// un alimento, un antojo, un trago…); abajo dices si hiciste ejercicio, y las gráficas muestran cuánto movió cada cosa tu
// balance y cómo se va acumulando. NO hay botón de guardar: todo se guarda solo (con una pausa de menos de un segundo) y
// la barra de abajo dice si ya quedó guardado. Lo que no alcanzó a guardarse (sin red, por ejemplo) se conserva mientras
// la página siga abierta y se reintenta.

import { useEffect, useMemo, useRef, useState } from 'react'
import { diaDeFecha, fmtNum, type Comida, type DocDieta, type DocRutina } from '@/lib/peso-contenido'
import {
  CATALOGO, EJERCICIOS_CATALOGO, GRUPOS_ITEM, ID_OTROS, MAX_NOTA, acumuladoDelRango, agregarItem, buscarCatalogo, comidaPendiente, conSigno, diaNuevo, diaVacio,
  ejercicioDeRutina, frecuentes, grupoDe, itemDelPlan, kcalEjercicio, pesoEn, resumenPeriodo, sumaDias, totalesDia,
  type ComidaDia, type Contexto, type DiaDiario, type EjercicioDia, type GrupoItem, type ItemCatalogo, type ItemDia,
} from '@/lib/peso-diario'
import { BTN, COLOR, INPUT, Panel, Pill, Segmented } from '../ui'
import { borrarDiaApi, guardarDiaApi } from './api'
import { AcumuladoGrafica, Cascada, Cifras, grasaConSigno } from './Bloques'
import Num from './Num'

// ── Lo que está sin guardar vive aquí (fuera de React) para que cambiar de día o de pestaña no lo pierda ───────────────
const pendientes = new Map<string, DiaDiario>()
/** ¿Quedó algo sin guardar? Así «Rutinas y dietas» vuelve a abrir el diario al regresar a la pestaña. */
export const hayBorradorDiario = () => pendientes.size > 0
/** El día que quedó sin guardar más reciente, si lo hay. */
export const fechaPendienteDiario = (): string | null => [...pendientes.keys()].sort().pop() ?? null

type Estado = 'nuevo' | 'ok' | 'pendiente' | 'guardando' | 'error'
const ESPERA_MS = 700

const CHIP = 'inline-flex items-center gap-1.5 rounded-full border px-3 min-h-10 text-[13px] font-semibold transition-colors hover:border-[#C2933A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8A6420]'
const ETQ = { font: '800 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: COLOR.goldText } as const
const cant = (n: number) => fmtNum(n, n % 1 ? 2 : 0)
const sumaComida = (c: ComidaDia) => c.items.reduce((a, x) => a + x.n * x.kcal, 0)
let contadorIds = 0
const idNuevo = () => `libre-${Date.now().toString(36)}-${(contadorIds++).toString(36)}`

// ── Agregar algo a una comida ───────────────────────────────────────────────

type Nuevo = { id: string; nombre: string; grupo: GrupoItem; kcal: number; prot: number }
const FILTROS: { v: 'todo' | GrupoItem; label: string }[] = [
  { v: 'todo', label: 'Todo' }, { v: 'comida', label: '🥗 Comida' }, { v: 'antojo', label: '🍕 Antojos' },
  { v: 'alcohol', label: '🍺 Alcohol' }, { v: 'dulce', label: '🍫 Dulces' }, { v: 'bebida', label: '🥤 Bebidas' },
]

function FilaCatalogo({ x, etiqueta, n, onAgregar }: { x: ItemCatalogo; etiqueta?: string; n: number; onAgregar: (x: Nuevo) => void }) {
  const g = grupoDe(x.grupo)
  return (
    <li>
      <button type="button" onClick={() => onAgregar({ id: x.id, nombre: x.nombre, grupo: x.grupo, kcal: x.kcal, prot: x.prot })}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-[#FFF8E6] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8A6420]">
        <span className="min-w-0">
          <span className="block font-semibold" style={{ fontSize: 14, color: COLOR.navy }}><span aria-hidden>{g.icono}</span> {x.nombre}{n > 0 && <span className="ml-1.5 tabular-nums rounded-full px-1.5" style={{ background: COLOR.gold, color: '#fff', fontSize: 11 }}>×{cant(n)}</span>}</span>
          <span className="block" style={{ fontSize: 12, color: COLOR.muted }}>{etiqueta ?? x.unidad}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 tabular-nums" style={{ fontSize: 13, color: COLOR.ink }}>{fmtNum(x.kcal)} kcal <span aria-hidden className="grid place-items-center rounded-full" style={{ width: 26, height: 26, background: '#FFF8E6', color: COLOR.goldText, fontSize: 16, fontWeight: 700 }}>＋</span></span>
      </button>
    </li>
  )
}

function PanelAgregar({ comida, frec, onAgregar, onCerrar }: { comida: ComidaDia; frec: ItemCatalogo[]; onAgregar: (x: Nuevo) => void; onCerrar: () => void }) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<'todo' | GrupoItem>('todo')
  const [libre, setLibre] = useState(false)
  const [nombre, setNombre] = useState('')
  const [kcal, setKcal] = useState(200)
  const [prot, setProt] = useState(0)
  const [grupo, setGrupo] = useState<GrupoItem>('comida')
  const entrada = useRef<HTMLInputElement>(null)
  useEffect(() => { entrada.current?.focus({ preventScroll: true }) }, [])

  const lista = useMemo(() => {
    const porGrupo = (x: ItemCatalogo) => filtro === 'todo' || x.grupo === filtro
    const f = buscarCatalogo(q, frec).filter(porGrupo)
    const c = buscarCatalogo(q, CATALOGO).filter(porGrupo)
    return { frec: f, cat: c }
  }, [q, filtro, frec])
  const ya = (x: ItemCatalogo) => comida.items.find(y => y.nombre === x.nombre && y.kcal === x.kcal && y.grupo === x.grupo)?.n ?? 0

  const agregarLibre = () => {
    const n = nombre.trim()
    if (!n) return
    onAgregar({ id: idNuevo(), nombre: n, grupo, kcal: Math.round(kcal), prot })
    setNombre(''); setQ('')
  }
  const sinNada = lista.frec.length === 0 && lista.cat.length === 0

  return (
    <div className="mt-3 rounded-xl p-3" style={{ background: COLOR.card2, border: `1px solid ${COLOR.lineStrong}` }}>
      <div className="flex items-center gap-2">
        <input ref={entrada} value={q} onChange={e => setQ(e.target.value)} maxLength={60} placeholder="Busca: huevo, cerveza, pastel…" aria-label={`Buscar para agregar a ${comida.nombre}`} className={`${INPUT} min-h-11 min-w-0 flex-1`}
          onKeyDown={e => { if (e.key === 'Escape') onCerrar() }} />
        <button type="button" onClick={onCerrar} className={`${BTN.base} ${BTN.ghost} min-h-11`}>Listo</button>
      </div>
      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Tipo de alimento">
        {FILTROS.map(f => (
          <button key={f.v} type="button" aria-pressed={filtro === f.v} onClick={() => setFiltro(f.v)} className={`${CHIP} shrink-0`}
            style={filtro === f.v ? { background: COLOR.navy, borderColor: COLOR.navy, color: '#fff' } : { background: '#fff', borderColor: COLOR.lineStrong, color: COLOR.ink }}>{f.label}</button>
        ))}
      </div>

      <div className="mt-2 overflow-y-auto rounded-lg bg-white p-1" style={{ maxHeight: 300, border: `1px solid ${COLOR.line}` }}>
        {lista.frec.length > 0 && (
          <>
            <p className="px-2.5 pt-1.5" style={ETQ}>Lo que más anotas</p>
            <ul>{lista.frec.map(x => <FilaCatalogo key={`f-${x.id}-${x.nombre}`} x={x} n={ya(x)} onAgregar={onAgregar} etiqueta={`${x.unidad} · lo de siempre`} />)}</ul>
            <p className="px-2.5 pt-2" style={ETQ}>Todo</p>
          </>
        )}
        <ul>{lista.cat.map(x => <FilaCatalogo key={x.id} x={x} n={ya(x)} onAgregar={onAgregar} />)}</ul>
        {sinNada && (
          <p className="px-2.5 py-3" style={{ fontSize: 13, color: COLOR.muted }}>
            No hay nada que se llame así. Agrégalo tú abajo con «Algo que no está en la lista».
          </p>
        )}
      </div>

      <div className="mt-2.5">
        {!libre ? (
          <button type="button" onClick={() => { setLibre(true); setNombre(q.trim()) }} className={`${BTN.base} ${BTN.ghost} min-h-10`}>✏️ Algo que no está en la lista</button>
        ) : (
          <div className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-2.5" style={{ border: `1px dashed ${COLOR.lineStrong}` }}>
            <label className="block min-w-0 flex-1" style={{ flexBasis: 150 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.muted }}>¿Qué comiste?</span>
              <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} placeholder="Ej. Elote, cacahuates, paleta…" className={`${INPUT} mt-1 min-h-11`}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarLibre() } }} />
            </label>
            <label className="block">
              <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.muted }}>kcal</span>
              <Num valor={kcal} onValor={setKcal} max={5000} etiqueta="Calorías" className="mt-1 w-24" />
            </label>
            <label className="block">
              <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.muted }}>Proteína (g)</span>
              <Num valor={prot} onValor={setProt} max={500} etiqueta="Gramos de proteína" className="mt-1 w-24" />
            </label>
            <label className="block">
              <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.muted }}>Tipo</span>
              <select value={grupo} onChange={e => setGrupo(e.target.value as GrupoItem)} aria-label="Tipo" className={`${INPUT} mt-1 min-h-11`}>
                {GRUPOS_ITEM.filter(g => g.v !== 'plan').map(g => <option key={g.v} value={g.v}>{g.nombre}</option>)}
              </select>
            </label>
            <button type="button" onClick={agregarLibre} disabled={!nombre.trim()} className={`${BTN.base} ${BTN.gold} min-h-11`}>＋ Agregar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Una fila de lo que comiste ──────────────────────────────────────────────

function FilaItem({ x, onCambio, onQuitar }: { x: ItemDia; onCambio: (p: Partial<ItemDia>) => void; onQuitar: () => void }) {
  const g = grupoDe(x.grupo)
  const paso = x.grupo === 'plan' ? 0.5 : 1
  const min = x.grupo === 'plan' ? 0.5 : 1
  return (
    <li className="rounded-lg bg-white px-3 py-2.5" style={{ border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${g.color}` }}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold" style={{ fontSize: 14, lineHeight: 1.35, color: COLOR.navy }}><span aria-hidden>{g.icono}</span> {x.nombre}</span>
        <button type="button" aria-label={`Quitar ${x.nombre}`} onClick={onQuitar} className={`${BTN.base} ${BTN.danger} min-h-10 min-w-10 shrink-0 px-0 text-base`}>✕</button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1">
          <button type="button" aria-label={`Menos ${x.nombre}`} disabled={x.n <= min} onClick={() => onCambio({ n: Math.max(min, x.n - paso) })} className={`${BTN.base} ${BTN.ghost} min-h-11 min-w-11 px-0 text-base`}>−</button>
          <Num valor={x.n} onValor={n => onCambio({ n: Math.round(n * 4) / 4 })} min={0.25} max={50} paso={paso} etiqueta={`Porciones de ${x.nombre}`} className="w-16 text-center" />
          <button type="button" aria-label={`Más ${x.nombre}`} onClick={() => onCambio({ n: Math.min(50, x.n + paso) })} className={`${BTN.base} ${BTN.ghost} min-h-11 min-w-11 px-0 text-base`}>＋</button>
        </span>
        <span className="flex items-center gap-1.5">
          <Num valor={x.kcal} onValor={kcal => onCambio({ kcal: Math.round(kcal) })} max={5000} etiqueta={`Calorías de cada porción de ${x.nombre}`} className="w-20" />
          <span className="whitespace-nowrap" style={{ fontSize: 12, color: COLOR.muted }}>kcal c/u</span>
        </span>
        <span className="ml-auto tabular-nums font-semibold" style={{ fontSize: 13.5, color: COLOR.ink }}>{fmtNum(Math.round(x.n * x.kcal))} kcal</span>
      </div>
    </li>
  )
}

// ── Una comida ──────────────────────────────────────────────────────────────

function TarjetaComida({ c, plan, abierta, frec, onAbrir, onCambio }: {
  c: ComidaDia; plan: Comida | undefined; abierta: boolean; frec: ItemCatalogo[]; onAbrir: (abrir: boolean) => void; onCambio: (c: ComidaDia) => void
}) {
  const otros = c.id === ID_OTROS
  const comido = sumaComida(c)
  const prot = c.items.reduce((a, x) => a + x.n * x.prot, 0)
  const tienePlan = c.items.some(x => x.grupo === 'plan')
  const pct = c.kcal > 0 ? Math.min(100, (comido / c.kcal) * 100) : 0
  const pendiente = comidaPendiente(c)
  const estado = c.omitida ? <Pill color={COLOR.bad}>No la comí</Pill> : c.items.length > 0 ? <Pill color={COLOR.good}>✓ Anotada</Pill> : otros ? null : <Pill color={COLOR.muted}>Sin anotar</Pill>

  const setItems = (items: ItemDia[]) => onCambio({ ...c, items })
  const comiPlan = () => { if (c.kcal > 0 || c.prot > 0) onCambio(agregarItem({ ...c, omitida: undefined }, itemDelPlan(c))) }
  const noLaComi = () => {
    if (c.items.length > 0 && !window.confirm(`¿Marcar «${c.nombre}» como no comida? Se quita lo que anotaste en ella.`)) return
    onAbrir(false)
    onCambio({ ...c, items: [], omitida: true })
  }

  return (
    <li className="rounded-xl p-3.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }} data-comida={c.id}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="serif" style={{ fontSize: 18, lineHeight: 1.2, fontWeight: 600, color: COLOR.navy }}>{c.nombre}{c.hora && <span style={{ fontSize: 13, fontWeight: 500, color: COLOR.muted }}> · {c.hora}</span>}</h3>
          <p className="mt-0.5 tabular-nums" style={{ fontSize: 12.5, color: COLOR.muted }}>
            {otros ? 'Lo que comes entre comidas o fuera de tu dieta.' : `Tu dieta pide ${fmtNum(c.kcal)} kcal · ${fmtNum(c.prot)} g de proteína`}
          </p>
        </div>
        {estado}
      </div>

      {c.omitida ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p style={{ fontSize: 13.5, color: COLOR.ink }}>Te la saltaste: no suma calorías.</p>
          <button type="button" onClick={() => onCambio({ ...c, omitida: undefined })} className={`${BTN.base} ${BTN.ghost} min-h-10`}>Deshacer</button>
        </div>
      ) : (
        <>
          {!otros && c.kcal > 0 && (
            <div className="mt-2.5">
              <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(15,35,64,.09)' }} role="progressbar" aria-label={`${c.nombre}: ${fmtNum(Math.round(comido))} de ${fmtNum(c.kcal)} kcal`} aria-valuemin={0} aria-valuemax={c.kcal} aria-valuenow={Math.round(comido)}>
                <div style={{ width: `${pct}%`, height: '100%', background: comido > c.kcal * 1.1 ? COLOR.warn : COLOR.navy2, transition: 'width .2s' }} />
              </div>
              <p className="mt-1 tabular-nums" style={{ fontSize: 12.5, color: COLOR.ink }}>
                Llevas <strong>{fmtNum(Math.round(comido))}</strong> de {fmtNum(c.kcal)} kcal{prot > 0 && <> · {fmtNum(Math.round(prot))} g de proteína</>}
              </p>
            </div>
          )}
          {otros && comido > 0 && <p className="mt-2 tabular-nums" style={{ fontSize: 12.5, color: COLOR.ink }}>Llevas <strong>{fmtNum(Math.round(comido))}</strong> kcal{prot > 0 && <> · {fmtNum(Math.round(prot))} g de proteína</>}</p>}

          {c.items.length > 0 && (
            <ul className="mt-3 space-y-2">
              {c.items.map((x, i) => (
                <FilaItem key={`${x.id}-${i}`} x={x}
                  onCambio={p => setItems(c.items.map((y, j) => (j === i ? { ...y, ...p } : y)))}
                  onQuitar={() => setItems(c.items.filter((_, j) => j !== i))} />
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!otros && !tienePlan && (c.kcal > 0 || c.prot > 0) && (
              <button type="button" onClick={comiPlan} className={`${BTN.base} ${pendiente ? BTN.gold : BTN.ghost} min-h-11`} title={`Suma ${fmtNum(c.kcal)} kcal: lo que pide tu dieta para ${c.nombre.toLowerCase()}`}>✓ Comí lo del plan</button>
            )}
            <button type="button" aria-expanded={abierta} onClick={() => onAbrir(!abierta)} className={`${BTN.base} ${BTN.ghost} min-h-11`}>{abierta ? '▾ Cerrar' : '＋ Agregar'}</button>
            {!otros && <button type="button" onClick={noLaComi} className={`${BTN.base} min-h-11 px-2 text-xs underline`} style={{ color: COLOR.muted }}>No la comí</button>}
          </div>

          {abierta && <PanelAgregar comida={c} frec={frec} onCerrar={() => onAbrir(false)} onAgregar={x => onCambio(agregarItem(c, x))} />}
        </>
      )}

      {!otros && plan && plan.items.length > 0 && (
        <details className="mt-2.5">
          <summary className="cursor-pointer select-none" style={{ fontSize: 12.5, fontWeight: 600, color: COLOR.goldText }}>Qué lleva en tu dieta</summary>
          <ul className="mt-1.5 space-y-0.5 pl-4" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.ink, listStyle: 'disc' }}>
            {plan.intro && <li style={{ listStyle: 'none', marginLeft: -16, color: COLOR.muted }}>{plan.intro}</li>}
            {plan.items.map((it, i) => <li key={i} style={it.k === 'nota' ? { color: COLOR.muted, fontStyle: 'italic' } : undefined}>{it.t}{it.ops && it.ops.length > 0 && <> — {it.ops.join(' · ')}</>}</li>)}
          </ul>
        </details>
      )}
    </li>
  )
}

// ── El día ──────────────────────────────────────────────────────────────────

export default function DiaVista({ fecha, hoy, guardado, mapa, dieta, rutina, ctx, disponible, onGuardado, onSinTabla, onMedir }: {
  fecha: string; hoy: string
  /** Lo guardado de ese día (null si aún no hay nada). Solo se lee al abrir: de ahí en adelante manda lo que escribes. */
  guardado: DiaDiario | null
  /** Todos los días guardados (para «lo que más anotas» y para el acumulado de los días anteriores). */
  mapa: Map<string, DiaDiario>
  dieta: DocDieta; rutina: DocRutina; ctx: Contexto
  disponible: boolean
  /** Avisa que ese día quedó guardado (o borrado, si es null) para que la página actualice sus listas. */
  onGuardado: (fecha: string, dia: DiaDiario | null) => void
  onSinTabla: () => void
  onMedir: () => void
}) {
  const [dia, setDia] = useState<DiaDiario>(() => pendientes.get(fecha) ?? guardado ?? diaNuevo(fecha, dieta.comidas))
  const [estado, setEstado] = useState<Estado>(() => (pendientes.has(fecha) ? 'pendiente' : guardado ? 'ok' : 'nuevo'))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [existe, setExiste] = useState(!!guardado)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [ejAbierto, setEjAbierto] = useState(() => dia.ejercicio.length > 0)
  const [borrando, setBorrando] = useState(false)

  const diaRef = useRef(dia)
  const existeRef = useRef(!!guardado)
  const enVuelo = useRef(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const montado = useRef(true)
  const props = useRef({ disponible, onGuardado, onSinTabla })
  props.current = { disponible, onGuardado, onSinTabla }

  async function volcar() {
    if (enVuelo.current || !props.current.disponible) return
    const enviado = diaRef.current
    const json = JSON.stringify(enviado)
    const vacio = diaVacio(enviado)
    if (vacio && !existeRef.current) { pendientes.delete(fecha); if (montado.current) setEstado('nuevo'); return }
    enVuelo.current = true
    if (montado.current) { setEstado('guardando'); setErrorMsg(null) }
    const r = vacio ? await borrarDiaApi(fecha) : await guardarDiaApi(enviado)
    enVuelo.current = false
    if (!r.ok) {
      if (r.error.codigo === 'sin_tabla') props.current.onSinTabla()
      if (montado.current) { setEstado('error'); setErrorMsg(r.error.mensaje) }
      return
    }
    existeRef.current = !vacio
    if (montado.current) setExiste(!vacio)
    props.current.onGuardado(fecha, !vacio && 'dia' in r.data ? r.data.dia : null)
    // Si seguiste escribiendo mientras se guardaba, se guarda otra vez con lo último.
    if (JSON.stringify(diaRef.current) !== json) { void volcar(); return }
    pendientes.delete(fecha)
    if (montado.current) setEstado(vacio ? 'nuevo' : 'ok')
  }
  function programar() {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => { temporizador.current = null; void volcar() }, ESPERA_MS)
  }
  const cambiar = (f: (d: DiaDiario) => DiaDiario) => {
    const n = f(diaRef.current)
    diaRef.current = n
    setDia(n)
    pendientes.set(fecha, n)
    setEstado('pendiente'); setErrorMsg(null)
    programar()
  }

  useEffect(() => {
    montado.current = true
    if (pendientes.has(fecha)) programar()
    // Al esconder la página (cambiar de app en el celular) se guarda de inmediato: ahí los temporizadores se congelan.
    const alEsconder = () => { if (document.visibilityState === 'hidden' && pendientes.has(fecha)) { if (temporizador.current) clearTimeout(temporizador.current); void volcar() } }
    document.addEventListener('visibilitychange', alEsconder)
    return () => {
      montado.current = false
      document.removeEventListener('visibilitychange', alEsconder)
      if (temporizador.current) clearTimeout(temporizador.current)
      if (pendientes.has(fecha)) void volcar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Si lo anotado esperaba a que existiera la tabla (o a que la lectura se arreglara), se guarda en cuanto se pueda.
  useEffect(() => { if (disponible && pendientes.has(fecha) && !enVuelo.current) programar() }, [disponible]) // eslint-disable-line react-hooks/exhaustive-deps

  // Con algo sin guardar, el navegador avisa antes de cerrar o recargar la página.
  useEffect(() => {
    if (estado === 'ok' || estado === 'nuevo') return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [estado])

  // ── Lo que se calcula con lo que llevas (antes de que se guarde) ──
  const peso = useMemo(() => pesoEn(ctx.registros, fecha), [ctx.registros, fecha])
  const pesoDelDia = useMemo(() => [...ctx.registros].reverse().find(r => r.fecha === fecha && r.peso != null)?.peso ?? null, [ctx.registros, fecha])
  const t = useMemo(() => totalesDia(dia, ctx), [dia, ctx])
  const vacio = diaVacio(dia)
  const mapaLocal = useMemo(() => { const m = new Map(mapa); if (vacio) m.delete(fecha); else m.set(fecha, dia); return m }, [mapa, dia, fecha, vacio])
  const resumen = useMemo(() => resumenPeriodo(mapaLocal, ctx, { ini: fecha, fin: fecha }, hoy), [mapaLocal, ctx, fecha, hoy])
  const acum = useMemo(() => acumuladoDelRango(mapaLocal, ctx, { ini: sumaDias(fecha, -13), fin: fecha }, hoy), [mapaLocal, ctx, fecha, hoy])
  const frec = useMemo(() => frecuentes([...mapa.values()], hoy), [mapa, hoy])
  const diaRut = useMemo(() => diaDeFecha(rutina, fecha), [rutina, fecha])
  const deRutina = useMemo(() => ejercicioDeRutina(diaRut, peso), [diaRut, peso])
  const rutinaPendiente = deRutina.filter(x => !dia.ejercicio.some(e => e.id === x.id))
  const faltantes = dieta.comidas.filter(c => !dia.comidas.some(x => x.id === c.id))
  const hayPendientes = dia.comidas.some(comidaPendiente)

  // ── Comidas ──
  const cambiarComida = (id: string, c: ComidaDia) => cambiar(d => ({ ...d, comidas: d.comidas.map(x => (x.id === id ? c : x)) }))
  const todoPlan = () => cambiar(d => ({
    ...d, comidas: d.comidas.map(c => (comidaPendiente(c) && (c.kcal > 0 || c.prot > 0) ? agregarItem(c, itemDelPlan(c)) : c)),
  }))
  const agregarComidas = () => cambiar(d => {
    const nuevas = diaNuevo(fecha, faltantes).comidas.filter(c => c.id !== ID_OTROS)
    const otros = d.comidas.filter(c => c.id === ID_OTROS), resto = d.comidas.filter(c => c.id !== ID_OTROS)
    return { ...d, comidas: [...resto, ...nuevas, ...otros] }
  })

  // ── Ejercicio ──
  const sumarEjercicio = (id: string) => {
    const c = EJERCICIOS_CATALOGO.find(e => e.id === id); if (!c) return
    cambiar(d => ({ ...d, ejercicio: [...d.ejercicio, { id: c.id, nombre: c.nombre, min: c.min, kcal: kcalEjercicio(c.id, c.min, peso) }] }))
  }
  const cambiarEjercicio = (i: number, p: Partial<EjercicioDia>) => cambiar(d => ({ ...d, ejercicio: d.ejercicio.map((e, j) => (j === i ? { ...e, ...p } : e)) }))
  const minutos = (i: number, min: number) => cambiar(d => ({ ...d, ejercicio: d.ejercicio.map((e, j) => (j === i ? { ...e, min, kcal: kcalEjercicio(e.id, min, peso) } : e)) }))
  const quitarEjercicio = (i: number) => cambiar(d => ({ ...d, ejercicio: d.ejercicio.filter((_, j) => j !== i) }))
  const cargarRutina = () => { setEjAbierto(true); cambiar(d => ({ ...d, ejercicio: [...d.ejercicio, ...rutinaPendiente] })) }
  const hiceEjercicio = ejAbierto || dia.ejercicio.length > 0
  const alElegirEjercicio = (v: 'si' | 'no') => {
    if (v === 'si') { setEjAbierto(true); return }
    if (dia.ejercicio.length > 0 && !window.confirm('¿Quitar el ejercicio que anotaste este día?')) return
    setEjAbierto(false)
    if (dia.ejercicio.length > 0) cambiar(d => ({ ...d, ejercicio: [] }))
  }

  async function borrar() {
    if (borrando) return
    if (!window.confirm('¿Borrar todo lo que anotaste este día? Esta acción no se puede deshacer.')) return
    setBorrando(true)
    if (temporizador.current) clearTimeout(temporizador.current)
    const r = await borrarDiaApi(fecha)
    setBorrando(false)
    if (!r.ok) {
      if (r.error.codigo === 'sin_tabla') props.current.onSinTabla()
      setEstado('error'); setErrorMsg(r.error.mensaje)
      return
    }
    pendientes.delete(fecha)
    const nuevo = diaNuevo(fecha, dieta.comidas)
    diaRef.current = nuevo; setDia(nuevo)
    existeRef.current = false; setExiste(false); setEjAbierto(false); setAbierta(null)
    setEstado('nuevo'); setErrorMsg(null)
    props.current.onGuardado(fecha, null)
  }

  const planPorId = (id: string) => dieta.comidas.find(c => c.id === id)
  const futuro = fecha > hoy

  return (
    <>
      <Cifras r={resumen} periodo="dia" dieta={dieta} />

      <Panel
        eyebrow="Lo que comiste" icon="🍽️" title="Comida por comida"
        subtitle="Toca «Comí lo del plan» si fue como dice tu dieta, o agrega lo que de verdad comiste."
        right={<button type="button" onClick={todoPlan} disabled={!hayPendientes} className={`${BTN.base} ${BTN.ghost} min-h-10`} title="Marca todas las comidas que faltan como comidas según tu dieta">✓ Todo según el plan</button>}
      >
        <p className="mb-3" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.muted }}>
          {pesoDelDia != null
            ? <>⚖️ Ese día te pesaste: <strong style={{ color: COLOR.ink }}>{fmtNum(pesoDelDia, 1)} kg</strong>.</>
            : <>Sin pesaje ese día. <button type="button" onClick={onMedir} className="underline" style={{ color: COLOR.goldText, fontWeight: 700 }}>⚖️ Registrar mi peso</button></>}
          {peso != null && <> Para tus cuentas se usa {fmtNum(peso, 1)} kg.</>}
          {futuro && <> (Es mañana: puedes dejarlo listo.)</>}
        </p>
        {dia.comidas.length === 0 ? (
          <p style={{ fontSize: 13, color: COLOR.muted }}>Tu dieta no tiene comidas todavía: agrégalas en Dieta › Editar.</p>
        ) : (
          <ul className="space-y-3">
            {dia.comidas.map(c => (
              <TarjetaComida key={c.id} c={c} plan={planPorId(c.id)} abierta={abierta === c.id} frec={frec}
                onAbrir={a => setAbierta(a ? c.id : null)} onCambio={n => cambiarComida(c.id, n)} />
            ))}
          </ul>
        )}
        {faltantes.length > 0 && (
          <button type="button" onClick={agregarComidas} className={`${BTN.base} ${BTN.ghost} mt-3 min-h-10 whitespace-normal text-left`}>＋ Agregar {faltantes.map(c => c.nombre.toLowerCase()).join(', ')} (están en tu dieta y no en este día)</button>
        )}
      </Panel>

      <Panel
        eyebrow="Movimiento" icon="🏃" title="¿Hiciste ejercicio?"
        subtitle="Las calorías son las que gastas de más por moverte (según tu peso y la intensidad); puedes cambiarlas."
        right={<Segmented<'si' | 'no'> ariaLabel="¿Hiciste ejercicio?" value={hiceEjercicio ? 'si' : 'no'} onChange={alElegirEjercicio} options={[{ value: 'si', label: '✓ Sí' }, { value: 'no', label: 'No' }]} />}
      >
        {!hiceEjercicio ? (
          <p style={{ fontSize: 13.5, color: COLOR.muted }}>Sin ejercicio este día: solo cuenta tu gasto base.{diaRut && deRutina.length > 0 && <> Hoy toca <strong style={{ color: COLOR.ink }}>{diaRut.nombre.toLowerCase()}</strong> en tu rutina.</>}</p>
        ) : (
          <div className="space-y-3">
            {diaRut && rutinaPendiente.length > 0 && (
              <button type="button" onClick={cargarRutina} className={`${BTN.base} ${BTN.gold} min-h-11 whitespace-normal`} title="Agrega lo que toca según tu rutina; los minutos los ajustas tú">
                ✓ Hice la rutina de {diaRut.nombre.toLowerCase()} ({rutinaPendiente.map(x => `${x.nombre} ${x.min} min`).join(' + ')})
              </button>
            )}
            <div>
              <p style={ETQ}>Agrega lo que hiciste</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EJERCICIOS_CATALOGO.map(c => (
                  <button key={c.id} type="button" onClick={() => sumarEjercicio(c.id)} className={CHIP} style={{ background: '#fff', borderColor: COLOR.lineStrong, color: COLOR.ink }}>＋ {c.nombre}</button>
                ))}
              </div>
            </div>
            {dia.ejercicio.length > 0 && (
              <ul className="space-y-2">
                {dia.ejercicio.map((e, i) => (
                  <li key={`${e.id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white px-3 py-2" style={{ border: `1px solid ${COLOR.line}`, borderLeft: '4px solid #2F9E63' }}>
                    {e.id === 'otro'
                      ? <input value={e.nombre} maxLength={80} onChange={ev => cambiarEjercicio(i, { nombre: ev.target.value })} aria-label="Nombre del ejercicio" className={`${INPUT} min-h-11 min-w-0 flex-1`} style={{ flexBasis: 130 }} />
                      : <span className="min-w-0 flex-1 font-semibold" style={{ flexBasis: 130, fontSize: 14, color: COLOR.navy }}><span aria-hidden>🏃</span> {e.nombre}</span>}
                    <span className="flex items-center gap-1.5">
                      <Num valor={e.min} onValor={m => minutos(i, Math.round(m))} max={720} etiqueta={`Minutos de ${e.nombre}`} className="w-20" />
                      <span style={{ fontSize: 12, color: COLOR.muted }}>min</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Num valor={e.kcal} onValor={kcal => cambiarEjercicio(i, { kcal: Math.round(kcal) })} max={5000} etiqueta={`Calorías de ${e.nombre}`} className="w-20" />
                      <span style={{ fontSize: 12, color: COLOR.muted }}>kcal</span>
                    </span>
                    <button type="button" aria-label={`Quitar ${e.nombre}`} onClick={() => quitarEjercicio(i)} className={`${BTN.base} ${BTN.danger} min-h-10 min-w-10 px-0 text-base`}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      <Panel eyebrow="Opcional" icon="📝" title="Nota del día" subtitle="Cómo dormiste, cómo te sentiste, qué pasó.">
        <textarea value={dia.nota ?? ''} maxLength={MAX_NOTA} rows={2} aria-label="Nota del día" onChange={e => cambiar(d => ({ ...d, nota: e.target.value }))} className={`${INPUT} min-h-[72px]`} />
        {existe && (
          <div className="mt-3">
            <button type="button" onClick={() => void borrar()} disabled={borrando || !disponible} className={`${BTN.base} ${BTN.danger} min-h-11`}>{borrando ? 'Borrando…' : '🗑️ Borrar este día'}</button>
          </div>
        )}
      </Panel>

      {t.faltan.length > 0 && !vacio && (
        <p role="note" className="rounded-xl px-4 py-2.5" style={{ background: '#FFF8E6', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.warn}`, color: '#5A3205', fontSize: 13.5, lineHeight: 1.5 }}>
          Faltan por anotar: <strong>{t.faltan.join(', ')}</strong>. Mientras tanto la cuenta del día se ve mejor de lo que será (cuenta lo que gastas todo el día, pero solo lo que ya comiste).
        </p>
      )}

      <Cascada
        titulo={vacio ? 'Cómo se arma tu balance' : 'Qué movió tu balance hoy'} ver="dia"
        impacto={resumen.impacto} balance={resumen.balance} calculables={resumen.calculables}
        sinDatos={vacio ? 'Anota lo que comiste para ver cuánto movió cada cosa tu balance.' : resumen.calculables === 0 ? 'Falta tu peso para estimar cuánto gastas: registra una medición.' : undefined} />
      <AcumuladoGrafica a={acum} titulo="Tu acumulado" subtitulo="Los últimos 14 días: cómo se va sumando lo que ganas o pierdes día con día." />

      {/* Barra pegajosa: la cuenta del día mientras escribes + si ya se guardó */}
      <div data-barra-dia className="sticky z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl px-4 py-3" style={{ bottom: 'max(12px, env(safe-area-inset-bottom))', background: COLOR.navy, color: COLOR.onDark, boxShadow: '0 18px 40px -16px rgba(15,35,64,.7)' }}>
        <div className="min-w-0 tabular-nums" aria-live="polite" style={{ fontSize: 13, lineHeight: 1.45 }}>
          <span>Comiste <strong>{fmtNum(t.ingesta)}</strong></span>
          {t.gasto != null && t.balance != null ? (
            <>
              <span style={{ color: COLOR.onDarkMuted }}> · gastas </span><strong>{fmtNum(t.gasto)}</strong>
              <span style={{ color: COLOR.onDarkMuted }}> → </span>
              <strong style={{ color: t.balance <= 0 ? COLOR.goodOnDark : COLOR.badOnDark }}>{conSigno(t.balance)} kcal ≈ {grasaConSigno(t.balance)}</strong>
            </>
          ) : <span style={{ color: COLOR.onDarkMuted }}> kcal · registra tu peso para estimar cuánto gastas</span>}
        </div>
        <div className="flex items-center gap-2" role="status" aria-live="polite" style={{ fontSize: 12.5 }}>
          {estado === 'error' ? (
            <>
              <span style={{ color: COLOR.badOnDark }} title={errorMsg ?? undefined}>⚠ No se pudo guardar</span>
              <button type="button" onClick={() => void volcar()} className={`${BTN.base} min-h-9 px-3 text-xs`} style={{ background: 'rgba(255,255,255,.14)', color: COLOR.onDark }}>Reintentar</button>
            </>
          ) : !disponible && estado !== 'nuevo' ? (
            <span style={{ color: COLOR.warnOnDark }}>Sin guardar: falta crear la tabla</span>
          ) : estado === 'guardando' ? <span style={{ color: COLOR.onDarkMuted }}>Guardando…</span>
            : estado === 'pendiente' ? <span style={{ color: COLOR.onDarkMuted }}>Guardando en un momento…</span>
            : estado === 'ok' ? <span style={{ color: COLOR.goodOnDark }}>✓ Guardado</span>
            : <span style={{ color: COLOR.onDarkMuted }}>Se guarda solo</span>}
        </div>
      </div>
      {errorMsg && estado === 'error' && <p role="alert" className="rounded-xl px-4 py-2.5" style={{ background: '#FEF2F1', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.bad}`, color: '#7F1D1D', fontSize: 13.5 }}>{errorMsg} Lo que anotaste sigue aquí y se reintentará.</p>}
    </>
  )
}
