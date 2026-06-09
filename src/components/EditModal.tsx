'use client'

import { useState } from 'react'
import type { Item } from '@/lib/supabase'
import { normalizeImageUrl, ACCENT_OPTIONS } from '@/lib/utils'

type Draft = Partial<Item>

export default function EditModal({
  item, sections, subcategories, onSave, onDelete, onClose,
}: {
  item: Item | null
  sections: string[]
  subcategories: string[]
  onSave: (draft: Draft, isNew: boolean) => Promise<void>
  onDelete: (item: Item) => Promise<void>
  onClose: () => void
}) {
  const isNew = !item
  const [draft, setDraft] = useState<Draft>(item ?? {
    title: '', url: '', section: sections[0] ?? 'General', accent: 'blue',
    item_order: 999, section_order: 999, featured: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof Item>(k: K, v: Item[K]) => setDraft(d => ({ ...d, [k]: v }))

  const submit = async () => {
    setError(null)
    if (!draft.title?.trim() || !draft.url?.trim()) {
      setError('Título y URL principal son obligatorios.')
      return
    }
    setSaving(true)
    try {
      await onSave(draft, isNew)
      onClose()
    } catch (e) {
      setError(String(e))
      setSaving(false)
    }
  }

  const preview = normalizeImageUrl(draft.image)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="animate-fade flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl glass shadow-2xl sm:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
          <h3 className="text-base font-semibold">{isNew ? 'Nuevo acceso' : 'Editar acceso'}</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {error && <div className="rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300">{error}</div>}

          <Field label="Título *">
            <input value={draft.title ?? ''} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="Nombre del acceso" />
          </Field>
          <Field label="URL principal *">
            <input value={draft.url ?? ''} onChange={e => set('url', e.target.value)} className={inputCls} placeholder="https://…" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Excel (URL 2)">
              <input value={draft.url2 ?? ''} onChange={e => set('url2', e.target.value)} className={inputCls} placeholder="opcional" />
            </Field>
            <Field label="Código (URL 3)">
              <input value={draft.url3 ?? ''} onChange={e => set('url3', e.target.value)} className={inputCls} placeholder="opcional" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <input list="sections-list" value={draft.section ?? ''} onChange={e => set('section', e.target.value)} className={inputCls} />
              <datalist id="sections-list">{sections.map(s => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Subcategoría">
              <input list="subs-list" value={draft.subcategory ?? ''} onChange={e => set('subcategory', e.target.value)} className={inputCls} placeholder="opcional" />
              <datalist id="subs-list">{subcategories.map(s => <option key={s} value={s} />)}</datalist>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Orden item">
              <input type="number" value={draft.item_order ?? 999} onChange={e => set('item_order', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Orden sección">
              <input type="number" value={draft.section_order ?? 999} onChange={e => set('section_order', Number(e.target.value))} className={inputCls} />
            </Field>
          </div>

          <Field label="Descripción">
            <textarea value={draft.description ?? ''} onChange={e => set('description', e.target.value)} rows={2} className={inputCls} placeholder="opcional" />
          </Field>

          <Field label="Imagen (URL o Google Drive)">
            <div className="flex items-center gap-2.5">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
              )}
              <input value={draft.image ?? ''} onChange={e => set('image', e.target.value)} className={inputCls} placeholder="https://…" />
            </div>
          </Field>

          <div className="flex items-center justify-between gap-3">
            <Field label="Color">
              <div className="flex gap-1.5">
                {ACCENT_OPTIONS.map(a => (
                  <button key={a} onClick={() => set('accent', a)} title={a}
                    className={`h-6 w-6 rounded-full ring-2 transition ${draft.accent === a ? 'ring-white' : 'ring-transparent'}`}
                    style={{ background: ACCENT_BG[a] }} />
                ))}
              </div>
            </Field>
            <label className="flex cursor-pointer items-center gap-2 pt-4 text-sm">
              <input type="checkbox" checked={!!draft.featured} onChange={e => set('featured', e.target.checked)} className="h-4 w-4 accent-blue-500" />
              <span className="text-white/70">⭐ Favorito</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/8 px-5 py-3.5">
          {!isNew ? (
            <button
              onClick={() => { if (confirm(`¿Eliminar "${item!.title}"?`)) onDelete(item!).then(onClose) }}
              className="rounded-xl px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/15">
              Eliminar
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-white/60 hover:bg-white/8">Cancelar</button>
            <button onClick={submit} disabled={saving}
              className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50">
              {saving ? 'Guardando…' : isNew ? 'Crear' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-blue-400/50'

const ACCENT_BG: Record<string, string> = {
  copper: '#d97706', blue: '#3b82f6', green: '#10b981', purple: '#8b5cf6',
  red: '#ef4444', cyan: '#06b6d4', orange: '#f97316',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</span>
      {children}
    </label>
  )
}
