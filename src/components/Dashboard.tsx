'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import type { Item } from '@/lib/supabase'
import { CONFIG } from '@/lib/config'
import { matchesQuery, groupItems, getFaviconUrl, normalizeImageUrl } from '@/lib/utils'
import ItemCard from './ItemCard'
import HeaderStats from './HeaderStats'
import WeatherWidget from './WeatherWidget'
import QuoteWidget from './QuoteWidget'
import TimerWidget from './TimerWidget'
import CalendarWidget from './CalendarWidget'
import FlujoCalendar from './FlujoCalendar'
import EditModal from './EditModal'

function FavIcon({ item }: { item: Item }) {
  const [fallback, setFallback] = useState(false)
  const img = normalizeImageUrl(item.image)
  const favicon = getFaviconUrl(item.url)
  const initials = item.title.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  if (!fallback && img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={img} alt="" className="h-9 w-9 object-cover" referrerPolicy="no-referrer" onError={() => setFallback(true)} />
    )
  }
  if (favicon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={favicon} alt="" className="h-5 w-5" />
    )
  }
  return <span className="text-sm font-bold text-[#16365f]/70">{initials}</span>
}

function isFlujo(section: string) {
  return section.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() === 'flujo'
}

type Recent = { id: string; title: string; url: string; ts: number }
const RECENT_KEY = 'advl_recent_v1'
const RECENT_MAX = 8

