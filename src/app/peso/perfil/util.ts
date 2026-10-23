// Lógica pura de la pestaña «Mi perfil» (sin React): del formulario (todo texto) al perfil validado, los mensajes de
// error por campo, la frase de «qué cambió» y los números de «Tus números base». Va aparte del componente para
// poder probarla con node y para que PesoPerfil.tsx quede en la interfaz.

import { fmtFecha, imcVigente, type PesoRecord } from '@/lib/peso'
import {
  ACTIVIDADES, PERFIL_DEFAULT, edadEn, fechaIsoValida, numerosBase, tmbMifflin, validarPerfil,
  type PesoPerfil,
} from '@/lib/peso-perfil'

export type CampoPerfil = keyof PesoPerfil

/** Campos en el orden del formulario (sirve para comparar y para enfocar el primer error). */
export const CAMPOS: CampoPerfil[] = [
  'estatura_cm', 'fecha_nacimiento', 'sexo', 'actividad', 'dias_entrenamiento', 'experiencia', 'equipo',
  'sueno_horas', 'comidas_dia', 'alcohol', 'lesiones', 'restricciones', 'preferencias', 'notas_salud',
]

/** Lo que hay en los campos del formulario: todo es texto (los inputs y selects así lo entregan). */
export type FormPerfil = Record<CampoPerfil, string>

const t = (v: string | number | null): string => (v == null ? '' : String(v))

export function aForm(p: PesoPerfil): FormPerfil {
  return {
    estatura_cm: t(p.estatura_cm), fecha_nacimiento: t(p.fecha_nacimiento), sexo: p.sexo, actividad: p.actividad,
    dias_entrenamiento: t(p.dias_entrenamiento), experiencia: t(p.experiencia), equipo: t(p.equipo),
    comidas_dia: t(p.comidas_dia), alcohol: t(p.alcohol), sueno_horas: t(p.sueno_horas),
    lesiones: t(p.lesiones), restricciones: t(p.restricciones), preferencias: t(p.preferencias), notas_salud: t(p.notas_salud),
  }
}

export const formsIguales = (a: FormPerfil, b: FormPerfil) => CAMPOS.every(c => a[c] === b[c])

/** El cuerpo que se manda a validarPerfil / a la API. Acepta coma decimal en la estatura («181,5»): parseFloat se
 *  detendría en la coma y se guardaría 181. */
export function aCuerpo(f: FormPerfil): Record<string, unknown> {
  return { ...f, estatura_cm: f.estatura_cm.trim().replace(',', '.') }
}

export type Errores = Partial<Record<CampoPerfil, string>>

/** Mensajes por campo, escritos para quien está llenando el formulario (validarPerfil da el veredicto final y sus
 *  mensajes son más secos). Los campos de lista cerrada (selects, opciones) no pueden quedar inválidos salvo que
 *  falte elegir sexo o actividad. */
export function erroresForm(f: FormPerfil, hoy: string): Errores {
  const e: Errores = {}

  const est = f.estatura_cm.trim().replace(',', '.')
  if (!est) e.estatura_cm = 'Escribe tu estatura en centímetros.'
  else {
    const n = Number(est)
    if (!Number.isFinite(n)) e.estatura_cm = 'Escribe solo números (por ejemplo 181).'
    else if (n < 3) e.estatura_cm = 'Escribe la estatura en centímetros, no en metros (por ejemplo 181).'
    else if (n < 120 || n > 230) e.estatura_cm = 'La estatura debe estar entre 120 y 230 cm.'
  }

  if (f.fecha_nacimiento) {
    // fechaIsoValida es el mismo criterio de validarPerfil: Date.parse aceptaría «1989-02-30» y el mensaje caería en el de la edad.
    const edad = edadEn(f.fecha_nacimiento, hoy)
    if (!fechaIsoValida(f.fecha_nacimiento)) e.fecha_nacimiento = 'La fecha de nacimiento no es válida.'
    else if (f.fecha_nacimiento > hoy) e.fecha_nacimiento = 'La fecha de nacimiento no puede ser futura.'
    else if (edad == null || edad < 10 || edad > 100) e.fecha_nacimiento = 'La edad debe estar entre 10 y 100 años.'
  }

  if (f.sexo !== 'hombre' && f.sexo !== 'mujer') e.sexo = 'Elige tu sexo.'
  if (!ACTIVIDADES.some(a => a.value === f.actividad)) e.actividad = 'Elige tu nivel de actividad.'

  const dias = Number(f.dias_entrenamiento)
  if (f.dias_entrenamiento === '' || !Number.isInteger(dias) || dias < 0 || dias > 7) e.dias_entrenamiento = 'Indica cuántos días entrenas por semana (0 si ninguno).'
  return e
}

