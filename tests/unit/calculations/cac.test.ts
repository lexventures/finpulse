import { describe, expect, it } from 'vitest'

import { buildMonthlyDtcCacTrend, calcBlendedCac } from '@/lib/calculations/cac'

describe('calcBlendedCac', () => {
  it('returns adSpend / newCustomers for valid inputs', () => {
    expect(calcBlendedCac(10_000, 100)).toBe(100)
    expect(calcBlendedCac(1_500, 50)).toBe(30)
  })

  it('returns null when newCustomers is 0', () => {
    expect(calcBlendedCac(5_000, 0)).toBeNull()
  })

  it('returns null when newCustomers is negative', () => {
    expect(calcBlendedCac(5_000, -10)).toBeNull()
  })

  it('handles large numbers correctly', () => {
    const adSpend = 9_000_000_000
    const newCustomers = 3_000_000
    expect(calcBlendedCac(adSpend, newCustomers)).toBe(3000)
  })
})

describe('buildMonthlyDtcCacTrend', () => {
  it('builds a 12-month DTC-only CAC trend by default and excludes Faire/company spend', () => {
    const rows = [
      {
        month: '2026-03-01',
        channel: 'wholesale_faire',
        allocated_ad_spend: 9_000,
        new_customer_orders: 30,
        is_partial: false,
      },
      {
        month: '2026-03-01',
        channel: 'company',
        allocated_ad_spend: 20_000,
        new_customer_orders: 200,
        is_partial: false,
      },
      {
        month: '2026-03-01',
        channel: 'dtc',
        allocated_ad_spend: -12_000,
        new_customer_orders: 120,
        is_partial: false,
      },
      {
        month: '2026-02-01',
        channel: 'dtc',
        allocated_ad_spend: 8_000,
        new_customer_orders: 0,
        is_partial: false,
      },
      {
        month: '2026-01-01',
        channel: 'dtc',
        allocated_ad_spend: 7_000,
        new_customer_orders: 70,
        is_partial: true,
      },
    ]

    expect(buildMonthlyDtcCacTrend(rows)).toEqual([
      {
        month: '2026-02-01',
        adSpend: 8_000,
        newCustomers: 0,
        cac: null,
      },
      {
        month: '2026-03-01',
        adSpend: 12_000,
        newCustomers: 120,
        cac: 100,
      },
    ])
  })

  it('limits the default CAC trend to the latest 12 completed DTC months', () => {
    const months = [
      '2025-01-01',
      '2025-02-01',
      '2025-03-01',
      '2025-04-01',
      '2025-05-01',
      '2025-06-01',
      '2025-07-01',
      '2025-08-01',
      '2025-09-01',
      '2025-10-01',
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
    ]
    const rows = months.map((month) => ({
      month,
      channel: 'dtc',
      allocated_ad_spend: 1_200,
      new_customer_orders: 12,
      is_partial: false,
    }))

    const trend = buildMonthlyDtcCacTrend(rows)

    expect(trend).toHaveLength(12)
    expect(trend[0].month).toBe('2025-02-01')
    expect(trend[11].month).toBe('2026-01-01')
  })
})
