// Diario de «Rutinas y dietas» en /peso: cada día se anota lo que comiste (las comidas de tu dieta, completas o a medias),
// tus gustos fuera del plan (alcohol, chocolate, pastel…) y el ejercicio que hiciste; de ahí sale cuánto ganaste o
// perdiste. Este archivo es el contrato: tipos, catálogos, normalizador (todo lo que viene de la base o del cliente pasa por
// aquí) y las cuentas. Puro e isomórfico (sin servidor ni React): lo usan la API, la página y las pruebas con node.
//
// LA CUENTA (es una ESTIMACIÓN, y la pantalla lo dice):
//   comiste  = kcal de las comidas del plan que marcaste (× 1, ½ o 0) + tus gustos (cantidad × kcal)
//   gastas   = gasto basal × factor de tu actividad (el de «Tus números base» de Mi perfil, sin entrenamiento) + el
//              ejercicio que anotaste ese día (kcal NETAS: (MET − 1) × kg × horas, igual que KCAL_POR_SESION del perfil)
//   balance  = comiste − gastas        (negativo = déficit)
//   cambio   = balance ÷ 7,700         (7,700 kcal ≈ 1 kg de grasa; la regla de uso común)

import type { DiaRutina, DocId } from '@/lib/peso-contenido'
import { fmtNum } from '@/lib/peso-contenido'
import type { PesoRecord } from '@/lib/peso'
import { numerosBase, type PesoPerfil } from '@/lib/peso-perfil'

export const KCAL_POR_KG = 7700

/** Lo que muestra el selector de «Rutinas y dietas»: los tres documentos y el diario. */
export type VistaPlanes = DocId | 'diario'

// ── Tipos ───────────────────────────────────────────────────────────────────

export type EstadoComida = 'completa' | 'mitad' | 'no'
export const ESTADOS_COMIDA: { v: EstadoComida; nombre: string; f: number }[] = [
  { v: 'completa', nombre: 'Completa', f: 1 },
  { v: 'mitad', nombre: 'A medias', f: 0.5 },
  { v: 'no', nombre: 'No la comí', f: 0 },
]
export const factorComida = (e: EstadoComida) => ESTADOS_COMIDA.find(x => x.v === e)?.f ?? 1

export type GrupoExtra = 'alcohol' | 'dulce' | 'comida' | 'bebida' | 'otro'
export const GRUPOS_EXTRA: { v: GrupoExtra; nombre: string; icono: string }[] = [
  { v: 'alcohol', nombre: 'Alcohol', icono: '🍺' },
  { v: 'dulce', nombre: 'Dulces y postres', icono: '🍫' },
  { v: 'comida', nombre: 'Comida fuera del plan', icono: '🍕' },
  { v: 'bebida', nombre: 'Bebidas', icono: '🥤' },
  { v: 'otro', nombre: 'Otros', icono: '➕' },
]
export const grupoDe = (g: GrupoExtra) => GRUPOS_EXTRA.find(x => x.v === g) ?? GRUPOS_EXTRA[4]

/** Una comida del plan tal como estaba el día que se anotó (se guarda su kcal y su proteína: si luego cambias la dieta, lo anotado no se mueve). */
export type ComidaDia = { id: string; nombre: string; kcal: number; prot: number; est: EstadoComida }
/** Un gusto fuera del plan: `n` porciones de `kcal` cada una. */
export type ExtraDia = { id: string; nombre: string; grupo: GrupoExtra; n: number; kcal: number }
/** Ejercicio: minutos y calorías NETAS (las que gastas por encima del reposo). */
export type EjercicioDia = { id: string; nombre: string; min: number; kcal: number }
export type DiaDiario = { fecha: string; comidas: ComidaDia[]; extras: ExtraDia[]; ejercicio: EjercicioDia[]; nota?: string }

/** Lo que entrega el servidor a la página. */
export type DiarioCarga = {
  dias: DiaDiario[]
  /** false = falta correr sql/peso-06-diario.sql: se ve la pantalla, pero no se puede guardar. */
  disponible: boolean
  /** La lectura falló (no es lo mismo que «aún no hay días»): `dias` llega vacío por eso. */
  error?: string
}

// ── Catálogos ───────────────────────────────────────────────────────────────

