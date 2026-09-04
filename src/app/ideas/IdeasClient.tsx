'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import SiteHeader from '@/components/SiteHeader'
import SectionNav from '@/components/SectionNav'
import TaskLinks from '@/components/TaskLinks'
import type { Idea } from '@/lib/ideas'
import type { Epica } from '@/lib/supabase'
import { uid, todayISO, hexA } from '@/components/epicas/core'

const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
const fmtWhenLong = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

const card: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 14, padding: '14px 16px' }
const sel: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.16)', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, color: '#16365F', background: '#fff', outline: 'none' }
const eb: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }

type PatchFn = (id: string, body: Record<string, unknown>) => Promise<{ ok?: boolean; error?: string } | null>

export default function IdeasClient() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [richReady, setRichReady] = useState(true)   // optimista: si falta, el server avisa (evita parpadeo)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [epicas, setEpicas] = useState<Epica[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filterEpica, setFilterEpica] = useState('todas')
  const [filterFeature, setFilterFeature] = useState('todas')
  const [sortAsc, setSortAsc] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  useEffect(() => {
    fetch('/api/ideas').then(r => r.json()).then(j => {
      if (j.needsMigration) { setNeedsMigration(true); setIdeas([]); return }
      if (!j.ok) { setErr(j.error || 'No se pudieron cargar las ideas'); return }
      setIdeas(j.data || []); setRichReady(!!j.richReady)
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

  const patch: PatchFn = async (id, body) => {
    const r = await fetch(`/api/ideas/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(() => null)
    if (r?.ok) setIdeas(prev => (prev || []).map(x => (x.id === id ? r.data : x)))
    else if (r?.error) setErr(r.error)
    return r
  }
  const remove = async (id: string) => {
    setIdeas(prev => (prev || []).filter(x => x.id !== id))
    await fetch(`/api/ideas/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  const activeEpicas = (epicas || []).filter(e => !e.archived)
  const usedEpicaIds = new Set((ideas || []).map(i => i.epicaId).filter(Boolean) as string[])
  const filterEpicaOpts = activeEpicas.filter(e => usedEpicaIds.has(e.id))
  const filterFeats = activeEpicas.find(e => e.id === filterEpica)?.features || []

  const passFilter = (i: Idea) =>
    (filterEpica === 'todas' || (filterEpica === 'sin' ? !i.epicaId : i.epicaId === filterEpica)) &&
    (filterEpica === 'todas' || filterEpica === 'sin' || filterFeature === 'todas' || (filterFeature === 'sin' ? !i.featureId : i.featureId === filterFeature))
  const sorted = [...(ideas || [])].filter(passFilter).sort((a, b) => sortAsc ? a.creada.localeCompare(b.creada) : b.creada.localeCompare(a.creada))
  const active = sorted.filter(i => !i.tareaId && !i.descartada)
  const resolved = sorted.filter(i => i.tareaId || i.descartada)
  const openIdea = (ideas || []).find(i => i.id === openId) || null

  const row = (idea: Idea) => {
    const converted = !!idea.tareaId
    const discarded = idea.descartada && !converted
    const tagEpica = activeEpicas.find(e => e.id === idea.epicaId)
    const tagFeat = tagEpica?.features?.find(f => f.id === idea.featureId)
    return (
      <div key={idea.id} onClick={() => setOpenId(idea.id)} style={{ ...card, opacity: discarded ? 0.6 : 1, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 14.5, lineHeight: 1.5, color: '#16365F', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', textDecoration: discarded ? 'line-through' : 'none' }}>{idea.texto}</span>
          <span style={{ flexShrink: 0, fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>{fmtWhen(idea.creada)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
          {tagEpica && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: tagEpica.color, background: hexA(tagEpica.color, 0.12), borderRadius: 99, padding: '3px 9px' }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: tagEpica.color, flexShrink: 0 }} />{tagEpica.name}{tagFeat ? ` · ${tagFeat.t}` : ''}
            </span>
          )}
          {idea.links.length > 0 && <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)' }}>🔗 {idea.links.length}</span>}
          {idea.comentarios.length > 0 && <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)' }}>💬 {idea.comentarios.length}</span>}
          <span style={{ flex: 1 }} />
          {converted ? (
            <a onClick={e => e.stopPropagation()} href={`/epicas?e=${idea.epicaId}&t=${idea.tareaId}`} style={{ fontSize: 11.5, fontWeight: 700, color: '#2E6E6E', textDecoration: 'none' }}>✓ Tarea →</a>
          ) : discarded ? (
            <button onClick={e => { e.stopPropagation(); patch(idea.id, { descartada: false }) }} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.6)', borderRadius: 99, padding: '5px 11px', fontSize: 11.5, fontWeight: 700 }}>↺ Deshacer</button>
          ) : (
            <button onClick={e => { e.stopPropagation(); patch(idea.id, { descartada: true }) }} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.55)', borderRadius: 99, padding: '5px 11px', fontSize: 11.5, fontWeight: 700 }}>No es viable</button>
          )}
          <button onClick={e => { e.stopPropagation(); remove(idea.id) }} title="Eliminar (no se puede deshacer)" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(176,82,46,0.6)', fontSize: 13 }}>✕</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3efe6', color: '#10233F' }}>
      <SiteHeader title="Ideas" subtitle="Captura rápida · ADVL" backHref="/" backLabel="← Accesos" extra={<SectionNav current="ideas" />} />
      <main style={{ maxWidth: 760, margin: '18px auto 60px', padding: '0 20px' }}>
        <div style={{ marginBottom: 18 }}>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: '#10233F' }}>💡 Ideas</div>
          <div style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.55)', marginTop: 4 }}>Escribe sin pensarlo mucho — Enter para guardar cada una. Ábrela para ponerle épica, feature, links o comentarios; luego la conviertes en tarea o dices que no es viable.</div>
        </div>

        {needsMigration && (
          <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: 'rgba(176,82,46,0.08)', border: '1px solid rgba(176,82,46,0.3)', fontSize: 12.5, color: '#B0522E' }}>
            Corre <code>sql/ideas.sql</code> en Supabase para activar esta sección.
          </div>
        )}
        {!needsMigration && !richReady && (
          <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: 'rgba(176,82,46,0.08)', border: '1px solid rgba(176,82,46,0.3)', fontSize: 12.5, color: '#B0522E' }}>
            Corre <code>sql/ideas-02-links-comentarios.sql</code> en Supabase para poder ponerle feature, links y comentarios a una idea.
          </div>
        )}
        {err && (
          <div onClick={() => setErr('')} style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: 'rgba(176,82,46,0.08)', border: '1px solid rgba(176,82,46,0.3)', fontSize: 12.5, color: '#B0522E', cursor: 'pointer' }}>{err} · toca para cerrar</div>
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

        {/* Filtros: sólo aparecen si ya hay ideas etiquetadas con alguna épica */}
        {filterEpicaOpts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={eb}>Filtrar</span>
            <button onClick={() => { setFilterEpica('todas'); setFilterFeature('todas') }} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, border: filterEpica === 'todas' ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: filterEpica === 'todas' ? '#10233F' : '#fff', color: filterEpica === 'todas' ? '#fff' : 'rgba(20,35,61,0.55)' }}>Todas</button>
            {filterEpicaOpts.map(e => {
              const on = filterEpica === e.id
              return (
                <button key={e.id} onClick={() => { setFilterEpica(on ? 'todas' : e.id); setFilterFeature('todas') }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, border: on ? `1.5px solid ${e.color}` : '1px solid rgba(15,35,64,0.12)', background: on ? hexA(e.color, 0.12) : '#fff', color: on ? e.color : 'rgba(20,35,61,0.6)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color, flexShrink: 0 }} />{e.name}
                </button>
              )
            })}
            <button onClick={() => { setFilterEpica(filterEpica === 'sin' ? 'todas' : 'sin'); setFilterFeature('todas') }} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, border: filterEpica === 'sin' ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: filterEpica === 'sin' ? '#10233F' : '#fff', color: filterEpica === 'sin' ? '#fff' : 'rgba(20,35,61,0.55)' }}>Sin épica</button>
            {filterFeats.length > 0 && (
              <>
                <span style={{ width: 1, height: 16, background: 'rgba(15,35,64,0.12)' }} />
                <button onClick={() => setFilterFeature('todas')} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, border: filterFeature === 'todas' ? '1px solid #C2933A' : '1px solid rgba(15,35,64,0.12)', background: filterFeature === 'todas' ? 'rgba(194,147,58,0.14)' : '#fff', color: filterFeature === 'todas' ? '#A87A2C' : 'rgba(20,35,61,0.55)' }}>Todos los features</button>
                {filterFeats.map(f => {
                  const on = filterFeature === f.id
                  return <button key={f.id} onClick={() => setFilterFeature(on ? 'todas' : f.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, border: on ? `1.5px solid ${f.color || '#5B6B86'}` : '1px solid rgba(15,35,64,0.12)', background: on ? hexA(f.color || '#5B6B86', 0.12) : '#fff', color: on ? (f.color || '#5B6B86') : 'rgba(20,35,61,0.6)' }}><span style={{ width: 6, height: 6, borderRadius: 99, background: f.color || '#5B6B86', flexShrink: 0 }} />{f.t}</button>
                })}
              </>
            )}
            <span style={{ flex: 1 }} />
            <button onClick={() => setSortAsc(v => !v)} title="Cambiar orden" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.6)', borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700 }}>{sortAsc ? '↑ Antiguas primero' : '↓ Recientes primero'}</button>
          </div>
        )}

        {ideas === null ? (
          <div style={{ fontSize: 13, color: 'rgba(20,35,61,0.45)' }}>Cargando…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {active.length === 0 && (
              <div style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.45)', padding: '10px 2px' }}>{(ideas || []).length === 0 ? 'Sin ideas todavía. Escribe una arriba.' : 'Nada con ese filtro.'}</div>
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

      {openIdea && (
        <IdeaPopup idea={openIdea} epicas={activeEpicas} richReady={richReady} onPatch={patch} onDelete={id => { remove(id); setOpenId(null) }} onClose={() => setOpenId(null)} />
      )}
    </div>
  )
}

function IdeaPopup({ idea, epicas, richReady, onPatch, onDelete, onClose }: {
  idea: Idea
  epicas: Epica[]
  richReady: boolean
  onPatch: PatchFn
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [commentDraft, setCommentDraft] = useState('')
  const [converting, setConverting] = useState(false)
  const converted = !!idea.tareaId
  const tagEpica = epicas.find(e => e.id === idea.epicaId)
  const feats = tagEpica?.features || []

  const convert = async () => {
    if (!idea.epicaId || converting) return
    setConverting(true)
    const taskId = uid()
    const r = await fetch('/api/tareas/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        epicaId: idea.epicaId,
        create: [{
          id: taskId, t: idea.texto, status: 'Por hacer', due: '', note: '', links: idea.links, createdAt: todayISO(),
          ...(idea.featureId ? { featureId: idea.featureId } : {}),
          ...(idea.comentarios.length ? { comentarios: idea.comentarios } : {}),
        }],
      }),
    }).then(x => x.json()).catch(() => null)
    setConverting(false)
    if (!r?.ok) return
    await onPatch(idea.id, { tareaId: taskId })
  }

  const addComment = () => {
    const text = commentDraft.trim(); if (!text) return
    onPatch(idea.id, { comentarios: [...idea.comentarios, { at: new Date().toISOString(), text }] })
    setCommentDraft('')
  }
  const removeComment = (at: string) => onPatch(idea.id, { comentarios: idea.comentarios.filter(c => c.at !== at) })

  const field: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '8px 10px', fontSize: 13, color: '#14233D', outline: 'none' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
        <div style={{ height: 4, background: '#C2933A' }} />
        <div style={{ padding: '20px 24px', maxHeight: '82vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)' }}>{fmtWhenLong(idea.creada)}</span>
            <button aria-label="Cerrar" onClick={onClose} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 30, width: 30, color: 'rgba(20,35,61,0.55)', fontSize: 15 }}>✕</button>
          </div>

          <textarea key={idea.id} defaultValue={idea.texto} rows={3}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== idea.texto) onPatch(idea.id, { texto: v }) }}
            style={{ ...field, width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }} />

          <div>
            <div style={eb}>Épica</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <select value={idea.epicaId || ''} disabled={converted} onChange={e => onPatch(idea.id, { epicaId: e.target.value || null, featureId: null })}
                style={{ ...sel, opacity: converted ? 0.6 : 1, cursor: converted ? 'default' : 'pointer' }}>
                <option value="">— Ninguna —</option>
                {epicas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {feats.length > 0 && (
                <select value={idea.featureId || ''} disabled={converted} onChange={e => onPatch(idea.id, { featureId: e.target.value || null })}
                  style={{ ...sel, opacity: converted ? 0.6 : 1, cursor: converted ? 'default' : 'pointer' }}>
                  <option value="">Sin feature</option>
                  {feats.map(f => <option key={f.id} value={f.id}>{f.t}</option>)}
                </select>
              )}
            </div>
          </div>

          {converted ? (
            <a href={`/epicas?e=${idea.epicaId}&t=${idea.tareaId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', textDecoration: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, background: 'rgba(46,110,110,0.12)', color: '#2E6E6E' }}>✓ Ya es una tarea · abrir →</a>
          ) : (
            <button disabled={!idea.epicaId || converting} onClick={convert} title={idea.epicaId ? '' : 'Elige una épica arriba primero'}
              style={{ alignSelf: 'flex-start', cursor: idea.epicaId ? 'pointer' : 'default', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, background: idea.epicaId ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : 'rgba(15,35,64,0.08)', color: idea.epicaId ? '#1B1305' : 'rgba(20,35,61,0.4)' }}>
              {converting ? 'Creando…' : '✓ Convertir en tarea'}
            </button>
          )}

          {!richReady ? (
            <div style={{ fontSize: 11.5, color: 'rgba(176,82,46,0.9)' }}>Corre sql/ideas-02-links-comentarios.sql para poder agregar links y comentarios.</div>
          ) : (<>
            <div style={{ borderTop: '1px solid rgba(15,35,64,0.08)', paddingTop: 14 }}>
              <TaskLinks links={idea.links} onChange={next => onPatch(idea.id, { links: next })} />
            </div>

            <div style={{ borderTop: '1px solid rgba(15,35,64,0.08)', paddingTop: 14 }}>
              <div style={eb}>Comentarios {idea.comentarios.length > 0 && <span style={{ color: '#A87A2C', fontWeight: 800 }}>{idea.comentarios.length}</span>}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {[...idea.comentarios].sort((a, b) => b.at.localeCompare(a.at)).map(c => (
                  <div key={c.at} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 9px', borderRadius: 9, background: 'rgba(15,35,64,0.03)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: '#16365F', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.text}</div>
                      <div style={{ fontSize: 10, color: 'rgba(20,35,61,0.4)', marginTop: 2 }}>{fmtWhenLong(c.at)}</div>
                    </div>
                    <button aria-label="Quitar comentario" onClick={() => removeComment(c.at)} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(176,82,46,0.6)', fontSize: 12 }}>✕</button>
                  </div>
                ))}
                {idea.comentarios.length === 0 && <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.45)' }}>Sin comentarios.</div>}
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                <input value={commentDraft} onChange={e => setCommentDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment() }} placeholder="Agregar comentario…" style={{ ...field, flex: 1 }} />
                <button onClick={addComment} disabled={!commentDraft.trim()} style={{ cursor: commentDraft.trim() ? 'pointer' : 'default', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, background: commentDraft.trim() ? '#10233F' : 'rgba(15,35,64,0.08)', color: commentDraft.trim() ? '#fff' : 'rgba(20,35,61,0.4)' }}>Agregar</button>
              </div>
            </div>
          </>)}

          <div style={{ borderTop: '1px solid rgba(15,35,64,0.08)', paddingTop: 14, display: 'flex', gap: 10 }}>
            {!converted && (idea.descartada
              ? <button onClick={() => onPatch(idea.id, { descartada: false })} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.6)', borderRadius: 9, padding: '9px 15px', fontSize: 12.5, fontWeight: 700 }}>↺ Deshacer "no es viable"</button>
              : <button onClick={() => onPatch(idea.id, { descartada: true })} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.6)', borderRadius: 9, padding: '9px 15px', fontSize: 12.5, fontWeight: 700 }}>No es viable</button>)}
            <span style={{ flex: 1 }} />
            <button onClick={() => onDelete(idea.id)} style={{ cursor: 'pointer', border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.06)', color: '#B0522E', borderRadius: 9, padding: '9px 15px', fontSize: 12.5, fontWeight: 700 }}>Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
