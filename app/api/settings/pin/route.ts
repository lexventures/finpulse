import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { pin, hint } = await request.json()
  if (!pin || typeof pin !== 'string' || pin.length !== 8) {
    return NextResponse.json(
      { error: 'PIN must be exactly 8 characters' },
      { status: 400 },
    )
  }

  const hash = await bcrypt.hash(pin, 10)
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('fin_settings')
    .upsert({
      key: 'pin_hash',
      value: hash,
      updated_at: now,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from('fin_settings')
    .upsert({
      key: 'pin_hint',
      value: typeof hint === 'string' ? hint.trim() : '',
      updated_at: now,
    })

  return NextResponse.json({ success: true })
}
