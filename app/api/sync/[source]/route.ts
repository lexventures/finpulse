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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  // #region agent log — H3 verification: capture env + key shape
  const _dbg = {
    hasUrl: Boolean(supabaseUrl),
    urlPrefix: supabaseUrl?.substring(0, 30) ?? '(unset)',
    hasKey: Boolean(serviceRoleKey),
    keyLen: serviceRoleKey?.length ?? 0,
    keyStart3: serviceRoleKey?.substring(0, 3) ?? '',
    keyEnd3: serviceRoleKey?.substring((serviceRoleKey?.length ?? 3) - 3) ?? '',
    startsWithEy: serviceRoleKey?.startsWith('ey') ?? false,
    hasDots: (serviceRoleKey?.match(/\./g) ?? []).length,
    hasNewline: serviceRoleKey?.includes('\n') ?? false,
    hasSpace: serviceRoleKey?.includes(' ') ?? false,
  }
  // #endregion

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration', _dbg },
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

    // #region agent log — H3/H4: capture raw response
    const rawBody = await res.text()
    let parsedBody: unknown = null
    try { parsedBody = JSON.parse(rawBody) } catch { parsedBody = rawBody }

    const _dbgResponse = {
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get('content-type'),
      bodyLength: rawBody.length,
      bodyPreview: rawBody.substring(0, 500),
    }
    // #endregion

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `${functionName} failed (${res.status}): ${typeof parsedBody === 'object' && parsedBody && 'error' in parsedBody ? (parsedBody as { error: string }).error : rawBody.substring(0, 200)}`,
          function_name: functionName,
          function_status: res.status,
          function_error: parsedBody,
          _dbg,
          _dbgResponse,
        },
        { status: res.status },
      )
    }

    return NextResponse.json({ success: true, result: parsedBody })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message, _dbg }, { status: 500 })
  }
}
