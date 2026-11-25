'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import SectionNav from '@/components/SectionNav'
import type { Epica, EpicaTask } from '@/lib/supabase'
import { todayISO, uid, completeRecurring } from '@/components/epicas/core'
import { waNumero } from '@/lib/cumple'
import { useDictado, juntar } from '@/lib/useDictado'
import { Bandeja, TuCerebro, itemsDe, type CamposTarea, type AccionesBandeja } from './Bandeja'
import {
  obsidianUrl, saludEpicas, esperandoAOtros, racha, sumarDias, resolverPlan, diasHasta, textoRecordatorio,
  type DiaGet, type DiaData, type DiaTarjeta, type DiaDecision, type DiaPrioridad, type DiaRespuesta, type EstadoRespuesta, type SaludEpica,
} from '@/lib/dia'

/* ── Utilidades ── */
const DN = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DN3 = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const MN = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaDe = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
const diaLargo = (iso: string) => { const d = fechaDe(iso); return `${DN[d.getDay()]} ${d.getDate()} de ${MN[d.getMonth()]}` }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const RITUAL_KEY = 'dia.ritual.v1'
const leerLS = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const ponerLS = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }
const enDias = (n: number) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : n < 0 ? `hace ${-n} días` : `en ${n} días`)
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
type TipoCaptura = 'nota' | 'cierre' | 'pregunta' | 'tarea'
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
  const hoy = todayISO()
  const [dia, setDia] = useState<DiaGet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [epicas, setEpicas] = useState<Epica[] | null>(null)
  const [cumples, setCumples] = useState<Cumple[]>([])
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [saludHoy, setSaludHoy] = useState<boolean | null>(null)
  const [modo, setModo] = useState<Modo>('hoy')
  const [modoElegido, setModoElegido] = useState(false)
  const [fecha, setFecha] = useState(hoy)            // el día que estás viendo (tira de la semana)
  const [diaOtro, setDiaOtro] = useState<DiaGet | null>(null)
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
  const cargarEpicas = useCallback(async () => {
    try { const j = await (await fetch('/api/epicas')).json(); if (j?.ok) setEpicas(j.data as Epica[]) } catch { /* se queda lo anterior */ }
  }, [])

  useEffect(() => {
    cargarDia(); cargarEpicas()
    fetch('/api/cumples').then(r => r.json()).then(j => { if (j?.ok) setCumples(j.personas || []) }).catch(() => {})
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

  const data: DiaData | null = dia?.resumen?.data ?? null
  const respuestas = useMemo(() => new Map((dia?.respuestas || []).map(r => [r.item_id, r])), [dia])

  // Siempre abre en Hoy. De noche (20:00 en adelante) abre en Cerrar día, si todavía no lo cierras.
  useEffect(() => {
    if (!dia || modoElegido) return
    const cerrado = dia.cierres.some(c => c.fecha === hoy && c.calificacion != null)
    if (new Date().getHours() >= 20 && !cerrado) setModo('noche')
  }, [dia, hoy, modoElegido])
  const ir = (m: Modo) => { setModo(m); setModoElegido(true); if (m !== 'semana' && m !== 'boveda') setFecha(hoy); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const verDia = (f: string) => { setFecha(f); if (f === hoy) setModo(m => (m === 'ritual' ? 'hoy' : m)); else setModo('hoy'); setModoElegido(true) }

  /* ── Escritura de tareas (mismo endpoint y candado de choques que Épicas) ── */
  const todas = useMemo(() => {
    const m = new Map<string, { e: Epica; t: EpicaTask }>()
    for (const e of epicas || []) for (const t of e.tasks || []) if (t.id) m.set(t.id, { e, t })
    return m
  }, [epicas])

  const sync = useCallback(async (epicaId: string, cambios: { create?: EpicaTask[]; update?: EpicaTask[] }) => {
    const j = await postJSON<{ ok: boolean; error?: string; conflicts?: string[] }>('/api/tareas/sync', { epicaId, create: cambios.create || [], update: cambios.update || [], remove: [] })
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
    await postJSON('/api/dia', { accion: 'responder', fecha: hoy, itemId, estado: 'descartada', deshacer: true })
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
  const toggleHecha = useCallback(async (tareaId: string) => {
    const hit = todas.get(tareaId); if (!hit) return
    const t = ABIERTA(hit.t) ? completeRecurring(hit.t, hoy, () => 0) : { ...hit.t, status: hit.t.planPrev && hit.t.planPrev !== 'Terminada' ? hit.t.planPrev : 'Por hacer', doneAt: undefined }
    // Optimista: que se vea al instante.
    setEpicas(es => es ? es.map(e => e.id !== hit.e.id ? e : { ...e, tasks: e.tasks.map(x => x.id === tareaId ? t : x) }) : es)
    try { await sync(hit.e.id, { update: [t] }); cargarEpicas() }
    catch (e) { mostrarAviso({ texto: e instanceof Error ? e.message : String(e) }); cargarEpicas() }
  }, [todas, hoy, sync, cargarEpicas, mostrarAviso])

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
    deshacer: async id => { await deshacerRespuesta(id) },
    decidir: async (d, texto, k) => {
      let ids: { tareaId?: string; featureId?: string } = {}
      if (k) { ids = await crearConCampos(k, `Decisión: ${d.pregunta}${texto ? ` → ${texto}` : ''}`); cargarEpicas() }
      const txt = texto || (k ? `${k.comoFeature ? 'Feature' : 'Tarea'} creada: ${k.titulo}` : '')
      await responder(d.id, 'decision', 'respondida', { tareaId: ids.tareaId, respuesta: { texto: txt, ...ids } })
    },
    contestar: async (q, texto) => { await responder(q.id, 'cerebro', 'respondida', { respuesta: { texto } }) },
  }), [responder, decidirTarjeta, crearConCampos, data, todas, sync, hoy, epicas, cargarEpicas, deshacerRespuesta])

  const porDecidir = itemsDe(data).filter(it => !respuestas.has(it.id))
  const pendientes = (data?.tarjetas || []).filter(c => !respuestas.has(c.id))
  const decisionesAbiertas = (data?.decisiones || []).filter(d => !respuestas.has(d.id))
  const cerebroAbiertas = (data?.cerebro || []).filter(q => !respuestas.has(q.id)).length

  return (
    <div className="md-root">
      <style>{CSS}</style>
      <SiteHeader title="Mi día" subtitle="Tu día · ADVL" backHref="/" backLabel="← Accesos" extra={<SectionNav current="dia" />} />
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
          <Bandeja data={data} hoy={hoy} respuestas={respuestas} epicas={epicas} acc={accBandeja} alTerminar={() => { setModo('tus3'); window.scrollTo({ top: 0 }) }} />
        )}
        {dia && fecha === hoy && modo === 'tus3' && data && (
          <Ritual data={data} hoy={hoy} pendientes={[]} prioridades={prioridades} tareaDe={tareaDePrioridad}
            decidir={decidirTarjeta} deshacer={deshacerRespuesta} empezar={empezarDia} saltar={() => ir('hoy')} minutosLibres={minutosLibres(eventos, hoy)} />
        )}

        {dia && fecha === hoy && modo === 'hoy' && (
          <VistaHoy dia={dia} data={data} hoy={hoy} epicas={epicas} cumples={cumples} eventos={eventos} saludHoy={saludHoy}
            prioridades={prioridades} respaldo={tresDeRespaldo} tareaDe={tareaDePrioridad} toggleHecha={toggleHecha}
            pendientes={pendientes} decisiones={decisionesAbiertas} respuestas={respuestas} porDecidir={porDecidir.length}
            abrirRitual={() => ir('ritual')} responder={responder} capturar={capturar} aviso={mostrarAviso}
            cerebroAbiertas={cerebroAbiertas} crearRapida={crearRapida} />
        )}

        {dia && fecha === hoy && modo === 'noche' && (
          <VistaNoche dia={dia} data={data} hoy={hoy} prioridades={prioridades} respaldo={tresDeRespaldo} tareaDe={tareaDePrioridad}
            toggleHecha={toggleHecha} capturar={capturar} calificar={calificar} />
        )}

        {dia && modo === 'semana' && <VistaSemana dia={dia} hoy={hoy} />}
        {dia && modo === 'boveda' && <VistaBoveda dia={dia} />}

        {dia && fecha === hoy && <Pie dia={dia} />}
      </main>
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
  let ocupado = 0
  for (const e of eventos) {
    if (e.allDay || !e.start || !e.end) continue
    const a = Math.max(ini, new Date(e.start).getTime()), b = Math.min(fin, new Date(e.end).getTime())
    if (b > a) ocupado += b - a
  }
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
  dia: DiaGet; data: DiaData | null; hoy: string; epicas: Epica[] | null; cumples: Cumple[]; eventos: Evento[] | null; saludHoy: boolean | null
  prioridades: DiaPrioridad[]; respaldo: { e: Epica; t: EpicaTask }[]; tareaDe: (x: DiaPrioridad) => { e: Epica; t: EpicaTask } | null
  toggleHecha: (id: string) => Promise<void>; pendientes: DiaTarjeta[]; decisiones: DiaDecision[]; respuestas: Map<string, DiaRespuesta>
  abrirRitual: () => void; responder: (itemId: string, tipo: string, estado: EstadoRespuesta, extra?: { respuesta?: unknown; tareaId?: string }) => Promise<void>
  capturar: (t: string, tipo?: TipoCaptura) => Promise<void>; aviso: (a: Aviso) => void
  cerebroAbiertas: number; porDecidir: number; crearRapida: (titulo: string, epicaId: string, cuando: PlanRapido) => Promise<string>
}) {
  const { dia, data, hoy, epicas } = p
  // Tus 3: lo que propuso Claude, ya ligado a tareas reales; si no hay, lo agendado para hoy.
  const tres = useMemo(() => {
    const desdeClaude = p.prioridades.map(x => ({ p: x, hit: p.tareaDe(x) }))
    if (desdeClaude.length) return desdeClaude
    return p.respaldo.map(hit => ({ p: { t: hit.t.t, tareaId: hit.t.id, epica: hit.e.name, porque: hit.t.due ? `vence ${hit.t.due}` : 'agendada para hoy' } as DiaPrioridad, hit }))
  }, [p.prioridades, p.respaldo, p.tareaDe])
  const hechas = tres.filter(x => x.hit && !ABIERTA(x.hit.t)).length
  // «Ahora» = la primera que puedes hacer tú: lo que está en Esperando no va primero.
  const siguiente = tres.find(x => !x.hit || (ABIERTA(x.hit.t) && x.hit.t.status !== 'Esperando')) || tres.find(x => !x.hit || ABIERTA(x.hit.t))

  const salud = useMemo(() => (epicas ? saludEpicas(epicas, hoy) : []), [epicas, hoy])
  const esperando = useMemo(() => (epicas ? esperandoAOtros(epicas, hoy) : []), [epicas, hoy])
  const [todasEpicas, setTodasEpicas] = useState(false)

  // Chips: fechas que vienen, cumpleaños, por decidir, inbox, salud, ERP en vivo.
  const chips = useMemo(() => {
    const out: { t: string; tono: 'ambar' | 'azul' | 'rojo' | 'verde' | 'gris'; href?: string }[] = []
    for (const f of (data?.fechas || [])) { const n = diasHasta(hoy, f.fecha); if (n >= 0 && n <= 30) out.push({ t: `${f.t} · ${enDias(n)}`, tono: n <= 3 ? 'rojo' : 'ambar', href: f.nota ? obsidianUrl(f.nota) : undefined }) }
    for (const c of p.cumples) {
      const [, m, d] = c.cumple.split('-').map(Number); if (!m || !d) continue
      let f = `${hoy.slice(0, 4)}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (f < hoy) f = `${Number(hoy.slice(0, 4)) + 1}${f.slice(4)}`
      const n = diasHasta(hoy, f); if (n <= 7) out.push({ t: `Cumple de ${c.apodo || c.nombre.split(' ')[0]} · ${enDias(n)}`, tono: n === 0 ? 'rojo' : 'verde' })
    }
    if (data?.inbox) out.push({ t: `Inbox · ${data.inbox}`, tono: 'gris' })
    if (p.saludHoy === false) out.push({ t: 'Registrar salud', tono: 'ambar', href: '/peso' })
    const erp = dia.boveda?.resumen.find(r => /ERP/.test(r) && /vivo/i.test(r))
    if (erp) { const n = erp.match(/\d+/)?.[0]; out.push({ t: n ? `ERP en vivo · ${n}` : 'ERP en vivo', tono: 'rojo', href: '#boveda' }) }
    return out
  }, [data, hoy, p.cumples, p.saludHoy, dia.boveda])

  const noCorrio = !dia.resumen && dia.disponible
  return (
    <div className="md-fade">
      <div className="md-entre md-base md-mt12">
        <h1 className="md-fecha">{cap(diaLargo(hoy))}</h1>
        {tres.length > 0 && <span className="md-meta">{hechas} de {tres.length} hechas</span>}
      </div>
      {data && (data.frase || data.hechos.length > 0) && <AyerCorto data={data} />}
      {noCorrio && (
        <div className="md-card md-aviso md-mt12">
          <p className="md-h3">El cierre de anoche no ha corrido</p>
          <p className="md-sub">{dia.corrida ? `Última corrida: ${new Date(dia.corrida.at).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${dia.corrida.ok ? '' : ` · falló: ${dia.corrida.mensaje || 'sin detalle'}`}.` : 'Todavía no ha corrido nunca.'} Corre a las 3:00 si la Mac está prendida y Obsidian abierto.</p>
        </div>
      )}
      {data?.sinDictado && <p className="md-meta md-mt8">No dictaste nada ayer; tus épicas sí están al día.</p>}

      <div className="md-grid">
        <div className="md-col">
          {p.porDecidir > 0 && (
            <button className="md-card md-pendientes" onClick={p.abrirRitual}>
              <span><b>Por decidir · {p.porDecidir}</b>
                <span className="md-meta md-bloque">{[p.pendientes.filter(c => c.tipo === 'nuevo').length ? `${p.pendientes.filter(c => c.tipo === 'nuevo').length} pendientes nuevos` : null,
                  p.pendientes.filter(c => c.tipo !== 'nuevo').length ? `${p.pendientes.filter(c => c.tipo !== 'nuevo').length} sugerencias` : null,
                  p.decisiones.length ? `${p.decisiones.length} ${p.decisiones.length === 1 ? 'decisión' : 'decisiones'}` : null,
                  p.cerebroAbiertas ? `${p.cerebroAbiertas} para tu cerebro` : null].filter(Boolean).join(' · ')}</span></span>
              <span className="md-link">Revisar →</span>
            </button>
          )}

          {siguiente ? (
            <div className="md-card md-ahora">
              <p className="md-kicker">Ahora</p>
              <p className="md-titulo-ahora">{siguiente.hit?.t.t || siguiente.p.t}</p>
              <p className="md-meta">{[siguiente.p.epica || siguiente.hit?.e.name, siguiente.p.min ? `${siguiente.p.min} min` : null, siguiente.p.porque].filter(Boolean).join(' · ')}</p>
              <div className="md-fila md-mt12">
                <Link href="/tiempo" className="md-btn md-primario md-grow">▶ Foco{siguiente.p.min ? ` ${siguiente.p.min} min` : ''}</Link>
                {siguiente.hit?.t.id && <button className="md-btn" onClick={() => p.toggleHecha(siguiente.hit!.t.id!)}>✓ Hecha</button>}
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
                const hecha = !!x.hit && !ABIERTA(x.hit.t)
                return (
                  <button key={i} className="md-check" data-hecha={hecha} disabled={!x.hit?.t.id} onClick={() => x.hit?.t.id && p.toggleHecha(x.hit.t.id)}>
                    <span className="md-caja" aria-hidden>{hecha ? '✓' : ''}</span><span className="md-grow">{x.hit?.t.t || x.p.t}</span>
                  </button>
                )
              })}
            </div>
          )}

          {chips.length > 0 && (
            <div className="md-chips">
              {chips.map((c, i) => c.href
                ? <a key={i} href={c.href} className={`md-chip md-tono-${c.tono}`}>{c.t}</a>
                : <span key={i} className={`md-chip md-tono-${c.tono}`}>{c.t}</span>)}
            </div>
          )}

          <Agenda eventos={p.eventos} hoy={hoy} />

          <TuCerebro aprendido={dia.aprendido || []} />
        </div>

        <div className="md-col">
          {salud.length > 0 && (
            <section>
              <div className="md-lbl"><span>Tus épicas</span><span>siguiente paso</span></div>
              <div className="md-card md-lista">
                {(todasEpicas ? salud : salud.slice(0, 6)).map(s => <FilaEpica key={s.e.id} s={s} />)}
              </div>
              {salud.length > 6 && <button className="md-link md-mt8" onClick={() => setTodasEpicas(v => !v)}>{todasEpicas ? 'Ver menos' : `Ver las ${salud.length}`}</button>}
            </section>
          )}
          {!epicas && <div className="md-card md-sk" style={{ height: 180 }} />}

          {esperando.length > 0 && (
            <section>
              <div className="md-lbl"><span>Esperando a otros</span><span>{esperando.length}</span></div>
              <div className="md-card md-lista">
                {esperando.slice(0, 5).map(w => {
                  const tel = w.t.personaId ? waNumero(p.cumples.find(c => c.id === w.t.personaId)?.celular) : null
                  const wa = `https://wa.me/${tel || ''}?text=${encodeURIComponent(textoRecordatorio(w.t, w.quien))}`
                  return (
                    <div key={w.t.id} className="md-row">
                      <span className="md-dot" style={{ background: (w.dias ?? 0) >= 4 ? 'var(--md-ambar)' : 'var(--md-linea2)' }} />
                      <div className="md-grow">{w.t.t}<div className="md-meta">{[w.quien, w.e.name, w.dias != null ? `${w.dias} ${w.dias === 1 ? 'día' : 'días'}` : null].filter(Boolean).join(' · ')}</div></div>
                      <a className="md-btn md-chico" href={wa} target="_blank" rel="noopener noreferrer">Recordarle</a>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {(data?.cambios.length ?? 0) > 0 && (
            <details className="md-card md-plegable">
              <summary><span>Qué cambió Claude anoche</span><span className="md-meta">{data!.cambios.length} {data!.cambios.length === 1 ? 'nota' : 'notas'}</span></summary>
              <div className="md-lista md-mt8">
                {data!.cambios.map((c, i) => (
                  <div key={i} className="md-row"><div className="md-grow">{c.que}<div className="md-meta">{c.nota}</div></div><a className="md-icobtn" href={obsidianUrl(c.nota)} aria-label={`Abrir ${c.nota}`}>↗</a></div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <Anotar capturar={p.capturar} pendientes={dia.capturasPendientes} epicas={epicas} crearRapida={p.crearRapida} />
    </div>
  )
}

function FilaEpica({ s }: { s: SaludEpica }) {
  const color = s.estado === 'vencidas' ? 'var(--md-rojo)' : s.estado === 'al_dia' ? 'var(--md-verde)' : s.estado === 'quieta' || s.estado === 'pausa' ? 'var(--md-tenue)' : 'var(--md-ambar)'
  return (
    <Link href="/epicas" className="md-row md-fila-link">
      <span className="md-dot" style={{ background: color }} />
      <div className="md-grow">
        <div className="md-entre"><span className="md-fuerte">{s.e.name}</span><span className="md-meta" style={{ color }}>{s.etiqueta}</span></div>
        <div className="md-meta">{s.siguiente ? s.siguiente.t : 'Sin siguiente paso'}</div>
      </div>
    </Link>
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
                      return <li key={i}>{t && !ABIERTA(t) ? '✓ ' : ''}{t?.t || x.t}</li>
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
  const ahora = Date.now()
  return (
    <section>
      <div className="md-lbl"><span>Tu agenda</span><span>{hoyEv.length ? `${hoyEv.length} ${hoyEv.length === 1 ? 'reunión' : 'reuniones'}` : 'sin reuniones'}</span></div>
      <div className="md-agenda" aria-label="Agenda de 8 a 21 h">
        {hoyEv.map((e, i) => (
          <div key={i} className="md-evento" title={`${e.title || 'Reunión'} · ${hora(e.start)}`} style={{ left: `${((e.a - ini) / total) * 100}%`, width: `${Math.max(1.5, ((e.b - e.a) / total) * 100)}%` }}>
            <span>{e.title || 'Reunión'}</span>
          </div>
        ))}
        {ahora > ini && ahora < fin && <div className="md-ahora-linea" style={{ left: `${((ahora - ini) / total) * 100}%` }} />}
      </div>
      <div className="md-entre md-meta md-mt4"><span>8</span><span>12</span><span>16</span><span>21</span></div>
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

/** Cuadro de abajo: anota una idea (llega a Obsidian a las 3:00) o, con «＋ Tarea», la vuelve tarea YA en una épica. */
function Anotar({ capturar, pendientes, epicas, crearRapida }: {
  capturar: (t: string) => Promise<void>; pendientes: number; epicas: Epica[] | null
  crearRapida: (titulo: string, epicaId: string, cuando: PlanRapido) => Promise<string>
}) {
  const [t, setT] = useState('')
  const [estado, setEstado] = useState<'' | 'guardando' | string>('')
  const [ok, setOk] = useState('')
  const [comoTarea, setComoTarea] = useState(false)
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
      if (comoTarea) {
        const nombre = await crearRapida(v, epicaId, cuando)
        setOk(`Tarea creada en «${nombre}»${cuando ? (cuando === 'hoy' ? ', para hoy' : ', para mañana') : ''}. Queda anotada en tu nota de Obsidian a las 3:00.`)
      } else setOk('Guardado. Llega a tu nota de Obsidian a las 3:00 y, si es un pendiente, Claude te lo propone como tarea mañana.')
      setT(''); setEstado(''); setComoTarea(false); setElegida(false); setCuando('')
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
        <button type="button" className="md-tarea-tog" data-on={comoTarea} aria-pressed={comoTarea} onClick={() => { setComoTarea(v => !v); setEstado('') }}
          title="Volverla tarea en una épica">{comoTarea ? 'Tarea ✓' : '＋ Tarea'}</button>
        <button className="md-enviar" aria-label={comoTarea ? 'Crear tarea' : 'Guardar'} disabled={guardando}>↑</button>
      </form>
      <p className="md-meta md-centro-txt" aria-live="polite">
        {d.error ? <span className="md-err-txt">{d.error}</span>
          : d.escuchando ? 'Escuchando. Toca el micrófono para parar y luego ↑ para guardar.'
          : guardando ? 'Guardando…'
          : estado ? <span className="md-err-txt">{estado}</span>
          : ok ? <span className="md-ok-txt">{ok}</span>
          : comoTarea ? '↑ crea la tarea ahora mismo en esa épica.'
          : pendientes ? `${pendientes} ${pendientes === 1 ? 'nota' : 'notas'} esperando el cierre de las 3:00` : ' '}
      </p>
    </div>
  )
}

/* ── Noche ── */
function VistaNoche({ dia, data, hoy, prioridades, respaldo, tareaDe, toggleHecha, capturar, calificar }: {
  dia: DiaGet; data: DiaData | null; hoy: string; prioridades: DiaPrioridad[]; respaldo: { e: Epica; t: EpicaTask }[]
  tareaDe: (p: DiaPrioridad) => { e: Epica; t: EpicaTask } | null; toggleHecha: (id: string) => Promise<void>
  capturar: (t: string, tipo?: TipoCaptura) => Promise<void>; calificar: (n: number) => Promise<void>
}) {
  const previa = dia.cierres.find(c => c.fecha === hoy)?.calificacion ?? null
  const [nota, setNota] = useState<number | null>(previa)
  const [texto, setTexto] = useState('')
  const dictado = useDictado(f => setTexto(v => juntar(v, f)))
  const [resp, setResp] = useState('')
  const [err, setErr] = useState('')
  const [listo, setListo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const tres = prioridades.length ? prioridades.map(p => ({ p, hit: tareaDe(p) })) : respaldo.map(hit => ({ p: { t: hit.t.t, porque: '' } as DiaPrioridad, hit }))
  const hechas = tres.filter(x => x.hit && !ABIERTA(x.hit.t)).length

  const cerrar = async () => {
    if (!nota) { setErr('Elige cómo estuvo tu día (1 a 10)'); return }
    if (dictado.escuchando) dictado.parar()
    if (texto.trim().length < 3) { setErr('Platícame aunque sea una línea de tu día'); return }
    setGuardando(true); setErr('')
    try {
      await calificar(nota)
      await capturar(texto.trim(), 'cierre')
      if (resp.trim() && data?.pregunta) await capturar(`Pregunta: ${data.pregunta}\nRespuesta: ${resp.trim()}`, 'pregunta')
      setListo(true)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setGuardando(false) }
  }

  if (listo) return (
    <div className="md-card md-noche-fin md-fade">
      <p className="md-luna" aria-hidden>☾</p>
      <p className="md-frase md-sin-margen">Listo, descansa</p>
      <p className="md-sub">Le diste {nota} a tu día. A las 3:00 Claude acomoda lo que dictaste en tu nota de Obsidian y mañana te espera tu día armado.</p>
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
              const hecha = !!x.hit && !ABIERTA(x.hit.t)
              return (
                <button key={i} className="md-check md-row" data-hecha={hecha} disabled={!x.hit?.t.id} onClick={() => x.hit?.t.id && toggleHecha(x.hit.t.id)}>
                  <span className="md-caja" aria-hidden>{hecha ? '✓' : ''}</span><span className="md-grow">{x.hit?.t.t || x.p.t}</span><span className="md-meta">{hecha ? 'hecha' : 'mañana'}</span>
                </button>
              )
            })}
          </div>
          <p className="md-meta md-mt8">{hechas} de {tres.length}. Las que no hiciste te las vuelve a proponer Claude mañana.</p>
        </>
      )}
      <div className="md-lbl"><span>¿Cómo estuvo?</span><span>{nota ?? ''}</span></div>
      <div className="md-escala" role="radiogroup" aria-label="Calificación del día">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
          <button key={v} role="radio" aria-checked={nota === v} data-on={nota === v} onClick={() => { setNota(v); setErr('') }}>{v}</button>
        ))}
      </div>
      <div className="md-lbl"><span>Platícame tu día</span><span>dictado o escrito</span></div>
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
function VistaSemana({ dia, hoy }: { dia: DiaGet; hoy: string }) {
  const cal = new Map(dia.cierres.map(c => [c.fecha, c.calificacion]))
  if (!dia.semana.length) return <div className="md-card md-fade"><p className="md-h3">Tu semana aparece aquí</p><p className="md-sub">Cada mañana se agrega el día anterior: lo que hiciste y lo que quedó.</p></div>
  return (
    <div className="md-fade">
      <h1 className="md-fecha">Tu semana</h1>
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
function VistaBoveda({ dia }: { dia: DiaGet }) {
  const b = dia.boveda
  if (!b) return <div className="md-card md-fade" id="boveda"><p className="md-h3">Lo que tienes que revisar en tu bóveda</p><p className="md-sub">Aparece después del primer cierre de las 3:00 (sale de <code>por-revisar</code>, en tarjetas).</p></div>
  return (
    <div className="md-fade" id="boveda">
      <h1 className="md-fecha">Tu bóveda</h1>
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
.md-chip{font-size:12.5px;padding:5px 11px;border-radius:999px;white-space:nowrap;text-decoration:none;display:inline-block;font-weight:500}
.md-tono-ambar,.md-tipo-sugerencia,.md-tipo-evitando{background:var(--md-ambar-bg);color:var(--md-acento)}
.md-tono-rojo{background:var(--md-rojo-bg);color:var(--md-rojo)}
.md-tono-azul,.md-tipo-nuevo{background:var(--md-azul-bg);color:var(--md-azul)}
.md-tono-verde,.md-tipo-esperando{background:var(--md-verde-bg);color:var(--md-verde)}
.md-tono-gris,.md-tipo-limpieza,.md-tipo-mover{background:#f1ebe1;color:var(--md-tinta2)}
.md-lbl{display:flex;justify-content:space-between;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--md-tenue);margin:22px 2px 8px}
.md-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:0 28px;margin-top:14px}
@media(min-width:900px){.md-grid{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}.md-solo-mac{display:inline}}
.md-solo-mac{display:none}
.md-col{min-width:0}
.md-ahora{background:var(--md-papel);border-color:#e6d6bf}
.md-listo{background:var(--md-verde-bg);border-color:#cfd8bf}.md-listo .md-h3,.md-listo .md-sub{color:var(--md-verde)}
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
