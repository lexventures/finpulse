import { describe, expect, it } from 'vitest'

import {
  buildContributionVariance,
  buildNetSalesVariance,
  topVarianceDrivers,
  type PnlRow,
  type VarianceDriver,
} from '@/lib/calculations/bridge'
import {
  ACTION_MAP,
  composeBridgeHeadline,
  pickInterestingDrivers,
  type HeadlineInputs,
} from '@/lib/calculations/bridge-headline'

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

function buildContributionInputs(opts: {
  current: PnlRow
  prior: PnlRow | null
  history: PnlRow[]
}): HeadlineInputs {
  const { current, prior, history } = opts
  let drivers: VarianceDriver[] = []
  if (prior) {
    const walk = buildContributionVariance(current, prior)
    drivers = topVarianceDrivers(walk, history, 'contribution', 6)
  }
  return {
    bridge: 'contribution',
    current,
    prior,
    series: history,
    drivers,
    periodKind: prior ? 'mom' : 'snapshot',
  }
}

function buildNetSalesInputs(opts: {
  current: PnlRow
  prior: PnlRow | null
  history: PnlRow[]
  periodKind?: HeadlineInputs['periodKind']
}): HeadlineInputs {
  const { current, prior, history, periodKind } = opts
  let drivers: VarianceDriver[] = []
  if (prior) {
    const walk = buildNetSalesVariance(current, prior)
    drivers = topVarianceDrivers(walk, history, 'net_sales', 6)
  }
  return {
    bridge: 'net_sales',
    current,
    prior,
    series: history,
    drivers,
    periodKind: periodKind ?? (prior ? 'mom' : 'snapshot'),
  }
}

describe('pickInterestingDrivers', () => {
  it('keeps drivers above the dollar threshold (5% of |currentTotal|)', () => {
    const drivers: VarianceDriver[] = [
      // 6% of 1,000,000 — significant
      { name: 'A', kind: 'cogs', delta: -60_000, rateNow: 50, rateTrailing3Avg: 50, ratePoints: 0, isNegativeImpact: true },
      // 0.5% of 1,000,000 — noise
      { name: 'B', kind: 'processing', delta: 5_000, rateNow: 2, rateTrailing3Avg: 2, ratePoints: 0, isNegativeImpact: false },
    ]
    const interesting = pickInterestingDrivers(drivers, 1_000_000)
    expect(interesting.map((d) => d.name)).toEqual(['A'])
  })

  it('keeps drivers above the rate threshold (1.5pp) even if dollar movement is small', () => {
    const drivers: VarianceDriver[] = [
      // small $ but rate moved 2pp
      { name: 'A', kind: 'discounts', delta: 1_000, rateNow: 12, rateTrailing3Avg: 10, ratePoints: 2, isNegativeImpact: false },
      // small $ and small rate movement
      { name: 'B', kind: 'returns', delta: 500, rateNow: 1.5, rateTrailing3Avg: 1.4, ratePoints: 0.1, isNegativeImpact: false },
    ]
    const interesting = pickInterestingDrivers(drivers, 1_000_000)
    expect(interesting.map((d) => d.name)).toEqual(['A'])
  })

  it('returns an empty list when all drivers are noise', () => {
    const drivers: VarianceDriver[] = [
      { name: 'A', kind: 'returns', delta: 1_000, rateNow: 1.5, rateTrailing3Avg: 1.4, ratePoints: 0.1, isNegativeImpact: false },
      { name: 'B', kind: 'shipping', delta: -500, rateNow: 1.0, rateTrailing3Avg: 1.0, ratePoints: 0, isNegativeImpact: true },
    ]
    expect(pickInterestingDrivers(drivers, 1_000_000)).toEqual([])
  })

  it('orders interesting drivers by absolute delta descending', () => {
    const drivers: VarianceDriver[] = [
      { name: 'small', kind: 'discounts', delta: 60_000, rateNow: 10, rateTrailing3Avg: 8, ratePoints: 2, isNegativeImpact: false },
      { name: 'big', kind: 'cogs', delta: -200_000, rateNow: 50, rateTrailing3Avg: 50, ratePoints: 0, isNegativeImpact: true },
    ]
    const interesting = pickInterestingDrivers(drivers, 1_000_000)
    expect(interesting.map((d) => d.name)).toEqual(['big', 'small'])
  })
})

