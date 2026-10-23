// Cálculos compartidos del tracker de Peso: los usan la página (hero, gráfica) y la ruta de IA
// (/api/peso/analisis), así los números que ves y los que lee el análisis son los mismos.
// Sin dependencias de servidor: se importa también desde componentes de cliente.

export type PesoRecord = {
  id: string
  fecha: string
  peso: number | null
  pct_grasa: number | null
  pct_musculo: number | null
  imc: number | null
  rmr: number | null
  edad_corporal: number | null
  grasa_visceral: number | null
}

export type PesoPlan = {
  id: string
  rutina: string | null
  dieta: string | null
  notas: string | null
  meta_peso: number | null
  meta_fecha: string | null
  meta_grasa: number | null
}

export const HEIGHT_M = 1.81
export const H2 = HEIGHT_M * HEIGHT_M
/** Peso al que el IMC cruza 25 con la talla de Andrés. */
export const PESO_IMC_25 = 25 * H2

// ── Fechas 'YYYY-MM-DD' ─────────────────────────────────────────────────────
// Aritmética en UTC: el resultado no depende de la zona horaria del servidor ni del navegador.

const utcMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))

export function daysBetween(a: string, b: string) {
  return Math.round((utcMs(b) - utcMs(a)) / 86_400_000)
}

export function addDays(d: string, n: number) {
  return new Date(utcMs(d) + n * 86_400_000).toISOString().slice(0, 10)
}

export function addMonths(d: string, n: number) {
  const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1, day = +d.slice(8, 10)
  const last = new Date(Date.UTC(y, m + n + 1, 0)).getUTCDate()   // el día 31 no existe en todos los meses
  return new Date(Date.UTC(y, m + n, Math.min(day, last))).toISOString().slice(0, 10)
}

/** La fecha de hoy en la Ciudad de México ('YYYY-MM-DD'), no la del servidor (que corre en UTC). */
export function hoyMX() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
}

