'use client'

/* «Por decidir» de Mi día: UNA sola bandeja con todo lo que salió de anoche (pendientes nuevos, sugerencias,
 * notas del inbox, decisiones y preguntas para tu cerebro). Lista con filtros; al tocar cualquiera se abre su
 * ficha emergente, donde te mueves con ‹ › entre todas y, antes de aceptar, le pones épica, feature, iniciativa,
 * prioridad, fechas y nota. Una decisión también se puede volver tarea o feature. Abajo, «Tu cerebro»: dónde
 * quedó en Obsidian cada cosa que decidiste. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Epica, EpicaTask } from '@/lib/supabase'
import { obsidianUrl, sumarDias, resolverPlan, type DiaData, type DiaTarjeta, type DiaDecision, type DiaPreguntaCerebro, type DiaRespuesta, type DiaAprendido, type DiaIdeaInbox } from '@/lib/dia'
import { useDictado, juntar } from '@/lib/useDictado'

export type CamposTarea = {
  titulo: string
  epicaId: string            // '' = «Del diario»
  featureId: string
  iniciativaId: string
  prioridad: '' | 'alta' | 'media' | 'baja'
  plan: string               // '' = sin fecha
  vence: string
  nota: string
  comoFeature: boolean       // crear un feature (dentro de la épica) en vez de una tarea
}

export type Item =
  | { kind: 'tarjeta'; id: string; c: DiaTarjeta }
  | { kind: 'decision'; id: string; d: DiaDecision }
  | { kind: 'cerebro'; id: string; q: DiaPreguntaCerebro }

export type AccionesBandeja = {
  aceptar: (c: DiaTarjeta, campos: CamposTarea | null, destino?: string) => Promise<void>
  posponer: (c: DiaTarjeta, fecha: string | null) => Promise<void>
  descartar: (it: Item) => Promise<void>
  deshacer: (id: string) => Promise<void>
  /** «Ya la hice»: la tarea existente queda Terminada; un pendiente nuevo se crea ya terminado. */
  terminar: (c: DiaTarjeta) => Promise<void>
  decidir: (d: DiaDecision, texto: string, crear: CamposTarea | null) => Promise<void>
  contestar: (q: DiaPreguntaCerebro, texto: string) => Promise<void>
}

type Filtro = 'todo' | 'nuevo' | 'sugerencia' | 'decision' | 'cerebro' | 'mover'
const FILTROS: [Filtro, string][] = [['todo', 'Todo'], ['nuevo', 'Pendientes nuevos'], ['sugerencia', 'Sugerencias'], ['decision', 'Decisiones'], ['cerebro', 'Para tu cerebro'], ['mover', 'Inbox']]
const SUGERENCIA = new Set(['sugerencia', 'limpieza', 'evitando', 'esperando'])
const filtroDe = (it: Item): Filtro => it.kind === 'decision' ? 'decision' : it.kind === 'cerebro' ? 'cerebro' : it.c.tipo === 'nuevo' ? 'nuevo' : it.c.tipo === 'mover' ? 'mover' : 'sugerencia'
const ETIQUETA: Record<string, string> = { nuevo: 'Nuevo del diario', sugerencia: 'Sugerencia', limpieza: 'Limpieza', evitando: 'Lo vienes evitando', esperando: 'Esperando a otros', mover: 'Nota del inbox', decision: 'Decisión', cerebro: 'Para tu cerebro' }
/** Subtipo de una pregunta para tu cerebro. */
const SUB_Q: Record<string, string> = { conexion: 'Conexión entre notas', salud: '¿Ya quedó?' }
const etiquetaDe = (it: Item) => (it.kind === 'cerebro' && it.q.tipo && SUB_Q[it.q.tipo]) || ETIQUETA[tipoDe(it)]
const tipoDe = (it: Item) => (it.kind === 'tarjeta' ? it.c.tipo : it.kind)
const tituloDe = (it: Item) => (it.kind === 'tarjeta' ? it.c.titulo : it.kind === 'decision' ? it.d.pregunta : it.q.pregunta)
const ESTADO_TXT: Record<string, string> = { aceptada: 'Aceptada', pospuesta: 'Pospuesta', descartada: 'Descartada', respondida: 'Contestada' }
const estadoTxt = (r: DiaRespuesta) => ((r.respuesta as { terminada?: boolean } | null)?.terminada ? 'Ya la hiciste' : ESTADO_TXT[r.estado] || r.estado)
/** Se puede palomear: pendiente nuevo, o cualquier sugerencia que apunte a una tarea tuya. */
const marcable = (it: Item) => it.kind === 'tarjeta' && it.c.tipo !== 'mover' && (it.c.tipo === 'nuevo' || !!it.c.tareaId)
type Avisar = (texto: string, id: string) => void

export function itemsDe(data: DiaData | null): Item[] {
  if (!data) return []
  return [
    ...data.tarjetas.map(c => ({ kind: 'tarjeta' as const, id: c.id, c })),
    ...data.decisiones.map(d => ({ kind: 'decision' as const, id: d.id, d })),
    ...(data.cerebro || []).map(q => ({ kind: 'cerebro' as const, id: q.id, q })),
  ]
}

/** Secciones de la bandeja, en el orden en que conviene decidir. */
const SECCIONES: { f: Exclude<Filtro, 'todo'>; t: string; sub: string; color: string }[] = [
  { f: 'nuevo', t: 'Pendientes nuevos', sub: 'Salieron de tu diario. Palomea los que ya hiciste; «Hoy» o «Mañana» los vuelve tarea.', color: '#b5651d' },
  { f: 'decision', t: 'Decisiones', sub: 'Un toque basta. Se guarda en su nota de Obsidian y no te lo vuelve a preguntar.', color: '#6b5ca5' },
  { f: 'sugerencia', t: 'Sugerencias para tus tareas', sub: 'Cambios a tareas que ya tienes. Si ya la hiciste, palomeála.', color: '#3f7a8c' },
  { f: 'cerebro', t: 'Para tu cerebro', sub: 'Con una o dos líneas basta. Se guarda en tu bóveda a las 3:00.', color: '#5a7a3a' },
  { f: 'mover', t: 'Notas del inbox', sub: 'A qué carpeta de tu bóveda van.', color: '#8a8378' },
]

