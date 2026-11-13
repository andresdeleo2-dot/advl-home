// Diario de «Rutinas y dietas» en /peso: cada día se anota, COMIDA POR COMIDA, lo que comiste (lo de tu dieta o lo que
// agregues: alimentos, alcohol, chocolate, pastel…) y el ejercicio que hiciste; de ahí sale cuánto ganaste o perdiste.
// Este archivo es el contrato: tipos, catálogos, normalizador (todo lo que viene de la base o del cliente pasa por aquí) y
// las cuentas. Puro e isomórfico (sin servidor ni React): lo usan la API, la página y las pruebas con node.
//
// LA CUENTA (es una ESTIMACIÓN, y la pantalla lo dice):
//   comiste  = suma de todo lo que anotaste en las comidas (porciones × kcal de cada una)
//   gastas   = gasto basal × factor de tu actividad (el de «Tus números base» de Mi perfil, sin entrenamiento) + el
//              ejercicio que anotaste ese día (kcal NETAS: (MET − 1) × kg × horas, igual que KCAL_POR_SESION del perfil)
//   balance  = comiste − gastas        (negativo = déficit)
//   cambio   = balance ÷ 7,700         (7,700 kcal ≈ 1 kg de grasa; la regla de uso común)
//   acumulado = suma de los cambios de cada día desde el primero que anotaste

import type { DiaRutina, DocId } from '@/lib/peso-contenido'
import { fmtNum } from '@/lib/peso-contenido'
import type { PesoRecord } from '@/lib/peso'
import { numerosBase, type PesoPerfil } from '@/lib/peso-perfil'

export const KCAL_POR_KG = 7700

/** Lo que muestra el selector de «Rutinas y dietas»: los tres documentos y el diario. */
export type VistaPlanes = DocId | 'diario'

// ── Tipos ───────────────────────────────────────────────────────────────────

/** De dónde viene lo que comiste: lo de tu dieta, otra comida normal, o un gusto (antojo, alcohol, dulce, bebida). */
export type GrupoItem = 'plan' | 'comida' | 'antojo' | 'alcohol' | 'dulce' | 'bebida' | 'otro'
export const GRUPOS_ITEM: { v: GrupoItem; nombre: string; icono: string; color: string; gusto: boolean }[] = [
  { v: 'plan', nombre: 'Lo de tu dieta', icono: '🍽️', color: '#16365F', gusto: false },
  { v: 'comida', nombre: 'Otra comida', icono: '🥗', color: '#5B8DEF', gusto: false },
  { v: 'antojo', nombre: 'Antojos', icono: '🍕', color: '#E58A1F', gusto: true },
  { v: 'alcohol', nombre: 'Alcohol', icono: '🍺', color: '#B7791F', gusto: true },
  { v: 'dulce', nombre: 'Dulces y postres', icono: '🍫', color: '#DB2777', gusto: true },
  { v: 'bebida', nombre: 'Bebidas', icono: '🥤', color: '#0891B2', gusto: true },
  { v: 'otro', nombre: 'Otros', icono: '➕', color: '#6B7280', gusto: false },
]
export const grupoDe = (g: GrupoItem) => GRUPOS_ITEM.find(x => x.v === g) ?? GRUPOS_ITEM[6]
/** Los grupos que cuentan como «gustos» (lo que se sale de tu plan por gusto). */
export const GUSTOS: GrupoItem[] = GRUPOS_ITEM.filter(g => g.gusto).map(g => g.v)

/** Algo que comiste o tomaste: `n` porciones de `kcal` (y `prot` g de proteína) cada una. */
export type ItemDia = { id: string; nombre: string; grupo: GrupoItem; n: number; kcal: number; prot: number }
/** Una comida del día. `kcal` y `prot` son lo que pide TU DIETA para esa comida (copia del día en que se anotó: si luego
 *  cambias la dieta, lo anotado no se mueve); lo que comiste de verdad son los `items`. */
export type ComidaDia = { id: string; nombre: string; hora: string; kcal: number; prot: number; items: ItemDia[]; omitida?: boolean }
/** La comida que no está en la dieta: lo que se come entre horas, los tragos de la noche… */
export const ID_OTROS = 'otros'
/** Ejercicio: minutos y calorías NETAS (las que gastas por encima del reposo). */
export type EjercicioDia = { id: string; nombre: string; min: number; kcal: number }
export type DiaDiario = { fecha: string; comidas: ComidaDia[]; ejercicio: EjercicioDia[]; nota?: string }

