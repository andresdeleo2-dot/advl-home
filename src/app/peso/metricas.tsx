'use client'

// Métricas de /peso: definiciones (qué mide, cómo leer, referencias OMS), tablas de referencia, helpers de
// gráfica y los cálculos puros que comparten las secciones (Tiles, Meta, Progreso, Historial).
// Los umbrales y clasificaciones viven en '@/lib/peso' (los lee también la ruta de IA): aquí NO se duplican.
// Todo lo que no es JSX es una función pura y exportada para poder probarla con datos reales.
// La estatura y el sexo NO están escritos aquí: vienen del perfil (src/lib/peso-perfil.ts). Lo que depende de ellos
// (kg equivalentes a cada IMC, umbrales de % de grasa y de % de músculo) se arma por perfil con metricasPara(perfil) /
// useMetricas(); las funciones puras reciben el perfil como último parámetro y, sin él, usan PERFIL_DEFAULT (lo que valía antes).

import { useSyncExternalStore, type CSSProperties } from 'react'
import {
  addDays, daysBetween, etapaActual, hoyMX, masaGrasa, masaMagra, pendienteSemanal,
  classifyIMC, classifyFat, classifyMuscle, classifyVisceral,
  type Classification, type Level, type PesoRecord,
} from '@/lib/peso'
import { PERFIL_DEFAULT, PROTEINA_G_KG, desplazamientoGrasa, desplazamientoMusculo, edadEn, pesoParaIMC, tallaCuadrada, type PesoPerfil } from '@/lib/peso-perfil'
import { COLOR } from './ui'
import { usePerfil } from './perfil-context'

// ── Formato ──────────────────────────────────────────────────────────────────

export const MINUS = '−'   // el signo menos real (más legible que el guion) en deltas

/** Número sin ".0" sobrante: 91 -> "91", 91.3 -> "91.3". */
export function fmtNum(v: number, dec = 1) {
  return Number.isInteger(v) ? String(v) : v.toFixed(dec)
}

/** Delta con signo explícito. Si al redondear queda en cero devuelve "0" (nunca "-0.0"). */
export function fmtSigned(v: number, dec = 1) {
  const f = 10 ** dec
  const abs = Math.round(Math.abs(v) * f) / f   // redondeo simétrico: -0.05 y +0.05 dan la misma magnitud
  if (abs === 0) return '0'
  return `${v > 0 ? '+' : MINUS}${Number.isInteger(abs) ? String(abs) : abs.toFixed(dec)}`
}

export type Tono = 'bueno' | 'malo' | 'neutro'
// Verdes y rojos oscuros: los tonos "vivos" de las clasificaciones (#22c55e…) no llegan a 4.5:1 como texto sobre blanco.
export const TONO_COLOR: Record<Tono, string> = { bueno: '#15803d', malo: '#b91c1c', neutro: COLOR.muted }

/** ¿El cambio es bueno, malo o neutro? Cambios menores a `umbral` (ruido de la báscula) cuentan como neutros. */
export function tonoDelta(delta: number | null, goodDir: 'up' | 'down' | 'neutral', umbral = 0.05): Tono {
  if (delta == null || goodDir === 'neutral' || Math.abs(delta) < umbral) return 'neutro'
  return (goodDir === 'down' ? delta < 0 : delta > 0) ? 'bueno' : 'malo'
}

export const flecha = (delta: number, umbral = 0.05) => (Math.abs(delta) < umbral ? '→' : delta > 0 ? '↑' : '↓')

// ── Paleta de DATO ───────────────────────────────────────────────────────────
// Color de cada serie de dato (gráfica, tarjetas, barras, leyendas, tabla). Una sola fuente: PesoTiles, PesoProgreso,
// PesoVisuales y PesoHistorial la importan, sin hex propios. Familias: azul = peso; dorado = grasa (masa grasa y
// % grasa); teal = músculo (masa magra y % músculo). El rojo y el verde NO están aquí a propósito: quedan reservados
// al semáforo bueno/malo (deltas, clasificaciones, Mejor/Peor), para que una línea o una barra roja nunca se lea
// como «esto va mal» solo por ser la serie de grasa.
export const DATO_COLOR = {
  peso: '#2d6cdf',
  masa_grasa: COLOR.gold,      // #C2933A
  masa_magra: '#0F8B8D',
  pct_grasa: '#A87A2C',        // dorado oscuro: misma familia que la masa grasa
  pct_musculo: '#0B6B6D',      // teal oscuro: misma familia que la masa magra
} as const

const TEXTO_OSCURO: Record<string, string> = {
  '#22c55e': '#15803d', '#16a34a': '#15803d', '#84cc16': '#4d7c0f', '#f59e0b': '#b45309', '#d97706': '#b45309',
  '#ef4444': '#b91c1c', '#dc2626': '#b91c1c', '#2d6cdf': '#1d4ed8', '#f97316': '#c2410c', '#8b5cf6': '#6d28d9', '#06b6d4': '#0e7490',
  // Paleta de dato: los dorados (2.8:1 y 3.8:1 en blanco) y el teal claro (4.1:1) no alcanzan 4.5:1 como texto;
  // #0B6B6D ya lo cumple (6.3:1) y no necesita versión aparte.
  '#c2933a': COLOR.goldText, '#a87a2c': COLOR.goldText, '#0f8b8d': '#0b6b6d',
}
/** Versión de un color de gráfica/clasificación apta para TEXTO sobre blanco (contraste ≥ 4.5:1). */
export const colorTexto = (hex: string) => TEXTO_OSCURO[hex.toLowerCase()] ?? hex
export const NIVEL_COLOR: Record<Level, string> = { good: '#15803d', warn: '#b45309', alert: '#b91c1c' }

/** Estilo de las etiquetas de formulario (versalitas chicas), compartido por Meta y Notas del plan. */
export const LABEL_STYLE: CSSProperties = { font: '700 11px/1.2 var(--font-ui, system-ui)', letterSpacing: '.09em', textTransform: 'uppercase', color: COLOR.muted }
/** Anillo de foco visible para los botones propios (los de BTN/Segmented usan el del navegador). */
export const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A6420]'

/** Fecha de hoy en CDMX, o null en el render del servidor y durante la hidratación (así no hay desajuste SSR/cliente). */
const sinSuscripcion = () => () => {}
export function useHoy(): string | null {
  return useSyncExternalStore<string | null>(sinSuscripcion, hoyMX, () => null)
}

/** ¿La persona pidió menos movimiento en su sistema? false en el servidor y durante la hidratación (misma salida en
 *  ambos, sin desajuste); ya montado lee la preferencia real y reacciona si la cambia. Para lo que CSS no alcanza
 *  (p. ej. la animación de trazo de Recharts); lo demás lo cubre el @media de globals.css. */
const MOVIMIENTO_REDUCIDO = '(prefers-reduced-motion: reduce)'
const hayMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
function suscribirMovimiento(avisar: () => void) {
  if (!hayMatchMedia()) return () => {}
  const mq = window.matchMedia(MOVIMIENTO_REDUCIDO)
  mq.addEventListener('change', avisar)
  return () => mq.removeEventListener('change', avisar)
}
export function useReducirMovimiento(): boolean {
  return useSyncExternalStore(
    suscribirMovimiento,
    () => hayMatchMedia() && window.matchMedia(MOVIMIENTO_REDUCIDO).matches,
    () => false,
  )
}

// ── Fechas ───────────────────────────────────────────────────────────────────

export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export const utcT = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))

