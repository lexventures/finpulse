import { NextResponse } from 'next/server'

import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('fin_settings')
    .select('value')
    .eq('key', 'daily_briefing')
    .single()

  if (!data?.value) {
    return NextResponse.json({ text: null, generated_at: null, valid: true })
  }

  const val = data.value as Record<string, unknown>
  return NextResponse.json({
    text: val.text ?? null,
    generated_at: val.generated_at ?? null,
    valid: val.valid ?? true,
  })
}
