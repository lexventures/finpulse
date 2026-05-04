import { describe, expect, it } from 'vitest'

import {
  buildContributionSnapshot,
  buildContributionVariance,
  buildNetSalesSnapshot,
  buildNetSalesVariance,
  computeContributionRates,
  computeNetSalesRates,
  computeWalkDomain,
  lookupPriorPeriod,
  shiftMonth,
  topVarianceDrivers,
  type PnlRow,
} from '@/lib/calculations/bridge'

const baseRow = (overrides: Partial<PnlRow>): PnlRow => ({
  month: '2026-04-01',
  channel: 'company',
  gross_revenue: 0,
  net_revenue: 0,
  returns: 0,
  discounts: 0,
  shipping_income: 0,
  cogs: 0,
  processing_fees: 0,
  selling_fees: 0,
  allocated_ad_spend: 0,
  allocated_email_marketing: 0,
  contribution_margin: 0,
  is_partial: false,
  ...overrides,
})

describe('shiftMonth', () => {
  it('subtracts one month within a year', () => {
    expect(shiftMonth('2026-04-01', -1)).toBe('2026-03-01')
  })

  it('crosses year boundaries when going back', () => {
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-04-01', -12)).toBe('2025-04-01')
  })

  it('handles forward shifts', () => {
    expect(shiftMonth('2025-12-01', 1)).toBe('2026-01-01')
  })
})

describe('lookupPriorPeriod', () => {
  const history: PnlRow[] = [
    baseRow({ month: '2026-04-01', net_revenue: 1_000_000 }),
    baseRow({ month: '2026-03-01', net_revenue: 950_000 }),
    baseRow({ month: '2026-02-01', net_revenue: 900_000, is_partial: true }),
    baseRow({ month: '2025-04-01', net_revenue: 800_000 }),
  ]

  it('returns the prior month row for MoM', () => {
    const result = lookupPriorPeriod(history, '2026-04-01', 'mom')
    expect(result.row?.month).toBe('2026-03-01')
    expect(result.missingReason).toBeUndefined()
  })

  it('returns the same month last year for YoY', () => {
    const result = lookupPriorPeriod(history, '2026-04-01', 'yoy')
    expect(result.row?.month).toBe('2025-04-01')
  })

  it('reports missing when no row exists', () => {
    const result = lookupPriorPeriod(history, '2024-01-01', 'mom')
    expect(result.row).toBeNull()
    expect(result.missingReason).toBe('missing')
  })

  it('reports partial when the row is partial', () => {
    const result = lookupPriorPeriod(history, '2026-03-01', 'mom')
    expect(result.row).toBeNull()
    expect(result.missingReason).toBe('partial')
  })
})

describe('buildNetSalesVariance', () => {
  const prior = baseRow({
    month: '2026-03-01',
    gross_revenue: 1_100_000,
    returns: -22_000,
    discounts: -90_000,
    shipping_income: 12_000,
    net_revenue: 1_000_000,
  })

  const current = baseRow({
    month: '2026-04-01',
    gross_revenue: 1_120_000,
    returns: -28_000,
    discounts: -110_000,
    shipping_income: 18_000,
    net_revenue: 1_000_000,
  })

  it('reconciles: priorNR + Σdeltas = currentNR', () => {
    const walk = buildNetSalesVariance(current, prior)
    const deltas = walk.steps.filter((s) => !s.isTotal)
    const sumDeltas = deltas.reduce((s, d) => s + d.value, 0)
    expect(prior.net_revenue + sumDeltas).toBeCloseTo(current.net_revenue, 5)
  })

  it('treats more-negative returns/discounts as negative impact (red)', () => {
    const walk = buildNetSalesVariance(current, prior)
    const dReturns = walk.steps.find((s) => s.name.includes('Returns'))!
    const dDiscounts = walk.steps.find((s) => s.name.includes('Discounts'))!
    expect(dReturns.value).toBeLessThan(0)
    expect(dDiscounts.value).toBeLessThan(0)
  })

  it('starts and ends with isTotal anchors', () => {
    const walk = buildNetSalesVariance(current, prior)
    expect(walk.steps[0].isTotal).toBe(true)
    expect(walk.steps[0].value).toBe(prior.net_revenue)
    expect(walk.steps[walk.steps.length - 1].isTotal).toBe(true)
    expect(walk.steps[walk.steps.length - 1].value).toBe(current.net_revenue)
  })

  it('produces a zoomed yDomain padded around the running totals', () => {
    const walk = buildNetSalesVariance(current, prior)
    const [lo, hi] = walk.yDomain
    expect(lo).toBeGreaterThan(0)
    expect(lo).toBeLessThan(prior.net_revenue)
    expect(hi).toBeGreaterThan(prior.net_revenue)
  })
})

