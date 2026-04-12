import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createServiceClient } from '@/lib/supabase/server'

const NotificationSchema = z.object({
  alert_digest_email: z.string().email().or(z.literal('')).optional(),
  sync_failure_email: z.string().email().or(z.literal('')).optional(),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = NotificationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('fin_settings')
    .upsert({
      key: 'notification_email',
      value: parsed.data,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
