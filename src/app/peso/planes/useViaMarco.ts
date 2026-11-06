'use client'

// Cadena de respaldo del marco donde se proyecta un documento. Primero se carga por URL (con la cabecera
// `Content-Security-Policy: sandbox` de la ruta). Algunos navegadores (el panel integrado de la app de Claude,
// por ejemplo) NO dejan cargar por URL un iframe con `sandbox`: el marco queda en blanco, dispara `onLoad` con la
// página de error y jamás avisa su alto. Si pasa un rato sin señal de vida, se pide el mismo HTML con fetch y se
// pone en `srcDoc` (el atributo `sandbox` es el mismo, así que el aislamiento no cambia). Si tampoco hay señal,
// `sinVista` avisa para que quien lo use muestre el aviso con «Abrir en pestaña» (la ruta, abierta directo, sí
// se ve en cualquier navegador). La señal de vida es el aviso de alto que manda el script embebido.

import { useCallback, useEffect, useRef, useState } from 'react'
import { planHtmlUrl } from '@/lib/peso-planes'

export type ViaMarco = 'url' | 'srcdoc'

const ESPERA_TRAS_CARGA_MS = 2500   // el marco cargó (o mostró un error) y no hay señal de vida
const ESPERA_CARGA_MS = 25_000      // el marco ni siquiera termina de cargar (red muy lenta)
const ESPERA_SRCDOC_MS = 12_000     // el srcDoc tampoco da señal (un documento de ~1 MB tarda unos segundos en pintar)

/** `vivo`: ya llegó el primer aviso del script embebido. `activo`: el iframe ya está montado. */
export function useViaMarco(id: string, vivo: boolean, activo: boolean) {
  const [via, setVia] = useState<ViaMarco>('url')
  const [srcDoc, setSrcDoc] = useState<string | null>(null)
  const [cargado, setCargado] = useState(false)
  const [sinVista, setSinVista] = useState(false)
  const [intento, setIntento] = useState(0)
  const vivoRef = useRef(vivo)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { vivoRef.current = vivo }, [vivo])
  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (!activo || vivo || sinVista) return
    const espera = via === 'url' ? (cargado ? ESPERA_TRAS_CARGA_MS : ESPERA_CARGA_MS) : ESPERA_SRCDOC_MS
    const t = setTimeout(() => {
      if (via === 'srcdoc') { setSinVista(true); return }
      const ac = new AbortController()
      abortRef.current = ac
      fetch(planHtmlUrl(id, { embed: true }), { cache: 'no-store', credentials: 'same-origin', signal: ac.signal })
        .then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then(html => {
          if (vivoRef.current) return   // mientras tanto el marco por URL sí respondió: no se le quita
          setSrcDoc(html); setCargado(false); setVia('srcdoc')
        })
        .catch(() => { if (!ac.signal.aborted && !vivoRef.current) setSinVista(true) })
    }, espera)
    return () => clearTimeout(t)
  }, [activo, vivo, sinVista, via, cargado, intento, id])

  const reintentar = useCallback(() => {
    abortRef.current?.abort()
    setVia('url'); setSrcDoc(null); setCargado(false); setSinVista(false); setIntento(n => n + 1)
  }, [])

  return { via, srcDoc, cargado, setCargado, intento, sinVista: sinVista && !vivo, reintentar }
}
