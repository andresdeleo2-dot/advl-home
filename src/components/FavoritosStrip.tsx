'use client'

import { useEffect, useState } from 'react'
import type { Item } from '@/lib/supabase'
import { CONFIG } from '@/lib/config'
import { normalizeImageUrl, getFaviconUrl } from '@/lib/utils'

/* Cinta de "Accesos rápidos" (los favoritos del home) reutilizable.
   Se puede plegar para no robar espacio en páginas de trabajo como /epicas.
   Lee /api/items y muestra los que tienen featured = true. */

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

const KEY = 'advl_favstrip_open'

export default function FavoritosStrip() {
  const [favorites, setFavorites] = useState<Item[]>([])
  const [open, setOpen] = useState(true)

  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v === '0') setOpen(false) } catch { /* noop */ }
    fetch('/api/items')
      .then(r => r.json())
      .then(j => { if (j?.ok) setFavorites((j.data as Item[]).filter(i => i.featured).slice(0, CONFIG.maxFavorites)) })
      .catch(() => {})
  }, [])

  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem(KEY, n ? '1' : '0') } catch { /* noop */ } return n })

  if (favorites.length === 0) return null

  return (
    <section className="mb-6">
      <button onClick={toggle} aria-expanded={open}
        className="mb-2.5 flex items-center gap-2"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span className="eyebrow" style={{ color: 'rgba(15,35,64,0.4)' }}>Accesos rápidos</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.35)' }}>{favorites.length}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: 'rgba(20,35,61,0.4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="flex gap-2.5 overflow-x-auto pb-2 animate-fade">
          {favorites.map(fav => (
            <a key={fav.id} href={fav.url} target="_blank" rel="noopener noreferrer"
              className="flex w-[84px] flex-shrink-0 flex-col items-center gap-2 rounded-[14px] border border-[rgba(15,35,64,0.09)] bg-white text-center no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[rgba(194,147,58,0.5)]"
              style={{ padding: '12px 8px' }}>
              <span className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-[11px] border border-[rgba(15,35,64,0.07)] bg-[#F7F5EF]">
                <FavIcon item={fav} />
              </span>
              <span className="clamp-1 w-full text-[10.5px] font-semibold text-[rgba(20,35,61,0.72)]">{fav.title}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
