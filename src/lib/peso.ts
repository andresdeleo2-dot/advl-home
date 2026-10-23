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

/** Huella de los datos que alimentan el análisis: si cambia (medición nueva, editada o borrada, o la
 *  meta), el análisis guardado ya no corresponde y se vuelve a generar. Hash djb2 (puro JS). */
export function firmaDatos(rows: PesoRecord[], plan: PesoPlan | null) {
  const s = JSON.stringify([
    rows.map(r => [r.id, r.fecha, r.peso, r.pct_grasa, r.pct_musculo, r.imc, r.rmr, r.edad_corporal, r.grasa_visceral]),
    plan ? [plan.meta_peso, plan.meta_fecha, plan.meta_grasa] : null,
  ])
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `${rows.length}-${(h >>> 0).toString(36)}`
}

// ── Hechos para el análisis ─────────────────────────────────────────────────
// Todo lo numérico se calcula aquí, en código. La IA sólo interpreta: los modelos de lenguaje
// fallan en aritmética, así que nunca se les pide restar, promediar ni proyectar.

const VENTANAS = [30, 90, 180, 365] as const

export function buildFacts(rows: PesoRecord[], plan: PesoPlan | null, hoy: string) {
  const sorted = [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ultima = sorted[sorted.length - 1]
  const primera = sorted[0]
  const etapa = etapaActual(sorted)

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

  // Su mejor racha de bajada dentro de la etapa actual (mínimo 4 semanas): sirve de vara para el ritmo
  // realista y para ver con qué frecuencia se medía mientras funcionaba.
  let racha: { de: string; a: string; dias: number; peso_kg: number; kg_por_semana: number; mediciones_en_la_racha: number; medido_cada_dias: number } | null = null
  for (let i = 0; i < etapa.length; i++) {
    for (let j = i + 1; j < etapa.length; j++) {
      const pi = etapa[i].peso, pj = etapa[j].peso
      const dias = daysBetween(etapa[i].fecha, etapa[j].fecha)
      if (pi == null || pj == null || dias < 28) continue
      const baja = pi - pj
      if (baja >= 2 && (!racha || baja > -racha.peso_kg)) {
        const n = etapa.filter(r => r.fecha >= etapa[i].fecha && r.fecha <= etapa[j].fecha).length
        racha = { de: etapa[i].fecha, a: etapa[j].fecha, dias, peso_kg: r1(-baja), kg_por_semana: r2(-baja / (dias / 7)), mediciones_en_la_racha: n, medido_cada_dias: r1(dias / Math.max(1, n - 1)) }
      }
    }
  }

  // Cadencia de medición en el último año.
  const ultimoAnio = sorted.filter(r => r.fecha >= addDays(ultima.fecha, -365))
  const intervalos = ultimoAnio.slice(1).map((r, i) => daysBetween(ultimoAnio[i].fecha, r.fecha)).sort((a, b) => a - b)
  const medianaIntervalo = intervalos.length ? intervalos[Math.floor(intervalos.length / 2)] : null

  // Escenarios para llegar a un peso saludable, conservando la masa magra actual.
  const magra = masaMagra(ultima)
  const peso = ultima.peso
  const aPerder = peso != null ? r1(peso - PESO_IMC_25) : null
  const semanasA = (kg: number, ritmo: number) => Math.ceil(kg / ritmo)
  const escenarios = {
    peso_imc_25_kg: r1(PESO_IMC_25),
    kg_para_imc_25: aPerder != null && aPerder > 0 ? aPerder : 0,
    semanas_a_0_25_kg_sem: aPerder != null && aPerder > 0 ? semanasA(aPerder, 0.25) : null,
    semanas_a_0_5_kg_sem: aPerder != null && aPerder > 0 ? semanasA(aPerder, 0.5) : null,
    semanas_a_0_75_kg_sem: aPerder != null && aPerder > 0 ? semanasA(aPerder, 0.75) : null,
    peso_con_20_pct_grasa_kg: magra != null ? r1(magra / 0.8) : null,
    peso_con_25_pct_grasa_kg: magra != null ? r1(magra / 0.75) : null,
  }

  // Meta definida por Andrés, si existe.
  let meta: Record<string, unknown> | null = null
  if (plan && (plan.meta_peso != null || plan.meta_grasa != null || plan.meta_fecha)) {
    const kgRestantes = plan.meta_peso != null && peso != null ? r1(peso - plan.meta_peso) : null
    const diasRestantes = plan.meta_fecha ? daysBetween(hoy, plan.meta_fecha) : null
    meta = {
      peso_kg: plan.meta_peso, fecha: plan.meta_fecha, grasa_pct: plan.meta_grasa,
      kg_por_bajar: kgRestantes, dias_restantes: diasRestantes,
      ritmo_necesario_kg_sem: kgRestantes != null && diasRestantes != null && diasRestantes > 0 ? r2(kgRestantes / (diasRestantes / 7)) : null,
    }
  }

  const recortar = (s: string | null) => (s && s.trim() ? s.trim().slice(0, 1200) : null)

  return {
    hoy,
    perfil: { sexo: 'hombre', talla_m: HEIGHT_M, rango_edad: '30-40 años' },
    n_mediciones: sorted.length,
    primera_medicion: primera.fecha,
    ultima_medicion: ultima.fecha,
    dias_desde_ultima_medicion: daysBetween(ultima.fecha, hoy),
    mediana_dias_entre_mediciones_ultimo_anio: medianaIntervalo,
    clasificacion_actual: {
      imc: ultima.imc != null ? classifyIMC(ultima.imc).label : null,
      grasa: ultima.pct_grasa != null ? classifyFat(ultima.pct_grasa).label : null,
      musculo: ultima.pct_musculo != null ? classifyMuscle(ultima.pct_musculo).label : null,
      grasa_visceral: ultima.grasa_visceral != null ? classifyVisceral(ultima.grasa_visceral).label : null,
    },
    tendencia_kg_por_semana: { ultimos_90_dias: pend(90, r => r.peso), ultimos_180_dias: pend(180, r => r.peso), ultimo_anio: pend(365, r => r.peso) },
    cambios_hasta_la_ultima_medicion: cambios,
    etapa_actual_desde: etapa[0].fecha,   // el registro se retomó tras un hueco de más de un año; lo anterior es otra etapa
    mejores_marcas: {
      peso_minimo_etapa_actual: mejorMarca(etapa, 'peso'),
      grasa_minima_etapa_actual: mejorMarca(etapa, 'pct_grasa'),
      visceral_minima_etapa_actual: mejorMarca(etapa, 'grasa_visceral'),
      kg_sobre_el_mejor_peso_de_la_etapa: peso != null && mejorMarca(etapa, 'peso') ? r1(peso - mejorMarca(etapa, 'peso')!.valor) : null,
      peso_minimo_historico: mejorMarca(sorted, 'peso'),
    },
    mejor_racha_de_bajada: racha,
    huecos_largos_sin_medir: huecos,
    saltos_sospechosos_de_ruido_bioimpedancia: saltosSospechosos,
    escenarios,
    gasto_energetico_estimado_kcal: ultima.rmr && ultima.rmr < 5000
      ? { rmr: ultima.rmr, sedentario: Math.round(ultima.rmr * 1.2), actividad_ligera: Math.round(ultima.rmr * 1.375), actividad_moderada: Math.round(ultima.rmr * 1.55), nota: 'estimación orientativa; un déficit de 500 kcal/día equivale a ~0.45 kg/semana' }
      : null,
    meta,
    plan: plan ? { rutina: recortar(plan.rutina), dieta: recortar(plan.dieta), notas: recortar(plan.notas) } : null,
    mediciones: sorted.slice(-80).map(compacta),   // todo el historial reciente; 80 sobran para años de datos
  }
}

export type PesoFacts = ReturnType<typeof buildFacts>

// ── Resultado del análisis ──────────────────────────────────────────────────

export type InsightTipo = 'positivo' | 'atencion' | 'alerta' | 'dato'
export type PesoInsight = { tipo: InsightTipo; titulo: string; detalle: string }
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

/** Valida lo que devolvió el modelo: nunca se pinta algo con otra forma ni con textos kilométricos. */
export function normalizarAnalisis(raw: unknown): PesoAnalisis | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const titular = clip(o.titular, 220)
  const insights = (Array.isArray(o.insights) ? o.insights : []).flatMap((x): PesoInsight[] => {
    if (!x || typeof x !== 'object') return []
    const i = x as Record<string, unknown>
    const titulo = clip(i.titulo, 90), detalle = clip(i.detalle, 520)
    if (!titulo || !detalle) return []
    return [{ tipo: TIPOS.includes(i.tipo as InsightTipo) ? (i.tipo as InsightTipo) : 'dato', titulo, detalle }]
  }).slice(0, 7)
  const acciones = (Array.isArray(o.acciones) ? o.acciones : []).flatMap((x): PesoAccion[] => {
    if (!x || typeof x !== 'object') return []
    const a = x as Record<string, unknown>
    const accion = clip(a.accion, 160), porque = clip(a.porque, 260)
    return accion ? [{ accion, porque }] : []
  }).slice(0, 4)
  if (!titular || insights.length === 0) return null
  const estado = o.estado === 'bien' || o.estado === 'alerta' ? o.estado : 'mixto'
  return { titular, estado, insights, acciones }
}