export type Evaluacion = { errores: Errores; valor: PesoPerfil | null; errorGeneral: string | null }

/** Errores por campo y, si no hay ninguno, el perfil normalizado listo para guardar (el mismo que arma la API). */
export function evaluarForm(f: FormPerfil, hoy: string): Evaluacion {
  const errores = erroresForm(f, hoy)
  if (Object.keys(errores).length) return { errores, valor: null, errorGeneral: null }
  const r = validarPerfil(aCuerpo(f), hoy)
  // Los mensajes por campo cubren todo lo que validarPerfil rechaza; si aun así rechazara algo, se avisa en general.
  return r.ok ? { errores, valor: r.valor, errorGeneral: null } : { errores, valor: null, errorGeneral: r.error }
}

export function camposCambiados(a: PesoPerfil, b: PesoPerfil): CampoPerfil[] {
  return CAMPOS.filter(c => a[c] !== b[c])
}

const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

/** La confirmación de un guardado, con lo que se recalculó de verdad según lo que cambió (voz impersonal). */
export function resumenGuardado(antes: PesoPerfil, despues: PesoPerfil, eraConfigurado: boolean): string {
  const cam = camposCambiados(antes, despues)
  const cosas: string[] = []
  if (cam.includes('estatura_cm')) cosas.push('tu IMC', 'tus pesos objetivo')
  if (cam.includes('sexo')) cosas.push('los rangos de % de grasa y de músculo')
  // Los días de entrenamiento también mueven el gasto: se suman aparte (días × KCAL_POR_SESION ÷ 7).
  if (cam.some(c => c === 'estatura_cm' || c === 'sexo' || c === 'fecha_nacimiento' || c === 'actividad' || c === 'dias_entrenamiento')) cosas.push('tu gasto estimado')
  if (!cam.length) {
    return eraConfigurado
      ? 'Tu perfil ya estaba al día.'
      : 'Perfil guardado. Desde ahora los cálculos y el análisis con IA usan tus datos y no los supuestos.'
  }
  if (!cosas.length) return 'Perfil guardado. El análisis con IA y los prompts de rutina y dieta ya usan estos datos.'
  return `Perfil guardado. Se recalcularon ${lista([...cosas, 'el análisis'])}.`
}

// ── Números base ─────────────────────────────────────────────────────────────

/** Miles con coma y decimales con punto (formato de México) sin depender de Intl: así el servidor y el navegador
 *  imprimen exactamente lo mismo. */
