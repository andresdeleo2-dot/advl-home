'use client'

// Las piezas visuales del progreso del diario: lo que dicen tus calorías contra lo que marcó la báscula, las cifras del
// periodo, tus gustos, la gráfica de balance y la lista de días (o de meses). Todo sale de lo que calcula lib/peso-diario.

import { useEffect, useRef, useState } from 'react'
import { fmtNum, type DocDieta } from '@/lib/peso-contenido'
import {
  ESTADOS_COMIDA, GRUPOS_EXTRA, conSigno, etiquetaCorta, etiquetaDia, etiquetaLarga, fmtKgCambio, grupoDe, nombreMes, totalesDia,
  type Barra, type Contexto, type DiaDiario, type FilaDia, type Periodo, type Rango, type ResumenPeriodo,
} from '@/lib/peso-diario'
import { BTN, COLOR, Panel, Pill } from '../ui'

/** Cuánta grasa son `kg`: menos de 1 kg se dice en gramos («420 g»), que es como se siente. */
export function fmtGrasa(kg: number): string {
  const a = Math.abs(kg)
  return a < 1 ? `${fmtNum(Math.round(a * 1000))} g` : `${fmtNum(a, 2)} kg`
}
const horas = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`)
const colorBalance = (b: number) => (b <= 0 ? COLOR.good : COLOR.bad)

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
          {r.anotados === 0 && puedeAnotar && <button type="button" onClick={onAnotar} className={`${BTN.base} ${BTN.gold} mt-3 min-h-11`}>＋ Anotar {periodo === 'dia' ? 'este día' : 'mi día'}</button>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl p-4" style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)' }}>
            <p style={{ font: '800 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: COLOR.onDarkMuted }}>Según tus calorías</p>
            <p className="serif mt-1.5 tabular-nums" style={{ fontSize: 'clamp(26px, 7vw, 34px)', lineHeight: 1.1, fontWeight: 600, color: quedo ? COLOR.onDark : kg < 0 ? COLOR.goodOnDark : COLOR.badOnDark }}>
              {quedo ? 'Sin cambio' : <>{kg < 0 ? 'Perdiste' : 'Ganaste'} ≈ {fmtGrasa(kg)}</>}
            </p>
            <p className="mt-1.5 tabular-nums" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.onDarkMuted }}>
              Balance {conSigno(r.balance)} kcal ({fmtKgCambio(kg)} kg de grasa, a 7,700 kcal por kilo).
              {r.extrasKcal > 0 && r.kgSinExtras != null && <> Sin tus gustos habría sido {r.kgSinExtras < 0.0005 && r.kgSinExtras > -0.0005 ? 'cero' : `${r.kgSinExtras < 0 ? '−' : '+'}${fmtGrasa(r.kgSinExtras)}`}.</>}
            </p>
          </div>
          <div className="min-w-0 rounded-xl p-4" style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)' }}>
            <p style={{ font: '800 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: COLOR.onDarkMuted }}>En la báscula</p>
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
      <p style={{ font: '800 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.goldText }}>{rotulo}</p>
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
        sub={r.ingestaProm != null ? `${periodo === 'dia' ? 'Gastas' : 'Gastas en promedio'} ${fmtNum(r.gastoProm ?? 0)} kcal${porDia}` : 'Falta tu peso para estimar tu gasto'} />
      <Cifra rotulo="Balance" valor={r.calculables ? `${conSigno(r.balance)} kcal` : '—'} color={r.calculables ? colorBalance(r.balance) : undefined}
        sub={r.calculables ? (r.balance <= 0 ? 'Déficit: comiste menos de lo que gastas' : 'Superávit: comiste más de lo que gastas') : undefined} />
      <Cifra rotulo="Ejercicio" valor={r.ejercicioMin > 0 ? horas(r.ejercicioMin) : '0 min'}
        sub={r.ejercicioMin > 0 ? `${r.diasConEjercicio} ${r.diasConEjercicio === 1 ? 'día' : 'días'} · ${fmtNum(r.ejercicioKcal)} kcal de más` : 'Sin ejercicio anotado'} />
      <Cifra rotulo="Proteína" valor={r.protProm != null ? `${fmtNum(r.protProm)} g` : '—'}
        sub={r.protProm != null ? `${periodo === 'dia' ? 'De' : 'Al día, de'} ${fmtNum(metaProt)} g que pide tu dieta (solo las comidas del plan)` : undefined} />
    </div>
  )
}

// ── Gustos ──────────────────────────────────────────────────────────────────

export function Gustos({ r }: { r: ResumenPeriodo }) {
  if (r.extrasN <= 0) {
    return (
      <Panel eyebrow="Tus gustos" icon="🍫" title="Sin gustos anotados" subtitle="Alcohol, chocolate, pastel, comida fuera del plan… cuando los anotes verás aquí cuánto pesaron.">
        <p style={{ fontSize: 13, color: COLOR.muted }}>En este periodo no anotaste ninguno.</p>
      </Panel>
    )
  }
  const grasa = r.extrasKcal / 7700
  return (
    <Panel eyebrow="Tus gustos" icon="🍫" title={`${fmtNum(r.extrasKcal)} kcal fuera del plan`}
      subtitle={`≈ ${fmtGrasa(grasa)} de grasa si no los hubieras compensado con nada.`}>
      <div className="flex flex-wrap gap-2">
        {GRUPOS_EXTRA.filter(g => r.porGrupo[g.v].n > 0).map(g => (
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

// ── Gráfica ─────────────────────────────────────────────────────────────────

export function Grafica({ barras }: { barras: Barra[] }) {
  const semanal = barras.length > 0 && barras[0].etiqueta.startsWith('semana')
  const vals = barras.map(b => b.balance).filter((v): v is number => v != null)
  const caja = useRef<HTMLDivElement>(null)
  // Se dibuja en píxeles reales (sin escalar): el texto y las barras no se agrandan en una pantalla ancha.
  const [disponible, setDisponible] = useState(0)
  useEffect(() => {
    const el = caja.current; if (!el) return
    const medir = () => setDisponible(el.clientWidth)
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(medir); o.observe(el)
    return () => o.disconnect()
  }, [vals.length > 0])
  // Si la gráfica no cabe y hay que deslizarla, se abre en lo más reciente (el extremo derecho).
  useEffect(() => { const el = caja.current; if (el) el.scrollLeft = el.scrollWidth }, [barras.length, barras[0]?.clave, disponible])
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

function ChipsExtras({ dia }: { dia: DiaDiario }) {
  const porGrupo = GRUPOS_EXTRA.map(g => ({ g, n: dia.extras.filter(e => e.grupo === g.v).reduce((a, e) => a + e.n, 0) })).filter(x => x.n > 0)
  return <>{porGrupo.map(({ g, n }) => <span key={g.v} title={g.nombre} className="tabular-nums" style={{ fontSize: 13 }}><span aria-hidden>{g.icono}</span> ×{fmtNum(n, n % 1 ? 1 : 0)}</span>)}</>
}

export function ListaDias({ filas, hoy, onEditar }: { filas: FilaDia[]; hoy: string; onEditar: (fecha: string) => void }) {
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
                  <ChipsExtras dia={f.dia} />
                  {f.t.ejercicioMin > 0 && <span title="Ejercicio"><span aria-hidden>🏃</span> {horas(f.t.ejercicioMin)}</span>}
                </span>
                <span className="tabular-nums" style={{ fontSize: 13, textAlign: 'right', minWidth: 120 }}>
                  {f.t.balance != null && f.t.kg != null
                    ? <strong style={{ color: colorBalance(f.t.balance) }}>{conSigno(f.t.balance)} kcal · {f.t.kg < 0 ? '−' : f.t.kg > 0 ? '+' : ''}{fmtGrasa(f.t.kg)}</strong>
                    : <span style={{ color: COLOR.muted }}>sin peso para estimar</span>}
                </span>
                <button type="button" onClick={() => onEditar(f.fecha)} aria-label={`Editar el ${etiquetaLarga(f.fecha)}`} className={`${BTN.base} ${BTN.ghost} min-h-10`}>Editar</button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1" style={{ fontSize: 13, color: COLOR.muted }}>Sin anotar</span>
                <button type="button" onClick={() => onEditar(f.fecha)} aria-label={`Anotar el ${etiquetaLarga(f.fecha)}`} className={`${BTN.base} ${BTN.ghost} min-h-10`}>Anotar</button>
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

// ── Detalle de un día ───────────────────────────────────────────────────────

export function DetalleDia({ dia, ctx, pesoDelDia, puedeEditar, onEditar, fecha }: {
  dia: DiaDiario | null; ctx: Contexto; pesoDelDia: number | null; puedeEditar: boolean; onEditar: () => void; fecha: string
}) {
  if (!dia) {
    return (
      <Panel eyebrow="Detalle" icon="🗒️" title="Este día no está anotado">
        <p style={{ fontSize: 13, color: COLOR.muted }}>Cuando lo anotes verás aquí tus comidas, tus gustos y tu ejercicio.</p>
        {puedeEditar && <button type="button" onClick={onEditar} className={`${BTN.base} ${BTN.gold} mt-3 min-h-11`}>＋ Anotar este día</button>}
      </Panel>
    )
  }
  const t = totalesDia(dia, ctx)
  return (
    <Panel eyebrow="Detalle" icon="🗒️" title="Lo que anotaste" right={puedeEditar ? <button type="button" onClick={onEditar} className={`${BTN.base} ${BTN.ghost} min-h-10`}>✏️ Editar este día</button> : undefined}>
      <div className="space-y-4">
        <div>
          <h3 style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: COLOR.goldText }}>Comidas</h3>
          <ul className="mt-1.5 space-y-1">
            {dia.comidas.map(c => (
              <li key={c.id} className="flex items-center justify-between gap-3 tabular-nums" style={{ fontSize: 13.5 }}>
                <span className="min-w-0">{c.nombre} <span style={{ color: COLOR.muted }}>· {fmtNum(c.kcal)} kcal</span></span>
                <Pill color={c.est === 'completa' ? COLOR.good : c.est === 'mitad' ? COLOR.warn : COLOR.bad}>{ESTADOS_COMIDA.find(e => e.v === c.est)?.nombre}</Pill>
              </li>
            ))}
            {dia.comidas.length === 0 && <li style={{ fontSize: 13, color: COLOR.muted }}>Sin comidas del plan.</li>}
          </ul>
        </div>
        {dia.extras.length > 0 && (
          <div>
            <h3 style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: COLOR.goldText }}>Gustos y extras</h3>
            <ul className="mt-1.5 space-y-1">
              {dia.extras.map((e, i) => (
                <li key={`${e.id}-${i}`} className="flex items-center justify-between gap-3 tabular-nums" style={{ fontSize: 13.5 }}>
                  <span className="min-w-0"><span aria-hidden>{grupoDe(e.grupo).icono}</span> {e.nombre} <span style={{ color: COLOR.muted }}>×{fmtNum(e.n, e.n % 1 ? 1 : 0)}</span></span>
                  <span className="font-semibold">{fmtNum(Math.round(e.n * e.kcal))} kcal</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {dia.ejercicio.length > 0 && (
          <div>
            <h3 style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: COLOR.goldText }}>Ejercicio</h3>
            <ul className="mt-1.5 space-y-1">
              {dia.ejercicio.map((e, i) => (
                <li key={`${e.id}-${i}`} className="flex items-center justify-between gap-3 tabular-nums" style={{ fontSize: 13.5 }}>
                  <span className="min-w-0"><span aria-hidden>🏃</span> {e.nombre} <span style={{ color: COLOR.muted }}>· {horas(e.min)}</span></span>
                  <span className="font-semibold">{fmtNum(e.kcal)} kcal</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {dia.nota && <p className="rounded-lg px-3 py-2" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}`, fontSize: 13.5, lineHeight: 1.5 }}>📝 {dia.nota}</p>}
        <div className="rounded-xl p-3.5 tabular-nums" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}`, fontSize: 13.5, lineHeight: 1.7 }}>
          <div>Comiste: <strong>{fmtNum(t.ingesta)} kcal</strong> ({fmtNum(t.ingestaPlan)} del plan{t.extrasKcal > 0 ? ` + ${fmtNum(t.extrasKcal)} de gustos` : ''})</div>
          {t.gasto != null && t.gastoBase != null ? (
            <>
              <div>Gastas: <strong>{fmtNum(t.gasto)} kcal</strong> ({fmtNum(t.gastoBase)} de gasto base{t.ejercicioKcal > 0 ? ` + ${fmtNum(t.ejercicioKcal)} de ejercicio` : ''})</div>
              <div>Balance: <strong style={{ color: colorBalance(t.balance ?? 0) }}>{conSigno(t.balance ?? 0)} kcal ≈ {fmtKgCambio(t.kg ?? 0)} kg</strong></div>
            </>
          ) : <div style={{ color: COLOR.muted }}>Falta tu peso para estimar cuánto gastas.</div>}
          {pesoDelDia != null && <div>⚖️ Peso de ese día: <strong>{fmtNum(pesoDelDia, 1)} kg</strong> ({etiquetaCorta(fecha)})</div>}
        </div>
      </div>
    </Panel>
  )
}
