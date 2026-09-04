// "Esperando desde" (seguimiento de las tareas "En espera / Por revisar"): guarda la FECHA en que
// marcaste cada tarea como "en espera", para mostrar cuánto llevas esperando y avisar si ya es mucho.
// Es local por dispositivo (localStorage compartido entre /epicas y /tiempo — mismo origen). Indicador
// suave: si falta el dato (otro dispositivo, marcada antes de esta feature), simplemente no se muestra.
export const WAIT_SINCE_KEY = 'epicas.waitingSince.v1'
// Días a partir de los cuales una espera "lleva mucho" y se resalta como recordatorio de seguimiento.
export const WAIT_NUDGE_DAYS = 4

export function readWaitSince(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(WAIT_SINCE_KEY) || '{}') } catch { return {} }
}

// on=true al marcar "en espera" (fija la fecha si no había); on=false al quitarla (borra el registro).
export function markWaitSince(taskId: string, on: boolean, todayIso: string) {
  if (typeof window === 'undefined' || !taskId) return
  const m = readWaitSince()
  if (on) { if (m[taskId]) return; m[taskId] = todayIso } else { if (!(taskId in m)) return; delete m[taskId] }
  try { localStorage.setItem(WAIT_SINCE_KEY, JSON.stringify(m)) } catch { /* storage lleno/bloqueado */ }
  // Espejo en servidor (fire-and-forget): para que el cron de push avise de esperas viejas aunque
  // la app esté cerrada — localStorage sólo lo ve mientras la tienes abierta en ESE dispositivo.
  fetch('/api/tareas/wait-since', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, since: on ? todayIso : null }) }).catch(() => {})
}

// Días transcurridos desde que se marcó "en espera" (0 = hoy). null si no hay registro.
export function waitAgeDays(since: Record<string, string>, taskId: string, todayIso: string): number | null {
  const d = since[taskId]; if (!d) return null
  const n = Math.floor((new Date(todayIso + 'T00:00:00').getTime() - new Date(d + 'T00:00:00').getTime()) / 86400000)
  return n >= 0 ? n : 0
}

// Etiqueta legible del tiempo esperando: 0 → "hoy", 1 → "hace 1 día", n → "hace n días".
export function waitAgeLabel(age: number | null): string | null {
  if (age == null) return null
  return age === 0 ? 'hoy' : age === 1 ? 'hace 1 día' : `hace ${age} días`
}

// "En espera / Por revisar": qué esperas de la tarea. [valor, icono, etiqueta].
export const WAIT_REASONS: [string, string, string][] = [['email', '📩', 'Email'], ['respuesta', '💬', 'Respuesta'], ['comentario', '🗨️', 'Comentario'], ['llamada', '📞', 'Llamada'], ['tarea', '🔗', 'Otra tarea'], ['otro', '⏳', 'Otro']]
// 'tarea' necesita elegir DE QUÉ tarea depende (no es un motivo de un solo clic) — sólo el chip
// compartido rowWaitChip (EpicasDashboard.tsx) sabe abrir ese selector. Los demás editores usan
// esta lista recortada para no dejar "tarea" a medias (sin ninguna tarea ligada).
export const WAIT_REASONS_SIMPLE = WAIT_REASONS.filter(([v]) => v !== 'tarea')

export function waitMeta(reason?: string): { icon: string; label: string } {
  const m = WAIT_REASONS.find(x => x[0] === reason)
  return m ? { icon: m[1], label: m[2] } : (reason ? { icon: '⏳', label: reason } : { icon: '🔔', label: 'En espera' })
}
