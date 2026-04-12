import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const VALID_SOURCES = ['finaloop', 'shopify_dtc', 'shopify_wholesale', 'shopify_analytics'] as const
type SyncSource = (typeof VALID_SOURCES)[number]

const FUNCTION_NAMES: Record<SyncSource, string> = {
  finaloop: 'sync-finaloop-sheets',
  shopify_dtc: 'sync-shopify-dtc',
  shopify_wholesale: 'sync-shopify-wholesale',
  shopify_analytics: 'sync-shopify-analytics',
}

export async function POST(
  _request: NextRequest,
  props: { params: Promise<{ source: string }> },
) {
  const { source } = await props.params

  if (!VALID_SOURCES.includes(source as SyncSource)) {
    return NextResponse.json(
      { error: `Invalid source: ${source}` },
      { status: 400 },
    )
  }

  const functionName = FUNCTION_NAMES[source as SyncSource]
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 },
    )
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    )

    const body = await res.json().catch(() => ({ status: res.status }))

    if (!res.ok) {
      return NextResponse.json(
        { error: body.error ?? `Sync failed with status ${res.status}`, details: body },
        { status: res.status },
      )
    }

    return NextResponse.json({ success: true, result: body })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
