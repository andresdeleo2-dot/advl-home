'use client'

import { useEffect, useRef, useState } from 'react'
import type { PesoAnalisisGuardado, InsightTipo } from '@/lib/peso'

// Análisis con IA del tracker de Peso (Gemini, el mismo motor que Noticias en el Panel). El servidor
// calcula las cifras y la IA las interpreta; aquí sólo se muestra, se pide actualizar o se pregunta.

const TIPO_COLOR: Record<InsightTipo, string> = {
  positivo: '#22c55e', atencion: '#f59e0b', alerta: '#ef4444', dato: '#2d6cdf',
}
const TIPO_ETIQUETA: Record<InsightTipo, string> = {
  positivo: 'Va bien', atencion: 'Ojo', alerta: 'Atención', dato: 'Dato',
}
const ESTADO: Record<'bien' | 'mixto' | 'alerta', { label: string; color: string }> = {
  bien: { label: 'Vas bien', color: '#22c55e' },
  mixto: { label: 'Mixto', color: '#f59e0b' },
  alerta: { label: 'Atención', color: '#ef4444' },
}
const PREGUNTAS = [
  '¿Lo que subí fue grasa o músculo?',
  '¿Cuánto me falta para un IMC saludable?',
  '¿Cada cuánto debería medirme?',
  '¿Qué dato mío debería preocuparme más?',
]
const MEDIA_HORA = 30 * 60_000   // cuánto espera antes de reintentar con la IA si la última vez cayó al plan B

function hace(iso: string, ahora: number) {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000))
  if (min < 2) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

