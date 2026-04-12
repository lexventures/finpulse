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

function isResponseLike(value: unknown): value is Response {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'text' in value
  )
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
      const maybeContext = (error as { context?: unknown }).context
      let status = 500
      let functionError: unknown = null

      if (isResponseLike(maybeContext)) {
        status = maybeContext.status || 500
        const raw = await maybeContext.text()
        try {
          functionError = JSON.parse(raw)
        } catch {
          functionError = raw
        }
      }

      return NextResponse.json(
        {
          error: error.message || 'Sync function invocation failed',
          function_name: functionName,
          function_status: status,
          function_error: functionError,
        },
        { status },
      )
    }

    return NextResponse.json({ success: true, result: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