export type ExtraCatalogo = { id: string; nombre: string; grupo: GrupoExtra; kcal: number; unidad: string }
/** Porciones de uso común (calorías aproximadas: en cada anotación se pueden cambiar). */
export const EXTRAS_CATALOGO: ExtraCatalogo[] = [
  { id: 'cerveza', nombre: 'Cerveza', grupo: 'alcohol', kcal: 150, unidad: 'botella o lata' },
  { id: 'cerveza-light', nombre: 'Cerveza light', grupo: 'alcohol', kcal: 100, unidad: 'botella o lata' },
  { id: 'vino', nombre: 'Vino', grupo: 'alcohol', kcal: 125, unidad: 'copa' },
  { id: 'tequila', nombre: 'Tequila o mezcal', grupo: 'alcohol', kcal: 100, unidad: 'caballito' },
  { id: 'destilado', nombre: 'Whisky, ron o vodka', grupo: 'alcohol', kcal: 100, unidad: 'trago' },
  { id: 'mezclado', nombre: 'Trago mezclado', grupo: 'alcohol', kcal: 180, unidad: 'cuba, vodka-tonic…' },
  { id: 'margarita', nombre: 'Margarita', grupo: 'alcohol', kcal: 250, unidad: 'copa' },
  { id: 'coctel-dulce', nombre: 'Cóctel dulce', grupo: 'alcohol', kcal: 350, unidad: 'piña colada y similares' },
  { id: 'chocolate', nombre: 'Chocolate', grupo: 'dulce', kcal: 220, unidad: 'barra de 40 g' },
  { id: 'pastel', nombre: 'Pastel', grupo: 'dulce', kcal: 350, unidad: 'rebanada' },
  { id: 'helado', nombre: 'Helado', grupo: 'dulce', kcal: 270, unidad: '2 bolas' },
  { id: 'galletas', nombre: 'Galletas', grupo: 'dulce', kcal: 150, unidad: '3 piezas' },
  { id: 'pan-dulce', nombre: 'Pan dulce', grupo: 'dulce', kcal: 250, unidad: 'pieza' },
  { id: 'postre', nombre: 'Postre', grupo: 'dulce', kcal: 300, unidad: 'flan, arroz con leche…' },
  { id: 'dulces', nombre: 'Dulces o gomitas', grupo: 'dulce', kcal: 120, unidad: 'un puño' },
  { id: 'tacos', nombre: 'Tacos', grupo: 'comida', kcal: 200, unidad: 'cada uno' },
  { id: 'pizza', nombre: 'Pizza', grupo: 'comida', kcal: 285, unidad: 'rebanada' },
  { id: 'hamburguesa', nombre: 'Hamburguesa', grupo: 'comida', kcal: 550, unidad: 'una' },
  { id: 'papas', nombre: 'Papas fritas', grupo: 'comida', kcal: 350, unidad: 'orden' },
  { id: 'botana', nombre: 'Botana', grupo: 'comida', kcal: 160, unidad: 'bolsa chica' },
  { id: 'antojito', nombre: 'Antojito', grupo: 'comida', kcal: 300, unidad: 'quesadilla, sope, gordita…' },
  { id: 'torta', nombre: 'Torta o sándwich grande', grupo: 'comida', kcal: 550, unidad: 'una' },
  { id: 'refresco', nombre: 'Refresco', grupo: 'bebida', kcal: 140, unidad: 'lata de 355 ml' },
  { id: 'jugo', nombre: 'Jugo o licuado', grupo: 'bebida', kcal: 150, unidad: 'vaso' },
  { id: 'cafe-dulce', nombre: 'Café dulce', grupo: 'bebida', kcal: 120, unidad: 'con azúcar o crema' },
]

export type EjercicioCatalogo = { id: string; nombre: string; met: number; min: number }
/** MET de la tabla estándar de actividad física; `min` = los minutos con que arranca al agregarlo. */
export const EJERCICIOS_CATALOGO: EjercicioCatalogo[] = [
  { id: 'pesas', nombre: 'Pesas', met: 5, min: 45 },
  { id: 'circuito', nombre: 'Circuito', met: 6, min: 40 },
  { id: 'bici', nombre: 'Bici zona 2', met: 6, min: 30 },
  { id: 'bici-int', nombre: 'Bici intervalos', met: 9, min: 30 },
  { id: 'caminata', nombre: 'Caminata', met: 3.5, min: 30 },
  { id: 'correr', nombre: 'Correr', met: 9, min: 30 },
  { id: 'core', nombre: 'Core y movilidad', met: 3.5, min: 15 },
  { id: 'otro', nombre: 'Otro ejercicio', met: 4, min: 30 },
]
const MET_DE = (id: string) => EJERCICIOS_CATALOGO.find(e => e.id === id)?.met ?? 4