export default function PesoIA({ firma, inicial, persistencia, nMediciones }: {
  firma: string
  inicial: PesoAnalisisGuardado | null
  persistencia: boolean
  nMediciones: number
}) {
  const [local, setLocal] = useState<PesoAnalisisGuardado | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [ahora, setAhora] = useState<number | null>(null)   // reloj sólo en cliente: evita desajustes de hidratación
  const [pregunta, setPregunta] = useState('')
  const [preguntando, setPreguntando] = useState(false)
  const [errorPregunta, setErrorPregunta] = useState('')
  const [respuestas, setRespuestas] = useState<{ q: string; a: string }[]>([])
  const intentada = useRef('')

  useEffect(() => { setAhora(Date.now()) }, [])

  // El análisis a mostrar: el que corresponde a los datos actuales; si no hay, el último que exista
  // (marcado como desactualizado) mientras se genera el nuevo.
  const visible = [local, inicial].find(a => a?.firma === firma) ?? local ?? inicial
  const vigente = visible?.firma === firma
  // Lectura por reglas (la IA falló la vez anterior): al abrir la página se reintenta sola pasada media hora.
  const reglasViejas = !!visible && visible.fuente === 'reglas' && ahora != null && ahora - new Date(visible.created_at).getTime() > MEDIA_HORA
  const autoGenerar = persistencia && !!firma && ahora != null && (!vigente || reglasViejas)

  async function generar() {
    setCargando(true); setError(''); setAviso('')
    try {
      const r = await fetch('/api/peso/analisis', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        signal: AbortSignal.timeout(70_000),
      })
      const j = await r.json()
      if (!j.ok) { setError(j.error || 'No se pudo generar el análisis.'); return }
      setLocal(j.analisis as PesoAnalisisGuardado)
      setAviso(j.aviso || '')
      setAhora(Date.now())
    } catch {
      setError('No se pudo generar el análisis (tardó demasiado o falló la conexión).')
    } finally {
      setCargando(false)
    }
  }

  // Con persistencia, el análisis se regenera solo cuando hay datos nuevos (una vez por huella de datos).
  useEffect(() => {
    if (!autoGenerar || intentada.current === firma) return
    intentada.current = firma
    generar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerar, firma])

  async function preguntar(q: string) {
    const texto = q.trim()
    if (!texto || preguntando) return
    setPreguntando(true); setErrorPregunta('')
    try {
      const r = await fetch('/api/peso/analisis', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pregunta: texto }),
        signal: AbortSignal.timeout(70_000),
      })
      const j = await r.json()
      if (!j.ok) { setErrorPregunta(j.error || 'No se pudo responder.'); return }
      setRespuestas(prev => [{ q: texto, a: j.respuesta as string }, ...prev])
      setPregunta('')
    } catch {
      setErrorPregunta('No se pudo responder (tardó demasiado o falló la conexión).')
    } finally {
      setPreguntando(false)
    }
  }

  const c = visible?.contenido
  const est = c ? ESTADO[c.estado] : null

  return (
    <section className="glass rounded-2xl overflow-hidden animate-fade" aria-label="Análisis con IA">
      <div className="h-1" style={{ background: 'linear-gradient(90deg, var(--gold-300), var(--gold-500))' }} />
      <div className="px-4 sm:px-6 py-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink-950)] flex items-center gap-2">
              <span aria-hidden>✨</span> Análisis con IA
              {est && !cargando && vigente && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: `${est.color}18`, color: est.color }}>{est.label}</span>
              )}
            </h2>
            <p className="text-xs text-[var(--ink-700)] mt-0.5">
              {cargando ? 'Analizando tus mediciones…' : `Lee tus ${nMediciones} mediciones y te dice qué importa.`}
            </p>
          </div>
          <button onClick={generar} disabled={cargando}
            className={`text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 inline-flex items-center gap-1.5 ${
              visible && !vigente && !cargando ? 'gold-fill' : 'border border-[var(--line)] text-[var(--ink-700)] hover:border-[var(--blue-500)] hover:text-[var(--blue-600)]'
            }`}>
            {cargando && <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />}
            {cargando ? 'Analizando…' : visible ? '↻ Actualizar' : '✨ Analizar mi progreso'}
          </button>
        </div>

        {error && (
          <div className="mb-4 text-xs rounded-lg px-3 py-2 bg-red-50 text-red-700 border border-red-200">{error}</div>
        )}

        {!c && !cargando && !error && (
          <p className="text-sm text-[var(--ink-700)]">
            Todavía no hay un análisis. Dale a «Analizar mi progreso» y la IA revisará tu peso, tu composición corporal y el ritmo con el que vas.
          </p>
        )}

        {!c && cargando && (
          <div className="space-y-2.5" aria-hidden>
            {[88, 100, 72].map((w, i) => <div key={i} className="h-3.5 rounded bg-[var(--line)] animate-pulse" style={{ width: `${w}%` }} />)}
          </div>
        )}

        {c && (
          <div className={cargando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {!vigente && !cargando && (
              <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200">
                Este análisis es de antes de tus últimos cambios en los datos. Actualízalo para que los incluya.
              </div>
            )}
            {aviso && vigente && (
              <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200">{aviso}</div>
            )}

            <p className="serif text-[22px] leading-snug text-[var(--ink-950)] mb-4">{c.titular}</p>

            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {c.insights.map((ins, i) => (
                <div key={i} className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3" style={{ borderLeft: `4px solid ${TIPO_COLOR[ins.tipo]}` }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: TIPO_COLOR[ins.tipo] }}>{TIPO_ETIQUETA[ins.tipo]}</div>
                  <div className="text-sm font-semibold text-[var(--ink-950)] mb-1">{ins.titulo}</div>
                  <p className="text-[13px] leading-relaxed text-[var(--ink-700)]">{ins.detalle}</p>
                </div>
              ))}
            </div>

            {c.acciones.length > 0 && (
              <div className="rounded-xl bg-blue-50/50 border border-[var(--blue-400)]/20 px-4 py-3.5">
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--blue-600)] mb-2">Qué haría estas 2 semanas</div>
                <ol className="space-y-2">
                  {c.acciones.map((a, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="text-xs font-bold text-[var(--blue-500)] w-4 shrink-0 pt-0.5">{i + 1}.</span>
                      <div>
                        <div className="text-sm font-semibold text-[var(--ink-900)]">{a.accion}</div>
                        {a.porque && <div className="text-xs text-[var(--ink-700)] mt-0.5">{a.porque}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <p className="text-[11px] text-[var(--ink-700)]/80 mt-3">
              {visible!.fuente === 'ia' ? 'Gemini' : 'Lectura automática (la IA no respondió; usa «Actualizar» para reintentar)'}
              {ahora != null ? ` · ${hace(visible!.created_at, ahora)}` : ''}
              {` · con ${visible!.n_registros} mediciones hasta el ${visible!.fecha_base.split('-').reverse().join('/')}`}
              {' · Orientativo: no sustituye a un médico o nutriólogo.'}
            </p>
          </div>
        )}

        {/* Preguntas libres sobre los datos */}
        <div className="mt-5 pt-4 border-t border-[var(--line)]">
          <div className="text-xs font-semibold text-[var(--ink-950)] mb-2">Pregúntale a la IA sobre tus datos</div>
          <form onSubmit={e => { e.preventDefault(); preguntar(pregunta) }} className="flex gap-2">
            <input value={pregunta} onChange={e => setPregunta(e.target.value)} maxLength={500}
              placeholder="Ej. ¿Qué pasó entre junio y noviembre de 2025?"
              className="flex-1 min-w-0 border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[var(--blue-500)] focus:ring-1 focus:ring-[var(--blue-500)]/20" />
            <button type="submit" disabled={preguntando || !pregunta.trim()}
              className="shrink-0 bg-[var(--blue-500)] hover:bg-[var(--blue-600)] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
              {preguntando ? '…' : 'Preguntar'}
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {PREGUNTAS.map(q => (
              <button key={q} type="button" disabled={preguntando} onClick={() => preguntar(q)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--line)] text-[var(--ink-700)] hover:border-[var(--blue-500)] hover:text-[var(--blue-600)] disabled:opacity-50 transition-colors text-left">
                {q}
              </button>
            ))}
          </div>
          {errorPregunta && <div className="mt-2 text-xs text-red-600">{errorPregunta}</div>}
          {preguntando && <div className="mt-3 text-xs text-[var(--ink-700)] animate-pulse">Pensando…</div>}
          {respuestas.length > 0 && (
            <div className="mt-3 space-y-2.5">
              {respuestas.map((r, i) => (
                <div key={i} className="rounded-xl bg-white/70 border border-[var(--line)] px-4 py-3">
                  <div className="text-xs font-semibold text-[var(--ink-700)] mb-1">{r.q}</div>
                  <p className="text-[13px] leading-relaxed text-[var(--ink-950)] whitespace-pre-wrap">{r.a}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {!persistencia && (
          <p className="text-[11px] text-[var(--ink-700)]/80 mt-4">
            Para que el análisis se guarde entre visitas y se actualice solo con cada medición nueva, corre <code>sql/peso-02-analisis.sql</code> en Supabase.
          </p>
        )}
      </div>
    </section>
  )
}
