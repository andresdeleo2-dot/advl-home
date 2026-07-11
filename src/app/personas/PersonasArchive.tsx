'use client'
import { useState, useMemo, useEffect, useTransition, CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Persona, Categoria, IMP_PERSONA } from './types'
import {
  upsertPersona, deletePersona, marcarVistoHoy, addCategoria, importarDeRecuerdos,
} from './actions'

const FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Manrope:wght@300;400;500;600;700&display=swap'
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

type Draft = {
  id: string | null
  nombre: string
  categoria: string | null
  importancia: number
  excepcional: boolean
  significado: string
  conocimos: string
  gusta: string
  notas: string
  ultima_vez: string
  cumple: string
  celular: string
  email: string
  direccion_actual: string
  direcciones_previas: string[]
  links: { label: string; url: string }[]
}

type Props = { personas: Persona[]; categorias: Categoria[]; pendientes: string[] }

export default function PersonasArchive({ personas, categorias, pendientes }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
  const [sort, setSort] = useState<'importancia' | 'reciente' | 'nombre'>('importancia')
  const [unlocked, setUnlocked] = useState<string[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [catModal, setCatModal] = useState(false)
  const [catDraft, setCatDraft] = useState({ name: '', locked: false, password: '' })
  const [passModal, setPassModal] = useState<{ catId: string; then: 'filter' | 'view' } | null>(null)
  const [passInput, setPassInput] = useState('')
  const [passError, setPassError] = useState(false)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const cats = useMemo(
    () => [...categorias].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.name.localeCompare(b.name)),
    [categorias],
  )
  const catName = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c.name])), [cats])
  const isCatLocked = (id: string | null) => {
    const c = cats.find(x => x.id === id)
    return !!(c && c.locked && !unlocked.includes(c.id))
  }

  // ---- helpers ----
  const initials = (name: string) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '·'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  const relTime = (iso: string | null) => {
    if (!iso) return 'Sin registro'
    const then = new Date(iso + 'T00:00:00')
    const d = Math.floor((Date.now() - then.getTime()) / 86400000)
    if (isNaN(d)) return 'Sin registro'
    if (d < 0) return 'Próximamente'
    if (d === 0) return 'Visto hoy'
    if (d === 1) return 'Visto ayer'
    if (d < 7) return `Hace ${d} días`
    if (d < 30) { const w = Math.floor(d / 7); return `Hace ${w} ${w === 1 ? 'semana' : 'semanas'}` }
    if (d < 365) { const m = Math.floor(d / 30); return `Hace ${m} ${m === 1 ? 'mes' : 'meses'}` }
    const y = Math.floor(d / 365); return `Hace ${y} ${y === 1 ? 'año' : 'años'}`
  }
  const fmtCumple = (iso: string | null) => {
    if (!iso) return ''
    const p = iso.split('-')
    if (p.length < 3) return ''
    const day = parseInt(p[2], 10), m = parseInt(p[1], 10) - 1
    if (isNaN(day) || isNaN(m) || !MESES[m]) return ''
    return `${day} de ${MESES[m]}`
  }
  const sorter = (s: string) => {
    if (s === 'nombre') return (a: Persona, b: Persona) => a.nombre.localeCompare(b.nombre)
    if (s === 'reciente') return (a: Persona, b: Persona) => (b.ultima_vez || '').localeCompare(a.ultima_vez || '')
    return (a: Persona, b: Persona) => ((b.importancia || 0) - (a.importancia || 0)) || a.nombre.localeCompare(b.nombre)
  }

  const q = search.trim().toLowerCase()
  const matches = (p: Persona) => {
    if (!q) return true
    return `${p.nombre} ${p.notas || ''} ${p.significado || ''} ${p.gusta || ''} ${p.conocimos || ''}`.toLowerCase().includes(q)
  }

  // ---- derived sections ----
  const sections = useMemo(() => {
    const sortFn = sorter(sort)
    const build = (c: Categoria) => {
      const locked = c.locked && !unlocked.includes(c.id)
      const all = personas.filter(p => p.categoria === c.id).length
      const people = locked ? [] : personas.filter(p => p.categoria === c.id && matches(p)).sort(sortFn)
      return {
        id: c.id, name: c.name, catId: c.id, addable: true,
        isLocked: locked, hasPeople: people.length > 0,
        isEmpty: !locked && people.length === 0 && !q,
        people, count: locked ? all : people.length,
        lockedNote: `${all} ${all === 1 ? 'vínculo guardado' : 'vínculos guardados'}`,
      }
    }
    if (activeCat !== 'all') {
      const c = cats.find(x => x.id === activeCat)
      return c ? [build(c)] : []
    }
    let secs = cats.map(build)
    if (q) secs = secs.filter(s => s.hasPeople || s.isLocked)
    return secs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, cats, activeCat, unlocked, sort, q])

  const excepcionales = useMemo(() => {
    if (activeCat !== 'all') return []
    return personas.filter(p => p.excepcional && !isCatLocked(p.categoria) && matches(p)).sort(sorter('importancia'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, activeCat, unlocked, q])

  const anyPeople = sections.some(s => s.hasPeople)
  const noResults = !!q && !anyPeople && excepcionales.length === 0

  const detailP = detailId ? personas.find(p => p.id === detailId) ?? null : null
  const stats = `${personas.length} ${personas.length === 1 ? 'persona' : 'personas'} · ${cats.length} ${cats.length === 1 ? 'categoría' : 'categorías'}`

  let clock = '', fecha = ''
  if (now) {
    try {
      clock = now.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
      fecha = now.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'long' })
    } catch { clock = now.toLocaleTimeString(); fecha = now.toLocaleDateString() }
  }

  // ---- actions ----
  const blankDraft = (cat: string | null): Draft => {
    const first = cats.find(c => !c.locked)
    return {
      id: null, nombre: '', categoria: cat || (first ? first.id : 'otros'), importancia: 3,
      excepcional: false, significado: '', conocimos: '', gusta: '', notas: '',
      ultima_vez: '', cumple: '', celular: '', email: '', direccion_actual: '',
      direcciones_previas: [], links: [],
    }
  }
  const openNew = (cat: string | null) => { setEditing('new'); setDraft(blankDraft(cat)) }
  const openEdit = (p: Persona) => {
    setDetailId(null); setEditing(p.id)
    setDraft({
      id: p.id, nombre: p.nombre, categoria: p.categoria, importancia: p.importancia || 3,
      excepcional: !!p.excepcional, significado: p.significado || '', conocimos: p.conocimos || '',
      gusta: p.gusta || '', notas: p.notas || '', ultima_vez: p.ultima_vez || '', cumple: p.cumple || '',
      celular: p.celular || '', email: p.email || '', direccion_actual: p.direccion_actual || '',
      direcciones_previas: [...(p.direcciones_previas || [])], links: [...(p.links || [])],
    })
  }
  const patch = (k: keyof Draft, v: unknown) => setDraft(d => (d ? { ...d, [k]: v } : d))
  const saveDraft = () => {
    if (!draft || !draft.nombre.trim()) return
    const payload = {
      ...(draft.id ? { id: draft.id } : {}),
      nombre: draft.nombre.trim(),
      categoria: draft.categoria,
      importancia: draft.importancia || 3,
      excepcional: draft.excepcional,
      significado: draft.significado || null,
      conocimos: draft.conocimos || null,
      gusta: draft.gusta || null,
      notas: draft.notas || null,
      ultima_vez: draft.ultima_vez || null,
      cumple: draft.cumple || null,
      celular: draft.celular || null,
      email: draft.email || null,
      direccion_actual: draft.direccion_actual || null,
      direcciones_previas: draft.direcciones_previas.map(x => x.trim()).filter(Boolean),
      links: draft.links.filter(l => l && (l.url || l.label)),
    }
    startTransition(async () => {
      await upsertPersona(payload)
      setEditing(null); setDraft(null)
      router.refresh()
    })
  }
  const remove = (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('¿Eliminar a esta persona del archivo?')) return
    startTransition(async () => { await deletePersona(id); setDetailId(null); router.refresh() })
  }
  const markSeen = (id: string) => startTransition(async () => { await marcarVistoHoy(id); router.refresh() })
  const saveCat = () => {
    if (!catDraft.name.trim()) return
    startTransition(async () => {
      await addCategoria(catDraft)
      setCatModal(false); setCatDraft({ name: '', locked: false, password: '' })
      router.refresh()
    })
  }
  const submitPass = () => {
    if (!passModal) return
    const cat = cats.find(c => c.id === passModal.catId)
    if (cat && passInput === (cat.password || '')) {
      setUnlocked(u => (u.includes(cat.id) ? u : [...u, cat.id]))
      if (passModal.then === 'filter') setActiveCat(cat.id)
      setPassModal(null); setPassInput(''); setPassError(false)
    } else setPassError(true)
  }
  const onPill = (id: string) => {
    if (id === 'all') { setActiveCat('all'); return }
    if (isCatLocked(id)) { setPassModal({ catId: id, then: 'filter' }); setPassInput(''); setPassError(false) }
    else setActiveCat(id)
  }
  const doImport = () => startTransition(async () => { await importarDeRecuerdos(pendientes); router.refresh() })

  const pills = [{ id: 'all', name: 'Todas', locked: false }]
    .concat(cats.map(c => ({ id: c.id, name: c.name, locked: c.locked && !unlocked.includes(c.id) })))

  // ---- render ----
  return (
    <div style={{ minHeight: '100vh', background: '#ECE3D3', fontFamily: "'Manrope',sans-serif", paddingBottom: 60 }}>
      <link href={FONTS} rel="stylesheet" />
      <style>{`@keyframes dvpop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}@keyframes dvfade{from{opacity:0}to{opacity:1}}
        .pv-card{transition:transform .15s,box-shadow .15s,border-color .15s}
        .pv-card:hover{transform:translateY(-3px);box-shadow:0 10px 26px rgba(11,26,51,.11);border-color:rgba(11,26,51,.16)}
        .pv-cardx:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(0,0,0,.3);border-color:rgba(199,154,58,.7)}`}</style>

      {/* ===== Header dorado (sticky) ===== */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, padding: '14px 16px 0' }}>
        <header style={{
          maxWidth: 1200, margin: '0 auto', position: 'relative', overflow: 'hidden',
          borderRadius: 18, padding: '16px 22px',
          background: 'linear-gradient(135deg,#0B1A33 0%,#15305a 55%,#0B1A33 100%)',
          border: '1px solid rgba(199,154,58,.3)', boxShadow: '0 14px 34px rgba(11,26,51,.25)',
        }}>
          <img src="/lion_gold.png" alt="" style={{ position: 'absolute', right: -10, bottom: -46, height: 200, opacity: .08, pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', position: 'relative' }}>
            <Link href="/" title="Volver al inicio" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(245,241,232,.22)', background: 'rgba(245,241,232,.06)', color: '#F5F1E8', textDecoration: 'none', flex: 'none', fontSize: 16 }}>‹</Link>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lion_gold.png" alt="Emblema" style={{ height: 46, width: 'auto', flex: 'none' }} />
            <div style={{ flex: 'none' }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 28, fontWeight: 600, color: '#F5F1E8', lineHeight: 1, letterSpacing: '.2px' }}>Mi Vida</div>
              <div style={{ fontSize: 10, letterSpacing: '2.6px', textTransform: 'uppercase', color: 'rgba(199,154,58,.9)', marginTop: 4 }}>Archivo de personas · ADVL</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={chip}>
                <span style={{ fontSize: 10, letterSpacing: '1px', color: 'rgba(199,154,58,.85)' }}>MX</span>
                <b style={{ fontWeight: 700, color: '#F5F1E8', fontVariantNumeric: 'tabular-nums' }}>{clock || '—'}</b>
              </span>
              <span style={{ ...chip, textTransform: 'capitalize' }}>{fecha || '—'}</span>
              <span style={{ ...chip, background: 'rgba(63,178,127,.12)', border: '1px solid rgba(63,178,127,.35)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3FB27F', boxShadow: '0 0 0 3px rgba(63,178,127,.2)' }} />
                <span>Supabase · {personas.length}</span>
              </span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
                style={{ fontSize: 13, padding: '8px 15px', border: '1px solid rgba(245,241,232,.25)', borderRadius: 999, background: 'rgba(245,241,232,.1)', color: '#F5F1E8', width: 170, outline: 'none' }} />
              <button onClick={() => openNew(null)} style={{ fontSize: 13, fontWeight: 700, padding: '9px 17px', border: 'none', borderRadius: 999, background: 'linear-gradient(#E7BE63,#C79A3A)', color: '#3A2A08', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(199,154,58,.3)' }}>✦ Nueva persona</button>
            </div>
          </div>
        </header>
      </div>

      {/* ===== Toolbar ===== */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 20px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 180 }}>
          {pills.map(pl => (
            <button key={pl.id} onClick={() => onPill(pl.id)} style={pillStyle(activeCat === pl.id)}>
              {pl.locked && <LockGlyph />}
              {pl.name}
            </button>
          ))}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}
          style={{ fontSize: 13, padding: '8px 12px', border: '1px solid rgba(11,26,51,.15)', borderRadius: 999, background: 'rgba(255,255,255,.55)', color: '#0B1A33', outline: 'none', cursor: 'pointer' }}>
          <option value="importancia">Ordenar: Importancia</option>
          <option value="reciente">Ordenar: Visto recientemente</option>
          <option value="nombre">Ordenar: Nombre</option>
        </select>
        <button onClick={() => setCatModal(true)} style={{ fontSize: 13, fontWeight: 500, padding: '8px 14px', border: '1px solid rgba(11,26,51,.2)', borderRadius: 999, background: 'transparent', color: '#0B1A33', cursor: 'pointer' }}>+ Categoría</button>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '10px 20px 0', fontSize: 12, color: 'rgba(11,26,51,.42)', letterSpacing: '.3px' }}>{stats}</div>

      {/* ===== Banner: importar personas de recuerdos ===== */}
      {pendientes.length > 0 && (
        <div style={{ maxWidth: 1200, margin: '14px auto 0', padding: '13px 18px', borderRadius: 12, background: '#fff3ef', border: '1px solid #f0d5c8', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: '#5a4a3a' }}>
            <b style={{ color: '#9c5436' }}>{pendientes.length}</b> {pendientes.length === 1 ? 'persona mencionada' : 'personas mencionadas'} en tus recuerdos aún no tienen ficha
            <span style={{ color: 'rgba(11,26,51,.45)' }}> — {pendientes.slice(0, 6).join(', ')}{pendientes.length > 6 ? '…' : ''}</span>
          </div>
          <button onClick={doImport} disabled={pending} style={{ fontSize: 13, fontWeight: 700, padding: '9px 18px', border: 'none', borderRadius: 999, background: '#0B1A33', color: '#F5F1E8', cursor: pending ? 'default' : 'pointer', opacity: pending ? .6 : 1 }}>
            {pending ? 'Importando…' : `Importar ${pendientes.length}`}
          </button>
        </div>
      )}

      {/* ===== Main ===== */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 20px 40px' }}>
        {/* Excepcionales */}
        {excepcionales.length > 0 && (
          <section style={{ margin: '0 0 40px', background: 'linear-gradient(135deg,#0B1A33,#15305a)', border: '1px solid rgba(199,154,58,.32)', borderRadius: 18, padding: '24px 26px 26px', boxShadow: '0 12px 30px rgba(11,26,51,.2)', position: 'relative', overflow: 'hidden' }}>
            <img src="/lion_gold.png" alt="" style={{ position: 'absolute', right: -10, bottom: -40, height: 200, opacity: .06, pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '0 0 18px', position: 'relative', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, color: '#E7BE63' }}>✦</span>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 28, fontWeight: 600, color: '#F5F1E8', margin: 0, lineHeight: 1 }}>Personas excepcionales</h2>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', color: 'rgba(199,154,58,.85)' }}>LAS QUE MÁS IMPORTAN</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(258px,1fr))', gap: 16, position: 'relative' }}>
              {excepcionales.map(p => (
                <div key={p.id} className="pv-cardx" onClick={() => setDetailId(p.id)} style={{ position: 'relative', background: 'rgba(245,241,232,.05)', border: '1px solid rgba(199,154,58,.4)', borderRadius: 13, padding: '16px 16px 15px', cursor: 'pointer', transition: 'transform .15s,box-shadow .15s,border-color .15s' }}>
                  <div style={{ position: 'absolute', top: 12, right: 13, fontSize: 14, color: '#E7BE63' }}>✦</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ ...mono, background: '#F5F1E8', color: '#0B1A33', boxShadow: '0 0 0 2px #C79A3A' }}>{initials(p.nombre)}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ ...cardName, color: '#F5F1E8' }}>{p.nombre}</div>
                      <div style={{ fontSize: 10, letterSpacing: '1.3px', textTransform: 'uppercase', color: 'rgba(199,154,58,.85)', marginTop: 4 }}>{catName[p.categoria || ''] || '—'}</div>
                    </div>
                  </div>
                  <Dots lvl={p.importancia || 3} gold light />
                  <div style={{ fontSize: 12, color: 'rgba(245,241,232,.6)', marginTop: 13 }}>{relTime(p.ultima_vez)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Secciones por categoría */}
        {sections.map(s => (
          <section key={s.id} style={{ margin: '0 0 40px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '0 0 16px', borderBottom: '1px solid rgba(11,26,51,.1)', paddingBottom: 9 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 27, fontWeight: 600, color: '#0B1A33', margin: 0, lineHeight: 1 }}>{s.name}</h2>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', color: 'rgba(11,26,51,.4)' }}>{s.count}</span>
              {s.addable && (
                <button onClick={() => openNew(s.catId)} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, padding: '5px 11px', border: '1px solid rgba(11,26,51,.15)', borderRadius: 999, background: 'transparent', color: 'rgba(11,26,51,.7)', cursor: 'pointer' }}>+ Agregar aquí</button>
              )}
            </div>

            {s.isLocked && (
              <div style={{ border: '1px dashed rgba(11,26,51,.22)', borderRadius: 14, padding: '34px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'rgba(11,26,51,.025)' }}>
                <BigLock />
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: '#0B1A33' }}>Categoría protegida</div>
                <div style={{ fontSize: 13, color: 'rgba(11,26,51,.5)' }}>{s.lockedNote}</div>
                <button onClick={() => { setPassModal({ catId: s.catId, then: 'view' }); setPassInput(''); setPassError(false) }} style={{ marginTop: 4, fontSize: 13, fontWeight: 600, padding: '9px 18px', border: '1px solid #1F4F86', borderRadius: 999, background: '#1F4F86', color: '#fff', cursor: 'pointer' }}>Desbloquear</button>
              </div>
            )}

            {s.isEmpty && (
              <div style={{ border: '1px dashed rgba(11,26,51,.18)', borderRadius: 14, padding: 30, textAlign: 'center', fontSize: 13, color: 'rgba(11,26,51,.45)' }}>
                Aún no hay personas en esta categoría.
                <button onClick={() => openNew(s.catId)} style={{ display: 'block', margin: '12px auto 0', fontSize: 13, fontWeight: 600, padding: '8px 16px', border: '1px solid #0B1A33', borderRadius: 999, background: '#0B1A33', color: '#F5F1E8', cursor: 'pointer' }}>Agregar la primera</button>
              </div>
            )}

            {s.hasPeople && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(258px,1fr))', gap: 16 }}>
                {s.people.map(p => (
                  <div key={p.id} className="pv-card" onClick={() => setDetailId(p.id)} style={{ position: 'relative', background: '#FBF7EF', border: '1px solid rgba(11,26,51,.09)', borderRadius: 13, padding: '16px 16px 15px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,26,51,.04)' }}>
                    {p.excepcional && <div style={{ position: 'absolute', top: 11, right: 13, fontSize: 13, color: '#C79A3A' }}>✦</div>}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ ...mono, background: '#0B1A33', color: '#F5F1E8' }}>{initials(p.nombre)}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ ...cardName, color: '#0B1A33' }}>{p.nombre}</div>
                        <div style={{ fontSize: 10, letterSpacing: '1.3px', textTransform: 'uppercase', color: 'rgba(11,26,51,.42)', marginTop: 4 }}>{catName[p.categoria || ''] || '—'}</div>
                      </div>
                    </div>
                    <Dots lvl={p.importancia || 3} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'rgba(11,26,51,.55)', marginTop: 13 }}>
                      <span>{relTime(p.ultima_vez)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        {noResults && (
          <div style={{ textAlign: 'center', padding: '70px 20px', color: 'rgba(11,26,51,.45)' }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, color: '#0B1A33', marginBottom: 6 }}>Sin resultados</div>
            <div style={{ fontSize: 14 }}>No encontré personas que coincidan con tu búsqueda.</div>
          </div>
        )}

        {personas.length === 0 && !q && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(11,26,51,.5)' }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, color: '#0B1A33', marginBottom: 6 }}>Tu archivo está vacío</div>
            <div style={{ fontSize: 14, marginBottom: 16 }}>Agrega tu primera persona o importa las que ya mencionas en tus recuerdos.</div>
            <button onClick={() => openNew(null)} style={{ fontSize: 14, fontWeight: 700, padding: '11px 22px', border: 'none', borderRadius: 999, background: '#0B1A33', color: '#F5F1E8', cursor: 'pointer' }}>✦ Nueva persona</button>
          </div>
        )}
      </main>

      {/* ===== Expediente (detalle) ===== */}
      {detailP && (
        <Overlay onClose={() => setDetailId(null)}>
          <div style={{ position: 'relative', padding: '30px 32px 26px', background: '#0B1A33', color: '#F5F1E8', overflow: 'hidden' }}>
            <img src="/lion_cream.png" alt="" style={{ position: 'absolute', right: -24, top: -30, height: 180, opacity: .07, pointerEvents: 'none' }} />
            <button onClick={() => setDetailId(null)} style={{ position: 'absolute', top: 20, right: 22, width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(245,241,232,.25)', background: 'transparent', color: '#F5F1E8', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', position: 'relative' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F5F1E8', color: '#0B1A33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 600, flex: 'none', boxShadow: '0 0 0 2px rgba(199,154,58,.5)' }}>{initials(detailP.nombre)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'rgba(245,241,232,.55)', marginBottom: 5 }}>{catName[detailP.categoria || ''] || '—'}</div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, fontWeight: 600, lineHeight: 1.02 }}>{detailP.nombre}</div>
              </div>
            </div>
            <div style={{ marginTop: 16, position: 'relative' }}><Dots lvl={detailP.importancia || 3} big /></div>
            {detailP.excepcional && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 13, background: 'linear-gradient(#E7BE63,#C79A3A)', color: '#3A2A08', fontSize: 11, fontWeight: 700, letterSpacing: '.5px', padding: '5px 12px', borderRadius: 999 }}>✦ Persona excepcional</div>
            )}
          </div>

          <div style={{ padding: '26px 32px 32px' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              <MetaBox label="Última vez" value={relTime(detailP.ultima_vez)} />
              {fmtCumple(detailP.cumple) && <MetaBox label="Cumpleaños" value={fmtCumple(detailP.cumple)} />}
            </div>

            {(detailP.celular || detailP.email || detailP.direccion_actual || (detailP.direcciones_previas || []).some(x => x?.trim())) && (
              <div style={{ marginBottom: 22, background: '#FBF7EF', border: '1px solid rgba(11,26,51,.09)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#B0862B', marginBottom: 13, fontWeight: 600 }}>Contacto e información</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {detailP.celular && <ContactRow label="Celular" value={detailP.celular} />}
                  {detailP.email && <ContactRow label="Email" value={detailP.email} href={`mailto:${detailP.email}`} />}
                  {detailP.direccion_actual && <ContactRow label="Dirección actual" value={detailP.direccion_actual} />}
                  {(detailP.direcciones_previas || []).filter(x => x?.trim()).length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, color: 'rgba(11,26,51,.5)', flex: 'none' }}>Ha vivido en</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#0B1A33', textAlign: 'right' }}>{(detailP.direcciones_previas || []).filter(x => x?.trim()).join(' · ')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DetailBlock title="Qué significa para mí" text={detailP.significado} italic />
            <DetailBlock title="Cómo nos conocimos" text={detailP.conocimos} />
            <DetailBlock title="Qué me gusta hacer" text={detailP.gusta} />
            <DetailBlock title="Información de la persona" text={detailP.notas} />

            {(detailP.links || []).filter(l => l?.url).length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#B0862B', marginBottom: 10, fontWeight: 600 }}>Enlaces</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(detailP.links || []).filter(l => l?.url).map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600, color: '#1F4F86', wordBreak: 'break-all' }}>{l.label || l.url}</a>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 26 }}>
              <button onClick={() => markSeen(detailP.id)} disabled={pending} style={{ fontSize: 13, fontWeight: 700, padding: '10px 18px', border: 'none', borderRadius: 999, background: 'linear-gradient(#E7BE63,#C79A3A)', color: '#3A2A08', cursor: 'pointer' }}>Marcar visto hoy</button>
              <button onClick={() => openEdit(detailP)} style={{ fontSize: 13, fontWeight: 700, padding: '10px 18px', border: 'none', borderRadius: 999, background: '#0B1A33', color: '#F5F1E8', cursor: 'pointer' }}>Editar</button>
              <button onClick={() => remove(detailP.id)} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, padding: '10px 18px', border: '1px solid rgba(178,63,63,.4)', borderRadius: 999, background: 'rgba(178,63,63,.06)', color: '#a33', cursor: 'pointer' }}>Eliminar</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ===== Editor ===== */}
      {editing !== null && draft && (
        <Overlay onClose={() => { setEditing(null); setDraft(null) }}>
          <div style={{ padding: '24px 28px', background: '#0B1A33', color: '#F5F1E8' }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 600 }}>{editing === 'new' ? 'Nueva persona' : 'Editar persona'}</div>
          </div>
          <div style={{ padding: '22px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FieldEl label="Nombre">
              <input value={draft.nombre} onChange={e => patch('nombre', e.target.value)} placeholder="Nombre completo" style={inp} />
            </FieldEl>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <FieldEl label="Categoría" grow>
                <select value={draft.categoria || ''} onChange={e => patch('categoria', e.target.value)} style={inp}>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FieldEl>
              <FieldEl label="Última vez que la vi" grow>
                <input type="date" value={draft.ultima_vez} onChange={e => patch('ultima_vez', e.target.value)} style={inp} />
              </FieldEl>
            </div>

            <FieldEl label={`Importancia — ${IMP_PERSONA[draft.importancia] || '—'}`}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => patch('importancia', n)} aria-label={`Importancia ${n}`}
                    style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', background: n <= draft.importancia ? '#C79A3A' : 'rgba(11,26,51,.15)' }} />
                ))}
              </div>
            </FieldEl>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.excepcional} onChange={e => patch('excepcional', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#C79A3A', cursor: 'pointer', flex: 'none', marginTop: 2 }} />
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0B1A33' }}>✦ Persona excepcional</span>
                <span style={{ display: 'block', fontSize: 12, color: 'rgba(11,26,51,.5)', marginTop: 2 }}>Se destaca con distintivo dorado en su propia sección.</span>
              </span>
            </label>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <FieldEl label="Celular" grow><input value={draft.celular} onChange={e => patch('celular', e.target.value)} style={inp} /></FieldEl>
              <FieldEl label="Email" grow><input value={draft.email} onChange={e => patch('email', e.target.value)} style={inp} /></FieldEl>
            </div>
            <FieldEl label="Dirección actual"><input value={draft.direccion_actual} onChange={e => patch('direccion_actual', e.target.value)} style={inp} /></FieldEl>

            <FieldEl label="Otras direcciones donde ha vivido">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draft.direcciones_previas.map((v, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <input value={v} onChange={e => patch('direcciones_previas', draft.direcciones_previas.map((x, j) => j === i ? e.target.value : x))} style={{ ...inp, flex: 1 }} />
                    <button onClick={() => patch('direcciones_previas', draft.direcciones_previas.filter((_, j) => j !== i))} style={miniX}>✕</button>
                  </div>
                ))}
                <button onClick={() => patch('direcciones_previas', [...draft.direcciones_previas, ''])} style={addBtn}>+ Agregar dirección</button>
              </div>
            </FieldEl>

            <FieldEl label="Qué significa para mí"><textarea value={draft.significado} onChange={e => patch('significado', e.target.value)} style={{ ...inp, minHeight: 70, resize: 'vertical' }} /></FieldEl>
            <FieldEl label="Cómo nos conocimos"><textarea value={draft.conocimos} onChange={e => patch('conocimos', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} /></FieldEl>
            <FieldEl label="Qué me gusta hacer con ella/él"><textarea value={draft.gusta} onChange={e => patch('gusta', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} /></FieldEl>
            <FieldEl label="Información de la persona"><textarea value={draft.notas} onChange={e => patch('notas', e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} /></FieldEl>
            <FieldEl label="Cumpleaños"><input type="date" value={draft.cumple} onChange={e => patch('cumple', e.target.value)} style={inp} /></FieldEl>

            <FieldEl label="Enlaces">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draft.links.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <input value={l.label} placeholder="Etiqueta" onChange={e => patch('links', draft.links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ ...inp, width: 130 }} />
                    <input value={l.url} placeholder="https://…" onChange={e => patch('links', draft.links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} style={{ ...inp, flex: 1 }} />
                    <button onClick={() => patch('links', draft.links.filter((_, j) => j !== i))} style={miniX}>✕</button>
                  </div>
                ))}
                <button onClick={() => patch('links', [...draft.links, { label: '', url: '' }])} style={addBtn}>+ Agregar enlace</button>
              </div>
            </FieldEl>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => { setEditing(null); setDraft(null) }} style={{ fontSize: 14, fontWeight: 600, padding: '10px 18px', border: '1px solid rgba(11,26,51,.2)', borderRadius: 999, background: 'transparent', color: '#0B1A33', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={saveDraft} disabled={pending || !draft.nombre.trim()} style={{ fontSize: 14, fontWeight: 700, padding: '10px 22px', border: 'none', borderRadius: 999, background: '#0B1A33', color: '#F5F1E8', cursor: 'pointer', opacity: (pending || !draft.nombre.trim()) ? .5 : 1 }}>{pending ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ===== Nueva categoría ===== */}
      {catModal && (
        <Overlay onClose={() => setCatModal(false)} narrow>
          <div style={{ padding: '24px 28px 28px' }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 600, color: '#0B1A33', marginBottom: 18 }}>Nueva categoría</div>
            <FieldEl label="Nombre"><input value={catDraft.name} onChange={e => setCatDraft({ ...catDraft, name: e.target.value })} style={inp} /></FieldEl>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', margin: '16px 0' }}>
              <input type="checkbox" checked={catDraft.locked} onChange={e => setCatDraft({ ...catDraft, locked: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#C79A3A', cursor: 'pointer' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0B1A33' }}>Proteger con contraseña</span>
            </label>
            {catDraft.locked && <FieldEl label="Contraseña"><input value={catDraft.password} onChange={e => setCatDraft({ ...catDraft, password: e.target.value })} style={inp} /></FieldEl>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setCatModal(false)} style={{ fontSize: 14, fontWeight: 600, padding: '10px 18px', border: '1px solid rgba(11,26,51,.2)', borderRadius: 999, background: 'transparent', color: '#0B1A33', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={saveCat} disabled={pending || !catDraft.name.trim()} style={{ fontSize: 14, fontWeight: 700, padding: '10px 22px', border: 'none', borderRadius: 999, background: '#0B1A33', color: '#F5F1E8', cursor: 'pointer', opacity: (pending || !catDraft.name.trim()) ? .5 : 1 }}>Crear</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ===== Contraseña ===== */}
      {passModal && (
        <Overlay onClose={() => { setPassModal(null); setPassInput(''); setPassError(false) }} narrow>
          <div style={{ padding: '28px 28px 26px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><BigLock /></div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 600, color: '#0B1A33', marginBottom: 4 }}>{cats.find(c => c.id === passModal.catId)?.name}</div>
            <div style={{ fontSize: 13, color: 'rgba(11,26,51,.5)', marginBottom: 18 }}>Categoría protegida. Ingresa la contraseña.</div>
            <input type="password" value={passInput} autoFocus onChange={e => { setPassInput(e.target.value); setPassError(false) }}
              onKeyDown={e => e.key === 'Enter' && submitPass()}
              style={{ ...inp, textAlign: 'center', borderColor: passError ? '#b33' : 'rgba(11,26,51,.2)' }} />
            {passError && <div style={{ fontSize: 12, color: '#b33', marginTop: 8 }}>Contraseña incorrecta</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
              <button onClick={() => { setPassModal(null); setPassInput(''); setPassError(false) }} style={{ fontSize: 14, fontWeight: 600, padding: '10px 18px', border: '1px solid rgba(11,26,51,.2)', borderRadius: 999, background: 'transparent', color: '#0B1A33', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submitPass} style={{ fontSize: 14, fontWeight: 700, padding: '10px 22px', border: 'none', borderRadius: 999, background: '#1F4F86', color: '#fff', cursor: 'pointer' }}>Desbloquear</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}

// ---------- subcomponents ----------
function Dots({ lvl, gold, light, big }: { lvl: number; gold?: boolean; light?: boolean; big?: boolean }) {
  const size = big ? 8 : 6
  const filled = gold ? '#E7BE63' : '#C79A3A'
  const empty = light ? 'rgba(245,241,232,.2)' : 'rgba(11,26,51,.14)'
  const labelColor = light ? '#E7BE63' : (big ? '#D9B45E' : '#B0862B')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: big ? 4 : 3, alignItems: 'center' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ width: size, height: size, borderRadius: '50%', background: i < lvl ? filled : empty }} />
        ))}
      </div>
      <span style={{ fontSize: big ? 11 : 10, fontWeight: 600, letterSpacing: big ? '1px' : '.8px', color: labelColor, textTransform: 'uppercase' }}>{IMP_PERSONA[lvl] || ''}</span>
    </div>
  )
}

function Overlay({ children, onClose, narrow }: { children: React.ReactNode; onClose: () => void; narrow?: boolean }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(11,26,51,.4)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 18px', overflowY: 'auto', animation: 'dvfade .2s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: `min(${narrow ? 420 : 560}px,100%)`, background: '#F5F1E8', borderRadius: 18, boxShadow: '0 30px 75px rgba(11,26,51,.32)', overflow: 'hidden', animation: 'dvpop .24s ease' }}>
        {children}
      </div>
    </div>
  )
}

function MetaBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 130, background: '#FBF7EF', border: '1px solid rgba(11,26,51,.09)', borderRadius: 11, padding: '13px 15px' }}>
      <div style={{ fontSize: 10, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(11,26,51,.45)', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#0B1A33' }}>{value}</div>
    </div>
  )
}

function ContactRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' }}>
      <span style={{ fontSize: 12, color: 'rgba(11,26,51,.5)', flex: 'none' }}>{label}</span>
      {href
        ? <a href={href} style={{ fontSize: 14, fontWeight: 700, color: '#1F4F86', textAlign: 'right', wordBreak: 'break-all' }}>{value}</a>
        : <span style={{ fontSize: 14, fontWeight: 700, color: '#0B1A33', textAlign: 'right' }}>{value}</span>}
    </div>
  )
}

function DetailBlock({ title, text, italic }: { title: string; text: string | null; italic?: boolean }) {
  if (!text || !text.trim()) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#B0862B', marginBottom: 8, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 15, lineHeight: 1.6, color: '#2c2620', fontFamily: italic ? "'Cormorant Garamond',serif" : undefined, fontStyle: italic ? 'italic' : undefined, fontWeight: italic ? 500 : 400, whiteSpace: 'pre-wrap' }}>{text}</div>
    </div>
  )
}

function FieldEl({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <label style={{ display: 'block', flex: grow ? 1 : undefined, minWidth: grow ? 160 : undefined }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.6px', textTransform: 'uppercase', color: 'rgba(11,26,51,.5)', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  )
}

function LockGlyph() {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 9, height: 11, marginRight: 1 }}>
      <span style={{ position: 'absolute', bottom: 0, left: 0, width: 9, height: 6, background: 'currentColor', borderRadius: 1 }} />
      <span style={{ position: 'absolute', top: 0, left: 2, width: 5, height: 5, border: '1.5px solid currentColor', borderBottom: 'none', borderRadius: '3px 3px 0 0' }} />
    </span>
  )
}
function BigLock() {
  return (
    <div style={{ position: 'relative', width: 26, height: 30 }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 26, height: 18, background: '#0B1A33', borderRadius: 4 }} />
      <div style={{ position: 'absolute', top: 0, left: 5, width: 16, height: 16, border: '3px solid #0B1A33', borderBottom: 'none', borderRadius: '9px 9px 0 0' }} />
    </div>
  )
}

