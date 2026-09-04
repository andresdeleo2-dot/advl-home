import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { VAPID_PUBLIC_KEY } from '@/lib/push'
import { WAIT_NUDGE_DAYS } from '@/lib/waiting'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'   // un cron nunca se cachea

// Cron (Vercel, cada pocos minutos): busca recordatorios (remind_at) que YA vencieron, manda el push
// a cada dispositivo suscrito y "consume" el recordatorio (remind_at → null) para que suene una sola
// vez — igual que hace el cliente cuando la app está abierta. Necesita VAPID_PRIVATE_KEY y sql/push-subs.sql.
export async function GET(req: NextRequest) {
  // Protección: si defines CRON_SECRET, exige el header (Vercel Cron lo manda) o ?secret=.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const qs = new URL(req.url).searchParams.get('secret') || ''
    if (auth !== `Bearer ${secret}` && qs !== secret) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!priv) return NextResponse.json({ ok: false, error: 'falta VAPID_PRIVATE_KEY (push apagado)' }, { status: 200 })
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:andres@a-dvl.com', VAPID_PUBLIC_KEY, priv)

  const now = Date.now()
  const to = new Date(now).toISOString()
  const from = new Date(now - 2 * 60 * 60 * 1000).toISOString()   // no revive recordatorios de hace >2h

  // Columnas REALES de `tareas` son `titulo`/`estado` (ver lib/tareas.ts) — `t`/`status` no existen
  // y esta consulta fallaba con "column does not exist": el cron nunca llegó a mandar nada.
  const { data: due, error } = await supabase.from('tareas')
    .select('id, titulo, remind_at, estado')
    .not('remind_at', 'is', null)
    .lte('remind_at', to)
    .gte('remind_at', from)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const tasks = (due || []).filter(t => t.estado !== 'Terminada' && t.estado !== 'Archivada')

  const { data: subsRows } = await supabase.from('push_subs').select('endpoint, sub')
  const subs = subsRows || []
  // Manda TODOS los push (de todas las tareas × todos los dispositivos) en paralelo, no en un
  // doble for secuencial — con N recordatorios × M dispositivos, uno por uno podía acercarse al
  // timeout del cron. Cada envío ya tenía su propio try/catch para limpiar suscripciones muertas.
  // OJO: este bloque sólo corre si HAY recordatorios remind_at debidos — pero el resto de la
  // función (abajo: esperas viejas) tiene que seguir corriendo aunque este bloque no tenga nada
  // que mandar, así que ya NO se corta con un return anticipado como antes.
  let sent = 0
  const toConsume: string[] = []
  if (tasks.length) {
    const deadEndpoints = new Set<string>()
    const results = await Promise.allSettled(tasks.flatMap(task => {
      const payload = JSON.stringify({ title: '⏰ Recordatorio', body: task.titulo || 'Tienes un recordatorio', tag: 'remind-' + task.id, url: '/epicas' })
      return subs.map(s => webpush.sendNotification(s.sub as unknown as webpush.PushSubscription, payload)
        .then(() => ({ taskId: task.id as string, ok: true as const }))
        .catch((err: unknown) => {
          const code = (err as { statusCode?: number })?.statusCode
          if (code === 404 || code === 410) deadEndpoints.add(s.endpoint as string)   // suscripción muerta
          return { taskId: task.id as string, ok: false as const }
        }))
    }))
    const sentByTask = new Map<string, number>()
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      sent += r.value.ok ? 1 : 0
      if (r.value.ok) sentByTask.set(r.value.taskId, (sentByTask.get(r.value.taskId) || 0) + 1)
    }
    if (deadEndpoints.size) await supabase.from('push_subs').delete().in('endpoint', [...deadEndpoints])
    // Consume (remind_at → null) SOLO si de verdad se mandó al menos un push para esa tarea — si no
    // hay dispositivos suscritos o todos los envíos fallaron, deja el recordatorio vivo para que el
    // fallback del cliente (EpicasDashboard, con la app abierta) todavía pueda avisarlo.
    toConsume.push(...tasks.filter(t => (sentByTask.get(t.id as string) || 0) > 0).map(t => t.id as string))
    if (toConsume.length) await supabase.from('tareas').update({ remind_at: null }).in('id', toConsume)
  }

  // Además de remind_at: tareas "En espera" desde hace WAIT_NUDGE_DAYS+ sin aviso reciente — para
  // que una espera vieja también avise con la app cerrada (antes sólo vivía en localStorage, el
  // cron no la veía). Columnas opcionales (sql/epicas-14-waiting-since.sql): si no existen, el
  // select falla y este bloque simplemente no manda nada — el resto del cron ya corrió antes, así
  // que remind_at nunca se ve afectado por esto.
  let staleSent = 0, staleNudged = 0
  const nudgeCutoff = new Date(now - WAIT_NUDGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: waiting, error: waitErr } = await supabase.from('tareas')
    .select('id, titulo, waiting_since, waiting_nudged_at')
    .eq('estado', 'Esperando')
    .not('waiting_since', 'is', null)
    .lte('waiting_since', nudgeCutoff)
  if (!waitErr && waiting?.length) {
    const reNudgeCutoff = now - 3 * 24 * 60 * 60 * 1000   // no repetir el mismo aviso antes de 3 días
    const stale = waiting.filter(t => !t.waiting_nudged_at || new Date(t.waiting_nudged_at as string).getTime() < reNudgeCutoff)
    if (stale.length && subs.length) {
      const nudgedByTask = new Map<string, number>()
      const staleResults = await Promise.allSettled(stale.flatMap(task => {
        const payload = JSON.stringify({ title: '⏳ Sigues esperando', body: `"${task.titulo || 'Una tarea'}" lleva varios días en espera`, tag: 'wait-' + task.id, url: '/epicas' })
        return subs.map(s => webpush.sendNotification(s.sub as unknown as webpush.PushSubscription, payload)
          .then(() => ({ taskId: task.id as string, ok: true as const }))
          .catch(() => ({ taskId: task.id as string, ok: false as const })))
      }))
      for (const r of staleResults) {
        if (r.status !== 'fulfilled') continue
        staleSent += r.value.ok ? 1 : 0
        if (r.value.ok) nudgedByTask.set(r.value.taskId, (nudgedByTask.get(r.value.taskId) || 0) + 1)
      }
      const nudgedIds = stale.filter(t => (nudgedByTask.get(t.id as string) || 0) > 0).map(t => t.id)
      if (nudgedIds.length) { await supabase.from('tareas').update({ waiting_nudged_at: new Date(now).toISOString() }).in('id', nudgedIds); staleNudged = nudgedIds.length }
    }
  }

  return NextResponse.json({ ok: true, sent, reminders: tasks.length, consumed: toConsume.length, staleSent, staleNudged })
}
