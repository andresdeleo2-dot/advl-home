'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import type { Item } from '@/lib/supabase'
import { CONFIG } from '@/lib/config'
import { matchesQuery, groupItems, getFaviconUrl, normalizeImageUrl } from '@/lib/utils'
import ItemCard from './ItemCard'
import HeaderStats from './HeaderStats'
import WeatherWidget from './WeatherWidget'
import QuoteWidget from './QuoteWidget'
import TimerWidget from './TimerWidget'
import CalendarWidget from './CalendarWidget'
import MomentosWidget from './MomentosWidget'
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
  return <span className="text-sm font-bold" style={{ color: 'rgba(15,35,64,0.6)' }}>{initials}</span>
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
  const [modal, setModal] = useState<Item | 'new' | null>(null)
  const [recents, setRecents] = useState<Recent[]>([])
  const [greeting, setGreeting] = useState('')
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setRecents(loadRecents())
    const hourMx = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Mexico_City', hour: '2-digit', hour12: false,
    }).format(new Date()))
    setGreeting(greetingFor(hourMx))
    fetch('/api/items').then(r => r.json()).then(j => { if (j.ok) setItems(j.data) }).catch(() => {})
  }, [])

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
      {/* LÍNEA DE MARCA */}
      <div className="brand-rule" />

      {/* HEADER */}
      <header className="band mx-3.5 mt-3.5 rounded-2xl px-5 py-3.5 text-white"
        style={{ boxShadow: '0 20px 40px -24px rgba(8,18,36,.7)' }}>
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ADVL" className="h-10 w-auto" style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.4))' }} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold leading-none text-[#F3EFE6]" style={{ letterSpacing: '.01em' }}>{CONFIG.siteName}</span>
              <span className="eyebrow" style={{ color: '#C8A24C', letterSpacing: '.24em' }}>{greeting || 'Dashboard'} · ADVL</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <HeaderStats />
            <div className="hidden items-center gap-1.5 lg:flex">
              <Link href="/epicas"
                className="rounded-[10px] px-3 py-2 text-[12px] font-bold text-[#1B1305]"
                style={{ background: 'linear-gradient(135deg,#E7C56B,#C2933A)', boxShadow: '0 8px 16px -8px rgba(194,147,58,.85)' }}>Épicas</Link>
              <a href={CONFIG.quickLinks.excel} target="_blank" rel="noopener noreferrer"
                className="rounded-[10px] band-glass band-glass-hover px-3 py-2 text-[12px] font-semibold text-white/85">Excel</a>
              <a href={CONFIG.quickLinks.codigo} target="_blank" rel="noopener noreferrer"
                className="rounded-[10px] band-glass band-glass-hover px-3 py-2 text-[12px] font-semibold text-white/85">Código</a>
            </div>
            <button onClick={() => setModal('new')}
              className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12px] font-bold text-[#1B1305]"
              style={{ background: 'linear-gradient(135deg,#E7C56B,#C2933A)', boxShadow: '0 8px 16px -8px rgba(194,147,58,.85)' }}>
              <span className="text-base leading-none" style={{ marginTop: -1 }}>+</span>
              <span className="hidden sm:inline">Nuevo</span>
            </button>
            <button onClick={refresh} title="Refrescar"
              className="flex h-[33px] w-[33px] items-center justify-center rounded-[10px] band-glass band-glass-hover text-white/80">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
            {!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && (
              <button onClick={logout} title="Cerrar sesión"
                className="flex h-[33px] w-[33px] items-center justify-center rounded-[10px] band-glass band-glass-hover text-white/80">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-5 py-5 lg:flex-row lg:items-start">
        <main className="min-w-0 flex-1">
          {/* COMMAND PANEL */}
          <div className="mb-6 rounded-2xl glass p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex items-center gap-1.5 rounded-full bg-[rgba(62,142,142,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#2E6E6E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3E8E8E]" /> Supabase conectado
                </span>
                <span className="text-[12px] text-[rgba(20,35,61,0.46)]">{items.length} accesos · {categories.length} categorías</span>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] text-[rgba(20,35,61,0.36)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Pasa el cursor sobre una tarjeta para editar
              </span>
            </div>

            <div className="relative mb-3">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[rgba(20,35,61,0.32)]"
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input ref={searchRef} value={rawQuery} onChange={e => setRawQuery(e.target.value)}
                placeholder="Buscar por nombre, url, categoría, descripción…"
                className="w-full rounded-[12px] border border-[rgba(15,35,64,0.13)] bg-[#FBFAF6] py-3 pl-10 pr-24 text-[14px] text-[#10233F] outline-none placeholder:text-[rgba(15,35,64,0.35)] transition"
                style={{ fontWeight: 500 }}
                onFocus={e => { e.target.style.borderColor = 'rgba(194,147,58,.6)'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(194,147,58,.14)' }}
                onBlur={e => { e.target.style.borderColor = ''; e.target.style.background = ''; e.target.style.boxShadow = '' }} />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[10px] sm:flex">
                <kbd className="rounded border border-[rgba(15,35,64,0.13)] bg-[#F1EFE7] px-1.5 py-0.5 font-sans text-[rgba(20,35,61,0.5)]">⌘K</kbd>
                <span className="text-[rgba(20,35,61,0.3)]">/</span>
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Chip active={activeCat === 'all' && !showFav} onClick={() => { setActiveCat('all'); setShowFav(false) }}>Todos</Chip>
              <Chip active={showFav} onClick={() => setShowFav(f => !f)}>⭐ Favoritos</Chip>
              {categories.map(cat => (
                <Chip key={cat} active={activeCat === cat} onClick={() => setActiveCat(activeCat === cat ? 'all' : cat)}>{cat}</Chip>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-[rgba(20,35,61,0.42)]">
              {resultCount} {resultCount === 1 ? 'resultado' : 'resultados'}
              {query && ' · Enter abre el primero'}
            </p>
          </div>

          {/* RECIENTES */}
          {recents.length > 0 && !query && (
            <section className="mb-5">
              <h2 className="eyebrow mb-2.5">Recientes</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recents.map(r => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-[rgba(15,35,64,0.09)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1B2E4D] no-underline shadow-sm transition hover:border-[rgba(194,147,58,0.45)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getFaviconUrl(r.url) ?? ''} alt="" className="h-3.5 w-3.5 rounded-sm" />
                    {r.title}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* ACCESOS RÁPIDOS */}
          {!showFav && !query && favorites.length > 0 && (
            <section className="mb-7">
              <h2 className="eyebrow mb-2.5">Accesos rápidos</h2>
              <div className="flex gap-2.5 overflow-x-auto pb-2">
                {favorites.map(fav => (
                  <a key={fav.id} href={fav.url} target="_blank" rel="noopener noreferrer" onClick={() => trackOpen(fav)}
                    className="flex w-[88px] flex-shrink-0 flex-col items-center gap-2 rounded-[14px] border border-[rgba(15,35,64,0.09)] bg-white p-3 text-center no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[rgba(194,147,58,0.5)]"
                    style={{ paddingTop: 13, paddingBottom: 13 }}>
                    <span className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-[11px] border border-[rgba(15,35,64,0.07)] bg-[#F7F5EF]">
                      <FavIcon item={fav} />
                    </span>
                    <span className="clamp-1 w-full text-[10.5px] font-semibold text-[rgba(20,35,61,0.72)]">{fav.title}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* CATÁLOGO */}
          {grouped.length === 0 ? (
            <div className="rounded-2xl glass py-16 text-center text-sm text-[rgba(20,35,61,0.4)]">
              No se encontraron accesos {query && <>para &ldquo;{query}&rdquo;</>}.
            </div>
          ) : (
            <div className="space-y-7">
              {grouped.map((group, idx) => (
                <section key={group.section} className="animate-fade">
                  <div className="mb-3.5 flex items-center gap-2.5">
                    <span className="serif font-semibold italic text-[#B58B35]" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h2 className="eyebrow text-[rgba(15,35,64,0.6)]">{group.section}</h2>
                    <span className="text-[11px] font-semibold text-[rgba(15,35,64,0.28)]">
                      {group.subgroups.reduce((n, s) => n + s.items.length, 0)}
                    </span>
                    <span className="h-px flex-1 bg-[rgba(15,35,64,0.09)]" />
                  </div>

                  {isFlujo(group.section) && (
                    <div className="mb-4">
                      <FlujoCalendar />
                    </div>
                  )}

                  {group.subgroups.map((sub, i) => (
                    <div key={i} className="mb-4">
                      {sub.subcategory && (
                        <p className="mb-2 ml-0.5 text-[11px] font-semibold" style={{ color: 'rgba(46,90,158,.8)' }}>{sub.subcategory}</p>
                      )}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                        {sub.items.map(item => (
                          <ItemCard key={item.id} item={item}
                            onToggleFav={toggleFav} onEdit={(it) => setModal(it)}
                            onOpen={trackOpen} onCopy={copyUrl}
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
          <MomentosWidget />
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
      className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
        active
          ? 'border-transparent text-[#1B1305]'
          : 'border-[rgba(15,35,64,0.11)] bg-white text-[rgba(20,35,61,0.66)] hover:border-[rgba(194,147,58,0.45)]'
      }`}
      style={active ? { background: 'linear-gradient(135deg,#E7C56B,#C2933A)', boxShadow: '0 6px 14px -8px rgba(194,147,58,.9)' } : undefined}>
      {children}
    </button>
  )
}
