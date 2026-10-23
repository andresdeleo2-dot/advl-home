'use client'

import { useState } from 'react'
import type { PesoPlan } from '@/lib/peso'
import type { PesoPlanTextoProps } from './contratos'
import { savePlan } from './actions'
import { BTN, COLOR, Eyebrow, INPUT, Panel } from './ui'
import { FOCO, LABEL_STYLE } from './metricas'

// "Notas del plan": resumen rápido en TEXTO (rutina, dieta, notas). Es secundario respecto a la biblioteca de rutinas y
// dietas en HTML. Una sola fila en peso_plan (savePlan hace upsert del registro COMPLETO): este formulario reenvía la meta
// (meta_peso/meta_fecha/meta_grasa) como campos ocultos para no borrarla, y PesoMeta hace lo mismo con estos textos.

const MAX = 6000          // tope de la caja (protege la base de pegados enormes)
const LEE_LA_IA = 1200    // buildFacts recorta cada texto a 1200 caracteres antes de mandarlo al análisis
const PLEGAR_DESDE = 320  // más largo que esto se muestra recortado con "Ver todo"

type Campo = 'rutina' | 'dieta' | 'notas'

const CAMPOS: { name: Campo; icono: string; label: string; ph: string; filas: number }[] = [
  { name: 'rutina', icono: '🏋️', label: 'Rutina', ph: 'Días, ejercicios, series/reps…', filas: 5 },
  { name: 'dieta', icono: '🍽️', label: 'Dieta', ph: 'Calorías objetivo, macros, comidas del día…', filas: 5 },
  { name: 'notas', icono: '📝', label: 'Notas', ph: 'Lo que quieras recordar…', filas: 3 },
]

function TextoPlegable({ texto }: { texto: string }) {
  const [abierto, setAbierto] = useState(false)
  const largo = texto.length > PLEGAR_DESDE || texto.split('\n').length > 7
  const recortado = largo && !abierto
  return (
    <div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{
        color: COLOR.ink,
        ...(recortado ? { display: '-webkit-box', WebkitLineClamp: 7, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}),
      }}>{texto}</p>
      {largo && (
        <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto}
          className={`mt-1.5 inline-flex min-h-10 items-center rounded-lg text-xs font-bold underline-offset-2 hover:underline ${FOCO}`} style={{ color: COLOR.goldDark }}>
          {abierto ? 'Ver menos' : 'Ver todo'}
        </button>
      )}
    </div>
  )
}

function FormNotas({ plan, onCancel, onSaved }: { plan: PesoPlan | null; onCancel: () => void; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<Campo, string>>({ rutina: plan?.rutina ?? '', dieta: plan?.dieta ?? '', notas: plan?.notas ?? '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      const r = await savePlan(new FormData(e.currentTarget))
      if (!r.ok) { setError(`No se pudo guardar: ${r.error}`); return }
      onSaved()
    } catch {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="meta_peso" value={plan?.meta_peso ?? ''} />
      <input type="hidden" name="meta_fecha" value={plan?.meta_fecha ?? ''} />
      <input type="hidden" name="meta_grasa" value={plan?.meta_grasa ?? ''} />
      <div className="space-y-4">
        {CAMPOS.map(c => {
          const n = vals[c.name].length
          const id = `plan-${c.name}`
          return (
            <div key={c.name}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <label htmlFor={id} style={LABEL_STYLE}><span aria-hidden>{c.icono}</span> {c.label}</label>
                {n > 0 && (
                  <span className="text-[11px] tabular-nums" style={{ color: n > LEE_LA_IA ? '#b45309' : COLOR.muted }}>
                    {n.toLocaleString('es-MX')}{n > LEE_LA_IA ? ` · la IA lee los primeros ${LEE_LA_IA.toLocaleString('es-MX')}` : ''}
                  </span>
                )}
              </div>
              <textarea id={id} name={c.name} rows={c.filas} maxLength={MAX} placeholder={c.ph} value={vals[c.name]}
                onChange={e => setVals(v => ({ ...v, [c.name]: e.target.value }))} className={`${INPUT} leading-relaxed`} />
            </div>
          )
        })}
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-xl px-3.5 py-2.5 text-sm font-medium" style={{ background: '#dc262612', border: '1px solid #dc262633', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={guardando} className={`${BTN.base} ${BTN.ghost} min-h-10 ${FOCO}`}>Cancelar</button>
        <button type="submit" disabled={guardando} className={`${BTN.base} ${BTN.primary} min-h-10 ${FOCO}`}>{guardando ? 'Guardando…' : 'Guardar notas'}</button>
      </div>
    </form>
  )
}

export default function PesoPlanTexto({ plan }: PesoPlanTextoProps) {
  const [editando, setEditando] = useState(false)
  const hasContent = !!(plan?.rutina || plan?.dieta || plan?.notas)

  return (
    <Panel eyebrow="Notas del plan" icon="📝" title="Resumen rápido"
      subtitle="Lo esencial a la vista; las rutinas y dietas completas, ya explicadas, van en la biblioteca de arriba."
      accent={COLOR.navy2}
      right={!editando && (
        <button type="button" onClick={() => setEditando(true)} className={`${BTN.base} ${BTN.ghost} min-h-10 ${FOCO}`}>
          {hasContent ? 'Editar' : '+ Agregar notas'}
        </button>
      )}>
      {editando ? (
        <FormNotas plan={plan} onCancel={() => setEditando(false)} onSaved={() => setEditando(false)} />
      ) : hasContent ? (
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
          {CAMPOS.slice(0, 2).map(c => (
            <div key={c.name}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span aria-hidden style={{ fontSize: 14 }}>{c.icono}</span>
                <Eyebrow>{c.label}</Eyebrow>
              </div>
              {plan?.[c.name] ? <TextoPlegable texto={plan[c.name] as string} /> : <p className="text-sm italic" style={{ color: COLOR.muted }}>Sin definir.</p>}
            </div>
          ))}
          {plan?.notas && (
            <div className="pt-4 md:col-span-2" style={{ borderTop: `1px solid ${COLOR.line}` }}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span aria-hidden style={{ fontSize: 14 }}>📝</span>
                <Eyebrow>Notas</Eyebrow>
              </div>
              <TextoPlegable texto={plan.notas} />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed" style={{ color: COLOR.muted }}>
          Aún no hay notas. Anota aquí lo esencial (los días de gimnasio, tus calorías objetivo, lo que no debes olvidar) para tenerlo a la vista; la rutina o dieta completa se sube a la biblioteca de arriba, en HTML. El análisis con IA también lee estas notas.
        </p>
      )}
    </Panel>
  )
}
