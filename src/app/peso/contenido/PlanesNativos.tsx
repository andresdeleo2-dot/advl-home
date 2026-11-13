'use client'

// «Rutinas y dietas» nativo: la rutina (con sus ilustraciones), la dieta y el plan maestro como secciones de la propia
// página. «Editar» convierte las mismas secciones en formularios; «Guardar» las escribe en la base. Sin la tabla
// (sql/peso-05-contenido.sql) todo se lee, pero no se edita: así no se pierde trabajo que luego no se pueda guardar.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ContenidoCarga, Doc, DocDieta, DocId, DocPlan, DocRutina } from '@/lib/peso-contenido'
import type { PesoRecord } from '@/lib/peso'
import type { DiarioCarga, VistaPlanes } from '@/lib/peso-diario'
import { BTN, COLOR, Pill, Panel, Segmented } from '../ui'
import { guardarDocumento, leerDocumento, restaurarDocumento } from './api'
import { ProveedorDoc } from './edicion'
import RutinaVista from './RutinaVista'
import DietaVista from './DietaVista'
import PlanVista from './PlanVista'
import DiarioVista, { hayBorradorDiario } from '../diario/DiarioVista'

const ARCHIVO_SQL = 'peso-05-contenido.sql'
const OPCIONES: { value: VistaPlanes; label: string }[] = [
  { value: 'rutina', label: '🏋️ Rutina' },
  { value: 'dieta', label: '🍽️ Dieta' },
  { value: 'plan', label: '🎯 Plan maestro' },
  { value: 'diario', label: '📓 Mi diario' },
]

/** Borradores sin guardar: viven mientras la página siga abierta, así que cambiar de pestaña no los pierde. */
const pendientes: Partial<Record<DocId, Doc>> = {}

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null

