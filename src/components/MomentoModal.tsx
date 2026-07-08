'use client'

import { useEffect } from 'react'

export type Momento = {
  id: number
  titulo: string
  tipo: string
  fecha: string
  fecha_fin: string | null
  nota: string | null
  personas: string[] | null
  fotos: string[] | null
  importancia: number | null
  outstanding: boolean
}

const VIDA_URL = 'https://mi-vida-neon.vercel.app/vida'

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

// Google Drive /file/d/ID/view → thumbnail directo (igual que mi-vida)
function fotoSrc(url: string): string {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`
  return url
}

// Limpia la nota HTML pegada de otras apps (igual criterio que mi-vida)
function sanitizeNota(raw: string): string {
  if (!raw) return ''
  let s = raw
  if (s.includes('&lt;') && !s.includes('<')) {
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
  }
  s = s.replace(/\s(class|style|data-[\w-]+)="[^"]*"/gi, '')
  return s.trim()
}

function fmtFechaLarga(f: string) {
  return new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function haceAnios(fecha: string) {
  const orig = new Date(fecha + 'T12:00:00')
  const now = new Date()
  let años = now.getFullYear() - orig.getFullYear()
  const m = now.getMonth() - orig.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < orig.getDate())) años--
  return años
}

export default function MomentoModal({ momento, onClose }: { momento: Momento; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  const color = colorDe(momento.tipo)
  const años = haceAnios(momento.fecha)
  const foto = momento.fotos?.[0]
  const notaHtml = momento.nota
    ? (() => { const c = sanitizeNota(momento.nota!); return c.startsWith('<') ? c : `<p>${c}</p>` })()
    : null
  const irAlRecuerdo = `${VIDA_URL}?r=${momento.id}`

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-[rgba(20,35,61,0.55)] backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: '88vh', animation: 'momentoIn .28s cubic-bezier(.2,.7,.2,1)' }}>
        <style>{`
          @keyframes momentoIn { from { opacity:0; transform: scale(.98) translateY(8px) } to { opacity:1; transform:none } }
          .momento-nota a { color:#A87A2C; text-decoration:underline }
          .momento-nota ul,.momento-nota ol { padding-left:20px; margin:8px 0 }
          .momento-nota li { margin:3px 0 }
          .momento-nota p { margin:0 0 10px }
          .momento-nota p:last-child { margin-bottom:0 }
          .momento-nota strong,.momento-nota b { font-weight:700 }
        `}</style>

        {/* Botón cerrar */}
        <button onClick={onClose} aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(20,35,61,0.35)] text-white transition hover:bg-[rgba(20,35,61,0.55)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        {/* Foto o banda de color */}
        {foto ? (
          <div className="relative h-44 flex-shrink-0 overflow-hidden bg-[#1a1512]">
            <div className="absolute inset-0" style={{ backgroundImage: `url(${fotoSrc(foto)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(16px) brightness(.55)', transform: 'scale(1.1)' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoSrc(foto)} alt="" referrerPolicy="no-referrer"
              className="relative z-[1] h-full w-full object-contain"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          </div>
        ) : (
          <div className="h-2.5 flex-shrink-0" style={{ background: color }} />
        )}

        {/* Contenido con scroll */}
        <div className="overflow-y-auto px-6 pt-5 pb-2">
          {/* Badges */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: color + '20', color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />{momento.tipo}
            </span>
            {momento.outstanding && <span className="text-[#C2933A]">✦</span>}
            {años > 0 && (
              <span className="rounded-full bg-[rgba(194,147,58,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#A87A2C]">
                hace {años} {años === 1 ? 'año' : 'años'}
              </span>
            )}
          </div>

          {/* Título */}
          <h2 className="serif text-[24px] font-semibold leading-tight text-[#14233D]">{momento.titulo}</h2>

          {/* Fecha */}
          <p className="mt-1.5 text-[12.5px] capitalize text-[rgba(20,35,61,0.5)]">{fmtFechaLarga(momento.fecha)}</p>

          {/* Nota */}
          {notaHtml && (
            <div className="momento-nota mt-4 text-[14px] leading-relaxed text-[#2b3b52]"
              dangerouslySetInnerHTML={{ __html: notaHtml }} />
          )}

          {/* Personas */}
          {(momento.personas?.length ?? 0) > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {momento.personas!.map(p => (
                <span key={p} className="rounded-full bg-[#F1EFE7] px-2.5 py-1 text-[11.5px] font-medium text-[rgba(20,35,61,0.66)]">{p}</span>
              ))}
            </div>
          )}
        </div>

        {/* Footer — ir al recuerdo en mi-vida */}
        <div className="flex items-center justify-between gap-3 border-t border-[rgba(15,35,64,0.08)] px-6 py-3.5">
          <button onClick={onClose}
            className="rounded-[10px] px-3 py-2 text-[12.5px] font-semibold text-[rgba(20,35,61,0.55)] transition hover:bg-[rgba(15,35,64,0.05)]">
            Cerrar
          </button>
          <a href={irAlRecuerdo} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[12.5px] font-bold text-[#1B1305] no-underline"
            style={{ background: 'linear-gradient(135deg,#E7C56B,#C2933A)', boxShadow: '0 8px 16px -8px rgba(194,147,58,.85)' }}>
            Ver en Mi Vida
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M7 17 17 7M7 7h10v10"/></svg>
          </a>
        </div>
      </div>
    </div>
  )
}
