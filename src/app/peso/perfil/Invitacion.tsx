'use client'

import { useEffect, useState } from 'react'
import { PERFIL_DEFAULT } from '@/lib/peso-perfil'
import { BTN, COLOR } from '../ui'

// Tarjeta discreta del Resumen mientras el perfil no esté guardado. Descartable: lo descartado se recuerda en
// localStorage, que SOLO se lee después de montar (en el servidor y en la hidratación no existe). Por eso arranca
// sin pintar nada: así nadie que ya la descartó ve un parpadeo, y el primer render coincide con el del servidor.

const CLAVE = 'peso.perfil.invitacion.descartada'

export default function InvitacionPerfil({ onCompletar }: { onCompletar: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let descartada = false
    try { descartada = localStorage.getItem(CLAVE) === '1' } catch { /* sin storage: se muestra */ }
    setVisible(!descartada)
  }, [])

  if (!visible) return null

  function descartar() {
    setVisible(false)
    try { localStorage.setItem(CLAVE, '1') } catch { /* da igual: reaparecerá la próxima vez */ }
  }

  return (
    <aside
      aria-label="Completa tu perfil"
      className="animate-fade flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-4 py-3 sm:px-5"
      style={{ background: '#fff', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.gold}` }}
    >
      <span aria-hidden style={{ fontSize: 20 }}>👤</span>
      <div className="min-w-0 flex-1" style={{ flexBasis: 220 }}>
        <p className="serif" style={{ fontSize: 17, lineHeight: 1.25, fontWeight: 600, color: COLOR.navy }}>Completa tu perfil para cálculos más exactos</p>
        <p className="mt-0.5 leading-snug" style={{ fontSize: 12.5, color: COLOR.muted }}>
          Hoy se usan datos supuestos (estatura {PERFIL_DEFAULT.estatura_cm} cm, {PERFIL_DEFAULT.sexo}). Con los tuyos, el IMC, los pesos objetivo y el análisis con IA salen a tu medida.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCompletar} className={`${BTN.base} ${BTN.gold} min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A6420]`}>
          Completar perfil
        </button>
        <button
          type="button" onClick={descartar}
          className={`${BTN.base} min-h-[44px] px-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A6420]`}
          style={{ color: COLOR.muted }}
        >
          Ahora no
        </button>
      </div>
    </aside>
  )
}
