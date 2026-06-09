'use client'

import { useState } from 'react'
import type { Item } from '@/lib/supabase'
import { normalizeImageUrl, getFaviconUrl, parseDescription } from '@/lib/utils'

const ACCENT_DOT: Record<string, string> = {
  copper: 'bg-amber-500', blue: 'bg-blue-500', green: 'bg-emerald-500',
  purple: 'bg-purple-500', red: 'bg-red-500', cyan: 'bg-cyan-500', orange: 'bg-orange-500',
  sea: 'bg-cyan-500', sage: 'bg-teal-500', rose: 'bg-rose-400',
}

function Initials({ title }: { title: string }) {
  const init = title.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return <span className="text-sm font-bold text-[#16365f]/70">{init}</span>
}

export default function ItemCard({
  item, editMode, onToggleFav, onEdit,
}: {
  item: Item
  editMode?: boolean
  onToggleFav?: (item: Item) => void
  onEdit?: (item: Item) => void
}) {
  const [imgError, setImgError] = useState(false)
  const img = normalizeImageUrl(item.image)
  const favicon = getFaviconUrl(item.url)
  const dot = ACCENT_DOT[item.accent] ?? ACCENT_DOT.blue
  const descSegments = parseDescription(item.description)

  return (
    <div className="group relative flex flex-col rounded-2xl glass glass-hover p-3 transition-all duration-200 hover:-translate-y-0.5">
      {/* Controls */}
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {editMode && (
          <button onClick={(e) => { e.preventDefault(); onEdit?.(item) }} title="Editar"
            className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#16365f]/8 text-[#16365f]/70 hover:bg-[#16365f]/16">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
        )}
        <button onClick={(e) => { e.preventDefault(); onToggleFav?.(item) }}
          title={item.featured ? 'Quitar de favoritos' : 'Marcar favorito'}
          className={`flex h-6 w-6 items-center justify-center rounded-lg ${item.featured ? 'text-amber-500 opacity-100' : 'bg-[#16365f]/8 text-[#16365f]/45 hover:bg-[#16365f]/16'}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={item.featured ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"/></svg>
        </button>
      </div>

      {item.featured && (
        <span className="absolute left-2 top-2 text-amber-400">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"/></svg>
        </span>
      )}

      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f1f6fc] ring-1 ring-[#16365f]/8">
            {img && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={item.title} className="h-9 w-9 object-cover" referrerPolicy="no-referrer" onError={() => setImgError(true)} />
            ) : favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={favicon} alt="" className="h-5 w-5" />
            ) : (
              <Initials title={item.title} />
            )}
          </div>
          <div className="min-w-0">
            <p className="clamp-1 text-sm font-semibold text-[#0f2340] group-hover:text-[#2d6cdf]">{item.title}</p>
            <span className="flex items-center gap-1 text-[10px] text-[#16365f]/50">
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              {item.subcategory || item.section}
            </span>
          </div>
        </div>

        {descSegments.length > 0 && (
          <p className="clamp-2 text-[11px] leading-snug text-[#16365f]/55">
            {descSegments.map((s, i) =>
              s.type === 'link'
                ? <span key={i} className="text-[#2d6cdf]">{s.content}</span>
                : <span key={i}>{s.content}</span>
            )}
          </p>
        )}
      </a>

      {(item.url2 || item.url3) && (
        <div className="mt-2.5 flex gap-1.5 border-t border-[#16365f]/8 pt-2">
          {item.url2 && (
            <a href={item.url2} target="_blank" rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-emerald-500/12 py-1 text-center text-[10px] font-semibold text-emerald-700 hover:bg-emerald-500/20">
              Excel
            </a>
          )}
          {item.url3 && (
            <a href={item.url3} target="_blank" rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-blue-500/12 py-1 text-center text-[10px] font-semibold text-blue-700 hover:bg-blue-500/20">
              Código
            </a>
          )}
        </div>
      )}
    </div>
  )
}
