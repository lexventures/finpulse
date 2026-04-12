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
  const key = serviceRoleKey.trim()
  const res = await fetch(
    `${supabaseUrl}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
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

type PipelineStep = {
  function_name: string
  function_status?: number
  ok: boolean
  result: unknown
}

function rowsFromStepResult(result: unknown): number {
  if (typeof result !== 'object' || result === null) return 0
  const rows = (result as Record<string, unknown>).rows
  return typeof rows === 'number' ? rows : 0
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
      const stepResults: Array<{
        function_name: string
        function_status: number
        ok: boolean
        result: unknown
      }> = []
      let syncStatus: 'success' | 'partial' = 'success'
      let totalRows = 0

      if (requestedSource === 'finaloop') {
        const step = await invokeEdgeFunction(
          supabaseUrl,
          serviceRoleKey,
          'sync-finaloop-sheets',
        )

        if (!step.ok) {
          return NextResponse.json(
            {
              error: `sync-finaloop-sheets failed (${step.status}): ${extractErrorBody(step)}`,
              function_name: 'sync-finaloop-sheets',
              function_status: step.status,
              function_error: step.parsedBody,
              pipeline: [],
            },
            { status: step.status },
          )
        }

        const parsed = step.parsedBody as Record<string, unknown> | null
        const pipeline = Array.isArray(parsed?.pipeline)
          ? (parsed.pipeline as PipelineStep[])
          : []

        if (pipeline.length > 0) {
          stepResults.push(
            ...pipeline.map((p) => ({
              function_name: p.function_name,
              function_status: p.function_status ?? 200,
              ok: p.ok,
              result: p.result,
            })),
          )

          const failed = pipeline.find((p) => !p.ok)
          if (failed) {
            const errMsg =
              typeof failed.result === 'object' &&
              failed.result &&
              'error' in failed.result
                ? String((failed.result as { error: unknown }).error)
                : 'Unknown error'
            const failIdx = pipeline.indexOf(failed)
            const httpStatus =
              failed.function_status && failed.function_status >= 400
                ? failed.function_status
                : 500
            return NextResponse.json(
              {
                error: `${failed.function_name} failed (${failed.function_status ?? httpStatus}): ${errMsg}`,
                function_name: failed.function_name,
                function_status: failed.function_status ?? httpStatus,
                function_error: failed.result,
                pipeline: stepResults.slice(0, failIdx),
              },
              { status: httpStatus },
            )
          }

          totalRows =
            typeof parsed?.rows === 'number'
              ? parsed.rows
              : pipeline.reduce((acc, p) => acc + rowsFromStepResult(p.result), 0)
          if (parsed && parsed.status === 'partial') syncStatus = 'partial'
        } else {
          stepResults.push({
            function_name: 'sync-finaloop-sheets',
            function_status: step.status,
            ok: true,
            result: step.parsedBody,
          })
          totalRows = extractRows(step)
          const p = step.parsedBody as Record<string, unknown> | null
          if (p && p.status === 'partial') syncStatus = 'partial'
        }
      } else {
        const chain =
          requestedSource === 'kpi_facts'
            ? ['run-kpi-facts', 'run-cash-forecast']
            : [functionName]

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
