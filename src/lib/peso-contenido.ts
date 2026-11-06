// Contenido nativo de «Rutinas y dietas»: la rutina, la dieta y el plan maestro son DATOS (no HTML) que la página
// pinta con su propio diseño y que se editan ahí mismo. Este archivo es el contrato: tipos, normalizador (todo lo que
// viene de la base o del cliente pasa por aquí antes de pintarse o guardarse) y las cuentas que se calculan solas
// (series del día, kcal del menú, meta de cada viernes). Sin imports de servidor ni de React: lo usan los dos lados.

export type DocId = 'rutina' | 'dieta' | 'plan'
export const DOC_IDS: DocId[] = ['rutina', 'dieta', 'plan']
export const esDocId = (v: unknown): v is DocId => typeof v === 'string' && (DOC_IDS as string[]).includes(v)

// ── Bloques genéricos ───────────────────────────────────────────────────────

export type Tono = 'oro' | 'verde' | 'rojo' | 'azul' | 'gris'
export const TONOS: Tono[] = ['oro', 'verde', 'rojo', 'azul', 'gris']

export type Cifra = { v: string; u?: string; l: string }
export type Tarjeta = { n?: string; etiqueta?: string; titulo: string; texto?: string; lista?: string[]; tono?: Tono }
export type TonoAviso = 'tip' | 'atencion' | 'regla' | 'revisar'
export const TONOS_AVISO: TonoAviso[] = ['tip', 'atencion', 'regla', 'revisar']

export type Bloque =
  | { k: 'texto'; t: string; grande?: boolean }
  | { k: 'cifras'; items: Cifra[] }
  | { k: 'tarjetas'; cols?: 1 | 2 | 3; items: Tarjeta[] }
  | { k: 'lista'; titulo?: string; chips?: boolean; items: string[] }
  | { k: 'aviso'; tono: TonoAviso; titulo?: string; t: string }
  | { k: 'tabla'; titulo?: string; cols: string[]; filas: string[][]; nota?: string }
  | { k: 'pasos'; titulo?: string; items: { t: string; sub?: string }[] }

export type TipoBloque = Bloque['k']
export const TIPOS_BLOQUE: { k: TipoBloque; nombre: string }[] = [
  { k: 'texto', nombre: 'Texto' },
  { k: 'lista', nombre: 'Lista' },
  { k: 'tarjetas', nombre: 'Tarjetas' },
  { k: 'cifras', nombre: 'Cifras' },
  { k: 'aviso', nombre: 'Aviso' },
  { k: 'tabla', nombre: 'Tabla' },
  { k: 'pasos', nombre: 'Pasos' },
]

/** Un bloque nuevo, ya con una muestra para que se vea cómo queda. */
export function bloqueNuevo(k: TipoBloque): Bloque {
  switch (k) {
    case 'texto': return { k, t: 'Escribe aquí.' }
    case 'lista': return { k, titulo: 'Título', items: ['Uno', 'Otro'] }
    case 'tarjetas': return { k, items: [{ titulo: 'Título', texto: 'Texto' }, { titulo: 'Otro título', texto: 'Texto' }] }
    case 'cifras': return { k, items: [{ v: '0', u: 'kg', l: 'Descripción' }] }
    case 'aviso': return { k, tono: 'tip', titulo: 'Tip', t: 'Escribe aquí.' }
    case 'tabla': return { k, cols: ['Columna 1', 'Columna 2'], filas: [['', ''], ['', '']] }
    case 'pasos': return { k, items: [{ t: 'Primer paso' }, { t: 'Segundo paso' }] }
  }
}

export type TipoSeccion = 'bloques' | 'dias' | 'galeria' | 'comidas' | 'totales' | 'super' | 'semanas'
export type Seccion = { id: string; kicker?: string; titulo: string; intro?: string; tipo: TipoSeccion; bloques: Bloque[] }

// ── Rutina ──────────────────────────────────────────────────────────────────

export type TipoDia = 'pesas' | 'cardio' | 'circuito' | 'descanso'
export const TIPOS_DIA: { v: TipoDia; nombre: string }[] = [
  { v: 'pesas', nombre: 'Pesas' }, { v: 'cardio', nombre: 'Cardio + core' }, { v: 'circuito', nombre: 'Circuito' }, { v: 'descanso', nombre: 'Descanso' },
]
export type FilaRutina = { ej?: string; nombre: string; series: string; nota?: string; cardio?: boolean }
export type DiaRutina = { id: string; nombre: string; foco: string; tipo: TipoDia; resumen: string; filas: FilaRutina[]; circuito?: string; nota?: string }
export type EjercicioLib = { id: string; nombre: string; clave?: string }
/** Orden de los días tal como los numera `Date#getDay()` (0 = domingo). */
export const IDS_DIA = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

