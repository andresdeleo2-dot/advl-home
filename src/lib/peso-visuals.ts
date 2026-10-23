// Cálculos puros de los widgets visuales de /peso (src/app/peso/PesoVisuales.tsx).
// Todo lo numérico sale de aquí, en código: la página solo dibuja. Sin React ni dependencias de
// servidor, y con imports RELATIVOS para poder probarlo con node. Las fechas son 'YYYY-MM-DD' y se
// manejan con las utilidades UTC de ./peso (nada de `new Date()` aquí: "hoy" llega como argumento).
// La estatura y el sexo llegan en el parámetro `perfil`, OBLIGATORIO en las funciones que lo usan: así tsc avisa si un
// llamador se olvida de pasarlo (con PERFIL_DEFAULT valen los números de antes de que existiera el perfil). De él salen
// los kg de cada corte del IMC y los umbrales del % de grasa.

import {
  classifyIMC, classifyFat, classifyVisceral, imcBasculaVigente,
  masaGrasa, masaMagra, daysBetween, addDays, addMonths, etapaActual, buildFacts,
} from './peso'
import type { PesoRecord, PesoPlan, Classification, Level } from './peso'
import { desplazamientoGrasa, pesoParaIMC, pesoSaludable, tallaCuadrada } from './peso-perfil'
import type { PesoPerfil } from './peso-perfil'

// ── Utilidades ──────────────────────────────────────────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
/** Techo a 1 decimal ignorando el ruido de coma flotante (0.1000000000000014 → 0.1, no 0.2). */
const techo1 = (n: number) => Math.ceil(Math.round(n * 1000) / 100) / 10
const suelo1 = (n: number) => Math.floor(Math.round(n * 1000) / 100) / 10
const finito = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

export const ordenar = (rows: PesoRecord[]) => [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha))

/** El registro más reciente que SÍ trae ese campo (la captura rápida guarda registros con solo peso). */
function ultimoCon(sorted: PesoRecord[], key: 'peso' | 'pct_grasa' | 'grasa_visceral'): PesoRecord | null {
  for (let i = sorted.length - 1; i >= 0; i--) if (finito(sorted[i][key])) return sorted[i]
  return null
}

// ── Perfil: estatura y sexo ─────────────────────────────────────────────────

/** Estatura para escribirla en un texto: "1.81" (o "1.705" si el perfil trae decimales en los centímetros). */
export function tallaTxt(p: PesoPerfil) {
  return (p.estatura_cm / 100).toFixed(Number.isInteger(p.estatura_cm) ? 2 : 3)
}
/** Rango de peso con IMC normal para la estatura del perfil, listo para un texto: "60.6 a 81.6 kg". */
export function rangoSaludableTxt(p: PesoPerfil) {
  const s = pesoSaludable(p)
  return `${s.min.toFixed(1)} a ${s.max.toFixed(1)} kg`
}
/** IMC que reportó la báscula, solo si sigue valiendo para la estatura del perfil (si no, null y quien llama recalcula
 *  peso / estatura²). Es el mismo de peso.ts: una sola definición, para que la franja, las escalas y la IA nunca difieran. */
export const imcEquipo = imcBasculaVigente

