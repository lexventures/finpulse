import type {
  BridgeKind,
  DriverKind,
  PeriodKind,
  PnlRow,
  VarianceDriver,
} from '@/lib/calculations/bridge'

const DOLLAR_THRESHOLD_PCT = 0.05
const RATE_THRESHOLD_PP = 1.5
const MIN_HISTORY_FOR_BADGE = 6

export const ACTION_MAP: Record<DriverKind, string> = {
  gross: 'Check Shopify sessions, conversion, and AOV for the period.',
  returns: 'Check returns by reason and SKU in Shopify.',
  discounts: 'Review promo calendar and discount-code performance.',
  shipping: 'Check the free-shipping threshold and carrier mix.',
  nr: 'Open the net sales bridge to see which line drove the change.',
  cogs: 'Check vendor invoices and freight for cost drift.',
  processing: 'Check payment processor mix and average order size.',
  selling: 'Check Faire / wholesale commissions for the period.',
  ads: 'Open the CAC / LTV chart; check spend efficiency by channel.',
  email: 'Check Klaviyo flows and campaign spend.',
}

export type Badge = 'best_12mo' | 'worst_12mo' | null

export interface HeadlinePrimary {
  label: string
  total: number
  totalLabel: string
  delta: number | null
  deltaLabel: string | null
  deltaPctLabel: string | null
  rate: number
  rateLabel: string
  rateDenominator: 'gross' | 'NR'
  sparkline: number[]
  sparklineHorizon: number
  monthLabel: string
  priorMonthLabel: string | null
  periodPhrase: string | null
}

export interface BridgeHeadline {
  primary: HeadlinePrimary
  badge: Badge
  badgeLabel: string | null
  insight: string | null
  action: string | null
}

export interface HeadlineInputs {
  bridge: BridgeKind
  current: PnlRow
  prior: PnlRow | null
  series: PnlRow[]
  drivers: VarianceDriver[]
  periodKind: PeriodKind
}

