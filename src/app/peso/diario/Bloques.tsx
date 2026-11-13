'use client'

// Las piezas visuales del progreso del diario: lo que dicen tus calorías contra lo que marcó la báscula, las cifras del
// periodo, cuánto movió cada cosa tu balance (cascada), cómo se acumula (línea), tus gustos, el balance de cada día y la
// lista de días (o de meses). Todo sale de lo que calcula lib/peso-diario.

import { useEffect, useRef, useState } from 'react'
import { fmtNum, type DocDieta } from '@/lib/peso-contenido'
import {
  GRUPOS_ITEM, ID_OTROS, KCAL_POR_KG, conSigno, diasEntre, etiquetaCorta, etiquetaDia, etiquetaLarga, fmtKgCambio, grupoDe, nombreMes,
  type Acumulado, type Barra, type ComidaDia, type FilaDia, type Periodo, type Rango, type ResumenPeriodo,
} from '@/lib/peso-diario'
import { BTN, COLOR, Panel, Pill } from '../ui'

// Verde y rojo con contraste para TEXTO sobre blanco (los de COLOR.good/bad se quedan en ~3:1); las barras usan los claros.
const BUENO = '#15803d', MALO = '#b91c1c'
const VERDE = '#2F9E63'
const colorBalance = (b: number) => (b <= 0 ? BUENO : MALO)

