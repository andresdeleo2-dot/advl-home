'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import type { NewsItem } from '@/app/api/news/route'
import type { NewsTrack } from '@/lib/newsTracks'
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
  const [settingsOpen, setSettingsOpen] = useState(false)

  const load = () => {
    setItems(null); setErr('')
    fetch('/api/news', { signal: AbortSignal.timeout(30000) }).then(r => r.json()).then(j => {
      if (j.error) { setErr(j.error); return }
      setItems(j.items || [])
    }).catch(() => setErr('No se pudo cargar (tardó demasiado o falló la conexión)'))
  }
  useEffect(load, [])

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button onClick={() => setSettingsOpen(true)} title="Agregar o quitar temas" style={{ marginLeft: 'auto', cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 99, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, color: 'rgba(20,35,61,0.6)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>⚙️ Temas</button>
    </div>
  )

  if (err) return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{header}<div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)' }}>No se pudieron cargar las noticias{err ? ` (${err})` : ''}.</div>{settingsOpen && <NewsSettings onClose={() => setSettingsOpen(false)} onSaved={load} />}</div>
  if (items === null) return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{header}<div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Cargando…</div>{settingsOpen && <NewsSettings onClose={() => setSettingsOpen(false)} onSaved={load} />}</div>

  const topics = [...new Set(items.map(x => x.topic))]
  const shown = topic ? items.filter(x => x.topic === topic) : items
  const openItem = openIdx != null ? shown[openIdx] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setTopic(null)} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: !topic ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: !topic ? '#10233F' : '#fff', color: !topic ? '#fff' : 'rgba(20,35,61,0.6)' }}>Todas</button>
        {topics.map(tp => {
          const on = topic === tp
          return <button key={tp} onClick={() => setTopic(on ? null : tp)} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{TOPIC_ICON[tp] || '📰'} {tp}</button>
        })}
        <button onClick={() => setSettingsOpen(true)} title="Agregar o quitar temas" style={{ marginLeft: 'auto', cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 99, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, color: 'rgba(20,35,61,0.6)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>⚙️ Temas</button>
      </div>

      {items.length === 0
        ? <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Sin noticias por ahora.</div>
        : (
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
        )}

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

      {settingsOpen && <NewsSettings onClose={() => setSettingsOpen(false)} onSaved={load} />}
    </div>
  )
}

/** Popup para agregar/quitar temas (tracks). Guarda en Supabase (news_config) — así sobrevive sin
 *  tocar código. Cada tema es o una BÚSQUEDA (Google News, para algo específico: un juego, una
 *  empresa, un país…) o un LINK RSS directo de un medio (para algo más general). */
function NewsSettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [tracks, setTracks] = useState<NewsTrack[] | null>(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [topicIn, setTopicIn] = useState('')
  const [labelIn, setLabelIn] = useState('')
  const [kind, setKind] = useState<'query' | 'feed'>('query')
  const [valueIn, setValueIn] = useState('')

  useEffect(() => {
    fetch('/api/news/config').then(r => r.json()).then(j => setTracks(j.tracks || [])).catch(() => setErr('No se pudieron cargar los temas'))
  }, [])

  const save = async (next: NewsTrack[]) => {
    setSaving(true); setErr('')
    try {
      const r = await fetch('/api/news/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tracks: next }) })
      const j = await r.json()
      if (!j.ok) { setErr(j.error || 'No se pudo guardar'); setSaving(false); return }
      setTracks(next); setSaving(false); onSaved()
    } catch { setErr('No se pudo guardar'); setSaving(false) }
  }

  const remove = (i: number) => { if (!tracks) return; save(tracks.filter((_, j) => j !== i)) }
  const add = () => {
    const topic = topicIn.trim(), label = labelIn.trim(), value = valueIn.trim()
    if (!topic || !label || !value || !tracks) return
    const t: NewsTrack = kind === 'query' ? { topic, label, query: value } : { topic, label, feedUrl: value }
    save([...tracks, t]).then(() => { setTopicIn(''); setLabelIn(''); setValueIn('') })
  }

  const topics = tracks ? [...new Set(tracks.map(t => t.topic))] : []
  const nf: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '8px 10px', fontSize: 13, color: '#14233D', outline: 'none' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
      <div onClick={ev => ev.stopPropagation()} role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
        <div style={{ height: 4, background: '#C2933A' }} />
        <div style={{ padding: '20px 22px', maxHeight: '80vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="serif" style={{ fontSize: 19, fontWeight: 600, color: '#10233F' }}>Temas de noticias</span>
            <button aria-label="Cerrar" onClick={onClose} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 30, width: 30, color: 'rgba(20,35,61,0.55)', fontSize: 15 }}>✕</button>
          </div>

          {tracks === null ? <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Cargando…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
              {topics.map(tp => (
                <div key={tp}>
                  <div style={{ font: '700 10px/1 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 6 }}>{TOPIC_ICON[tp] || '📰'} {tp}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {tracks.map((t, i) => t.topic === tp && (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, background: 'rgba(15,35,64,0.03)' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#16365F', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.4)', flexShrink: 0 }}>{t.query ? '🔍 búsqueda' : '📡 rss'}</span>
                        <button aria-label="Quitar" title="Quitar" onClick={() => remove(i)} disabled={saving} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(176,82,46,0.75)', fontSize: 13 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {tracks.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Sin temas — agrega uno abajo.</div>}
            </div>
          )}

          <div style={{ borderTop: '1px solid rgba(15,35,64,0.08)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ font: '700 10px/1 var(--font-ui, system-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>Agregar tema</div>
            <input list="news-topics" value={topicIn} onChange={e => setTopicIn(e.target.value)} placeholder="Categoría (ej. Videojuegos, o una nueva)" style={nf} />
            <datalist id="news-topics">{topics.map(tp => <option key={tp} value={tp} />)}</datalist>
            <input value={labelIn} onChange={e => setLabelIn(e.target.value)} placeholder="Nombre del tema (ej. Zelda 3)" style={nf} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setKind('query')} style={{ flex: 1, cursor: 'pointer', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 700, border: kind === 'query' ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: kind === 'query' ? '#10233F' : '#fff', color: kind === 'query' ? '#fff' : 'rgba(20,35,61,0.6)' }}>🔍 Buscar (recomendado)</button>
              <button onClick={() => setKind('feed')} style={{ flex: 1, cursor: 'pointer', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 700, border: kind === 'feed' ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: kind === 'feed' ? '#10233F' : '#fff', color: kind === 'feed' ? '#fff' : 'rgba(20,35,61,0.6)' }}>📡 Link RSS</button>
            </div>
            <input value={valueIn} onChange={e => setValueIn(e.target.value)} placeholder={kind === 'query' ? 'Qué buscar (ej. Nintendo Switch 3)' : 'URL del feed RSS (https://…)'} style={{ ...nf, fontFamily: kind === 'feed' ? 'ui-monospace,SFMono-Regular,Menlo,monospace' : 'inherit' }} />
            {err && <div style={{ fontSize: 12, color: '#B0522E' }}>{err}</div>}
            <button onClick={add} disabled={saving || !topicIn.trim() || !labelIn.trim() || !valueIn.trim()} style={{ cursor: saving ? 'default' : 'pointer', borderRadius: 10, padding: 11, fontSize: 13.5, fontWeight: 700, border: 'none', background: (saving || !topicIn.trim() || !labelIn.trim() || !valueIn.trim()) ? 'rgba(15,35,64,0.08)' : 'linear-gradient(135deg,#E7C56B,#C2933A)', color: (saving || !topicIn.trim() || !labelIn.trim() || !valueIn.trim()) ? 'rgba(20,35,61,0.4)' : '#1B1305' }}>{saving ? 'Guardando…' : '+ Agregar tema'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
