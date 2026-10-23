'use client'

// Hooks de la biblioteca de planes: modal accesible (foco, Esc, scroll bloqueado, fondo inerte),
// "hoy" solo en cliente y copiar al portapapeles con respaldo.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { hoyMX } from '@/lib/peso'

const FOCALIZABLES = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])'

// Historial de los diálogos: en el teléfono, el botón o gesto Atrás debe cerrar el diálogo en vez de sacar
// de /peso. Contador y marca a nivel de módulo (no por instancia) para que StrictMode (monta → desmonta →
// monta) y dos diálogos seguidos compartan la misma entrada, sin apilar entradas ni deshacer las de otro.
let abiertos = 0
let entrada: string | null = null
let secuencia = 0

/** Comportamiento de un diálogo modal a pantalla (el nodo `raiz` debe tener tabIndex={-1} y estar en un portal):
 *  - mueve el foco adentro (a `foco` o a la raíz) y lo devuelve al cerrar;
 *  - Esc llama a `onEscape`; Tab da la vuelta dentro del diálogo;
 *  - Atrás (botón o gesto del teléfono) también llama a `onEscape`: el diálogo abre una entrada de historial y,
 *    si `onEscape` no lo cierra (p. ej. «¿Descartar…?» rechazado), la repone para seguir protegido;
 *  - bloquea el scroll del body (compensando el ancho de la barra para que nada salte) y lo restaura;
 *  - marca como `inert` el resto de la página, para que ni teclado ni lector de pantalla salgan del diálogo.
 *  Límite conocido: tras tocar dentro de un iframe de otro origen (el documento proyectado) el teclado deja de
 *  llegar a esta ventana y Esc no se oye; por eso el diálogo debe llevar siempre un botón «Cerrar» visible. */
export function useModal(raiz: RefObject<HTMLElement | null>, onEscape: () => void, foco?: RefObject<HTMLElement | null>) {
  const escRef = useRef(onEscape)
  useEffect(() => { escRef.current = onEscape })

  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const body = document.body
    const overflowAntes = body.style.overflow
    const paddingAntes = body.style.paddingRight
    const barra = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (barra > 0) body.style.paddingRight = `${barra}px`

    // Entrada de historial propia (Next copia a su estado interno lo que hace falta para que Atrás funcione).
    abiertos++
    if (!entrada || history.state?.pesoModal !== entrada) {
      entrada = `modal-${++secuencia}`
      history.pushState({ pesoModal: entrada }, '')
    }
    let vivo = true
    const onPop = () => {
      escRef.current()
      // Si el diálogo sigue abierto (cierre rechazado o envío en curso) ya no tiene su entrada: se repone.
      setTimeout(() => {
        if (vivo && entrada && history.state?.pesoModal !== entrada) history.pushState({ pesoModal: entrada }, '')
      }, 0)
    }
    window.addEventListener('popstate', onPop)

    const inertados: HTMLElement[] = []
    for (const hijo of Array.from(body.children)) {
      if (hijo instanceof HTMLElement && hijo !== el && !hijo.contains(el) && !hijo.inert) { hijo.inert = true; inertados.push(hijo) }
    }
    ;(foco?.current ?? el).focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); escRef.current(); return }
      if (e.key !== 'Tab') return
      const f = Array.from(el.querySelectorAll<HTMLElement>(FOCALIZABLES)).filter(n => n.getClientRects().length > 0)
      if (!f.length) { e.preventDefault(); el.focus(); return }
      const act = document.activeElement
      if (e.shiftKey && (act === f[0] || act === el)) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && act === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      vivo = false
      window.removeEventListener('popstate', onPop)
      abiertos--
      // Cerrado por otro medio (Esc, botón): se quita la entrada propia. Se decide después, para no deshacerla
      // si otro diálogo (o el remontaje de StrictMode) la reutiliza en el mismo instante; si Atrás ya la quitó,
      // el estado actual no coincide y no se retrocede de más.
      setTimeout(() => {
        if (abiertos === 0 && entrada && history.state?.pesoModal === entrada) { entrada = null; history.back() }
      }, 0)
      for (const n of inertados) n.inert = false
      body.style.overflow = overflowAntes
      body.style.paddingRight = paddingAntes
      if (previo && previo.isConnected) previo.focus({ preventScroll: true })
    }
  }, [raiz, foco])
}

/** Fecha de hoy en México, disponible solo tras montar (null en el render del servidor y en el primero del
 *  cliente → las fechas relativas no provocan desajuste de hidratación). */
export function useHoy(): string | null {
  const [hoy, setHoy] = useState<string | null>(null)
  useEffect(() => { setHoy(hoyMX()) }, [])
  return hoy
}

/** Copia al portapapeles: API moderna y, si el navegador la niega (contexto no seguro, permiso), execCommand. */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texto); return true }
  } catch { /* cae al respaldo */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, texto.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** Estado de "¡Copiado!" por clave: `copiado === clave` durante ~2.2 s tras copiar. */
export function useCopiado() {
  const [copiado, setCopiado] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const marcar = useCallback((clave: string) => {
    setCopiado(clave)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopiado(null), 2200)
  }, [])
  return { copiado, marcar }
}