export function fmtNum(n: number, dec = 0): string {
  const [ent, fr] = Math.abs(n).toFixed(dec).split('.')
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${n < 0 ? '−' : ''}${miles}${fr ? `.${fr}` : ''}`
}

/** La fila más reciente (por fecha; a igual fecha, la última de la lista) que cumple la condición. */
export function masReciente(data: PesoRecord[], ok: (r: PesoRecord) => boolean): PesoRecord | null {
  let mejor: PesoRecord | null = null
  for (const r of data) if (ok(r) && (!mejor || r.fecha >= mejor.fecha)) mejor = r
  return mejor
}

const rmrValido = (r: PesoRecord) => r.rmr != null && r.rmr > 800 && r.rmr < 5000   // mismo criterio que numerosBase

export type Coherencia = { nivel: 'ok' | 'moderada' | 'grande'; texto: string }

export type NumerosVista = {
  edad: number | null
  estaturaCm: number
  saludable: { min: number; max: number; imc25: number }
  pesoKg: number | null
  fechaPeso: string | null
  tmb: number | null          // Mifflin con el peso de la fila de la que sale el RMR (para compararlos con justicia)
  rmr: number | null
  fechaRmr: string | null
  coherencia: Coherencia | null
  gastoDiario: number | null
  /** Gasto basal × factor de actividad, sin el entrenamiento (primer sumando de gastoDiario). */
  gastoSinEntrenamiento: number | null
  /** Lo que suma el entrenamiento por día (segundo sumando; 0 si no entrena). */
  entrenamientoKcalDia: number
  gastoBase: 'bascula' | 'formula' | null
  factor: number
  actividad: { label: string; detalle: string }
  proteina: { min: number; max: number } | null
  agua: number | null
}

/** Compara la fórmula con el RMR de la báscula y lo dice en una frase. La diferencia se mide contra la fórmula. */
export function compararBasal(tmb: number | null, rmr: number | null, tieneFecha: boolean): Coherencia | null {
  if (rmr == null) return null
  if (tmb == null) {
    return { nivel: 'moderada', texto: tieneFecha ? 'Aún no hay un peso con el cual calcular la fórmula; se usa el RMR de tu báscula.' : 'Sin fecha de nacimiento no se puede calcular la fórmula; se usa el RMR de tu báscula.' }
  }
  const dif = rmr - tmb
  const abs = Math.abs(dif)
  const pct = (abs / tmb) * 100
  const cuanto = `${fmtNum(abs)} kcal ${dif >= 0 ? 'más' : 'menos'} que la fórmula (${fmtNum(pct, 1)} %)`
  if (pct <= 10) return { nivel: 'ok', texto: `Son coherentes: la báscula marca ${cuanto}.` }
  if (pct <= 20) return { nivel: 'moderada', texto: `Diferencia moderada: la báscula marca ${cuanto}. Es normal en una báscula de bioimpedancia; los cálculos usan el valor de la báscula.` }
  return { nivel: 'grande', texto: `Difieren bastante: la báscula marca ${cuanto}. Conviene revisar la estatura, la fecha de nacimiento y el sexo, que la báscula también usa para estimar su RMR.` }
}

/** Todo lo que muestra «Tus números base», a partir del perfil, las mediciones y la fecha de referencia. */
export function calcularNumeros(p: PesoPerfil, data: PesoRecord[], hoy: string): NumerosVista {
  const filaPeso = masReciente(data, r => r.peso != null)
  const filaRmr = masReciente(data, rmrValido)
  const pesoKg = filaPeso?.peso ?? null
  const rmr = filaRmr?.rmr ?? null
  const nb = numerosBase(p, hoy, pesoKg, rmr)
  // La fórmula se evalúa con el peso de la misma medición que dio el RMR: si no, la diferencia mezclaría pesos de fechas distintas.
  const pesoRmr = filaRmr?.peso ?? pesoKg
  const tmbComparable = pesoRmr != null ? tmbMifflin(p, pesoRmr, hoy) : null
  const act = ACTIVIDADES.find(a => a.value === p.actividad) ?? ACTIVIDADES[1]
  return {
    edad: nb.edad,
    estaturaCm: p.estatura_cm,
    saludable: nb.peso_saludable,
    pesoKg,
    fechaPeso: filaPeso?.fecha ?? null,
    tmb: tmbComparable,
    rmr: nb.rmr_bascula,
    fechaRmr: nb.rmr_bascula != null ? filaRmr?.fecha ?? null : null,
    coherencia: compararBasal(tmbComparable, nb.rmr_bascula, p.fecha_nacimiento != null),
    gastoDiario: nb.gasto_diario,
    gastoSinEntrenamiento: nb.gasto_sin_entrenamiento,
    entrenamientoKcalDia: nb.entrenamiento_kcal_dia,
    gastoBase: nb.gasto_diario == null ? null : nb.rmr_bascula != null ? 'bascula' : 'formula',
    factor: nb.factor_actividad,
    actividad: { label: act.label, detalle: act.detalle },
    proteina: nb.proteina_g,
    agua: nb.agua_litros,
  }
}

export const etiquetaFecha = (f: string | null) => (f ? fmtFecha(f) : '')

// ── IMC con la estatura del perfil ───────────────────────────────────────────

/** Las mediciones con el IMC puesto al día para la estatura del perfil. El IMC que anota la báscula se calculó con la
 *  estatura de siempre (PERFIL_DEFAULT): con otra estatura contradiría los kg de cada corte y la franja de estado. Aquí
 *  se reemplaza por imcVigente (peso / estatura² a 1 decimal) para que tarjetas, Progreso, Meta y visuales no se
 *  contradigan. Con la estatura de fábrica se devuelve la MISMA lista (nada cambia y los hijos memoizados no se repintan).
 *  Una fila sin IMC en la báscula sigue sin él, igual que en buildFacts: el perfil cambia valores, no agrega puntos a la serie.
 *  El Historial y el formulario NO usan esto: muestran lo que marcó la báscula. */
export function conImcDelPerfil(data: PesoRecord[], p: PesoPerfil): PesoRecord[] {
  if (p.estatura_cm === PERFIL_DEFAULT.estatura_cm) return data
  return data.map(r => (r.imc == null ? r : { ...r, imc: imcVigente(r, p) }))
}
