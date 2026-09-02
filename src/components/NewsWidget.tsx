'use client'

import { useEffect, useState } from 'react'
import type { NewsItem } from '@/app/api/news/route'
import { safeUrl } from '@/components/epicas/core'

const TOPIC_ICON: Record<string, string> = {
  'Videojuegos': '🎮',
  'Finanzas y economía': '📈',
  'Política (México y mundo)': '🏛️',
  'Series y TV': '📺',
}

export default function NewsWidget() {
  const [items, setItems] = useState<NewsItem[] | null>(null)
  const [err, setErr] = useState('')
  const [topic, setTopic] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/news').then(r => r.json()).then(j => {
      if (j.error) { setErr(j.error); return }
      setItems(j.items || [])
    }).catch(() => setErr('No se pudo cargar'))
  }, [])

  if (err) return <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)' }}>No se pudieron cargar las noticias{err ? ` (${err})` : ''}.</div>
  if (items === null) return <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Cargando…</div>
  if (items.length === 0) return <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Sin noticias por ahora.</div>

  const topics = [...new Set(items.map(x => x.topic))]
  const shown = topic ? items.filter(x => x.topic === topic) : items

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {topics.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button onClick={() => setTopic(null)} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700, border: !topic ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: !topic ? '#10233F' : '#fff', color: !topic ? '#fff' : 'rgba(20,35,61,0.6)' }}>Todas</button>
          {topics.map(tp => {
            const on = topic === tp
            return <button key={tp} onClick={() => setTopic(on ? null : tp)} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{TOPIC_ICON[tp] || '📰'} {tp}</button>
          })}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((it, i) => (
          <a key={i} href={safeUrl(it.url)} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 11px', borderRadius: 11, border: '1px solid rgba(15,35,64,0.09)', background: '#fff', textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 11, flexShrink: 0 }}>{TOPIC_ICON[it.topic] || '📰'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#16365F', lineHeight: 1.3 }}>{it.title}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.6)', lineHeight: 1.4 }}>{it.summary}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.4)', fontWeight: 600 }}>{it.source}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
