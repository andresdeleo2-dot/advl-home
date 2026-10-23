'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { addDays, daysBetween, hoyMX, type PesoPlan } from '@/lib/peso'
import { pesoParaIMC, tallaCuadrada } from '@/lib/peso-perfil'
import { rangoSaludableTxt, tallaTxt } from '@/lib/peso-visuals'
import type { PesoMetaProps } from './contratos'
import { savePlan } from './actions'
import { usePerfil } from './perfil-context'
import { BTN, COLOR, Eyebrow, INPUT, Panel } from './ui'
import {
  FOCO, LABEL_STYLE, calcularMeta, calcularMetaGrasa, fmtFechaCorta, fmtNum, fmtSigned, sugerenciasMeta, useHoy,
  type CalculoMeta, type SugerenciaMeta,
} from './metricas'

// Meta + proyección (pestaña Resumen). La proyección ya NO depende del rango del selector de la gráfica: usa el ritmo
// de los últimos 90 días (o 180 / 365 si no alcanzan los datos) y dice cuál usó.
// La estatura del perfil (usePerfil) fija el peso de IMC 25, el rango saludable y las sugerencias de meta.
// savePlan hace upsert del registro COMPLETO (rutina, dieta, notas y meta): este formulario reenvía rutina/dieta/notas
// como campos ocultos para no borrarlos, y PesoPlanTexto hace lo mismo con la meta.

type Borrador = { peso: string; fecha: string; grasa: string }

const TONOS = {
  bueno: { c: '#15803d', icono: '✓' },
  aviso: { c: '#b45309', icono: '!' },
  malo: { c: '#b91c1c', icono: '×' },
  info: { c: COLOR.navy2, icono: 'i' },
} as const

// ── Piezas visuales ──────────────────────────────────────────────────────────

