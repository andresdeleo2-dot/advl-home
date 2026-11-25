'use client'

// Dictado por voz para «Anotar algo» y «Cerrar día» (Mi día y Panel).
import { useCallback, useEffect, useRef, useState } from 'react'

/* ── Dictado por voz (Web Speech API: Chrome y Safari; en iPhone, Safari) ── */
type Reconocedor = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null }
export function useDictado(alTexto: (final: string) => void) {
  const [escuchando, setEscuchando] = useState(false)
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState('')
  const rec = useRef<Reconocedor | null>(null)
  const cb = useRef(alTexto); cb.current = alTexto
  const soportado = typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)
  const parar = useCallback(() => { rec.current?.stop() }, [])
  const iniciar = useCallback(() => {
    setError('')
    const W = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor }
    const C = W.SpeechRecognition || W.webkitSpeechRecognition
    if (!C) { setError('Tu navegador no dicta aquí: usa el micrófono del teclado.'); return }
    const r = new C()
    r.lang = 'es-MX'; r.continuous = true; r.interimResults = true
    r.onresult = e => {
      let fin = '', par = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]; const txt = res[0]?.transcript || ''
        if (res.isFinal) fin += txt; else par += txt
      }
      if (fin.trim()) cb.current(fin.trim())
      setParcial(par)
    }
    r.onerror = e => { setError(e.error === 'not-allowed' ? 'Da permiso al micrófono para dictar.' : e.error === 'no-speech' ? 'No te escuché. Intenta de nuevo.' : 'Se cortó el dictado.'); }
    r.onend = () => { setEscuchando(false); setParcial('') }
    rec.current = r
    try { r.start(); setEscuchando(true) } catch { setError('No se pudo abrir el micrófono.') }
  }, [])
  useEffect(() => () => rec.current?.stop(), [])
  return { soportado, escuchando, parcial, error, iniciar, parar }
}
export const juntar = (a: string, b: string) => (a.trim() ? `${a.trimEnd()} ${b}` : b)
