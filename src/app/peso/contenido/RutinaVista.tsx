'use client'

// La rutina: la semana por días (con las ilustraciones de cada ejercicio), el detalle del día, la galería y las
// secciones de texto. Todo sale del documento; las series y los minutos de bici se suman solos.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IDS_DIA, TIPOS_DIA, apariciones, minutosBici, seriesDelDia, seriesSumandos,
  type DiaRutina, type DocRutina, type EjercicioLib, type FilaRutina, type TipoDia,
} from '@/lib/peso-contenido'
import { COLOR, Pill } from '../ui'
import { Agregar, CajaEd, Chk, Ctl, Sel, T, useDoc } from './edicion'
import { Indice, Portada, Secciones } from './Bloques'

const rutaFoto = (id: string) => `/peso/ejercicios/${id}.jpg`

const COLOR_TIPO: Record<TipoDia, { bg: string; borde: string; txt: string; icono: string }> = {
  pesas: { bg: '#EEF2F9', borde: COLOR.navy2, txt: COLOR.navy, icono: '🏋️' },
  cardio: { bg: '#EEF4FD', borde: COLOR.info, txt: '#1E4FA8', icono: '🚴' },
  circuito: { bg: '#FBF5E6', borde: COLOR.gold, txt: '#6B4D14', icono: '⚡' },
  descanso: { bg: '#EFF9F2', borde: COLOR.good, txt: '#166534', icono: '🌿' },
}

// ── Ilustraciones ───────────────────────────────────────────────────────────

/** La ilustración tiene el título y las series escritos arriba y la nota abajo: en miniatura se recorta a la figura. */
function Miniatura({ id, tam = 104 }: { id: string; tam?: number }) {
  const [falla, setFalla] = useState(false)
  // El recorte deja ver del 34 % al 92 % de la altura del dibujo: sin el título de arriba ni la nota de abajo.
  return (
    <span aria-hidden className="relative block shrink-0 overflow-hidden rounded-lg" style={{ width: tam, height: Math.round(tam * 0.572), background: COLOR.cream, border: `1px solid ${COLOR.line}` }}>
      {falla
        ? <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: tam * 0.3 }}>🏋️</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={rutaFoto(id)} alt="" loading="lazy" onError={() => setFalla(true)}
            style={{ position: 'absolute', width: '132%', maxWidth: 'none', left: '-16%', top: '-33.5%' }} />}
    </span>
  )
}

