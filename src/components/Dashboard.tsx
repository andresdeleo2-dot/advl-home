'use client'

import { useMemo, useState, useEffect } from 'react'
import type { Item } from '@/lib/supabase'
import { CONFIG } from '@/lib/config'
import { matchesQuery, groupItems } from '@/lib/utils'
import ItemCard from './ItemCard'
import HeaderStats from './HeaderStats'
import WeatherWidget from './WeatherWidget'
import QuoteWidget from './QuoteWidget'
import TimerWidget from './TimerWidget'
import CalendarWidget from './CalendarWidget'
import EditModal from './EditModal'

export default function Dashboard({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems)
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
  const [showFav, setShowFav] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [modal, setModal] = useState<Item | 'new' | null>(null)

  // debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), 200)
    return () => clearTimeout(t)
  }, [rawQuery])

  const categories = useMemo(() => {
    const set = new Map<string, number>()
    for (const it of items) set.set(it.section, (set.get(it.section) ?? Math.min(it.section_order, 999)))
    return Array.from(set.keys()).sort((a, b) =>
      (items.find(i => i.section === a)?.section_order ?? 999) - (items.find(i => i.section === b)?.section_order ?? 999)
    )
  }, [items])

  const subcategories = useMemo(
    () => Array.from(new Set(items.map(i => i.subcategory).filter(Boolean) as string[])),
    [items]
  )

  const favorites = useMemo(
    () => items.filter(i => i.featured).slice(0, CONFIG.maxFavorites),
    [items]
  )

  const filtered = useMemo(() => {
    return items.filter(it => {
      if (showFav && !it.featured) return false
      if (activeCat !== 'all' && it.section !== activeCat) return false
      if (!matchesQuery(it, query)) return false
      return true
    })
  }, [items, query, activeCat, showFav])

  const grouped = useMemo(() => groupItems(filtered), [filtered])

  // ---- CRUD con optimistic update + rollback ----
  const toggleFav = async (item: Item) => {
    const prev = items
    const next = !item.featured
    setItems(items.map(i => i.id === item.id ? { ...i, featured: next } : i))
    try {
      const r = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: next }),
      })
      if (!r.ok) throw new Error('falló')
    } catch {
      setItems(prev) // rollback
    }
  }

  const saveItem = async (draft: Partial<Item>, isNew: boolean) => {
    if (isNew) {
      const r = await fetch('/api/items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'No se pudo crear')
      setItems(prev => [...prev, j.data])
    } else {
      const prev = items
      setItems(items.map(i => i.id === draft.id ? { ...i, ...draft } as Item : i))
      const r = await fetch(`/api/items/${draft.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const j = await r.json()
      if (!j.ok) { setItems(prev); throw new Error(j.error || 'No se pudo guardar') }
    }
  }

  const deleteItem = async (item: Item) => {
    const prev = items
    setItems(items.filter(i => i.id !== item.id))
    const r = await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
    if (!r.ok) setItems(prev)
  }

  const refresh = async () => {
    const r = await fetch('/api/items')
    const j = await r.json()
    if (j.ok) setItems(j.data)
  }

  return (
    <div className="min-h-screen">
      {/* HEADER */}
      <header className="border-b border-white/5">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ADVL" className="h-11 w-auto drop-shadow-[0_2px_8px_rgba(212,175,55,0.35)]" />
            <div>
              <h1 className="text-base font-semibold leading-tight">{CONFIG.siteName}</h1>
              <p className="text-[11px] text-white/35">Dashboard personal</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <HeaderStats />
            <div className="hidden items-center gap-1.5 lg:flex">
              <HeaderBtn href={CONFIG.quickLinks.excel} label="Excel" />
              <HeaderBtn href={CONFIG.quickLinks.codigo} label="Código" />
            </div>
            <button onClick={() => setModal('new')}
              className="flex items-center gap-1.5 rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-[#1a1407] shadow-lg shadow-amber-500/25 hover:brightness-110">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              <span className="hidden sm:inline">Nuevo</span>
            </button>
            <button onClick={refresh} title="Refrescar"
              className="flex h-9 w-9 items-center justify-center rounded-xl glass glass-hover text-white/60">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-5 py-6 lg:flex-row">
        {/* MAIN */}
        <main className="min-w-0 flex-1">
          {/* COMMAND PANEL */}
          <div className="mb-6 rounded-3xl glass p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Supabase conectado
                </span>
                <span className="text-white/40">{items.length} accesos · {categories.length} categorías</span>
              </div>
              <button onClick={() => setEditMode(e => !e)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${editMode ? 'bg-gold text-[#1a1407]' : 'glass glass-hover text-white/65'}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                {editMode ? 'Editando' : 'Modo edición'}
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                value={rawQuery} onChange={e => setRawQuery(e.target.value)}
                placeholder="Buscar por nombre, url, categoría, descripción…"
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-white/30 focus:border-amber-400/50"
              />
            </div>

            {/* Chips */}
            <div className="flex flex-wrap gap-1.5">
              <Chip active={activeCat === 'all' && !showFav} onClick={() => { setActiveCat('all'); setShowFav(false) }}>Todos</Chip>
              <Chip active={showFav} accent="amber" onClick={() => setShowFav(f => !f)}>⭐ Favoritos</Chip>
              <span className="mx-1 self-center text-white/15">|</span>
              {categories.map(cat => (
                <Chip key={cat} active={activeCat === cat} onClick={() => setActiveCat(activeCat === cat ? 'all' : cat)}>{cat}</Chip>
              ))}
            </div>
          </div>

          {/* FAVORITES STRIP */}
          {!showFav && favorites.length > 0 && (
            <section className="mb-7">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/30">Accesos rápidos</h2>
              <div className="flex gap-2.5 overflow-x-auto pb-2">
                {favorites.map(fav => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={fav.id} href={fav.url} target="_blank" rel="noopener noreferrer"
                    className="flex w-[88px] flex-shrink-0 flex-col items-center gap-1.5 rounded-2xl glass glass-hover p-2.5 text-center transition hover:-translate-y-0.5">
                    <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
                      <img src={`https://www.google.com/s2/favicons?domain=${(() => { try { return new URL(fav.url).hostname } catch { return '' } })()}&sz=64`} alt="" className="h-5 w-5" />
                    </span>
                    <span className="clamp-1 w-full text-[10px] font-medium text-white/70">{fav.title}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* CATALOG */}
          {grouped.length === 0 ? (
            <div className="rounded-3xl glass py-16 text-center text-sm text-white/40">
              No se encontraron accesos {query && <>para “{query}”</>}.
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(group => (
                <section key={group.section} className="animate-fade">
                  <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/30">
                    {group.section}
                    <span className="text-white/15">·</span>
                    <span className="text-white/25">{group.subgroups.reduce((n, s) => n + s.items.length, 0)}</span>
                  </h2>
                  {group.subgroups.map((sub, i) => (
                    <div key={i} className="mb-4">
                      {sub.subcategory && (
                        <p className="mb-2 ml-0.5 text-[11px] font-medium text-amber-300/70">{sub.subcategory}</p>
                      )}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                        {sub.items.map(item => (
                          <ItemCard key={item.id} item={item} editMode={editMode} onToggleFav={toggleFav} onEdit={(it) => setModal(it)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </main>

        {/* SIDEBAR */}
        <aside className="flex w-full flex-col gap-4 lg:w-80 lg:flex-shrink-0">
          <WeatherWidget />
          <TimerWidget />
          <QuoteWidget />
          <CalendarWidget />
        </aside>
      </div>

      {modal && (
        <EditModal
          item={modal === 'new' ? null : modal}
          sections={categories}
          subcategories={subcategories}
          onSave={saveItem}
          onDelete={deleteItem}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function HeaderBtn({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="rounded-xl glass glass-hover px-3 py-2 text-sm font-medium text-white/65">
      {label}
    </a>
  )
}

function Chip({ children, active, onClick, accent }: { children: React.ReactNode; active?: boolean; onClick?: () => void; accent?: 'amber' }) {
  const activeCls = accent === 'amber'
    ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30'
    : 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/30'
  return (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? activeCls : 'bg-white/5 text-white/55 hover:bg-white/10'}`}>
      {children}
    </button>
  )
}
