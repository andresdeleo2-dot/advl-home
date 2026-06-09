import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const revalidate = 300

export async function GET() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('section_order', { ascending: true })
    .order('item_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
