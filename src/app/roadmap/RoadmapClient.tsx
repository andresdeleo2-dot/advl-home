'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import SiteHeader from '@/components/SiteHeader'
import SectionNav from '@/components/SectionNav'
import type { Epica, EpicaFeature, EpicaMilestone, EpicaTask, Iniciativa } from '@/lib/supabase'
import {
  ARCHIVED, DifDots, PrioBars, addDays, addMonths, clickable, difStyle, doneCount, duracionLabel, dueTone,
  featureStyle, fmtDue, hexA, iniciativaStyle, normalize, normalizeMilestone, pctOf, plazoLabel, prioStyle,
  taskCount, taskStyle, todayISO, uid, WEEK_EST_MIN, type Dif, type Duracion, type Prio,
} from '@/components/epicas/core'

/* ═══════════════════════════════════════════════════════════════════════════
   /roadmap — TABLERO CUANTIZADO
   El tiempo NO es un eje continuo de píxeles-por-día (esa era la versión vieja:
   barras de 14px, scroll ciego de 2500px y una barra fantasma sobre la línea de
   hoy para todo lo que no tenía fecha). Aquí el tiempo es una REJILLA: cada
   columna es un trimestre (o un mes con zoom), cada épica es un carril y cada
   feature una tarjeta que ocupa de su columna de inicio a su columna de fin.
   Así hay espacio real dentro de la pieza para decir cuánto dura, cuánto falta
   y qué tan avanzada va — que es lo que se venía a leer.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Escala: enteros, no fechas ──────────────────────────────────────────── */
type Zoom = 'trimestre' | 'mes'

const Q_COLS = 4, M_COLS = 6, RAIL_W = 168, COL_MIN = 228, GAP = 10
const MESC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const FEATURE_COLORS = ['#C2933A', '#3E8E8E', '#2E5A9E', '#7A6FB0', '#5B6B86', '#B07A56']
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const pad = (n: number) => String(n).padStart(2, '0')

/** Bucket ENTERO: trimestre = año*4 + (q−1); mes = año*12 + (m−1). Contiguos, comparables y
 *  ordenables leyendo el ISO con slice — cero husos horarios, cero off-by-one. */
function bucketOf(iso: string, zoom: Zoom): number {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7)
  return zoom === 'trimestre' ? y * 4 + Math.floor((m - 1) / 3) : y * 12 + (m - 1)
}
function bucketRange(b: number, zoom: Zoom): { ini: string; fin: string } {
  if (zoom === 'trimestre') {
    const y = Math.floor(b / 4), q = ((b % 4) + 4) % 4, m0 = q * 3 + 1, m1 = q * 3 + 3
    return { ini: `${y}-${pad(m0)}-01`, fin: `${y}-${pad(m1)}-${pad(new Date(y, m1, 0).getDate())}` }
  }
  const y = Math.floor(b / 12), m = (((b % 12) + 12) % 12) + 1
  return { ini: `${y}-${pad(m)}-01`, fin: `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}` }
}
function bucketLabel(b: number, zoom: Zoom): string {
  return zoom === 'trimestre' ? `T${(b % 4) + 1} ${Math.floor(b / 4)}` : `${MESC[b % 12]} ${Math.floor(b / 12)}`
}
/** Subtítulo de la cabecera de columna: 'oct – dic'. En zoom de mes no aporta nada. */
function bucketMeses(b: number, zoom: Zoom): string {
  if (zoom !== 'trimestre') return ''
  const q = b % 4
  return `${MESC[q * 3]} – ${MESC[q * 3 + 2]}`
}
function diasDelBucket(b: number, zoom: Zoom): number {
  if (zoom === 'mes') { const y = Math.floor(b / 12), m = (b % 12) + 1; return new Date(y, m, 0).getDate() }
  const y = Math.floor(b / 4), q = b % 4
  return [1, 2, 3].reduce((s, k) => s + new Date(y, q * 3 + k, 0).getDate(), 0)
}
/** Fecha → índice de columna visible, recortado a la ventana. `corta` marca que la pieza sigue
 *  fuera de cuadro (se dibuja con el borde recto y una ‹ o ›). */
function colOf(iso: string, zoom: Zoom, winStart: number, nCols: number): { i: number; corta: 'izq' | 'der' | null } {
  const raw = bucketOf(iso, zoom) - winStart
  return { i: Math.max(0, Math.min(nCols - 1, raw)), corta: raw < 0 ? 'izq' : raw > nCols - 1 ? 'der' : null }
}
/** Coloca una pieza en el grid INTERIOR de la pista (el rail vive fuera del grid, así que la
 *  columna 1 del grid es el primer bucket visible). */
const colStyle = (ci: number, cj: number): CSSProperties => ({ gridColumn: `${ci + 1} / ${cj + 2}` })

