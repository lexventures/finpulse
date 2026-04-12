import { createServiceClient } from '@/lib/supabase/server'
import { calcBlendedCac } from '@/lib/calculations/cac'
import { calcSimplifiedLtv, calcLtvCacRatio } from '@/lib/calculations/ltv'
import { projectCashForecast } from '@/lib/calculations/cash-forecast'

export interface FactsPacket {
  period: string
  revenue_mtd: number
  revenue_yoy_pct: number | null
  run_rate_annualized: number | null
  revenue_by_channel: Array<{ channel: string; mtd: number; yoy_pct: number | null }>
  gross_margin_pct: number | null
  gross_margin_3mo_avg: number | null
  blended_cac: number | null
  ltv_cac_ratio: number | null
  email_pct_of_dtc: number | null
  cash_balance: number | null
  cash_days: number | null
  cash_forecast_min_amount: number | null
  cash_forecast_min_week: number | null
  incoming_inventory_committed: number | null
  active_red_alerts: Array<{ metric: string; value: string }>
  active_yellow_alerts: Array<{ metric: string; value: string }>
  wholesale_pct_of_total: number | null
}

function currentMonthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function priorYearMonthStart(): string {
  const now = new Date()
  return `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function lastNMonthsStart(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function buildFactsPacket(): Promise<FactsPacket> {
  const supabase = createServiceClient()
  const monthStart = currentMonthStart()
  const pyMonthStart = priorYearMonthStart()
  const threeMonthsAgo = lastNMonthsStart(3)
  const now = new Date()
  const period = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const [
    pnlCurrentResult,
    pnlPriorYearResult,
    pnlTrailingResult,
    dailyMtdResult,
    balanceSheetResult,
    cashFlowResult,
    shopifyDailyResult,
    alertsResult,
    wholesaleDailyResult,
  ] = await Promise.all([
    supabase
      .from('fin_pnl_monthly')
      .select('*')
      .gte('month', monthStart)
      .order('month', { ascending: false }),
    supabase
      .from('fin_pnl_monthly')
      .select('*')
      .gte('month', pyMonthStart)
      .lt('month', `${now.getFullYear() - 1}-${String(now.getMonth() + 2).padStart(2, '0')}-01`),
    supabase
      .from('fin_pnl_monthly')
      .select('*')
      .gte('month', threeMonthsAgo)
      .lt('month', monthStart)
      .eq('channel', 'company')
      .order('month', { ascending: true }),
    supabase
      .from('fin_revenue_daily')
      .select('*')
      .gte('date', monthStart)
      .eq('channel', 'dtc'),
    supabase
      .from('fin_balance_sheet_monthly')
      .select('*')
      .order('month', { ascending: false })
      .limit(1),
    supabase
      .from('fin_cashflow_monthly')
      .select('*')
      .order('month', { ascending: false })
      .limit(1),
    supabase
      .from('fin_shopify_daily')
      .select('*')
      .order('date', { ascending: false })
      .limit(1),
    supabase
      .from('fin_alerts')
      .select('*')
      .eq('acknowledged', false)
      .order('triggered_at', { ascending: false }),
    supabase
      .from('fin_wholesale_daily')
      .select('*')
      .gte('date', monthStart),
  ])

  const pnlCurrent = pnlCurrentResult.data ?? []
  const pnlPriorYear = pnlPriorYearResult.data ?? []
  const pnlTrailing = pnlTrailingResult.data ?? []
  const dailyMtd = dailyMtdResult.data ?? []
  const latestBalance = balanceSheetResult.data?.[0] ?? null
  const latestCashFlow = cashFlowResult.data?.[0] ?? null
  const latestShopify = shopifyDailyResult.data?.[0] ?? null
  const activeAlerts = alertsResult.data ?? []
  const wholesaleMtd = wholesaleDailyResult.data ?? []

  // Revenue MTD from current month PnL company row
  const companyRow = pnlCurrent.find((r) => r.channel === 'company')
  const revenueMtd = Number(companyRow?.net_revenue) || 0

  // Revenue by channel from current month PnL
  const channelRows = pnlCurrent.filter((r) => r.channel !== 'company')
  const revenueByChannel = channelRows.map((r) => {
    const pyRow = pnlPriorYear.find((py) => py.channel === r.channel)
    const mtd = Number(r.net_revenue) || 0
    const pyRev = pyRow ? Number(pyRow.net_revenue) || 0 : null
    const yoyPct = pyRev && pyRev > 0 ? ((mtd - pyRev) / pyRev) * 100 : null
    return { channel: r.channel as string, mtd, yoy_pct: yoyPct }
  })

  // YoY revenue
  const pyCompanyRev =
    Number(pnlPriorYear.find((r) => r.channel === 'company')?.net_revenue) || 0
  const revenueYoyPct =
    pyCompanyRev > 0 ? ((revenueMtd - pyCompanyRev) / pyCompanyRev) * 100 : null

  // Run rate (simplified: latest 3 months average * 12)
  const trailingRevenues = pnlTrailing.map((r) => Number(r.net_revenue) || 0)
  const runRateAnnualized =
    trailingRevenues.length >= 3
      ? (trailingRevenues.reduce((s, v) => s + v, 0) / trailingRevenues.length) * 12
      : null

  // Gross margin
  const grossMarginPct = companyRow
    ? Number(companyRow.gross_margin_pct) || null
    : null
  const trailingMargins = pnlTrailing.map((r) => Number(r.gross_margin_pct) || 0)
  const grossMargin3moAvg =
    trailingMargins.length >= 3
      ? trailingMargins.reduce((s, v) => s + v, 0) / trailingMargins.length
      : null

  // CAC and LTV
  const totalAdSpend = dailyMtd.reduce(() => 0, 0) + (Number(companyRow?.allocated_ad_spend) || 0)
  const totalNewCustomers = dailyMtd.reduce(
    (sum, d) => sum + (Number(d.new_customer_orders) || 0),
    0,
  )
  const blendedCac = calcBlendedCac(Math.abs(totalAdSpend), totalNewCustomers)
  const ltv = calcSimplifiedLtv(
    revenueMtd,
    totalNewCustomers,
    grossMarginPct ?? 50,
  )
  const ltvCacRatio = calcLtvCacRatio(ltv, blendedCac)

  // Email % of DTC - approximate from analytics
  const emailPctOfDtc: number | null = null

  // Cash
  const cashBalance = latestBalance
    ? Number(latestBalance.cash_and_equivalents) || null
    : null

  const monthlyOutflows = latestCashFlow
    ? Math.abs(Number(latestCashFlow.net_cash_flow) || 0) +
      (Number(latestCashFlow.cash_from_operations) || 0)
    : null
  const dailyBurn = monthlyOutflows ? monthlyOutflows / 30 : null
  const cashDays =
    cashBalance !== null && dailyBurn && dailyBurn > 0
      ? cashBalance / dailyBurn
      : null

  // Cash forecast min
  let cashForecastMinAmount: number | null = null
  let cashForecastMinWeek: number | null = null

  if (cashBalance !== null && latestCashFlow) {
    const projections = projectCashForecast({
      startingCash: cashBalance,
      monthlyInflowsByChannel: { dtc: revenueMtd },
      monthlyOutflowsByCategory: {
        operating: Math.abs(Number(latestCashFlow.cash_from_operations) || 0),
      },
      growthRate: 0,
      seasonalityIndex: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [i + 1, 1.0]),
      ),
      incomingInventoryValue: 0,
      currentMonth: now.getMonth() + 1,
    })
    if (projections.length > 0) {
      let minBal = Infinity
      for (const p of projections) {
        if (p.ending_balance < minBal) {
          minBal = p.ending_balance
          cashForecastMinAmount = p.ending_balance
          cashForecastMinWeek = p.week_number
        }
      }
    }
  }

  // Incoming inventory
  const incomingInventoryCommitted = latestShopify
    ? Number(latestShopify.incoming_inventory_value) || null
    : null

  // Alerts
  const activeRedAlerts = activeAlerts
    .filter((a) => a.severity === 'red')
    .map((a) => ({ metric: a.metric_label as string, value: String(a.current_value) }))
  const activeYellowAlerts = activeAlerts
    .filter((a) => a.severity === 'yellow')
    .map((a) => ({ metric: a.metric_label as string, value: String(a.current_value) }))

  // Wholesale % of total
  const wholesaleRev = wholesaleMtd.reduce(
    (sum, d) => sum + (Number(d.net_revenue) || 0),
    0,
  )
  const wholesalePctOfTotal =
    revenueMtd > 0 ? (wholesaleRev / revenueMtd) * 100 : null

  return {
    period,
    revenue_mtd: revenueMtd,
    revenue_yoy_pct: revenueYoyPct,
    run_rate_annualized: runRateAnnualized,
    revenue_by_channel: revenueByChannel,
    gross_margin_pct: grossMarginPct,
    gross_margin_3mo_avg: grossMargin3moAvg,
    blended_cac: blendedCac,
    ltv_cac_ratio: ltvCacRatio,
    email_pct_of_dtc: emailPctOfDtc,
    cash_balance: cashBalance,
    cash_days: cashDays,
    cash_forecast_min_amount: cashForecastMinAmount,
    cash_forecast_min_week: cashForecastMinWeek,
    incoming_inventory_committed: incomingInventoryCommitted,
    active_red_alerts: activeRedAlerts,
    active_yellow_alerts: activeYellowAlerts,
    wholesale_pct_of_total: wholesalePctOfTotal,
  }
}
