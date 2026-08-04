'use client'

import Link from 'next/link'

/* Conmutador consistente entre las 3 secciones (Accesos / Épicas / Tiempo), presente en
   los tres headers (banda navy). El actual va resaltado en oro; los demás navegan rápido
   (Next prefetch). Cambio de sección instantáneo. */
export default function SectionNav({ current }: { current: 'accesos' | 'epicas' | 'tiempo' }) {
  const items = [
    { id: 'accesos', label: 'Accesos', href: '/' },
    { id: 'epicas', label: 'Épicas', href: '/epicas' },
    { id: 'tiempo', label: 'Tiempo', href: '/tiempo' },
  ] as const
  return (
    <div style={{ display: 'inline-flex', gap: 3, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)', padding: 3, borderRadius: 999 }}>
      {items.map(it => {
        const on = it.id === current
        return (
          <Link key={it.id} href={it.href} prefetch aria-current={on ? 'page' : undefined}
            style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', color: on ? '#1B1305' : 'rgba(255,255,255,0.82)', background: on ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : 'transparent' }}>
            {it.label}
          </Link>
        )
      })}
    </div>
  )
}