describe('ACTION_MAP', () => {
  it('has a non-empty action for every driver kind', () => {
    const kinds: Array<keyof typeof ACTION_MAP> = [
      'gross', 'returns', 'discounts', 'shipping', 'nr',
      'cogs', 'processing', 'selling', 'ads', 'email',
    ]
    for (const k of kinds) {
      expect(ACTION_MAP[k]).toBeTruthy()
      expect(ACTION_MAP[k].length).toBeGreaterThan(8)
    }
  })
})

describe('composeBridgeHeadline — primary number', () => {
  it('uses NR for the net sales bridge and CM for the contribution bridge', () => {
    const cur = baseRow({ gross_revenue: 1_000_000, net_revenue: 970_000, contribution_margin: 350_000 })
    const headlineNR = composeBridgeHeadline(buildNetSalesInputs({ current: cur, prior: null, history: [cur] }))
    expect(headlineNR.primary.label).toBe('Net revenue')
    expect(headlineNR.primary.total).toBe(970_000)
    const headlineCM = composeBridgeHeadline(buildContributionInputs({ current: cur, prior: null, history: [cur] }))
    expect(headlineCM.primary.label).toBe('Contribution margin')
    expect(headlineCM.primary.total).toBe(350_000)
  })

  it('computes primary rate correctly: NR/gross for net sales, CM/NR for contribution', () => {
    const cur = baseRow({ gross_revenue: 1_000, net_revenue: 950, contribution_margin: 285 })
    const nr = composeBridgeHeadline(buildNetSalesInputs({ current: cur, prior: null, history: [cur] }))
    const cm = composeBridgeHeadline(buildContributionInputs({ current: cur, prior: null, history: [cur] }))
    expect(nr.primary.rate).toBeCloseTo(95, 5)
    expect(nr.primary.rateDenominator).toBe('gross')
    expect(cm.primary.rate).toBeCloseTo(30, 5)
    expect(cm.primary.rateDenominator).toBe('NR')
  })

  it('returns delta and deltaPctLabel when prior period exists', () => {
    const prior = baseRow({ month: '2026-03-01', net_revenue: 900_000, gross_revenue: 950_000 })
    const cur = baseRow({ month: '2026-04-01', net_revenue: 1_000_000, gross_revenue: 1_050_000 })
    const headline = composeBridgeHeadline(
      buildNetSalesInputs({ current: cur, prior, history: [prior, cur] }),
    )
    expect(headline.primary.delta).toBe(100_000)
    expect(headline.primary.deltaPctLabel).toMatch(/\+11(\.\d)?%/)
  })

  it('leaves delta fields null in snapshot mode', () => {
    const cur = baseRow({ month: '2026-04-01', net_revenue: 1_000_000, gross_revenue: 1_050_000 })
    const headline = composeBridgeHeadline(buildNetSalesInputs({ current: cur, prior: null, history: [cur] }))
    expect(headline.primary.delta).toBeNull()
    expect(headline.primary.deltaLabel).toBeNull()
    expect(headline.primary.deltaPctLabel).toBeNull()
  })

  it('produces a 12-month sparkline series of completed months in chronological order', () => {
    const months = Array.from({ length: 14 }, (_, i) => {
      const m = (i % 12) + 1
      const y = 2025 + Math.floor(i / 12)
      const monthKey = `${y}-${String(m).padStart(2, '0')}-01`
      return baseRow({ month: monthKey, net_revenue: 100_000 + i * 1000, gross_revenue: 100_000 + i * 1000 })
    })
    const cur = months[months.length - 1]
    const headline = composeBridgeHeadline(buildNetSalesInputs({ current: cur, prior: months[months.length - 2], history: months }))
    expect(headline.primary.sparkline.length).toBe(12)
    expect(headline.primary.sparkline[headline.primary.sparkline.length - 1]).toBe(cur.net_revenue)
    // Should be strictly increasing per the synthetic data
    for (let i = 1; i < headline.primary.sparkline.length; i += 1) {
      expect(headline.primary.sparkline[i]).toBeGreaterThan(headline.primary.sparkline[i - 1])
    }
  })

  it('skips partial months from the sparkline', () => {
    const months = [
      baseRow({ month: '2026-01-01', net_revenue: 100, gross_revenue: 100 }),
      baseRow({ month: '2026-02-01', net_revenue: 200, gross_revenue: 200 }),
      baseRow({ month: '2026-03-01', net_revenue: 300, gross_revenue: 300, is_partial: true }),
      baseRow({ month: '2026-04-01', net_revenue: 400, gross_revenue: 400 }),
    ]
    const cur = months[months.length - 1]
    const headline = composeBridgeHeadline(buildNetSalesInputs({ current: cur, prior: months[1], history: months }))
    expect(headline.primary.sparkline).toEqual([100, 200, 400])
  })
})

