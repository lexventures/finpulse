import { describe, expect, it, vi } from 'vitest'

import { runSyncAll, SYNC_ALL_SOURCES } from '@/lib/sync-all'

describe('runSyncAll', () => {
  it('runs the approved top-level sync sources in sequence', async () => {
    const calls: string[] = []
    const syncSource = vi.fn(async (source: string) => {
      calls.push(source)
      return { source, ok: true }
    })

    const result = await runSyncAll(syncSource)

    expect(SYNC_ALL_SOURCES).toEqual([
      'shopify_dtc',
      'shopify_wholesale',
      'shopify_analytics',
      'finaloop',
    ])
    expect(calls).toEqual(SYNC_ALL_SOURCES)
    expect(result.ok).toBe(true)
    expect(result.results).toHaveLength(4)
  })

  it('stops after the first failed source', async () => {
    const syncSource = vi.fn(async (source: string) => ({
      source,
      ok: source !== 'shopify_wholesale',
    }))

    const result = await runSyncAll(syncSource)

    expect(syncSource).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(false)
    expect(result.failedSource).toBe('shopify_wholesale')
  })
})