describe('buildContributionVariance', () => {
  const prior = baseRow({
    month: '2026-03-01',
    net_revenue: 950_000,
    cogs: -480_000,
    processing_fees: -25_000,
    selling_fees: -10_000,
    allocated_ad_spend: -120_000,
    allocated_email_marketing: -15_000,
    contribution_margin: 300_000,
  })

  const current = baseRow({
    month: '2026-04-01',
    net_revenue: 1_000_000,
    cogs: -510_000,
    processing_fees: -28_000,
    selling_fees: -11_000,
    allocated_ad_spend: -140_000,
    allocated_email_marketing: -16_000,
    contribution_margin: 295_000,
  })

  it('reconciles: priorCM + Σdeltas = currentCM', () => {
    const walk = buildContributionVariance(current, prior)
    const deltas = walk.steps.filter((s) => !s.isTotal)
    const sumDeltas = deltas.reduce((s, d) => s + d.value, 0)
    expect(prior.contribution_margin + sumDeltas).toBeCloseTo(
      current.contribution_margin,
      5,
    )
  })

  it('renders Δ Net revenue, COGS, fees, ads, email anchors plus prior/current', () => {
    const walk = buildContributionVariance(current, prior)
    const names = walk.steps.map((s) => s.name)
    expect(names[0]).toMatch(/Prior CM/i)
    expect(names).toContain('Δ Net revenue')
    expect(names).toContain('Δ COGS')
    expect(names).toContain('Δ Processing fees')
    expect(names).toContain('Δ Selling fees')
    expect(names).toContain('Δ Paid ads')
    expect(names).toContain('Δ Email marketing')
    expect(names[names.length - 1]).toMatch(/Current CM/i)
  })
})

describe('computeWalkDomain', () => {
  it('pads the running-total range by ~10% on both sides', () => {
    const steps = [
      { name: 'Prior', value: 1_000, isTotal: true },
      { name: 'Δ A', value: 100 },
      { name: 'Δ B', value: -50 },
      { name: 'Current', value: 1_050, isTotal: true },
    ]
    const [lo, hi] = computeWalkDomain(steps)
    expect(lo).toBeLessThan(1_000)
    expect(lo).toBeGreaterThan(900)
    expect(hi).toBeGreaterThan(1_100)
    expect(hi).toBeLessThan(1_200)
  })

  it('returns [0, 0] for empty walks', () => {
    expect(computeWalkDomain([])).toEqual([0, 0])
  })
})

describe('snapshot builders', () => {
  it('buildNetSalesSnapshot matches the existing decomposition shape', () => {
    const row = baseRow({
      gross_revenue: 100,
      returns: -5,
      discounts: -10,
      shipping_income: 3,
      net_revenue: 88,
    })
    expect(buildNetSalesSnapshot(row)).toEqual([
      { name: 'Gross revenue', value: 100 },
      { name: 'Returns', value: -5 },
      { name: 'Discounts', value: -10 },
      { name: 'Shipping income', value: 3 },
      { name: 'Net revenue', value: 88, isTotal: true },
    ])
  })

  it('buildContributionSnapshot matches the existing decomposition shape', () => {
    const row = baseRow({
      net_revenue: 100,
      cogs: -50,
      processing_fees: -3,
      selling_fees: -1,
      allocated_ad_spend: -12,
      allocated_email_marketing: -2,
      contribution_margin: 32,
    })
    expect(buildContributionSnapshot(row)).toEqual([
      { name: 'Net revenue', value: 100 },
      { name: 'COGS', value: -50 },
      { name: 'Processing fees', value: -3 },
      { name: 'Selling fees', value: -1 },
      { name: 'Paid ads', value: -12 },
      { name: 'Email marketing', value: -2 },
      { name: 'Contribution margin', value: 32, isTotal: true },
    ])
  })
})

