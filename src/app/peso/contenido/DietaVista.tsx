'use client'

// La dieta: las comidas del día (con su parte de la proteína), los totales que se suman solos y la lista del súper
// con casillas para marcar a mano (se guardan en este dispositivo).

import { useCallback, useEffect, useState } from 'react'
import { fmtNum, totalesDieta, type Comida, type DocDieta, type GrupoSuper, type ItemComida, type ItemSuper } from '@/lib/peso-contenido'
import { COLOR } from '../ui'
import { Agregar, CajaEd, Ctl, ListaStr, N, T, useDoc } from './edicion'
import { Indice, Portada, Secciones } from './Bloques'

// ── Una comida ──────────────────────────────────────────────────────────────

function BarraProteina({ pct, texto }: { pct: number; texto: string }) {
  return (
    <div className="mt-3">
      <p style={{ fontSize: 12, color: COLOR.muted }}>{texto}</p>
      <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(15,35,64,.08)' }} role="img" aria-label={texto}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: `linear-gradient(90deg,${COLOR.gold},${COLOR.goldLight})` }} />
      </div>
    </div>
  )
}

function ItemVista({ it }: { it: ItemComida }) {
  if (it.k === 'elige' && it.ops?.length) {
    return (
      <li className="rounded-xl p-2.5" style={{ background: '#FBF5E6', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.gold}` }}>
        <div style={{ font: '800 11px/1.3 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: '#6B4D14' }}>{it.t}</div>
        <ul className="mt-1.5 space-y-1">
          {it.ops.map((o, i) => (
            <li key={i} className="flex gap-2" style={{ fontSize: 14, lineHeight: 1.4, color: COLOR.ink }}>
              <span aria-hidden className="shrink-0 text-center" style={{ width: 14, color: COLOR.goldText, fontWeight: 800 }}>{i > 0 ? 'o' : ''}</span>
              <span>{i > 0 && <span className="sr-only">o </span>}{o}</span>
            </li>
          ))}
        </ul>
      </li>
    )
  }
  if (it.k === 'nota') return <li style={{ fontSize: 13, lineHeight: 1.4, color: COLOR.muted, fontStyle: 'italic', paddingLeft: 14 }}>{it.t}</li>
  return (
    <li className="flex gap-2" style={{ fontSize: 14.5, lineHeight: 1.4, color: COLOR.ink }}>
      <span aria-hidden style={{ color: COLOR.goldText }}>•</span><span>{it.t}</span>
    </li>
  )
}

function ComidaVista({ c, total }: { c: Comida; total: { kcal: number; prot: number } }) {
  const pct = total.prot > 0 ? (c.prot / total.prot) * 100 : 0
  return (
    <li>
      <article className="rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${COLOR.line}`, boxShadow: '0 10px 24px -20px rgba(15,35,64,.45)' }}>
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="tabular-nums" style={{ font: '800 13px/1 var(--font-ui)', color: COLOR.goldText }}>{c.hora}</span>
            <h4 className="serif" style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 600, color: COLOR.navy }}>{c.nombre}</h4>
          </div>
          <p className="tabular-nums" style={{ fontSize: 13.5, color: COLOR.ink }}><strong>~{fmtNum(c.kcal)}</strong> kcal · <strong>{fmtNum(c.prot)} g</strong> de proteína</p>
        </header>
        {c.intro && <p className="mt-2" style={{ fontSize: 13.5, fontWeight: 700, color: COLOR.navy }}>{c.intro}</p>}
        <ul className="mt-2.5 space-y-1.5">{c.items.map((it, i) => <ItemVista key={i} it={it} />)}</ul>
        <BarraProteina pct={pct} texto={`Aporta ≈ ${Math.round(pct)} % de la proteína del día`} />
      </article>
    </li>
  )
}