describe('composeBridgeHeadline — badges', () => {
  function ts(month: string, nr: number) {
    return baseRow({ month, net_revenue: nr, gross_revenue: nr })
  }

  it('returns best_12mo when current value is the strict max of the completed series', () => {
    const history = [
      ts('2025-11-01', 800),
      ts('2025-12-01', 850),
      ts('2026-01-01', 870),
      ts('2026-02-01', 860),
      ts('2026-03-01', 880),
      ts('2026-04-01', 1000),
    ]
    const cur = history[history.length - 1]
    const prior = history[history.length - 2]
    const h = composeBridgeHeadline(buildNetSalesInputs({ current: cur, prior, history }))
    expect(h.badge).toBe('best_12mo')
  })

  it('returns worst_12mo when current value is the strict min of the completed series', () => {
    const history = [
      baseRow({ month: '2025-11-01', net_revenue: 800, gross_revenue: 800 }),
      baseRow({ month: '2025-12-01', net_revenue: 850, gross_revenue: 850 }),
      baseRow({ month: '2026-01-01', net_revenue: 900, gross_revenue: 900 }),
      baseRow({ month: '2026-02-01', net_revenue: 870, gross_revenue: 870 }),
      baseRow({ month: '2026-03-01', net_revenue: 860, gross_revenue: 860 }),
      baseRow({ month: '2026-04-01', net_revenue: 600, gross_revenue: 600 }),
    ]
    const cur = history[history.length - 1]
    const prior = history[history.length - 2]
    const h = composeBridgeHeadline(buildNetSalesInputs({ current: cur, prior, history }))
    expect(h.badge).toBe('worst_12mo')
  })

  it('returns null when the value is between min and max', () => {
    const history = [
      baseRow({ month: '2025-11-01', net_revenue: 100, gross_revenue: 100 }),
      baseRow({ month: '2025-12-01', net_revenue: 200, gross_revenue: 200 }),
      baseRow({ month: '2026-01-01', net_revenue: 300, gross_revenue: 300 }),
      baseRow({ month: '2026-02-01', net_revenue: 400, gross_revenue: 400 }),
      baseRow({ month: '2026-03-01', net_revenue: 250, gross_revenue: 250 }),
      baseRow({ month: '2026-04-01', net_revenue: 250, gross_revenue: 250 }),
    ]
    const cur = history[history.length - 1]
    const prior = history[history.length - 2]
    const h = composeBridgeHeadline(buildNetSalesInputs({ current: cur, prior, history }))
    expect(h.badge).toBeNull()
  })

  it('returns null when there are fewer than 6 completed months', () => {
    const history = [
      baseRow({ month: '2026-03-01', net_revenue: 100, gross_revenue: 100 }),
      baseRow({ month: '2026-04-01', net_revenue: 200, gross_revenue: 200 }),
    ]
    const cur = history[history.length - 1]
    const prior = history[history.length - 2]
    const h = composeBridgeHeadline(buildNetSalesInputs({ current: cur, prior, history }))
    expect(h.badge).toBeNull()
  })
})

