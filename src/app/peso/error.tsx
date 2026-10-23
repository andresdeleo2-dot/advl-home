'use client'

// Error de /peso: si algo lanza una excepción inesperada al pintar la página, esto reemplaza la pantalla negra con el
// stack trace del error global (app/error.tsx) por un aviso de marca, sin detalles técnicos. Usa la voz de FalloLectura
// (page.tsx): lo importante primero —los datos no se borraron— y una salida clara.
//
// Lleva su propia banda de encabezado, mínima y sin widgets: SiteHeader trae relojes, clima y buscador, y si el fallo
// viniera de alguno de ellos reintentar lo volvería a lanzar y se caería al error global de todos modos.

import { useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BTN, COLOR, Eyebrow, Panel } from './ui'

const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A6420]'

export default function PesoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Solo al log del navegador/servidor; el mensaje técnico nunca se muestra en pantalla.
  useEffect(() => {
    console.error('[peso] error al mostrar la página:', error.digest ?? '', error.message)
  }, [error])

  // reset() por sí solo solo vuelve a pintar con el mismo resultado del servidor ya en caché: si el fallo vino
  // del servidor se repetiría idéntico. router.refresh() lo vuelve a pedir y reset() reinicia el límite de error.
  const router = useRouter()
  const [reintentando, empezar] = useTransition()
  const reintentar = () => empezar(() => { router.refresh(); reset() })

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
          <Link href="/" className={`band-glass rounded-[10px] ${FOCO}`} style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>← Accesos</Link>
        </div>
      </header>

      <main className="peso-root px-4 pt-6 pb-16 max-w-3xl mx-auto space-y-6">
        <div className="min-w-0">
          <Eyebrow>Salud · composición corporal</Eyebrow>
          <h1 className="serif mt-1" style={{ fontSize: 'clamp(32px, 9vw, 42px)', lineHeight: 1.04, fontWeight: 600, color: COLOR.navy }}>
            Tracking de peso
          </h1>
        </div>
        <Panel eyebrow="Algo salió mal" icon="⚠️" title="No se pudo mostrar esta pantalla" accent={COLOR.warn}>
          <div role="alert">
            <p style={{ fontSize: 14, lineHeight: 1.55, color: COLOR.ink }}>
              Tus mediciones y tus documentos no se borraron: lo que falló fue la pantalla, y suele ser algo pasajero.
              Inténtalo de nuevo.
            </p>
            <p className="mt-2" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.muted }}>
              Si vuelve a pasar, regresa a Accesos y entra otra vez.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={reintentar} disabled={reintentando} className={`${BTN.base} ${BTN.gold} min-h-[46px] ${FOCO}`}>
              {reintentando ? 'Reintentando…' : 'Reintentar'}
            </button>
            <Link href="/" className={`${BTN.base} ${BTN.ghost} min-h-[46px] ${FOCO}`}>
              Ir a Accesos
            </Link>
          </div>
          {error.digest && (
            <p className="mt-4 tabular-nums" style={{ fontSize: 11.5, color: COLOR.faint }}>Referencia: {error.digest}</p>
          )}
        </Panel>
      </main>
    </>
  )
}
