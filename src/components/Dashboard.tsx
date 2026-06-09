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
import FlujoCalendar from './FlujoCalendar'
import EditModal from './EditModal'

function isFlujo(section: string) {
  return section.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() === 'flujo'
}

export default function Dashboard({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems)
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
  const [showFav, setShowFav] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [modal, setModal] = useState<Item | 'new' | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), 200)
    return () => clearTimeout(t)
  }, [rawQuery])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) set.add(it.section)
    return Array.from(set).sort((a, b) =>
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
  const resultCount = filtered.length

  const toggleFav = async (item: Item) => {
    const prev = items
    const next = !item.featured
    setItems(items.map(i => i.id === item.id ? { ...i, featured: next } : i))
    try {
      const r = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: next }),
      })
      if (!r.ok) throw new Error('fallo')
    } catch { setItems(prev) }
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
      <header className="band mx-3 mt-3 rounded-3xl px-5 py-3.5 text-white sm:mx-5">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ADVL" className="h-11 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]" />
            <div>
              <h1 className="text-base font-semibold leading-tight">{CONFIG.siteName}</h1>
              <p className="text-[11px] text-white/55">Dashboard personal</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <HeaderStats />
            <div className="hidden items-center gap-1.5 lg:flex">
              <a href={CONFIG.quickLinks.excel} target="_blank" rel="noopener noreferrer"
                className="rounded-xl band-glass band-glass-hover px-3 py-2 text-sm font-medium text-white/85">Excel</a>
              <a href={CONFIG.quickLinks.codigo} target="_blank" rel="noopener noreferrer"
                className="rounded-xl band-glass band-glass-hover px-3 py-2 text-sm font-medium text-white/85">Codigo</a>
            </div>
            <button onClick={() => setModal('new')}
              className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#16365f] shadow-lg hover:bg-white/90">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              <span className="hidden sm:inline">Nuevo</span>
            </button>
            <button onClick={refresh} title="Refrescar"
              className="flex h-9 w-9 items-center justify-center rounded-xl band-glass band-glass-hover text-white/80">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-5 py-6 lg:flex-row">
        <main className="min-w-0 flex-1">
          {/* COMMAND PANEL */}
          <div className="mb-6 band rounded-3xl p-4 text-white">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-2.5 py-1 font-semibold text-emerald-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Supabase conectado
                </span>
                <span className="text-white/55">{items.length} accesos · {categories.length} categorias</span>
              </div>
              <button onClick={() => setEditMode(e => !e)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${editMode ? 'bg-white text-[#16365f]' : 'band-glass band-glass-hover text-white/85'}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                {editMode ? 'Editando' : 'Modo edicion'}
              </button>
            </div>

            <div className="relative mb-3">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#16365f]/40" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input value={rawQuery} onChange={e => setRawQuery(e.target.value)}
                placeholder="Buscar por nombre, url, categoria, descripcion..."
                className="w-full rounded-2xl border border-white/20 bg-white py-2.5 pl-10 pr-4 text-sm text-[#0f2340] outline-none placeholder:text-[#16365f]/40 focus:border-white" />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Chip active={activeCat === 'all' && !showFav} onClick={() => { setActiveCat('all'); setShowFav(false) }}>Todos</Chip>
              <Chip active={showFav} onClick={() => setShowFav(f => !f)}>⭐ Favoritos</Chip>
              <span className="mx-1 self-center text-white/20">|</span>
              {categories.map(cat => (
                <Chip key={cat} active={activeCat === cat} onClick={() => setActiveCat(activeCat === cat ? 'all' : cat)}>{cat}</Chip>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-white/45">
              {resultCount} {resultCount === 1 ? 'resultado' : 'resultados'}
              {editMode && ' · modo edicion activo'}
            </p>
          </div>

          {/* FAVORITOS */}
          {!showFav && favorites.length > 0 && (
            <section className="mb-7">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#16365f]/40">Accesos rapidos</h2>
              <div className="flex gap-2.5 overflow-x-auto pb-2">
                {favorites.map(fav => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={fav.id} href={fav.url} target="_blank" rel="noopener noreferrer"
                    className="flex w-[88px] flex-shrink-0 flex-col items-center gap-1.5 rounded-2xl glass glass-hover p-2.5 text-center transition hover:-translate-y-0.5">
                    <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-[#f1f6fc] ring-1 ring-[#16365f]/8">
                      <img src={`https://www.google.com/s2/favicons?domain=${(() => { try { return new URL(fav.url).hostname } catch { return '' } })()}&sz=64`} alt="" className="h-5 w-5" />
                    </span>
                    <span className="clamp-1 w-full text-[10px] font-medium text-[#16365f]/75">{fav.title}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* CATALOGO */}
          {grouped.length === 0 ? (
            <div className="rounded-3xl glass py-16 text-center text-sm text-[#16365f]/45">
              No se encontraron accesos {query && <>para &ldquo;{query}&rdquo;</>}.
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(group => (
                <section key={group.section} className="animate-fade">
                  <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#16365f]/40">
                    {group.section}
                    <span className="text-[#16365f]/20">·</span>
                    <span className="text-[#16365f]/30">{group.subgroups.reduce((n, s) => n + s.items.length, 0)}</span>
                  </h2>

                  {isFlujo(group.section) && (
                    <div className="mb-4">
                      <FlujoCalendar />
                    </div>
                  )}

                  {group.subgroups.map((sub, i) => (
                    <div key={i} className="mb-4">
                      {sub.subcategory && (
                        <p className="mb-2 ml-0.5 text-[11px] font-semibold text-[#2d6cdf]/70">{sub.subcategory}</p>
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

function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-white text-[#16365f] shadow' : 'bg-white/15 text-white/80 hover:bg-white/25'}`}>
      {children}
    </button>
  )
}
