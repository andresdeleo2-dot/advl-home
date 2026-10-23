'use client'

import { Component, useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { H2, daysBetween, hoyMX } from '@/lib/peso'
import type { PesoRecord, PesoPlan } from '@/lib/peso'
import {
  PERIODOS_COMP, UMBRAL_HUECO, MESES_VENTANA, KCAL_POR_KG,
  calcComposicion, calcConstancia, calcEscalas, calcEscenarios, chipsObjetivo,
  fmtCorta, fmtFechaLarga, fmtMesAnio, marcasMeses, mejorRachaBajada, objetivoPorDefecto, parsePeso,
  pesoActual, plural, ritmoParaFecha, sg, ticksPeso,
} from '@/lib/peso-visuals'
import type { Escala, PeriodoComp, CalcComp, CalcEscalas, ZonaRitmo } from '@/lib/peso-visuals'
import { BTN, COLOR, Eyebrow, INPUT, Panel, Pill, Segmented } from './ui'
import { DATO_COLOR } from './metricas'
import type { PesoVisualesProps } from './contratos'

// Bloque de gráficos explicativos de /peso (pestaña Resumen). Cuatro widgets, cada uno un Panel:
//   1) EscalasActuales  — dónde estás en IMC, % de grasa y grasa visceral
//   2) ComposicionDelta — de dónde vino el cambio: grasa o masa magra
//   3) LineaMediciones  — qué tan constante eres midiéndote y qué pasa con el peso
//   4) Escenarios       — cuánto tardarías en llegar a un peso objetivo
// Todos los números salen de código (src/lib/peso-visuals.ts, probado con node), nunca de la IA.
// Aquí solo se dibuja: SVG/divs a mano, sin librerías.

// ── Tokens locales ───────────────────────────────────────────────────────────

/** Gris de texto pequeño. Es COLOR.muted (ya con contraste AA: 5.9:1 en blanco y 5.6:1 en crema); el parche local de .68 ya no hace falta. */
const TXT2 = COLOR.muted
// Colores de DATO: salen de DATO_COLOR (metricas.tsx), la misma paleta de las tarjetas y de la gráfica de Progreso.
// Rojo y verde quedan solo para el semáforo (zonas, Mejor/Peor, deltas); aquí no hay hex propios que se puedan separar.
const C_PESO = DATO_COLOR.peso            // azul = color de DATO del peso (no de interfaz)
const C_GRASA = DATO_COLOR.masa_grasa     // masa grasa
const C_MAGRA = DATO_COLOR.masa_magra     // masa magra
const AMBAR = '#f59e0b'
const AMBAR_TXT = '#b45309'
const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A87A2C]'

/** Los colores de classify* están pensados para rellenos; como TEXTO sobre fondo claro se oscurecen para pasar 4.5:1. */
const TINTA: Record<string, string> = {
  '#22c55e': '#15803d', '#84cc16': '#4d7c0f', '#f59e0b': '#b45309', '#ef4444': '#b91c1c', '#dc2626': '#991b1b', '#2d6cdf': '#1f57bf',
}
const tinta = (c: string) => TINTA[c.toLowerCase()] ?? c

const ZONA_RITMO: Record<ZonaRitmo, { label: string; color: string; barra: string }> = {
  sostenible: { label: 'Sostenible', color: '#15803d', barra: COLOR.gold },
  agresivo: { label: 'Agresivo', color: AMBAR_TXT, barra: AMBAR },
  lento: { label: 'Muy lento', color: '#64748b', barra: '#94a3b8' },
}

// ── Piezas comunes ───────────────────────────────────────────────────────────

/** Fecha de hoy (CDMX) solo tras montar: el render del servidor no puede conocerla sin riesgo de hidratación. */
function useHoy() {
  const [hoy, setHoy] = useState<string | null>(null)
  useEffect(() => { setHoy(hoyMX()) }, [])
  return hoy
}

/** Ancho real del contenedor para dibujar SVG a escala 1:1 (el texto no se encoge en el teléfono).
 *  Antes de montar usa 320 (igual en servidor y cliente, así no hay desajuste de hidratación).
 *  Usa ref-callback con estado porque el contenedor puede aparecer después (cuando llegan los datos). */
function useAncho(inicial = 320) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [ancho, setAncho] = useState(inicial)
  useEffect(() => {
    if (!el) return
    const medir = () => setAncho(Math.max(240, Math.round(el.clientWidth)))
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, ancho] as const
}

