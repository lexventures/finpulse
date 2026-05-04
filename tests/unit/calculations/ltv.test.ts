import { describe, expect, it } from 'vitest'

import {
  buildMonthlyDtcLtvCacTrend,
  calcLtvCacRatio,
  calcPaybackPeriod,
  calcSimplifiedLtv,
} from '@/lib/calculations/ltv'

describe('calcSimplifiedLtv', () => {
  it('computes LTV as revenue / newCustomers * grossMarginPct', () => {
    const revenue = 100_000
    const newCustomers = 200
    const grossMarginPct = 40
    expect(calcSimplifiedLtv(revenue, newCustomers, grossMarginPct)).toBe(
      (revenue / newCustomers) * (grossMarginPct / 100)
    )
    expect(calcSimplifiedLtv(50_000, 100, 25)).toBe(125)
  })

  it('returns null when newCustomers is 0', () => {
    expect(calcSimplifiedLtv(10_000, 0, 50)).toBeNull()
  })
})

describe('calcLtvCacRatio', () => {
  it('returns LTV / CAC when both are valid and CAC is non-zero', () => {
    expect(calcLtvCacRatio(300, 100)).toBe(3)
  })

  it('returns null when CAC is null or 0', () => {
    expect(calcLtvCacRatio(300, null)).toBeNull()
    expect(calcLtvCacRatio(300, 0)).toBeNull()
  })

  it('returns null when LTV is null', () => {
    expect(calcLtvCacRatio(null, 100)).toBeNull()
  })
})

describe('calcPaybackPeriod', () => {
  it('returns CAC / daily margin when daily margin is positive', () => {
    const cac = 150
    const avgDailyRevenuePerCustomer = 10
    const grossMarginPct = 30
    const dailyMargin = avgDailyRevenuePerCustomer * (grossMarginPct / 100)
    expect(calcPaybackPeriod(cac, avgDailyRevenuePerCustomer, grossMarginPct)).toBe(
      cac / dailyMargin
    )
  })

  it('returns null when CAC is null', () => {
    expect(calcPaybackPeriod(null, 5, 40)).toBeNull()
  })

  it('returns null when daily revenue is 0 (zero daily margin)', () => {
    expect(calcPaybackPeriod(200, 0, 50)).toBeNull()
  })

  it('returns null when gross margin yields zero daily margin', () => {
    expect(calcPaybackPeriod(200, 100, 0)).toBeNull()
  })
})

describe('buildMonthlyDtcLtvCacTrend', () => {
  it('builds DTC CAC and Shopify LTV points oldest to newest', () => {
    const rows = [
      {
        month: '2026-03-01',
        channel: 'dtc',
        allocated_ad_spend: -12_000,
        new_customer_orders: 120,
        gross_margin_pct: 55,
        shopify_ltv_to_date: 180,
        shopify_gross_margin_ltv_to_date: null,
        is_partial: false,
      },
      {
        month: '2026-02-01',
        channel: 'dtc',
        allocated_ad_spend: 8_000,
        new_customer_orders: 0,
        gross_margin_pct: 50,
        shopify_ltv_to_date: null,
        shopify_gross_margin_ltv_to_date: null,
        is_partial: false,
      },
      {
        month: '2026-03-01',
        channel: 'wholesale_faire',
        allocated_ad_spend: 9_000,
        new_customer_orders: 90,
        gross_margin_pct: 50,
        shopify_ltv_to_date: 300,
        shopify_gross_margin_ltv_to_date: 150,
        is_partial: false,
      },
      {
        month: '2026-01-01',
        channel: 'dtc',
        allocated_ad_spend: 7_000,
        new_customer_orders: 70,
        gross_margin_pct: 50,
        shopify_ltv_to_date: 150,
        shopify_gross_margin_ltv_to_date: 75,
        is_partial: true,
      },
    ]

    expect(buildMonthlyDtcLtvCacTrend(rows)).toEqual([
      {
        month: '2026-02-01',
        adSpend: 8_000,
        newCustomers: 0,
        cac: null,
        shopifyLtvToDate: null,
        shopifyGrossMarginLtvToDate: null,
      },
      {
        month: '2026-03-01',
        adSpend: 12_000,
        newCustomers: 120,
        cac: 100,
        shopifyLtvToDate: 180,
        shopifyGrossMarginLtvToDate: 99,
      },
    ])
  })
})
