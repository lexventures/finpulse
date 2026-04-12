export function calcSimplifiedLtv(
  revenue: number,
  newCustomers: number,
  grossMarginPct: number
): number | null {
  if (newCustomers === 0) return null
  return (revenue / newCustomers) * (grossMarginPct / 100)
}

export function calcFrequencyLtv(
  aov: number,
  purchaseFrequency: number,
  grossMarginPct: number,
): number | null {
  if (aov <= 0 || purchaseFrequency <= 0) return null
  return aov * purchaseFrequency * (grossMarginPct / 100)
}

export function calcLtvCacRatio(
  ltv: number | null,
  cac: number | null
): number | null {
  if (ltv === null || cac === null || cac === 0) return null
  return ltv / cac
}

export function calcPaybackPeriod(
  cac: number | null,
  avgDailyRevenuePerCustomer: number,
  grossMarginPct: number
): number | null {
  if (cac === null) return null
  const dailyMargin = avgDailyRevenuePerCustomer * (grossMarginPct / 100)
  if (dailyMargin === 0) return null
  return cac / dailyMargin
}