function Vacio({ icono, titulo, texto, children }: { icono: string; titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-7 text-center" style={{ border: `1px dashed ${COLOR.lineStrong}`, background: COLOR.card2 }}>
      <div aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>{icono}</div>
      <p className="serif mt-2" style={{ fontSize: 19, fontWeight: 600, color: COLOR.navy }}>{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm" style={{ fontSize: 13, color: TXT2 }}>{texto}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

/** Si un cálculo truena con datos raros, solo cae ese bloque (con un mensaje digno), no toda la página. */
class Atajo extends Component<{ nombre: string; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false }
  static getDerivedStateFromError() { return { fallo: true } }
  componentDidCatch(e: unknown) { console.error(`[peso] falló el bloque "${this.props.nombre}"`, e) }
  render() {
    if (!this.state.fallo) return this.props.children
    return (
      <Panel eyebrow={this.props.nombre} title="No se pudo dibujar este bloque" accent={COLOR.bad}>
        <p style={{ fontSize: 13, color: TXT2 }}>Algún dato inesperado impidió dibujarlo. Recarga la página; si sigue igual, revisa tus últimas mediciones en el Historial.</p>
      </Panel>
    )
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 1) DÓNDE ESTÁS
// ═════════════════════════════════════════════════════════════════════════════

const PASO_GLIFO = {
  bajar: { g: '↓', c: COLOR.goldDark },
  subir: { g: '↑', c: COLOR.goldDark },
  margen: { g: '◐', c: COLOR.goldDark },
  ok: { g: '✓', c: '#15803d' },
} as const

function BarraEscala({ e }: { e: Escala }) {
  const span = e.eje.max - e.eje.min
  const p = e.pos == null ? null : e.pos * 100
  const desc = `${e.titulo}: ${e.valor == null ? 'sin dato' : `${e.valorTxt}${e.sufijo}, ${e.clasif?.label}`}. Zonas: ${e.zonas.map(z => `${z.label} ${z.rango}`).join('; ')}.`
  return (
    <div className="mt-4">
      <div className="relative" style={{ paddingTop: 30 }}>
        {p != null && (
          <>
            {/* Burbuja con el valor: se corre con el mismo porcentaje para no salirse de la tarjeta en los extremos. */}
            <span
              className="absolute top-0 inline-block rounded-md px-2 tabular-nums whitespace-nowrap"
              style={{ left: `${p}%`, transform: `translateX(-${p}%)`, height: 22, lineHeight: '22px', background: COLOR.navy, color: '#fff', fontSize: 12, fontWeight: 700 }}
              aria-hidden
            >
              {e.fuera ? (e.fuera === 'alto' ? '▸ ' : '◂ ') : ''}{e.valorTxt}{e.sufijo}
            </span>
            <span aria-hidden className="absolute" style={{ left: `${p}%`, top: 22, transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `6px solid ${COLOR.navy}` }} />
          </>
        )}
        <div role="img" aria-label={desc} className="flex overflow-hidden rounded-full" style={{ height: 14, background: COLOR.line }}>
          {e.zonas.map((z, i) => (
            <div
              key={z.label}
              style={{
                width: `${((z.hasta - z.desde) / span) * 100}%`, background: z.color, opacity: e.idx === -1 ? 0.35 : i === e.idx ? 1 : 0.28,
                borderRight: i < e.zonas.length - 1 ? '2px solid #FBFAF6' : undefined, transition: 'opacity .3s',
              }}
            />
          ))}
        </div>
        {p != null && <span aria-hidden className="absolute" style={{ left: `${p}%`, top: 30, transform: 'translateX(-50%)', width: 3, height: 14, borderRadius: 2, background: COLOR.navy, boxShadow: '0 0 0 1.5px #FBFAF6' }} />}
      </div>
      {/* Cortes de la escala (y, en el IMC, los kilos que equivalen) */}
      <div className="relative" style={{ height: e.id === 'imc' ? 34 : 20 }} aria-hidden>
        {e.marcas.map(m => (
          <div key={m.texto} className="absolute top-1 text-center leading-tight" style={{ left: `${m.pos * 100}%`, transform: 'translateX(-50%)' }}>
            <div className="tabular-nums" style={{ fontSize: 11, fontWeight: 700, color: TXT2 }}>{m.texto}</div>
            {m.sub && <div className="tabular-nums whitespace-nowrap" style={{ fontSize: 10, color: TXT2 }}>{m.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function TarjetaEscala({ e, eq }: { e: Escala; eq: CalcEscalas['equivalencias'] }) {
  const col = e.clasif ? tinta(e.clasif.color) : TXT2
  return (
    <article className="flex flex-col rounded-2xl p-4" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }} aria-label={e.titulo}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{e.titulo}</Eyebrow>
        {e.clasif && <Pill color={col}>{e.clasif.label}</Pill>}
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <span className="serif tabular-nums" style={{ fontSize: 40, lineHeight: 1, fontWeight: 600, color: COLOR.navy }}>{e.valorTxt}</span>
        {e.sufijo && <span style={{ fontSize: 16, color: COLOR.muted }}>{e.sufijo.trim()}</span>}
      </div>
      {e.valor != null && e.fecha && (
        <p className="mt-1" style={{ fontSize: 11.5, color: e.deOtraFecha ? AMBAR_TXT : TXT2, fontWeight: e.deOtraFecha ? 600 : 400 }}>
          {e.deOtraFecha ? `Dato del ${fmtCorta(e.fecha)}: tu última medición no lo trae.` : `Medición del ${fmtCorta(e.fecha)}`}
        </p>
      )}

      <BarraEscala e={e} />

      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1" aria-label={`Zonas de ${e.titulo}`}>
        {e.zonas.map((z, i) => (
          <li key={z.label} className="inline-flex items-center gap-1" style={{ fontSize: 11, color: i === e.idx ? COLOR.ink : TXT2, fontWeight: i === e.idx ? 700 : 500 }}>
            <span aria-hidden className="inline-block rounded-full" style={{ width: 8, height: 8, background: z.color, opacity: i === e.idx ? 1 : 0.5 }} />
            {z.label} <span className="tabular-nums" style={{ opacity: 0.8 }}>{z.rango}</span>
          </li>
        ))}
      </ul>

      {e.id === 'imc' && eq.pesoKg != null && (
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {([['Pesas', eq.pesoKg], ['IMC 25', eq.kgImc25], ['IMC 30', eq.kgImc30]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="rounded-lg px-2 py-1.5 text-center" style={{ background: '#fff', border: `1px solid ${COLOR.line}` }}>
              <dt style={{ fontSize: 10.5, color: TXT2, fontWeight: 600 }}>{k}</dt>
              <dd className="serif tabular-nums" style={{ fontSize: 17, fontWeight: 600, color: COLOR.navy, lineHeight: 1.2 }}>{v}<span style={{ fontSize: 10.5, color: TXT2 }}> kg</span></dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: COLOR.line }}>
        {e.valor == null ? (
          <p style={{ fontSize: 13, color: TXT2 }}>Ninguna de tus mediciones trae este dato todavía. Cuando lo captures en la báscula de bioimpedancia, lo verás aquí.</p>
        ) : e.pasos.map((p, i) => (
          <p key={i} className="flex gap-2 leading-snug" style={{ fontSize: 13, color: COLOR.ink }}>
            <span aria-hidden className="shrink-0 font-bold" style={{ color: PASO_GLIFO[p.tipo].c, width: 14 }}>{PASO_GLIFO[p.tipo].g}</span>
            <span>{p.texto}</span>
          </p>
        ))}
      </div>
    </article>
  )
}

export function EscalasActuales({ data }: { data: PesoRecord[] }) {
  const calc = useMemo(() => calcEscalas(data), [data])
  if (!calc) {
    return (
      <Panel eyebrow="Dónde estás" icon="📍" title="Tu posición en cada escala">
        <Vacio icono="📏" titulo="Aún no hay mediciones" texto="Registra tu primera medición y aquí verás en qué zona estás de IMC, % de grasa y grasa visceral." />
      </Panel>
    )
  }
  return (
    <Panel
      eyebrow="Dónde estás" icon="📍" title="Tu posición en cada escala"
      subtitle="Referencias de la OMS y de bioimpedancia, con tus últimos datos. Cada tarjeta dice cuánto te falta para la zona de abajo."
      right={<Pill color={COLOR.navy2}>Última medición {fmtCorta(calc.ultimaFecha)}</Pill>}
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {calc.escalas.map(e => <TarjetaEscala key={e.id} e={e} eq={calc.equivalencias} />)}
      </div>
      <p className="mt-3" style={{ fontSize: 11.5, color: TXT2 }}>
        El IMC no distingue grasa de músculo: úsalo junto con el % de grasa. La grasa visceral es la que más pesa para la salud metabólica.
      </p>
    </Panel>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 2) ¿DE DÓNDE VINO EL CAMBIO?
// ═════════════════════════════════════════════════════════════════════════════

type FilaBarra = { clave: string; label: string; d: number; antes: number; despues: number; color: string }

function BarrasDivergentes({ filas }: { filas: FilaBarra[] }) {
  // Misma escala para las tres barras: así se compara a ojo cuánto de cada cosa cambió.
  const max = Math.max(1, ...filas.map(f => Math.abs(f.d)))
  return (
    <div>
      <div className="space-y-3">
        {filas.map(f => {
          const w = (Math.abs(f.d) / max) * 46
          return (
            <div key={f.clave}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 600, color: COLOR.ink }}>
                  <span aria-hidden className="inline-block rounded-sm" style={{ width: 9, height: 9, background: f.color }} />
                  {f.label}
                </span>
                <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 800, color: COLOR.navy }}>{sg(f.d, 1)} kg</span>
              </div>
              <div aria-hidden className="relative mt-1 rounded-lg" style={{ height: 22, background: 'rgba(15,35,64,0.045)' }}>
                <div className="absolute inset-y-0" style={{ left: '50%', width: 1, background: COLOR.lineStrong }} />
                <div
                  className="absolute rounded-md"
                  style={{
                    top: 3, bottom: 3, left: f.d >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`,
                    minWidth: Math.abs(f.d) < 0.05 ? 0 : 3, background: f.color, transition: 'left .35s ease, width .35s ease',
                  }}
                />
              </div>
              <p className="mt-0.5 tabular-nums" style={{ fontSize: 11.5, color: TXT2 }}>{f.antes.toFixed(1)} → {f.despues.toFixed(1)} kg</p>
            </div>
          )
        })}
      </div>
      <div aria-hidden className="mt-1 flex justify-between" style={{ fontSize: 10.5, color: TXT2, fontWeight: 600 }}>
        <span>← Bajó</span><span>Subió →</span>
      </div>
    </div>
  )
}

function ResultadoComp({ c }: { c: Extract<CalcComp, { ok: true }> }) {
  const filas: FilaBarra[] = [
    { clave: 'peso', label: 'Peso total', d: c.dPeso, antes: c.inicio.peso, despues: c.fin.peso, color: C_PESO },
    { clave: 'grasa', label: 'Masa grasa', d: c.dGrasa, antes: c.inicio.grasa, despues: c.fin.grasa, color: C_GRASA },
    { clave: 'magra', label: 'Masa magra', d: c.dMagra, antes: c.inicio.magra, despues: c.fin.magra, color: C_MAGRA },
  ]
  return (
    <div>
      <p style={{ fontSize: 12, color: TXT2 }}>
        <strong style={{ color: COLOR.ink }}>{c.etiqueta}</strong> · {fmtCorta(c.inicio.fecha)} → {fmtCorta(c.fin.fecha)} · {c.dias} {plural(c.dias, 'día', 'días')} · {c.n} mediciones
      </p>
      <p className="serif mt-2" style={{ fontSize: 25, lineHeight: 1.18, fontWeight: 600, color: COLOR.navy }}>{c.frase}</p>
      <p className="mt-1.5" style={{ fontSize: 13, color: TXT2 }}>{c.detalle}</p>

      <div className="mt-4"><BarrasDivergentes filas={filas} /></div>

      <p className="mt-3 tabular-nums" style={{ fontSize: 12.5, color: COLOR.ink }}>
        % de grasa: <strong>{c.inicio.pct.toFixed(1)} % → {c.fin.pct.toFixed(1)} %</strong> ({sg(c.dPct, 1)} {plural(c.dPct, 'punto', 'puntos')})
      </p>

      <ul className="mt-3 space-y-1.5 rounded-xl px-3.5 py-3" style={{ background: 'rgba(194,147,58,0.08)', border: '1px solid rgba(194,147,58,0.22)' }} aria-label="Notas de prudencia">
        {c.notas.map((n, i) => (
          <li key={i} className="flex gap-2 leading-snug" style={{ fontSize: 12, color: COLOR.ink }}>
            <span aria-hidden style={{ color: COLOR.goldDark }}>•</span><span>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ComposicionDelta({ data }: { data: PesoRecord[] }) {
  const [periodo, setPeriodo] = useState<PeriodoComp>('1a')
  const calc = useMemo(() => calcComposicion(data, periodo), [data, periodo])
  return (
    <Panel
      eyebrow="Composición" icon="⚖️" title="¿De dónde vino el cambio?" accent={COLOR.navy2}
      subtitle="Compara tu última medición con la primera del periodo que trae % de grasa, y separa grasa de masa magra."
    >
      <Segmented value={periodo} onChange={setPeriodo} ariaLabel="Periodo a comparar" options={PERIODOS_COMP.map(p => ({ value: p.value, label: p.label }))} />
      <div className="mt-4" aria-live="polite">
        {calc.ok ? (
          <ResultadoComp c={calc} />
        ) : (
          <Vacio icono="🔎" titulo="Todavía no hay con qué comparar" texto={calc.motivo}>
            {calc.sugerencia && (
              <button type="button" className={`${BTN.base} ${BTN.ghost} ${FOCO}`} style={{ minHeight: 40 }} onClick={() => setPeriodo(calc.sugerencia!)}>
                Probar con «{PERIODOS_COMP.find(p => p.value === calc.sugerencia)?.label}»
              </button>
            )}
          </Vacio>
        )}
      </div>
    </Panel>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 3) CONSTANCIA
// ═════════════════════════════════════════════════════════════════════════════

function Cifra({ titulo, valor, sub, alerta = false }: { titulo: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 rounded-xl px-3.5 py-2.5 sm:block"
      style={{ background: alerta ? 'rgba(245,158,11,0.10)' : COLOR.card2, border: `1px solid ${alerta ? 'rgba(245,158,11,0.35)' : COLOR.line}` }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 600, color: TXT2, lineHeight: 1.25 }}>{titulo}</div>
      <div className="text-right sm:mt-1 sm:text-left">
        <div className="serif tabular-nums" style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 600, color: alerta ? AMBAR_TXT : COLOR.navy }}>{valor}</div>
        {sub && <div className="tabular-nums" style={{ fontSize: 11, color: TXT2 }}>{sub}</div>}
      </div>
    </div>
  )
}

export function LineaMediciones({ data }: { data: PesoRecord[] }) {
  const hoy = useHoy()
  const calc = useMemo(() => calcConstancia(data, hoy), [data, hoy])
  const [medir, ancho] = useAncho()

  if (!calc) {
    return (
      <Panel eyebrow="Constancia" icon="🗓️" title="¿Qué tan seguido te mides?">
        <Vacio icono="📆" titulo="Aún no hay mediciones" texto="Con varias mediciones verás aquí tu ritmo, los huecos largos y cómo se comportó tu peso en cada tramo." />
      </Panel>
    )
  }

  const { puntos, huecos, cola, inicioGrafica: ini, hastaGrafica } = calc
  const total = Math.max(1, daysBetween(ini, hastaGrafica))
  const H = 188, ML = 40, MR = 12, MT = 26, MB = 26
  const iw = Math.max(80, ancho - ML - MR), ih = H - MT - MB
  const x = (f: string) => ML + (daysBetween(ini, f) / total) * iw
  const pesos = puntos.map(p => p.peso)
  const { lo, hi, ticks } = ticksPeso(pesos.length ? Math.min(...pesos) : 80, pesos.length ? Math.max(...pesos) : 90)
  const y = (v: number) => MT + ((hi - v) / (hi - lo)) * ih
  const meses = marcasMeses(ini, hastaGrafica)

  const bandas = [
    ...huecos.map(h => ({ de: h.de, a: h.a, dias: h.dias, titulo: `${h.dias} días sin medir (${fmtFechaLarga(h.de)} → ${fmtFechaLarga(h.a)})` })),
    ...(cola ? [{ de: cola.de, a: cola.a, dias: cola.dias, titulo: `${cola.dias} días sin medir desde el ${fmtFechaLarga(cola.de)} hasta hoy` }] : []),
  ]

  const desc =
    `Línea de tiempo de tus mediciones de peso de ${fmtMesAnio(ini)} a ${fmtMesAnio(hastaGrafica)}: ${puntos.length} ${plural(puntos.length, 'medición', 'mediciones')}` +
    (pesos.length ? `, entre ${Math.min(...pesos)} y ${Math.max(...pesos)} kg. ` : '. ') +
    (bandas.length
      ? `Tramos de más de ${UMBRAL_HUECO} días sin medir: ${bandas.map(b => `${b.dias} días (${fmtCorta(b.de)} al ${fmtCorta(b.a)}${b.a === hoy ? ', hasta hoy' : ''})`).join('; ')}.`
      : `No hay tramos de más de ${UMBRAL_HUECO} días sin medir.`)

  const dd = calc.diasDesdeUltima
  const ultimaTxt = dd == null ? '—' : dd === 0 ? 'hoy' : `hace ${dd} ${plural(dd, 'día', 'días')}`

  return (
    <Panel
      eyebrow="Constancia" icon="🗓️" title="¿Qué tan seguido te mides?"
      subtitle={`Tus mediciones de los ${MESES_VENTANA} meses previos a la última. En ámbar, los tramos de más de ${UMBRAL_HUECO} días sin medirte.`}
    >
      {puntos.length === 1 && (
        <p className="mb-2" style={{ fontSize: 12, color: TXT2 }}>Con una sola medición todavía no hay constancia que medir; mídete de nuevo y la línea empieza a tomar forma.</p>
      )}
      <div ref={medir} className="w-full overflow-hidden">
        <svg width={ancho} height={H} viewBox={`0 0 ${ancho} ${H}`} role="img" aria-label={desc} className="block">
          {/* Cuadrícula horizontal y eje del peso */}
          {ticks.map(t => (
            <g key={t}>
              <line x1={ML} x2={ML + iw} y1={y(t)} y2={y(t)} stroke="rgba(15,35,64,0.08)" strokeWidth={1} />
              <text x={ML - 7} y={y(t) + 4} textAnchor="end" fontSize={11} fill={TXT2}>{t}</text>
            </g>
          ))}
          <text x={ML - 7} y={MT - 10} textAnchor="end" fontSize={10.5} fill={TXT2}>kg</text>

          {/* Eje del tiempo */}
          {meses.map(m => (
            <g key={m.fecha}>
              <line x1={x(m.fecha)} x2={x(m.fecha)} y1={MT} y2={MT + ih} stroke="rgba(15,35,64,0.05)" strokeWidth={1} />
              <text x={x(m.fecha)} y={H - 8} textAnchor="middle" fontSize={11} fill={TXT2}>{m.texto}</text>
            </g>
          ))}

          {/* Tramos sin medir */}
          {bandas.map(b => {
            const x1 = x(b.de), x2 = x(b.a), w = x2 - x1
            return (
              <g key={`${b.de}-${b.a}`}>
                <rect x={x1} y={MT} width={Math.max(0, w)} height={ih} fill={AMBAR} fillOpacity={0.16} rx={3}>
                  <title>{b.titulo}</title>
                </rect>
                {w >= 30 && <text x={(x1 + x2) / 2} y={MT - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={AMBAR_TXT}>{b.dias} d</text>}
              </g>
            )
          })}

          {/* Línea entre mediciones: punteada cuando hay un hueco */}
          {puntos.slice(1).map((p, i) => {
            const a = puntos[i]
            const hueco = daysBetween(a.fecha, p.fecha) > UMBRAL_HUECO
            return (
              <line key={`${p.fecha}-${i}`} x1={x(a.fecha)} y1={y(a.peso)} x2={x(p.fecha)} y2={y(p.peso)}
                stroke={C_PESO} strokeOpacity={hueco ? 0.5 : 0.7} strokeWidth={1.75} strokeDasharray={hueco ? '4 4' : undefined} />
            )
          })}

          {/* Puntos: uno por medición; el círculo transparente más grande facilita el tooltip */}
          {puntos.map((p, i) => {
            const esUltima = i === puntos.length - 1
            return (
              <g key={`${p.fecha}-${i}`}>
                {esUltima && <circle cx={x(p.fecha)} cy={y(p.peso)} r={8} fill="none" stroke={COLOR.gold} strokeWidth={2} />}
                <circle cx={x(p.fecha)} cy={y(p.peso)} r={4.5} fill={C_PESO} stroke="#fff" strokeWidth={1.5} />
                <circle cx={x(p.fecha)} cy={y(p.peso)} r={11} fill="transparent">
                  <title>{`${fmtFechaLarga(p.fecha)} · ${p.peso} kg`}</title>
                </circle>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1" aria-hidden style={{ fontSize: 11, color: TXT2 }}>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block rounded-full" style={{ width: 9, height: 9, background: C_PESO }} />Una medición</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block rounded-sm" style={{ width: 14, height: 9, background: 'rgba(245,158,11,0.3)' }} />Más de {UMBRAL_HUECO} días sin medir</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block rounded-full" style={{ width: 11, height: 11, border: `2px solid ${COLOR.gold}` }} />La más reciente</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Cifra
          titulo="Mediana entre mediciones"
          valor={calc.medianaDias == null ? '—' : `${Number.isInteger(calc.medianaDias) ? calc.medianaDias : calc.medianaDias.toFixed(1)} ${plural(calc.medianaDias, 'día', 'días')}`}
          sub={calc.tramos.length ? `${calc.tramos.length} ${plural(calc.tramos.length, 'intervalo', 'intervalos')}` : 'Faltan mediciones'}
        />
        <Cifra
          titulo="Hueco más largo"
          valor={calc.huecoMax ? `${calc.huecoMax.dias} ${plural(calc.huecoMax.dias, 'día', 'días')}` : '—'}
          sub={calc.huecoMax ? `${fmtCorta(calc.huecoMax.de)} → ${fmtCorta(calc.huecoMax.a)}` : undefined}
          alerta={!!calc.huecoMax && calc.huecoMax.dias > UMBRAL_HUECO}
        />
        <Cifra
          titulo="Última medición"
          valor={ultimaTxt}
          sub={calc.ultima ? fmtCorta(calc.ultima) : undefined}
          alerta={dd != null && dd > UMBRAL_HUECO}
        />
      </div>

      <div className="mt-4">
        {calc.lectura ? (
          <div className="rounded-xl px-4 py-3.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
            <Eyebrow>Lectura</Eyebrow>
            <p className="mt-1.5 leading-snug" style={{ fontSize: 13, color: COLOR.ink }}>{calc.lectura.texto}</p>
            <p className="mt-1.5 leading-snug" style={{ fontSize: 13, fontWeight: 700, color: COLOR.navy }}>{calc.lectura.conclusion}</p>
            <p className="mt-1.5 leading-snug" style={{ fontSize: 11.5, color: TXT2 }}>{calc.lectura.aviso}</p>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: TXT2 }}>
            Cuando tengas al menos dos tramos seguidos (21 días o menos entre mediciones) y dos con huecos (más de {UMBRAL_HUECO} días), aquí verás cómo se movió tu peso en cada caso.
          </p>
        )}
      </div>
    </Panel>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 4) ¿CUÁNTO TARDARÍAS?
// ═════════════════════════════════════════════════════════════════════════════

export function Escenarios({ data, plan }: { data: PesoRecord[]; plan: PesoPlan | null }) {
  const hoy = useHoy()
  const inputId = useId()
  const ayudaId = `${inputId}-ayuda`
  const pa = useMemo(() => pesoActual(data), [data])
  const chips = useMemo(() => chipsObjetivo(data, plan), [data, plan])
  const racha = useMemo(() => mejorRachaBajada(data), [data])
  // null = Andrés no ha escrito nada: se muestra el objetivo por defecto (la meta del plan, o IMC 25).
  const [txt, setTxt] = useState<string | null>(null)
  const valorTxt = txt ?? String(objetivoPorDefecto(plan))
  const v = parsePeso(valorTxt)

  if (!pa) {
    return (
      <Panel eyebrow="Escenarios" icon="🧭" title="¿Cuánto tardarías?" accent={COLOR.navy2}>
        <Vacio icono="⚖️" titulo="Falta tu peso" texto="Registra una medición con peso y aquí verás en cuántas semanas llegarías a tu objetivo, a distintos ritmos." />
      </Panel>
    )
  }

  const calc = v.ok ? calcEscenarios(pa.peso, v.kg, hoy) : null
  const maxSem = calc ? Math.max(1, ...calc.filas.map(f => f.semanas)) : 1
  const verbo = calc?.direccion === 'subir' ? 'subir' : 'bajar'
  const flujo = calc?.direccion === 'subir' ? 'superávit' : 'déficit'
  // El escenario más cercano a tu mejor racha real (si existe): la vara de "esto ya lo hice".
  const rachaRitmo = racha ? Math.abs(racha.kg_por_semana) : null
  const cercano = calc && calc.direccion === 'bajar' && rachaRitmo != null && calc.filas.length
    ? calc.filas.reduce((m, f, i, a) => (Math.abs(f.ritmo - rachaRitmo) < Math.abs(a[m].ritmo - rachaRitmo) ? i : m), 0)
    : -1
  // Solo se marca si de verdad se parece (±0.13 kg/sem); si tu mejor racha fue mucho más rápida, no se fuerza.
  const rachaIdx = calc && cercano >= 0 && Math.abs(calc.filas[cercano].ritmo - rachaRitmo!) <= 0.13 ? cercano : -1
  const diasPesoViejo = hoy ? daysBetween(pa.fecha, hoy) : null
  const esMeta = !!(plan && plan.meta_peso != null && v.ok && Math.abs(plan.meta_peso - v.kg) < 0.05)
  const ritmoMeta = calc && esMeta && hoy && plan?.meta_fecha ? ritmoParaFecha(calc.kg, hoy, plan.meta_fecha) : null

  return (
    <Panel
      eyebrow="Escenarios" icon="🧭" title="¿Cuánto tardarías?" accent={COLOR.navy2}
      subtitle="Elige un peso objetivo y mira cuántas semanas serían a distintos ritmos. Todo es cálculo, no promesa."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Izquierda: objetivo */}
        <div>
          <label htmlFor={inputId}><Eyebrow>Peso objetivo</Eyebrow></label>
          <div className="relative mt-1.5">
            <input
              id={inputId} type="text" inputMode="decimal" autoComplete="off" value={valorTxt}
              onChange={e => setTxt(e.target.value)}
              aria-invalid={!v.ok} aria-describedby={ayudaId}
              className={`${INPUT} tabular-nums`} style={{ fontSize: 20, fontWeight: 700, padding: '10px 44px 10px 14px', minHeight: 48, borderColor: v.ok ? undefined : COLOR.bad }}
            />
            <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" style={{ fontSize: 13, color: TXT2 }}>kg</span>
          </div>
          <p id={ayudaId} className="mt-1.5" role={v.ok ? undefined : 'alert'} style={{ fontSize: 12, color: v.ok ? TXT2 : COLOR.bad }}>
            {v.ok ? (calc?.avisoImc ?? `Equivale a un IMC de ${(v.kg / H2).toFixed(1)}.`) : v.msg}
          </p>

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Atajos de peso objetivo">
            {chips.map(c => {
              const on = v.ok && Math.abs(v.kg - c.kg) < 0.05
              return (
                <button
                  key={c.id} type="button" aria-pressed={on} onClick={() => setTxt(String(c.kg))}
                  className={`rounded-full px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${FOCO}`}
                  style={{
                    minHeight: 40,
                    background: on ? COLOR.navy : '#fff', color: on ? '#fff' : COLOR.navy2,
                    border: `1px solid ${on ? COLOR.navy : COLOR.lineStrong}`,
                  }}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
          {chips.some(c => c.id === 'g25' || c.id === 'g20') && (
            <p className="mt-2" style={{ fontSize: 11, color: TXT2 }}>
              Los atajos de % de grasa suponen que conservas tu masa magra actual y solo pierdes grasa.
            </p>
          )}

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl px-4 py-3" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}`, fontSize: 13 }}>
            <dt style={{ color: TXT2 }}>Pesas</dt>
            <dd className="text-right tabular-nums" style={{ fontWeight: 700, color: COLOR.ink }}>{pa.peso} kg <span style={{ fontWeight: 400, color: TXT2 }}>· {fmtCorta(pa.fecha)}</span></dd>
            {v.ok && calc && (<>
              <dt style={{ color: TXT2 }}>Objetivo</dt>
              <dd className="text-right tabular-nums" style={{ fontWeight: 700, color: COLOR.ink }}>{v.kg} kg</dd>
              <dt style={{ color: TXT2 }}>{calc.direccion === 'subir' ? 'Por subir' : 'Por bajar'}</dt>
              <dd className="serif text-right tabular-nums" style={{ fontSize: 20, fontWeight: 600, color: COLOR.navy, lineHeight: 1.1 }}>{calc.kg.toFixed(1)} kg</dd>
            </>)}
          </dl>
        </div>

        {/* Derecha: escenarios */}
        <div>
          {!v.ok || !calc ? (
            <Vacio icono="✏️" titulo="Corrige el peso objetivo" texto="Cuando escribas un peso válido, aquí aparecen los cuatro ritmos." />
          ) : calc.direccion === 'igual' ? (
            <Vacio icono="🎯" titulo="Ya estás en ese peso" texto={`Tu último peso (${pa.peso} kg) es el objetivo. Elige otro objetivo para calcular de nuevo.`} />
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: TXT2 }}>
                Para tu peso, un ritmo sostenible va de <strong style={{ color: COLOR.ink }}>{calc.rango.min.toFixed(2)} a {calc.rango.max.toFixed(2)} kg por semana</strong> (0.25–1 % de tu peso corporal).
              </p>
              <ol className="mt-3 space-y-2.5" aria-label={`Escenarios para ${verbo} ${calc.kg.toFixed(1)} kg`}>
                {calc.filas.map((f, i) => {
                  const z = ZONA_RITMO[f.zona]
                  return (
                    <li
                      key={f.ritmo} className="rounded-xl px-3.5 py-3"
                      style={{ background: f.zona === 'sostenible' ? 'rgba(194,147,58,0.07)' : COLOR.card2, border: `1px solid ${f.zona === 'sostenible' ? 'rgba(194,147,58,0.3)' : COLOR.line}` }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="serif tabular-nums" style={{ fontSize: 27, lineHeight: 1, fontWeight: 600, color: COLOR.navy }}>{f.ritmo}</span>
                          <span style={{ fontSize: 12, color: TXT2 }}>kg / semana</span>
                          <Pill color={z.color}>{z.label}</Pill>
                          {i === rachaIdx && <Pill color={tinta(COLOR.info)}>≈ tu mejor racha</Pill>}
                        </div>
                        <div className="text-right">
                          <span className="tabular-nums" style={{ fontSize: 16, fontWeight: 800, color: COLOR.ink }}>{f.semanas} {plural(f.semanas, 'semana', 'semanas')}</span>
                          {f.meses && <span style={{ fontSize: 12, color: TXT2 }}> · {f.meses}</span>}
                        </div>
                      </div>
                      <div aria-hidden className="mt-2 overflow-hidden rounded-full" style={{ height: 8, background: 'rgba(15,35,64,0.06)' }}>
                        <div style={{ width: `${(f.semanas / maxSem) * 100}%`, height: '100%', borderRadius: 99, background: z.barra, transition: 'width .35s ease' }} />
                      </div>
                      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5" style={{ fontSize: 12, color: TXT2 }}>
                        <span>{f.fecha ? <>Llegarías hacia el <strong style={{ color: COLOR.ink }}>{fmtFechaLarga(f.fecha)}</strong></> : 'Calculando la fecha…'}</span>
                        <span className="tabular-nums">≈ {f.kcalDia} kcal/día de {flujo} · {f.pctPeso.toFixed(2)} % del peso/sem</span>
                      </div>
                    </li>
                  )
                })}
              </ol>

              <div className="mt-3 space-y-1.5" style={{ fontSize: 11.5, color: TXT2 }}>
                {racha && rachaRitmo != null && calc.direccion === 'bajar' && (
                  <p>
                    Tu mejor racha fue de <strong style={{ color: COLOR.ink }}>{rachaRitmo.toFixed(2)} kg/semana</strong> ({fmtCorta(racha.de)} → {fmtCorta(racha.a)}: {Math.abs(racha.peso_kg)} kg en {racha.dias} días){rachaIdx >= 0 ? ': el escenario marcado es el que ya demostraste.' : '.'}
                  </p>
                )}
                {ritmoMeta != null && plan?.meta_fecha && (
                  <p>
                    Para llegar a tu meta el <strong style={{ color: COLOR.ink }}>{fmtFechaLarga(plan.meta_fecha)}</strong> necesitarías <strong style={{ color: COLOR.ink }}>{ritmoMeta.toFixed(2)} kg/semana</strong>
                    {ritmoMeta > calc.rango.max ? ', más de lo sostenible para tu peso.' : '.'}
                  </p>
                )}
                {esMeta && plan?.meta_fecha && hoy && daysBetween(hoy, plan.meta_fecha) <= 0 && <p>La fecha de tu meta ({fmtFechaLarga(plan.meta_fecha)}) ya pasó: conviene actualizarla.</p>}
                {diasPesoViejo != null && diasPesoViejo > 21 && (
                  <p style={{ color: AMBAR_TXT, fontWeight: 600 }}>
                    Tu último peso tiene {diasPesoViejo} días ({fmtCorta(pa.fecha)}). El cálculo parte de ahí; mídete para afinarlo.
                  </p>
                )}
                <p>
                  El déficit diario sale de ≈ {KCAL_POR_KG.toLocaleString('en-US')} kcal por kg de grasa. Es solo una aproximación: el cuerpo se adapta, parte de lo que baja es agua y tu gasto real es distinto. Úsalo como orientación, no como prescripción.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Bloque completo
// ═════════════════════════════════════════════════════════════════════════════

/** Celda de la grilla: se estira a la altura de la fila y aísla fallos de un widget. */
function Celda({ nombre, ancho = false, children }: { nombre: string; ancho?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 [&>section]:min-w-0 [&>section]:flex-1 ${ancho ? 'lg:col-span-2' : ''}`}>
      <Atajo nombre={nombre}>{children}</Atajo>
    </div>
  )
}

export default function PesoVisuales({ data, plan }: PesoVisualesProps) {
  const hayPeso = data.some(r => typeof r.peso === 'number')
  if (!hayPeso) {
    return (
      <Panel eyebrow="Tus números" icon="📊" title="Aquí aparecerán tus gráficos">
        <Vacio icono="📈" titulo="Aún no hay datos para dibujar" texto="Registra tu primera medición con peso y verás tus escalas, de dónde vino el cambio, tu constancia y cuánto tardarías en llegar a tu objetivo." />
      </Panel>
    )
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Celda nombre="Dónde estás" ancho><EscalasActuales data={data} /></Celda>
      <Celda nombre="Composición"><ComposicionDelta data={data} /></Celda>
      <Celda nombre="Constancia"><LineaMediciones data={data} /></Celda>
      <Celda nombre="Escenarios" ancho><Escenarios data={data} plan={plan} /></Celda>
    </div>
  )
}