/** Peso con que se calcula el ejercicio cuando aún no hay ninguna medición. */
const PESO_SUPUESTO_KG = 80

/** Calorías NETAS de un ejercicio: (MET − 1) × kg × horas (el reposo ya está en el gasto basal). */
export function kcalEjercicio(id: string, min: number, pesoKg: number | null): number {
  return Math.round(Math.max(0, MET_DE(id) - 1) * (pesoKg ?? PESO_SUPUESTO_KG) * (Math.max(0, min) / 60))
}

// ── Límites ─────────────────────────────────────────────────────────────────

export const MAX_NOTA = 300
const MAX_COMIDAS = 12, MAX_EXTRAS = 40, MAX_EJERCICIOS = 20
const FECHA_MINIMA = '2020-01-01'

// ── Fechas (puras, en UTC para que no dependan de la zona horaria del equipo) ───────────────────────────────────────

const ms = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export const sumaDias = (iso: string, n: number) => new Date(ms(iso) + n * 86_400_000).toISOString().slice(0, 10)
export const diasEntre = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86_400_000)
const diaSemanaDe = (iso: string) => new Date(ms(iso)).getUTCDay()   // 0 = domingo
export const lunesDe = (iso: string) => sumaDias(iso, -((diaSemanaDe(iso) + 6) % 7))
const inicioMes = (iso: string) => `${iso.slice(0, 7)}-01`
const finMes = (iso: string) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return `${iso.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` }
const mesMas = (iso: string, n: number) => { const t = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1 + n, 1)); return t.toISOString().slice(0, 10) }

/** ¿Es una fecha real del calendario? Se reconstruye y se compara ('2026-02-30' no pasa). */
export function esFechaIso(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const f = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return f.getUTCFullYear() === +m[1] && f.getUTCMonth() === +m[2] - 1 && f.getUTCDate() === +m[3]
}
/** ¿Se puede anotar ese día? De 2020 a mañana (con un día de margen por la zona horaria). */
export const fechaDeDiarioValida = (f: unknown, hoy: string): f is string => esFechaIso(f) && f >= FECHA_MINIMA && f <= sumaDias(hoy, 1)

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
/** «9 nov» */
export const etiquetaCorta = (iso: string) => `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1]}`
/** «lun 9 nov» */
export const etiquetaDia = (iso: string) => `${DIAS_CORTO[diaSemanaDe(iso)]} ${etiquetaCorta(iso)}`
/** «lunes 9 de noviembre» */
export const etiquetaLarga = (iso: string) => `${DIAS_LARGO[diaSemanaDe(iso)]} ${+iso.slice(8, 10)} de ${MESES_LARGO[+iso.slice(5, 7) - 1]}`
export const nombreMes = (iso: string) => `${MESES_LARGO[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`

// ── Periodos ────────────────────────────────────────────────────────────────

export type Periodo = 'dia' | 'semana' | 'mes' | 'anio' | 'todo'
export const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'dia', label: 'Día' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }, { value: 'anio', label: 'Año' }, { value: 'todo', label: 'Todo' },
]
export type Rango = { ini: string; fin: string }

