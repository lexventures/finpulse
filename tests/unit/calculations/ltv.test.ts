import { describe, expect, it } from 'vitest'

import {
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
