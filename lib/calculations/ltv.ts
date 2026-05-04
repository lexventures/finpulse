import { calcBlendedCac } from '@/lib/calculations/cac'

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

export interface MonthlyLtvCacInput {
  month: string
  channel: string
  allocated_ad_spend: number | null
  new_customer_orders: number | null
  gross_margin_pct: number | null
  shopify_ltv_to_date: number | null
  shopify_gross_margin_ltv_to_date: number | null
  is_partial: boolean | null
}

export interface MonthlyLtvCacPoint {
  month: string
  adSpend: number
  newCustomers: number
  cac: number | null
  shopifyLtvToDate: number | null
  shopifyGrossMarginLtvToDate: number | null
}

export function buildMonthlyDtcLtvCacTrend(
  rows: MonthlyLtvCacInput[],
  monthLimit = 12,
): MonthlyLtvCacPoint[] {
  return rows
    .filter((row) => row.channel === 'dtc' && !row.is_partial)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, monthLimit)
    .reverse()
    .map((row) => {
      const adSpend = Math.abs(Number(row.allocated_ad_spend) || 0)
      const newCustomers = Math.max(0, Number(row.new_customer_orders) || 0)
      const shopifyLtv = row.shopify_ltv_to_date == null
        ? null
        : Math.max(0, Number(row.shopify_ltv_to_date) || 0)
      const storedGrossMarginLtv = row.shopify_gross_margin_ltv_to_date == null
        ? null
        : Math.max(0, Number(row.shopify_gross_margin_ltv_to_date) || 0)
      const grossMarginPct = Number(row.gross_margin_pct) || 0
      const computedGrossMarginLtv =
        shopifyLtv == null || grossMarginPct <= 0
          ? null
          : Math.round(shopifyLtv * (grossMarginPct / 100) * 100) / 100

      return {
        month: row.month,
        adSpend,
        newCustomers,
        cac: calcBlendedCac(adSpend, newCustomers),
        shopifyLtvToDate: shopifyLtv,
        shopifyGrossMarginLtvToDate: storedGrossMarginLtv ?? computedGrossMarginLtv,
      }
    })
}
