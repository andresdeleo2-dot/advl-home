'use client'

// Aviso para cuando el navegador no mostró el documento dentro del marco (ver useViaMarco). Abrirlo en una
// pestaña funciona siempre: ahí la propia ruta lo aísla con su cabecera.

import { planHtmlUrl, type PesoPlanMeta } from '@/lib/peso-planes'
import { COLOR } from '../ui'
import { Icono, btn } from './comun'

export default function AvisoSinVista({ plan, onReintentar }: { plan: PesoPlanMeta; onReintentar: () => void }) {
  return (
    <div role="alert" className="px-4 py-3.5 sm:px-5" style={{ background: '#FFF8E6', borderBottom: '1px solid #EBD9A8', color: COLOR.ink }}>
      <p style={{ fontSize: 13.5, lineHeight: 1.45 }}>
        <strong>Este navegador no mostró el documento aquí.</strong> Ábrelo en una pestaña (se ve igual y funciona completo) o descárgalo.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <a href={planHtmlUrl(plan.id)} target="_blank" rel="noopener noreferrer" className={btn('primary')}>
          <Icono n="externo" size={16} />Abrir en pestaña
        </a>
        <a href={planHtmlUrl(plan.id, { descargar: true })} download className={btn('ghost')}>
          <Icono n="descargar" size={16} />Descargar
        </a>
        <button type="button" onClick={onReintentar} className={btn('ghost')}>Reintentar</button>
      </div>
    </div>
  )
}
