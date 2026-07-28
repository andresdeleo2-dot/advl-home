'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Item } from '@/lib/supabase'
import { CONFIG } from '@/lib/config'
import FavoriteTile from './FavoriteTile'

/* Cinta de "Accesos rápidos" (los favoritos del home) reutilizable.
   Se puede plegar para no robar espacio en páginas de trabajo como /epicas.
   Lee /api/items y muestra los que tienen featured = true. */

const KEY = 'advl_favstrip_open'

const bySort = (a: Item, b: Item) => (a.fav_order ?? 1e9) - (b.fav_order ?? 1e9)

export default function FavoritosStrip() {
  const [favorites, setFavorites] = useState<Item[]>([])
  const [open, setOpen] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v === '0') setOpen(false) } catch { /* noop */ }
    fetch('/api/items')
      .then(r => r.json())
      .then(j => { if (j?.ok) setFavorites((j.data as Item[]).filter(i => i.featured).sort(bySort).slice(0, CONFIG.maxFavorites)) })
      .catch(() => {})
  }, [])

  // Reordena la cinta: reasigna fav_order 10,20,30… y persiste sólo lo que cambió.
  const reorderFav = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const from = favorites.findIndex(i => i.id === sourceId)
    const to = favorites.findIndex(i => i.id === targetId)
    if (from < 0 || to < 0) return
    const reordered = [...favorites]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const changes = new Map<string, number>()
    const next = reordered.map((it, i) => { const n = (i + 1) * 10; if (it.fav_order !== n) changes.set(it.id, n); return { ...it, fav_order: n } })
    if (changes.size === 0) return
    const prev = favorites
    setFavorites(next)
    try {
      const results = await Promise.all(Array.from(changes.entries()).map(([id, fav_order]) =>
        fetch(`/api/items/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fav_order }) })))
      if (results.some(r => !r.ok)) throw new Error('fallo')
    } catch {
      setFavorites(prev)
    }
  }

  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem(KEY, n ? '1' : '0') } catch { /* noop */ } return n })

  // ¿hay contenido oculto a izquierda/derecha? (para mostrar u ocultar las flechas)
  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])
  useLayoutEffect(() => { updateArrows() }, [favorites, open, updateArrows])
  useEffect(() => {
    const onResize = () => updateArrows()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [updateArrows])

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current
    if (el) el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' })
  }

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
        <div className="relative animate-fade">
          {/* Flechas de desplazamiento: sólo aparecen si hay algo oculto de ese lado */}
          {canLeft && (
            <button onClick={() => scrollBy(-1)} aria-label="Ver accesos anteriores"
              className="favstrip-arrow" style={{ left: -6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          {canRight && (
            <button onClick={() => scrollBy(1)} aria-label="Ver más accesos"
              className="favstrip-arrow" style={{ right: -6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          )}
          <div ref={scrollRef} onScroll={updateArrows} className="favstrip-scroll flex gap-2.5 pb-2">
            {favorites.map(fav => (
              <FavoriteTile key={fav.id} item={fav} width={84}
                draggable dragging={dragId === fav.id} dragActive={dragId !== null}
                onDragStart={() => setDragId(fav.id)}
                onDragEnd={() => setDragId(null)}
                onDropOn={target => { if (dragId) { reorderFav(dragId, target.id); setDragId(null) } }} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
