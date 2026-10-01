'use client'

import { useEffect, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { EpicaLink } from '@/lib/supabase'
import { getFaviconUrl } from '@/lib/utils'
import { MAX_FEATURE_LINKS } from '@/lib/features'
import { LINK_TYPES, hexA, safeUrl, typeColor } from './core'

/* Links por Feature (dashboards, hojas, carpetas…): pastillas compactas para las tarjetas y
 * listas, tarjetas ricas para la franja del feature seleccionado, y el alta/edición inline.
 * Estilos inline como el resto de Épicas; lo que inline no puede (hover, foco, móvil) va en
 * FL_CSS, que React 19 sube al <head> una sola vez gracias a href+precedence. */

const NAVY = '#14233D'
const NAVY2 = '#16365F'
const GOLD_D = '#A87A2C'
const MUTED = 'rgba(20,35,61,0.5)'

// Hover sólo con puntero real (en táctil se queda pegado) y sin tocar el borde izquierdo (acento del tipo).
const FL_CSS = `
.fl-pill{transition:border-color .15s,background .15s}
.fl-card{transition:border-color .15s,box-shadow .15s}
.fl-arrow{transition:opacity .15s,transform .15s}
.fl-add{transition:border-color .15s,color .15s,background .15s}
@media (hover:hover){
  .fl-pill:hover{border-color:rgba(194,147,58,.6)!important;background:#FFFDF8!important}
  a.fl-card:hover{border-top-color:rgba(194,147,58,.55)!important;border-right-color:rgba(194,147,58,.55)!important;border-bottom-color:rgba(194,147,58,.55)!important;box-shadow:0 6px 16px -8px rgba(15,35,64,.28)}
  a.fl-card:hover .fl-arrow{opacity:.95;transform:translate(1px,-1px)}
  .fl-add:hover{border-color:rgba(194,147,58,.65)!important;color:#A87A2C!important;background:rgba(194,147,58,.06)!important}
}
.fl-pill:focus-visible,.fl-card:focus-visible,.fl-btn:focus-visible,.fl-add:focus-visible{outline:2px solid #C2933A;outline-offset:2px}
.fl-input:focus{border-color:rgba(194,147,58,.7)!important;box-shadow:0 0 0 3px rgba(194,147,58,.14)}
.fl-pills{scrollbar-width:none}
.fl-pills::-webkit-scrollbar{display:none}
@media (max-width:640px){
  .fl-pills{flex-wrap:nowrap!important;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .fl-pills>*{flex-shrink:0}
  .fl-cards{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))}
  .fl-cards.fl-cards--edit{grid-template-columns:minmax(0,1fr)}
  .fl-cards>*{width:auto!important;max-width:none!important;min-width:0!important}
  .fl-card,.fl-add{min-height:48px}
  .fl-form{grid-column:1/-1}
  .fl-btn{min-height:36px!important;min-width:36px}
  .fl-input{font-size:16px!important}
}
`
export function FeatureLinksStyles() {
  return <style href="advl-feature-links" precedence="default">{FL_CSS}</style>
}

/* ─── Helpers ──────────────────────────────────────────────── */

/** Lo que el usuario pega → URL http(s) válida, o null. Antepone https:// si falta el esquema;
 *  rechaza javascript:/mailto:/data:… y hosts sin punto ("hola" no es un link). */
export function normalizeLinkUrl(input: string): string | null {
  const s = (input || '').trim()
  if (!s) return null
  let withScheme: string
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(s)) withScheme = s
  else if (/^[a-z][a-z\d+.-]*:(?!\d)/i.test(s)) return null   // otro esquema; "host:puerto" sí pasa
  else withScheme = 'https://' + s.replace(/^\/+/, '')
  let u: URL
  try { u = new URL(withScheme) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.hostname !== 'localhost' && !u.hostname.includes('.')) return null
  return u.href
}

function parts(url: string): { host: string; path: string } | null {
  const n = normalizeLinkUrl(url)
  if (!n) return null
  const u = new URL(n)
  return { host: u.hostname.toLowerCase().replace(/^www\./, ''), path: u.pathname.toLowerCase() }
}

export function linkDomain(url: string): string {
  return parts(url)?.host || ''
}

