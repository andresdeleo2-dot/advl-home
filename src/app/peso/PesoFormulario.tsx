'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { H2, addDays, daysBetween, fmtFecha, type PesoRecord } from '@/lib/peso'
import { addRegistro, updateRegistro } from './actions'
import { BTN, COLOR, Eyebrow, INPUT, Panel, Pill } from './ui'

// Formulario de alta/edición de una medición. Dos grupos: lo básico (fecha + peso, lo único que hace
// falta cuando te mides en casa) y la composición de la báscula (colapsable; abierto al editar). Las
// validaciones son suaves: los rangos absurdos (peso de 910 kg por un dedazo) bloquean el guardado
// con un mensaje junto al campo; lo raro pero posible (un cambio de 6 kg) solo avisa.

type Campo = 'peso' | 'pct_grasa' | 'pct_musculo' | 'imc' | 'rmr' | 'edad_corporal' | 'grasa_visceral'
type Clave = 'fecha' | Campo

type Def = { label: string; unidad: string; step: string; min: number; max: number; ayuda?: string }

const DEFS: Record<Campo, Def> = {
  peso:           { label: 'Peso', unidad: 'kg', step: '0.1', min: 30, max: 300 },
  pct_grasa:      { label: '% Grasa', unidad: '%', step: '0.1', min: 3, max: 60 },
  pct_musculo:    { label: '% Músculo', unidad: '%', step: '0.1', min: 15, max: 70 },
  imc:            { label: 'IMC', unidad: '', step: '0.1', min: 10, max: 70 },
  rmr:            { label: 'RMR', unidad: 'kcal', step: '1', min: 800, max: 4500, ayuda: 'Calorías en reposo' },
  edad_corporal:  { label: 'Edad corporal', unidad: 'años', step: '1', min: 10, max: 99 },
  grasa_visceral: { label: 'Grasa visceral', unidad: '', step: '1', min: 1, max: 59, ayuda: 'Escala de la báscula' },
}
const COMPOSICION: Campo[] = ['pct_grasa', 'pct_musculo', 'imc', 'rmr', 'edad_corporal', 'grasa_visceral']

// 16px evita que iOS haga zoom al enfocar; 44px de alto = objetivo táctil cómodo.
const CAMPO_INPUT = INPUT.replace('px-3 py-2 text-sm', 'px-3 py-2.5 text-base min-h-[44px]')

/** Dorado para TEXTO sobre fondo claro (contraste AA): el del sistema de diseño, sin copia local. */
const DORADO_TEXTO = COLOR.goldText
const PREF_KEY = 'peso.formulario.composicion'
const MAX_SALTO_KG = 5            // más que esto contra la medición previa -> aviso (no bloqueo)
const MAX_DIAS_COMPARABLE = 180   // comparar contra una medición de hace años no dice nada

function enTexto(v: number | null | undefined) {
  return v == null ? '' : String(v)
}

function inicial(editando: PesoRecord | null, hoy: string): Record<Clave, string> {
  return {
    fecha: editando?.fecha ?? hoy,
    peso: enTexto(editando?.peso), pct_grasa: enTexto(editando?.pct_grasa), pct_musculo: enTexto(editando?.pct_musculo),
    imc: enTexto(editando?.imc), rmr: enTexto(editando?.rmr), edad_corporal: enTexto(editando?.edad_corporal),
    grasa_visceral: enTexto(editando?.grasa_visceral),
  }
}