describe('composeBridgeHeadline — insight sentence', () => {
  function gen12mo(makeRow: (i: number) => PnlRow): PnlRow[] {
    return Array.from({ length: 12 }, (_, i) => makeRow(i))
  }

  it('returns "within trailing band" when no driver is interesting', () => {
    const history = gen12mo((i) => baseRow({
      month: `2025-${String(i + 1).padStart(2, '0')}-01`,
      gross_revenue: 1_000_000,
      net_revenue: 970_000,
      shipping_income: 5_000,
      returns: -10_000,
      discounts: -25_000,
    }))
    const cur = baseRow({
      month: '2026-04-01',
      gross_revenue: 1_001_000,
      net_revenue: 970_500,
      shipping_income: 5_500,
      returns: -10_000,
      discounts: -26_000,
    })
    const prior = history[history.length - 1]
    const inputs = buildNetSalesInputs({ current: cur, prior, history: [...history, cur] })
    const h = composeBridgeHeadline(inputs)
    expect(h.insight).toMatch(/within trailing band/i)
    expect(h.action).toBeNull()
  })

  it('returns a 1-driver sentence when exactly one driver is interesting and pulls action from ACTION_MAP', () => {
    const history = gen12mo((i) => baseRow({
      month: `2025-${String(i + 1).padStart(2, '0')}-01`,
      gross_revenue: 1_000_000,
      net_revenue: 970_000,
      shipping_income: 5_000,
      returns: -10_000,
      discounts: -25_000,
    }))
    const cur = baseRow({
      month: '2026-04-01',
      gross_revenue: 800_000,
      net_revenue: 770_500,
      shipping_income: 5_500,
      returns: -10_000,
      discounts: -25_000,
    })
    const prior = history[history.length - 1]
    const inputs = buildNetSalesInputs({ current: cur, prior, history: [...history, cur] })
    const h = composeBridgeHeadline(inputs)
    expect(h.insight).toMatch(/Gross/i)
    expect(h.insight).toMatch(/swing driver|drove the move/i)
    expect(h.action).toBe(ACTION_MAP.gross)
  })

  it('returns a 2-driver sentence when multiple drivers are interesting', () => {
    const history = gen12mo((i) => baseRow({
      month: `2025-${String(i + 1).padStart(2, '0')}-01`,
      net_revenue: 1_000_000,
      cogs: -500_000,
      processing_fees: -20_000,
      selling_fees: -10_000,
      allocated_ad_spend: -120_000,
      allocated_email_marketing: -10_000,
      contribution_margin: 340_000,
    }))
    const cur = baseRow({
      month: '2026-04-01',
      net_revenue: 1_000_000,
      cogs: -380_000,
      processing_fees: -20_000,
      selling_fees: -10_000,
      allocated_ad_spend: -240_000,
      allocated_email_marketing: -10_000,
      contribution_margin: 340_000,
    })
    const prior = history[history.length - 1]
    const inputs = buildContributionInputs({ current: cur, prior, history: [...history, cur] })
    const h = composeBridgeHeadline(inputs)
    expect(h.insight).toMatch(/COGS/i)
    expect(h.insight).toMatch(/Paid ads/i)
    expect(h.action).toBeTruthy()
  })

  it('prefixes badge text when the current value is best in 12mo', () => {
    const history = gen12mo((i) => baseRow({
      month: `2025-${String(i + 1).padStart(2, '0')}-01`,
      net_revenue: 1_000_000,
      cogs: -500_000,
      processing_fees: -20_000,
      contribution_margin: 480_000,
    }))
    const cur = baseRow({
      month: '2026-04-01',
      net_revenue: 1_000_000,
      cogs: -300_000,
      processing_fees: -20_000,
      contribution_margin: 680_000,
    })
    const prior = history[history.length - 1]
    const inputs = buildContributionInputs({ current: cur, prior, history: [...history, cur] })
    const h = composeBridgeHeadline(inputs)
    expect(h.badge).toBe('best_12mo')
    expect(h.insight).toMatch(/best.+12 ?mo/i)
  })

  it('returns null insight and null action in snapshot mode', () => {
    const cur = baseRow({ net_revenue: 1_000, gross_revenue: 1_050 })
    const inputs = buildNetSalesInputs({ current: cur, prior: null, history: [cur], periodKind: 'snapshot' })
    const h = composeBridgeHeadline(inputs)
    expect(h.insight).toBeNull()
    expect(h.action).toBeNull()
  })
})