// ── Plan B: lectura por reglas ──────────────────────────────────────────────
// Si Gemini no responde (cuota, 503, sin llave), la sección no queda vacía: estas reglas dicen lo
// esencial con los mismos números. Menos matiz, pero siempre algo útil.

export function analisisPorReglas(f: PesoFacts): PesoAnalisis {
  const insights: PesoInsight[] = []
  const acciones: PesoAccion[] = []
  const ult = f.mediciones[f.mediciones.length - 1]
  const c365 = f.cambios_hasta_la_ultima_medicion.find(c => c.ventana_dias === 365)
  const c90 = f.cambios_hasta_la_ultima_medicion.find(c => c.ventana_dias === 90)
  const sem = f.tendencia_kg_por_semana.ultimos_90_dias
  const signo = (n: number) => `${n > 0 ? '+' : ''}${n}`

  if (f.dias_desde_ultima_medicion >= 21) {
    insights.push({
      tipo: f.dias_desde_ultima_medicion >= 45 ? 'alerta' : 'atencion',
      titulo: `Llevas ${f.dias_desde_ultima_medicion} días sin medirte`,
      detalle: `Tu última medición fue el ${fmtFecha(f.ultima_medicion)}. Sin datos recientes no se puede saber si el plan funciona; lo ideal es medirte cada semana, a la misma hora y en las mismas condiciones.`,
    })
    acciones.push({ accion: 'Mídete esta semana, en ayunas', porque: 'Con un dato nuevo el análisis puede decirte hacia dónde vas en lugar de adivinar.' })
  }

  if (c365 && c365.masa_grasa_kg != null && c365.masa_magra_kg != null) {
    const sube = c365.peso_kg != null && c365.peso_kg > 0
    insights.push({
      tipo: c365.masa_grasa_kg > 0 && c365.masa_magra_kg <= 0 ? 'alerta' : c365.masa_grasa_kg > 0 ? 'atencion' : 'positivo',
      titulo: 'Qué cambió en tu composición este año',
      detalle: `Desde el ${fmtFecha(c365.desde)}: peso ${signo(c365.peso_kg ?? 0)} kg, masa grasa ${signo(c365.masa_grasa_kg)} kg y masa magra ${signo(c365.masa_magra_kg)} kg.${sube && c365.masa_magra_kg > 0 ? ' Parte de lo que subiste es masa magra, no sólo grasa.' : ''}`,
    })
  }

  if (sem != null) {
    insights.push({
      tipo: sem > 0.15 ? 'atencion' : sem < -0.15 ? 'positivo' : 'dato',
      titulo: 'Ritmo de los últimos 90 días',
      detalle: Math.abs(sem) <= 0.15
        ? `Tu peso está prácticamente estable (${signo(sem)} kg/semana).`
        : `Tu peso va ${sem > 0 ? 'subiendo' : 'bajando'} a ${signo(sem)} kg por semana. ${f.escenarios.kg_para_imc_25 > 0 && sem < 0 ? `A ese ritmo te faltarían unas ${Math.ceil(f.escenarios.kg_para_imc_25 / Math.abs(sem))} semanas para IMC 25.` : ''}`,
    })
  } else if (c90 && c90.peso_kg != null) {
    insights.push({ tipo: 'dato', titulo: 'Cambio de los últimos 90 días', detalle: `${signo(c90.peso_kg)} kg entre el ${fmtFecha(c90.desde)} y el ${fmtFecha(f.ultima_medicion)}.` })
  }

  const racha = f.mejor_racha_de_bajada
  if (racha) {
    insights.push({
      tipo: 'positivo', titulo: 'Ya demostraste que puedes bajar',
      detalle: `Entre el ${fmtFecha(racha.de)} y el ${fmtFecha(racha.a)} bajaste ${Math.abs(racha.peso_kg)} kg (${Math.abs(racha.kg_por_semana)} kg/semana) y te medías cada ${Math.round(racha.medido_cada_dias)} días en promedio.`,
    })
  }

  const mejor = f.mejores_marcas.peso_minimo_etapa_actual
  const sobre = f.mejores_marcas.kg_sobre_el_mejor_peso_de_la_etapa
  if (mejor && sobre != null && sobre > 1) {
    insights.push({
      tipo: 'dato', titulo: 'Tu mejor marca reciente sigue al alcance',
      detalle: `Desde que retomaste el registro (${fmtFecha(f.etapa_actual_desde)}), tu peso más bajo fue ${mejor.valor} kg el ${fmtFecha(mejor.fecha)}; hoy estás ${sobre} kg arriba.`,
    })
  }

  if (ult.grasa_visceral != null && ult.grasa_visceral >= 10) {
    insights.push({
      tipo: 'atencion', titulo: `Grasa visceral en ${ult.grasa_visceral} (${f.clasificacion_actual.grasa_visceral?.toLowerCase()})`,
      detalle: 'Es la métrica más ligada al riesgo metabólico. Baja con déficit calórico sostenido, menos alcohol y más actividad diaria.',
    })
  }

  if (f.meta == null && f.escenarios.kg_para_imc_25 > 0) {
    acciones.push({
      accion: `Define una meta: ${f.escenarios.peso_imc_25_kg} kg es el peso donde tu IMC baja de 25`,
      porque: `Son ${f.escenarios.kg_para_imc_25} kg; a 0.5 kg/semana serían unas ${f.escenarios.semanas_a_0_5_kg_sem} semanas.`,
    })
  }
  acciones.push({ accion: 'Fuerza 3–4 veces por semana y proteína suficiente', porque: 'Para bajar grasa sin perder músculo.' })

  const alertas = insights.filter(i => i.tipo === 'alerta').length
  const atencion = insights.filter(i => i.tipo === 'atencion').length
  const estado: PesoAnalisis['estado'] = alertas > 0 ? 'alerta' : atencion > 1 ? 'mixto' : atencion === 1 ? 'mixto' : 'bien'
  const titular = f.dias_desde_ultima_medicion >= 45
    ? `Hace ${f.dias_desde_ultima_medicion} días que no te mides: sin datos nuevos es difícil saber cómo vas.`
    : estado === 'bien' ? 'Tu progreso va en buena dirección.' : 'Hay puntos que vale la pena atender en tu progreso.'

  return { titular, estado, insights: insights.slice(0, 6), acciones: acciones.slice(0, 3) }
}