/** Lo que entrega el servidor a la página. */
export type DiarioCarga = {
  dias: DiaDiario[]
  /** false = falta correr sql/peso-06-diario.sql: se ve la pantalla, pero no se puede guardar. */
  disponible: boolean
  /** La lectura falló (no es lo mismo que «aún no hay días»): `dias` llega vacío por eso. */
  error?: string
}

// ── Catálogos ───────────────────────────────────────────────────────────────

export type ItemCatalogo = { id: string; nombre: string; grupo: GrupoItem; kcal: number; prot: number; unidad: string }
const it = (id: string, nombre: string, grupo: GrupoItem, kcal: number, prot: number, unidad: string): ItemCatalogo => ({ id, nombre, grupo, kcal, prot, unidad })
/** Porciones de uso común (calorías y proteína aproximadas: en cada anotación se pueden cambiar). */
export const CATALOGO: ItemCatalogo[] = [
  // Alimentos de todos los días
  it('huevo', 'Huevo', 'comida', 72, 6, '1 pieza'),
  it('claras', 'Claras de huevo', 'comida', 51, 11, '3 claras'),
  it('pechuga', 'Pechuga de pollo', 'comida', 248, 46, '150 g'),
  it('res', 'Carne de res magra', 'comida', 270, 38, '150 g'),
  it('pescado', 'Pescado blanco', 'comida', 150, 30, '150 g'),
  it('salmon', 'Salmón', 'comida', 310, 33, '150 g'),
  it('atun', 'Atún en agua', 'comida', 100, 22, '1 lata'),
  it('arroz', 'Arroz cocido', 'comida', 205, 4, '1 taza'),
  it('frijoles', 'Frijoles', 'comida', 110, 7, '½ taza'),
  it('tortilla', 'Tortilla de maíz', 'comida', 60, 1.5, '1 pieza'),
  it('pan-integral', 'Pan integral', 'comida', 80, 4, '1 rebanada'),
  it('avena', 'Avena', 'comida', 150, 5, '½ taza seca'),
  it('pasta', 'Pasta cocida', 'comida', 220, 8, '1 taza'),
  it('papa', 'Papa o camote', 'comida', 130, 3, '1 mediana'),
  it('aguacate', 'Aguacate', 'comida', 160, 2, '½ pieza'),
  it('queso', 'Queso panela o fresco', 'comida', 95, 7, '50 g'),
  it('yogurt', 'Yogurt griego', 'comida', 100, 17, '170 g'),
  it('leche', 'Leche', 'comida', 150, 8, '1 vaso'),
  it('whey', 'Proteína en polvo (whey)', 'comida', 120, 24, '1 scoop'),
  it('barra-proteina', 'Barra de proteína', 'comida', 200, 20, '1 barra'),
  it('platano', 'Plátano', 'comida', 105, 1, '1 pieza'),
  it('manzana', 'Manzana', 'comida', 95, 0.5, '1 pieza'),
  it('fruta', 'Fruta', 'comida', 80, 1, '1 porción'),
  it('verduras', 'Verduras o ensalada', 'comida', 50, 2, '1 plato'),
  it('nueces', 'Nueces o cacahuates', 'comida', 170, 6, '30 g'),
  // Antojos
  it('tacos', 'Tacos', 'antojo', 200, 8, 'cada uno'),
  it('pizza', 'Pizza', 'antojo', 285, 12, 'rebanada'),
  it('hamburguesa', 'Hamburguesa', 'antojo', 550, 25, '1 pieza'),
  it('papas', 'Papas fritas', 'antojo', 350, 4, '1 orden'),
  it('botana', 'Botana', 'antojo', 160, 2, 'bolsa chica'),
  it('antojito', 'Antojito', 'antojo', 300, 10, 'quesadilla, sope, gordita…'),
  it('torta', 'Torta o sándwich grande', 'antojo', 550, 25, '1 pieza'),
  // Alcohol
  it('cerveza', 'Cerveza', 'alcohol', 150, 1, 'botella o lata'),
  it('cerveza-light', 'Cerveza light', 'alcohol', 100, 1, 'botella o lata'),
  it('vino', 'Vino', 'alcohol', 125, 0, 'copa'),
  it('tequila', 'Tequila o mezcal', 'alcohol', 100, 0, 'caballito'),
  it('destilado', 'Whisky, ron o vodka', 'alcohol', 100, 0, 'trago'),
  it('mezclado', 'Trago mezclado', 'alcohol', 180, 0, 'cuba, vodka-tonic…'),
  it('margarita', 'Margarita', 'alcohol', 250, 0, 'copa'),
  it('coctel-dulce', 'Cóctel dulce', 'alcohol', 350, 0, 'piña colada y similares'),
  // Dulces
  it('chocolate', 'Chocolate', 'dulce', 220, 3, 'barra de 40 g'),
  it('pastel', 'Pastel', 'dulce', 350, 4, 'rebanada'),
  it('helado', 'Helado', 'dulce', 270, 4, '2 bolas'),
  it('galletas', 'Galletas', 'dulce', 150, 2, '3 piezas'),
  it('pan-dulce', 'Pan dulce', 'dulce', 250, 5, '1 pieza'),
  it('postre', 'Postre', 'dulce', 300, 5, 'flan, arroz con leche…'),
  it('dulces', 'Dulces o gomitas', 'dulce', 120, 0, 'un puño'),
  // Bebidas
  it('refresco', 'Refresco', 'bebida', 140, 0, 'lata de 355 ml'),
  it('jugo', 'Jugo o licuado', 'bebida', 150, 1, '1 vaso'),
  it('cafe-dulce', 'Café dulce', 'bebida', 120, 2, 'con azúcar o crema'),
]

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
/** Lo del catálogo (y de tus frecuentes) que coincide con lo que escribes; sin escribir nada, devuelve todo. */
export function buscarCatalogo<T extends { nombre: string; unidad?: string }>(q: string, lista: T[]): T[] {
  const n = sinAcentos(q)
  if (!n) return lista
  const palabras = n.split(/\s+/)
  return lista.filter(x => { const t = sinAcentos(`${x.nombre} ${x.unidad ?? ''}`); return palabras.every(p => t.includes(p)) })
}

