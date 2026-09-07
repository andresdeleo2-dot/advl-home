'use client'

import { useState, useEffect, type CSSProperties } from 'react'
import { safeUrl } from './epicas/core'

const PRESETS = [5, 10, 15, 30]
const BREAK_LINK_KEY = 'advl_break_link_v1'
// Default de fábrica — sólo se usa si nunca se ha guardado nada en este navegador
// (localStorage.getItem devuelve null). Si lo borras a propósito, se queda vacío
// de verdad (no "revive" solo): se guarda '' explícito para distinguir ambos casos.
const DEFAULT_BREAK_URL = 'https://paracompartir.vercel.app/d?x=dpgd6z35fiwd'

const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

/** Botón "Tomar un break" — arranca un cronómetro (o uno con tiempo fijo) marcado como 'ocio', para
 *  que NO cuente como trabajado (Tiempo y Épicas ya excluyen esa área de los totales del día).
 *  Compartido entre Tiempo y Épicas: cada uno pasa su propio `onStart`, que arma la sesión con SU
 *  mecanismo (beginSession en Tiempo, focus.begin en Épicas) — el botón sólo decide los minutos.
 *  El enlace de "algo para hacer en el break" vive aquí mismo (localStorage, editable con el lápiz) —
 *  antes era un Google Drive fijo en el código; ahora es cualquier link y se cambia sin tocar código. */
export default function BreakButton({ onStart }: { onStart: (minutes: number) => void }) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(BREAK_LINK_KEY)
      setLink(saved === null ? DEFAULT_BREAK_URL : (saved || null))
    } catch { setLink(DEFAULT_BREAK_URL) }
  }, [])

  const go = (min: number) => { onStart(min); setOpen(false) }
  const startEdit = () => { setDraft(link || ''); setEditing(true) }
  const saveLink = () => {
    const v = draft.trim()
    try { localStorage.setItem(BREAK_LINK_KEY, v) } catch {}
    setLink(v || null)
    setEditing(false)
  }

  const chip: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(46,142,110,0.4)', background: 'rgba(46,142,110,0.08)', color: '#2E6E5A', borderRadius: 9, padding: '9px 15px', font: '700 12.5px var(--font-ui, system-ui)', whiteSpace: 'nowrap' }
  const href = link ? safeUrl(link) : ''

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(v => !v)} title="Registra un descanso — no cuenta como trabajado" style={chip}>☕ Tomar un break</button>
      {open && (
        <>
          <div onClick={() => { setOpen(false); setEditing(false) }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div onClick={ev => ev.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41, display: 'flex', flexWrap: 'wrap', gap: 6, width: 240, padding: 10, background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 12, boxShadow: '0 18px 34px -18px rgba(15,35,64,0.5)' }}>
            <span style={{ flexBasis: '100%', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.5)' }}>¿Cuánto tiempo?</span>
            {PRESETS.map(m => (
              <button key={m} onClick={() => go(m)} style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 700, border: '1px solid rgba(46,142,110,0.3)', background: '#fff', color: '#2E6E5A' }}>{m} min</button>
            ))}
            <button onClick={() => go(0)} style={{ flexBasis: '100%', marginTop: 2, cursor: 'pointer', borderRadius: 8, padding: '7px 11px', fontSize: 12.5, fontWeight: 700, border: 'none', background: '#2E6E5A', color: '#fff' }}>Libre — paro cuando quiera</button>
            <div style={{ flexBasis: '100%', height: 1, background: 'rgba(15,35,64,0.08)', margin: '4px 0 2px' }} />

            {editing ? (
              <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input autoFocus value={draft} onChange={ev => setDraft(ev.target.value)}
                  onKeyDown={ev => { if (ev.key === 'Enter') saveLink(); if (ev.key === 'Escape') setEditing(false) }}
                  placeholder="https://…" style={{ border: '1px solid rgba(15,35,64,0.16)', borderRadius: 8, padding: '7px 9px', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box', color: '#14233D' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={saveLink} style={{ flex: 1, cursor: 'pointer', borderRadius: 8, padding: '6px 0', fontSize: 11.5, fontWeight: 700, border: 'none', background: '#2E6E5A', color: '#fff' }}>✓ Guardar</button>
                  <button onClick={() => setEditing(false)} style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 11.5, fontWeight: 700, border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.55)' }}>Cancelar</button>
                </div>
                <span style={{ fontSize: 10, color: 'rgba(20,35,61,0.45)' }}>Vacío y Guardar = quitar el enlace.</span>
              </div>
            ) : link ? (
              <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 6 }}>
                <a href={href} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}
                  title={link} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', borderRadius: 8, padding: '7px 9px', border: '1px solid rgba(15,35,64,0.1)', background: '#fff' }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>🔗</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Abrir enlace <span style={{ fontWeight: 500, color: 'rgba(20,35,61,0.45)' }}>· {href === '#' ? 'inválido' : hostOf(href)}</span>
                  </span>
                  <span style={{ fontSize: 13, color: 'rgba(20,35,61,0.35)', flexShrink: 0 }}>↗</span>
                </a>
                <button onClick={startEdit} title="Editar enlace" aria-label="Editar enlace" style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.1)', background: '#fff', borderRadius: 8, height: 30, width: 30, color: 'rgba(20,35,61,0.45)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
              </div>
            ) : (
              <button onClick={startEdit} style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 8, padding: '7px 9px', border: '1px dashed rgba(15,35,64,0.2)', background: '#fff', fontSize: 12, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>+ Agregar enlace para el break</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
