import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'

// Sube una imagen al bucket "imagenes" de Supabase Storage y devuelve su URL pública.
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'falta el archivo' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ ok: false, error: 'solo se permiten imágenes' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'máximo 5 MB' }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `items/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error } = await supabase.storage
      .from('imagenes')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const { data } = supabase.storage.from('imagenes').getPublicUrl(path)
    return NextResponse.json({ ok: true, url: data.publicUrl })
  } catch {
    return NextResponse.json({ ok: false, error: 'error al subir' }, { status: 500 })
  }
}