/** Tipo sugerido por la URL (el usuario lo puede cambiar). Supabase va antes que Dashboard
 *  porque su consola vive en supabase.com/dashboard/… */
export function detectLinkType(url: string): string {
  const p = parts(url)
  if (!p) return 'Otro'
  const { host, path } = p
  if ((host === 'docs.google.com' && path.startsWith('/spreadsheets')) || host === 'sheets.google.com' || /\.(xlsx?|csv)$/.test(path)) return 'Excel'
  if (host.includes('supabase')) return 'Supabase'
  if (host === 'drive.google.com' || host === 'docs.google.com') return 'Drive'
  if (host.endsWith('.vercel.app') || path.includes('dashboard') || host.startsWith('dashboard.') || host === 'lookerstudio.google.com' || host === 'datastudio.google.com') return 'Dashboard'
  return 'Otro'
}

/** Nombre corto por defecto: lo que se guarda si el usuario deja "Nombre" vacío. */
export function suggestLinkName(url: string): string {
  const p = parts(url)
  if (!p) return ''
  const { host, path } = p
  if (host === 'docs.google.com') {
    if (path.startsWith('/spreadsheets')) return 'Google Sheets'
    if (path.startsWith('/presentation')) return 'Google Slides'
    if (path.startsWith('/forms')) return 'Google Forms'
    return 'Google Docs'
  }
  if (host === 'sheets.google.com') return 'Google Sheets'
  if (host === 'drive.google.com') return 'Drive'
  if (host === 'lookerstudio.google.com' || host === 'datastudio.google.com') return 'Looker Studio'
  if (host.includes('supabase')) return 'Supabase'
  if (host.endsWith('.vercel.app')) return host.slice(0, -'.vercel.app'.length) || host
  return host
}

const linkName = (l: EpicaLink) => (l.l || '').trim() || suggestLinkName(l.url) || l.type || 'Link'
const isHttp = (u: string) => /^https?:/i.test(u)

/* ─── Piezas ───────────────────────────────────────────────── */

/** Favicon (de Google, igual que Accesos); si no carga, un punto del color del tipo. */
function Favicon({ url, type, size }: { url: string; type: string; size: number }) {
  const [failed, setFailed] = useState(false)
  const src = getFaviconUrl(safeUrl(url))
  useEffect(() => { setFailed(false) }, [src])
  if (!src || failed) {
    const d = Math.max(6, Math.round(size * 0.5))
    return <span aria-hidden style={{ display: 'inline-flex', width: size, height: size, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ width: d, height: d, borderRadius: 99, background: typeColor(type) }} /></span>
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: 3, flexShrink: 0, display: 'block' }} />
}

/** Pastilla compacta de solo lectura: favicon + nombre corto; abre en otra pestaña sin
 *  disparar el clic del contenedor (p. ej. seleccionar el feature). */
export function LinkPill({ link, maxWidth = 110 }: { link: EpicaLink; maxWidth?: number }) {
  const href = safeUrl(link.url)
  const name = linkName(link)
  const dom = linkDomain(link.url)
  return (
    <a className="fl-pill" href={href} target={isHttp(href) ? '_blank' : undefined} rel="noopener noreferrer"
      title={dom ? `${name} · ${dom}` : name} onClick={ev => ev.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 26, boxSizing: 'border-box', padding: '3px 9px 3px 6px', borderRadius: 99, background: '#fff', border: '1px solid rgba(15,35,64,0.12)', textDecoration: 'none', color: NAVY, font: '600 11px/1.2 var(--font-ui)', flexShrink: 0 }}>
      <Favicon url={link.url} type={link.type} size={14} />
      <span style={{ maxWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </a>
  )
}

/** Fila de pastillas (scroll horizontal en celular). Con `max`, las que sobran se resumen en
 *  "+N", que llama a `onMore` (en la tarjeta del feature: seleccionarlo). */
export function LinkPillRow({ links, max, onMore, label, style }: { links: EpicaLink[]; max?: number; onMore?: () => void; label?: ReactNode; style?: CSSProperties }) {
  if (!links.length) return null
  const shown = max ? links.slice(0, max) : links
  const extra = links.length - shown.length
  return (
    <div className="fl-pills" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, ...style }}>
      <FeatureLinksStyles />
      {label}
      {shown.map((l, i) => <LinkPill key={`${l.url}|${i}`} link={l} />)}
      {extra > 0 && (
        <button type="button" className="fl-pill" onClick={ev => { ev.stopPropagation(); onMore?.() }} title={`Ver los ${links.length} links`}
          style={{ cursor: 'pointer', minHeight: 26, padding: '3px 9px', borderRadius: 99, background: 'rgba(15,35,64,0.04)', border: '1px solid rgba(15,35,64,0.12)', font: '700 11px/1 var(--font-ui)', color: MUTED, flexShrink: 0 }}>
          +{extra}
        </button>
      )}
    </div>
  )
}

