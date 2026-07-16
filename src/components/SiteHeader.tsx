'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import HeaderStats from './HeaderStats'
import CumplesWidget from './CumplesWidget'
import ExcepcionalesWidget from './ExcepcionalesWidget'
import { WidgetsDropdown, SpecialsDropdown } from './HeaderWidgets'

/* Header de marca compartido (banda navy con logo, relojes/clima, Widgets y Especiales).
   Igual al de /epicas para mantener consistencia entre secciones. */
export default function SiteHeader({
  title,
  subtitle,
  extra,
  backHref = '/',
  backLabel = '← Accesos',
}: {
  title: string
  subtitle?: string
  extra?: ReactNode
  backHref?: string
  backLabel?: string
}) {
  return (
    <>
      <div className="brand-rule" />
      <header className="band" style={{ margin: '14px 14px 0', borderRadius: 18, padding: '16px 22px', color: '#fff' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ADVL" style={{ height: 40, width: 'auto', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.4))' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 26, lineHeight: 1, color: '#F3EFE6' }}>{title}</span>
              {subtitle && (
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.24em', textTransform: 'uppercase', color: '#C8A24C' }}>{subtitle}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <HeaderStats />
            <CumplesWidget />
            <ExcepcionalesWidget />
            <WidgetsDropdown />
            <SpecialsDropdown />
            {extra}
            <Link href={backHref} className="band-glass" style={{ borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{backLabel}</Link>
          </div>
        </div>
      </header>
    </>
  )
}