function loadRecents(): Recent[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function Dashboard({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems)
  const [rawQuery, setRawQuery] = useState('')
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
  const [showFav, setShowFav] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [modal, setModal] = useState<Item | 'new' | null>(null)
  const [recents, setRecents] = useState<Recent[]>([])
  const [greeting, setGreeting] = useState('')
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Al montar: refrescar datos (la página es cacheada), cargar recientes y saludo
  useEffect(() => {
    setRecents(loadRecents())
    const hourMx = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Mexico_City', hour: '2-digit', hour12: false,
    }).format(new Date()))
    setGreeting(greetingFor(hourMx))
    fetch('/api/items').then(r => r.json()).then(j => { if (j.ok) setItems(j.data) }).catch(() => {})
  }, [])

  // Debounce de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), 200)
    return () => clearTimeout(t)
  }, [rawQuery])

  const showToast = useCallback((msg: string, error = false) => {
    setToast({ msg, error })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const trackOpen = useCallback((item: Item) => {
    setRecents(prev => {
      const next = [{ id: item.id, title: item.title, url: item.url, ts: Date.now() },
        ...prev.filter(r => r.id !== item.id)].slice(0, RECENT_MAX)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }, [])

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

  // Atajos de teclado: / o ⌘K enfoca búsqueda, Esc limpia, Enter abre primer resultado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'

      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setRawQuery('')
        searchRef.current?.blur()
        return
      }
      if (e.key === 'Enter' && document.activeElement === searchRef.current && filtered.length > 0) {
        const first = filtered[0]
        trackOpen(first)
        window.open(first.url, '_blank', 'noopener')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filtered, trackOpen])

  // ---- CRUD optimista ----
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
      showToast(next ? '⭐ Agregado a favoritos' : 'Quitado de favoritos')
    } catch {
      setItems(prev)
      showToast('No se pudo guardar el favorito', true)
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
      showToast('Acceso creado')
    } else {
      const prev = items
      setItems(items.map(i => i.id === draft.id ? { ...i, ...draft } as Item : i))
      const r = await fetch(`/api/items/${draft.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const j = await r.json()
      if (!j.ok) { setItems(prev); throw new Error(j.error || 'No se pudo guardar') }
      showToast('Acceso guardado')
    }
  }

  const deleteItem = async (item: Item) => {
    const prev = items
    setItems(items.filter(i => i.id !== item.id))
    const r = await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
    if (!r.ok) {
      setItems(prev)
      showToast('No se pudo eliminar', true)
    } else {
      showToast('Acceso eliminado')
    }
  }

  // Reordenar dentro de su subgrupo (sección + subcategoría)
  const moveItem = async (item: Item, dir: -1 | 1) => {
    const siblings = items
      .filter(i => i.section === item.section && (i.subcategory || '') === (item.subcategory || ''))
      .sort((a, b) => (a.item_order ?? 999) - (b.item_order ?? 999))
    const idx = siblings.findIndex(i => i.id === item.id)
    const target = idx + dir
    if (target < 0 || target >= siblings.length) return

    // Reasignar orden secuencial (10, 20, 30…) con el item movido en su nueva posición
    const reordered = [...siblings]
    reordered.splice(idx, 1)
    reordered.splice(target, 0, item)
    const changes = new Map<string, number>()
    reordered.forEach((it, i) => {
      const newOrder = (i + 1) * 10
      if (it.item_order !== newOrder) changes.set(it.id, newOrder)
    })
    if (changes.size === 0) return

    const prev = items
    setItems(items.map(i => changes.has(i.id) ? { ...i, item_order: changes.get(i.id)! } : i))
    try {
      const results = await Promise.all(
        Array.from(changes.entries()).map(([id, item_order]) =>
          fetch(`/api/items/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_order }),
          })
        )
      )
      if (results.some(r => !r.ok)) throw new Error('fallo')
    } catch {
      setItems(prev)
      showToast('No se pudo reordenar', true)
    }
  }

  // Drag & drop: soltar sobre otra tarjeta coloca el item en esa posición (mismo grupo)
  const reorderTo = async (sourceId: string, target: Item) => {
    const source = items.find(i => i.id === sourceId)
    if (!source || source.id === target.id) return
    if (source.section !== target.section || (source.subcategory || '') !== (target.subcategory || '')) {
      showToast('Solo puedes reordenar dentro del mismo grupo', true)
      return
    }
    const siblings = items
      .filter(i => i.section === target.section && (i.subcategory || '') === (target.subcategory || ''))
      .sort((a, b) => (a.item_order ?? 999) - (b.item_order ?? 999))
    const from = siblings.findIndex(i => i.id === source.id)
    const to = siblings.findIndex(i => i.id === target.id)
    if (from < 0 || to < 0) return

    const reordered = [...siblings]
    reordered.splice(from, 1)
    reordered.splice(to, 0, source)
    const changes = new Map<string, number>()
    reordered.forEach((it, i) => {
      const newOrder = (i + 1) * 10
      if (it.item_order !== newOrder) changes.set(it.id, newOrder)
    })
    if (changes.size === 0) return

    const prev = items
    setItems(items.map(i => changes.has(i.id) ? { ...i, item_order: changes.get(i.id)! } : i))
    try {
      const results = await Promise.all(
        Array.from(changes.entries()).map(([id, item_order]) =>
          fetch(`/api/items/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_order }),
          })
        )
      )
      if (results.some(r => !r.ok)) throw new Error('fallo')
      showToast('Orden actualizado')
    } catch {
      setItems(prev)
      showToast('No se pudo reordenar', true)
    }
  }

  const copyUrl = useCallback(async (item: Item) => {
    try {
      await navigator.clipboard.writeText(item.url)
      showToast('URL copiada')
    } catch {
      showToast('No se pudo copiar', true)
    }
  }, [showToast])

  const logout = async () => {
    try {
      const { createBrowserClient } = await import('@supabase/ssr')
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      await sb.auth.signOut()
    } catch { /* noop */ }
    window.location.href = '/login'
  }

  const refresh = async () => {
    const r = await fetch('/api/items')
    const j = await r.json()
    if (j.ok) { setItems(j.data); showToast('Datos actualizados') }
    else showToast('No se pudo actualizar', true)
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
              <p className="text-[11px] text-white/55">{greeting || 'Dashboard personal'}</p>
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
            {!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && (
              <button onClick={logout} title="Cerrar sesion"
                className="flex h-9 w-9 items-center justify-center rounded-xl band-glass band-glass-hover text-white/80">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
              </button>
            )}
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
              <input ref={searchRef} value={rawQuery} onChange={e => setRawQuery(e.target.value)}
                placeholder="Buscar por nombre, url, categoria, descripcion..."
                className="w-full rounded-2xl border border-white/20 bg-white py-2.5 pl-10 pr-24 text-sm text-[#0f2340] outline-none placeholder:text-[#16365f]/40 focus:border-white" />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[10px] text-[#16365f]/40 sm:flex">
                <kbd className="rounded border border-[#16365f]/15 bg-[#f1f6fc] px-1.5 py-0.5 font-sans">⌘K</kbd>
                <span>o</span>
                <kbd className="rounded border border-[#16365f]/15 bg-[#f1f6fc] px-1.5 py-0.5 font-sans">/</kbd>
              </span>
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
              {query && ' · Enter abre el primero'}
              {editMode && ' · arrastra las tarjetas para reordenar'}
            </p>
          </div>

          {/* RECIENTES */}
          {recents.length > 0 && !query && (
            <section className="mb-5">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[#16365f]/40">Recientes</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recents.map(r => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full glass glass-hover px-3 py-1.5 text-xs font-semibold text-[#16365f]/80">
                    <img src={getFaviconUrl(r.url) ?? ''} alt="" className="h-3.5 w-3.5 rounded-sm" />
                    {r.title}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* FAVORITOS */}
          {!showFav && favorites.length > 0 && (
            <section className="mb-7">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#16365f]/40">Accesos rapidos</h2>
              <div className="flex gap-2.5 overflow-x-auto pb-2">
                {favorites.map(fav => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={fav.id} href={fav.url} target="_blank" rel="noopener noreferrer" onClick={() => trackOpen(fav)}
                    className="flex w-[88px] flex-shrink-0 flex-col items-center gap-1.5 rounded-2xl glass glass-hover p-2.5 text-center transition hover:-translate-y-0.5">
                    <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-[#f1f6fc] ring-1 ring-[#16365f]/8">
                      <FavIcon item={fav} />
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
                          <ItemCard key={item.id} item={item} editMode={editMode}
                            onToggleFav={toggleFav} onEdit={(it) => setModal(it)}
                            onMove={moveItem} onOpen={trackOpen} onCopy={copyUrl}
                            dragging={dragId === item.id}
                            onDragStart={() => setDragId(item.id)}
                            onDragEnd={() => setDragId(null)}
                            onDropOn={(target) => { if (dragId) { reorderTo(dragId, target); setDragId(null) } }} />
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

      {/* TOAST */}
      {toast && (
        <div className={`animate-fade fixed bottom-4 right-4 z-[60] rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-2xl ${toast.error ? 'bg-red-600' : 'bg-[#0f2340]'}`}>
          {toast.msg}
        </div>
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