const iconBtn: CSSProperties = {
  flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', borderRadius: 8,
  height: 30, width: 30, color: 'rgba(20,35,61,0.6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, padding: 0,
}

/** Tarjeta rica: favicon en cuadrito, nombre, dominio y acento del tipo. Fuera de modo editar
 *  toda la tarjeta es el <a>; en modo editar no navega y muestra ✎/✕ siempre visibles. */
export function LinkCard({ link, editing, onEdit, onRemove }: { link: EpicaLink; editing?: boolean; onEdit?: () => void; onRemove?: () => void }) {
  const href = safeUrl(link.url)
  const name = linkName(link)
  const dom = linkDomain(link.url)
  const c = typeColor(link.type)
  const shell: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9, boxSizing: 'border-box', flex: '0 1 230px', minWidth: 170, maxWidth: 280,
    padding: '8px 10px 8px 9px', borderRadius: 10, background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderLeft: `3px solid ${c}`,
    textDecoration: 'none', color: NAVY,
  }
  const body = (
    <>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, background: '#FBFAF6', border: '1px solid rgba(15,35,64,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Favicon url={link.url} type={link.type} size={18} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ font: '700 12.5px/1.25 var(--font-ui)', color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ fontSize: 11, lineHeight: 1.2, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dom || link.type}</span>
      </span>
    </>
  )
  if (editing) {
    return (
      <div className="fl-card" style={shell}>
        {body}
        <button type="button" className="fl-btn" onClick={onEdit} aria-label={`Editar link ${name}`} title="Editar" style={iconBtn}>✎</button>
        <button type="button" className="fl-btn" onClick={onRemove} aria-label={`Quitar link ${name}`} title="Quitar" style={iconBtn}>✕</button>
      </div>
    )
  }
  return (
    <a className="fl-card" href={href} target={isHttp(href) ? '_blank' : undefined} rel="noopener noreferrer" title={`${name}${dom ? ` · ${dom}` : ''} — abrir en otra pestaña`} style={shell}>
      {body}
      <span aria-hidden className="fl-arrow" style={{ fontSize: 13, color: 'rgba(20,35,61,0.45)', opacity: 0.55, flexShrink: 0 }}>↗</span>
    </a>
  )
}

/* ─── Alta / edición inline ───────────────────────────────── */

const inputStyle: CSSProperties = {
  boxSizing: 'border-box', minHeight: 36, background: '#fff', border: '1px solid rgba(15,35,64,0.16)', borderRadius: 9,
  padding: '7px 10px', fontSize: 13, color: NAVY, outline: 'none', fontFamily: 'var(--font-ui)', minWidth: 0,
}

