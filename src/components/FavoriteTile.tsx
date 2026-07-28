'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Item } from '@/lib/supabase'
import { normalizeImageUrl, getFaviconUrl, parseDescription } from '@/lib/utils'

/* Ficha de acceso rápido (favorito) con POPOVER de links al pasar el cursor
   (o tocar el chevron en móvil). El popover reproduce la tarjeta del catálogo:
   descripción, links del texto y los botones Excel/Código (url2/url3).
   Se pinta con un portal fijo para que la cinta con scroll no lo recorte. */

const DOT: Record<string, string> = {
  blue: '#2E5A9E', green: '#3E8E8E', copper: '#C2933A', purple: '#7A6FB0',
  red: '#B07A56', cyan: '#5B6B86', orange: '#C2933A', sea: '#3E8E8E', sage: '#3E8E8E', rose: '#B07A56',
}

function FavIcon({ item }: { item: Item }) {
  const [fallback, setFallback] = useState(false)
  const img = normalizeImageUrl(item.image)
  const favicon = getFaviconUrl(item.url)
  const initials = item.title.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  if (!fallback && img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt="" className="h-9 w-9 object-cover" referrerPolicy="no-referrer" onError={() => setFallback(true)} />
  }
  if (favicon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={favicon} alt="" className="h-5 w-5" />
  }
  return <span className="text-sm font-bold" style={{ color: 'rgba(15,35,64,0.6)' }}>{initials}</span>
}

const POP_W = 244

export default function FavoriteTile({ item, onOpen, width = 84 }: {
  item: Item
  onOpen?: (item: Item) => void
  width?: number
}) {
  const desc = parseDescription(item.description)
  const hasMore = !!(desc.text || desc.links.length || item.url2 || item.url3)
  const dot = DOT[item.accent] ?? DOT.blue

  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0, top: 0 })
  const tileRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const place = useCallback(() => {
    const el = tileRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(12, Math.min(r.left, window.innerWidth - POP_W - 12))
    const spaceBelow = window.innerHeight - r.bottom
    // Debajo por defecto; arriba si no cabe y hay más espacio hacia arriba.
    if (spaceBelow < 300 && r.top > spaceBelow) setStyle({ left, bottom: window.innerHeight - r.top + 8 })
    else setStyle({ left, top: r.bottom + 8 })
  }, [])

  const show = useCallback(() => {
    if (!hasMore) return
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    place()
    setOpen(true)
  }, [hasMore, place])
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setOpen(false), 140)
  }, [])

  // Cerrar en scroll / resize / Escape / clic fuera mientras está abierto.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (tileRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <div ref={tileRef} className="relative flex-shrink-0" style={{ width }}
      onMouseEnter={show} onMouseLeave={scheduleHide}>
      <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen?.(item)}
        className="flex w-full flex-col items-center gap-2 rounded-[14px] border border-[rgba(15,35,64,0.09)] bg-white text-center no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[rgba(194,147,58,0.5)]"
        style={{ padding: '12px 8px' }}>
        <span className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-[11px] border border-[rgba(15,35,64,0.07)] bg-[#F7F5EF]">
          <FavIcon item={item} />
        </span>
        <span className="clamp-1 w-full text-[10.5px] font-semibold text-[rgba(20,35,61,0.72)]">{item.title}</span>
      </a>

      {/* Chevron: revela los links (útil en táctil). Sólo si hay algo que mostrar. */}
      {hasMore && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); open ? setOpen(false) : show() }}
          aria-label={`Ver links de ${item.title}`} title="Ver links"
          className="absolute right-1 top-1 flex h-[17px] w-[17px] items-center justify-center rounded-full border border-[rgba(15,35,64,0.10)] bg-white/90 text-[rgba(20,35,61,0.5)] shadow-sm transition hover:border-[rgba(194,147,58,0.55)] hover:text-[#A87A2C]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}

      {open && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} onMouseEnter={show} onMouseLeave={scheduleHide}
          className="animate-fade"
          style={{ position: 'fixed', left: style.left, top: style.top, bottom: style.bottom, width: POP_W, zIndex: 60 }}>
          <div className="rounded-[14px] border border-[rgba(15,35,64,0.10)] bg-white p-3 shadow-[0_20px_44px_-24px_rgba(15,35,64,0.55)]">
            {/* Cabecera: icono + título + estrella */}
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[rgba(15,35,64,0.07)] bg-[#F7F5EF]">
                <FavIcon item={item} />
              </span>
              <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen?.(item)}
                className="min-w-0 flex-1 no-underline">
                <p className="clamp-1 font-semibold text-[#10233F]" style={{ fontSize: 13.5, lineHeight: 1.2 }}>{item.title}</p>
                <span className="mt-1 flex items-center gap-1.5 text-[10.5px] text-[rgba(20,35,61,0.48)]">
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: dot }} />
                  {item.subcategory || item.section}
                </span>
              </a>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#C2933A" stroke="#C2933A" strokeWidth="1.7" className="flex-shrink-0">
                <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z" />
              </svg>
            </div>

            {desc.text && (
              <p className="clamp-2 mt-2.5 text-[11px] leading-snug text-[rgba(20,35,61,0.52)]">{desc.text}</p>
            )}

            {desc.links.length > 0 && (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {desc.links.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-[9px] border border-[rgba(15,35,64,0.10)] bg-[#FBFAF6] px-2.5 py-1.5 no-underline transition hover:border-[rgba(194,147,58,0.55)] hover:bg-white">
                    <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] bg-[rgba(194,147,58,0.16)] text-[#A87A2C]">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#16365F]">{l.label}</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-[rgba(20,35,61,0.38)]"><path d="M7 17 17 7M7 7h10v10" /></svg>
                  </a>
                ))}
              </div>
            )}

            {(item.url2 || item.url3) && (
              <div className="mt-2.5 flex gap-1.5 border-t border-[rgba(15,35,64,0.07)] pt-2.5">
                {item.url2 && (
                  <a href={item.url2} target="_blank" rel="noopener noreferrer"
                    className="flex-1 rounded-lg bg-[rgba(62,142,142,0.10)] py-1.5 text-center text-[10px] font-semibold text-[#2E6E6E] no-underline hover:bg-[rgba(62,142,142,0.18)]">Excel</a>
                )}
                {item.url3 && (
                  <a href={item.url3} target="_blank" rel="noopener noreferrer"
                    className="flex-1 rounded-lg bg-[rgba(22,54,95,0.08)] py-1.5 text-center text-[10px] font-semibold text-[#16365F] no-underline hover:bg-[rgba(22,54,95,0.14)]">Código</a>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
