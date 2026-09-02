'use client'

import { useEffect, useState } from 'react'
import type { NewsItem } from '@/app/api/news/route'
import { safeUrl } from '@/components/epicas/core'

const TOPIC_ICON: Record<string, string> = {
  'Videojuegos': '🎮',
  'Finanzas y economía': '📈',
  'Política': '🏛️',
  'Series y TV': '📺',
}

const fmtWhen = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

export default function NewsWidget() {
  const [items, setItems] = useState<NewsItem[] | null>(null)
  const [err, setErr] = useState('')
  const [topic, setTopic] = useState<string | null>(null)
  const [openIdx, setOpenIdx] = useState<number | null>(null)

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
  const openItem = openIdx != null ? shown[openIdx] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {topics.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button onClick={() => setTopic(null)} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: !topic ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: !topic ? '#10233F' : '#fff', color: !topic ? '#fff' : 'rgba(20,35,61,0.6)' }}>Todas</button>
          {topics.map(tp => {
            const on = topic === tp
            return <button key={tp} onClick={() => setTopic(on ? null : tp)} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{TOPIC_ICON[tp] || '📰'} {tp}</button>
          })}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
        {shown.map((it, i) => (
          <button key={i} onClick={() => setOpenIdx(i)}
            style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, padding: '13px 14px', borderRadius: 14, border: '1px solid rgba(15,35,64,0.10)', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#A87A2C', background: 'rgba(194,147,58,0.12)', borderRadius: 99, padding: '2px 8px' }}>{it.label}</span>
              {fmtWhen(it.pubDate) && <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.4)' }}>· {fmtWhen(it.pubDate)}</span>}
            </div>
            <div className="serif" style={{ fontSize: 17, lineHeight: 1.28, color: '#16365F', fontWeight: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{it.title}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.45)', fontWeight: 600, marginTop: 'auto' }}>{it.source}</div>
          </button>
        ))}
      </div>

      {openItem && (
        <div onClick={() => setOpenIdx(null)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px', overflow: 'auto' }}>
          <div onClick={ev => ev.stopPropagation()} role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
            <div style={{ height: 4, background: '#C2933A' }} />
            <div style={{ padding: '22px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#A87A2C', background: 'rgba(194,147,58,0.12)', borderRadius: 99, padding: '3px 10px' }}>{TOPIC_ICON[openItem.topic] || '📰'} {openItem.label}</span>
                  {fmtWhen(openItem.pubDate) && <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)' }}>{fmtWhen(openItem.pubDate)}</span>}
                </div>
                <button aria-label="Cerrar" onClick={() => setOpenIdx(null)} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
              </div>
              <div className="serif" style={{ fontSize: 24, lineHeight: 1.25, fontWeight: 600, color: '#10233F', marginBottom: 14 }}>{openItem.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: '#3a4a63', marginBottom: 16 }}>{openItem.summary}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{openItem.source}</span>
                <a href={safeUrl(openItem.url)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305' }}>Leer completa ↗</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
