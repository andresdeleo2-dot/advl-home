// Perfil de Andrés para /peso: los datos que no cambian en cada medición pero de los que dependen los cálculos
// (estatura → IMC y pesos objetivo, edad y sexo → gasto energético y rangos de grasa) y el contexto que se manda a
// la IA y a los prompts (actividad, lesiones, restricciones...). Antes la estatura, el sexo y el rango de edad estaban
// escritos fijos en el código y los prompts asumían el resto; ahora vienen de aquí.
// Módulo puro e isomórfico (sin dependencias de servidor ni de React): lo usan componentes, rutas y pruebas con node.
//
// CONTRATO COMPARTIDO — tipos, constantes y firmas de este archivo no se cambian sin coordinar; el dueño del
// archivo sólo puede AGREGAR exports.

export type Sexo = 'hombre' | 'mujer'
export type Actividad = 'sedentario' | 'ligera' | 'moderada' | 'alta'
export type Experiencia = 'principiante' | 'intermedio' | 'avanzado'
export type Equipo = 'gimnasio' | 'casa_mancuernas' | 'sin_equipo'
export type Alcohol = 'nunca' | 'ocasional' | 'frecuente'

export type PesoPerfil = {
  estatura_cm: number
  fecha_nacimiento: string | null        // 'YYYY-MM-DD'
  sexo: Sexo
  actividad: Actividad                   // día a día FUERA del entrenamiento (trabajo, pasos)
  dias_entrenamiento: number             // 0–7 por semana
  experiencia: Experiencia | null
  equipo: Equipo | null
  comidas_dia: number | null             // 1–8
  alcohol: Alcohol | null
  sueno_horas: number | null             // promedio por noche
  lesiones: string | null                // lesiones o limitaciones físicas
  restricciones: string | null           // alergias, intolerancias, vegetariano...
  preferencias: string | null            // comidas que le gustan/no, presupuesto, horarios
  notas_salud: string | null             // lo que su médico quiere que se considere (opcional)
}

// La actividad es la del día a día FUERA del entrenamiento (trabajo, pasos): los días de ejercicio van aparte, en
// `dias_entrenamiento`. Por eso ningún detalle menciona días de ejercicio.
// El factor es el de las tablas estándar (1.2 / 1.375 / 1.55 / 1.725) SIN el ejercicio que esas tablas ya suponen
// (1 a 3, 3 a 5 y 6 a 7 días por semana, más o menos): el entrenamiento se suma aparte y con los días reales
// (ver KCAL_POR_SESION). Usar los factores de la tabla completos contaría dos veces el ejercicio.
export const ACTIVIDADES: { value: Actividad; label: string; factor: number; detalle: string }[] = [
  { value: 'sedentario', label: 'Sedentario', factor: 1.2, detalle: 'Trabajo sentado y pocos pasos al día.' },
  { value: 'ligera', label: 'Ligera', factor: 1.3, detalle: 'Trabajo sentado la mayor parte del día, con algo de movimiento (caminar, escaleras).' },
  { value: 'moderada', label: 'Moderada', factor: 1.45, detalle: 'Te mueves bastante durante el día: de pie, caminando o con tareas físicas ligeras.' },
  { value: 'alta', label: 'Alta', factor: 1.6, detalle: 'Trabajo físico o muy activo durante el día (obra, almacén, reparto).' },
]

/** Calorías que gasta una sesión de entrenamiento POR ENCIMA del reposo (el reposo ya está en el gasto basal × factor).
 *  Cifra redonda para una sesión de unos 60 minutos de pesas o cardio moderado (≈ 5 MET: de 280 kcal con 70 kg a 360
 *  con 90 kg). Es una estimación; el gasto diario la reparte entre los 7 días de la semana. */
export const KCAL_POR_SESION = 300

/** Rango de proteína (g por kg de peso) que se muestra en «Tus números base» y que se manda a la IA. Es el mismo que
 *  usa el análisis (`proteina_g_por_dia_orientativa` de lib/peso.ts): la persona no debe ver dos rangos distintos. */