/** Cuánta grasa son `kg`: menos de 1 kg se dice en gramos («420 g»), que es como se siente. */
export function fmtGrasa(kg: number): string {
  const a = Math.abs(kg)
  return a < 1 ? `${fmtNum(Math.round(a * 1000))} g` : `${fmtNum(a, 2)} kg`
}
/** «+58 g», «−1.20 kg»: lo que son `kcal` en grasa, con signo (0 = «0 g»). */
export function grasaConSigno(kcal: number): string {
  const kg = kcal / KCAL_POR_KG
  const t = fmtGrasa(kg)
  return t === '0 g' ? '0 g' : `${kg < 0 ? '−' : '+'}${t}`
}
const horas = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`)
const ETQ = { font: '800 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase' } as const

/** El ancho real de una caja: las gráficas se dibujan en píxeles (sin escalar), así el texto no se agranda en una pantalla ancha. */
function useAncho(dep: unknown) {
  const caja = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const el = caja.current; if (!el) return
    const medir = () => setAncho(el.clientWidth)
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(medir); o.observe(el)
    return () => o.disconnect()
  }, [dep])
  return [caja, ancho] as const
}

// ── Lo que dicen tus calorías contra lo que marcó la báscula ─────────────────────────────────────

export function Hero({ r, periodo, etiqueta, esHoy, onAnotar, puedeAnotar }: {
  r: ResumenPeriodo; periodo: Periodo; etiqueta: string; esHoy: boolean; onAnotar: () => void; puedeAnotar: boolean
}) {
  const kg = r.kg
  const sin = kg == null || r.anotados === 0
  const quedo = kg != null && Math.abs(kg) < 0.0005
  return (
    <Panel dark eyebrow={`${esHoy ? 'Hoy · ' : ''}${etiqueta}`} icon="⚖️" title="¿Qué tanto ganaste o perdiste?"
      subtitle={r.anotados > 0 ? `Anotaste ${r.anotados} ${r.anotados === 1 ? 'día' : 'días'}${r.diasPasados > r.anotados && periodo !== 'dia' ? ` de ${r.diasPasados}` : ''}. Solo cuentan los días que anotaste.` : undefined}>
      {sin ? (
        <div className="py-2">
          <p style={{ fontSize: 15, lineHeight: 1.5, color: COLOR.onDark }}>
            {r.anotados === 0 ? 'No hay nada anotado en este periodo.' : 'Falta tu peso para estimar cuánto gastas: registra una medición y vuelve a mirar.'}
          </p>
          {r.anotados === 0 && puedeAnotar && <button type="button" onClick={onAnotar} className={`${BTN.base} ${BTN.gold} mt-3 min-h-11`}>＋ Anotar mi día</button>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl p-4" style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)' }}>
            <p style={{ ...ETQ, color: COLOR.onDarkMuted }}>Según tus calorías</p>
            <p className="serif mt-1.5 tabular-nums" style={{ fontSize: 'clamp(26px, 7vw, 34px)', lineHeight: 1.1, fontWeight: 600, color: quedo ? COLOR.onDark : kg < 0 ? COLOR.goodOnDark : COLOR.badOnDark }}>
              {quedo ? 'Sin cambio' : <>{kg < 0 ? 'Perdiste' : 'Ganaste'} ≈ {fmtGrasa(kg)}</>}
            </p>
            <p className="mt-1.5 tabular-nums" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.onDarkMuted }}>
              Balance {conSigno(r.balance)} kcal ({fmtKgCambio(kg)} kg de grasa, a 7,700 kcal por kilo).
              {r.gustosKcal > 0 && r.kgSinGustos != null && <> Sin tus gustos habría sido {Math.abs(r.kgSinGustos) < 0.0005 ? 'cero' : `${r.kgSinGustos < 0 ? '−' : '+'}${fmtGrasa(r.kgSinGustos)}`}.</>}
            </p>
          </div>
          <div className="min-w-0 rounded-xl p-4" style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)' }}>
            <p style={{ ...ETQ, color: COLOR.onDarkMuted }}>En la báscula</p>
            {r.real ? (
              <>
                <p className="serif mt-1.5 tabular-nums" style={{ fontSize: 'clamp(26px, 7vw, 34px)', lineHeight: 1.1, fontWeight: 600, color: Math.abs(r.real.delta) < 0.05 ? COLOR.onDark : r.real.delta < 0 ? COLOR.goodOnDark : COLOR.badOnDark }}>
                  {conSigno(r.real.delta, 1)} kg
                </p>
                <p className="mt-1.5 tabular-nums" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.onDarkMuted }}>
                  De {fmtNum(r.real.desde.peso, 1)} kg ({etiquetaCorta(r.real.desde.fecha)}) a {fmtNum(r.real.hasta.peso, 1)} kg ({etiquetaCorta(r.real.hasta.fecha)}).
                </p>
              </>
            ) : (
              <p className="mt-1.5" style={{ fontSize: 13.5, lineHeight: 1.5, color: COLOR.onDarkMuted }}>
                {r.ultimoPeso
                  ? <>Sin pesajes en este periodo para comparar. Tu último peso: <strong style={{ color: COLOR.onDark }}>{fmtNum(r.ultimoPeso.peso, 1)} kg</strong> ({etiquetaCorta(r.ultimoPeso.fecha)}). Pésate otra vez para ver las dos cuentas lado a lado.</>
                  : 'Aún no hay pesajes. Registra tu peso para ver las dos cuentas lado a lado.'}
              </p>
            )}
          </div>
        </div>
      )}
      {!sin && <p className="mt-3" style={{ fontSize: 12, lineHeight: 1.5, color: COLOR.onDarkMuted }}>Es una estimación: tus calorías menos lo que gastas (tu gasto base con tu actividad, más el ejercicio anotado). La báscula también mueve agua y lo que acabas de comer; mira semanas, no días sueltos.</p>}
    </Panel>
  )
}

// ── Cifras ──────────────────────────────────────────────────────────────────

function Cifra({ rotulo, valor, sub, color }: { rotulo: string; valor: string; sub?: string; color?: string }) {
  return (
    <div className="min-w-0 rounded-xl p-3.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
      <p style={{ ...ETQ, letterSpacing: '.08em', color: COLOR.goldText }}>{rotulo}</p>
      <p className="serif mt-1 tabular-nums" style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 600, color: color ?? COLOR.navy }}>{valor}</p>
      {sub && <p className="mt-1" style={{ fontSize: 12, lineHeight: 1.4, color: COLOR.muted }}>{sub}</p>}
    </div>
  )
}

export function Cifras({ r, periodo, dieta }: { r: ResumenPeriodo; periodo: Periodo; dieta: DocDieta }) {
  const porDia = periodo === 'dia' ? '' : ' al día'
  const metaProt = dieta.comidas.reduce((a, c) => a + c.prot, 0)
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Cifra rotulo="Comiste" valor={r.ingestaProm != null ? `${fmtNum(r.ingestaProm)} kcal` : '—'}
        sub={r.ingestaProm != null ? `${periodo === 'dia' ? 'Gastas' : 'Gastas en promedio'} ${fmtNum(r.gastoProm ?? 0)} kcal${porDia}` : 'Anota una comida (y registra tu peso para estimar tu gasto)'} />
      <Cifra rotulo="Balance" valor={r.calculables ? `${conSigno(r.balance)} kcal` : '—'} color={r.calculables ? colorBalance(r.balance) : undefined}
        sub={r.calculables ? (r.balance <= 0 ? 'Déficit: comiste menos de lo que gastas' : 'Superávit: comiste más de lo que gastas') : undefined} />
      <Cifra rotulo="Ejercicio" valor={r.ejercicioMin > 0 ? horas(r.ejercicioMin) : '0 min'}
        sub={r.ejercicioMin > 0 ? `${periodo === 'dia' ? '' : `${r.diasConEjercicio} ${r.diasConEjercicio === 1 ? 'día' : 'días'} · `}${fmtNum(r.ejercicioKcal)} kcal de más` : 'Sin ejercicio anotado'} />
      <Cifra rotulo="Proteína" valor={r.protProm != null ? `${fmtNum(r.protProm)} g` : '—'}
        sub={r.protProm != null ? `${periodo === 'dia' ? 'De' : 'Al día, de'} ${fmtNum(metaProt)} g que pide tu dieta` : undefined} />
    </div>
  )
}

// ── Qué movió tu balance: la cascada ────────────────────────────────────────

/** Cómo se arma el balance: cada barra empieza donde terminó la anterior. Lo que gastas lo baja (verde), lo que comes lo sube. */
export function Cascada({ titulo, ver, impacto, balance, calculables, sinDatos }: {
  titulo: string; ver: 'dia' | 'periodo'; impacto: ResumenPeriodo['impacto']; balance: number; calculables: number; sinDatos?: string
}) {
  const filas = [
    { k: 'base', icono: '🔥', nombre: 'Lo que gastas (reposo y actividad)', delta: -impacto.base, color: VERDE },
    { k: 'ej', icono: '🏃', nombre: 'Ejercicio', delta: -impacto.ejercicio, color: VERDE },
    ...GRUPOS_ITEM.map(g => ({ k: g.v as string, icono: g.icono, nombre: g.nombre, delta: impacto.grupos[g.v], color: g.color })),
  ].filter(f => f.delta !== 0)
  if (!calculables || filas.length === 0) {
    return (
      <Panel eyebrow="Qué lo movió" icon="📊" title={titulo}>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: COLOR.muted }}>{sinDatos ?? 'Anota algunos días (y ten tu peso registrado) para ver cuánto movió cada cosa tu balance.'}</p>
      </Panel>
    )
  }
  let acc = 0
  const barras = filas.map(f => { const de = acc; acc += f.delta; return { ...f, de, a: acc } })
  const total = acc
  const todos = [0, total, ...barras.flatMap(b => [b.de, b.a])]
  const lo = Math.min(...todos), hi = Math.max(...todos)
  const span = hi - lo || 1
  const pct = (v: number) => ((v - lo) / span) * 100
  const trozo = (de: number, a: number, color: string) => (
    <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(Math.min(de, a))}%`, width: `max(${(Math.abs(a - de) / span) * 100}%, 4px)`, borderRadius: 4, background: color }} />
  )
  const eje = <span aria-hidden style={{ position: 'absolute', top: -3, bottom: -3, left: `${pct(0)}%`, width: 1.5, background: 'rgba(15,35,64,.45)' }} />
  return (
    <Panel eyebrow="Qué lo movió" icon="📊" title={titulo}
      subtitle={ver === 'dia'
        ? 'Cada barra empieza donde terminó la anterior. Lo que gastas baja tu balance (verde); lo que comes lo sube.'
        : `Suma de los ${calculables} ${calculables === 1 ? 'día' : 'días'} con cuenta. Lo que gastas baja tu balance (verde); lo que comes lo sube.`}>
      <ul className="space-y-3">
        {barras.map(b => (
          <li key={b.k}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0" style={{ fontSize: 13.5, color: COLOR.ink }}><span aria-hidden>{b.icono}</span> {b.nombre}</span>
              <span className="shrink-0 tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>{conSigno(Math.round(b.delta))} kcal <span style={{ fontWeight: 500, color: COLOR.muted }}>≈ {grasaConSigno(b.delta)}</span></span>
            </div>
            <div className="relative mt-1 h-3 rounded-full" style={{ background: 'rgba(15,35,64,.06)' }}>{eje}{trozo(b.de, b.a, b.color)}</div>
          </li>
        ))}
        <li className="border-t pt-3" style={{ borderColor: COLOR.lineStrong }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 font-bold" style={{ fontSize: 14, color: COLOR.navy }}>＝ Balance {ver === 'dia' ? 'del día' : 'del periodo'}</span>
            <span className="shrink-0 tabular-nums font-bold" style={{ fontSize: 14, color: colorBalance(balance) }}>{conSigno(Math.round(balance))} kcal <span style={{ fontWeight: 600 }}>≈ {grasaConSigno(balance)}</span></span>
          </div>
          <div className="relative mt-1 h-3.5 rounded-full" style={{ background: 'rgba(15,35,64,.06)' }}>{eje}{trozo(0, total, balance <= 0 ? '#16a34a' : '#dc2626')}</div>
          <p className="mt-1.5" style={{ fontSize: 12, color: COLOR.muted }}>{balance <= 0 ? 'Déficit: comiste menos de lo que gastas.' : 'Superávit: comiste más de lo que gastas.'} La línea vertical es el cero.</p>
        </li>
      </ul>
    </Panel>
  )
}

