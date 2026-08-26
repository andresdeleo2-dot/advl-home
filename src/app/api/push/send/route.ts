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

  const { data: due, error } = await supabase.from('tareas')
    .select('id, t, remind_at, status')
    .not('remind_at', 'is', null)
    .lte('remind_at', to)
    .gte('remind_at', from)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const tasks = (due || []).filter(t => t.status !== 'Terminada' && t.status !== 'Archivada')
  if (!tasks.length) return NextResponse.json({ ok: true, sent: 0, reminders: 0 })

  const { data: subsRows } = await supabase.from('push_subs').select('endpoint, sub')
  const subs = subsRows || []
  let sent = 0
  for (const task of tasks) {
    const payload = JSON.stringify({ title: '⏰ Recordatorio', body: task.t || 'Tienes un recordatorio', tag: 'remind-' + task.id, url: '/epicas' })
    for (const s of subs) {
      try { await webpush.sendNotification(s.sub as unknown as webpush.PushSubscription, payload); sent++ }
      catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) await supabase.from('push_subs').delete().eq('endpoint', s.endpoint)   // suscripción muerta
      }
    }
    await supabase.from('tareas').update({ remind_at: null }).eq('id', task.id)   // consumir (una sola vez)
  }
  return NextResponse.json({ ok: true, sent, reminders: tasks.length })
}
