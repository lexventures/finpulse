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

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: {},
    })

    if (error) {
      return NextResponse.json(
        {
          error: error.message || 'Sync function invocation failed',
          details: error,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, result: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
