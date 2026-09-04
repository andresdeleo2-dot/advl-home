'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import SiteHeader from '@/components/SiteHeader'
import SectionNav from '@/components/SectionNav'
import type { Idea } from '@/lib/ideas'
import type { Epica } from '@/lib/supabase'
import { uid, todayISO } from '@/components/epicas/core'

const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 14, padding: '14px 16px' }
const sel: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.16)', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, color: '#16365F', background: '#fff', outline: 'none' }

export default function IdeasClient() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [epicas, setEpicas] = useState<Epica[] | null>(null)
  const [convertId, setConvertId] = useState<string | null>(null)
  const [convEpica, setConvEpica] = useState('')
  const [convFeature, setConvFeature] = useState('')
  const [showResolved, setShowResolved] = useState(false)

  useEffect(() => {
    fetch('/api/ideas').then(r => r.json()).then(j => {
      if (j.needsMigration) { setNeedsMigration(true); setIdeas([]); return }
      if (!j.ok) { setErr(j.error || 'No se pudieron cargar las ideas'); return }
      setIdeas(j.data || [])
    }).catch(() => setErr('No se pudieron cargar las ideas'))
    fetch('/api/epicas').then(r => r.json()).then(j => { if (j.ok && Array.isArray(j.data)) setEpicas(j.data) }).catch(() => {})
  }, [])

  const add = async () => {
    const texto = draft.trim()
    if (!texto || saving) return
    setSaving(true)
    const r = await fetch('/api/ideas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto }) }).then(x => x.json()).catch(() => null)
    setSaving(false)
    if (r?.needsMigration) { setNeedsMigration(true); return }
    if (r?.ok) { setIdeas(prev => [r.data, ...(prev || [])]); setDraft('') }
    else setErr(r?.error || 'No se pudo guardar la idea')
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/ideas/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => null)
    if (r?.ok) setIdeas(prev => (prev || []).map(x => (x.id === id ? r.data : x)))
    return r
  }
  const remove = async (id: string) => {
    setIdeas(prev => (prev || []).filter(x => x.id !== id))
    await fetch(`/api/ideas/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  const convert = async () => {
    const idea = (ideas || []).find(x => x.id === convertId)
    if (!idea || !convEpica) return
    const taskId = uid()
    const r = await fetch('/api/tareas/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ epicaId: convEpica, create: [{ id: taskId, t: idea.texto, status: 'Por hacer', due: '', note: '', links: [], createdAt: todayISO(), ...(convFeature ? { featureId: convFeature } : {}) }] }),
    }).then(x => x.json()).catch(() => null)
    if (!r?.ok) { setErr(r?.error || 'No se pudo crear la tarea'); return }
    await patch(idea.id, { tareaId: taskId, epicaId: convEpica })
    setConvertId(null); setConvEpica(''); setConvFeature('')
  }

  const active = (ideas || []).filter(i => !i.tareaId && !i.descartada)
  const resolved = (ideas || []).filter(i => i.tareaId || i.descartada)
  const activeEpicas = (epicas || []).filter(e => !e.archived)

  const row = (idea: Idea) => {
    const converted = !!idea.tareaId
    const discarded = idea.descartada && !converted
    const isConverting = convertId === idea.id
    const epicaFeat = activeEpicas.find(e => e.id === convEpica)?.features || []
    return (
      <div key={idea.id} style={{ ...card, opacity: discarded ? 0.6 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 14.5, lineHeight: 1.5, color: '#16365F', whiteSpace: 'pre-wrap', textDecoration: discarded ? 'line-through' : 'none' }}>{idea.texto}</span>
          <span style={{ flexShrink: 0, fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>{fmtWhen(idea.creada)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
          {converted ? (
            <a href={`/epicas?e=${idea.epicaId}&t=${idea.tareaId}`} style={{ fontSize: 11.5, fontWeight: 700, color: '#2E6E6E', textDecoration: 'none' }}>✓ Convertida en tarea · abrir →</a>
          ) : discarded ? (
            <button onClick={() => patch(idea.id, { descartada: false })} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.6)', borderRadius: 99, padding: '5px 11px', fontSize: 11.5, fontWeight: 700 }}>↺ Deshacer</button>
          ) : (
            <>
              <button onClick={() => { setConvertId(isConverting ? null : idea.id); setConvEpica(''); setConvFeature('') }} style={{ cursor: 'pointer', border: 'none', background: isConverting ? '#10233F' : 'linear-gradient(135deg,#E7C56B,#C2933A)', color: isConverting ? '#fff' : '#1B1305', borderRadius: 99, padding: '6px 13px', fontSize: 11.5, fontWeight: 700 }}>{isConverting ? '✕ Cancelar' : '→ Convertir en tarea'}</button>
              <button onClick={() => patch(idea.id, { descartada: true })} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.55)', borderRadius: 99, padding: '5px 11px', fontSize: 11.5, fontWeight: 700 }}>No es viable</button>
            </>
          )}
          <button onClick={() => remove(idea.id)} title="Eliminar (no se puede deshacer)" style={{ marginLeft: 'auto', cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(176,82,46,0.6)', fontSize: 13 }}>✕</button>
        </div>
        {isConverting && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(15,35,64,0.08)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {epicas === null ? <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.45)' }}>Cargando épicas…</span> : (
              <>
                <select value={convEpica} onChange={e => { setConvEpica(e.target.value); setConvFeature('') }} style={sel}>
                  <option value="">Elige una épica…</option>
                  {activeEpicas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                {epicaFeat.length > 0 && (
                  <select value={convFeature} onChange={e => setConvFeature(e.target.value)} style={sel}>
                    <option value="">Sin feature</option>
                    {epicaFeat.map(f => <option key={f.id} value={f.id}>{f.t}</option>)}
                  </select>
                )}
                <button disabled={!convEpica} onClick={convert} style={{ cursor: convEpica ? 'pointer' : 'default', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, background: convEpica ? '#10233F' : 'rgba(15,35,64,0.08)', color: convEpica ? '#fff' : 'rgba(20,35,61,0.4)' }}>✓ Crear tarea</button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3efe6', color: '#10233F' }}>
      <SiteHeader title="Ideas" subtitle="Captura rápida · ADVL" backHref="/" backLabel="← Accesos" extra={<SectionNav current="ideas" />} />
      <main style={{ maxWidth: 720, margin: '18px auto 60px', padding: '0 20px' }}>
        <div style={{ marginBottom: 18 }}>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: '#10233F' }}>💡 Ideas</div>
          <div style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.55)', marginTop: 4 }}>Escribe sin pensarlo mucho — Enter para guardar cada una. Luego, con calma, revisas: la conviertes en tarea o dices que no es viable.</div>
        </div>

        {needsMigration && (
          <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: 'rgba(176,82,46,0.08)', border: '1px solid rgba(176,82,46,0.3)', fontSize: 12.5, color: '#B0522E' }}>
            Corre <code>sql/ideas.sql</code> en Supabase para activar esta sección.
          </div>
        )}
        {err && (
          <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: 'rgba(176,82,46,0.08)', border: '1px solid rgba(176,82,46,0.3)', fontSize: 12.5, color: '#B0522E' }}>{err}</div>
        )}

        <div style={{ ...card, marginBottom: 22, padding: '12px 16px' }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }}
            placeholder="Escribe una idea y Enter… (Shift+Enter para otra línea en la misma idea)"
            rows={2}
            disabled={needsMigration}
            style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontSize: 15, lineHeight: 1.5, fontFamily: 'inherit', color: '#10233F' }}
          />
        </div>

        {ideas === null ? (
          <div style={{ fontSize: 13, color: 'rgba(20,35,61,0.45)' }}>Cargando…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {active.length === 0 && (
              <div style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.45)', padding: '10px 2px' }}>Sin ideas pendientes de revisar. Escribe una arriba.</div>
            )}
            {active.map(row)}
          </div>
        )}

        {resolved.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <button onClick={() => setShowResolved(v => !v)} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.5)', fontSize: 12, fontWeight: 700 }}>
              {showResolved ? '▾' : '▸'} {resolved.length} ya revisada{resolved.length === 1 ? '' : 's'}
            </button>
            {showResolved && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {resolved.map(row)}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
