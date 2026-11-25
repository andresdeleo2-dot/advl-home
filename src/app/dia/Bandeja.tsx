'use client'

/* «Por decidir» de Mi día: UNA sola bandeja con todo lo que salió de anoche (pendientes nuevos, sugerencias,
 * notas del inbox, decisiones y preguntas para tu cerebro). Lista con filtros; al tocar cualquiera se abre su
 * ficha emergente, donde te mueves con ‹ › entre todas y, antes de aceptar, le pones épica, feature, iniciativa,
 * prioridad, fechas y nota. Una decisión también se puede volver tarea o feature. Abajo, «Tu cerebro»: dónde
 * quedó en Obsidian cada cosa que decidiste. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Epica, EpicaTask } from '@/lib/supabase'
import { obsidianUrl, sumarDias, resolverPlan, type DiaData, type DiaTarjeta, type DiaDecision, type DiaPreguntaCerebro, type DiaRespuesta, type DiaAprendido } from '@/lib/dia'
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
  decidir: (d: DiaDecision, texto: string, crear: CamposTarea | null) => Promise<void>
  contestar: (q: DiaPreguntaCerebro, texto: string) => Promise<void>
}

type Filtro = 'todo' | 'nuevo' | 'sugerencia' | 'decision' | 'cerebro' | 'mover'
const FILTROS: [Filtro, string][] = [['todo', 'Todo'], ['nuevo', 'Pendientes nuevos'], ['sugerencia', 'Sugerencias'], ['decision', 'Decisiones'], ['cerebro', 'Para tu cerebro'], ['mover', 'Inbox']]
const SUGERENCIA = new Set(['sugerencia', 'limpieza', 'evitando', 'esperando'])
const filtroDe = (it: Item): Filtro => it.kind === 'decision' ? 'decision' : it.kind === 'cerebro' ? 'cerebro' : it.c.tipo === 'nuevo' ? 'nuevo' : it.c.tipo === 'mover' ? 'mover' : 'sugerencia'
const ETIQUETA: Record<string, string> = { nuevo: 'Nuevo del diario', sugerencia: 'Sugerencia', limpieza: 'Limpieza', evitando: 'Lo vienes evitando', esperando: 'Esperando a otros', mover: 'Nota del inbox', decision: 'Decisión', cerebro: 'Para tu cerebro' }
const tipoDe = (it: Item) => (it.kind === 'tarjeta' ? it.c.tipo : it.kind)
const tituloDe = (it: Item) => (it.kind === 'tarjeta' ? it.c.titulo : it.kind === 'decision' ? it.d.pregunta : it.q.pregunta)
const ESTADO_TXT: Record<string, string> = { aceptada: 'Aceptada', pospuesta: 'Pospuesta', descartada: 'Descartada', respondida: 'Contestada' }

export function itemsDe(data: DiaData | null): Item[] {
  if (!data) return []
  return [
    ...data.tarjetas.map(c => ({ kind: 'tarjeta' as const, id: c.id, c })),
    ...data.decisiones.map(d => ({ kind: 'decision' as const, id: d.id, d })),
    ...(data.cerebro || []).map(q => ({ kind: 'cerebro' as const, id: q.id, q })),
  ]
}

export function Bandeja({ data, hoy, respuestas, epicas, acc, alTerminar, abrirEn }: {
  data: DiaData; hoy: string; respuestas: Map<string, DiaRespuesta>; epicas: Epica[] | null
  acc: AccionesBandeja; alTerminar: () => void; abrirEn?: string | null
}) {
  const [filtro, setFiltro] = useState<Filtro>('todo')
  const [abierto, setAbierto] = useState<string | null>(abrirEn ?? null)
  const todos = useMemo(() => itemsDe(data), [data])
  const lista = useMemo(() => todos.filter(it => filtro === 'todo' || filtroDe(it) === filtro), [todos, filtro])
  const pendientes = todos.filter(it => !respuestas.has(it.id))
  const cuenta = (f: Filtro) => todos.filter(it => (f === 'todo' || filtroDe(it) === f) && !respuestas.has(it.id)).length
  const idx = abierto ? lista.findIndex(it => it.id === abierto) : -1
  const actual = idx >= 0 ? lista[idx] : null
  const ir = (d: number) => { if (!lista.length) return; const n = (idx + d + lista.length) % lista.length; setAbierto(lista[n].id) }
  // Después de decidir, pasa a la siguiente SIN decidir (si ya no hay, cierra).
  const siguiente = useCallback((desde: string) => {
    const i = lista.findIndex(it => it.id === desde)
    for (let k = 1; k <= lista.length; k++) { const it = lista[(i + k) % lista.length]; if (it.id !== desde && !respuestas.has(it.id)) { setAbierto(it.id); return } }
    setAbierto(null)
  }, [lista, respuestas])

  return (
    <section className="bd md-fade">
      <div className="md-entre md-base">
        <h1 className="md-fecha">Por decidir</h1>
        <span className="md-meta">{todos.length - pendientes.length} de {todos.length} listas</span>
      </div>
      <p className="md-sub md-mt4">Lo que salió de anoche. Toca cualquiera para verla completa, cambiarle épica, feature o fecha, y moverte entre todas con ‹ ›.</p>

      <div className="bd-filtros" role="tablist" aria-label="Filtrar">
        {FILTROS.filter(([f]) => f === 'todo' || todos.some(it => filtroDe(it) === f)).map(([f, l]) => (
          <button key={f} role="tab" aria-selected={filtro === f} data-on={filtro === f} onClick={() => setFiltro(f)}>{l}{cuenta(f) ? <span>{cuenta(f)}</span> : null}</button>
        ))}
      </div>

      <div className="md-card md-lista">
        {lista.map(it => {
          const r = respuestas.get(it.id)
          const meta = it.kind === 'tarjeta' ? [it.c.epica, it.c.tipo === 'mover' ? it.c.destino : null].filter(Boolean).join(' · ') : (it.kind === 'decision' ? it.d.nota : it.q.nota) || ''
          return (
            <div key={it.id} className="md-row bd-fila" data-hecha={!!r}>
              <button className="bd-abrir" onClick={() => setAbierto(it.id)}>
                <span className={`md-chip md-tipo-${tipoDe(it) === 'decision' ? 'nuevo' : tipoDe(it) === 'cerebro' ? 'esperando' : tipoDe(it)}`}>{ETIQUETA[tipoDe(it)]}</span>
                <span className="bd-tit">{tituloDe(it)}</span>
                {meta && <span className="md-meta">{meta}</span>}
              </button>
              {r ? (
                <span className="bd-estado"><span>{ESTADO_TXT[r.estado] || r.estado}</span><button className="md-link" onClick={() => acc.deshacer(it.id)}>Deshacer</button></span>
              ) : it.kind === 'tarjeta' ? (
                <span className="bd-rapidos">
                  <button className="md-icobtn" title="Descartar" aria-label="Descartar" onClick={() => acc.descartar(it)}>✕</button>
                  <button className="md-icobtn bd-si" title={it.c.tipo === 'nuevo' ? 'Sí, hoy' : 'Sí'} aria-label="Aceptar" onClick={() => acc.aceptar(it.c, null)}>✓</button>
                </span>
              ) : <span className="md-meta bd-abrir-txt" onClick={() => setAbierto(it.id)}>Contestar ›</span>}
            </div>
          )
        })}
        {!lista.length && <div className="md-row md-meta">Nada en este filtro.</div>}
      </div>

      <button className="md-btn md-primario md-ancho" onClick={alTerminar}>{pendientes.length ? `Seguir: elegir tus 3 de hoy (quedan ${pendientes.length} sin decidir)` : 'Listo: elegir tus 3 de hoy'}</button>

      {actual && (
        <Ficha key={actual.id} it={actual} pos={idx + 1} total={lista.length} r={respuestas.get(actual.id)} hoy={hoy} epicas={epicas} acc={acc}
          cerrar={() => setAbierto(null)} anterior={() => ir(-1)} siguienteItem={() => ir(1)} hecho={() => siguiente(actual.id)} />
      )}
      <style>{CSS_BD}</style>
    </section>
  )
}

/* ── Ficha emergente ── */
function Ficha({ it, pos, total, r, hoy, epicas, acc, cerrar, anterior, siguienteItem, hecho }: {
  it: Item; pos: number; total: number; r?: DiaRespuesta; hoy: string; epicas: Epica[] | null; acc: AccionesBandeja
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
          <button className="md-icobtn" onClick={cerrar} aria-label="Cerrar">✕</button>
        </div>
        <span className={`md-chip md-tipo-${tipoDe(it) === 'decision' ? 'nuevo' : tipoDe(it) === 'cerebro' ? 'esperando' : tipoDe(it)}`}>{ETIQUETA[tipoDe(it)]}</span>
        <p className="md-titulo-tarjeta">{tituloDe(it)}</p>
        {it.kind === 'tarjeta' && it.c.detalle && <p className="md-sub">{it.c.detalle}</p>}
        {it.kind === 'cerebro' && it.q.porque && <p className="md-sub">{it.q.porque}</p>}
        {(() => { const n = it.kind === 'tarjeta' ? it.c.nota : it.kind === 'decision' ? it.d.nota : it.q.nota; return n ? <a className="md-link md-mt4 bd-bloque" href={obsidianUrl(n)}>Abrir {n} en Obsidian ↗</a> : null })()}
        {r && <p className="bd-ya md-mt8">Ya {(ESTADO_TXT[r.estado] || r.estado).toLowerCase()}. <button className="md-link" onClick={() => correr(() => acc.deshacer(it.id))}>Deshacer</button></p>}
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
      <div className="md-tres">
        <button className="md-btn" disabled={ocupado} onClick={() => correr(() => acc.descartar({ kind: 'tarjeta', id: c.id, c }))}>Descartar</button>
        <button className="md-btn" disabled={ocupado} onClick={() => setOtro(v => !v)} aria-expanded={otro}>Otro día</button>
        <button className="md-btn md-primario" disabled={ocupado || !campos.titulo.trim()} onClick={() => correr(() => acc.aceptar(c, campos))}>{ocupado ? 'Guardando…' : campos.comoFeature ? 'Crear feature' : existente ? 'Aceptar' : 'Guardar tarea'}</button>
      </div>
    </>
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
.bd-filtros{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 10px}
.bd-filtros button{border:1px solid var(--md-linea);background:#fff;border-radius:999px;padding:6px 12px;font:500 13px var(--dia-ui);color:var(--md-tinta2);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.bd-filtros button[data-on="true"]{background:var(--md-tinta);color:var(--md-papel);border-color:var(--md-tinta)}
.bd-filtros button span{font-size:11px;background:var(--md-suave);color:var(--md-acento);border-radius:999px;padding:0 6px}
.bd-filtros button[data-on="true"] span{background:rgba(255,255,255,.18);color:#fff}
.bd-fila{align-items:center}
.bd-fila[data-hecha="true"] .bd-tit{color:var(--md-tenue);text-decoration:line-through}
.bd-abrir{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:4px;background:none;border:0;padding:0;text-align:left;font:inherit;color:inherit;cursor:pointer}
.bd-abrir:hover .bd-tit{color:var(--md-acento)}
.bd-tit{font-weight:500}
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
`
