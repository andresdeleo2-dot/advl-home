'use client'

// Formulario para anotar un día: las comidas de tu dieta (completas, a medias o no), tus gustos fuera del plan y el ejercicio.
// Arriba el día se puede cambiar; abajo una barra pegajosa muestra, mientras escribes, cuánto comiste, cuánto gastas y el
// balance estimado. El formulario no guarda solo: el padre recibe `onGuardar` con el día completo.

import { useEffect, useMemo, useState } from 'react'
import { diaDeFecha, fmtNum, type DocDieta, type DocRutina } from '@/lib/peso-contenido'
import {
  EJERCICIOS_CATALOGO, ESTADOS_COMIDA, EXTRAS_CATALOGO, GRUPOS_EXTRA, MAX_NOTA, conSigno, diaNuevo, ejercicioDeRutina, etiquetaLarga, fmtKgCambio,
  kcalEjercicio, pesoEn, sumaDias, totalesDia,
  type Contexto, type DiaDiario, type EjercicioDia, type EstadoComida, type ExtraCatalogo, type ExtraDia, type GrupoExtra,
} from '@/lib/peso-diario'
import { BTN, COLOR, INPUT, Panel, Pill, Segmented } from '../ui'

const CAJA = { background: COLOR.card2, border: `1px solid ${COLOR.line}` } as const
const CHIP = 'inline-flex items-center gap-1.5 rounded-full border px-3 min-h-10 text-[13px] font-semibold transition-colors hover:border-[#C2933A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8A6420]'

/** Número que se puede teclear con calma (mientras escribes puede estar vacío o a medias) y que se acomoda al salir del campo. */
function Num({ valor, onValor, min = 0, max = 99999, paso = 1, etiqueta, className = '' }: {
  valor: number; onValor: (n: number) => void; min?: number; max?: number; paso?: number; etiqueta: string; className?: string
}) {
  const [txt, setTxt] = useState(String(valor))
  useEffect(() => { setTxt(prev => (Number(prev) === valor ? prev : String(valor))) }, [valor])
  return (
    <input
      type="number" inputMode="decimal" min={min} max={max} step={paso} value={txt} aria-label={etiqueta}
      onChange={e => { setTxt(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n)) onValor(Math.min(max, Math.max(min, n))) }}
      onBlur={() => setTxt(String(valor))}
      className={`${INPUT} min-h-11 tabular-nums ${className}`}
    />
  )
}