// ── Dieta ───────────────────────────────────────────────────────────────────

export type ItemComida = { t: string; k?: 'elige' | 'nota'; ops?: string[] }
export type Comida = { id: string; hora: string; nombre: string; kcal: number; prot: number; intro?: string; items: ItemComida[] }
export type ItemSuper = { n: string; cant?: string; sub?: string; cuenta?: string; lista?: string[] }
export type GrupoSuper = { nombre: string; items: ItemSuper[] }

// ── Plan maestro ────────────────────────────────────────────────────────────

export type SemanaPlan = { n: number; fecha: string; meta: number; nota?: string }
export type RefPlan = { inicio: number; meta: number; tol: number }

// ── Documentos ──────────────────────────────────────────────────────────────

export type DocBase = { etiqueta: string; titulo: string; sub?: string; cifras: Cifra[]; secciones: Seccion[] }
export type DocRutina = DocBase & { id: 'rutina'; dias: DiaRutina[]; ejercicios: EjercicioLib[] }
export type DocDieta = DocBase & { id: 'dieta'; comidas: Comida[]; super: GrupoSuper[] }
export type DocPlan = DocBase & { id: 'plan'; semanas: SemanaPlan[]; ref: RefPlan }
export type Doc = DocRutina | DocDieta | DocPlan
export type Contenido = { rutina: DocRutina; dieta: DocDieta; plan: DocPlan }

/** Lo que el servidor entrega a la página: los tres documentos, de dónde salieron y si se pueden guardar cambios. */
export type ContenidoCarga = {
  contenido: Contenido
  /** Qué documentos vienen de la base (editados) y cuáles son el original de fábrica. */
  guardados: Record<DocId, boolean>
  /** false = falta correr sql/peso-05-contenido.sql: se ve todo, pero no se puede guardar. */
  disponible: boolean
  error?: string
}

export const MAX_BYTES_DOC = 400_000

// ── Normalizador ────────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const str = (v: unknown, max = 1500): string => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : '')
const strO = (v: unknown, max = 1500): string | undefined => { const t = str(v, max); return t ? t : undefined }
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const arr = <T,>(v: unknown, max: number, f: (x: unknown, i: number) => T | null): T[] =>
  (Array.isArray(v) ? v.slice(0, max).map(f).filter((x): x is T => x !== null) : [])
const strs = (v: unknown, max = 60, len = 600): string[] => arr(v, max, x => (typeof x === 'string' ? str(x, len) : null))
const idOk = (v: unknown, d: string): string => { const t = str(v, 60).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); return t || d }
const enUno = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d)
const fechaIso = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')

