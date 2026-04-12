import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/dal', () => ({
  withAuth: async (
    _request: Request,
    handler: (shop: string) => Promise<Response>,
  ) => handler('test.myshopify.com'),
}))

import { POST } from '@/app/api/sync/[source]/route'

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/sync/[source]', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs the finaloop pipeline in deterministic order', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockJsonResponse({
          success: true,
          status: 'partial',
          rows: 12,
          warnings: ['revenue recon drift'],
          unrecognized: [{ lineItem: 'Unknown line', total: 1200 }],
        }),
      )
      .mockResolvedValueOnce(mockJsonResponse({ success: true, rows: 32 }))
      .mockResolvedValueOnce(mockJsonResponse({ success: true, rows: 13 }))

    const res = await POST(
      new NextRequest('https://app.local/api/sync/finaloop', { method: 'POST' }),
      { params: Promise.resolve({ source: 'finaloop' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.result.status).toBe('partial')
    expect(body.result.rows).toBe(57)

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/functions/v1/sync-finaloop-sheets')
    expect(String(fetchSpy.mock.calls[1][0])).toContain('/functions/v1/run-kpi-facts')
    expect(String(fetchSpy.mock.calls[2][0])).toContain('/functions/v1/run-cash-forecast')
  })

  it('returns the failing step when a downstream function fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockJsonResponse({ success: true, rows: 10 }))
      .mockResolvedValueOnce(
        mockJsonResponse({ error: 'kpi rebuild failed' }, 500),
      )

    const res = await POST(
      new NextRequest('https://app.local/api/sync/finaloop', { method: 'POST' }),
      { params: Promise.resolve({ source: 'finaloop' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.function_name).toBe('run-kpi-facts')
    expect(body.error).toContain('kpi rebuild failed')
  })
})