// ── Calorías por comida ─────────────────────────────────────────────────────

/** Una barra por comida, apilada por de qué fue (tu dieta, otra comida, antojos, alcohol…); la marca es lo que pide tu dieta. */
export function PorComida({ comidas }: { comidas: ComidaDia[] }) {
  const filas = comidas.filter(c => c.id !== ID_OTROS || c.items.length > 0).map(c => {
    const trozos = GRUPOS_ITEM.map(g => ({ g, kcal: c.items.filter(x => x.grupo === g.v).reduce((a, x) => a + x.n * x.kcal, 0) })).filter(t => t.kcal > 0)
    return { c, trozos, total: trozos.reduce((a, t) => a + t.kcal, 0) }
  })
  const hay = filas.some(f => f.total > 0)
  const max = Math.max(1, ...filas.map(f => Math.max(f.total, f.c.kcal)))
  const usados = GRUPOS_ITEM.filter(g => filas.some(f => f.trozos.some(t => t.g.v === g.v)))
  if (!hay) {
    return (
      <Panel eyebrow="Por comida" icon="🍽️" title="Calorías por comida">
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: COLOR.muted }}>Anota lo que comiste y verás aquí cuánto pesó cada comida contra lo que pide tu dieta.</p>
      </Panel>
    )
  }
  return (
    <Panel eyebrow="Por comida" icon="🍽️" title="Calorías por comida" subtitle="Cada barra es una comida; los colores son de qué fue. La marca vertical es lo que pide tu dieta para esa comida.">
      <ul className="space-y-3">
        {filas.map(({ c, trozos, total }) => {
          const pasa = c.kcal > 0 && total > c.kcal * 1.1
          return (
            <li key={c.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 font-semibold" style={{ fontSize: 13.5, color: COLOR.navy }}>{c.nombre}</span>
                <span className="shrink-0 tabular-nums" style={{ fontSize: 13, color: pasa ? '#92400E' : COLOR.ink }}>
                  {c.omitida ? 'No la comí' : total > 0 ? <><strong>{fmtNum(Math.round(total))} kcal</strong>{c.kcal > 0 && <span style={{ color: COLOR.muted }}> de {fmtNum(c.kcal)}</span>}</> : <span style={{ color: COLOR.muted }}>Sin anotar{c.kcal > 0 ? ` · pide ${fmtNum(c.kcal)}` : ''}</span>}
                </span>
              </div>
              <div className="relative mt-1 flex h-3.5 rounded-full" style={{ background: 'rgba(15,35,64,.06)' }}>
                {trozos.map((t, i) => (
                  <span key={t.g.v} aria-hidden title={`${t.g.nombre}: ${fmtNum(Math.round(t.kcal))} kcal`}
                    style={{ width: `${(t.kcal / max) * 100}%`, background: t.g.color, borderRadius: i === 0 ? '999px 0 0 999px' : i === trozos.length - 1 ? '0 999px 999px 0' : 0, borderRight: i < trozos.length - 1 ? '1.5px solid #fff' : undefined }} />
                ))}
                {c.kcal > 0 && <span aria-hidden style={{ position: 'absolute', top: -3, bottom: -3, left: `${(c.kcal / max) * 100}%`, width: 2, borderRadius: 1, background: COLOR.navy, opacity: 0.75 }} />}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5" style={{ fontSize: 12.5, color: COLOR.ink }}>
        {usados.map(g => <span key={g.v} className="inline-flex items-center gap-1.5"><span aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: g.color }} />{g.nombre}</span>)}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden style={{ width: 2, height: 13, background: COLOR.navy, opacity: 0.75 }} />Lo que pide tu dieta</span>
      </div>
    </Panel>
  )
}

// ── Cómo se acumula ─────────────────────────────────────────────────────────

/** El acumulado: la línea suma, día con día, lo que dicen tus calorías; los puntos son lo que marcó la báscula (contra tu peso de partida). */
export function AcumuladoGrafica({ a, titulo, subtitulo }: { a: Acumulado; titulo: string; subtitulo: string }) {
  const hay = a.puntos.length >= 2 && a.puntos.some(p => p.balance != null)
  const [caja, ancho] = useAncho(hay)
  if (!hay) {
    return (
      <Panel eyebrow="Acumulado" icon="📈" title={titulo}>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: COLOR.muted }}>
          {a.puntos.length < 2 ? 'Con un solo día todavía no hay curva: anota otro día y verás cómo se va acumulando.' : 'Falta tu peso para estimar cuánto gastas: registra una medición.'}
        </p>
      </Panel>
    )
  }
  const n = a.puntos.length
  const H = 220, padL = 60, padR = 16, padT = 22, padB = 30
  const W = Math.max(280, ancho)
  const datos = [0, ...a.puntos.map(p => p.kg), ...a.real.map(r => r.delta)]
  let lo = Math.min(...datos), hi = Math.max(...datos)
  if (hi - lo < 0.06) { hi += 0.03; lo -= 0.03 }
  const margen = (hi - lo) * 0.1
  const yLo = lo - margen, yHi = hi + margen
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR)
  const y = (v: number) => padT + ((yHi - v) / (yHi - yLo)) * (H - padT - padB)
  const y0 = y(0)
  const trazo = a.puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ')
  const area = `${trazo} L${x(n - 1).toFixed(1)} ${y0.toFixed(1)} L${x(0).toFixed(1)} ${y0.toFixed(1)} Z`
  const ultimo = a.puntos[n - 1]
  const marcas = [hi, 0, lo].filter((v, i, arr) => arr.findIndex(w => Math.abs(y(w) - y(v)) < 16) === i)
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - padL - padR) / 64))))
  const f0 = a.puntos[0].fecha
  const kgTxt = (v: number) => `${conSigno(v, Math.abs(v) < 1 ? 2 : 1)} kg`
  return (
    <Panel eyebrow="Acumulado" icon="📈" title={titulo} subtitle={subtitulo}>
      <div ref={caja}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfica del acumulado: según tus calorías, ${kgTxt(ultimo.kg)} en ${n} días.`} style={{ display: 'block', maxWidth: 'none' }}>
          <line x1={padL} x2={W - padR} y1={y0} y2={y0} stroke="rgba(15,35,64,.4)" strokeWidth={1} />
          {marcas.map(v => (
            <g key={v}>
              {v !== 0 && <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(15,35,64,.1)" strokeDasharray="3 4" />}
              <text x={padL - 7} y={y(v) + 4} textAnchor="end" fontSize={11} fill="rgba(20,35,61,.7)">{v === 0 ? '0' : kgTxt(v)}</text>
            </g>
          ))}
          <path d={area} fill="rgba(194,147,58,.16)" />
          <path d={trazo} fill="none" stroke="#B7791F" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {a.puntos.map((p, i) => p.balance == null ? null : <circle key={p.fecha} cx={x(i)} cy={y(p.kg)} r={n > 40 ? 0 : 3} fill="#B7791F"><title>{etiquetaDia(p.fecha)} · día {conSigno(p.balance)} kcal · acumulado {kgTxt(p.kg)}</title></circle>)}
          {a.real.map(r => {
            const i = diasEntre(f0, r.fecha)
            if (i < 0 || i > n - 1) return null
            return <circle key={r.fecha} cx={x(i)} cy={y(r.delta)} r={5.5} fill="#0F2340" stroke="#fff" strokeWidth={2}><title>{etiquetaDia(r.fecha)} · {fmtNum(r.peso, 1)} kg ({kgTxt(r.delta)} contra {fmtNum(a.base?.peso ?? 0, 1)} kg)</title></circle>
          })}
          <g>
            <circle cx={x(n - 1)} cy={y(ultimo.kg)} r={4.5} fill="#B7791F" stroke="#fff" strokeWidth={2} />
            {/* La etiqueta va del lado contrario al tramo que llega al último punto, para no encimarse con la línea. */}
            <text x={x(n - 1)} y={y(ultimo.kg) + (ultimo.kg >= a.puntos[n - 2].kg ? -10 : 18)} textAnchor="end" fontSize={12} fontWeight={700} fill={colorBalance(ultimo.kg)}>{kgTxt(ultimo.kg)}</text>
          </g>
          {a.puntos.map((p, i) => {
            const etq = i === n - 1 || (i % cada === 0 && n - 1 - i >= Math.ceil(cada * 0.6))
            return etq ? <text key={`e-${p.fecha}`} x={x(i)} y={H - 9} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={10.5} fill="rgba(20,35,61,.7)">{etiquetaCorta(p.fecha)}</text> : null
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5" style={{ fontSize: 12.5, color: COLOR.ink }}>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden style={{ width: 20, height: 3, borderRadius: 2, background: '#B7791F' }} /> Según tus calorías</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden style={{ width: 11, height: 11, borderRadius: 11, background: '#0F2340' }} /> En la báscula{a.base ? <span style={{ color: COLOR.muted }}> (contra {fmtNum(a.base.peso, 1)} kg del {etiquetaCorta(a.base.fecha)})</span> : null}</span>
      </div>
      <p className="mt-1.5" style={{ fontSize: 12, lineHeight: 1.5, color: COLOR.muted }}>Los días sin anotar no suman nada. La línea es una estimación; la báscula también mueve agua.</p>
    </Panel>
  )
}

// ── Gustos ──────────────────────────────────────────────────────────────────

export function Gustos({ r }: { r: ResumenPeriodo }) {
  if (r.gustosN <= 0) {
    return (
      <Panel eyebrow="Tus gustos" icon="🍫" title="Sin gustos anotados" subtitle="Antojos, alcohol, dulces, refrescos… cuando los anotes verás aquí cuánto pesaron.">
        <p style={{ fontSize: 13, color: COLOR.muted }}>En este periodo no anotaste ninguno.</p>
      </Panel>
    )
  }
  const grasa = r.gustosKcal / KCAL_POR_KG
  return (
    <Panel eyebrow="Tus gustos" icon="🍫" title={`${fmtNum(r.gustosKcal)} kcal en gustos`}
      subtitle={`≈ ${fmtGrasa(grasa)} de grasa si no los hubieras compensado con nada.`}>
      <div className="flex flex-wrap gap-2">
        {GRUPOS_ITEM.filter(g => g.gusto && r.porGrupo[g.v].n > 0).map(g => (
          <span key={g.v} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 tabular-nums" style={{ background: '#FFF8E6', border: `1px solid ${COLOR.line}`, fontSize: 13, color: '#5A3205' }}>
            <span aria-hidden>{g.icono}</span><strong>{g.nombre}</strong> · {fmtNum(r.porGrupo[g.v].n, r.porGrupo[g.v].n % 1 ? 1 : 0)} · {fmtNum(r.porGrupo[g.v].kcal)} kcal
          </span>
        ))}
      </div>
      <ul className="mt-3 divide-y" style={{ borderColor: COLOR.line }}>
        {r.top.map(x => (
          <li key={`${x.grupo}-${x.nombre}`} className="flex items-center justify-between gap-3 py-2 tabular-nums" style={{ fontSize: 13.5, borderColor: COLOR.line }}>
            <span className="min-w-0"><span aria-hidden>{grupoDe(x.grupo).icono}</span> {x.nombre} <span style={{ color: COLOR.muted }}>×{fmtNum(x.n, x.n % 1 ? 1 : 0)}</span></span>
            <span className="font-semibold">{fmtNum(x.kcal)} kcal</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ── Balance de cada día (o semana) ──────────────────────────────────────────

export function Grafica({ barras }: { barras: Barra[] }) {
  const semanal = barras.length > 0 && barras[0].etiqueta.startsWith('semana')
  const vals = barras.map(b => b.balance).filter((v): v is number => v != null)
  const [caja, disponible] = useAncho(vals.length > 0)
  // Si la gráfica no cabe y hay que deslizarla, se abre en lo más reciente (el extremo derecho).
  useEffect(() => { const el = caja.current; if (el) el.scrollLeft = el.scrollWidth }, [caja, barras.length, barras[0]?.clave, disponible])
  if (!vals.length) {
    return <Panel eyebrow="Balance" icon="📊" title="Sin datos para la gráfica"><p style={{ fontSize: 13, color: COLOR.muted }}>Anota algunos días (y ten tu peso registrado) para ver la gráfica.</p></Panel>
  }
  const n = barras.length
  const H = 200, padL = 50, padR = 8, padT = 14, padB = 28
  // Pocas barras: caben en el ancho de la tarjeta. Muchas: cada una conserva su ancho y la gráfica se desliza.
  const natural = padL + padR + n * (n > 20 ? 18 : 26)
  const W = Math.max(300, natural, disponible)
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals)
  const span = max - min || 1
  const y = (v: number) => padT + ((max - v) / span) * (H - padT - padB)
  const y0 = y(0)
  const bw = (W - padL - padR) / n
  const anchoBarra = Math.min(bw * 0.68, 34)
  const cada = Math.max(1, Math.ceil(n / Math.max(3, Math.floor((W - padL - padR) / 56))))
  return (
    <Panel eyebrow="Balance" icon="📊" title={semanal ? 'Balance de cada semana' : 'Balance de cada día'}
      subtitle={`Verde: déficit (comiste menos de lo que gastas). Rojo: superávit.${semanal ? ' Cada barra suma sus días anotados.' : ''}`}>
      <div ref={caja} className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfica del balance de calorías ${semanal ? 'por semana' : 'por día'}. Verde es déficit y rojo es superávit.`}
          style={{ display: 'block', maxWidth: 'none' }}>
          <line x1={padL} x2={W - padR} y1={y0} y2={y0} stroke="rgba(15,35,64,.35)" strokeWidth={1} />
          {[max, min].filter((v, i, a) => v !== 0 && a.indexOf(v) === i).map(v => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(15,35,64,.1)" strokeDasharray="3 4" />
              <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="rgba(20,35,61,.7)">{conSigno(Math.round(v / 10) * 10)}</text>
            </g>
          ))}
          <text x={padL - 6} y={y0 + 4} textAnchor="end" fontSize={11} fill="rgba(20,35,61,.7)">0</text>
          {barras.map((b, i) => {
            const x = padL + i * bw + (bw - anchoBarra) / 2, w = anchoBarra
            // La última siempre lleva etiqueta; las demás cada `cada` barras, sin pisar a la última.
            const etq = i === n - 1 || (i % cada === 0 && n - 1 - i >= Math.ceil(cada * 0.6))
            return (
              <g key={b.clave}>
                {b.balance == null
                  ? <rect x={x} y={y0 - 1.5} width={w} height={3} rx={1.5} fill="rgba(15,35,64,.18)"><title>{b.etiqueta} · sin anotar</title></rect>
                  : <rect x={x} y={b.balance >= 0 ? y(b.balance) : y0} width={w} height={Math.max(1.5, Math.abs(y(b.balance) - y0))} rx={2} fill={b.balance <= 0 ? '#16a34a' : '#dc2626'}>
                      <title>{b.etiqueta} · {conSigno(b.balance)} kcal</title>
                    </rect>}
                {etq && <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize={10.5} fill="rgba(20,35,61,.7)">{semanal ? etiquetaCorta(b.clave) : `${+b.clave.slice(8, 10)}`}</text>}
              </g>
            )
          })}
        </svg>
      </div>
    </Panel>
  )
}

