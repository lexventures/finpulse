import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { pin } = await request.json()
  if (!pin || typeof pin !== 'string' || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
    return NextResponse.json(
      { error: 'PIN must be 4-6 digits' },
      { status: 400 },
    )
  }

  const hash = await bcrypt.hash(pin, 10)
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('fin_settings')
    .upsert({
      key: 'pin_hash',
      value: hash,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
