'use client'

import { memo, useId, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { daysBetween, fmtFecha, hoyMX } from '@/lib/peso'
import type { Level } from '@/lib/peso'
import { BTN, COLOR, Eyebrow, Panel } from './ui'
import {
  calcularHero, fmtCorta, textoHace,
  type Cambio, type HeroCalc, type Paso, type ProgresoMeta, type Semaforo,
} from './PesoHeroCalc'
import type { PesoHeroProps } from './contratos'

// Franja de estado al tope de /peso (siempre visible, encima de las pestañas): dónde estás hoy, cuánto
// te falta, cómo viene tu curva y qué sigue. Todo se calcula en PesoHeroCalc.ts (puro y probado con
// node); aquí solo se dibuja. Panel navy con la misma voz editorial que el resto de la página.

const SEM_COLOR: Record<Semaforo, string> = { ok: COLOR.goodOnDark, warn: COLOR.warnOnDark, bad: COLOR.badOnDark }
const NIVEL_COLOR: Record<Level, string> = { good: COLOR.goodOnDark, warn: COLOR.warnOnDark, alert: COLOR.badOnDark }
const TONO_COLOR: Record<Paso['tono'], string> = { ok: COLOR.goodOnDark, warn: COLOR.warnOnDark, bad: COLOR.badOnDark, info: COLOR.goldLight }

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E7C56B]'

/** Etiqueta mini de las celdas (10.5px con tracking amplio no cabe en 3 columnas a 360px). */
function Mini({ children }: { children: string }) {
  return (
    <div className="truncate" style={{ font: '800 9.5px/1.3 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: COLOR.onDarkMuted }}>
      {children}
    </div>
  )
}

// ── Cambio contra una medición anterior ──────────────────────────────────────

function Delta({ cambio, conAnio, rumbo, neutral }: { cambio: Cambio; conAnio: boolean; rumbo: ProgresoMeta['rumbo']; neutral: boolean }) {
  const sinCambio = Math.abs(cambio.delta) < 0.05
  const baja = cambio.delta < 0
  const bien = rumbo === 'bajar' ? baja : !baja
  const color = sinCambio || neutral ? COLOR.onDark : bien ? COLOR.goodOnDark : COLOR.badOnDark
  const abs = Math.abs(cambio.delta).toFixed(1)
  return (
    <div className="flex items-baseline gap-x-2 flex-wrap" style={{ fontSize: 13 }}>
      <span className="font-bold tabular-nums whitespace-nowrap" style={{ color }}>
        <span aria-hidden>{sinCambio ? '＝' : baja ? '▼' : '▲'}</span>{' '}
        <span className="sr-only">{sinCambio ? 'Sin cambio' : baja ? 'Bajó' : 'Subió'}</span>
        {sinCambio ? 'Igual' : `${baja ? '−' : '+'}${abs} kg`}
      </span>
      <span style={{ fontSize: 11.5, color: COLOR.onDarkMuted }}>
        {/* dias=0 = otra medición con la misma fecha de calendario (no necesariamente hoy) */}
        vs. {cambio.dias === 0 ? 'otra del mismo día' : `${fmtCorta(cambio.fecha, conAnio)} · ${cambio.dias} d`}
      </span>
    </div>
  )
}

// ── Anillo de progreso hacia la meta ─────────────────────────────────────────

function Anillo({ meta }: { meta: ProgresoMeta }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const R = 40
  const C = 2 * Math.PI * R
  const pct = meta.pct
  const hecho = meta.alcanzada
  const objetivo = meta.tipo === 'meta' ? 'tu meta' : `IMC ${meta.rumbo === 'subir' ? '18.5' : '25'}`
  const aria = hecho
    ? `Objetivo cumplido: ${objetivo}, ${meta.objetivoKg} kilos`
    : `Avance hacia ${objetivo}: ${Math.round(pct * 100)} por ciento. Faltan ${meta.restanteKg} kilos para ${meta.objetivoKg}`
  return (
    <div className="flex flex-col items-center" style={{ width: 'clamp(96px, 28vw, 124px)' }}>
      <svg viewBox="0 0 100 100" className="w-full h-auto" role="img" aria-label={aria}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={COLOR.goldLight} />
            <stop offset="1" stopColor={COLOR.gold} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        {(hecho || pct >= 0.005) && (
          <circle
            cx="50" cy="50" r={R} fill="none" strokeWidth="9" strokeLinecap="round"
            stroke={hecho ? COLOR.goodOnDark : `url(#${gid})`}
            strokeDasharray={`${C * (hecho ? 1 : pct)} ${C}`}
            transform="rotate(-90 50 50)"
          />
        )}
        <text
          x="50" y={hecho ? 58 : 57} textAnchor="middle"
          style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: hecho ? 30 : 25, fontWeight: 600, fill: hecho ? COLOR.goodOnDark : COLOR.onDark }}
        >
          {hecho ? '✓' : `${Math.round(pct * 100)}%`}
        </text>
      </svg>
      <div className="text-center mt-1" aria-hidden>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.onDark, lineHeight: 1.25 }}>
          {hecho ? (meta.tipo === 'meta' ? 'Meta alcanzada' : 'IMC saludable') : `Faltan ${meta.restanteKg} kg`}
        </div>
        <div style={{ fontSize: 11, color: COLOR.onDarkMuted, lineHeight: 1.3 }}>
          {meta.tipo === 'meta' ? `para tu meta de ${meta.objetivoKg} kg` : `para ${objetivo} (${meta.objetivoKg} kg)`}
        </div>
      </div>
    </div>
  )
}

