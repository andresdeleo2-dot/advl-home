import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** Espejo en servidor de "esperando desde" (lib/waiting.ts la llama junto con localStorage, en
 *  fire-and-forget). Existe SOLO para que el cron de push (api/push/send) pueda avisar de esperas
 *  viejas aunque la app esté cerrada — localStorage no lo ve desde el servidor. Si la columna aún
 *  no existe (falta correr sql/epicas-14-waiting-since.sql), falla en silencio: la app no depende
 *  de esto para nada visible, sólo es la fuente del cron. */
export async function POST(req: Request) {
  try {
    const { taskId, since } = await req.json()
    if (!taskId) return NextResponse.json({ ok: false, error: 'taskId es obligatorio' }, { status: 400 })
    const { error } = await supabase.from('tareas').update({ waiting_since: since || null, waiting_nudged_at: null }).eq('id', taskId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })   // columna sin migrar u otro — no truena al cliente
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 })
  }
}
