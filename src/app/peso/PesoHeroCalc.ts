// Cálculos puros de la franja de estado (PesoHero). Viven aparte del componente para poder probarlos
// con node sin React: aquí NO hay JSX ni hooks, solo datos -> datos. Todo se deriva de src/lib/peso.ts,
// así los números del hero son los mismos que lee el análisis con IA. La estatura y el sexo vienen del perfil
// (por defecto PERFIL_DEFAULT, lo que valía antes de que existiera): de ellos salen el peso de IMC 25 y los cortes del % de grasa.

import {
  addDays, daysBetween, etapaActual, mejorMarca, pendienteSemanal, classifyIMC, classifyFat,
  type PesoRecord, type PesoPlan, type Classification,
} from '@/lib/peso'
import { PERFIL_DEFAULT, desplazamientoGrasa, pesoParaIMC, pesoSaludable, tallaCuadrada, type PesoPerfil } from '@/lib/peso-perfil'
import { imcEquipo } from '@/lib/peso-visuals'
import type { PesoTab } from './contratos'

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

/** Días sin medirte a partir de los cuales el semáforo pasa a ámbar y aparece "Medirme hoy"
 *  (igual que el recordatorio push diario: DIAS_SIN_PESO en api/push/daily). */
export const DIAS_SIN_MEDIR = 7
export const DIAS_SIN_MEDIR_ROJO = 30

