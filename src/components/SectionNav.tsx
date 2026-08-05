'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/* Conmutador consistente entre las 3 secciones (Accesos / Épicas / Tiempo), presente en
   los tres headers (banda navy). El actual va resaltado en oro; los demás navegan rápido
   (Next prefetch) con hover. Íconos para lectura de un vistazo. */

const ICONS: Record<string, ReactNode> = {
  accesos: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>),
  epicas: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4" /><path d="M4 4h13l-2.5 4L17 12H4" /></svg>),
  tiempo: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" /></svg>),
}

export default function SectionNav({ current }: { current: 'accesos' | 'epicas' | 'tiempo' }) {
  const items = [
    { id: 'accesos', label: 'Accesos', href: '/' },
    { id: 'epicas', label: 'Épicas', href: '/epicas' },
    { id: 'tiempo', label: 'Tiempo', href: '/tiempo' },
  ] as const
  return (
    <nav className="section-nav" aria-label="Secciones" style={{ display: 'inline-flex', gap: 2, background: 'rgba(10,20,38,0.28)', border: '1px solid rgba(255,255,255,0.14)', padding: 3, borderRadius: 999, boxShadow: 'inset 0 1px 2px rgba(0,0,0,.18)' }}>
      <style>{`
        .section-nav a { transition: background .15s ease, color .15s ease; text-decoration: none; }
        .section-nav a[data-on="false"]:hover { background: rgba(255,255,255,0.12); color: #fff !important; }
        .section-nav a:focus-visible { outline: 2px solid #E7C56B; outline-offset: 2px; }
        @media (max-width: 560px) { .section-nav .sn-label { display: none; } .section-nav a { padding: 8px 10px !important; } }
      `}</style>
      {items.map(it => {
        const on = it.id === current
        return (
          <Link key={it.id} href={it.href} prefetch aria-current={on ? 'page' : undefined} data-on={on ? 'true' : 'false'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 15px', borderRadius: 999,
              fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1,
              color: on ? '#1B1305' : 'rgba(255,255,255,0.80)',
              background: on ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : 'transparent',
              boxShadow: on ? '0 6px 14px -6px rgba(194,147,58,.95)' : 'none',
            }}>
            <span style={{ display: 'inline-flex', opacity: on ? 1 : 0.85 }}>{ICONS[it.id]}</span>
            <span className="sn-label">{it.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