/** Anillo de avance. El número va en HTML (serif) encima del SVG para no pelear con las fuentes dentro del <svg>. */
function Anillo({ pct, alcanzada, meta }: { pct: number; alcanzada: boolean; meta: number }) {
  const R = 52, C = 2 * Math.PI * R
  const p = Math.round(pct * 100)
  const color = alcanzada ? '#15803d' : COLOR.gold
  return (
    <div
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-valuetext={`${p}% del camino hacia ${meta} kg`}
      aria-label={`Avance hacia tu meta de ${meta} kg`}
      className="relative shrink-0 h-[104px] w-[104px] sm:h-[120px] sm:w-[120px]"
    >
      <svg viewBox="0 0 120 120" aria-hidden className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke={COLOR.line} strokeWidth="11" />
        {p > 0 && (
          <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="serif tabular-nums" style={{ fontSize: 34, lineHeight: 1, fontWeight: 600, color: COLOR.navy }}>
          {alcanzada ? '✓' : p}{!alcanzada && <span style={{ fontSize: 16, fontWeight: 600 }}>%</span>}
        </span>
        <span style={{ font: '700 9.5px/1 var(--font-ui, system-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: COLOR.muted, marginTop: 4 }}>
          {alcanzada ? 'Lograda' : 'del camino'}
        </span>
      </div>
    </div>
  )
}

// La unidad va en un span chico dentro del valor: a 360 px cada celda tiene ~68 px útiles y
// «91.3 kg» a tamaño completo partía «kg» a otra línea. nowrap + unidad chica la mantienen en una línea.
function Celda({ etiqueta, valor, unidad, sub, color, titulo }: {
  etiqueta: ReactNode; valor: string; unidad?: string; sub?: string; color?: string; titulo?: string
}) {
  return (
    <div className="rounded-xl px-2.5 py-2.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }} title={titulo}>
      <Eyebrow color={COLOR.muted}>{etiqueta}</Eyebrow>
      <div className="serif mt-1 whitespace-nowrap tabular-nums" style={{ fontSize: 22, lineHeight: 1.05, fontWeight: 600, color: color ?? COLOR.navy }}>
        {valor}
        {unidad && <span style={{ fontSize: 12, fontWeight: 600, color: COLOR.muted }}> {unidad}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] leading-tight" style={{ color: COLOR.muted }}>{sub}</div>}
    </div>
  )
}

function Barra({ etiqueta, valor, frac, color, nota }: { etiqueta: string; valor: string; frac: number; color: string; nota?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold" style={{ color: COLOR.ink }}>{etiqueta}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>{valor}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: COLOR.line }} aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%`, background: color, transition: 'width .5s ease' }} />
      </div>
      {nota && <div className="mt-1 text-[11px]" style={{ color: COLOR.muted }}>{nota}</div>}
    </div>
  )
}

function IlustracionMeta() {
  return (
    <svg viewBox="0 0 96 96" aria-hidden className="h-20 w-20 shrink-0">
      <circle cx="48" cy="48" r="44" fill="#F6F4EE" stroke={COLOR.lineStrong} />
      <circle cx="48" cy="48" r="32" fill="none" stroke={COLOR.navy} strokeWidth="2" opacity=".85" />
      <circle cx="48" cy="48" r="20" fill="none" stroke={COLOR.gold} strokeWidth="3" />
      <circle cx="48" cy="48" r="7" fill={COLOR.gold} />
      <path d="M48 48 L80 16" stroke={COLOR.navy} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M72 14 L82 14 L82 24" fill="none" stroke={COLOR.navy} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Texto del avance ─────────────────────────────────────────────────────────

/** Frase bajo la cifra grande. `calc.inicio` es el EXTREMO de la etapa actual (el peso más alto si bajas, el más bajo si
 *  subes; el mismo punto de partida del anillo del hero), no la primera medición. Por eso tu peso nunca queda «arriba»
 *  (si bajas) ni «abajo» (si subes) de ese punto: el peor caso es estar justo en él, con progreso 0. */
function textoAvance(c: CalculoMeta): string {
  const meta = fmtNum(c.metaPeso)
  if (c.alcanzada) {
    const pasado = -c.faltan   // kg más allá de la meta
    return pasado >= 0.5
      ? `${fmtNum(Math.round(pasado * 10) / 10)} kg ${c.sentido === 'bajar' ? 'por debajo' : 'por encima'} de tu meta de ${meta} kg`
      : `Meta de ${meta} kg`
  }
  if (c.progreso === 0) return 'Estás en tu punto de partida: aún no hay avance'
  const pct = Math.round(c.progreso * 100)
  const punto = `${c.sentido === 'bajar' ? 'punto más alto' : 'punto más bajo'} (${fmtNum(c.inicio.peso)} kg)`
  return pct === 0 ? `Menos de 1% del camino desde tu ${punto}` : `${pct}% del camino desde tu ${punto}`
}

// ── Veredicto de la proyección ───────────────────────────────────────────────

function veredicto(c: CalculoMeta, metaFecha: string | null, hoy: string | null) {
  const p = c.proyeccion
  if (c.alcanzada) {
    return { tono: 'bueno' as const, titulo: 'Meta alcanzada', texto: `Pesas ${c.curPeso} kg (medido el ${fmtFechaCorta(c.curFecha)}) y tu meta era ${c.metaPeso} kg. Cuando quieras, fija una nueva.` }
  }
  if (!p) return null
  const verbo = c.sentido === 'bajar' ? 'bajar' : 'subir'
  const necesario = c.kgSemNecesarios != null && metaFecha
    ? ` Para llegar el ${fmtFechaCorta(metaFecha)} necesitarías ${verbo} ${c.kgSemNecesarios.toFixed(2)} kg por semana${c.kgSemNecesarios > 1 ? ', un ritmo muy exigente: conviene mover la fecha' : ''}.` : ''
  let extra = ''
  if (hoy && c.ritmo) {
    const dias = daysBetween(c.ritmo.hasta, hoy)
    if (dias > 14) extra = ` Ojo: tu última medición fue hace ${dias} días; mídete para afinar la proyección.`
  }
  if (p.tipo === 'sin-ritmo' || !c.ritmo) {
    return { tono: 'info' as const, titulo: 'Aún no hay un ritmo confiable', texto: `Para proyectar se necesitan al menos 3 mediciones de peso que abarquen 2 semanas o más dentro del último año.${extra}` }
  }
  const ventana = `con tu ritmo de los últimos ${c.ritmo.ventana} días (${fmtSigned(c.ritmo.kgSem, 2)} kg/semana)`
  const cap = ventana.charAt(0).toUpperCase() + ventana.slice(1)
  if (p.tipo === 'no-avanza') {
    const sentidoOpuesto = (c.sentido === 'bajar' && c.ritmo.kgSem > 0.02) || (c.sentido === 'subir' && c.ritmo.kgSem < -0.02)
    return { tono: 'malo' as const, titulo: 'A este ritmo no te acercas a la meta', texto: `${cap} tu peso ${sentidoOpuesto ? `va en sentido contrario a la meta` : 'está casi estable'}.${necesario}${extra}` }
  }
  if (p.tipo === 'lejos') {
    const anios = Math.round((p.semanas / 52.14) * 10) / 10
    return { tono: 'aviso' as const, titulo: 'Llegarías, pero muy lejos', texto: `${cap} tardarías unos ${fmtNum(anios)} años en llegar.${necesario}${extra}` }
  }
  const llegada = fmtFechaCorta(p.fecha)
  if (p.aTiempo === true && metaFecha) {
    const antes = Math.abs(p.diasDif ?? 0)
    return { tono: 'bueno' as const, titulo: 'Vas a tiempo', texto: `${cap} llegarías el ${llegada}${antes > 0 ? `, ${antes} días antes de tu fecha meta (${fmtFechaCorta(metaFecha)})` : ', justo en tu fecha meta'}.${extra}` }
  }
  if (p.aTiempo === false && metaFecha) {
    return { tono: 'aviso' as const, titulo: 'Llegarías tarde', texto: `${cap} llegarías el ${llegada}, ${p.diasDif} días después de tu fecha meta (${fmtFechaCorta(metaFecha)}).${necesario || ' Sube el ritmo o mueve la fecha.'}${extra}` }
  }
  return { tono: 'info' as const, titulo: 'Tu proyección', texto: `${cap} llegarías el ${llegada}. Agrega una fecha meta para ver si vas a tiempo.${extra}` }
}

// ── Formulario ───────────────────────────────────────────────────────────────

function FormMeta({ plan, borrador, hayMeta, onCancel, onSaved }: {
  plan: PesoPlan | null; borrador: Borrador | null; hayMeta: boolean; onCancel: () => void; onSaved: () => void
}) {
  const perfil = usePerfil()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmaQuitar, setConfirmaQuitar] = useState(false)

  const dPeso = borrador?.peso ?? (plan?.meta_peso != null ? String(plan.meta_peso) : '')
  const dFecha = borrador?.fecha ?? plan?.meta_fecha ?? ''
  const dGrasa = borrador?.grasa ?? (plan?.meta_grasa != null ? String(plan.meta_grasa) : '')

  async function enviar(fd: FormData) {
    setGuardando(true)
    setError(null)
    try {
      const r = await savePlan(fd)
      if (!r.ok) { setError(`No se pudo guardar: ${r.error}`); return }
      onSaved()
    } catch {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const peso = parseFloat(String(fd.get('meta_peso') ?? ''))
    const fecha = String(fd.get('meta_fecha') ?? '')
    const grasaTxt = String(fd.get('meta_grasa') ?? '')
    const grasa = grasaTxt === '' ? null : parseFloat(grasaTxt)
    if (!Number.isFinite(peso) || peso < 35 || peso > 250) { setError('Escribe un peso meta entre 35 y 250 kg.'); return }
    // Una fecha vencida que ya estaba guardada se respeta (para poder cambiar solo el peso); una nueva debe ser futura.
    if (fecha && fecha !== plan?.meta_fecha && fecha <= hoyMX()) { setError('La fecha meta debe ser posterior a hoy.'); return }
    if (grasa != null && (!Number.isFinite(grasa) || grasa < 3 || grasa > 60)) { setError('El % de grasa meta debe estar entre 3 y 60.'); return }
    void enviar(fd)
  }

  function quitar(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form
    if (!form) return
    const fd = new FormData(form)
    fd.set('meta_peso', ''); fd.set('meta_fecha', ''); fd.set('meta_grasa', '')
    void enviar(fd)
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <input type="hidden" name="rutina" value={plan?.rutina ?? ''} />
      <input type="hidden" name="dieta" value={plan?.dieta ?? ''} />
      <input type="hidden" name="notas" value={plan?.notas ?? ''} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="meta-peso" className="mb-1 block" style={LABEL_STYLE}>Peso meta (kg)</label>
          <input id="meta-peso" name="meta_peso" type="number" step="0.1" min="35" max="250" inputMode="decimal" required defaultValue={dPeso}
            className={INPUT} style={{ minHeight: 44 }} autoFocus aria-describedby="meta-peso-ayuda" />
          <p id="meta-peso-ayuda" className="mt-1 text-[11px]" style={{ color: COLOR.muted }}>
            IMC 25 = {pesoParaIMC(perfil, 25).toFixed(1)} kg · saludable: {rangoSaludableTxt(perfil)}
          </p>
        </div>
        <div>
          <label htmlFor="meta-fecha" className="mb-1 block" style={LABEL_STYLE}>Fecha meta</label>
          <input id="meta-fecha" name="meta_fecha" type="date" defaultValue={dFecha} className={INPUT} style={{ minHeight: 44 }} />
          <p className="mt-1 text-[11px]" style={{ color: COLOR.muted }}>Opcional: con ella se calcula el ritmo que necesitas.</p>
        </div>
        <div>
          <label htmlFor="meta-grasa" className="mb-1 block" style={LABEL_STYLE}>% Grasa meta</label>
          <input id="meta-grasa" name="meta_grasa" type="number" step="0.1" min="3" max="60" inputMode="decimal" defaultValue={dGrasa}
            className={INPUT} style={{ minHeight: 44 }} />
          <p className="mt-1 text-[11px]" style={{ color: COLOR.muted }}>Opcional. 20% = rango saludable.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-xl px-3.5 py-2.5 text-sm font-medium" style={{ background: '#dc262612', border: '1px solid #dc262633', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {hayMeta && (
          confirmaQuitar ? (
            <span className="inline-flex items-center gap-2 text-xs" style={{ color: '#b91c1c' }}>
              ¿Quitar la meta?
              <button type="button" onClick={quitar} disabled={guardando} className={`${BTN.base} ${BTN.danger} min-h-10 ${FOCO}`}>Sí, quitar</button>
              <button type="button" onClick={() => setConfirmaQuitar(false)} className={`${BTN.base} ${BTN.ghost} min-h-10 ${FOCO}`}>No</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmaQuitar(true)} disabled={guardando} className={`${BTN.base} ${BTN.danger} min-h-10 ${FOCO}`}>Quitar meta</button>
          )
        )}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} disabled={guardando} className={`${BTN.base} ${BTN.ghost} min-h-10 ${FOCO}`}>Cancelar</button>
        <button type="submit" disabled={guardando} className={`${BTN.base} ${BTN.primary} min-h-10 ${FOCO}`}>
          {guardando ? 'Guardando…' : 'Guardar meta'}
        </button>
      </div>
    </form>
  )
}

// ── Sección ──────────────────────────────────────────────────────────────────

export default function PesoMeta({ plan, data }: PesoMetaProps) {
  const hoy = useHoy()
  const perfil = usePerfil()
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [formKey, setFormKey] = useState(0)

  const metaPeso = plan?.meta_peso ?? null
  const metaFecha = plan?.meta_fecha ?? null
  const hayMeta = metaPeso != null

  const calc = useMemo(() => (metaPeso != null ? calcularMeta(data, metaPeso, metaFecha, hoy) : null), [data, metaPeso, metaFecha, hoy])
  const grasa = useMemo(() => (plan?.meta_grasa != null ? calcularMetaGrasa(data, plan.meta_grasa) : null), [data, plan?.meta_grasa])
  const sugerencias = useMemo(() => sugerenciasMeta(data, perfil), [data, perfil])

  function abrir(b: Borrador | null = null) {
    setBorrador(b)
    setFormKey(k => k + 1)
    setEditando(true)
  }
  function usarSugerencia(s: SugerenciaMeta) {
    // Se calcula al pulsar (evento): la fecha de hoy nunca entra al render inicial.
    abrir({ peso: String(s.peso), fecha: addDays(hoyMX(), s.semanas * 7), grasa: s.grasa != null ? String(s.grasa) : (plan?.meta_grasa != null ? String(plan.meta_grasa) : '') })
  }

  const formulario = editando && (
    <FormMeta key={formKey} plan={plan} borrador={borrador} hayMeta={hayMeta} onCancel={() => setEditando(false)} onSaved={() => setEditando(false)} />
  )

  // ── Sin meta: estado vacío con sugerencias ──
  if (!hayMeta) {
    return (
      <Panel eyebrow="Meta y proyección" icon="🎯" title="Define tu meta"
        subtitle="Con una meta se calcula cuánto te falta, el ritmo que necesitas y si vas a tiempo.">
        {editando ? (
          <div className="pt-1">{formulario}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <IlustracionMeta />
              <div className="min-w-0">
                <p className="text-sm" style={{ color: COLOR.ink }}>
                  Todavía no tienes una meta. Elige un peso (y, si quieres, una fecha) y la proyección parte de tu ritmo real.
                </p>
                <p className="mt-1.5 text-xs" style={{ color: COLOR.muted }}>
                  Con tu estatura ({tallaTxt(perfil)} m), un peso saludable va de <strong className="tabular-nums" style={{ color: COLOR.ink }}>{rangoSaludableTxt(perfil)}</strong>.
                </p>
                <button type="button" onClick={() => abrir()} className={`${BTN.base} ${BTN.gold} mt-3 min-h-11 ${FOCO}`}>Poner meta</button>
              </div>
            </div>

            {sugerencias.length > 0 && (
              <div>
                <Eyebrow>Sugerencias para ti</Eyebrow>
                <ul className="mt-2 grid gap-2.5 sm:grid-cols-2">
                  {sugerencias.map(s => (
                    <li key={s.id} className="flex flex-col justify-between gap-3 rounded-xl p-3.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
                      <div>
                        <div className="serif" style={{ fontSize: 20, lineHeight: 1.15, fontWeight: 600, color: COLOR.navy }}>{s.titulo}</div>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: COLOR.muted }}>{s.detalle}</p>
                        <p className="mt-1 text-xs" style={{ color: COLOR.muted }}>
                          A un ritmo sostenible de 0.5 kg por semana: unas <strong style={{ color: COLOR.ink }}>{s.semanas} semanas</strong>.
                        </p>
                      </div>
                      <button type="button" onClick={() => usarSugerencia(s)} className={`${BTN.base} ${BTN.ghost} min-h-10 self-start ${FOCO}`}>Usar esta meta</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Panel>
    )
  }

  // ── Con meta ──
  const v = calc ? veredicto(calc, metaFecha, hoy) : null
  const titulo = calc?.alcanzada ? `Meta cumplida: ${fmtNum(metaPeso)} kg` : `${calc?.sentido === 'subir' ? 'Subir' : 'Bajar'} a ${fmtNum(metaPeso)} kg`
  const subtitulo = [metaFecha ? `para el ${fmtFechaCorta(metaFecha)}` : 'sin fecha límite', plan?.meta_grasa != null ? `${plan.meta_grasa}% de grasa` : null].filter(Boolean).join(' · ')

  // Escala común de las barras de ritmo: el mayor de los dos con un poco de aire.
  const necesario = calc?.kgSemNecesarios ?? null
  const real = calc?.ritmoEnSentido ?? null
  const escala = Math.max(necesario ?? 0, real != null ? Math.max(real, 0) : 0, 0.1) * 1.15
  const colorReal = real == null ? COLOR.muted : real <= 0.02 ? '#b91c1c' : necesario != null && real < necesario * 0.95 ? '#b45309' : '#15803d'

  return (
    <Panel eyebrow="Meta y proyección" icon="🎯" title={titulo} subtitle={subtitulo}
      accent={calc?.alcanzada ? '#15803d' : COLOR.gold}
      right={!editando && (
        <button type="button" onClick={() => abrir()} className={`${BTN.base} ${BTN.ghost} min-h-10 ${FOCO}`}>Editar meta</button>
      )}>
      {editando ? (
        <div className="pt-1">{formulario}</div>
      ) : !calc ? (
        <p className="text-sm" style={{ color: COLOR.muted }}>Registra tu primera medición de peso y aquí verás cuánto te falta y la proyección hacia {fmtNum(metaPeso)} kg.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4 sm:gap-6">
            <Anillo pct={calc.progreso} alcanzada={calc.alcanzada} meta={metaPeso} />
            <div className="min-w-0">
              <Eyebrow color={COLOR.muted}>{calc.alcanzada ? (-calc.faltan >= 0.5 ? 'Superaste tu meta' : 'Estás en tu meta') : calc.sentido === 'bajar' ? 'Te faltan por bajar' : 'Te faltan por subir'}</Eyebrow>
              <div className="serif mt-1 tabular-nums" style={{ fontSize: 46, lineHeight: 1, fontWeight: 600, color: COLOR.navy }}>
                {calc.alcanzada ? fmtNum(calc.curPeso) : fmtNum(Math.round(calc.faltan * 10) / 10)}
                <span style={{ fontSize: 18, fontWeight: 600, color: COLOR.muted }}> kg</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: COLOR.muted }}>{textoAvance(calc)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Celda etiqueta="Ahora" valor={fmtNum(calc.curPeso)} unidad="kg" sub={fmtFechaCorta(calc.curFecha)} />
            {metaFecha ? (
              calc.alcanzada ? (
                <Celda etiqueta="Plazo" valor="Logrado" sub={`Fecha meta: ${fmtFechaCorta(metaFecha)}`} color="#15803d" />
              ) : calc.diasRestantes == null ? (
                <Celda etiqueta="Plazo" valor="…" sub={`Hasta el ${fmtFechaCorta(metaFecha)}`} />
              ) : calc.diasRestantes < 0 ? (
                <Celda etiqueta="Plazo" valor={String(Math.abs(calc.diasRestantes))} unidad="d" sub="de retraso" color="#b91c1c" />
              ) : (
                <Celda etiqueta="Plazo" valor={String(calc.diasRestantes)} unidad="d" sub={`restantes · ${fmtFechaCorta(metaFecha)}`} />
              )
            ) : (
              <Celda etiqueta="Plazo" valor="—" sub="Sin fecha. Agrega una para ver el ritmo necesario" />
            )}
            {/* El extremo de la etapa actual, no la primera medición: «Punto más alto» si bajas, «Punto más bajo» si subes.
                En móvil (~80 px útiles por celda) la versión corta evita que la etiqueta se parta en dos líneas. */}
            <Celda
              etiqueta={calc.sentido === 'bajar'
                ? <><span className="sm:hidden">Más alto</span><span className="hidden sm:inline">Punto más alto</span></>
                : <><span className="sm:hidden">Más bajo</span><span className="hidden sm:inline">Punto más bajo</span></>}
              valor={fmtNum(calc.inicio.peso)} unidad="kg" sub={fmtFechaCorta(calc.inicio.fecha)}
              titulo={`Tu peso ${calc.sentido === 'bajar' ? 'más alto' : 'más bajo'} en tu etapa actual de registro: el avance se mide desde aquí`} />
          </div>

          {v && (
            <div role="status" className="flex items-start gap-3 rounded-xl px-3.5 py-3" style={{ background: `${TONOS[v.tono].c}12`, border: `1px solid ${TONOS[v.tono].c}33` }}>
              <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: TONOS[v.tono].c }}>{TONOS[v.tono].icono}</span>
              <div className="min-w-0">
                <div className="text-sm font-bold" style={{ color: TONOS[v.tono].c }}>{v.titulo}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: COLOR.ink }}>{v.texto}</p>
              </div>
            </div>
          )}

          {!calc.alcanzada && (necesario != null || real != null) && (
            <div className="space-y-3 rounded-xl p-3.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
              <Eyebrow>Ritmo: necesario vs real</Eyebrow>
              {necesario != null && (
                <Barra etiqueta="Necesario para llegar a tiempo" valor={`${necesario.toFixed(2)} kg/sem`} frac={necesario / escala} color={COLOR.navy2}
                  nota={calc.sentido === 'bajar' ? 'Bajando de forma sostenida hasta tu fecha meta.' : 'Subiendo de forma sostenida hasta tu fecha meta.'} />
              )}
              {real != null && calc.ritmo && (
                <Barra etiqueta={`Tu ritmo real · últimos ${calc.ritmo.ventana} días`}
                  valor={real > 0.02 ? `${real.toFixed(2)} kg/sem` : real < -0.02 ? `${Math.abs(real).toFixed(2)} kg/sem en contra` : 'Casi estable'}
                  frac={Math.max(real, 0) / escala} color={colorReal}
                  nota={`Regresión sobre ${calc.ritmo.n} mediciones${calc.ritmo.ventana !== 90 ? ' (con menos de 3 en 90 días se amplió la ventana)' : ''}.`} />
              )}
            </div>
          )}

          {plan?.meta_grasa != null && grasa && (
            <div className="rounded-xl p-3.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
              <Barra etiqueta={`Meta de grasa: ${plan.meta_grasa}%`}
                valor={grasa.alcanzada ? `${grasa.cur}% · lograda` : `${grasa.cur}% ahora`}
                frac={grasa.progreso} color={grasa.alcanzada ? '#15803d' : COLOR.gold}
                nota={grasa.alcanzada ? `Medida el ${fmtFechaCorta(grasa.curFecha)}.` : `Faltan ${fmtNum(grasa.faltan)} puntos de grasa · partiste de ${grasa.inicio}% (${fmtFechaCorta(grasa.inicioFecha)}).`} />
            </div>
          )}

          {/* Dónde cae la meta respecto al rango de IMC normal de la estatura del perfil. */}
          <p className="text-[11px] leading-relaxed" style={{ color: COLOR.muted }}>
            Tu meta de {fmtNum(metaPeso)} kg equivale a un IMC de {(metaPeso / tallaCuadrada(perfil)).toFixed(1)}. Con tu estatura ({tallaTxt(perfil)} m), el rango de IMC normal es de {rangoSaludableTxt(perfil)}.
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: COLOR.muted }}>
            La proyección es una línea recta con tu ritmo reciente; tu peso real sube y baja con el agua, la sal y la comida.
          </p>
        </div>
      )}
    </Panel>
  )
}
