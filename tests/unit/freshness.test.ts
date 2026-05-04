import { describe, expect, it } from 'vitest'

import {
  computeFreshness,
  formatRelativeTime,
  FRESHNESS_PRIMARY_SOURCES,
  type FreshnessSyncLog,
} from '@/lib/freshness'

const NOW = new Date('2026-05-03T20:00:00Z')

function log(
  source: string,
  hoursAgo: number,
  status: 'success' | 'partial' | 'error' | 'running' = 'success',
): FreshnessSyncLog {
  const completed = new Date(NOW.getTime() - hoursAgo * 3_600_000)
  const started = new Date(completed.getTime() - 60_000)
  return {
    source,
    started_at: started.toISOString(),
    completed_at: completed.toISOString(),
    status,
  }
}

describe('formatRelativeTime', () => {
  it('returns "just now" for less than a minute', () => {
    const t = new Date(NOW.getTime() - 30_000)
    expect(formatRelativeTime(t.toISOString(), NOW)).toBe('just now')
  })

  it('formats minutes', () => {
    const t = new Date(NOW.getTime() - 5 * 60_000)
    expect(formatRelativeTime(t.toISOString(), NOW)).toBe('5m ago')
  })

  it('formats hours', () => {
    const t = new Date(NOW.getTime() - 3 * 3_600_000)
    expect(formatRelativeTime(t.toISOString(), NOW)).toBe('3h ago')
  })

  it('formats days', () => {
    const t = new Date(NOW.getTime() - 2 * 86_400_000)
    expect(formatRelativeTime(t.toISOString(), NOW)).toBe('2d ago')
  })

  it('handles null with em dash', () => {
    expect(formatRelativeTime(null, NOW)).toBe('—')
  })
})

describe('computeFreshness', () => {
  it('returns red tier when there are no sync logs', () => {
    const result = computeFreshness([], NOW)
    expect(result.tier).toBe('red')
    expect(result.summary).toContain('Never synced')
    expect(result.bySource).toHaveLength(FRESHNESS_PRIMARY_SOURCES.length + 2)
  })

  it('returns green when all primary sources synced within 12 hours and clean', () => {
    const logs: FreshnessSyncLog[] = [
      log('finaloop_sheets', 1),
      log('shopify_dtc', 2),
      log('shopify_wholesale', 3),
      log('shopify_analytics', 4),
      log('kpi_facts', 1),
      log('cash_forecast', 1),
    ]

    const result = computeFreshness(logs, NOW)
    expect(result.tier).toBe('green')
    expect(result.oldestPrimaryHours).toBeCloseTo(4, 1)
  })

  it('returns amber when oldest primary source is 12-48 hours stale', () => {
    const logs: FreshnessSyncLog[] = [
      log('finaloop_sheets', 24),
      log('shopify_dtc', 2),
      log('shopify_wholesale', 3),
      log('shopify_analytics', 4),
    ]

    const result = computeFreshness(logs, NOW)
    expect(result.tier).toBe('amber')
  })

  it('returns red when any primary source is over 48 hours stale', () => {
    const logs: FreshnessSyncLog[] = [
      log('finaloop_sheets', 60),
      log('shopify_dtc', 2),
      log('shopify_wholesale', 3),
      log('shopify_analytics', 4),
    ]

    const result = computeFreshness(logs, NOW)
    expect(result.tier).toBe('red')
  })

  it('returns red when the most recent log on any primary source is errored', () => {
    const logs: FreshnessSyncLog[] = [
      log('finaloop_sheets', 1, 'error'),
      log('shopify_dtc', 2),
      log('shopify_wholesale', 3),
      log('shopify_analytics', 4),
    ]

    const result = computeFreshness(logs, NOW)
    expect(result.tier).toBe('red')
  })

  it('returns amber when a primary source has a partial status but is within window', () => {
    const logs: FreshnessSyncLog[] = [
      log('finaloop_sheets', 1, 'partial'),
      log('shopify_dtc', 2),
      log('shopify_wholesale', 3),
      log('shopify_analytics', 4),
    ]

    const result = computeFreshness(logs, NOW)
    expect(result.tier).toBe('amber')
  })

  it('returns red when a primary source has never been synced', () => {
    const logs: FreshnessSyncLog[] = [
      log('finaloop_sheets', 1),
      log('shopify_dtc', 2),
      log('shopify_wholesale', 3),
    ]

    const result = computeFreshness(logs, NOW)
    expect(result.tier).toBe('red')
    const analytics = result.bySource.find((s) => s.source === 'shopify_analytics')
    expect(analytics?.status).toBe('never')
  })

  it('keeps the most recent log per source when multiple logs exist', () => {
    const logs: FreshnessSyncLog[] = [
      log('finaloop_sheets', 8, 'error'),
      log('finaloop_sheets', 1, 'success'),
      log('shopify_dtc', 2),
      log('shopify_wholesale', 3),
      log('shopify_analytics', 4),
    ]

    const result = computeFreshness(logs, NOW)
    expect(result.tier).toBe('green')
    const finaloop = result.bySource.find((s) => s.source === 'finaloop_sheets')
    expect(finaloop?.status).toBe('success')
  })

  it('orders bySource with primary sources first, then secondary', () => {
    const logs: FreshnessSyncLog[] = [
      log('cash_forecast', 1),
      log('kpi_facts', 1),
      log('shopify_analytics', 1),
      log('shopify_wholesale', 1),
      log('shopify_dtc', 1),
      log('finaloop_sheets', 1),
    ]

    const result = computeFreshness(logs, NOW)
    const sources = result.bySource.map((s) => s.source)
    expect(sources.indexOf('finaloop_sheets')).toBeLessThan(sources.indexOf('kpi_facts'))
    expect(sources.indexOf('shopify_analytics')).toBeLessThan(sources.indexOf('cash_forecast'))
  })
})
