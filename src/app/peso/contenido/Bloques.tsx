'use client'

// Bloques genéricos (texto, cifras, tarjetas, lista, aviso, tabla, pasos), secciones y portada. Cada uno se pinta al
// leer y se vuelve formulario al editar, con la misma estructura: lo que ves es lo que editas.

import { useState, type ReactNode } from 'react'
import {
  TIPOS_BLOQUE, TONOS, TONOS_AVISO, bloqueNuevo,
  type Bloque, type Cifra, type DocBase, type Seccion as SeccionDoc, type Tarjeta, type Tono, type TonoAviso, type TipoBloque, type TipoSeccion,
} from '@/lib/peso-contenido'
import { COLOR, Eyebrow, Panel } from '../ui'
import { Agregar, CajaEd, Chk, Ctl, ListaStr, Sel, T, leer, useDoc, type Ruta } from './edicion'

// ── Paleta de tonos ─────────────────────────────────────────────────────────

export const TONO: Record<Tono, { bg: string; borde: string; txt: string }> = {
  oro: { bg: '#FBF5E6', borde: COLOR.gold, txt: '#6B4D14' },
  verde: { bg: '#EFF9F2', borde: COLOR.good, txt: '#166534' },
  rojo: { bg: '#FEF2F1', borde: COLOR.bad, txt: '#991B1B' },
  azul: { bg: '#EEF4FD', borde: COLOR.info, txt: '#1E4FA8' },
  gris: { bg: COLOR.cream, borde: 'rgba(15,35,64,.28)', txt: '#3A4660' },
}
const NOMBRE_TONO: Record<Tono, string> = { oro: 'Dorado', verde: 'Verde', rojo: 'Rojo', azul: 'Azul', gris: 'Gris' }

const AVISO: Record<TonoAviso, { bg: string; borde: string; txt: string; rotulo: string; icono: string }> = {
  tip: { bg: '#EEF4FD', borde: COLOR.info, txt: '#1E4FA8', rotulo: 'Tip', icono: '💡' },
  atencion: { bg: '#FFF8E6', borde: COLOR.warn, txt: '#7A3E06', rotulo: 'Atención', icono: '⚠️' },
  regla: { bg: '#FBF5E6', borde: COLOR.gold, txt: '#6B4D14', rotulo: 'Regla', icono: '📌' },
  revisar: { bg: COLOR.cream, borde: 'rgba(15,35,64,.35)', txt: '#3A4660', rotulo: 'Para revisar', icono: '🔎' },
}
const NOMBRE_AVISO: Record<TonoAviso, string> = { tip: 'Tip', atencion: 'Atención', regla: 'Regla', revisar: 'Para revisar' }

// ── Cifras ──────────────────────────────────────────────────────────────────

export function CifrasVista({ items, dark = false }: { items: Cifra[]; dark?: boolean }) {
  if (!items.length) return null
  return (
    <ul className="grid gap-2.5 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
      {items.map((c, i) => (
        <li key={i} className="rounded-xl px-3.5 py-3 min-w-0"
          style={dark ? { background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)' } : { background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
          <div className="serif tabular-nums" style={{ fontSize: 26, lineHeight: 1.05, fontWeight: 600, color: dark ? COLOR.goldLight : COLOR.navy }}>
            {c.v}{c.u && <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 3, fontFamily: 'var(--font-ui)' }}>{c.u}</span>}
          </div>
          <div className="mt-1" style={{ fontSize: 12, lineHeight: 1.35, color: dark ? COLOR.onDarkMuted : COLOR.muted }}>{c.l}</div>
        </li>
      ))}
    </ul>
  )
}

export function CifrasEd({ ruta }: { ruta: Ruta }) {
  const { doc } = useDoc()
  const items = (leer(doc, ruta) as Cifra[] | undefined) ?? []
  return (
    <div className="space-y-2">
      {items.map((_, i) => (
        <CajaEd key={i} titulo={`Cifra ${i + 1}`} ctl={<Ctl ruta={ruta} i={i} n={items.length} />}>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-[1fr_90px_2fr]">
            <T ruta={[...ruta, i, 'v']} etq="Valor" ph="92.9" />
            <T ruta={[...ruta, i, 'u']} etq="Unidad" ph="kg" />
            <T ruta={[...ruta, i, 'l']} etq="Descripción" ph="hoy" className="col-span-2 sm:col-span-1" />
          </div>
        </CajaEd>
      ))}
      <Agregar ruta={ruta} item={{ v: '0', l: 'Descripción' }} texto="Agregar cifra" />
    </div>
  )
}

