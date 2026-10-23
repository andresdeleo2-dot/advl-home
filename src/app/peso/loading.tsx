// Esqueleto de /peso mientras el servidor consulta (la página es dinámica, revalidate = 0): sin esto, al entrar
// desde el encabezado no pasa nada hasta que llegan los datos. Imita la estructura real —título, franja de estado,
// pestañas y tarjetas— con el mismo ancho y los mismos radios, para que al llegar el contenido nada brinque.
// El pulso se apaga con «reducir movimiento» (motion-safe). Lleva una banda de encabezado mínima y sin widgets: el
// SiteHeader real se monta con la página, y montarlo también aquí lo desmontaba y repetía sus peticiones al llegar los datos.

import Link from 'next/link'
import { CARD_SHADOW, COLOR, DARK_BG } from './ui'

const PULSO = 'motion-safe:animate-pulse'
const TINTA = 'rgba(15,35,64,0.08)'

/** Una barra de texto. `oscuro` = sobre la franja navy. */
function Barra({ w, h = 12, oscuro = false, className = '' }: { w: number | string; h?: number; oscuro?: boolean; className?: string }) {
  return <div className={`rounded-full ${className}`} style={{ width: w, height: h, maxWidth: '100%', background: oscuro ? 'rgba(255,255,255,0.14)' : TINTA }} />
}

function TarjetaEsqueleto({ filas = 3, alto }: { filas?: number; alto?: number }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${COLOR.line}`, boxShadow: CARD_SHADOW, minHeight: alto }}>
      <div style={{ height: 3, background: COLOR.gold, opacity: 0.55 }} />
      <div className="px-5 sm:px-6 pt-4 pb-5 space-y-3">
        <Barra w={92} h={9} className="opacity-80" />
        <Barra w="62%" h={22} />
        {Array.from({ length: filas }, (_, i) => <Barra key={i} w={i === filas - 1 ? '48%' : '100%'} h={10} />)}
      </div>
    </div>
  )
}

export default function CargandoPeso() {
  return (
    <>
      <div className="brand-rule" />
      <header className="band" style={{ margin: '14px 14px 0', borderRadius: 18, padding: '16px 22px', color: '#fff' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ADVL" style={{ height: 40, width: 'auto', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.4))' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 26, lineHeight: 1, color: '#F3EFE6' }}>Peso</span>
              <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.24em', textTransform: 'uppercase', color: '#C8A24C' }}>Salud · ADVL</span>
            </div>
          </div>
          <Link href="/" className="band-glass" style={{ borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>← Accesos</Link>
        </div>
      </header>
      <main className="peso-root px-4 pt-6 pb-20 max-w-5xl mx-auto flex flex-col">
        <div role="status" className="sr-only">Cargando tu peso…</div>

        <div aria-hidden className={`space-y-5 mb-6 ${PULSO}`}>
          {/* Título + botón de nueva medición */}
          <div className="flex items-end justify-between flex-wrap gap-x-4 gap-y-3">
            <div className="min-w-0 space-y-2.5">
              <Barra w={150} h={9} />
              <Barra w={260} h={36} />
              <Barra w={220} h={11} />
            </div>
            <div className="rounded-xl" style={{ width: 168, height: 46, background: 'rgba(194,147,58,0.28)' }} />
          </div>

          {/* Franja de estado (navy) */}
          <div className="rounded-2xl p-5 sm:p-6" style={{ background: DARK_BG, border: '1px solid rgba(255,255,255,0.09)', boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-5 flex-wrap">
              <div className="rounded-full shrink-0" style={{ width: 84, height: 84, border: '8px solid rgba(255,255,255,0.12)' }} />
              <div className="flex-1 min-w-[180px] space-y-3">
                <Barra w={120} h={9} oscuro />
                <Barra w="55%" h={26} oscuro />
                <div className="flex gap-2 pt-1">
                  <Barra w={78} h={22} oscuro />
                  <Barra w={96} h={22} oscuro />
                  <Barra w={64} h={22} oscuro />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pestañas */}
        <div aria-hidden className={`flex gap-2 pb-3 ${PULSO}`} style={{ borderBottom: `1px solid ${COLOR.line}` }}>
          {[78, 92, 150, 86].map((w, i) => <Barra key={i} w={w} h={30} className="shrink-0" />)}
        </div>

        {/* Contenido */}
        <div aria-hidden className={`pt-5 space-y-5 min-h-[60vh] ${PULSO}`}>
          <div className="grid gap-4 sm:grid-cols-3">
            <TarjetaEsqueleto filas={2} />
            <TarjetaEsqueleto filas={2} />
            <TarjetaEsqueleto filas={2} />
          </div>
          <TarjetaEsqueleto filas={5} alto={220} />
        </div>
      </main>
    </>
  )
}