// ── Curva de la etapa actual ─────────────────────────────────────────────────

function Curva({ puntos, meta }: { puntos: { fecha: string; peso: number }[]; meta: ProgresoMeta }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  if (puntos.length < 2) {
    return (
      <div className="rounded-xl px-4 py-5 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.16)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLOR.onDark }}>Tu curva aparece con 2 mediciones</div>
        <div style={{ fontSize: 11.5, color: COLOR.onDarkMuted, marginTop: 2 }}>Mídete de nuevo y verás cómo se mueve tu peso.</div>
      </div>
    )
  }
  const W = 320, H = 92, PX = 8, PT = 14, PB = 10
  const vals = puntos.map(p => p.peso)
  const vMin = Math.min(...vals), vMax = Math.max(...vals)
  // El objetivo se dibuja solo si cae cerca de la curva; si está a 30 kg aplastaría los datos.
  const objetivoCerca = meta.objetivoKg >= vMin - 8 && meta.objetivoKg <= vMax + 8
  let lo = objetivoCerca ? Math.min(vMin, meta.objetivoKg) : vMin
  let hi = objetivoCerca ? Math.max(vMax, meta.objetivoKg) : vMax
  const pad = (hi - lo) * 0.1 || 1
  lo -= pad; hi += pad
  const t0 = puntos[0].fecha
  const ultimo = puntos[puntos.length - 1]
  const total = Math.max(1, daysBetween(t0, ultimo.fecha))
  const X = (f: string) => PX + (daysBetween(t0, f) / total) * (W - 2 * PX)
  const Y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB)
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${X(p.fecha).toFixed(1)} ${Y(p.peso).toFixed(1)}`).join(' ')
  const area = `${linea} L${X(ultimo.fecha).toFixed(1)} ${H - PB} L${X(t0).toFixed(1)} ${H - PB} Z`
  const gid = `cv${uid}`
  const yObj = Y(meta.objetivoKg)
  const aria = `Evolución de tu peso en la etapa actual: de ${puntos[0].peso} kg el ${fmtFecha(t0)} a ${ultimo.peso} kg el ${fmtFecha(ultimo.fecha)}, ${puntos.length} mediciones`

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <Eyebrow color={COLOR.onDarkMuted}>Tu etapa actual</Eyebrow>
        <span className="tabular-nums" style={{ fontSize: 11, color: COLOR.onDarkMuted }}>
          {puntos.length} mediciones · {vMin.toFixed(1)}–{vMax.toFixed(1)} kg
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={aria}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={COLOR.goldLight} stopOpacity="0.32" />
            <stop offset="1" stopColor={COLOR.goldLight} stopOpacity="0" />
          </linearGradient>
        </defs>
        {objetivoCerca && (
          <g>
            <line x1={PX} x2={W - PX} y1={yObj} y2={yObj} stroke={COLOR.goodOnDark} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="4 4" />
            <text x={W - PX} y={yObj - 3.5} textAnchor="end" style={{ fontSize: 9.5, fontWeight: 700, fill: COLOR.goodOnDark, opacity: 0.85 }}>
              {meta.tipo === 'meta' ? `Meta ${meta.objetivoKg}` : `IMC ${meta.rumbo === 'subir' ? '18.5' : '25'} · ${meta.objetivoKg}`}
            </text>
          </g>
        )}
        <path d={area} fill={`url(#${gid})`} />
        <path d={linea} fill="none" stroke={COLOR.goldLight} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* Clave con índice: dos mediciones el mismo día (captura rápida + báscula) repetirían la fecha */}
        {puntos.slice(0, -1).map((p, i) => (
          <circle key={`${p.fecha}-${i}`} cx={X(p.fecha)} cy={Y(p.peso)} r="1.7" fill={COLOR.goldLight} opacity="0.75" />
        ))}
        <circle cx={X(ultimo.fecha)} cy={Y(ultimo.peso)} r="8" fill={COLOR.goldLight} opacity="0.22" />
        <circle cx={X(ultimo.fecha)} cy={Y(ultimo.peso)} r="4" fill={COLOR.goldLight} stroke={COLOR.navy} strokeWidth="1.5" />
      </svg>
      <div className="flex justify-between tabular-nums" style={{ fontSize: 10.5, color: COLOR.onDarkMuted }} aria-hidden>
        <span>{fmtCorta(t0, true)}</span>
        <span>{fmtCorta(ultimo.fecha, true)}</span>
      </div>
    </div>
  )
}