// ── Bloques: vista ──────────────────────────────────────────────────────────

function TarjetaVista({ t }: { t: Tarjeta }) {
  const tono = TONO[t.tono || 'gris']
  return (
    <li className="rounded-xl p-3.5 min-w-0" style={{ background: t.tono ? tono.bg : COLOR.card2, border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${t.tono ? tono.borde : COLOR.lineStrong}` }}>
      <div className="flex items-start gap-2.5">
        {t.n && (
          <span aria-hidden className="shrink-0 inline-flex items-center justify-center rounded-full tabular-nums"
            style={{ width: 24, height: 24, fontSize: 12, fontWeight: 800, background: COLOR.navy, color: COLOR.onDark }}>{t.n}</span>
        )}
        <div className="min-w-0 flex-1">
          {t.etiqueta && <div style={{ font: '800 10.5px/1.3 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: t.tono ? tono.txt : COLOR.goldText }}>{t.etiqueta}</div>}
          <h4 className="serif" style={{ fontSize: 19, lineHeight: 1.2, fontWeight: 600, color: COLOR.navy, marginTop: t.etiqueta ? 2 : 0 }}>{t.titulo}</h4>
          {t.texto && <p className="mt-1.5" style={{ fontSize: 13.5, lineHeight: 1.55, color: COLOR.ink }}>{t.texto}</p>}
          {t.lista && t.lista.length > 0 && (
            <ul className="mt-1.5 space-y-1" style={{ fontSize: 13.5, lineHeight: 1.45, color: COLOR.ink }}>
              {t.lista.map((x, j) => <li key={j} className="flex gap-2"><span aria-hidden style={{ color: COLOR.goldText }}>•</span><span>{x}</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
}

function ListaVista({ b }: { b: Extract<Bloque, { k: 'lista' }> }) {
  return (
    <div>
      {b.titulo && <h4 className="serif mb-2" style={{ fontSize: 18, fontWeight: 600, color: COLOR.navy }}>{b.titulo}</h4>}
      {b.chips ? (
        <ul className="flex flex-wrap gap-2">
          {b.items.map((x, i) => <li key={i} className="rounded-full px-3 py-1" style={{ fontSize: 13, fontWeight: 600, background: 'rgba(15,35,64,.06)', color: COLOR.ink, border: `1px solid ${COLOR.line}` }}>{x}</li>)}
        </ul>
      ) : (
        <ul className="space-y-1.5" style={{ fontSize: 14, lineHeight: 1.5, color: COLOR.ink }}>
          {b.items.map((x, i) => <li key={i} className="flex gap-2"><span aria-hidden style={{ color: COLOR.goldText }}>•</span><span>{x}</span></li>)}
        </ul>
      )}
    </div>
  )
}

function TablaVista({ b }: { b: Extract<Bloque, { k: 'tabla' }> }) {
  return (
    <div>
      {b.titulo && <h4 className="serif mb-2" style={{ fontSize: 18, fontWeight: 600, color: COLOR.navy }}>{b.titulo}</h4>}
      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${COLOR.line}` }}>
        <table className="w-full text-left" style={{ fontSize: 13.5, borderCollapse: 'collapse', minWidth: b.cols.length > 2 ? 460 : 0 }}>
          <thead>
            <tr style={{ background: COLOR.navy, color: COLOR.onDark }}>
              {b.cols.map((c, i) => <th key={i} scope="col" className="px-3 py-2 align-bottom" style={{ fontSize: 12, fontWeight: 700 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {b.filas.map((f, i) => (
              <tr key={i} style={{ background: i % 2 ? COLOR.card2 : '#fff', borderTop: `1px solid ${COLOR.line}` }}>
                {f.map((c, j) => j === 0
                  ? <th key={j} scope="row" className="px-3 py-2 align-top" style={{ fontWeight: 700, color: COLOR.navy }}>{c}</th>
                  : <td key={j} className="px-3 py-2 align-top" style={{ color: COLOR.ink }}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.nota && <p className="mt-2" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.muted }}>{b.nota}</p>}
    </div>
  )
}

function BloqueVista({ b }: { b: Bloque }) {
  switch (b.k) {
    case 'texto':
      return b.grande
        ? <p className="serif" style={{ fontSize: 21, lineHeight: 1.4, color: COLOR.navy }}>{b.t}</p>
        : <p style={{ fontSize: 14.5, lineHeight: 1.6, color: COLOR.ink }}>{b.t}</p>
    case 'cifras': return <CifrasVista items={b.items} />
    case 'tarjetas':
      return (
        <ul className={`grid gap-3 ${b.cols === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : b.cols === 1 ? '' : 'sm:grid-cols-2'}`}>
          {b.items.map((t, i) => <TarjetaVista key={i} t={t} />)}
        </ul>
      )
    case 'lista': return <ListaVista b={b} />
    case 'aviso': {
      const a = AVISO[b.tono]
      return (
        <div role="note" className="rounded-xl px-4 py-3" style={{ background: a.bg, border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${a.borde}` }}>
          <div className="flex items-center gap-1.5" style={{ font: '800 11px/1.3 var(--font-ui)', letterSpacing: '.07em', textTransform: 'uppercase', color: a.txt }}>
            <span aria-hidden>{a.icono}</span>{b.titulo || a.rotulo}
          </div>
          <p className="mt-1" style={{ fontSize: 14, lineHeight: 1.55, color: COLOR.ink }}>{b.t}</p>
        </div>
      )
    }
    case 'tabla': return <TablaVista b={b} />
    case 'pasos':
      return (
        <div>
          {b.titulo && <h4 className="serif mb-2" style={{ fontSize: 18, fontWeight: 600, color: COLOR.navy }}>{b.titulo}</h4>}
          <ol className="space-y-2.5">
            {b.items.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="shrink-0 inline-flex items-center justify-center rounded-full tabular-nums mt-0.5"
                  style={{ width: 26, height: 26, fontSize: 12.5, fontWeight: 800, background: 'rgba(194,147,58,.2)', color: '#6B4D14' }}>{i + 1}</span>
                <div className="min-w-0">
                  <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.4, color: COLOR.navy }}>{p.t}</div>
                  {p.sub && <p className="mt-0.5" style={{ fontSize: 13.5, lineHeight: 1.55, color: COLOR.ink }}>{p.sub}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )
  }
}

// ── Bloques: formulario ─────────────────────────────────────────────────────

function TablaEd({ ruta }: { ruta: Ruta }) {
  const { doc, poner } = useDoc()
  const cols = (leer(doc, [...ruta, 'cols']) as string[]) ?? []
  const filas = (leer(doc, [...ruta, 'filas']) as string[][]) ?? []
  const agregarCol = () => {
    poner([...ruta, 'cols'], [...cols, `Columna ${cols.length + 1}`])
    poner([...ruta, 'filas'], filas.map(f => [...f, '']))
  }
  const quitarCol = (j: number) => {
    if (cols.length <= 1) return
    poner([...ruta, 'cols'], cols.filter((_, k) => k !== j))
    poner([...ruta, 'filas'], filas.map(f => f.filter((_, k) => k !== j)))
  }
  return (
    <div className="space-y-2.5">
      <T ruta={[...ruta, 'titulo']} etq="Título de la tabla" ph="Título (opcional)" />
      <div className="overflow-x-auto">
        <table className="text-left" style={{ borderCollapse: 'separate', borderSpacing: 4, minWidth: 360 }}>
          <thead>
            <tr>
              {cols.map((_, j) => (
                <th key={j} className="align-bottom" style={{ minWidth: 150 }}>
                  <div className="flex items-center gap-1">
                    <T ruta={[...ruta, 'cols', j]} ph={`Columna ${j + 1}`} />
                    <button type="button" aria-label={`Quitar la columna ${j + 1}`} title="Quitar columna" disabled={cols.length <= 1} onClick={() => quitarCol(j)}
                      className="inline-flex items-center justify-center rounded-lg border min-w-9 min-h-9 text-[13px] font-bold disabled:opacity-30" style={{ borderColor: '#FECACA', background: '#fff', color: '#B91C1C' }}>✕</button>
                  </div>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                {f.map((_, j) => <td key={j} className="align-top"><T ruta={[...ruta, 'filas', i, j]} multi ph="…" /></td>)}
                <td className="align-top"><Ctl ruta={[...ruta, 'filas']} i={i} n={filas.length} quitarTxt="Quitar fila" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Agregar ruta={[...ruta, 'filas']} item={() => cols.map(() => '')} texto="Agregar fila" />
        <button type="button" onClick={agregarCol} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 min-h-10 text-[13px] font-semibold"
          style={{ borderColor: COLOR.gold, color: COLOR.goldText, background: 'rgba(194,147,58,.07)' }}><span aria-hidden>＋</span>Agregar columna</button>
      </div>
      <T ruta={[...ruta, 'nota']} multi etq="Nota al pie" ph="Nota (opcional)" />
    </div>
  )
}

function BloqueEd({ ruta, b }: { ruta: Ruta; b: Bloque }) {
  switch (b.k) {
    case 'texto':
      return (
        <div className="space-y-2">
          <T ruta={[...ruta, 't']} multi etq="Texto" />
          <Chk ruta={[...ruta, 'grande']} etq="Texto destacado (letra grande)" />
        </div>
      )
    case 'cifras': return <CifrasEd ruta={[...ruta, 'items']} />
    case 'tarjetas':
      return (
        <div className="space-y-2.5">
          <ColsSel ruta={[...ruta, 'cols']} />
          {b.items.map((_, i) => (
            <CajaEd key={i} titulo={`Tarjeta ${i + 1}`} ctl={<Ctl ruta={[...ruta, 'items']} i={i} n={b.items.length} />}>
              <div className="grid gap-2 sm:grid-cols-2">
                <T ruta={[...ruta, 'items', i, 'titulo']} etq="Título" />
                <T ruta={[...ruta, 'items', i, 'etiqueta']} etq="Etiqueta (arriba)" />
                <T ruta={[...ruta, 'items', i, 'n']} etq="Número (opcional)" />
                <Sel ruta={[...ruta, 'items', i, 'tono']} etq="Color" opciones={[{ v: '', t: 'Sin color' }, ...TONOS.map(t => ({ v: t, t: NOMBRE_TONO[t] }))]} />
              </div>
              <T ruta={[...ruta, 'items', i, 'texto']} multi etq="Texto" />
              <ListaStr ruta={[...ruta, 'items', i, 'lista']} etq="Viñetas (opcional)" agregarTxt="Agregar viñeta" />
            </CajaEd>
          ))}
          <Agregar ruta={[...ruta, 'items']} item={{ titulo: 'Título', texto: 'Texto' }} texto="Agregar tarjeta" />
        </div>
      )
    case 'lista':
      return (
        <div className="space-y-2.5">
          <T ruta={[...ruta, 'titulo']} etq="Título" ph="Título (opcional)" />
          <Chk ruta={[...ruta, 'chips']} etq="Mostrar como etiquetas (en vez de viñetas)" />
          <ListaStr ruta={[...ruta, 'items']} etq="Elementos" agregarTxt="Agregar elemento" />
        </div>
      )
    case 'aviso':
      return (
        <div className="space-y-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Sel ruta={[...ruta, 'tono']} etq="Tipo" opciones={TONOS_AVISO.map(t => ({ v: t, t: NOMBRE_AVISO[t] }))} />
            <T ruta={[...ruta, 'titulo']} etq="Título" ph="Título (opcional)" />
          </div>
          <T ruta={[...ruta, 't']} multi etq="Texto" />
        </div>
      )
    case 'tabla': return <TablaEd ruta={ruta} />
    case 'pasos':
      return (
        <div className="space-y-2.5">
          <T ruta={[...ruta, 'titulo']} etq="Título" ph="Título (opcional)" />
          {b.items.map((_, i) => (
            <CajaEd key={i} titulo={`Paso ${i + 1}`} ctl={<Ctl ruta={[...ruta, 'items']} i={i} n={b.items.length} />}>
              <T ruta={[...ruta, 'items', i, 't']} etq="Paso" />
              <T ruta={[...ruta, 'items', i, 'sub']} multi etq="Detalle (opcional)" />
            </CajaEd>
          ))}
          <Agregar ruta={[...ruta, 'items']} item={{ t: 'Nuevo paso' }} texto="Agregar paso" />
        </div>
      )
  }
}

/** Columnas de un bloque de tarjetas: el documento guarda un número (o nada si es automático). */
function ColsSel({ ruta }: { ruta: Ruta }) {
  const { doc, poner } = useDoc()
  const v = leer(doc, ruta)
  return (
    <label className="block">
      <span className="block mb-0.5" style={{ font: '700 10.5px/1.2 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: COLOR.muted }}>Columnas</span>
      <select value={typeof v === 'number' ? String(v) : ''} onChange={e => poner(ruta, e.target.value === '' ? undefined : Number(e.target.value))}
        className="rounded-lg border bg-white px-2.5 py-1.5 min-h-10 text-[13.5px] max-sm:text-base" style={{ borderColor: COLOR.lineStrong }}>
        <option value="">Automático (2)</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
      </select>
    </label>
  )
}

// ── Lista de bloques ────────────────────────────────────────────────────────

function AgregarBloque({ ruta }: { ruta: Ruta }) {
  const { agregar } = useDoc()
  const [tipo, setTipo] = useState<TipoBloque>('texto')
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl p-3" style={{ border: `1px dashed ${COLOR.gold}`, background: 'rgba(194,147,58,.06)' }}>
      <label className="block">
        <span className="block mb-0.5" style={{ font: '700 10.5px/1.2 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: COLOR.muted }}>Tipo de bloque</span>
        <select value={tipo} onChange={e => setTipo(e.target.value as TipoBloque)} className="rounded-lg border bg-white px-2.5 py-1.5 min-h-10 text-[13.5px] max-sm:text-base" style={{ borderColor: COLOR.lineStrong }}>
          {TIPOS_BLOQUE.map(t => <option key={t.k} value={t.k}>{t.nombre}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => agregar(ruta, bloqueNuevo(tipo))}
        className="inline-flex items-center gap-1.5 rounded-lg px-3.5 min-h-10 text-[13px] font-semibold" style={{ background: COLOR.navy, color: COLOR.onDark }}>
        <span aria-hidden>＋</span>Agregar bloque
      </button>
    </div>
  )
}

/** Los bloques de `ruta` (un arreglo de Bloque). */
export function Bloques({ ruta }: { ruta: Ruta }) {
  const { doc, editando } = useDoc()
  const bloques = (leer(doc, ruta) as Bloque[] | undefined) ?? []
  if (!editando && !bloques.length) return null
  return (
    <div className="space-y-4">
      {bloques.map((b, i) => editando ? (
        <CajaEd key={i} titulo={TIPOS_BLOQUE.find(t => t.k === b.k)?.nombre ?? b.k} ctl={<Ctl ruta={ruta} i={i} n={bloques.length} quitarTxt="Quitar bloque" />}>
          <BloqueEd ruta={[...ruta, i]} b={b} />
        </CajaEd>
      ) : <BloqueVista key={i} b={b} />)}
      {editando && <AgregarBloque ruta={ruta} />}
    </div>
  )
}

// ── Secciones ───────────────────────────────────────────────────────────────

export const idSeccion = (docId: string, s: { id: string }) => `sec-${docId}-${s.id}`
const MARGEN = 70   // alto de la barra de pestañas pegajosa: el ancla queda debajo

/** Índice de secciones (chips que llevan a cada una). Solo al leer. */
export function Indice() {
  const { doc, editando } = useDoc()
  if (editando || doc.secciones.length < 3) return null
  return (
    <nav aria-label="Secciones de este documento" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-2 px-1 pb-1 min-w-max">
        {doc.secciones.map(s => (
          <li key={s.id}>
            <a href={`#${idSeccion(doc.id, s)}`}
              onClick={e => { e.preventDefault(); document.getElementById(idSeccion(doc.id, s))?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }}
              className="inline-flex items-center rounded-full px-3 min-h-9 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8A6420]"
              style={{ fontSize: 12.5, fontWeight: 600, background: '#fff', border: `1px solid ${COLOR.lineStrong}`, color: COLOR.navy }}>
              {s.titulo}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Portada del documento: etiqueta, título, subtítulo y cifras clave. */
export function Portada() {
  const { doc, editando } = useDoc()
  const d = doc as DocBase
  if (editando) {
    return (
      <Panel eyebrow="Portada" title="Encabezado del documento">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <T ruta={['etiqueta']} etq="Etiqueta (arriba)" />
            <T ruta={['titulo']} etq="Título" />
          </div>
          <T ruta={['sub']} multi etq="Subtítulo" />
          <CifrasEd ruta={['cifras']} />
        </div>
      </Panel>
    )
  }
  return (
    <Panel dark>
      <div className="pt-1 pb-1">
        <Eyebrow color={COLOR.goldLight}>{d.etiqueta}</Eyebrow>
        <h2 className="serif mt-1" style={{ fontSize: 'clamp(28px,6vw,38px)', lineHeight: 1.08, fontWeight: 600, color: COLOR.onDark }}>{d.titulo}</h2>
        {d.sub && <p className="mt-2 max-w-3xl" style={{ fontSize: 14, lineHeight: 1.55, color: COLOR.onDarkMuted }}>{d.sub}</p>}
        {d.cifras.length > 0 && <div className="mt-4"><CifrasVista items={d.cifras} dark /></div>}
      </div>
    </Panel>
  )
}

const TIPOS_ESPECIALES: Partial<Record<TipoSeccion, string>> = {
  dias: 'Semana por días', galeria: 'Galería de ejercicios', comidas: 'Las comidas del día', totales: 'Totales del día', super: 'Lista del súper', semanas: 'Metas de cada viernes',
}

/** Todas las secciones. `especial(tipo, i)` pinta lo propio de las secciones que no son solo bloques (días, galería, comidas…). */
export function Secciones({ especial }: { especial: (tipo: TipoSeccion, i: number) => ReactNode }) {
  const { doc, editando } = useDoc()
  const secs = doc.secciones
  return (
    <>
      {secs.map((s: SeccionDoc, i: number) => (
        <Panel
          key={s.id} id={idSeccion(doc.id, s)} style={{ scrollMarginTop: MARGEN }}
          eyebrow={editando ? undefined : s.kicker}
          title={editando ? undefined : s.titulo}
          subtitle={editando ? undefined : s.intro}
        >
          {editando && (
            <div className="mb-3 space-y-2.5 rounded-xl p-3" style={{ background: 'rgba(194,147,58,.07)', border: `1px dashed ${COLOR.gold}` }}>
              <div className="flex items-center justify-between gap-2">
                <span style={{ font: '800 11px/1.2 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.goldText }}>
                  Sección {i + 1}{TIPOS_ESPECIALES[s.tipo] ? ` · ${TIPOS_ESPECIALES[s.tipo]}` : ''}
                </span>
                <Ctl ruta={['secciones']} i={i} n={secs.length} quitarTxt="Quitar sección" />
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <T ruta={['secciones', i, 'kicker']} etq="Etiqueta (arriba)" />
                <T ruta={['secciones', i, 'titulo']} etq="Título de la sección" />
              </div>
              <T ruta={['secciones', i, 'intro']} multi etq="Introducción" />
            </div>
          )}
          <div className="space-y-4">
            {especial(s.tipo, i)}
            <Bloques ruta={['secciones', i, 'bloques']} />
          </div>
        </Panel>
      ))}
      {editando && (
        <Agregar ruta={['secciones']} item={(): SeccionDoc => ({ id: `seccion-${Date.now().toString(36)}`, titulo: 'Nueva sección', tipo: 'bloques', bloques: [] })} texto="Agregar sección" className="self-start" />
      )}
    </>
  )
}

