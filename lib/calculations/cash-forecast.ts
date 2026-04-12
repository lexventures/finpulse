const WEEKS_PER_MONTH = 4.33

export interface CashForecastParams {
  startingCash: number
  monthlyInflowsByChannel: Record<string, number>
  monthlyOutflowsByCategory: Record<string, number>
  growthRate: number
  seasonalityIndex: Record<number, number>
  incomingInventoryValue: number
  currentMonth: number
}

export interface WeekProjection {
  week_number: number
  starting_balance: number
  inflows: number
  outflows: number
  ending_balance: number
  cumulative_growth_factor: number
  seasonality_multiplier: number
}

export function projectCashForecast(
  params: CashForecastParams
): WeekProjection[] {
  const {
    startingCash,
    monthlyInflowsByChannel,
    monthlyOutflowsByCategory,
    growthRate,
    seasonalityIndex,
    incomingInventoryValue,
    currentMonth,
  } = params

  if (
    !Number.isFinite(startingCash) ||
    !Number.isFinite(growthRate) ||
    !Number.isFinite(incomingInventoryValue) ||
    !Number.isInteger(currentMonth) ||
    currentMonth < 1 ||
    currentMonth > 12
  ) {
    return []
  }

  if (
    Object.values(seasonalityIndex).some(
      (v) => typeof v !== 'number' || !Number.isFinite(v)
    )
  ) {
    return []
  }

  const totalMonthlyInflows = Object.values(monthlyInflowsByChannel).reduce(
    (sum, v) => sum + v,
    0
  )
  const totalMonthlyOutflows = Object.values(monthlyOutflowsByCategory).reduce(
    (sum, v) => sum + v,
    0
  )

  if (
    !Number.isFinite(totalMonthlyInflows) ||
    !Number.isFinite(totalMonthlyOutflows) ||
    Object.values(monthlyInflowsByChannel).some(
      (v) => typeof v !== 'number' || !Number.isFinite(v)
    ) ||
    Object.values(monthlyOutflowsByCategory).some(
      (v) => typeof v !== 'number' || !Number.isFinite(v)
    )
  ) {
    return []
  }

  const weeklyBaseInflow = totalMonthlyInflows / WEEKS_PER_MONTH
  const weeklyBaseOutflow = totalMonthlyOutflows / WEEKS_PER_MONTH

  const weeklyInventoryOutflow =
    incomingInventoryValue > 0 ? incomingInventoryValue / 13 : 0

  const projections: WeekProjection[] = []
  let balance = startingCash

  for (let week = 1; week <= 13; week++) {
    const monthOffset = Math.floor((week - 1) / WEEKS_PER_MONTH)
    const projectedMonth = ((currentMonth - 1 + monthOffset) % 12) + 1

    const seasonMultiplier = seasonalityIndex[projectedMonth] ?? 1.0

    const weeklyGrowthRate = Math.pow(1 + growthRate, 1 / WEEKS_PER_MONTH) - 1
    const cumulativeGrowth = Math.pow(1 + weeklyGrowthRate, week)

    const inflows = weeklyBaseInflow * cumulativeGrowth * seasonMultiplier
    const outflows =
      weeklyBaseOutflow * cumulativeGrowth + weeklyInventoryOutflow

    const endingBalance = balance + inflows - outflows

    projections.push({
      week_number: week,
      starting_balance: balance,
      inflows,
      outflows,
      ending_balance: endingBalance,
      cumulative_growth_factor: cumulativeGrowth,
      seasonality_multiplier: seasonMultiplier,
    })

    balance = endingBalance
  }

  return projections
}
