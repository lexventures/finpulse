import { NextRequest, NextResponse } from 'next/server'

import { withAuth } from '@/lib/dal'

const VALID_SOURCES = ['finaloop', 'kpi_facts', 'shopify_dtc', 'shopify_wholesale', 'shopify_analytics', 'cash_forecast', 'briefing'] as const
type SyncSource = (typeof VALID_SOURCES)[number]

const FUNCTION_NAMES: Record<SyncSource, string> = {
  finaloop: 'sync-finaloop-sheets',
  kpi_facts: 'run-kpi-facts',
  shopify_dtc: 'sync-shopify-dtc',
  shopify_wholesale: 'sync-shopify-wholesale',
  shopify_analytics: 'sync-shopify-analytics',
  cash_forecast: 'run-cash-forecast',
  briefing: 'generate-briefing',
}

interface InvokeResult {
  functionName: string
  ok: boolean
  status: number
  rawBody: string
  parsedBody: unknown
}

async function invokeEdgeFunction(
  supabaseUrl: string,
  serviceRoleKey: string,
  functionName: string,
): Promise<InvokeResult> {
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

  return {
    functionName,
    ok: res.ok,
    status: res.status,
    rawBody,
    parsedBody,
  }
}

function extractErrorBody(result: InvokeResult): string {
  const { parsedBody, rawBody } = result
  if (typeof parsedBody === 'object' && parsedBody && 'error' in parsedBody) {
    return String((parsedBody as { error: unknown }).error)
  }
  return rawBody.substring(0, 200)
}

function extractRows(result: InvokeResult): number {
  if (typeof result.parsedBody !== 'object' || !result.parsedBody) return 0
  const body = result.parsedBody as Record<string, unknown>
  if (typeof body.rows === 'number') return body.rows
  if (typeof body.wholesale_daily_rows === 'number') return body.wholesale_daily_rows
  return 0
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ source: string }> },
) {
  return withAuth(request, async () => {
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
      const requestedSource = source as SyncSource
      const chain =
        requestedSource === 'finaloop'
          ? ['sync-finaloop-sheets', 'run-kpi-facts', 'run-cash-forecast']
          : requestedSource === 'kpi_facts'
            ? ['run-kpi-facts', 'run-cash-forecast']
            : [functionName]

      const stepResults: Array<{
        function_name: string
        function_status: number
        ok: boolean
        result: unknown
      }> = []
      let syncStatus: 'success' | 'partial' = 'success'
      let totalRows = 0

      for (const stepName of chain) {
        const step = await invokeEdgeFunction(supabaseUrl, serviceRoleKey, stepName)

        if (!step.ok) {
          return NextResponse.json(
            {
              error: `${stepName} failed (${step.status}): ${extractErrorBody(step)}`,
              function_name: stepName,
              function_status: step.status,
              function_error: step.parsedBody,
              pipeline: stepResults,
            },
            { status: step.status },
          )
        }

        stepResults.push({
          function_name: stepName,
          function_status: step.status,
          ok: true,
          result: step.parsedBody,
        })
        totalRows += extractRows(step)

        if (stepName === 'sync-finaloop-sheets') {
          const parsed = step.parsedBody as Record<string, unknown> | null
          if (parsed && parsed.status === 'partial') {
            syncStatus = 'partial'
          }
        }
      }

      return NextResponse.json({
        success: true,
        result: {
          status: syncStatus,
          rows: totalRows,
          pipeline: stepResults,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
