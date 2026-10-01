/* Captura rápida en una línea (⌘K / botón +): convierte "Llamar notario @inm #eug mañana !! 30m"
 * en una tarea con épica, feature/iniciativa, día, prioridad y estimado. Puro: sin React ni red,
 * recibe la lista de épicas y el día de hoy ('YYYY-MM-DD' local). */

export type CapturaIniciativa = { id: string; nombre: string }
export type CapturaFeature = { id: string; t: string; iniciativas?: CapturaIniciativa[] }
export type CapturaEpica = { id: string; name: string; archived?: boolean; features?: CapturaFeature[] }
export type CapturaCtx = { epicas: CapturaEpica[]; hoy: string }

export type TipoToken = 'epica' | 'feature' | 'iniciativa' | 'prioridad' | 'plan' | 'due' | 'estimado'
export type TokenCaptura = {
  tipo: TipoToken
  texto: string        // tal como se escribió
  etiqueta: string     // legible, para el chip
  reconocido: boolean  // false = se quedó en el título
  pos: number          // índice en el texto original (para poder "escaparlo" con \)
}
export type Prioridad = 'alta' | 'media' | 'baja'
export type Captura = {
  titulo: string
  epicaId?: string
  featureId?: string
  iniciativaId?: string
  prioridad?: Prioridad
  plan?: string
  due?: string
  estMin?: number
  tokens: TokenCaptura[]
}

