export interface RunRateInput {
  trailingMonths: Array<{ month: string; net_revenue: number }>
  currentMonth: number
  seasonalityIndex?: Record<number, number>
}

export interface RunRateResult {
  annualized: number
  growthRate: number
  seasonalityApplied: boolean
}

export function calcRunRate(params: RunRateInput): RunRateResult | null {
  const { trailingMonths, currentMonth, seasonalityIndex } = params

  if (trailingMonths.length < 3) return null

  const sorted = [...trailingMonths].sort(
    (a, b) => a.month.localeCompare(b.month)
  )
  const last3 = sorted.slice(-3)
  const avg3 = last3.reduce((s, m) => s + m.net_revenue, 0) / 3

  const momRates: number[] = []
  for (let i = 1; i < last3.length; i++) {
    const prev = last3[i - 1].net_revenue
    if (prev > 0) {
      momRates.push(last3[i].net_revenue / prev - 1)
    }
  }
  const avgMomRate =
    momRates.length > 0
      ? momRates.reduce((s, r) => s + r, 0) / momRates.length
      : 0

  const hasSeason =
    seasonalityIndex !== undefined &&
    Object.values(seasonalityIndex).some((v) => v !== 1.0)

  const remainingMonths = 12 - currentMonth
  let annualized: number

  if (hasSeason && seasonalityIndex) {
    let total = 0
    for (let m = 1; m <= 12; m++) {
      const monthsAhead = m <= currentMonth ? 0 : m - currentMonth
      const growth = Math.pow(1 + avgMomRate, monthsAhead)
      const seasonal = seasonalityIndex[m] ?? 1.0
      total += avg3 * growth * seasonal
    }
    annualized = total
  } else {
    let total = avg3 * currentMonth
    for (let i = 1; i <= remainingMonths; i++) {
      total += avg3 * Math.pow(1 + avgMomRate, i)
    }
    annualized = total
  }

  return {
    annualized,
    growthRate: avgMomRate * 100,
    seasonalityApplied: hasSeason,
  }
}
