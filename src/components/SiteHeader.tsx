'use client'

import type { ReactNode } from 'react'
import HeaderStats from './HeaderStats'
import CumplesWidget from './CumplesWidget'
import ExcepcionalesWidget from './ExcepcionalesWidget'
import BirthdayCelebration from './BirthdayCelebration'
import { WidgetsDropdown, SpecialsDropdown } from './HeaderWidgets'
import CommandPalette from './CommandPalette'
import SectionNav, { type Seccion } from './SectionNav'
import FavoritosStrip from './FavoritosStrip'

/* Header de marca compartido (banda navy con logo, relojes/clima, Widgets y Especiales) + el menú de secciones.
   Se quitó el botón «← Accesos» (repetía Accesos del menú) y el link suelto a Peso (ya está en el menú). */
export default function SiteHeader({
  title,
  subtitle,
  extra,
  seccion,
}: {
  title: string
  subtitle?: string
  extra?: ReactNode
  seccion?: Seccion
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
            <span className="hdr-extra">
              <HeaderStats />
              <CumplesWidget />
              <ExcepcionalesWidget />
            </span>
            <WidgetsDropdown />
            <SpecialsDropdown />
            <CommandPalette />
            {extra}
            {seccion && <SectionNav current={seccion} />}
          </div>
        </div>
      </header>
      {/* Accesos rápidos en todas las secciones */}
      <FavoritosStrip />
      <BirthdayCelebration />
    </>
  )
}
