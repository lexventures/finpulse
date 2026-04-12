import { NextRequest, NextResponse } from 'next/server'

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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

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
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    )

    const rawBody = await res.text()
    let parsedBody: unknown = null
    try { parsedBody = JSON.parse(rawBody) } catch { parsedBody = rawBody }

    if (!res.ok) {
      const extracted =
        typeof parsedBody === 'object' && parsedBody && 'error' in parsedBody
          ? (parsedBody as { error: string }).error
          : rawBody.substring(0, 200)

      return NextResponse.json(
        {
          error: `${functionName} failed (${res.status}): ${extracted}`,
          function_name: functionName,
          function_status: res.status,
          function_error: parsedBody,
        },
        { status: res.status },
      )
    }

    return NextResponse.json({ success: true, result: parsedBody })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