/** El rango que cubre `periodo` alrededor de `ancla`. «Todo» va del primer día anotado a hoy. */
export function rangoDe(periodo: Periodo, ancla: string, primera: string | null, hoy: string): Rango {
  switch (periodo) {
    case 'dia': return { ini: ancla, fin: ancla }
    case 'semana': { const ini = lunesDe(ancla); return { ini, fin: sumaDias(ini, 6) } }
    case 'mes': return { ini: inicioMes(ancla), fin: finMes(ancla) }
    case 'anio': return { ini: `${ancla.slice(0, 4)}-01-01`, fin: `${ancla.slice(0, 4)}-12-31` }
    case 'todo': return { ini: primera && primera < hoy ? primera : hoy, fin: hoy }
  }
}
/** El ancla del periodo anterior (-1) o siguiente (+1). */
export function moverAncla(periodo: Periodo, ancla: string, delta: -1 | 1): string {
  switch (periodo) {
    case 'dia': return sumaDias(ancla, delta)
    case 'semana': return sumaDias(ancla, 7 * delta)
    case 'mes': return mesMas(ancla, delta)
    case 'anio': return `${+ancla.slice(0, 4) + delta}-01-01`
    case 'todo': return ancla
  }
}
export function etiquetaRango(periodo: Periodo, r: Rango): string {
  switch (periodo) {
    case 'dia': return etiquetaLarga(r.ini)
    case 'semana': return `${etiquetaCorta(r.ini)} – ${etiquetaCorta(r.fin)}${r.ini.slice(0, 4) !== r.fin.slice(0, 4) ? '' : ` ${r.fin.slice(0, 4)}`}`
    case 'mes': return nombreMes(r.ini)
    case 'anio': return r.ini.slice(0, 4)
    case 'todo': return `${etiquetaCorta(r.ini)} ${r.ini.slice(0, 4)} – hoy`
  }
}

// ── Normalizador ────────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
// Sin caracteres de control (Postgres no guarda \u0000 en jsonb) ni medios pares UTF-16.
const limpio = (v: unknown, max: number): string => {
  if (typeof v !== 'string') return ''
  let t = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g, m => (m.length === 2 ? m : '')).trim().slice(0, max)
  if (/[\ud800-\udbff]$/.test(t)) t = t.slice(0, -1)
  return t
}
const numero = (v: unknown, min: number, max: number, d: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}
const idOk = (v: unknown, d: string) => limpio(v, 60).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || d

/** Convierte lo que venga (base, cliente, nada) en un día válido de `fecha`. `null` si no es un objeto. */
export function normalizarDia(raw: unknown, fecha: string): DiaDiario | null {
  const o = obj(raw); if (!o) return null
  const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : [])
  const comidas = lista(o.comidas, MAX_COMIDAS).flatMap((x, i): ComidaDia[] => {
    const q = obj(x); if (!q) return []
    const est: EstadoComida = q.est === 'mitad' || q.est === 'no' ? q.est : 'completa'
    return [{ id: idOk(q.id, `comida-${i + 1}`), nombre: limpio(q.nombre, 80), kcal: Math.round(numero(q.kcal, 0, 5000, 0)), prot: Math.round(numero(q.prot, 0, 500, 0)), est }]
  })
  const extras = lista(o.extras, MAX_EXTRAS).flatMap((x, i): ExtraDia[] => {
    const q = obj(x); if (!q) return []
    const grupo = GRUPOS_EXTRA.some(g => g.v === q.grupo) ? (q.grupo as GrupoExtra) : 'otro'
    const nombre = limpio(q.nombre, 80)
    if (!nombre) return []
    return [{ id: idOk(q.id, `extra-${i + 1}`), nombre, grupo, n: Math.round(numero(q.n, 0.5, 50, 1) * 2) / 2, kcal: Math.round(numero(q.kcal, 0, 5000, 0)) }]
  })
  const ejercicio = lista(o.ejercicio, MAX_EJERCICIOS).flatMap((x, i): EjercicioDia[] => {
    const q = obj(x); if (!q) return []
    const nombre = limpio(q.nombre, 80)
    if (!nombre) return []
    return [{ id: idOk(q.id, `ejercicio-${i + 1}`), nombre, min: Math.round(numero(q.min, 0, 720, 0)), kcal: Math.round(numero(q.kcal, 0, 5000, 0)) }]
  })
  const nota = limpio(o.nota, MAX_NOTA)
  return { fecha, comidas, extras, ejercicio, ...(nota ? { nota } : {}) }
}

/** Un día nuevo: las comidas de tu dieta, todas «completas» (lo normal es seguir el plan; tú cambias lo que no fue así). */
export function diaNuevo(fecha: string, comidasPlan: { id: string; nombre: string; kcal: number; prot: number }[]): DiaDiario {
  return { fecha, comidas: comidasPlan.map(c => ({ id: c.id, nombre: c.nombre, kcal: c.kcal, prot: c.prot, est: 'completa' as const })), extras: [], ejercicio: [] }
}