const MINUS = '−'
/** Número con signo y decimales fijos ("+3.7", "−0.6"); el cero no lleva signo. */
export function sg(n: number, dec = 1) {
  const v = Number(n.toFixed(dec))
  if (v === 0) return (0).toFixed(dec)
  return `${v > 0 ? '+' : MINUS}${Math.abs(v).toFixed(dec)}`
}
export const plural = (n: number, uno: string, varios: string) => (Math.abs(n) === 1 ? uno : varios)

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** '2027-03-03' → '3 mar 2027'. */
export function fmtFechaLarga(d: string) {
  return `${+d.slice(8, 10)} ${MESES[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`
}
/** '2026-04-01' → 'abr 26'. */
export function fmtMesAnio(d: string) {
  return `${MESES[+d.slice(5, 7) - 1]} ${d.slice(2, 4)}`
}
/** 'dd/mm/aa' (igual que fmtFecha de ./peso, repetido para no depender de más exports). */
export function fmtCorta(d: string) {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`
}
/** Semanas → "≈ 9 meses" / "≈ 1 año 2 meses"; null si es poco (se lee mejor en semanas). */
export function aproxMeses(semanas: number): string | null {
  if (semanas < 9) return null
  const meses = Math.round((semanas * 7) / 30.44)
  if (meses < 12) return `≈ ${meses} ${plural(meses, 'mes', 'meses')}`
  const a = Math.floor(meses / 12), m = meses % 12
  return `≈ ${a} ${plural(a, 'año', 'años')}${m ? ` ${m} ${plural(m, 'mes', 'meses')}` : ''}`
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) DÓNDE ESTÁS — tres escalas con marcador
// ═══════════════════════════════════════════════════════════════════════════

export type EscalaId = 'imc' | 'grasa' | 'visceral'
export type ZonaEscala = { desde: number; hasta: number; label: string; color: string; level: Level; rango: string }
export type PasoEscala = { tipo: 'bajar' | 'subir' | 'margen' | 'ok'; texto: string }
export type MarcaEje = { pos: number; texto: string; sub?: string }
export type Escala = {
  id: EscalaId
  titulo: string
  sufijo: string                       // ' %' para grasa
  valor: number | null
  valorTxt: string
  clasif: Classification | null
  fecha: string | null                 // de qué medición sale el dato
  deOtraFecha: boolean                 // true = la última medición no lo trae y se usó una anterior
  eje: { min: number; max: number }
  zonas: ZonaEscala[]
  idx: number                          // zona actual (-1 sin dato)
  pos: number | null                   // 0..1 sobre el eje (ya acotado)
  fuera: 'bajo' | 'alto' | null        // el valor se sale del eje: el marcador queda en el borde
  marcas: MarcaEje[]
  pasos: PasoEscala[]
  /** Aclaración sobre los cortes de la escala (solo el % de grasa de una mujer, cuyos umbrales se desplazan). */
  nota?: string
}
export type CalcEscalas = {
  ultimaFecha: string
  escalas: Escala[]
  equivalencias: {
    tallaM: number; kgImc25: number; kgImc30: number; pesoKg: number | null; fechaPeso: string | null
    /** Pesos con IMC 18.5 y 24.9 para la estatura del perfil (el rango normal). */
    saludable: { min: number; max: number }
  }
}

type CfgEscala = {
  id: EscalaId; titulo: string; sufijo: string
  eje: [number, number]
  cortes: number[]                     // umbrales reales de classify*
  inclusivo: boolean                   // true: v <= corte pertenece a la zona de abajo (visceral)
  desfase: number                      // visceral es entero: el borde se dibuja medio punto después del corte
  continuo: boolean                    // IMC: valor continuo (peso/talla²)
  paso: number
  rangos: string[]
  clasificar: (v: number) => Classification
  nota?: string                        // aclaración que se muestra bajo la escala
}

/** Rangos en texto a partir de los cortes: [10, 15] → ['< 10', '10–15', '≥ 15']. */
const rangosDe = (c: number[]) => [`< ${c[0]}`, ...c.slice(1).map((v, i) => `${c[i]}–${v}`), `≥ ${c[c.length - 1]}`]

const CFG_BASE: Record<'imc' | 'visceral', CfgEscala> = {
  imc: {
    id: 'imc', titulo: 'IMC', sufijo: '', eje: [15, 40], cortes: [18.5, 25, 30, 35], inclusivo: false, desfase: 0,
    continuo: true, paso: 0.1, rangos: ['< 18.5', '18.5–24.9', '25–29.9', '30–34.9', '≥ 35'], clasificar: classifyIMC,
  },
  visceral: {
    id: 'visceral', titulo: 'Grasa visceral', sufijo: '', eje: [0.5, 20.5], cortes: [9, 14], inclusivo: true, desfase: 0.5,
    continuo: false, paso: 1, rangos: ['≤ 9', '10–14', '≥ 15'], clasificar: classifyVisceral,
  },
}

/** Escala del % de grasa: los cortes, el eje y la clasificación se desplazan por sexo (desplazamientoGrasa), así
 *  que el marcador, las zonas y los «te faltan X puntos» hablan siempre del % de grasa real. Para hombre el
 *  desplazamiento es 0 y queda la referencia de siempre. */
function cfgGrasa(p: PesoPerfil): CfgEscala {
  const d = desplazamientoGrasa(p)
  const cortes = [10, 15, 20, 25, 30].map(c => c + d)
  return {
    id: 'grasa', titulo: '% de grasa', sufijo: ' %', eje: [5 + d, 40 + d], cortes, inclusivo: false, desfase: 0,
    continuo: false, paso: 0.1, rangos: rangosDe(cortes), clasificar: v => classifyFat(v, d),
    nota: d ? `Cortes ajustados para mujer: +${d} puntos sobre la referencia de hombre. Es una aproximación de las tablas habituales, no una norma clínica.` : undefined,
  }
}
const cfgDe = (id: EscalaId, p: PesoPerfil): CfgEscala => (id === 'grasa' ? cfgGrasa(p) : CFG_BASE[id])

function zonasDe(cfg: CfgEscala): ZonaEscala[] {
  const bordes = [cfg.eje[0], ...cfg.cortes.map(c => c + cfg.desfase), cfg.eje[1]]
  return cfg.rangos.map((rango, i) => {
    // Un valor que caiga dentro de la zona: así el nombre, el color y el nivel salen de classify*.
    const muestra = i === 0 ? cfg.eje[0] : cfg.cortes[i - 1] + (cfg.inclusivo ? 1 : 0)
    const c = cfg.clasificar(muestra)
    return { desde: bordes[i], hasta: bordes[i + 1], label: c.label, color: c.color, level: c.level, rango }
  })
}

function indiceZona(cfg: CfgEscala, v: number) {
  return cfg.cortes.filter(c => (cfg.inclusivo ? v > c : v >= c)).length
}

/** Cuánto hay que bajar para quedar DENTRO de la zona de abajo (estrictamente por debajo del corte). */
function faltaBajar(cfg: CfgEscala, valor: number, corte: number) {
  let f = cfg.paso >= 1 ? Math.ceil(Math.round((valor - corte) * 1000) / 1000) : techo1(valor - corte)
  if (!cfg.inclusivo && valor - f >= corte - 1e-9) f = r2(f + cfg.paso)   // quedar justo en el corte no cuenta
  return Math.max(cfg.paso, f)
}
/** Cuánto hay que subir para entrar a la zona de arriba (llegar al corte). */
function faltaSubir(cfg: CfgEscala, valor: number, corte: number) {
  const f = cfg.paso >= 1 ? Math.ceil(Math.round((corte + (cfg.inclusivo ? 1 : 0) - valor) * 1000) / 1000) : techo1(corte - valor)
  return Math.max(cfg.paso, f)
}

type CtxEscala = { pesoKg: number | null; magraKg: number | null; pesoGrasaKg: number | null; perfil: PesoPerfil }

const nTxt = (cfg: CfgEscala, n: number) => (cfg.paso >= 1 ? String(Math.round(n)) : n.toFixed(1))
const unidadTxt = (cfg: CfgEscala, n: number) =>
  cfg.id === 'imc' ? plural(n, 'punto', 'puntos') + ' de IMC'
  : cfg.id === 'grasa' ? plural(n, 'punto', 'puntos') + ' de grasa'
  : plural(n, 'nivel', 'niveles')
const faltaTxt = (n: number) => (n === 1 ? 'Te falta' : 'Te faltan')

function limiteBajar(cfg: CfgEscala, corte: number) {
  return cfg.id === 'imc' ? `IMC menor a ${corte}` : cfg.id === 'grasa' ? `menos de ${corte} %` : `${corte} o menos`
}
function limiteSubir(cfg: CfgEscala, corte: number) {
  return cfg.id === 'imc' ? `IMC de ${corte} o más` : cfg.id === 'grasa' ? `${corte} % o más` : `${corte + 1} o más`
}

/** Los kilos que equivale cruzar un corte (IMC: peso para ese IMC con la talla; grasa: conservando la masa magra). */
function kgHasta(cfg: CfgEscala, corte: number, ctx: CtxEscala): number | null {
  if (cfg.id === 'imc' && ctx.pesoKg != null) return r1(ctx.pesoKg - pesoParaIMC(ctx.perfil, corte))
  if (cfg.id === 'grasa' && ctx.magraKg != null && ctx.pesoGrasaKg != null) return r1(ctx.pesoGrasaKg - ctx.magraKg / (1 - corte / 100))
  return null
}

function pasosDe(cfg: CfgEscala, valor: number, idx: number, zonas: ZonaEscala[], ctx: CtxEscala): PasoEscala[] {
  const z = zonas[idx]
  const out: PasoEscala[] = []

  if (z.level === 'good') {
    // En zona buena: si la de arriba ya no lo es, cuánto margen queda antes de salir.
    const sig = zonas[idx + 1]
    if (sig && sig.level !== 'good') {
      const corte = cfg.cortes[idx]
      const margen = cfg.inclusivo ? corte - valor : suelo1(corte - valor)
      const kg = cfg.id === 'imc' && ctx.pesoKg != null ? r1(pesoParaIMC(ctx.perfil, corte) - ctx.pesoKg) : null
      const kgT = kg != null && kg > 0 ? ` (≈ ${kg.toFixed(1)} kg)` : ''
      out.push(margen > 0
        ? { tipo: 'margen', texto: `Estás en ${z.label}: te quedan ${nTxt(cfg, margen)} ${unidadTxt(cfg, margen)}${kgT} de margen antes de pasar a ${sig.label} (${limiteSubir(cfg, corte)}).` }
        : { tipo: 'margen', texto: `Estás en ${z.label}, justo en el límite con ${sig.label} (${limiteSubir(cfg, corte)}).` })
    } else {
      out.push({ tipo: 'ok', texto: `Estás en ${z.label}: es un rango saludable.` })
    }
    return out
  }

  if (idx === 0) {
    // Por debajo de lo recomendable (bajo peso, grasa muy baja): el camino es hacia arriba.
    const corte = cfg.cortes[0]
    const f = faltaSubir(cfg, valor, corte)
    const kg = cfg.id === 'imc' && ctx.pesoKg != null ? r1(pesoParaIMC(ctx.perfil, corte) - ctx.pesoKg) : null
    out.push({ tipo: 'subir', texto: `${faltaTxt(f)} ${nTxt(cfg, f)} ${unidadTxt(cfg, f)}${kg != null && kg > 0 ? ` (≈ ${kg.toFixed(1)} kg)` : ''} para llegar a ${zonas[1].label} (${limiteSubir(cfg, corte)}).` })
    return out
  }

  // Zona con problema: primero la zona de abajo, luego (si está más lejos) la primera zona saludable.
  const corte = cfg.cortes[idx - 1]
  const f = faltaBajar(cfg, valor, corte)
  const kg = kgHasta(cfg, corte, ctx)
  let texto = `${faltaTxt(f)} ${nTxt(cfg, f)} ${unidadTxt(cfg, f)} para pasar a ${zonas[idx - 1].label} (${limiteBajar(cfg, corte)}).`
  if (cfg.id === 'imc' && kg != null && kg > 0) {
    texto += ` Con tu talla de ${tallaTxt(ctx.perfil)} m eso es pesar menos de ${r1(pesoParaIMC(ctx.perfil, corte)).toFixed(1)} kg: ≈ ${kg.toFixed(1)} kg menos que hoy.`
  }
  out.push({ tipo: 'bajar', texto })

  let j = idx - 2
  while (j >= 0 && zonas[j].level !== 'good') j--
  if (j >= 0 && j !== idx - 1) {
    const corteJ = cfg.cortes[j]               // la zona j termina en cortes[j]
    const fJ = faltaBajar(cfg, valor, corteJ)
    const kgJ = kgHasta(cfg, corteJ, ctx)
    let t = `Para llegar a ${zonas[j].label} (${limiteBajar(cfg, corteJ)}) te ${fJ === 1 ? 'falta' : 'faltan'} ${nTxt(cfg, fJ)} ${unidadTxt(cfg, fJ)}`
    if (kgJ != null && kgJ > 0) t += cfg.id === 'grasa' ? `: unos ${kgJ.toFixed(1)} kg de grasa si conservas tu masa magra` : ` (≈ ${kgJ.toFixed(1)} kg)`
    out.push({ tipo: 'bajar', texto: `${t}.` })
  }
  return out
}

function armarEscala(
  cfg: CfgEscala, valor: number | null, fecha: string | null, ultimaFecha: string, ctx: CtxEscala,
): Escala {
  const zonas = zonasDe(cfg)
  const [min, max] = cfg.eje
  const marcas: MarcaEje[] = cfg.cortes.map(c => {
    const pos = (c + cfg.desfase - min) / (max - min)
    const texto = cfg.id === 'visceral' ? String(c + 1) : String(c)
    const sub = cfg.id === 'imc' && (c === 25 || c === 30) ? `${r1(pesoParaIMC(ctx.perfil, c)).toFixed(1)} kg` : undefined
    return { pos, texto, sub }
  })
  const base = { id: cfg.id, titulo: cfg.titulo, sufijo: cfg.sufijo, eje: { min, max }, zonas, marcas, ...(cfg.nota ? { nota: cfg.nota } : {}) }
  if (valor == null) {
    return { ...base, valor: null, valorTxt: '—', clasif: null, fecha: null, deOtraFecha: false, idx: -1, pos: null, fuera: null, pasos: [] }
  }
  const idx = indiceZona(cfg, valor)
  const bruto = (valor - min) / (max - min)
  return {
    ...base,
    valor,
    valorTxt: cfg.id === 'visceral' && Number.isInteger(valor) ? String(valor) : valor.toFixed(1),
    clasif: cfg.clasificar(valor),
    fecha,
    deOtraFecha: fecha != null && fecha !== ultimaFecha,
    idx,
    pos: Math.min(1, Math.max(0, bruto)),
    fuera: bruto < 0 ? 'bajo' : bruto > 1 ? 'alto' : null,
    pasos: pasosDe(cfg, valor, idx, zonas, ctx),
  }
}

export function calcEscalas(rows: PesoRecord[], perfil: PesoPerfil): CalcEscalas | null {
  const s = ordenar(rows)
  if (!s.length) return null
  const ultima = s[s.length - 1]
  const rPeso = ultimoCon(s, 'peso')
  const rGrasa = ultimoCon(s, 'pct_grasa')
  const rVisc = ultimoCon(s, 'grasa_visceral')

  // IMC igual que la franja de estado: el del equipo si el registro lo trae (y vale para la estatura del perfil,
  // ver imcEquipo); si no (captura rápida con solo peso), peso / talla². Así los dos lugares nunca se contradicen.
  const h2 = tallaCuadrada(perfil)
  const imc = rPeso ? (imcEquipo(rPeso, perfil) ?? r1(rPeso.peso! / h2)) : null
  const pesoKg = rPeso?.peso ?? null
  const magraKg = rGrasa ? masaMagra(rGrasa) : null
  const ctx: CtxEscala = { pesoKg, magraKg, pesoGrasaKg: rGrasa?.peso ?? null, perfil }
  const { min: kgMin, max: kgMax } = pesoSaludable(perfil)

  return {
    ultimaFecha: ultima.fecha,
    escalas: [
      armarEscala(cfgDe('imc', perfil), imc, rPeso?.fecha ?? null, ultima.fecha, ctx),
      armarEscala(cfgDe('grasa', perfil), rGrasa?.pct_grasa ?? null, rGrasa?.fecha ?? null, ultima.fecha, ctx),
      armarEscala(cfgDe('visceral', perfil), rVisc?.grasa_visceral ?? null, rVisc?.fecha ?? null, ultima.fecha, ctx),
    ],
    equivalencias: {
      tallaM: perfil.estatura_cm / 100, kgImc25: r1(pesoParaIMC(perfil, 25)), kgImc30: r1(pesoParaIMC(perfil, 30)),
      pesoKg, fechaPeso: rPeso?.fecha ?? null, saludable: { min: kgMin, max: kgMax },
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) ¿DE DÓNDE VINO EL CAMBIO? — grasa vs masa magra
// ═══════════════════════════════════════════════════════════════════════════

export type PeriodoComp = '3m' | '6m' | '1a' | 'marca' | 'todo'
export const PERIODOS_COMP: { value: PeriodoComp; label: string }[] = [
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '1a', label: '1 año' },
  { value: 'marca', label: 'Desde mi mejor marca' },
  { value: 'todo', label: 'Todo' },
]
export function periodoMasLargo(p: PeriodoComp): PeriodoComp | null {
  const i = PERIODOS_COMP.findIndex(x => x.value === p)
  return i >= 0 && i < PERIODOS_COMP.length - 1 ? PERIODOS_COMP[i + 1].value : null
}

export type PuntoComp = { fecha: string; peso: number; pct: number; grasa: number; magra: number }
export type CalcComp =
  | { ok: false; motivo: string; sugerencia: PeriodoComp | null }
  | {
      ok: true; periodo: PeriodoComp
      inicio: PuntoComp; fin: PuntoComp; dias: number; n: number
      dPeso: number; dGrasa: number; dMagra: number; dPct: number
      etiqueta: string                     // "Desde tu mejor marca", "Últimos 6 meses"…
      frase: string; detalle: string
      notas: string[]
    }

/** Frase determinista: qué parte del cambio de peso fue grasa y qué parte masa magra. */
export function fraseComposicion(dp: number, dg: number, dm: number): { frase: string; detalle: string } {
  const kg = (n: number) => `${Math.abs(n).toFixed(1)} kg`
  const reparto = `masa grasa ${sg(dg)} kg y masa magra ${sg(dm)} kg`
  const ESTABLE = 0.5

  if (dp >= ESTABLE) {
    if (dg > 0 && dm >= 0) {
      const pct = Math.round((dg / (dg + dm)) * 100)
      return { frase: `El ${pct} % de lo que subiste fue grasa.`, detalle: `Subiste ${kg(dp)}: ${kg(dg)} fueron de masa grasa y ${kg(dm)} de masa magra.` }
    }
    if (dg > 0 && dm < 0) {
      return { frase: 'Subiste de peso y, además, perdiste masa magra.', detalle: `Subiste ${kg(dp)}, pero con ${reparto}: la grasa subió más de lo que marca la báscula.` }
    }
    if (dm > 0) {
      return { frase: 'Lo que subiste fue masa magra, no grasa.', detalle: `Subiste ${kg(dp)}: ${reparto}.` }
    }
    return { frase: `Subiste ${kg(dp)}.`, detalle: `Composición: ${reparto}.` }
  }

  if (dp <= -ESTABLE) {
    if (dg < 0 && dm <= 0) {
      const pct = Math.round((dg / (dg + dm)) * 100)
      return { frase: `El ${pct} % de lo que bajaste fue grasa.`, detalle: `Bajaste ${kg(dp)}: ${kg(dg)} fueron de masa grasa y ${kg(dm)} de masa magra.` }
    }
    if (dg < 0 && dm > 0) {
      return { frase: 'Bajaste grasa y ganaste masa magra.', detalle: `Tu peso cambió ${sg(dp)} kg, con ${reparto}: es lo que se busca.` }
    }
    if (dm < 0) {
      return { frase: 'Lo que bajaste fue masa magra, no grasa.', detalle: `Bajaste ${kg(dp)}, con ${reparto}. Conviene cuidar la proteína y la fuerza para no perder músculo.` }
    }
    return { frase: `Bajaste ${kg(dp)}.`, detalle: `Composición: ${reparto}.` }
  }

  // Peso casi igual
  if (Math.abs(dg) < ESTABLE && Math.abs(dm) < ESTABLE) {
    return { frase: 'Tu peso y tu composición casi no cambiaron.', detalle: `En el periodo: peso ${sg(dp)} kg, ${reparto}.` }
  }
  if (dg < 0 && dm > 0) {
    return { frase: 'Tu peso casi no cambió, pero tu composición mejoró.', detalle: `Peso ${sg(dp)} kg, con ${reparto}: menos grasa y más masa magra.` }
  }
  if (dg > 0 && dm < 0) {
    return { frase: 'Tu peso casi no cambió, pero tu composición empeoró.', detalle: `Peso ${sg(dp)} kg, con ${reparto}: más grasa y menos masa magra.` }
  }
  return { frase: 'Tu peso casi no cambió.', detalle: `Peso ${sg(dp)} kg, con ${reparto}.` }
}

/** El salto más grande de % de grasa entre dos mediciones separadas por ≤ 21 días: es la vara de cuánto
 *  ruido tiene la bioimpedancia en TUS datos (hidratación, comida, hora). null si hay < 2 puntos. */
export function ruidoGrasa(rows: PesoRecord[]) {
  const c = ordenar(rows).filter(r => finito(r.pct_grasa))
  let mejor: { puntos: number; de: string; a: string; dias: number } | null = null
  for (let i = 1; i < c.length; i++) {
    const dias = daysBetween(c[i - 1].fecha, c[i].fecha)
    if (dias > 21) continue
    const puntos = r1(Math.abs(c[i].pct_grasa! - c[i - 1].pct_grasa!))
    if (!mejor || puntos > mejor.puntos) mejor = { puntos, de: c[i - 1].fecha, a: c[i].fecha, dias }
  }
  return mejor
}

export function calcComposicion(rows: PesoRecord[], periodo: PeriodoComp): CalcComp {
  const s = ordenar(rows)
  const completos = s.filter(r => finito(r.peso) && finito(r.pct_grasa))
  const sugerencia = periodoMasLargo(periodo)
  if (completos.length < 2) {
    return { ok: false, motivo: 'Necesito al menos dos mediciones con peso y % de grasa para comparar.', sugerencia: null }
  }
  const pc = (r: PesoRecord): PuntoComp => ({ fecha: r.fecha, peso: r.peso!, pct: r.pct_grasa!, grasa: masaGrasa(r)!, magra: masaMagra(r)! })
  const finR = completos[completos.length - 1]
  const fin = pc(finR)

  let iniR: PesoRecord | undefined
  let etiqueta = ''
  if (periodo === 'marca') {
    // Mejor marca = su peso más bajo dentro de la etapa actual (lo anterior al último hueco de > 1 año es otra vida).
    const etapa = etapaActual(completos)
    let best: PesoRecord | null = null
    for (const r of etapa) if (!best || r.peso! < best.peso!) best = r
    if (!best || best.fecha >= fin.fecha) {
      return {
        ok: false, sugerencia,
        motivo: `Tu medición más reciente (${fmtCorta(fin.fecha)}, ${fin.peso} kg) es tu mejor marca: no hay un punto mejor con qué comparar.`,
      }
    }
    iniR = best
    etiqueta = `Desde tu mejor marca (${best.peso} kg)`
  } else if (periodo === 'todo') {
    iniR = completos[0]
    etiqueta = 'Todo tu historial'
  } else {
    const meses = periodo === '3m' ? 3 : periodo === '6m' ? 6 : 12
    const desde = addMonths(fin.fecha, -meses)
    iniR = completos.find(r => r.fecha >= desde && r.fecha < fin.fecha)
    etiqueta = periodo === '1a' ? 'Último año' : `Últimos ${meses} meses`
  }
  if (!iniR || iniR.fecha >= fin.fecha) {
    return {
      ok: false, sugerencia,
      motivo: 'No hay una medición anterior con % de grasa dentro de este periodo, así que no hay con qué comparar.',
    }
  }

  const inicio = pc(iniR)
  const dias = daysBetween(inicio.fecha, fin.fecha)
  const dPeso = r2(fin.peso - inicio.peso)
  const dGrasa = r2(fin.grasa - inicio.grasa)
  const dMagra = r2(fin.magra - inicio.magra)
  const dPct = r1(fin.pct - inicio.pct)
  const { frase, detalle } = fraseComposicion(dPeso, dGrasa, dMagra)

  const notas: string[] = []
  const ultimaAny = s[s.length - 1]
  if (ultimaAny.fecha !== fin.fecha) {
    notas.push(`Tu medición más reciente (${fmtCorta(ultimaAny.fecha)}) no trae % de grasa, así que la comparación llega hasta la del ${fmtCorta(fin.fecha)}.`)
  }
  if (dias < 30) {
    notas.push(`Solo hay ${dias} ${plural(dias, 'día', 'días')} entre las dos mediciones: en periodos tan cortos el ruido de la báscula pesa más que el cambio real.`)
  }
  const etapa0 = etapaActual(s)[0]
  if (etapa0 && inicio.fecha < etapa0.fecha) {
    const huecoAnios = r1(daysBetween(inicio.fecha, etapa0.fecha) / 365.25)
    notas.push(`La primera medición es de antes de un hueco de ${huecoAnios.toFixed(1)} años sin medirte: es otra etapa, tómalo como contexto y no como comparación directa.`)
  }
  notas.push('La bioimpedancia es una estimación: el % de grasa cambia con la hidratación, la comida y la hora del día. Úsalo como orientación, no como dato exacto.')
  const ruido = ruidoGrasa(s)
  if (ruido && ruido.puntos >= 2) {
    notas.push(`En tus propios datos el % de grasa llegó a moverse ${ruido.puntos.toFixed(1)} puntos entre dos mediciones con ${ruido.dias} ${plural(ruido.dias, 'día', 'días')} de diferencia (${fmtCorta(ruido.de)} → ${fmtCorta(ruido.a)}); diferencias pequeñas pueden ser ruido.`)
  }

  return { ok: true, periodo, inicio, fin, dias, n: completos.filter(r => r.fecha >= inicio.fecha && r.fecha <= fin.fecha).length, dPeso, dGrasa, dMagra, dPct, etiqueta, frase, detalle, notas }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) CONSTANCIA — qué tan seguido te mides y qué pasa con el peso
// ═══════════════════════════════════════════════════════════════════════════

export const MESES_VENTANA = 18
export const UMBRAL_DENSO = 21     // intervalos ≤ 21 días = "te estabas midiendo seguido"
/** Intervalos > 45 días = «hueco». ÚNICA definición: la usan Constancia (sombreado ámbar, «hueco más largo», lectura) y
 *  la columna «Intervalo» del Historial (PesoHistorial), para que un mismo tramo no sea hueco en una pantalla y sí en
 *  otra (el Historial usaba 90 d). El aviso de «días sin medirte» del hero (7 y 30 d) es otra cosa: mide cuánto llevas
 *  sin medirte HOY, no un intervalo entre dos mediciones, y por eso no comparte esta constante. */
export const UMBRAL_HUECO = 45

export type PuntoMed = { fecha: string; peso: number }
export type Tramo = { de: string; a: string; dias: number; dPeso: number }
export type GrupoTramos = { n: number; dias: number; dKg: number; kgSem: number }
export type Lectura = { denso: GrupoTramos; huecos: GrupoTramos; dif: number; texto: string; conclusion: string; aviso: string }
export type CalcConstancia = {
  /** Ventana de las cifras: los 18 meses ANTERIORES a la última medición. Está anclada a esa medición (no a
   *  "hoy") para que los números sean idénticos en servidor y cliente y no cambien al montar la página. */
  desde: string; hasta: string
  /** Fin del eje de la gráfica: hoy (si ya se conoce y es posterior a la última medición) para mostrar el
   *  tramo abierto "sin medir desde entonces"; si no, la última medición. */
  hastaGrafica: string
  /** Inicio del eje de la gráfica: la ventana, o 10 días antes de la primera medición si el historial es más corto
   *  (así no queda un hueco vacío a la izquierda). */
  inicioGrafica: string
  puntos: PuntoMed[]
  tramos: Tramo[]
  huecos: Tramo[]                                   // tramos > 45 días (sombreados en ámbar)
  cola: { de: string; a: string; dias: number } | null   // sin medir desde la última medición hasta hoy (> 45 días)
  medianaDias: number | null
  huecoMax: Tramo | null
  ultima: string | null
  diasDesdeUltima: number | null                    // null mientras no se conoce "hoy"
  lectura: Lectura | null
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function grupo(ts: Tramo[]): GrupoTramos {
  const dias = ts.reduce((a, t) => a + t.dias, 0)
  const dKg = r2(ts.reduce((a, t) => a + t.dPeso, 0))
  return { n: ts.length, dias, dKg, kgSem: dias > 0 ? r2((ts.reduce((a, t) => a + t.dPeso, 0) / dias) * 7) : 0 }
}

/** Compara el ritmo de cambio de peso en tramos "densos" vs "con huecos". Se pondera por días (suma de
 *  cambios ÷ suma de días), no se promedian tasas: un tramo de 7 días con ±0.8 kg es puro ruido. */
export function lecturaTramos(tramos: Tramo[]): Lectura | null {
  const densos = tramos.filter(t => t.dias <= UMBRAL_DENSO)
  const huecos = tramos.filter(t => t.dias > UMBRAL_HUECO)
  if (densos.length < 2 || huecos.length < 2) return null
  const d = grupo(densos), h = grupo(huecos)
  const dif = r2(h.kgSem - d.kgSem)
  const texto =
    `Cuando te mediste seguido (${d.n} tramos de ${UMBRAL_DENSO} días o menos, ${d.dias} días en total) tu peso cambió ${sg(d.kgSem, 2)} kg por semana. ` +
    `En los ${h.n} tramos con huecos de más de ${UMBRAL_HUECO} días (${h.dias} días en total) cambió ${sg(h.kgSem, 2)} kg por semana.`
  const conclusion = Math.abs(dif) < 0.05
    ? 'Casi no hay diferencia entre un tipo de tramo y otro.'
    : dif > 0
      ? `En los tramos con huecos el peso se movió más hacia arriba (${sg(dif, 2)} kg por semana de diferencia).`
      : `En los tramos con huecos el peso se movió más hacia abajo (${sg(dif, 2)} kg por semana de diferencia).`
  const aviso = 'Es una correlación, no una causa: medirte seguido no baja el peso por sí solo, y es posible que dejes de medirte justo en las temporadas en que cuesta más. Los tramos de 22 a 45 días no se cuentan.'
  return { denso: d, huecos: h, dif, texto, conclusion, aviso }
}

export function calcConstancia(rows: PesoRecord[], hoy: string | null): CalcConstancia | null {
  const todos = ordenar(rows).filter(r => finito(r.peso))
  if (!todos.length) return null
  const ultimaTodos = todos[todos.length - 1].fecha
  const hasta = ultimaTodos
  const hastaGrafica = hoy && hoy > ultimaTodos ? hoy : ultimaTodos
  const desde = addMonths(hasta, -MESES_VENTANA)
  const puntos: PuntoMed[] = todos.filter(r => r.fecha >= desde && r.fecha <= hasta).map(r => ({ fecha: r.fecha, peso: r.peso! }))

  const tramos: Tramo[] = []
  for (let i = 1; i < puntos.length; i++) {
    tramos.push({ de: puntos[i - 1].fecha, a: puntos[i].fecha, dias: daysBetween(puntos[i - 1].fecha, puntos[i].fecha), dPeso: r2(puntos[i].peso - puntos[i - 1].peso) })
  }
  const huecos = tramos.filter(t => t.dias > UMBRAL_HUECO)
  let inicioGrafica = puntos[0].fecha > desde ? addDays(puntos[0].fecha, -10) : desde
  if (daysBetween(inicioGrafica, hastaGrafica) < 30) inicioGrafica = addDays(hastaGrafica, -30)
  const huecoMax = tramos.reduce<Tramo | null>((m, t) => (!m || t.dias > m.dias ? t : m), null)
  const ultima = puntos.length ? puntos[puntos.length - 1].fecha : null
  const diasDesdeUltima = hoy && ultima ? Math.max(0, daysBetween(ultima, hoy)) : null
  const cola = hoy && ultima && daysBetween(ultima, hoy) > UMBRAL_HUECO ? { de: ultima, a: hoy, dias: daysBetween(ultima, hoy) } : null

  return {
    desde, hasta, hastaGrafica, inicioGrafica, puntos, tramos, huecos, cola,
    medianaDias: mediana(tramos.map(t => t.dias)),
    huecoMax, ultima, diasDesdeUltima,
    lectura: lecturaTramos(tramos),
  }
}

/** Marcas del eje de tiempo: el día 1 de cada trimestre (ene, abr, jul, oct) dentro del rango. */
export function marcasMeses(desde: string, hasta: string): { fecha: string; texto: string }[] {
  const out: { fecha: string; texto: string }[] = []
  let d = `${desde.slice(0, 7)}-01`
  if (d < desde) d = addMonths(d, 1)
  while (d <= hasta) {
    if ((+d.slice(5, 7) - 1) % 3 === 0) out.push({ fecha: d, texto: fmtMesAnio(d) })
    d = addMonths(d, 1)
  }
  return out
}

/** Dominio vertical del peso con un poco de aire, y marcas "bonitas" (múltiplos de 1, 2, 5, 10…) dentro de él.
 *  El dominio NO se ajusta a las marcas: así los datos llenan la gráfica en vez de quedar achatados. */
export function ticksPeso(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  const span = Math.max(1, max - min)
  const pad = Math.max(0.5, span * 0.12)
  const lo = min - pad, hi = max + pad
  const paso = [1, 2, 5, 10, 20].find(p => (hi - lo) / p <= 6) ?? 20
  const ticks: number[] = []
  for (let v = Math.ceil(lo / paso) * paso; v <= hi + 1e-9; v += paso) ticks.push(v)
  return { lo, hi, ticks }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) ¿CUÁNTO TARDARÍAS? — escenarios por ritmo
// ═══════════════════════════════════════════════════════════════════════════

export const RITMOS = [0.25, 0.5, 0.75, 1] as const
export const KCAL_POR_KG = 7700
export const PESO_MIN = 40
export const PESO_MAX = 250

export type ZonaRitmo = 'lento' | 'sostenible' | 'agresivo'
export type FilaEscenario = {
  ritmo: number; semanas: number; fecha: string | null; meses: string | null
  kcalDia: number; pctPeso: number; zona: ZonaRitmo
}
export type CalcEscenarios = {
  pesoKg: number; objetivoKg: number
  direccion: 'bajar' | 'subir' | 'igual'
  kg: number                                        // distancia absoluta, a 0.1 kg
  rango: { min: number; max: number }               // kg/semana sostenibles para este peso (0.25–1 % del peso)
  filas: FilaEscenario[]
  imcObjetivo: number
  avisoImc: string | null
}

export function pesoActual(rows: PesoRecord[]): { peso: number; fecha: string } | null {
  const r = ultimoCon(ordenar(rows), 'peso')
  return r ? { peso: r.peso!, fecha: r.fecha } : null
}

export type ChipObjetivo = { id: 'imc25' | 'meta' | 'g25' | 'g20'; label: string; kg: number }

/** Atajos de peso objetivo. El de IMC 25 sale de la estatura del perfil. Los de % de grasa asumen que se conserva
 *  la masa magra actual (la del último registro con % de grasa; no depende de la estatura) y se omiten si ya estás
 *  en ese % o por debajo; sus porcentajes (25 y 20 para hombre) se desplazan por sexo para caer en las mismas zonas. */
export function chipsObjetivo(rows: PesoRecord[], plan: PesoPlan | null, perfil: PesoPerfil): ChipObjetivo[] {
  const s = ordenar(rows)
  const pa = ultimoCon(s, 'peso')
  const rg = ultimoCon(s, 'pct_grasa')
  const magra = rg ? masaMagra(rg) : null
  const imc25 = r1(pesoParaIMC(perfil, 25))
  const chips: ChipObjetivo[] = [{ id: 'imc25', label: `IMC 25 · ${imc25.toFixed(1)} kg`, kg: imc25 }]
  if (plan && finito(plan.meta_peso)) chips.push({ id: 'meta', label: `Meta · ${plan.meta_peso} kg`, kg: plan.meta_peso })
  if (magra != null && pa) {
    const desp = desplazamientoGrasa(perfil)
    for (const [id, base] of [['g25', 25], ['g20', 20]] as const) {
      const p = base + desp
      const kg = r1(magra / (1 - p / 100))
      if (pa.peso != null && kg < pa.peso - 0.05) chips.push({ id, label: `${p} % grasa · ${kg.toFixed(1)} kg`, kg })
    }
  }
  return chips
}

/** Peso objetivo por defecto: la meta del plan si existe; si no, el peso de IMC 25 para la estatura del perfil. */
export function objetivoPorDefecto(plan: PesoPlan | null, perfil: PesoPerfil): number {
  return plan && finito(plan.meta_peso) ? plan.meta_peso : r1(pesoParaIMC(perfil, 25))
}

export function parsePeso(txt: string): { ok: true; kg: number } | { ok: false; msg: string } {
  const t = txt.trim().replace(',', '.')
  if (!t) return { ok: false, msg: 'Escribe el peso al que quieres llegar.' }
  // Acepta "81." mientras se escribe.
  if (!/^\d+(\.\d*)?$/.test(t)) return { ok: false, msg: 'Escribe solo números, por ejemplo 82.5.' }
  const n = Number(t)
  if (n < PESO_MIN || n > PESO_MAX) return { ok: false, msg: `Escribe un peso entre ${PESO_MIN} y ${PESO_MAX} kg.` }
  return { ok: true, kg: r1(n) }
}

export function calcEscenarios(pesoKg: number, objetivoKg: number, hoy: string | null, perfil: PesoPerfil): CalcEscenarios {
  const h2 = tallaCuadrada(perfil)
  const kg = r1(Math.abs(pesoKg - objetivoKg))
  const direccion = kg < 0.05 ? 'igual' : objetivoKg < pesoKg ? 'bajar' : 'subir'
  const min = pesoKg * 0.0025, max = pesoKg * 0.01
  const filas: FilaEscenario[] = direccion === 'igual' ? [] : RITMOS.map(ritmo => {
    const semanas = Math.ceil(kg / ritmo)
    return {
      ritmo, semanas,
      fecha: hoy ? addDays(hoy, semanas * 7) : null,
      meses: aproxMeses(semanas),
      kcalDia: Math.round((ritmo * KCAL_POR_KG) / 7),
      pctPeso: r2((ritmo / pesoKg) * 100),
      zona: ritmo < min - 1e-9 ? 'lento' : ritmo > max + 1e-9 ? 'agresivo' : 'sostenible',
    }
  })
  const imcObjetivo = r1(objetivoKg / h2)
  return {
    pesoKg, objetivoKg, direccion, kg,
    rango: { min: r2(min), max: r2(max) },
    filas, imcObjetivo,
    avisoImc: objetivoKg > 0 && objetivoKg / h2 < 18.5
      ? `Ese peso equivale a un IMC de ${imcObjetivo.toFixed(1)}, por debajo de 18.5 (bajo peso). Considera un objetivo más alto.`
      : null,
  }
}

/** Kg por semana que necesitas para llegar al objetivo en la fecha meta (misma fórmula que buildFacts). */
export function ritmoParaFecha(kg: number, hoy: string, fechaMeta: string): number | null {
  const dias = daysBetween(hoy, fechaMeta)
  return dias > 0 && kg > 0 ? r2(kg / (dias / 7)) : null
}

/** Tu mejor racha de bajada de la etapa actual (la misma que lee el análisis de IA). */
export function mejorRachaBajada(rows: PesoRecord[]) {
  const s = ordenar(rows)
  if (!s.length) return null
  return buildFacts(s, null, s[s.length - 1].fecha).mejor_racha_de_bajada
}