function cifra(x: unknown): Cifra | null {
  const o = obj(x); if (!o) return null
  return { v: str(o.v, 40), ...(strO(o.u, 30) ? { u: strO(o.u, 30) } : {}), l: str(o.l, 200) }
}
function tarjeta(x: unknown): Tarjeta | null {
  const o = obj(x); if (!o) return null
  const lista = strs(o.lista, 20, 400)
  return {
    ...(strO(o.n, 20) ? { n: strO(o.n, 20) } : {}), ...(strO(o.etiqueta, 80) ? { etiqueta: strO(o.etiqueta, 80) } : {}),
    titulo: str(o.titulo, 200), ...(strO(o.texto, 2500) ? { texto: strO(o.texto, 2500) } : {}),
    ...(lista.length ? { lista } : {}), ...(o.tono ? { tono: enUno(o.tono, TONOS, 'oro') } : {}),
  }
}
function bloque(x: unknown): Bloque | null {
  const o = obj(x); if (!o) return null
  switch (o.k) {
    case 'texto': return { k: 'texto', t: str(o.t, 4000), ...(o.grande === true ? { grande: true } : {}) }
    case 'cifras': return { k: 'cifras', items: arr(o.items, 12, cifra) }
    case 'tarjetas': return { k: 'tarjetas', ...(o.cols === 1 || o.cols === 2 || o.cols === 3 ? { cols: o.cols as 1 | 2 | 3 } : {}), items: arr(o.items, 40, tarjeta) }
    case 'lista': return { k: 'lista', ...(strO(o.titulo, 200) ? { titulo: strO(o.titulo, 200) } : {}), ...(o.chips === true ? { chips: true } : {}), items: strs(o.items, 60) }
    case 'aviso': return { k: 'aviso', tono: enUno(o.tono, TONOS_AVISO, 'tip'), ...(strO(o.titulo, 200) ? { titulo: strO(o.titulo, 200) } : {}), t: str(o.t, 3000) }
    case 'tabla': {
      const cols = strs(o.cols, 8, 120)
      const n = cols.length
      const filas = arr(o.filas, 80, f => (Array.isArray(f) ? Array.from({ length: n }, (_, i) => str(f[i], 400)) : null))
      return { k: 'tabla', ...(strO(o.titulo, 200) ? { titulo: strO(o.titulo, 200) } : {}), cols, filas, ...(strO(o.nota, 1500) ? { nota: strO(o.nota, 1500) } : {}) }
    }
    case 'pasos': return { k: 'pasos', ...(strO(o.titulo, 200) ? { titulo: strO(o.titulo, 200) } : {}), items: arr(o.items, 30, p => { const q = obj(p); return q ? { t: str(q.t, 500), ...(strO(q.sub, 500) ? { sub: strO(q.sub, 500) } : {}) } : null }) }
    default: return null
  }
}
const TIPOS_SECCION: readonly TipoSeccion[] = ['bloques', 'dias', 'galeria', 'comidas', 'totales', 'super', 'semanas']
function seccion(x: unknown, i: number): Seccion | null {
  const o = obj(x); if (!o) return null
  return {
    id: idOk(o.id, `seccion-${i + 1}`), ...(strO(o.kicker, 120) ? { kicker: strO(o.kicker, 120) } : {}), titulo: str(o.titulo, 200),
    ...(strO(o.intro, 2000) ? { intro: strO(o.intro, 2000) } : {}), tipo: enUno(o.tipo, TIPOS_SECCION, 'bloques'), bloques: arr(o.bloques, 40, bloque),
  }
}
function base(o: Record<string, unknown>): DocBase {
  // Los ids de sección se vuelven únicos: sirven de ancla y de clave.
  const vistos = new Set<string>()
  const secciones = arr(o.secciones, 30, seccion).map(s => { let id = s.id; for (let n = 2; vistos.has(id); n++) id = `${s.id}-${n}`; vistos.add(id); return { ...s, id } })
  return { etiqueta: str(o.etiqueta, 80), titulo: str(o.titulo, 200), ...(strO(o.sub, 600) ? { sub: strO(o.sub, 600) } : {}), cifras: arr(o.cifras, 8, cifra), secciones }
}
function fila(x: unknown): FilaRutina | null {
  const o = obj(x); if (!o) return null
  const ej = strO(o.ej, 60) ? idOk(o.ej, '') : ''
  return { ...(ej ? { ej } : {}), nombre: str(o.nombre, 200), series: str(o.series, 80), ...(strO(o.nota, 600) ? { nota: strO(o.nota, 600) } : {}), ...(o.cardio === true ? { cardio: true } : {}) }
}
function dia(x: unknown, i: number): DiaRutina | null {
  const o = obj(x); if (!o) return null
  return {
    id: idOk(o.id, IDS_DIA[(i + 1) % 7]), nombre: str(o.nombre, 40), foco: str(o.foco, 80), tipo: enUno(o.tipo, TIPOS_DIA.map(t => t.v), 'pesas'),
    resumen: str(o.resumen, 400), filas: arr(o.filas, 30, fila),
    ...(strO(o.circuito, 400) ? { circuito: strO(o.circuito, 400) } : {}), ...(strO(o.nota, 1500) ? { nota: strO(o.nota, 1500) } : {}),
  }
}
function comida(x: unknown, i: number): Comida | null {
  const o = obj(x); if (!o) return null
  return {
    id: idOk(o.id, `comida-${i + 1}`), hora: str(o.hora, 20), nombre: str(o.nombre, 80), kcal: Math.max(0, num(o.kcal)), prot: Math.max(0, num(o.prot)),
    ...(strO(o.intro, 300) ? { intro: strO(o.intro, 300) } : {}),
    items: arr(o.items, 30, it => {
      const q = obj(it); if (!q) return null
      const ops = strs(q.ops, 12, 300)
      return { t: str(q.t, 400), ...(q.k === 'elige' || q.k === 'nota' ? { k: q.k as 'elige' | 'nota' } : {}), ...(ops.length ? { ops } : {}) }
    }),
  }
}
function itemSuper(x: unknown): ItemSuper | null {
  const o = obj(x); if (!o) return null
  const lista = strs(o.lista, 30, 80)
  return { n: str(o.n, 200), ...(strO(o.cant, 80) ? { cant: strO(o.cant, 80) } : {}), ...(strO(o.sub, 400) ? { sub: strO(o.sub, 400) } : {}), ...(strO(o.cuenta, 200) ? { cuenta: strO(o.cuenta, 200) } : {}), ...(lista.length ? { lista } : {}) }
}

