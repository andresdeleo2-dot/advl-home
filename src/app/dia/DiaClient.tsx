'use client'

import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import type { Epica, EpicaMilestone, EpicaTask } from '@/lib/supabase'
import { todayISO, uid, completeRecurring, WEEK_EST_MIN } from '@/components/epicas/core'
import { waNumero } from '@/lib/cumple'
import { useDictado, juntar } from '@/lib/useDictado'
import { Preguntale, SaludDia, TuSemana, type PanelExtra, type Gente } from '@/app/panel/PanelDia'
import { Bandeja, itemsDe, type CamposTarea, type AccionesBandeja } from './Bandeja'
import {
  obsidianUrl, saludEpicas, esperandoAOtros, racha, sumarDias, resolverPlan, diasHasta, textoRecordatorio,
  type DiaGet, type DiaData, type DiaTarjeta, type DiaDecision, type DiaPrioridad, type DiaRespuesta, type EstadoRespuesta, type SaludEpica, type DiaAprendido, type CerebroDatos, type CerebroTarea, type DiaSalud,
} from '@/lib/dia'

/* La ficha de una tarea es LA MISMA que en Épicas y el Roadmap (resumen, feature, fechas, subtareas, bitácora,
   Comenzar/Terminar…): se monta Épicas en «modo ficha», encima de Mi día, sin salir de aquí. Carga perezosa;
   si la descarga falla, se manda a Épicas con la tarea abierta. */
type FichaProps = { initialEpics: Epica[]; ficha: { eId: string; tid: string; onClose: (escrituras?: Promise<unknown>) => void } }
const FichaEpicas = lazy<React.ComponentType<FichaProps>>(() => import('@/components/EpicasDashboard')
  .then(m => ({ default: m.default as unknown as React.ComponentType<FichaProps> }))
  .catch(() => ({ default: ({ ficha }: FichaProps) => { if (typeof window !== 'undefined') window.location.assign(`/epicas?e=${ficha.eId}&t=${ficha.tid}`); return null } })))

/* ── Utilidades ── */
/** ¿La ventana es de al menos `min` px? (para acomodar columnas). En el servidor, no. */
function useAncho(min: number) {
  const [si, setSi] = useState(false)
  useEffect(() => {
    const m = window.matchMedia(`(min-width:${min}px)`); const f = () => setSi(m.matches); f()
    m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [min])
  return si
}
const DN = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DN3 = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const MN = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaDe = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
const diaLargo = (iso: string) => { const d = fechaDe(iso); return `${DN[d.getDay()]} ${d.getDate()} de ${MN[d.getMonth()]}` }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** El día que estás viviendo: hasta las 3:00 (cuando corre el cierre) sigue siendo ayer. */
const diaVivido = () => (new Date().getHours() < 3 ? sumarDias(todayISO(), -1) : todayISO())
/** Hecha hoy: terminada, o recurrente que hoy cumpliste (sigue abierta porque ya pasó a su siguiente fecha). */
const hechaHoy = (t: EpicaTask, hoy: string) => !ABIERTA(t) || !!t.repeatDone?.includes(hoy)
const RITUAL_KEY = 'dia.ritual.v1'
const ponerLS = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }
const enDias = (n: number) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : n < 0 ? `hace ${-n} días` : `en ${n} días`)
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
type TipoCaptura = 'nota' | 'inbox' | 'cierre' | 'pregunta' | 'tarea'
type PlanRapido = '' | 'hoy' | 'manana'
const ABIERTA = (t?: EpicaTask | null) => !!t && t.status !== 'Terminada' && t.status !== 'Archivada'
const milTokens = (n?: number | null) => (n == null ? null : n >= 1000 ? `${Math.round(n / 100) / 10} mil tokens` : `${n} tokens`)

async function postJSON<T = { ok: boolean; error?: string }>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({ ok: false, error: `error ${r.status}` }))
  return j as T
}

type Modo = 'ritual' | 'tus3' | 'hoy' | 'noche' | 'semana' | 'boveda'   // ritual = bandeja «Por decidir»; tus3 = elegir tus 3
type Cumple = { id: string; nombre: string; apodo?: string | null; cumple: string; celular?: string | null }
type Evento = { id?: string; title?: string; start: string; end?: string; allDay?: boolean }
type Aviso = { texto: string; deshacer?: () => void } | null

