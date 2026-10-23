'use client'

// Aviso de «la lista de documentos no cargó»: la tabla existe pero la consulta falló (red, Supabase), así que la lista
// llega vacía por eso y NO porque no haya documentos. Va EN VEZ de la biblioteca y del estado vacío («Aún no tienes
// rutinas» sería falso) y ofrece reintentar. Si el reintento también falla, el aviso flotante de PesoPlanes dice por qué.

import { COLOR, Panel } from '../ui'
import { Icono, Spinner, btn } from './comun'

export default function ErrorLista({ reintentando, onReintentar }: { reintentando: boolean; onReintentar: () => void }) {
  return (
    <Panel eyebrow="Rutinas y dietas" icon="⚠️" title="No se pudo cargar la biblioteca" accent={COLOR.warn}>
      <div role="alert" className="flex items-start gap-2.5 rounded-xl p-3.5"
        style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#78350F' }}>
        <Icono n="alerta" size={17} className="mt-0.5" />
        <p style={{ fontSize: 14, lineHeight: 1.55 }}>
          Tus rutinas y dietas no se borraron: lo que falló fue la consulta, y suele ser algo pasajero.
        </p>
      </div>
      <div className="mt-4">
        <button type="button" onClick={onReintentar} disabled={reintentando} className={btn('gold')}>
          {reintentando ? <><Spinner />Reintentando…</> : <><Icono n="reintentar" size={15} />Reintentar</>}
        </button>
      </div>
    </Panel>
  )
}