function LinkForm({ initial, taken, onSubmit, onCancel }: {
  initial?: EpicaLink
  taken: string[]   // URLs ya presentes en el feature (sin la que se edita)
  onSubmit: (l: EpicaLink) => void
  onCancel: () => void
}) {
  const [url, setUrl] = useState(initial?.url || '')
  const [name, setName] = useState(initial?.l || '')
  // Al editar, si el tipo guardado coincide con el detectado se sigue autodetectando al cambiar la URL.
  const [manualType, setManualType] = useState<string | null>(initial && initial.type !== detectLinkType(initial.url) ? initial.type : null)
  const [error, setError] = useState<string | null>(null)
  const norm = normalizeLinkUrl(url)
  const type = manualType || (norm ? detectLinkType(norm) : (initial?.type || 'Otro'))
  const suggested = norm ? suggestLinkName(norm) : ''

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (!url.trim()) { setError('Pega un link primero'); return }
    if (!norm) { setError('Ese link no es válido · usa una dirección http(s), p. ej. https://…'); return }
    if (taken.some(t => (normalizeLinkUrl(t) || t) === norm)) { setError('Ese link ya está en este feature'); return }
    onSubmit({ l: (name.trim() || suggested).slice(0, 80), url: norm, type })
  }
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); onCancel() }
  }

  return (
    <form className="fl-form" onSubmit={submit} onKeyDown={onKey} noValidate
      style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 11, background: '#fff', border: '1.5px dashed rgba(194,147,58,0.55)', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 9, background: '#FBFAF6', border: '1px solid rgba(15,35,64,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {norm ? <Favicon url={norm} type={type} size={18} />
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(20,35,61,0.4)" strokeWidth="2.2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>}
        </span>
        <input className="fl-input" type="url" inputMode="url" autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false}
          value={url} onChange={ev => { setUrl(ev.target.value); setError(null) }} placeholder="Pega el link (https://…)" aria-label="URL del link"
          style={{ ...inputStyle, flex: '2 1 220px' }} />
        <input className="fl-input" type="text" value={name} maxLength={80} onChange={ev => setName(ev.target.value)}
          placeholder={suggested || 'Nombre (opcional)'} aria-label="Nombre del link (opcional)"
          style={{ ...inputStyle, flex: '1 1 150px' }} />
      </div>
      <div role="group" aria-label="Tipo de link" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.45)', marginRight: 2 }}>Tipo</span>
        {LINK_TYPES.map(t => {
          const on = type === t, c = typeColor(t)
          return (
            <button key={t} type="button" className="fl-btn" aria-pressed={on} onClick={() => setManualType(t)}
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 28, padding: '4px 10px', borderRadius: 99, font: '700 11px/1 var(--font-ui)', border: `1px solid ${on ? c : 'rgba(15,35,64,0.12)'}`, background: on ? hexA(c, 0.12) : '#fff', color: on ? NAVY2 : 'rgba(20,35,61,0.6)' }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: c }} />{t}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span role={error ? 'alert' : undefined} style={{ flex: '1 1 160px', fontSize: 11.5, fontWeight: 600, color: error ? '#B0522E' : 'rgba(20,35,61,0.45)' }}>
          {error || (norm && !name.trim() && suggested ? `Se guardará como «${suggested}»` : '')}
        </span>
        <button type="button" className="fl-btn" onClick={onCancel}
          style={{ cursor: 'pointer', minHeight: 32, padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.6)', font: '700 12px/1 var(--font-ui)' }}>Cancelar</button>
        <button type="submit" className="fl-btn"
          style={{ cursor: 'pointer', minHeight: 32, padding: '6px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305', font: '800 12px/1 var(--font-ui)' }}>Guardar</button>
      </div>
    </form>
  )
}

/* ─── Franja del feature seleccionado ─────────────────────── */

// El link en edición va por contenido, no por índice: si la lista cambia (Deshacer, revert, recarga) el índice apunta a otro.
type FormState = null | { mode: 'add' } | { mode: 'edit'; link: EpicaLink }
const sameLink = (a: EpicaLink, b: EpicaLink) => a.url === b.url && a.l === b.l && a.type === b.type

/** Franja "LINKS · <feature>": tarjetas + alta/edición inline. No guarda nada por sí misma:
 *  avisa con onAdd/onEdit/onRemove (quien la monta escribe, revierte y ofrece Deshacer).
 *  Montarla con key={feature.id} para que el modo editar no se arrastre entre features. */