// ── Celdas de estado ─────────────────────────────────────────────────────────

function Celda({ etiqueta, children, title }: { etiqueta: string; children: ReactNode; title?: string }) {
  return (
    <div className="band-glass rounded-xl px-2.5 sm:px-3.5 py-2.5 min-w-0" title={title}>
      <Mini>{etiqueta}</Mini>
      {children}
    </div>
  )
}

const VALOR: CSSProperties = { fontSize: 'clamp(17px, 5vw, 22px)', lineHeight: 1.1, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }
const SUB: CSSProperties = { fontSize: 11, lineHeight: 1.3, marginTop: 3, color: COLOR.onDarkMuted }
const UNIDAD: CSSProperties = { fontSize: 11.5, fontWeight: 500, marginLeft: 3, color: COLOR.onDarkMuted }

function CeldaUltima({ c }: { c: HeroCalc }) {
  const color = SEM_COLOR[c.semaforo]
  const valor = c.diasSin === 0 ? 'Hoy' : c.diasSin === 1 ? 'Ayer' : `${c.diasSin} días`
  return (
    <Celda etiqueta="Última vez" title={`Tu última medición fue ${textoHace(c.diasSin)} (${fmtFecha(c.ultima.fecha)})`}>
      <div style={{ ...VALOR, color }}>
        <span aria-hidden className="inline-block rounded-full mr-1.5 align-middle" style={{ width: 8, height: 8, background: color, boxShadow: `0 0 0 3px ${color}33`, marginBottom: 2 }} />
        {valor}
      </div>
      <div style={SUB}>{c.diasSin >= 2 ? 'sin medirte · ' : ''}{fmtFecha(c.ultima.fecha)}</div>
    </Celda>
  )
}

function CeldaTendencia({ c }: { c: HeroCalc }) {
  const { slope, n, veredicto } = c.tendencia
  const color = veredicto === 'mejora' ? COLOR.goodOnDark : veredicto === 'empeora' ? COLOR.badOnDark : COLOR.onDark
  const texto = slope == null ? `faltan datos (${n}/3 en 90 d)`
    : veredicto === 'estable' ? 'casi sin cambio'
    : veredicto === 'mejora' ? 'buena dirección'
    : veredicto === 'empeora' ? 'contra tu objetivo'
    : slope < 0 ? 'bajando' : 'subiendo'
  // La unidad va en la línea secundaria (que sí hace wrap): "−0.45kg/sem" en una sola línea no cabe en
  // el contenido de ~68px que deja la celda a 360px.
  const prefijoSub = slope == null ? '' : veredicto === 'estable' ? '90 d · ' : 'kg/sem · 90 d · '
  return (
    <Celda etiqueta="Tendencia" title={`Pendiente de tus mediciones en los 90 días previos a tu última (${fmtFecha(c.ultima.fecha)}). Necesita 3 mediciones que abarquen 2 semanas.`}>
      {slope == null ? (
        <div style={{ ...VALOR, color: COLOR.onDarkMuted }}>—</div>
      ) : veredicto === 'estable' ? (
        <div style={{ ...VALOR, color }}>Estable</div>
      ) : (
        <div style={{ ...VALOR, color }}>{slope > 0 ? '+' : '−'}{Math.abs(slope).toFixed(2)}</div>
      )}
      <div style={SUB}>{prefijoSub}{texto}</div>
    </Celda>
  )
}

