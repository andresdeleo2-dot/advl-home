import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { supabase } from '@/lib/supabase'
import { VAPID_PUBLIC_KEY } from '@/lib/push'

export const dynamic = 'force-dynamic'   // un cron nunca se cachea

// Recordatorio de la noche de «Mi día»: Vercel Cron lo llama a las 03:30 UTC = 21:30 en México (vercel.json).
// Si ya calificaste el día (dia_cierre), no manda nada. ?dry=1 devuelve lo que mandaría.
// Mismo candado que /api/push/daily: CRON_SECRET (header de Vercel Cron o ?secret=); el middleware lo deja pasar.

function hoyEnMexico(): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const v = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${v('year')}-${v('month')}-${v('day')}`
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const qs = new URL(req.url).searchParams
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}` && qs.get('secret') !== secret) return NextResponse.json({ ok: false, error: 'no autorizado' }, { status: 401 })
  }
  try {
    const hoy = hoyEnMexico()
    const { data: cierre, error } = await supabase.from('dia_cierre').select('fecha').eq('fecha', hoy).maybeSingle()
    if (error) return NextResponse.json({ ok: true, sent: 0, motivo: `sin tabla dia_cierre: ${error.message}` })
    if (cierre) return NextResponse.json({ ok: true, sent: 0, motivo: 'ya cerraste el día' })

    const { data: dia } = await supabase.from('dia_resumen').select('data').eq('fecha', hoy).maybeSingle()
    const pregunta = (dia?.data as { pregunta?: string } | null)?.pregunta
    const push = {
      title: '🌙 ¿Cierras tu día?',
      body: pregunta ? `Platícame cómo te fue. Y una pregunta: ${pregunta}` : 'Platícame cómo te fue y califícalo. Toma un minuto.',
      tag: `noche-${hoy}`, url: '/dia?modo=noche',
    }
    if (qs.get('dry') === '1') return NextResponse.json({ ok: true, dry: true, sent: 0, push })

    const priv = process.env.VAPID_PRIVATE_KEY
    if (!priv) return NextResponse.json({ ok: true, sent: 0, motivo: 'falta VAPID_PRIVATE_KEY (push apagado)', push })
    const { data: subs, error: subsErr } = await supabase.from('push_subs').select('endpoint, sub')
    if (subsErr || !subs?.length) return NextResponse.json({ ok: true, sent: 0, motivo: subsErr?.message || 'no hay dispositivos suscritos', push })

    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:andres@a-dvl.com', VAPID_PUBLIC_KEY, priv)
    const payload = JSON.stringify(push)
    const muertas = new Set<string>()
    const res = await Promise.allSettled(subs.map(s => webpush.sendNotification(s.sub as unknown as webpush.PushSubscription, payload, { TTL: 3 * 60 * 60 })
      .then(() => true)
      .catch((err: unknown) => { const c = (err as { statusCode?: number })?.statusCode; if (c === 404 || c === 410) muertas.add(s.endpoint as string); return false })))
    if (muertas.size) await supabase.from('push_subs').delete().in('endpoint', [...muertas])
    return NextResponse.json({ ok: true, sent: res.filter(r => r.status === 'fulfilled' && r.value).length, push })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
