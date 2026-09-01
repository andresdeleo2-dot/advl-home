'use client'
import { useState, type CSSProperties } from 'react'
import { safeUrl } from '@/components/epicas/core'
import type { EpicaTaskLink } from '@/lib/supabase'

/* Links de una tarea (agregar/editar/ordenar/quitar) — compartido entre los detalles de Épicas
 * (peek + editor completo) y Tiempo, para que se vea y funcione IGUAL en los tres. Cada link ya
 * guardado se muestra como una tarjeta limpia (nombre + dominio, clic para abrir); tocar ✎ la
 * vuelve editable. Uno recién agregado (sin nombre ni URL) empieza editable de una vez. */
export default function TaskLinks({ links, onChange }: { links: EpicaTaskLink[]; onChange: (next: EpicaTaskLink[]) => void }) {
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const nn = links.length
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= nn) return; const ls = [...links];[ls[i], ls[j]] = [ls[j], ls[i]]; onChange(ls) }
  const update = (i: number, patch: Partial<EpicaTaskLink>) => onChange(links.map((x, j) => j === i ? { ...x, ...patch } : x))
  const remove = (i: number) => { onChange(links.filter((_, j) => j !== i)); setEditIdx(null) }
  const add = () => { onChange([...links, { label: '', url: '' }]); setEditIdx(links.length) }
  const domainOf = (url: string) => { try { return new URL(safeUrl(url)).hostname.replace(/^www\./, '') } catch { return '' } }

  const eb: CSSProperties = { font: '700 10px/1 var(--font-ui, system-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }
  const nf: CSSProperties = { background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, color: '#14233D', boxSizing: 'border-box', outline: 'none' }
  const arrBtn: CSSProperties = { height: 30, width: 26, borderRadius: 7, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 11, lineHeight: 1, flexShrink: 0, cursor: 'pointer' }
  const iconBtn: CSSProperties = { flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.1)', background: '#fff', borderRadius: 8, height: 30, width: 30, color: 'rgba(20,35,61,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={eb}>Links {nn > 0 && <span style={{ color: '#A87A2C', fontWeight: 800 }}>{nn}</span>}</span>
        <button onClick={add} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '5px 10px', fontSize: 11.5, fontWeight: 700 }}>+ Link</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {nn === 0 && <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.45)' }}>Sin links. Agrega con “+ Link”.</div>}
        {links.map((l, i) => {
          const editing = editIdx === i || (!l.label.trim() && !l.url.trim())
          if (editing) return (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              {nn > 1 && (
                <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button aria-label="Subir" title="Subir" disabled={i === 0} onClick={() => move(i, -1)} style={{ ...arrBtn, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                  <button aria-label="Bajar" title="Bajar" disabled={i === nn - 1} onClick={() => move(i, 1)} style={{ ...arrBtn, cursor: i === nn - 1 ? 'default' : 'pointer', opacity: i === nn - 1 ? 0.35 : 1 }}>↓</button>
                </span>
              )}
              <input key={`l:${i}:${l.label}`} defaultValue={l.label} placeholder="Nombre" onBlur={ev => update(i, { label: ev.target.value })} onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }} style={{ ...nf, flex: '0 0 120px', width: 120 }} />
              <input key={`u:${i}:${l.url}`} defaultValue={l.url} placeholder="https://…" onBlur={ev => update(i, { url: ev.target.value })} onKeyDown={ev => { if (ev.key === 'Enter') { setEditIdx(null); (ev.target as HTMLInputElement).blur() } }} style={{ ...nf, flex: 1, minWidth: 0, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }} />
              {(l.label.trim() || l.url.trim()) && <button aria-label="Listo" title="Listo" onClick={() => setEditIdx(null)} style={{ ...iconBtn, color: '#2E6E6E', borderColor: 'rgba(46,110,110,0.35)' }}>✓</button>}
              <button aria-label="Quitar link" title="Quitar" onClick={() => remove(i)} style={iconBtn}>✕</button>
            </div>
          )
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 10, border: '1px solid rgba(15,35,64,0.10)', background: '#fff' }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: '#C2933A', flexShrink: 0 }} />
              <a href={safeUrl(l.url)} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" title={l.url}
                style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, textDecoration: 'none', cursor: 'pointer' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label.trim() || l.url}</span>
                {l.label.trim() && <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domainOf(l.url)}</span>}
              </a>
              <button aria-label="Editar link" title="Editar" onClick={() => setEditIdx(i)} style={iconBtn}>✎</button>
              <button aria-label="Quitar link" title="Quitar" onClick={() => remove(i)} style={iconBtn}>✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