function CeldaMejor({ c }: { c: HeroCalc }) {
  const { mejor, historico, meta } = c
  return (
    <Celda
      etiqueta="Mejor marca"
      title={historico ? `Mínimo histórico: ${historico.valor} kg (${fmtFecha(historico.fecha)}), de una etapa anterior` : undefined}
    >
      {mejor ? (
        <>
          <div style={VALOR}>{mejor.valor.toFixed(1)}<span style={UNIDAD}>kg</span></div>
          <div style={SUB}>
            {mejor.lejos > 0.05 ? `hoy ${mejor.lejos} kg ${meta.rumbo === 'bajar' ? 'arriba' : 'abajo'}` : 'estás en ella'} · {fmtCorta(mejor.fecha, true)}
          </div>
          {historico && <div className="hidden sm:block" style={{ ...SUB, color: COLOR.onDarkMuted, marginTop: 1 }}>Mín. histórico {historico.valor} kg</div>}
        </>
      ) : <div style={{ ...VALOR, color: COLOR.onDarkMuted }}>—</div>}
    </Celda>
  )
}

// ── Siguiente paso ───────────────────────────────────────────────────────────

function SiguientePaso({ paso, onMedir, onIrA }: { paso: Paso; onMedir: () => void; onIrA?: PesoHeroProps['onIrA'] }) {
  const color = TONO_COLOR[paso.tono]
  const accion = paso.accion
  return (
    <div className="rounded-xl px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-3" style={{ background: `${color}14`, border: `1px solid ${color}40` }}>
      <span aria-hidden style={{ fontSize: 24, lineHeight: 1 }}>{paso.icono}</span>
      <div className="min-w-0 flex-1 basis-[210px]">
        <Eyebrow color={color}>Siguiente paso</Eyebrow>
        <p className="mt-0.5" style={{ fontSize: 14.5, fontWeight: 700, color: COLOR.onDark, lineHeight: 1.3 }}>{paso.titulo}</p>
        <p className="mt-0.5" style={{ fontSize: 12.5, color: COLOR.onDarkMuted, lineHeight: 1.45 }}>{paso.detalle}</p>
      </div>
      {accion?.tipo === 'medir' && (
        <button type="button" onClick={onMedir} className={`${BTN.base} ${BTN.gold} ${FOCO} min-h-[44px] w-full sm:w-auto`}>
          + Medirme hoy
        </button>
      )}
      {accion?.tipo === 'tab' && onIrA && (
        <button
          type="button" onClick={() => onIrA(accion.tab)}
          className={`${BTN.base} band-glass band-glass-hover ${FOCO} px-4 py-2.5 text-sm min-h-[44px] w-full sm:w-auto`}
          style={{ color: COLOR.onDark }}
        >
          {accion.label} <span aria-hidden>→</span>
        </button>
      )}
    </div>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function PesoHero({ data, plan, onMedir, onIrA, hoy }: PesoHeroProps & { hoy?: string }) {
  const dia = hoy ?? hoyMX()
  const c = useMemo(() => calcularHero(data, plan, dia), [data, plan, dia])

  if (!c) {
    return (
      <div role="region" aria-label="Tu estado de hoy">
        <Panel dark>
          <div className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="serif" style={{ fontSize: 24, fontWeight: 600, color: COLOR.onDark }}>Aún no hay un peso registrado</h2>
              <p style={{ fontSize: 13, color: COLOR.onDarkMuted, marginTop: 2 }}>Registra tu peso y aquí verás dónde estás, cuánto te falta y cómo va tu curva.</p>
            </div>
            <button type="button" onClick={onMedir} className={`${BTN.base} ${BTN.gold} ${FOCO} min-h-[44px] w-full sm:w-auto`}>+ Registrar mi peso</button>
          </div>
        </Panel>
      </div>
    )
  }

  const anioActual = dia.slice(0, 4)
  const conAnio = (f: string) => f.slice(0, 4) !== anioActual
  const neutral = c.meta.alcanzada

  return (
    <div role="region" aria-label="Tu estado de hoy">
      <Panel dark flush>
        <div className="px-5 sm:px-7 pt-5 pb-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.25fr)_auto_minmax(0,1.35fr)] gap-x-5 md:gap-x-8 gap-y-5 items-center">
            {/* Peso actual */}
            <div className="min-w-0">
              <Eyebrow color={COLOR.onDarkMuted}>Peso actual</Eyebrow>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span
                  className="serif tabular-nums"
                  style={{ fontSize: 'clamp(54px, 17vw, 76px)', lineHeight: 0.95, fontWeight: 600, color: COLOR.goldLight, fontVariantNumeric: 'lining-nums tabular-nums' }}
                >
                  {c.peso.toFixed(1)}
                </span>
                <span style={{ fontSize: 15, color: COLOR.onDarkMuted }}>kg</span>
              </div>
              <div className="mt-2.5 flex flex-col gap-1">
                {c.anterior && <Delta cambio={c.anterior} conAnio={conAnio(c.anterior.fecha)} rumbo={c.meta.rumbo} neutral={neutral} />}
                {c.hace30 && <Delta cambio={c.hace30} conAnio={conAnio(c.hace30.fecha)} rumbo={c.meta.rumbo} neutral={neutral} />}
                {!c.anterior && !c.hace30 && <span style={{ fontSize: 12, color: COLOR.onDarkMuted }}>Primera medición de esta etapa</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {/* Las dos pastillas se ven también en móvil. La columna es angosta (a 360 px quedan ~165 px junto al
                    anillo): `max-w-full` + `whitespace-normal` en móvil dejan que el texto largo («Grasa 31.2 % ·
                    Obesidad por grasa») pase a dos líneas en vez de desbordarse; desde sm caben en una. `rounded-2xl` se
                    ve como pastilla con una línea (el radio se ajusta al alto) y no recorta el texto con dos. */}
                <span
                  className="inline-flex items-center rounded-2xl max-w-full whitespace-normal sm:whitespace-nowrap leading-snug"
                  style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', background: `${c.imcCls.color}26`, color: NIVEL_COLOR[c.imcCls.level] }}
                >
                  IMC {c.imc.toFixed(1)} · {c.imcCls.label}
                </span>
                {c.grasa && (
                  <span
                    className="inline-flex items-center rounded-2xl max-w-full whitespace-normal sm:whitespace-nowrap leading-snug"
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', background: `${c.grasa.cls.color}26`, color: NIVEL_COLOR[c.grasa.cls.level] }}
                  >
                    Grasa {c.grasa.valor.toFixed(1)} % · {c.grasa.cls.label}
                  </span>
                )}
              </div>
            </div>

            {/* Anillo */}
            <Anillo meta={c.meta} />

            {/* Curva */}
            <div className="col-span-2 md:col-span-1 min-w-0">
              <Curva puntos={c.etapa.puntos} meta={c.meta} />
            </div>
          </div>

          {c.meta.fechaMeta && !c.meta.alcanzada && c.meta.diasParaMeta != null && (
            <p className="mt-3" style={{ fontSize: 12, color: COLOR.onDarkMuted }}>
              Tu meta de {c.meta.objetivoKg} kg es para el {fmtCorta(c.meta.fechaMeta, conAnio(c.meta.fechaMeta))}
              {c.meta.diasParaMeta > 0
                ? ` (en ${c.meta.diasParaMeta} días${c.meta.ritmoNecesario != null ? ` · necesitas ${c.meta.rumbo === 'bajar' ? 'bajar' : 'subir'} ${c.meta.ritmoNecesario} kg/sem` : ''}).`
                : ' (ya pasó).'}
            </p>
          )}

          {/* Estado en tres celdas */}
          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            <CeldaUltima c={c} />
            <CeldaTendencia c={c} />
            <CeldaMejor c={c} />
          </div>

          <div className="mt-3">
            <SiguientePaso paso={c.paso} onMedir={onMedir} onIrA={onIrA} />
          </div>
        </div>
      </Panel>
    </div>
  )
}

// memo: el hero no debe repintarse cuando cambia la pestaña o se abre el formulario; solo si cambian
// los datos, el plan o la fecha de hoy (los callbacks del padre son estables).
export default memo(PesoHero)