/** El ejercicio que pide la rutina de ese día, como arranque editable (la rutina no trae minutos de las pesas: se supone una sesión de 45). */
export function ejercicioDeRutina(dia: DiaRutina | null, pesoKg: number | null): EjercicioDia[] {
  if (!dia) return []
  const mk = (id: string, nombre: string, min: number): EjercicioDia => ({ id, nombre, min, kcal: kcalEjercicio(id, min, pesoKg) })
  const res: EjercicioDia[] = []
  if (dia.tipo === 'pesas') res.push(mk('pesas', 'Pesas', 45))
  if (dia.tipo === 'circuito') res.push(mk('circuito', 'Circuito', 40))
  if (dia.tipo === 'cardio' && dia.filas.some(f => !f.cardio)) res.push(mk('core', 'Core y movilidad', 15))
  for (const f of dia.filas.filter(x => x.cardio)) {
    const m = /(\d+)/.exec(f.series)
    const min = m ? Number(m[1]) : 0
    if (!min) continue
    const n = f.nombre.toLowerCase()
    if (n.includes('bici')) res.push(n.includes('interval') ? mk('bici-int', 'Bici intervalos', min) : mk('bici', 'Bici zona 2', min))
    else if (n.includes('camin')) res.push(mk('caminata', 'Caminata', min))
  }
  return res
}

// ── Cuentas de un día ───────────────────────────────────────────────────────

export type Contexto = { perfil: PesoPerfil; registros: PesoRecord[] }

/** Tu peso ese día: la última medición hasta esa fecha (o, si aún no había ninguna, la primera). `registros` va en orden de fecha. */
export function pesoEn(registros: PesoRecord[], fecha: string): number | null {
  let previo: number | null = null
  for (const r of registros) { if (r.peso == null) continue; if (r.fecha <= fecha) previo = r.peso; else return previo ?? r.peso }
  return previo
}
function rmrEn(registros: PesoRecord[], fecha: string): number | null {
  let v: number | null = null
  for (const r of registros) { if (r.fecha > fecha) break; if (r.rmr != null) v = r.rmr }
  return v
}
/** Lo que gastas ese día SIN contar el ejercicio (gasto basal × factor de actividad); null si falta tu peso o tu fecha de nacimiento. */
export function gastoBaseDia(ctx: Contexto, fecha: string): number | null {
  const peso = pesoEn(ctx.registros, fecha)
  if (peso == null) return null
  return numerosBase(ctx.perfil, fecha, peso, rmrEn(ctx.registros, fecha)).gasto_sin_entrenamiento
}

export type TotalesDia = {
  ingesta: number; ingestaPlan: number; extrasKcal: number
  ejercicioKcal: number; ejercicioMin: number
  prot: number
  gastoBase: number | null; gasto: number | null
  balance: number | null; kg: number | null
}

export function totalesDia(dia: DiaDiario, ctx: Contexto): TotalesDia {
  let ingestaPlan = 0, prot = 0
  for (const c of dia.comidas) { const f = factorComida(c.est); ingestaPlan += c.kcal * f; prot += c.prot * f }
  const extrasKcal = dia.extras.reduce((a, e) => a + e.n * e.kcal, 0)
  const ejercicioKcal = dia.ejercicio.reduce((a, e) => a + e.kcal, 0)
  const ejercicioMin = dia.ejercicio.reduce((a, e) => a + e.min, 0)
  const gastoBase = gastoBaseDia(ctx, dia.fecha)
  const ingesta = Math.round(ingestaPlan + extrasKcal)
  const gasto = gastoBase != null ? Math.round(gastoBase + ejercicioKcal) : null
  const balance = gasto != null ? ingesta - gasto : null
  return {
    ingesta, ingestaPlan: Math.round(ingestaPlan), extrasKcal: Math.round(extrasKcal), ejercicioKcal: Math.round(ejercicioKcal), ejercicioMin,
    prot: Math.round(prot), gastoBase, gasto, balance, kg: balance != null ? balance / KCAL_POR_KG : null,
  }
}

// ── Cuentas de un periodo ───────────────────────────────────────────────────

export const mapaDias = (dias: DiaDiario[]) => new Map(dias.map(d => [d.fecha, d]))