export const PROTEINA_G_KG = { min: 1.6, max: 2.0 } as const
export const EXPERIENCIAS: { value: Experiencia; label: string }[] = [
  { value: 'principiante', label: 'Principiante (menos de 1 año)' },
  { value: 'intermedio', label: 'Intermedio (1 a 3 años)' },
  { value: 'avanzado', label: 'Avanzado (más de 3 años)' },
]
export const EQUIPOS: { value: Equipo; label: string }[] = [
  { value: 'gimnasio', label: 'Gimnasio completo' },
  { value: 'casa_mancuernas', label: 'En casa con mancuernas y bandas' },
  { value: 'sin_equipo', label: 'Sin equipo (peso corporal)' },
]
export const ALCOHOLES: { value: Alcohol; label: string }[] = [
  { value: 'nunca', label: 'No tomo' },
  { value: 'ocasional', label: 'Ocasional (1 o 2 veces por semana)' },
  { value: 'frecuente', label: 'Frecuente (3 o más veces por semana)' },
]

export const MAX_TEXTO_PERFIL = 500

/** Igual que MI_CUMPLE de cumple.ts (se repite aquí para que este módulo no dependa de nada y se pueda probar con node). */
const FECHA_NACIMIENTO_DEFAULT = '1989-08-16'

/** Lo que se usaba antes de que existiera el perfil (estatura, sexo y edad fijos en el código, y los supuestos
 *  de los prompts). Se usa mientras Andrés no guarde el suyo: nada cambia hasta que lo haga. */
export const PERFIL_DEFAULT: PesoPerfil = {
  estatura_cm: 181,
  fecha_nacimiento: FECHA_NACIMIENTO_DEFAULT,
  sexo: 'hombre',
  actividad: 'ligera',
  dias_entrenamiento: 4,
  experiencia: null,
  equipo: null,
  comidas_dia: null,
  alcohol: null,
  sueno_horas: null,
  lesiones: null,
  restricciones: null,
  preferencias: null,
  notas_salud: null,
}

/** ¿Es el perfil de fábrica (Andrés aún no guardó el suyo, o guardó exactamente esos valores)? Se compara por valor, no
 *  por referencia: el que llega del servidor es otro objeto. Una sola definición para los prompts y para el pie del análisis. */
export const esPerfilDeFabrica = (p: PesoPerfil) => (Object.keys(PERFIL_DEFAULT) as (keyof PesoPerfil)[]).every(k => p[k] === PERFIL_DEFAULT[k])

/** Estado del perfil que carga la página. */
export type PerfilEstado = {
  perfil: PesoPerfil
  /** true = hay un perfil guardado; false = se está usando PERFIL_DEFAULT (conviene invitar a completarlo). */
  configurado: boolean
  /** false = la tabla peso_perfil no existe todavía (falta correr sql/peso-04-perfil.sql). */
  disponible: boolean
  /** Fecha ISO de la última vez que se guardó (null si nunca). */
  actualizado: string | null
}

// ── Cálculos derivados ──────────────────────────────────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10

/** ¿Es una fecha 'YYYY-MM-DD' que existe en el calendario? Se reconstruye y se compara: `Date.parse` aceptaría
 *  '1989-02-30' (V8 admite días 29 a 31 en cualquier mes) y la columna `date` de Postgres la rechaza. */