// ── Lista de días ───────────────────────────────────────────────────────────

function ChipsGustos({ f }: { f: FilaDia }) {
  if (!f.dia) return null
  const porGrupo = GRUPOS_ITEM.filter(g => g.gusto).map(g => ({ g, n: f.dia!.comidas.reduce((a, c) => a + c.items.filter(x => x.grupo === g.v).reduce((s, x) => s + x.n, 0), 0) })).filter(x => x.n > 0)
  return <>{porGrupo.map(({ g, n }) => <span key={g.v} title={g.nombre} className="tabular-nums" style={{ fontSize: 13 }}><span aria-hidden>{g.icono}</span> ×{fmtNum(n, n % 1 ? 1 : 0)}</span>)}</>
}

export function ListaDias({ filas, hoy, onVer }: { filas: FilaDia[]; hoy: string; onVer: (fecha: string) => void }) {
  return (
    <Panel eyebrow="Día por día" icon="🗓️" title="Lo que anotaste" subtitle="Toca un día para verlo o cambiarlo.">
      <ul className="space-y-2">
        {filas.map(f => (
          <li key={f.fecha} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl px-3.5 py-2.5" style={{ background: f.dia ? '#fff' : COLOR.card2, border: `1px solid ${COLOR.line}` }}>
            <span className="font-semibold tabular-nums" style={{ width: 96, fontSize: 14, color: COLOR.navy }}>{etiquetaDia(f.fecha)}{f.fecha === hoy && <Pill color={COLOR.info} className="ml-1.5">Hoy</Pill>}</span>
            {f.dia && f.t ? (
              <>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 tabular-nums" style={{ flexBasis: 160, fontSize: 13, color: COLOR.ink }}>
                  <span title="Lo que comiste"><span aria-hidden>🍽️</span> {fmtNum(f.t.ingesta)} kcal</span>
                  <ChipsGustos f={f} />
                  {f.t.ejercicioMin > 0 && <span title="Ejercicio"><span aria-hidden>🏃</span> {horas(f.t.ejercicioMin)}</span>}
                  {f.t.faltan.length > 0 && <span title={`Faltan: ${f.t.faltan.join(', ')}`} style={{ color: '#92400E', fontSize: 12 }}>⚠ faltan {f.t.faltan.length} {f.t.faltan.length === 1 ? 'comida' : 'comidas'}</span>}
                </span>
                <span className="tabular-nums" style={{ fontSize: 13, textAlign: 'right', minWidth: 120 }}>
                  {f.t.balance != null && f.t.kg != null
                    ? <strong style={{ color: colorBalance(f.t.balance) }}>{conSigno(f.t.balance)} kcal · {f.t.kg < 0 ? '−' : f.t.kg > 0 ? '+' : ''}{fmtGrasa(f.t.kg)}</strong>
                    : <span style={{ color: COLOR.muted }}>sin peso para estimar</span>}
                </span>
                <button type="button" onClick={() => onVer(f.fecha)} aria-label={`Ver el ${etiquetaLarga(f.fecha)}`} className={`${BTN.base} ${BTN.ghost} min-h-10`}>Ver</button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1" style={{ fontSize: 13, color: COLOR.muted }}>Sin anotar</span>
                <button type="button" onClick={() => onVer(f.fecha)} aria-label={`Anotar el ${etiquetaLarga(f.fecha)}`} className={`${BTN.base} ${BTN.ghost} min-h-10`}>Anotar</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function ListaMeses({ meses, onVer }: { meses: { rango: Rango; r: ResumenPeriodo }[]; onVer: (ini: string) => void }) {
  const con = meses.filter(m => m.r.anotados > 0)
  return (
    <Panel eyebrow="Mes por mes" icon="🗓️" title="Tus meses" subtitle="Toca un mes para ver sus días.">
      {con.length === 0 ? <p style={{ fontSize: 13, color: COLOR.muted }}>Todavía no hay meses con días anotados.</p> : (
        <ul className="space-y-2">
          {con.map(({ rango, r }) => (
            <li key={rango.ini} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-white px-3.5 py-2.5" style={{ border: `1px solid ${COLOR.line}` }}>
              <span className="min-w-0 flex-1 font-semibold" style={{ flexBasis: 130, fontSize: 14, color: COLOR.navy, textTransform: 'capitalize' }}>{nombreMes(rango.ini)}</span>
              <span className="tabular-nums" style={{ fontSize: 13, color: COLOR.ink }}>{r.anotados} {r.anotados === 1 ? 'día' : 'días'}{r.ingestaProm != null && <> · ~{fmtNum(r.ingestaProm)} kcal al día</>}</span>
              <span className="tabular-nums" style={{ fontSize: 13, textAlign: 'right', minWidth: 130 }}>
                {r.kg != null ? <strong style={{ color: colorBalance(r.balance) }}>{conSigno(r.balance)} kcal · {r.kg < 0 ? '−' : r.kg > 0 ? '+' : ''}{fmtGrasa(r.kg)}</strong> : <span style={{ color: COLOR.muted }}>sin peso para estimar</span>}
              </span>
              <button type="button" onClick={() => onVer(rango.ini)} className={`${BTN.base} ${BTN.ghost} min-h-10`}>Ver</button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