/** "23 jul 2026" */
export function fmtFechaCorta(iso: string) {
  return `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`
}
/** "jueves 23 de julio de 2026" */
export function fmtFechaLarga(iso: string) {
  const d = new Date(utcT(iso))
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_LARGO[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

// Diferencia de calendario exacta (años/meses/días) de la fecha `a` (más antigua) a `b`.
export function diffYMD(a: string, b: string) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  let years = by - ay
  let months = bm - am
  let days = bd - ad
  if (days < 0) {
    months -= 1
    days += new Date(Date.UTC(by, bm - 1, 0)).getUTCDate()   // días del mes anterior a `b` (UTC: no depende de la zona del navegador)
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  return { years, months, days }
}

/** Intervalo legible y exacto entre dos fechas 'YYYY-MM-DD': "5 d", "2 sem 6 d", "3 meses 16 d". */
export function fmtGap(a: string, b: string) {
  const total = daysBetween(a, b)
  if (total <= 0) return 'mismo día'
  if (total < 7) return `${total} d`
  if (total < 30) {
    const w = Math.floor(total / 7), d = total % 7
    return d ? `${w} sem ${d} d` : `${w} sem`
  }
  const { years, months, days } = diffYMD(a, b)
  const parts: string[] = []
  if (years) parts.push(`${years} año${years > 1 ? 's' : ''}`)
  if (months) parts.push(`${months} mes${months > 1 ? 'es' : ''}`)
  if (days) parts.push(`${days} d`)
  return parts.join(' ') || `${total} d`
}

// ── Tablas de referencia ─────────────────────────────────────────────────────

/** `min`/`max` son los cortes reales, semiabiertos [min, max): el texto de `range` es solo la etiqueta. Comparar contra el
 *  texto dejaba huecos (29.5 % no cabía en «25 – 29%» ni en «≥ 30%») y filas dobles (33 % caía en dos rangos). */
export type RefRow = { range: string; label: string; color: string; kg?: string; min?: number; max?: number }

/** ¿`val` cae en esta fila? Mismos cortes que classify* de '@/lib/peso', así la tabla nunca contradice a la píldora. */
export function isCurrentRow(row: RefRow, val: number): boolean {
  if (row.min == null && row.max == null) return false
  return val >= (row.min ?? -Infinity) && val < (row.max ?? Infinity)
}

/** Tabla de referencia con la fila actual resaltada ("Tú"). */
export function RefTable({ title, note, rows, currentVal }: {
  title: string; note?: string; rows: RefRow[]; currentVal: number | null
}) {
  return (
    <div>
      <div className="mb-1.5" style={{ font: '700 12px/1.3 var(--font-ui, system-ui)', color: COLOR.navy }}>{title}</div>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COLOR.line}` }}>
        <table className="w-full text-xs">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {rows.map(row => {
              const isCurrent = currentVal != null && isCurrentRow(row, currentVal)
              return (
                <tr key={row.range} style={{ background: isCurrent ? `${row.color}1f` : undefined, borderTop: `1px solid ${COLOR.line}` }}>
                  <td className="py-1.5 pl-3 pr-2 tabular-nums font-semibold whitespace-nowrap" style={{ color: colorTexto(row.color), width: '1%' }}>{row.range}</td>
                  {row.kg && <td className="py-1.5 pr-2 tabular-nums whitespace-nowrap" style={{ color: COLOR.muted }}>{row.kg}</td>}
                  <td className="py-1.5 pr-3" style={{ color: COLOR.ink, fontWeight: isCurrent ? 700 : 400 }}>
                    {row.label}
                    {isCurrent && (
                      <span className="ml-1.5 rounded-full px-1.5 py-px align-middle" style={{ background: COLOR.navy, color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '.04em' }}>TÚ</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-1.5 text-xs italic" style={{ color: COLOR.muted }}>{note}</p>}
    </div>
  )
}

/** Fila de referencia con nombre y color tomados de classify* de '@/lib/peso': la tabla y la píldora de la tarjeta dicen
 *  siempre lo mismo (antes la tabla decía «Promedio saludable» donde la píldora decía «Saludable»). `muestra` es
 *  cualquier valor DENTRO de [min, max) de la fila; `detalle` se agrega entre paréntesis al nombre. */
function filaRef(
  clasifica: (v: number) => Classification, muestra: number, range: string,
  corte: Pick<RefRow, 'min' | 'max' | 'kg'>, detalle?: string,
): RefRow {
  const c = clasifica(muestra)
  return { range, label: detalle ? `${c.label} (${detalle})` : c.label, color: c.color, ...corte }
}

// ── Definición de las métricas ───────────────────────────────────────────────

export type MetricKey = 'peso' | 'pct_grasa' | 'pct_musculo' | 'imc' | 'rmr' | 'edad_corporal' | 'grasa_visceral'

export type MetricDef = {
  key: MetricKey
  label: string
  corto: string                       // etiqueta breve (chips, ejes)
  unit: string
  decimals: number
  color: string                       // color de DATO en gráficas (el azul del peso NO es color de interfaz)
  yAxis: 'kg' | 'pct' | 'other'
  goodDir: 'up' | 'down' | 'neutral'
  info: { mide: string; leer: string; hacer: string }
  classify?: (v: number) => Classification
  refs?: { title: string; note?: string; rows: RefRow[] }
}

/** Estatura como se dice en voz alta: 162 -> "1.62", 170 -> "1.70", 175.5 -> "1.755". Se arma desde los cm (con un decimal
 *  como máximo, que es lo que guarda el perfil) para no arrastrar ruido de coma flotante. */
export function fmtTalla(perfil: Pick<PesoPerfil, 'estatura_cm'> = PERFIL_DEFAULT): string {
  return (Math.round(perfil.estatura_cm * 10) / 1000).toFixed(3).replace(/0$/, '')
}

/** Edades (años cumplidos) para las que sirve la referencia de % de grasa que usa la página. */
const EDAD_REF_MIN = 30
const EDAD_REF_MAX = 40

/** Aviso cuando la edad del perfil cae fuera de la edad de la referencia de % de grasa («30–40 años»); null si está dentro,
 *  si falta la fecha de nacimiento o si todavía no se conoce `hoy` (servidor e hidratación: así no hay desajuste). */
export function avisoEdadReferencia(perfil: Pick<PesoPerfil, 'fecha_nacimiento'>, hoy: string | null): string | null {
  const edad = hoy ? edadEn(perfil.fecha_nacimiento, hoy) : null
  if (edad == null || (edad >= EDAD_REF_MIN && edad <= EDAD_REF_MAX)) return null
  return `La referencia es para ${EDAD_REF_MIN}–${EDAD_REF_MAX} años y tu edad es ${edad}: tómala solo como guía.`
}

/** Métricas ya armadas para un perfil: lo único que depende del perfil son las referencias en kg de cada IMC (estatura),
 *  la clasificación y la tabla del % de grasa y del % de músculo (sexo) y el aviso de edad de la tabla de grasa (fecha de
 *  nacimiento). Lo demás (colores, ejes, textos «qué mide») es igual para todos. */
export type MetricasPerfil = { metricas: MetricDef[]; byKey: Record<MetricKey, MetricDef> }

function construirMetricas(perfil: PesoPerfil, avisoEdad: string | null): MetricasPerfil {
  const kg = (imc: number) => pesoParaIMC(perfil, imc).toFixed(1)   // peso (kg, un decimal) con el que el IMC vale `imc`
  const corte = (imc: number) => pesoParaIMC(perfil, imc)           // el mismo peso sin redondear, para los cortes de la tabla
  const talla = fmtTalla(perfil)
  const desp = desplazamientoGrasa(perfil)
  const clasificaGrasa = (v: number) => classifyFat(v, desp)
  // Puntos que bajan los cortes de % de músculo (30/33/36) para mujer; 0 para hombre. La suma al valor vive en
  // classifyMuscle ('@/lib/peso'), así la tabla, la píldora, la IA y los avisos usan una sola regla.
  const despM = desplazamientoMusculo(perfil)
  const clasificaMus = (v: number) => classifyMuscle(v, despM)
  // Rangos de la tabla de grasa (hombre: los de siempre; mujer: desplazados `desp` puntos). `n` evita «22.900000000000002».
  const n = (v: number) => String(Math.round(v * 10) / 10)
  const g = (v: number) => v + desp
  const m = (v: number) => v - despM   // lo mismo para los cortes de músculo, que para mujer bajan

  const metricas: MetricDef[] = [
    {
      key: 'peso', label: 'Peso (kg)', corto: 'Peso', unit: 'kg', decimals: 1, color: DATO_COLOR.peso, yAxis: 'kg', goodDir: 'down',
      info: {
        mide: 'Masa corporal total; incluye agua, glucógeno y contenido digestivo.',
        leer: 'Usa tendencia de 2–4 semanas, no una sola mañana.',
        hacer: 'Si también sube grasa, reduce 150–250 kcal y aumenta pasos diarios.',
      },
      refs: {
        title: `Clasificación OMS — por peso (talla ${talla} m)`,
        note: `Meta: bajar de ${kg(25)} kg para IMC < 25 (salir de sobrepeso).`,
        rows: [
          filaRef(classifyIMC, 17, `< ${kg(18.5)}`, { max: corte(18.5) }, 'IMC < 18.5'),
          filaRef(classifyIMC, 22, `${kg(18.5)} – ${kg(24.9)}`, { min: corte(18.5), max: corte(25) }, 'IMC 18.5–24.9'),
          filaRef(classifyIMC, 27, `${kg(25)} – ${kg(29.9)}`, { min: corte(25), max: corte(30) }, 'IMC 25–29.9'),
          filaRef(classifyIMC, 32, `${kg(30)} – ${kg(34.9)}`, { min: corte(30), max: corte(35) }, 'IMC 30–34.9'),
          filaRef(classifyIMC, 37, `≥ ${kg(35)}`, { min: corte(35) }, 'IMC ≥ 35'),
        ],
      },
    },
    {
      key: 'pct_grasa', label: '% Grasa', corto: '% Grasa', unit: '%', decimals: 1, color: DATO_COLOR.pct_grasa, yAxis: 'pct', goodDir: 'down',
      info: {
        mide: 'Proporción de grasa corporal estimada por bioimpedancia.',
        leer: 'Baja sostenida es mejor señal que bajar peso sin contexto.',
        hacer: 'Buena señal: conserva adherencia y evita recortes agresivos.',
      },
      classify: clasificaGrasa,
      refs: {
        title: `% Grasa — ${perfil.sexo === 'mujer' ? 'mujeres' : 'hombres'} (30–40 años)`,
        // Para mujer los cortes son los de hombre desplazados: es una aproximación, no una norma clínica, y la nota lo dice.
        note: [
          desp ? `Para mujeres son valores aproximados: los de hombres más ${desp} puntos. No son una norma clínica.` : null,
          avisoEdad,   // la edad del perfil queda fuera de «30–40 años»: la tabla sigue diciendo para quién es
        ].filter(Boolean).join(' ') || undefined,
        // Los rangos se escriben con el decimal (14.9, no 14) porque el % de grasa se captura con un decimal: 14.5 existe.
        rows: [
          filaRef(clasificaGrasa, g(5), `< ${n(g(10))}%`, { max: g(10) }),
          filaRef(clasificaGrasa, g(12), `${n(g(10))} – ${n(g(14.9))}%`, { min: g(10), max: g(15) }),
          filaRef(clasificaGrasa, g(17), `${n(g(15))} – ${n(g(19.9))}%`, { min: g(15), max: g(20) }),
          filaRef(clasificaGrasa, g(22), `${n(g(20))} – ${n(g(24.9))}%`, { min: g(20), max: g(25) }),
          filaRef(clasificaGrasa, g(27), `${n(g(25))} – ${n(g(29.9))}%`, { min: g(25), max: g(30) }),
          filaRef(clasificaGrasa, g(35), `≥ ${n(g(30))}%`, { min: g(30) }),
        ],
      },
    },
    {
      key: 'pct_musculo', label: '% Músculo', corto: '% Músculo', unit: '%', decimals: 1, color: DATO_COLOR.pct_musculo, yAxis: 'pct', goodDir: 'up',
      info: {
        mide: 'Masa magra relativa; señal de si estás preservando músculo.',
        leer: 'En déficit, mantener o subir es positivo.',
        hacer: `Mantén fuerza 3–4 veces/semana y proteína ${PROTEINA_G_KG.min.toFixed(1)}–${PROTEINA_G_KG.max.toFixed(1)} g/kg.`,
      },
      classify: clasificaMus,
      refs: {
        title: despM ? '% Músculo — mujeres (bioimpedancia)' : '% Músculo (bioimpedancia)',
        // Igual que en la grasa: para mujer son los cortes de hombre desplazados, una aproximación que la nota aclara.
        note: despM ? `Para mujeres son valores aproximados: los de hombres menos ${despM} puntos. No son una norma clínica.` : undefined,
        rows: [
          filaRef(clasificaMus, m(25), `< ${n(m(30))}%`, { max: m(30) }),
          filaRef(clasificaMus, m(31), `${n(m(30))} – ${n(m(33) - 0.1)}%`, { min: m(30), max: m(33) }),
          filaRef(clasificaMus, m(34), `${n(m(33))} – ${n(m(36) - 0.1)}%`, { min: m(33), max: m(36) }),
          filaRef(clasificaMus, m(38), `≥ ${n(m(36))}%`, { min: m(36) }),   // sin tope: classifyMuscle da «Atlético» a todo lo ≥ 36
        ],
      },
    },
    {
      key: 'imc', label: 'IMC', corto: 'IMC', unit: '', decimals: 1, color: '#8b5cf6', yAxis: 'other', goodDir: 'down',
      info: {
        mide: 'Relación peso/altura. No distingue músculo de grasa.',
        leer: 'Úsalo como contexto, no como único objetivo.',
        hacer: 'Interprétalo siempre junto con % grasa y grasa visceral.',
      },
      classify: classifyIMC,
      refs: {
        title: 'IMC — Clasificación OMS',
        note: `Tu talla: ${talla} m. IMC < 25 = ${kg(25)} kg.`,
        rows: [
          filaRef(classifyIMC, 17, '< 18.5', { kg: `< ${kg(18.5)} kg`, max: 18.5 }),
          filaRef(classifyIMC, 22, '18.5 – 24.9', { kg: `${kg(18.5)} – ${kg(24.9)} kg`, min: 18.5, max: 25 }),
          filaRef(classifyIMC, 27, '25.0 – 29.9', { kg: `${kg(25)} – ${kg(29.9)} kg`, min: 25, max: 30 }),
          filaRef(classifyIMC, 32, '30.0 – 34.9', { kg: `${kg(30)} – ${kg(34.9)} kg`, min: 30, max: 35 }),
          filaRef(classifyIMC, 37, '≥ 35', { kg: `≥ ${kg(35)} kg`, min: 35 }),
        ],
      },
    },
    {
      key: 'rmr', label: 'RMR (kcal)', corto: 'RMR', unit: 'kcal/día', decimals: 0, color: '#f59e0b', yAxis: 'other', goodDir: 'neutral',
      info: {
        mide: 'Calorías que quemas en reposo absoluto estimadas por la báscula.',
        leer: 'Valora solo cambios sostenidos de varias semanas, no picos sueltos.',
        hacer: 'Evalúa en bloques de 3–4 semanas; un dato solo no dice nada.',
      },
    },
    {
      key: 'edad_corporal', label: 'Edad corporal', corto: 'Edad corporal', unit: 'años', decimals: 0, color: '#06b6d4', yAxis: 'other', goodDir: 'down',
      info: {
        mide: 'Índice del fabricante basado en composición y metabolismo.',
        leer: 'Solo tiene valor si mejora junto con grasa y visceral.',
        hacer: 'Tómala como indicador secundario, no como meta principal.',
      },
    },
    {
      key: 'grasa_visceral', label: 'Grasa visceral', corto: 'Visceral', unit: '', decimals: 0, color: '#f97316', yAxis: 'other', goodDir: 'down',
      info: {
        mide: 'Grasa alrededor de órganos internos. Escala del fabricante (1–59).',
        leer: 'Más relevante que la grasa subcutánea para riesgo metabólico.',
        hacer: 'Prioridad alta: revisar adherencia, alcohol y actividad diaria.',
      },
      classify: classifyVisceral,
      refs: {
        title: 'Grasa visceral',
        rows: [
          filaRef(classifyVisceral, 5, '1 – 9', { max: 10 }),   // escala entera: «≤ 9» de classifyVisceral = «< 10»
          filaRef(classifyVisceral, 12, '10 – 14', { min: 10, max: 15 }),
          filaRef(classifyVisceral, 20, '≥ 15', { min: 15 }),
        ],
      },
    },
  ]
  return { metricas, byKey: Object.fromEntries(metricas.map(m => [m.key, m])) as Record<MetricKey, MetricDef> }
}

// Memoizado por lo único que cambia el resultado (estatura, sexo y el aviso de edad): así la identidad del arreglo es
// estable entre renders y se puede usar en dependencias de useMemo. Pocas entradas bastan (un perfil, o dos si se está
// editando); al consultar una entrada se vuelve a insertar al final, así lo que se está usando es lo último que se descarta.
// `hoy` ('YYYY-MM-DD') solo sirve para el aviso de edad; sin él (null) no hay aviso, que es lo que pasa en el servidor
// y en la hidratación. Con el perfil de fábrica (37 años) el aviso es null: nada cambia.
const CACHE_METRICAS = new Map<string, MetricasPerfil>()
export function metricasPara(perfil: PesoPerfil = PERFIL_DEFAULT, hoy: string | null = null): MetricasPerfil {
  const aviso = avisoEdadReferencia(perfil, hoy)
  const clave = `${perfil.estatura_cm}|${perfil.sexo}|${aviso ?? ''}`
  let m = CACHE_METRICAS.get(clave)
  if (m) CACHE_METRICAS.delete(clave)
  else {
    m = construirMetricas(perfil, aviso)
    if (CACHE_METRICAS.size >= 8) CACHE_METRICAS.delete(CACHE_METRICAS.keys().next().value as string)
  }
  CACHE_METRICAS.set(clave, m)
  return m
}

/** Las métricas del perfil vigente (el del contexto). Los componentes usan esto, no METRICS. La fecha de hoy llega
 *  después de montar (useHoy es null en servidor e hidratación), así que el aviso de edad aparece sin desajuste. */
export function useMetricas(): MetricasPerfil {
  const perfil = usePerfil()
  const hoy = useHoy()
  return metricasPara(perfil, hoy)
}

// Versión con el perfil por defecto. Sirve para lo que NO depende del perfil (clave, color, etiqueta, eje, decimales,
// unidad: PesoTiles y PesoVisuales los leen a nivel de módulo). Sus `refs` y el `classify` de % grasa y de % músculo SÍ
// dependen de la estatura y el sexo: para mostrarlos o clasificar con ellos se usa useMetricas() / metricasPara(perfil).
const METRICAS_DEFAULT = metricasPara(PERFIL_DEFAULT)
export const METRICS: MetricDef[] = METRICAS_DEFAULT.metricas
export const METRIC_BY_KEY = METRICAS_DEFAULT.byKey

export const DEFAULT_ACTIVE: ReadonlySet<string> = new Set(['peso', 'pct_grasa', 'pct_musculo'])

// Composición en kg, calculada (no es un campo de la báscula): comparte el eje de kg con el peso.
export const EXTRA_SERIES = [
  { key: 'masa_grasa', label: 'Masa grasa (kg)', corto: 'Masa grasa', unit: 'kg', color: DATO_COLOR.masa_grasa, goodDir: 'down' },
  { key: 'masa_magra', label: 'Masa magra (kg)', corto: 'Masa magra', unit: 'kg', color: DATO_COLOR.masa_magra, goodDir: 'up' },
] as const

export const PRESETS: { label: string; value: number | 'todo' }[] = [
  { label: '3 meses', value: 3 }, { label: '6 meses', value: 6 }, { label: '1 año', value: 12 }, { label: 'Todo', value: 'todo' },
]

/** Valor de una métrica formateado con su unidad (tooltip, tablas). */
export function fmtValor(key: string, v: number): string {
  const def = METRICS.find(m => m.key === key)
  if (def) {
    const n = def.decimals ? fmtNum(v, def.decimals) : String(Math.round(v))
    return def.unit === '%' ? `${n}%` : def.unit ? `${n} ${def.unit}` : n
  }
  if (key === 'masa_grasa' || key === 'masa_magra') return `${fmtNum(v, 1)} kg`
  if (key === 'peso_ma') return `${fmtNum(v, 1)} kg`
  return String(v)
}

// ── Contexto OMS por métrica ─────────────────────────────────────────────────

export function getOmsContext(key: string, val: number, perfil: PesoPerfil = PERFIL_DEFAULT): { lines: { text: string; color: string }[] } {
  const lines: { text: string; color: string }[] = []
  const kg = (imc: number) => pesoParaIMC(perfil, imc).toFixed(1)   // peso con el que el IMC vale `imc` a la estatura del perfil

  if (key === 'peso') {
    const imc = val / tallaCuadrada(perfil)
    const cls = classifyIMC(imc)
    lines.push({ text: `Estás en: ${cls.label} (tu IMC actual es ${imc.toFixed(1)})`, color: cls.color })
    if (imc >= 30) {
      lines.push({ text: `Para salir de obesidad I: bajar de ${kg(30)} kg (IMC < 30)`, color: '#f59e0b' })
      lines.push({ text: `Para salir del sobrepeso: bajar de ${kg(25)} kg (IMC < 25)`, color: '#22c55e' })
    } else if (imc >= 25) {
      lines.push({ text: `Para salir del sobrepeso: bajar de ${kg(25)} kg (IMC < 25)`, color: '#22c55e' })
      lines.push({ text: `Obesidad I empieza en ${kg(30)} kg (IMC ≥ 30)`, color: '#ef4444' })
    } else {
      lines.push({ text: `Sobrepeso empieza en ${kg(25)} kg (IMC ≥ 25)`, color: '#f59e0b' })
    }
  } else if (key === 'imc') {
    const cls = classifyIMC(val)
    lines.push({ text: `Estás en: ${cls.label} (IMC ${val.toFixed(1)})`, color: cls.color })
    if (val >= 25) lines.push({ text: `Para salir del sobrepeso: IMC < 25 (${kg(25)} kg)`, color: '#22c55e' })
    if (val >= 30) lines.push({ text: `Para salir de obesidad I: IMC < 30 (${kg(30)} kg)`, color: '#f59e0b' })
    if (val < 25) lines.push({ text: `Sobrepeso empieza en IMC 25 (${kg(25)} kg)`, color: '#f59e0b' })
    if (val >= 25 && val < 30) lines.push({ text: `Obesidad I empieza en IMC 30 (${kg(30)} kg)`, color: '#ef4444' })
  } else if (key === 'pct_grasa') {
    const d = desplazamientoGrasa(perfil)   // los cortes se desplazan para mujer (0 para hombre)
    const cls = classifyFat(val, d)
    lines.push({ text: `Estás en: ${cls.label} (${val}%)`, color: cls.color })
    // Mismos nombres que classifyFat (y que la tabla de referencia): «Obesidad por grasa», «Saludable», «Fitness».
    if (val >= 30 + d) lines.push({ text: `Para salir de «Obesidad por grasa»: bajar de ${30 + d}%`, color: '#f59e0b' })
    if (val >= 25 + d) lines.push({ text: `Para llegar a «Saludable»: bajar de ${25 + d}%`, color: '#84cc16' })
    if (val >= 20 + d) lines.push({ text: `Para llegar a «Fitness»: bajar de ${20 + d}%`, color: '#22c55e' })
    if (val < 30 + d && val >= 25 + d) lines.push({ text: `«Obesidad por grasa» empieza en ${30 + d}%`, color: '#ef4444' })
  } else if (key === 'pct_musculo') {
    const d = desplazamientoMusculo(perfil)   // los cortes bajan para mujer (0 para hombre)
    const cls = classifyMuscle(val, d)
    const normal = 30 - d, bueno = 33 - d, atletico = 36 - d
    lines.push({ text: `Estás en: ${cls.label} (${val}%)`, color: cls.color })
    if (val < bueno) lines.push({ text: `Para llegar a «Bueno»: ≥ ${bueno}% (te faltan ${(bueno - val).toFixed(1)}%)`, color: '#22c55e' })
    if (val < atletico && val >= bueno) lines.push({ text: `Para llegar a «Atlético»: ≥ ${atletico}% (te faltan ${(atletico - val).toFixed(1)}%)`, color: '#2d6cdf' })
    if (val < normal) lines.push({ text: `Para llegar a «Normal»: ≥ ${normal}% (te faltan ${(normal - val).toFixed(1)}%)`, color: '#84cc16' })
  } else if (key === 'grasa_visceral') {
    const cls = classifyVisceral(val)
    lines.push({ text: `Estás en: ${cls.label} (nivel ${val})`, color: cls.color })
    if (val >= 10) lines.push({ text: 'Para volver a saludable: bajar a ≤ 9', color: '#22c55e' })
    if (val >= 15) lines.push({ text: 'Muy alto empieza en 15 — riesgo metabólico elevado', color: '#ef4444' })
    if (val < 10) lines.push({ text: 'Alto empieza en 10 · Muy alto en 15', color: '#f59e0b' })
  }

  return { lines }
}

// ── Series y extremos por métrica ────────────────────────────────────────────
// Las capturas rápidas (CommandPalette) guardan registros con SOLO peso: por eso cada métrica toma sus
// propios valores no nulos. Mirar únicamente "el último registro" hacía desaparecer % grasa, visceral, etc.

export type SerieValor = { fecha: string; valor: number }

export const porFecha = (rows: PesoRecord[]) => [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha))

/** Valores no nulos de una métrica, de más antiguo a más reciente. */
export function valoresDe(rows: PesoRecord[], get: (r: PesoRecord) => number | null): SerieValor[] {
  return porFecha(rows).flatMap(r => {
    const v = get(r)
    return v == null ? [] : [{ fecha: r.fecha, valor: v }]
  })
}

/** Primer y último valor de una métrica dentro de `rows`; null si hay menos de dos datos. */
export function extremosMetrica(rows: PesoRecord[], key: MetricKey): { first: SerieValor; last: SerieValor } | null {
  const s = valoresDe(rows, r => r[key])
  return s.length >= 2 ? { first: s[0], last: s[s.length - 1] } : null
}

/** Último valor no nulo de una métrica. */
export function ultimoValor(rows: PesoRecord[], key: MetricKey): SerieValor | null {
  const s = valoresDe(rows, r => r[key])
  return s.length ? s[s.length - 1] : null
}

/** Referencia para "cambio vs hace ~30 días": el dato más reciente con al menos `dias` de antigüedad; si no hay
 *  (todo es más reciente), el más antiguo. null si solo hay un dato. */
export function referenciaAntigua(serie: SerieValor[], dias = 30): { ref: SerieValor; cur: SerieValor; span: number } | null {
  if (serie.length < 2) return null
  const cur = serie[serie.length - 1]
  const objetivo = addDays(cur.fecha, -dias)
  let ref: SerieValor | null = null
  for (let i = serie.length - 2; i >= 0; i--) {
    if (serie[i].fecha <= objetivo) { ref = serie[i]; break }
  }
  ref = ref ?? serie[0]
  const span = daysBetween(ref.fecha, cur.fecha)
  return span > 0 ? { ref, cur, span } : null
}

// ── Serie de la gráfica ──────────────────────────────────────────────────────
// Eje de tiempo real: las mediciones son irregulares (a veces semanales, a veces cada 4 meses); con un eje por
// posición un hueco de meses se dibujaba igual de ancho que uno de días y la pendiente mentía.

export type PuntoSerie = {
  t: number; iso: string
  peso: number | null; peso_ma: number | null
  pct_grasa: number | null; pct_musculo: number | null; imc: number | null
  rmr: number | null; edad_corporal: number | null; grasa_visceral: number | null
  masa_grasa: number | null; masa_magra: number | null
}

/** Puntos para la gráfica. Filtra el RMR atípico (17775 es un error de captura conocido). `peso_ma` es el promedio
 *  móvil de 14 DÍAS (no de N mediciones: la cadencia es irregular) y se calcula sobre TODO el historial, porque la
 *  ventana de las primeras mediciones de un rango puede caer antes de él. */
export function construirSerie(data: PesoRecord[]): PuntoSerie[] {
  const asc = porFecha(data)
  return asc.map((r, i) => {
    const desde = addDays(r.fecha, -13)
    const vals: number[] = []
    for (let j = i; j >= 0 && asc[j].fecha >= desde; j--) {
      const p = asc[j].peso
      if (p != null) vals.push(p)
    }
    const ma = vals.length >= 2 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
    return {
      t: utcT(r.fecha), iso: r.fecha,
      peso: r.peso, peso_ma: ma != null ? Math.round(ma * 10) / 10 : null,
      pct_grasa: r.pct_grasa, pct_musculo: r.pct_musculo, imc: r.imc,
      rmr: r.rmr && r.rmr < 5000 ? r.rmr : null,
      edad_corporal: r.edad_corporal, grasa_visceral: r.grasa_visceral,
      masa_grasa: masaGrasa(r), masa_magra: masaMagra(r),
    }
  })
}

export function fmtTick(t: number, corto: boolean) {
  const d = new Date(t)
  return corto ? `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` : `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`
}
export function fmtTooltipFecha(t: number) {
  const d = new Date(t)
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_LARGO[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

/** Marcas del eje X: día 1 de cada mes (o cada 2, 3, 6… si el rango es largo) dentro de [min, max]. */
export function ticksMensuales(min: number, max: number, maxTicks = 7): number[] {
  const a = new Date(min), b = new Date(max)
  const meses = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() + 1
  const paso = Math.max(1, Math.ceil(meses / maxTicks))
  const y = a.getUTCFullYear()
  const m0 = Date.UTC(y, a.getUTCMonth(), 1) < min ? a.getUTCMonth() + 1 : a.getUTCMonth()
  const out: number[] = []
  for (let k = 0; ; k++) {
    const t = Date.UTC(y, m0 + k * paso, 1)
    if (t > max) break
    out.push(t)
  }
  return out
}

// ── Análisis de tendencia (texto) ────────────────────────────────────────────

export type Frase = { texto: string; delta: number; bueno: boolean | null }

const verbo = (d: number) => (d > 0 ? 'subió' : d < 0 ? 'bajó' : 'se mantuvo')

/** Frases del resumen de tendencia + lectura global. Cada métrica usa sus PROPIOS primer y último dato del rango. */
export function resumenTendencia(rows: PesoRecord[], perfil: PesoPerfil = PERFIL_DEFAULT) {
  const ex = (k: MetricKey) => {
    const e = extremosMetrica(rows, k)
    return e ? { delta: e.last.valor - e.first.valor, first: e.first.valor, last: e.last.valor } : null
  }
  const peso = ex('peso'), grasa = ex('pct_grasa'), musculo = ex('pct_musculo'), imc = ex('imc')
  const visceral = ex('grasa_visceral'), edad = ex('edad_corporal')
  const r1 = (n: number) => Math.round(n * 10) / 10   // se decide el verbo con el valor ya redondeado: nada de "subió 0.0"

  const imcClass = imc ? classifyIMC(imc.last) : null
  const grasaClass = grasa ? classifyFat(grasa.last, desplazamientoGrasa(perfil)) : null
  const muscClass = musculo ? classifyMuscle(musculo.last, desplazamientoMusculo(perfil)) : null
  const visceralClass = visceral ? classifyVisceral(visceral.last) : null

  const frases: Frase[] = []
  const mag = (v: number) => fmtNum(Math.abs(v))   // el verbo ya dice si subió o bajó: sin signo repetido
  if (peso) {
    const d = r1(peso.delta)
    frases.push({
      texto: d === 0
        ? `El peso se mantuvo (${peso.first} → ${peso.last} kg)${imcClass ? `, IMC en ${imcClass.label.toLowerCase()}` : ''}.`
        : `El peso ${verbo(d)} ${mag(d)} kg (${peso.first} → ${peso.last} kg)${imcClass ? `, IMC en ${imcClass.label.toLowerCase()}` : ''}.`,
      delta: d, bueno: d === 0 ? null : d < 0,
    })
  }
  if (grasa) {
    const d = r1(grasa.delta)
    frases.push({
      texto: d === 0
        ? `La grasa se mantuvo en ${grasa.last}%${grasaClass ? ` (${grasaClass.label.toLowerCase()})` : ''}.`
        : `La grasa ${verbo(d)} ${mag(d)} puntos → actualmente ${grasa.last}%${grasaClass ? ` (${grasaClass.label.toLowerCase()})` : ''}.`,
      delta: d, bueno: d === 0 ? null : d < 0,
    })
  }
  if (musculo) {
    const d = r1(musculo.delta)
    frases.push({
      texto: d === 0
        ? `El músculo se mantuvo en ${musculo.last}%${muscClass ? ` (${muscClass.label.toLowerCase()})` : ''}.`
        : `El músculo ${verbo(d)} ${mag(d)} puntos → ${musculo.last}%${muscClass ? ` (${muscClass.label.toLowerCase()})` : ''}.`,
      delta: d, bueno: d === 0 ? null : d > 0,
    })
  }
  if (visceral) {
    const d = visceral.delta
    frases.push({
      texto: d === 0
        ? `Grasa visceral sin cambio en ${visceral.last}${visceralClass ? ` (${visceralClass.label.toLowerCase()})` : ''}.`
        : `Grasa visceral ${verbo(d)} a ${visceral.last}${visceralClass ? ` (${visceralClass.label.toLowerCase()})` : ''}.`,
      delta: d, bueno: d === 0 ? null : d < 0,
    })
  }
  if (edad) {
    const d = edad.delta
    frases.push({
      texto: d === 0 ? `Edad corporal sin cambio (${edad.last} años).` : `Edad corporal ${verbo(d)} ${mag(d)} → ${edad.last} años.`,
      delta: d, bueno: d === 0 ? null : d < 0,
    })
  }

  const recomp = peso && grasa && peso.delta > 0 && grasa.delta < 0
  const deficit = peso && grasa && peso.delta < 0 && grasa.delta < 0
  let insight: string | null = null
  if (recomp) insight = 'Peso al alza con grasa bajando: posible recomposición corporal.'
  else if (deficit) insight = 'Peso y grasa bajando juntos: déficit calórico funcionando.'
  else if (grasa && grasa.delta < 0 && musculo && musculo.delta >= 0) insight = 'Grasa baja y músculo sostenido: buena dirección.'

  const malas = frases.filter(f => f.bueno === false).length
  const tono: Tono = malas === 0 ? 'bueno' : malas <= 2 ? 'neutro' : 'malo'
  const etiqueta = malas === 0 ? 'Buena tendencia' : malas <= 2 ? 'Tendencia mixta' : 'Tendencia de alerta'
  const color = malas === 0 ? '#15803d' : malas <= 2 ? '#b45309' : '#b91c1c'
  return { frases, insight, tono, etiqueta, color }
}

/** Viñetas de la "Recomendación general" a partir de los cambios del rango. */
export function recomendacionGeneral(rows: PesoRecord[], metricas: readonly MetricDef[] = METRICS) {
  const get = (k: MetricKey) => {
    const e = extremosMetrica(rows, k)
    return e ? e.last.valor - e.first.valor : null
  }
  const fatD = get('pct_grasa'), muscleD = get('pct_musculo'), pesoD = get('peso')
  const visceralLast = ultimoValor(rows, 'grasa_visceral')?.valor ?? null

  const bullets: string[] = []
  if (fatD != null && fatD < 0) bullets.push('La grasa corporal muestra descenso neto.')
  if (muscleD != null && muscleD > 0) bullets.push('El porcentaje de músculo sube en el periodo.')
  if (pesoD != null && pesoD > 0 && fatD != null && fatD < 0) bullets.push('Peso al alza con grasa a la baja: posible recomposición.')
  if (pesoD != null && pesoD < 0 && fatD != null && fatD < 0) bullets.push('Peso y grasa bajando juntos: buen déficit calórico.')
  if (visceralLast != null && visceralLast >= 10) bullets.push('Grasa visceral alta: prioriza adherencia y reducción de alcohol.')

  const alertCount = metricas.filter(m => {
    if (m.goodDir === 'neutral') return false
    const d = get(m.key)
    if (d == null) return false
    return m.goodDir === 'down' ? d > 0 : d < 0
  }).length
  if (alertCount >= 2) bullets.push('Hay más de una métrica en alerta: conviene ajustar el plan esta semana.')

  return {
    bullets,
    resumen: bullets.length === 0 ? 'Tendencia mixta, conviene sostener consistencia y revisar métricas clave.' : null,
  }
}

/** Estado "según referencias" con el último dato conocido de cada métrica clasificable. */
export function estadoOms(rows: PesoRecord[], perfil: PesoPerfil = PERFIL_DEFAULT) {
  const items: { label: string; value: string; cls: Classification }[] = []
  const imc = ultimoValor(rows, 'imc'), grasa = ultimoValor(rows, 'pct_grasa')
  const musc = ultimoValor(rows, 'pct_musculo'), visc = ultimoValor(rows, 'grasa_visceral')
  const desp = desplazamientoGrasa(perfil)
  const despM = desplazamientoMusculo(perfil)
  if (imc) items.push({ label: 'IMC', value: `${imc.valor}`, cls: classifyIMC(imc.valor) })
  if (grasa) items.push({ label: '% Grasa', value: `${grasa.valor}%`, cls: classifyFat(grasa.valor, desp) })
  if (musc) items.push({ label: '% Músculo', value: `${musc.valor}%`, cls: classifyMuscle(musc.valor, despM) })
  if (visc) items.push({ label: 'Gr. visceral', value: `${visc.valor}`, cls: classifyVisceral(visc.valor) })

  const headline = [
    imc ? classifyIMC(imc.valor).label : null,
    grasa ? classifyFat(grasa.valor, desp).label : null,
    musc ? `músculo ${classifyMuscle(musc.valor, despM).label.toLowerCase()}` : null,
  ].filter(Boolean).join(' · ')

  const peor = items.reduce<Level>((acc, i) => {
    if (i.cls.level === 'alert') return 'alert'
    if (i.cls.level === 'warn' && acc === 'good') return 'warn'
    return acc
  }, 'good')
  return { items, headline, nivel: peor, color: NIVEL_COLOR[peor] }
}

// ── Historial ────────────────────────────────────────────────────────────────

export type FilaHistorial = {
  r: PesoRecord
  older: PesoRecord | null
  dPeso: number | null          // vs la medición anterior (redondeado a 0.1)
  gapDias: number | null
}

/** Filas del historial, de la más reciente a la más antigua. Δ e intervalo se calculan contra la medición anterior
 *  de TODO el historial (así, al filtrar por año, la primera fila del año conserva su Δ real). */
export function filasHistorial(data: PesoRecord[]): FilaHistorial[] {
  const asc = porFecha(data)
  return asc.map((r, i): FilaHistorial => {
    const older = asc[i - 1] ?? null
    return {
      r, older,
      dPeso: older && older.peso != null && r.peso != null ? Math.round((r.peso - older.peso) * 10) / 10 : null,
      gapDias: older ? daysBetween(older.fecha, r.fecha) : null,
    }
  }).reverse()
}

/** Ids de la medición con el mejor (menor) y el peor (mayor) peso del conjunto; si hay empate, la más reciente
 *  (las filas vienen de la más nueva a la más vieja). null si no hay al menos dos pesos distintos. */
export function extremosPeso(filas: FilaHistorial[]) {
  let mejor: FilaHistorial | null = null
  let peor: FilaHistorial | null = null
  for (const f of filas) {
    const p = f.r.peso
    if (p == null) continue
    if (!mejor || p < (mejor.r.peso as number)) mejor = f
    if (!peor || p > (peor.r.peso as number)) peor = f
  }
  if (!mejor || !peor || mejor.r.peso === peor.r.peso) return { mejor: null, peor: null }
  return { mejor, peor }
}

/** Años presentes en los datos, del más reciente al más antiguo, con su número de mediciones. */
export function aniosDe(data: PesoRecord[]) {
  const c = new Map<string, number>()
  for (const r of data) c.set(r.fecha.slice(0, 4), (c.get(r.fecha.slice(0, 4)) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([anio, n]) => ({ anio, n }))
}

export const CSV_COLUMNAS = [
  'fecha', 'peso_kg', 'pct_grasa', 'pct_musculo', 'imc', 'rmr_kcal', 'edad_corporal', 'grasa_visceral',
  'masa_grasa_kg', 'masa_magra_kg', 'delta_peso_kg', 'intervalo_dias',
] as const

/** CSV (UTF-8 con BOM para que Excel respete acentos, CRLF) en orden cronológico. Solo hay fechas y números:
 *  no hay texto libre, así que no hace falta escapar comillas ni preocuparse por inyección de fórmulas. */
export function csvDeFilas(filas: FilaHistorial[]): string {
  const celda = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : String(v))
  const lineas = [CSV_COLUMNAS.join(',')]
  for (const f of [...filas].reverse()) {
    const r = f.r
    lineas.push([
      r.fecha, celda(r.peso), celda(r.pct_grasa), celda(r.pct_musculo), celda(r.imc), celda(r.rmr), celda(r.edad_corporal),
      celda(r.grasa_visceral), celda(masaGrasa(r)), celda(masaMagra(r)), celda(f.dPeso), celda(f.gapDias),
    ].join(','))
  }
  return '﻿' + lineas.join('\r\n') + '\r\n'
}

// ── Meta y proyección ────────────────────────────────────────────────────────

export type VentanaRitmo = 90 | 180 | 365
export type RitmoPeso = { kgSem: number; ventana: VentanaRitmo; n: number; hasta: string }

/** Ritmo del peso (kg/semana, regresión lineal) a 90 días desde la última medición; si no alcanzan los datos, a 180;
 *  si tampoco, a 365. NO depende del rango del selector de la gráfica. */
export function ritmoPeso(data: PesoRecord[]): RitmoPeso | null {
  const conPeso = porFecha(data).filter(r => r.peso != null)
  if (conPeso.length < 3) return null
  const hasta = conPeso[conPeso.length - 1].fecha
  for (const ventana of [90, 180, 365] as const) {
    const desde = addDays(hasta, -ventana)
    const k = pendienteSemanal(conPeso, r => r.peso, desde, hasta)
    if (k != null) return { kgSem: k, ventana, n: conPeso.filter(r => r.fecha >= desde).length, hasta }
  }
  return null
}

export type Proyeccion =
  | { tipo: 'sin-ritmo' }
  | { tipo: 'no-avanza' }
  | { tipo: 'lejos'; semanas: number }
  | { tipo: 'fecha'; fecha: string; semanas: number; aTiempo: boolean | null; diasDif: number | null }

export type CalculoMeta = {
  metaPeso: number
  curPeso: number; curFecha: string
  inicio: { peso: number; fecha: string }   // extremo de la etapa actual: el peso más alto si bajas, el más bajo si subes
  sentido: 'bajar' | 'subir'
  faltan: number                       // kg que faltan en el sentido de la meta (<= 0.05 si ya se alcanzó/superó)
  alcanzada: boolean
  progreso: number                     // 0..1
  diasRestantes: number | null         // negativo = fecha vencida
  kgSemNecesarios: number | null       // kg/semana (positivo) para llegar justo en la fecha meta
  ritmo: RitmoPeso | null
  ritmoEnSentido: number | null        // kg/semana REALES en el sentido de la meta (negativo = te alejas)
  proyeccion: Proyeccion | null        // null si la meta ya se alcanzó
}

/** Todo lo que necesita la tarjeta de meta, calculado en código. Usa el MISMO criterio que la franja de estado
 *  (PesoHeroCalc.calcularMeta), si no las dos se contradicen en la misma pantalla:
 *  - Sentido: de tu peso ACTUAL y del máximo de la etapa, no del primer dato. Si ya recuperaste peso, una meta que cae entre el
 *    primer peso y el actual seguía saliendo «subir» y «Meta cumplida» pesando más que la meta. Si pesas menos que la meta pero
 *    en esta etapa estuviste por encima, venías bajando y ya la pasaste.
 *  - Partida: el peso más alto de la etapa actual (el más bajo si subes), igual que el anillo del hero.
 *  La etapa empieza tras el último hueco de más de un año: usar el primer dato de la historia (2020, otro cuerpo)
 *  convertía "bajar a 82" en "subir" y daba la meta por cumplida estando 9 kg arriba. */
export function calcularMeta(data: PesoRecord[], metaPeso: number, metaFecha: string | null, hoy: string | null): CalculoMeta | null {
  const conPeso = porFecha(data).filter(r => r.peso != null)
  if (!conPeso.length) return null
  const cur = conPeso[conPeso.length - 1]
  const curPeso = cur.peso as number
  const etapa = etapaActual(conPeso)
  // En empate gana la medición más reciente: es donde arrancó el tramo que llevas.
  const mayor = etapa.reduce((m, r) => ((r.peso as number) >= (m.peso as number) ? r : m), etapa[0])
  const menor = etapa.reduce((m, r) => ((r.peso as number) <= (m.peso as number) ? r : m), etapa[0])

  const sentido: 'bajar' | 'subir' = curPeso > metaPeso + 0.05 || (mayor.peso as number) > metaPeso + 0.05 ? 'bajar' : 'subir'
  const ini = sentido === 'bajar' ? mayor : menor
  const inicioPeso = ini.peso as number

  const sg = sentido === 'bajar' ? 1 : -1
  const faltan = sg * (curPeso - metaPeso)
  const alcanzada = faltan <= 0.05   // tolerancia de 50 g, la misma del hero: la báscula no distingue menos
  const total = sg * (inicioPeso - metaPeso)
  const hecho = sg * (inicioPeso - curPeso)
  const progreso = alcanzada ? 1 : total > 0 ? Math.max(0, Math.min(1, hecho / total)) : 0

  const diasRestantes = metaFecha && hoy ? daysBetween(hoy, metaFecha) : null
  const kgSemNecesarios = !alcanzada && diasRestantes != null && diasRestantes > 0 ? faltan / (diasRestantes / 7) : null

  const ritmo = ritmoPeso(conPeso)
  const ritmoEnSentido = ritmo ? -sg * ritmo.kgSem : null

  let proyeccion: Proyeccion | null = null
  if (!alcanzada) {
    if (!ritmo || ritmoEnSentido == null) proyeccion = { tipo: 'sin-ritmo' }
    else if (ritmoEnSentido < 0.02) proyeccion = { tipo: 'no-avanza' }   // menos de 20 g/semana en la dirección buena = estancado
    else {
      const semanas = faltan / ritmoEnSentido
      if (semanas > 104) proyeccion = { tipo: 'lejos', semanas }
      else {
        const fecha = addDays(cur.fecha, Math.round(semanas * 7))
        proyeccion = { tipo: 'fecha', fecha, semanas, aTiempo: metaFecha ? fecha <= metaFecha : null, diasDif: metaFecha ? daysBetween(metaFecha, fecha) : null }
      }
    }
  }

  return {
    metaPeso, curPeso, curFecha: cur.fecha, inicio: { peso: inicioPeso, fecha: ini.fecha },
    sentido, faltan, alcanzada, progreso, diasRestantes, kgSemNecesarios, ritmo, ritmoEnSentido, proyeccion,
  }
}

/** Progreso hacia la meta de % grasa (parte de la primera medición con grasa de la etapa actual). */
export function calcularMetaGrasa(data: PesoRecord[], metaGrasa: number) {
  const conGrasa = porFecha(data).filter(r => r.pct_grasa != null)
  if (!conGrasa.length) return null
  const cur = conGrasa[conGrasa.length - 1]
  const ini = etapaActual(conGrasa)[0]
  const c = cur.pct_grasa as number, i = ini.pct_grasa as number
  const sg = i > metaGrasa ? 1 : i < metaGrasa ? -1 : c > metaGrasa ? 1 : -1
  const faltan = sg * (c - metaGrasa)
  const total = sg * (i - metaGrasa)
  const alcanzada = faltan <= 0.0001
  return {
    cur: c, curFecha: cur.fecha, inicio: i, inicioFecha: ini.fecha, faltan: Math.round(faltan * 10) / 10, alcanzada,
    progreso: alcanzada ? 1 : total > 0 ? Math.max(0, Math.min(1, sg * (i - c) / total)) : 0,
  }
}

export type SugerenciaMeta = {
  id: 'imc25' | 'grasa20'
  titulo: string
  detalle: string
  peso: number
  grasa: number | null
  semanas: number
}

/** Metas sugeridas, calculadas con el último peso y la última composición. El ritmo de referencia (0.5 kg/semana)
 *  es el que el análisis por reglas ya usa como "sostenible". La estatura del perfil fija el peso con IMC 25 y el sexo
 *  desplaza el % de grasa objetivo (20% en hombre, el inicio de «Saludable»; 28% en mujer). El `id` 'grasa20' se queda
 *  como identificador aunque el porcentaje cambie: el contrato con PesoMeta es `grasa`, que lleva el valor real. */
export function sugerenciasMeta(data: PesoRecord[], perfil: PesoPerfil = PERFIL_DEFAULT): SugerenciaMeta[] {
  const conPeso = porFecha(data).filter(r => r.peso != null)
  if (!conPeso.length) return []
  const w = conPeso[conPeso.length - 1].peso as number
  const comp = [...porFecha(data)].reverse().find(r => r.peso != null && r.pct_grasa != null)
  const magra = comp ? masaMagra(comp) : null
  const out: SugerenciaMeta[] = []
  const r1 = (n: number) => Math.round(n * 10) / 10
  const sem = (kg: number) => Math.max(1, Math.ceil(kg / 0.5))

  const pesoImc25 = pesoParaIMC(perfil, 25)
  if (w > pesoImc25 + 0.5) {
    const peso = r1(pesoImc25)
    // Si el peso con IMC 25 queda casi igual a la masa magra, un «~3% de grasa» no es una referencia útil (ni alcanzable):
    // por debajo de 8% no se menciona. Con los datos de siempre sale ~22%, así que no cambia nada.
    const grasaEqCrudo = magra != null ? Math.round((1 - magra / peso) * 100) : null
    const grasaEq = grasaEqCrudo != null && grasaEqCrudo >= 8 ? grasaEqCrudo : null
    out.push({
      id: 'imc25', peso, grasa: null, semanas: sem(w - peso),
      titulo: `${peso} kg · salir del sobrepeso`,
      detalle: `Es el peso donde tu IMC baja de 25${grasaEq != null ? `; si conservas tu masa magra equivale a ~${grasaEq}% de grasa` : ''}.`,
    })
  }
  const grasaAct = comp?.pct_grasa ?? null
  const objetivoGrasa = 20 + desplazamientoGrasa(perfil)
  if (magra != null && grasaAct != null && grasaAct >= objetivoGrasa + 1) {
    const peso = r1(magra / ((100 - objetivoGrasa) / 100))   // magra = (1 − grasa) × peso
    if (peso < w - 0.5) {
      out.push({
        id: 'grasa20', peso, grasa: objetivoGrasa, semanas: sem(w - peso),
        titulo: `${objetivoGrasa}% de grasa · ${peso} kg`,
        detalle: `Conservando tu masa magra de ${r1(magra)} kg pesarías ~${peso} kg, y con ${objetivoGrasa}% de grasa estarías en el rango saludable.`,
      })
    }
  }
  return out
}