/** Lo que más has anotado (fuera de lo de tu dieta) en los últimos `ventana` días: para volver a agregarlo con un toque. */
export function frecuentes(dias: DiaDiario[], hoy: string, max = 8, ventana = 60): ItemCatalogo[] {
  const desde = sumaDias(hoy, -ventana)
  const cuenta = new Map<string, { it: ItemDia; veces: number; ultima: string }>()
  for (const d of dias) {
    if (d.fecha < desde) continue
    for (const c of d.comidas) for (const x of c.items) {
      if (x.grupo === 'plan') continue
      const k = `${x.grupo}|${sinAcentos(x.nombre)}`
      const a = cuenta.get(k)
      if (!a) cuenta.set(k, { it: x, veces: 1, ultima: d.fecha })
      else { a.veces++; if (d.fecha >= a.ultima) { a.it = x; a.ultima = d.fecha } }
    }
  }
  return [...cuenta.values()].sort((a, b) => b.veces - a.veces || (a.ultima < b.ultima ? 1 : -1)).slice(0, max)
    .map(a => ({ id: a.it.id, nombre: a.it.nombre, grupo: a.it.grupo, kcal: a.it.kcal, prot: a.it.prot, unidad: `${a.veces} ${a.veces === 1 ? 'vez' : 'veces'}` }))
}

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
const MAX_COMIDAS = 12, MAX_ITEMS = 40, MAX_EJERCICIOS = 20
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
const cuarto = (n: number) => Math.round(n * 4) / 4

/** Convierte lo que venga (base, cliente, nada) en un día válido de `fecha`. `null` si no es un objeto. */
export function normalizarDia(raw: unknown, fecha: string): DiaDiario | null {
  const o = obj(raw); if (!o) return null
  const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : [])
  const vistos = new Set<string>()
  const comidas = lista(o.comidas, MAX_COMIDAS).flatMap((x, i): ComidaDia[] => {
    const q = obj(x); if (!q) return []
    const base = idOk(q.id, `comida-${i + 1}`)
    let id = base
    for (let k = 2; vistos.has(id); k++) id = `${base}-${k}`
    vistos.add(id)
    const omitida = q.omitida === true
    const items = omitida ? [] : lista(q.items, MAX_ITEMS).flatMap((y, j): ItemDia[] => {
      const p = obj(y); if (!p) return []
      const nombre = limpio(p.nombre, 80)
      if (!nombre) return []
      const grupo = GRUPOS_ITEM.some(g => g.v === p.grupo) ? (p.grupo as GrupoItem) : 'otro'
      return [{ id: idOk(p.id, `item-${j + 1}`), nombre, grupo, n: cuarto(numero(p.n, 0.25, 50, 1)), kcal: Math.round(numero(p.kcal, 0, 5000, 0)), prot: Math.round(numero(p.prot, 0, 500, 0) * 10) / 10 }]
    })
    return [{ id, nombre: limpio(q.nombre, 80), hora: limpio(q.hora, 20), kcal: Math.round(numero(q.kcal, 0, 5000, 0)), prot: Math.round(numero(q.prot, 0, 500, 0)), items, ...(omitida ? { omitida: true } : {}) }]
  })
  const ejercicio = lista(o.ejercicio, MAX_EJERCICIOS).flatMap((x, i): EjercicioDia[] => {
    const q = obj(x); if (!q) return []
    const nombre = limpio(q.nombre, 80)
    if (!nombre) return []
    return [{ id: idOk(q.id, `ejercicio-${i + 1}`), nombre, min: Math.round(numero(q.min, 0, 720, 0)), kcal: Math.round(numero(q.kcal, 0, 5000, 0)) }]
  })
  const nota = limpio(o.nota, MAX_NOTA)
  return { fecha, comidas, ejercicio, ...(nota ? { nota } : {}) }
}

