'use client'

import { useEffect, useState } from 'react'
import MomentoModal, { type Momento } from './MomentoModal'

const VIDA_URL = 'https://mi-vida-neon.vercel.app/vida'
const WINDOW_DAYS = 14 // efemérides de las próximas ~2 semanas

// Color por tipo (mismo criterio visual que mi-vida)
const TIPO_COLOR: Record<string, string> = {
  Familia: '#b06a44', Escuela: '#5b7794', Amor: '#a85a6a', Trabajo: '#6f8158',
  Viaje: '#4f8a86', Logro: '#bf8f3c', Amistad: '#876da0', Amistades: '#876da0',
  Hobby: '#7a9b6f', Mudanza: '#9a7b53', Pérdida: '#7c7268', Salud: '#5f8a9b',
  Relación: '#a85a6a', Recuerdo: '#9a8a6c', Cumpleaños: '#bb6a47', Nace: '#b06a44',
  'Punto clave': '#bb6a47', 'Evento importante': '#bf8f3c',
}
function colorDe(tipo: string) {
  return TIPO_COLOR[tipo] ?? '#8a7a5c'
}

type Efemeride = Momento & { daysUntil: number; yearsAgo: number; when: Date }

function midnight(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// Calcula la próxima efeméride (mismo día-mes) dentro de la ventana
function efemeride(m: Momento, today: Date): Efemeride | null {
  if (!m.fecha) return null
  const orig = new Date(m.fecha + 'T12:00:00')
  if (isNaN(orig.getTime())) return null
  const month = orig.getMonth()
  const day = orig.getDate()

  let when = midnight(new Date(today.getFullYear(), month, day))
  if (when.getTime() < today.getTime()) {
    when = midnight(new Date(today.getFullYear() + 1, month, day))
  }
  const daysUntil = Math.round((when.getTime() - today.getTime()) / 86_400_000)
  if (daysUntil > WINDOW_DAYS) return null

  const yearsAgo = when.getFullYear() - orig.getFullYear()
  return { ...m, daysUntil, yearsAgo, when }
}

function fmtWhen(e: Efemeride) {
  if (e.daysUntil === 0) return 'Hoy'
  if (e.daysUntil === 1) return 'Mañana'
  return e.when.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtHace(years: number) {
  if (years <= 0) return null
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`
}

export default function MomentosWidget() {
  const [recuerdos, setRecuerdos] = useState<Momento[] | null>(null)
  const [contexto, setContexto] = useState<Momento[]>([])
  const [selected, setSelected] = useState<Momento | null>(null)

  useEffect(() => {
    fetch('/api/momentos')
      .then(r => r.json())
      .then(j => {
        setRecuerdos(j.ok && Array.isArray(j.recuerdos) ? j.recuerdos : [])
        setContexto(j.ok && Array.isArray(j.contexto) ? j.contexto : [])
      })
      .catch(() => { setRecuerdos([]); setContexto([]) })
  }, [])

  const today = midnight(new Date())
  const efemerides = recuerdos
    ?.map(m => efemeride(m, today))
    .filter((e): e is Efemeride => e !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil || (b.importancia ?? 0) - (a.importancia ?? 0))

  return (
    <div className="flex flex-col rounded-2xl glass overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <p className="eyebrow">Momentos especiales</p>
        <a href={VIDA_URL} target="_blank" rel="noopener noreferrer"
          title="Abrir Mi Vida"
          className="flex h-5 w-5 items-center justify-center rounded-lg text-[rgba(15,35,64,0.45)] hover:bg-[rgba(15,35,64,0.06)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17 17 7M7 7h10v10"/></svg>
        </a>
      </div>

      <div className="flex flex-col divide-y divide-[rgba(15,35,64,0.07)] overflow-y-auto" style={{ maxHeight: 280 }}>
        {!recuerdos && (
          <p className="px-4 py-6 text-center text-sm text-[rgba(20,35,61,0.4)]">Cargando…</p>
        )}
        {recuerdos && efemerides?.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-[rgba(20,35,61,0.4)]">Sin efemérides estos días</p>
        )}
        {efemerides?.map(e => {
          const hoy = e.daysUntil === 0
          const hace = fmtHace(e.yearsAgo)
          return (
            <button key={e.id} onClick={() => setSelected(e)}
              className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-[rgba(15,35,64,0.03)] ${hoy ? 'bg-[rgba(194,147,58,0.06)]' : ''}`}>
              <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: colorDe(e.tipo) }} />
              <div className="min-w-0 flex-1">
                <p className="clamp-1 text-[12.5px] font-semibold text-[#14233D]">{e.titulo}</p>
                <p className="mt-0.5 text-[11px] text-[rgba(20,35,61,0.46)]">
                  <span className={hoy ? 'font-semibold text-[#A87A2C]' : ''}>{fmtWhen(e)}</span>
                  {hace && <span> · {hace}</span>}
                  {e.tipo && <span> · {e.tipo}</span>}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <MomentoModal
          recuerdo={selected}
          todos={efemerides ?? []}
          allRecuerdos={recuerdos ?? []}
          contexto={contexto}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