/* ── Página ── */
export default function DiaClient() {
  // Hasta las 3:00 (cuando corre el cierre) sigues en «ayer»: cerrar el día a la 1:00 lo guarda en el día que viviste.
  const [, setTick] = useState(0)
  const hoy = diaVivido()
  const [dia, setDia] = useState<DiaGet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [epicas, setEpicas] = useState<Epica[] | null>(null)
  const [cumples, setCumples] = useState<Cumple[]>([])
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [saludHoy, setSaludHoy] = useState<boolean | null>(null)
  const [extra, setExtra] = useState<PanelExtra | null>(null)   // salud y personas sin verse (lo que antes era el Panel)
  const [modo, setModo] = useState<Modo>('hoy')
  const [modoElegido, setModoElegido] = useState(false)
  const [fecha, setFecha] = useState(hoy)            // el día que estás viendo (tira de la semana)
  const [diaOtro, setDiaOtro] = useState<DiaGet | null>(null)
  // Tus 3 de ayer: lo que no hiciste de ahí sale hoy en «Quedó pendiente».
  const [ayerPri, setAyerPri] = useState<DiaPrioridad[]>([])
  useEffect(() => {
    let vivo = true
    fetch(`/api/dia?fecha=${sumarDias(hoy, -1)}`).then(r => r.json()).then(j => { if (vivo && j?.ok) setAyerPri((j as DiaGet).resumen?.data?.prioridades || []) }).catch(() => {})
    return () => { vivo = false }
  }, [hoy])
  const [aviso, setAviso] = useState<Aviso>(null)
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostrarAviso = useCallback((a: Aviso) => {
    setAviso(a)
    if (avisoTimer.current) clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(null), a?.deshacer ? 6000 : 3500)
  }, [])

  const cargarDia = useCallback(async () => {
    try {
      const r = await fetch(`/api/dia?fecha=${hoy}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'No se pudo leer tu día')
      setDia(j as DiaGet); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [hoy])
  const cargarEpicas = useCallback(async (): Promise<Epica[] | null> => {
    try { const j = await (await fetch('/api/epicas')).json(); if (j?.ok) { setEpicas(j.data as Epica[]); return j.data as Epica[] } } catch { /* se queda lo anterior */ }
    return null
  }, [])
  // Tablero de una épica (pop-up), antes de ir a Épicas.
  const [epicaPop, setEpicaPop] = useState<string | null>(null)
  // Ficha completa de una tarea, abierta encima de Mi día (sin irse a Épicas).
  const [ficha, setFicha] = useState<{ eId: string; tid: string; epics: Epica[] } | null>(null)
  const cerrarFicha = useCallback((escrituras?: Promise<unknown>) => {
    setFicha(null)
    // Se relee DESPUÉS de que lo que cambiaste en la ficha llegó al servidor (si no, se vería el valor viejo).
    Promise.resolve(escrituras).catch(() => {}).then(() => cargarEpicas())
  }, [cargarEpicas])

  useEffect(() => {
    cargarDia(); cargarEpicas()
    fetch('/api/cumples').then(r => r.json()).then(j => { if (j?.ok) setCumples(j.personas || []) }).catch(() => {})
    fetch('/api/panel').then(r => r.json()).then(j => { if (j?.ok) setExtra(j as PanelExtra) }).catch(() => {})
    fetch('/api/calendar').then(r => r.json()).then(j => setEventos(Array.isArray(j) ? j : Array.isArray(j?.events) ? j.events : [])).catch(() => setEventos([]))
    // Salud: ¿ya anotaste hoy en /peso? Solo si usas el diario (hay días anotados).
    fetch('/api/peso/diario').then(r => r.json()).then(j => {
      if (!j?.ok || !j.disponible || !Array.isArray(j.dias) || !j.dias.length) return
      const d = j.dias.find((x: { fecha: string }) => x.fecha === hoy)
      setSaludHoy(!!d && ((d.comidas || []).some((c: { items?: unknown[] }) => (c.items || []).length) || (d.ejercicio || []).length > 0))
    }).catch(() => {})
  }, [cargarDia, cargarEpicas, hoy])

  // Otro día (pasado o futuro): su resumen y su calificación, solo para ver.
  useEffect(() => {
    if (fecha === hoy) { setDiaOtro(null); return }
    let vivo = true
    setDiaOtro(null)
    fetch(`/api/dia?fecha=${fecha}`).then(r => r.json()).then(j => { if (vivo && j?.ok) setDiaOtro(j as DiaGet) }).catch(() => {})
    return () => { vivo = false }
  }, [fecha, hoy])

  // La página puede quedarse abierta horas (app del iPhone, pestaña de la Mac): al volver se recalcula «hoy» y se
  // relee el día y las épicas, para no marcar con la fecha de ayer ni chocar con lo que cambiaste en otro lado.
  const recargar = useRef<() => void>(() => {})
  recargar.current = () => { cargarDia(); cargarEpicas() }
  useEffect(() => {
    let ultima = Date.now()
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      setTick(t => t + 1)
      if (Date.now() - ultima > 60_000) { ultima = Date.now(); recargar.current() }
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    const iv = setInterval(() => setTick(t => t + 1), 5 * 60_000)
    return () => { document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('focus', alVolver); clearInterval(iv) }
  }, [])
  // Si cambió el día mientras veías «hoy», sigues viendo el nuevo hoy.
  const hoyPrevio = useRef(hoy)
  useEffect(() => {
    if (hoyPrevio.current === hoy) return
    setFecha(f => (f === hoyPrevio.current ? hoy : f))
    hoyPrevio.current = hoy
  }, [hoy])

  const data: DiaData | null = dia?.resumen?.data ?? null
  const respuestas = useMemo(() => new Map((dia?.respuestas || []).map(r => [r.item_id, r])), [dia])

  // Siempre abre en Hoy. De noche (20:00 a 3:00) abre en Cerrar día, si todavía no lo cierras.
  useEffect(() => {
    if (!dia || modoElegido) return
    const cerrado = dia.cierres.some(c => c.fecha === hoy && c.calificacion != null)
    const h = new Date().getHours()
    if ((h >= 20 || h < 3) && !cerrado) setModo('noche')
  }, [dia, hoy, modoElegido])
  // ?modo=noche|semana|boveda|hoy: otras secciones (Tiempo, Épicas, avisos) abren directo esa vista.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('modo')
      if (q === 'noche' || q === 'semana' || q === 'boveda' || q === 'hoy') { setModo(q); setModoElegido(true) }
      if (q) window.history.replaceState({}, '', '/dia')
    } catch { /* sin URL */ }
  }, [])
  const ir = (m: Modo) => { setModo(m); setModoElegido(true); if (m !== 'semana' && m !== 'boveda') setFecha(hoy); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const verDia = (f: string) => { setFecha(f); if (f === hoy) setModo(m => (m === 'ritual' ? 'hoy' : m)); else setModo('hoy'); setModoElegido(true) }

  /* ── Escritura de tareas (mismo endpoint y candado de choques que Épicas) ── */
  const todas = useMemo(() => {
    const m = new Map<string, { e: Epica; t: EpicaTask }>()
    for (const e of epicas || []) for (const t of e.tasks || []) if (t.id) m.set(t.id, { e, t })
    return m
  }, [epicas])

  const abrirTarea = useCallback((tid: string) => {
    const hit = todas.get(tid)
    if (hit && epicas) setFicha({ eId: hit.e.id, tid, epics: epicas })
  }, [todas, epicas])

  const sync = useCallback(async (epicaId: string, cambios: { create?: EpicaTask[]; update?: EpicaTask[]; remove?: string[] }) => {
    const j = await postJSON<{ ok: boolean; error?: string; conflicts?: string[] }>('/api/tareas/sync', { epicaId, create: cambios.create || [], update: cambios.update || [], remove: cambios.remove || [] })
    if (!j.ok) throw new Error(j.error || 'No se pudo guardar la tarea')
    if (j.conflicts?.length) throw new Error('Esa tarea cambió en otra pestaña. Recarga y vuelve a intentar.')
  }, [])

  const epicaDelDiario = useCallback(async (): Promise<string> => {
    const ya = (epicas || []).find(e => !e.archived && e.name.trim().toLowerCase() === 'del diario')
    if (ya) return ya.id
    const j = await postJSON<{ ok: boolean; error?: string; data?: { id: string } }>('/api/epicas', { name: 'Del diario', color: '#8a4b28', status: 'En curso', description: 'Pendientes que salen de tu diario de Obsidian y que no tienen épica clara.' })
    if (!j.ok || !j.data?.id) throw new Error(j.error || 'No se pudo crear la épica «Del diario»')
    return j.data.id
  }, [epicas])

  const responder = useCallback(async (itemId: string, tipo: string, estado: EstadoRespuesta, extra?: { respuesta?: unknown; tareaId?: string }) => {
    const j = await postJSON('/api/dia', { accion: 'responder', fecha: hoy, itemId, tipo, estado, ...extra })
    if (!j.ok) throw new Error(j.error || 'No se guardó tu respuesta')
    setDia(d => d ? { ...d, respuestas: [...d.respuestas.filter(r => r.item_id !== itemId), { item_id: itemId, tipo, estado, respuesta: extra?.respuesta, tarea_id: extra?.tareaId ?? null }] } : d)
  }, [hoy])
  const deshacerRespuesta = useCallback(async (itemId: string) => {
    const j = await postJSON('/api/dia', { accion: 'responder', fecha: hoy, itemId, estado: 'descartada', deshacer: true })
    if (!j.ok) throw new Error(j.error || 'No se pudo deshacer')
    setDia(d => d ? { ...d, respuestas: d.respuestas.filter(r => r.item_id !== itemId) } : d)
  }, [hoy])

  /** Crea la tarea de una tarjeta «nuevo» en su épica (o en «Del diario»). Devuelve su id. */
  const crearDeTarjeta = useCallback(async (c: DiaTarjeta, plan: string | null): Promise<string> => {
    const epicaId = c.epicaId && (epicas || []).some(e => e.id === c.epicaId && !e.archived) ? c.epicaId : await epicaDelDiario()
    const t: EpicaTask = {
      id: uid(), t: c.cambio?.titulo || c.titulo, status: 'Por hacer', due: '', links: [],
      note: [c.detalle, data?.diario ? `De tu diario del ${diaLargo(data.diario)}.` : ''].filter(Boolean).join(' '),
      createdAt: hoy,
    }
    if (plan) t.plan = plan
    if (c.cambio?.prioridad) t.priority = c.cambio.prioridad
    await sync(epicaId, { create: [t] })
    return t.id!
  }, [epicas, epicaDelDiario, sync, hoy, data])

  /** Aplica el cambio de una tarjeta a su tarea existente. */
  const aplicarCambio = useCallback(async (c: DiaTarjeta) => {
    const hit = c.tareaId ? todas.get(c.tareaId) : undefined
    if (!hit) throw new Error('Ya no encuentro esa tarea en tus épicas')
    let t: EpicaTask = { ...hit.t }
    const k = c.cambio || {}
    if (k.titulo) t.t = k.titulo
    if (k.prioridad) t.priority = k.prioridad
    if (k.plan) t.plan = resolverPlan(k.plan, hoy)
    if (k.archivar) t.status = 'Archivada'
    else if (k.estado === 'Terminada') t = completeRecurring(t, hoy, () => 0)
    else if (k.estado) t.status = k.estado
    await sync(hit.e.id, { update: [t] })
  }, [todas, sync, hoy])

  /** Respuesta a una tarjeta de Decide. que: si | otro (con fecha) | no. */
  const decidirTarjeta = useCallback(async (c: DiaTarjeta, que: 'si' | 'otro' | 'no', cuando?: string | null, destino?: string) => {
    try {
      if (que === 'no') { await responder(c.id, c.tipo, 'descartada'); return }
      if (c.tipo === 'mover') {
        await responder(c.id, c.tipo, 'aceptada', { respuesta: { destino: destino || c.destino } })
        return
      }
      if (c.tipo === 'nuevo') {
        const plan = que === 'si' ? resolverPlan(c.cambio?.plan || 'hoy', hoy) : (cuando ?? null)
        const id = await crearDeTarjeta(c, plan)
        await responder(c.id, c.tipo, que === 'si' ? 'aceptada' : 'pospuesta', { tareaId: id, respuesta: { plan } })
      } else if (que === 'si') {
        await aplicarCambio(c)
        await responder(c.id, c.tipo, 'aceptada', { tareaId: c.tareaId })
      } else {
        await responder(c.id, c.tipo, 'pospuesta', { respuesta: { hasta: cuando || sumarDias(hoy, 3) } })
      }
      cargarEpicas()
    } catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }); throw e }
  }, [responder, crearDeTarjeta, aplicarCambio, hoy, cargarEpicas, mostrarAviso])

  /** Marca una tarea como hecha (o la reabre). */
  const enCurso = useRef(new Set<string>())   // candado contra el doble toque (crearía o reabriría de más)
  const toggleHecha = useCallback(async (tareaId: string) => {
    const hit = todas.get(tareaId); if (!hit || enCurso.current.has(tareaId)) return
    enCurso.current.add(tareaId)
    const hecha = hechaHoy(hit.t, hoy)
    const t: EpicaTask = !hecha ? completeRecurring(hit.t, hoy, () => 0)
      // Recurrente que ya cumpliste hoy: sigue abierta (se movió a la siguiente fecha); reabrir la devuelve a hoy.
      : ABIERTA(hit.t) ? { ...hit.t, plan: hoy, repeatDone: (hit.t.repeatDone || []).filter(d => d !== hoy) }
      : { ...hit.t, status: hit.t.planPrev && hit.t.planPrev !== 'Terminada' ? hit.t.planPrev : 'Por hacer', doneAt: undefined }
    // Optimista: que se vea al instante.
    setEpicas(es => es ? es.map(e => e.id !== hit.e.id ? e : { ...e, tasks: e.tasks.map(x => x.id === tareaId ? t : x) }) : es)
    try { await sync(hit.e.id, { update: [t] }); cargarEpicas() }
    catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }); cargarEpicas() }
    finally { enCurso.current.delete(tareaId) }
  }, [todas, hoy, sync, cargarEpicas, mostrarAviso])

  /** Palomita de una tarea suelta (Quedó pendiente, También agendado hoy…): queda terminada y sale de la lista,
   *  con «Deshacer» por si fue sin querer. Si ya estaba hecha hoy, la reabre. */
  const terminarTarea = useCallback(async (tareaId: string) => {
    const hit = todas.get(tareaId); if (!hit || enCurso.current.has(tareaId)) return
    if (!ABIERTA(hit.t) || hechaHoy(hit.t, hoy)) return toggleHecha(tareaId)
    enCurso.current.add(tareaId)
    const t = completeRecurring(hit.t, hoy, () => 0)
    setEpicas(es => es ? es.map(e => e.id !== hit.e.id ? e : { ...e, tasks: e.tasks.map(x => x.id === tareaId ? t : x) }) : es)
    try {
      await sync(hit.e.id, { update: [t] }); cargarEpicas()
      mostrarAviso({ texto: `Hecha: ${hit.t.t}`, deshacer: () => { sync(hit.e.id, { update: [hit.t] }).then(() => cargarEpicas()).catch(() => {}) } })
    } catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }); cargarEpicas() }
    finally { enCurso.current.delete(tareaId) }
  }, [todas, hoy, toggleHecha, sync, cargarEpicas, mostrarAviso])

  /** «＋ Agregar tarea» del tablero de una épica (con el feature/iniciativa que tengas filtrado). */
  const crearEnEpica = useCallback(async (epicaId: string, titulo: string, extra: { featureId?: string; iniciativaId?: string; plan?: string }): Promise<string | null> => {
    const t: EpicaTask = { id: uid(), t: titulo.slice(0, 200), status: 'Por hacer', due: '', links: [], note: '', createdAt: hoy }
    if (extra.featureId) t.featureId = extra.featureId
    if (extra.iniciativaId) t.iniciativaId = extra.iniciativaId
    if (extra.plan) t.plan = extra.plan
    setEpicas(es => es ? es.map(e => e.id !== epicaId ? e : { ...e, tasks: [...(e.tasks || []), t] }) : es)
    try { await sync(epicaId, { create: [t] }); cargarEpicas(); mostrarAviso({ texto: `Agregada: ${t.t}` }); return t.id! }
    catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }); cargarEpicas(); return null }
  }, [hoy, sync, cargarEpicas, mostrarAviso])

  /** Cerrar día: lo que no hiciste se mueve ya (mañana u otro día) o se suelta del plan. */
  const reprogramar = useCallback(async (tareaId: string, plan: string | null) => {
    const hit = todas.get(tareaId); if (!hit) return
    const t: EpicaTask = { ...hit.t }
    if (plan) { t.plan = plan; delete t.planOrder } else { delete t.plan; delete t.planOrder }
    setEpicas(es => es ? es.map(e => e.id !== hit.e.id ? e : { ...e, tasks: e.tasks.map(x => x.id === tareaId ? t : x) }) : es)
    try { await sync(hit.e.id, { update: [t] }); cargarEpicas(); mostrarAviso({ texto: plan ? `«${t.t}» pasó al ${diaLargo(plan)}` : `«${t.t}» ya no está agendada`, deshacer: () => { sync(hit.e.id, { update: [hit.t] }).then(cargarEpicas).catch(() => {}) } }) }
    catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }); cargarEpicas() }
  }, [todas, sync, cargarEpicas, mostrarAviso])

  /** Varias de golpe («Quedó pendiente › De antes»): todas a una fecha o fuera del plan. Con deshacer. */
  const moverVarias = useCallback(async (ids: string[], plan: string | null) => {
    const porEpica = new Map<string, { nuevas: EpicaTask[]; viejas: EpicaTask[] }>()
    for (const id of ids) {
      const hit = todas.get(id); if (!hit) continue
      const t: EpicaTask = { ...hit.t }
      if (plan) t.plan = plan; else delete t.plan
      delete t.planOrder
      const g = porEpica.get(hit.e.id) || { nuevas: [], viejas: [] }
      g.nuevas.push(t); g.viejas.push(hit.t); porEpica.set(hit.e.id, g)
    }
    try {
      for (const [eid, g] of porEpica) await sync(eid, { update: g.nuevas })
      cargarEpicas()
      mostrarAviso({ texto: plan ? `${ids.length} tareas pasaron al ${diaLargo(plan)}` : `${ids.length} tareas ya no están agendadas (siguen en su épica)`, deshacer: () => { Promise.all([...porEpica].map(([eid, g]) => sync(eid, { update: g.viejas }))).then(cargarEpicas).catch(() => {}) } })
    } catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }); cargarEpicas() }
  }, [todas, sync, cargarEpicas, mostrarAviso])

  /* ── Tus 3 de hoy ── */
  const prioridades: DiaPrioridad[] = useMemo(() => {
    const base = data?.prioridades || []
    const orden = (respuestas.get('prioridades')?.respuesta as { orden?: number[] } | undefined)?.orden
    if (orden?.length && orden.every(i => base[i])) return orden.map(i => base[i])
    return base
  }, [data, respuestas])

  const tareaDePrioridad = useCallback((p: DiaPrioridad): { e: Epica; t: EpicaTask } | null => {
    if (p.tareaId && todas.get(p.tareaId)) return todas.get(p.tareaId)!
    if (p.itemId) { const r = respuestas.get(p.itemId); if (r?.tarea_id && todas.get(r.tarea_id)) return todas.get(r.tarea_id)! }
    return null
  }, [todas, respuestas])

  // Sin día armado: tus tareas agendadas para hoy (mismo criterio que Panel).
  const tresDeRespaldo = useMemo(() => {
    const out: { e: Epica; t: EpicaTask }[] = []
    for (const e of epicas || []) for (const t of e.tasks || []) if (ABIERTA(t) && (t.plan === hoy || t.dayPlans?.some(d => d.day === hoy))) out.push({ e, t })
    const pr = (p?: string) => (p === 'alta' ? 0 : p === 'baja' ? 2 : 1)
    return out.sort((a, b) => pr(a.t.priority) - pr(b.t.priority) || (a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9)).slice(0, 3)
  }, [epicas, hoy])

  const empezarDia = useCallback(async (orden: number[]) => {
    try {
      const lista = orden.map(i => prioridades[i]).filter(Boolean)
      const porEpica = new Map<string, EpicaTask[]>()
      for (const [n, p] of lista.entries()) {
        let hit = tareaDePrioridad(p)
        if (!hit && p.itemId) {
          const c = data?.tarjetas.find(x => x.id === p.itemId)
          if (c && !respuestas.get(c.id)) { await decidirTarjeta(c, 'si'); continue }
        }
        if (!hit || !ABIERTA(hit.t)) continue
        hit = { e: hit.e, t: { ...hit.t, plan: hoy, planOrder: (n + 1) * 1000 } }
        porEpica.set(hit.e.id, [...(porEpica.get(hit.e.id) || []), hit.t])
      }
      for (const [epicaId, update] of porEpica) await sync(epicaId, { update })
      await responder('prioridades', 'prioridades', 'respondida', { respuesta: { orden: orden.map(i => (data?.prioridades || []).indexOf(prioridades[i])) } })
      ponerLS(RITUAL_KEY, JSON.stringify({ fecha: hoy }))
      cargarEpicas()
      ir('hoy')
    } catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prioridades, tareaDePrioridad, data, respuestas, decidirTarjeta, sync, responder, hoy, cargarEpicas, mostrarAviso])

  const capturar = useCallback(async (texto: string, tipo: TipoCaptura = 'nota') => {
    const j = await postJSON('/api/dia', { accion: 'captura', fecha: hoy, tipo, texto })
    if (!j.ok) throw new Error(j.error || 'No se guardó')
    setDia(d => d ? { ...d, capturasPendientes: d.capturasPendientes + 1 } : d)
  }, [hoy])

  /** «＋ Tarea» del cuadro Anotar: crea la tarea YA en su épica (o en «Del diario») y deja el rastro
   *  en la nota del día de Obsidian (captura tipo «tarea»), para que Claude no la vuelva a proponer. */
  const crearRapida = useCallback(async (titulo: string, epicaSel: string, cuando: PlanRapido): Promise<string> => {
    const epicaId = epicaSel && (epicas || []).some(e => e.id === epicaSel && !e.archived) ? epicaSel : await epicaDelDiario()
    const nombre = (epicas || []).find(e => e.id === epicaId)?.name || 'Del diario'
    const plan = cuando === 'hoy' ? hoy : cuando === 'manana' ? sumarDias(hoy, 1) : ''
    const t: EpicaTask = { id: uid(), t: titulo.slice(0, 200), status: 'Por hacer', due: '', links: [], note: 'Anotada en Mi día.', createdAt: hoy }
    if (plan) t.plan = plan
    await sync(epicaId, { create: [t] })
    // La tarea ya quedó; si falla el rastro para Obsidian no se pierde nada.
    try { await capturar(`Tarea nueva en «${nombre}»${plan ? ` (agendada ${diaLargo(plan)})` : ''}: ${titulo}`, 'tarea') } catch { /* solo el rastro */ }
    cargarEpicas()
    return nombre
  }, [epicas, epicaDelDiario, hoy, sync, capturar, cargarEpicas])
  const calificar = useCallback(async (n: number) => {
    const j = await postJSON('/api/dia', { accion: 'cierre', fecha: hoy, calificacion: n })
    if (!j.ok) throw new Error(j.error || 'No se guardó la calificación')
    setDia(d => d ? { ...d, cierres: [...d.cierres.filter(c => c.fecha !== hoy), { fecha: hoy, calificacion: n }] } : d)
  }, [hoy])

  /* ── Bandeja «Por decidir»: aceptar con épica/feature/iniciativa/fechas, decisiones y preguntas ── */
  /** Crea un feature en la épica (POST /api/features) y devuelve su id. */
  const crearFeature = useCallback(async (epicaId: string, nombre: string): Promise<string> => {
    const id = uid()
    const j = await postJSON<{ ok: boolean; error?: string; needsMigration?: boolean }>('/api/features', { id, epicaId, t: nombre.slice(0, 160) })
    if (!j.ok) throw new Error(j.needsMigration ? 'Tu base todavía no tiene features (falta sql/epicas-18).' : j.error || 'No se pudo crear el feature')
    return id
  }, [])
  /** Crea una tarea o un feature con lo que pusiste en la ficha. Devuelve ids. */
  const crearConCampos = useCallback(async (k: CamposTarea, origen: string): Promise<{ tareaId?: string; featureId?: string; epicaId: string }> => {
    const epicaId = k.epicaId && (epicas || []).some(e => e.id === k.epicaId && !e.archived) ? k.epicaId : await epicaDelDiario()
    if (k.comoFeature) return { featureId: await crearFeature(epicaId, k.titulo.trim()), epicaId }
    const t: EpicaTask = { id: uid(), t: k.titulo.trim().slice(0, 200), status: 'Por hacer', due: k.vence || '', links: [], createdAt: hoy,
      note: [k.nota.trim(), origen].filter(Boolean).join(' ') }
    if (k.plan) t.plan = k.plan
    if (k.prioridad) t.priority = k.prioridad
    if (k.featureId) t.featureId = k.featureId
    if (k.iniciativaId) t.iniciativaId = k.iniciativaId
    await sync(epicaId, { create: [t] })
    return { tareaId: t.id, epicaId }
  }, [epicas, epicaDelDiario, crearFeature, sync, hoy])

  const accBandeja: AccionesBandeja = useMemo(() => ({
    aceptar: async (c, k, destino) => {
      if (c.tipo === 'mover') { await responder(c.id, c.tipo, 'aceptada', { respuesta: { destino: destino || c.destino } }); return }
      if (!k) { await decidirTarjeta(c, 'si'); return }
      if (c.tipo === 'nuevo') {
        const r = await crearConCampos(k, data?.diario ? `De tu diario del ${diaLargo(data.diario)}.` : '')
        await responder(c.id, c.tipo, 'aceptada', { tareaId: r.tareaId, respuesta: { plan: k.plan || null, featureId: r.featureId } })
        // «Guardar tarea»: enseguida su ficha completa, aquí mismo, para terminar de llenarla (estimado, subtareas…).
        if (r.tareaId) {
          const es = await cargarEpicas()
          if (es?.some(e => e.id === r.epicaId && e.tasks?.some(t => t.id === r.tareaId))) setFicha({ eId: r.epicaId, tid: r.tareaId, epics: es })
        }
        return
      } else {
        const hit = c.tareaId ? todas.get(c.tareaId) : undefined
        if (!hit) throw new Error('Ya no encuentro esa tarea en tus épicas')
        let t: EpicaTask = { ...hit.t, t: k.titulo.trim() || hit.t.t, due: k.vence || '' }
        if (k.plan) t.plan = k.plan; else delete t.plan
        if (k.prioridad) t.priority = k.prioridad
        t.featureId = k.featureId || undefined; t.iniciativaId = k.iniciativaId || undefined
        if (k.nota.trim()) t.note = [t.note, k.nota.trim()].filter(Boolean).join(' ')
        if (c.cambio?.archivar) t.status = 'Archivada'
        else if (c.cambio?.estado === 'Terminada') t = completeRecurring(t, hoy, () => 0)
        else if (c.cambio?.estado) t.status = c.cambio.estado
        const destinoEpica = k.epicaId && k.epicaId !== hit.e.id && (epicas || []).some(e => e.id === k.epicaId) ? k.epicaId : hit.e.id
        // Cambiar de épica viaja como «create» en la nueva (mismo id): así lo hace Épicas al mover una tarea.
        await sync(destinoEpica, destinoEpica === hit.e.id ? { update: [t] } : { create: [t] })
        await responder(c.id, c.tipo, 'aceptada', { tareaId: c.tareaId })
      }
      cargarEpicas()
    },
    posponer: async (c, f) => { await decidirTarjeta(c, 'otro', f) },
    descartar: async it => { await responder(it.id, it.kind === 'tarjeta' ? it.c.tipo : it.kind, 'descartada') },
    /** «Ya la hice»: la tarea existente queda Terminada; un pendiente nuevo se crea ya terminado (cuenta en tu día). */
    terminar: async c => {
      if (c.tipo === 'nuevo') {
        const epicaId = c.epicaId && (epicas || []).some(e => e.id === c.epicaId && !e.archived) ? c.epicaId : await epicaDelDiario()
        const base: EpicaTask = { id: uid(), t: c.cambio?.titulo || c.titulo, status: 'Por hacer', due: '', links: [], createdAt: hoy,
          note: [c.detalle, data?.diario ? `De tu diario del ${diaLargo(data.diario)}.` : ''].filter(Boolean).join(' ') }
        const t = completeRecurring(base, hoy, () => 0)
        await sync(epicaId, { create: [t] })
        await responder(c.id, c.tipo, 'aceptada', { tareaId: t.id, respuesta: { terminada: true, epicaId, creada: true } })
      } else {
        const hit = c.tareaId ? todas.get(c.tareaId) : undefined
        if (!hit) throw new Error('Ya no encuentro esa tarea en tus épicas')
        if (ABIERTA(hit.t)) await sync(hit.e.id, { update: [completeRecurring(hit.t, hoy, () => 0)] })
        await responder(c.id, c.tipo, 'aceptada', { tareaId: hit.t.id, respuesta: { terminada: true } })
      }
      cargarEpicas()
    },
    deshacer: async id => {
      // Si fue «Ya la hice», también se revierte la tarea: la nueva se borra y la existente se reabre.
      const r = respuestas.get(id)
      const k = (r?.respuesta || {}) as { terminada?: boolean; creada?: boolean; epicaId?: string }
      if (k.terminada && r?.tarea_id) {
        const hit = todas.get(r.tarea_id)
        if (k.creada) { const ep = hit?.e.id || k.epicaId; if (ep) await sync(ep, { remove: [r.tarea_id] }) }
        else if (hit && !ABIERTA(hit.t)) await sync(hit.e.id, { update: [{ ...hit.t, status: hit.t.planPrev && hit.t.planPrev !== 'Terminada' ? hit.t.planPrev : 'Por hacer', doneAt: undefined }] })
        cargarEpicas()
      }
      await deshacerRespuesta(id)
    },
    decidir: async (d, texto, k) => {
      let ids: { tareaId?: string; featureId?: string } = {}
      if (k) { ids = await crearConCampos(k, `Decisión: ${d.pregunta}${texto ? ` → ${texto}` : ''}`); if (!ids.tareaId) cargarEpicas() }
      const txt = texto || (k ? `${k.comoFeature ? 'Feature' : 'Tarea'} creada: ${k.titulo}` : '')
      await responder(d.id, 'decision', 'respondida', { tareaId: ids.tareaId, respuesta: { texto: txt, ...ids } })
      if (ids.tareaId) {
        const es = await cargarEpicas(); const ep = es?.find(e => e.tasks?.some(t => t.id === ids.tareaId))
        if (es && ep) setFicha({ eId: ep.id, tid: ids.tareaId, epics: es })
      }
    },
    contestar: async (q, texto) => { await responder(q.id, 'cerebro', 'respondida', { respuesta: { texto } }) },
  }), [responder, decidirTarjeta, crearConCampos, data, todas, sync, hoy, epicas, cargarEpicas, deshacerRespuesta, epicaDelDiario, respuestas])

  /* ── Pendientes nuevos del diario: se crean SOLOS en su épica (y feature, si alguno le queda) ──
     Andrés no quiere decidir uno por uno: los quiere ya en sus épicas y revisarlos en su ficha (ahí los borra o cambia).
     El id de la tarea sale de la fecha + la tarjeta: si la Mac y el iPhone corren esto a la vez, es la MISMA tarea. */
  const autoHecho = useRef(new Set<string>())
  const [creando, setCreando] = useState(false)
  useEffect(() => {
    if (!dia || !data || !epicas || creando) return
    const nuevas = data.tarjetas.filter(c => c.tipo === 'nuevo' && !respuestas.has(c.id) && !autoHecho.current.has(c.id))
    if (!nuevas.length) return
    nuevas.forEach(c => autoHecho.current.add(c.id))
    setCreando(true)
    ;(async () => {
      try {
        const vivas = epicas.filter(e => !e.archived)
        const porEpica = new Map<string, { c: DiaTarjeta; t: EpicaTask }[]>()
        let delDiario: string | null = null
        for (const c of nuevas) {
          const id = idEstable(`${data.diario || hoy}|${c.id}`)
          const texto = `${c.cambio?.titulo || c.titulo} ${c.detalle || ''}`
          let ep = (c.epicaId && vivas.find(e => e.id === c.epicaId)) || (c.epica && vivas.find(e => e.name.trim().toLowerCase() === c.epica!.trim().toLowerCase())) || sugerirEpica(texto, vivas)
          if (!ep) { delDiario = delDiario || await epicaDelDiario(); ep = vivas.find(e => e.id === delDiario) || null }
          const epicaId = ep?.id || delDiario!
          if (todas.has(id)) { await responder(c.id, c.tipo, 'aceptada', { tareaId: id, respuesta: { auto: true, epicaId } }); continue }
          const t: EpicaTask = { id, t: (c.cambio?.titulo || c.titulo).slice(0, 200), status: 'Por hacer', due: '', links: [], createdAt: hoy,
            note: [c.detalle, data.diario ? `De tu diario del ${diaLargo(data.diario)}.` : ''].filter(Boolean).join(' ') }
          if (c.cambio?.plan) t.plan = resolverPlan(c.cambio.plan, hoy)
          if (c.cambio?.prioridad) t.priority = c.cambio.prioridad
          if (c.cambio?.minutos) t.estMin = c.cambio.minutos
          const f = ep ? featureSugerido(texto, ep) : null
          if (f) t.featureId = f.id
          porEpica.set(epicaId, [...(porEpica.get(epicaId) || []), { c, t }])
        }
        for (const [epicaId, lista] of porEpica) {
          await sync(epicaId, { create: lista.map(x => x.t) })
          for (const { c, t } of lista) await responder(c.id, c.tipo, 'aceptada', { tareaId: t.id, respuesta: { auto: true, epicaId, plan: t.plan || null, featureId: t.featureId || null } })
        }
        await cargarEpicas()
      } catch (e) { mostrarAviso({ texto: `No pude crear las tareas nuevas: ${e instanceof Error ? e.message : String(e)}` }) }
      finally { setCreando(false) }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, data, epicas, respuestas])

  const [creadasVisto, setCreadasVisto] = useState<string | null>(() => { try { return localStorage.getItem('dia.creadas.visto') } catch { return null } })
  /** Las que se crearon solas hoy, para revisarlas (siguen en su épica aunque las termines). */
  const creadas = useMemo(() => {
    const out: { c: DiaTarjeta; id: string }[] = []
    for (const c of data?.tarjetas || []) {
      const r = respuestas.get(c.id)
      if (c.tipo === 'nuevo' && r?.estado === 'aceptada' && (r.respuesta as { auto?: boolean } | null)?.auto && r.tarea_id) out.push({ c, id: r.tarea_id })
    }
    return out
  }, [data, respuestas])
  /** «Quitar»: borra la tarea creada sola. Con deshacer (la vuelve a crear igual). */
  const quitarCreada = useCallback(async (itemId: string, tareaId: string) => {
    const hit = todas.get(tareaId); if (!hit) return
    try {
      await sync(hit.e.id, { remove: [tareaId] })
      await responder(itemId, 'nuevo', 'descartada', { tareaId, respuesta: { auto: true, quitada: true } })
      cargarEpicas()
      mostrarAviso({ texto: `Quitada: ${hit.t.t}`, deshacer: () => {
        const { updatedAt: _u, ...t } = hit.t; void _u
        sync(hit.e.id, { create: [t] }).then(() => responder(itemId, 'nuevo', 'aceptada', { tareaId, respuesta: { auto: true, epicaId: hit.e.id } })).then(() => cargarEpicas()).catch(() => {})
      } })
    } catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }) }
  }, [todas, sync, responder, cargarEpicas, mostrarAviso])

  /** Palomita de «Tus 3» / Ahora: si ya es tarea, se marca o reabre; si todavía es un pendiente sin decidir
   *  (salió del diario), se crea ya terminada en su épica, con aviso para deshacer. */
  const marcarPrioridad = useCallback(async (x: DiaPrioridad) => {
    const hit = tareaDePrioridad(x)
    if (hit?.t.id) return toggleHecha(hit.t.id)
    const c = x.itemId ? data?.tarjetas.find(k => k.id === x.itemId) : undefined
    if (!c || respuestas.has(c.id) || enCurso.current.has(c.id)) return
    enCurso.current.add(c.id)
    try {
      await accBandeja.terminar(c)
      mostrarAviso({ texto: `Hecha: ${c.cambio?.titulo || c.titulo}`, deshacer: () => { accBandeja.deshacer(c.id).catch(e => mostrarAviso({ texto: e instanceof Error ? e.message : String(e) })) } })
    } catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }) }
    finally { enCurso.current.delete(c.id) }
  }, [tareaDePrioridad, toggleHecha, data, respuestas, accBandeja, mostrarAviso])
  const puedeMarcar = useCallback((x: DiaPrioridad) => !!tareaDePrioridad(x)?.t.id || (!!x.itemId && !!data?.tarjetas.some(k => k.id === x.itemId) && !respuestas.has(x.itemId)),
    [tareaDePrioridad, data, respuestas])

  const porDecidir = itemsDe(data).filter(it => !respuestas.has(it.id))
  const pendientes = (data?.tarjetas || []).filter(c => !respuestas.has(c.id))
  const decisionesAbiertas = (data?.decisiones || []).filter(d => !respuestas.has(d.id))
  const cerebroAbiertas = (data?.cerebro || []).filter(q => !respuestas.has(q.id)).length

  return (
    <div className="md-root">
      <style>{CSS}</style>
      <SiteHeader title="Mi día" subtitle="Tu día · ADVL" seccion="dia" />
      <main className="md-main">
        <nav className="md-tabs" aria-label="Vistas de Mi día">
          {([['hoy', 'Hoy'], ['noche', 'Cerrar día'], ['semana', 'Semana'], ['boveda', 'Bóveda']] as [Modo, string][]).map(([m, l]) => (
            <button key={m} className="md-tab" data-on={modo === m || (m === 'hoy' && (modo === 'ritual' || modo === 'tus3'))} onClick={() => ir(m)}>
              {l}{m === 'hoy' && porDecidir.length > 0 && modo !== 'ritual' ? <span className="md-badge">{porDecidir.length}</span> : null}
            </button>
          ))}
        </nav>

        {error && <div className="md-card md-error">No pude leer tu día: {error}. <button className="md-link" onClick={cargarDia}>Reintentar</button></div>}
        {!dia && !error && <Esqueleto />}
        {dia && !dia.disponible && (
          <div className="md-card md-aviso">
            <p className="md-h3">Falta un paso para que Mi día se llene solo</p>
            <p className="md-sub">Pega <code>sql/dia-01.sql</code> en Supabase (SQL Editor → New query → Run). Mientras tanto ves tus épicas y lo que esperas de otros.</p>
          </div>
        )}

        {dia && (modo === 'hoy' || modo === 'noche') && <TiraSemana dia={dia} hoy={hoy} fecha={fecha} elegir={verDia} />}

        {dia && fecha !== hoy && (
          <VistaOtroDia fecha={fecha} hoy={hoy} otro={diaOtro} epicas={epicas} cumples={cumples} cierre={dia.cierres.find(c => c.fecha === fecha)?.calificacion ?? null} volver={() => verDia(hoy)} />
        )}

        {dia && fecha === hoy && modo === 'ritual' && data && (
          <Bandeja data={data} hoy={hoy} respuestas={respuestas} epicas={epicas} acc={accBandeja} tapada={!!ficha || !!epicaPop}
            creadas={<CreadasDiario creadas={creadas} todas={todas} creando={creando} hoy={hoy} abrir={abrirTarea} terminar={terminarTarea} quitar={quitarCreada} />} alTerminar={() => { setModo('tus3'); window.scrollTo({ top: 0 }) }} volver={() => ir('hoy')}
            avisar={(texto, id) => mostrarAviso({ texto, deshacer: () => { accBandeja.deshacer(id).catch(e => mostrarAviso({ texto: e instanceof Error ? e.message : String(e) })) } })} />
        )}
        {dia && fecha === hoy && modo === 'tus3' && data && (
          <Ritual data={data} hoy={hoy} pendientes={[]} prioridades={prioridades} tareaDe={tareaDePrioridad}
            decidir={decidirTarjeta} deshacer={deshacerRespuesta} empezar={empezarDia} saltar={() => ir('hoy')} minutosLibres={minutosLibres(eventos, hoy)} />
        )}

        {dia && fecha === hoy && modo === 'hoy' && (
          <VistaHoy extra={extra} dia={dia} data={data} hoy={hoy} epicas={epicas} cumples={cumples} eventos={eventos} saludHoy={saludHoy}
            prioridades={prioridades} respaldo={tresDeRespaldo} tareaDe={tareaDePrioridad} toggleHecha={toggleHecha} marcar={marcarPrioridad} puedeMarcar={puedeMarcar}
            pendientes={pendientes} decisiones={decisionesAbiertas} respuestas={respuestas} porDecidir={porDecidir.length}
            abrirRitual={() => { ir('ritual'); setCreadasVisto(hoy); ponerLS('dia.creadas.visto', hoy) }} ordenar={() => { setModo('tus3'); setModoElegido(true); window.scrollTo({ top: 0 }) }} irBoveda={() => ir('boveda')} responder={responder} capturar={capturar} aviso={mostrarAviso}
            cerebroAbiertas={cerebroAbiertas} crearRapida={crearRapida} ayerPri={ayerPri} reprogramar={reprogramar} moverVarias={moverVarias}
            abrirTarea={abrirTarea} terminarTarea={terminarTarea} abrirEpica={setEpicaPop}
            creadasN={creadasVisto === hoy ? 0 : creadas.length} />
        )}

        {dia && fecha === hoy && modo === 'noche' && (
          <VistaNoche dia={dia} data={data} hoy={hoy} prioridades={prioridades} respaldo={tresDeRespaldo} tareaDe={tareaDePrioridad}
            toggleHecha={toggleHecha} marcar={marcarPrioridad} puedeMarcar={puedeMarcar} capturar={capturar} calificar={calificar} reprogramar={reprogramar} />
        )}

        {dia && modo === 'semana' && <VistaSemana dia={dia} hoy={hoy} epicas={epicas} />}
        {dia && modo === 'boveda' && <VistaBoveda dia={dia} hoy={hoy} respuestas={respuestas} responder={responder} deshacer={deshacerRespuesta} aviso={mostrarAviso} />}

        {dia && fecha === hoy && <Pie dia={dia} />}
      </main>
      {epicaPop && (() => {
        const e = (epicas || []).find(x => x.id === epicaPop)
        return e ? <EpicaTablero e={e} hoy={hoy} tapada={!!ficha} cerrar={() => setEpicaPop(null)} abrir={abrirTarea} terminar={terminarTarea} reprogramar={reprogramar} crear={crearEnEpica} /> : null
      })()}
      {ficha && (
        <Suspense fallback={<div role="status" aria-live="polite" className="md-abriendo">Abriendo la tarea…</div>}>
          <FichaEpicas key={ficha.tid} initialEpics={ficha.epics} ficha={{ eId: ficha.eId, tid: ficha.tid, onClose: cerrarFicha }} />
        </Suspense>
      )}
      {aviso && (
        <div className="md-toast" role="status">
          <span>{aviso.texto}</span>
          {aviso.deshacer && <button className="md-link md-link-inv" onClick={() => { aviso.deshacer?.(); setAviso(null) }}>Deshacer</button>}
        </div>
      )}
    </div>
  )
}

/** Minutos libres entre 9:00 y 19:00 según tu calendario (para «≈ 95 min · tienes 3 h libres»). */
function minutosLibres(eventos: Evento[] | null, hoy: string): number | null {
  if (!eventos) return null
  const ini = fechaDe(hoy).setHours(9, 0, 0, 0), fin = fechaDe(hoy).setHours(19, 0, 0, 0)
  // Las juntas encimadas se juntan antes de sumar (10–11 y 10:30–11:30 son 1.5 h, no 2 h).
  const tramos = eventos.filter(e => !e.allDay && e.start && e.end)
    .map(e => [Math.max(ini, new Date(e.start).getTime()), Math.min(fin, new Date(e.end!).getTime())] as [number, number])
    .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  let ocupado = 0, hasta = -Infinity
  for (const [a, b] of tramos) { const desde = Math.max(a, hasta); if (b > desde) ocupado += b - desde; hasta = Math.max(hasta, b) }
  return Math.max(0, Math.round((fin - ini - ocupado) / 60000))
}
const hhmm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`)

/* ── Ritual de la mañana ── */
function Ritual({ data, hoy, pendientes, prioridades, tareaDe, decidir, deshacer, empezar, saltar, minutosLibres }: {
  data: DiaData; hoy: string; pendientes: DiaTarjeta[]; prioridades: DiaPrioridad[]
  tareaDe: (p: DiaPrioridad) => { e: Epica; t: EpicaTask } | null
  decidir: (c: DiaTarjeta, que: 'si' | 'otro' | 'no', cuando?: string | null, destino?: string) => Promise<void>
  deshacer: (id: string) => Promise<void>
  empezar: (orden: number[]) => Promise<void>
  saltar: () => void
  minutosLibres: number | null
}) {
  const [paso, setPaso] = useState(pendientes.length ? 1 : 2)
  const [cola] = useState(pendientes)            // la cola no cambia mientras decides (para poder deshacer)
  const [idx, setIdx] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [eligeDia, setEligeDia] = useState(false)
  const [otroDestino, setOtroDestino] = useState<string | null>(null)
  const [orden, setOrden] = useState(() => prioridades.map((_, i) => i))
  const [empezando, setEmpezando] = useState(false)
  const actual = cola[idx]

  const decide = useCallback(async (que: 'si' | 'otro' | 'no', cuando?: string | null, destino?: string) => {
    if (!actual || ocupado) return
    setOcupado(true)
    try { await decidir(actual, que, cuando, destino); setEligeDia(false); setOtroDestino(null); setIdx(i => i + 1) }
    catch { /* el aviso ya se mostró; la tarjeta se queda */ }
    finally { setOcupado(false) }
  }, [actual, ocupado, decidir])

  useEffect(() => {
    if (paso !== 1) return
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const k = e.key.toLowerCase()
      if (k === 's') decide('si'); else if (k === 'd') decide('no'); else if (k === 'o') setEligeDia(true)
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [paso, decide])
  useEffect(() => { if (paso === 1 && idx >= cola.length) setPaso(2) }, [paso, idx, cola.length])

  const totalMin = orden.reduce((s, i) => s + (prioridades[i]?.min || 0), 0)
  const mover = (i: number, d: number) => setOrden(o => { const j = i + d; if (j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n })

  return (
    <section className="md-ritual">
      <div className="md-dots" aria-label={`Paso ${paso + 1} de 3`}>{[0, 1, 2].map(i => <span key={i} data-on={i <= paso} data-actual={i === paso} />)}</div>

      {paso === 0 && (
        <div className="md-fade">
          <p className="md-kicker">{data.diario ? cap(diaLargo(data.diario)) : 'Ayer'} en una frase</p>
          <p className="md-frase">{data.frase}</p>
          <div className="md-card md-lista">
            {data.hechos.map((h, i) => (
              <div key={i} className="md-row">
                <span className="md-ico md-ok" aria-hidden>✓</span>
                <div className="md-grow">{h.t}{h.nota && <div className="md-meta">{h.nota}</div>}</div>
                {h.nota && <a className="md-icobtn" href={obsidianUrl(h.nota)} aria-label={`Abrir ${h.nota} en Obsidian`} title="Abrir en Obsidian">↗</a>}
              </div>
            ))}
          </div>
          <button className="md-btn md-primario md-ancho" onClick={() => setPaso(cola.length ? 1 : 2)}>
            {cola.length ? `Siguiente: decide ${cola.length} ${cola.length === 1 ? 'cosa' : 'cosas'}` : 'Siguiente: tus 3 de hoy'}
          </button>
          <button className="md-link md-centro" onClick={saltar}>Saltar al día</button>
        </div>
      )}

      {paso === 1 && actual && (
        <div className="md-fade">
          <div className="md-entre"><span className="md-kicker">Decide</span><span className="md-kicker">{idx + 1} de {cola.length}</span></div>
          <div className="md-pila">
            {cola[idx + 1] && <div className="md-card md-detras" aria-hidden />}
            <article key={actual.id} className="md-card md-tarjeta">
              <span className={`md-chip md-tipo-${actual.tipo}`}>{ETIQUETA_TIPO[actual.tipo]}</span>
              <p className="md-titulo-tarjeta">{actual.titulo}</p>
              {actual.detalle && <p className="md-sub">{actual.detalle}</p>}
              {actual.tipo === 'mover' && actual.destino && <p className="md-meta">Va a <code>{actual.destino}</code></p>}
              <div className="md-grow" />
              <div className="md-entre md-meta">
                <span>{actual.epica ? `Épica: ${actual.epica}` : actual.tipo === 'nuevo' ? 'Épica: Del diario' : ''}</span>
                {actual.nota && <a className="md-link" href={obsidianUrl(actual.nota)}>Abrir nota ↗</a>}
              </div>
            </article>
          </div>

          {eligeDia && actual.tipo !== 'mover' && (
            <div className="md-elige md-fade">
              {[['Mañana', sumarDias(hoy, 1)], ['En 3 días', sumarDias(hoy, 3)], ['El lunes', proximoLunes(hoy)], ...(actual.tipo === 'nuevo' ? [['Sin fecha', null]] : [])].map(([l, f]) => (
                <button key={String(l)} className="md-btn" disabled={ocupado} onClick={() => decide('otro', f as string | null)}>{l}</button>
              ))}
            </div>
          )}
          {otroDestino !== null && (
            <form className="md-elige md-fade" onSubmit={e => { e.preventDefault(); if (otroDestino.trim()) decide('si', null, otroDestino.trim()) }}>
              <input className="md-input md-grow" autoFocus value={otroDestino} onChange={e => setOtroDestino(e.target.value)} placeholder="05-personal/compras" aria-label="Carpeta destino" />
              <button className="md-btn md-primario" disabled={!otroDestino.trim() || ocupado}>Mover</button>
            </form>
          )}

          <div className="md-tres">
            <button className="md-btn" disabled={ocupado} onClick={() => decide('no')}>{actual.tipo === 'mover' ? 'Dejar' : 'Descartar'}</button>
            {actual.tipo === 'mover'
              ? <button className="md-btn" disabled={ocupado} onClick={() => setOtroDestino(actual.destino || '')}>Otro destino</button>
              : <button className="md-btn" disabled={ocupado} onClick={() => setEligeDia(v => !v)} aria-expanded={eligeDia}>Otro día</button>}
            <button className="md-btn md-primario" disabled={ocupado} onClick={() => decide('si')}>{actual.tipo === 'mover' ? 'Sí, muévela' : actual.tipo === 'nuevo' ? 'Sí, hoy' : 'Sí'}</button>
          </div>
          <div className="md-entre md-meta md-mt8">
            <span className="md-solo-mac">En la Mac: D · O · S</span>
            {idx > 0 && <button className="md-link" disabled={ocupado} onClick={async () => { const prev = cola[idx - 1]; await deshacer(prev.id); setIdx(i => i - 1) }}>Deshacer la anterior</button>}
          </div>
          <button className="md-link md-centro" onClick={() => setPaso(2)}>Terminar después ({cola.length - idx})</button>
        </div>
      )}

      {paso === 2 && (
        <div className="md-fade">
          <p className="md-frase md-sin-margen">Tus {Math.min(orden.length, 5) || 3} de hoy</p>
          {orden.length ? (
            <>
              <p className="md-sub">Claude las ordenó por tus fechas y lo que llevas evitando. Cámbiales el orden si quieres.</p>
              <div className="md-card md-lista">
                {orden.map((pi, i) => {
                  const p = prioridades[pi]
                  const hit = tareaDe(p)
                  return (
                    <div key={pi} className="md-row">
                      <span className="md-num">{i + 1}</span>
                      <div className="md-grow">{hit?.t.t || p.t}<div className="md-meta">{[p.epica || hit?.e.name, p.min ? `${p.min} min` : null, p.porque].filter(Boolean).join(' · ')}</div></div>
                      <div className="md-flechas">
                        <button className="md-icobtn" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                        <button className="md-icobtn" onClick={() => mover(i, 1)} disabled={i === orden.length - 1} aria-label="Bajar">↓</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {totalMin > 0 && <p className="md-meta md-mt8">≈ {hhmm(totalMin)}{minutosLibres != null ? ` · tienes ${hhmm(minutosLibres)} libres entre 9 y 7` : ''}{minutosLibres != null && totalMin > minutosLibres ? '. Es más de lo que cabe: considera dejar una.' : ''}</p>}
            </>
          ) : <p className="md-sub">Claude no propuso prioridades hoy. Tus tareas agendadas siguen en la vista Hoy.</p>}
          <button className="md-btn md-primario md-ancho" disabled={empezando} onClick={async () => { setEmpezando(true); await empezar(orden); setEmpezando(false) }}>{empezando ? 'Agendando…' : 'Empezar mi día'}</button>
        </div>
      )}
    </section>
  )
}
const ETIQUETA_TIPO: Record<DiaTarjeta['tipo'], string> = { nuevo: 'Nuevo del diario', sugerencia: 'Sugerencia', limpieza: 'Limpieza', evitando: 'Lo vienes evitando', esperando: 'Esperando a otros', mover: 'Nota del inbox' }
function proximoLunes(hoy: string) { const d = fechaDe(hoy).getDay(); return sumarDias(hoy, ((8 - d) % 7) || 7) }

/* ── Vista Hoy ── */
function VistaHoy(p: {
  extra: PanelExtra | null
  dia: DiaGet; data: DiaData | null; hoy: string; epicas: Epica[] | null; cumples: Cumple[]; eventos: Evento[] | null; saludHoy: boolean | null
  prioridades: DiaPrioridad[]; respaldo: { e: Epica; t: EpicaTask }[]; tareaDe: (x: DiaPrioridad) => { e: Epica; t: EpicaTask } | null
  toggleHecha: (id: string) => Promise<void>; marcar: (x: DiaPrioridad) => Promise<void>; puedeMarcar: (x: DiaPrioridad) => boolean
  pendientes: DiaTarjeta[]; decisiones: DiaDecision[]; respuestas: Map<string, DiaRespuesta>
  abrirRitual: () => void; ordenar: () => void; irBoveda: () => void; responder: (itemId: string, tipo: string, estado: EstadoRespuesta, extra?: { respuesta?: unknown; tareaId?: string }) => Promise<void>
  capturar: (t: string, tipo?: TipoCaptura) => Promise<void>; aviso: (a: Aviso) => void
  cerebroAbiertas: number; porDecidir: number; crearRapida: (titulo: string, epicaId: string, cuando: PlanRapido) => Promise<string>
  ayerPri: DiaPrioridad[]; reprogramar: (tareaId: string, plan: string | null) => Promise<void>; moverVarias: (ids: string[], plan: string | null) => Promise<void>
  abrirTarea: (id: string) => void; terminarTarea: (id: string) => Promise<void>; abrirEpica: (id: string) => void; creadasN: number
}) {
  const { dia, data, hoy, epicas } = p
  // Tus 3: lo que propuso Claude, ya ligado a tareas reales; si no hay, lo agendado para hoy.
  const tres = useMemo(() => {
    const desdeClaude = p.prioridades.map(x => ({ p: x, hit: p.tareaDe(x) }))
    if (desdeClaude.length) return desdeClaude
    return p.respaldo.map(hit => ({ p: { t: hit.t.t, tareaId: hit.t.id, epica: hit.e.name, porque: hit.t.due ? `vence ${hit.t.due}` : 'agendada para hoy' } as DiaPrioridad, hit }))
  }, [p.prioridades, p.respaldo, p.tareaDe])
  const hechas = tres.filter(x => x.hit && hechaHoy(x.hit.t, hoy)).length
  // «Ahora» = la primera que puedes hacer tú: lo que está en Esperando no va primero.
  const siguiente = tres.find(x => !x.hit || (!hechaHoy(x.hit.t, hoy) && x.hit.t.status !== 'Esperando')) || tres.find(x => !x.hit || !hechaHoy(x.hit.t, hoy))

  // Lo que se quedó: agendado hoy fuera de tus 3, lo de ayer sin terminar y lo atrasado de antes.
  const pend = useMemo(() => {
    const ayer = sumarDias(hoy, -1)
    const enTres = new Set(tres.map(x => x.hit?.t.id).filter(Boolean) as string[])
    const ayerIds = new Set(p.ayerPri.map(x => x.tareaId).filter(Boolean) as string[])
    const tambien: Hit[] = [], deAyer: (Hit & { porque: string })[] = [], antes: Hit[] = []
    for (const e of epicas || []) {
      if (e.archived) continue
      for (const t of e.tasks || []) {
        if (!t.id || !ABIERTA(t) || enTres.has(t.id) || t.status === 'Esperando') continue
        if (t.plan === hoy || t.dayPlans?.some(d => d.day === hoy)) { tambien.push({ e, t: t as Hit['t'] }); continue }
        if ((t.plan && t.plan > hoy) || t.dayPlans?.some(d => d.day > hoy)) continue   // ya tiene otro día
        if (ayerIds.has(t.id)) deAyer.push({ e, t: t as Hit['t'], porque: 'estaba en tus 3 de ayer' })
        else if (t.plan === ayer) deAyer.push({ e, t: t as Hit['t'], porque: 'agendada ayer' })
        else if (t.plan && t.plan < ayer) antes.push({ e, t: t as Hit['t'] })
      }
    }
    antes.sort((a, b) => (b.t.plan || '').localeCompare(a.t.plan || ''))
    // De tus 3 de ayer que Claude sacó del diario sin tarea ligada: no sé si las hiciste.
    const sueltas = p.ayerPri.filter(x => !x.tareaId && !p.prioridades.some(y => y.t === x.t))
    return { tambien, deAyer, antes, sueltas }
  }, [epicas, hoy, tres, p.ayerPri, p.prioridades])

  const salud = useMemo(() => (epicas ? saludEpicas(epicas, hoy) : []), [epicas, hoy])
  const esperando = useMemo(() => (epicas ? esperandoAOtros(epicas, hoy) : []), [epicas, hoy])
  const [todasEpicas, setTodasEpicas] = useState(false)

  // Chips: fechas que vienen, cumpleaños, por decidir, inbox, salud, ERP en vivo.
  const chips = useMemo(() => {
    const out: { t: string; tono: 'ambar' | 'azul' | 'rojo' | 'verde' | 'gris'; href?: string; accion?: () => void }[] = []
    for (const f of (data?.fechas || [])) { const n = diasHasta(hoy, f.fecha); if (n >= 0 && n <= 30) out.push({ t: `${f.t} · ${enDias(n)}`, tono: n <= 3 ? 'rojo' : 'ambar', href: f.nota ? obsidianUrl(f.nota) : undefined }) }
    for (const c of p.cumples) {
      const [, m, d] = c.cumple.split('-').map(Number); if (!m || !d) continue
      let f = `${hoy.slice(0, 4)}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (f < hoy) f = `${Number(hoy.slice(0, 4)) + 1}${f.slice(4)}`
      const n = diasHasta(hoy, f); if (n === 0) out.push({ t: `Hoy cumple ${c.apodo || c.nombre.split(' ')[0]}`, tono: 'rojo' })
    }
    if (data?.inbox) out.push({ t: `Inbox · ${data.inbox}`, tono: 'gris' })
    if (p.saludHoy === false) out.push({ t: 'Registrar salud', tono: 'ambar', href: '/peso' })
    const erp = dia.boveda?.resumen.find(r => /ERP/.test(r) && /vivo/i.test(r))
    if (erp) { const n = erp.match(/\d+/)?.[0]; out.push({ t: n ? `ERP en vivo · ${n}` : 'ERP en vivo', tono: 'rojo', accion: p.irBoveda }) }
    // Cuida tu cerebro: arreglos de un minuto para la bóveda que aún no contestas hoy.
    const cb = dia.cerebro
    if (cb) { const n = [...cb.tareas, ...cb.repaso].filter(t => !p.respuestas.has(`jardin:${t.id}`)).length; if (n) out.push({ t: `Tu cerebro · ${n} de 1 min`, tono: 'azul', accion: p.irBoveda }) }
    const fallas = (data?.salud || []).filter(x => x.tono === 'rojo').length
    if (fallas) out.push({ t: `Revisar la automatización · ${fallas}`, tono: 'rojo', accion: p.irBoveda })
    return out
  }, [data, hoy, p.cumples, p.saludHoy, dia.boveda, dia.cerebro, p.respuestas, p.irBoveda])

  // Dos columnas parejas: lo de la derecha que no es de épicas (esperando, salud, gente…) va a la columna que
  // vaya más corta, según cuántos renglones trae cada cosa. En el celular (una columna) todo queda en su orden.
  const ancho = useAncho(900)
  const bloques = useMemo(() => {
    const nEp = todasEpicas ? salud.length : salud.filter(s => s.estado !== 'al_dia' && s.estado !== 'pausa').length
    let izq = 3.5 + Math.max(0, tres.length - 1) * 0.8 + (pend.tambien.length ? pend.tambien.length * 1.1 + 1 : 0) + 3
      + (pend.deAyer.length + pend.sueltas.length) * 1.1 + (pend.antes.length ? 1.6 : 0) + (pend.deAyer.length + pend.sueltas.length + pend.antes.length ? 1 : 0)
    let der = salud.length ? nEp * 1.7 + 2.2 : 3
    const lista: { k: string; w: number; n: React.ReactNode }[] = [
      ...(esperando.length ? [{ k: 'esperando', w: Math.min(5, esperando.length) * 1.1 + 1, n: (
<section>
              <div className="md-lbl"><span>Esperando a otros</span><span>{esperando.length}</span></div>
              <div className="md-card md-lista">
                {esperando.slice(0, 5).map(w => {
                  const tel = w.t.personaId ? waNumero(p.cumples.find(c => c.id === w.t.personaId)?.celular) : null
                  const wa = `https://wa.me/${tel || ''}?text=${encodeURIComponent(textoRecordatorio(w.t, w.quien))}`
                  return (
                    <div key={w.t.id} className="md-row">
                      <span className="md-dot" style={{ background: (w.dias ?? 0) >= 4 ? 'var(--md-ambar)' : 'var(--md-linea2)' }} />
                      <div className="md-grow">{w.t.id ? <button type="button" className="md-abrir" onClick={() => p.abrirTarea(w.t.id!)}>{w.t.t}</button> : w.t.t}<div className="md-meta">{[w.quien, w.e.name, w.dias != null ? `${w.dias} ${w.dias === 1 ? 'día' : 'días'}` : null].filter(Boolean).join(' · ')}</div></div>
                      <a className="md-btn md-chico" href={wa} target="_blank" rel="noopener noreferrer">Recordarle</a>
                    </div>
                  )
                })}
              </div>
            </section>
      ) }] : []),
      { k: 'salud', w: 2.4, n: <SaludDia extra={p.extra} /> },
      { k: 'gente', w: (p.extra?.gente?.length || 1) * 1.1 + 1, n: <TuGente gente={p.extra?.gente} hoy={hoy} /> },
      { k: 'preguntale', w: 3.2, n: <Preguntale /> },
      { k: 'anoche', w: 1, n: <AnocheBoveda cambios={data?.cambios || []} aprendido={dia.aprendido || []} /> },
    ]
    const out = { izq: [] as typeof lista, der: [] as typeof lista }
    for (const b of lista) {
      if (ancho && izq < der) { out.izq.push(b); izq += b.w } else { out.der.push(b); der += b.w }
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancho, todasEpicas, salud, tres, pend, esperando, p.extra, p.cumples, hoy, data, dia.aprendido, p.abrirTarea])

  const noCorrio = !dia.resumen && dia.disponible
  return (
    <div className="md-fade">
      <div className="md-entre md-base md-mt12">
        <h1 className="md-fecha">{cap(diaLargo(hoy))}</h1>
        {tres.length > 0 && <span className="md-meta">{hechas} de {tres.length} hechas{p.prioridades.length > 1 && <> · <button type="button" className="md-link" onClick={p.ordenar}>Ordenar</button></>}</span>}
      </div>
      {tres.length > 0 && <div className="md-avance" role="progressbar" aria-label="Tus 3 de hoy" aria-valuenow={hechas} aria-valuemin={0} aria-valuemax={tres.length}><div style={{ width: `${Math.round(hechas / tres.length * 100)}%` }} /></div>}
      {/* Avisos (fechas, cumpleaños, salud, automatización) arriba: es lo primero que hay que ver, no algo a media columna. */}
      {chips.length > 0 && (
        <div className="md-chips">
          {chips.map((c, i) => c.accion
            ? <button key={i} type="button" onClick={c.accion} className={`md-chip md-tono-${c.tono}`}>{c.t}</button>
            : c.href
            ? <a key={i} href={c.href} className={`md-chip md-tono-${c.tono}`}>{c.t}</a>
            : <span key={i} className={`md-chip md-tono-${c.tono}`}>{c.t}</span>)}
        </div>
      )}
      {data && (data.frase || data.hechos.length > 0) && <AyerCorto data={data} />}
      {noCorrio && (
        <div className="md-card md-aviso md-mt12">
          <p className="md-h3">El cierre de anoche no ha corrido</p>
          <p className="md-sub">{dia.corrida ? `Última corrida: ${new Date(dia.corrida.at).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${dia.corrida.ok ? '' : ` · falló: ${dia.corrida.mensaje || 'sin detalle'}`}.` : 'Todavía no ha corrido nunca.'} Corre a las 3:00 si la Mac está prendida y Obsidian abierto.</p>
        </div>
      )}
      {data?.sinDictado && <p className="md-meta md-mt8">No dictaste nada ayer; tus épicas sí están al día.</p>}

      {(p.porDecidir > 0 || p.creadasN > 0) && <PorDecidir n={p.porDecidir} creadas={p.creadasN} pendientes={p.pendientes} decisiones={p.decisiones} cerebro={p.cerebroAbiertas} abrir={p.abrirRitual} />}

      <div className="md-grid">
        <div className="md-col">
          {siguiente ? (
            <div className="md-card md-ahora">
              <p className="md-kicker">Ahora</p>
              {siguiente.hit?.t.id
                ? <button type="button" className="md-titulo-ahora md-abrir" onClick={() => p.abrirTarea(siguiente.hit!.t.id!)} title="Ver la ficha completa">{siguiente.hit.t.t}</button>
                : <p className="md-titulo-ahora">{siguiente.p.t}</p>}
              <p className="md-meta">{[siguiente.p.epica || siguiente.hit?.e.name, siguiente.p.min ? `${siguiente.p.min} min` : null, siguiente.p.porque].filter(Boolean).join(' · ')}</p>
              <div className="md-fila md-mt12">
                <Link href={siguiente.hit?.t.id ? `/tiempo?start=${encodeURIComponent(siguiente.hit.t.id)}` : '/tiempo'} className="md-btn md-primario md-grow" title={siguiente.hit ? 'Abre Tiempo con el cronómetro de esta tarea corriendo' : 'Abrir Tiempo'}>▶ Foco{siguiente.p.min ? ` ${siguiente.p.min} min` : ''}</Link>
                {p.puedeMarcar(siguiente.p) && <button className="md-btn" onClick={() => p.marcar(siguiente.p)}>✓ Hecha</button>}
              </div>
            </div>
          ) : tres.length > 0 ? (
            <div className="md-card md-listo"><p className="md-h3">Tus {tres.length} están hechas.</p><p className="md-sub">Lo demás es extra. Buen día.</p></div>
          ) : (
            <div className="md-card"><p className="md-h3">Nada agendado para hoy</p><p className="md-sub">Elige qué hacer en <Link className="md-link" href="/epicas">Épicas</Link> o dicta tu día esta noche.</p></div>
          )}
          {tres.filter(x => x !== siguiente).length > 0 && (
            <div className="md-otras">
              {tres.filter(x => x !== siguiente).map((x, i) => {
                const hecha = !!x.hit && hechaHoy(x.hit.t, hoy)
                const id = x.hit?.t.id
                return (
                  <FilaTarea key={i} hecha={hecha} titulo={x.hit?.t.t || x.p.t} meta={x.hit?.e.name || x.p.epica} color={x.hit?.e.color}
                    marcar={p.puedeMarcar(x.p) ? () => p.marcar(x.p) : undefined} abrir={id ? () => p.abrirTarea(id) : undefined} />
                )
              })}
            </div>
          )}

          <TambienHoy tambien={pend.tambien} terminar={p.terminarTarea} abrir={p.abrirTarea} />
          <Agenda eventos={p.eventos} hoy={hoy} />
          <QuedoPendiente pend={pend} hoy={hoy} epicas={epicas} terminar={p.terminarTarea} abrir={p.abrirTarea} reprogramar={p.reprogramar} moverVarias={p.moverVarias} crearRapida={p.crearRapida} />
          {bloques.izq.map(b => <Fragment key={b.k}>{b.n}</Fragment>)}
        </div>

        <div className="md-col">
          {salud.length > 0 && <EpicasAtencion salud={salud} hoy={hoy} todas={todasEpicas} setTodas={setTodasEpicas} reprogramar={p.reprogramar} abrir={p.abrirTarea} abrirEpica={p.abrirEpica} />}
          {!epicas && <div className="md-card md-sk" style={{ height: 180 }} />}
          {bloques.der.map(b => <Fragment key={b.k}>{b.n}</Fragment>)}
        </div>
      </div>

      <Anotar capturar={p.capturar} pendientes={dia.capturasPendientes} epicas={epicas} crearRapida={p.crearRapida} />
    </div>
  )
}

type Hit = { e: Epica; t: EpicaTask & { id: string } }
const corta = (iso: string) => { const d = fechaDe(iso); return `${d.getDate()} ${MN[d.getMonth()].slice(0, 3)}` }

/** «Por decidir»: arriba y a todo lo ancho. Enseña lo primero que hay que decidir para que no se quede como un renglón más. */
function PorDecidir({ n, creadas, pendientes, decisiones, cerebro, abrir }: { n: number; creadas: number; pendientes: DiaTarjeta[]; decisiones: DiaDecision[]; cerebro: number; abrir: () => void }) {
  const yaCreadas = creadas > 0 ? `${creadas} ${creadas === 1 ? 'tarea nueva de tu diario ya está' : 'tareas nuevas de tu diario ya están'} en tus épicas` : ''
  if (n === 0) return (
    <button type="button" className="md-card md-decidir md-mt12" onClick={abrir}>
      <div className="md-grow"><p className="md-kicker">De tu diario</p><p className="md-decidir-num">{cap(yaCreadas)}</p><p className="md-meta md-mt4">Ya les puse épica y, si le quedaba, feature. Revísalas y quita las que no van.</p></div>
      <span className="md-btn md-primario md-decidir-btn">Revisarlas →</span>
    </button>
  )
  const nuevos = pendientes.filter(c => c.tipo === 'nuevo').length
  const sug = pendientes.length - nuevos
  const primeros = [...pendientes.map(c => c.titulo), ...decisiones.map(d => d.pregunta)].slice(0, 3)
  const min = Math.max(1, Math.round(n * 20 / 60))   // ~20 s por tarjeta
  const desglose = [nuevos ? `${nuevos} ${nuevos === 1 ? 'pendiente nuevo' : 'pendientes nuevos'}` : null, sug ? `${sug} ${sug === 1 ? 'sugerencia' : 'sugerencias'}` : null,
    decisiones.length ? `${decisiones.length} ${decisiones.length === 1 ? 'decisión' : 'decisiones'}` : null, cerebro ? `${cerebro} para tu cerebro` : null].filter(Boolean).join(' · ')
  return (
    <button type="button" className="md-card md-decidir md-mt12" onClick={abrir}>
      <div className="md-grow">
        <p className="md-kicker">Antes de empezar</p>
        <p className="md-decidir-num">{n} por decidir <span className="md-meta">· unos {min} min</span></p>
        {primeros.length > 0 && <ul className="md-decidir-lista">{primeros.map((t, i) => <li key={i}>{t}</li>)}{n > primeros.length && <li className="md-meta">y {n - primeros.length} más</li>}</ul>}
        {yaCreadas && <p className="md-meta md-mt4"><b>{cap(yaCreadas)}.</b></p>}
        <p className="md-meta md-mt4">{desglose}. Lo que decidas se guarda en Obsidian y Claude lo usa para tu día.</p>
      </div>
      <span className="md-btn md-primario md-decidir-btn">Decidir ahora →</span>
    </button>
  )
}

/** Renglón de tarea: la palomita la termina (o la reabre) y el texto abre su ficha completa aquí mismo. */
function FilaTarea({ titulo, meta, color, hecha, marcar, abrir, children }: {
  titulo: string; meta?: string | null; color?: string; hecha?: boolean; marcar?: () => void; abrir?: () => void; children?: React.ReactNode
}) {
  return (
    <div className="md-row md-row-pend md-tarea" data-hecha={hecha || undefined}>
      <button type="button" className="md-circ" style={{ ['--c' as string]: color || 'var(--md-linea)' }} disabled={!marcar} onClick={marcar}
        aria-label={hecha ? `Reabrir «${titulo}»` : `Marcar «${titulo}» como hecha`} title={hecha ? 'Reabrir' : 'Marcar como hecha'}>{hecha ? '✓' : ''}</button>
      <div className="md-grow">
        {abrir ? <button type="button" className="md-abrir" onClick={abrir} title="Ver la ficha completa">{titulo}</button> : <span className="md-tarea-tit">{titulo}</span>}
        {meta && <div className="md-meta">{meta}</div>}
      </div>
      {children}
    </div>
  )
}

/** Lo agendado hoy que no está en tus 3. */
/** Pendientes nuevos del diario que ya quedaron en tus épicas. Tócala para su ficha; «Quitar» la borra (con deshacer). */
function CreadasDiario({ creadas, todas, creando, hoy, abrir, terminar, quitar }: {
  creadas: { c: DiaTarjeta; id: string }[]; todas: Map<string, { e: Epica; t: EpicaTask }>; creando: boolean; hoy: string
  abrir: (id: string) => void; terminar: (id: string) => Promise<void>; quitar: (itemId: string, tareaId: string) => Promise<void>
}) {
  const filas = creadas.map(x => ({ ...x, hit: todas.get(x.id) })).filter(x => x.hit)
  if (!filas.length && !creando) return null
  return (
    <section className="md-creadas">
      <div className="md-lbl"><span>Ya las puse en tus épicas</span><span>{creando ? 'Creando…' : filas.length}</span></div>
      <p className="md-meta md-creadas-sub">Salieron de tu diario. Toca una para ver y cambiar su ficha; si no va, quítala.</p>
      {filas.length > 0 && (
        <div className="md-card md-lista">
          {filas.map(({ c, id, hit }) => {
            const { e, t } = hit!
            const f = t.featureId ? (e.features || []).find(x => x.id === t.featureId)?.t : null
            const cuando = t.plan ? (t.plan === hoy ? 'hoy' : t.plan === sumarDias(hoy, 1) ? 'mañana' : corta(t.plan)) : 'sin fecha'
            return (
              <FilaTarea key={id} titulo={t.t} meta={[e.name, f, cuando, t.priority === 'alta' ? 'prioridad alta' : null].filter(Boolean).join(' · ')} color={e.color}
                hecha={!ABIERTA(t)} marcar={() => terminar(id)} abrir={() => abrir(id)}>
                <div className="md-acciones"><button type="button" className="md-btn md-chico md-btn-tenue" onClick={() => quitar(c.id, id)} title="Borrarla de tus épicas">Quitar</button></div>
              </FilaTarea>
            )
          })}
        </div>
      )}
    </section>
  )
}

function TambienHoy({ tambien, terminar, abrir }: { tambien: Hit[]; terminar: (id: string) => Promise<void>; abrir: (id: string) => void }) {
  if (!tambien.length) return null
  return (
    <section>
      <div className="md-lbl"><span>También agendado hoy</span><span>{tambien.length}</span></div>
      <div className="md-card md-lista">
        {tambien.map(({ e, t }) => <FilaTarea key={t.id} titulo={t.t} meta={e.name} color={e.color} marcar={() => terminar(t.id)} abrir={() => abrir(t.id)} />)}
      </div>
    </section>
  )
}

/** Lo que se quedó sin hacer: lo agendado hoy fuera de tus 3, lo de ayer y lo atrasado de antes. Cada una se mueve a hoy, mañana o se suelta. */
function QuedoPendiente({ pend, hoy, epicas, terminar, abrir, reprogramar, moverVarias, crearRapida }: {
  pend: { tambien: Hit[]; deAyer: (Hit & { porque: string })[]; antes: Hit[]; sueltas: DiaPrioridad[] }; hoy: string; epicas: Epica[] | null
  terminar: (id: string) => Promise<void>; abrir: (id: string) => void; reprogramar: (id: string, plan: string | null) => Promise<void>; moverVarias: (ids: string[], plan: string | null) => Promise<void>
  crearRapida: (titulo: string, epicaId: string, cuando: PlanRapido) => Promise<string>
}) {
  const CLAVE = 'dia.sueltas.vistas.v1'
  const [vistas, setVistas] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(CLAVE) || '[]') } catch { return [] } })
  const ocultar = (t: string) => { const v = [...vistas, t].slice(-40); setVistas(v); try { localStorage.setItem(CLAVE, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }
  const sueltas = pend.sueltas.filter(x => !vistas.includes(x.t))
  const manana = sumarDias(hoy, 1)
  const Botones = ({ id }: { id: string }) => (
    <div className="md-acciones">
      <button type="button" className="md-btn md-chico" onClick={() => reprogramar(id, hoy)}>Hoy</button>
      <button type="button" className="md-btn md-chico" onClick={() => reprogramar(id, manana)}>Mañana</button>
      <button type="button" className="md-btn md-chico md-btn-tenue" title="Quitarla del plan; sigue en su épica" onClick={() => reprogramar(id, null)}>Soltar</button>
    </div>
  )
  const Fila = ({ e, t, meta }: Hit & { meta: string }) => (
    <FilaTarea titulo={t.t} meta={meta} color={e.color} marcar={() => terminar(t.id)} abrir={() => abrir(t.id)}><Botones id={t.id} /></FilaTarea>
  )
  const nAyer = pend.deAyer.length + sueltas.length
  return (
    <>
      {(nAyer > 0 || pend.antes.length > 0) && (
        <section>
          <div className="md-lbl"><span>Quedó pendiente</span><span>{nAyer + pend.antes.length}</span></div>
          {nAyer > 0 && (
            <div className="md-card md-lista">
              {pend.deAyer.map(h => <Fila key={h.t.id} {...h} meta={`${h.e.name} · ${h.porque}`} />)}
              {sueltas.map(x => {
                const ep = (epicas || []).find(e => !e.archived && e.name === x.epica)
                return (
                  <div key={x.t} className="md-row md-row-pend">
                    <span className="md-dot" style={{ background: 'var(--md-linea)' }} />
                    <div className="md-grow">{x.t}<div className="md-meta">estaba en tus 3 de ayer · no tiene tarea</div></div>
                    <div className="md-acciones">
                      <button type="button" className="md-btn md-chico" title="Crear la tarea agendada para hoy" onClick={() => crearRapida(x.t, ep?.id || '', 'hoy').then(() => ocultar(x.t)).catch(() => {})}>＋ Hoy</button>
                      <button type="button" className="md-btn md-chico md-btn-tenue" title="Ya la hice o ya no va" onClick={() => ocultar(x.t)}>Ya quedó</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {pend.antes.length > 0 && (
            <details className="md-card md-plegable md-antes">
              <summary><span>De días anteriores · {pend.antes.length}</span><span className="md-meta">desde el {corta(pend.antes[pend.antes.length - 1].t.plan!)}</span></summary>
              <div className="md-fila md-mt8">
                <button type="button" className="md-btn md-chico" onClick={() => { if (window.confirm(`¿Quitar del plan las ${pend.antes.length}? Siguen en su épica sin fecha; puedes deshacer.`)) moverVarias(pend.antes.map(h => h.t.id), null) }}>Soltar las {pend.antes.length}</button>
              </div>
              <div className="md-lista md-mt8">
                {pend.antes.map(h => <Fila key={h.t.id} {...h} meta={`${h.e.name} · agendada el ${corta(h.t.plan!)}`} />)}
              </div>
            </details>
          )}
        </section>
      )}
    </>
  )
}

/** Avance de una épica: terminadas del total (sin archivadas) y cuántas cerraste en los últimos 7 días. */
function avanceEpica(e: Epica, hoy: string) {
  const vivas = (e.tasks || []).filter(t => t.status !== 'Archivada')
  const hechas = vivas.filter(t => t.status === 'Terminada')
  const desde = sumarDias(hoy, -6)
  const semana = hechas.filter(t => (t.doneAt || '').slice(0, 10) >= desde).length
  return { total: vivas.length, hechas: hechas.length, pct: vivas.length ? Math.round(hechas.length / vivas.length * 100) : 0, semana }
}

/** Épicas que piden atención (vencidas, atrasadas, quietas, esperando), con su avance y lo que se movió esta semana.
 *  Las que van al día se resumen en una línea. El paso a mover abre su ficha aquí mismo. */
function EpicasAtencion({ salud, hoy, todas, setTodas, reprogramar, abrir, abrirEpica }: { salud: SaludEpica[]; hoy: string; todas: boolean; setTodas: (f: (v: boolean) => boolean) => void; reprogramar: (id: string, plan: string | null) => Promise<void>; abrir: (id: string) => void; abrirEpica: (id: string) => void }) {
  const atencion = salud.filter(s => s.estado !== 'al_dia' && s.estado !== 'pausa')
  const resto = salud.length - atencion.length
  const lista = todas ? salud : atencion
  // La semana en una línea: cuánto cerraste y dónde. Da contexto sin otra tarjeta.
  const semana = salud.map(s => ({ s, n: avanceEpica(s.e, hoy).semana })).filter(x => x.n > 0).sort((a, b) => b.n - a.n)
  const totalSemana = semana.reduce((n, x) => n + x.n, 0)
  return (
    <section>
      <div className="md-lbl"><span>Tus épicas</span><Link className="md-link" href="/epicas">Épicas ↗</Link></div>
      <p className="md-meta md-semana-ep">{totalSemana
        ? <>Esta semana cerraste <b>{totalSemana}</b> {totalSemana === 1 ? 'tarea' : 'tareas'} en {semana.length} {semana.length === 1 ? 'épica' : 'épicas'} · más en <b>{semana[0].s.e.name}</b> ({semana[0].n})</>
        : <>Esta semana todavía no cierras tareas en tus épicas.</>}</p>
      {lista.length > 0
        ? <div className="md-card md-lista">{lista.map(s => <FilaEpica key={s.e.id} s={s} hoy={hoy} reprogramar={reprogramar} abrir={abrir} abrirEpica={abrirEpica} />)}</div>
        : <div className="md-card"><p className="md-sub">Todas tus épicas van al día.</p></div>}
      {resto > 0 && <p className="md-meta md-mt8">{todas ? 'Viendo todas' : `${resto} van al día o en pausa`} · <button type="button" className="md-link" onClick={() => setTodas(v => !v)}>{todas ? 'Solo las que piden atención' : 'Ver todas'}</button></p>}
    </section>
  )
}

function FilaEpica({ s, hoy, reprogramar, abrir, abrirEpica }: { s: SaludEpica; hoy: string; reprogramar: (id: string, plan: string | null) => Promise<void>; abrir: (id: string) => void; abrirEpica: (id: string) => void }) {
  const color = s.estado === 'vencidas' ? 'var(--md-rojo)' : s.estado === 'al_dia' ? 'var(--md-verde)' : s.estado === 'quieta' || s.estado === 'pausa' ? 'var(--md-tenue)' : 'var(--md-ambar)'
  // Lo que conviene mover: la vencida o atrasada más vieja; si no hay, el siguiente paso.
  const abiertas = (s.e.tasks || []).filter(t => ABIERTA(t) && t.status !== 'Esperando')
  const foco = s.estado === 'vencidas' ? abiertas.filter(t => t.due && t.due < hoy).sort((a, b) => a.due!.localeCompare(b.due!))[0]
    : s.estado === 'atrasadas' ? abiertas.filter(t => t.plan && t.plan < hoy).sort((a, b) => a.plan!.localeCompare(b.plan!))[0]
    : s.siguiente
  const t = foco || s.siguiente
  const porque = !t ? null : t.due && t.due < hoy ? `venció el ${corta(t.due)}` : t.plan && t.plan < hoy ? `agendada el ${corta(t.plan)}` : t.plan === hoy ? 'agendada hoy' : t.plan ? `agendada el ${corta(t.plan)}` : null
  const av = avanceEpica(s.e, hoy)
  return (
    <div className="md-row md-ep">
      <span className="md-dot" style={{ background: s.e.color || color }} />
      <div className="md-grow">
        <div className="md-entre"><button type="button" className="md-abrir md-fuerte" onClick={() => abrirEpica(s.e.id)} title="Ver el tablero de la épica">{s.e.name}</button><span className="md-meta" style={{ color }}>{s.etiqueta}</span></div>
        {av.total > 0 && (
          <div className="md-ep-av" title={`${av.hechas} de ${av.total} tareas terminadas`}>
            <div className="md-ep-barra"><div style={{ width: `${av.pct}%`, background: s.e.color || 'var(--md-verde)' }} /></div>
            <span className="md-meta">{av.hechas}/{av.total}{av.semana > 0 && <span className="md-ep-sem"> · +{av.semana} esta semana</span>}</span>
          </div>
        )}
        {t
          ? <div className="md-meta">Siguiente: {t.id ? <button type="button" className="md-abrir md-abrir-chico" onClick={() => abrir(t.id!)}>{t.t}</button> : t.t}{porque ? ` · ${porque}` : ''}</div>
          : <div className="md-meta">Sin siguiente paso · <Link className="md-link" href={`/epicas?e=${encodeURIComponent(s.e.id)}`}>agregar uno</Link></div>}
      </div>
      {t?.id && t.plan !== hoy && <button type="button" className="md-btn md-chico" title="Agendar este paso para hoy" onClick={() => reprogramar(t.id!, hoy)}>Hoy</button>}
    </div>
  )
}

type VistaTab = 'abiertas' | 'atrasadas' | 'esperando' | 'hechas' | 'todas'
/** Avance de un objetivo de la épica (0–100). */
function pctObjetivo(k: EpicaMilestone, e: Epica): number {
  if (k.done) return 100
  if (k.tipo === 'hito') return k.hitoEstado === 'logrado' ? 100 : k.hitoEstado === 'en_curso' ? 50 : 0
  if (k.auto === 'tareas') {
    const ts = (e.tasks || []).filter(t => t.status !== 'Archivada' && (!k.taskIds?.length || k.taskIds.includes(t.id || '')))
    return ts.length ? Math.round(ts.filter(t => t.status === 'Terminada').length / ts.length * 100) : 0
  }
  if (k.target == null || k.current == null) return 0
  if (k.lowerIsBetter && k.start != null && k.start !== k.target) return Math.max(0, Math.min(100, Math.round((k.start - k.current) / (k.start - k.target) * 100)))
  return k.target ? Math.max(0, Math.min(100, Math.round(k.current / k.target * 100))) : 0
}
const UNIDAD: Partial<Record<string, string>> = { pesos: '$', usd: 'US$', porcentaje: '%', dias: 'días', meses: 'meses', kg: 'kg', horas: 'h' }

/** Pop-up con el tablero de una épica: cómo va, todas sus tareas con filtros, por feature e iniciativa,
 *  los próximos 14 días y objetivos. Las tareas abren su ficha aquí; «Ir a la épica» baja a su sección en Épicas. */
type CuandoF = '' | 'sin' | 'hoy' | 'semana' | 'despues' | 'atrasada' | `dia:${string}`
type FiltrosEp = { cuando: CuandoF; feat: string | null; ini: string | null; prio: '' | 'alta' | 'media' | 'baja' | 'sin'; estado: '' | 'Por hacer' | 'En curso'; dif: '' | 'facil' | 'media' | 'dificil'; quien: string }
const SIN_FILTROS: FiltrosEp = { cuando: '', feat: null, ini: null, prio: '', estado: '', dif: '', quien: '' }
const minDe = (t: EpicaTask) => t.estMin ?? WEEK_EST_MIN(t.difficulty)
const horas = (m: number) => m >= 60 ? `${Math.round(m / 30) / 2} h` : `${m} min`
const diasDe = (t: EpicaTask) => [t.plan, ...(t.dayPlans || []).map(d => d.day)].filter(Boolean) as string[]
const quienDe = (t: EpicaTask) => t.personaNombre || (t.responsable && t.responsable.trim().toLowerCase() !== 'yo' ? t.responsable.trim() : '')

function EpicaTablero({ e, hoy, tapada, cerrar, abrir, terminar, reprogramar, crear }: {
  e: Epica; hoy: string; tapada: boolean; cerrar: () => void; abrir: (id: string) => void; terminar: (id: string) => Promise<void>; reprogramar: (id: string, plan: string | null) => Promise<void>
  crear: (epicaId: string, titulo: string, extra: { featureId?: string; iniciativaId?: string; plan?: string }) => Promise<string | null>
}) {
  useEffect(() => {
    const h = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !tapada) cerrar() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [cerrar, tapada])
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o } }, [])

  const color = e.color || 'var(--md-acento)'
  const vivas = (e.tasks || []).filter(t => t.status !== 'Archivada')
  const abiertas = vivas.filter(ABIERTA)
  const av = avanceEpica(e, hoy)
  const vencidas = abiertas.filter(t => t.due && t.due < hoy)
  const atrasadas = abiertas.filter(t => t.status !== 'Esperando' && t.plan && t.plan < hoy && !(t.due && t.due < hoy))
  const enCurso = abiertas.filter(t => t.status === 'En curso').length
  const minPend = abiertas.filter(t => t.status !== 'Esperando').reduce((n, t) => n + minDe(t), 0)
  const ult = vivas.map(t => (t.doneAt || t.updatedAt || t.createdAt || '').slice(0, 10)).filter(Boolean).sort().pop()
  const diasQuieta = ult ? Math.max(0, diasHasta(ult, hoy)) : null
  const proxVence = abiertas.filter(t => t.due && t.due >= hoy).sort((a, b) => a.due!.localeCompare(b.due!))[0]
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const fin = sumarDias(hoy, -7 * (7 - i)), ini = sumarDias(fin, -6)
    return { ini, n: vivas.filter(t => { const d = (t.doneAt || '').slice(0, 10); return t.status === 'Terminada' && d >= ini && d <= fin }).length }
  })
  const maxSem = Math.max(1, ...semanas.map(x => x.n))
  const objetivos = (e.kpis || []).filter(k => k.t)
  const features = (e.features || [])
  const idsFeat = new Set(features.map(f => f.id))
  const nombreF = (id?: string) => id ? features.find(f => f.id === id)?.t : undefined
  const iniDe = (t: EpicaTask) => t.iniciativaId ? features.flatMap(f => f.iniciativas || []).find(i => i.id === t.iniciativaId) : undefined
  const personas = [...new Set(vivas.map(quienDe).filter(Boolean))].sort()
  const pr = (p?: string) => (p === 'alta' ? 0 : p === 'baja' ? 2 : 1)
  const rango = (t: EpicaTask) => (t.due && t.due < hoy ? 0 : t.plan && t.plan < hoy ? 1 : t.plan === hoy ? 2 : t.plan ? 3 : 4)
  const porque = (t: EpicaTask) => t.due && t.due < hoy ? `venció el ${corta(t.due)}` : t.plan && t.plan < hoy ? `agendada el ${corta(t.plan)}` : t.plan === hoy ? 'hoy' : t.plan ? corta(t.plan) : t.due ? `vence ${corta(t.due)}` : 'sin fecha'

  // ── Lista con filtros ──
  const [vista, setVista] = useState<VistaTab>('abiertas')
  const [f, setF] = useState<FiltrosEp>(SIN_FILTROS)
  const [panel, setPanel] = useState(false)
  const [orden, setOrden] = useState<'urgencia' | 'fecha' | 'prioridad' | 'feature' | 'reciente'>('urgencia')
  const [q, setQ] = useState('')
  const [mas, setMas] = useState(false)
  const poner = (k: Partial<FiltrosEp>) => { setF(x => ({ ...x, ...k })); setMas(false) }
  const finSemana = sumarDias(hoy, 6)
  const esAtrasada = (t: EpicaTask) => ABIERTA(t) && t.status !== 'Esperando' && ((!!t.due && t.due < hoy) || (!!t.plan && t.plan < hoy))
  const DE_VISTA: Record<VistaTab, (t: EpicaTask) => boolean> = {
    abiertas: t => ABIERTA(t) && t.status !== 'Esperando', atrasadas: esAtrasada, esperando: t => t.status === 'Esperando', hechas: t => t.status === 'Terminada', todas: () => true,
  }
  const pasa = (t: EpicaTask, sin?: keyof FiltrosEp) => {
    const ds = diasDe(t)
    if (sin !== 'cuando' && f.cuando) {
      if (f.cuando === 'sin' && ds.length) return false
      if (f.cuando === 'hoy' && !ds.includes(hoy)) return false
      if (f.cuando === 'semana' && !ds.some(d => d >= hoy && d <= finSemana)) return false
      if (f.cuando === 'despues' && !ds.some(d => d > finSemana)) return false
      if (f.cuando === 'atrasada' && !esAtrasada(t)) return false
      if (f.cuando.startsWith('dia:') && !ds.includes(f.cuando.slice(4))) return false
    }
    if (sin !== 'feat' && f.feat !== null && (f.feat === '' ? !!t.featureId && idsFeat.has(t.featureId) : t.featureId !== f.feat)) return false
    if (sin !== 'ini' && f.ini !== null && (f.ini === '' ? !!t.iniciativaId : t.iniciativaId !== f.ini)) return false
    if (sin !== 'prio' && f.prio && (f.prio === 'sin' ? !!t.priority : t.priority !== f.prio)) return false
    if (sin !== 'estado' && f.estado && t.status !== f.estado) return false
    if (sin !== 'dif' && f.dif && t.difficulty !== f.dif) return false
    if (sin !== 'quien' && f.quien && quienDe(t) !== f.quien) return false
    return true
  }
  const qn = sinAcentos(q.trim())
  const base = vivas.filter(t => pasa(t)).filter(t => !qn || sinAcentos(`${t.t} ${t.note || ''} ${t.resumen || ''}`).includes(qn))
  const cuenta = (v: VistaTab) => base.filter(DE_VISTA[v]).length
  const lista = base.filter(DE_VISTA[vista]).sort((a, b) => {
    if (orden === 'reciente' || (vista === 'hechas' && orden === 'urgencia')) return (b.doneAt || b.updatedAt || b.createdAt || '').localeCompare(a.doneAt || a.updatedAt || a.createdAt || '')
    if (ABIERTA(a) !== ABIERTA(b)) return ABIERTA(a) ? -1 : 1
    if (orden === 'fecha') return (a.plan || a.due || '9').localeCompare(b.plan || b.due || '9')
    if (orden === 'prioridad') return pr(a.priority) - pr(b.priority) || rango(a) - rango(b)
    if (orden === 'feature') return (nombreF(a.featureId) || '~').localeCompare(nombreF(b.featureId) || '~') || (iniDe(a)?.nombre || '~').localeCompare(iniDe(b)?.nombre || '~') || rango(a) - rango(b)
    return rango(a) - rango(b) || (a.due || a.plan || '9').localeCompare(b.due || b.plan || '9') || pr(a.priority) - pr(b.priority)
  })
  const VISIBLES = 10
  const visibles = mas ? lista : lista.slice(0, VISIBLES)
  const minLista = lista.filter(ABIERTA).reduce((n, t) => n + minDe(t), 0)
  const irA = (v: VistaTab) => { setVista(v); setMas(false) }
  // Qué hay en cada opción (con los demás filtros puestos), para no ofrecer filtros que dejan la lista vacía.
  const nCon = (k: keyof FiltrosEp, val: FiltrosEp[keyof FiltrosEp]) => vivas.filter(DE_VISTA[vista])
    .filter(t => pasa(t, k) && pasaCon(t, { ...f, [k]: val } as FiltrosEp, k) && (!qn || sinAcentos(`${t.t} ${t.note || ''} ${t.resumen || ''}`).includes(qn))).length
  function pasaCon(t: EpicaTask, g: FiltrosEp, k: keyof FiltrosEp) {
    const ds = diasDe(t)
    switch (k) {
      case 'cuando': return !g.cuando || (g.cuando === 'sin' ? !ds.length : g.cuando === 'hoy' ? ds.includes(hoy) : g.cuando === 'semana' ? ds.some(d => d >= hoy && d <= finSemana) : g.cuando === 'despues' ? ds.some(d => d > finSemana) : g.cuando === 'atrasada' ? esAtrasada(t) : ds.includes(g.cuando.slice(4)))
      case 'feat': return g.feat === null || (g.feat === '' ? !t.featureId || !idsFeat.has(t.featureId) : t.featureId === g.feat)
      case 'ini': return g.ini === null || (g.ini === '' ? !t.iniciativaId : t.iniciativaId === g.ini)
      case 'prio': return !g.prio || (g.prio === 'sin' ? !t.priority : t.priority === g.prio)
      case 'estado': return !g.estado || t.status === g.estado
      case 'dif': return !g.dif || t.difficulty === g.dif
      default: return !g.quien || quienDe(t) === g.quien
    }
  }
  const iniciativas = (f.feat ? features.filter(x => x.id === f.feat) : features).flatMap(x => (x.iniciativas || []).map(i => ({ i, fT: x.t })))
  const activos: { k: keyof FiltrosEp; t: string }[] = [
    f.cuando ? { k: 'cuando' as const, t: f.cuando === 'sin' ? 'Sin fecha' : f.cuando === 'hoy' ? 'Hoy' : f.cuando === 'semana' ? 'Esta semana' : f.cuando === 'despues' ? 'Más adelante' : f.cuando === 'atrasada' ? 'Atrasadas' : cap(diaLargo(f.cuando.slice(4))) } : null,
    f.feat !== null ? { k: 'feat' as const, t: f.feat === '' ? 'Sin feature' : nombreF(f.feat) || 'Feature' } : null,
    f.ini !== null ? { k: 'ini' as const, t: f.ini === '' ? 'Sin iniciativa' : iniciativas.find(x => x.i.id === f.ini)?.i.nombre || 'Iniciativa' } : null,
    f.prio ? { k: 'prio' as const, t: f.prio === 'sin' ? 'Sin prioridad' : `Prioridad ${f.prio}` } : null,
    f.estado ? { k: 'estado' as const, t: f.estado } : null,
    f.dif ? { k: 'dif' as const, t: f.dif === 'facil' ? 'Fácil' : f.dif === 'media' ? 'Dificultad media' : 'Difícil' } : null,
    f.quien ? { k: 'quien' as const, t: f.quien } : null,
  ].filter(Boolean) as { k: keyof FiltrosEp; t: string }[]
  const quitar = (k: keyof FiltrosEp) => poner(k === 'feat' ? { feat: null, ini: null } : { [k]: SIN_FILTROS[k] } as Partial<FiltrosEp>)
  const metaDe = (t: EpicaTask) => {
    const sub = t.subtasks?.length ? `${t.subtasks.filter(x => x.done).length}/${t.subtasks.length} subtareas` : null
    const ubic = [orden === 'feature' ? null : nombreF(t.featureId), iniDe(t)?.nombre].filter(Boolean).join(' › ')
    if (t.status === 'Terminada') return [t.doneAt ? `cerrada el ${corta(t.doneAt.slice(0, 10))}` : 'terminada', ubic].filter(Boolean).join(' · ')
    if (t.status === 'Esperando') return [`esperando${quienDe(t) ? ` a ${quienDe(t)}` : ''}`, t.waitingSince ? `desde el ${corta(t.waitingSince.slice(0, 10))}` : null, ubic].filter(Boolean).join(' · ')
    return [porque(t), ubic, t.status === 'En curso' ? 'en curso' : null, t.priority === 'alta' ? 'alta' : null, sub, minDe(t) ? horas(minDe(t)) : null].filter(Boolean).join(' · ')
  }
  // Próximos 14 días: cuántas tareas hay agendadas cada día (toca uno para ver solo ese).
  const dias14 = Array.from({ length: 14 }, (_, i) => { const d = sumarDias(hoy, i); return { d, n: abiertas.filter(t => diasDe(t).includes(d)).length } })
  const max14 = Math.max(1, ...dias14.map(x => x.n))
  const feats = features.map(x => {
    const ts = vivas.filter(t => t.featureId === x.id)
    return { x, total: ts.length, hechas: ts.filter(t => t.status === 'Terminada').length, abiertas: ts.filter(ABIERTA).length }
  }).filter(y => y.total > 0 || y.x.estado !== 'cerrado')
  const sinFeatureAb = abiertas.filter(t => !t.featureId || !idsFeat.has(t.featureId)).length

  // ── Agregar tarea rápida (con el feature/iniciativa del filtro) ──
  const [nueva, setNueva] = useState('')
  const [nuevaHoy, setNuevaHoy] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const agregar = async () => {
    const t = nueva.trim(); if (!t || guardando) return
    setGuardando(true)
    try {
      const id = await crear(e.id, t, { featureId: f.feat || undefined, iniciativaId: f.ini || undefined, plan: nuevaHoy ? hoy : undefined })
      setNueva(''); if (id && vista !== 'abiertas' && vista !== 'todas') setVista('abiertas')
    } finally { setGuardando(false) }
  }
  const destino = `/epicas?e=${encodeURIComponent(e.id)}${f.feat ? `&fe=${encodeURIComponent(f.feat)}` : ''}&ir=epica`

  return (
    <div className="md-velo" onClick={cerrar}>
      <div className="md-tablero md-fade" role="dialog" aria-modal="true" aria-label={`Épica ${e.name}`} onClick={ev => ev.stopPropagation()} style={{ ['--ep' as string]: color }}>
        <div className="md-tab-cab">
          <div className="md-grow">
            <p className="md-kicker" style={{ color }}>Épica · {e.status || 'En curso'}</p>
            <h2 className="md-tab-tit">{e.name}</h2>
            {e.description && <p className="md-sub md-mt4">{e.description}</p>}
            <p className="md-meta md-mt4">{[minPend ? `~${horas(minPend)} de trabajo pendiente` : null, proxVence ? `próximo vencimiento: ${proxVence.t} (${corta(proxVence.due!)})` : null, diasQuieta != null ? (diasQuieta === 0 ? 'se movió hoy' : `último movimiento hace ${diasQuieta} ${diasQuieta === 1 ? 'día' : 'días'}`) : null].filter(Boolean).join(' · ')}</p>
          </div>
          <Link className="md-btn md-chico md-tab-ir" href={destino}>Ir a la épica →</Link>
          <button type="button" className="md-icobtn" onClick={cerrar} aria-label="Cerrar">✕</button>
        </div>

        <div className="md-kpis">
          <div className="md-kpi" role="button" tabIndex={0} data-on={vista === 'hechas'} onClick={() => irA('hechas')} onKeyDown={ev => ev.key === 'Enter' && irA('hechas')}>
            <div className="md-anillo" style={{ background: `conic-gradient(${color} ${av.pct * 3.6}deg, var(--md-linea2) 0)` }}><span>{av.pct}%</span></div>
            <div><b>{av.hechas} de {av.total}</b><span>terminadas</span></div>
          </div>
          <div className="md-kpi" role="button" tabIndex={0} data-on={vista === 'abiertas'} onClick={() => irA('abiertas')} onKeyDown={ev => ev.key === 'Enter' && irA('abiertas')}><b>{abiertas.length}</b><span>abiertas{enCurso ? ` · ${enCurso} en curso` : ''}</span></div>
          <div className="md-kpi" role="button" tabIndex={0} data-on={vista === 'atrasadas'} onClick={() => irA('atrasadas')} onKeyDown={ev => ev.key === 'Enter' && irA('atrasadas')} data-tono={vencidas.length ? 'rojo' : atrasadas.length ? 'ambar' : undefined}><b>{vencidas.length + atrasadas.length}</b><span>{vencidas.length ? `${vencidas.length} vencidas` : ''}{vencidas.length && atrasadas.length ? ' · ' : ''}{atrasadas.length ? `${atrasadas.length} atrasadas` : ''}{!vencidas.length && !atrasadas.length ? 'nada atrasado' : ''}</span></div>
          <div className="md-kpi" data-tono={av.semana ? 'verde' : undefined}><b>{av.semana ? `+${av.semana}` : '0'}</b><span>terminadas esta semana</span></div>
        </div>

        <div className="md-tab-grid">
          <div>
            <div className="md-filtros" role="tablist" aria-label="Qué tareas ver">
              {([['abiertas', 'Abiertas'], ['atrasadas', 'Atrasadas'], ['esperando', 'Esperando'], ['hechas', 'Terminadas'], ['todas', 'Todas']] as [VistaTab, string][]).map(([v, l]) => {
                const n = cuenta(v)
                return (v === 'abiertas' || v === 'todas' || v === vista || n > 0) && (
                  <button key={v} type="button" role="tab" aria-selected={vista === v} data-on={vista === v} data-tono={v === 'atrasadas' ? 'rojo' : undefined} onClick={() => irA(v)}>{l}<span>{n}</span></button>
                )
              })}
            </div>
            <div className="md-herr">
              <input className="md-buscar" type="search" value={q} onChange={ev => { setQ(ev.target.value); setMas(false) }} placeholder="Buscar" aria-label="Buscar tareas" />
              <button type="button" className="md-btn md-chico md-fbtn" data-on={panel || activos.length > 0} aria-expanded={panel} onClick={() => setPanel(v => !v)}>Filtros{activos.length ? ` · ${activos.length}` : ''}</button>
              <select className="md-orden" value={orden} onChange={ev => setOrden(ev.target.value as typeof orden)} aria-label="Ordenar">
                <option value="urgencia">{vista === 'hechas' ? 'Recientes' : 'Urgentes'}</option>
                <option value="fecha">Fecha</option>
                <option value="prioridad">Prioridad</option>
                <option value="feature">Feature</option>
                <option value="reciente">Movidas hace poco</option>
              </select>
            </div>

            {panel && (
              <div className="md-fpanel md-fade">
                <FGrupo t="Cuándo">
                  {([['', 'Todas'], ['hoy', 'Hoy'], ['semana', 'Esta semana'], ['despues', 'Más adelante'], ['sin', 'Sin fecha'], ['atrasada', 'Atrasadas']] as [CuandoF, string][]).map(([v, l]) => (
                    <FChip key={l} on={f.cuando === v} n={v ? nCon('cuando', v) : undefined} onClick={() => poner({ cuando: v })}>{l}</FChip>
                  ))}
                </FGrupo>
                {features.length > 0 && (
                  <FGrupo t="Feature">
                    <FChip on={f.feat === null} onClick={() => poner({ feat: null, ini: null })}>Todos</FChip>
                    {features.map(x => { const n = nCon('feat', x.id); return (n > 0 || f.feat === x.id) && <FChip key={x.id} on={f.feat === x.id} n={n} dot={x.color || color} onClick={() => poner({ feat: f.feat === x.id ? null : x.id, ini: null })}>{x.t}</FChip> })}
                    {nCon('feat', '') > 0 && <FChip on={f.feat === ''} n={nCon('feat', '')} onClick={() => poner({ feat: f.feat === '' ? null : '', ini: null })}>Sin feature</FChip>}
                  </FGrupo>
                )}
                {iniciativas.length > 0 && (
                  <FGrupo t="Iniciativa">
                    <FChip on={f.ini === null} onClick={() => poner({ ini: null })}>Todas</FChip>
                    {iniciativas.map(({ i, fT }) => { const n = nCon('ini', i.id); return (n > 0 || f.ini === i.id) && <FChip key={i.id} on={f.ini === i.id} n={n} onClick={() => poner({ ini: f.ini === i.id ? null : i.id })}>{f.feat ? i.nombre : `${fT} › ${i.nombre}`}</FChip> })}
                    {nCon('ini', '') > 0 && <FChip on={f.ini === ''} n={nCon('ini', '')} onClick={() => poner({ ini: f.ini === '' ? null : '' })}>Sin iniciativa</FChip>}
                  </FGrupo>
                )}
                <FGrupo t="Prioridad">
                  {([['', 'Todas'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja'], ['sin', 'Sin prioridad']] as [FiltrosEp['prio'], string][]).map(([v, l]) => (
                    <FChip key={l} on={f.prio === v} n={v ? nCon('prio', v) : undefined} onClick={() => poner({ prio: v })}>{l}</FChip>
                  ))}
                </FGrupo>
                {vista !== 'esperando' && vista !== 'hechas' && (
                  <FGrupo t="Estado">
                    {([['', 'Todos'], ['Por hacer', 'Por hacer'], ['En curso', 'En curso']] as [FiltrosEp['estado'], string][]).map(([v, l]) => (
                      <FChip key={l} on={f.estado === v} n={v ? nCon('estado', v) : undefined} onClick={() => poner({ estado: v })}>{l}</FChip>
                    ))}
                  </FGrupo>
                )}
                <FGrupo t="Dificultad">
                  {([['', 'Todas'], ['facil', 'Fácil'], ['media', 'Media'], ['dificil', 'Difícil']] as [FiltrosEp['dif'], string][]).map(([v, l]) => (
                    <FChip key={l} on={f.dif === v} n={v ? nCon('dif', v) : undefined} onClick={() => poner({ dif: v })}>{l}</FChip>
                  ))}
                </FGrupo>
                {personas.length > 0 && (
                  <FGrupo t="Persona">
                    <FChip on={!f.quien} onClick={() => poner({ quien: '' })}>Todas</FChip>
                    {personas.map(x => <FChip key={x} on={f.quien === x} n={nCon('quien', x)} onClick={() => poner({ quien: f.quien === x ? '' : x })}>{x}</FChip>)}
                  </FGrupo>
                )}
                <div className="md-entre md-mt8">
                  <button type="button" className="md-link" disabled={!activos.length} onClick={() => { setF(SIN_FILTROS); setMas(false) }}>Quitar filtros</button>
                  <button type="button" className="md-btn md-chico" onClick={() => setPanel(false)}>Ver {lista.length}</button>
                </div>
              </div>
            )}

            {!panel && activos.length > 0 && (
              <div className="md-activos">
                {activos.map(a => <button key={a.k} type="button" className="md-activo" onClick={() => quitar(a.k)} aria-label={`Quitar filtro ${a.t}`}>{a.t}<span aria-hidden>✕</span></button>)}
                <button type="button" className="md-link" onClick={() => { setF(SIN_FILTROS); setMas(false) }}>Quitar todos</button>
              </div>
            )}

            <p className="md-meta md-conteo">{lista.length} {lista.length === 1 ? 'tarea' : 'tareas'}{minLista ? ` · ~${horas(minLista)}` : ''}{q ? ` con «${q}»` : ''}</p>
            {visibles.length
              ? <div className="md-card md-lista">{visibles.map((t, i) => {
                  const grupo = orden === 'feature' && (i === 0 || visibles[i - 1].featureId !== t.featureId) ? (nombreF(t.featureId) || 'Sin feature') : null
                  return (
                    <Fragment key={t.id || i}>
                      {grupo && <p className="md-grupo">{grupo}</p>}
                      <FilaTarea titulo={t.t} meta={metaDe(t)} color={t.status === 'Esperando' ? 'var(--md-linea)' : color} hecha={t.status === 'Terminada'}
                        marcar={t.id && t.status !== 'Esperando' ? () => terminar(t.id!) : undefined} abrir={t.id ? () => abrir(t.id!) : undefined}>
                        {t.id && ABIERTA(t) && t.status !== 'Esperando' && t.plan !== hoy && <div className="md-acciones"><button type="button" className="md-btn md-chico" onClick={() => reprogramar(t.id!, hoy)}>Hoy</button></div>}
                      </FilaTarea>
                    </Fragment>
                  )
                })}</div>
              : <div className="md-card"><p className="md-sub">{q || activos.length ? 'Nada con esos filtros.' : vista === 'atrasadas' ? 'Nada atrasado. Bien.' : 'No hay tareas aquí.'}</p></div>}
            {lista.length > VISIBLES && <button type="button" className="md-btn md-ancho md-mt8" onClick={() => setMas(v => !v)}>{mas ? 'Ver menos' : `Ver las ${lista.length}`}</button>}

            <form className="md-agregar" onSubmit={ev => { ev.preventDefault(); agregar() }}>
              <input value={nueva} onChange={ev => setNueva(ev.target.value)} placeholder={`＋ Agregar tarea${f.feat ? ` en ${nombreF(f.feat)}` : ` a ${e.name}`}`} aria-label="Nueva tarea" maxLength={200} />
              <button type="button" className="md-btn md-chico" data-on={nuevaHoy} onClick={() => setNuevaHoy(v => !v)} title="Agendarla para hoy">{nuevaHoy ? '✓ Hoy' : 'Hoy'}</button>
              <button type="submit" className="md-btn md-chico md-primario" disabled={!nueva.trim() || guardando}>{guardando ? '…' : 'Agregar'}</button>
            </form>
          </div>

          <div>
            <div className="md-lbl"><span>Próximos 14 días</span>{f.cuando.startsWith('dia:') ? <button type="button" className="md-link" onClick={() => poner({ cuando: '' })}>Ver todos</button> : <span>{dias14.reduce((n, x) => n + x.n, 0)} agendadas</span>}</div>
            <div className="md-card md-dias14">
              {dias14.map(x => {
                const dt = fechaDe(x.d)
                return (
                  <button key={x.d} type="button" className="md-dia14" data-on={f.cuando === `dia:${x.d}`} data-hoy={x.d === hoy} disabled={!x.n} onClick={() => poner({ cuando: f.cuando === `dia:${x.d}` ? '' : `dia:${x.d}` })} title={`${cap(diaLargo(x.d))}: ${x.n} ${x.n === 1 ? 'tarea' : 'tareas'}`}>
                    <span className="md-dia14-l">{DN3[dt.getDay()]}</span>
                    <span className="md-dia14-barra"><i style={{ height: `${x.n ? Math.max(18, x.n / max14 * 100) : 0}%` }} /></span>
                    <span className="md-dia14-n">{dt.getDate()}</span>
                  </button>
                )
              })}
            </div>

            <div className="md-lbl md-mt12"><span>Ritmo · 8 semanas</span><span>{semanas.reduce((n, x) => n + x.n, 0)} terminadas</span></div>
            <div className="md-card md-ritmo" aria-label="Tareas terminadas por semana">
              {semanas.map((x, i) => (
                <div key={x.ini} className="md-ritmo-col" title={`Semana del ${corta(x.ini)}: ${x.n}`}>
                  <span className="md-ritmo-n">{x.n || ''}</span>
                  <div className="md-ritmo-bar" style={{ height: `${Math.max(4, x.n / maxSem * 100)}%`, opacity: i === 7 ? 1 : .55 }} />
                  <span className="md-ritmo-l">{i === 7 ? 'esta' : corta(x.ini).split(' ')[0]}</span>
                </div>
              ))}
            </div>

            {(feats.length > 0 || sinFeatureAb > 0) && <>
              <div className="md-lbl md-mt12"><span>Por feature</span><span className="md-meta">toca para filtrar</span></div>
              <div className="md-card md-lista">
                {feats.map(({ x, total, hechas, abiertas: ab }) => (
                  <div key={x.id} className="md-feat-caja" data-on={f.feat === x.id}>
                    <button type="button" className="md-row md-feat md-feat-btn" onClick={() => poner({ feat: f.feat === x.id ? null : x.id, ini: null })} title="Ver solo las tareas de este feature">
                      <span className="md-dot" style={{ background: x.color || color }} />
                      <div className="md-grow">
                        <div className="md-entre"><span>{x.t}</span><span className="md-meta">{total ? `${hechas}/${total}` : 'sin tareas'}</span></div>
                        <div className="md-ep-barra md-feat-barra"><div style={{ width: `${total ? Math.round(hechas / total * 100) : 0}%`, background: x.color || color }} /></div>
                        {ab > 0 && <span className="md-meta">{ab} abiertas{x.estado === 'en_riesgo' ? ' · en riesgo' : x.estado === 'en_pausa' ? ' · en pausa' : ''}</span>}
                      </div>
                    </button>
                    {!!x.iniciativas?.length && (
                      <div className="md-inis">
                        {x.iniciativas.map(i => {
                          const ts = vivas.filter(t => t.iniciativaId === i.id)
                          return <button key={i.id} type="button" className="md-ini" data-on={f.ini === i.id} onClick={() => poner({ feat: x.id, ini: f.ini === i.id ? null : i.id })} title={`Iniciativa · ${i.estado}`}>{i.nombre}<span>{ts.filter(t => t.status === 'Terminada').length}/{ts.length}</span></button>
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {sinFeatureAb > 0 && <button type="button" className="md-link md-feat-sin" onClick={() => poner({ feat: f.feat === '' ? null : '', ini: null })}>{sinFeatureAb} abiertas sin feature{f.feat === '' ? ' · quitar filtro' : ' · ver'}</button>}
              </div>
            </>}

            {objetivos.length > 0 && <>
              <div className="md-lbl md-mt12"><span>Objetivos</span><span>{objetivos.length}</span></div>
              <div className="md-card md-lista">
                {objetivos.map(k => {
                  const pct = pctObjetivo(k, e)
                  const u = k.unit === 'otro' ? k.unitLabel || '' : UNIDAD[k.unit || ''] || ''
                  const val = k.tipo === 'hito' ? (k.hitoEstado === 'logrado' ? 'logrado' : k.hitoEstado === 'en_curso' ? 'en curso' : 'pendiente')
                    : k.auto === 'tareas' ? `${pct}%` : k.target != null ? `${k.current ?? 0} de ${k.target} ${u}`.trim() : ''
                  return (
                    <div key={k.id} className="md-row md-feat">
                      <div className="md-grow">
                        <div className="md-entre"><span>{k.t}</span><span className="md-meta">{val}</span></div>
                        <div className="md-ep-barra md-feat-barra"><div style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--md-verde)' : color }} /></div>
                        {k.due && <span className="md-meta">{k.due < hoy && pct < 100 ? `venció el ${corta(k.due)}` : `para el ${corta(k.due)}`}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>}
          </div>
        </div>

        <div className="md-tab-pie">
          <button type="button" className="md-btn" onClick={cerrar}>Cerrar</button>
          <Link className="md-btn md-primario" href={destino}>Ir a {f.feat && nombreF(f.feat) ? `${nombreF(f.feat)} en` : 'la épica en'} Épicas →</Link>
        </div>
      </div>
    </div>
  )
}

function FGrupo({ t, children }: { t: string; children: React.ReactNode }) {
  return <div className="md-fgrupo"><span className="md-fgrupo-t">{t}</span><div className="md-fgrupo-ops">{children}</div></div>
}
function FChip({ on, n, dot, onClick, children }: { on: boolean; n?: number; dot?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="md-fchip" data-on={on} onClick={onClick} disabled={!on && n === 0}>
      {dot && <i style={{ background: dot }} />}{children}{n != null && <span>{n}</span>}
    </button>
  )
}

/** Tu gente: cumpleaños, aniversarios de momentos y planes que vienen (Mi Vida). */
function TuGente({ gente, hoy }: { gente?: Gente[]; hoy: string }) {
  if (!gente) return null
  const COLOR = { cumple: 'var(--md-verde)', plan: 'var(--md-azul)', momento: 'var(--md-ambar)' }
  const cuando = (g: Gente) => g.dias === 0 ? 'hoy' : g.dias === 1 ? 'mañana' : g.dias < 7 ? DN[fechaDe(g.fecha).getDay()] : `${corta(g.fecha)} · en ${g.dias} días`
  return (
    <section>
      <div className="md-lbl"><span>Tu gente · lo que viene</span><a className="md-link" href="https://mi-vida-neon.vercel.app/vida?vista=personas" target="_blank" rel="noopener noreferrer">Personas ↗</a></div>
      {gente.length === 0
        ? <div className="md-card"><p className="md-sub">Sin cumpleaños, aniversarios ni planes en las próximas semanas. <a className="md-link" href="https://mi-vida-neon.vercel.app/vida?vista=planes" target="_blank" rel="noopener noreferrer">Armar un plan ↗</a></p></div>
        : (
          <div className="md-card md-lista">
            {gente.map(g => {
              const tel = g.tipo === 'cumple' ? waNumero(g.celular) : null
              return (
                <div key={g.id} className="md-row" data-hoy={g.fecha === hoy}>
                  <span className="md-dot" style={{ background: COLOR[g.tipo] }} />
                  <div className="md-grow">{g.titulo}<div className="md-meta"><span className={g.dias <= 1 ? 'md-fuerte' : ''}>{cuando(g)}</span>{g.detalle ? ` · ${g.detalle}` : ''}</div></div>
                  {g.tipo === 'cumple' && g.dias <= 1 && <a className="md-btn md-chico" href={`https://wa.me/${tel || ''}?text=${encodeURIComponent('¡Feliz cumpleaños! 🎉')}`} target="_blank" rel="noopener noreferrer">{g.dias === 0 ? 'Felicitar' : 'Preparar'}</a>}
                </div>
              )
            })}
          </div>
        )}
    </section>
  )
}

/** Lo que Claude cambió anoche en tus notas y lo que guardó de tus respuestas, en un solo plegable. */
function AnocheBoveda({ cambios, aprendido }: { cambios: { que: string; nota: string }[]; aprendido: DiaAprendido[] }) {
  if (!cambios.length && !aprendido.length) return null
  const resumen = [cambios.length ? `${cambios.length} ${cambios.length === 1 ? 'nota cambiada' : 'notas cambiadas'}` : null,
    aprendido.length ? `${aprendido.length} ${aprendido.length === 1 ? 'respuesta guardada' : 'respuestas guardadas'}` : null].filter(Boolean).join(' · ')
  return (
    <details className="md-card md-plegable">
      <summary><span>Anoche en tu bóveda</span><span className="md-meta">{resumen}</span></summary>
      {cambios.length > 0 && (
        <>
          <p className="md-kicker md-mt12">Qué cambió Claude</p>
          <div className="md-lista">
            {cambios.map((c, i) => <div key={i} className="md-row"><div className="md-grow">{c.que}<div className="md-meta">{c.nota}</div></div><a className="md-icobtn" href={obsidianUrl(c.nota)} aria-label={`Abrir ${c.nota}`}>↗</a></div>)}
          </div>
        </>
      )}
      {aprendido.length > 0 && (
        <>
          <p className="md-kicker md-mt12">Lo que aprendió de tus respuestas</p>
          <div className="md-lista">
            {aprendido.slice(0, 8).map(a => (
              <div key={a.id} className="md-row">
                <span className="md-ico" aria-hidden style={{ color: a.guardadoAt ? 'var(--md-verde)' : 'var(--md-tenue)' }}>{a.guardadoAt ? '✓' : '◷'}</span>
                <div className="md-grow">{a.pregunta}<div className="md-meta">«{a.respuesta}» · {a.guardadoAt ? <>en {a.nota ? <a className="md-link" href={obsidianUrl(a.nota)}>{a.nota}</a> : 'tu bóveda'}</> : <>se guarda a las 3:00</>}</div></div>
              </div>
            ))}
          </div>
          <p className="md-meta md-mt8">Claude relee esto cada madrugada: no te vuelve a preguntar lo mismo.</p>
        </>
      )}
    </details>
  )
}

function TiraSemana({ dia, hoy, fecha, elegir }: { dia: DiaGet; hoy: string; fecha: string; elegir: (f: string) => void }) {
  const cal = new Map(dia.cierres.map(c => [c.fecha, c.calificacion]))
  // Semana de lunes a domingo que contiene el día que estás viendo.
  const lunes = sumarDias(fecha, -((fechaDe(fecha).getDay() + 6) % 7))
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
  const n = racha(dia.cierres.filter(c => c.calificacion != null).map(c => c.fecha), hoy)
  const mes = (() => { const a = fechaDe(dias[0]), b = fechaDe(dias[6]); return a.getMonth() === b.getMonth() ? cap(MN[a.getMonth()]) : `${cap(MN[a.getMonth()]).slice(0, 3)} – ${cap(MN[b.getMonth()]).slice(0, 3)}` })()
  return (
    <div className="md-tira">
      <div className="md-entre md-tira-cab">
        <button className="md-icobtn" onClick={() => elegir(sumarDias(fecha, -7))} aria-label="Semana anterior">‹</button>
        <span className="md-meta">{mes}{fecha !== hoy && <> · <button className="md-link" onClick={() => elegir(hoy)}>Volver a hoy</button></>}</span>
        <button className="md-icobtn" onClick={() => elegir(sumarDias(fecha, 7))} aria-label="Semana siguiente">›</button>
      </div>
      <div className="md-semana" role="tablist" aria-label="Elige un día">
        {dias.map(d => {
          const c = cal.get(d)
          const tono = c == null ? 'var(--md-tenue)' : c >= 7 ? 'var(--md-verde)' : 'var(--md-ambar)'
          return (
            <button key={d} role="tab" aria-selected={d === fecha} className="md-dia" data-sel={d === fecha} data-hoy={d === hoy} data-futuro={d > hoy} onClick={() => elegir(d)}>
              {DN3[fechaDe(d).getDay()]}<b>{fechaDe(d).getDate()}</b>
              <span style={{ color: d === hoy ? 'var(--md-acento)' : tono }}>{d === hoy ? 'hoy' : c != null ? c : d < hoy ? '·' : ' '}</span>
            </button>
          )
        })}
      </div>
      {n >= 2 && fecha === hoy && <p className="md-meta md-centro-txt">{n} días seguidos cerrando tu día</p>}
    </div>
  )
}

/** Ayer en corto: la frase y, si quieres, lo que hiciste. */
function AyerCorto({ data }: { data: DiaData }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="md-ayer md-mt8">
      <p className="md-kicker">{data.diario ? cap(diaLargo(data.diario)) : 'Ayer'}</p>
      <p className="md-ayer-frase">{data.frase}</p>
      {data.hechos.length > 0 && (
        <>
          <button className="md-link" onClick={() => setAbierto(v => !v)} aria-expanded={abierto}>{abierto ? 'Ocultar' : `Lo que hiciste (${data.hechos.length})`}</button>
          {abierto && (
            <ul className="md-ul md-fade">
              {data.hechos.map((h, i) => <li key={i}>{h.t}{h.nota && <> · <a className="md-link" href={obsidianUrl(h.nota)}>{h.nota} ↗</a></>}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/** Otro día de la tira: si ya pasó, cómo te fue; si viene, qué tienes agendado. Solo para ver. */
function VistaOtroDia({ fecha, hoy, otro, epicas, cumples, cierre, volver }: {
  fecha: string; hoy: string; otro: DiaGet | null; epicas: Epica[] | null; cumples: Cumple[]; cierre: number | null; volver: () => void
}) {
  const pasado = fecha < hoy
  const data = otro?.resumen?.data ?? null
  const tareas = useMemo(() => {
    const hechas: { e: Epica; t: EpicaTask }[] = [], agendadas: { e: Epica; t: EpicaTask }[] = [], vencen: { e: Epica; t: EpicaTask }[] = []
    for (const e of epicas || []) {
      if (e.archived) continue
      for (const t of e.tasks || []) {
        if (t.status === 'Terminada' && t.doneAt?.slice(0, 10) === fecha) hechas.push({ e, t })
        else if (ABIERTA(t) && (t.plan === fecha || t.dayPlans?.some(d => d.day === fecha))) agendadas.push({ e, t })
        else if (ABIERTA(t) && t.due === fecha) vencen.push({ e, t })
      }
    }
    return { hechas, agendadas, vencen }
  }, [epicas, fecha])
  const cumpleHoy = cumples.filter(c => c.cumple?.slice(5) === fecha.slice(5))
  const Lista = ({ titulo, xs, vacio }: { titulo: string; xs: { e: Epica; t: EpicaTask }[]; vacio?: string }) => (xs.length || vacio) ? (
    <section>
      <div className="md-lbl"><span>{titulo}</span><span>{xs.length || ''}</span></div>
      {xs.length ? (
        <div className="md-card md-lista">
          {xs.map(({ e, t }) => <div key={t.id} className="md-row"><span className="md-dot" style={{ background: e.color || 'var(--md-linea)' }} /><div className="md-grow">{t.t}<div className="md-meta">{e.name}</div></div></div>)}
        </div>
      ) : <p className="md-meta">{vacio}</p>}
    </section>
  ) : null

  return (
    <div className="md-fade">
      <div className="md-entre md-base md-mt12">
        <h1 className="md-fecha">{cap(diaLargo(fecha))}</h1>
        {cierre != null && <span className="md-meta">Le diste {cierre}/10</span>}
      </div>
      <p className="md-meta md-mt4">{pasado ? `Hace ${-diasHasta(hoy, fecha)} ${diasHasta(hoy, fecha) === -1 ? 'día' : 'días'}` : `En ${diasHasta(hoy, fecha)} ${diasHasta(hoy, fecha) === 1 ? 'día' : 'días'}`} · <button className="md-link" onClick={volver}>Volver a hoy</button></p>
      {cumpleHoy.length > 0 && <div className="md-chips">{cumpleHoy.map(c => <span key={c.id} className="md-chip md-tono-verde">Cumple de {c.apodo || c.nombre.split(' ')[0]}</span>)}</div>}

      <div className="md-grid">
        <div className="md-col">
          {pasado && !otro && <div className="md-card md-sk md-mt12" style={{ height: 120 }} />}
          {pasado && otro && (data ? (
            <section>
              <div className="md-lbl"><span>Lo que armó Claude esa mañana</span><span>{data.diario ? `diario del ${fechaDe(data.diario).getDate()}` : ''}</span></div>
              <div className="md-card">
                <p className="md-ayer-frase">{data.frase}</p>
                {data.hechos.length > 0 && <ul className="md-ul">{data.hechos.map((h, i) => <li key={i}>{h.t}</li>)}</ul>}
                {data.prioridades.length > 0 && (
                  <>
                    <p className="md-kicker md-mt12">Tus 3 de ese día</p>
                    <ul className="md-ul">{data.prioridades.map((x, i) => {
                      const t = x.tareaId ? (epicas || []).flatMap(e => e.tasks || []).find(tt => tt.id === x.tareaId) : undefined
                      const estado = !t ? (x.tareaId ? null : 'sin tarea ligada') : !ABIERTA(t) ? null : t.plan && t.plan > fecha ? (t.plan === hoy ? 'sigue hoy' : `pasó al ${corta(t.plan)}`) : 'quedó sin terminar'
                      return <li key={i}>{t && !ABIERTA(t) ? '✓ ' : ''}{t?.t || x.t}{estado && <span className="md-meta"> · {estado}</span>}</li>
                    })}</ul>
                  </>
                )}
              </div>
            </section>
          ) : <div className="md-card md-mt12"><p className="md-sub">Ese día todavía no había resumen de Mi día.</p></div>)}
          {!pasado && <Lista titulo="Agendado para ese día" xs={tareas.agendadas} vacio="Nada agendado todavía. Agenda desde Épicas o desde las tarjetas de Decide." />}
          {!pasado && <Lista titulo="Vence ese día" xs={tareas.vencen} />}
        </div>
        <div className="md-col">
          {pasado && <Lista titulo="Terminaste" xs={tareas.hechas} vacio="No hay tareas terminadas ese día." />}
          {pasado && <Lista titulo="Se quedó agendado sin terminar" xs={tareas.agendadas} />}
          {!pasado && <p className="md-meta md-mt12"><Link className="md-link" href="/epicas">Abrir Épicas para agendar →</Link></p>}
        </div>
      </div>
    </div>
  )
}


function BotonMic({ d, grande }: { d: ReturnType<typeof useDictado>; grande?: boolean }) {
  return (
    <button type="button" className={`md-mic${grande ? ' md-mic-grande' : ''}`} data-on={d.escuchando} onClick={d.escuchando ? d.parar : d.iniciar}
      aria-label={d.escuchando ? 'Dejar de dictar' : 'Dictar con la voz'} title={d.escuchando ? 'Dejar de dictar' : 'Dictar con la voz'}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
      {grande && <span>{d.escuchando ? 'Escuchando… toca para parar' : 'Dictar'}</span>}
    </button>
  )
}

function Agenda({ eventos, hoy }: { eventos: Evento[] | null; hoy: string }) {
  if (!eventos) return null
  const ini = fechaDe(hoy).setHours(8, 0, 0, 0), fin = fechaDe(hoy).setHours(21, 0, 0, 0), total = fin - ini
  const hoyEv = eventos.filter(e => !e.allDay && e.start && e.end && new Date(e.end).getTime() > ini && new Date(e.start).getTime() < fin)
    .map(e => ({ ...e, a: Math.max(ini, new Date(e.start).getTime()), b: Math.min(fin, new Date(e.end!).getTime()) }))
    .sort((x, y) => x.a - y.a)
  // Reuniones que se enciman van en carriles (antes se pintaban una encima de otra).
  const finCarril: number[] = []
  const conCarril = hoyEv.map(e => {
    let c = finCarril.findIndex(f => f <= e.a); if (c < 0) { c = finCarril.length; finCarril.push(0) }
    finCarril[c] = e.b
    return { ...e, carril: c }
  })
  const carriles = Math.max(1, finCarril.length)
  const pos = (h: number) => `${((fechaDe(hoy).setHours(h, 0, 0, 0) - ini) / total) * 100}%`
  const ahora = Date.now()
  return (
    <section>
      <div className="md-lbl"><span>Tu agenda</span><span>{hoyEv.length ? `${hoyEv.length} ${hoyEv.length === 1 ? 'reunión' : 'reuniones'}` : 'sin reuniones'}</span></div>
      <div className="md-agenda" aria-label="Agenda de 8 a 21 h">
        {conCarril.map((e, i) => (
          <div key={i} className="md-evento" title={`${e.title || 'Reunión'} · ${hora(e.start)}`} style={{ left: `${((e.a - ini) / total) * 100}%`, width: `${Math.max(1.5, ((e.b - e.a) / total) * 100)}%`, top: `${(e.carril / carriles) * 100}%`, bottom: 'auto', height: `${100 / carriles}%` }}>
            <span>{e.title || 'Reunión'}</span>
          </div>
        ))}
        {ahora > ini && ahora < fin && <div className="md-ahora-linea" style={{ left: `${((ahora - ini) / total) * 100}%` }} />}
      </div>
      <div className="md-meta md-mt4" style={{ position: 'relative', height: 16 }} aria-hidden>
        {[8, 12, 16, 21].map(h => <span key={h} style={{ position: 'absolute', left: pos(h), transform: h === 8 ? 'none' : h === 21 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{h}</span>)}
      </div>
      {hoyEv.length > 0 && (
        <div className="md-mt8">
          {hoyEv.slice(0, 4).map((e, i) => <div key={i} className="md-meta">{hora(e.start)} · {e.title || 'Reunión'}</div>)}
        </div>
      )}
    </section>
  )
}

/** La épica cuyo nombre aparece en lo que escribiste (palabras de 4+ letras). Sin coincidencia: ninguna. */
const sinAcentos = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Feature de la épica que mejor le queda al texto (palabras de 4+ letras en común). Sin coincidencia, ninguno. */
function featureSugerido(texto: string, e: Epica) {
  const t = ` ${sinAcentos(texto).replace(/[^a-z0-9ñ]+/g, ' ')} `
  let mejor: { id: string } | null = null, max = 0
  for (const f of e.features || []) {
    if (f.estado === 'cerrado') continue
    const pal = sinAcentos(`${f.t} ${(f.iniciativas || []).map(i => i.nombre).join(' ')}`).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 4)
    const n = new Set(pal.filter(w => t.includes(` ${w} `) || t.includes(` ${w}s `))).size
    if (n > max) { max = n; mejor = f }
  }
  return mejor
}
/** UUID fijo a partir de un texto (dos dispositivos crean la MISMA tarea, no dos). */
function idEstable(texto: string): string {
  const h = (seed: number) => { let a = 0xdeadbeef ^ seed, b = 0x41c6ce57 ^ seed; for (let i = 0; i < texto.length; i++) { const ch = texto.charCodeAt(i); a = Math.imul(a ^ ch, 2654435761); b = Math.imul(b ^ ch, 1597334677) } a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909); return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0') }
  const x = h(1) + h(2)
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-${'89ab'[parseInt(x[16], 16) % 4]}${x.slice(17, 20)}-${x.slice(20, 32)}`
}

function sugerirEpica(texto: string, epicas: Epica[]): Epica | null {
  const t = ` ${sinAcentos(texto).replace(/[^a-z0-9ñ]+/g, ' ')} `
  if (t.trim().length < 4) return null
  let mejor: Epica | null = null, max = 0
  for (const e of epicas) {
    const pal = sinAcentos(e.name).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 4)
    const n = pal.filter(w => t.includes(` ${w} `) || t.includes(` ${w}s `)).length
    if (n > max) { max = n; mejor = e }
  }
  return mejor
}

const CUANDO: [PlanRapido, string][] = [['', 'Sin fecha'], ['hoy', 'Hoy'], ['manana', 'Mañana']]

/** Cuadro de abajo. Sin botón: va al inbox de Obsidian (00-inbox) a las 3:00, donde el cierre revisa cada idea.
 *  «Diario»: va a la nota del día. «＋ Tarea»: la vuelve tarea YA en una épica. «Idea»: a la libreta /ideas. */
function Anotar({ capturar, pendientes, epicas, crearRapida }: {
  capturar: (t: string, tipo?: TipoCaptura) => Promise<void>; pendientes: number; epicas: Epica[] | null
  crearRapida: (titulo: string, epicaId: string, cuando: PlanRapido) => Promise<string>
}) {
  const [t, setT] = useState('')
  const [estado, setEstado] = useState<'' | 'guardando' | string>('')
  const [ok, setOk] = useState('')
  const [comoTarea, setComoTarea] = useState(false)
  const [comoIdea, setComoIdea] = useState(false)    // va directo a Ideas (/ideas), no al diario
  const [comoDiario, setComoDiario] = useState(false) // a la nota del día (08-diario) en vez del inbox
  const [epicaId, setEpicaId] = useState('')        // '' = «Del diario»
  const [elegida, setElegida] = useState(false)     // ya la escogiste tú: no se cambia sola
  const [cuando, setCuando] = useState<PlanRapido>('')
  const d = useDictado(f => setT(v => juntar(v, f)))
  const activas = useMemo(() => (epicas || []).filter(e => !e.archived && e.name.trim().toLowerCase() !== 'del diario')
    .sort((a, b) => a.name.localeCompare(b.name, 'es')), [epicas])
  const sugerida = useMemo(() => (comoTarea ? sugerirEpica(t, activas) : null), [comoTarea, t, activas])
  useEffect(() => { if (!elegida) setEpicaId(sugerida?.id || '') }, [sugerida, elegida])

  const enviar = async () => {
    if (d.escuchando) d.parar()
    const v = t.trim(); if (!v) { setEstado(comoTarea ? 'Escribe la tarea primero' : 'Escribe o dicta algo primero'); return }
    setEstado('guardando'); setOk('')
    try {
      if (comoIdea) {
        const j = await postJSON<{ ok: boolean; error?: string; needsMigration?: boolean }>('/api/ideas', { texto: v.slice(0, 2000) })
        if (!j.ok) throw new Error(j.needsMigration ? 'Falta la tabla de ideas en tu base.' : j.error || 'No se guardó la idea')
        setOk('Idea guardada en tu libreta de Ideas.')
        setComoIdea(false)
      } else if (comoTarea) {
        const nombre = await crearRapida(v, epicaId, cuando)
        setOk(`Tarea creada en «${nombre}»${cuando ? (cuando === 'hoy' ? ', para hoy' : ', para mañana') : ''}. Queda anotada en tu nota de Obsidian a las 3:00.`)
      } else if (comoDiario) {
        await capturar(v, 'nota')
        setOk('Guardado. Llega a tu nota del día en Obsidian a las 3:00.')
      } else {
        await capturar(v, 'inbox')
        setOk('Guardado. Llega a tu inbox de Obsidian a las 3:00; ahí se revisa si ya la tenías o si es un pendiente.')
      }
      setT(''); setEstado(''); setComoTarea(false); setComoDiario(false); setElegida(false); setCuando('')
      setTimeout(() => setOk(''), 5000)
    } catch (e) { setEstado(e instanceof Error ? e.message : String(e)) }
  }
  const mostrado = d.parcial ? juntar(t, d.parcial) : t
  const guardando = estado === 'guardando'
  return (
    <div className="md-anotar-wrap">
      {comoTarea && (
        <div className="md-anotar-tarea md-fade">
          <label className="md-anotar-campo">
            <span className="md-meta">Épica{sugerida && epicaId === sugerida.id && !elegida ? ' · sugerida' : ''}</span>
            <select className="md-input" value={epicaId} onChange={e => { setEpicaId(e.target.value); setElegida(true) }} aria-label="Épica de la tarea">
              <option value="">Del diario (sin épica clara)</option>
              {activas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <div className="md-anotar-campo">
            <span className="md-meta">¿Cuándo?</span>
            <div className="md-fila" role="radiogroup" aria-label="Cuándo">
              {CUANDO.map(([v, l]) => <button key={v || 'sin'} type="button" role="radio" aria-checked={cuando === v} className="md-btn md-chico" data-on={cuando === v} onClick={() => setCuando(v)}>{l}</button>)}
            </div>
          </div>
        </div>
      )}
      <form className="md-anotar" data-escuchando={d.escuchando} data-tarea={comoTarea} onSubmit={e => { e.preventDefault(); enviar() }}>
        <BotonMic d={d} />
        <input value={mostrado} onChange={e => { setT(e.target.value); if (estado && !guardando) setEstado('') }}
          placeholder={d.escuchando ? 'Te escucho…' : comoTarea ? 'La tarea, con verbo: «Llamar al abogado…»' : 'Anotar algo… o toca el micrófono y habla'} aria-label={comoTarea ? 'Tarea nueva' : 'Anotar algo'} />
        <button type="button" className="md-tarea-tog" data-on={comoTarea} aria-pressed={comoTarea} onClick={() => { setComoTarea(v => !v); setComoIdea(false); setComoDiario(false); setEstado('') }}
          title="Volverla tarea en una épica">{comoTarea ? 'Tarea ✓' : '＋ Tarea'}</button>
        <button type="button" className="md-tarea-tog" data-on={comoIdea} aria-pressed={comoIdea} onClick={() => { setComoIdea(v => !v); setComoTarea(false); setComoDiario(false); setEstado('') }}
          title="Guardarla en tu libreta de Ideas">{comoIdea ? 'Idea ✓' : 'Idea'}</button>
        <button type="button" className="md-tarea-tog" data-on={comoDiario} aria-pressed={comoDiario} onClick={() => { setComoDiario(v => !v); setComoTarea(false); setComoIdea(false); setEstado('') }}
          title="Mandarla a tu nota del día en vez del inbox">{comoDiario ? 'Diario ✓' : 'Diario'}</button>
        <button className="md-enviar" aria-label={comoTarea ? 'Crear tarea' : 'Guardar'} disabled={guardando}>↑</button>
      </form>
      <p className="md-meta md-centro-txt" aria-live="polite">
        {d.error ? <span className="md-err-txt">{d.error}</span>
          : d.escuchando ? 'Escuchando. Toca el micrófono para parar y luego ↑ para guardar.'
          : guardando ? 'Guardando…'
          : estado ? <span className="md-err-txt">{estado}</span>
          : ok ? <span className="md-ok-txt">{ok}</span>
          : comoTarea ? '↑ crea la tarea ahora mismo en esa épica.'
          : comoIdea ? <>↑ la guarda en <Link className="md-link" href="/ideas">Ideas</Link>.</>
          : comoDiario ? '↑ la manda a tu nota del día (llega a las 3:00).'
          : pendientes ? `${pendientes} ${pendientes === 1 ? 'nota' : 'notas'} esperando el cierre de las 3:00 · sin botón va a tu inbox` : 'Sin botón va a tu inbox de Obsidian.'}
      </p>
    </div>
  )
}

/* ── Noche ── */
function VistaNoche({ dia, data, hoy, prioridades, respaldo, tareaDe, marcar, puedeMarcar, capturar, calificar, reprogramar }: {
  dia: DiaGet; data: DiaData | null; hoy: string; prioridades: DiaPrioridad[]; respaldo: { e: Epica; t: EpicaTask }[]
  tareaDe: (p: DiaPrioridad) => { e: Epica; t: EpicaTask } | null; toggleHecha: (id: string) => Promise<void>
  marcar: (x: DiaPrioridad) => Promise<void>; puedeMarcar: (x: DiaPrioridad) => boolean
  capturar: (t: string, tipo?: TipoCaptura) => Promise<void>; calificar: (n: number) => Promise<void>
  reprogramar: (tareaId: string, plan: string | null) => Promise<void>
}) {
  const manana = sumarDias(hoy, 1)
  const previa = dia.cierres.find(c => c.fecha === hoy)?.calificacion ?? null
  const [nota, setNota] = useState<number | null>(previa)
  const [texto, setTexto] = useState('')
  const dictado = useDictado(f => setTexto(v => juntar(v, f)))
  const [resp, setResp] = useState('')
  const [err, setErr] = useState('')
  const [listo, setListo] = useState(false)
  const [conTexto, setConTexto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const tres = prioridades.length ? prioridades.map(p => ({ p, hit: tareaDe(p) })) : respaldo.map(hit => ({ p: { t: hit.t.t, tareaId: hit.t.id, porque: '' } as DiaPrioridad, hit }))
  const hechas = tres.filter(x => x.hit && hechaHoy(x.hit.t, hoy)).length

  const cerrar = async () => {
    if (!nota) { setErr('Elige cómo estuvo tu día (1 a 10)'); return }
    // Lo que platicas es opcional: con la calificación basta (puedes dictar en Obsidian).
    // Si el dictado sigue abierto, se guarda también lo que iba diciendo.
    const platica = (dictado.parcial ? juntar(texto, dictado.parcial) : texto).trim()
    if (dictado.escuchando) dictado.parar()
    setGuardando(true); setErr('')
    try {
      await calificar(nota)
      if (platica) await capturar(platica, 'cierre')
      setConTexto(!!platica)
      if (resp.trim() && data?.pregunta) await capturar(`Pregunta: ${data.pregunta}\nRespuesta: ${resp.trim()}`, 'pregunta')
      setListo(true)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setGuardando(false) }
  }

  if (listo) return (
    <div className="md-card md-noche-fin md-fade">
      <p className="md-luna" aria-hidden>☾</p>
      <p className="md-frase md-sin-margen">Listo, descansa</p>
      <p className="md-sub">Le diste {nota} a tu día. {conTexto ? 'A las 3:00 Claude acomoda lo que platicaste en tu nota de Obsidian y mañana te espera tu día armado.' : 'A las 3:00 Claude arma tu día de mañana con lo que haya en tu nota de Obsidian.'}</p>
    </div>
  )
  return (
    <div className="md-noche md-fade">
      <p className="md-kicker">{cap(diaLargo(hoy))}</p>
      <h1 className="md-fecha">Cierra tu día</h1>
      {tres.length > 0 && (
        <>
          <div className="md-card md-lista md-mt12">
            {tres.map((x, i) => {
              const hecha = !!x.hit && hechaHoy(x.hit.t, hoy)
              return (
                <div key={i} className="md-row md-noche-fila">
                  <button className="md-check md-grow" data-hecha={hecha} disabled={!puedeMarcar(x.p)} onClick={() => marcar(x.p)}>
                    <span className="md-caja" aria-hidden>{hecha ? '✓' : ''}</span><span className="md-grow">{x.hit?.t.t || x.p.t}</span>
                  </button>
                  {hecha ? <span className="md-meta">hecha</span>
                    : x.hit?.t.id && x.hit.t.plan === manana ? <span className="md-meta">pasa a mañana</span>
                    : x.hit?.t.id ? (
                      <span className="md-noche-mover">
                        <button type="button" className="md-link" onClick={() => reprogramar(x.hit!.t.id!, manana)} title="Agendarla para mañana">Mañana</button>
                        <button type="button" className="md-link md-tenue" onClick={() => reprogramar(x.hit!.t.id!, null)} title="Quitarla del plan (sigue en su épica)">Soltar</button>
                      </span>
                    ) : <span className="md-meta">mañana</span>}
                </div>
              )
            })}
          </div>
          <p className="md-meta md-mt8">{hechas} de {tres.length}. Lo que no hiciste: pásalo a mañana o suéltalo; si no, Claude te lo vuelve a proponer.</p>
        </>
      )}
      <div className="md-lbl"><span>¿Cómo estuvo?</span><span>{nota ?? ''}</span></div>
      <div className="md-escala" role="radiogroup" aria-label="Calificación del día">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
          <button key={v} role="radio" aria-checked={nota === v} data-on={nota === v} onClick={() => { setNota(v); setErr('') }}>{v}</button>
        ))}
      </div>
      <div className="md-lbl"><span>Platícame tu día</span><span>opcional · dictado o escrito</span></div>
      <BotonMic d={dictado} grande />
      {dictado.error && <p className="md-err-txt md-mt4">{dictado.error}</p>}
      <textarea className="md-input md-area md-mt8" rows={7} value={dictado.parcial ? juntar(texto, dictado.parcial) : texto} onChange={e => { setTexto(e.target.value); setErr('') }}
        placeholder="Hoy hablé con el abogado nuevo, me pidió los papeles del departamento…" aria-label="Tu día" />
      <p className="md-meta md-mt4">Toca «Dictar» y habla; se escribe solo. También puedes dictar en tu nota de Obsidian, como siempre.</p>
      {data?.pregunta && (
        <>
          <div className="md-lbl"><span>Una pregunta para conocerte</span><span>opcional</span></div>
          <div className="md-card">
            <p className="md-pregunta">{data.pregunta}</p>
            <textarea className="md-input md-area md-mt8" rows={2} value={resp} onChange={e => setResp(e.target.value)} aria-label="Tu respuesta" placeholder="Tu respuesta" />
          </div>
        </>
      )}
      {err && <p className="md-err-txt md-mt8" role="alert">{err}</p>}
      <button className="md-btn md-primario md-ancho" disabled={guardando} onClick={cerrar}>{guardando ? 'Guardando…' : 'Cerrar el día'}</button>
    </div>
  )
}

/* ── Semana ── */
function VistaSemana({ dia, hoy, epicas }: { dia: DiaGet; hoy: string; epicas: Epica[] | null }) {
  const cal = new Map(dia.cierres.map(c => [c.fecha, c.calificacion]))
  const califSemana = dia.cierres.filter(c => c.calificacion != null && c.fecha >= sumarDias(hoy, -6))
  const prom = califSemana.length ? Math.round(califSemana.reduce((s, c) => s + (c.calificacion || 0), 0) / califSemana.length * 10) / 10 : null
  const nRacha = racha(dia.cierres.filter(c => c.calificacion != null).map(c => c.fecha), hoy)
  const hechos = dia.semana.reduce((s, x) => s + (x.data.hechos?.length || 0), 0)
  const kpis = (
    <div className="md-kpis md-mt12">
      <div><b>{prom ?? '—'}</b><span>promedio (1–10)</span></div>
      <div><b>{nRacha ? `${nRacha} ${nRacha === 1 ? 'día' : 'días'}` : '—'}</b><span>racha cerrando el día</span></div>
      <div><b>{hechos || '—'}</b><span>cosas hechas</span></div>
    </div>
  )
  const graficas = <div className="md-card md-mt12" style={{ padding: '16px 18px' }}><TuSemana dia={dia} epics={epicas} hoy={hoy} /></div>
  if (!dia.semana.length) return <div className="md-fade"><h1 className="md-fecha">Tu semana</h1>{kpis}{graficas}<div className="md-card md-mt12"><p className="md-h3">Tu semana aparece aquí</p><p className="md-sub">Cada mañana se agrega el día anterior: lo que hiciste y lo que quedó.</p></div></div>
  return (
    <div className="md-fade">
      <h1 className="md-fecha">Tu semana</h1>
      {kpis}
      {graficas}
      <div className="md-linea-tiempo md-mt12">
        {dia.semana.map(s => {
          const d = s.data.diario || sumarDias(s.fecha, -1)
          const c = cal.get(d)
          return (
            <article key={s.fecha} className="md-lt-item">
              <div className="md-lt-punto" style={{ background: c == null ? 'var(--md-linea)' : c >= 7 ? 'var(--md-verde)' : 'var(--md-ambar)' }} />
              <div className="md-entre"><span className="md-fuerte">{cap(diaLargo(d))}</span>{c != null && <span className="md-meta">{c}/10</span>}</div>
              <p className="md-sub md-mt4">{s.data.frase}</p>
              {s.data.hechos.length > 0 && <ul className="md-ul">{s.data.hechos.slice(0, 5).map((h, i) => <li key={i}>{h.t}</li>)}</ul>}
            </article>
          )
        })}
      </div>
      {dia.semana.length < 7 && <p className="md-meta md-mt12">Se completa sola: {7 - dia.semana.length} días más y tienes tu primera semana entera. Hoy es {diaLargo(hoy)}.</p>}
    </div>
  )
}

/* ── Bóveda ── */
function VistaBoveda({ dia, hoy, respuestas, responder, deshacer, aviso }: {
  dia: DiaGet; hoy: string; respuestas: Map<string, DiaRespuesta>
  responder: (itemId: string, tipo: string, estado: EstadoRespuesta, extra?: { respuesta?: unknown; tareaId?: string }) => Promise<void>
  deshacer: (itemId: string) => Promise<void>; aviso: (a: Aviso) => void
}) {
  const b = dia.boveda
  const cerebro = <>
    {dia.cerebro ? <CuidaCerebro c={dia.cerebro} hoy={hoy} respuestas={respuestas} responder={responder} deshacer={deshacer} aviso={aviso} /> : null}
    <TodoFunciona salud={dia.resumen?.data.salud} />
  </>
  if (!b) return <div className="md-fade" id="boveda">{cerebro}<div className="md-card md-mt12"><p className="md-h3">Lo que tienes que revisar en tu bóveda</p><p className="md-sub">Aparece después del primer cierre de las 3:00 (sale de <code>por-revisar</code>, en tarjetas).</p></div></div>
  return (
    <div className="md-fade" id="boveda">
      {cerebro}
      <h1 className="md-fecha md-mt24">Por revisar</h1>
      <p className="md-meta">Al {diaLargo(b.fecha)} · se corrige en la nota de origen, no aquí</p>
      <div className="md-card md-lista md-mt12">{b.resumen.map((r, i) => <div key={i} className="md-row"><span className="md-grow">{r}</span></div>)}</div>
      {b.grupos.map(g => (
        <section key={g.titulo}>
          <div className="md-lbl"><span>{g.titulo}</span><span>{g.items.length}</span></div>
          <div className="md-card md-lista">
            {g.items.slice(0, 12).map((it, i) => (
              <div key={i} className="md-row">
                <span className="md-dot" style={{ background: it.tono === 'rojo' ? 'var(--md-rojo)' : it.tono === 'ambar' ? 'var(--md-ambar)' : 'var(--md-linea2)' }} />
                <div className="md-grow">{it.titulo}{it.detalle && <div className="md-meta">{it.detalle}</div>}</div>
                {it.nota && <a className="md-icobtn" href={obsidianUrl(it.nota)} aria-label={`Abrir ${it.nota}`}>↗</a>}
              </div>
            ))}
            {g.items.length > 12 && <div className="md-row md-meta">y {g.items.length - 12} más en por-revisar</div>}
          </div>
        </section>
      ))}
      <a className="md-btn md-ancho" href={obsidianUrl('por-revisar')}>Abrir por-revisar en Obsidian ↗</a>
    </div>
  )
}

/* ── ¿Todo funciona? Lo que revisa el cierre de las 3:00 (salud.mjs, 0 tokens) ── */
function TodoFunciona({ salud }: { salud?: DiaSalud[] }) {
  if (!salud?.length) return null
  const mal = salud.filter(x => x.tono !== 'verde').length
  const orden = { rojo: 0, ambar: 1, verde: 2 } as const
  return (
    <section id="todo-funciona">
      <div className="md-lbl"><span>¿Todo funciona?</span><span>{mal ? `${mal} por revisar` : 'todo bien'}</span></div>
      <div className="md-card md-lista">
        {[...salud].sort((a, b) => orden[a.tono] - orden[b.tono]).map((x, i) => (
          <div key={i} className="md-row">
            <span className="md-dot" style={{ background: x.tono === 'rojo' ? 'var(--md-rojo)' : x.tono === 'ambar' ? 'var(--md-ambar)' : 'var(--md-verde)' }} />
            <div className="md-grow">{x.t}{x.detalle && <div className="md-meta">{x.detalle}</div>}</div>
            {x.nota && <a className="md-icobtn" href={obsidianUrl(x.nota)} aria-label={`Abrir ${x.nota}`}>↗</a>}
          </div>
        ))}
      </div>
      <p className="md-meta md-mt4">Lo revisa el cierre de las 3:00 sin gastar tokens. Lo pendiente de aplicar te lo pregunto en «Por decidir».</p>
    </section>
  )
}

/* ── Cuida tu cerebro: salud de la bóveda y arreglos de un minuto (jardin.mjs los arma y los aplica a las 3:00) ── */
const QUE_APLICA: Record<string, (o: string) => string> = {
  inbox: o => `Se mueve a ${o}`, props: o => `Queda como «${o}»`, huerfana: o => `[[${o}]] la va a enlazar`, salida: o => `Va a enlazar a [[${o}]]`,
}
function CuidaCerebro({ c, hoy, respuestas, responder, deshacer, aviso }: {
  c: CerebroDatos; hoy: string; respuestas: Map<string, DiaRespuesta>
  responder: (itemId: string, tipo: string, estado: EstadoRespuesta, extra?: { respuesta?: unknown }) => Promise<void>
  deshacer: (itemId: string) => Promise<void>; aviso: (a: Aviso) => void
}) {
  const hist = (c.historial || []).slice(-30)
  const antes = hist.length > 1 ? hist[Math.max(0, hist.length - 8)].puntaje : null
  const delta = antes != null ? c.puntaje - antes : null
  const dias14 = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, i - 13))
  const todas = [...c.tareas, ...c.repaso]
  const abiertas = todas.filter(t => !respuestas.has(`jardin:${t.id}`)).length
  const contestar = async (t: CerebroTarea, estado: EstadoRespuesta, extra: Record<string, unknown> = {}) => {
    try {
      await responder(`jardin:${t.id}`, 'jardin', estado, { respuesta: { tipo: t.tipo, ruta: t.ruta, nombre: t.nombre, menciones: t.menciones, ...extra } })
      aviso({ texto: estado === 'descartada' ? 'Listo, no te la vuelvo a sugerir' : 'Anotado: se aplica en tu bóveda a las 3:00', deshacer: () => { deshacer(`jardin:${t.id}`).catch(e => aviso({ texto: e instanceof Error ? e.message : String(e) })) } })
    } catch (e) { aviso({ texto: e instanceof Error ? e.message : String(e) }) }
  }
  const cuenta = [
    c.cuenta.inbox ? `${c.cuenta.inbox} en el inbox` : null,
    c.cuenta.sinProps ? `${c.cuenta.sinProps} sin tipo` : null,
    c.cuenta.huerfanas ? `${c.cuenta.huerfanas} sin quién las enlace` : null,
    c.cuenta.rotos ? `${c.cuenta.rotos} enlaces rotos` : null,
    c.cuenta.sinSalida ? `${c.cuenta.sinSalida} sin enlaces` : null,
    c.cuenta.viejas ? `${c.cuenta.viejas} sin tocar en 90 días` : null,
  ].filter(Boolean)
  return (
    <section>
      <h1 className="md-fecha">Tu cerebro</h1>
      <p className="md-meta">{c.notas} notas · al {diaLargo(c.fecha)} · los cambios se escriben en Obsidian a las 3:00</p>
      <div className="md-card md-mt12 md-cb-salud">
        <div className="md-cb-num">
          <span className="md-cb-puntaje">{c.puntaje}</span><span className="md-meta">/100</span>
          {delta != null && delta !== 0 && <span className={`md-chip ${delta > 0 ? 'md-tono-verde' : 'md-tono-ambar'}`}>{delta > 0 ? '+' : ''}{delta} en la semana</span>}
        </div>
        {hist.length > 1 && (
          <svg className="md-cb-linea" viewBox={`0 0 ${hist.length - 1} 100`} preserveAspectRatio="none" aria-label="Puntaje de los últimos días">
            <polyline fill="none" stroke="var(--md-acento2)" strokeWidth="3" vectorEffect="non-scaling-stroke" points={hist.map((h, i) => `${i},${100 - h.puntaje}`).join(' ')} />
          </svg>
        )}
        <div className="md-cb-stats">
          <div><b>{c.orden}</b><span>orden</span></div>
          <div><b>{c.frescura}%</b><span>al día</span></div>
          <div><b>{c.diario.racha}</b><span>{c.diario.racha === 1 ? 'día de diario' : 'días de diario'}</span></div>
        </div>
        <div className="md-cb-dias" aria-label="Diario de los últimos 14 días">
          {dias14.map(d => <span key={d} title={diaLargo(d)} data-si={c.diario.dias.includes(d)} data-hoy={d === hoy} />)}
        </div>
        {cuenta.length > 0 && <p className="md-meta md-mt8">{cuenta.join(' · ')}</p>}
      </div>

      {todas.length > 0 && (
        <>
          <div className="md-lbl"><span>Cuida tu cerebro hoy</span><span>{abiertas ? `${abiertas} de 1 min` : 'todo listo'}</span></div>
          <div className="md-cb-lista">
            {c.tareas.map(t => <TareaCerebro key={t.id} t={t} r={respuestas.get(`jardin:${t.id}`)} contestar={contestar} deshacer={() => deshacer(`jardin:${t.id}`)} />)}
          </div>
          {c.repaso.length > 0 && (
            <>
              <div className="md-lbl"><span>Repasa</span><span>lo que hace más que no tocas</span></div>
              <div className="md-cb-lista">
                {c.repaso.map(t => <TareaCerebro key={t.id} t={t} r={respuestas.get(`jardin:${t.id}`)} contestar={contestar} deshacer={() => deshacer(`jardin:${t.id}`)} />)}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

function TareaCerebro({ t, r, contestar, deshacer }: {
  t: CerebroTarea; r?: DiaRespuesta
  contestar: (t: CerebroTarea, estado: EstadoRespuesta, extra?: Record<string, unknown>) => Promise<void>
  deshacer: () => Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const dictado = useDictado(f => setTexto(v => juntar(v, f)))
  const hacer = async (estado: EstadoRespuesta, extra?: Record<string, unknown>) => {
    if (ocupado) return
    if (dictado.escuchando) dictado.parar()
    setOcupado(true); try { await contestar(t, estado, extra) } finally { setOcupado(false) }
  }
  const nota = t.tipo === 'roto' ? null : t.nombre
  if (r) {
    const x = (r.respuesta || {}) as { destino?: string; accion?: string; texto?: string }
    const op = t.opciones.find(o => o.ruta === x.destino)?.nombre || x.destino || ''
    const que = r.estado === 'descartada' ? (t.tipo === 'repaso' ? 'Otro día' : 'Ignorada')
      : t.tipo === 'repaso' ? (x.accion === 'cerrar' ? 'Se marca como cerrada' : x.accion === 'cambio' ? 'Se agrega tu actualización' : 'Sigue vigente')
      : t.tipo === 'roto' ? 'Se crea la nota en el inbox' : QUE_APLICA[t.tipo]?.(op) || 'Anotado'
    return (
      <div className="md-card md-cb-tarea" data-hecha="true">
        <div className="md-entre"><span className="md-grow"><span className="md-meta">✓ {t.titulo}</span><br />{que}{r.aplicada_at ? ' · ya quedó en Obsidian' : ' · a las 3:00'}</span>
          {!r.aplicada_at && <button type="button" className="md-link" onClick={() => { deshacer().catch(() => {}) }}>Deshacer</button>}</div>
      </div>
    )
  }
  return (
    <div className="md-card md-cb-tarea">
      <div className="md-entre md-base">
        <p className="md-h3 md-grow">{t.titulo}</p>
        {nota && <a className="md-icobtn" href={obsidianUrl(nota)} aria-label={`Abrir ${nota} en Obsidian`} title="Abrir en Obsidian">↗</a>}
      </div>
      <p className="md-sub">{t.detalle}</p>
      {t.resumen && <p className="md-cb-resumen">{t.resumen}</p>}

      {(t.tipo === 'inbox' || t.tipo === 'props' || t.tipo === 'huerfana' || t.tipo === 'salida') && (
        <div className="md-chips">
          {t.opciones.map(o => <button key={o.ruta} type="button" className="md-chip md-chip-btn" disabled={ocupado} onClick={() => hacer('respondida', { destino: o.ruta })}>{o.nombre}</button>)}
        </div>
      )}

      {(t.tipo === 'roto' || (t.tipo === 'repaso' && abierto)) && (
        <div className="md-mt8">
          <textarea className="md-input" rows={2} value={texto} onChange={e => setTexto(e.target.value)}
            placeholder={t.tipo === 'roto' ? `¿Qué es «${t.nombre}»? Una línea basta.` : '¿Qué cambió? Lo agrego al final de la nota.'} />
          <div className="md-fila md-mt8">
            {dictado.soportado && <button type="button" className="md-btn md-chico" onClick={dictado.escuchando ? dictado.parar : dictado.iniciar}>{dictado.escuchando ? '■ Parar' : '🎙 Dictar'}</button>}
            <button type="button" className="md-btn md-chico md-primario" disabled={ocupado || texto.trim().length < 3}
              onClick={() => hacer('respondida', t.tipo === 'roto' ? { texto: texto.trim() } : { accion: 'cambio', texto: texto.trim() })}>{t.tipo === 'roto' ? 'Crear la nota' : 'Guardar'}</button>
          </div>
        </div>
      )}

      <div className="md-fila md-envuelve md-mt8">
        {t.tipo === 'repaso' && !abierto && <>
          <button type="button" className="md-btn md-chico" disabled={ocupado} onClick={() => hacer('respondida', { accion: 'igual' })}>✓ Sigue igual</button>
          <button type="button" className="md-btn md-chico" disabled={ocupado} onClick={() => setAbierto(true)}>Cambió algo</button>
          <button type="button" className="md-btn md-chico" disabled={ocupado} onClick={() => hacer('respondida', { accion: 'cerrar' })}>Ya no aplica</button>
        </>}
        <button type="button" className="md-link md-tenue" disabled={ocupado} onClick={() => hacer('descartada')}>{t.tipo === 'repaso' ? 'Otro día' : 'Está bien así'}</button>
      </div>
    </div>
  )
}

function Pie({ dia }: { dia: DiaGet }) {
  const r = dia.resumen, c = dia.corrida
  if (!r && !c) return null
  const partes: string[] = []
  if (r?.data.origen === 'gemini') partes.push(`Tu Mac estaba apagada: Gemini armó tu día en la nube a las ${hora(r.procesado_at)}. Claude lo mejora con tu nota de Obsidian cuando prendas la Mac`)
  else if (r) partes.push(`Claude armó tu día a las ${hora(r.procesado_at)}`)
  if (c?.epicas) partes.push(`revisó ${c.epicas} épicas`)
  const tk = milTokens(r?.tokens); if (tk) partes.push(tk)
  if (c && !c.ok) partes.push(`la última corrida falló: ${c.mensaje || 'sin detalle'}`)
  return <p className="md-pie">{partes.join(' · ')}</p>
}

function Esqueleto() {
  return <div className="md-fade"><div className="md-card md-sk" style={{ height: 64 }} /><div className="md-card md-sk md-mt12" style={{ height: 150 }} /><div className="md-card md-sk md-mt12" style={{ height: 220 }} /></div>
}

/* ── Estilos (sistema Margen) ── */
const CSS = `
.md-root{--md-papel:#faf7f1;--md-tinta:#1c1a17;--md-tinta2:#6b645b;--md-tenue:#a49b90;--md-linea:#e2d9cb;--md-linea2:#eee6da;--md-acento:#8a4b28;--md-acento2:#b4653a;--md-suave:#f5ece2;--md-verde:#4f6238;--md-verde-bg:#eef1e6;--md-ambar:#b4653a;--md-ambar-bg:#f7ece2;--md-rojo:#8a3c2a;--md-rojo-bg:#f6e7e2;--md-azul:#2E5A9E;--md-azul-bg:#e9eef7;
  font-family:var(--dia-ui),system-ui,sans-serif;color:var(--md-tinta);font-size:15px;line-height:1.45}
.md-main{max-width:1080px;margin:18px auto 40px;padding:0 16px}
.md-tabs{display:flex;gap:4px;background:#f1ebe1;border-radius:12px;padding:4px;max-width:520px;margin:0 auto 18px}
.md-tab{flex:1;border:0;background:transparent;border-radius:9px;padding:8px 6px;font:500 13.5px var(--dia-ui);color:var(--md-tinta2);cursor:pointer;display:inline-flex;gap:6px;align-items:center;justify-content:center}
.md-tab[data-on="true"]{background:#fff;color:var(--md-tinta);box-shadow:0 1px 2px rgba(28,26,23,.08)}
.md-badge{background:var(--md-acento);color:#fff;border-radius:999px;font-size:11px;padding:1px 7px;font-weight:600}
.md-card{background:#fff;border:1px solid var(--md-linea);border-radius:16px;padding:14px 16px}
.md-lista{padding:2px 16px}
.md-bloque{display:block;margin-top:2px}
.md-row{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--md-linea2);text-align:left;width:100%;background:none;color:inherit;font:inherit}
.md-lista>.md-row:first-child,.md-lista>*:first-child .md-row{border-top:0}
.md-fila-link{text-decoration:none}.md-fila-link:hover .md-fuerte{color:var(--md-acento)}
.md-grow{flex:1;min-width:0}
.md-entre{display:flex;justify-content:space-between;align-items:center;gap:10px}
.md-base{align-items:baseline}
.md-fila{display:flex;gap:8px;align-items:center}.md-envuelve{flex-wrap:wrap}
.md-row.md-noche-fila{display:flex;align-items:center;gap:10px;padding:2px 0}.md-noche-mover{display:inline-flex;gap:12px;flex-shrink:0;font-size:13px}.md-link.md-tenue{color:var(--md-tenue)}
.md-mt24{margin-top:28px}
.md-cb-salud{display:grid;gap:10px}.md-cb-num{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.md-cb-puntaje{font-family:var(--dia-serif),Georgia,serif;font-size:44px;line-height:1;color:var(--md-acento)}
.md-cb-linea{width:100%;height:38px;display:block}
.md-cb-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.md-cb-stats div{display:flex;flex-direction:column}.md-cb-stats b{font-size:19px;font-weight:600}.md-cb-stats span{font-size:12px;color:var(--md-tenue)}
.md-cb-dias{display:flex;gap:4px}.md-cb-dias span{flex:1;height:8px;border-radius:3px;background:var(--md-linea2)}.md-cb-dias span[data-si="true"]{background:var(--md-verde)}.md-cb-dias span[data-hoy="true"]{outline:1.5px solid var(--md-acento2);outline-offset:1px}
.md-cb-lista{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.md-cb-tarea[data-hecha="true"]{background:var(--md-papel);border-style:dashed}
.md-cb-resumen{font-size:13px;color:var(--md-tinta2);background:var(--md-papel);border-radius:10px;padding:8px 10px;margin:8px 0 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
button.md-chip-btn{cursor:pointer;border:1px solid var(--md-linea);background:#fff;font:inherit;font-size:12.5px}button.md-chip-btn:hover{border-color:var(--md-acento2);color:var(--md-acento)}
.md-meta{font-size:12.5px;color:var(--md-tenue)}
.md-sub{color:var(--md-tinta2);margin:4px 0 0}
.md-h3{font-weight:600;margin:0}
.md-fuerte{font-weight:600}
.md-kicker{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--md-tenue);margin:0}
.md-fecha{font-family:var(--dia-serif),Georgia,serif;font-weight:400;font-size:34px;line-height:1.05;margin:0}
.md-frase{font-family:var(--dia-serif),Georgia,serif;font-size:27px;line-height:1.25;margin:8px 0 16px}
.md-sin-margen{margin:0 0 4px}
.md-titulo-ahora{font-family:var(--dia-serif),Georgia,serif;font-size:25px;line-height:1.2;margin:6px 0 4px}
.md-titulo-tarjeta{font-size:19px;font-weight:600;line-height:1.3;margin:14px 0 6px}
.md-pregunta{font-family:var(--dia-serif),Georgia,serif;font-size:21px;line-height:1.3;margin:0}
.md-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--md-linea);background:#fff;color:var(--md-tinta);border-radius:12px;padding:11px 14px;font:500 14px var(--dia-ui);cursor:pointer;text-decoration:none;min-height:44px;transition:background .15s,transform .08s}
.md-btn:hover{background:var(--md-papel)}.md-btn:active{transform:scale(.98)}
.md-btn:disabled{opacity:.55;cursor:default}
.md-primario{background:var(--md-tinta);color:var(--md-papel);border-color:var(--md-tinta)}.md-primario:hover{background:#34302a}
.md-chico{min-height:34px;padding:6px 11px;font-size:13px;border-radius:10px}
.md-ancho{width:100%;margin-top:16px}
.md-link{background:none;border:0;padding:0;color:var(--md-acento);font:500 13px var(--dia-ui);cursor:pointer;text-decoration:none}
.md-link-inv{color:#f3d9a6}
.md-centro{display:block;margin:12px auto 0}.md-centro-txt{text-align:center;margin:6px 0 0}
.md-icobtn{border:0;background:none;color:var(--md-tenue);cursor:pointer;font-size:16px;padding:2px 6px;text-decoration:none;border-radius:6px}.md-icobtn:hover{color:var(--md-acento);background:var(--md-suave)}
.md-icobtn:disabled{opacity:.3}
.md-ico{width:20px;text-align:center;flex:none}.md-ok{color:var(--md-verde)}
.md-num{font-family:var(--dia-serif),Georgia,serif;font-size:24px;line-height:1;width:20px;color:var(--md-tenue)}
.md-flechas{display:flex;flex-direction:column}
.md-dot{width:9px;height:9px;border-radius:50%;margin-top:6px;flex:none}
.md-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
button.md-chip{border:none;cursor:pointer;font-family:inherit}
.md-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;border-radius:14px;overflow:hidden;background:var(--md-linea);border:1px solid var(--md-linea)}
.md-kpis>div{background:#fff;padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.md-kpis b{font-family:var(--dia-serif),Georgia,serif;font-weight:400;font-size:26px;line-height:1}
.md-kpis span{font-size:11.5px;color:var(--md-tenue)}
.md-chip{font-size:12.5px;padding:5px 11px;border-radius:999px;white-space:nowrap;text-decoration:none;display:inline-block;font-weight:500}
.md-tono-ambar,.md-tipo-sugerencia,.md-tipo-evitando{background:var(--md-ambar-bg);color:var(--md-acento)}
.md-tono-rojo{background:var(--md-rojo-bg);color:var(--md-rojo)}
.md-tono-azul,.md-tipo-nuevo{background:var(--md-azul-bg);color:var(--md-azul)}
.md-tono-verde,.md-tipo-esperando{background:var(--md-verde-bg);color:var(--md-verde)}
.md-tono-gris,.md-tipo-limpieza,.md-tipo-mover{background:#f1ebe1;color:var(--md-tinta2)}
.md-lbl{display:flex;justify-content:space-between;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--md-tenue);margin:22px 2px 8px}
.md-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:0 28px;margin-top:14px}
.md-solo-mac{display:none}
@media(min-width:900px){.md-grid{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}.md-solo-mac{display:inline}}
.md-col{min-width:0}
.md-ahora{background:var(--md-papel);border-color:#e6d6bf}
.md-listo{background:var(--md-verde-bg);border-color:#cfd8bf}.md-listo .md-h3,.md-listo .md-sub{color:var(--md-verde)}
.md-decidir{display:flex;gap:16px;align-items:center;width:100%;cursor:pointer;background:var(--md-suave);border:1.5px solid var(--md-acento2);font:inherit;color:inherit;text-align:left;padding:16px 18px}
.md-decidir:hover{background:#f1e4d6}
.md-decidir-num{font-family:var(--dia-serif),Georgia,serif;font-size:24px;margin:2px 0 6px;color:var(--md-acento)}
.md-decidir-lista{margin:0;padding-left:18px;font-size:14.5px;line-height:1.5}.md-decidir-lista li{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.md-decidir-btn{flex:none;white-space:nowrap}
@media(max-width:700px){.md-decidir{flex-direction:column;align-items:stretch}.md-decidir-btn{text-align:center}}
.md-acciones{display:flex;gap:4px;flex:none;flex-wrap:wrap;justify-content:flex-end}
.md-btn-tenue{color:var(--md-tinta2)}
.md-row-pend{align-items:center}
@media(max-width:700px){.md-row-pend{flex-wrap:wrap}.md-row-pend .md-acciones{width:100%;justify-content:flex-start;padding-left:19px}.md-tarea .md-acciones{padding-left:32px}}
.md-antes{margin-top:10px}
.md-tinta{color:var(--md-tinta)}.md-tinta2{color:var(--md-tinta2)}
.md-pendientes{display:flex;justify-content:space-between;align-items:center;width:100%;margin-bottom:12px;cursor:pointer;background:var(--md-suave);border-color:#ead8c3;font:inherit;color:inherit;text-align:left}
.md-otras{margin-top:6px}
.md-check{display:flex;gap:10px;align-items:center;width:100%;background:none;border:0;padding:8px 2px;font:inherit;color:var(--md-tinta);cursor:pointer;text-align:left}
.md-check[data-hecha="true"]{color:var(--md-tenue)}.md-check[data-hecha="true"] .md-grow{text-decoration:line-through}
.md-caja{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--md-linea);display:inline-flex;align-items:center;justify-content:center;font-size:12px;flex:none;color:#fff}
.md-check[data-hecha="true"] .md-caja{background:var(--md-verde);border-color:var(--md-verde)}
.md-semana{display:flex;gap:4px}
.md-dia{flex:1;text-align:center;padding:7px 0;border-radius:12px;font-size:11px;color:var(--md-tenue)}
.md-dia b{display:block;font-weight:600;font-size:15px;color:var(--md-tinta)}
.md-dia[data-hoy="true"]{background:#fff;border:1px solid var(--md-linea)}
.md-agenda{position:relative;height:34px;border-radius:10px;background:var(--md-verde-bg);overflow:hidden}
.md-evento{position:absolute;top:0;bottom:0;background:var(--md-azul-bg);border-left:2px solid var(--md-azul);padding:0 6px;display:flex;align-items:center;overflow:hidden}
.md-evento span{font-size:11px;color:var(--md-azul);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-ahora-linea{position:absolute;top:0;bottom:0;width:2px;background:var(--md-acento)}
.md-pila-v{display:flex;flex-direction:column;gap:10px}
.md-ok-txt{color:var(--md-verde);margin:0;font-weight:500}.md-err-txt{color:var(--md-rojo)}
.md-input{border:1px solid var(--md-linea);border-radius:10px;padding:9px 12px;font:15px var(--dia-ui);background:#fff;color:var(--md-tinta);width:100%;box-sizing:border-box}
.md-input:focus,.md-anotar input:focus{outline:2px solid #e6cfa4;outline-offset:0}
.md-area{resize:vertical;line-height:1.5}
.md-plegable{margin-top:22px}.md-plegable summary{cursor:pointer;display:flex;justify-content:space-between;list-style:none;font-weight:500}
.md-plegable summary::-webkit-details-marker{display:none}
.md-anotar-wrap{position:sticky;bottom:12px;margin-top:26px;z-index:5}
@media(max-width:700px){.md-anotar-wrap{bottom:calc(92px + env(safe-area-inset-bottom))}}
.md-anotar{display:flex;gap:8px;align-items:center;background:#fff;border:1px solid var(--md-linea);border-radius:999px;box-shadow:0 10px 30px -18px rgba(28,26,23,.45);max-width:640px;margin:0 auto}
.md-anotar input{flex:1;border:0;font:15px var(--dia-ui);background:transparent;color:var(--md-tinta);min-width:0;padding:6px 0}
.md-ritual{max-width:480px;margin:0 auto}
.md-dots{display:flex;gap:6px;justify-content:center;margin:4px 0 18px}
.md-dots span{height:7px;width:7px;border-radius:4px;background:var(--md-linea);transition:width .25s}
.md-dots span[data-on="true"]{background:var(--md-tinta)}.md-dots span[data-actual="true"]{width:24px}
.md-pila{position:relative;height:290px;margin-top:10px}
.md-detras{position:absolute;inset:12px 12px -8px;background:#fbf8f3}
.md-tarjeta{position:absolute;inset:0;display:flex;flex-direction:column;animation:md-entra .22s ease-out}
.md-tarjeta .md-chip{align-self:flex-start}
.md-tres{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:8px;margin-top:22px}
.md-elige{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.md-elige .md-btn{flex:1;min-height:38px;font-size:13px}
.md-mt4{margin-top:4px}.md-mt8{margin-top:8px}.md-mt12{margin-top:12px}
.md-escala{display:grid;grid-template-columns:repeat(10,1fr);gap:4px}
.md-escala button{border:0;background:#f1ebe1;color:var(--md-tinta2);border-radius:9px;padding:10px 0;font:500 14px var(--dia-ui);cursor:pointer}
.md-escala button[data-on="true"]{background:var(--md-tinta);color:var(--md-papel)}
.md-noche{max-width:560px;margin:0 auto}
.md-noche-fin{max-width:480px;margin:30px auto;text-align:center;padding:40px 24px}
.md-luna{font-size:30px;color:var(--md-tenue);margin:0 0 6px}
.md-linea-tiempo{border-left:2px solid var(--md-linea);margin-left:6px;padding-left:20px}
.md-lt-item{position:relative;padding-bottom:22px}
.md-lt-punto{position:absolute;left:-27px;top:5px;width:12px;height:12px;border-radius:50%;border:2px solid var(--md-papel)}
.md-ul{margin:6px 0 0;padding-left:18px;color:var(--md-tinta2);font-size:14px}
.md-aviso{background:var(--md-suave);border-color:#ead8c3}
.md-error{background:var(--md-rojo-bg);border-color:#e8cbc2;color:var(--md-rojo);margin-bottom:12px}
.md-pie{text-align:center;font-size:12px;color:var(--md-tenue);margin:26px 0 0}
.md-avance{height:4px;border-radius:4px;background:var(--md-linea2);overflow:hidden;margin-top:8px}.md-avance>div{height:100%;background:var(--md-verde);border-radius:4px;transition:width .3s}
.md-abrir{background:none;border:0;padding:0;margin:0;font:inherit;color:var(--md-tinta);text-align:left;cursor:pointer;line-height:1.35}
.md-abrir:hover{color:var(--md-acento);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.md-abrir-chico{font-size:inherit;color:var(--md-tinta2)}
button.md-titulo-ahora{display:block;width:100%;font-family:var(--dia-serif),Georgia,serif;font-size:25px;line-height:1.2;margin:6px 0 4px}
.md-tarea .md-grow{min-width:0}
.md-tarea[data-hecha] .md-abrir,.md-tarea[data-hecha] .md-tarea-tit{color:var(--md-tenue);text-decoration:line-through}
.md-circ{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid var(--c);background:transparent;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;cursor:pointer;padding:0;transition:background .15s,border-color .15s}
.md-circ:hover:not(:disabled){background:color-mix(in srgb,var(--c) 22%,transparent)}
.md-circ:disabled{opacity:.4;cursor:default}
.md-tarea[data-hecha] .md-circ{background:var(--md-verde);border-color:var(--md-verde)}
.md-semana-ep{margin:-2px 0 8px}
.md-ep-av{display:flex;align-items:center;gap:8px;margin:5px 0 3px}
.md-ep-barra{flex:1;max-width:160px;height:4px;border-radius:4px;background:var(--md-linea2);overflow:hidden}.md-ep-barra>div{height:100%;border-radius:4px}
.md-ep-sem{color:var(--md-verde);font-weight:600}
.md-creadas{margin-top:14px}.md-creadas-sub{margin:-4px 0 8px}
.md-velo{position:fixed;inset:0;z-index:70;background:rgba(28,26,23,.45);display:flex;align-items:flex-start;justify-content:center;padding:32px 14px;overflow:auto;animation:md-aparece .15s ease-out}
.md-tablero{background:var(--md-papel);border-radius:20px;width:100%;max-width:960px;padding:22px 24px 18px;box-shadow:0 30px 80px -30px rgba(0,0,0,.45);border-top:5px solid var(--ep)}
.md-tab-cab{display:flex;gap:12px;align-items:flex-start}
.md-tab-tit{font-family:var(--dia-serif),Georgia,serif;font-size:30px;line-height:1.15;margin:2px 0 0;font-weight:400}
.md-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0 6px}
.md-kpi{background:#fff;border:1px solid var(--md-linea);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;min-width:0}
.md-kpi:first-child{flex-direction:row;align-items:center;gap:12px}
.md-kpi b{font-size:22px;font-weight:600;color:var(--md-tinta);line-height:1.1}.md-kpi:first-child b{font-size:16px}
.md-kpi span{font-size:12.5px;color:var(--md-tinta2)}.md-kpi>div{display:flex;flex-direction:column}
.md-kpi[data-tono=rojo] b{color:var(--md-rojo)}.md-kpi[data-tono=ambar] b{color:var(--md-ambar)}.md-kpi[data-tono=verde] b{color:var(--md-verde)}
.md-anillo{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;flex:none}
.md-anillo span{width:40px;height:40px;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:12px;font-weight:700;color:var(--md-tinta)}
.md-tab-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:0 22px;margin-top:8px}
.md-ritmo{display:flex;align-items:flex-end;gap:6px;height:130px;padding:12px 14px 8px}
.md-ritmo-col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;min-width:0}
.md-ritmo-bar{width:100%;max-width:26px;border-radius:5px 5px 2px 2px;background:var(--ep)}
.md-ritmo-n{font-size:11px;color:var(--md-tinta2);font-weight:600;min-height:13px}.md-ritmo-l{font-size:10.5px;color:var(--md-tenue)}
.md-feat .md-grow{display:flex;flex-direction:column;gap:3px}.md-feat-barra{max-width:none;margin:2px 0}
.md-feat-sin{padding:8px 0 2px;font-size:12.5px}
.md-feat-btn{width:100%;background:none;border:0;border-bottom:1px solid var(--md-linea2);font:inherit;color:inherit;text-align:left;cursor:pointer;border-radius:8px}
.md-feat-btn:hover{background:var(--md-suave)}.md-feat-btn[data-on=true]{background:var(--md-azul-bg)}
.md-kpi[role=button]{cursor:pointer;transition:border-color .15s}.md-kpi[role=button]:hover{border-color:var(--ep)}
.md-filtros{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:2px;background:var(--md-linea2);border-radius:12px;width:max-content;max-width:100%}
.md-filtros::-webkit-scrollbar{display:none}
.md-filtros button{border:0;background:none;font:inherit;font-size:13px;color:var(--md-tinta2);padding:6px 11px;border-radius:9px;cursor:pointer;white-space:nowrap;display:inline-flex;gap:6px;align-items:center}
.md-filtros button span{font-size:11px;color:var(--md-tenue);font-weight:600}
.md-filtros button[data-on=true]{background:#fff;color:var(--md-tinta);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.md-filtros button[data-tono=rojo] span{color:var(--md-rojo)}
.md-herr{display:flex;gap:8px;margin-top:8px}
.md-buscar{flex:1;min-width:0;border:1px solid var(--md-linea);border-radius:10px;padding:8px 11px;font:inherit;font-size:13.5px;background:#fff;color:var(--md-tinta)}
.md-buscar:focus,.md-orden:focus{outline:2px solid color-mix(in srgb,var(--ep) 40%,transparent);outline-offset:0}
.md-orden{border:1px solid var(--md-linea);border-radius:10px;padding:8px 10px;font:inherit;font-size:13px;background:#fff;color:var(--md-tinta2);cursor:pointer}
.md-quitar{cursor:pointer;border:0}
.md-grupo{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--md-tenue);margin:10px 0 0;font-weight:600}.md-grupo:first-child{margin-top:2px}
.md-ok{color:var(--md-verde);font-weight:700;width:22px;text-align:center;flex:none}
.md-tab-pie{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--md-linea2)}
button.md-fuerte{font-weight:600}
@media(max-width:760px){.md-velo{padding:0;align-items:stretch}.md-tablero{border-radius:0;min-height:100%;padding:18px 16px calc(90px + env(safe-area-inset-bottom))}.md-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.md-tab-grid{grid-template-columns:minmax(0,1fr)}.md-tab-tit{font-size:25px}}
.md-tablero{max-width:1080px}
.md-tab-cab .md-btn{align-self:flex-start;margin-top:2px}
.md-tab-ir{display:none}@media(min-width:761px){.md-tab-ir{display:inline-flex}}
.md-kpi[data-on=true]{border-color:var(--ep);box-shadow:0 0 0 1px var(--ep) inset}
.md-fbtn[data-on=true]{border-color:var(--md-tinta);color:var(--md-tinta)}
.md-fpanel{margin-top:8px;background:#fff;border:1px solid var(--md-linea);border-radius:14px;padding:10px 14px 12px}
.md-fgrupo{display:grid;grid-template-columns:86px minmax(0,1fr);gap:8px;padding:7px 0;border-bottom:1px solid var(--md-linea2);align-items:start}
.md-fgrupo-t{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--md-tenue);font-weight:600;padding-top:6px}
.md-fgrupo-ops{display:flex;flex-wrap:wrap;gap:5px}
.md-fchip{border:1px solid var(--md-linea);background:#fff;border-radius:999px;padding:4px 10px;font:inherit;font-size:12.5px;color:var(--md-tinta2);cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.md-fchip i{width:7px;height:7px;border-radius:50%}.md-fchip span{font-size:10.5px;color:var(--md-tenue);font-weight:600}
.md-fchip:hover:not(:disabled){border-color:var(--md-tinta2)}.md-fchip:disabled{opacity:.4;cursor:default}
.md-fchip[data-on=true]{background:var(--md-tinta);border-color:var(--md-tinta);color:#fff}.md-fchip[data-on=true] span{color:rgba(255,255,255,.7)}
.md-activos{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:8px}
.md-activo{border:0;background:var(--md-azul-bg);color:var(--md-azul);border-radius:999px;padding:4px 6px 4px 10px;font:inherit;font-size:12.5px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.md-activo span{font-size:10px;opacity:.7;padding:0 3px}.md-activo:hover span{opacity:1}
.md-conteo{margin:10px 2px 6px}
.md-agregar{display:flex;gap:6px;margin-top:10px;align-items:center}
.md-agregar input{flex:1;min-width:0;border:1px dashed var(--md-linea);border-radius:10px;padding:9px 12px;font:inherit;font-size:13.5px;background:transparent;color:var(--md-tinta)}
.md-agregar input:focus{border-style:solid;background:#fff;outline:none;border-color:var(--ep)}
.md-agregar .md-btn[data-on=true]{background:var(--md-verde-bg);border-color:var(--md-verde);color:var(--md-verde)}
.md-dias14{display:flex;gap:3px;padding:10px 10px 8px}
.md-dia14{flex:1;min-width:0;border:0;background:none;border-radius:8px;padding:4px 0;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;font:inherit}
.md-dia14:disabled{cursor:default}.md-dia14:hover:not(:disabled){background:var(--md-suave)}
.md-dia14[data-on=true]{background:var(--md-tinta)}.md-dia14[data-on=true] span{color:#fff}.md-dia14[data-on=true] i{background:#fff}
.md-dia14-l{font-size:10px;color:var(--md-tenue)}.md-dia14-n{font-size:12px;color:var(--md-tinta2);font-weight:600}
.md-dia14[data-hoy=true] .md-dia14-n{color:var(--ep)}
.md-dia14-barra{height:46px;width:10px;display:flex;align-items:flex-end;background:var(--md-linea2);border-radius:5px;overflow:hidden}
.md-dia14-barra i{width:100%;background:var(--ep);border-radius:5px}
.md-feat-caja{border-bottom:1px solid var(--md-linea2)}.md-feat-caja:last-of-type{border-bottom:0}
.md-feat-caja .md-feat-btn{border-bottom:0}
.md-feat-caja[data-on=true] .md-feat-btn{background:var(--md-azul-bg)}
.md-inis{display:flex;flex-wrap:wrap;gap:4px;padding:0 0 9px 19px}
.md-ini{border:1px solid var(--md-linea2);background:var(--md-papel);border-radius:999px;padding:2px 8px;font:inherit;font-size:11.5px;color:var(--md-tinta2);cursor:pointer;display:inline-flex;gap:5px}
.md-ini span{color:var(--md-tenue)}.md-ini[data-on=true]{background:var(--md-tinta);color:#fff;border-color:var(--md-tinta)}.md-ini[data-on=true] span{color:rgba(255,255,255,.7)}
@media(max-width:760px){.md-fgrupo{grid-template-columns:minmax(0,1fr);gap:4px}.md-fgrupo-t{padding-top:0}.md-herr{flex-wrap:wrap}.md-buscar{flex-basis:100%}}
.md-abriendo{position:fixed;inset:0;z-index:98;display:grid;place-items:center;background:rgba(16,35,64,.35);color:#fff;font:700 13px var(--font-ui)}
.md-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:24px;background:var(--md-tinta);color:var(--md-papel);padding:11px 16px;border-radius:12px;display:flex;gap:14px;align-items:center;font-size:14px;z-index:100;max-width:calc(100% - 32px)}
@media(max-width:700px){.md-toast{bottom:calc(150px + env(safe-area-inset-bottom))}}
.md-sk{background:linear-gradient(90deg,#f3eee6,#faf7f1,#f3eee6);background-size:200% 100%;animation:md-brillo 1.3s infinite;border:0}
.md-fade{animation:md-aparece .25s ease-out}
code{font-size:.9em;background:#f1ebe1;padding:1px 5px;border-radius:5px}
.md-tira{margin-bottom:4px}.md-tira-cab{margin-bottom:6px}.md-tira-cab .md-icobtn{font-size:20px;padding:2px 10px}
.md-dia{border:1px solid transparent;background:none;font:inherit;cursor:pointer;transition:background .15s}
.md-dia:hover{background:#fff}
.md-dia[data-futuro="true"] b{color:var(--md-tinta2)}
.md-dia[data-sel="true"]{background:#fff;border-color:var(--md-linea);box-shadow:0 1px 2px rgba(28,26,23,.06)}
.md-dia[data-hoy="true"] b{color:var(--md-acento)}
.md-ayer{border-left:2px solid #e6d6bf;padding:2px 0 2px 14px}
.md-ayer-frase{font-family:var(--dia-serif),Georgia,serif;font-size:21px;line-height:1.3;margin:4px 0 6px;color:var(--md-tinta)}
.md-mic{width:36px;height:36px;border-radius:50%;border:1px solid var(--md-linea);background:#fff;color:var(--md-tinta2);display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;flex:none;padding:0}
.md-mic[data-on="true"]{background:var(--md-rojo);border-color:var(--md-rojo);color:#fff;animation:md-pulso 1.4s infinite}
.md-mic-grande{width:auto;height:44px;border-radius:12px;padding:0 16px;font:500 14px var(--dia-ui)}
.md-anotar[data-escuchando="true"]{border-color:#e8cbc2}
.md-anotar .md-enviar{width:36px;height:36px;border-radius:50%;border:0;background:var(--md-tinta);color:var(--md-papel);font-size:16px;cursor:pointer;flex:none}
.md-anotar{padding:6px}.md-anotar input{padding-left:4px}
.md-tarea-tog{flex:none;border:1px solid var(--md-linea);background:transparent;color:var(--md-tinta);border-radius:999px;padding:7px 11px;font:500 13px var(--dia-ui);cursor:pointer;white-space:nowrap}
@media (max-width:420px){.md-tarea-tog{padding:6px 7px;font-size:11.5px}.md-anotar{gap:5px}}
.md-tarea-tog[data-on="true"]{background:#f3e6cf;border-color:#e6cfa4}
.md-anotar[data-tarea="true"]{border-color:#e6cfa4}
.md-anotar-tarea{max-width:640px;margin:0 auto 8px;background:#fff;border:1px solid var(--md-linea);border-radius:16px;padding:12px;display:flex;gap:14px;flex-wrap:wrap;box-shadow:0 10px 30px -18px rgba(28,26,23,.45)}
.md-anotar-campo{display:flex;flex-direction:column;gap:5px;flex:1 1 220px;min-width:0}
.md-btn[data-on="true"]{background:var(--md-tinta);color:var(--md-papel);border-color:var(--md-tinta)}
.md-mb8{margin:0 0 8px}
.md-cerebro-hecha{opacity:.85}
@keyframes md-pulso{0%,100%{box-shadow:0 0 0 0 rgba(138,60,42,.35)}50%{box-shadow:0 0 0 7px rgba(138,60,42,0)}}
@keyframes md-aparece{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes md-entra{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes md-brillo{to{background-position:-200% 0}}
@media(prefers-reduced-motion:reduce){.md-fade,.md-tarjeta,.md-sk{animation:none}}
`