export default function PlanesNativos({ carga, data, hoy, onCarga, docInicial = null, diario = null, onDiario, onMedir }: {
  carga: ContenidoCarga; data: PesoRecord[]; hoy: string; onCarga: (c: ContenidoCarga) => void; docInicial?: VistaPlanes | null
  /** El diario (lo que anotas cada día). Sin él, la pestaña solo ofrece la rutina, la dieta y el plan. */
  diario?: DiarioCarga | null; onDiario: (d: DiarioCarga) => void; onMedir: () => void
}) {
  const pendiente = (Object.keys(pendientes) as DocId[])[0] ?? null
  // `verDiario` es una vista aparte de los tres documentos: no se edita con «Editar», tiene su propio formulario por día.
  const [verDiario, setVerDiario] = useState(!pendiente && !!diario && (docInicial === 'diario' || hayBorradorDiario()))
  const [docSel, setDocSel] = useState<DocId>(pendiente ?? (docInicial && docInicial !== 'diario' ? docInicial : 'rutina'))
  const [borrador, setBorrador] = useState<Doc | null>(pendiente ? pendientes[pendiente] ?? null : null)
  const [ocupado, setOcupado] = useState<'guardar' | 'restaurar' | 'revisar' | null>(null)
  const [aviso, setAviso] = useState<Aviso>(pendiente ? { tipo: 'ok', texto: 'Sigues donde lo dejaste: tus cambios aún no están guardados.' } : null)
  const raiz = useRef<HTMLDivElement>(null)
  const original = carga.contenido[docSel]
  const editando = borrador !== null && borrador.id === docSel
  const sinLeer = !!carga.error   // la lectura falló: lo que se ve es el original, y editarlo podría pisar tu versión guardada
  const sucio = editando && JSON.stringify(borrador) !== JSON.stringify(original)
  const visible: Doc = editando && borrador ? borrador : original

  // Si llega otro documento desde afuera (un atajo del Resumen) y no se está editando, se muestra ese.
  useEffect(() => {
    if (!docInicial || borrador) return
    if (docInicial === 'diario') { if (diario) setVerDiario(true) } else { setVerDiario(false); setDocSel(docInicial) }
  }, [docInicial]) // eslint-disable-line react-hooks/exhaustive-deps

  // Con cambios sin guardar, el navegador avisa antes de cerrar o recargar la página.
  useEffect(() => {
    if (!sucio) return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [sucio])

  const cambiar = useCallback((d: Doc) => { setBorrador(d); pendientes[d.id] = d }, [])
  const terminar = () => { delete pendientes[docSel]; setBorrador(null) }

  function empezar() {
    if (!carga.disponible || sinLeer) return
    const copia = JSON.parse(JSON.stringify(original)) as Doc
    setAviso(null)
    cambiar(copia)
  }

  function cancelar() {
    if (sucio && !window.confirm('¿Descartar los cambios que no has guardado?')) return
    terminar()
    setAviso(null)
  }

  async function guardar() {
    if (!borrador || ocupado) return
    setOcupado('guardar'); setAviso(null)
    const r = await guardarDocumento(borrador)
    setOcupado(null)
    if (!r.ok) {
      if (r.error.codigo === 'sin_tabla') onCarga({ ...carga, disponible: false })
      setAviso({ tipo: 'error', texto: r.error.mensaje })
      return
    }
    delete pendientes[docSel]
    onCarga({ ...carga, contenido: { ...carga.contenido, [docSel]: r.data.doc }, guardados: { ...carga.guardados, [docSel]: true }, disponible: true })
    setBorrador(null)
    setAviso({ tipo: 'ok', texto: 'Cambios guardados.' })
    raiz.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }

  async function restaurar() {
    if (ocupado) return
    if (!window.confirm(`¿Volver al original? Se borra tu versión de «${original.titulo}» y regresa la que venía con tu plan de octubre.`)) return
    setOcupado('restaurar'); setAviso(null)
    const r = await restaurarDocumento(docSel)
    setOcupado(null)
    if (!r.ok) { setAviso({ tipo: 'error', texto: r.error.mensaje }); return }
    delete pendientes[docSel]
    onCarga({ ...carga, contenido: { ...carga.contenido, [docSel]: r.data.doc }, guardados: { ...carga.guardados, [docSel]: false } })
    setBorrador(null)
    setAviso({ tipo: 'ok', texto: 'Volvió el original.' })
  }

  /** Vuelve a leer los tres documentos (tras pegar el SQL, o tras una lectura fallida). Solo reemplaza lo que hay si TODO se leyó bien. */
  async function revisarTabla() {
    if (ocupado) return
    setOcupado('revisar'); setAviso(null)
    const ids: DocId[] = ['rutina', 'dieta', 'plan']
    const rs = await Promise.all(ids.map(id => leerDocumento(id)))
    setOcupado(null)
    const mala = rs.find(r => !r.ok)
    if (mala && !mala.ok) { setAviso({ tipo: 'error', texto: mala.error.mensaje }); return }
    const buenas = rs.flatMap(r => (r.ok ? [r.data] : []))
    const disponible = buenas.every(b => b.disponible)
    const nueva: ContenidoCarga = {
      contenido: { rutina: buenas[0].doc as DocRutina, dieta: buenas[1].doc as DocDieta, plan: buenas[2].doc as DocPlan },
      guardados: { rutina: buenas[0].guardado, dieta: buenas[1].guardado, plan: buenas[2].guardado },
      disponible,
    }
    onCarga(nueva)
    setAviso(disponible ? { tipo: 'ok', texto: sinLeer ? 'Listo: se leyó lo que tenías guardado.' : '¡Listo! Ya puedes editar y guardar.' } : { tipo: 'error', texto: 'Todavía no existe la tabla. Pega el SQL en Supabase y vuelve a intentar.' })
  }

  function cambiarDoc(d: VistaPlanes) {
    if (editando) { setAviso({ tipo: 'error', texto: 'Guarda o cancela tus cambios antes de cambiar de documento.' }); return }
    setAviso(null)
    if (d === 'diario') { setVerDiario(true); return }
    setVerDiario(false); setDocSel(d)
  }

  const guardado = carga.guardados[docSel]

  return (
    <div ref={raiz} className="space-y-5" style={{ scrollMarginTop: 70 }}>
      <Panel
        eyebrow="Tu plan" icon="🏋️" title="Rutinas y dietas"
        subtitle={verDiario ? 'Anota lo que comes y entrenas, y mira cuánto ganas o pierdes.' : 'Todo está aquí mismo y se cambia aquí mismo: toca «Editar», haz tus cambios y guarda.'}
        right={!editando && !verDiario ? (
          <>
            {guardado && <button type="button" disabled={!!ocupado} onClick={() => void restaurar()} className={`${BTN.base} ${BTN.ghost} min-h-10`}>{ocupado === 'restaurar' ? 'Restaurando…' : 'Volver al original'}</button>}
            <button type="button" onClick={empezar} disabled={!carga.disponible || sinLeer} title={sinLeer ? 'No se pudo leer lo que tenías guardado' : carga.disponible ? 'Editar este documento' : 'Falta crear la tabla para guardar cambios'} className={`${BTN.base} ${BTN.gold} min-h-10`}>✏️ Editar</button>
          </>
        ) : undefined}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<VistaPlanes> ariaLabel="Documento" value={verDiario ? 'diario' : docSel} onChange={cambiarDoc} options={diario ? OPCIONES : OPCIONES.filter(o => o.value !== 'diario')} />
          {!verDiario && (editando
            ? <Pill color={COLOR.warn}>✏️ Editando{sucio ? ' · cambios sin guardar' : ''}</Pill>
            : <Pill color={guardado ? COLOR.good : COLOR.muted}>{guardado ? '✓ Tu versión' : 'Original del plan de octubre'}</Pill>)}
        </div>

        {!verDiario && sinLeer && (
          <div role="alert" className="mt-4 rounded-xl px-4 py-3" style={{ background: '#FEF2F1', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.bad}` }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#7F1D1D' }}>
              <strong>No se pudo leer lo que tenías guardado.</strong> Lo que ves es el original. Tu versión no se borró; para no pisarla, la edición está bloqueada hasta que se lea bien.
            </p>
            <button type="button" onClick={() => void revisarTabla()} disabled={ocupado === 'revisar'} className={`${BTN.base} ${BTN.ghost} mt-2.5 min-h-10`}>{ocupado === 'revisar' ? 'Reintentando…' : 'Reintentar'}</button>
          </div>
        )}

        {!verDiario && !carga.disponible && !sinLeer && (
          <div role="note" className="mt-4 rounded-xl px-4 py-3" style={{ background: '#FFF8E6', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.warn}` }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#5A3205' }}>
              <strong>Para poder editar y guardar falta un paso único en Supabase.</strong> Pega el archivo <code style={{ fontWeight: 700 }}>{ARCHIVO_SQL}</code> en el SQL Editor (está en tu carpeta Descargas, dentro de «PEGAR-EN-SUPABASE-PESO»). Mientras tanto puedes leer todo.
            </p>
            <button type="button" onClick={() => void revisarTabla()} disabled={ocupado === 'revisar'} className={`${BTN.base} ${BTN.ghost} mt-2.5 min-h-10`}>{ocupado === 'revisar' ? 'Revisando…' : 'Ya lo pegué, revisar'}</button>
          </div>
        )}

        <div role="status" aria-live="polite">
          {!verDiario && aviso && (
            <p className="mt-4 rounded-xl px-4 py-2.5" role={aviso.tipo === 'error' ? 'alert' : undefined}
              style={aviso.tipo === 'ok'
                ? { background: '#EFF9F2', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.good}`, color: '#14532D', fontSize: 13.5 }
                : { background: '#FEF2F1', border: `1px solid ${COLOR.line}`, borderLeft: `4px solid ${COLOR.bad}`, color: '#7F1D1D', fontSize: 13.5 }}>
              {aviso.texto}
            </p>
          )}
        </div>
      </Panel>

      {verDiario && diario ? (
        <DiarioVista carga={diario} onCarga={onDiario} data={data} hoy={hoy} contenido={carga} onMedir={onMedir} />
      ) : (
        <ProveedorDoc doc={visible} editando={editando} onCambio={cambiar}>
          {docSel === 'rutina' && <RutinaVista hoy={hoy} />}
          {docSel === 'dieta' && <DietaVista />}
          {docSel === 'plan' && <PlanVista data={data} hoy={hoy} />}
        </ProveedorDoc>
      )}

      {editando && (
        <div className="sticky z-30 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3" style={{ bottom: 'max(12px, env(safe-area-inset-bottom))', background: COLOR.navy, color: COLOR.onDark, boxShadow: '0 18px 40px -16px rgba(15,35,64,.7)' }}>
          <span style={{ fontSize: 13, color: COLOR.onDarkMuted }}>{sucio ? 'Tienes cambios sin guardar.' : 'Sin cambios todavía.'}</span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={cancelar} disabled={ocupado === 'guardar'} className={`${BTN.base} min-h-11 px-4 text-sm`} style={{ background: 'rgba(255,255,255,.1)', color: COLOR.onDark }}>Cancelar</button>
            <button type="button" onClick={() => void guardar()} disabled={ocupado === 'guardar' || !sucio} className={`${BTN.base} ${BTN.gold} min-h-11`}>{ocupado === 'guardar' ? 'Guardando…' : 'Guardar cambios'}</button>
          </span>
        </div>
      )}
    </div>
  )
}