export function fechaIsoValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const y = +m[1], mes = +m[2], d = +m[3]
  const f = new Date(Date.UTC(y, mes - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d
}

/** Años cumplidos a la fecha `hoy` ('YYYY-MM-DD'); null si falta o no es válida la fecha de nacimiento. */
export function edadEn(nacimiento: string | null, hoy: string): number | null {
  if (!nacimiento || !fechaIsoValida(nacimiento) || !fechaIsoValida(hoy)) return null
  let e = +hoy.slice(0, 4) - +nacimiento.slice(0, 4)
  if (hoy.slice(5) < nacimiento.slice(5)) e--
  return e >= 0 && e < 120 ? e : null
}

export const tallaM = (p: PesoPerfil) => p.estatura_cm / 100
export const tallaCuadrada = (p: PesoPerfil) => tallaM(p) ** 2
/** Peso (kg) al que el IMC vale `imc` con la estatura del perfil. */
export const pesoParaIMC = (p: PesoPerfil, imc: number) => imc * tallaCuadrada(p)
/** Rango de peso con IMC normal (18.5 a 24.9) para la estatura del perfil. */
export const pesoSaludable = (p: PesoPerfil) => ({ min: r1(pesoParaIMC(p, 18.5)), max: r1(pesoParaIMC(p, 24.9)), imc25: r1(pesoParaIMC(p, 25)) })

/** Tasa metabólica basal por Mifflin-St Jeor (kcal/día) con el peso dado; null si falta la edad. */
export function tmbMifflin(p: PesoPerfil, pesoKg: number, hoy: string): number | null {
  const edad = edadEn(p.fecha_nacimiento, hoy)
  if (edad == null) return null
  return Math.round(10 * pesoKg + 6.25 * p.estatura_cm - 5 * edad + (p.sexo === 'hombre' ? 5 : -161))
}

export const factorActividad = (p: PesoPerfil) => (ACTIVIDADES.find(a => a.value === p.actividad) ?? ACTIVIDADES[1]).factor

/** Calorías por día que suma el entrenamiento: sesiones por semana × KCAL_POR_SESION, repartidas en los 7 días. */
export const entrenamientoKcalDia = (p: PesoPerfil) => Math.round((p.dias_entrenamiento * KCAL_POR_SESION) / 7)

/** Números base que se muestran en el perfil y se mandan a la IA. `rmrBascula` es el RMR que mide la báscula
 *  (si hay): se prefiere sobre la fórmula, pero se informan los dos para que se vea si son coherentes.
 *  El gasto diario = gasto basal × factor de la actividad fuera del entrenamiento + las calorías del entrenamiento
 *  (días por semana del perfil). Se redondea cada sumando para que lo que se muestra cuadre con el total. */
export function numerosBase(p: PesoPerfil, hoy: string, pesoKg: number | null, rmrBascula: number | null) {
  const edad = edadEn(p.fecha_nacimiento, hoy)
  const tmb = pesoKg != null ? tmbMifflin(p, pesoKg, hoy) : null
  const rmrUsable = rmrBascula != null && rmrBascula > 800 && rmrBascula < 5000 ? rmrBascula : null
  const base = rmrUsable ?? tmb
  const factor = factorActividad(p)
  const sinEntrenar = base != null ? Math.round(base * factor) : null
  const entrena = entrenamientoKcalDia(p)
  return {
    edad,
    talla_m: tallaM(p),
    peso_saludable: pesoSaludable(p),
    tmb_mifflin: tmb,
    rmr_bascula: rmrUsable,
    factor_actividad: factor,
    /** Gasto basal × factor, sin contar el entrenamiento. */
    gasto_sin_entrenamiento: sinEntrenar,
    /** Lo que suma el entrenamiento por día (0 si no entrena). */
    entrenamiento_kcal_dia: entrena,
    gasto_diario: sinEntrenar != null ? sinEntrenar + entrena : null,
    proteina_g: pesoKg != null ? { min: Math.round(pesoKg * PROTEINA_G_KG.min), max: Math.round(pesoKg * PROTEINA_G_KG.max) } : null,
    agua_litros: pesoKg != null ? r1(pesoKg * 0.035) : null,
  }
}

/** Umbrales de % de grasa por zona. Los de hombre son los que ya usaba la página (referencia para 30–40 años);
 *  para mujer se desplazan 8 puntos, que es la diferencia habitual entre sexos en las tablas de referencia
 *  (ACE, Gallagher): es una aproximación, no una norma clínica, y la interfaz debe decirlo. */
export function desplazamientoGrasa(p: PesoPerfil) {
  return p.sexo === 'mujer' ? 8 : 0
}

// ── Validación (compartida por el formulario y la API) ─────────────────────

const ENUM = <T extends string>(v: unknown, lista: { value: T }[]): T | null =>
  typeof v === 'string' && lista.some(x => x.value === v) ? (v as T) : null

// Caracteres de control (menos tabulador y salto de línea) y sustitutos UTF-16 sueltos: Postgres no puede guardar
// \u0000 en una columna text ni texto UTF-8 inválido, y el guardado fallaría con un error genérico.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const SUSTITUTO = /[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff]/g   // un par completo se conserva; un medio par se quita

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  let t = v.replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(SUSTITUTO, m => (m.length === 2 ? m : '')).trim()
  t = t.slice(0, MAX_TEXTO_PERFIL)
  // El corte pudo partir un emoji por la mitad: se quita la mitad que quedó al final.
  if (/[\ud800-\udbff]$/.test(t)) t = t.slice(0, -1)
  return t || null
}
const entero = (v: unknown, min: number, max: number): number | null | undefined => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!Number.isFinite(n)) return undefined          // undefined = valor inválido (distinto de «vacío»)
  const r = Math.round(n)
  return r >= min && r <= max ? r : undefined
}

