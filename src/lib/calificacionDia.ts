/* Calificación del día (1–10) compartida: Mi día la guarda en el servidor (dia_cierre). Tiempo y Épicas tenían su
 * propia copia en este navegador (localStorage 'epicas.dayScores.v1'), así que las rachas y promedios no cuadraban
 * entre secciones ni entre dispositivos. Ahora las tres leen y escriben la del servidor; el localStorage queda
 * como caché (y guarda decimales del deslizador, que en el servidor se redondean). */

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Sube la calificación de un día a Mi día (con pausa de 1.2 s para no mandar cada paso del deslizador). */
export function subirCalificacion(fecha: string, score: number | null) {
  if (score == null || !(score > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return
  const n = Math.min(10, Math.max(1, Math.round(score)))
  const prev = timers.get(fecha); if (prev) clearTimeout(prev)
  timers.set(fecha, setTimeout(() => {
    timers.delete(fecha)
    fetch('/api/dia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'cierre', fecha, calificacion: n }) }).catch(() => {})
  }, 1200))
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