function leerNumero(v: string): number | null {
  const t = v.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

function Etiqueta({ htmlFor, children, extra }: { htmlFor: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-1">
      <label htmlFor={htmlFor} className="text-xs font-bold" style={{ color: COLOR.ink, letterSpacing: '.01em' }}>{children}</label>
      {extra}
    </div>
  )
}

function Mensaje({ id, tipo, children }: { id: string; tipo: 'error' | 'aviso' | 'pista'; children: ReactNode }) {
  const color = tipo === 'error' ? '#b91c1c' : tipo === 'aviso' ? '#b45309' : COLOR.muted
  return (
    <p id={id} className="mt-1 leading-snug" style={{ fontSize: 12, color, fontWeight: tipo === 'pista' ? 500 : 600 }}>
      {tipo === 'error' && <span aria-hidden>⛔ </span>}
      {tipo === 'aviso' && <span aria-hidden>⚠️ </span>}
      {children}
    </p>
  )
}

export default function PesoFormulario({ data, hoy, editando, primera, onCerrar }: {
  data: PesoRecord[]
  hoy: string
  /** Medición que se edita; null = alta nueva. */
  editando: PesoRecord | null
  /** true = aún no hay mediciones: no hay a dónde "cancelar". */
  primera: boolean
  /** Se llama al guardar con éxito o al cancelar. */
  onCerrar: () => void
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const idDe = (k: Clave) => `${uid}-${k}`

  const [vals, setVals] = useState<Record<Clave, string>>(() => inicial(editando, hoy))
  const [tocados, setTocados] = useState<Set<Clave>>(() => new Set())
  const [intentado, setIntentado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGlobal, setErrorGlobal] = useState('')
  // Composición: abierta al editar si ya tiene datos; al crear, según lo que hiciste la última vez.
  const tieneComposicion = !!editando && COMPOSICION.some(c => editando[c] != null)
  const [compAbierta, setCompAbierta] = useState(tieneComposicion)
  const refs = useRef<Partial<Record<Clave, HTMLInputElement | null>>>({})

  useEffect(() => {
    if (editando) return
    try { if (localStorage.getItem(PREF_KEY) === '1') setCompAbierta(true) } catch { /* sin storage: queda cerrada */ }
  }, [editando])

  function alternarComposicion() {
    const nueva = !compAbierta
    setCompAbierta(nueva)
    try { if (!editando) localStorage.setItem(PREF_KEY, nueva ? '1' : '0') } catch { /* da igual */ }
  }

  // Última medición con peso (excluye la que se edita) para la pista y el aviso de salto.
  const ultimaConPeso = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i--) if (data[i].peso != null && data[i].id !== editando?.id) return data[i]
    return null
  }, [data, editando])

  const fecha = vals.fecha
  // Otra medición ese mismo día. Al editar solo cuenta si cambiaste la fecha (si ya había dos, no se te insiste).
  const duplicada = useMemo(
    () => /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !(editando && editando.fecha === fecha)
      ? data.find(r => r.fecha === fecha && r.id !== editando?.id) ?? null
      : null,
    [data, fecha, editando],
  )

  // La medición previa a la fecha elegida: contra ésa se compara el salto de peso.
  const referencia = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return ultimaConPeso
    let ref: PesoRecord | null = null
    for (const r of data) if (r.peso != null && r.id !== editando?.id && r.fecha <= fecha) ref = r
    return ref
  }, [data, fecha, editando, ultimaConPeso])

  // ── Validación ─────────────────────────────────────────────────────────────
  const errores = useMemo(() => {
    const e: Partial<Record<Clave, string>> = {}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vals.fecha)) e.fecha = 'Elige la fecha de la medición.'
    else if (vals.fecha > hoy) e.fecha = 'La fecha no puede ser futura.'
    else if (vals.fecha < '2000-01-01') e.fecha = 'Revisa el año de la fecha.'
    for (const k of Object.keys(DEFS) as Campo[]) {
      const n = leerNumero(vals[k])
      if (n === null) continue
      const d = DEFS[k]
      if (Number.isNaN(n)) e[k] = 'Escribe solo un número.'
      else if (n < d.min || n > d.max) e[k] = `Debe estar entre ${d.min} y ${d.max}${d.unidad ? ` ${d.unidad}` : ''}.`
    }
    return e
  }, [vals, hoy])

  const avisos = useMemo(() => {
    const a: Partial<Record<Clave, string>> = {}
    const peso = leerNumero(vals.peso)
    if (peso != null && !Number.isNaN(peso) && referencia?.peso != null && !errores.peso) {
      const dias = Math.abs(daysBetween(referencia.fecha, vals.fecha))
      const salto = peso - referencia.peso
      if (dias <= MAX_DIAS_COMPARABLE && Math.abs(salto) > MAX_SALTO_KG) {
        a.peso = `${salto > 0 ? 'Subió' : 'Bajó'} ${Math.abs(salto).toFixed(1)} kg desde tu medición del ${fmtFecha(referencia.fecha)} (${referencia.peso} kg). Si es correcto, adelante.`
      }
    }
    const imc = leerNumero(vals.imc)
    if (peso != null && imc != null && !Number.isNaN(peso) && !Number.isNaN(imc) && !errores.imc && !errores.peso) {
      const esperado = peso / H2
      if (Math.abs(imc - esperado) > 1.5) a.imc = `Con ${peso} kg y 1.81 m, tu IMC rondaría ${esperado.toFixed(1)}. Revisa el dato.`
    }
    return a
  }, [vals, referencia, errores])

  // Diferencia en vivo contra la medición previa (pista bajo el peso).
  const deltaVivo = (() => {
    const peso = leerNumero(vals.peso)
    if (peso == null || Number.isNaN(peso) || referencia?.peso == null || errores.peso) return null
    return Math.round((peso - referencia.peso) * 10) / 10
  })()

  const sinDatos = Object.keys(DEFS).every(k => leerNumero(vals[k as Campo]) === null)

  const mostrar = (k: Clave) => (intentado || tocados.has(k)) ? errores[k] : undefined

  function cambiar(k: Clave, v: string) {
    setVals(p => ({ ...p, [k]: v }))
    if (errorGlobal) setErrorGlobal('')
  }
  function tocar(k: Clave) {
    setTocados(p => (p.has(k) ? p : new Set(p).add(k)))
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (guardando) return
    setIntentado(true)
    const primerError = (['fecha', ...Object.keys(DEFS)] as Clave[]).find(k => errores[k])
    if (primerError) {
      if (COMPOSICION.includes(primerError as Campo)) setCompAbierta(true)
      // El campo puede montarse recién (composición colapsada): se enfoca en el siguiente cuadro.
      requestAnimationFrame(() => refs.current[primerError]?.focus())
      return
    }
    if (sinDatos) { setErrorGlobal('Escribe al menos un dato: tu peso o alguna medida de la báscula.'); refs.current.peso?.focus(); return }
    if (duplicada && !window.confirm(editando
      ? `Ya hay otra medición del ${fmtFecha(vals.fecha)}. ¿Dejar las dos en el mismo día?`
      : `Ya hay una medición del ${fmtFecha(vals.fecha)}. ¿Agregar otra el mismo día?`)) return

    // Se arma desde el estado (no desde el DOM): si la composición está colapsada sus campos no existen.
    const fd = new FormData()
    fd.set('fecha', vals.fecha)
    for (const k of Object.keys(DEFS) as Campo[]) fd.set(k, vals[k].trim().replace(',', '.'))
    if (editando) fd.set('id', editando.id)

    setGuardando(true)
    setErrorGlobal('')
    try {
      const r = editando ? await updateRegistro(fd) : await addRegistro(fd)
      if (!r.ok) { setErrorGlobal(`No se pudo guardar la medición: ${r.error}`); return }
      onCerrar()
    } catch {
      setErrorGlobal('No se pudo guardar la medición. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Escape' && !primera && !guardando) { e.stopPropagation(); onCerrar() }
  }

  const atajos: { label: string; valor: string }[] = [
    { label: 'Hoy', valor: hoy },
    { label: 'Ayer', valor: addDays(hoy, -1) },
  ]

  // Un campo numérico con unidad a la derecha, error/aviso/pista asociados por aria-describedby.
  function campoNumerico(k: Campo, opts: { grande?: boolean; autoFocus?: boolean } = {}) {
    const d = DEFS[k]
    const id = idDe(k)
    const error = mostrar(k)
    const aviso = !error ? avisos[k] : undefined
    const desc = error ? `${id}-msg` : aviso ? `${id}-msg` : d.ayuda ? `${id}-msg` : undefined
    return (
      <div key={k} className="min-w-0">
        <Etiqueta htmlFor={id}>{d.label}</Etiqueta>
        <div className="relative">
          <input
            ref={el => { refs.current[k] = el }}
            id={id} name={k} type="number" inputMode="decimal" step={d.step}
            value={vals[k]} placeholder="—"
            autoFocus={opts.autoFocus}
            onChange={e => cambiar(k, e.target.value)} onBlur={() => tocar(k)}
            aria-invalid={error ? true : undefined} aria-describedby={desc}
            className={`${CAMPO_INPUT} ${d.unidad ? 'pr-12' : ''} tabular-nums`}
            style={opts.grande ? { fontSize: 22, fontWeight: 700, minHeight: 52, color: COLOR.navy, ...(error ? { borderColor: '#dc2626' } : {}) } : (error ? { borderColor: '#dc2626' } : undefined)}
          />
          {d.unidad && (
            <span aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontSize: 12.5, fontWeight: 600, color: COLOR.muted }}>{d.unidad}</span>
          )}
        </div>
        {error ? <Mensaje id={`${id}-msg`} tipo="error">{error}</Mensaje>
          : aviso ? <Mensaje id={`${id}-msg`} tipo="aviso">{aviso}</Mensaje>
          : d.ayuda ? <Mensaje id={`${id}-msg`} tipo="pista">{d.ayuda}</Mensaje> : null}
      </div>
    )
  }

  const idFecha = idDe('fecha')
  const errFecha = mostrar('fecha')
  const dupMsg = duplicada && !errFecha
    ? `Ya hay una medición del ${fmtFecha(duplicada.fecha)}${duplicada.peso != null ? ` (${duplicada.peso} kg)` : ''}. Si guardas, tendrás dos el mismo día.`
    : ''
  const llenos = COMPOSICION.filter(c => leerNumero(vals[c]) !== null).length

  return (
    <Panel
      id="peso-formulario"
      eyebrow={editando ? 'Editando medición' : primera ? 'Primera medición' : 'Nueva medición'}
      icon="⚖️"
      title={editando ? `Medición del ${fmtFecha(editando.fecha)}` : primera ? 'Registra tu primera medición' : 'Registra tu peso'}
      subtitle="Mídete en ayunas, después de ir al baño y a la misma hora: así los números son comparables."
      right={editando
        ? <Pill color={DORADO_TEXTO}>Editando</Pill>
        : ultimaConPeso?.peso != null
          ? <span style={{ fontSize: 12, color: COLOR.muted }}>Última: <b style={{ color: COLOR.ink }}>{ultimaConPeso.peso} kg</b> · {fmtFecha(ultimaConPeso.fecha)}</span>
          : null}
    >
      <form onSubmit={enviar} onKeyDown={onKeyDown} noValidate aria-busy={guardando}>
        {/* Lo básico */}
        <fieldset className="min-w-0">
          <legend className="mb-2.5"><Eyebrow>Lo básico</Eyebrow></legend>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="min-w-0">
              <Etiqueta htmlFor={idFecha}>Fecha</Etiqueta>
              <input
                ref={el => { refs.current.fecha = el }}
                id={idFecha} name="fecha" type="date" required max={hoy}
                value={vals.fecha}
                onChange={e => cambiar('fecha', e.target.value)} onBlur={() => tocar('fecha')}
                aria-invalid={errFecha ? true : undefined} aria-describedby={errFecha || dupMsg ? `${idFecha}-msg` : undefined}
                className={`${CAMPO_INPUT} tabular-nums`}
                style={errFecha ? { borderColor: '#dc2626' } : undefined}
              />
              <div className="mt-1.5 flex gap-1.5">
                {atajos.map(a => (
                  <button
                    key={a.label} type="button" onClick={() => { cambiar('fecha', a.valor); tocar('fecha') }}
                    aria-pressed={vals.fecha === a.valor}
                    className="rounded-lg px-3 min-h-[40px] text-xs font-semibold border transition-colors"
                    style={vals.fecha === a.valor
                      ? { background: `${COLOR.gold}22`, borderColor: COLOR.gold, color: DORADO_TEXTO }
                      : { background: '#fff', borderColor: COLOR.lineStrong, color: COLOR.muted }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              {errFecha ? <Mensaje id={`${idFecha}-msg`} tipo="error">{errFecha}</Mensaje>
                : dupMsg ? <Mensaje id={`${idFecha}-msg`} tipo="aviso">{dupMsg}</Mensaje> : null}
            </div>
            <div className="min-w-0">
              {campoNumerico('peso', { grande: true, autoFocus: !editando })}
              {deltaVivo != null && !avisos.peso && !mostrar('peso') && referencia?.peso != null && (
                <p className="mt-1 tabular-nums" style={{ fontSize: 12, color: COLOR.muted }} aria-live="polite">
                  {Math.abs(deltaVivo) < 0.05 ? 'Igual que' : `${deltaVivo > 0 ? '+' : '−'}${Math.abs(deltaVivo).toFixed(1)} kg vs.`} tu medición del {fmtFecha(referencia.fecha)}
                </p>
              )}
            </div>
          </div>
        </fieldset>

        {/* Composición de la báscula */}
        <div className="mt-5 rounded-xl" style={{ border: `1px solid ${COLOR.line}`, background: COLOR.card2 }}>
          <button
            type="button" onClick={alternarComposicion}
            aria-expanded={compAbierta} aria-controls={`${uid}-comp`}
            className="w-full flex items-center justify-between gap-3 px-4 min-h-[52px] text-left rounded-xl"
          >
            <span className="min-w-0">
              <Eyebrow>Composición de la báscula</Eyebrow>
              <span className="block mt-0.5" style={{ fontSize: 12, color: COLOR.muted }}>
                {compAbierta ? 'Déjalo en blanco lo que tu báscula no mida.' : llenos ? `${llenos} de ${COMPOSICION.length} datos capturados` : 'Opcional: grasa, músculo, IMC, RMR, visceral…'}
              </span>
            </span>
            <span aria-hidden className="shrink-0" style={{ fontSize: 14, color: COLOR.muted, transform: compAbierta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
          </button>
          {compAbierta && (
            <div id={`${uid}-comp`} role="group" aria-label="Composición de la báscula" className="px-4 pb-4 pt-1">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 sm:gap-x-4 gap-y-4">
                {COMPOSICION.map(k => campoNumerico(k))}
              </div>
            </div>
          )}
        </div>

        {errorGlobal && (
          <div role="alert" className="mt-4 rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, fontWeight: 600 }}>
            <span aria-hidden>⛔</span><span>{errorGlobal}</span>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          {!primera && (
            <button type="button" onClick={onCerrar} disabled={guardando} className={`${BTN.base} px-5 py-2.5 text-sm min-h-[46px] border text-[var(--ink-700)] bg-white hover:border-[var(--gold-500)]`} style={{ borderColor: COLOR.lineStrong }}>
              Cancelar
            </button>
          )}
          <button type="submit" disabled={guardando} className={`${BTN.base} ${BTN.gold} min-h-[46px] sm:min-w-[190px]`}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar medición'}
          </button>
        </div>
      </form>
    </Panel>
  )
}
