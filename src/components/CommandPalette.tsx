'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { Epica, EpicaTask } from '@/lib/supabase'
import {
  detectarModo, parseCaptura, escaparToken, quitarToken, etiquetaFecha, fechaLocal, normalizar, ICONO_TOKEN,
  type CapturaEpica, type TokenCaptura,
} from '@/lib/captura'
import { addRegistro } from '@/app/peso/actions'

type TaskHit = { id: string; title: string; status: string; epicaId: string; epicaName: string; color: string }
type ItemHit = { id: string; title: string; url: string; section: string }
type FeatureHit = { id: string; title: string; estado: string; epicaId: string; epicaName: string; color: string; href: string }
type IniciativaHit = FeatureHit & { featureId: string; featureName: string }
type IdeaHit = { id: string; title: string; creada: string; convertida: boolean; href: string }
type Resultados = { q: string; error?: boolean; tasks: TaskHit[]; items: ItemHit[]; features: FeatureHit[]; iniciativas: IniciativaHit[]; ideas: IdeaHit[] }
type Aviso = { ok: boolean; texto: string; abrir?: { label: string; href: string; recien?: boolean }; deshacer?: () => void }
type Fila = { key: string; grupo: string; pick: () => void; nodo: ReactNode }

/* ─── Épicas para la captura: se piden a /api/epicas una vez y se guardan en memoria ─── */
type EpicaLigera = CapturaEpica & { color: string }
type CacheEpicas = {
  at: number
  epicas: EpicaLigera[]
  gates: { feature: boolean; iniciativa: boolean; estMin: boolean }   // columnas que ya existen en `tareas`
  maxOrden: Record<string, number>                                     // planOrder más alto por día (la nueva va al final)
}
let cacheEp: CacheEpicas | null = null
let cargaEp: Promise<CacheEpicas | null> | null = null
function cargarEpicas(): Promise<CacheEpicas | null> {
  if (cacheEp && Date.now() - cacheEp.at < 5 * 60_000) return Promise.resolve(cacheEp)
  if (!cargaEp) {
    cargaEp = fetch('/api/epicas').then(r => r.json()).then(j => {
      if (!j?.ok || !Array.isArray(j.data)) return cacheEp
      const maxOrden: Record<string, number> = {}
      const epicas = (j.data as Epica[]).map(e => {
        for (const t of e.tasks || []) if (t.plan) maxOrden[t.plan] = Math.max(maxOrden[t.plan] ?? 0, t.planOrder ?? 0)
        return {
          id: e.id, name: e.name, color: e.color, archived: !!e.archived,
          features: (e.features || []).map(f => ({ id: f.id, t: f.t, iniciativas: (f.iniciativas || []).map(i => ({ id: i.id, nombre: i.nombre })) })),
        }
      })
      cacheEp = { at: Date.now(), epicas, gates: { feature: !!j.featuresReady, iniciativa: !!j.iniciativaIdReady, estMin: !!j.estMinReady }, maxOrden }
      return cacheEp
    }).catch(() => cacheEp).finally(() => { cargaEp = null })
  }
  return cargaEp
}
// Sin @épica la tarea va a "General" (el cajón de sastre) o, si no existe, a la primera activa.
const epicaPorDefecto = (eps: EpicaLigera[]) => eps.find(e => !e.archived && normalizar(e.name).trim() === 'general') || eps.find(e => !e.archived)
const nuevoId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 't' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36))
const syncTareas = (body: Record<string, unknown>) => fetch('/api/tareas/sync', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(r => r.json()).catch(() => null) as Promise<{ ok?: boolean; error?: string; conflicts?: string[] } | null>
// Épicas y Tiempo releen al recibir `focus` (Roadmap sólo si su última lectura tiene >30 s); 'advl:tareas-cambiaron' aún no lo escucha nadie.
const refrescarVistas = (epicaId: string) => {
  try { window.dispatchEvent(new CustomEvent('advl:tareas-cambiaron', { detail: { epicaId } })); window.dispatchEvent(new Event('focus')) } catch { /* sin ventana */ }
}

/* La paleta puede quedar montada dos veces en una página (la del header y la de respaldo que monta
   SectionNav para las páginas sin header compartido): sólo UNA atiende ⌘K y "advl:captura". */
const montadas: { id: number; conBoton: boolean }[] = []
let sigId = 0
const esDuena = (id: number) => (montadas.find(m => m.conBoton) || montadas[0])?.id === id

const VACIO: Omit<Resultados, 'q'> = { tasks: [], items: [], features: [], iniciativas: [], ideas: [] }
const C = { ink: '#14233D', navy: '#16365F', gold: '#C2933A', goldDk: '#A87A2C', muted: 'rgba(20,35,61,0.45)', line: 'rgba(15,35,64,0.1)' }
const sinBlur = (e: MouseEvent) => e.preventDefault()   // el input no pierde el foco al tocar chips/crear

/** Búsqueda unificada + captura rápida (⌘K / Ctrl+K, o el "+" de la barra de secciones).
 *  Busca tareas, features, iniciativas, ideas y accesos (src/app/api/search). Si el texto empieza
 *  con "+", "nueva" o "tarea" crea una tarea en una línea (sintaxis en src/lib/captura.ts); "idea …"
 *  guarda una idea y "peso 82.4" registra la medición de hoy. `sinBoton`: sólo escucha, sin botón. */
export default function CommandPalette({ sinBoton = false }: { sinBoton?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Resultados | null>(null)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState(0)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [busy, setBusy] = useState(false)
  const [ctxEp, setCtxEp] = useState<CacheEpicas | null>(cacheEp)
  const [errEp, setErrEp] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef(0)          // sólo se aplica la respuesta de la búsqueda MÁS reciente
  const openRef = useRef(false)
  const idRef = useRef(0)
  const router = useRouter()
  useEffect(() => { openRef.current = open }, [open])

  useEffect(() => {
    const id = ++sigId
    idRef.current = id
    montadas.push({ id, conBoton: !sinBoton })
    return () => { const i = montadas.findIndex(m => m.id === id); if (i >= 0) montadas.splice(i, 1) }
  }, [sinBoton])

  // flushSync + focus dentro del mismo toque: en iPhone el teclado sólo sale si el focus ocurre en el gesto.
  const abrir = useCallback((texto: string) => {
    seqRef.current++
    flushSync(() => { setQ(texto); setRes(null); setLoading(false); setSel(0); setAviso(null); setOpen(true) })
    const el = inputRef.current
    if (el) { el.focus(); try { el.setSelectionRange(texto.length, texto.length) } catch { /* sin selección */ } }
  }, [])
  const cerrar = useCallback(() => { seqRef.current++; setOpen(false) }, [])

  // En captura (fase de ida) y cortando la propagación: ⌘K y Escape no llegan a los atajos de la página de abajo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const corta = () => { e.preventDefault(); e.stopImmediatePropagation() }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!esDuena(idRef.current)) return
        if (openRef.current) { corta(); cerrar(); return }
        if (sinBoton) return   // Accesos (sólo la de respaldo): ⌘K sigue siendo su buscador
        corta(); abrir('')
      } else if (e.key === 'Escape' && openRef.current) { corta(); cerrar() }
    }
    const onCaptura = (e: Event) => {
      if (!esDuena(idRef.current)) return
      abrir((e as CustomEvent<{ texto?: string }>).detail?.texto ?? '+ ')
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('advl:captura', onCaptura)
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('advl:captura', onCaptura) }
  }, [abrir, cerrar, sinBoton])

  const hoy = fechaLocal()
  const modo = useMemo(() => detectarModo(q), [q])
  const enCaptura = open && modo.tipo === 'tarea'
  useEffect(() => {
    if (!enCaptura) return
    let vivo = true
    setErrEp(false)
    cargarEpicas().then(c => { if (!vivo) return; if (c) setCtxEp(c); else setErrEp(true) })
    return () => { vivo = false }
  }, [enCaptura])

  const captura = useMemo(() => modo.tipo === 'tarea' ? parseCaptura(modo.resto, { epicas: ctxEp?.epicas || [], hoy }) : null, [modo, ctxEp, hoy])
  const destino = captura && ctxEp ? (captura.epicaId ? ctxEp.epicas.find(e => e.id === captura.epicaId) : epicaPorDefecto(ctxEp.epicas)) : undefined

  // Qué se busca: el texto tal cual; en captura, el título (para ver si ya existe algo parecido).
  const busqueda = modo.tipo === 'buscar' ? q.trim() : modo.tipo === 'tarea' ? (captura?.titulo || '') : modo.tipo === 'idea' ? modo.texto : ''
  const minimo = modo.tipo === 'buscar' ? 2 : 3
  useEffect(() => {
    const seq = ++seqRef.current
    if (!open || busqueda.length < minimo) { setRes(null); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(busqueda)}`).then(r => r.json()).then(j => {
        if (seq !== seqRef.current) return
        setRes(j?.ok
          ? { q: busqueda, tasks: j.tasks || [], items: j.items || [], features: j.features || [], iniciativas: j.iniciativas || [], ideas: j.ideas || [] }
          : { q: busqueda, error: true, ...VACIO })
        setSel(0)
      }).catch(() => { if (seq === seqRef.current) setRes({ q: busqueda, error: true, ...VACIO }) })
        .finally(() => { if (seq === seqRef.current) setLoading(false) })
    }, 220)
    return () => clearTimeout(t)
  }, [busqueda, minimo, open])

  const ir = (href: string, recien = false) => {
    cerrar()
    // En /epicas router.push no vuelve a montar la página y ?e=&t=/?fe=/?et= sólo se leen al montar o en popstate.
    if (window.location.pathname === '/epicas' && href.startsWith('/epicas?')) {
      // Recién creada (puede no estar aún en memoria) o feature (?fe= sólo se aplica al cambiar de épica): recarga completa.
      if (recien || new URLSearchParams(href.slice(href.indexOf('?'))).has('fe')) { window.location.assign(href); return }
      window.history.pushState(null, '', href)
      window.dispatchEvent(new PopStateEvent('popstate'))
      return
    }
    router.push(href)
  }
  const listoParaOtra = (enviado: string, siguiente: string) => {
    // Si ya empezaste a escribir la siguiente mientras se guardaba, no se te borra.
    setQ(cur => (cur === enviado ? siguiente : cur))
    setSel(0)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const crearTarea = async () => {
    if (busy || modo.tipo !== 'tarea') return
    const resto = modo.resto
    const enviado = q
    let c = ctxEp
    if (!c) {
      // Enter antes de que lleguen las épicas: se espera la carga (con "Creando…") en vez de descartarlo.
      setBusy(true)
      c = await cargarEpicas()
      setBusy(false)
      if (!c) { setErrEp(true); setAviso({ ok: false, texto: 'No pude cargar tus épicas. Intenta de nuevo.' }); return }
      setCtxEp(c); setErrEp(false)
    }
    // Se interpreta otra vez con las épicas ya cargadas (el @/# no se resolvía sin ellas).
    const captura = parseCaptura(resto, { epicas: c.epicas, hoy })
    if (!captura.titulo) { setAviso({ ok: false, texto: 'Escribe qué hay que hacer.' }); return }
    const ep = captura.epicaId ? c.epicas.find(e => e.id === captura.epicaId) : epicaPorDefecto(c.epicas)
    if (!ep) { setAviso({ ok: false, texto: 'No tienes épicas activas donde crearla.' }); return }
    // Misma forma que addTaskInline de Épicas: los campos con columna gateada sólo viajan si existe.
    const nt: EpicaTask = { id: nuevoId(), t: captura.titulo, status: 'Por hacer', due: captura.due || '', note: '', createdAt: hoy }
    if (c.gates.feature && captura.featureId) nt.featureId = captura.featureId
    if (c.gates.iniciativa && captura.iniciativaId) nt.iniciativaId = captura.iniciativaId
    if (c.gates.estMin && captura.estMin) nt.estMin = captura.estMin
    if (captura.prioridad) nt.priority = captura.prioridad
    if (captura.plan) {
      nt.plan = captura.plan
      nt.priority = captura.prioridad || 'media'
      nt.planOrder = (c.maxOrden[captura.plan] ?? 0) + 1000
      if (captura.plan === hoy) { nt.planStatusPrev = 'Por hacer'; nt.status = 'En curso' }   // = applyPlanStatus
    }
    setBusy(true)
    const r = await syncTareas({ epicaId: ep.id, create: [nt] })
    setBusy(false)
    if (!r?.ok || r.conflicts?.length) { setAviso({ ok: false, texto: `No se pudo crear: ${r?.error || 'sin conexión'}` }); return }
    if (nt.plan) c.maxOrden[nt.plan] = nt.planOrder!
    const f = ep.features?.find(x => x.id === nt.featureId)
    const ini = f?.iniciativas?.find(x => x.id === nt.iniciativaId)
    setAviso({
      ok: true,
      texto: `Creada en ${[ep.name, f?.t, ini?.nombre].filter(Boolean).join(' › ')}${nt.plan ? ` · ${etiquetaFecha(nt.plan, hoy)}` : ''}`,
      abrir: { label: 'Abrir', href: `/epicas?e=${encodeURIComponent(ep.id)}&t=${encodeURIComponent(nt.id!)}`, recien: true },
      deshacer: async () => {
        const u = await syncTareas({ epicaId: ep.id, remove: [nt.id] })
        setAviso(u?.ok ? { ok: true, texto: `Quitaste «${nt.t}»` } : { ok: false, texto: 'No se pudo deshacer' })
        refrescarVistas(ep.id)
      },
    })
    listoParaOtra(enviado, '+ ')
    refrescarVistas(ep.id)
  }

  const guardarIdea = async (texto: string) => {
    if (busy) return
    const enviado = q
    setBusy(true)
    const r = await fetch('/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) })
      .then(x => x.json()).catch(() => null) as { ok?: boolean; needsMigration?: boolean; error?: string } | null
    setBusy(false)
    if (!r?.ok) { setAviso({ ok: false, texto: r?.needsMigration ? 'Falta correr sql/ideas.sql en Supabase.' : `No se pudo guardar: ${r?.error || 'sin conexión'}` }); return }
    setAviso({ ok: true, texto: 'Idea guardada', abrir: { label: 'Ver ideas', href: '/ideas' } })
    listoParaOtra(enviado, '')
  }

  const registrarPeso = async (kg: number) => {
    if (busy) return
    const enviado = q
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('fecha', hoy)
      fd.set('peso', String(kg))
      const r = await addRegistro(fd)
      if (!r?.ok) { setAviso({ ok: false, texto: 'No se pudo registrar el peso.' }); return }
      setAviso({ ok: true, texto: `Peso de hoy: ${kg} kg`, abrir: { label: 'Ver peso', href: '/peso' } })
      listoParaOtra(enviado, '')
    } catch {
      setAviso({ ok: false, texto: 'No se pudo registrar el peso.' })
    } finally { setBusy(false) }
  }

  /* ─── Filas: una sola lista (↑↓ y Enter la recorren), agrupada por tipo ─── */
  const vigentes = res && res.q === busqueda ? res : null   // nunca se elige un resultado de otra búsqueda
  // Mientras llega la nueva, los últimos resultados se quedan visibles (atenuados, sin poder elegirse): la lista no parpadea.
  const previos = !vigentes && res && !res.error ? res : null
  const mostrados = vigentes || previos
  const filas: Fila[] = []
  if (modo.tipo === 'idea') {
    const texto = modo.texto
    filas.push({ key: 'idea', grupo: 'Capturar', pick: () => guardarIdea(texto), nodo: <FilaAccion icono="💡" titulo={busy ? 'Guardando…' : 'Guardar idea'} detalle={`«${texto}»`} /> })
  } else if (modo.tipo === 'peso') {
    const kg = modo.kg
    filas.push({ key: 'peso', grupo: 'Capturar', pick: () => registrarPeso(kg), nodo: <FilaAccion icono="⚖️" titulo={busy ? 'Registrando…' : `Registrar ${kg} kg`} detalle="medición de hoy" /> })
  }
  const nAcciones = filas.length
  if (mostrados) {
    mostrados.tasks.forEach(t => filas.push({
      key: `t-${t.id}`, grupo: modo.tipo === 'tarea' ? '¿Ya existe? · Tareas' : 'Tareas', pick: () => ir(`/epicas?e=${encodeURIComponent(t.epicaId)}&t=${encodeURIComponent(t.id)}`),
      nodo: <FilaHit marca={<Punto color={t.color} />} titulo={t.title} hecho={t.status === 'Terminada'} meta={t.epicaName} />,
    }))
    mostrados.features.forEach(f => filas.push({
      key: `f-${f.id}`, grupo: 'Features', pick: () => ir(f.href),
      nodo: <FilaHit marca={<Glifo color={f.color}>▣</Glifo>} titulo={f.title} hecho={f.estado === 'cerrado'} meta={f.epicaName} />,
    }))
    mostrados.iniciativas.forEach(i => filas.push({
      key: `i-${i.id}`, grupo: 'Iniciativas', pick: () => ir(i.href),
      nodo: <FilaHit marca={<Glifo color={i.color}>◆</Glifo>} titulo={i.title} hecho={i.estado === 'cerrada' || i.estado === 'cancelada'} meta={[i.featureName, i.epicaName].filter(Boolean).join(' · ')} />,
    }))
    mostrados.ideas.forEach(i => filas.push({
      key: `d-${i.id}`, grupo: 'Ideas', pick: () => ir(i.href),
      nodo: <FilaHit marca={<Glifo>💡</Glifo>} titulo={i.title} meta={i.convertida ? '✓ ya es tarea' : undefined} />,
    }))
    mostrados.items.forEach(it => filas.push({
      key: `a-${it.id}`, grupo: 'Accesos', pick: () => { cerrar(); window.open(it.url, '_blank', 'noopener,noreferrer') },
      nodo: <FilaHit marca={<Glifo>🔗</Glifo>} titulo={it.title} meta={it.section} />,
    }))
  }
  const sinResultados = !!vigentes && !vigentes.error && filas.length === nAcciones
  if (modo.tipo === 'buscar' && sinResultados) {
    const texto = q.trim()
    filas.push({ key: 'crear-desde-busqueda', grupo: 'Capturar', pick: () => abrir(`+ ${texto}`), nodo: <FilaAccion icono="＋" titulo="Crear tarea" detalle={`«${texto}»`} /> })
  }
  // En captura, "Crear tarea" es la fila 0 (Enter la crea); se pinta aparte porque lleva chips tocables.
  const base = modo.tipo === 'tarea' ? 1 : 0
  const elegibles = previos ? nAcciones : filas.length
  const total = elegibles + base
  const elegir = (idx: number) => {
    if (modo.tipo === 'tarea' && idx === 0) { crearTarea(); return }
    if (idx - base >= elegibles) return
    filas[idx - base]?.pick()
  }

  // × del chip = quitar el token; "es texto" = dejarlo literal en el título (falsos positivos: "mar", "1/2"…).
  const editarToken = (tk: TokenCaptura, como: 'quitar' | 'texto') => {
    if (modo.tipo !== 'tarea') return
    const off = q.length - modo.resto.length
    setQ(como === 'quitar' ? quitarToken(q, tk, off) : escaparToken(q, tk, off))
    inputRef.current?.focus()
  }

  const boton = sinBoton ? null : (
    <button onClick={() => abrir('')} className="band-glass band-glass-hover" title="Buscar o capturar (⌘K · empieza con + para crear una tarea)" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', border: 'none' }}>
      <span style={{ fontSize: 13, lineHeight: 1 }}>⌘</span> Buscar
    </button>
  )
  if (!open || typeof document === 'undefined') return boton

  const hint = (txt: ReactNode) => <div style={{ padding: '14px 12px', fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>{txt}</div>
  const k = (s: string) => <b style={{ color: C.navy }}>{s}</b>
  // Mientras cargan las épicas, @/# todavía no se pueden resolver: no se marcan como "no reconocidos".
  const chips = (captura?.tokens || []).filter(tk => ctxEp || tk.reconocido || !['epica', 'feature', 'iniciativa'].includes(tk.tipo))
  const colorDestino = (destino as EpicaLigera | undefined)?.color
  let grupoPrevio = ''

  return (
    <>
      {boton}
      {createPortal(
        <div className="cp-overlay" onClick={cerrar} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,22,42,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 20px 20px', fontFamily: 'var(--font-ui)' }}>
          <style>{`
            .cp-chip { min-height: 26px; }
            .cp-btn { min-height: 30px; }
            .cp-chip-btn { min-height: 26px; min-width: 26px; }
            .cp-solo-sm { display: none; }
            @media (max-width: 640px) {
              .cp-overlay { padding: 10px !important; }
              .cp-chip, .cp-btn, .cp-chip-btn { min-height: 34px; }
              .cp-btn, .cp-chip-btn { min-width: 34px; }
              .cp-fila { min-height: 44px; }
              .cp-solo-pc { display: none; }
              .cp-solo-sm { display: inline; }
            }
          `}</style>
          <div onClick={ev => ev.stopPropagation()} role="dialog" aria-modal="true" aria-label="Buscar o capturar" style={{ width: '100%', maxWidth: 580, background: '#fff', borderRadius: 16, boxShadow: '0 50px 90px -30px rgba(8,18,36,.75)', overflow: 'hidden' }}>
            {/* <form>: el Enter/"Ir" del teclado del celular dispara submit aunque el keydown no llegue limpio (Android). */}
            <form onSubmit={ev => { ev.preventDefault(); elegir(Math.min(sel, total - 1)) }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 16px', borderBottom: `1px solid ${C.line}`, margin: 0 }}>
              <span aria-hidden="true" style={{ fontSize: 16, color: modo.tipo === 'buscar' ? 'rgba(20,35,61,0.4)' : C.gold, width: 18, textAlign: 'center', fontWeight: 800 }}>{modo.tipo === 'buscar' ? '🔎' : '+'}</span>
              <input ref={inputRef} value={q}
                onChange={e => { setQ(e.target.value); setSel(0); if (aviso && !aviso.ok) setAviso(null) }}
                onKeyDown={ev => {
                  if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel(s => Math.min(total - 1, s + 1)) }
                  else if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel(s => Math.max(0, s - 1)) }
                }}
                enterKeyHint={modo.tipo === 'buscar' ? 'search' : 'enter'} autoCapitalize="sentences" autoComplete="off" autoCorrect="off" spellCheck={false}
                aria-label="Buscar o capturar" placeholder="Busca… o escribe + para crear una tarea"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 16, color: C.ink, background: 'transparent', fontFamily: 'inherit' }} />
              <button type="button" onClick={cerrar} className="cp-btn" aria-label="Cerrar" style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.45)', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 7, padding: '0 9px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span className="cp-solo-pc">Esc</span><span className="cp-solo-sm" style={{ fontSize: 12.5 }}>Cerrar</span>
              </button>
            </form>

            {aviso && (
              <div role="status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '5px 8px 5px 16px', background: aviso.ok ? 'rgba(62,142,142,0.10)' : 'rgba(176,82,46,0.10)', borderBottom: `1px solid ${C.line}` }}>
                <span style={{ flex: '1 1 180px', minWidth: 0, fontSize: 12.5, fontWeight: 700, color: aviso.ok ? '#2E6E6E' : '#B0522E' }}>{aviso.ok ? '✓ ' : ''}{aviso.texto}</span>
                {aviso.abrir && <button type="button" className="cp-btn" onClick={() => ir(aviso.abrir!.href, aviso.abrir!.recien)} style={avisoBtn}>{aviso.abrir.label} →</button>}
                {aviso.deshacer && <button type="button" className="cp-btn" onClick={() => { const d = aviso.deshacer!; setAviso(null); d() }} style={avisoBtn}>Deshacer</button>}
                <button type="button" className="cp-btn" onClick={() => setAviso(null)} aria-label="Quitar aviso" style={{ ...avisoBtn, color: C.muted, padding: '0 10px' }}>×</button>
              </div>
            )}

            <div style={{ maxHeight: '58vh', overflowY: 'auto', overscrollBehavior: 'contain', padding: 8 }}>
              {modo.tipo === 'tarea' && captura && (
                <div onMouseEnter={() => setSel(0)} style={{ borderRadius: 11, padding: '2px 2px 8px', marginBottom: 4, background: sel === 0 ? 'rgba(194,147,58,0.12)' : 'rgba(15,35,64,0.03)' }}>
                  <button type="button" className="cp-fila" onMouseDown={sinBlur} onClick={crearTarea} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', cursor: busy ? 'progress' : 'pointer', border: 'none', borderRadius: 9, padding: 8, background: 'transparent', fontFamily: 'inherit' }}>
                    <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305', fontWeight: 800, fontSize: 14 }}>+</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.goldDk }}>{busy ? 'Creando…' : 'Crear tarea'}</span>
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: captura.titulo ? C.ink : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{captura.titulo || 'Escribe qué hay que hacer…'}</span>
                    </span>
                    <span className="ep-hide-sm" style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: C.muted, border: '1px solid rgba(15,35,64,0.14)', borderRadius: 6, padding: '2px 6px' }}>↵</span>
                  </button>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 8px 0 39px' }}>
                    {!captura.epicaId && (
                      <span className="cp-chip" title="Épica por defecto · escribe @ para elegir otra" style={{ ...chip, background: 'rgba(15,35,64,0.05)', color: 'rgba(20,35,61,0.62)' }}>
                        {destino ? <><Punto color={colorDestino} />{destino.name}</> : errEp ? 'No cargaron tus épicas' : 'Cargando épicas…'}
                      </span>
                    )}
                    {chips.map(tk => tk.reconocido ? (
                      <span key={`${tk.pos}-${tk.tipo}`} className="cp-chip"
                        style={{ ...chip, padding: '0 2px 0 10px', gap: 4, background: tk.tipo === 'prioridad' && captura.prioridad === 'alta' ? 'rgba(176,82,46,0.12)' : 'rgba(194,147,58,0.15)', color: tk.tipo === 'prioridad' && captura.prioridad === 'alta' ? '#B0522E' : '#7A5A1E' }}>
                        {tk.tipo === 'epica' ? <Punto color={colorDestino} /> : <span aria-hidden="true" style={{ opacity: 0.8 }}>{ICONO_TOKEN[tk.tipo]}</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{tk.etiqueta}</span>
                        {(tk.tipo === 'plan' || tk.tipo === 'estimado') && (
                          <button type="button" className="cp-chip-btn" onMouseDown={sinBlur} onClick={() => editarToken(tk, 'texto')} aria-label={`Dejar «${tk.texto}» como texto del título`}
                            style={{ ...chipBtn, fontSize: 10.5, fontWeight: 800, padding: '0 6px', textDecoration: 'underline', textUnderlineOffset: 2 }}>es texto</button>
                        )}
                        <button type="button" className="cp-chip-btn" onMouseDown={sinBlur} onClick={() => editarToken(tk, 'quitar')} aria-label={`Quitar ${tk.etiqueta}`}
                          style={{ ...chipBtn, fontSize: 14 }}>×</button>
                      </span>
                    ) : (
                      <span key={`${tk.pos}-${tk.tipo}`} className="cp-chip" title="No lo reconocí: se queda en el título" style={{ ...chip, border: '1px dashed rgba(15,35,64,0.22)', color: C.muted }}>
                        ? {tk.etiqueta}
                      </span>
                    ))}
                  </div>
                  {!modo.resto.trim() && (
                    <div style={{ padding: '8px 8px 0 39px', fontSize: 11.5, color: C.muted, lineHeight: 1.65 }}>
                      {k('@')}épica · {k('#')}feature o iniciativa · {k('hoy')}, mañana, vie, 15/10 · {k('!!')} alta, !baja · {k('30m')}, 1h30 · {k('vence:')}20/10
                    </div>
                  )}
                </div>
              )}

              {filas.map((f, i) => {
                const idx = i + base
                const header = f.grupo !== grupoPrevio ? f.grupo : ''
                grupoPrevio = f.grupo
                const viejo = i >= elegibles
                return (
                  <Fragment key={f.key}>
                    {header && <div style={{ padding: '8px 10px 4px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.4)', opacity: viejo ? 0.5 : 1 }}>{header}</div>}
                    <button type="button" className="cp-fila" disabled={viejo} tabIndex={viejo ? -1 : undefined} onClick={() => elegir(idx)} onMouseEnter={viejo ? undefined : () => setSel(idx)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', cursor: viejo ? 'default' : 'pointer', border: 'none', borderRadius: 9, padding: '9px 10px', background: !viejo && sel === idx ? 'rgba(194,147,58,0.12)' : 'transparent', fontFamily: 'inherit', opacity: viejo ? 0.45 : 1 }}>
                      {f.nodo}
                    </button>
                  </Fragment>
                )
              })}

              {loading && !previos && hint('Buscando…')}
              {!loading && vigentes?.error && hint('No se pudo buscar. Revisa tu conexión e intenta otra vez.')}
              {!loading && modo.tipo === 'buscar' && sinResultados && hint(<>Nada que coincida con «{q.trim()}».</>)}
              {modo.tipo === 'buscar' && q.trim().length < 2 && hint(<>Escribe al menos 2 letras · busca tareas, features, iniciativas, ideas y accesos.<br />{k('+')} crea una tarea · {k('idea')} … guarda una idea · {k('peso')} 82.4 registra tu peso de hoy</>)}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

const chip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', maxWidth: '100%' }
const chipBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'inherit', borderRadius: 999, padding: 0, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1, opacity: 0.7 }
const avisoBtn: CSSProperties = { border: 'none', background: 'transparent', borderRadius: 8, padding: '0 10px', fontSize: 12.5, fontWeight: 800, color: C.goldDk, cursor: 'pointer', fontFamily: 'inherit' }

function Punto({ color }: { color?: string }) {
  return <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: color || '#8b8379', flexShrink: 0, display: 'inline-block' }} />
}
function Glifo({ color, children }: { color?: string; children: ReactNode }) {
  return <span aria-hidden="true" style={{ fontSize: 12, width: 14, textAlign: 'center', flexShrink: 0, color: color || 'inherit' }}>{children}</span>
}
function FilaHit({ marca, titulo, meta, hecho }: { marca: ReactNode; titulo: string; meta?: string; hecho?: boolean }) {
  return (
    <>
      {marca}
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: hecho ? 'rgba(20,35,61,0.4)' : C.ink, textDecoration: hecho ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</span>
      {meta && <span style={{ flexShrink: 0, maxWidth: '42%', fontSize: 11, color: 'rgba(20,35,61,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>}
    </>
  )
}
function FilaAccion({ icono, titulo, detalle }: { icono: string; titulo: string; detalle?: string }) {
  return (
    <>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(194,147,58,0.16)', fontSize: 13 }}>{icono}</span>
      <span style={{ flexShrink: 0, fontSize: 13.5, fontWeight: 800, color: C.goldDk }}>{titulo}</span>
      {detalle && <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detalle}</span>}
    </>
  )
}