/* ─── Fechas 'YYYY-MM-DD' sin zona horaria (aritmética en UTC puro) ─── */
const pad = (n: number) => String(n).padStart(2, '0')
const isoDe = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const partes = (iso: string) => iso.split('-').map(Number) as [number, number, number]
const utc = (iso: string) => { const [y, m, d] = partes(iso); return Date.UTC(y, m - 1, d) }
export function sumarDias(iso: string, n: number): string {
  const dt = new Date(utc(iso) + n * 864e5)
  return isoDe(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}
const diasEntre = (desde: string, hasta: string) => Math.round((utc(hasta) - utc(desde)) / 864e5)
/** 'YYYY-MM-DD' del día LOCAL de `d` (no UTC: en México de noche toISOString ya es mañana). */
export function fechaLocal(d: Date = new Date()): string {
  return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** minúsculas y sin acentos: "Mañana" → "manana", "Sáb" → "sab". */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const DIAS_SEMANA: Record<string, number> = {
  dom: 0, domingo: 0, lun: 1, lunes: 1, mar: 2, martes: 2, mie: 3, miercoles: 3,
  jue: 4, jueves: 4, vie: 5, viernes: 5, sab: 6, sabado: 6,
}
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Interpreta UNA palabra de fecha: hoy, mañana, pasado, lun…dom, d/m, d/m/aa(aa). */
export function fechaDePalabra(palabra: string, hoy: string): string | null {
  const w = normalizar(palabra)
  if (w === 'hoy') return hoy
  if (w === 'manana') return sumarDias(hoy, 1)
  if (w === 'pasado') return sumarDias(hoy, 2)
  if (Object.prototype.hasOwnProperty.call(DIAS_SEMANA, w)) {   // `in` también ve "constructor", "toString"…
    const dow = new Date(utc(hoy)).getUTCDay()
    return sumarDias(hoy, (DIAS_SEMANA[w] - dow + 7) % 7)   // hoy si hoy es ese día
  }
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(w)
  if (!m) return null
  const d = +m[1], mes = +m[2]
  let y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : partes(hoy)[0]
  const valida = (yy: number) => { const dt = new Date(Date.UTC(yy, mes - 1, d)); return dt.getUTCMonth() === mes - 1 && dt.getUTCDate() === d }
  if (mes < 1 || mes > 12 || d < 1 || !valida(y)) return null
  // Sin año: si ya pasó hace más de 30 días, es la del año que viene (en enero, "15/12" no es el pasado diciembre).
  if (!m[3] && diasEntre(isoDe(y, mes, d), hoy) > 30 && valida(y + 1)) y += 1
  return isoDe(y, mes, d)
}

/** "30m", "90min", "1h", "1h30", "1.5h" → minutos (tope 16 h). */
export function minutosDePalabra(palabra: string): number | null {
  const w = normalizar(palabra)
  let min: number | null = null
  let m = /^(\d{1,3})\s*(m|min|mins|minutos?)$/.exec(w)
  if (m) min = +m[1]
  else if ((m = /^(\d{1,2})h(?:rs?)?(\d{1,2})?(?:m|min)?$/.exec(w))) min = +m[1] * 60 + (m[2] ? +m[2] : 0)
  else if ((m = /^(\d{1,2})[.,](\d)h(?:rs?)?$/.exec(w))) min = Math.round((+m[1] + +m[2] / 10) * 60)
  return min && min > 0 && min <= 16 * 60 ? min : null
}

/* ─── Etiquetas legibles para chips ─── */
export function etiquetaFecha(iso: string, hoy: string): string {
  const dif = diasEntre(hoy, iso)
  if (dif === 0) return 'hoy'
  if (dif === 1) return 'mañana'
  if (dif === 2) return 'pasado mañana'
  if (dif === -1) return 'ayer'
  const [y, m, d] = partes(iso)
  const dow = new Date(utc(iso)).getUTCDay()
  return `${DIA_CORTO[dow]} ${d} ${MES_CORTO[m - 1]}${y !== partes(hoy)[0] ? ` ${y}` : ''}`
}
export function etiquetaEstimado(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), r = min % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = { alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja' }
/** Ícono por tipo de chip (mismos símbolos que Épicas/hitos: ▣ feature, ◆ iniciativa). */
export const ICONO_TOKEN: Record<TipoToken, string> = {
  epica: '@', feature: '▣', iniciativa: '◆', prioridad: '!', plan: '📅', due: '⏳', estimado: '⏱',
}

/* ─── Búsqueda por prefijo ─── */
// 0 = nombre exacto, 1 = el nombre empieza así, 2 = alguna palabra del nombre empieza así; null = no.
function rango(nombre: string, q: string): number | null {
  const n = normalizar(nombre).trim()
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  const sinEspacios = q.replace(/\s+/g, '')
  return n.split(/[\s\-_/·›]+/).some(w => w && w.startsWith(sinEspacios)) ? 2 : null
}
const consulta = (raw: string) => normalizar(raw).replace(/[.,;:!?]+$/, '').replace(/[-_]+/g, ' ').trim()

type Pieza = { tipo: 'feature' | 'iniciativa'; epica: CapturaEpica; feature: CapturaFeature; ini?: CapturaIniciativa; nombre: string; r: number }

/** Interpreta el texto (SIN el prefijo "+"/"nueva"/"tarea"). Lo que no se reconoce se queda en el título. */
export function parseCaptura(texto: string, ctx: CapturaCtx): Captura {
  const { hoy } = ctx
  const activas = ctx.epicas.filter(e => !e.archived)
  const out: Captura = { titulo: '', tokens: [] }
  const palabras: { w: string; pos: number }[] = []
  for (let m: RegExpExecArray | null, re = /\S+/g; (m = re.exec(texto));) palabras.push({ w: m[0], pos: m.index })

  const titulo: (string | null)[] = palabras.map(p => p.w)   // null = consumida por un token reconocido
  // Token de la palabra i (hasta la palabra `hasta`, para "pasado mañana" / "vence: 15/10").
  const tok = (i: number, tipo: TipoToken, etiqueta: string, reconocido: boolean, hasta = i) => {
    out.tokens.push({ tipo, texto: texto.slice(palabras[i].pos, palabras[hasta].pos + palabras[hasta].w.length), etiqueta, reconocido, pos: palabras[i].pos })
    if (reconocido) for (let k = i; k <= hasta; k++) titulo[k] = null
  }
  const pendientesEpica: number[] = []
  const pendientesPieza: number[] = []

  for (let i = 0; i < palabras.length; i++) {
    const w = palabras[i].w
    // "\mar" = literal: no es fecha/etiqueta, se queda en el título sin la diagonal.
    if (w.length > 1 && w.startsWith('\\')) { titulo[i] = w.slice(1); continue }
    if (w.startsWith('@') && w.length > 1) { pendientesEpica.push(i); continue }
    if (w.startsWith('#') && w.length > 1) { pendientesPieza.push(i); continue }

    if (w.startsWith('!')) {
      const resto = normalizar(w.slice(1))
      const p: Prioridad | null = /^!*$/.test(resto) ? 'alta' : resto === 'alta' || resto === 'baja' || resto === 'media' ? resto : null
      if (p && !out.prioridad) { out.prioridad = p; tok(i, 'prioridad', ETIQUETA_PRIORIDAD[p], true) }
      else tok(i, 'prioridad', p ? 'Prioridad repetida' : `${w} no es prioridad`, false)
      continue
    }

    const venc = /^(vence|v):(.*)$/i.exec(w)
    if (venc) {
      let expr = venc[2].replace(/[.,;:]+$/, '')
      let hasta = i
      // "vence: 15/10" (con espacio): la fecha es la palabra siguiente.
      const conSiguiente = !expr && i + 1 < palabras.length && !!fechaDePalabra(palabras[i + 1].w.replace(/[.,;:]+$/, ''), hoy)
      if (conSiguiente) { expr = palabras[i + 1].w.replace(/[.,;:]+$/, ''); hasta = i + 1 }
      // "vence:pasado mañana": la frase completa es la fecha (si no, "mañana" se volvía el plan).
      if (normalizar(expr) === 'pasado' && hasta + 1 < palabras.length && normalizar(palabras[hasta + 1].w.replace(/[.,;:]+$/, '')) === 'manana') hasta++
      const f = expr ? fechaDePalabra(expr, hoy) : null
      if (f && !out.due) {
        out.due = f
        tok(i, 'due', `vence ${etiquetaFecha(f, hoy)}`, true, hasta)
      } else tok(i, 'due', f ? 'Vencimiento repetido' : `${w} sin fecha válida`, false, hasta)
      i = hasta
      continue
    }

    const limpia = w.replace(/[.,;:]+$/, '')
    // "pasado mañana" en dos palabras = un solo token.
    if (normalizar(limpia) === 'pasado' && i + 1 < palabras.length && normalizar(palabras[i + 1].w.replace(/[.,;:]+$/, '')) === 'manana') {
      const f = sumarDias(hoy, 2)
      if (!out.plan) { out.plan = f; tok(i, 'plan', etiquetaFecha(f, hoy), true, i + 1) }
      i++
      continue
    }
    const f = fechaDePalabra(limpia, hoy)
    if (f) {
      if (!out.plan) { out.plan = f; tok(i, 'plan', etiquetaFecha(f, hoy), true) }
      continue   // segunda fecha: se queda como texto, sin chip (puede ser parte natural del título)
    }
    const min = minutosDePalabra(limpia)
    if (min) {
      if (!out.estMin) { out.estMin = min; tok(i, 'estimado', etiquetaEstimado(min), true) }
      continue
    }
  }

  // Épica primero (puede venir después del #): así el # se busca dentro de ella.
  let epica: CapturaEpica | undefined
  for (const i of pendientesEpica) {
    const q = consulta(palabras[i].w.slice(1))
    if (epica) { tok(i, 'epica', 'Épica repetida', false); continue }
    const cands = q ? activas.map(e => ({ e, r: rango(e.name, q) })).filter(x => x.r !== null) as { e: CapturaEpica; r: number }[] : []
    cands.sort((a, b) => a.r - b.r || a.e.name.length - b.e.name.length)
    if (cands[0]) { epica = cands[0].e; out.epicaId = epica.id; tok(i, 'epica', epica.name, true) }
    else tok(i, 'epica', `Sin épica «${palabras[i].w.slice(1)}»`, false)
  }

  const epicaFijada = !!epica
  let feature: CapturaFeature | undefined
  for (const i of pendientesPieza) {
    const q = consulta(palabras[i].w.slice(1))
    if (!q || out.iniciativaId) { tok(i, 'feature', out.iniciativaId ? 'Ya hay iniciativa' : 'Vacío', false); continue }
    const cands: Pieza[] = []
    for (const e of epica ? [epica] : activas) {
      for (const f of e.features || []) {
        if (feature && f.id !== feature.id) continue
        const rf = feature ? null : rango(f.t, q)
        if (rf !== null) cands.push({ tipo: 'feature', epica: e, feature: f, nombre: f.t, r: rf })
        for (const ini of f.iniciativas || []) {
          const ri = rango(ini.nombre, q)
          if (ri !== null) cands.push({ tipo: 'iniciativa', epica: e, feature: f, ini, nombre: ini.nombre, r: ri })
        }
      }
    }
    // Mejor coincidencia; a igualdad, feature antes que iniciativa y luego el nombre más corto.
    cands.sort((a, b) => a.r - b.r || (a.tipo === b.tipo ? 0 : a.tipo === 'feature' ? -1 : 1) || a.nombre.length - b.nombre.length)
    const c = cands[0]
    if (!c) {
      tok(i, 'feature', feature ? `Sin iniciativa «${palabras[i].w.slice(1)}» en ${feature.t}` : epica ? `Sin «${palabras[i].w.slice(1)}» en ${epica.name}` : `Sin feature «${palabras[i].w.slice(1)}»`, false)
      continue
    }
    const inferida = !epica
    if (!epica) { epica = c.epica; out.epicaId = epica.id }
    feature = c.feature
    out.featureId = feature.id
    const pref = inferida && !epicaFijada ? `${epica.name} › ` : ''
    if (c.tipo === 'iniciativa' && c.ini) {
      out.iniciativaId = c.ini.id
      tok(i, 'iniciativa', `${pref}${feature.t} › ${c.ini.nombre}`, true)
    } else {
      tok(i, 'feature', `${pref}${feature.t}`, true)
    }
  }

  out.tokens.sort((a, b) => a.pos - b.pos)
  out.titulo = titulo.filter((w): w is string => w !== null).join(' ').replace(/\s+/g, ' ').trim()
  return out
}

/* ─── Modo de la paleta según cómo empieza el texto ─── */
export type ModoPaleta =
  | { tipo: 'tarea'; resto: string }
  | { tipo: 'idea'; texto: string }
  | { tipo: 'peso'; kg: number }
  | { tipo: 'buscar' }

/** "+ …" / "nueva …" / "tarea …" → tarea; "idea …" → idea; "peso 82.4" → peso; lo demás, búsqueda. */
export function detectarModo(q: string): ModoPaleta {
  const s = q.replace(/^\s+/, '')
  let m = /^\+\s*/.exec(s) || /^nueva\s+tarea(?:\s+|$)/i.exec(s) || /^(?:nueva|tarea)\s+/i.exec(s)
  if (m) return { tipo: 'tarea', resto: s.slice(m[0].length) }
  if ((m = /^idea\s+(\S[\s\S]*)$/i.exec(s))) return { tipo: 'idea', texto: m[1].trim() }
  if ((m = /^peso\s+(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:kg)?\s*$/i.exec(s))) {
    const kg = parseFloat(m[1].replace(',', '.'))
    if (kg >= 25 && kg <= 350) return { tipo: 'peso', kg }
  }
  return { tipo: 'buscar' }
}

/** Quita un token del texto (la × del chip): ya no se interpreta ni queda en el título.
 *  `offset` = dónde empieza, dentro de `texto`, lo que se pasó a parseCaptura (tras el "+"). */
export function quitarToken(texto: string, token: TokenCaptura, offset = 0): string {
  const ini = offset + token.pos
  return `${texto.slice(0, ini).replace(/\s+$/, '')} ${texto.slice(ini + token.texto.length).replace(/^\s+/, '')}`
}

/** Deja un token como texto literal (antepone "\" a cada palabra suya) para que ya no se interprete.
 *  `offset` = dónde empieza, dentro de `texto`, lo que se pasó a parseCaptura (tras el "+"). */
export function escaparToken(texto: string, token: TokenCaptura, offset = 0): string {
  const inicios: number[] = []
  for (let m: RegExpExecArray | null, re = /\S+/g; (m = re.exec(token.texto));) inicios.push(offset + token.pos + m.index)
  let s = texto
  for (const p of inicios.reverse()) s = s.slice(0, p) + '\\' + s.slice(p)
  return s
}