export type ResumenPeriodo = {
  rango: Rango
  /** Días del rango que ya llegaron (hasta hoy) y cuántos de ellos anotaste. */
  diasPasados: number; anotados: number
  /** Días con balance calculable (hay peso para estimar tu gasto). Las sumas de abajo solo cuentan esos. */
  calculables: number
  ingesta: number; gasto: number; balance: number
  /** Cambio estimado por calorías (kg): negativo = perdiste. null si no hay días calculables. */
  kg: number | null
  ingestaProm: number | null; gastoProm: number | null; protProm: number | null
  ejercicioMin: number; ejercicioKcal: number; diasConEjercicio: number
  extrasKcal: number; extrasN: number
  porGrupo: Record<GrupoExtra, { n: number; kcal: number }>
  top: { nombre: string; grupo: GrupoExtra; n: number; kcal: number }[]
  /** Lo mismo que `kg` pero sin contar tus gustos. */
  kgSinExtras: number | null
  /** Lo que marcó la báscula: la última medición del rango contra la anterior (o la primera del rango si no hay anterior). */
  real: { desde: { fecha: string; peso: number }; hasta: { fecha: string; peso: number }; delta: number } | null
  /** La última medición hasta el final del rango (o hasta hoy): para decir «tu último peso» cuando en el rango no hubo pesajes. */
  ultimoPeso: { fecha: string; peso: number } | null
}

function ultimoPesoHasta(registros: PesoRecord[], hasta: string): ResumenPeriodo['ultimoPeso'] {
  const r = [...registros].reverse().find(x => x.peso != null && x.fecha <= hasta)
  return r && r.peso != null ? { fecha: r.fecha, peso: r.peso } : null
}

function cambioReal(registros: PesoRecord[], r: Rango): ResumenPeriodo['real'] {
  const dentro = registros.filter(x => x.peso != null && x.fecha >= r.ini && x.fecha <= r.fin)
  if (!dentro.length) return null
  const hasta = dentro[dentro.length - 1]
  const antes = [...registros].reverse().find(x => x.peso != null && x.fecha < r.ini)
  const desde = antes ?? (dentro.length > 1 ? dentro[0] : null)
  if (!desde || desde.peso == null || hasta.peso == null) return null
  return { desde: { fecha: desde.fecha, peso: desde.peso }, hasta: { fecha: hasta.fecha, peso: hasta.peso }, delta: hasta.peso - desde.peso }
}

export function resumenPeriodo(mapa: Map<string, DiaDiario>, ctx: Contexto, rango: Rango, hoy: string): ResumenPeriodo {
  const porGrupo = Object.fromEntries(GRUPOS_EXTRA.map(g => [g.v, { n: 0, kcal: 0 }])) as ResumenPeriodo['porGrupo']
  const top = new Map<string, { nombre: string; grupo: GrupoExtra; n: number; kcal: number }>()
  let anotados = 0, calculables = 0, ingesta = 0, gasto = 0, balance = 0, prot = 0, protDias = 0
  let ejercicioMin = 0, ejercicioKcal = 0, diasConEjercicio = 0, extrasKcal = 0, extrasN = 0, extrasKcalCalc = 0
  for (const [fecha, dia] of mapa) {
    if (fecha < rango.ini || fecha > rango.fin) continue
    anotados++
    const t = totalesDia(dia, ctx)
    if (t.balance != null && t.gasto != null) { calculables++; ingesta += t.ingesta; gasto += t.gasto; balance += t.balance; extrasKcalCalc += t.extrasKcal }
    if (dia.comidas.length) { prot += t.prot; protDias++ }
    ejercicioMin += t.ejercicioMin; ejercicioKcal += t.ejercicioKcal; if (t.ejercicioMin > 0) diasConEjercicio++
    extrasKcal += t.extrasKcal
    for (const e of dia.extras) {
      extrasN += e.n; porGrupo[e.grupo].n += e.n; porGrupo[e.grupo].kcal += e.n * e.kcal
      const clave = `${e.grupo}|${e.nombre.toLowerCase()}`
      const acum = top.get(clave) ?? { nombre: e.nombre, grupo: e.grupo, n: 0, kcal: 0 }
      acum.n += e.n; acum.kcal += e.n * e.kcal; top.set(clave, acum)
    }
  }
  for (const g of GRUPOS_EXTRA) porGrupo[g.v].kcal = Math.round(porGrupo[g.v].kcal)
  const tope = rango.fin < hoy ? rango.fin : hoy
  return {
    rango, diasPasados: Math.max(0, diasEntre(rango.ini, tope) + 1), anotados, calculables,
    ingesta, gasto, balance, kg: calculables ? balance / KCAL_POR_KG : null,
    ingestaProm: calculables ? Math.round(ingesta / calculables) : null, gastoProm: calculables ? Math.round(gasto / calculables) : null,
    protProm: protDias ? Math.round(prot / protDias) : null,
    ejercicioMin, ejercicioKcal, diasConEjercicio, extrasKcal, extrasN,
    porGrupo, top: [...top.values()].map(x => ({ ...x, kcal: Math.round(x.kcal) })).sort((a, b) => b.kcal - a.kcal).slice(0, 8),
    kgSinExtras: calculables ? (balance - extrasKcalCalc) / KCAL_POR_KG : null,
    real: cambioReal(ctx.registros, rango),
    ultimoPeso: ultimoPesoHasta(ctx.registros, tope),
  }
}