export function pickInterestingDrivers(
  drivers: VarianceDriver[],
  currentTotal: number,
): VarianceDriver[] {
  const dollarThreshold = Math.abs(currentTotal) * DOLLAR_THRESHOLD_PCT
  return [...drivers]
    .filter((d) => {
      const dollarSignificant = Math.abs(d.delta) >= dollarThreshold
      const rateSignificant =
        d.ratePoints != null && Math.abs(d.ratePoints) >= RATE_THRESHOLD_PP
      return dollarSignificant || rateSignificant
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

function fmtAmount(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000) return `$${Math.round(abs / 1_000)}k`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}k`
  return `$${abs.toFixed(0)}`
}

function fmtSignedAmount(v: number): string {
  const sign = v < 0 ? '-' : '+'
  return `${sign}${fmtAmount(v)}`
}

function fmtMonth(month: string): string {
  return new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

function periodSuffix(period: PeriodKind): string {
  if (period === 'mom') return 'MoM'
  if (period === 'yoy') return 'YoY'
  return ''
}

function periodPhrase(period: PeriodKind): string | null {
  if (period === 'mom') return 'Month over month'
  if (period === 'yoy') return 'Year over year'
  return null
}

function lineItemDirection(d: VarianceDriver): 'up' | 'down' | 'flat' {
  if (d.delta === 0) return 'flat'
  const helped = d.delta > 0
  const isAddition = d.kind === 'gross' || d.kind === 'nr' || d.kind === 'shipping'
  if (isAddition) return helped ? 'up' : 'down'
  return helped ? 'down' : 'up'
}

function describeDirection(d: VarianceDriver): string {
  const dir = lineItemDirection(d)
  return `${d.name} ${dir} ${fmtAmount(d.delta)}`
}

function totalSeries(rows: PnlRow[], bridge: BridgeKind): number[] {
  return [...rows]
    .filter((r) => !r.is_partial)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map((r) => (bridge === 'net_sales' ? r.net_revenue : r.contribution_margin))
}

function computeBadge(
  series: number[],
  currentTotal: number,
): { badge: Badge; horizon: number } {
  if (series.length < MIN_HISTORY_FOR_BADGE) {
    return { badge: null, horizon: series.length }
  }
  const max = Math.max(...series)
  const min = Math.min(...series)
  if (max === min) return { badge: null, horizon: series.length }
  if (currentTotal === max) return { badge: 'best_12mo', horizon: series.length }
  if (currentTotal === min) return { badge: 'worst_12mo', horizon: series.length }
  return { badge: null, horizon: series.length }
}

function badgeLabel(badge: Badge, horizon: number, totalLabel: string): string | null {
  if (!badge) return null
  const verb = badge === 'best_12mo' ? 'Best' : 'Worst'
  return `${verb} ${totalLabel} in ${horizon}mo`
}

function badgePrefix(badge: Badge, horizon: number, totalLabel: string): string | null {
  if (!badge) return null
  const verb = badge === 'best_12mo' ? 'Best' : 'Worst'
  return `${verb} ${totalLabel} in ${horizon} months.`
}

function composeInsightSentence(
  interesting: VarianceDriver[],
  noiseCeilingLabel: string,
): string {
  if (interesting.length === 0) {
    return 'All drivers moved within trailing band.'
  }
  const others =
    interesting.length === 1
      ? `; all others moved less than ${noiseCeilingLabel}`
      : ''
  if (interesting.length === 1) {
    return `${describeDirection(interesting[0])} was the swing driver${others}.`
  }
  const top = interesting[0]
  const second = interesting[1]
  const helpedHurt = (d: VarianceDriver) => (d.delta < 0 ? 'hurt' : 'helped')
  const tail =
    interesting.length > 2
      ? ` Others below ${noiseCeilingLabel}.`
      : ''
  return (
    `${describeDirection(top)} drove the move; ` +
    `${describeDirection(second)} also ${helpedHurt(second)}.` +
    tail
  )
}

export function composeBridgeHeadline(input: HeadlineInputs): BridgeHeadline {
  const { bridge, current, prior, series, drivers, periodKind } = input
  const isNetSales = bridge === 'net_sales'
  const total = isNetSales ? current.net_revenue : current.contribution_margin
  const denominator = isNetSales ? current.gross_revenue : current.net_revenue
  const rate = denominator !== 0 ? (total / denominator) * 100 : 0

  const sparkline = totalSeries(series, bridge)
  const { badge, horizon } = computeBadge(sparkline, total)

  const totalShortLabel = isNetSales ? 'NR' : 'CM'
  const primaryLabel = isNetSales ? 'Net revenue' : 'Contribution margin'
  const rateDenominator: 'gross' | 'NR' = isNetSales ? 'gross' : 'NR'

  let delta: number | null = null
  let deltaLabel: string | null = null
  let deltaPctLabel: string | null = null
  let priorMonthLabel: string | null = null
  let periodPhraseLabel: string | null = null

  if (prior && periodKind !== 'snapshot') {
    const priorTotal = isNetSales ? prior.net_revenue : prior.contribution_margin
    delta = total - priorTotal
    const suffix = periodSuffix(periodKind)
    deltaLabel = `${fmtSignedAmount(delta)}${suffix ? ` ${suffix}` : ''}`
    if (priorTotal !== 0) {
      const pct = (delta / Math.abs(priorTotal)) * 100
      const sign = pct >= 0 ? '+' : '-'
      deltaPctLabel = `${sign}${Math.abs(pct).toFixed(pct === Math.round(pct) ? 0 : 1)}%`
    }
    priorMonthLabel = fmtMonth(prior.month)
    periodPhraseLabel = periodPhrase(periodKind)
  }

  const primary: HeadlinePrimary = {
    label: primaryLabel,
    total,
    totalLabel: fmtAmount(total),
    delta,
    deltaLabel,
    deltaPctLabel,
    rate,
    rateLabel: `${rate.toFixed(1)}% of ${rateDenominator}`,
    rateDenominator,
    sparkline,
    sparklineHorizon: horizon,
    monthLabel: fmtMonth(current.month),
    priorMonthLabel,
    periodPhrase: periodPhraseLabel,
  }

  const badgeText = badgeLabel(badge, horizon, totalShortLabel)

  if (!prior || periodKind === 'snapshot') {
    return {
      primary,
      badge,
      badgeLabel: badgeText,
      insight: null,
      action: null,
    }
  }

  const interesting = pickInterestingDrivers(drivers, total)
  const dollarThreshold = Math.abs(total) * DOLLAR_THRESHOLD_PCT
  const noiseCeilingLabel = fmtAmount(dollarThreshold)
  const sentence = composeInsightSentence(interesting, noiseCeilingLabel)
  const prefix = badgePrefix(badge, horizon, totalShortLabel)
  const insight = prefix ? `${prefix} ${sentence}` : sentence

  const action =
    interesting.length > 0 ? ACTION_MAP[interesting[0].kind] : null

  return {
    primary,
    badge,
    badgeLabel: badgeText,
    insight,
    action,
  }
}