/** Un día nuevo: las comidas de tu dieta (sin anotar todavía) y la de «entre comidas». */
export function diaNuevo(fecha: string, comidasPlan: { id: string; nombre: string; hora?: string; kcal: number; prot: number }[]): DiaDiario {
  return {
    fecha,
    comidas: [
      ...comidasPlan.filter(c => c.id !== ID_OTROS).map(c => ({ id: c.id, nombre: c.nombre, hora: c.hora ?? '', kcal: c.kcal, prot: c.prot, items: [] as ItemDia[] })),
      { id: ID_OTROS, nombre: 'Entre comidas y extras', hora: '', kcal: 0, prot: 0, items: [] },
    ],
    ejercicio: [],
  }
}

/** Lo de tu dieta para esa comida, como un solo renglón que se puede ajustar (½, 1 porción…). */
export const itemDelPlan = (c: ComidaDia, n = 1): ItemDia => ({ id: 'plan', nombre: `${c.nombre} de tu dieta`, grupo: 'plan', n, kcal: c.kcal, prot: c.prot })

/** Suma una porción de `x` a la comida: si ya está (mismo nombre, grupo y calorías) sube su cantidad. Devuelve la comida nueva. */
export function agregarItem(c: ComidaDia, x: { id: string; nombre: string; grupo: GrupoItem; kcal: number; prot: number }): ComidaDia {
  const { omitida: _omitida, ...resto } = c
  const i = c.items.findIndex(y => y.nombre === x.nombre && y.kcal === x.kcal && y.grupo === x.grupo)
  const items = i >= 0
    ? c.items.map((y, j) => (j === i ? { ...y, n: y.n + 1 } : y))
    : [...c.items, { id: x.id, nombre: x.nombre, grupo: x.grupo, n: 1, kcal: x.kcal, prot: x.prot }]
  return { ...resto, items }
}

/** ¿Está esta comida pendiente (sin anotar y sin marcar «no la comí»)? La de «entre comidas» nunca queda pendiente. */
export const comidaPendiente = (c: ComidaDia) => c.id !== ID_OTROS && !c.omitida && c.items.length === 0

/** Un día sin nada anotado (ni comida, ni «no la comí», ni ejercicio, ni nota): no se guarda, y si ya existía se borra. */
export const diaVacio = (d: DiaDiario) => d.ejercicio.length === 0 && !d.nota && d.comidas.every(c => c.items.length === 0 && !c.omitida)

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

const grupos0 = () => Object.fromEntries(GRUPOS_ITEM.map(g => [g.v, 0])) as Record<GrupoItem, number>

export type TotalesDia = {
  ingesta: number
  /** Lo que comiste, por tipo (kcal): lo de tu dieta, otra comida, antojos, alcohol… */
  porGrupo: Record<GrupoItem, number>
  /** Lo que sumaron los gustos (antojos, alcohol, dulces y bebidas). */
  gustos: number
  /** Lo que pide tu dieta para ese día (la suma de sus comidas). */
  planKcal: number
  ejercicioKcal: number; ejercicioMin: number
  prot: number
  gastoBase: number | null; gasto: number | null
  balance: number | null; kg: number | null
  /** Comidas de tu dieta que faltan por anotar (sin anotar y sin marcar «no la comí»). */
  faltan: string[]
}