/** Convierte lo que venga (base, cliente, nada) en un documento válido del tipo pedido. `null` si no es un objeto. */
export function normalizarDoc(id: DocId, raw: unknown): Doc | null {
  const o = obj(raw); if (!o) return null
  const b = base(o)
  if (id === 'rutina') {
    return {
      ...b, id,
      dias: arr(o.dias, 10, dia),
      ejercicios: arr(o.ejercicios, 80, x => { const q = obj(x); if (!q) return null; const eid = idOk(q.id, ''); return eid ? { id: eid, nombre: str(q.nombre, 200), ...(strO(q.clave, 500) ? { clave: strO(q.clave, 500) } : {}) } : null }),
    }
  }
  if (id === 'dieta') {
    return { ...b, id, comidas: arr(o.comidas, 12, comida), super: arr(o.super, 12, g => { const q = obj(g); return q ? { nombre: str(q.nombre, 120), items: arr(q.items, 40, itemSuper) } : null }) }
  }
  const ref = obj(o.ref) ?? {}
  return {
    ...b, id,
    ref: { inicio: num(ref.inicio, 0), meta: num(ref.meta, 0), tol: Math.max(0, num(ref.tol, 0.5)) },
    semanas: arr(o.semanas, 60, (x, i) => { const q = obj(x); return q ? { n: num(q.n, i + 1), fecha: fechaIso(q.fecha), meta: num(q.meta), ...(strO(q.nota, 120) ? { nota: strO(q.nota, 120) } : {}) } : null }),
  }
}

// ── Cuentas que se calculan solas ───────────────────────────────────────────

/** Series de una fila: «4 × 8–10» → 4. La bici y lo que no empieza con «N ×» no cuentan. */
export function seriesDeFila(f: FilaRutina): number {
  if (f.cardio) return 0
  const m = /^\s*(\d+)\s*[×xX]/.exec(f.series)
  return m ? Number(m[1]) : 0
}
/** Series de fuerza del día. En el circuito cada ejercicio se repite `vueltas` veces (se lee «N vueltas» de la nota del circuito). */
export function seriesDelDia(d: DiaRutina): number {
  if (d.tipo === 'circuito') {
    const v = /(\d+)\s*vuelta/i.exec(d.circuito ?? '')
    return d.filas.filter(f => !f.cardio).length * (v ? Number(v[1]) : 1)
  }
  return d.filas.reduce((a, f) => a + seriesDeFila(f), 0)
}
export const seriesSumandos = (d: DiaRutina): number[] =>
  (d.tipo === 'circuito' ? [] : d.filas.map(seriesDeFila).filter(n => n > 0))
/** Minutos de bici del día: suma los renglones de cardio que traen «N min». */
export function minutosBici(d: DiaRutina): number {
  return d.filas.filter(f => f.cardio).reduce((a, f) => { const m = /(\d+)\s*min/i.exec(f.series); return a + (m ? Number(m[1]) : 0) }, 0)
}
export const diaDeFecha = (rutina: DocRutina, iso: string): DiaRutina | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return null
  const id = IDS_DIA[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()]
  return rutina.dias.find(d => d.id === id) ?? null
}
/** Dónde sale este ejercicio en la semana (para la ficha): día, series × reps y nota. */
export function apariciones(rutina: DocRutina, ejId: string): { dia: DiaRutina; fila: FilaRutina }[] {
  return rutina.dias.flatMap(dia => dia.filas.filter(f => f.ej === ejId).map(fila => ({ dia, fila })))
}

export const totalesDieta = (comidas: Comida[]) => ({ kcal: comidas.reduce((a, c) => a + c.kcal, 0), prot: comidas.reduce((a, c) => a + c.prot, 0) })

export const fmtNum = (n: number, dec = 0) => n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/** La semana que corre hoy: la primera cuyo viernes aún no pasa (o la última). */
export function semanaActual(semanas: SemanaPlan[], hoyIso: string): SemanaPlan | null {
  const con = semanas.filter(s => s.fecha)
  return con.find(s => s.fecha >= hoyIso) ?? con[con.length - 1] ?? null
}
