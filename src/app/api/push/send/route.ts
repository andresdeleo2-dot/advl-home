import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { VAPID_PUBLIC_KEY } from '@/lib/push'
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
  if (!tasks.length) return NextResponse.json({ ok: true, sent: 0, reminders: 0 })

  const { data: subsRows } = await supabase.from('push_subs').select('endpoint, sub')
  const subs = subsRows || []
  // Manda TODOS los push (de todas las tareas × todos los dispositivos) en paralelo, no en un
  // doble for secuencial — con N recordatorios × M dispositivos, uno por uno podía acercarse al
  // timeout del cron. Cada envío ya tenía su propio try/catch para limpiar suscripciones muertas.
  let sent = 0
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
  const toConsume = tasks.filter(t => (sentByTask.get(t.id as string) || 0) > 0).map(t => t.id)
  if (toConsume.length) await supabase.from('tareas').update({ remind_at: null }).in('id', toConsume)
  return NextResponse.json({ ok: true, sent, reminders: tasks.length, consumed: toConsume.length })
}