export type FilaDia = { fecha: string; dia: DiaDiario | null; t: TotalesDia | null }
/** Un renglón por cada día del rango que ya llegó (hasta hoy), el más reciente primero. */
export function listaDias(mapa: Map<string, DiaDiario>, ctx: Contexto, rango: Rango, hoy: string): FilaDia[] {
  const tope = rango.fin < hoy ? rango.fin : hoy
  const filas: FilaDia[] = []
  for (let f = tope; f >= rango.ini && filas.length < 400; f = sumaDias(f, -1)) {
    const dia = mapa.get(f) ?? null
    filas.push({ fecha: f, dia, t: dia ? totalesDia(dia, ctx) : null })
  }
  return filas
}
/** Los meses que toca el rango (hasta hoy), el más reciente primero: la lista de «Año» y «Todo». */
export function mesesDelRango(rango: Rango, hoy: string): Rango[] {
  const tope = rango.fin < hoy ? rango.fin : hoy
  const res: Rango[] = []
  for (let m = inicioMes(tope); m >= inicioMes(rango.ini) && res.length < 120; m = mesMas(m, -1)) res.push({ ini: m, fin: finMes(m) })
  return res
}

export type Barra = { clave: string; etiqueta: string; balance: number | null; anotados: number }
/** Las barras de la gráfica: un día por barra (hasta 62 días) o, si el rango es más largo, una semana por barra. */
export function barrasDelRango(mapa: Map<string, DiaDiario>, ctx: Contexto, rango: Rango, hoy: string): Barra[] {
  const tope = rango.fin < hoy ? rango.fin : hoy
  const n = diasEntre(rango.ini, tope) + 1
  if (n < 1) return []
  if (n <= 62) {
    return Array.from({ length: n }, (_, i) => {
      const f = sumaDias(rango.ini, i); const d = mapa.get(f)
      return { clave: f, etiqueta: etiquetaDia(f), balance: d ? totalesDia(d, ctx).balance : null, anotados: d ? 1 : 0 }
    })
  }
  const semanas = new Map<string, { suma: number; calc: number; anotados: number }>()
  for (let l = lunesDe(rango.ini); l <= tope; l = sumaDias(l, 7)) semanas.set(l, { suma: 0, calc: 0, anotados: 0 })
  for (const [f, d] of mapa) {
    if (f < rango.ini || f > tope) continue
    const s = semanas.get(lunesDe(f)); if (!s) continue
    s.anotados++
    const b = totalesDia(d, ctx).balance
    if (b != null) { s.suma += b; s.calc++ }
  }
  const todas = [...semanas].map(([l, s]) => ({ clave: l, etiqueta: `semana del ${etiquetaCorta(l)}`, balance: s.calc ? s.suma : null, anotados: s.anotados }))
  // La gráfica larga empieza en la primera semana con algo anotado: meses de nada al principio solo la achicarían.
  const primera = todas.findIndex(b => b.anotados > 0)
  return primera > 0 ? todas.slice(primera) : todas
}

// ── Formato ─────────────────────────────────────────────────────────────────

/** «+320», «−0.42», «0»: con signo, y el cero sin signo. */
export function conSigno(n: number, dec = 0): string {
  const r = Number(Math.abs(n).toFixed(dec))
  return r === 0 ? '0' : `${n < 0 ? '−' : '+'}${fmtNum(r, dec)}`
}
export const fmtKgCambio = (n: number) => conSigno(n, 2)
