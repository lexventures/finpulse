import { NextRequest, NextResponse } from 'next/server'
import { compare } from 'bcryptjs'

import { createServiceClient } from '@/lib/supabase/server'

interface AttemptState {
  count: number
  lockout_until: string | null
}

const LOCKOUT_DURATION_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : ''

  if (!pin || pin.length < 4 || pin.length > 6) {
    return NextResponse.json({ error: 'Invalid PIN format' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const [hashResult, attemptResult] = await Promise.all([
    supabase
      .from('fin_settings')
      .select('value')
      .eq('key', 'pin_hash')
      .single(),
    supabase
      .from('fin_settings')
      .select('value')
      .eq('key', 'pin_attempts')
      .single(),
  ])

  const pinHash = hashResult.data?.value as string | undefined
  if (!pinHash) {
    return NextResponse.json(
      { error: 'PIN not configured' },
      { status: 500 }
    )
  }

  const attempts: AttemptState = attemptResult.data?.value
    ? (JSON.parse(attemptResult.data.value as string) as AttemptState)
    : { count: 0, lockout_until: null }

  if (
    attempts.lockout_until &&
    new Date(attempts.lockout_until) > new Date()
  ) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429 }
    )
  }

  const match = await compare(pin, pinHash)

  if (!match) {
    const newCount = attempts.count + 1
    const lockout =
      newCount >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
        : null

    await supabase.from('fin_settings').upsert(
      {
        key: 'pin_attempts',
        value: JSON.stringify({ count: newCount, lockout_until: lockout }),
      },
      { onConflict: 'key' }
    )

    if (lockout) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429 }
      )
    }

    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
  }

  await supabase.from('fin_settings').upsert(
    {
      key: 'pin_attempts',
      value: JSON.stringify({ count: 0, lockout_until: null }),
    },
    { onConflict: 'key' }
  )

  const response = NextResponse.json({ success: true })
  response.cookies.set('pin_verified', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400,
    path: '/',
  })

  return response
}
