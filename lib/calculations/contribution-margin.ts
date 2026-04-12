export interface ContributionMarginInput {
  netRevenue: number
  cogs: number
  totalFees: number
  allocatedAdSpend: number
  allocatedEmailMarketing: number
}

export interface ContributionMarginResult {
  margin: number
  pct: number | null
}

export function calcContributionMargin(
  data: ContributionMarginInput
): ContributionMarginResult {
  const margin =
    data.netRevenue +
    data.cogs +
    data.totalFees +
    data.allocatedAdSpend +
    data.allocatedEmailMarketing

  const pct = data.netRevenue === 0 ? null : (margin / data.netRevenue) * 100

  return { margin, pct }
}
