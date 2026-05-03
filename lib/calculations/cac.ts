export function calcBlendedCac(
  adSpend: number,
  newCustomers: number
): number | null {
  if (newCustomers <= 0) return null
  return adSpend / newCustomers
}

export interface MonthlyCacInput {
  month: string
  channel: string
  allocated_ad_spend: number | null
  new_customer_orders: number | null
  is_partial: boolean | null
}

export interface MonthlyCacPoint {
  month: string
  adSpend: number
  newCustomers: number
  cac: number | null
}

export function buildMonthlyDtcCacTrend(
  rows: MonthlyCacInput[],
  monthLimit = 18
): MonthlyCacPoint[] {
  return rows
    .filter((row) => row.channel === 'dtc' && !row.is_partial)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, monthLimit)
    .reverse()
    .map((row) => {
      const adSpend = Math.abs(Number(row.allocated_ad_spend) || 0)
      const newCustomers = Math.max(0, Number(row.new_customer_orders) || 0)

      return {
        month: row.month,
        adSpend,
        newCustomers,
        cac: calcBlendedCac(adSpend, newCustomers),
      }
    })
}
