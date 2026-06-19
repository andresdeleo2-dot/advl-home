'use client'

import { useState } from 'react'
import type { Item } from '@/lib/supabase'
import { normalizeImageUrl, getFaviconUrl, parseDescription } from '@/lib/utils'

const DOT: Record<string, string> = {
  blue:   '#2E5A9E',
  green:  '#3E8E8E',
  copper: '#C2933A',
  purple: '#7A6FB0',
  red:    '#B07A56',
  cyan:   '#5B6B86',
  orange: '#C2933A',
  sea:    '#3E8E8E',
  sage:   '#3E8E8E',
  rose:   '#B07A56',
}

function Initials({ title }: { title: string }) {
  const init = title.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return <span className="text-sm font-bold" style={{ color: '#16365F' }}>{init}</span>
}

export default function ItemCard({
  item, onToggleFav, onEdit, onOpen, onCopy,
  dragging, onDragStart, onDragEnd, onDropOn,
}: {
  item: Item
  onToggleFav?: (item: Item) => void
  onEdit?: (item: Item) => void
  onOpen?: (item: Item) => void
  onCopy?: (item: Item) => void
  dragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDropOn?: (target: Item) => void
}) {
  const [imgError, setImgError] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const img = normalizeImageUrl(item.image)
  const favicon = getFaviconUrl(item.url)
  const dot = DOT[item.accent] ?? DOT.blue
  const desc = parseDescription(item.description)

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
      onDragEnd={() => { setDragOver(false); onDragEnd?.() }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDropOn?.(item) }}
      className={`advl-card group relative flex flex-col rounded-[13px] glass glass-hover p-3 transition-all ${dragging ? 'opacity-40' : ''} ${dragOver ? 'ring-2 ring-[#C2933A]/60' : ''}`}>

      {/* Action cluster — top right */}
      <div className="absolute right-2 top-2 flex items-center gap-1">
        {/* Copy — reveals on hover */}
        <button onClick={(e) => { e.preventDefault(); onCopy?.(item) }} title="Copiar URL"
          className="advl-act flex h-6 w-6 items-center justify-center rounded-[7px] bg-[rgba(15,35,64,0.06)] text-[rgba(20,35,61,0.55)] transition hover:bg-[rgba(15,35,64,0.13)] hover:text-[#16365F]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        {/* Edit — reveals on hover */}
        <button onClick={(e) => { e.preventDefault(); onEdit?.(item) }} title="Editar"
          className="advl-act flex h-6 w-6 items-center justify-center rounded-[7px] bg-[rgba(194,147,58,0.14)] text-[#A87A2C] transition hover:bg-[rgba(194,147,58,0.24)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        {/* Fav — always visible */}
        <button onClick={(e) => { e.preventDefault(); onToggleFav?.(item) }}
          title={item.featured ? 'Quitar de favoritos' : 'Marcar favorito'}
          className="flex h-6 w-6 items-center justify-center rounded-[7px]">
          <svg width="14" height="14" viewBox="0 0 24 24"
            fill={item.featured ? '#C2933A' : 'none'}
            stroke={item.featured ? '#C2933A' : 'rgba(20,35,61,0.26)'}
            strokeWidth="1.7">
            <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"/>
          </svg>
        </button>
      </div>

      <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen?.(item)} draggable={false}
        className="flex flex-1 flex-col gap-2 no-underline">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[rgba(15,35,64,0.07)] bg-[#F7F5EF]">
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
          <div className="min-w-0 pr-6">
            <p className="clamp-1 font-semibold text-[#10233F] transition-colors group-hover:text-[#C2933A]"
              style={{ fontSize: 13.5, lineHeight: 1.2 }}>{item.title}</p>
            <span className="mt-1 flex items-center gap-1.5 text-[10.5px] text-[rgba(20,35,61,0.48)]">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: dot }} />
              {item.subcategory || item.section}
            </span>
          </div>
        </div>
      </a>

      {desc.text && (
        <p className="clamp-2 mt-2.5 text-[11px] leading-snug text-[rgba(20,35,61,0.52)]">{desc.text}</p>
      )}

      {desc.links.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {desc.links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-[9px] border border-[rgba(15,35,64,0.10)] bg-[#FBFAF6] px-2.5 py-1.5 no-underline transition hover:border-[rgba(194,147,58,0.55)] hover:bg-white">
              <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] bg-[rgba(194,147,58,0.16)] text-[#A87A2C]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#16365F]">{l.label}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-[rgba(20,35,61,0.38)]"><path d="M7 17 17 7M7 7h10v10"/></svg>
            </a>
          ))}
        </div>
      )}

      {(item.url2 || item.url3) && (
        <div className="mt-2.5 flex gap-1.5 border-t border-[rgba(15,35,64,0.07)] pt-2.5">
          {item.url2 && (
            <a href={item.url2} target="_blank" rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-[rgba(62,142,142,0.10)] py-1.5 text-center text-[10px] font-semibold text-[#2E6E6E] no-underline hover:bg-[rgba(62,142,142,0.18)]">
              Excel
            </a>
          )}
          {item.url3 && (
            <a href={item.url3} target="_blank" rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-[rgba(22,54,95,0.08)] py-1.5 text-center text-[10px] font-semibold text-[#16365F] no-underline hover:bg-[rgba(22,54,95,0.14)]">
              Código
            </a>
          )}
        </div>
      )}
    </div>
  )
}
