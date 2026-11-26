/* Calificación del día (1–10) compartida: Mi día la guarda en el servidor (dia_cierre). Tiempo y Épicas tenían su
 * propia copia en este navegador (localStorage 'epicas.dayScores.v1'), así que las rachas y promedios no cuadraban
 * entre secciones ni entre dispositivos. Ahora las tres leen y escriben la del servidor; el localStorage queda
 * como caché (y guarda decimales del deslizador, que en el servidor se redondean). */

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const PEND_KEY = 'dia.calificacion.pendiente.v1'   // { fecha: n } que todavía no confirma el servidor

const leerPend = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(PEND_KEY) || '{}') || {} } catch { return {} } }
const ponerPend = (p: Record<string, number>) => { try { if (Object.keys(p).length) localStorage.setItem(PEND_KEY, JSON.stringify(p)); else localStorage.removeItem(PEND_KEY) } catch { /* sin almacenamiento */ } }
const cuerpo = (fecha: string, n: number) => JSON.stringify({ accion: 'cierre', fecha, calificacion: n })

async function enviar(fecha: string, n: number) {
  try {
    const r = await fetch('/api/dia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo(fecha, n) })
    const j = await r.json().catch(() => null)
    if (r.ok && j?.ok) { const p = leerPend(); if (p[fecha] === n) { delete p[fecha]; ponerPend(p) } }
  } catch { /* se queda pendiente y se reintenta */ }
}

/** Reintenta lo que no llegó (sin señal, servidor caído). Corre al cargar y al volver a la pestaña. */
function reintentar() { for (const [f, n] of Object.entries(leerPend())) if (!timers.has(f)) enviar(f, n) }
if (typeof window !== 'undefined') {
  setTimeout(reintentar, 2000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reintentar() })
  // Si cierras la pestaña dentro de la pausa de 1.2 s, se manda igual (sendBeacon sobrevive al cierre).
  window.addEventListener('pagehide', () => {
    for (const [f, t] of timers) {
      clearTimeout(t); timers.delete(f)
      const n = leerPend()[f]; if (n == null) continue
      try { navigator.sendBeacon('/api/dia', new Blob([cuerpo(f, n)], { type: 'application/json' })) } catch { /* queda pendiente */ }
    }
  })
}

/** Sube la calificación de un día a Mi día (con pausa de 1.2 s para no mandar cada paso del deslizador).
 *  Queda anotada como pendiente hasta que el servidor la confirma, así no se pierde si falla la red. */
export function subirCalificacion(fecha: string, score: number | null) {
  if (score == null || !(score > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return
  const n = Math.min(10, Math.max(1, Math.round(score)))
  ponerPend({ ...leerPend(), [fecha]: n })
  const prev = timers.get(fecha); if (prev) clearTimeout(prev)
  timers.set(fecha, setTimeout(() => { timers.delete(fecha); enviar(fecha, n) }, 1200))
}

/** Las calificaciones de los últimos 60 días guardadas en Mi día ({} si falla). */
export async function traerCalificaciones(hoy: string): Promise<Record<string, number>> {
  try {
    const j = await (await fetch(`/api/dia?fecha=${hoy}`)).json()
    const out: Record<string, number> = {}
    for (const c of (j?.cierres || []) as { fecha: string; calificacion: number | null }[]) if (c.calificacion != null) out[c.fecha] = c.calificacion
    return out
  } catch { return {} }
}

/** Junta lo local con lo del servidor: el servidor manda, salvo que lo local sea el mismo número con decimales. */
export function juntarCalificaciones(local: Record<string, number>, servidor: Record<string, number>): Record<string, number> {
  const out = { ...local }
  for (const [d, n] of Object.entries(servidor)) if (out[d] == null || Math.round(out[d]) !== n) out[d] = n
  return out
}