// ---------- styles ----------
const chip: CSSProperties = { fontSize: 12, color: 'rgba(245,241,232,.85)', background: 'rgba(245,241,232,.07)', border: '1px solid rgba(245,241,232,.14)', borderRadius: 999, padding: '7px 13px', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }
const mono: CSSProperties = { width: 46, height: 46, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 600, letterSpacing: '.5px', flex: 'none' }
const cardName: CSSProperties = { fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 600, lineHeight: 1.08, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const inp: CSSProperties = { width: '100%', padding: '9px 13px', borderRadius: 10, border: '1px solid rgba(11,26,51,.2)', background: '#fff', fontSize: 14, color: '#0B1A33', outline: 'none', fontFamily: "'Manrope',sans-serif", boxSizing: 'border-box' }
const miniX: CSSProperties = { flex: 'none', width: 36, borderRadius: 10, border: '1px solid rgba(11,26,51,.15)', background: 'transparent', color: 'rgba(11,26,51,.5)', cursor: 'pointer', fontSize: 13 }
const addBtn: CSSProperties = { alignSelf: 'flex-start', fontSize: 13, fontWeight: 600, padding: '7px 14px', border: '1px dashed rgba(11,26,51,.25)', borderRadius: 999, background: 'transparent', color: '#0B1A33', cursor: 'pointer' }

function pillStyle(active: boolean): CSSProperties {
  return {
    fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
    whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
    border: '1px solid ' + (active ? '#0B1A33' : 'rgba(11,26,51,.15)'),
    background: active ? '#0B1A33' : 'transparent',
    color: active ? '#F5F1E8' : 'rgba(11,26,51,.72)',
  }
}
