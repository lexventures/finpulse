import { describe, expect, it } from 'vitest'

import { calcContributionMargin } from '@/lib/calculations/contribution-margin'

describe('calcContributionMargin', () => {
  it('sums net revenue and all cost inputs (negative cost convention)', () => {
    const result = calcContributionMargin({
      netRevenue: 100_000,
      cogs: -55_000,
      totalFees: -5_000,
      allocatedAdSpend: -8_000,
      allocatedEmailMarketing: -2_000,
    })
    expect(result.margin).toBe(30_000)
    expect(result.pct).toBeCloseTo(30, 5)
  })

  it('matches Finaloop-style net sales and negative COGS (51.1% margin)', () => {
    const netSales = 2_275_332
    const cogs = -1_112_607
    const grossProfit = netSales + cogs
    expect(grossProfit).toBe(1_162_725)

    const result = calcContributionMargin({
      netRevenue: netSales,
      cogs,
      totalFees: 0,
      allocatedAdSpend: 0,
      allocatedEmailMarketing: 0,
    })
    expect(result.margin).toBe(1_162_725)
    expect(result.pct).toBeCloseTo(51.1, 1)
  })

  it('returns null pct when netRevenue is 0', () => {
    const result = calcContributionMargin({
      netRevenue: 0,
      cogs: -100,
      totalFees: -20,
      allocatedAdSpend: -30,
      allocatedEmailMarketing: -10,
    })
    expect(result.margin).toBe(-160)
    expect(result.pct).toBeNull()
  })
})
