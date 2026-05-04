export interface PnlRow {
  month: string
  channel: string
  gross_revenue: number
  net_revenue: number
  returns: number
  discounts: number
  shipping_income: number
  cogs: number
  processing_fees: number
  selling_fees: number
  allocated_ad_spend: number
  allocated_email_marketing: number
  contribution_margin: number
  is_partial: boolean
}

export type BridgeKind = 'net_sales' | 'contribution'

export type PeriodKind = 'mom' | 'yoy' | 'snapshot'

export interface BridgeStep {
  name: string
  value: number
  isTotal?: boolean
}

export interface VarianceWalk {
  steps: BridgeStep[]
  yDomain: [number, number]
  current: PnlRow
  prior: PnlRow
}

export type DriverKind =
  | 'gross'
  | 'returns'
  | 'discounts'
  | 'shipping'
  | 'nr'
  | 'cogs'
  | 'processing'
  | 'selling'
  | 'ads'
  | 'email'

export interface VarianceDriver {
  name: string
  kind: DriverKind
  delta: number
  rateNow: number | null
  rateTrailing3Avg: number | null
  ratePoints: number | null
  isNegativeImpact: boolean
}

export type PriorPeriodResult =
  | { row: PnlRow; missingReason?: undefined }
  | { row: null; missingReason: 'missing' | 'partial' }