describe('computeNetSalesRates', () => {
  it('returns absolute-value rates for stacking and exposes NR%', () => {
    const row = baseRow({
      gross_revenue: 1_000,
      returns: -50,
      discounts: -100,
      shipping_income: 30,
      net_revenue: 880,
    })
    const r = computeNetSalesRates(row)!
    expect(r.returns_rate).toBeCloseTo(5, 5)
    expect(r.discounts_rate).toBeCloseTo(10, 5)
    expect(r.net_revenue_rate).toBeCloseTo(88, 5)
    expect(r.returns_rate + r.discounts_rate + r.net_layer).toBeCloseTo(100, 5)
  })

  it('returns null when gross is zero', () => {
    expect(computeNetSalesRates(baseRow({ gross_revenue: 0 }))).toBeNull()
  })
})

describe('computeContributionRates', () => {
  it('produces rates that sum to 100 of net revenue', () => {
    const row = baseRow({
      net_revenue: 1_000,
      cogs: -500,
      processing_fees: -20,
      selling_fees: -10,
      allocated_ad_spend: -120,
      allocated_email_marketing: -10,
      contribution_margin: 340,
    })
    const r = computeContributionRates(row)!
    expect(r.cogs_rate).toBeCloseTo(50, 5)
    expect(r.fees_rate).toBeCloseTo(3, 5)
    expect(r.ad_spend_rate).toBeCloseTo(12, 5)
    expect(r.email_rate).toBeCloseTo(1, 5)
    expect(r.contribution_margin_rate).toBeCloseTo(34, 5)
    const total =
      r.cogs_rate +
      r.fees_rate +
      r.ad_spend_rate +
      r.email_rate +
      r.contribution_margin_rate
    expect(total).toBeCloseTo(100, 5)
  })

  it('returns null when net revenue is zero', () => {
    expect(computeContributionRates(baseRow({ net_revenue: 0 }))).toBeNull()
  })
})

describe('topVarianceDrivers', () => {
  const prior = baseRow({
    month: '2026-03-01',
    gross_revenue: 1_100_000,
    returns: -22_000,
    discounts: -90_000,
    shipping_income: 12_000,
    net_revenue: 1_000_000,
  })
  const current = baseRow({
    month: '2026-04-01',
    gross_revenue: 1_120_000,
    returns: -28_000,
    discounts: -110_000,
    shipping_income: 18_000,
    net_revenue: 1_000_000,
  })
  const history: PnlRow[] = [
    prior,
    baseRow({
      month: '2026-02-01',
      gross_revenue: 1_080_000,
      returns: -20_000,
      discounts: -85_000,
      shipping_income: 10_000,
      net_revenue: 985_000,
    }),
    baseRow({
      month: '2026-01-01',
      gross_revenue: 1_050_000,
      returns: -19_000,
      discounts: -82_000,
      shipping_income: 9_000,
      net_revenue: 958_000,
    }),
  ]

  it('returns drivers sorted by absolute delta and tags negative impact', () => {
    const walk = buildNetSalesVariance(current, prior)
    const drivers = topVarianceDrivers(walk, history, 'net_sales', 2)
    expect(drivers.length).toBe(2)
    expect(Math.abs(drivers[0].delta)).toBeGreaterThanOrEqual(Math.abs(drivers[1].delta))
    const discounts = drivers.find((d) => d.name.includes('Discounts'))
    expect(discounts?.isNegativeImpact).toBe(true)
  })

  it('attaches rateNow and ratePoints vs trailing 3mo for matched components', () => {
    const walk = buildNetSalesVariance(current, prior)
    const drivers = topVarianceDrivers(walk, history, 'net_sales', 4)
    const discounts = drivers.find((d) => d.name.includes('Discounts'))!
    expect(discounts.rateNow).not.toBeNull()
    expect(discounts.ratePoints).not.toBeNull()
    expect(discounts.rateNow!).toBeCloseTo(110_000 / 1_120_000 * 100, 2)
  })

  it('skips partial months when computing trailing 3mo baseline', () => {
    const partialHistory = history.map((r) =>
      r.month === '2026-02-01' ? { ...r, is_partial: true } : r,
    )
    const walk = buildNetSalesVariance(current, prior)
    const drivers = topVarianceDrivers(walk, partialHistory, 'net_sales', 4)
    const discounts = drivers.find((d) => d.name.includes('Discounts'))!
    expect(discounts.ratePoints).not.toBeNull()
  })
})