const okISO = (s?: string | null) => !!s && ISO_RE.test(s.slice(0, 10))
const isoOf = (s?: string | null) => (okISO(s) ? (s as string).slice(0, 10) : '')
/** Minutos estimados de una tarea: el estimado propio manda; si no hay, el default por dificultad. */
const estMinDe = (t: EpicaTask): number => (typeof t.estMin === 'number' ? t.estMin : WEEK_EST_MIN(t.difficulty))
const fmtHoras = (min: number): string => {
  const h = min / 60
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} h`
}

/* ─── Piezas colocadas ────────────────────────────────────────────────────── */
type Kind = 'epica' | 'feature' | 'iniciativa' | 'hito'
type Sel = { kind: Kind; id: string; epicaId: string; featureId?: string }

type Colocado = {
  kind: 'feature' | 'iniciativa'
  id: string; epicaId: string; featureId?: string
  nombre: string; color: string; estado: string
  desde: string | null; hasta: string | null
  ci: number; cj: number; cortaIzq: boolean; cortaDer: boolean
  incompleta: boolean; invertida: boolean; derivada: boolean
  hechas: number; totales: number; pctHecho: number | null
  estMin: number
  responsable?: string | null
  dur: Duracion
}
type ColocadoHito = {
  id: string; epicaId: string; featureId?: string
  t: string; due: string; esMeta: boolean
  estado: 'pendiente' | 'en_curso' | 'logrado'
  i: number; corta: 'izq' | 'der' | null
}
type SinFecha = { kind: Kind; id: string; epicaId: string; featureId?: string; nombre: string; color: string; ctx: string }
type CargaCol = { features: number; hitos: number; estMin: number; capMin: number | null }
type Riesgo = { key: string; kind: Kind; id: string; epicaId: string; featureId?: string; titulo: string; detalle: string; fecha: string | null }
type Cinta = { ci: number; cj: number; derivada: boolean; dur: Duracion; cortaIzq: boolean; cortaDer: boolean }
type Carril = {
  epica: Epica
  cinta: Cinta | null
  hitos: ColocadoHito[]
  cards: Colocado[]
  inisPorFeature: Map<string, Colocado[]>
  nFeatures: number
  ocultas: number
}
type Tablero = {
  carriles: Carril[]
  sinFecha: SinFecha[]
  carga: CargaCol[]
  fueraAntes: number
  fueraDespues: number
  riesgos: { vencidos: Riesgo[]; proximos14: Riesgo[]; dependencias: Riesgo[]; desalineados: Riesgo[] }
  totalFeatures: number
  totalVisibles: number
}
type PlaceOpts = {
  zoom: Zoom; winStart: number; nCols: number
  epicaFilter: string; featureFilter: string
  verHitos: boolean; verIniciativas: boolean; verCerradas: boolean; incluirArchivadas: boolean
  hoy: string
}

const CERRADO_INI = new Set(['cerrada', 'cancelada'])
/** Rango efectivo de una pieza. Regla: desde = inicio ?? fin, hasta = fin ?? inicio. Si las dos
 *  faltan, la pieza NO se dibuja (se va a la bandeja "Sin fecha"): inventarle `today` era el
 *  origen exacto de la barra fantasma sobre la línea de hoy en la versión anterior. */
function rango(a?: string | null, b?: string | null): { desde: string; hasta: string } | null {
  const s = isoOf(a), e = isoOf(b)
  if (!s && !e) return null
  return { desde: s || e, hasta: e || s }
}
/** ¿El rango [as,ae] se sale del rango del padre [ps,pe]? Se usa para avisar cuando mover un
 *  padre deja a un hijo fuera (o al revés). Los extremos del padre llegan CRUDOS (cadena vacía
 *  si esa fecha no existe): un padre a medio planear sólo acota el lado que ya tiene fecha —
 *  pasarle el rango colapsado por rango() marcaba desalineado a todo hijo que no cupiera en ese
 *  único día, y la categoría se volvía puro ruido. */
function fuera(hs: string, he: string, ps: string, pe: string): boolean {
  return (!!ps && hs < ps) || (!!pe && he > pe)
}
/** Cómo se imprime el rango de un padre incompleto en el aviso ('1 ene → —'). */
const rangoTxt = (ini: string, fin: string) => `${ini ? fmtDue(ini) : '—'} → ${fin ? fmtDue(fin) : '—'}`

/** EL memo maestro: un solo recorrido épicas → features → iniciativas → objetivos → tareas que
 *  produce todo lo que el JSX necesita (carriles, cintas, tarjetas, rombos, bandeja, carga por
 *  columna y riesgos). Sin esto, cada tecla en un input de fecha (que hace un setEpicas optimista)
 *  recalcularía el árbol completo varias veces. */
function placeObjects(epicas: Epica[], o: PlaceOpts): Tablero {
  const winEnd = o.winStart + o.nCols - 1
  const carriles: Carril[] = []
  const sinFecha: SinFecha[] = []
  const vencidos: Riesgo[] = [], proximos14: Riesgo[] = [], dependencias: Riesgo[] = [], desalineados: Riesgo[] = []
  const carga: CargaCol[] = Array.from({ length: o.nCols }, () => ({ features: 0, hitos: 0, estMin: 0, capMin: null }))
  let fueraAntes = 0, fueraDespues = 0, totalFeatures = 0

  const activas = epicas.filter(e => o.incluirArchivadas || !e.archived)
  const visibles = activas
    .filter(e => o.epicaFilter === 'todas' || e.id === o.epicaFilter)
    .slice()
    .sort((a, b) => (a.epic_order ?? 0) - (b.epic_order ?? 0))

  // Índice global de iniciativas: `bloqueadaPor` puede apuntar a una borrada (deleteIniciativa no
  // limpia las referencias), y eso se resuelve como aviso, no como render roto.
  const iniIdx = new Map<string, { ini: Iniciativa; epicaNombre: string }>()
  epicas.forEach(e => (e.features || []).forEach(f => (f.iniciativas || []).forEach(i => iniIdx.set(i.id, { ini: i, epicaNombre: e.name }))))

  // Span REAL (buckets sin recortar a la ventana) de cada feature colocado: es la base del
  // prorrateo de las tareas sin fecha propia.
  const spanPorFeature = new Map<string, { lo: number; hi: number }>()

  for (const e of visibles) {
    const feats = (e.features || [])
      // El filtro de feature sólo aplica con una épica elegida ('sin' = ver la épica pelona).
      .filter(f => (o.epicaFilter === 'todas' || o.featureFilter === 'todas')
        ? true : (o.featureFilter !== 'sin' && f.id === o.featureFilter))
      .filter(f => o.verCerradas || (f.estado || 'en_curso') !== 'cerrado')
    const cards: Colocado[] = []
    const inisPorFeature = new Map<string, Colocado[]>()
    const hitos: ColocadoHito[] = []
    let ocultas = 0

    const epRango = rango(e.roadmap_start, e.roadmap_end)
    const epIni = isoOf(e.roadmap_start), epFin = isoOf(e.roadmap_end)
    // Rango derivado de la épica: se arma con lo que PASÓ los filtros (una feature cerrada o
    // escondida no puede seguir dictando dónde se dibuja la cinta de su épica).
    const dsEpica: string[] = []

    const pushHito = (k: EpicaMilestone, featureId?: string) => {
      const due = isoOf(k.due)
      if (!due) {
        // Igual que con las iniciativas: el toggle "ver hitos" filtra el TABLERO, no la bandeja.
        if (k.tipo === 'hito') sinFecha.push({ kind: 'hito', id: k.id, epicaId: e.id, featureId, nombre: k.t || 'Hito', color: e.color, ctx: e.name })
        return
      }
      // En una MÉTRICA `hito_estado` no significa nada (Épicas sólo lo lee dentro de la rama de
      // hitos): su estado sale de `done`. Si no, un rombo de métrica ciclado por error se quedaba
      // verde para siempre y no había desde dónde deshacerlo.
      const esMeta = k.tipo !== 'hito'
      const estado = (esMeta ? (k.done ? 'logrado' : 'pendiente') : (k.hitoEstado || (k.done ? 'logrado' : 'pendiente'))) as ColocadoHito['estado']
      const p = plazoLabel(due, o.hoy, { hecho: estado === 'logrado' })
      if (estado !== 'logrado' && p.dias != null) {
        const r: Riesgo = { key: `hito:${k.id}`, kind: 'hito', id: k.id, epicaId: e.id, featureId, titulo: k.t || 'Hito', detalle: `${e.name} · ${p.texto}`, fecha: due }
        if (p.dias < 0) vencidos.push(r); else if (p.dias <= 14) proximos14.push(r)
      }
      if (!o.verHitos) return
      const b = bucketOf(due, o.zoom)
      if (b < o.winStart || b > winEnd) return
      const c = colOf(due, o.zoom, o.winStart, o.nCols)
      carga[c.i].hitos++
      hitos.push({ id: k.id, epicaId: e.id, featureId, t: k.t || 'Hito', due, esMeta, estado, i: c.i, corta: c.corta })
    }

    ;(e.kpis || []).forEach(k => pushHito(k))

    for (const f of feats) {
      totalFeatures++
      const fr = rango(f.roadmapStart, f.roadmapEnd)
      const fIni = isoOf(f.roadmapStart), fFin = isoOf(f.roadmapEnd)
      const color = f.color || e.color
      const dur = duracionLabel(f.roadmapStart, f.roadmapEnd, o.hoy)
      const tareas = (e.tasks || []).filter(t => t.featureId === f.id && t.status !== ARCHIVED)
      const hechas = tareas.filter(t => t.status === 'Terminada').length

      // Riesgos ANTES del recorte por ventana: la tira de revisión mira todo, no sólo lo visible.
      // El plazo se mide contra la fecha de FIN REAL, no contra el rango colapsado: una pieza que
      // sólo tiene inicio no puede "vencer" contra su propio arranque (la tarjeta ni siquiera le
      // pinta chip de plazo, así que tablero y tira de revisión se contradecían).
      if (fFin && (f.estado || 'en_curso') !== 'cerrado') {
        const p = plazoLabel(fFin, o.hoy)
        if (p.dias != null) {
          const r: Riesgo = { key: `feature:${f.id}`, kind: 'feature', id: f.id, epicaId: e.id, titulo: f.t, detalle: `${e.name} · ${p.texto}`, fecha: fFin }
          if (p.dias < 0) vencidos.push(r); else if (p.dias <= 14) proximos14.push(r)
        }
      }
      if (fr && (epIni || epFin) && fuera(fr.desde, fr.hasta, epIni, epFin)) {
        desalineados.push({ key: `des:f:${f.id}`, kind: 'feature', id: f.id, epicaId: e.id, titulo: f.t, detalle: `cae fuera del rango de «${e.name}» (${rangoTxt(epIni, epFin)})`, fecha: fr.hasta })
      }

      ;(f.kpis || []).forEach(k => pushHito(k, f.id))

      // Iniciativas: se colocan relativas a su feature (dentro de la tarjeta), pero sus riesgos y
      // su ausencia de fechas se registran aunque el feature esté fuera de cuadro.
      const inis: Colocado[] = []
      // Fechas de las iniciativas que pasaron el filtro: de AQUÍ sale el rango derivado del
      // feature. Antes se derivaba de f.iniciativas completo y una iniciativa cancelada e
      // invisible seguía colocando la tarjeta (y sumando a la cabecera de columna).
      const dsIni: string[] = []
      for (const ini of (f.iniciativas || [])) {
        if (!o.verCerradas && CERRADO_INI.has(ini.estado)) continue
        const ir = rango(ini.fechaInicio, ini.fechaFinObjetivo)
        if (ir) dsIni.push(ir.desde, ir.hasta)
        if (ir && !CERRADO_INI.has(ini.estado)) {
          const iFin = isoOf(ini.fechaFinObjetivo)
          if (iFin) {
            const p = plazoLabel(iFin, o.hoy)
            if (p.dias != null) {
              const r: Riesgo = { key: `ini:${ini.id}`, kind: 'iniciativa', id: ini.id, epicaId: e.id, featureId: f.id, titulo: ini.nombre, detalle: `${f.t} · ${p.texto}`, fecha: iFin }
              if (p.dias < 0) vencidos.push(r); else if (p.dias <= 14) proximos14.push(r)
            }
          }
          if ((fIni || fFin) && fuera(ir.desde, ir.hasta, fIni, fFin)) {
            desalineados.push({ key: `des:i:${ini.id}`, kind: 'iniciativa', id: ini.id, epicaId: e.id, featureId: f.id, titulo: ini.nombre, detalle: `cae fuera del rango de «${f.t}» (${rangoTxt(fIni, fFin)})`, fecha: ir.hasta })
          }
        }
        if (ini.bloqueadaPor) {
          const bl = iniIdx.get(ini.bloqueadaPor)
          if (!bl) {
            dependencias.push({ key: `dep:${ini.id}`, kind: 'iniciativa', id: ini.id, epicaId: e.id, featureId: f.id, titulo: ini.nombre, detalle: 'su bloqueante ya no existe (se borró)', fecha: null })
          } else {
            const bFin = isoOf(bl.ini.fechaFinObjetivo)
            const iIni = isoOf(ini.fechaInicio)
            if (bFin && iIni && iIni < bFin) {
              dependencias.push({ key: `dep:${ini.id}`, kind: 'iniciativa', id: ini.id, epicaId: e.id, featureId: f.id, titulo: ini.nombre, detalle: `arranca el ${fmtDue(iIni)}, antes de que cierre «${bl.ini.nombre}» (${fmtDue(bFin)})`, fecha: iIni })
            }
          }
        }
        // La bandeja "Sin fecha" va ANTES del toggle a propósito: "ver iniciativas" decide qué se
        // dibuja en el tablero, no qué existe. Si el toggle también vaciara la bandeja, apagarlo
        // escondería justo las piezas que todavía no se pueden dibujar — y la bandeja es el único
        // lugar de la app donde se les pone fecha de un toque.
        if (!ir) {
          sinFecha.push({ kind: 'iniciativa', id: ini.id, epicaId: e.id, featureId: f.id, nombre: ini.nombre, color, ctx: `${e.name} · ${f.t}` })
          continue
        }
        if (!o.verIniciativas) continue
        const ia = colOf(ir.desde, o.zoom, o.winStart, o.nCols), ib = colOf(ir.hasta, o.zoom, o.winStart, o.nCols)
        const iTareas = (e.tasks || []).filter(t => t.iniciativaId === ini.id && t.status !== ARCHIVED)
        const iHechas = iTareas.filter(t => t.status === 'Terminada').length
        inis.push({
          kind: 'iniciativa', id: ini.id, epicaId: e.id, featureId: f.id, nombre: ini.nombre,
          color, estado: ini.estado, desde: isoOf(ini.fechaInicio) || null, hasta: isoOf(ini.fechaFinObjetivo) || null,
          ci: Math.min(ia.i, ib.i), cj: Math.max(ia.i, ib.i), cortaIzq: ia.corta === 'izq', cortaDer: ib.corta === 'der',
          incompleta: !ini.fechaInicio || !ini.fechaFinObjetivo, derivada: false,
          invertida: duracionLabel(ini.fechaInicio, ini.fechaFinObjetivo, o.hoy).fase === 'invertido',
          hechas: iHechas, totales: iTareas.length, pctHecho: iTareas.length ? iHechas / iTareas.length : null,
          estMin: iTareas.filter(t => t.status !== 'Terminada').reduce((s, t) => s + estMinDe(t), 0),
          responsable: ini.responsable || null,
          dur: duracionLabel(ini.fechaInicio, ini.fechaFinObjetivo, o.hoy),
        })
      }

      // Feature sin fechas propias pero con iniciativas fechadas: se coloca con el rango DERIVADO
      // de ellas (borde punteado + etiqueta). Si no, sus iniciativas desaparecían sin explicación.
      let ef = fr, derivada = false
      if (!ef && dsIni.length) {
        ef = { desde: dsIni.reduce((m, x) => (x < m ? x : m), dsIni[0]), hasta: dsIni.reduce((m, x) => (x > m ? x : m), dsIni[0]) }
        derivada = true
      }
      // La cinta derivada de la épica abarca a sus hijos VISIBLES: el rango del feature (propio o
      // derivado) más el de sus iniciativas que pasaron el filtro.
      if (ef) dsEpica.push(ef.desde, ef.hasta)
      if (dsIni.length) dsEpica.push(...dsIni)
      if (!ef) {
        sinFecha.push({ kind: 'feature', id: f.id, epicaId: e.id, nombre: f.t, color, ctx: e.name })
        continue
      }
      const bA = bucketOf(ef.desde, o.zoom), bB = bucketOf(ef.hasta, o.zoom)
      const lo = Math.min(bA, bB), hi = Math.max(bA, bB)
      if (hi < o.winStart) { fueraAntes++; ocultas++; continue }
      if (lo > winEnd) { fueraDespues++; ocultas++; continue }
      const a = colOf(ef.desde, o.zoom, o.winStart, o.nCols), b = colOf(ef.hasta, o.zoom, o.winStart, o.nCols)
      const ci = Math.min(a.i, b.i), cj = Math.max(a.i, b.i)
      spanPorFeature.set(f.id, { lo, hi })
      for (let i = ci; i <= cj; i++) carga[i].features++
      cards.push({
        kind: 'feature', id: f.id, epicaId: e.id, nombre: f.t, color, estado: f.estado || 'en_curso',
        desde: isoOf(f.roadmapStart) || null, hasta: isoOf(f.roadmapEnd) || null,
        ci, cj, cortaIzq: a.corta === 'izq', cortaDer: b.corta === 'der',
        incompleta: derivada || !f.roadmapStart || !f.roadmapEnd, derivada,
        invertida: dur.fase === 'invertido',
        hechas, totales: tareas.length, pctHecho: tareas.length ? hechas / tareas.length : null,
        estMin: tareas.filter(t => t.status !== 'Terminada').reduce((s, t) => s + estMinDe(t), 0),
        dur: derivada ? duracionLabel(ef.desde, ef.hasta, o.hoy) : dur,
      })
      inisPorFeature.set(f.id, inis)
    }

    // Cinta de la épica: propia si tiene fechas; DERIVADA (contorno punteado) si no las tiene pero
    // sus hijos sí. Una épica sin nada sigue mostrando su carril, con su '+ feature'.
    let cinta: Cinta | null = null
    if (epRango) {
      const a = colOf(epRango.desde, o.zoom, o.winStart, o.nCols), b = colOf(epRango.hasta, o.zoom, o.winStart, o.nCols)
      const lo = bucketOf(epRango.desde, o.zoom), hi = bucketOf(epRango.hasta, o.zoom)
      if (Math.max(lo, hi) >= o.winStart && Math.min(lo, hi) <= winEnd) {
        cinta = { ci: Math.min(a.i, b.i), cj: Math.max(a.i, b.i), derivada: false, dur: duracionLabel(e.roadmap_start, e.roadmap_end, o.hoy), cortaIzq: a.corta === 'izq', cortaDer: b.corta === 'der' }
      }
    } else {
      const ds = dsEpica
      if (ds.length) {
        const min = ds.reduce((m, x) => (x < m ? x : m), ds[0]), max = ds.reduce((m, x) => (x > m ? x : m), ds[0])
        const a = colOf(min, o.zoom, o.winStart, o.nCols), b = colOf(max, o.zoom, o.winStart, o.nCols)
        if (bucketOf(max, o.zoom) >= o.winStart && bucketOf(min, o.zoom) <= winEnd) {
          cinta = { ci: a.i, cj: b.i, derivada: true, dur: duracionLabel(min, max, o.hoy), cortaIzq: a.corta === 'izq', cortaDer: b.corta === 'der' }
        }
      } else {
        // Sin fechas propias y sin un solo hijo fechado: a la bandeja, para poder agendarla de un toque.
        sinFecha.push({ kind: 'epica', id: e.id, epicaId: e.id, nombre: e.name, color: e.color, ctx: 'Épica sin fechas' })
      }
    }

    hitos.sort((a, b) => a.due.localeCompare(b.due))
    carriles.push({ epica: e, cinta, hitos, cards, inisPorFeature, nFeatures: feats.length, ocultas })
  }

  // Carga por columna en HORAS reales: lo fechado cae en su bucket; lo que no tiene fecha propia
  // pero cuelga de un feature colocado se PRORRATEA entre las columnas que ese feature abarca.
  for (const e of visibles) {
    for (const t of (e.tasks || [])) {
      if (t.status === ARCHIVED || t.status === 'Terminada') continue
      const d = isoOf(t.plan) || isoOf(t.due)
      if (d) {
        const i = bucketOf(d, o.zoom) - o.winStart
        if (i >= 0 && i < o.nCols) carga[i].estMin += estMinDe(t)
      } else if (t.featureId) {
        const sp = spanPorFeature.get(t.featureId)
        // El reparto usa el span REAL del feature y sólo suma lo que cae en la ventana: con el
        // span recortado, un feature de cinco años metía TODO su estimado en los 4 trimestres
        // visibles y disparaba el rojo de sobrecarga donde no había nada que hacer.
        if (sp) {
          const n = sp.hi - sp.lo + 1
          for (let i = 0; i < o.nCols; i++) {
            const b = o.winStart + i
            if (b >= sp.lo && b <= sp.hi) carga[i].estMin += estMinDe(t) / n
          }
        }
      }
    }
  }
  // Capacidad: sólo si alguna épica visible tiene presupuesto semanal. Sin dato NO se inventa una
  // capacidad — la cabecera simplemente no pinta el indicador.
  const budget = visibles.reduce((s, e) => s + (typeof e.week_budget === 'number' ? e.week_budget : 0), 0)
  if (budget > 0) carga.forEach((c, i) => { c.capMin = budget * 60 * (diasDelBucket(o.winStart + i, o.zoom) / 7) })

  const porFecha = (a: Riesgo, b: Riesgo) => (a.fecha || '').localeCompare(b.fecha || '')
  return {
    carriles, sinFecha, carga, fueraAntes, fueraDespues, totalFeatures, totalVisibles: visibles.length,
    riesgos: { vencidos: vencidos.sort(porFecha), proximos14: proximos14.sort(porFecha), dependencias, desalineados },
  }
}

/* ─── Estilos (inline, paleta de la casa) ─────────────────────────────────── */
/** Gris de texto secundario: 5.4:1 sobre blanco. Sustituye a los rgba con alfa baja en todo lo
 *  que NO es decoración (etiquetas de barra, estados vacíos, contexto): a 8.5–10px esas alfas
 *  daban 2.3–3.2:1 y eran justo el único rótulo que distinguía dos elementos idénticos. */
const GRIS = '#5B6B86'
const card: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 14 }
const eb: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.62)' }
// Sin `outline: none`: un estilo inline no puede expresar :focus-visible, así que apagarlo aquí
// dejaba ciego el recorrido con teclado de inputs y selects (globals.css sólo cubría button).
const field: CSSProperties = { border: '1px solid rgba(15,35,64,0.16)', borderRadius: 8, padding: '6px 8px', fontSize: 12.5, color: '#16365F', background: '#fff', fontFamily: 'var(--font-ui)' }
const banner: CSSProperties = { marginBottom: 10, padding: '10px 13px', borderRadius: 10, background: 'rgba(176,82,46,0.08)', border: '1px solid rgba(176,82,46,0.3)', fontSize: 12.5, color: '#B0522E' }
const ghostBtn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 99, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.6)', fontFamily: 'var(--font-ui)', lineHeight: 1.5 }
const addBtn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(194,147,58,0.45)', background: 'rgba(194,147,58,0.10)', borderRadius: 99, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, color: '#A87A2C', fontFamily: 'var(--font-ui)' }
const chipBtn = (on: boolean): CSSProperties => ({
  cursor: 'pointer', borderRadius: 99, padding: '5px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-ui)',
  border: on ? '1px solid transparent' : '1px solid rgba(15,35,64,0.14)',
  background: on ? '#10233F' : '#fff', color: on ? '#F3EFE6' : 'rgba(20,35,61,0.62)',
})
const navBtn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 9, padding: '6px 11px', fontSize: 12.5, fontWeight: 700, color: '#16365F', fontFamily: 'var(--font-ui)' }
/** Botón que sigue siendo pulsable (para que pueda EXPLICARSE con un toast) pero se ve apagado. */
const apagado: CSSProperties = { opacity: 0.45, cursor: 'help' }
const MOVER_SIN_FECHAS = 'Este feature no tiene fechas propias: salen de sus iniciativas. Fíjaselas primero (o usa un trimestre).'
// El borde de la pista no es adorno: al imprimir sin gráficos de fondo las dos barras
// desaparecían enteras y quedaban dos filas de etiquetas sin nada al lado.
const barTrack: CSSProperties = { height: 6, boxSizing: 'border-box', borderRadius: 99, background: 'rgba(15,35,64,0.09)', border: '1px solid rgba(15,35,64,0.16)', overflow: 'hidden' }
const barFill: CSSProperties = { height: '100%', borderRadius: 99 }
const microLbl: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: GRIS }

const KIND_LBL: Record<Kind, string> = { epica: 'Épica', feature: 'Feature', iniciativa: 'Iniciativa', hito: 'Hito' }
const MIGRACION: Record<Kind, string> = {
  epica: 'Corre sql/epicas-17-roadmap.sql para guardar fechas de épica.',
  feature: 'Corre sql/epicas-18-features.sql para guardar features.',
  iniciativa: 'Corre sql/epicas-20-iniciativas.sql para guardar iniciativas.',
  hito: 'Corre sql/epicas-19-objetivos.sql para guardar objetivos e hitos.',
}
/** Nombre del campo de fecha por tipo de pieza. Tres convenciones distintas conviven en esta
 *  pantalla (épica en snake_case, feature/iniciativa/objetivo con nombres de cliente) y viven
 *  encapsuladas AQUÍ: ningún otro punto del archivo arma un body a mano. */
const CAMPO: Record<Kind, { desde: string; hasta: string }> = {
  epica: { desde: 'roadmap_start', hasta: 'roadmap_end' },
  feature: { desde: 'roadmapStart', hasta: 'roadmapEnd' },
  iniciativa: { desde: 'fechaInicio', hasta: 'fechaFinObjetivo' },
  hito: { desde: 'due', hasta: 'due' },
}
const urlDe = (t: Sel) => t.kind === 'epica' ? `/api/epicas/${t.id}`
  : t.kind === 'feature' ? `/api/features/${t.id}`
  : t.kind === 'iniciativa' ? `/api/iniciativas/${t.id}`
  : `/api/objetivos/${t.id}`

const merge = <T,>(o: T, d: Record<string, unknown>): T => ({ ...o, ...d }) as unknown as T

/** Cuerpo del PATCH de estado de un hito. Se escribe en LOS DOS lenguajes: hito_estado/
 *  fecha_logrado (lo que lee este tablero) y done/doneAt (lo que lee Épicas en «objetivos en
 *  riesgo» y en el mosaico semanal de cumplidos). Mandar sólo el primero dejaba las dos
 *  pantallas afirmando cosas contrarias del mismo hito, sin ningún aviso. */
const cuerpoHito = (s: 'pendiente' | 'en_curso' | 'logrado', hoy: string): Record<string, unknown> =>
  s === 'logrado'
    ? { hitoEstado: 'logrado', fechaLogrado: hoy, done: true, doneAt: hoy }
    : { hitoEstado: s, fechaLogrado: null, done: false, doneAt: null }

export default function RoadmapClient() {
  const [epicas, setEpicas] = useState<Epica[] | null>(null)
  const [gates, setGates] = useState({ roadmapReady: true, featuresTableReady: true, objetivosTableReady: true, iniciativasTableReady: true })
  const [err, setErr] = useState('')
  const [today, setToday] = useState<string>(todayISO())
  const [mounted, setMounted] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [printMode, setPrintMode] = useState(false)

  const [zoom, setZoom] = useState<Zoom>('trimestre')
  const [winStart, setWinStart] = useState<number>(() => bucketOf(todayISO(), 'trimestre'))
  const [epicaFilter, setEpicaFilter] = useState('todas')
  const [featureFilter, setFeatureFilter] = useState('todas')
  const [verIniciativas, setVerIniciativas] = useState(true)
  const [verHitos, setVerHitos] = useState(true)
  const [verCerradas, setVerCerradas] = useState(false)
  const [incluirArchivadas, setIncluirArchivadas] = useState(false)

  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<Sel | null>(null)
  const [showSinFecha, setShowSinFecha] = useState(true)
  const [toast, setToast] = useState<{ msg: string; err?: boolean; undo?: () => void } | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState<{ kind: 'feature' | 'hito' | 'iniciativa'; epicaId: string; featureId?: string; bucket: number } | null>(null)
  const [nuevoTxt, setNuevoTxt] = useState('')
  // Piezas con una fecha cambiada en pantalla que NO viajó al servidor (rango invertido o fecha a
  // medio teclear). Sin esto el cambio se quedaba aplicado en local para siempre y al recargar
  // «volvía solo» sin explicación.
  const [sinGuardar, setSinGuardar] = useState<Set<string>>(new Set())
  // Popup ligero de tarea (título/estado/vence editables) — antes las tareas de Feature/Iniciativa
  // eran de solo lectura aquí; para todo lo demás (subtareas, nota…) sigue mandando a Épicas.
  const [tareaPeek, setTareaPeek] = useState<{ eId: string; tid: string } | null>(null)

  const epicasRef = useRef<Epica[] | null>(null)
  const selRef = useRef<Sel | null>(null)
  const lastLoad = useRef(0)
  const inflight = useRef<Set<string>>(new Set())
  const writeChain = useRef<Map<string, Promise<unknown>>>(new Map())
  const dateDebounce = useRef<Map<string, number>>(new Map())
  const pendFechas = useRef<Map<string, { vals: Record<string, string>; reverts: (() => void)[] }>>(new Map())
  const toastTimer = useRef<number | null>(null)

  useEffect(() => { epicasRef.current = epicas }, [epicas])
  useEffect(() => { selRef.current = sel }, [sel])
  useEffect(() => { setMounted(true) }, [])

  /* ─── Carga ────────────────────────────────────────────────────────────── */
  const aplicar = useCallback((j: Record<string, unknown>) => {
    // normalize() va AQUÍ, en el fetch, no en un useMemo: le inventa uid() a los features sin id,
    // y recalcularlo por render cambiaría identidades (y keys de React) a cada rato.
    const rows = ((j.data as Epica[]) || []).map(normalize).map(e => ({
      ...e,
      features: (e.features || []).map(f => ({ ...f, kpis: (f.kpis || []).map(normalizeMilestone) })),
    }))
    setGates({
      roadmapReady: j.roadmapReady !== false,
      featuresTableReady: j.featuresTableReady !== false,
      objetivosTableReady: j.objetivosTableReady !== false,
      iniciativasTableReady: j.iniciativasTableReady !== false,
    })
    setEpicas(rows)
    return rows
  }, [])

  useEffect(() => {
    fetch('/api/epicas').then(r => r.json()).then(j => {
      if (!j.ok) { setErr(j.error || 'No se pudo cargar'); setEpicas([]); return }
      lastLoad.current = Date.now()
      aplicar(j)
    }).catch(() => { setErr('No se pudo cargar'); setEpicas([]) })
  }, [aplicar])

  const showToast = useCallback((msg: string, o?: { err?: boolean; undo?: () => void }) => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    setToast({ msg, err: o?.err, undo: o?.undo })
    toastTimer.current = window.setTimeout(() => setToast(null), o?.undo ? 6000 : 3200)
  }, [])

  const marcarPendiente = useCallback((tk: string, on: boolean) => {
    setSinGuardar(prev => {
      if (prev.has(tk) === on) return prev
      const n = new Set(prev)
      if (on) n.add(tk); else n.delete(tk)
      return n
    })
  }, [])

  const flash = useCallback((id: string) => {
    setFlashId(id)
    window.setTimeout(() => setFlashId(cur => (cur === id ? null : cur)), 1300)
  }, [])

  /** Relectura al volver a la pestaña: parche mínimo al hueco multi-dispositivo (si editas la misma
   *  épica desde /epicas en otra pestaña, aquí te enterabas nunca). NO se relee con escrituras en
   *  vuelo — así una respuesta vieja no pisa lo que se acaba de guardar. */
  const revalidar = useCallback(async (force = false) => {
    // También cuenta como "escritura en vuelo" lo que está en el debounce de fechas o acumulado
    // sin mandar: relerlo borraría de la pantalla una edición que el usuario acaba de hacer.
    const ocupado = () => inflight.current.size > 0 || dateDebounce.current.size > 0 || pendFechas.current.size > 0
    if (ocupado()) return
    if (!force && Date.now() - lastLoad.current < 30000) return
    const j = await fetch('/api/epicas').then(r => r.json()).catch(() => null)
    if (!j?.ok || ocupado()) return
    const s = selRef.current
    const antes = s ? JSON.stringify(buscar(epicasRef.current, s)) : ''
    lastLoad.current = Date.now()
    const rows = aplicar(j)
    if (s && JSON.stringify(buscar(rows, s)) !== antes) showToast('Se actualizó desde otro lado')
  }, [aplicar, showToast])

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void revalidar() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [revalidar])

  // Rollover de medianoche: el tablero no puede quedarse pensando que "hoy" es ayer.
  useEffect(() => {
    const id = window.setInterval(() => setToday(t => { const n = todayISO(); return n === t ? t : n }), 30000)
    return () => window.clearInterval(id)
  }, [])

  // `narrow` se decide con JS (matchMedia), así que arranca en false y se corrige aquí: si se
  // decidiera en el primer render, el HTML del servidor y el del cliente no coincidirían.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)')
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  /* ─── Ventana temporal en la URL + preferencias ────────────────────────── */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('print') === '1') setPrintMode(true)
    const z = p.get('z')
    const w = p.get('w')
    const ep = p.get('ep')
    const f = p.get('f')
    let z0: Zoom = 'trimestre'
    try {
      const raw = localStorage.getItem('roadmap.v1')
      if (raw) {
        const s = JSON.parse(raw) as Partial<{ zoom: Zoom; verHitos: boolean; verIniciativas: boolean; verCerradas: boolean; incluirArchivadas: boolean }>
        if (s.zoom === 'mes' || s.zoom === 'trimestre') z0 = s.zoom
        if (typeof s.verHitos === 'boolean') setVerHitos(s.verHitos)
        if (typeof s.verIniciativas === 'boolean') setVerIniciativas(s.verIniciativas)
        if (typeof s.verCerradas === 'boolean') setVerCerradas(s.verCerradas)
        if (typeof s.incluirArchivadas === 'boolean') setIncluirArchivadas(s.incluirArchivadas)
      }
    } catch { /* localStorage bloqueado: se sigue con los valores por defecto */ }
    if (z === 'mes' || z === 'trimestre') z0 = z
    setZoom(z0)
    setWinStart(w && /^-?\d+$/.test(w) ? +w : bucketOf(todayISO(), z0))
    if (ep) setEpicaFilter(ep)
    if (f) setFeatureFilter(f)
  }, [])

  useEffect(() => {
    if (!mounted) return
    try { localStorage.setItem('roadmap.v1', JSON.stringify({ zoom, verHitos, verIniciativas, verCerradas, incluirArchivadas })) } catch { /* sin persistencia */ }
    const p = new URLSearchParams(window.location.search)
    p.set('z', zoom); p.set('w', String(winStart))
    if (epicaFilter === 'todas') p.delete('ep'); else p.set('ep', epicaFilter)
    if (featureFilter === 'todas') p.delete('f'); else p.set('f', featureFilter)
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`)
  }, [mounted, zoom, winStart, epicaFilter, featureFilter, verHitos, verIniciativas, verCerradas, incluirArchivadas])

  /* ─── Escritura optimista ──────────────────────────────────────────────── */
  /** Aplica el cambio en el árbol YA y devuelve el revert con el valor previo capturado.
   *  Fuente única de optimismo para los cuatro writers. */
  const applyLocal = useCallback((p: Sel & { data: Record<string, unknown> }) => {
    const previo = capturar(epicasRef.current, p, Object.keys(p.data))
    const mutar = (data: Record<string, unknown>) => setEpicas(prev => aplicarEn(prev, p, data))
    mutar(p.data)
    return () => mutar(previo)
  }, [])

  /** Encola por id (dos ediciones seguidas de la misma pieza no se cruzan), marca la escritura en
   *  vuelo (para que la relectura no la pise) y revierte + avisa si el servidor dice que no. */
  const patchRemoto = useCallback((url: string, body: Record<string, unknown>, key: string, revert: () => void, exito?: { msg: string; undo?: () => void }) => {
    inflight.current.add(key)
    const anterior = writeChain.current.get(key) || Promise.resolve()
    const run = anterior.catch(() => { }).then(async () => {
      const r = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(x => x.json()).catch(() => null)
      if (!r?.ok) { revert(); showToast(r?.error || 'No se pudo guardar', { err: true }) }
      else if (exito) showToast(exito.msg, { undo: exito.undo })
    }).finally(() => {
      if (writeChain.current.get(key) === run) { inflight.current.delete(key); writeChain.current.delete(key) }
    })
    writeChain.current.set(key, run)
  }, [showToast])

  /** Absorbe lo que el debounce de fechas tenía pendiente para ESTA pieza y devuelve el body ya
   *  fusionado. Sin esto, el atajo de trimestre (o «1 sem →», o un chip de estado) encolaba su
   *  PATCH y 400 ms después el temporizador encolaba el suyo con la fecha vieja: en Supabase
   *  quedaba el rango invertido y en pantalla no se notaba hasta recargar.
   *  Lo que venga en `body` gana (es la intención más reciente); si la fusión deja el rango al
   *  revés, lo pendiente se descarta y se deshace en pantalla para que lo que se ve sea lo que
   *  está guardado. */
  const fusionarPendientes = useCallback((t: Sel, body: Record<string, unknown>): Record<string, unknown> => {
    const tk = `${t.kind}:${t.id}`
    const timer = dateDebounce.current.get(tk)
    if (timer != null) { window.clearTimeout(timer); dateDebounce.current.delete(tk) }
    const acum = pendFechas.current.get(tk)
    pendFechas.current.delete(tk)
    marcarPendiente(tk, false)
    if (!acum) return body
    const out: Record<string, unknown> = { ...body }
    Object.keys(acum.vals).forEach(k => { if (!(k in out)) out[k] = acum.vals[k] || null })
    const nd = typeof out[CAMPO[t.kind].desde] === 'string' ? out[CAMPO[t.kind].desde] as string : ''
    const nh = typeof out[CAMPO[t.kind].hasta] === 'string' ? out[CAMPO[t.kind].hasta] as string : ''
    if (t.kind !== 'hito' && nd && nh && nh < nd) {
      acum.reverts.slice().reverse().forEach(r => r())
      showToast('Se descartó una fecha sin guardar (el fin caía antes del inicio)', { err: true })
      return body
    }
    return out
  }, [marcarPendiente, showToast])

  /** ÚNICA puerta de escritura. Las rutas y los nombres de campo por tipo viven en urlDe/CAMPO;
   *  el body va SPARSE (sólo la clave que cambió: mandar `roadmapEnd: null` BORRA la fecha). */
  const escribir = useCallback((t: Sel, body: Record<string, unknown>, exito?: { msg: string; undo?: () => void }) => {
    const listo = t.kind === 'epica' ? gates.roadmapReady : t.kind === 'feature' ? gates.featuresTableReady
      : t.kind === 'iniciativa' ? gates.iniciativasTableReady : gates.objetivosTableReady
    if (!listo) { showToast(MIGRACION[t.kind], { err: true }); return }
    const final = fusionarPendientes(t, body)
    const revert = applyLocal({ ...t, data: final })
    patchRemoto(urlDe(t), final, `${t.kind}:${t.id}`, revert, exito)
  }, [gates, applyLocal, patchRemoto, showToast, fusionarPendientes])

  /** Edita UNA tarea desde el popup de Roadmap — camino aparte de escribir()/Sel (que es sólo para
   *  épica/feature/iniciativa/hito): las tareas viven en /api/tareas/sync, que espera el objeto
   *  COMPLETO (no un patch), así que se manda t con el campo cambiado encima. El revert es
   *  quirúrgico (sólo ESTA tarea vuelve a su valor de antes) — no toda la épica — para no pisar
   *  otro cambio optimista a la misma épica que haya terminado bien mientras éste fallaba. */
  const patchTarea = useCallback((epicaId: string, taskId: string, patch: Partial<EpicaTask>) => {
    const cur = epicasRef.current?.find(e => e.id === epicaId)
    const prevTask = cur?.tasks?.find(x => x.id === taskId)
    if (!cur || !prevTask) return
    const nextTask: EpicaTask = { ...prevTask, ...patch }
    setEpicas(list => (list || []).map(e => (e.id !== epicaId ? e : { ...e, tasks: (e.tasks || []).map(x => (x.id === taskId ? nextTask : x)) })))
    const revertir = () => {
      setEpicas(list => (list || []).map(e => (e.id !== epicaId ? e : { ...e, tasks: (e.tasks || []).map(x => (x.id === taskId ? prevTask : x)) })))
      showToast('No se pudo guardar la tarea', { err: true })
    }
    fetch('/api/tareas/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ epicaId, update: [nextTask] }) })
      .then(r => r.json()).then(j => { if (!j?.ok) revertir() })
      .catch(revertir)
  }, [showToast])

  const fechasDe = useCallback((t: Sel): { desde: string; hasta: string } => {
    const o = buscar(epicasRef.current, t)
    if (!o) return { desde: '', hasta: '' }
    if (t.kind === 'epica') { const e = o as Epica; return { desde: isoOf(e.roadmap_start), hasta: isoOf(e.roadmap_end) } }
    if (t.kind === 'feature') { const f = o as EpicaFeature; return { desde: isoOf(f.roadmapStart), hasta: isoOf(f.roadmapEnd) } }
    if (t.kind === 'iniciativa') { const i = o as Iniciativa; return { desde: isoOf(i.fechaInicio), hasta: isoOf(i.fechaFinObjetivo) } }
    const k = o as EpicaMilestone
    return { desde: isoOf(k.due), hasta: isoOf(k.due) }
  }, [])

  /** Teclear el año en un <input type="date"> pasa por '0002-…', '0020-…', '0202-…': por eso el
   *  optimismo es inmediato pero el PATCH espera 400 ms, y nunca se manda un rango invertido.
   *  Los extremos tecleados se ACUMULAN por pieza (un solo temporizador): si uno quedó bloqueado
   *  por el rango invertido, viaja junto con el que lo destrabó — nunca se queda un extremo
   *  cambiado en pantalla y sin guardar. */
  const setFecha = useCallback((t: Sel, campo: 'desde' | 'hasta', v: string) => {
    const cur = fechasDe(t)
    const key = CAMPO[t.kind][campo]
    const tk = `${t.kind}:${t.id}`
    const revert = applyLocal({ ...t, data: { [key]: v || undefined } })
    const pend = pendFechas.current.get(tk) || { vals: {}, reverts: [] }
    pend.vals[key] = v
    pend.reverts.push(revert)
    pendFechas.current.set(tk, pend)
    const prev = dateDebounce.current.get(tk)
    if (prev != null) window.clearTimeout(prev)
    // Los dos casos en que NO se manda nada se MARCAN: el cambio ya se ve en pantalla y sin la
    // marca se quedaba ahí, sin guardar y sin avisar, hasta que una recarga lo revertía.
    if (v && !ISO_RE.test(v)) { marcarPendiente(tk, true); return }          // fecha a medio teclear
    const nd = campo === 'desde' ? v : cur.desde, nh = campo === 'hasta' ? v : cur.hasta
    if (t.kind !== 'hito' && nd && nh && nh < nd) {                          // rango al revés
      marcarPendiente(tk, true)
      showToast('El fin cae antes del inicio: este cambio NO se guardó', { err: true })
      return
    }
    marcarPendiente(tk, false)
    dateDebounce.current.set(tk, window.setTimeout(() => {
      dateDebounce.current.delete(tk)
      const acum = pendFechas.current.get(tk)
      pendFechas.current.delete(tk)
      if (!acum) return
      const body: Record<string, unknown> = {}
      Object.keys(acum.vals).forEach(kk => { body[kk] = acum.vals[kk] || null })
      const deshacer = () => acum.reverts.slice().reverse().forEach(r => r())
      const listo = t.kind === 'epica' ? gates.roadmapReady : t.kind === 'feature' ? gates.featuresTableReady
        : t.kind === 'iniciativa' ? gates.iniciativasTableReady : gates.objetivosTableReady
      if (!listo) { showToast(MIGRACION[t.kind], { err: true }); deshacer(); return }
      patchRemoto(urlDe(t), body, tk, deshacer)
    }, 400))
  }, [fechasDe, applyLocal, patchRemoto, gates, showToast, marcarPendiente])

  /** Agenda la pieza COMPLETA dentro de un bucket (motor de los botones T4·T1·T2 de la bandeja). */
  const fecharEnBucket = useCallback((t: Sel, b: number) => {
    const { ini, fin } = bucketRange(b, zoom)
    const prev = fechasDe(t)
    const body: Record<string, unknown> = t.kind === 'hito'
      ? { due: fin }
      : { [CAMPO[t.kind].desde]: ini, [CAMPO[t.kind].hasta]: fin }
    const undoBody: Record<string, unknown> = t.kind === 'hito'
      ? { due: prev.hasta || null }
      : { [CAMPO[t.kind].desde]: prev.desde || null, [CAMPO[t.kind].hasta]: prev.hasta || null }
    escribir(t, body, { msg: `Agendado en ${bucketLabel(b, zoom)}`, undo: () => escribir(t, undoBody) })
    flash(t.id)
  }, [zoom, fechasDe, escribir, flash])

  /** Correr la pieza N días conservando su duración (los botones fantasma de la tarjeta). */
  const correr = useCallback((t: Sel, dias: number) => {
    const { desde, hasta } = fechasDe(t)
    // Una tarjeta de fechas DERIVADAS (las pone su hijo) no tiene nada propio que correr: antes
    // el botón se veía igual que los demás y no hacía absolutamente nada, sin decir por qué.
    if (!desde && !hasta) {
      showToast('Esta pieza no tiene fechas propias — fíjaselas primero (o usa un trimestre)', { err: true })
      return
    }
    const body: Record<string, unknown> = {}
    if (t.kind === 'hito') body.due = addDays(hasta || desde, dias)
    else {
      if (desde) body[CAMPO[t.kind].desde] = addDays(desde, dias)
      if (hasta) body[CAMPO[t.kind].hasta] = addDays(hasta, dias)
    }
    const etiqueta = Math.abs(dias) === 7 ? '1 semana' : Math.abs(dias) === 30 ? '1 mes' : `${Math.abs(dias)} días`
    escribir(t, body, { msg: `Movido ${dias > 0 ? '+' : '−'}${etiqueta}`, undo: () => correr(t, -dias) })
    flash(t.id)
  }, [fechasDe, escribir, flash, showToast])

  /** Ciclar el rombo SÓLO tiene sentido en un hito: una métrica no tiene hito_estado (Épicas ni
   *  lo lee) y ciclarla la pintaba «lograda» aquí mientras allá seguía al 20%. */
  const cicloHito = useCallback((h: ColocadoHito) => {
    const orden: ColocadoHito['estado'][] = ['pendiente', 'en_curso', 'logrado']
    const next = orden[(orden.indexOf(h.estado) + 1) % 3]
    const t: Sel = { kind: 'hito', id: h.id, epicaId: h.epicaId, featureId: h.featureId }
    escribir(t, cuerpoHito(next, today),
      { msg: `«${h.t}» → ${next === 'en_curso' ? 'en curso' : next}`, undo: () => escribir(t, cuerpoHito(h.estado, today)) })
  }, [escribir, today])

  /** Estira la épica para que abarque a sus features: mata el caso "épica sin fechas con hijos
   *  fechados" (la cinta derivada) de un botón. */
  const abarcarFeatures = useCallback((e: Epica) => {
    const ds: string[] = []
    ;(e.features || []).forEach(f => { const r = rango(f.roadmapStart, f.roadmapEnd); if (r) ds.push(r.desde, r.hasta) })
    if (!ds.length) { showToast('Esta épica no tiene features con fecha', { err: true }); return }
    const min = ds.reduce((m, x) => (x < m ? x : m), ds[0]), max = ds.reduce((m, x) => (x > m ? x : m), ds[0])
    const t: Sel = { kind: 'epica', id: e.id, epicaId: e.id }
    const prev = { roadmap_start: e.roadmap_start || null, roadmap_end: e.roadmap_end || null }
    escribir(t, { roadmap_start: min, roadmap_end: max }, { msg: `Épica de ${fmtDue(min)} a ${fmtDue(max)}`, undo: () => escribir(t, prev) })
  }, [escribir, showToast])

  /* ─── Altas desde el propio roadmap ────────────────────────────────────── */
  const crear = useCallback(async () => {
    if (!nuevo) return
    const txt = nuevoTxt.trim()
    if (!txt) return
    const { ini, fin } = bucketRange(nuevo.bucket, zoom)
    const id = uid()
    setNuevo(null); setNuevoTxt('')
    if (nuevo.kind === 'feature') {
      if (!gates.featuresTableReady) { showToast(MIGRACION.feature, { err: true }); return }
      const ep = (epicasRef.current || []).find(e => e.id === nuevo.epicaId)
      const color = FEATURE_COLORS[((ep?.features || []).length) % FEATURE_COLORS.length]
      const body = { id, epicaId: nuevo.epicaId, t: txt, color, estado: 'en_curso', roadmapStart: ini, roadmapEnd: fin }
      const r = await fetch('/api/features', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => null)
      if (!r?.ok) { showToast(r?.error || 'No se pudo crear el feature', { err: true }); return }
      const nf: EpicaFeature = { id, t: txt, color, estado: 'en_curso', roadmapStart: ini, roadmapEnd: fin, kpis: [], iniciativas: [] }
      setEpicas(prev => (prev || []).map(e => e.id === nuevo.epicaId ? { ...e, features: [...(e.features || []), nf] } : e))
      flash(id); showToast(`Feature «${txt}» en ${bucketLabel(nuevo.bucket, zoom)}`)
    } else if (nuevo.kind === 'iniciativa' && nuevo.featureId) {
      if (!gates.iniciativasTableReady) { showToast(MIGRACION.iniciativa, { err: true }); return }
      const body = { id, featureId: nuevo.featureId, epicaId: nuevo.epicaId, nombre: txt, estado: 'pendiente', fechaInicio: ini, fechaFinObjetivo: fin }
      const r = await fetch('/api/iniciativas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => null)
      if (!r?.ok) { showToast(r?.error || 'No se pudo crear la iniciativa', { err: true }); return }
      const ni: Iniciativa = { id, featureId: nuevo.featureId, epicaId: nuevo.epicaId, nombre: txt, estado: 'pendiente', fechaInicio: ini, fechaFinObjetivo: fin }
      setEpicas(prev => (prev || []).map(e => e.id !== nuevo.epicaId ? e : {
        ...e, features: (e.features || []).map(f => f.id !== nuevo.featureId ? f : { ...f, iniciativas: [...(f.iniciativas || []), ni] }),
      }))
      flash(id); showToast(`Iniciativa «${txt}» creada`)
    } else {
      if (!gates.objetivosTableReady) { showToast(MIGRACION.hito, { err: true }); return }
      // Un objetivo cuelga de la épica O de un feature, nunca de los dos (CHECK owner-xor).
      const owner = nuevo.featureId ? { featureId: nuevo.featureId } : { epicaId: nuevo.epicaId }
      const body = { id, t: txt, tipo: 'hito', hitoEstado: 'pendiente', due: fin, ...owner }
      const r = await fetch('/api/objetivos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => null)
      if (!r?.ok) { showToast(r?.error || 'No se pudo crear el hito', { err: true }); return }
      const nk: EpicaMilestone = { id, t: txt, tipo: 'hito', hitoEstado: 'pendiente', due: fin }
      setEpicas(prev => (prev || []).map(e => e.id !== nuevo.epicaId ? e : (nuevo.featureId
        ? { ...e, features: (e.features || []).map(f => f.id !== nuevo.featureId ? f : { ...f, kpis: [...(f.kpis || []), nk] }) }
        : { ...e, kpis: [...(e.kpis || []), nk] })))
      flash(id); showToast(`Hito «${txt}» el ${fmtDue(fin)}`)
    }
  }, [nuevo, nuevoTxt, zoom, gates, showToast, flash])

  /* ─── Derivados ────────────────────────────────────────────────────────── */
  const nCols = narrow ? 1 : zoom === 'trimestre' ? Q_COLS : M_COLS
  const railW = narrow ? 0 : RAIL_W

  const tablero = useMemo(() => placeObjects(epicas || [], {
    zoom, winStart, nCols, epicaFilter, featureFilter, verHitos, verIniciativas, verCerradas, incluirArchivadas, hoy: today,
  }), [epicas, zoom, winStart, nCols, epicaFilter, featureFilter, verHitos, verIniciativas, verCerradas, incluirArchivadas, today])

  const cols = useMemo(() => Array.from({ length: nCols }, (_, i) => winStart + i), [nCols, winStart])
  // Atajos de "agéndalo aquí": SIEMPRE tres, aunque en móvil sólo se vea una columna.
  const atajos = useMemo(() => [0, 1, 2].map(k => winStart + k), [winStart])
  const bucketSugerido = Math.min(winStart + 2, Math.max(winStart, bucketOf(today, zoom)))
  const bHoy = bucketOf(today, zoom)
  const iHoy = bHoy - winStart
  const fracHoy = useMemo(() => {
    const { ini } = bucketRange(bHoy, zoom)
    const total = diasDelBucket(bHoy, zoom)
    const t0 = new Date(ini + 'T00:00:00').getTime(), t1 = new Date(today + 'T00:00:00').getTime()
    return Math.max(0, Math.min(1, Math.round((t1 - t0) / 86400000) / total))
  }, [bHoy, zoom, today])

  const listaEpicas = useMemo(() => (epicas || [])
    .filter(e => incluirArchivadas || !e.archived)
    .slice().sort((a, b) => (a.epic_order ?? 0) - (b.epic_order ?? 0)), [epicas, incluirArchivadas])
  const featuresDeFiltro = useMemo(() => {
    if (epicaFilter === 'todas') return []
    const e = (epicas || []).find(x => x.id === epicaFilter)
    return (e?.features || [])
  }, [epicas, epicaFilter])

  const selObj = useMemo(() => (sel ? buscar(epicas, sel) : null), [epicas, sel])
  // La pieza abierta se borró (desde otra pestaña, o al filtrar): el panel se cierra solo.
  useEffect(() => { if (sel && epicas && !selObj) setSel(null) }, [sel, epicas, selObj])

  /* ─── Navegación temporal + teclado ────────────────────────────────────── */
  const irA = useCallback((b: number) => setWinStart(b), [])
  const saltarA = useCallback((r: Riesgo) => {
    if (r.fecha) setWinStart(bucketOf(r.fecha, zoom))
    setSel({ kind: r.kind, id: r.id, epicaId: r.epicaId, featureId: r.featureId })
    flash(r.id)
  }, [zoom, flash])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null
      const tag = (el?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) {
        if (ev.key === 'Escape') (el as HTMLElement).blur()
        return
      }
      if (ev.key === 'Escape') { setSel(null); setNuevo(null); return }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); setWinStart(w => w - 1) }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); setWinStart(w => w + 1) }
      else if (ev.key === 't' || ev.key === 'T') { ev.preventDefault(); setWinStart(bucketOf(todayISO(), zoom)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  /** Cambiar de zoom conserva la ventana: se traduce la fecha de inicio visible a la otra escala. */
  const cambiarZoom = (z: Zoom) => {
    if (z === zoom) return
    const { ini } = bucketRange(winStart, zoom)
    setWinStart(bucketOf(ini, z))
    // El formulario de alta guarda su bucket como ENTERO de la escala en que se abrió (trimestre
    // = año*4+q, mes = año*12+m). Si no se traduce, `crear()` lo lee con la escala nueva y manda
    // el feature al año 675: desaparece del tablero y nadie se entera.
    setNuevo(n => (n ? { ...n, bucket: bucketOf(bucketRange(n.bucket, zoom).ini, z) } : n))
    setZoom(z)
  }

  /* ─── Piezas de render ─────────────────────────────────────────────────── */
  const gridCols: CSSProperties = { display: 'grid', gridTemplateColumns: `repeat(${nCols}, minmax(0,1fr))`, gap: GAP }
  const anchoMin = railW + nCols * COL_MIN + (nCols - 1) * GAP

  const renderRombo = (h: ColocadoHito) => {
    const t = dueTone(h.due, h.estado === 'logrado', today)
    const pl = plazoLabel(h.due, today, { hecho: h.estado === 'logrado' })
    // Forma + relleno + texto: el color nunca es el único código. Logrado = relleno sólido,
    // en curso = medio tinte, pendiente = hueco; una métrica va con borde punteado.
    const relleno = h.estado === 'logrado' ? '#2E6E6E' : h.estado === 'en_curso' ? hexA('#C2933A', 0.5) : '#FBFAF6'
    const abrir = () => setSel({ kind: 'hito', id: h.id, epicaId: h.epicaId, featureId: h.featureId })
    return (
      <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {/* El padding + margen negativo da 29px de área táctil sin mover el dibujo ni la fila:
            13px pegados al texto del hito se tocaban por error y ciclaban su estado. */}
        <button onClick={() => (h.esMeta ? abrir() : cicloHito(h))}
          title={h.esMeta
            ? `${h.t} · métrica · ${fmtDue(h.due)} · ${pl.texto} · clic para abrirla (se edita en Épicas)`
            : `${h.t} · ${fmtDue(h.due)} · ${pl.texto} (${pl.detalle}) · clic para cambiar de estado`}
          aria-label={h.esMeta ? `Métrica ${h.t}, ${pl.texto}. Abrir` : `Hito ${h.t}, ${pl.texto}, estado ${h.estado}. Cambiar estado`}
          style={{ padding: 8, margin: -8, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0, lineHeight: 0, borderRadius: 8 }}>
          <span aria-hidden style={{
            display: 'block', width: 13, height: 13, transform: 'rotate(45deg)', borderRadius: 2,
            background: relleno, border: `2px ${h.esMeta ? 'dashed' : 'solid'} ${h.estado === 'logrado' ? '#2E6E6E' : t.c}`,
          }} />
        </button>
        <button {...clickable(abrir, `Abrir ${h.esMeta ? 'métrica' : 'hito'} ${h.t}`)}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: t.c, fontFamily: 'var(--font-ui)' }}>
          {h.corta === 'izq' ? '‹ ' : ''}{h.t} · {pl.corto}{h.corta === 'der' ? ' ›' : ''}
        </button>
      </div>
    )
  }

  const renderIniciativaBar = (ini: Colocado, span: { ci: number; cj: number }) => {
    const st = iniciativaStyle(ini.estado)
    const pl = plazoLabel(ini.hasta, today, { hecho: CERRADO_INI.has(ini.estado) })
    const ci = Math.max(span.ci, Math.min(span.cj, ini.ci)) - span.ci
    const cj = Math.max(span.ci, Math.min(span.cj, ini.cj)) - span.ci
    return (
      <div key={ini.id} style={{ ...colStyle(ci, cj), minWidth: 0 }}>
        <div {...clickable(() => setSel({ kind: 'iniciativa', id: ini.id, epicaId: ini.epicaId, featureId: ini.featureId }), `Iniciativa ${ini.nombre}`)}
          title={`${ini.nombre} · ${st.label} · ${ini.dur.detalle}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 0,
            background: st.bg, border: `1px ${ini.incompleta ? 'dashed' : 'solid'} ${hexA(st.c, 0.35)}`,
            borderLeft: `3px solid ${st.c}`, borderRadius: 8, padding: '4px 8px',
            boxShadow: flashId === ini.id ? `0 0 0 3px ${hexA('#C2933A', 0.55)}` : 'none',
          }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 700, color: '#16365F' }}>
            {ini.cortaIzq ? '‹ ' : ''}{ini.nombre}{ini.cortaDer ? ' ›' : ''}
          </span>
          {/* Estos tres datos son el único rótulo de la barra: piso de 10.5px y gris legible. */}
          <span style={{ fontSize: 10.5, fontWeight: 800, color: st.c, whiteSpace: 'nowrap' }}>{st.label}</span>
          {ini.hasta && <span title={pl.detalle} style={{ fontSize: 10.5, fontWeight: 700, color: pl.c, whiteSpace: 'nowrap' }}>{pl.corto}</span>}
          {ini.totales > 0 && <span style={{ fontSize: 10.5, color: GRIS, whiteSpace: 'nowrap' }}>{ini.hechas}/{ini.totales}</span>}
        </div>
      </div>
    )
  }

  const renderFeatureCard = (f: Colocado, e: Epica, inis: Colocado[]) => {
    const fs = featureStyle(f.estado)
    const pl = plazoLabel(f.hasta, today, { hecho: f.estado === 'cerrado' })
    const tiempo = f.dur.avance          // avance por CALENDARIO
    const hecho = f.pctHecho             // avance REAL por tareas cerradas
    const detras = tiempo != null && hecho != null && tiempo - hecho > 0.15
    const abierta = !colapsadas.has(f.id)
    const target: Sel = { kind: 'feature', id: f.id, epicaId: e.id }
    const span = { ci: f.ci, cj: f.cj }
    return (
      <div key={f.id} className="rm-card" style={{
        ...colStyle(f.ci, f.cj), background: '#fff', borderRadius: 12, minHeight: 62, padding: '9px 11px', minWidth: 0,
        border: `1px solid ${hexA(f.color, 0.30)}`,
        borderLeft: `3px ${f.incompleta ? 'dashed' : 'solid'} ${f.invertida ? '#B0522E' : f.color}`,
        borderTopLeftRadius: f.cortaIzq ? 2 : 12, borderBottomLeftRadius: f.cortaIzq ? 2 : 12,
        borderTopRightRadius: f.cortaDer ? 2 : 12, borderBottomRightRadius: f.cortaDer ? 2 : 12,
        outline: sel?.kind === 'feature' && sel.id === f.id ? `2px solid ${hexA(f.color, 0.55)}` : 'none',
        boxShadow: flashId === f.id ? `0 0 0 3px ${hexA('#C2933A', 0.55)}` : '0 1px 2px rgba(15,35,64,0.05)',
        transition: 'box-shadow .25s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {inis.length > 0 && (
            <button onClick={() => setColapsadas(prev => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n })}
              aria-expanded={abierta} aria-label={`${abierta ? 'Ocultar' : 'Ver'} las iniciativas de ${f.nombre}`}
              style={{ ...ghostBtn, border: 'none', background: 'transparent', padding: '0 2px', color: 'rgba(20,35,61,0.45)', fontSize: 11 }}>{abierta ? '▾' : '▸'}</button>
          )}
          {f.cortaIzq && <span aria-hidden style={{ color: 'rgba(20,35,61,0.4)' }}>‹</span>}
          <button {...clickable(() => setSel(target), `Abrir feature ${f.nombre}`)}
            style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#16365F', padding: 0, fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</button>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: fs.c, background: fs.bg, borderRadius: 99, padding: '2px 7px', whiteSpace: 'nowrap' }}>{fs.label}</span>
          {f.cortaDer && <span aria-hidden style={{ color: 'rgba(20,35,61,0.4)' }}>›</span>}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
          <span title={f.dur.detalle} style={{ fontSize: 10.5, fontWeight: 700, color: f.dur.c }}>⏱ {f.dur.corto}</span>
          {f.hasta && <span title={pl.detalle} style={{ fontSize: 10.5, fontWeight: 700, color: pl.c, background: pl.bg, border: `1px solid ${pl.border}`, borderRadius: 99, padding: '2px 7px' }}>{pl.texto}</span>}
          {f.totales > 0 && <span style={{ fontSize: 10.5, color: GRIS }}>{f.hechas}/{f.totales} tareas</span>}
          {f.estMin > 0 && <span style={{ fontSize: 10.5, color: GRIS }}>≈ {fmtHoras(f.estMin)}</span>}
          {detras && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#B0522E' }}>⚠ vas detrás</span>}
          {f.invertida && <span title={f.dur.nota} style={{ fontSize: 10.5, fontWeight: 800, color: '#B0522E' }}>⚠ revisa las fechas</span>}
          {/* «revisa las fechas» habla del dato; esto otro habla del GUARDADO, que es lo que el
              usuario no tenía forma de distinguir cuando el PATCH se suprimía. */}
          {sinGuardar.has(`feature:${f.id}`) && (
            <span title="Hay un cambio de fecha aplicado en pantalla que todavía no se guardó: ábrelo y corrige el otro extremo"
              style={{ fontSize: 10.5, fontWeight: 800, color: '#B0522E' }}>⚠ sin guardar</span>
          )}
          {f.derivada && <span title="El feature no tiene fechas propias: el rango sale de sus iniciativas" style={{ fontSize: 10.5, fontWeight: 700, color: '#A87A2C' }}>fechas derivadas</span>}
          {f.incompleta && !f.invertida && !f.derivada && f.dur.nota && <span title={f.dur.nota} style={{ fontSize: 10.5, fontWeight: 700, color: '#A87A2C' }}>{f.dur.nota}</span>}
        </div>

        {(tiempo != null || hecho != null) && (
          // Dos barras ETIQUETADAS: cuánto del calendario se consumió vs cuánto se hizo de verdad.
          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '48px 1fr', gap: '3px 6px', alignItems: 'center' }}>
            <span style={microLbl}>tiempo</span>
            <div style={barTrack}><div style={{ ...barFill, width: `${Math.round((tiempo || 0) * 100)}%`, background: hexA(f.color, 0.55) }} /></div>
            <span style={microLbl}>hecho</span>
            <div style={barTrack}><div style={{ ...barFill, width: `${Math.round((hecho || 0) * 100)}%`, background: detras ? '#B0522E' : f.color }} /></div>
          </div>
        )}
        {f.dur.fase === 'enCurso' && <div style={{ fontSize: 10.5, color: GRIS, marginTop: 4 }}>{f.dur.transcurrido}</div>}

        <div className="rm-quick" style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {/* Con fechas derivadas estos botones no tienen nada que correr: se pintan apagados y,
              si se tocan, correr() explica por qué no pasa nada. */}
          <button onClick={() => correr(target, -7)} style={{ ...ghostBtn, ...(f.derivada ? apagado : null) }} title={f.derivada ? MOVER_SIN_FECHAS : 'Adelantar una semana'}>← 1 sem</button>
          <button onClick={() => correr(target, 7)} style={{ ...ghostBtn, ...(f.derivada ? apagado : null) }} title={f.derivada ? MOVER_SIN_FECHAS : 'Retrasar una semana'}>1 sem →</button>
          <button onClick={() => correr(target, 30)} style={{ ...ghostBtn, ...(f.derivada ? apagado : null) }} title={f.derivada ? MOVER_SIN_FECHAS : 'Retrasar un mes'}>1 mes →</button>
          <button onClick={() => { setSel(target); setNuevo({ kind: 'iniciativa', epicaId: e.id, featureId: f.id, bucket: f.ci + winStart }); setNuevoTxt('') }} style={ghostBtn}>+ iniciativa</button>
        </div>

        {abierta && inis.length > 0 && (
          <div style={{ marginTop: 7, display: 'grid', gridTemplateColumns: `repeat(${f.cj - f.ci + 1}, minmax(0,1fr))`, gap: 4 }}>
            {inis.map(i => renderIniciativaBar(i, span))}
          </div>
        )}
      </div>
    )
  }

  const renderCarril = (c: Carril) => {
    const e = c.epica
    const rail = (
      <div className="rm-rail" style={{
        width: narrow ? '100%' : RAIL_W, flexShrink: 0, position: narrow ? 'static' : 'sticky', left: 0, zIndex: 5,
        background: '#fff', paddingRight: narrow ? 0 : 12, marginBottom: narrow ? 8 : 0,
      }}>
        <div {...clickable(() => setSel({ kind: 'epica', id: e.id, epicaId: e.id }), `Épica ${e.name}`)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: e.color, flexShrink: 0 }} />
            {/* El rail es sticky y pinta encima de la primera columna: un nombre largo sin cortar
                se saldría de sus 168px y taparía las tarjetas. minWidth 0 + wrap lo mantienen dentro. */}
            <span style={{ minWidth: 0, fontSize: 14, fontWeight: 700, color: '#16365F', overflowWrap: 'anywhere' }}>{e.name}</span>
            {e.archived && <span style={eb}>archivada</span>}
          </div>
          <div style={{ fontSize: 11.5, color: GRIS, marginTop: 4 }}>{doneCount(e)}/{taskCount(e)} · {pctOf(e)}%</div>
          {c.cinta && (
            <div title={c.cinta.dur.detalle} style={{ fontSize: 10.5, color: c.cinta.dur.c, marginTop: 3 }}>
              {c.cinta.derivada ? 'derivada · ' : ''}{c.cinta.dur.texto}
            </div>
          )}
          {c.ocultas > 0 && <div style={{ fontSize: 10.5, color: GRIS, marginTop: 3 }}>{c.ocultas} fuera de esta ventana</div>}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <button onClick={() => { setNuevo({ kind: 'feature', epicaId: e.id, bucket: bucketSugerido }); setNuevoTxt('') }} style={ghostBtn}>+ feature</button>
          <button onClick={() => { setNuevo({ kind: 'hito', epicaId: e.id, bucket: bucketSugerido }); setNuevoTxt('') }} style={ghostBtn}>+ hito</button>
        </div>
        {nuevo && nuevo.epicaId === e.id && !nuevo.featureId && renderAlta()}
      </div>
    )

    return (
      <div key={e.id} className="rm-lane" style={{
        display: 'flex', flexDirection: narrow ? 'column' : 'row', alignItems: 'stretch',
        borderBottom: '1px solid rgba(15,35,64,0.08)', padding: '14px 0',
      }}>
        {rail}
        <div style={{ ...gridCols, flex: 1, position: 'relative', gridAutoFlow: 'row dense', alignItems: 'start', alignContent: 'start', minHeight: 54, minWidth: 0 }}>
          {/* Fondo: una celda por columna con la MISMA rejilla, así el velo del pasado, el tinte de
              la columna actual y la marca de HOY caen exactos aunque haya gap. */}
          <div aria-hidden style={{ ...gridCols, position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {cols.map(b => (
              <div key={b} style={{
                position: 'relative', borderRadius: 8,
                border: '1px solid rgba(15,35,64,0.06)',
                background: b === bHoy ? 'rgba(194,147,58,0.06)' : b < bHoy ? 'rgba(15,35,64,0.022)' : 'transparent',
              }}>
                {b === bHoy && <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${fracHoy * 100}%`, width: 2, background: '#B0522E' }} />}
              </div>
            ))}
          </div>

          {c.cinta && (
            <div style={{ gridColumn: '1 / -1', ...gridCols, marginBottom: 4 }}>
              <div title={`${e.name} · ${c.cinta.derivada ? 'rango derivado de sus features' : `${fmtDue(isoOf(e.roadmap_start))} → ${fmtDue(isoOf(e.roadmap_end))}`} · ${c.cinta.dur.detalle}`}
                style={{
                  // La cinta propia lleva borde además del relleno: sin él desaparecía del PDF
                  // (los fondos no se imprimen por omisión) y el papel enseñaba justo las épicas
                  // SIN fechas, escondiendo las que sí las tienen.
                  ...colStyle(c.cinta.ci, c.cinta.cj), height: 8, borderRadius: 99, boxSizing: 'border-box',
                  background: c.cinta.derivada ? 'transparent' : hexA(e.color, 0.28),
                  border: `1px ${c.cinta.derivada ? 'dashed' : 'solid'} ${hexA(e.color, 0.6)}`,
                }} />
            </div>
          )}

          {verHitos && c.hitos.length > 0 && (
            <div style={{ gridColumn: '1 / -1', ...gridCols, marginBottom: 4 }}>
              {c.hitos.map(h => <div key={h.id} style={{ ...colStyle(h.i, h.i), minWidth: 0 }}>{renderRombo(h)}</div>)}
            </div>
          )}

          {c.cards.map(f => renderFeatureCard(f, e, c.inisPorFeature.get(f.id) || []))}

          {c.cards.length === 0 && (
            <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: GRIS, padding: '10px 2px' }}>
              {c.nFeatures === 0 ? 'Sin features todavía — créale uno desde el rail.' : 'Nada de esta épica cae en esta ventana.'}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderAlta = () => {
    if (!nuevo) return null
    const etiqueta = nuevo.kind === 'feature' ? 'Nuevo feature' : nuevo.kind === 'iniciativa' ? 'Nueva iniciativa' : 'Nuevo hito'
    return (
      <div style={{ marginTop: 8, padding: 8, borderRadius: 10, background: 'rgba(194,147,58,0.07)', border: '1px solid rgba(194,147,58,0.3)' }}>
        <div style={{ ...eb, marginBottom: 6 }}>{etiqueta}</div>
        <input autoFocus value={nuevoTxt} onChange={ev => setNuevoTxt(ev.target.value)}
          onKeyDown={ev => { if (ev.key === 'Enter') void crear(); if (ev.key === 'Escape') setNuevo(null) }}
          placeholder="Nombre…" style={{ ...field, width: '100%' }} />
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {atajos.map(b => (
            <button key={b} onClick={() => setNuevo({ ...nuevo, bucket: b })}
              style={{ ...ghostBtn, ...(nuevo.bucket === b ? { background: '#10233F', color: '#F3EFE6', border: '1px solid transparent' } : {}) }}>{bucketLabel(b, zoom)}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={() => void crear()} style={{ ...addBtn, background: '#10233F', color: '#fff', border: '1px solid transparent' }}>Crear</button>
          <button onClick={() => setNuevo(null)} style={ghostBtn}>Cancelar</button>
        </div>
      </div>
    )
  }

  const renderFechasEditor = (t: Sel, disabled?: string) => {
    const { desde, hasta } = fechasDe(t)
    const d = duracionLabel(desde, hasta, today)
    const pendiente = sinGuardar.has(`${t.kind}:${t.id}`)
    return (
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={eb}>Inicio</span>
            <input type="date" value={desde} disabled={!!disabled} onChange={ev => setFecha(t, 'desde', ev.target.value)} style={field} />
          </label>
          <span aria-hidden style={{ color: 'rgba(20,35,61,0.4)', alignSelf: 'flex-end', paddingBottom: 8 }}>→</span>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={eb}>Fin objetivo</span>
            <input type="date" value={hasta} disabled={!!disabled} onChange={ev => setFecha(t, 'hasta', ev.target.value)} style={field} />
          </label>
        </div>
        <div title={d.detalle} style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: d.c }}>
          {d.texto}{d.transcurrido ? ` · ${d.transcurrido}` : ''}{d.restante ? ` · ${d.restante.texto}` : ''}
          {d.nota && <div style={{ fontWeight: 400, fontSize: 11.5, marginTop: 2 }}>{d.nota}</div>}
        </div>
        {/* «Revisa las fechas» habla del dato; esto dice que el cambio NO viajó al servidor —
            la confusión entre las dos cosas era lo que hacía que la fecha "volviera sola". */}
        {pendiente && (
          <div style={{ ...banner, marginTop: 8, marginBottom: 0 }}>
            ⚠ Este cambio de fecha <b>no se ha guardado</b>: el fin cae antes del inicio (o la fecha está a medio escribir).
            Corrige el otro extremo y los dos se guardan juntos.
          </div>
        )}
        {!disabled && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {atajos.map(b => <button key={b} onClick={() => fecharEnBucket(t, b)} style={addBtn}>{bucketLabel(b, zoom)}</button>)}
            <button onClick={() => setFecha(t, 'hasta', addMonths(hasta || desde || today, 1))} style={addBtn}>+1 mes</button>
            <button onClick={() => { setFecha(t, 'desde', ''); setFecha(t, 'hasta', '') }} style={ghostBtn}>Quitar fechas</button>
          </div>
        )}
        {disabled && <div style={{ fontSize: 11.5, color: '#B0522E', marginTop: 8 }}>{disabled}</div>}
      </div>
    )
  }

  // Fila de tarea para las listas "Tareas" del panel (feature e iniciativa) — antes era una línea
  // de texto plana Y de solo lectura; ahora lleva el mismo chip de estado con color que ya usan
  // Épicas/backlog, y tocarla abre un popup editable (renderTareaPeek) sin salir de Roadmap.
  const renderTareaRow = (epicaId: string) => (t: EpicaTask) => {
    const st = taskStyle(t.status)
    const pz = t.due ? plazoLabel(t.due, today, { hecho: t.status === 'Terminada', verbo: 'seco' }) : null
    return (
      <button key={t.id} onClick={() => setTareaPeek({ eId: epicaId, tid: t.id! })} title={`Abrir “${t.t}”`}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 0', border: 'none', borderBottom: '1px solid rgba(15,35,64,0.06)', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)' }}>
        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, borderRadius: 99, padding: '2px 8px', background: st.bg, color: st.c }}>{st.label}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'Terminada' ? 'line-through' : 'none' }}>{t.t}</span>
        {pz && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: pz.c }}>{pz.corto}</span>}
      </button>
    )
  }

  /** Popup ligero de UNA tarea: título, estado y fecha de entrega editables ahí mismo — para todo
   *  lo demás (subtareas, nota, estimado…) manda a Épicas, no intenta ser el editor completo. */
  const renderTareaPeek = () => {
    if (!tareaPeek) return null
    const ep = (epicas || []).find(e => e.id === tareaPeek.eId)
    const t = ep?.tasks?.find(x => x.id === tareaPeek.tid)
    if (!ep || !t) return null
    const cerrar = () => setTareaPeek(null)
    return createPortal(
      <>
        <div onClick={cerrar} className="rm-noprint" style={{ position: 'fixed', inset: 0, background: 'rgba(16,35,64,0.4)', zIndex: 98, backdropFilter: 'blur(2px)' }} />
        <div role="dialog" aria-modal="true" aria-label="Detalle de la tarea" onClick={ev => ev.stopPropagation()} className="rm-noprint"
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 99, width: 'min(440px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 48px)', overflowY: 'auto', background: '#FBFAF6', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(20,35,61,0.55)' }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: ep.color, flexShrink: 0 }} />{ep.name}</span>
            <button onClick={cerrar} aria-label="Cerrar" style={{ ...ghostBtn, padding: '4px 9px', fontSize: 13 }}>✕</button>
          </div>
          <input key={t.id} defaultValue={t.t} aria-label="Nombre de la tarea"
            onBlur={ev => { const v = ev.target.value.trim(); if (v && v !== t.t) patchTarea(ep.id, t.id!, { t: v }) }}
            style={{ ...field, width: '100%', fontSize: 16, fontWeight: 700, marginTop: 10 }} />
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
            {(['Por hacer', 'En curso', 'Esperando', 'Terminada'] as const).map(s => {
              const st = taskStyle(s), on = t.status === s
              return <button key={s} onClick={() => patchTarea(ep.id, t.id!, { status: s })}
                style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-ui)', color: on ? '#fff' : st.c, background: on ? st.c : st.bg, border: `1px solid ${on ? st.c : 'transparent'}` }}>{st.label}</button>
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <label style={{ display: 'block', flex: '1 1 150px' }}>
              <span style={eb}>Hacer</span>
              <input type="date" value={t.plan || ''} onChange={ev => patchTarea(ep.id, t.id!, { plan: ev.target.value })} style={{ ...field, display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', flex: '1 1 150px' }}>
              <span style={eb}>Vence</span>
              <input type="date" value={t.due || ''} onChange={ev => patchTarea(ep.id, t.id!, { due: ev.target.value })} style={{ ...field, display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
            <div style={{ flex: '1 1 150px' }}>
              <span style={eb}>Prioridad</span>
              <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                {(['alta', 'media', 'baja'] as Prio[]).map(p => {
                  const ps = prioStyle(p), on = (t.priority || 'media') === p
                  return <button key={p} onClick={() => patchTarea(ep.id, t.id!, { priority: p })} title={ps.label}
                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', borderRadius: 8, padding: '6px 4px', border: on ? `1px solid ${ps.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? 'rgba(194,147,58,0.08)' : '#fff' }}><PrioBars p={p} size={11} /></button>
                })}
              </div>
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <span style={eb}>Dificultad</span>
              <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                {(['facil', 'media', 'dificil'] as Dif[]).map(d => {
                  const ds = difStyle(d), on = (t.difficulty || 'media') === d
                  return <button key={d} onClick={() => patchTarea(ep.id, t.id!, { difficulty: d })} title={ds.label}
                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', borderRadius: 8, padding: '6px 4px', border: on ? `1px solid ${ds.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? ds.bg : '#fff' }}><DifDots d={d} size={9} /></button>
                })}
              </div>
            </div>
          </div>
          <a href={`/epicas?e=${ep.id}&t=${t.id}`} style={{ display: 'inline-block', marginTop: 18, fontSize: 12.5, fontWeight: 700, color: '#A87A2C', textDecoration: 'none' }}>Editar todo en Épicas ↗</a>
        </div>
      </>, document.body
    )
  }

  const renderPanel = () => {
    if (!sel || !selObj) return null
    const ep = (epicas || []).find(e => e.id === sel.epicaId)
    const feat = sel.featureId ? (ep?.features || []).find(f => f.id === sel.featureId) : undefined
    const cierra = () => setSel(null)
    // Migas de pan CLICKEABLES: antes eran texto plano — para volver a las otras iniciativas de un
    // feature (o a las otras features de una épica) había que cerrar el panel entero y volver a
    // tocar la pieza. Ninguno de los dos segmentos es el nivel actual (ese ya se ve abajo, en el
    // título editable), así que ambos son ancestros y ambos navegan.
    // Color + flecha SIEMPRE visibles (no sólo al pasar el mouse) — un botón que se ve idéntico
    // a texto plano hasta que lo tocas no se percibe como clickeable; con "‹" + el color dorado
    // de acción (mismo que "Abrir en Épicas ↗") queda claro de un vistazo que se puede navegar.
    const migaBtn: CSSProperties = { cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, color: '#A87A2C' }
    const migas = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {ep && (
          <button onClick={() => setSel({ kind: 'epica', id: ep.id, epicaId: ep.id })} title={`Volver a ${ep.name}`} style={migaBtn}>‹ {ep.name}</button>
        )}
        {feat && <>
          <span aria-hidden style={{ opacity: 0.5 }}>›</span>
          <button onClick={() => setSel({ kind: 'feature', id: feat.id, epicaId: sel.epicaId })} title={`Volver a ${feat.t}`} style={migaBtn}>{feat.t}</button>
        </>}
        {!ep && 'Roadmap'}
      </span>
    )

    const cuerpo = () => {
      if (sel.kind === 'epica') {
        const e = selObj as Epica
        const dsFeats = (e.features || []).filter(f => f.roadmapStart || f.roadmapEnd).length
        return (
          <>
            <div className="serif" style={{ fontSize: 22, fontWeight: 600, color: '#10233F', marginTop: 4 }}>{e.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', marginTop: 4 }}>{e.status} · {doneCount(e)}/{taskCount(e)} tareas · {pctOf(e)}%</div>
            <div style={{ marginTop: 16 }}>{renderFechasEditor(sel, gates.roadmapReady ? undefined : MIGRACION.epica)}</div>
            {dsFeats > 0 && (
              <button onClick={() => abarcarFeatures(e)} style={{ ...addBtn, marginTop: 10 }}>Abarcar sus {dsFeats} feature{dsFeats === 1 ? '' : 's'}</button>
            )}
            <div style={{ ...eb, marginTop: 20, marginBottom: 6 }}>Features</div>
            {(e.features || []).length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Sin features.</div>}
            {(e.features || []).map(f => {
              const d = duracionLabel(f.roadmapStart, f.roadmapEnd, today)
              const fs = featureStyle(f.estado)
              return (
                <button key={f.id} {...clickable(() => setSel({ kind: 'feature', id: f.id, epicaId: e.id }), `Abrir ${f.t}`)}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left', border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 10, padding: '7px 9px', marginBottom: 6, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: f.color || e.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#16365F' }}>{f.t}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: fs.c }}>{fs.label}</span>
                  <span style={{ fontSize: 10.5, color: d.c }}>{d.corto}</span>
                </button>
              )
            })}
          </>
        )
      }
      if (sel.kind === 'feature') {
        const f = selObj as EpicaFeature
        const inis = f.iniciativas || []
        const tareas = (ep?.tasks || []).filter(t => t.featureId === f.id && t.status !== ARCHIVED)
        const desal = tablero.riesgos.desalineados.filter(r => r.id === f.id)
        const sinPropias = !isoOf(f.roadmapStart) && !isoOf(f.roadmapEnd)
        return (
          <>
            <input key={f.id} defaultValue={f.t} onBlur={ev => { const v = ev.target.value.trim(); if (v && v !== f.t) escribir(sel, { t: v }) }}
              aria-label="Nombre del feature" style={{ ...field, width: '100%', fontSize: 16, fontWeight: 700, marginTop: 4 }} />
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
              {['en_curso', 'al_dia', 'en_riesgo', 'en_pausa', 'cerrado'].map(s => {
                const st = featureStyle(s), on = (f.estado || 'en_curso') === s
                return <button key={s} onClick={() => escribir(sel, { estado: s })}
                  style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-ui)', color: on ? '#fff' : st.c, background: on ? st.c : st.bg, border: `1px solid ${on ? st.c : 'transparent'}` }}>{st.label}</button>
              })}
            </div>
            <div style={{ marginTop: 16 }}>{renderFechasEditor(sel, gates.featuresTableReady ? undefined : MIGRACION.feature)}</div>
            {desal.map(r => <div key={r.key} style={{ ...banner, marginTop: 10, marginBottom: 0 }}>⚠ {r.detalle}</div>)}
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {/* Mismo criterio que en la tarjeta: sin fechas propias no hay nada que correr. */}
              {([[-7, '← 1 sem'], [7, '1 sem →'], [30, '1 mes →']] as [number, string][]).map(([n, lbl]) => (
                <button key={n} onClick={() => correr(sel, n)} title={sinPropias ? MOVER_SIN_FECHAS : undefined}
                  style={{ ...ghostBtn, ...(sinPropias ? apagado : null) }}>{lbl}</button>
              ))}
            </div>

            <div style={{ ...eb, marginTop: 20, marginBottom: 6 }}>Iniciativas · {inis.length}</div>
            {inis.map(i => {
              const st = iniciativaStyle(i.estado)
              const d = duracionLabel(i.fechaInicio, i.fechaFinObjetivo, today)
              return (
                <button key={i.id} {...clickable(() => setSel({ kind: 'iniciativa', id: i.id, epicaId: sel.epicaId, featureId: f.id }), `Abrir ${i.nombre}`)}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left', border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 10, padding: '7px 9px', marginBottom: 6, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#16365F' }}>{i.nombre}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: st.c, background: st.bg, borderRadius: 99, padding: '2px 7px' }}>{st.label}</span>
                  <span style={{ fontSize: 10.5, color: d.c }}>{d.corto}</span>
                </button>
              )
            })}
            <button onClick={() => { setNuevo({ kind: 'iniciativa', epicaId: sel.epicaId, featureId: f.id, bucket: bucketSugerido }); setNuevoTxt('') }} style={addBtn}>+ iniciativa</button>
            {nuevo?.kind === 'iniciativa' && nuevo.featureId === f.id && renderAlta()}

            <div style={{ ...eb, marginTop: 20, marginBottom: 6 }}>Tareas · {tareas.length}</div>
            <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}>
              {tareas.filter(t => t.status === 'Terminada').length} terminadas · {tareas.filter(t => t.status !== 'Terminada').length} pendientes
            </div>
            <div style={{ marginTop: 6 }}>{tareas.slice(0, 8).map(renderTareaRow(sel.epicaId))}</div>
            {tareas.length > 8 && <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.4)', marginTop: 5 }}>y {tareas.length - 8} más…</div>}
            <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.4)', marginTop: 8 }}>Las tareas se editan en Épicas (aquí sólo se leen).</div>
          </>
        )
      }
      if (sel.kind === 'iniciativa') {
        const i = selObj as Iniciativa
        const hermanas = (feat?.iniciativas || []).filter(x => x.id !== i.id)
        const dep = tablero.riesgos.dependencias.filter(r => r.id === i.id)
        // Antes esta pieza no mostraba NADA de trabajo real — para ver qué tareas trae había que
        // salir del todo a Épicas. Mismo patrón que la lista de "Tareas" del feature, de arriba.
        const tareas = (ep?.tasks || []).filter(t => t.iniciativaId === i.id && t.status !== ARCHIVED)
        return (
          <>
            {/* Botón EXPLÍCITO además de la miga de pan de arriba — "Eugenia" ahí ya hace esto
                mismo, pero como nombre de feature no se lee obvio como "el botón para volver a
                las iniciativas"; con las palabras puestas no hay duda. Misma navegación (no
                cierra el panel, sólo cambia sel a la feature). */}
            {feat && (
              <button onClick={() => setSel({ kind: 'feature', id: feat.id, epicaId: sel.epicaId })} style={{ ...ghostBtn, marginBottom: 10 }}>‹ Ver las otras iniciativas de {feat.t}</button>
            )}
            <input key={i.id} defaultValue={i.nombre} onBlur={ev => { const v = ev.target.value.trim(); if (v && v !== i.nombre) escribir(sel, { nombre: v }) }}
              aria-label="Nombre de la iniciativa" style={{ ...field, width: '100%', fontSize: 16, fontWeight: 700, marginTop: 4 }} />
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
              {['pendiente', 'en_curso', 'bloqueada', 'cerrada', 'cancelada'].map(s => {
                const st = iniciativaStyle(s), on = i.estado === s
                return <button key={s} onClick={() => escribir(sel, { estado: s })}
                  style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-ui)', color: on ? '#fff' : st.c, background: on ? st.c : st.bg, border: `1px solid ${on ? st.c : 'transparent'}` }}>{st.label}</button>
              })}
            </div>
            <div style={{ marginTop: 16 }}>{renderFechasEditor(sel, gates.iniciativasTableReady ? undefined : MIGRACION.iniciativa)}</div>
            <label style={{ display: 'block', marginTop: 16 }}>
              <span style={eb}>Responsable</span>
              <input key={`r-${i.id}`} defaultValue={i.responsable || ''} onBlur={ev => { const v = ev.target.value.trim(); if (v !== (i.responsable || '')) escribir(sel, { responsable: v || null }) }}
                placeholder="yo, abogado, contador…" style={{ ...field, width: '100%', marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginTop: 14 }}>
              <span style={eb}>Bloqueada por</span>
              <select value={i.bloqueadaPor || ''} onChange={ev => escribir(sel, { bloqueadaPor: ev.target.value || null })}
                style={{ ...field, width: '100%', marginTop: 4, cursor: 'pointer' }}>
                <option value="">— nada la bloquea —</option>
                {hermanas.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                {i.bloqueadaPor && !hermanas.some(h => h.id === i.bloqueadaPor) && <option value={i.bloqueadaPor}>Iniciativa borrada</option>}
              </select>
            </label>
            {dep.map(r => <div key={r.key} style={{ ...banner, marginTop: 10, marginBottom: 0 }}>⛓ {r.detalle}</div>)}

            <div style={{ ...eb, marginTop: 20, marginBottom: 6 }}>Tareas · {tareas.length}</div>
            {tareas.length === 0
              ? <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.45)' }}>Sin tareas todavía — se agregan desde Épicas.</div>
              : (<>
                <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}>
                  {tareas.filter(t => t.status === 'Terminada').length} terminadas · {tareas.filter(t => t.status !== 'Terminada').length} pendientes
                </div>
                <div style={{ marginTop: 6 }}>{tareas.slice(0, 8).map(renderTareaRow(sel.epicaId))}</div>
                {tareas.length > 8 && <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.4)', marginTop: 5 }}>y {tareas.length - 8} más…</div>}
              </>)}
            <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.4)', marginTop: 8 }}>Las tareas se editan en Épicas (aquí sólo se leen).</div>
          </>
        )
      }
      const k = selObj as EpicaMilestone
      const esHito = k.tipo === 'hito'
      const pl = plazoLabel(k.due, today, { hecho: k.hitoEstado === 'logrado' })
      return (
        <>
          <input key={k.id} defaultValue={k.t} onBlur={ev => { const v = ev.target.value.trim(); if (v && v !== k.t) escribir(sel, { t: v }) }}
            aria-label="Nombre del objetivo" style={{ ...field, width: '100%', fontSize: 16, fontWeight: 700, marginTop: 4 }} />
          <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', marginTop: 6 }}>{esHito ? 'Hito' : 'Métrica'} · {pl.texto} <span style={{ color: 'rgba(20,35,61,0.4)' }}>({pl.detalle})</span></div>
          <label style={{ display: 'block', marginTop: 16 }}>
            <span style={eb}>Fecha objetivo</span>
            <input type="date" value={isoOf(k.due)} disabled={!gates.objetivosTableReady} onChange={ev => setFecha(sel, 'hasta', ev.target.value)} style={{ ...field, display: 'block', marginTop: 4 }} />
          </label>
          {!gates.objetivosTableReady && <div style={{ fontSize: 11.5, color: '#B0522E', marginTop: 8 }}>{MIGRACION.hito}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {atajos.map(b => <button key={b} onClick={() => fecharEnBucket(sel, b)} style={addBtn}>fin de {bucketLabel(b, zoom)}</button>)}
          </div>
          {esHito && (
            <>
              <div style={{ ...eb, marginTop: 20, marginBottom: 6 }}>Estado</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {(['pendiente', 'en_curso', 'logrado'] as const).map(s => {
                  const on = (k.hitoEstado || 'pendiente') === s
                  const c = s === 'logrado' ? '#2E6E6E' : s === 'en_curso' ? '#2E5A9E' : '#5B6B86'
                  return <button key={s} onClick={() => escribir(sel, cuerpoHito(s, today))}
                    style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-ui)', color: on ? '#fff' : c, background: on ? c : hexA(c, 0.12), border: `1px solid ${on ? c : 'transparent'}` }}>
                    {s === 'en_curso' ? 'En curso' : s === 'logrado' ? 'Logrado' : 'Pendiente'}
                  </button>
                })}
              </div>
              {k.fechaLogrado && <div style={{ fontSize: 12, color: '#2E6E6E', marginTop: 8 }}>Logrado el {fmtDue(k.fechaLogrado)}</div>}
            </>
          )}
          {!esHito && (
            <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.55)', marginTop: 14 }}>
              Meta: {k.target ?? '—'} · actual: {k.current ?? '—'}. Las métricas se editan en Épicas.
            </div>
          )}
          <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.4)', marginTop: 12 }}>Un objetivo no cambia de dueño desde aquí (épica ↔ feature).</div>
        </>
      )
    }

    // El velo y la hoja llevan rm-noprint: son `position: fixed`, así que sin eso salían impresos
    // ENCIMA de los carriles de la página 1 (dos capas de texto superpuestas) cada vez que se
    // mandaba a PDF con el panel abierto.
    return createPortal(
      <>
        <div onClick={cierra} className="rm-noprint" style={{ position: 'fixed', inset: 0, background: 'rgba(16,35,64,0.18)', zIndex: 94 }} />
        <aside role="dialog" aria-modal="true" aria-label="Detalle del roadmap" className="rm-sheet rm-noprint"
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px,100vw)', zIndex: 95,
            background: '#FBFAF6', borderLeft: '1px solid rgba(15,35,64,0.10)', boxShadow: '-24px 0 60px -30px rgba(8,18,36,.5)',
            overflowY: 'auto', padding: '16px 18px',
          }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={eb}>{migas}</div>
            </div>
            <button onClick={cierra} aria-label="Cerrar" style={{ ...ghostBtn, padding: '4px 9px', fontSize: 13 }}>✕</button>
          </div>
          {cuerpo()}
          {/* EpicasDashboard.tsx lee ?e=<id> para dejar esa épica destacada (?ep= es un parámetro
              DISTINTO ahí — el filtro de Feature en la vista Semana — así que este link nunca
              llevaba a ningún lado útil). */}
          <a href={`/epicas?e=${sel.epicaId}`} style={{ display: 'inline-block', marginTop: 22, fontSize: 12.5, fontWeight: 700, color: '#A87A2C', textDecoration: 'none' }}>Abrir en Épicas ↗</a>
          <div style={{ height: 24 }} />
        </aside>
      </>, document.body)
  }

  /* ─── Render ───────────────────────────────────────────────────────────── */
  const { carriles, sinFecha, carga, fueraAntes, fueraDespues, riesgos, totalFeatures, totalVisibles } = tablero
  const hayGate = !gates.roadmapReady || !gates.featuresTableReady || !gates.objetivosTableReady || !gates.iniciativasTableReady

  return (
    <div style={{ minHeight: '100vh', background: '#f3efe6', color: '#10233F' }}>
      <SiteHeader title="Roadmap" subtitle="A dónde vamos · ADVL" backHref="/" backLabel="← Accesos" extra={<SectionNav current="roadmap" />} />
      <main className="ep-shell" style={{ maxWidth: 1360, margin: '18px auto 60px', padding: '0 20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: '#10233F' }}>🗺️ Roadmap</div>
            <div style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.55)', marginTop: 4 }}>
              Cada columna es un {zoom === 'trimestre' ? 'trimestre' : 'mes'}; cada carril, una épica. Toca cualquier pieza para editar sus fechas.
            </div>
          </div>
          {/* Se cierra el panel antes de imprimir (además del rm-noprint, por si el navegador
              pinta la hoja antes de que React aplique el cambio). */}
          <button onClick={() => { setSel(null); window.print() }} className="rm-noprint" style={navBtn}>Guardar como PDF</button>
        </div>

        {!gates.roadmapReady && <div style={banner}>Corre <code>sql/epicas-17-roadmap.sql</code> en Supabase: sin esa migración las fechas de <b>épica</b> no se guardan (features e iniciativas sí).</div>}
        {!gates.featuresTableReady && <div style={banner}>Corre <code>sql/epicas-18-features.sql</code>: la capa de <b>features</b> está apagada.</div>}
        {!gates.objetivosTableReady && <div style={banner}>Corre <code>sql/epicas-19-objetivos.sql</code>: los <b>hitos y objetivos</b> no se pueden guardar.</div>}
        {!gates.iniciativasTableReady && <div style={banner}>Corre <code>sql/epicas-20-iniciativas.sql</code>: la capa de <b>iniciativas</b> está apagada.</div>}
        {err && <div onClick={() => setErr('')} style={{ ...banner, cursor: 'pointer' }}>{err} · toca para cerrar</div>}

        {epicas === null ? (
          <div style={{ ...card, padding: 16 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: i < 3 ? '1px solid rgba(15,35,64,0.06)' : 'none' }}>
                <div style={{ width: 140, height: 14, borderRadius: 6, background: 'rgba(15,35,64,0.07)' }} />
                <div style={{ flex: 1, height: 44, borderRadius: 10, background: 'rgba(15,35,64,0.05)' }} />
              </div>
            ))}
            <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.42)', marginTop: 10 }}>Cargando el tablero…</div>
          </div>
        ) : (
          <>
            {/* ── Barra de mando ── */}
            <div className="rm-noprint" style={{ ...card, padding: '10px 12px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setWinStart(w => w - 1)} style={navBtn} aria-label="Ventana anterior">◀</button>
                <button onClick={() => setWinStart(bucketOf(today, zoom))} style={{ ...navBtn, fontWeight: 800 }}>Hoy</button>
                <button onClick={() => setWinStart(w => w + 1)} style={navBtn} aria-label="Ventana siguiente">▶</button>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16365F', marginLeft: 4 }}>
                  {bucketLabel(winStart, zoom)}{nCols > 1 ? ` – ${bucketLabel(winStart + nCols - 1, zoom)}` : ''}
                </span>
                <div style={{ display: 'inline-flex', gap: 2, background: 'rgba(15,35,64,0.05)', borderRadius: 99, padding: 3, marginLeft: 6 }}>
                  {(['trimestre', 'mes'] as Zoom[]).map(z => (
                    <button key={z} onClick={() => cambiarZoom(z)} style={{ ...chipBtn(zoom === z), padding: '4px 12px', fontSize: 11.5 }}>{z === 'trimestre' ? 'Trimestre' : 'Mes'}</button>
                  ))}
                </div>
                <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)' }}>{totalVisibles} épica{totalVisibles === 1 ? '' : 's'} · {totalFeatures} feature{totalFeatures === 1 ? '' : 's'}</span>
                <span style={{ flex: 1 }} />
                {fueraAntes > 0 && <button onClick={() => setWinStart(w => w - nCols)} style={ghostBtn}>‹ {fueraAntes} antes</button>}
                {fueraDespues > 0 && <button onClick={() => setWinStart(w => w + nCols)} style={ghostBtn}>{fueraDespues} después ›</button>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => { setEpicaFilter('todas'); setFeatureFilter('todas') }} style={chipBtn(epicaFilter === 'todas')}>Todas las épicas</button>
                {listaEpicas.map(e => (
                  <button key={e.id} onClick={() => { setEpicaFilter(e.id); setFeatureFilter('todas') }}
                    style={{ ...chipBtn(epicaFilter === e.id), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}
                  </button>
                ))}
              </div>

              {epicaFilter !== 'todas' && featuresDeFiltro.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={eb}>Feature</span>
                  <button onClick={() => setFeatureFilter('todas')} style={{ ...chipBtn(featureFilter === 'todas'), padding: '4px 10px', fontSize: 11.5 }}>Todos</button>
                  {featuresDeFiltro.map(f => (
                    <button key={f.id} onClick={() => setFeatureFilter(f.id)} style={{ ...chipBtn(featureFilter === f.id), padding: '4px 10px', fontSize: 11.5 }}>{f.t}</button>
                  ))}
                  <button onClick={() => setFeatureFilter('sin')} style={{ ...chipBtn(featureFilter === 'sin'), padding: '4px 10px', fontSize: 11.5 }}>Sólo la épica</button>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'rgba(20,35,61,0.6)' }}>
                {([
                  ['Iniciativas', verIniciativas, setVerIniciativas],
                  ['Hitos', verHitos, setVerHitos],
                  ['Cerradas', verCerradas, setVerCerradas],
                  ['Archivadas', incluirArchivadas, setIncluirArchivadas],
                ] as [string, boolean, (v: boolean) => void][]).map(([lbl, val, set]) => (
                  <label key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={val} onChange={ev => set(ev.target.checked)} />{lbl}
                  </label>
                ))}
                <span style={{ color: 'rgba(20,35,61,0.35)', fontSize: 11.5 }}>← → cambian de ventana · T vuelve a hoy · Esc cierra</span>
              </div>
            </div>

            {/* ── Tira de revisión ── */}
            {(riesgos.vencidos.length > 0 || riesgos.proximos14.length > 0 || riesgos.dependencias.length > 0 || riesgos.desalineados.length > 0 || sinFecha.length > 0) && (
              <div className="rm-noprint" style={{ ...card, padding: '10px 12px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  ['Vencido', riesgos.vencidos, '#B0522E'],
                  ['Próx. 14 días', riesgos.proximos14, '#A87A2C'],
                  ['Dependencias', riesgos.dependencias, '#7A6FB0'],
                  ['Fuera de su padre', riesgos.desalineados, '#5B6B86'],
                ] as [string, Riesgo[], string][]).filter(([, list]) => list.length > 0).map(([lbl, list, c]) => (
                  <div key={lbl} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ ...eb, color: c }}>{lbl} · {list.length}</span>
                    {list.slice(0, 8).map(r => (
                      <button key={r.key} onClick={() => saltarA(r)} title={r.detalle}
                        style={{ ...ghostBtn, borderColor: hexA(c, 0.4), color: c, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</button>
                    ))}
                    {list.length > 8 && <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>+{list.length - 8}</span>}
                  </div>
                ))}
                {sinFecha.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ ...eb, color: 'rgba(20,35,61,0.5)' }}>Sin fecha · {sinFecha.length}</span>
                    <button onClick={() => setShowSinFecha(v => !v)} style={ghostBtn}>{showSinFecha ? 'ocultar la bandeja' : 'ver la bandeja'}</button>
                  </div>
                )}
              </div>
            )}

            {/* ── Tablero ── */}
            <div className={`rm-board${printMode ? ' rm-flat' : ''}`} style={{ ...card, padding: '4px 12px 12px' }}>
              <div style={{ minWidth: narrow ? 0 : anchoMin }}>
                {/* Cabecera de columnas */}
                <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 30, background: '#fff', paddingTop: 8, paddingBottom: 6 }}>
                  {!narrow && <div style={{ width: RAIL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 31, background: '#fff' }} />}
                  <div style={{ ...gridCols, flex: 1, minWidth: 0 }}>
                    {cols.map(b => {
                      const i = b - winStart, c = carga[i], esAhora = b === bHoy, pasado = b < bHoy
                      const vacio = c.features + c.hitos === 0
                      return (
                        <div key={b} style={{
                          padding: '7px 10px', borderRadius: 10, minWidth: 0,
                          background: esAhora ? 'rgba(194,147,58,0.07)' : pasado ? 'rgba(15,35,64,0.02)' : 'transparent',
                          borderTop: `3px solid ${esAhora ? '#B0522E' : 'transparent'}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#10233F' }}>{bucketLabel(b, zoom)}</span>
                            {/* rm-hoy: en el PDF se invierte a texto sobre blanco con borde, para
                                que la marca no se pierda si no se imprimen los fondos. */}
                            {esAhora && <span className="rm-hoy" style={{ background: '#B0522E', color: '#fff', font: '800 10px/1 var(--font-ui)', letterSpacing: '.12em', borderRadius: 99, padding: '3px 7px', border: '1px solid #B0522E' }}>HOY</span>}
                          </div>
                          {bucketMeses(b, zoom) && <div style={{ fontSize: 10.5, color: GRIS, marginTop: 2 }}>{bucketMeses(b, zoom)}</div>}
                          <div style={{ fontSize: 10.5, marginTop: 3, color: GRIS }}>
                            {vacio ? 'sin nada agendado' : <>{c.features} feature{c.features === 1 ? '' : 's'} · {c.hitos} hito{c.hitos === 1 ? '' : 's'}</>}
                            {c.capMin != null && c.estMin > 0 && (
                              <> · <span style={{ color: c.estMin > c.capMin ? '#B0522E' : 'inherit', fontWeight: 700 }}>≈ {fmtHoras(c.estMin)} de {fmtHoras(c.capMin)}</span></>
                            )}
                            {c.capMin == null && c.estMin > 0 && <> · ≈ {fmtHoras(c.estMin)}</>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {carriles.length === 0 ? (
                  <div style={{ fontSize: 13, color: GRIS, padding: '24px 4px' }}>
                    {(epicas || []).length === 0 ? 'Todavía no hay épicas. Créalas en Épicas y vuelve aquí a ponerles fecha.' : 'Ninguna épica pasa el filtro actual.'}
                  </div>
                ) : carriles.map(renderCarril)}
              </div>
            </div>

            {/* ── Bandeja Sin fecha ── */}
            {sinFecha.length > 0 && showSinFecha && (
              <div className="rm-noprint" style={{ ...card, padding: '12px 14px', marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={eb}>Sin fecha · {sinFecha.length}</span>
                  <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)' }}>toca un {zoom === 'trimestre' ? 'trimestre' : 'mes'} para agendarlo de un golpe</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => setShowSinFecha(false)} style={ghostBtn}>ocultar</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sinFecha.map(s => (
                    <div key={`${s.kind}:${s.id}`} style={{
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                      border: '1px solid rgba(15,35,64,0.10)', borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: '7px 10px',
                      boxShadow: flashId === s.id ? `0 0 0 3px ${hexA('#C2933A', 0.55)}` : 'none',
                    }}>
                      <span style={eb}>{KIND_LBL[s.kind]}</span>
                      <button {...clickable(() => setSel({ kind: s.kind, id: s.id, epicaId: s.epicaId, featureId: s.featureId }), `Abrir ${s.nombre}`)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 12.5, fontWeight: 700, color: '#16365F', fontFamily: 'var(--font-ui)', textAlign: 'left' }}>{s.nombre}</button>
                      <span style={{ fontSize: 11.5, color: GRIS }}>{s.ctx}</span>
                      <span style={{ flex: 1 }} />
                      {atajos.map(b => (
                        <button key={b} onClick={() => fecharEnBucket({ kind: s.kind, id: s.id, epicaId: s.epicaId, featureId: s.featureId }, b)} style={addBtn}>{bucketLabel(b, zoom)}</button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hayGate && (
              <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.4)', marginTop: 14 }}>
                Algunas capas están apagadas por migraciones pendientes; lo demás se sigue pudiendo editar.
              </div>
            )}
            <div style={{ height: 96 }} />
          </>
        )}
      </main>

      {mounted && sel && !printMode && renderPanel()}
      {mounted && !printMode && renderTareaPeek()}

      {mounted && toast && createPortal(
        <div className="ep-abovenav rm-noprint" role="status" style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 24, zIndex: 96,
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 12,
          background: toast.err ? '#B0522E' : '#10233F', color: '#fff', fontSize: 12.5, fontWeight: 700,
          boxShadow: '0 16px 40px -16px rgba(8,18,36,.6)', maxWidth: 'min(560px, calc(100vw - 32px))',
        }}>
          <span>{toast.msg}</span>
          {toast.undo && (
            <button onClick={() => { const u = toast.undo!; setToast(null); u() }}
              style={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.35)', background: 'transparent', color: '#E7C56B', borderRadius: 99, padding: '3px 11px', fontSize: 11.5, fontWeight: 800, fontFamily: 'var(--font-ui)' }}>Deshacer</button>
          )}
        </div>, document.body)}
    </div>
  )
}

/* ─── Acceso al árbol (fuera del componente: puras) ───────────────────────── */
type Entidad = Epica | EpicaFeature | Iniciativa | EpicaMilestone

/** Busca la entidad seleccionada dentro del árbol de épicas. Devuelve null si ya no existe
 *  (se borró desde otra pestaña): el panel se cierra solo en vez de reventar. */
function buscar(epicas: Epica[] | null, s: Sel): Entidad | null {
  const e = (epicas || []).find(x => x.id === s.epicaId)
  if (!e) return null
  if (s.kind === 'epica') return e
  if (s.kind === 'feature') return (e.features || []).find(f => f.id === s.id) || null
  if (s.kind === 'iniciativa') {
    for (const f of (e.features || [])) { const i = (f.iniciativas || []).find(x => x.id === s.id); if (i) return i }
    return null
  }
  if (s.featureId) {
    const f = (e.features || []).find(x => x.id === s.featureId)
    return (f?.kpis || []).find(k => k.id === s.id) || null
  }
  return (e.kpis || []).find(k => k.id === s.id) || null
}

/** Valor previo de las claves que se van a tocar (base del revert del guardado optimista). */
function capturar(epicas: Epica[] | null, s: Sel, claves: string[]): Record<string, unknown> {
  const o = buscar(epicas, s) as unknown as Record<string, unknown> | null
  const out: Record<string, unknown> = {}
  claves.forEach(k => { out[k] = o ? o[k] : undefined })
  return out
}

/** Aplica `data` sobre la entidad seleccionada devolviendo un árbol NUEVO (nada se muta). */
function aplicarEn(epicas: Epica[] | null, s: Sel, data: Record<string, unknown>): Epica[] | null {
  if (!epicas) return epicas
  return epicas.map(e => {
    if (e.id !== s.epicaId) return e
    if (s.kind === 'epica') return merge(e, data)
    if (s.kind === 'feature') return { ...e, features: (e.features || []).map(f => f.id === s.id ? merge(f, data) : f) }
    if (s.kind === 'iniciativa') {
      return { ...e, features: (e.features || []).map(f => (f.iniciativas || []).some(i => i.id === s.id)
        ? { ...f, iniciativas: (f.iniciativas || []).map(i => i.id === s.id ? merge(i, data) : i) } : f) }
    }
    if (s.featureId) {
      return { ...e, features: (e.features || []).map(f => f.id !== s.featureId ? f : { ...f, kpis: (f.kpis || []).map(k => k.id === s.id ? merge(k, data) : k) }) }
    }
    return { ...e, kpis: (e.kpis || []).map(k => k.id === s.id ? merge(k, data) : k) }
  })
}
