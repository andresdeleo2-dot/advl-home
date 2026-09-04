'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type TaskHit = { id: string; title: string; status: string; epicaId: string; epicaName: string; color: string }
type ItemHit = { id: string; title: string; url: string; section: string }

/** Búsqueda unificada (⌘K / Ctrl+K): tareas de Épicas + Accesos. Vive en el header compartido, así
 *  que el atajo funciona desde cualquier sección. Server-side (src/app/api/search) — no hay tantas
 *  filas como para justificar traer todo al cliente. */
export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [tasks, setTasks] = useState<TaskHit[]>([])
  const [items, setItems] = useState<ItemHit[]>([])
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o) }
      else if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => { if (open) { setQ(''); setTasks([]); setItems([]); setSel(0); setTimeout(() => inputRef.current?.focus(), 30) } }, [open])

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (q.trim().length < 2) { setTasks([]); setItems([]); setLoading(false); return }
    setLoading(true)
    debounce.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then(r => r.json()).then(j => {
        if (j.ok) { setTasks(j.tasks || []); setItems(j.items || []); setSel(0) }
      }).finally(() => setLoading(false))
    }, 220)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [q])

  const results = [...tasks.map(t => ({ kind: 'task' as const, t })), ...items.map(i => ({ kind: 'item' as const, i }))]

  const openTask = (t: TaskHit) => { setOpen(false); router.push(`/epicas?e=${t.epicaId}&t=${t.id}`) }
  const openItem = (i: ItemHit) => { setOpen(false); window.open(i.url, '_blank', 'noopener,noreferrer') }
  const pick = (idx: number) => { const r = results[idx]; if (!r) return; if (r.kind === 'task') openTask(r.t); else openItem(r.i) }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="band-glass band-glass-hover" title="Buscar (⌘K)" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', border: 'none' }}>
      <span style={{ fontSize: 13, lineHeight: 1 }}>⌘</span> Buscar
    </button>
  )

  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,22,42,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 20px 20px' }}>
      <div onClick={ev => ev.stopPropagation()} role="dialog" aria-modal="true" aria-label="Buscar" style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16, boxShadow: '0 50px 90px -30px rgba(8,18,36,.75)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(15,35,64,0.1)' }}>
          <span style={{ fontSize: 16, color: 'rgba(20,35,61,0.4)' }}>🔎</span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={ev => {
              if (ev.key === 'ArrowDown') { ev.preventDefault(); setSel(s => Math.min(results.length - 1, s + 1)) }
              else if (ev.key === 'ArrowUp') { ev.preventDefault(); setSel(s => Math.max(0, s - 1)) }
              else if (ev.key === 'Enter') { ev.preventDefault(); pick(sel) }
            }}
            placeholder="Busca una tarea o un acceso…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: '#14233D', background: 'transparent' }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.35)', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 6, padding: '2px 6px' }}>Esc</span>
        </div>
        <div style={{ maxHeight: '56vh', overflowY: 'auto', padding: results.length ? '8px' : 0 }}>
          {loading && <div style={{ padding: '18px 12px', fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Buscando…</div>}
          {!loading && q.trim().length >= 2 && results.length === 0 && <div style={{ padding: '18px 12px', fontSize: 12.5, color: 'rgba(20,35,61,0.45)' }}>Nada que coincida con &quot;{q}&quot;.</div>}
          {!loading && q.trim().length < 2 && <div style={{ padding: '18px 12px', fontSize: 12, color: 'rgba(20,35,61,0.4)' }}>Escribe al menos 2 letras · busca en tus tareas de Épicas y tus Accesos.</div>}
          {tasks.length > 0 && (
            <div style={{ marginBottom: items.length ? 4 : 0 }}>
              <div style={{ padding: '6px 10px 4px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.4)' }}>Tareas</div>
              {tasks.map((t, i) => {
                const idx = i; const on = sel === idx
                return (
                  <button key={t.id} onClick={() => openTask(t)} onMouseEnter={() => setSel(idx)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', borderRadius: 9, padding: '9px 10px', background: on ? 'rgba(194,147,58,0.12)' : 'transparent' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: t.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: t.status === 'Terminada' ? 'rgba(20,35,61,0.4)' : '#14233D', textDecoration: t.status === 'Terminada' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <span style={{ flexShrink: 0, fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>{t.epicaName}</span>
                  </button>
                )
              })}
            </div>
          )}
          {items.length > 0 && (
            <div>
              <div style={{ padding: '6px 10px 4px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.4)' }}>Accesos</div>
              {items.map((it, i) => {
                const idx = tasks.length + i; const on = sel === idx
                return (
                  <button key={it.id} onClick={() => openItem(it)} onMouseEnter={() => setSel(idx)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', borderRadius: 9, padding: '9px 10px', background: on ? 'rgba(194,147,58,0.12)' : 'transparent' }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>🔗</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: '#14233D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                    <span style={{ flexShrink: 0, fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>{it.section}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