export function totalesDia(dia: DiaDiario, ctx: Contexto): TotalesDia {
  const porGrupo = grupos0()
  let prot = 0, planKcal = 0
  for (const c of dia.comidas) {
    if (c.id !== ID_OTROS) planKcal += c.kcal
    for (const x of c.items) { porGrupo[x.grupo] += x.n * x.kcal; prot += x.n * x.prot }
  }
  for (const g of GRUPOS_ITEM) porGrupo[g.v] = Math.round(porGrupo[g.v])
  const ingesta = GRUPOS_ITEM.reduce((a, g) => a + porGrupo[g.v], 0)
  const gustos = GUSTOS.reduce((a, g) => a + porGrupo[g], 0)
  const ejercicioKcal = dia.ejercicio.reduce((a, e) => a + e.kcal, 0)
  const ejercicioMin = dia.ejercicio.reduce((a, e) => a + e.min, 0)
  const gastoBase = gastoBaseDia(ctx, dia.fecha)
  const gasto = gastoBase != null ? Math.round(gastoBase + ejercicioKcal) : null
  const balance = gasto != null ? ingesta - gasto : null
  return {
    ingesta, porGrupo, gustos, planKcal: Math.round(planKcal), ejercicioKcal: Math.round(ejercicioKcal), ejercicioMin, prot: Math.round(prot),
    gastoBase, gasto, balance, kg: balance != null ? balance / KCAL_POR_KG : null,
    faltan: dia.comidas.filter(comidaPendiente).map(c => c.nombre),
  }
}

// ── Cuentas de un periodo ───────────────────────────────────────────────────

export const mapaDias = (dias: DiaDiario[]) => new Map(dias.map(d => [d.fecha, d]))