function ComidaEd({ i, n }: { i: number; n: number }) {
  const { doc } = useDoc()
  const c = (doc as DocDieta).comidas[i]
  return (
    <CajaEd titulo={`${c.hora} · ${c.nombre || 'Comida'}`} ctl={<Ctl ruta={['comidas']} i={i} n={n} quitarTxt="Quitar comida" />}>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <T ruta={['comidas', i, 'hora']} etq="Hora" ph="9:00" />
        <T ruta={['comidas', i, 'nombre']} etq="Nombre" className="col-span-1 sm:col-span-1" />
        <N ruta={['comidas', i, 'kcal']} etq="Calorías (kcal)" />
        <N ruta={['comidas', i, 'prot']} etq="Proteína (g)" />
      </div>
      <T ruta={['comidas', i, 'intro']} etq="Línea de introducción (opcional)" ph="Sándwich:" />
      <div className="space-y-2">
        <div style={{ font: '800 11px/1.2 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.goldText }}>Lo que lleva</div>
        {c.items.map((it, j) => (
          <CajaEd key={j} titulo={`Renglón ${j + 1}`} ctl={<Ctl ruta={['comidas', i, 'items']} i={j} n={c.items.length} quitarTxt="Quitar renglón" />}>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <T ruta={['comidas', i, 'items', j, 't']} etq={it.k === 'elige' ? 'Pregunta («Elige una proteína»)' : 'Texto'} />
              <TipoItem ruta={['comidas', i, 'items', j, 'k']} />
            </div>
            {it.k === 'elige' && <ListaStr ruta={['comidas', i, 'items', j, 'ops']} etq="Opciones" agregarTxt="Agregar opción" />}
          </CajaEd>
        ))}
        <Agregar ruta={['comidas', i, 'items']} item={{ t: 'Nuevo ingrediente' }} texto="Agregar renglón" />
      </div>
    </CajaEd>
  )
}

/** Normal / Elige una opción / Nota: el documento guarda `k` solo cuando no es normal. */
function TipoItem({ ruta }: { ruta: (string | number)[] }) {
  const { doc, poner } = useDoc()
  let v: unknown = doc
  for (const k of ruta) v = (v as Record<string | number, unknown> | undefined)?.[k]
  return (
    <label className="block">
      <span className="block mb-0.5" style={{ font: '700 10.5px/1.2 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: COLOR.muted }}>Tipo de renglón</span>
      <select value={v === 'elige' || v === 'nota' ? v : ''} onChange={e => poner(ruta, e.target.value || undefined)}
        className="w-full rounded-lg border bg-white px-2.5 py-1.5 min-h-[38px] text-[13.5px] max-sm:text-base" style={{ borderColor: COLOR.lineStrong, color: COLOR.ink }}>
        <option value="">Ingrediente</option><option value="elige">Elige una opción</option><option value="nota">Nota</option>
      </select>
    </label>
  )
}

function Comidas() {
  const { doc, editando } = useDoc()
  const cs = (doc as DocDieta).comidas
  const total = totalesDieta(cs)
  if (editando) {
    return (
      <div className="space-y-3">
        {cs.map((_, i) => <ComidaEd key={i} i={i} n={cs.length} />)}
        <Agregar ruta={['comidas']} item={() => ({ id: `comida-${Date.now().toString(36)}`, hora: '12:00', nombre: 'Nueva comida', kcal: 0, prot: 0, items: [{ t: 'Ingrediente' }] })} texto="Agregar comida" />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="tabular-nums" style={{ fontSize: 13, color: COLOR.muted }}>El día suma <strong style={{ color: COLOR.navy }}>~{fmtNum(total.kcal)} kcal</strong> y <strong style={{ color: COLOR.navy }}>{fmtNum(total.prot)} g</strong> de proteína.</p>
      <ol className="space-y-3">{cs.map(c => <ComidaVista key={c.id} c={c} total={total} />)}</ol>
    </div>
  )
}

// ── Totales ─────────────────────────────────────────────────────────────────

function Reparto({ titulo, filas, unidad }: { titulo: string; filas: { n: string; v: number }[]; unidad: string }) {
  const total = filas.reduce((a, f) => a + f.v, 0)
  return (
    <figure className="rounded-xl p-3.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
      <figcaption className="serif" style={{ fontSize: 17, fontWeight: 600, color: COLOR.navy }}>{titulo}</figcaption>
      <ul className="mt-2.5 space-y-2">
        {filas.map(f => {
          const pct = total > 0 ? (f.v / total) * 100 : 0
          return (
            <li key={f.n}>
              <div className="flex items-baseline justify-between gap-2 tabular-nums" style={{ fontSize: 12.5, color: COLOR.ink }}>
                <span className="min-w-0 truncate">{f.n}</span><span>{fmtNum(f.v)} {unidad} · {Math.round(pct)} %</span>
              </div>
              <div className="mt-0.5 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(15,35,64,.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLOR.navy2 }} />
              </div>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}

function Totales() {
  const { doc, editando } = useDoc()
  const cs = (doc as DocDieta).comidas
  if (editando) return <p style={{ fontSize: 13, color: COLOR.muted }}>Esta tabla y las gráficas se calculan solas con las comidas de «Tu día».</p>
  const t = totalesDieta(cs)
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${COLOR.line}` }}>
        <table className="w-full text-left tabular-nums" style={{ fontSize: 13.5, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: COLOR.navy, color: COLOR.onDark }}>
              <th scope="col" className="px-3 py-2" style={{ fontSize: 12 }}>Comida</th>
              <th scope="col" className="px-3 py-2 text-right" style={{ fontSize: 12 }}>kcal</th>
              <th scope="col" className="px-3 py-2 text-right" style={{ fontSize: 12 }}>Proteína</th>
            </tr>
          </thead>
          <tbody>
            {cs.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 ? COLOR.card2 : '#fff', borderTop: `1px solid ${COLOR.line}` }}>
                <th scope="row" className="px-3 py-2" style={{ fontWeight: 600, color: COLOR.navy }}><span style={{ color: COLOR.goldText, marginRight: 8 }}>{c.hora}</span>{c.nombre}</th>
                <td className="px-3 py-2 text-right">~{fmtNum(c.kcal)}</td>
                <td className="px-3 py-2 text-right">{fmtNum(c.prot)} g</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#FBF5E6', borderTop: `2px solid ${COLOR.gold}`, fontWeight: 800, color: COLOR.navy }}>
              <th scope="row" className="px-3 py-2">Total</th>
              <td className="px-3 py-2 text-right">~{fmtNum(t.kcal)}</td>
              <td className="px-3 py-2 text-right">~{fmtNum(t.prot)} g</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="tabular-nums" style={{ fontSize: 12.5, color: COLOR.muted }}>
        {cs.map(c => c.kcal).join(' + ')} = {fmtNum(t.kcal)} kcal · {cs.map(c => c.prot).join(' + ')} = {fmtNum(t.prot)} g
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Reparto titulo="Reparto de calorías" unidad="kcal" filas={cs.map(c => ({ n: `${c.hora} ${c.nombre}`, v: c.kcal }))} />
        <Reparto titulo="Reparto de proteína" unidad="g" filas={cs.map(c => ({ n: `${c.hora} ${c.nombre}`, v: c.prot }))} />
      </div>
    </div>
  )
}

// ── Lista del súper ─────────────────────────────────────────────────────────

const LLAVE_MARCAS = 'peso.super.v1'
const llaveItem = (g: GrupoSuper, it: ItemSuper) => `${g.nombre}|${it.n}`

/** Casillas marcadas, guardadas en este dispositivo (no es dato del documento: es tu lista de la semana). */
function useMarcas() {
  const [marcas, setMarcas] = useState<Record<string, true>>({})
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(LLAVE_MARCAS) ?? '{}')
      if (v && typeof v === 'object' && !Array.isArray(v)) setMarcas(v as Record<string, true>)
    } catch { /* sin almacenamiento o dato dañado: se empieza sin marcas */ }
  }, [])
  const guardar = (m: Record<string, true>) => { try { localStorage.setItem(LLAVE_MARCAS, JSON.stringify(m)) } catch { /* sin almacenamiento: las marcas duran la visita */ } }
  const alternar = useCallback((k: string) => setMarcas(prev => {
    const n = { ...prev }
    if (n[k]) delete n[k]; else n[k] = true
    guardar(n)
    return n
  }), [])
  const limpiar = useCallback(() => { setMarcas({}); guardar({}) }, [])
  return { marcas, alternar, limpiar }
}

function SuperVista() {
  const { doc } = useDoc()
  const grupos = (doc as DocDieta).super
  const { marcas, alternar, limpiar } = useMarcas()
  const todos = grupos.reduce((a, g) => a + g.items.length, 0)
  const hechos = grupos.reduce((a, g) => a + g.items.filter(it => marcas[llaveItem(g, it)]).length, 0)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tabular-nums" style={{ fontSize: 13, color: COLOR.muted }}><strong style={{ color: COLOR.navy }}>{hechos}</strong> de {todos} en el carrito</p>
        {hechos > 0 && (
          <button type="button" onClick={limpiar} className="rounded-lg border px-3 min-h-10 text-[12.5px] font-semibold" style={{ borderColor: COLOR.lineStrong, color: COLOR.ink, background: '#fff' }}>Quitar las marcas</button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {grupos.map(g => (
          <section key={g.nombre} className="rounded-xl p-3.5" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
            <h4 className="serif" style={{ fontSize: 19, fontWeight: 600, color: COLOR.navy }}>{g.nombre}</h4>
            <ul className="mt-2 space-y-1.5">
              {g.items.map(it => {
                const k = llaveItem(g, it)
                const on = !!marcas[k]
                return (
                  <li key={it.n}>
                    <label className="flex items-start gap-3 rounded-lg px-2 py-2 cursor-pointer min-h-11" style={{ background: on ? 'rgba(22,163,74,.08)' : '#fff', border: `1px solid ${COLOR.line}` }}>
                      <input type="checkbox" checked={on} onChange={() => alternar(k)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#8A6420]" />
                      <span className="min-w-0 flex-1" style={{ opacity: on ? 0.6 : 1 }}>
                        <span className="flex items-baseline justify-between gap-2">
                          <span style={{ fontSize: 14, fontWeight: 700, color: COLOR.navy, textDecoration: on ? 'line-through' : 'none' }}>{it.n}</span>
                          {it.cant && <span className="shrink-0 tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: COLOR.goldText }}>{it.cant}</span>}
                        </span>
                        {it.sub && <span className="block" style={{ fontSize: 12.5, lineHeight: 1.4, color: COLOR.muted }}>{it.sub}</span>}
                        {it.lista && it.lista.length > 0 && <span className="block" style={{ fontSize: 12.5, color: COLOR.ink }}>{it.lista.join(' · ')}</span>}
                        {it.cuenta && <span className="block tabular-nums" style={{ fontSize: 11.5, color: COLOR.muted }}>{it.cuenta}</span>}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function SuperEd() {
  const { doc } = useDoc()
  const grupos = (doc as DocDieta).super
  return (
    <div className="space-y-3">
      {grupos.map((g, i) => (
        <CajaEd key={i} titulo={g.nombre || 'Grupo'} ctl={<Ctl ruta={['super']} i={i} n={grupos.length} quitarTxt="Quitar grupo" />}>
          <T ruta={['super', i, 'nombre']} etq="Nombre del grupo" />
          {g.items.map((it, j) => (
            <CajaEd key={j} titulo={it.n || 'Producto'} ctl={<Ctl ruta={['super', i, 'items']} i={j} n={g.items.length} quitarTxt="Quitar producto" />}>
              <div className="grid gap-2 sm:grid-cols-2">
                <T ruta={['super', i, 'items', j, 'n']} etq="Producto" />
                <T ruta={['super', i, 'items', j, 'cant']} etq="Cantidad de la semana" ph="1.6 kg" />
                <T ruta={['super', i, 'items', j, 'sub']} etq="Aclaración" />
                <T ruta={['super', i, 'items', j, 'cuenta']} etq="La cuenta" ph="220 g × 7 = 1,540 g" />
              </div>
              <ListaStr ruta={['super', i, 'items', j, 'lista']} etq="Opciones (verduras, básicos…)" agregarTxt="Agregar opción" />
            </CajaEd>
          ))}
          <Agregar ruta={['super', i, 'items']} item={{ n: 'Nuevo producto' }} texto="Agregar producto" />
        </CajaEd>
      ))}
      <Agregar ruta={['super']} item={{ nombre: 'Nuevo grupo', items: [{ n: 'Nuevo producto' }] }} texto="Agregar grupo" />
    </div>
  )
}

// ── Documento ───────────────────────────────────────────────────────────────

export default function DietaVista() {
  const { editando } = useDoc()
  return (
    <div className="space-y-5">
      <Portada />
      <Indice />
      <Secciones especial={tipo => tipo === 'comidas' ? <Comidas /> : tipo === 'totales' ? <Totales /> : tipo === 'super' ? (editando ? <SuperEd /> : <SuperVista />) : null} />
    </div>
  )
}