// ── Formato de fechas sin Intl ───────────────────────────────────────────────
// Intl cambia de matices entre Node y cada navegador ("ago" vs "ago."), y eso rompe la hidratación.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** '2026-07-03' -> '3 jul' (con año corto si `conAnio`: '3 jul 26'). */
export function fmtCorta(f: string, conAnio = false) {
  const base = `${+f.slice(8, 10)} ${MESES[+f.slice(5, 7) - 1]}`
  return conAnio ? `${base} ${f.slice(2, 4)}` : base
}
/** '2026-08-01' -> 'sáb 1 ago'. */
export function fmtLarga(f: string) {
  const dow = new Date(Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10))).getUTCDay()
  return `${DIAS[dow]} ${+f.slice(8, 10)} ${MESES[+f.slice(5, 7) - 1]}`
}
/** Días -> 'hoy', 'ayer', 'hace 12 días', 'hace 3 meses'. */
export function textoHace(d: number) {
  if (d <= 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d < 60) return `hace ${d} días`
  // Con d = 60 el cociente da 1: sin singular saldría «hace 1 meses».
  if (d < 730) { const m = Math.floor(d / 30.4); return `hace ${m} ${m === 1 ? 'mes' : 'meses'}` }
  return `hace ${Math.floor(d / 365.25)} años`
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Semaforo = 'ok' | 'warn' | 'bad'
export type Rumbo = 'bajar' | 'subir'

export type Cambio = { fecha: string; dias: number; delta: number }

export type ProgresoMeta = {
  /** 'meta' = la que definió Andrés; 'imc' = sin meta, se usa el peso donde el IMC cruza 25 (o 18.5 si está por debajo). */
  tipo: 'meta' | 'imc'
  objetivoKg: number
  rumbo: Rumbo
  alcanzada: boolean
  restanteKg: number
  /** Punto de partida del anillo: el peso más alto (o más bajo, si va a subir) de la etapa actual. */
  inicioKg: number
  /** 0..1 */
  pct: number
  fechaMeta: string | null
  diasParaMeta: number | null
  /** kg/semana (positivo) que necesita para llegar a tiempo; null sin fecha futura o con la meta cumplida. */
  ritmoNecesario: number | null
}

export type Veredicto = 'mejora' | 'empeora' | 'estable' | 'neutral'
export type Tendencia = { slope: number | null; n: number; veredicto: Veredicto | null }

export type Paso = {
  icono: string
  titulo: string
  detalle: string
  tono: 'ok' | 'warn' | 'bad' | 'info'
  accion: { tipo: 'medir' } | { tipo: 'tab'; tab: PesoTab; label: string } | null
}

export type HeroCalc = {
  ultima: PesoRecord
  conPeso: PesoRecord
  peso: number
  imc: number
  imcCls: Classification
  grasa: { valor: number; cls: Classification } | null
  diasSin: number
  semaforo: Semaforo
  anterior: Cambio | null
  hace30: Cambio | null
  meta: ProgresoMeta
  tendencia: Tendencia
  etapa: { desde: string; n: number; puntos: { fecha: string; peso: number }[] }
  /** Mejor peso de la etapa (el mínimo, o el máximo si el rumbo es subir) y qué tan lejos está hoy. */
  mejor: { valor: number; fecha: string; lejos: number } | null
  /** Mínimo histórico, solo si es mejor que el de la etapa (otra etapa de la vida). */
  historico: { valor: number; fecha: string } | null
  proxima: string
  paso: Paso
  /** Rango de peso con IMC normal (18.5 a 24.9) para la estatura del perfil, más el peso de IMC 25. */
  saludable: { min: number; max: number; imc25: number }
}

// ── Cálculo ──────────────────────────────────────────────────────────────────

function cambioContra(ref: PesoRecord | undefined, actual: PesoRecord): Cambio | null {
  if (!ref || ref.peso == null || actual.peso == null) return null
  const dias = daysBetween(ref.fecha, actual.fecha)
  // Más de un año atrás es otra etapa (otro cuerpo, otra vida): comparar contra eso solo confunde.
  if (dias > 365) return null
  return { fecha: ref.fecha, dias, delta: r1(actual.peso - ref.peso) }
}

/** La medición con peso más cercana a "hace 30 días" (±14), anterior a la actual. En empate, la más
 *  antigua: así el lapso real nunca es menor a lo que se anuncia. */
function haceUnMes(rows: PesoRecord[], actual: PesoRecord): PesoRecord | undefined {
  const objetivo = addDays(actual.fecha, -30)
  let mejor: PesoRecord | undefined
  let mejorDist = Infinity
  for (const r of rows) {
    if (r.peso == null || r.fecha >= actual.fecha) continue
    const dist = Math.abs(daysBetween(r.fecha, objetivo))
    if (dist <= 14 && dist < mejorDist) { mejor = r; mejorDist = dist }
  }
  return mejor
}

function calcularMeta(peso: number, plan: PesoPlan | null, pesosEtapa: number[], hoy: string, perfil: PesoPerfil): ProgresoMeta {
  const maxE = Math.max(peso, ...pesosEtapa)
  const minE = Math.min(peso, ...pesosEtapa)
  const metaKg = plan?.meta_peso ?? null
  const fechaMeta = metaKg != null ? plan?.meta_fecha ?? null : null
  const diasParaMeta = fechaMeta ? daysBetween(hoy, fechaMeta) : null

  let tipo: ProgresoMeta['tipo']
  let objetivoKg: number
  let rumbo: Rumbo
  let alcanzada = false

  if (metaKg != null) {
    tipo = 'meta'
    objetivoKg = metaKg
    if (Math.abs(peso - metaKg) <= 0.05) { alcanzada = true; rumbo = maxE > metaKg + 0.05 ? 'bajar' : 'subir' }
    else if (peso > metaKg) rumbo = 'bajar'
    // Por debajo de la meta: si en esta etapa estuvo por encima, venía bajando y ya la pasó; si no, quiere subir.
    else if (maxE > metaKg + 0.05) { rumbo = 'bajar'; alcanzada = true }
    else rumbo = 'subir'
  } else {
    tipo = 'imc'
    const kgImc185 = pesoParaIMC(perfil, 18.5)
    const kgImc25 = pesoParaIMC(perfil, 25)
    const bajoPeso = peso < kgImc185
    if (bajoPeso) { objetivoKg = r1(kgImc185); rumbo = 'subir' }
    else { objetivoKg = r1(kgImc25); rumbo = 'bajar'; alcanzada = peso <= kgImc25 }
  }

  const inicioKg = rumbo === 'bajar' ? maxE : minE
  const restanteKg = alcanzada ? 0 : r1(Math.abs(peso - objetivoKg))
  let pct = 1
  if (!alcanzada) {
    const tramo = Math.abs(inicioKg - objetivoKg)
    pct = tramo > 0 ? Math.min(1, Math.max(0, Math.abs(inicioKg - peso) / tramo)) : 0
  }
  const ritmoNecesario = !alcanzada && diasParaMeta != null && diasParaMeta > 0 ? r2(restanteKg / (diasParaMeta / 7)) : null
  return { tipo, objetivoKg, rumbo, alcanzada, restanteKg, inicioKg, pct, fechaMeta, diasParaMeta, ritmoNecesario }
}

function calcularTendencia(rows: PesoRecord[], ultima: PesoRecord, meta: ProgresoMeta): Tendencia {
  const desde = addDays(ultima.fecha, -90)
  const slope = pendienteSemanal(rows, r => r.peso, desde, ultima.fecha)
  const n = rows.filter(r => r.peso != null && r.fecha >= desde).length
  if (slope == null) return { slope: null, n, veredicto: null }
  if (Math.abs(slope) < 0.1) return { slope, n, veredicto: 'estable' }
  // Con la meta ya cumplida no hay "buena" ni "mala" dirección: solo se informa.
  if (meta.alcanzada) return { slope, n, veredicto: 'neutral' }
  const bien = meta.rumbo === 'bajar' ? slope < 0 : slope > 0
  return { slope, n, veredicto: bien ? 'mejora' : 'empeora' }
}

function elegirPaso(c: {
  diasSin: number; ultima: PesoRecord; meta: ProgresoMeta; plan: PesoPlan | null; tendencia: Tendencia; proxima: string; hoy: string
}): Paso {
  const { diasSin, ultima, meta, plan, tendencia, proxima, hoy } = c
  const medir = { tipo: 'medir' } as const
  const conAnio = ultima.fecha.slice(0, 4) !== hoy.slice(0, 4)

  if (diasSin >= DIAS_SIN_MEDIR_ROJO) {
    return {
      icono: '⏰', tono: 'bad', accion: medir, titulo: 'Retoma tu registro',
      detalle: `Llevas ${diasSin} días sin medirte (última: ${fmtCorta(ultima.fecha, conAnio)}). Una medición hoy, en ayunas, deja todo al día.`,
    }
  }
  if (diasSin >= DIAS_SIN_MEDIR) {
    return {
      icono: '⚖️', tono: 'warn', accion: medir, titulo: 'Toca medirte',
      detalle: `Tu última medición fue ${textoHace(diasSin)}. Mídete esta semana, en ayunas y a la misma hora, para comparar datos limpios.`,
    }
  }
  if (meta.alcanzada) {
    return {
      icono: '🏁', tono: 'ok', titulo: meta.tipo === 'meta' ? '¡Meta alcanzada!' : 'Tu IMC está en rango saludable',
      detalle: 'Ahora toca mantener: sigue midiéndote cada semana' + (meta.tipo === 'meta' ? ' y define una nueva meta si quieres ir por más.' : '.'),
      accion: meta.tipo === 'meta' ? { tipo: 'tab', tab: 'resumen', label: 'Ajustar meta' } : null,
    }
  }
  if (plan?.meta_peso == null && meta.rumbo === 'bajar') {
    return {
      icono: '🎯', tono: 'info', titulo: 'Ponte una meta con fecha',
      detalle: `Para llegar a IMC 25 (${meta.objetivoKg} kg) te faltan ${meta.restanteKg} kg. Con una fecha, la app calcula el ritmo que necesitas.`,
      accion: { tipo: 'tab', tab: 'resumen', label: 'Definir meta' },
    }
  }
  if (meta.fechaMeta && meta.diasParaMeta != null && meta.diasParaMeta <= 0) {
    return {
      icono: '📅', tono: 'warn', titulo: 'Tu fecha meta ya pasó',
      detalle: `Aún te faltan ${meta.restanteKg} kg. Mueve la fecha a una realista (0.25–0.75 kg/semana es sostenible) o ajusta la meta.`,
      accion: { tipo: 'tab', tab: 'resumen', label: 'Ajustar meta' },
    }
  }
  if (meta.rumbo === 'bajar' && meta.ritmoNecesario != null && meta.ritmoNecesario > 1 && meta.fechaMeta) {
    return {
      icono: '⚡', tono: 'warn', titulo: 'Tu fecha pide un ritmo exigente',
      detalle: `Para llegar el ${fmtCorta(meta.fechaMeta, meta.fechaMeta.slice(0, 4) !== hoy.slice(0, 4))} necesitas bajar ${meta.ritmoNecesario} kg por semana; lo sostenible es 0.25–0.75. Considera mover la fecha.`,
      accion: { tipo: 'tab', tab: 'resumen', label: 'Ajustar meta' },
    }
  }
  if (tendencia.veredicto === 'empeora' && tendencia.slope != null) {
    return {
      icono: '⚠️', tono: 'warn', titulo: 'Tu tendencia va contra tu objetivo',
      detalle: `En los últimos 90 días tu peso ${tendencia.slope > 0 ? 'sube' : 'baja'} ${Math.abs(tendencia.slope).toFixed(2)} kg por semana. Revisa tu rutina y tu dieta, y mantén la medición semanal.`,
      accion: { tipo: 'tab', tab: 'planes', label: 'Ver mi plan' },
    }
  }
  if (tendencia.veredicto === 'mejora' && tendencia.slope != null) {
    const ritmo = meta.ritmoNecesario != null ? ` Para tu fecha necesitas ${meta.ritmoNecesario} kg/semana.` : ''
    return {
      icono: '✅', tono: 'ok', titulo: 'Vas en la dirección correcta',
      detalle: `Tu peso ${tendencia.slope > 0 ? 'sube' : 'baja'} ${Math.abs(tendencia.slope).toFixed(2)} kg por semana en 90 días.${ritmo} Próxima medición sugerida: ${fmtLarga(proxima)}.`,
      accion: { tipo: 'tab', tab: 'progreso', label: 'Ver progreso' },
    }
  }
  return {
    icono: '📅', tono: 'info', titulo: 'Sigue midiéndote cada semana',
    detalle: tendencia.slope == null
      ? `Con 3 mediciones en 90 días aparece tu tendencia (llevas ${tendencia.n}). Próxima medición sugerida: ${fmtLarga(proxima)}.`
      : `Tu peso está estable en los últimos 90 días. Próxima medición sugerida: ${fmtLarga(proxima)}.`,
    accion: { tipo: 'tab', tab: 'progreso', label: 'Ver progreso' },
  }
}

/** Todo lo que pinta la franja de estado. `hoy` es 'YYYY-MM-DD' (hoyMX()). null si no hay ningún peso.
 *  `perfil` aporta la estatura (IMC y peso objetivo) y el sexo (umbrales del % de grasa). */
export function calcularHero(data: PesoRecord[], plan: PesoPlan | null, hoy: string, perfil: PesoPerfil = PERFIL_DEFAULT): HeroCalc | null {
  const rows = [...data].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ultima = rows[rows.length - 1]
  let conPeso: PesoRecord | undefined
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].peso != null) { conPeso = rows[i]; break }
  if (!ultima || !conPeso) return null
  const peso = conPeso.peso as number

  const diasSin = Math.max(0, daysBetween(ultima.fecha, hoy))
  // Mismos umbrales (>=) que elegirPaso y el push diario: con 7 días ya toca medirse (ámbar), con 30 ya es rojo.
  const semaforo: Semaforo = diasSin < DIAS_SIN_MEDIR ? 'ok' : diasSin < DIAS_SIN_MEDIR_ROJO ? 'warn' : 'bad'

  const idx = rows.indexOf(conPeso)
  let previa: PesoRecord | undefined
  for (let i = idx - 1; i >= 0; i--) if (rows[i].peso != null) { previa = rows[i]; break }
  const anterior = cambioContra(previa, conPeso)
  const ref30 = haceUnMes(rows, conPeso)
  // Si el punto de hace ~30 días es la misma medición anterior, la segunda línea solo repetiría la primera.
  const hace30 = ref30 && ref30 !== previa ? cambioContra(ref30, conPeso) : null

  const etapaRows = etapaActual(rows)
  const puntos = etapaRows.filter(r => r.peso != null).map(r => ({ fecha: r.fecha, peso: r.peso as number }))
  const meta = calcularMeta(peso, plan, puntos.map(p => p.peso), hoy, perfil)
  const tendencia = calcularTendencia(rows, ultima, meta)

  const mejorReg = mejorMarca(etapaRows, 'peso', meta.rumbo === 'subir' ? 'max' : 'min')
  const mejor = mejorReg ? { valor: mejorReg.valor, fecha: mejorReg.fecha, lejos: r1(Math.abs(peso - mejorReg.valor)) } : null
  const hist = mejorMarca(rows, 'peso')
  const historico = meta.rumbo === 'bajar' && hist && mejorReg && hist.valor < mejorReg.valor && etapaRows.length < rows.length ? hist : null

  // El IMC de la báscula solo vale si la estatura del perfil es la que ella tenía (ver imcEquipo); si no, se recalcula.
  const imc = imcEquipo(conPeso, perfil) ?? r1(peso / tallaCuadrada(perfil))
  const grasa = conPeso.pct_grasa != null ? { valor: conPeso.pct_grasa, cls: classifyFat(conPeso.pct_grasa, desplazamientoGrasa(perfil)) } : null
  const proxima = addDays(ultima.fecha, 7) > hoy ? addDays(ultima.fecha, 7) : hoy

  return {
    ultima, conPeso, peso, imc, imcCls: classifyIMC(imc), grasa, diasSin, semaforo, anterior, hace30, meta, tendencia,
    etapa: { desde: etapaRows[0].fecha, n: etapaRows.length, puntos },
    mejor, historico, proxima,
    paso: elegirPaso({ diasSin, ultima, meta, plan, tendencia, proxima, hoy }),
    saludable: pesoSaludable(perfil),
  }
}
