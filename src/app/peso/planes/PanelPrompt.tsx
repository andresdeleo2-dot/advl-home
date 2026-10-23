'use client'

// Muestra el prompt para Claude en un cuadro EDITABLE: sirve para leerlo, corregir los supuestos (o escribir
// el tema en «Otros») antes de copiarlo y, si el navegador no deja copiar solo, como respaldo manual.
// El panel copia por sí mismo lo que hay en el cuadro: si delegara en el padre, éste regeneraría el texto
// desde cero y se perderían las ediciones.

import { useEffect, useId, useRef, useState } from 'react'
import type { PlanTipo } from '@/lib/peso-planes'
import { COLOR, Eyebrow, INPUT } from '../ui'
import { FOCO, Icono, btn, tipoInfo } from './comun'
import { copiarAlPortapapeles } from './hooks'

// En «Otros» el prompt trae una línea entre corchetes bajo el encabezado «TEMA QUE QUIERO» que Andrés
// debe reemplazar. Se ancla al encabezado (no al texto del marcador) para que un cambio de redacción no lo rompa.
const TEMA = /(TEMA QUE QUIERO[^\n]*\n)(\[[^\n]*\])/

function buscarTema(s: string): [number, number] | null {
  const m = TEMA.exec(s)
  if (!m) return null
  const ini = m.index + m[1].length
  return [ini, ini + m[2].length]
}

export default function PanelPrompt({ tipo, texto, fallo, copiado, onCopiado, onCerrar }: {
  tipo: PlanTipo
  texto: string
  fallo: boolean          // el copiado automático del padre falló: se enfoca y se selecciona el texto
  copiado: boolean
  /** El texto (ya editado) quedó en el portapapeles: el padre puede marcar el paso del botón superior. */
  onCopiado?: () => void
  onCerrar: () => void
}) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const idAyuda = useId()
  // Estado propio: lo que se edita no vuelve al padre. Si el padre manda un texto nuevo (p. ej. tras un
  // fallo de copiado) se reinicia en el mismo render, sin parpadeo con el texto viejo.
  const [base, setBase] = useState(texto)
  const [txt, setTxt] = useState(texto)
  if (texto !== base) { setBase(texto); setTxt(texto) }

  const [copiadoLocal, setCopiadoLocal] = useState(false)
  const [falloLocal, setFalloLocal] = useState(false)
  const reloj = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(reloj.current), [])

  useEffect(() => {
    const el = ta.current
    if (!el) return
    if (fallo) { el.focus(); el.select(); return }
    // «Otros» no se copia a ciegas: se enfoca el cuadro con la línea del tema ya seleccionada, para que
    // lo primero que se teclee la reemplace.
    if (tipo !== 'otro') return
    const t = buscarTema(el.value)
    if (!t) return
    el.focus()
    // Truco para desplazar el cuadro hasta la línea: se mide el alto del texto previo y se restaura el valor.
    const valor = el.value
    el.value = valor.slice(0, t[0])
    const alto = el.scrollHeight
    el.value = valor
    el.setSelectionRange(t[0], t[1])
    el.scrollTop = Math.max(0, alto - el.clientHeight * 0.6)
  }, [fallo, texto, tipo])

  async function copiar() {
    if (await copiarAlPortapapeles(txt)) {
      setFalloLocal(false)
      setCopiadoLocal(true)
      clearTimeout(reloj.current)
      reloj.current = setTimeout(() => setCopiadoLocal(false), 2200)
      onCopiado?.()
    } else {
      setFalloLocal(true)
      ta.current?.focus()
      ta.current?.select()
    }
  }

  function restablecer() {
    setTxt(texto)
    setFalloLocal(false)
    ta.current?.focus()
  }

  const falla = fallo || falloLocal
  const listo = copiadoLocal || copiado
  const temaPendiente = tipo === 'otro' && buscarTema(txt) !== null
  const ayuda = falla
    ? 'El navegador no permitió copiar de forma automática. Selecciona el texto y cópialo (Ctrl+C o ⌘C), luego pégalo en Claude.'
    : temaPendiente
      ? 'Cambia la línea entre corchetes por el documento que quieres y toca Copiar. Si la dejas así, Claude elegirá el más útil para ti.'
      : 'Puedes editarlo aquí (por ejemplo los supuestos) antes de copiar: lo que ves es lo que se copia. Ya incluye tus últimas mediciones y metas.'

  return (
    <div className="pp-in rounded-xl p-3.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <Eyebrow>Prompt para Claude · {tipoInfo(tipo).label.toLowerCase()}</Eyebrow>
          <p id={idAyuda} className="mt-1 text-xs leading-snug" style={{ color: falla ? COLOR.bad : COLOR.muted }}>{ayuda}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar el prompt" title="Cerrar"
          className={`inline-flex items-center justify-center w-10 h-10 -mt-1.5 -mr-1.5 rounded-lg shrink-0 hover:bg-black/5 ${FOCO}`} style={{ color: COLOR.navy2 }}>
          <Icono n="cerrar" size={17} />
        </button>
      </div>
      {/* data-panel-prompt: el botón «Copiar prompt» de arriba lo usa para llevar el foco aquí en vez de regenerar el texto. */}
      <textarea ref={ta} data-panel-prompt rows={9} value={txt} onChange={e => setTxt(e.target.value)} spellCheck={false}
        aria-label="Prompt para pegar en Claude (editable)" aria-describedby={idAyuda}
        className={`${INPUT} font-mono text-xs leading-relaxed resize-y`} />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {txt !== texto && (
          <button type="button" onClick={restablecer} className={btn('ghost')}>Restablecer</button>
        )}
        <button type="button" onClick={() => void copiar()} disabled={!txt.trim()} className={btn('ghost')}>
          <Icono n={listo ? 'check' : 'copiar'} size={14} />{listo ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      <span className="sr-only" role="status">{listo ? '¡Copiado! Pégalo en Claude.' : ''}</span>
    </div>
  )
}
