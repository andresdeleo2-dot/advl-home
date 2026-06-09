'use client'

import Image from 'next/image'
import type { Item } from '@/lib/supabase'

const ACCENT_COLORS: Record<string, string> = {
  copper:  'from-amber-700/20 border-amber-700/30 hover:border-amber-500/60',
  blue:    'from-blue-700/20 border-blue-700/30 hover:border-blue-500/60',
  green:   'from-emerald-700/20 border-emerald-700/30 hover:border-emerald-500/60',
  purple:  'from-purple-700/20 border-purple-700/30 hover:border-purple-500/60',
  red:     'from-red-700/20 border-red-700/30 hover:border-red-500/60',
  cyan:    'from-cyan-700/20 border-cyan-700/30 hover:border-cyan-500/60',
  orange:  'from-orange-700/20 border-orange-700/30 hover:border-orange-500/60',
  default: 'from-white/5 border-white/10 hover:border-white/30',
}

function getFaviconUrl(url: string) {
  try {
    const { hostname } = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
  } catch {
    return null
  }
}

export default function ItemCard({ item, featured }: { item: Item; featured?: boolean }) {
  const accent = ACCENT_COLORS[item.accent] ?? ACCENT_COLORS.default
  const favicon = getFaviconUrl(item.url)

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.description ?? item.title}
      className={`
        group relative flex flex-col gap-2 rounded-xl border bg-gradient-to-b p-3
        transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg
        ${accent}
        ${featured ? 'min-h-[90px]' : 'min-h-[76px]'}
      `}
    >
      {/* Badge */}
      {item.badge && (
        <span className="absolute right-2 top-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/60">
          {item.badge}
        </span>
      )}

      {/* Icon */}
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.title}
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover"
            unoptimized
          />
        ) : favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={favicon}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 rounded"
          />
        ) : (
          <span className="text-sm font-bold text-white/40">
            {item.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-xs font-medium leading-tight text-white/80 group-hover:text-white line-clamp-2">
        {item.title}
      </p>
    </a>
  )
}