function Seccion({ icono, titulo, ayuda, children, right }: { icono: string; titulo: string; ayuda?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl p-3.5 sm:p-4" style={CAJA}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="serif" style={{ fontSize: 19, lineHeight: 1.2, fontWeight: 600, color: COLOR.navy }}><span aria-hidden>{icono}</span> {titulo}</h3>
          {ayuda && <p className="mt-0.5" style={{ fontSize: 12.5, lineHeight: 1.45, color: COLOR.muted }}>{ayuda}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export default function DiaEditor({
  fecha, hoy, base, inicial, dieta, rutina, ctx, pesoDelDia, disponible, existe, onCambio, onCambiarFecha, onGuardar, onBorrar, onCerrar, onMedir,
}: {
  fecha: string; hoy: string
  /** Lo guardado de ese día (o la plantilla de un día nuevo): con eso se sabe si hay cambios sin guardar. */
  base: DiaDiario
  /** Con lo que arranca el formulario (lo guardado, o un borrador que se estaba escribiendo). */
  inicial: DiaDiario
  dieta: DocDieta; rutina: DocRutina; ctx: Contexto
  /** La medición de la báscula de ese día, si hay. */
  pesoDelDia: number | null
  disponible: boolean
  /** ¿Ya hay algo guardado de ese día? */
  existe: boolean
  onCambio: (d: DiaDiario) => void
  onCambiarFecha: (f: string) => void
  onGuardar: (d: DiaDiario) => Promise<string | null>
  onBorrar: () => Promise<string | null>
  onCerrar: () => void
  onMedir: () => void
}) {
  const [dia, setDia] = useState<DiaDiario>(inicial)
  const [ocupado, setOcupado] = useState<'guardar' | 'borrar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [otroNombre, setOtroNombre] = useState('')
  const [otroKcal, setOtroKcal] = useState(200)
  const [otroGrupo, setOtroGrupo] = useState<GrupoExtra>('otro')

  const sucio = JSON.stringify(dia) !== JSON.stringify(base)
  const peso = useMemo(() => pesoEn(ctx.registros, fecha), [ctx.registros, fecha])
  const t = useMemo(() => totalesDia(dia, ctx), [dia, ctx])
  const diaRutina = useMemo(() => diaDeFecha(rutina, fecha), [rutina, fecha])
  const deRutina = useMemo(() => ejercicioDeRutina(diaRutina, peso), [diaRutina, peso])

  const cambiar = (f: (d: DiaDiario) => DiaDiario) => { const n = f(dia); setDia(n); onCambio(n) }

  // Con cambios sin guardar, el navegador avisa antes de cerrar o recargar la página.
  useEffect(() => {
    if (!sucio) return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [sucio])

  // ── Comidas ──
  const poner = (id: string, est: EstadoComida) => cambiar(d => ({ ...d, comidas: d.comidas.map(c => (c.id === id ? { ...c, est } : c)) }))
  const todoPlan = () => cambiar(d => ({ ...d, comidas: d.comidas.map(c => ({ ...c, est: 'completa' as const })) }))
  // Si la dieta ganó una comida después de anotar este día, se ofrece agregarla (el día guarda su propia copia de las comidas).
  const faltantes = dieta.comidas.filter(c => !dia.comidas.some(x => x.id === c.id))
  const agregarComidas = () => cambiar(d => ({ ...d, comidas: [...d.comidas, ...diaNuevo(fecha, faltantes).comidas] }))

  // ── Gustos ──
  const sumarExtra = (c: ExtraCatalogo) => cambiar(d => {
    const i = d.extras.findIndex(e => e.id === c.id)
    if (i >= 0) return { ...d, extras: d.extras.map((e, j) => (j === i ? { ...e, n: e.n + 1 } : e)) }
    return { ...d, extras: [...d.extras, { id: c.id, nombre: c.nombre, grupo: c.grupo, n: 1, kcal: c.kcal }] }
  })
  const cambiarExtra = (i: number, p: Partial<ExtraDia>) => cambiar(d => ({ ...d, extras: d.extras.map((e, j) => (j === i ? { ...e, ...p } : e)) }))
  const quitarExtra = (i: number) => cambiar(d => ({ ...d, extras: d.extras.filter((_, j) => j !== i) }))
  const agregarOtro = () => {
    const nombre = otroNombre.trim()
    if (!nombre) return
    cambiar(d => ({ ...d, extras: [...d.extras, { id: `otro-${d.extras.length + 1}`, nombre, grupo: otroGrupo, n: 1, kcal: Math.round(otroKcal) }] }))
    setOtroNombre('')
  }

  // ── Ejercicio ──
  const sumarEjercicio = (id: string) => {
    const c = EJERCICIOS_CATALOGO.find(e => e.id === id); if (!c) return
    cambiar(d => ({ ...d, ejercicio: [...d.ejercicio, { id: c.id, nombre: c.nombre, min: c.min, kcal: kcalEjercicio(c.id, c.min, peso) }] }))
  }
  const cambiarEjercicio = (i: number, p: Partial<EjercicioDia>) => cambiar(d => ({ ...d, ejercicio: d.ejercicio.map((e, j) => (j === i ? { ...e, ...p } : e)) }))
  const minutos = (i: number, min: number) => cambiar(d => ({ ...d, ejercicio: d.ejercicio.map((e, j) => (j === i ? { ...e, min, kcal: kcalEjercicio(e.id, min, peso) } : e)) }))
  const quitarEjercicio = (i: number) => cambiar(d => ({ ...d, ejercicio: d.ejercicio.filter((_, j) => j !== i) }))
  const cargarRutina = () => cambiar(d => ({ ...d, ejercicio: [...d.ejercicio, ...deRutina.filter(x => !d.ejercicio.some(e => e.id === x.id))] }))
  const rutinaPendiente = deRutina.filter(x => !dia.ejercicio.some(e => e.id === x.id)).length

  async function guardar() {
    if (ocupado) return
    setOcupado('guardar'); setError(null)
    const e = await onGuardar(dia)
    setOcupado(null)
    if (e) setError(e)
  }
  async function borrar() {
    if (ocupado) return
    if (!window.confirm(`¿Borrar lo que anotaste el ${etiquetaLarga(fecha)}? Esta acción no se puede deshacer.`)) return
    setOcupado('borrar'); setError(null)
    const e = await onBorrar()
    setOcupado(null)
    if (e) setError(e)
  }
  function cerrar() {
    if (sucio && !window.confirm('¿Descartar lo que no has guardado?')) return
    onCerrar()
  }
  function irA(f: string) {
    if (!f || f === fecha) return
    if (sucio && !window.confirm('Cambiar de día descarta lo que no has guardado. ¿Seguir?')) return
    onCambiarFecha(f)
  }

  const gruposConEntradas = GRUPOS_EXTRA.filter(g => dia.extras.some(e => e.grupo === g.v))

  return (
    <Panel
      eyebrow={existe ? 'Editando un día' : 'Anotar un día'} icon="✍️" title={etiquetaLarga(fecha)}
      subtitle="Marca lo que sí fue así y cambia lo que no. El día se guarda cuando pulses «Guardar el día»."
      right={existe ? <Pill color={COLOR.good}>✓ Ya anotado</Pill> : <Pill color={COLOR.muted}>Día nuevo</Pill>}
    >
      <div className="space-y-4">
        {/* Día y peso */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="block">
            <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.muted }}>Día</span>
            <input type="date" value={fecha} min="2020-01-01" max={hoy} onChange={e => irA(e.target.value)} className={`${INPUT} mt-1 min-h-11 w-44`} />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => irA(hoy)} disabled={fecha === hoy} className={`${BTN.base} ${BTN.ghost} min-h-11`}>Hoy</button>
            <button type="button" onClick={() => irA(sumaDias(hoy, -1))} disabled={fecha === sumaDias(hoy, -1)} className={`${BTN.base} ${BTN.ghost} min-h-11`}>Ayer</button>
          </div>
          <p className="min-w-0 flex-1" style={{ flexBasis: 220, fontSize: 12.5, lineHeight: 1.5, color: COLOR.muted }}>
            {pesoDelDia != null
              ? <>⚖️ Ese día te pesaste: <strong style={{ color: COLOR.ink }}>{fmtNum(pesoDelDia, 1)} kg</strong>.</>
              : <>Sin pesaje ese día. <button type="button" onClick={onMedir} className="underline" style={{ color: COLOR.goldText, fontWeight: 700 }}>⚖️ Registrar mi peso</button></>}
            {peso != null && <> Para tus cuentas se usa {fmtNum(peso, 1)} kg.</>}
          </p>
        </div>

        {/* Comidas */}
        <Seccion
          icono="🍽️" titulo="Comidas de tu dieta"
          ayuda="Las kcal salen de tu dieta. Si te saltaste una, márcala «No la comí»; lo que comiste fuera del plan va en «Gustos y extras»."
          right={<button type="button" onClick={todoPlan} className={`${BTN.base} ${BTN.ghost} min-h-10`}>✓ Todo según el plan</button>}
        >
          {dia.comidas.length === 0 ? (
            <p style={{ fontSize: 13, color: COLOR.muted }}>Tu dieta no tiene comidas todavía: agrégalas en Dieta › Editar.</p>
          ) : (
            <ul className="space-y-2">
              {dia.comidas.map(c => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-white px-3 py-2.5" style={{ border: `1px solid ${COLOR.line}` }}>
                  <span className="min-w-0">
                    <span className="block font-semibold" style={{ fontSize: 14, color: COLOR.navy }}>{c.nombre}</span>
                    <span className="block tabular-nums" style={{ fontSize: 12, color: COLOR.muted }}>{fmtNum(c.kcal)} kcal · {fmtNum(c.prot)} g de proteína</span>
                  </span>
                  <Segmented<EstadoComida> ariaLabel={`${c.nombre}: cuánto comiste`} value={c.est} onChange={v => poner(c.id, v)} options={ESTADOS_COMIDA.map(e => ({ value: e.v, label: e.nombre }))} />
                </li>
              ))}
            </ul>
          )}
          {faltantes.length > 0 && (
            <button type="button" onClick={agregarComidas} className={`${BTN.base} ${BTN.ghost} mt-2.5 min-h-10`}>＋ Agregar {faltantes.map(c => c.nombre.toLowerCase()).join(', ')} (están en tu dieta y no en este día)</button>
          )}
        </Seccion>

        {/* Gustos */}
        <Seccion
          icono="🍫" titulo="Gustos y extras"
          ayuda="Toca para sumar una porción. Las calorías son aproximadas y las puedes cambiar."
        >
          <div className="space-y-3">
            {GRUPOS_EXTRA.filter(g => g.v !== 'otro').map(g => (
              <div key={g.v}>
                <p style={{ font: '800 10.5px/1.2 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: COLOR.goldText }}><span aria-hidden>{g.icono}</span> {g.nombre}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {EXTRAS_CATALOGO.filter(c => c.grupo === g.v).map(c => {
                    const n = dia.extras.find(e => e.id === c.id)?.n ?? 0
                    return (
                      <button key={c.id} type="button" onClick={() => sumarExtra(c)} title={`${c.unidad} · ${c.kcal} kcal`} className={CHIP}
                        style={n > 0 ? { background: '#FFF8E6', borderColor: COLOR.gold, color: '#5A3205' } : { background: '#fff', borderColor: COLOR.lineStrong, color: COLOR.ink }}>
                        {c.nombre}{n > 0 && <span className="tabular-nums rounded-full px-1.5" style={{ background: COLOR.gold, color: '#fff', fontSize: 11 }}>×{fmtNum(n, n % 1 ? 1 : 0)}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-2.5" style={{ border: `1px dashed ${COLOR.lineStrong}` }}>
              <label className="block min-w-0 flex-1" style={{ flexBasis: 160 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.muted }}>Otro</span>
                <input value={otroNombre} onChange={e => setOtroNombre(e.target.value)} maxLength={80} placeholder="Ej. Paleta, elote, cacahuates…" className={`${INPUT} mt-1 min-h-11`}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarOtro() } }} />
              </label>
              <label className="block">
                <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.muted }}>kcal</span>
                <Num valor={otroKcal} onValor={setOtroKcal} max={5000} etiqueta="Calorías del otro gusto" className="mt-1 w-24" />
              </label>
              <label className="block">
                <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.muted }}>Tipo</span>
                <select value={otroGrupo} onChange={e => setOtroGrupo(e.target.value as GrupoExtra)} aria-label="Tipo del otro gusto" className={`${INPUT} mt-1 min-h-11`}>
                  {GRUPOS_EXTRA.map(g => <option key={g.v} value={g.v}>{g.nombre}</option>)}
                </select>
              </label>
              <button type="button" onClick={agregarOtro} disabled={!otroNombre.trim()} className={`${BTN.base} ${BTN.ghost} min-h-11`}>＋ Agregar</button>
            </div>
          </div>

          {dia.extras.length > 0 && (
            <div className="mt-4 space-y-3">
              {gruposConEntradas.map(g => (
                <div key={g.v}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: COLOR.muted }}><span aria-hidden>{g.icono}</span> {g.nombre} anotados</p>
                  <ul className="mt-1.5 space-y-2">
                    {dia.extras.map((e, i) => e.grupo !== g.v ? null : (
                      <li key={`${e.id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white px-3 py-2" style={{ border: `1px solid ${COLOR.line}` }}>
                        <span className="min-w-0 flex-1 font-semibold" style={{ flexBasis: 130, fontSize: 14, color: COLOR.navy }}>{e.nombre}</span>
                        <span className="flex items-center gap-1.5">
                          <button type="button" aria-label={`Una menos de ${e.nombre}`} disabled={e.n <= 1} onClick={() => cambiarExtra(i, { n: Math.max(1, e.n - 1) })} className={`${BTN.base} ${BTN.ghost} min-h-11 min-w-11 px-0 text-base`}>−</button>
                          <Num valor={e.n} onValor={n => cambiarExtra(i, { n: Math.round(n * 2) / 2 })} min={0.5} max={50} paso={0.5} etiqueta={`Porciones de ${e.nombre}`} className="w-16 text-center" />
                          <button type="button" aria-label={`Una más de ${e.nombre}`} onClick={() => cambiarExtra(i, { n: Math.min(50, e.n + 1) })} className={`${BTN.base} ${BTN.ghost} min-h-11 min-w-11 px-0 text-base`}>＋</button>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Num valor={e.kcal} onValor={kcal => cambiarExtra(i, { kcal: Math.round(kcal) })} max={5000} etiqueta={`Calorías de cada ${e.nombre}`} className="w-20" />
                          <span style={{ fontSize: 12, color: COLOR.muted }}>kcal c/u</span>
                        </span>
                        <span className="tabular-nums font-semibold" style={{ fontSize: 13, color: COLOR.ink, minWidth: 64, textAlign: 'right' }}>{fmtNum(Math.round(e.n * e.kcal))} kcal</span>
                        <button type="button" aria-label={`Quitar ${e.nombre}`} onClick={() => quitarExtra(i)} className={`${BTN.base} ${BTN.danger} min-h-11 min-w-11 px-0 text-base`}>✕</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="tabular-nums" style={{ fontSize: 13, color: COLOR.ink }}>Gustos del día: <strong>{fmtNum(t.extrasKcal)} kcal</strong></p>
            </div>
          )}
        </Seccion>

        {/* Ejercicio */}
        <Seccion
          icono="🏃" titulo="Ejercicio"
          ayuda={`Las calorías son las que gastas de más por moverte (según tu peso y la intensidad); puedes cambiarlas.`}
          right={diaRutina && deRutina.length > 0 ? (
            <button type="button" onClick={cargarRutina} disabled={rutinaPendiente === 0} className={`${BTN.base} ${BTN.ghost} min-h-10`} title="Agrega lo que toca hoy según tu rutina; los minutos los ajustas tú">
              ✓ Hice la rutina de {diaRutina.nombre.toLowerCase()}
            </button>
          ) : undefined}
        >
          <div className="flex flex-wrap gap-1.5">
            {EJERCICIOS_CATALOGO.map(c => (
              <button key={c.id} type="button" onClick={() => sumarEjercicio(c.id)} className={CHIP} style={{ background: '#fff', borderColor: COLOR.lineStrong, color: COLOR.ink }}>＋ {c.nombre}</button>
            ))}
          </div>
          {dia.ejercicio.length > 0 && (
            <ul className="mt-3 space-y-2">
              {dia.ejercicio.map((e, i) => (
                <li key={`${e.id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white px-3 py-2" style={{ border: `1px solid ${COLOR.line}` }}>
                  {e.id === 'otro'
                    ? <input value={e.nombre} maxLength={80} onChange={ev => cambiarEjercicio(i, { nombre: ev.target.value })} aria-label="Nombre del ejercicio" className={`${INPUT} min-h-11 min-w-0 flex-1`} style={{ flexBasis: 130 }} />
                    : <span className="min-w-0 flex-1 font-semibold" style={{ flexBasis: 130, fontSize: 14, color: COLOR.navy }}>{e.nombre}</span>}
                  <span className="flex items-center gap-1.5">
                    <Num valor={e.min} onValor={m => minutos(i, Math.round(m))} max={720} etiqueta={`Minutos de ${e.nombre}`} className="w-20" />
                    <span style={{ fontSize: 12, color: COLOR.muted }}>min</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Num valor={e.kcal} onValor={kcal => cambiarEjercicio(i, { kcal: Math.round(kcal) })} max={5000} etiqueta={`Calorías de ${e.nombre}`} className="w-20" />
                    <span style={{ fontSize: 12, color: COLOR.muted }}>kcal</span>
                  </span>
                  <button type="button" aria-label={`Quitar ${e.nombre}`} onClick={() => quitarEjercicio(i)} className={`${BTN.base} ${BTN.danger} min-h-11 min-w-11 px-0 text-base`}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        {/* Nota */}
        <Seccion icono="📝" titulo="Nota del día" ayuda="Opcional: cómo dormiste, cómo te sentiste, qué pasó.">
          <textarea value={dia.nota ?? ''} maxLength={MAX_NOTA} rows={2} aria-label="Nota del día" onChange={e => cambiar(d => ({ ...d, nota: e.target.value }))} className={`${INPUT} min-h-[72px]`} />
        </Seccion>

        {existe && (
          <div>
            <button type="button" onClick={() => void borrar()} disabled={!!ocupado || !disponible} className={`${BTN.base} ${BTN.danger} min-h-11`}>{ocupado === 'borrar' ? 'Borrando…' : '🗑️ Borrar este día'}</button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl px-4 py-2.5" style={{ background: '#FEF2F1', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.bad}`, color: '#7F1D1D', fontSize: 13.5 }}>{error}</p>}

      {/* Barra pegajosa: la cuenta del día mientras escribes + guardar */}
      <div className="sticky z-30 mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-2xl px-4 py-3" style={{ bottom: 'max(12px, env(safe-area-inset-bottom))', background: COLOR.navy, color: COLOR.onDark, boxShadow: '0 18px 40px -16px rgba(15,35,64,.7)' }}>
        <div className="min-w-0 tabular-nums" aria-live="polite" style={{ fontSize: 13, lineHeight: 1.45 }}>
          <span>Comiste <strong>{fmtNum(t.ingesta)}</strong></span>
          {t.gasto != null && t.balance != null && t.kg != null ? (
            <>
              <span style={{ color: COLOR.onDarkMuted }}> · gastas </span><strong>{fmtNum(t.gasto)}</strong>
              <span style={{ color: COLOR.onDarkMuted }}> → </span>
              <strong style={{ color: t.balance <= 0 ? COLOR.goodOnDark : COLOR.badOnDark }}>{conSigno(t.balance)} kcal ≈ {fmtKgCambio(t.kg)} kg</strong>
            </>
          ) : <span style={{ color: COLOR.onDarkMuted }}> kcal · registra tu peso para estimar cuánto gastas</span>}
        </div>
        <span className="flex items-center gap-2">
          <button type="button" onClick={cerrar} disabled={ocupado === 'guardar'} className={`${BTN.base} min-h-11 px-4 text-sm`} style={{ background: 'rgba(255,255,255,.1)', color: COLOR.onDark }}>Cancelar</button>
          <button type="button" onClick={() => void guardar()} disabled={!!ocupado || !disponible || (existe && !sucio)} title={disponible ? undefined : 'Falta crear la tabla para guardar'} className={`${BTN.base} ${BTN.gold} min-h-11`}>{ocupado === 'guardar' ? 'Guardando…' : 'Guardar el día'}</button>
        </span>
      </div>
    </Panel>
  )
}