export function Bandeja({ data, hoy, respuestas, epicas, acc, alTerminar, volver, abrirEn, avisar }: {
  data: DiaData; hoy: string; respuestas: Map<string, DiaRespuesta>; epicas: Epica[] | null
  acc: AccionesBandeja; alTerminar: () => void; volver: () => void; abrirEn?: string | null; avisar?: Avisar
}) {
  const [filtro, setFiltro] = useState<Filtro>('todo')
  const [abierto, setAbierto] = useState<string | null>(abrirEn ?? null)
  const [verHechas, setVerHechas] = useState(false)
  const todos = useMemo(() => itemsDe(data), [data])
  const pendientes = todos.filter(it => !respuestas.has(it.id))
  const hechas = todos.filter(it => respuestas.has(it.id))
  // La ficha recorre las que faltan (en el orden de las secciones) para que ‹ › no te regrese a lo ya decidido.
  const orden = useMemo(() => SECCIONES.flatMap(s => todos.filter(it => filtroDe(it) === s.f)), [todos])
  const lista = useMemo(() => orden.filter(it => (filtro === 'todo' || filtroDe(it) === filtro) && (!respuestas.has(it.id) || it.id === abierto)), [orden, filtro, respuestas, abierto])
  const cuenta = (f: Filtro) => pendientes.filter(it => f === 'todo' || filtroDe(it) === f).length
  const idx = abierto ? lista.findIndex(it => it.id === abierto) : -1
  const actual = idx >= 0 ? lista[idx] : abierto ? todos.find(it => it.id === abierto) || null : null
  const ir = (d: number) => { if (!lista.length) return; const n = ((idx < 0 ? 0 : idx) + d + lista.length) % lista.length; setAbierto(lista[n].id) }
  const siguiente = useCallback((desde: string) => {
    const i = lista.findIndex(it => it.id === desde)
    for (let k = 1; k <= lista.length; k++) { const it = lista[(i + k) % lista.length]; if (it.id !== desde && !respuestas.has(it.id)) { setAbierto(it.id); return } }
    setAbierto(null)
  }, [lista, respuestas])
  const pct = todos.length ? Math.round((hechas.length / todos.length) * 100) : 100
  const secciones = SECCIONES.filter(s => filtro === 'todo' || s.f === filtro)
    .map(s => ({ ...s, items: pendientes.filter(it => filtroDe(it) === s.f) })).filter(s => s.items.length)

  return (
    <section className="bd md-fade">
      <div className="bd-barra">
        <button className="bd-volver" onClick={volver}><span aria-hidden>←</span> Hoy</button>
        <div className="bd-barra-av">
          <div className="bd-progreso" role="progressbar" aria-valuenow={hechas.length} aria-valuemin={0} aria-valuemax={todos.length} aria-label="Avance">
            <div style={{ width: `${pct}%` }} />
          </div>
          <span className="md-meta">{hechas.length}/{todos.length}</span>
        </div>
      </div>

      <div className="bd-hero">
        <div>
          <h1 className="md-fecha">Por decidir</h1>
          <p className="md-sub md-mt4">Lo que salió de anoche, ya clasificado. Decide con un toque; toca el texto para verlo completo y cambiarle épica o fecha.</p>
        </div>
        <div className="bd-falta" aria-live="polite"><b>{pendientes.length}</b><span>{pendientes.length === 1 ? 'falta' : 'faltan'}</span></div>
      </div>

      {pendientes.length > 0 && (
        <div className="bd-filtros" role="tablist" aria-label="Filtrar">
          {([['todo', 'Todo'], ...SECCIONES.map(s => [s.f, s.t] as [Filtro, string])] as [Filtro, string][]).filter(([f]) => f === 'todo' || cuenta(f) > 0).map(([f, l]) => (
            <button key={f} role="tab" aria-selected={filtro === f} data-on={filtro === f} onClick={() => setFiltro(f)}>{l}<span>{cuenta(f)}</span></button>
          ))}
        </div>
      )}

      {!pendientes.length ? (
        <div className="md-card bd-fin md-mt12">
          <p className="bd-fin-ico" aria-hidden>✓</p>
          <p className="md-h3">Listo, decidiste todo</p>
          <p className="md-sub">Lo que aceptaste ya está en tus épicas. Las decisiones y respuestas se guardan en Obsidian a las 3:00.</p>
          <div className="md-fila md-envuelve bd-centro md-mt12">
            <button className="md-btn" onClick={volver}>Volver a Hoy</button>
            <button className="md-btn md-primario" onClick={alTerminar}>Elegir tus 3 de hoy</button>
          </div>
        </div>
      ) : !secciones.length ? (
        <div className="md-card md-mt12"><p className="md-sub">Ya no queda nada en este filtro. <button className="md-link" onClick={() => setFiltro('todo')}>Ver todo</button></p></div>
      ) : secciones.map(s => (
        <div key={s.f} className="bd-seccion">
          <div className="bd-sec-cab" style={{ ['--bd-c' as string]: s.color }}><h2><i aria-hidden />{s.t} <span>{s.items.length}</span></h2><p className="md-meta">{s.sub}</p></div>
          <div className="bd-tarjeta">
            {s.items.map(it => <Fila key={it.id} it={it} hoy={hoy} acc={acc} avisar={avisar} abrir={() => setAbierto(it.id)} />)}
          </div>
        </div>
      ))}

      {hechas.length > 0 && (
        <div className="bd-seccion">
          <button className="bd-hechas-tog" onClick={() => setVerHechas(v => !v)} aria-expanded={verHechas}>
            {verHechas ? '▾' : '▸'} Ya decididas ({hechas.length})
          </button>
          {verHechas && (
            <div className="md-card md-lista md-mt8">
              {hechas.map(it => {
                const r = respuestas.get(it.id)!
                const txt = (r.respuesta as { texto?: string } | null)?.texto
                return (
                  <div key={it.id} className="md-row bd-fila" data-hecha>
                    <span className="bd-palomita" data-on={(r.respuesta as { terminada?: boolean } | null)?.terminada || undefined} aria-hidden>{(r.respuesta as { terminada?: boolean } | null)?.terminada ? '✓' : ''}</span>
                    <div className="md-grow"><div className="bd-tit">{tituloDe(it)}</div><div className="md-meta">{estadoTxt(r)}{txt ? ` · «${txt}»` : ''}</div></div>
                    <button className="md-link" onClick={() => acc.deshacer(it.id)}>Deshacer</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="bd-pie">
          <button className="md-btn" onClick={volver}>← Hoy</button>
          <span className="md-meta bd-pie-txt">{pendientes.length} por decidir · puedes dejar algunas</span>
          <button className="md-btn md-primario" onClick={alTerminar}>Elegir tus 3 de hoy →</button>
        </div>
      )}

      {actual && (
        <Ficha key={actual.id} it={actual} ideas={data.ideasInbox} pos={Math.max(1, idx + 1)} total={Math.max(1, lista.length)} r={respuestas.get(actual.id)} hoy={hoy} epicas={epicas} acc={acc}
          cerrar={() => setAbierto(null)} anterior={() => ir(-1)} siguienteItem={() => ir(1)} hecho={() => siguiente(actual.id)} />
      )}
      <style>{CSS_BD}</style>
    </section>
  )
}

const SUBTIPO: Record<string, string> = { limpieza: 'Limpieza', evitando: 'Lo vienes evitando', esperando: 'Esperando a otros' }

/** Un renglón: palomita «Ya la hice» a la izquierda, el texto (abre la ficha) y botones que dicen lo que hacen.
 *  Cada decisión rápida avisa abajo con «Deshacer». */
function Fila({ it, hoy, acc, abrir, avisar }: { it: Item; hoy: string; acc: AccionesBandeja; abrir: () => void; avisar?: Avisar }) {
  const [ocupado, setOcupado] = useState(false)
  const [hecha, setHecha] = useState(false)
  const [err, setErr] = useState('')
  const [txt, setTxt] = useState('')
  const [escribir, setEscribir] = useState(false)
  const correr = async (f: () => Promise<void>, aviso?: string) => {
    setOcupado(true); setErr('')
    try { await f(); if (aviso) avisar?.(aviso, it.id) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setOcupado(false); setHecha(false) }
  }
  const corto = (t: string) => (t.length > 48 ? `${t.slice(0, 46)}…` : t)
  const tit = tituloDe(it)
  const sub = it.kind === 'tarjeta' ? SUBTIPO[it.c.tipo] : it.kind === 'cerebro' && it.q.tipo ? SUB_Q[it.q.tipo] : undefined
  const epica = it.kind === 'tarjeta' ? it.c.epica || (it.c.tipo === 'nuevo' ? 'Del diario' : '') : ''
  const meta = it.kind === 'tarjeta'
    ? (it.c.tipo === 'mover' ? `→ ${it.c.destino}` : '')
    : it.kind === 'cerebro' && it.q.tipo === 'conexion' && it.q.liga ? `si dices que sí, ligo ${it.q.nota} con ${it.q.liga}`
    : (it.kind === 'decision' ? it.d.nota : it.q.nota) ? `se guarda en ${it.kind === 'decision' ? it.d.nota : it.q.nota}` : ''
  const puedeMarcar = marcable(it)
  const terminar = () => { if (it.kind !== 'tarjeta') return; setHecha(true); correr(() => acc.terminar(it.c), `Hecha: ${corto(tit)}`) }

  return (
    <div className="bd-fila" aria-busy={ocupado} data-hecha={hecha || undefined}>
      {puedeMarcar
        ? <button className="bd-palomita" data-on={hecha || undefined} disabled={ocupado} onClick={terminar} title="Ya la hice" aria-label={`Ya la hice: ${tit}`}>{hecha ? '✓' : ''}</button>
        : <span className="bd-palomita-vacia" aria-hidden />}
      <div className="bd-cuerpo">
        <button className="bd-abrir" onClick={abrir} title="Ver completo y editar">
          {sub && <span className="bd-sub">{sub}</span>}
          <span className="bd-tit">{tit}</span>
          {(epica || meta) && <span className="bd-meta">{epica && <span className="bd-epica">{epica}</span>}{meta && <span>{meta}</span>}</span>}
        </button>

        {it.kind === 'decision' && (
          <div className="bd-opciones">
            {it.d.opciones.map(o => <button key={o} className="bd-op" disabled={ocupado} onClick={() => correr(() => acc.decidir(it.d, o, null), `Decidido: ${corto(o)}`)}>{o}</button>)}
            <button className="bd-op bd-op-otra" disabled={ocupado} onClick={() => setEscribir(v => !v)} aria-expanded={escribir}>Otra…</button>
            <button className="bd-op bd-op-luego" disabled={ocupado} onClick={() => correr(() => acc.descartar(it), 'Lo dejas para después')}>Todavía no</button>
          </div>
        )}
        {it.kind === 'cerebro' && !!it.q.opciones?.length && (
          <div className="bd-opciones">
            {it.q.opciones.map(o => <button key={o} className="bd-op" disabled={ocupado} onClick={() => correr(() => acc.contestar(it.q, o), `Guardado: ${corto(o)}`)}>{o}</button>)}
            <button className="bd-op bd-op-otra" disabled={ocupado} onClick={() => setEscribir(v => !v)} aria-expanded={escribir}>Otra…</button>
          </div>
        )}
        {((it.kind === 'cerebro' && (!it.q.opciones?.length || escribir)) || (it.kind === 'decision' && escribir)) && (
          <form className="bd-responder" onSubmit={e => { e.preventDefault(); const v = txt.trim(); if (!v) return; correr(() => it.kind === 'cerebro' ? acc.contestar(it.q, v) : acc.decidir((it as Extract<Item, { kind: 'decision' }>).d, v, null), 'Guardado para tu cerebro') }}>
            <input className="md-input md-grow" value={txt} onChange={e => setTxt(e.target.value)} placeholder={it.kind === 'cerebro' ? 'Tu respuesta, en una línea' : 'Tu decisión'} aria-label="Tu respuesta" />
            <button className="md-btn md-chico md-primario" disabled={ocupado || !txt.trim()}>Guardar</button>
            {it.kind === 'cerebro' && <button type="button" className="md-btn md-chico bd-fantasma" disabled={ocupado} onClick={() => correr(() => acc.descartar(it), 'Pregunta descartada')}>No aplica</button>}
          </form>
        )}
        {err && <p className="md-err-txt md-mt4">{err}</p>}
      </div>

      {it.kind === 'tarjeta' && (
        <div className="bd-acciones">
          {it.c.tipo === 'nuevo' && <>
            <button className="bd-acc bd-acc-no" disabled={ocupado} onClick={() => correr(() => acc.descartar(it), 'Descartado')} title="No es pendiente">No</button>
            <button className="bd-acc" disabled={ocupado} onClick={() => correr(() => acc.posponer(it.c, sumarDias(hoy, 1)), 'Tarea para mañana')}>Mañana</button>
            <button className="bd-acc bd-acc-si" disabled={ocupado} onClick={() => correr(() => acc.aceptar(it.c, null), 'Tarea para hoy')}>Hoy</button>
          </>}
          {it.c.tipo === 'mover' && <>
            <button className="bd-acc bd-acc-no" disabled={ocupado} onClick={() => correr(() => acc.descartar(it), 'Se queda en el inbox')}>Dejarla</button>
            <button className="bd-acc bd-acc-si" disabled={ocupado} onClick={() => correr(() => acc.aceptar(it.c, null, it.c.destino), 'Se mueve a las 3:00')}>Moverla</button>
          </>}
          {SUGERENCIA.has(it.c.tipo) && <>
            <button className="bd-acc bd-acc-no" disabled={ocupado} onClick={() => correr(() => acc.descartar(it), 'Sugerencia descartada')}>No</button>
            <button className="bd-acc bd-acc-si" disabled={ocupado} onClick={() => correr(() => acc.aceptar(it.c, null), 'Cambio aplicado')}>Aplicar</button>
          </>}
        </div>
      )}
    </div>
  )
}

/* ── Ficha emergente ── */
function Ficha({ it, ideas, pos, total, r, hoy, epicas, acc, cerrar, anterior, siguienteItem, hecho }: {
  it: Item; ideas?: DiaIdeaInbox[]; pos: number; total: number; r?: DiaRespuesta; hoy: string; epicas: Epica[] | null; acc: AccionesBandeja
  cerrar: () => void; anterior: () => void; siguienteItem: () => void; hecho: () => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return
      if (e.key === 'Escape') cerrar(); else if (e.key === 'ArrowLeft') anterior(); else if (e.key === 'ArrowRight') siguienteItem()
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [cerrar, anterior, siguienteItem])
  const correr = async (f: () => Promise<void>) => {
    setOcupado(true); setError('')
    try { await f(); hecho() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setOcupado(false) }
  }

  return (
    <div className="bd-velo" onClick={cerrar}>
      <div className="bd-ficha" role="dialog" aria-modal="true" aria-label={tituloDe(it)} onClick={e => e.stopPropagation()}>
        <div className="md-entre bd-cab">
          <button className="md-icobtn" onClick={anterior} aria-label="Anterior">‹</button>
          <span className="md-meta">{pos} de {total}</span>
          <button className="md-icobtn" onClick={siguienteItem} aria-label="Siguiente">›</button>
          <span className="md-grow" />
          <button className="md-btn md-chico" onClick={cerrar}>← Lista</button>
        </div>
        <span className={`md-chip md-tipo-${tipoDe(it) === 'decision' ? 'nuevo' : tipoDe(it) === 'cerebro' ? 'esperando' : tipoDe(it)}`}>{etiquetaDe(it)}</span>
        <p className="md-titulo-tarjeta">{tituloDe(it)}</p>
        {it.kind === 'tarjeta' && it.c.detalle && <p className="md-sub">{it.c.detalle}</p>}
        {it.kind === 'cerebro' && it.q.porque && <p className="md-sub">{it.q.porque}</p>}
        {(() => { const n = it.kind === 'tarjeta' ? it.c.nota : it.kind === 'decision' ? it.d.nota : it.q.nota; return n ? <a className="md-link md-mt4 bd-bloque" href={obsidianUrl(n)}>Abrir {n} en Obsidian ↗</a> : null })()}
        {it.kind === 'tarjeta' && it.c.tipo === 'mover' && !!ideas?.length && <IdeasRevisadas ideas={ideas} />}
        {r && <p className="bd-ya md-mt8">{estadoTxt(r)}. <button className="md-link" onClick={() => correr(() => acc.deshacer(it.id))}>Deshacer</button></p>}
        {error && <p className="md-err-txt md-mt8" role="alert">{error}</p>}

        {!r && it.kind === 'tarjeta' && it.c.tipo === 'mover' && <FichaMover c={it.c} ocupado={ocupado} correr={correr} acc={acc} />}
        {!r && it.kind === 'tarjeta' && it.c.tipo !== 'mover' && <FichaTarea c={it.c} hoy={hoy} epicas={epicas} ocupado={ocupado} correr={correr} acc={acc} />}
        {!r && it.kind === 'decision' && <FichaDecision d={it.d} hoy={hoy} epicas={epicas} ocupado={ocupado} correr={correr} acc={acc} />}
        {!r && it.kind === 'cerebro' && <FichaCerebro q={it.q} ocupado={ocupado} correr={correr} acc={acc} it={it} />}
        <p className="md-meta md-mt12 md-solo-mac">← → para moverte · Esc para cerrar</p>
      </div>
    </div>
  )
}

/** Valores iniciales: de la tarea existente (sugerencias) o de lo que propuso Claude (nuevo). */
function camposIniciales(c: DiaTarjeta | null, titulo: string, epicas: Epica[] | null, hoy: string): CamposTarea {
  const hit = c?.tareaId ? (epicas || []).flatMap(e => (e.tasks || []).map(t => ({ e, t }))).find(x => x.t.id === c.tareaId) : undefined
  const t: EpicaTask | undefined = hit?.t
  const k = c?.cambio || {}
  return {
    titulo: k.titulo || t?.t || titulo,
    epicaId: hit?.e.id || c?.epicaId || '',
    featureId: t?.featureId || '',
    iniciativaId: t?.iniciativaId || '',
    prioridad: (k.prioridad || t?.priority || '') as CamposTarea['prioridad'],
    plan: k.plan ? resolverPlan(k.plan, hoy) : t?.plan || (c?.tipo === 'nuevo' ? hoy : ''),
    vence: t?.due || '',
    nota: c?.tipo === 'nuevo' ? (c.detalle || '') : '',
    comoFeature: false,
  }
}

function FichaTarea({ c, hoy, epicas, ocupado, correr, acc }: { c: DiaTarjeta; hoy: string; epicas: Epica[] | null; ocupado: boolean; correr: (f: () => Promise<void>) => void; acc: AccionesBandeja }) {
  const [campos, setCampos] = useState<CamposTarea>(() => camposIniciales(c, c.titulo, epicas, hoy))
  const [otro, setOtro] = useState(false)
  const existente = c.tipo !== 'nuevo'
  const cambioTxt = existente && c.cambio ? [c.cambio.archivar ? 'archivarla' : null, c.cambio.estado ? `pasarla a «${c.cambio.estado}»` : null].filter(Boolean).join(' y ') : ''
  return (
    <>
      {cambioTxt && <p className="md-meta md-mt8">Al aceptar, además de lo de abajo: {cambioTxt}.</p>}
      <EditorCampos campos={campos} set={setCampos} epicas={epicas} hoy={hoy} permitirFeature={!existente} />
      {otro && (
        <div className="md-elige md-fade">
          {([['Mañana', sumarDias(hoy, 1)], ['En 3 días', sumarDias(hoy, 3)], ['En una semana', sumarDias(hoy, 7)], ...(existente ? [] : [['Sin fecha', null]])] as [string, string | null][]).map(([l, f]) => (
            <button key={l} className="md-btn" disabled={ocupado} onClick={() => correr(() => acc.posponer({ ...c, cambio: { ...c.cambio, titulo: campos.titulo } }, f))}>{l}</button>
          ))}
        </div>
      )}
      {(c.tipo === 'nuevo' || c.tareaId) && (
        <button className="bd-ya-hice md-mt12" disabled={ocupado} onClick={() => correr(() => acc.terminar({ ...c, cambio: { ...c.cambio, titulo: campos.titulo } }))}>
          <span className="bd-palomita" aria-hidden /> Ya la hice — {c.tipo === 'nuevo' ? 'guardarla como terminada' : 'marcarla terminada'}
        </button>
      )}
      <div className="md-tres">
        <button className="md-btn" disabled={ocupado} onClick={() => correr(() => acc.descartar({ kind: 'tarjeta', id: c.id, c }))}>Descartar</button>
        <button className="md-btn" disabled={ocupado} onClick={() => setOtro(v => !v)} aria-expanded={otro}>Otro día</button>
        <button className="md-btn md-primario" disabled={ocupado || !campos.titulo.trim()} onClick={() => correr(() => acc.aceptar(c, campos))}>{ocupado ? 'Guardando…' : campos.comoFeature ? 'Crear feature' : existente ? 'Aceptar' : 'Guardar tarea'}</button>
      </div>
    </>
  )
}

const ESTADO_IDEA: Record<DiaIdeaInbox['estado'], [string, string]> = {
  nueva: ['Nueva', 'nueva'], relacionada: ['Nueva, relacionada', 'nueva'], repetida: ['Repetida', 'rep'],
  'ya-tarea': ['Ya es tarea', 'ya'], 'ya-hecha': ['Ya está hecha', 'ya'], 'ya-en-nota': ['Ya está en una nota', 'ya'],
}
/** Cómo revisó el cierre cada idea suelta del inbox: cuáles se repiten y cuáles ya existen. */
function IdeasRevisadas({ ideas }: { ideas: DiaIdeaInbox[] }) {
  const repetidas = ideas.filter(i => i.veces > 1).length
  const yaExisten = ideas.filter(i => i.estado.startsWith('ya-')).length
  return (
    <div className="bd-ideas md-mt12">
      <p className="md-kicker">Revisé tus ideas</p>
      <p className="md-meta md-mt4">{ideas.length} idea{ideas.length === 1 ? '' : 's'}{repetidas ? ` · ${repetidas} escrita${repetidas === 1 ? '' : 's'} más de una vez` : ''}{yaExisten ? ` · ${yaExisten} ya existe${yaExisten === 1 ? '' : 'n'}` : ''}</p>
      <ul className="bd-ideas-lista">
        {ideas.map((i, k) => {
          const [etq, tono] = ESTADO_IDEA[i.estado] || ESTADO_IDEA.nueva
          return (
            <li key={k}>
              <span className={`bd-idea-etq bd-idea-${tono}`}>{etq}{i.veces > 1 ? ` · ${i.veces} veces` : ''}</span>
              <span className="bd-idea-t">{i.t}</span>
              {(i.tarea || i.nota) && <span className="md-meta">
                {i.tarea && <>Tarea «{i.tarea}»</>}{i.tarea && i.nota && ' · '}
                {i.nota && <a className="md-link" href={obsidianUrl(i.nota)}>{i.nota} ↗</a>}
              </span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FichaMover({ c, ocupado, correr, acc }: { c: DiaTarjeta; ocupado: boolean; correr: (f: () => Promise<void>) => void; acc: AccionesBandeja }) {
  const [destino, setDestino] = useState(c.destino || '')
  return (
    <>
      <label className="bd-campo md-mt12"><span>Carpeta y nombre en tu bóveda</span>
        <input className="md-input" value={destino} onChange={e => setDestino(e.target.value)} placeholder="05-personal/compras/silla.md" /></label>
      <p className="md-meta md-mt4">Se mueve a las 3:00 (la página no puede tocar tu Mac).</p>
      <div className="md-tres">
        <button className="md-btn" disabled={ocupado} onClick={() => correr(() => acc.descartar({ kind: 'tarjeta', id: c.id, c }))}>Dejarla en inbox</button>
        <span />
        <button className="md-btn md-primario" disabled={ocupado || !destino.trim()} onClick={() => correr(() => acc.aceptar(c, null, destino.trim()))}>Moverla</button>
      </div>
    </>
  )
}

function FichaDecision({ d, hoy, epicas, ocupado, correr, acc }: { d: DiaDecision; hoy: string; epicas: Epica[] | null; ocupado: boolean; correr: (f: () => Promise<void>) => void; acc: AccionesBandeja }) {
  const [texto, setTexto] = useState('')
  const [crear, setCrear] = useState(false)
  const [campos, setCampos] = useState<CamposTarea>(() => camposIniciales(null, d.pregunta.replace(/^¿|\?$/g, ''), epicas, hoy))
  const dict = useDictado(f => setTexto(v => juntar(v, f)))
  return (
    <>
      <p className="md-kicker md-mt12">Tu decisión</p>
      <div className="md-fila md-envuelve md-mt4">
        {d.opciones.map(o => <button key={o} className="md-btn md-chico" data-on={texto === o} onClick={() => setTexto(o)}>{o}</button>)}
      </div>
      <textarea className="md-input md-area md-mt8" rows={2} value={dict.parcial ? juntar(texto, dict.parcial) : texto} onChange={e => setTexto(e.target.value)} placeholder="O escribe o dicta tu decisión" aria-label="Tu decisión" />
      <div className="md-fila md-mt4"><MicChico d={dict} /><span className="md-meta">{dict.error || (dict.escuchando ? 'Te escucho…' : '')}</span></div>
      <label className="bd-check md-mt12"><input type="checkbox" checked={crear} onChange={e => setCrear(e.target.checked)} /> Además, hacerla tarea o feature en una épica</label>
      {crear && <EditorCampos campos={campos} set={setCampos} epicas={epicas} hoy={hoy} permitirFeature />}
      <p className="md-meta md-mt8">Tu decisión se escribe en {d.nota ? <b>{d.nota}</b> : 'tu bóveda'} a las 3:00 y Claude ya no te lo vuelve a preguntar.</p>
      <div className="md-tres">
        <button className="md-btn" disabled={ocupado} onClick={() => correr(() => acc.descartar({ kind: 'decision', id: d.id, d }))}>Todavía no</button>
        <span />
        <button className="md-btn md-primario" disabled={ocupado || (!texto.trim() && !crear)} onClick={() => correr(() => acc.decidir(d, texto.trim(), crear ? campos : null))}>{ocupado ? 'Guardando…' : 'Guardar decisión'}</button>
      </div>
    </>
  )
}

function FichaCerebro({ q, it, ocupado, correr, acc }: { q: DiaPreguntaCerebro; it: Item; ocupado: boolean; correr: (f: () => Promise<void>) => void; acc: AccionesBandeja }) {
  const [texto, setTexto] = useState('')
  const dict = useDictado(f => setTexto(v => juntar(v, f)))
  return (
    <>
      {!!q.opciones?.length && (
        <div className="bd-opciones md-mt12">
          {q.opciones.map(o => <button key={o} className="bd-op" disabled={ocupado} onClick={() => correr(() => acc.contestar(q, o))}>{o}</button>)}
        </div>
      )}
      {q.tipo === 'conexion' && q.liga && <p className="md-meta md-mt4">Si dices que sí, a las 3:00 ligo [[{q.nota}]] con [[{q.liga}]] en las dos notas.</p>}
      {q.tipo === 'salud' && <p className="md-meta md-mt4">«Ya quedó» lo pasa a «Ya aplicado» en {q.nota}.</p>}
      <textarea className="md-input md-area md-mt12" rows={3} value={dict.parcial ? juntar(texto, dict.parcial) : texto} onChange={e => setTexto(e.target.value)} placeholder="Con una o dos líneas basta" aria-label="Tu respuesta" />
      <div className="md-fila md-mt4"><MicChico d={dict} /><span className="md-meta">{dict.error || (dict.escuchando ? 'Te escucho…' : q.nota ? `Se guarda en ${q.nota} a las 3:00` : 'Se guarda en tu bóveda a las 3:00')}</span></div>
      <div className="md-tres">
        <button className="md-btn" disabled={ocupado} onClick={() => correr(() => acc.descartar(it))}>No aplica</button>
        <span />
        <button className="md-btn md-primario" disabled={ocupado || !texto.trim()} onClick={() => correr(() => acc.contestar(q, texto.trim()))}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </>
  )
}

/** Épica → feature → iniciativa, prioridad, fechas y nota. */
function EditorCampos({ campos, set, epicas, hoy, permitirFeature }: { campos: CamposTarea; set: (c: CamposTarea) => void; epicas: Epica[] | null; hoy: string; permitirFeature?: boolean }) {
  const activas = (epicas || []).filter(e => !e.archived)
  const ep = activas.find(e => e.id === campos.epicaId)
  const features = ep?.features || []
  const ft = features.find(f => f.id === campos.featureId)
  const inis = (ft?.iniciativas || []).filter(i => i.estado !== 'cerrada' && i.estado !== 'cancelada')
  const p = (k: Partial<CamposTarea>) => set({ ...campos, ...k })
  const atajos: [string, string][] = [['Hoy', hoy], ['Mañana', sumarDias(hoy, 1)], ['Sin fecha', '']]
  return (
    <div className="bd-editor md-mt12">
      {permitirFeature && (
        <div className="bd-seg">
          <button data-on={!campos.comoFeature} onClick={() => p({ comoFeature: false })}>Tarea</button>
          <button data-on={campos.comoFeature} onClick={() => p({ comoFeature: true, featureId: '', iniciativaId: '' })}>Feature</button>
        </div>
      )}
      <label className="bd-campo"><span>{campos.comoFeature ? 'Nombre del feature' : 'Tarea'}</span>
        <input className="md-input" value={campos.titulo} onChange={e => p({ titulo: e.target.value })} /></label>
      <div className="bd-dos">
        <label className="bd-campo"><span>Épica</span>
          <select className="md-input" value={campos.epicaId} onChange={e => p({ epicaId: e.target.value, featureId: '', iniciativaId: '' })}>
            <option value="">Del diario (bandeja)</option>
            {activas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></label>
        {!campos.comoFeature && (
          <label className="bd-campo"><span>Feature</span>
            <select className="md-input" value={campos.featureId} disabled={!features.length} onChange={e => p({ featureId: e.target.value, iniciativaId: '' })}>
              <option value="">{features.length ? 'Sin feature' : 'La épica no tiene features'}</option>
              {features.map(f => <option key={f.id} value={f.id}>{f.t}</option>)}
            </select></label>
        )}
      </div>
      {!campos.comoFeature && (
        <>
          {inis.length > 0 && (
            <label className="bd-campo"><span>Iniciativa</span>
              <select className="md-input" value={campos.iniciativaId} onChange={e => p({ iniciativaId: e.target.value })}>
                <option value="">Sin iniciativa</option>
                {inis.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select></label>
          )}
          <div className="bd-dos">
            <label className="bd-campo"><span>Prioridad</span>
              <select className="md-input" value={campos.prioridad} onChange={e => p({ prioridad: e.target.value as CamposTarea['prioridad'] })}>
                <option value="">Normal</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
              </select></label>
            <label className="bd-campo"><span>Vence</span>
              <input className="md-input" type="date" value={campos.vence} onChange={e => p({ vence: e.target.value })} /></label>
          </div>
          <div className="bd-campo"><span>Cuándo la haces</span>
            <div className="md-fila md-envuelve">
              {atajos.map(([l, f]) => <button key={l} type="button" className="md-btn md-chico" data-on={campos.plan === f} onClick={() => p({ plan: f })}>{l}</button>)}
              <input className="md-input bd-fecha" type="date" value={campos.plan} onChange={e => p({ plan: e.target.value })} aria-label="Otra fecha" />
            </div></div>
          <label className="bd-campo"><span>Nota (opcional)</span>
            <textarea className="md-input md-area" rows={2} value={campos.nota} onChange={e => p({ nota: e.target.value })} /></label>
        </>
      )}
    </div>
  )
}

function MicChico({ d }: { d: ReturnType<typeof useDictado> }) {
  return (
    <button type="button" className="md-mic" data-on={d.escuchando} onClick={d.escuchando ? d.parar : d.iniciar} aria-label={d.escuchando ? 'Dejar de dictar' : 'Dictar con la voz'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
    </button>
  )
}

/* ── Tu cerebro: dónde quedó lo que decidiste ── */
export function TuCerebro({ aprendido }: { aprendido: DiaAprendido[] }) {
  if (!aprendido.length) return (
    <section id="tu-cerebro">
      <div className="md-lbl"><span>Tu cerebro</span><span>cómo aprende</span></div>
      <div className="md-card"><p className="md-sub">Cada decisión y cada respuesta que das en «Por decidir» se escribe a las 3:00 en su nota de Obsidian. Al día siguiente Claude la lee: no te vuelve a preguntar lo mismo y prioriza con lo que ya decidiste. Aquí verás dónde quedó cada una.</p></div>
    </section>
  )
  const guardadas = aprendido.filter(a => a.guardadoAt).length
  return (
    <section id="tu-cerebro">
      <div className="md-lbl"><span>Tu cerebro aprendió</span><span>{guardadas} guardadas · {aprendido.length - guardadas} esta noche</span></div>
      <div className="md-card md-lista">
        {aprendido.slice(0, 8).map(a => (
          <div key={a.id} className="md-row">
            <span className="md-ico" aria-hidden style={{ color: a.guardadoAt ? 'var(--md-verde)' : 'var(--md-tenue)' }}>{a.guardadoAt ? '✓' : '◷'}</span>
            <div className="md-grow">
              <div>{a.pregunta}</div>
              <div className="md-meta">«{a.respuesta}» · {a.guardadoAt
                ? <>guardado en {a.nota ? <a className="md-link" href={obsidianUrl(a.nota)}>{a.nota}</a> : 'tu bóveda'} el {new Date(a.guardadoAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</>
                : <>se guarda en {a.nota || 'tu bóveda'} a las 3:00</>}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="md-meta md-mt8">Claude lee estas notas cada madrugada: no te vuelve a preguntar lo que ya decidiste y prioriza con ello.</p>
    </section>
  )
}

const CSS_BD = `
.bd-volver{border:1px solid var(--md-linea);background:#fff;border-radius:999px;padding:7px 14px;font:500 14px var(--dia-ui);color:var(--md-tinta);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.bd-volver:hover{border-color:var(--md-tinta2)}
.bd-progreso>div{height:100%;background:var(--md-verde);border-radius:999px;transition:width .3s ease}
.bd-seccion{margin-top:22px}
.bd-sec-cab{margin:0 2px 8px}
.bd-sec-cab h2 span{font:500 11px var(--dia-ui);background:var(--md-suave);color:var(--md-acento);border-radius:999px;padding:1px 7px}
.bd-hechas-tog{background:none;border:0;padding:4px 2px;font:500 14px var(--dia-ui);color:var(--md-tinta2);cursor:pointer}
@media(max-width:700px){.bd-pie{bottom:calc(92px + env(safe-area-inset-bottom))}}
.bd-pie .md-btn{border-radius:999px}
.bd-fin{text-align:center;padding:28px 20px}
.bd-fin-ico{width:44px;height:44px;border-radius:50%;margin:0 auto 10px;display:grid;place-items:center;background:#e7efe2;color:var(--md-verde);font-size:20px}
.bd-centro{justify-content:center}
.bd-filtros{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 10px}
.bd-filtros button{border:1px solid var(--md-linea);background:#fff;border-radius:999px;padding:6px 12px;font:500 13px var(--dia-ui);color:var(--md-tinta2);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.bd-filtros button[data-on="true"]{background:var(--md-tinta);color:var(--md-papel);border-color:var(--md-tinta)}
.bd-filtros button span{font-size:11px;background:var(--md-suave);color:var(--md-acento);border-radius:999px;padding:0 6px}
.bd-filtros button[data-on="true"] span{background:rgba(255,255,255,.18);color:#fff}
.bd-abrir{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:4px;background:none;border:0;padding:0;text-align:left;font:inherit;color:inherit;cursor:pointer}
.bd-abrir:hover .bd-tit{color:var(--md-acento)}
.bd-abrir-txt{cursor:pointer;flex:none}
.bd-rapidos{display:flex;gap:4px;flex:none}
.bd-rapidos .md-icobtn{width:34px;height:34px;border:1px solid var(--md-linea);border-radius:10px;font-size:14px}
.bd-si{color:var(--md-verde)!important}
.bd-estado{display:flex;flex-direction:column;align-items:flex-end;font-size:12px;color:var(--md-tenue);flex:none}
.bd-velo{position:fixed;inset:0;background:rgba(28,26,23,.42);z-index:120;display:flex;align-items:flex-start;justify-content:center;padding:40px 14px;overflow:auto;animation:md-aparece .15s ease-out}
.bd-ficha{background:#fff;border-radius:20px;width:100%;max-width:560px;padding:16px 20px 20px;box-shadow:0 30px 70px -30px rgba(28,26,23,.6)}
.bd-cab{margin:-4px -6px 10px}
.bd-cab .md-icobtn{font-size:20px;padding:2px 10px}
.bd-bloque{display:inline-block}
.bd-ya{color:var(--md-verde)}
.bd-ideas-lista{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto}
.bd-ideas-lista li{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:10px;background:var(--md-suave)}
.bd-idea-etq{font:600 11px var(--dia-ui);letter-spacing:.02em;text-transform:uppercase}
.bd-idea-nueva{color:#3f6b2c}.bd-idea-rep{color:#a1621c}.bd-idea-ya{color:#8a8378}
.bd-idea-t{font:500 14px var(--dia-ui);line-height:1.35}
.bd-editor{display:flex;flex-direction:column;gap:10px;background:var(--md-papel);border:1px solid var(--md-linea2);border-radius:14px;padding:12px}
.bd-campo{display:flex;flex-direction:column;gap:4px}
.bd-campo>span{font-size:12px;color:var(--md-tinta2)}
.bd-dos{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:520px){.bd-dos{grid-template-columns:1fr}}
.bd-fecha{width:auto;flex:1;min-width:140px}
.bd-seg{display:inline-flex;background:#f1ebe1;border-radius:10px;padding:3px;align-self:flex-start}
.bd-seg button{border:0;background:transparent;border-radius:8px;padding:6px 14px;font:500 13px var(--dia-ui);color:var(--md-tinta2);cursor:pointer}
.bd-seg button[data-on="true"]{background:#fff;color:var(--md-tinta)}
.md-btn[data-on="true"]{background:var(--md-tinta);color:var(--md-papel);border-color:var(--md-tinta)}
.bd-check{display:flex;gap:8px;align-items:center;font-size:14px;cursor:pointer}
.bd-barra{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:14px;padding:10px 0;background:var(--md-papel)}
.bd-barra-av{flex:1;max-width:260px;display:flex;gap:10px;align-items:center}
.bd-progreso{flex:1;height:6px;border-radius:999px;background:var(--md-linea2);overflow:hidden}
.bd-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-top:6px}
.bd-falta{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;width:78px;height:78px;border-radius:22px;background:var(--md-suave);border:1px solid #ead8c3;color:var(--md-acento)}
.bd-falta b{font:400 34px/1 var(--dia-serif),Georgia,serif}
.bd-falta span{font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;margin-top:2px}
@media(max-width:520px){.bd-falta{width:60px;height:60px;border-radius:18px}.bd-falta b{font-size:26px}}
.bd-sec-cab h2{font:600 15px var(--dia-ui);margin:0;color:var(--md-tinta);display:flex;gap:9px;align-items:center}
.bd-sec-cab h2 i{width:9px;height:9px;border-radius:50%;background:var(--bd-c)}
.bd-sec-cab p{margin:3px 0 0 18px}
.bd-tarjeta{background:#fff;border:1px solid var(--md-linea);border-radius:18px;overflow:hidden}
.bd-fila{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-top:1px solid var(--md-linea2);transition:background .15s,opacity .25s}
.bd-fila:first-child{border-top:0}
.bd-tarjeta .bd-fila:hover{background:#fcfaf6}
.bd-fila[aria-busy="true"]{opacity:.6}
.bd-fila[data-hecha] .bd-tit{text-decoration:line-through;color:var(--md-tenue)}
.bd-palomita{flex:none;width:24px;height:24px;margin-top:1px;border-radius:50%;border:1.5px solid #cfc6b8;background:#fff;display:inline-grid;place-items:center;color:#fff;font-size:13px;font-weight:700;cursor:pointer;padding:0;transition:all .15s}
.bd-palomita:hover{border-color:var(--md-verde);background:#eef4ea;color:var(--md-verde)}
.bd-palomita:hover:empty::after{content:'✓'}
.bd-palomita[data-on]{background:var(--md-verde);border-color:var(--md-verde);color:#fff}
.bd-palomita-vacia{flex:none;width:24px}
.bd-cuerpo{flex:1;min-width:0}
.bd-tit{font-weight:500;font-size:15.5px;line-height:1.35;color:var(--md-tinta)}
.bd-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12.5px;color:var(--md-tenue)}
.bd-epica{background:#f3eee6;color:var(--md-tinta2);border-radius:6px;padding:1px 7px;font-size:12px}
.bd-acciones{display:flex;gap:0;flex:none;align-items:center;border:1px solid var(--md-linea);border-radius:12px;overflow:hidden;background:#fff}
.bd-acc{border:0;border-left:1px solid var(--md-linea);background:#fff;padding:8px 14px;font:500 13.5px var(--dia-ui);color:var(--md-tinta);cursor:pointer;white-space:nowrap}
.bd-acc:first-child{border-left:0}
.bd-acc:hover{background:#f6f1e9}
.bd-acc-no{color:var(--md-tenue)}
.bd-acc-si{background:var(--md-tinta);color:var(--md-papel)}
.bd-acc-si:hover{background:#000}
.bd-acc:disabled,.bd-op:disabled{opacity:.5;cursor:default}
.bd-opciones{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.bd-op{border:1px solid var(--md-linea);background:#fff;border-radius:999px;padding:6px 13px;font:500 13.5px var(--dia-ui);color:var(--md-tinta);cursor:pointer}
.bd-op:hover{border-color:var(--md-tinta);background:#faf7f2}
.bd-op-otra,.bd-op-luego{border-style:dashed;color:var(--md-tinta2)}
.bd-op-luego{margin-left:auto;border-color:transparent}
.bd-responder{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.bd-pie{position:sticky;bottom:12px;z-index:10;margin-top:22px;display:flex;justify-content:space-between;align-items:center;gap:10px;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid var(--md-linea);border-radius:999px;padding:6px;box-shadow:0 10px 30px -18px rgba(28,26,23,.45)}
.bd-pie-txt{flex:1;text-align:center}
.bd-ya-hice{width:100%;display:flex;gap:10px;align-items:center;justify-content:center;border:1px dashed #b9cfae;background:#f3f8f0;color:#3f6b2c;border-radius:12px;padding:10px;font:500 14px var(--dia-ui);cursor:pointer}
.bd-ya-hice:hover{background:#e7f0e1}
.bd-ya-hice .bd-palomita{width:18px;height:18px;pointer-events:none}
@media(max-width:640px){
  .bd-fila{flex-wrap:wrap;padding:13px 14px}
  .bd-cuerpo{flex:1 1 calc(100% - 40px)}
  .bd-acciones{margin-left:38px;width:calc(100% - 38px)}
  .bd-acc{flex:1;padding:10px 8px}
  .bd-pie-txt{display:none}
  .bd-op-luego{margin-left:0}
}
`