function Ficha({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const { doc } = useDoc()
  const d = doc as DocRutina
  const ej = d.ejercicios.find(e => e.id === id)
  const ap = apariciones(d, id)
  const cerrar = useRef<HTMLButtonElement>(null)
  const [falla, setFalla] = useState(false)

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrar.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = overflow; previo?.focus?.() }
  }, [onCerrar])

  const nombre = ej?.nombre ?? ap[0]?.fila.nombre ?? 'Ejercicio'
  return (
    <div role="dialog" aria-modal="true" aria-label={nombre} className="fixed inset-0 flex items-center justify-center p-3 sm:p-6" style={{ zIndex: 400, background: 'rgba(11,26,53,.74)' }} onClick={onCerrar}>
      <div className="w-full max-w-xl max-h-[92vh] overflow-auto rounded-2xl bg-white" style={{ boxShadow: '0 30px 80px -20px rgba(0,0,0,.6)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <h3 className="serif min-w-0" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600, color: COLOR.navy }}>{nombre}</h3>
          <button ref={cerrar} type="button" onClick={onCerrar} aria-label="Cerrar" className="shrink-0 inline-flex items-center justify-center rounded-lg min-w-10 min-h-10 text-xl"
            style={{ border: `1px solid ${COLOR.lineStrong}`, color: COLOR.ink }}>×</button>
        </div>
        <div className="px-5 pt-3">
          {falla
            ? <div className="flex items-center justify-center rounded-xl" style={{ height: 200, background: COLOR.cream, fontSize: 56 }}>🏋️</div>
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={rutaFoto(id)} alt={`Ilustración: ${nombre}`} onError={() => setFalla(true)} className="w-full rounded-xl" style={{ border: `1px solid ${COLOR.line}`, background: '#fff' }} />}
        </div>
        <div className="px-5 pb-5 pt-3 space-y-3">
          {ej?.clave && (
            <div className="rounded-xl px-3.5 py-2.5" style={{ background: '#FBF5E6', borderLeft: `4px solid ${COLOR.gold}` }}>
              <div style={{ font: '800 10.5px/1.2 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: '#6B4D14' }}>Clave técnica</div>
              <p className="mt-0.5" style={{ fontSize: 14, lineHeight: 1.5, color: COLOR.ink }}>{ej.clave}</p>
            </div>
          )}
          {ap.length > 0 && (
            <div>
              <div style={{ font: '800 10.5px/1.2 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.muted }}>En tu semana</div>
              <ul className="mt-1.5 space-y-1">
                {ap.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2" style={{ fontSize: 13.5, color: COLOR.ink }}>
                    <strong style={{ color: COLOR.navy }}>{a.dia.nombre}</strong>
                    <span className="tabular-nums">{a.fila.series}</span>
                    {a.fila.nota && <span style={{ color: COLOR.muted }}>· {a.fila.nota}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── La semana ───────────────────────────────────────────────────────────────

const abrev = (n: string) => n.slice(0, 3)

function DiaChip({ d, sel, esHoy, onSel }: { d: DiaRutina; sel: boolean; esHoy: boolean; onSel: () => void }) {
  const c = COLOR_TIPO[d.tipo]
  const series = seriesDelDia(d)
  const bici = minutosBici(d)
  return (
    <button type="button" aria-pressed={sel} onClick={onSel}
      className="relative text-left rounded-xl px-2.5 py-2.5 min-h-[92px] min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A6420]"
      style={{ background: sel ? c.borde : c.bg, color: sel ? '#fff' : c.txt, border: `1.5px solid ${c.borde}`, boxShadow: sel ? '0 8px 18px -10px rgba(15,35,64,.6)' : 'none' }}>
      <span className="flex items-center justify-between gap-1">
        <span style={{ font: '800 12px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{abrev(d.nombre)}</span>
        {esHoy && <span style={{ font: '800 9.5px/1 var(--font-ui)', letterSpacing: '.05em', padding: '2px 5px', borderRadius: 99, background: sel ? 'rgba(255,255,255,.25)' : COLOR.navy, color: '#fff' }}>HOY</span>}
      </span>
      <span className="block mt-1.5 truncate" style={{ fontSize: 13, fontWeight: 700 }}>{d.foco}</span>
      <span className="block mt-0.5 tabular-nums" style={{ fontSize: 11.5, opacity: sel ? 0.92 : 0.8 }}>
        {[series > 0 ? `${series} series` : '', bici > 0 ? `${bici} min bici` : ''].filter(Boolean).join(' · ') || c.icono}
      </span>
    </button>
  )
}

function ResumenSemana({ dias }: { dias: DiaRutina[] }) {
  const series = dias.reduce((a, d) => a + seriesDelDia(d), 0)
  const bici = dias.reduce((a, d) => a + minutosBici(d), 0)
  const entrenos = dias.filter(d => d.tipo !== 'descanso').length
  const datos = [
    { v: String(entrenos), l: 'días de entreno' },
    { v: String(series), l: 'series en la semana' },
    { v: String(bici), l: 'min de bici' },
  ]
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label="Resumen de la semana">
      {datos.map(x => (
        <li key={x.l} className="rounded-xl px-3 py-2 text-center" style={{ background: COLOR.card2, border: `1px solid ${COLOR.line}` }}>
          <div className="serif tabular-nums" style={{ fontSize: 24, lineHeight: 1, fontWeight: 600, color: COLOR.navy }}>{x.v}</div>
          <div className="mt-1" style={{ fontSize: 11.5, color: COLOR.muted }}>{x.l}</div>
        </li>
      ))}
    </ul>
  )
}

function FilaVista({ f, onFicha }: { f: FilaRutina; onFicha: (id: string) => void }) {
  const contenido = (
    <>
      {f.ej
        ? <Miniatura id={f.ej} />
        : <span aria-hidden className="shrink-0 inline-flex items-center justify-center rounded-lg" style={{ width: 104, height: 59, background: COLOR.cream, border: `1px solid ${COLOR.line}`, fontSize: 26 }}>{f.cardio ? '🚴' : '🏋️'}</span>}
      <span className="min-w-0 flex-1">
        <span className="block" style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, color: COLOR.navy }}>{f.nombre}</span>
        {/* En el teléfono las series van debajo del nombre; en pantallas anchas, en su propia columna a la derecha. */}
        <span className="block mt-0.5 tabular-nums sm:hidden" style={{ fontSize: 14, fontWeight: 800, color: COLOR.goldText }}>{f.series}</span>
        {f.nota && <span className="block mt-0.5" style={{ fontSize: 12.5, lineHeight: 1.4, color: COLOR.muted }}>{f.nota}</span>}
      </span>
      <span className="hidden sm:block shrink-0 tabular-nums text-right" style={{ fontSize: 14, fontWeight: 800, color: COLOR.goldText }}>{f.series}</span>
    </>
  )
  const cls = 'flex items-center gap-3 w-full text-left rounded-xl px-2.5 py-2'
  const est = { background: '#fff', border: `1px solid ${COLOR.line}` }
  if (!f.ej) return <li><div className={cls} style={est}>{contenido}</div></li>
  return (
    <li>
      <button type="button" onClick={() => onFicha(f.ej as string)} className={`${cls} hover:border-[#C2933A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8A6420]`} style={est}
        aria-label={`${f.nombre}, ${f.series}. Ver la ilustración`}>
        {contenido}
      </button>
    </li>
  )
}

function DetalleDia({ i, onFicha, esHoy }: { i: number; onFicha: (id: string) => void; esHoy: boolean }) {
  const { doc, editando, poner } = useDoc()
  const d = (doc as DocRutina).dias[i]
  const lib = (doc as DocRutina).ejercicios
  if (!d) return null
  const c = COLOR_TIPO[d.tipo]
  const sumandos = seriesSumandos(d)
  const series = seriesDelDia(d)
  const bici = minutosBici(d)

  if (editando) {
    return (
      <CajaEd titulo={`Editar ${d.nombre}`}>
        <div className="grid gap-2 sm:grid-cols-2">
          <T ruta={['dias', i, 'nombre']} etq="Día" />
          <T ruta={['dias', i, 'foco']} etq="Enfoque" ph="Push, Pierna…" />
          <Sel ruta={['dias', i, 'tipo']} etq="Tipo de día" opciones={TIPOS_DIA.map(t => ({ v: t.v, t: t.nombre }))} />
          <T ruta={['dias', i, 'resumen']} etq="Resumen (en una línea)" />
        </div>
        {d.tipo === 'circuito' && <T ruta={['dias', i, 'circuito']} multi etq="Cómo es el circuito (di «N vueltas» para que sume las series)" />}
        <T ruta={['dias', i, 'nota']} multi etq="Nota del día (fases, progresión…)" />
        <div className="space-y-2">
          <div style={{ font: '800 11px/1.2 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLOR.goldText }}>Ejercicios</div>
          {d.filas.map((f, j) => (
            <CajaEd key={j} titulo={`${j + 1}. ${f.nombre || 'Ejercicio'}`} ctl={<Ctl ruta={['dias', i, 'filas']} i={j} n={d.filas.length} quitarTxt="Quitar ejercicio" />}>
              <div className="grid gap-2 sm:grid-cols-2">
                <T ruta={['dias', i, 'filas', j, 'nombre']} etq="Nombre" />
                <T ruta={['dias', i, 'filas', j, 'series']} etq="Series × repeticiones, o minutos" ph="4 × 8–10  ·  15 min" />
                <Sel ruta={['dias', i, 'filas', j, 'ej']} etq="Ilustración" opciones={[{ v: '', t: 'Sin ilustración' }, ...lib.map(e => ({ v: e.id, t: e.nombre }))]}
                  alCambiar={v => { const e = lib.find(x => x.id === v); if (e && (!f.nombre || f.nombre === 'Nuevo ejercicio')) poner(['dias', i, 'filas', j, 'nombre'], e.nombre) }} />
                <T ruta={['dias', i, 'filas', j, 'nota']} etq="Nota" />
              </div>
              <Chk ruta={['dias', i, 'filas', j, 'cardio']} etq="Es cardio (no cuenta como series)" />
            </CajaEd>
          ))}
          <div className="flex flex-wrap gap-2">
            <Agregar ruta={['dias', i, 'filas']} item={{ nombre: 'Nuevo ejercicio', series: '3 × 10' }} texto="Agregar ejercicio" />
            <Agregar ruta={['dias', i, 'filas']} item={{ nombre: 'Bici zona 2', series: '15 min', cardio: true }} texto="Agregar cardio" />
          </div>
        </div>
      </CajaEd>
    )
  }

  return (
    <div className="rounded-2xl p-3.5 sm:p-4" style={{ background: c.bg, border: `1px solid ${COLOR.line}` }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="serif" style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 600, color: COLOR.navy }}>{d.nombre} · {d.foco}</h3>
        {esHoy && <Pill color={COLOR.navy} solid>Hoy toca</Pill>}
        <Pill color={c.borde}>{c.icono} {TIPOS_DIA.find(t => t.v === d.tipo)?.nombre}</Pill>
      </div>
      <p className="mt-1" style={{ fontSize: 13.5, lineHeight: 1.5, color: COLOR.ink }}>{d.resumen}</p>
      {(series > 0 || bici > 0) && (
        <p className="mt-2 tabular-nums" style={{ fontSize: 13, color: COLOR.ink }}>
          {series > 0 && <><strong>{series} series</strong>{sumandos.length > 1 && <span style={{ color: COLOR.muted }}> ({sumandos.join(' + ')})</span>}</>}
          {series > 0 && bici > 0 && ' · '}
          {bici > 0 && <><strong>{bici} min</strong> de bici</>}
        </p>
      )}
      {d.tipo === 'circuito' && d.circuito && (
        <div className="mt-2.5 rounded-xl px-3 py-2" style={{ background: '#fff', borderLeft: `4px solid ${COLOR.gold}`, fontSize: 13.5, color: COLOR.ink }}>⚡ {d.circuito}</div>
      )}
      <ul className="mt-3 space-y-2">
        {d.filas.map((f, j) => <FilaVista key={j} f={f} onFicha={onFicha} />)}
      </ul>
      {d.nota && <p className="mt-3" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.muted }}>{d.nota}</p>}
    </div>
  )
}

function SemanaDias({ hoy, onFicha }: { hoy: string; onFicha: (id: string) => void }) {
  const { doc, editando } = useDoc()
  const dias = (doc as DocRutina).dias
  const hoyId = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoy)
    return m ? IDS_DIA[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()] : ''
  }, [hoy])
  const [selId, setSelId] = useState<string | null>(null)
  const i = Math.max(0, dias.findIndex(d => d.id === (selId ?? hoyId)))
  return (
    <div className="space-y-3">
      <ResumenSemana dias={dias} />
      <div role="group" aria-label="Días de la semana" className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {dias.map((d, j) => <DiaChip key={d.id} d={d} sel={j === i} esHoy={d.id === hoyId} onSel={() => setSelId(d.id)} />)}
      </div>
      <DetalleDia i={i} onFicha={onFicha} esHoy={dias[i]?.id === hoyId && !editando} />
    </div>
  )
}

// ── Galería ─────────────────────────────────────────────────────────────────

function Galeria({ onFicha }: { onFicha: (id: string) => void }) {
  const { doc, editando } = useDoc()
  const d = doc as DocRutina
  const lib = d.ejercicios
  if (editando) {
    return (
      <div className="space-y-2.5">
        {lib.map((e: EjercicioLib, i) => (
          <CajaEd key={e.id} titulo={e.nombre || 'Ejercicio'} ctl={<Ctl ruta={['ejercicios']} i={i} n={lib.length} quitarTxt="Quitar de la galería" />}>
            <div className="flex gap-3">
              <Miniatura id={e.id} />
              <div className="min-w-0 flex-1 space-y-2">
                <T ruta={['ejercicios', i, 'nombre']} etq="Nombre" />
                <T ruta={['ejercicios', i, 'clave']} multi etq="Clave técnica" />
              </div>
            </div>
          </CajaEd>
        ))}
        <Agregar ruta={['ejercicios']} item={() => ({ id: `ej-${Date.now().toString(36)}`, nombre: 'Nuevo ejercicio' })} texto="Agregar ejercicio a la galería" />
        <p style={{ fontSize: 12, color: COLOR.muted }}>Las ilustraciones nuevas se agregan como archivo en <code>public/peso/ejercicios/</code>; mientras tanto el ejercicio sale sin dibujo.</p>
      </div>
    )
  }
  return (
    <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {lib.map(e => {
        const dias = Array.from(new Set(apariciones(d, e.id).map(a => abrev(a.dia.nombre))))
        return (
          <li key={e.id}>
            <button type="button" onClick={() => onFicha(e.id)} aria-label={`${e.nombre}. Ver grande`}
              className="block w-full text-left rounded-xl overflow-hidden bg-white hover:border-[#C2933A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A6420]"
              style={{ border: `1px solid ${COLOR.line}` }}>
              <span className="block relative" style={{ aspectRatio: '4 / 3', background: COLOR.cream }}>
                <FotoCompleta id={e.id} />
              </span>
              <span className="block px-2.5 py-2">
                <span className="block" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: COLOR.navy }}>{e.nombre}</span>
                {dias.length > 0 && <span className="block mt-0.5" style={{ fontSize: 11.5, color: COLOR.muted }}>{dias.join(' · ')}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function FotoCompleta({ id }: { id: string }) {
  const [falla, setFalla] = useState(false)
  if (falla) return <span aria-hidden className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 40 }}>🏋️</span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={rutaFoto(id)} alt="" loading="lazy" onError={() => setFalla(true)} className="absolute inset-0 w-full h-full object-cover" />
}

// ── Documento ───────────────────────────────────────────────────────────────

export default function RutinaVista({ hoy }: { hoy: string }) {
  const [ficha, setFicha] = useState<string | null>(null)
  const cerrar = useMemo(() => () => setFicha(null), [])
  return (
    <div className="space-y-5">
      <Portada />
      <Indice />
      <Secciones especial={(tipo) => tipo === 'dias' ? <SemanaDias hoy={hoy} onFicha={setFicha} /> : tipo === 'galeria' ? <Galeria onFicha={setFicha} /> : null} />
      {ficha && <Ficha id={ficha} onCerrar={cerrar} />}
    </div>
  )
}