export function FeatureLinksStrip({ featureName, color, links, onAdd, onEdit, onRemove, id, abrirAlta, onAltaAbierta }: {
  featureName: string
  color?: string
  links: EpicaLink[]
  onAdd: (link: EpicaLink) => void
  onEdit: (prev: EpicaLink, next: EpicaLink) => void
  onRemove: (link: EpicaLink) => void
  id?: string
  abrirAlta?: boolean          // el "+ Link" de la tarjeta pide abrir el formulario de alta
  onAltaAbierta?: () => void   // se consume para que no se reabra al volver a montar la franja
}) {
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<FormState>(null)
  const n = links.length
  useEffect(() => { if (n === 0) setEditMode(false) }, [n])
  useEffect(() => { if (abrirAlta) { setEditMode(false); setForm({ mode: 'add' }); onAltaAbierta?.() } }, [abrirAlta, onAltaAbierta])
  const editIdx = form?.mode === 'edit' ? links.findIndex(x => sameLink(x, form.link)) : -1
  useEffect(() => { if (form?.mode === 'edit' && editIdx < 0) setForm(null) }, [form, editIdx])
  const full = n >= MAX_FEATURE_LINKS
  const urlsExcept = (skip: number) => links.filter((_, i) => i !== skip).map(l => l.url)

  const addForm = (
    <LinkForm key="add" taken={urlsExcept(-1)} onCancel={() => setForm(null)}
      onSubmit={l => { onAdd(l); setForm(null) }} />
  )

  if (n === 0) {
    return (
      <section id={id} aria-label={`Links de ${featureName}`} style={{ marginBottom: 18 }}>
        <FeatureLinksStyles />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, minHeight: 28 }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: color || '#5B6B86', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, font: '700 9.5px/1.2 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Links · <span style={{ color: NAVY2 }}>{featureName}</span>
          </span>
        </div>
        {form ? <div className="fl-cards" style={{ display: 'flex' }}>{addForm}</div> : (
          <button type="button" className="fl-add" onClick={() => setForm({ mode: 'add' })}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%', minHeight: 44, padding: '9px 15px', borderRadius: 10, border: '1.5px dashed rgba(194,147,58,0.6)', background: 'rgba(194,147,58,0.07)', color: GOLD_D, font: '700 12.5px/1.2 var(--font-ui)' }}>
            <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>🔗</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Agregar link a {featureName}</span>
            <span className="ep-hide-sm" style={{ fontWeight: 600, color: 'rgba(20,35,61,0.45)' }}>· dashboard, hoja, carpeta…</span>
          </button>
        )}
      </section>
    )
  }

  return (
    <section id={id} aria-label={`Links de ${featureName}`} style={{ marginBottom: 18 }}>
      <FeatureLinksStyles />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, minHeight: 28 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: color || '#5B6B86', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, font: '700 9.5px/1.2 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Links · <span style={{ color: NAVY2 }}>{featureName}</span>
        </span>
        <button type="button" className="fl-btn" aria-pressed={editMode} onClick={() => { setEditMode(v => !v); setForm(null) }}
          style={{ cursor: 'pointer', flexShrink: 0, border: 'none', background: editMode ? 'rgba(194,147,58,0.12)' : 'transparent', borderRadius: 8, padding: '5px 9px', font: '700 11.5px/1 var(--font-ui)', color: editMode ? NAVY2 : GOLD_D }}>
          {editMode ? 'Listo' : 'Editar'}
        </button>
      </div>
      <div className={`fl-cards${editMode ? ' fl-cards--edit' : ''}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {links.map((l, i) => i === editIdx
          ? <LinkForm key={`edit-${l.url}`} initial={l} taken={urlsExcept(i)} onCancel={() => setForm(null)}
              onSubmit={next => { onEdit(l, next); setForm(null) }} />
          : <LinkCard key={`${l.url}|${i}`} link={l} editing={editMode}
              onEdit={() => setForm({ mode: 'edit', link: l })}
              onRemove={() => { if (form?.mode === 'edit') setForm(null); onRemove(l) }} />)}
        {form?.mode === 'add' ? addForm : !full && (
          <button type="button" className="fl-add" onClick={() => setForm({ mode: 'add' })}
            style={{ cursor: 'pointer', flex: '0 1 170px', minWidth: 140, minHeight: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1.5px dashed rgba(15,35,64,0.2)', background: 'transparent', color: 'rgba(20,35,61,0.55)', font: '700 12px/1 var(--font-ui)', boxSizing: 'border-box' }}>
            <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>+</span> Agregar link
          </button>
        )}
      </div>
    </section>
  )
}