export function shiftMonth(monthString: string, offset: number): string {
  const [yStr, mStr] = monthString.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  const date = new Date(Date.UTC(y, m - 1 + offset, 1))
  const ny = date.getUTCFullYear()
  const nm = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${ny}-${nm}-01`
}

export function lookupPriorPeriod(
  rows: PnlRow[],
  currentMonth: string,
  period: 'mom' | 'yoy',
): PriorPeriodResult {
  const offset = period === 'mom' ? -1 : -12
  const target = shiftMonth(currentMonth, offset)
  const row = rows.find((r) => r.month === target)
  if (!row) return { row: null, missingReason: 'missing' }
  if (row.is_partial) return { row: null, missingReason: 'partial' }
  return { row }
}

export function computeWalkDomain(steps: BridgeStep[]): [number, number] {
  if (steps.length === 0) return [0, 0]
  let running = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const s of steps) {
    if (s.isTotal) {
      running = s.value
      if (running < min) min = running
      if (running > max) max = running
    } else {
      const before = running
      running = before + s.value
      if (before < min) min = before
      if (running < min) min = running
      if (before > max) max = before
      if (running > max) max = running
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 0]
  const span = max - min
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.1, 1) : span * 0.1
  return [Math.floor(min - pad), Math.ceil(max + pad)]
}

interface VarianceSpec {
  kind: DriverKind
  label: string
  current: number
  prior: number
}

function buildWalk(
  priorAnchorLabel: string,
  priorAnchorValue: number,
  currentAnchorLabel: string,
  currentAnchorValue: number,
  specs: VarianceSpec[],
  bridge: BridgeKind,
): { steps: BridgeStep[]; drivers: VarianceDriver[]; yDomain: [number, number] } {
  const steps: BridgeStep[] = [
    { name: priorAnchorLabel, value: priorAnchorValue, isTotal: true },
  ]
  const drivers: VarianceDriver[] = []
  for (const spec of specs) {
    const delta = spec.current - spec.prior
    steps.push({ name: spec.label, value: delta })
    drivers.push({
      name: spec.label,
      kind: spec.kind,
      delta,
      rateNow: null,
      rateTrailing3Avg: null,
      ratePoints: null,
      isNegativeImpact: delta < 0,
    })
  }
  steps.push({ name: currentAnchorLabel, value: currentAnchorValue, isTotal: true })
  const yDomain = computeWalkDomain(steps)
  // The bridge param is currently unused inside buildWalk but kept on the
  // signature so callers don't need to repeat the bridge kind elsewhere.
  void bridge
  return { steps, drivers, yDomain }
}

export function buildNetSalesVariance(current: PnlRow, prior: PnlRow): VarianceWalk & {
  drivers: VarianceDriver[]
} {
  const { steps, drivers, yDomain } = buildWalk(
    'Prior NR',
    prior.net_revenue,
    'Current NR',
    current.net_revenue,
    [
      { kind: 'gross', label: 'Δ Gross revenue', current: current.gross_revenue, prior: prior.gross_revenue },
      { kind: 'returns', label: 'Δ Returns', current: current.returns, prior: prior.returns },
      { kind: 'discounts', label: 'Δ Discounts', current: current.discounts, prior: prior.discounts },
      { kind: 'shipping', label: 'Δ Shipping income', current: current.shipping_income, prior: prior.shipping_income },
    ],
    'net_sales',
  )
  return { steps, drivers, yDomain, current, prior }
}

export function buildContributionVariance(current: PnlRow, prior: PnlRow): VarianceWalk & {
  drivers: VarianceDriver[]
} {
  const { steps, drivers, yDomain } = buildWalk(
    'Prior CM',
    prior.contribution_margin,
    'Current CM',
    current.contribution_margin,
    [
      { kind: 'nr', label: 'Δ Net revenue', current: current.net_revenue, prior: prior.net_revenue },
      { kind: 'cogs', label: 'Δ COGS', current: current.cogs, prior: prior.cogs },
      { kind: 'processing', label: 'Δ Processing fees', current: current.processing_fees, prior: prior.processing_fees },
      { kind: 'selling', label: 'Δ Selling fees', current: current.selling_fees, prior: prior.selling_fees },
      { kind: 'ads', label: 'Δ Paid ads', current: current.allocated_ad_spend, prior: prior.allocated_ad_spend },
      { kind: 'email', label: 'Δ Email marketing', current: current.allocated_email_marketing, prior: prior.allocated_email_marketing },
    ],
    'contribution',
  )
  return { steps, drivers, yDomain, current, prior }
}

export function buildNetSalesSnapshot(current: PnlRow): BridgeStep[] {
  return [
    { name: 'Gross revenue', value: current.gross_revenue },
    { name: 'Returns', value: current.returns },
    { name: 'Discounts', value: current.discounts },
    { name: 'Shipping income', value: current.shipping_income },
    { name: 'Net revenue', value: current.net_revenue, isTotal: true },
  ]
}

export function buildContributionSnapshot(current: PnlRow): BridgeStep[] {
  return [
    { name: 'Net revenue', value: current.net_revenue },
    { name: 'COGS', value: current.cogs },
    { name: 'Processing fees', value: current.processing_fees },
    { name: 'Selling fees', value: current.selling_fees },
    { name: 'Paid ads', value: current.allocated_ad_spend },
    { name: 'Email marketing', value: current.allocated_email_marketing },
    { name: 'Contribution margin', value: current.contribution_margin, isTotal: true },
  ]
}

export interface NetSalesRates {
  month: string
  returns_rate: number
  discounts_rate: number
  shipping_rate: number
  net_layer: number
  net_revenue_rate: number
}

export function computeNetSalesRates(row: PnlRow): NetSalesRates | null {
  if (row.gross_revenue === 0) return null
  const returns_rate = (Math.abs(row.returns) / row.gross_revenue) * 100
  const discounts_rate = (Math.abs(row.discounts) / row.gross_revenue) * 100
  const shipping_rate = (row.shipping_income / row.gross_revenue) * 100
  const net_layer = 100 - returns_rate - discounts_rate
  const net_revenue_rate = (row.net_revenue / row.gross_revenue) * 100
  return {
    month: row.month,
    returns_rate,
    discounts_rate,
    shipping_rate,
    net_layer,
    net_revenue_rate,
  }
}

export interface ContributionRates {
  month: string
  cogs_rate: number
  fees_rate: number
  processing_rate: number
  selling_rate: number
  ad_spend_rate: number
  email_rate: number
  contribution_margin_rate: number
}

export function computeContributionRates(row: PnlRow): ContributionRates | null {
  if (row.net_revenue === 0) return null
  const processing_rate = (Math.abs(row.processing_fees) / row.net_revenue) * 100
  const selling_rate = (Math.abs(row.selling_fees) / row.net_revenue) * 100
  const fees_rate = processing_rate + selling_rate
  const cogs_rate = (Math.abs(row.cogs) / row.net_revenue) * 100
  const ad_spend_rate = (Math.abs(row.allocated_ad_spend) / row.net_revenue) * 100
  const email_rate = (Math.abs(row.allocated_email_marketing) / row.net_revenue) * 100
  const contribution_margin_rate = (row.contribution_margin / row.net_revenue) * 100
  return {
    month: row.month,
    cogs_rate,
    fees_rate,
    processing_rate,
    selling_rate,
    ad_spend_rate,
    email_rate,
    contribution_margin_rate,
  }
}

function netSalesRateMap(row: PnlRow): Partial<Record<DriverKind, number>> {
  const r = computeNetSalesRates(row)
  if (!r) return {}
  return {
    gross: 100,
    returns: r.returns_rate,
    discounts: r.discounts_rate,
    shipping: r.shipping_rate,
  }
}

function contributionRateMap(row: PnlRow): Partial<Record<DriverKind, number>> {
  const r = computeContributionRates(row)
  if (!r) return {}
  return {
    nr: 100,
    cogs: r.cogs_rate,
    processing: r.processing_rate,
    selling: r.selling_rate,
    ads: r.ad_spend_rate,
    email: r.email_rate,
  }
}

function trailingRateAvg(
  history: PnlRow[],
  currentMonth: string,
  bridge: BridgeKind,
): Partial<Record<DriverKind, number>> {
  const collected: PnlRow[] = []
  for (let i = 1; i <= 12 && collected.length < 3; i += 1) {
    const target = shiftMonth(currentMonth, -i)
    const r = history.find((row) => row.month === target)
    if (r && !r.is_partial) collected.push(r)
  }
  if (collected.length === 0) return {}
  const buckets: Partial<Record<DriverKind, number[]>> = {}
  for (const row of collected) {
    const map = bridge === 'net_sales' ? netSalesRateMap(row) : contributionRateMap(row)
    for (const key of Object.keys(map) as DriverKind[]) {
      const v = map[key]
      if (v == null) continue
      const arr = buckets[key] ?? []
      arr.push(v)
      buckets[key] = arr
    }
  }
  const out: Partial<Record<DriverKind, number>> = {}
  for (const key of Object.keys(buckets) as DriverKind[]) {
    const arr = buckets[key]!
    out[key] = arr.reduce((a, b) => a + b, 0) / arr.length
  }
  return out
}

export function topVarianceDrivers(
  walk: VarianceWalk & { drivers: VarianceDriver[] },
  history: PnlRow[],
  bridge: BridgeKind,
  topN: number = 2,
): VarianceDriver[] {
  const ratesNow = bridge === 'net_sales'
    ? netSalesRateMap(walk.current)
    : contributionRateMap(walk.current)
  const ratesAvg = trailingRateAvg(history, walk.current.month, bridge)

  const enriched = walk.drivers.map((d) => {
    const rateNow = ratesNow[d.kind] ?? null
    const rateTrailing3Avg = ratesAvg[d.kind] ?? null
    const ratePoints =
      rateNow != null && rateTrailing3Avg != null ? rateNow - rateTrailing3Avg : null
    return { ...d, rateNow, rateTrailing3Avg, ratePoints }
  })

  return [...enriched]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, topN)
}