export type ResumenPeriodo = {
  rango: Rango
  /** Días del rango que ya llegaron (hasta hoy) y cuántos de ellos anotaste. */
  diasPasados: number; anotados: number
  /** De los anotados, los que tienen comidas de la dieta sin anotar (cuentan, pero el balance se ve mejor de lo que es). */
  incompletos: number
  /** Días con balance calculable (hay peso para estimar tu gasto). Las sumas de abajo solo cuentan esos. */
  calculables: number
  ingesta: number; gasto: number; balance: number
  /** Cambio estimado por calorías (kg): negativo = perdiste. null si no hay días calculables. */
  kg: number | null
  ingestaProm: number | null; gastoProm: number | null; protProm: number | null
  ejercicioMin: number; ejercicioKcal: number; diasConEjercicio: number
  /** Los gustos: kcal y porciones (todos los días anotados). */
  gustosKcal: number; gustosN: number
  porGrupo: Record<GrupoItem, { n: number; kcal: number }>
  top: { nombre: string; grupo: GrupoItem; n: number; kcal: number }[]
  /** Lo mismo que `kg` pero sin contar tus gustos. */
  kgSinGustos: number | null
  /** Qué movió el balance (días calculables): lo que gastas de base, el ejercicio y lo que comiste por tipo. base + ejercicio − Σ grupos = −balance. */
  impacto: { base: number; ejercicio: number; grupos: Record<GrupoItem, number> }
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
  const porGrupo = Object.fromEntries(GRUPOS_ITEM.map(g => [g.v, { n: 0, kcal: 0 }])) as ResumenPeriodo['porGrupo']
  const grupos = grupos0()
  const top = new Map<string, { nombre: string; grupo: GrupoItem; n: number; kcal: number }>()
  let anotados = 0, incompletos = 0, calculables = 0, ingesta = 0, gasto = 0, balance = 0, base = 0, ejKcalCalc = 0, gustosCalc = 0
  let prot = 0, protDias = 0, ejercicioMin = 0, ejercicioKcal = 0, diasConEjercicio = 0, gustosKcal = 0, gustosN = 0
  for (const [fecha, dia] of mapa) {
    if (fecha < rango.ini || fecha > rango.fin) continue
    anotados++
    const t = totalesDia(dia, ctx)
    if (t.faltan.length) incompletos++
    if (t.balance != null && t.gasto != null && t.gastoBase != null) {
      calculables++; ingesta += t.ingesta; gasto += t.gasto; balance += t.balance; base += t.gastoBase; ejKcalCalc += t.ejercicioKcal; gustosCalc += t.gustos
      for (const g of GRUPOS_ITEM) grupos[g.v] += t.porGrupo[g.v]
    }
    if (t.ingesta > 0) { prot += t.prot; protDias++ }
    ejercicioMin += t.ejercicioMin; ejercicioKcal += t.ejercicioKcal; if (t.ejercicioMin > 0) diasConEjercicio++
    for (const c of dia.comidas) for (const x of c.items) {
      const k = x.n * x.kcal
      porGrupo[x.grupo].n += x.n; porGrupo[x.grupo].kcal += k
      if (!GUSTOS.includes(x.grupo)) continue
      gustosKcal += k; gustosN += x.n
      const clave = `${x.grupo}|${sinAcentos(x.nombre)}`
      const a = top.get(clave) ?? { nombre: x.nombre, grupo: x.grupo, n: 0, kcal: 0 }
      a.n += x.n; a.kcal += k; top.set(clave, a)
    }
  }
  for (const g of GRUPOS_ITEM) porGrupo[g.v].kcal = Math.round(porGrupo[g.v].kcal)
  const tope = rango.fin < hoy ? rango.fin : hoy
  return {
    rango, diasPasados: Math.max(0, diasEntre(rango.ini, tope) + 1), anotados, incompletos, calculables,
    ingesta, gasto, balance, kg: calculables ? balance / KCAL_POR_KG : null,
    ingestaProm: calculables ? Math.round(ingesta / calculables) : null, gastoProm: calculables ? Math.round(gasto / calculables) : null,
    protProm: protDias ? Math.round(prot / protDias) : null,
    ejercicioMin, ejercicioKcal, diasConEjercicio, gustosKcal: Math.round(gustosKcal), gustosN,
    porGrupo, top: [...top.values()].map(x => ({ ...x, kcal: Math.round(x.kcal) })).sort((a, b) => b.kcal - a.kcal).slice(0, 8),
    kgSinGustos: calculables ? (balance - gustosCalc) / KCAL_POR_KG : null,
    impacto: { base: Math.round(base), ejercicio: Math.round(ejKcalCalc), grupos },
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

/** Un punto del acumulado: el balance de ese día (null si no se anotó o falta tu peso) y los kg estimados acumulados hasta él. */
export type PuntoAcum = { fecha: string; balance: number | null; kg: number }
export type Acumulado = {
  puntos: PuntoAcum[]
  /** Cada medición de la báscula del rango, contra la medición de la que se parte (`base`). */
  real: { fecha: string; peso: number; delta: number }[]
  base: { fecha: string; peso: number } | null
}
/** El acumulado día por día, desde el primer día anotado del rango hasta el final (o hoy). Los días sin anotar no suman nada. */
export function acumuladoDelRango(mapa: Map<string, DiaDiario>, ctx: Contexto, rango: Rango, hoy: string): Acumulado {
  const tope = rango.fin < hoy ? rango.fin : hoy
  let f0: string | null = null
  for (const f of mapa.keys()) if (f >= rango.ini && f <= tope && (f0 === null || f < f0)) f0 = f
  if (!f0) return { puntos: [], real: [], base: null }
  const puntos: PuntoAcum[] = []
  let kg = 0
  for (let f = f0; f <= tope && puntos.length < 1100; f = sumaDias(f, 1)) {
    const d = mapa.get(f)
    const b = d ? totalesDia(d, ctx).balance : null
    if (b != null) kg += b / KCAL_POR_KG
    puntos.push({ fecha: f, balance: b, kg })
  }
  const dentro = ctx.registros.filter(r => r.peso != null && r.fecha >= f0 && r.fecha <= tope)
  // El punto de partida de la báscula: el último pesaje de las 3 semanas antes del primer día anotado; si no hubo (o fue hace
  // mucho y ya cuenta otra historia), el primer pesaje del rango.
  const antes = [...ctx.registros].reverse().find(r => r.peso != null && r.fecha < f0 && diasEntre(r.fecha, f0) <= 21)
  const base = antes?.peso != null ? { fecha: antes.fecha, peso: antes.peso } : dentro[0]?.peso != null ? { fecha: dentro[0].fecha, peso: dentro[0].peso as number } : null
  const real = base ? dentro.map(r => ({ fecha: r.fecha, peso: r.peso as number, delta: (r.peso as number) - base.peso })) : []
  return { puntos, real, base }
}

// ── Formato ─────────────────────────────────────────────────────────────────

/** «+320», «−0.42», «0»: con signo, y el cero sin signo. */
export function conSigno(n: number, dec = 0): string {
  const r = Number(Math.abs(n).toFixed(dec))
  return r === 0 ? '0' : `${n < 0 ? '−' : '+'}${fmtNum(r, dec)}`
}
export const fmtKgCambio = (n: number) => conSigno(n, 2)