export function fmtFecha(d: string) {
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y.slice(2)}`
}

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

// ── Clasificaciones de referencia (OMS / bioimpedancia) ─────────────────────

export type Level = 'good' | 'warn' | 'alert'
export type Classification = { label: string; color: string; level: Level }

export function classifyIMC(v: number): Classification {
  if (v < 18.5) return { label: 'Bajo peso', color: '#f59e0b', level: 'warn' }
  if (v < 25)   return { label: 'Normal', color: '#22c55e', level: 'good' }
  if (v < 30)   return { label: 'Sobrepeso', color: '#f59e0b', level: 'warn' }
  if (v < 35)   return { label: 'Obesidad I', color: '#ef4444', level: 'alert' }
  return         { label: 'Obesidad II+', color: '#dc2626', level: 'alert' }
}
export function classifyFat(v: number): Classification {
  if (v < 10)  return { label: 'Muy bajo', color: '#f59e0b', level: 'warn' }
  if (v < 15)  return { label: 'Atlético', color: '#22c55e', level: 'good' }
  if (v < 20)  return { label: 'Fitness', color: '#22c55e', level: 'good' }
  if (v < 25)  return { label: 'Saludable', color: '#84cc16', level: 'good' }
  if (v < 30)  return { label: 'Alto', color: '#f59e0b', level: 'warn' }
  return        { label: 'Obesidad por grasa', color: '#ef4444', level: 'alert' }
}
export function classifyMuscle(v: number): Classification {
  if (v < 30)  return { label: 'Bajo', color: '#ef4444', level: 'alert' }
  if (v < 33)  return { label: 'Normal', color: '#84cc16', level: 'warn' }
  if (v < 36)  return { label: 'Bueno', color: '#22c55e', level: 'good' }
  return        { label: 'Atlético', color: '#2d6cdf', level: 'good' }
}
export function classifyVisceral(v: number): Classification {
  if (v <= 9)  return { label: 'Saludable', color: '#22c55e', level: 'good' }
  if (v <= 14) return { label: 'Alto', color: '#f59e0b', level: 'warn' }
  return        { label: 'Muy alto', color: '#ef4444', level: 'alert' }
}

// ── Composición corporal en kg ──────────────────────────────────────────────
// Los porcentajes engañan cuando cambia el peso: 30 % de 91 kg no es lo mismo que 30 % de 83 kg.
// En kg se ve si lo que subió (o bajó) fue grasa o masa magra.

export const masaGrasa = (r: PesoRecord) =>
  r.peso != null && r.pct_grasa != null ? r2(r.peso * r.pct_grasa / 100) : null
export const masaMagra = (r: PesoRecord) =>
  r.peso != null && r.pct_grasa != null ? r2(r.peso * (1 - r.pct_grasa / 100)) : null

// ── Estadística ─────────────────────────────────────────────────────────────

/** Pendiente (unidades por semana) de una regresión lineal sobre las mediciones de [desde, hasta].
 *  null si hay menos de 3 puntos o abarcan menos de 14 días: con menos que eso es puro ruido. */
export function pendienteSemanal(
  rows: PesoRecord[], valor: (r: PesoRecord) => number | null, desde: string, hasta: string,
): number | null {
  const pts = rows
    .filter(r => r.fecha >= desde && r.fecha <= hasta)
    .map(r => ({ x: daysBetween(desde, r.fecha), y: valor(r) }))
    .filter((p): p is { x: number; y: number } => p.y != null)
  if (pts.length < 3) return null
  if (pts[pts.length - 1].x - pts[0].x < 14) return null
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p.x, 0) / n
  const my = pts.reduce((s, p) => s + p.y, 0) / n
  const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0)
  if (den === 0) return null
  const slopeDia = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den
  return slopeDia * 7
}

export function mejorMarca(rows: PesoRecord[], key: 'peso' | 'pct_grasa' | 'grasa_visceral', dir: 'min' | 'max' = 'min') {
  let best: { valor: number; fecha: string } | null = null
  for (const r of rows) {
    const v = r[key]
    if (v == null) continue
    if (!best || (dir === 'min' ? v < best.valor : v > best.valor)) best = { valor: v, fecha: r.fecha }
  }
  return best
}

/** Mediciones de la etapa actual: las posteriores al último hueco de más de un año. Comparar contra
 *  un dato de hace 5 años (otro cuerpo, otra vida) no dice nada útil sobre el plan de hoy. */
export function etapaActual(rows: PesoRecord[]) {
  const sorted = [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha))
  let inicio = 0
  for (let i = 1; i < sorted.length; i++) {
    if (daysBetween(sorted[i - 1].fecha, sorted[i].fecha) > 365) inicio = i
  }
  return sorted.slice(inicio)
}

/** Hash djb2 (puro JS) en base 36. */
function hash36(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Huella de los datos que alimentan el análisis: si cambia (medición nueva, editada o borrada, la
 *  meta o las rutinas/dietas "en uso"), el análisis guardado ya no corresponde y se vuelve a generar.
 *  `extra` es la huella de lo que no son mediciones ni meta (hoy: `extraPlanes`, los ids de los planes
 *  en uso); la página y la ruta del análisis deben armarla con la MISMA función.
 *  Formato: `<n>-<hash de mediciones y meta>` y, solo si hay `extra`, `+<hash del extra>`. La parte de los
 *  planes va aparte para que la página, cuando no pueda leerlos, compare solo lo demás (`firmaBase`); y sin
 *  extra la huella es idéntica a la de antes, así que los análisis ya guardados siguen vigentes. */
export function firmaDatos(rows: PesoRecord[], plan: PesoPlan | null, extra = '') {
  const base = `${rows.length}-${hash36(JSON.stringify([
    rows.map(r => [r.id, r.fecha, r.peso, r.pct_grasa, r.pct_musculo, r.imc, r.rmr, r.edad_corporal, r.grasa_visceral]),
    plan ? [plan.meta_peso, plan.meta_fecha, plan.meta_grasa] : null,
  ]))}`
  return extra ? `${base}+${hash36(extra)}` : base
}

/** La parte de la huella que solo depende de las mediciones y la meta (sin los planes en uso). */
export const firmaBase = (firma: string) => firma.split('+')[0]

/** Huella de los planes en uso: ids de los activos, ordenados y unidos con ','. Vacía si no hay ninguno
 *  (o si la tabla no existe). La usan la página y la ruta del análisis, así no pueden divergir. */
export function extraPlanes(planes: readonly { id: string; activo: boolean }[]) {
  return planes.filter(p => p.activo).map(p => p.id).sort().join(',')
}

// ── Hechos para el análisis ─────────────────────────────────────────────────
// Todo lo numérico se calcula aquí, en código. La IA solo interpreta: los modelos de lenguaje
// fallan en aritmética, así que nunca se les pide restar, promediar ni proyectar.

const VENTANAS = [30, 90, 180, 365] as const

/** Medición "completa": peso + % de grasa + % de músculo (lo que da la báscula de bioimpedancia). */
const esBioCompleta = (r: PesoRecord) => r.peso != null && r.pct_grasa != null && r.pct_musculo != null
/** La captura rápida del CommandPalette guarda registros con SOLO peso: sin composición. */
const esSoloPeso = (r: PesoRecord) => r.peso != null && r.pct_grasa == null && r.pct_musculo == null

/** Último registro (de una lista ordenada por fecha) que cumple la condición. */
function ultimoQue(sorted: PesoRecord[], ok: (r: PesoRecord) => boolean): PesoRecord | null {
  for (let i = sorted.length - 1; i >= 0; i--) if (ok(sorted[i])) return sorted[i]
  return null
}

/** Desviación estándar muestral; null con menos de 2 datos. */
function desviacion(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = xs.reduce((s, x) => s + x, 0) / xs.length
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

type DeltaComposicion = {
  desde: string; hasta: string; dias: number
  peso_inicial_kg: number; peso_final_kg: number
  peso_kg: number; masa_grasa_kg: number; masa_magra_kg: number
  grasa_pct: number | null; musculo_pct: number | null; grasa_visceral: number | null
  /** De cada 100 g que cambió el peso, cuántos fueron grasa. Solo si grasa y masa magra se movieron en el mismo sentido y el cambio es ≥ 1.5 kg; si no, null (el reparto no tiene sentido). */
  proporcion_grasa_del_cambio_pct: number | null
}

/** Cómo cambió la composición entre dos mediciones con bioimpedancia (en kg, no en puntos porcentuales). */
function deltaComposicion(a: PesoRecord, b: PesoRecord): DeltaComposicion | null {
  const ga = masaGrasa(a), gb = masaGrasa(b), ma = masaMagra(a), mb = masaMagra(b)
  if (a.peso == null || b.peso == null || ga == null || gb == null || ma == null || mb == null) return null
  const dG = r2(gb - ga), dM = r2(mb - ma)
  const total = dG + dM
  const mismoSentido = (dG >= 0 && dM >= 0) || (dG <= 0 && dM <= 0)
  const d = (x: number | null, y: number | null) => (x != null && y != null ? r1(y - x) : null)
  return {
    desde: a.fecha, hasta: b.fecha, dias: daysBetween(a.fecha, b.fecha),
    peso_inicial_kg: a.peso, peso_final_kg: b.peso, peso_kg: r1(b.peso - a.peso),
    masa_grasa_kg: dG, masa_magra_kg: dM,
    grasa_pct: d(a.pct_grasa, b.pct_grasa), musculo_pct: d(a.pct_musculo, b.pct_musculo), grasa_visceral: d(a.grasa_visceral, b.grasa_visceral),
    proporcion_grasa_del_cambio_pct: mismoSentido && Math.abs(total) >= 1.5 ? Math.round((dG / total) * 100) : null,
  }
}

type Racha = { de: string; a: string; dias: number; peso_kg: number; kg_por_semana: number; mediciones_en_la_racha: number; medido_cada_dias: number }

/** El mayor cambio de peso en un sentido entre dos mediciones de la etapa separadas por ≥ 28 días (y ≥ 2 kg).
 *  'baja' = su mejor racha de bajada; 'sube' = su mayor retroceso. Sirve de vara para el ritmo realista y para
 *  comparar con qué frecuencia se medía en cada caso. */
function mejorRacha(etapa: PesoRecord[], sentido: 'baja' | 'sube'): Racha | null {
  let mejor: Racha | null = null
  let mejorDelta = 0
  for (let i = 0; i < etapa.length; i++) {
    const pi = etapa[i].peso
    if (pi == null) continue
    for (let j = i + 1; j < etapa.length; j++) {
      const pj = etapa[j].peso
      const dias = daysBetween(etapa[i].fecha, etapa[j].fecha)
      if (pj == null || dias < 28) continue
      const delta = sentido === 'baja' ? pi - pj : pj - pi   // siempre positivo cuando va en el sentido buscado
      if (delta >= 2 && delta > mejorDelta) {
        mejorDelta = delta
        const n = j - i + 1
        const firmado = sentido === 'baja' ? -delta : delta
        mejor = { de: etapa[i].fecha, a: etapa[j].fecha, dias, peso_kg: r1(firmado), kg_por_semana: r2(firmado / (dias / 7)), mediciones_en_la_racha: n, medido_cada_dias: r1(dias / Math.max(1, n - 1)) }
      }
    }
  }
  return mejor
}

type Tramos = { intervalos: number; dias_totales: number; kg_totales: number; kg_por_semana: number | null }

export function buildFacts(rows: PesoRecord[], plan: PesoPlan | null, hoy: string) {
  const sorted = [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ultima = sorted[sorted.length - 1]
  const primera = sorted[0]
  const etapa = etapaActual(sorted)

  // La captura rápida guarda registros con solo peso: lo "actual" de cada métrica es su último dato conocido,
  // no necesariamente el de la última fila (si no, tras un registro rápido el análisis diría que no hay grasa).
  const ultimaPeso = ultimoQue(sorted, r => r.peso != null) ?? ultima
  const ultimaBio = ultimoQue(sorted, esBioCompleta)
  const ultimaGrasa = ultimoQue(sorted, r => r.pct_grasa != null)
  const ultimaMusculo = ultimoQue(sorted, r => r.pct_musculo != null)
  const ultimaVisceral = ultimoQue(sorted, r => r.grasa_visceral != null)

  const compacta = (r: PesoRecord) => ({
    fecha: r.fecha, kg: r.peso, grasa_pct: r.pct_grasa, musculo_pct: r.pct_musculo, imc: r.imc,
    rmr: r.rmr && r.rmr < 5000 ? r.rmr : null,   // 17775 en la base es un error de captura conocido
    edad_corporal: r.edad_corporal, grasa_visceral: r.grasa_visceral,
    masa_grasa_kg: masaGrasa(r), masa_magra_kg: masaMagra(r),
  })

  // Cambios del primer dato de cada ventana (hacia atrás desde la última medición) al último.
  const cambios = VENTANAS.flatMap(dias => {
    const desde = addDays(ultima.fecha, -dias)
    const ref = sorted.find(r => r.fecha >= desde && r.id !== ultima.id)
    if (!ref) return []
    const d = (a: number | null, b: number | null) => (a != null && b != null ? r1(b - a) : null)
    return [{
      ventana_dias: dias, desde: ref.fecha, dias_reales: daysBetween(ref.fecha, ultima.fecha),
      peso_kg: d(ref.peso, ultima.peso), grasa_pct: d(ref.pct_grasa, ultima.pct_grasa),
      musculo_pct: d(ref.pct_musculo, ultima.pct_musculo), grasa_visceral: d(ref.grasa_visceral, ultima.grasa_visceral),
      masa_grasa_kg: d(masaGrasa(ref), masaGrasa(ultima)), masa_magra_kg: d(masaMagra(ref), masaMagra(ultima)),
    }]
  })

  const pend = (dias: number, v: (r: PesoRecord) => number | null) => {
    const p = pendienteSemanal(sorted, v, addDays(ultima.fecha, -dias), ultima.fecha)
    return p == null ? null : r2(p)
  }

  // Huecos largos entre mediciones y qué pasó con el peso durante ellos.
  const huecos = sorted.flatMap((r, i) => {
    const prev = sorted[i - 1]
    if (!prev) return []
    const dias = daysBetween(prev.fecha, r.fecha)
    if (dias < 45) return []
    return [{
      de: prev.fecha, a: r.fecha, dias,
      peso_kg: prev.peso != null && r.peso != null ? r1(r.peso - prev.peso) : null,
      grasa_pct: prev.pct_grasa != null && r.pct_grasa != null ? r1(r.pct_grasa - prev.pct_grasa) : null,
    }]
  })

  // Saltos que la bioimpedancia no explica con cambios reales de composición (hidratación, comida…).
  const saltosSospechosos = sorted.flatMap((r, i) => {
    const prev = sorted[i - 1]
    if (!prev) return []
    const dias = daysBetween(prev.fecha, r.fecha)
    const dGrasa = prev.pct_grasa != null && r.pct_grasa != null ? r.pct_grasa - prev.pct_grasa : null
    const dPeso = prev.peso != null && r.peso != null ? r.peso - prev.peso : null
    if ((dGrasa != null && Math.abs(dGrasa) >= 2.5 && dias <= 21) || (dPeso != null && Math.abs(dPeso) >= 2.5 && dias <= 7)) {
      return [{ de: prev.fecha, a: r.fecha, dias, peso_kg: dPeso != null ? r1(dPeso) : null, grasa_pct: dGrasa != null ? r1(dGrasa) : null }]
    }
    return []
  })

  // Su mejor racha de bajada y su mayor retroceso dentro de la etapa actual.
  const racha = mejorRacha(etapa, 'baja')
  const rachaSubida = mejorRacha(etapa, 'sube')

  // Cadencia de medición en el último año.
  const ultimoAnio = sorted.filter(r => r.fecha >= addDays(ultima.fecha, -365))
  const intervalos = ultimoAnio.slice(1).map((r, i) => daysBetween(ultimoAnio[i].fecha, r.fecha)).sort((a, b) => a - b)
  const medianaIntervalo = intervalos.length ? intervalos[Math.floor(intervalos.length / 2)] : null

  // Ritmo según con qué frecuencia se midió: intervalos consecutivos de la etapa actual con peso. Mide si
  // "medirse seguido" y "bajar" han ido juntos (asociación, no prueba de causa).
  const pesosEtapa = etapa.filter(r => r.peso != null)
  const pares = pesosEtapa.slice(1).map((b, i) => {
    const a = pesosEtapa[i]
    return { dias: daysBetween(a.fecha, b.fecha), kg: (b.peso as number) - (a.peso as number) }
  }).filter(p => p.dias >= 1)
  const tramos = (ok: (dias: number) => boolean): Tramos | null => {
    const sel = pares.filter(p => ok(p.dias))
    if (sel.length === 0) return null
    const dias = sel.reduce((s, p) => s + p.dias, 0)
    const kg = sel.reduce((s, p) => s + p.kg, 0)
    return { intervalos: sel.length, dias_totales: dias, kg_totales: r1(kg), kg_por_semana: dias >= 14 ? r2(kg / (dias / 7)) : null }
  }

  // Composición de la etapa actual en kg: ¿lo que cambió fue grasa o masa magra?
  const bioEtapa = etapa.filter(r => r.peso != null && r.pct_grasa != null)
  const mejorPesoBio = mejorMarca(bioEtapa, 'peso')
  const refMejor = mejorPesoBio ? bioEtapa.find(r => r.fecha === mejorPesoBio.fecha && r.peso === mejorPesoBio.valor) ?? null : null
  const ultimaBioEtapa = bioEtapa[bioEtapa.length - 1] ?? null
  const composicionEtapa = bioEtapa.length >= 2 && ultimaBioEtapa ? {
    toda_la_etapa: deltaComposicion(bioEtapa[0], ultimaBioEtapa),
    // Desde el punto más ligero de la etapa hasta hoy: qué pasó con el cuerpo durante el retroceso.
    desde_el_mejor_peso: refMejor && refMejor !== ultimaBioEtapa ? deltaComposicion(refMejor, ultimaBioEtapa) : null,
  } : null

  // Variabilidad del peso en los 90 días previos a la última medición: la vara para distinguir ruido de cambio real.
  const pesos90 = sorted.filter(r => r.peso != null && r.fecha >= addDays(ultima.fecha, -90)).map(r => r.peso as number)
  const sd90 = pesos90.length >= 3 ? desviacion(pesos90) : null
  const variabilidad = sd90 != null
    ? { n_mediciones: pesos90.length, desviacion_estandar_kg: r2(sd90), rango_kg: r1(Math.max(...pesos90) - Math.min(...pesos90)), minimo_kg: Math.min(...pesos90), maximo_kg: Math.max(...pesos90) }
    : null

  // Escenarios para llegar a un peso saludable, conservando la masa magra actual (la de la última
  // bioimpedancia, que puede ser anterior a un registro rápido de solo peso).
  const magra = ultimaBio ? masaMagra(ultimaBio) : null
  const peso = ultimaPeso.peso
  const aPerder = peso != null ? r1(peso - PESO_IMC_25) : null
  const hayQueBajar = aPerder != null && aPerder > 0
  const semanasA = (kg: number, ritmo: number) => Math.ceil(kg / ritmo)
  const s025 = hayQueBajar ? semanasA(aPerder, 0.25) : null
  const s05 = hayQueBajar ? semanasA(aPerder, 0.5) : null
  const s075 = hayQueBajar ? semanasA(aPerder, 0.75) : null
  const fechaEn = (semanas: number | null) => (semanas != null ? addDays(hoy, semanas * 7) : null)
  const escenarios = {
    peso_imc_25_kg: r1(PESO_IMC_25),
    kg_para_imc_25: hayQueBajar ? aPerder : 0,
    semanas_a_0_25_kg_sem: s025,
    semanas_a_0_5_kg_sem: s05,
    semanas_a_0_75_kg_sem: s075,
    // Fecha estimada de llegada a IMC 25 contando desde HOY y partiendo del último peso registrado
    // (si la última medición es vieja, es orientativa: hoy el peso real puede ser otro).
    fecha_estimada_a_0_25_kg_sem: fechaEn(s025),
    fecha_estimada_a_0_5_kg_sem: fechaEn(s05),
    fecha_estimada_a_0_75_kg_sem: fechaEn(s075),
    partiendo_del_peso_kg: peso,
    peso_medido_el: peso != null ? ultimaPeso.fecha : null,
    peso_con_20_pct_grasa_kg: magra != null ? r1(magra / 0.8) : null,
    peso_con_25_pct_grasa_kg: magra != null ? r1(magra / 0.75) : null,
    masa_magra_base_medida_el: magra != null && ultimaBio ? ultimaBio.fecha : null,
  }

  // Meta definida por Andrés, si existe.
  let meta: {
    peso_kg: number | null; fecha: string | null; grasa_pct: number | null
    kg_por_bajar: number | null; dias_restantes: number | null; ritmo_necesario_kg_sem: number | null
    peso_necesario_para_la_meta_de_grasa_kg: number | null; kg_por_bajar_para_la_meta_de_grasa: number | null
  } | null = null
  if (plan && (plan.meta_peso != null || plan.meta_grasa != null || plan.meta_fecha)) {
    const kgRestantes = plan.meta_peso != null && peso != null ? r1(peso - plan.meta_peso) : null
    const diasRestantes = plan.meta_fecha ? daysBetween(hoy, plan.meta_fecha) : null
    // Peso al que estaría con su % de grasa meta si conserva la masa magra.
    const pesoParaGrasa = plan.meta_grasa != null && magra != null && plan.meta_grasa < 100 ? r1(magra / (1 - plan.meta_grasa / 100)) : null
    meta = {
      peso_kg: plan.meta_peso, fecha: plan.meta_fecha, grasa_pct: plan.meta_grasa,
      kg_por_bajar: kgRestantes, dias_restantes: diasRestantes,
      ritmo_necesario_kg_sem: kgRestantes != null && kgRestantes > 0 && diasRestantes != null && diasRestantes > 0 ? r2(kgRestantes / (diasRestantes / 7)) : null,
      peso_necesario_para_la_meta_de_grasa_kg: pesoParaGrasa,
      kg_por_bajar_para_la_meta_de_grasa: pesoParaGrasa != null && peso != null ? r1(peso - pesoParaGrasa) : null,
    }
  }

  const recortar = (s: string | null) => (s && s.trim() ? s.trim().slice(0, 1200) : null)
  const mejorPeso = mejorMarca(etapa, 'peso')

  // Calidad del dato.
  const nSoloPeso = sorted.filter(esSoloPeso).length
  const desdeUltimaBio = ultimaBio ? sorted.filter(r => r.fecha > ultimaBio.fecha && esSoloPeso(r)).length : null

  // Constancia: cuántas veces se midió recientemente y cuál fue el hueco más largo de la etapa actual.
  const intervalosEtapa = pares.map(p => p.dias).sort((a, b) => a - b)
  const constancia = {
    mediciones_ultimos_90_dias_hasta_hoy: sorted.filter(r => r.fecha > addDays(hoy, -90) && r.fecha <= hoy).length,
    mediciones_ultimo_anio_hasta_hoy: sorted.filter(r => r.fecha > addDays(hoy, -365) && r.fecha <= hoy).length,
    mediana_dias_entre_mediciones_etapa_actual: intervalosEtapa.length ? intervalosEtapa[Math.floor(intervalosEtapa.length / 2)] : null,
    mayor_hueco_etapa_actual_dias: intervalosEtapa.length ? intervalosEtapa[intervalosEtapa.length - 1] : null,
  }

  return {
    hoy,
    // Fechas ya calculadas para plazos de las acciones: el modelo no debe sumar días por su cuenta.
    fechas_de_referencia: {
      en_1_semana: addDays(hoy, 7), en_2_semanas: addDays(hoy, 14), en_4_semanas: addDays(hoy, 28),
      en_8_semanas: addDays(hoy, 56), en_12_semanas: addDays(hoy, 84),
    },
    perfil: { sexo: 'hombre', talla_m: HEIGHT_M, rango_edad: '30-40 años' },
    n_mediciones: sorted.length,
    primera_medicion: primera.fecha,
    ultima_medicion: ultima.fecha,
    dias_desde_ultima_medicion: daysBetween(ultima.fecha, hoy),
    mediana_dias_entre_mediciones_ultimo_anio: medianaIntervalo,
    constancia,
    calidad_de_los_datos: {
      mediciones_solo_peso: nSoloPeso,
      mediciones_con_composicion: sorted.filter(r => r.pct_grasa != null).length,
      la_ultima_medicion_es_solo_peso: esSoloPeso(ultima),
      ultima_bioimpedancia_completa: ultimaBio ? { ...compacta(ultimaBio), dias_antes_de_hoy: daysBetween(ultimaBio.fecha, hoy) } : null,
      registros_solo_peso_posteriores_a_la_ultima_bioimpedancia: desdeUltimaBio,
    },
    // Clasificación con el último dato conocido de cada métrica (la fecha de cada uno está en *_medido_el).
    clasificacion_actual: {
      imc: ultimaPeso.peso != null ? classifyIMC(ultimaPeso.imc ?? ultimaPeso.peso / H2).label : null,
      grasa: ultimaGrasa?.pct_grasa != null ? classifyFat(ultimaGrasa.pct_grasa).label : null,
      musculo: ultimaMusculo?.pct_musculo != null ? classifyMuscle(ultimaMusculo.pct_musculo).label : null,
      grasa_visceral: ultimaVisceral?.grasa_visceral != null ? classifyVisceral(ultimaVisceral.grasa_visceral).label : null,
      grasa_medido_el: ultimaGrasa?.fecha ?? null,
      musculo_medido_el: ultimaMusculo?.fecha ?? null,
      grasa_visceral_medido_el: ultimaVisceral?.fecha ?? null,
    },
    tendencia_kg_por_semana: { ultimos_90_dias: pend(90, r => r.peso), ultimos_180_dias: pend(180, r => r.peso), ultimo_anio: pend(365, r => r.peso) },
    variabilidad_del_peso_90_dias: variabilidad,
    cambios_hasta_la_ultima_medicion: cambios,
    etapa_actual_desde: etapa[0].fecha,   // el registro se retomó tras un hueco de más de un año; lo anterior es otra etapa
    composicion_etapa_actual: composicionEtapa,
    mejores_marcas: {
      peso_minimo_etapa_actual: mejorPeso,
      grasa_minima_etapa_actual: mejorMarca(etapa, 'pct_grasa'),
      visceral_minima_etapa_actual: mejorMarca(etapa, 'grasa_visceral'),
      kg_sobre_el_mejor_peso_de_la_etapa: peso != null && mejorPeso ? r1(peso - mejorPeso.valor) : null,
      peso_minimo_historico: mejorMarca(sorted, 'peso'),
    },
    mejor_racha_de_bajada: racha,
    mayor_racha_de_subida: rachaSubida,
    ritmo_segun_frecuencia_de_medicion_etapa_actual: {
      tramos_con_mediciones_cada_21_dias_o_menos: tramos(d => d <= 21),
      tramos_con_mas_de_45_dias_sin_medir: tramos(d => d > 45),
    },
    huecos_largos_sin_medir: huecos,
    saltos_sospechosos_de_ruido_bioimpedancia: saltosSospechosos,
    escenarios,
    gasto_energetico_estimado_kcal: ultimaBio?.rmr && ultimaBio.rmr < 5000
      ? { rmr: ultimaBio.rmr, sedentario: Math.round(ultimaBio.rmr * 1.2), actividad_ligera: Math.round(ultimaBio.rmr * 1.375), actividad_moderada: Math.round(ultimaBio.rmr * 1.55), nota: 'estimación orientativa; un déficit de 500 kcal/día equivale a ~0.45 kg/semana' }
      : null,
    // Referencia general de nutrición deportiva (1.6–2.0 g por kg) para no pedirle al modelo que multiplique.
    proteina_g_por_dia_orientativa: peso != null ? { minimo: Math.round(peso * 1.6), maximo: Math.round(peso * 2.0), base: '1.6 a 2.0 g por kg del último peso registrado' } : null,
    meta,
    plan: plan ? { rutina: recortar(plan.rutina), dieta: recortar(plan.dieta), notas: recortar(plan.notas) } : null,
    mediciones: sorted.slice(-80).map(compacta),   // todo el historial reciente; 80 sobran para años de datos
  }
}

export type PesoFacts = ReturnType<typeof buildFacts>

// ── Resultado del análisis ──────────────────────────────────────────────────

export type InsightTipo = 'positivo' | 'atencion' | 'alerta' | 'dato'
/** Qué métrica toca un insight: la interfaz la usa para elegir el icono. */
export const METRICAS = ['peso', 'grasa', 'musculo', 'visceral', 'constancia', 'meta', 'datos'] as const
export type PesoMetrica = (typeof METRICAS)[number]
/** `prioridad` y `metrica` son opcionales: los análisis guardados antes de que existieran no los traen. */
export type PesoInsight = { tipo: InsightTipo; titulo: string; detalle: string; prioridad?: 1 | 2 | 3; metrica?: PesoMetrica }
export type PesoAccion = { accion: string; porque: string }
export type PesoAnalisis = {
  titular: string
  estado: 'bien' | 'mixto' | 'alerta'
  insights: PesoInsight[]
  acciones: PesoAccion[]
}
export type PesoAnalisisGuardado = {
  firma: string
  fuente: 'ia' | 'reglas'
  created_at: string
  fecha_base: string
  n_registros: number
  contenido: PesoAnalisis
}

const TIPOS: InsightTipo[] = ['positivo', 'atencion', 'alerta', 'dato']
const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
/** Minúsculas y sin acentos: el modelo a veces escribe "atención" o "músculo" en vez del valor exacto del esquema. */
const limpio = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '')

/** Palabras "con contenido" de un texto (sin acentos, ≥ 3 caracteres, números incluidos) para comparar repeticiones. */
function palabras(s: string) {
  return new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9.]{3,}/g) ?? [])
}
/** ¿`a` repite a `b`? Coeficiente de solapamiento: qué parte de las palabras del texto más corto está en el otro. */
function repite(a: Set<string>, b: Set<string>, minPalabras = 4) {
  if (a.size < minPalabras || b.size < 4) return false
  let comunes = 0
  for (const w of a) if (b.has(w)) comunes++
  return comunes / Math.min(a.size, b.size) >= 0.8
}

/** Valida lo que devolvió el modelo: nunca se pinta algo con otra forma ni con textos kilométricos.
 *  Además descarta insights que repiten el titular o a otro insight (el modelo a veces dice tres veces lo mismo). */
export function normalizarAnalisis(raw: unknown): PesoAnalisis | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const titular = clip(o.titular, 220)
  const palTitular = palabras(titular)
  const vistos: Set<string>[] = []
  const insights = (Array.isArray(o.insights) ? o.insights : []).flatMap((x): PesoInsight[] => {
    if (!x || typeof x !== 'object') return []
    const i = x as Record<string, unknown>
    const titulo = clip(i.titulo, 90), detalle = clip(i.detalle, 520)
    if (!titulo || !detalle) return []
    const pal = palabras(`${titulo} ${detalle}`)
    if (repite(palTitular, pal, 7) || vistos.some(v => repite(v, pal))) return []
    vistos.push(pal)
    const p = Number(i.prioridad)
    const tipo = TIPOS.find(t => t === limpio(i.tipo)) ?? 'dato'
    const out: PesoInsight = { tipo, titulo, detalle }
    if (p === 1 || p === 2 || p === 3) out.prioridad = p
    const metrica = METRICAS.find(m => m === limpio(i.metrica))
    if (metrica) out.metrica = metrica
    return [out]
  }).slice(0, 6)
  const accionesVistas: Set<string>[] = []
  const acciones = (Array.isArray(o.acciones) ? o.acciones : []).flatMap((x): PesoAccion[] => {
    if (!x || typeof x !== 'object') return []
    const a = x as Record<string, unknown>
    const accion = clip(a.accion, 160), porque = clip(a.porque, 260)
    if (!accion) return []
    const pal = palabras(accion)
    if (accionesVistas.some(v => repite(v, pal))) return []
    accionesVistas.push(pal)
    return [{ accion, porque }]
  }).slice(0, 4)
  if (!titular || insights.length === 0) return null
  const e = limpio(o.estado)
  const estado = e === 'bien' || e === 'alerta' ? e : 'mixto'
  return { titular, estado, insights, acciones }
}

// ── Plan B: lectura por reglas ──────────────────────────────────────────────
// Si Gemini no responde (cuota, 503, sin llave), la sección no queda vacía: estas reglas dicen lo
// esencial con los mismos números y con la misma estructura que la IA (un ángulo por insight, titular
// que no se repite, acciones con fecha). Menos matiz, pero siempre algo útil.

export function analisisPorReglas(f: PesoFacts): PesoAnalisis {
  const insights: PesoInsight[] = []
  const acciones: PesoAccion[] = []
  const signo = (n: number) => `${n > 0 ? '+' : ''}${n}`
  const dias = f.dias_desde_ultima_medicion
  const viejo = dias >= 21
  const fechas = f.fechas_de_referencia
  const sem = f.tendencia_kg_por_semana.ultimos_90_dias
  const mejor = f.mejores_marcas.peso_minimo_etapa_actual
  const sobre = f.mejores_marcas.kg_sobre_el_mejor_peso_de_la_etapa
  const racha = f.mejor_racha_de_bajada
  const subida = f.mayor_racha_de_subida
  const comp = f.composicion_etapa_actual
  const esc = f.escenarios
  const calidad = f.calidad_de_los_datos
  const ultimoValor = (k: 'grasa_pct' | 'grasa_visceral') => {
    for (let i = f.mediciones.length - 1; i >= 0; i--) { const v = f.mediciones[i][k]; if (v != null) return v }
    return null
  }
  const grasaAct = ultimoValor('grasa_pct')
  const visceralAct = ultimoValor('grasa_visceral')

  // 1) Composición: ¿lo que cambió fue grasa o masa magra?
  const dm = comp?.desde_el_mejor_peso ?? null
  const et = comp?.toda_la_etapa ?? null
  if (dm && Math.abs(dm.peso_kg) >= 1) {
    const prop = dm.proporcion_grasa_del_cambio_pct
    const sube = dm.peso_kg > 0
    const base = `Entre tu mejor marca (${fmtFecha(dm.desde)}, ${dm.peso_inicial_kg} kg) y tu bioimpedancia del ${fmtFecha(dm.hasta)}, tu peso ${sube ? 'subió' : 'bajó'} ${Math.abs(dm.peso_kg)} kg: ${signo(dm.masa_grasa_kg)} kg de masa grasa y ${signo(dm.masa_magra_kg)} kg de masa magra.`
    let tipo: InsightTipo = 'atencion'
    let titulo = sube ? 'Lo que subiste no es solo grasa' : 'Cómo fue tu bajada'
    let cierre = ''
    if (sube && prop != null && prop >= 75) { tipo = 'alerta'; titulo = 'Casi todo lo que subiste fue grasa'; cierre = ` Cerca de ${prop} % del aumento fue grasa.` }
    else if (sube && prop != null && prop <= 25) { tipo = 'positivo'; titulo = 'Lo que subiste fue sobre todo masa magra'; cierre = ` Solo ${prop} % del aumento fue grasa.` }
    else if (sube && prop != null) { cierre = ` Alrededor de ${prop} % del aumento fue grasa y el resto masa magra.` }
    else if (sube) { tipo = dm.masa_grasa_kg > 0 && dm.masa_magra_kg <= 0 ? 'alerta' : 'atencion' }
    else if (dm.masa_grasa_kg < 0 && dm.masa_magra_kg >= -1) { tipo = 'positivo'; titulo = 'Tu bajada vino de grasa' }
    else if (dm.masa_magra_kg < -1) { titulo = 'Bajaste, pero también perdiste masa magra' }
    const etapa = et && et.desde !== dm.desde
      ? ` En toda la etapa (desde ${fmtFecha(et.desde)}) tu masa magra va ${signo(et.masa_magra_kg)} kg y tu masa grasa ${signo(et.masa_grasa_kg)} kg.`
      : ''
    insights.push({ tipo, titulo, detalle: base + cierre + etapa, prioridad: 1, metrica: dm.masa_grasa_kg !== 0 && Math.abs(dm.masa_grasa_kg) >= Math.abs(dm.masa_magra_kg) ? 'grasa' : 'musculo' })
  } else if (et && Math.abs(et.peso_kg) >= 1) {
    insights.push({
      tipo: et.masa_grasa_kg > 0 && et.masa_magra_kg <= 0 ? 'alerta' : et.masa_grasa_kg > 0 ? 'atencion' : 'positivo',
      titulo: 'Qué cambió en tu composición',
      detalle: `Desde el ${fmtFecha(et.desde)}: peso ${signo(et.peso_kg)} kg, masa grasa ${signo(et.masa_grasa_kg)} kg y masa magra ${signo(et.masa_magra_kg)} kg.`,
      prioridad: 1, metrica: 'grasa',
    })
  }

  // 2) Ritmo del peso.
  if (sem != null) {
    const estable = Math.abs(sem) <= 0.15
    const refRacha = racha ? ` Tu mejor ritmo sostenido fue ${racha.kg_por_semana} kg/semana (del ${fmtFecha(racha.de)} al ${fmtFecha(racha.a)}): es la referencia realista para planear.` : ''
    const semanasA25 = esc.kg_para_imc_25 > 0 && sem < -0.15 ? ` A ese ritmo te faltarían unas ${Math.ceil(esc.kg_para_imc_25 / Math.abs(sem))} semanas para IMC 25.` : ''
    insights.push({
      tipo: estable ? (esc.kg_para_imc_25 > 0 ? 'atencion' : 'dato') : sem > 0 ? (sem > 0.3 ? 'alerta' : 'atencion') : 'positivo',
      titulo: estable ? 'Tu peso lleva un tiempo sin moverse' : sem > 0 ? 'Tu peso va subiendo' : 'Tu peso va bajando',
      detalle: `En los 90 días previos a tu última medición, tu peso cambió ${signo(sem)} kg por semana${estable ? ' (prácticamente estable)' : ''}.${semanasA25}${refRacha}`,
      prioridad: 2, metrica: 'peso',
    })
  }

  // 3) Constancia: ¿medirse seguido y bajar han ido juntos?
  const densos = f.ritmo_segun_frecuencia_de_medicion_etapa_actual.tramos_con_mediciones_cada_21_dias_o_menos
  const conHuecos = f.ritmo_segun_frecuencia_de_medicion_etapa_actual.tramos_con_mas_de_45_dias_sin_medir
  if (densos?.kg_por_semana != null && conHuecos?.kg_por_semana != null) {
    const patron = densos.kg_por_semana < 0 && conHuecos.kg_por_semana > 0
    insights.push({
      tipo: patron && viejo ? 'atencion' : 'dato',
      titulo: patron ? 'Cuando te mides seguido, tu peso baja' : 'Cómo cambia tu peso según qué tanto te mides',
      detalle: `En los tramos con mediciones cada 21 días o menos (${densos.intervalos} intervalos) tu peso cambió ${signo(densos.kg_por_semana)} kg/semana; en los tramos con más de 45 días sin medirte (${conHuecos.intervalos} intervalos), ${signo(conHuecos.kg_por_semana)} kg/semana.${racha && subida ? ` En tu mejor racha de bajada te medías cada ${Math.round(racha.medido_cada_dias)} días; en tu mayor retroceso, cada ${Math.round(subida.medido_cada_dias)} días.` : ''}${patron ? ' No prueba que medirte cause el cambio, pero van juntos.' : ''}`,
      prioridad: patron ? 1 : 3, metrica: 'constancia',
    })
  } else if (racha) {
    insights.push({
      tipo: 'positivo', titulo: 'Ya demostraste que puedes bajar',
      detalle: `Entre el ${fmtFecha(racha.de)} y el ${fmtFecha(racha.a)} bajaste ${Math.abs(racha.peso_kg)} kg (${Math.abs(racha.kg_por_semana)} kg/semana) y te medías cada ${Math.round(racha.medido_cada_dias)} días en promedio.`,
      prioridad: 2, metrica: 'constancia',
    })
  }

  // 4) Riesgo: grasa visceral y % de grasa. Es el único lugar donde se menciona al médico.
  const visAlta = visceralAct != null && visceralAct >= 10
  const grasaAlta = grasaAct != null && grasaAct >= 30
  if (visAlta || grasaAlta) {
    const piezas: string[] = []
    if (visceralAct != null) {
      const minV = f.mejores_marcas.visceral_minima_etapa_actual
      piezas.push(`Tu grasa visceral está en ${visceralAct} (${f.clasificacion_actual.grasa_visceral?.toLowerCase()})${minV && minV.valor < visceralAct ? `; tu mínimo de la etapa fue ${minV.valor} el ${fmtFecha(minV.fecha)}` : ''}.`)
    }
    if (grasaAct != null) piezas.push(`Tu grasa corporal es ${grasaAct} % (${f.clasificacion_actual.grasa?.toLowerCase()}).`)
    piezas.push('Son las métricas más ligadas al riesgo metabólico; conviene comentarlas con tu médico.')
    insights.push({
      tipo: visceralAct != null && visceralAct >= 15 ? 'alerta' : 'atencion',
      titulo: visAlta && grasaAlta ? `Grasa visceral en ${visceralAct} y grasa corporal en ${grasaAct} %` : visAlta ? `Grasa visceral en ${visceralAct}` : `Grasa corporal en ${grasaAct} %`,
      detalle: piezas.join(' '),
      prioridad: 2, metrica: visAlta ? 'visceral' : 'grasa',
    })
  } else if (visceralAct != null && visceralAct <= 9) {
    insights.push({ tipo: 'positivo', titulo: `Grasa visceral en rango (${visceralAct})`, detalle: `Está en el rango saludable (9 o menos). Es la métrica más ligada al riesgo metabólico, así que vale cuidarla.`, prioridad: 3, metrica: 'visceral' })
  }

  // 5) Meta.
  const m = f.meta
  if (m == null && esc.kg_para_imc_25 > 0) {
    const f25 = esc.fecha_estimada_a_0_25_kg_sem, f5 = esc.fecha_estimada_a_0_5_kg_sem, f75 = esc.fecha_estimada_a_0_75_kg_sem
    insights.push({
      tipo: 'dato', titulo: 'Aún no tienes una meta definida',
      detalle: `Con ${esc.peso_imc_25_kg} kg tu IMC baja de 25: son ${esc.kg_para_imc_25} kg menos que tu último peso (${esc.partiendo_del_peso_kg} kg).${f25 && f5 && f75 ? ` Contando desde hoy, a 0.25 kg/semana llegarías hacia el ${fmtFecha(f25)}, a 0.5 hacia el ${fmtFecha(f5)} y a 0.75 hacia el ${fmtFecha(f75)}.` : ''}`,
      prioridad: 2, metrica: 'meta',
    })
  } else if (m) {
    const partes: string[] = []
    let tipo: InsightTipo = 'dato'
    if (m.peso_kg != null && m.kg_por_bajar != null) {
      if (m.kg_por_bajar <= 0) { tipo = 'positivo'; partes.push(`Tu último peso (${esc.partiendo_del_peso_kg} kg) ya está en tu meta de ${m.peso_kg} kg.`) }
      else partes.push(`Tu meta es ${m.peso_kg} kg${m.fecha ? ` para el ${fmtFecha(m.fecha)}` : ''}; te faltan ${m.kg_por_bajar} kg desde tu último peso.`)
    }
    if (m.dias_restantes != null && m.dias_restantes <= 0 && m.kg_por_bajar != null && m.kg_por_bajar > 0) { tipo = 'atencion'; partes.push('La fecha de tu meta ya pasó: conviene reprogramarla con un ritmo realista.') }
    else if (m.ritmo_necesario_kg_sem != null) {
      const alcanza = racha != null && m.ritmo_necesario_kg_sem <= Math.abs(racha.kg_por_semana)
      if (!alcanza) tipo = 'atencion'
      partes.push(`Para llegar a tiempo necesitas bajar ${m.ritmo_necesario_kg_sem} kg/semana${racha ? `; tu mejor racha fue de ${Math.abs(racha.kg_por_semana)} kg/semana, así que ${alcanza ? 'es alcanzable si la repites' : 'es más exigente de lo que has logrado'}` : ''}.`)
    }
    if (m.kg_por_bajar_para_la_meta_de_grasa != null && m.grasa_pct != null) {
      partes.push(`Para ${m.grasa_pct} % de grasa conservando tu masa magra, pesarías ${m.peso_necesario_para_la_meta_de_grasa_kg} kg.`)
    }
    if (partes.length > 0) insights.push({ tipo, titulo: tipo === 'positivo' ? 'Alcanzaste tu meta de peso' : m.peso_kg == null ? 'Tu meta de grasa corporal' : 'Tu meta y el ritmo que necesita', detalle: partes.join(' '), prioridad: 2, metrica: 'meta' })
  }

  // 6) Calidad del dato (NO la antigüedad: eso va solo en el titular y en la primera acción).
  const calidadPartes: string[] = []
  const nSolo = calidad.mediciones_solo_peso
  if (nSolo > 0) {
    calidadPartes.push(nSolo === f.n_mediciones ? 'Todas tus mediciones son solo peso, sin composición corporal.'
      : nSolo === 1 ? `1 de tus ${f.n_mediciones} mediciones es solo peso (sin composición corporal).`
      : `${nSolo} de tus ${f.n_mediciones} mediciones son solo peso (sin composición corporal).`)
  }
  if (calidad.la_ultima_medicion_es_solo_peso && calidad.ultima_bioimpedancia_completa) calidadPartes.push(`Tu última medición no trae composición; la última bioimpedancia completa es del ${fmtFecha(calidad.ultima_bioimpedancia_completa.fecha)}.`)
  const salto = f.saltos_sospechosos_de_ruido_bioimpedancia[f.saltos_sospechosos_de_ruido_bioimpedancia.length - 1]
  if (salto && salto.grasa_pct != null) calidadPartes.push(`Entre el ${fmtFecha(salto.de)} y el ${fmtFecha(salto.a)} tu grasa cambió ${signo(salto.grasa_pct)} puntos en ${salto.dias} días: casi seguro es ruido de la báscula (hidratación, comida u hora), no un cambio real.`)
  if (f.variabilidad_del_peso_90_dias && f.variabilidad_del_peso_90_dias.n_mediciones >= 4) calidadPartes.push(`Tu peso varía unos ±${f.variabilidad_del_peso_90_dias.desviacion_estandar_kg} kg entre mediciones, así que cambios menores a eso no significan nada.`)
  if (calidadPartes.length > 0) {
    insights.push({ tipo: 'dato', titulo: 'Qué tan confiables son tus datos', detalle: calidadPartes.join(' '), prioridad: 3, metrica: 'datos' })
  }

  // ── Acciones: concretas, con cantidad, frecuencia y fecha ──
  acciones.push(viejo
    ? {
        accion: `Mídete antes del ${fmtFecha(fechas.en_1_semana)}, en ayunas y a la misma hora, y luego cada 7 días hasta el ${fmtFecha(fechas.en_8_semanas)}`,
        porque: 'Con un dato nuevo se recalcula todo el análisis; una medición semanal detecta a tiempo si el peso se mueve en la dirección equivocada.',
      }
    : {
        accion: `Sigue midiéndote cada 7 días, en ayunas y a la misma hora, hasta el ${fmtFecha(fechas.en_8_semanas)}`,
        porque: 'La constancia es lo que permite distinguir un cambio real del ruido normal de la báscula.',
      })
  if (m == null && esc.kg_para_imc_25 > 0) {
    acciones.push({
      accion: `Define tu meta de peso antes del ${fmtFecha(fechas.en_1_semana)}, con fecha y un ritmo de 0.5 kg/semana`,
      porque: 'Una meta con fecha convierte «bajar de peso» en un número semanal que puedes revisar; 0.5 kg/semana equivale a un déficit moderado, de unas 500 kcal al día.',
    })
  } else if (m && m.kg_por_bajar != null && m.kg_por_bajar > 0) {
    acciones.push({
      accion: `Revisa tu avance hacia ${m.peso_kg} kg el ${fmtFecha(fechas.en_4_semanas)}`,
      porque: `Te faltan ${m.kg_por_bajar} kg; compara el resultado con el ritmo que necesitas y ajusta el plan si hace falta.`,
    })
  }
  const planRutina = !!f.plan?.rutina, planDieta = !!f.plan?.dieta
  if (planRutina || planDieta) {
    acciones.push({
      accion: `Cumple tu ${planRutina && planDieta ? 'rutina y tu dieta' : planRutina ? 'rutina' : 'dieta'} durante 4 semanas (hasta el ${fmtFecha(fechas.en_4_semanas)}) y anota cuántos días la sigues por semana`,
      porque: 'Sin ese registro no se sabe si un mal resultado viene del plan o de no seguirlo.',
    })
  } else {
    const prot = f.proteina_g_por_dia_orientativa
    acciones.push({
      accion: `Haz fuerza 3 veces por semana${prot ? ` y apunta a ${prot.minimo}–${prot.maximo} g de proteína al día` : ''} hasta el ${fmtFecha(fechas.en_8_semanas)}`,
      porque: `Protege tu masa magra mientras bajas grasa${prot ? ' (la proteína es una referencia general, no una receta)' : ''}.`,
    })
  }

  // ── Titular: la conclusión más importante, sin repetirla después ──
  let titular: string
  const cerca = sobre != null && sobre <= 1
  if (viejo) {
    titular = sobre != null && sobre > 1 && mejor
      ? `Tu último dato tiene ${dias} días y te ponía ${sobre} kg arriba de tu mejor marca de la etapa (${mejor.valor} kg).`
      : `Tu último dato tiene ${dias} días: sin una medición nueva no se sabe si sigues en la misma dirección.`
  } else if (sobre != null && sobre > 1 && mejor) {
    const ritmo = sem == null ? '' : sem < -0.15 ? ' y vas bajando' : sem > 0.15 ? ' y la tendencia sigue al alza' : ' y tu peso lleva un tiempo estable'
    titular = `Estás ${sobre} kg arriba de tu mejor marca de la etapa (${mejor.valor} kg)${ritmo}.`
  } else if (cerca) {
    titular = 'Estás en o muy cerca de tu mejor marca de la etapa: toca consolidarla.'
  } else {
    titular = 'Tu progreso va en buena dirección.'
  }

  const orden = insights.map((x, i) => ({ x, i })).sort((a, b) => (a.x.prioridad ?? 2) - (b.x.prioridad ?? 2) || a.i - b.i).map(o => o.x)
  const alertas = orden.filter(i => i.tipo === 'alerta').length
  const atencion = orden.filter(i => i.tipo === 'atencion').length
  const estado: PesoAnalisis['estado'] = alertas > 0 ? 'alerta' : atencion > 0 || viejo ? 'mixto' : 'bien'

  return { titular, estado, insights: orden.slice(0, 6), acciones: acciones.slice(0, 3) }
}