/** Valida y normaliza el cuerpo de un guardado. `hoy` ('YYYY-MM-DD') sirve para acotar la fecha de nacimiento. */
export function validarPerfil(body: unknown, hoy: string): { ok: true; valor: PesoPerfil } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Datos inválidos.' }
  const b = body as Record<string, unknown>

  const est = typeof b.estatura_cm === 'number' ? b.estatura_cm : parseFloat(String(b.estatura_cm ?? ''))
  if (!Number.isFinite(est) || est < 120 || est > 230) return { ok: false, error: 'La estatura debe estar entre 120 y 230 cm.' }

  let nac: string | null = null
  if (b.fecha_nacimiento !== null && b.fecha_nacimiento !== undefined && b.fecha_nacimiento !== '') {
    const f = String(b.fecha_nacimiento)
    const edad = edadEn(f, hoy)
    if (!fechaIsoValida(f) || edad == null || edad < 10 || edad > 100) {
      return { ok: false, error: 'La fecha de nacimiento no es válida.' }
    }
    nac = f
  }

  const sexo = ENUM(b.sexo, [{ value: 'hombre' as const }, { value: 'mujer' as const }])
  if (!sexo) return { ok: false, error: 'Elige tu sexo.' }
  const actividad = ENUM(b.actividad, ACTIVIDADES)
  if (!actividad) return { ok: false, error: 'Elige tu nivel de actividad.' }

  const dias = entero(b.dias_entrenamiento, 0, 7)
  if (dias === undefined || dias === null) return { ok: false, error: 'Los días de entrenamiento van de 0 a 7.' }
  const comidas = entero(b.comidas_dia, 1, 8)
  if (comidas === undefined) return { ok: false, error: 'Las comidas al día van de 1 a 8.' }
  const sueno = entero(b.sueno_horas, 3, 12)
  if (sueno === undefined) return { ok: false, error: 'Las horas de sueño van de 3 a 12.' }

  return {
    ok: true,
    valor: {
      estatura_cm: Math.round(est * 10) / 10,
      fecha_nacimiento: nac,
      sexo,
      actividad,
      dias_entrenamiento: dias,
      experiencia: ENUM(b.experiencia, EXPERIENCIAS),
      equipo: ENUM(b.equipo, EQUIPOS),
      comidas_dia: comidas,
      alcohol: ENUM(b.alcohol, ALCOHOLES),
      sueno_horas: sueno,
      lesiones: texto(b.lesiones),
      restricciones: texto(b.restricciones),
      preferencias: texto(b.preferencias),
      notas_salud: texto(b.notas_salud),
    },
  }
}

/** Huella del perfil: si cambia algo que afecta al análisis, el análisis guardado deja de corresponder. */
export function huellaPerfil(p: PesoPerfil): string {
  const s = JSON.stringify(p)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Huella extra del análisis con IA: los planes en uso (la cadena que da extraPlanes de lib/peso.ts) y, SOLO si
 *  Andrés ya guardó su perfil, la huella del perfil. Con el perfil sin configurar no agrega nada, así que los
 *  análisis guardados antes de que existiera el perfil siguen vigentes. La arman igual la página y la ruta
 *  del análisis (nunca a mano): si divergieran, el análisis se regeneraría en cada visita. */
export function extraAnalisis(extraPlanesStr: string, perfil: PesoPerfil, configurado: boolean): string {
  return configurado ? `${extraPlanesStr}|perfil:${huellaPerfil(perfil)}` : extraPlanesStr
}

/** Puntos que se SUMAN al % de músculo de la báscula antes de clasificarlo con los cortes de hombre (30/33/36).
 *  Aproximación (el % de músculo de la mujer es menor a igual forma física), no una norma clínica. */
export const desplazamientoMusculo = (p: Pick<PesoPerfil, 'sexo'>) => (p.sexo === 'mujer' ? 8 : 0)
