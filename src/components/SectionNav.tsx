'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import CommandPalette from './CommandPalette'

/* Conmutador consistente entre las secciones (Panel / Tiempo / Épicas / Ideas / Accesos),
   presente en todos los headers (banda navy). El actual va resaltado en oro; los demás
   navegan rápido (Next prefetch) con hover. Íconos para lectura de un vistazo. */

const ICONS: Record<string, ReactNode> = {
  accesos: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>),
  panel: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>),
  epicas: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4" /><path d="M4 4h13l-2.5 4L17 12H4" /></svg>),
  tiempo: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" /></svg>),
  ideas: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.46 1.6 1.4 1.6 2.2h4c0-.8 1-1.74 1.6-2.2A6 6 0 0 0 12 3Z" /></svg>),
  roadmap: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11h5l2-3 4 6 2-3h5" /><circle cx="20" cy="5" r="2" /><circle cx="4" cy="19" r="2" /></svg>),
}

export default function SectionNav({ current }: { current: 'accesos' | 'panel' | 'epicas' | 'tiempo' | 'ideas' | 'roadmap' }) {
  const items = [
    { id: 'panel', label: 'Panel', href: '/panel' },
    { id: 'tiempo', label: 'Tiempo', href: '/tiempo' },
    { id: 'epicas', label: 'Épicas', href: '/epicas' },
    { id: 'accesos', label: 'Accesos', href: '/' },
    { id: 'ideas', label: 'Ideas', href: '/ideas' },
    { id: 'roadmap', label: 'Roadmap', href: '/roadmap' },
  ] as const
  // "+" = captura rápida: abre la paleta (⌘K) ya en modo "crear tarea".
  const capturar = () => window.dispatchEvent(new CustomEvent('advl:captura', { detail: { texto: '+ ' } }))
  return (
    <>
    <nav className="section-nav" aria-label="Secciones" style={{ display: 'inline-flex', gap: 2, background: 'rgba(10,20,38,0.28)', border: '1px solid rgba(255,255,255,0.14)', padding: 3, borderRadius: 999, boxShadow: 'inset 0 1px 2px rgba(0,0,0,.18)' }}>
      <style>{`
        .section-nav a { transition: background .15s ease, color .15s ease; text-decoration: none; }
        .section-nav a[data-on="false"]:hover { background: rgba(255,255,255,0.12); color: #fff !important; }
        .section-nav a:focus-visible, .section-nav .sn-plus:focus-visible { outline: 2px solid #E7C56B; outline-offset: 2px; }
        .section-nav .sn-plus {
          order: 99; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
          width: 30px; height: 30px; margin-left: 2px; padding: 0; border-radius: 999px; cursor: pointer;
          border: 1px solid rgba(231,197,107,0.45); background: rgba(231,197,107,0.12); color: #E7C56B;
          transition: background .15s ease;
        }
        .section-nav .sn-plus:hover { background: rgba(231,197,107,0.26); }
        .section-nav .sn-plus-label { display: none; }
        /* En celular el nav se ancla ABAJO como barra fija: siempre en el mismo lugar en las 3
           secciones (no salta al cambiar). En escritorio sigue arriba en el header. */
        @media (max-width: 700px) {
          .section-nav {
            position: fixed !important; left: 10px; right: 10px; bottom: 10px; z-index: 90 !important;
            display: flex !important; justify-content: space-around !important; gap: 4px !important;
            padding: 6px !important; padding-bottom: calc(6px + env(safe-area-inset-bottom)) !important;
            background: rgba(16,35,64,0.94) !important; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.16) !important; border-radius: 20px !important;
            box-shadow: 0 14px 34px -10px rgba(0,0,0,.55) !important;
          }
          .section-nav a { flex: 1; min-width: 0; flex-direction: column; gap: 4px !important; padding: 9px 4px !important; justify-content: center; min-height: 52px; }
          /* El "+" va al centro de la barra (entre Épicas y Accesos), como botón dorado. */
          .section-nav .sn-plus {
            order: 5; flex: 0 0 48px; width: 48px; height: 48px; align-self: center; margin: 0; border: none;
            background: linear-gradient(135deg,#E7C56B,#C2933A); color: #1B1305; box-shadow: 0 8px 18px -8px rgba(194,147,58,.95);
          }
          /* Con texto: en Accesos hay otro "+" dorado arriba (nuevo acceso) y no deben confundirse. */
          .section-nav .sn-plus { flex-direction: column; gap: 1px; }
          .section-nav .sn-plus svg { width: 18px; height: 18px; }
          .section-nav .sn-plus-label { display: block; font-size: 9px; font-weight: 800; line-height: 1; letter-spacing: .02em; }
          .section-nav .sn-label { display: inline !important; font-size: 11px; font-weight: 700; }
          .section-nav a svg { width: 19px; height: 19px; }
          /* Deja aire abajo para que la barra no tape el último contenido (sólo donde existe el nav). */
          body { padding-bottom: calc(84px + env(safe-area-inset-bottom)); }
        }
        @media (max-width: 400px) {
          .section-nav a { padding: 9px 1px !important; }
          .section-nav .sn-label { display: block !important; max-width: 100%; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }
          .section-nav .sn-plus { flex-basis: 44px; width: 44px; height: 44px; }
        }
      `}</style>
      {items.map((it, idx) => {
        const on = it.id === current
        return (
          <Link key={it.id} href={it.href} prefetch aria-label={it.label} aria-current={on ? 'page' : undefined} data-on={on ? 'true' : 'false'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 15px', borderRadius: 999, order: idx * 2,
              fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1,
              color: on ? '#1B1305' : 'rgba(255,255,255,0.80)',
              background: on ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : 'transparent',
              boxShadow: on ? '0 6px 14px -6px rgba(194,147,58,.95)' : 'none',
            }}>
            <span aria-hidden="true" style={{ display: 'inline-flex', opacity: on ? 1 : 0.85 }}>{ICONS[it.id]}</span>
            <span className="sn-label">{it.label}</span>
          </Link>
        )
      })}
      <button type="button" className="sn-plus" onClick={capturar} aria-label="Captura rápida: nueva tarea" title="Captura rápida (⌘K y empieza con +)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        <span className="sn-plus-label" aria-hidden="true">Tarea</span>
      </button>
    </nav>
    {/* Respaldo para páginas sin paleta en el header (Accesos): si ya hay una, ésta no hace nada. */}
    <CommandPalette sinBoton />
    </>
  )
}
