'use client'

// "Proyectar": el documento a pantalla completa, para usarlo en el gimnasio o en la cocina sin nada
// alrededor. Es un diálogo modal (role="dialog" aria-modal) que bloquea el scroll de la página.

import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PLAN_IFRAME_SANDBOX, planHtmlUrl, type PesoPlanMeta } from '@/lib/peso-planes'
import { COLOR } from '../ui'
import { FOCO, Icono, Spinner, TIPO_COLOR, tipoInfo } from './comun'
import { useModal } from './hooks'

const BTN_BARRA = `inline-flex items-center justify-center gap-1.5 rounded-lg min-h-10 min-w-10 px-2.5 text-[13px] font-semibold transition-colors ${FOCO}`

export default function Proyector({ plan, onCerrar }: { plan: PesoPlanMeta; onCerrar: () => void }) {
  const raiz = useRef<HTMLDivElement>(null)
  const cerrarRef = useRef<HTMLButtonElement>(null)
  const [cargado, setCargado] = useState(false)
  const tituloId = useId()
  useModal(raiz, onCerrar, cerrarRef)
  const info = tipoInfo(plan.tipo)

  return createPortal(
    <div ref={raiz} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}
      className="pp-in fixed inset-0 flex flex-col outline-none"
      style={{ zIndex: 300, height: '100dvh', background: '#0A1830' }}>
      {/* Barra mínima: título + abrir en pestaña + descargar + cerrar */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 shrink-0"
        style={{
          paddingTop: 'max(6px, env(safe-area-inset-top))', paddingBottom: 6,
          background: 'linear-gradient(180deg,#16305a,#0f2242)', borderBottom: '1px solid rgba(231,197,107,.28)', color: COLOR.onDark,
        }}>
        <span aria-hidden className="hidden sm:inline-flex items-center justify-center rounded-lg shrink-0"
          style={{ width: 30, height: 30, background: `${TIPO_COLOR[plan.tipo]}`, border: '1px solid rgba(255,255,255,.14)', fontSize: 15 }}>{info.icon}</span>
        <div className="min-w-0 flex-1 pl-1.5 sm:pl-0">
          <h2 id={tituloId} className="serif truncate" style={{ fontSize: 19, lineHeight: 1.15, fontWeight: 600 }}>{plan.titulo}</h2>
        </div>
        <a href={planHtmlUrl(plan.id)} target="_blank" rel="noopener noreferrer" aria-label="Abrir en pestaña nueva" title="Abrir en pestaña"
          className={`${BTN_BARRA} hover:bg-white/10`} style={{ color: COLOR.onDark }}>
          <Icono n="externo" /><span className="hidden md:inline">Abrir en pestaña</span>
        </a>
        <a href={planHtmlUrl(plan.id, { descargar: true })} download aria-label="Descargar el HTML" title="Descargar"
          className={`${BTN_BARRA} hover:bg-white/10`} style={{ color: COLOR.onDark }}>
          <Icono n="descargar" /><span className="hidden md:inline">Descargar</span>
        </a>
        {/* Sin pista de «Esc»: tras tocar dentro del documento (origen aislado) el teclado ya no llega a esta ventana. */}
        <button ref={cerrarRef} type="button" onClick={onCerrar} aria-label="Cerrar la proyección" title="Cerrar"
          className={`${BTN_BARRA} gold-fill`}>
          <Icono n="cerrar" /><span className="hidden sm:inline">Cerrar</span>
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        {!cargado && (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-sm" style={{ color: COLOR.onDarkMuted }}>
            <Spinner size={16} /> Proyectando…
          </div>
        )}
        <iframe
          src={planHtmlUrl(plan.id)}
          title={`${info.label}: ${plan.titulo} (pantalla completa)`}
          sandbox={PLAN_IFRAME_SANDBOX}
          referrerPolicy="no-referrer"
          onLoad={() => setCargado(true)}
          className="absolute inset-0 w-full h-full border-0"
          style={{ background: '#fff', opacity: cargado ? 1 : 0 }}
        />
      </div>
    </div>,
    document.body,
  )
}
