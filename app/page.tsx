export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { MetricCard } from '@/components/cards/metric-card'
import { FinAreaChart } from '@/components/charts/area-chart'
import { CashBurndownChart } from '@/components/charts/cash-burndown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatCompact,
  formatPercent,
  formatCurrency,
  formatCount,
} from '@/lib/utils/format'
import { calcBlendedCac } from '@/lib/calculations/cac'
import { calcSimplifiedLtv, calcLtvCacRatio } from '@/lib/calculations/ltv'
import { AlertFeedWrapper } from './alert-feed-wrapper'
import { BriefingCard } from './briefing-card'

const CHANNEL_LABELS: Record<string, string> = {
  dtc: 'DTC',
  wholesale: 'Wholesale',
  wholesale_faire: 'Faire',
  wholesale_direct: 'Direct',
  wholesale_key: 'Key Accounts',
  retail: 'Retail',
  marketplace: 'Marketplace',
}

const CHANNEL_COLORS: Record<string, string> = {
  dtc: 'hsl(var(--chart-1))',
  wholesale: 'hsl(var(--chart-2))',
  wholesale_faire: 'hsl(var(--chart-2))',
  wholesale_direct: 'hsl(var(--chart-3))',
  wholesale_key: 'hsl(var(--chart-4))',
  retail: 'hsl(var(--chart-5))',
  marketplace: 'hsl(210 70% 55%)',
}

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export default async function CEOOverviewPage() {
  const supabase = createServiceClient()

  const [
    pnlResult,
    forecastResult,
    alertsResult,
    alertHistoryResult,
    balanceResult,
    syncResult,
    channelPnlResult,
    shopifyResult,
    revenueDailyResult,
    briefingResult,
    wholesaleDailyResult,
    cashflowResult,
  ] = await Promise.all([
    supabase
      .from('fin_kpi_monthly')
      .select('month, net_revenue, total_opex, gross_margin_pct, allocated_ad_spend, is_partial')
      .eq('channel', 'company')
      .order('month', { ascending: false })
      .limit(24),
    supabase
      .from('fin_cash_forecast')
      .select('*')
      .order('forecast_run_date', { ascending: false })
      .limit(13),
    supabase
      .from('fin_alerts')
      .select('*')
      .eq('acknowledged', false)
      .order('triggered_at', { ascending: false })
      .limit(10),
    supabase
      .from('fin_alerts')
      .select('severity, triggered_at')
      .gte('triggered_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('triggered_at', { ascending: true }),
    supabase
      .from('fin_balance_sheet_monthly')
      .select('*')
      .order('month', { ascending: false })
      .limit(1),
    supabase
      .from('fin_sync_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1),
    supabase
      .from('fin_kpi_monthly')
      .select(
        'month, channel, net_revenue, allocated_ad_spend, gross_margin_pct, cogs, contribution_margin, is_partial',
      )
      .neq('channel', 'company')
      .order('month', { ascending: false }),
    supabase
      .from('fin_shopify_daily')
      .select('*')
      .order('date', { ascending: false })
      .limit(1),
    supabase
      .from('fin_revenue_daily')
      .select('date, order_count, new_customer_orders')
      .eq('channel', 'dtc')
      .gte('date', `${new Date().getFullYear() - 2}-01-01`),
    supabase
      .from('fin_settings')
      .select('value')
      .eq('key', 'daily_briefing')
      .single(),
    supabase
      .from('fin_wholesale_daily')
      .select('date, segment, order_count')
      .gte('date', `${new Date().getFullYear() - 1}-01-01`),
    supabase
      .from('fin_cashflow_monthly')
      .select('ending_cash, net_cash_flow')
      .order('month', { ascending: false })
      .limit(3),
  ])

  const pnl = pnlResult.data ?? []
  const pnlSpark6 = pnl.slice(0, 6).reverse()
  const sparklineRunRate = pnlSpark6.map((m) => {
    const rev = Number(m.net_revenue) || 0
    return rev * 12
  })
  const sparklineRevenueMtd = pnlSpark6.map((m) => Number(m.net_revenue) || 0)
  const sparklineGrossMargin = pnlSpark6.map((m) => Number(m.gross_margin_pct) || 0)
  const forecasts = forecastResult.data ?? []
  const alerts = alertsResult.data ?? []
  const alertHistory = alertHistoryResult.data ?? []
  const balance = balanceResult.data?.[0]
  const lastSync = syncResult.data?.[0]
  const channelPnl = channelPnlResult.data ?? []
  const shopifyDaily = shopifyResult.data?.[0]
  const revenueDaily = revenueDailyResult.data ?? []
  const briefingRaw = briefingResult.data?.value as
    | { text?: string; generated_at?: string; valid?: boolean }
    | null
  const wholesaleDaily = wholesaleDailyResult.data ?? []
  const cashflowRows = cashflowResult.data ?? []
  const cashflowLatest = cashflowRows[0]

  const latest = pnl[0]
  const priorYear = pnl.length >= 13 ? pnl[12] : null
  const latestMonth = latest?.month

  const latestRevenue = latest ? Number(latest.net_revenue) || 0 : null
  const priorRevenue = priorYear ? Number(priorYear.net_revenue) || 0 : null

  const today = new Date()
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

  const proratedLatestRevenue =
    latestRevenue !== null && latest?.is_partial && dayOfMonth > 0
      ? (latestRevenue / dayOfMonth) * daysInMonth
      : latestRevenue

  const completedMonths = pnl.filter((m) => !m.is_partial)
  const trailing12 = completedMonths.slice(0, 12)
  const trailing12Sum = trailing12.reduce((s, m) => s + (Number(m.net_revenue) || 0), 0)
  const trailing12Count = trailing12.length

  const pyMonths = completedMonths.slice(12, 24)
  const pyTotalRevenue = pyMonths.reduce((s, m) => s + (Number(m.net_revenue) || 0), 0)
  const seasonalIndices = new Map<number, number>()
  if (pyMonths.length >= 12 && pyTotalRevenue > 0) {
    for (const m of pyMonths) {
      const mo = new Date(String(m.month) + 'T00:00:00').getMonth()
      seasonalIndices.set(mo, (Number(m.net_revenue) || 0) / pyTotalRevenue)
    }
  }

  let runRate: number | null = null
  let runRateMethod = ''
  if (trailing12Count >= 12 && seasonalIndices.size === 12) {
    const latestMo = latest ? new Date(String(latest.month) + 'T00:00:00').getMonth() : -1
    const currentIdx = seasonalIndices.get(latestMo) ?? (1 / 12)
    const baseMonthRevenue = proratedLatestRevenue ?? 0
    runRate = currentIdx > 0 ? baseMonthRevenue / currentIdx : trailing12Sum
    runRateMethod = 'seasonally adjusted'
  } else if (trailing12Count >= 3) {
    const avgMonthly = trailing12Sum / trailing12Count
    runRate = avgMonthly * 12
    runRateMethod = `${trailing12Count}mo avg × 12`
  } else if (proratedLatestRevenue !== null) {
    runRate = proratedLatestRevenue * 12
    runRateMethod = latest?.is_partial ? 'prorated × 12' : 'latest mo × 12'
  }

  const trailing12Mean = trailing12Count > 0 ? trailing12Sum / trailing12Count : 0
  const trailing12Std = trailing12Count > 1
    ? Math.sqrt(
        trailing12.reduce((s, m) => {
          const v = Number(m.net_revenue) || 0
          return s + (v - trailing12Mean) ** 2
        }, 0) / (trailing12Count - 1)
      )
    : 0
  const outlierThreshold = trailing12Mean + 2 * trailing12Std
  const normalizedMonths = trailing12Std > 0
    ? trailing12.filter((m) => (Number(m.net_revenue) || 0) <= outlierThreshold)
    : trailing12
  const hasOutliers = normalizedMonths.length < trailing12Count
  let normalizedRunRate: number | null = null
  if (hasOutliers && normalizedMonths.length >= 3) {
    const normSum = normalizedMonths.reduce((s, m) => s + (Number(m.net_revenue) || 0), 0)
    normalizedRunRate = (normSum / normalizedMonths.length) * 12
  }

  const CHANNEL_KEYS_FOR_GROWTH = ['dtc', 'wholesale_faire', 'wholesale_direct', 'wholesale_key', 'marketplace', 'retail']
  const channelGrowthRates = new Map<string, number>()
  let channelWeightedRunRate: number | null = null

  if (trailing12Count >= 6) {
    for (const chKey of CHANNEL_KEYS_FOR_GROWTH) {
      const chRows = channelPnl
        .filter((r) => r.channel === chKey && !r.is_partial)
        .sort((a, b) => String(b.month).localeCompare(String(a.month)))
      const recent3 = chRows.slice(0, 3)
      const prior3 = chRows.slice(3, 6)
      if (recent3.length >= 3 && prior3.length >= 3) {
        const recentAvg = recent3.reduce((s, r) => s + (Number(r.net_revenue) || 0), 0) / 3
        const priorAvg = prior3.reduce((s, r) => s + (Number(r.net_revenue) || 0), 0) / 3
        const momGrowth = priorAvg > 0 ? (recentAvg - priorAvg) / priorAvg : 0
        channelGrowthRates.set(chKey, Math.max(-0.5, Math.min(momGrowth, 1.0)))
      }
    }
    if (channelGrowthRates.size > 0) {
      let fwdSum = 0
      for (const chKey of CHANNEL_KEYS_FOR_GROWTH) {
        const chRows = channelPnl
          .filter((r) => r.channel === chKey)
          .sort((a, b) => String(b.month).localeCompare(String(a.month)))
        const latestChRev = Number(chRows[0]?.net_revenue) || 0
        const g = channelGrowthRates.get(chKey) ?? 0
        for (let m = 1; m <= 12; m++) {
          fwdSum += latestChRev * (1 + g) ** m
        }
      }
      channelWeightedRunRate = fwdSum
    }
  }

  const runRateYoY =
    priorRevenue && priorRevenue > 0 && runRate !== null
      ? (((runRate - priorRevenue * 12) / (priorRevenue * 12)) * 100)
      : null

  // Cash — prefer balance sheet -> cashflow ending -> forecast starting week 1
  const latestForecastRunDate = forecasts.length > 0
    ? String(forecasts[0].forecast_run_date)
    : null
  const latestForecastRows = latestForecastRunDate
    ? forecasts
      .filter((f) => String(f.forecast_run_date) === latestForecastRunDate)
      .sort((a, b) => (Number(a.week_number) || 0) - (Number(b.week_number) || 0))
    : []
  const forecastStartCash = latestForecastRows.length > 0
    ? Number(latestForecastRows[0].starting_cash) || null
    : null
  const cash =
    (balance ? Number(balance.cash_and_equivalents) || null : null) ??
    (cashflowLatest ? Number(cashflowLatest.ending_cash) || null : null) ??
    forecastStartCash
  const recentOpex = pnl.slice(0, 3)
  const avgOpex =
    recentOpex.length > 0
      ? recentOpex.reduce((s, m) => s + (Number(m.total_opex) || 0), 0) /
        recentOpex.length
      : null
  const avgMonthlyBurnFromOpex = avgOpex !== null ? Math.abs(avgOpex) : null
  const cashflowOutflowRows = cashflowRows.filter(
    (r) => Number(r.net_cash_flow) < 0
  )
  const avgMonthlyBurnFromCashflow =
    cashflowOutflowRows.length > 0
      ? cashflowOutflowRows.reduce(
          (s, r) => s + Math.abs(Number(r.net_cash_flow) || 0),
          0
        ) / cashflowOutflowRows.length
      : null
  const effectiveMonthlyBurn =
    avgMonthlyBurnFromCashflow != null && avgMonthlyBurnFromCashflow > 0
      ? avgMonthlyBurnFromCashflow
      : avgMonthlyBurnFromOpex != null && avgMonthlyBurnFromOpex > 0
        ? avgMonthlyBurnFromOpex
        : null
  const rawDaysOfCash =
    cash != null &&
    effectiveMonthlyBurn != null &&
    effectiveMonthlyBurn > 0
      ? Math.round(cash / (effectiveMonthlyBurn / 30))
      : null
  const daysOfCash =
    rawDaysOfCash != null ? Math.min(rawDaysOfCash, 999) : null

  // Revenue MTD
  const revenueYoY =
    latestRevenue !== null && priorRevenue && priorRevenue > 0
      ? ((latestRevenue - priorRevenue) / priorRevenue) * 100
      : null

  const revenuePace =
    latestRevenue !== null && dayOfMonth > 0
      ? (latestRevenue / dayOfMonth) * daysInMonth
      : null
  const priorMonthRevenue = pnl.length >= 2 ? Number(pnl[1].net_revenue) || 0 : null
  const paceVsPrior =
    revenuePace !== null && priorMonthRevenue && priorMonthRevenue > 0
      ? ((revenuePace - priorMonthRevenue) / priorMonthRevenue) * 100
      : null

  // Gross Margin
  const grossMargin = latest ? Number(latest.gross_margin_pct) || null : null
  const threeMonthMargins = pnl.slice(0, 3).map((m) => Number(m.gross_margin_pct) || 0)
  const threeMonthAvg =
    threeMonthMargins.length > 0
      ? threeMonthMargins.reduce((s, v) => s + v, 0) / threeMonthMargins.length
      : null
  const marginTrend =
    grossMargin !== null && threeMonthAvg !== null
      ? Number((grossMargin - threeMonthAvg).toFixed(1))
      : null

  // Blended CAC (ad spend from Finaloop / orders from Shopify daily)
  const adSpend = latest ? Number(latest.allocated_ad_spend) || 0 : 0
  const latestMonthKey = latest ? String(latest.month).slice(0, 7) : null
  const monthOrders = latestMonthKey
    ? revenueDaily
        .filter((d) => String(d.date).slice(0, 7) === latestMonthKey)
    : []
  const newCustomers = monthOrders.reduce((s, d) => s + (Number(d.new_customer_orders) || 0), 0)
  const totalOrders = monthOrders.reduce((s, d) => s + (Number(d.order_count) || 0), 0)
  const cacDenominator = newCustomers > 0 ? newCustomers : totalOrders
  const blendedCac = calcBlendedCac(Math.abs(adSpend), cacDenominator)

  const ltv = calcSimplifiedLtv(
    latestRevenue ?? 0,
    newCustomers > 0 ? newCustomers : cacDenominator,
    grossMargin ?? 50,
  )
  const ltvCacRatio = calcLtvCacRatio(ltv, blendedCac)

  // Per-channel CAC / LTV breakout
  interface ChannelCacLtv {
    channel: string
    label: string
    adSpend: number
    revenue: number
    orders: number
    grossMarginPct: number
    marginIsProxy: boolean
    contribMargin: number
    marginDelta: number | null
    cac: number | null
    ltv: number | null
    ratio: number | null
    hasOrderData: boolean
  }

  const BREAKOUT_CHANNELS: Array<{ key: string; label: string }> = [
    { key: 'dtc', label: 'DTC (Shopify)' },
    { key: 'wholesale_faire', label: 'Faire' },
    { key: 'wholesale_direct', label: 'Direct' },
    { key: 'wholesale_key', label: 'Key Accounts' },
    { key: 'marketplace', label: 'Marketplace' },
    { key: 'retail', label: 'Retail' },
  ]

  const channelMarginTrend = new Map<string, number | null>()
  for (const { key } of BREAKOUT_CHANNELS) {
    const rows = channelPnl
      .filter((r) => r.channel === key)
      .sort((a, b) => String(b.month).localeCompare(String(a.month)))
      .slice(0, 3)
    if (rows.length >= 2) {
      const latest = Number(rows[0].gross_margin_pct) || 0
      const oldest = Number(rows[rows.length - 1].gross_margin_pct) || 0
      channelMarginTrend.set(key, Number((latest - oldest).toFixed(1)))
    } else {
      channelMarginTrend.set(key, null)
    }
  }

  const latestChannelKpis = latestMonth
    ? channelPnl.filter((r) => r.month === latestMonth)
    : []

  const wholesaleMonthOrders = new Map<string, number>()
  if (latestMonthKey) {
    for (const row of wholesaleDaily) {
      if (String(row.date).slice(0, 7) === latestMonthKey) {
        const seg = String(row.segment)
        wholesaleMonthOrders.set(seg, (wholesaleMonthOrders.get(seg) ?? 0) + (Number(row.order_count) || 0))
      }
    }
  }

  const companyMargin = grossMargin ?? 0

  const channelBreakout: ChannelCacLtv[] = BREAKOUT_CHANNELS.map(({ key, label }) => {
    const kpi = latestChannelKpis.find((r) => r.channel === key)
    const chAdSpend = Math.abs(Number(kpi?.allocated_ad_spend) || 0)
    const chRevenue = Number(kpi?.net_revenue) || 0
    const rawMargin = Number(kpi?.gross_margin_pct) || 0
    const chCogs = Number(kpi?.cogs) || 0
    const chContribMargin = Number(kpi?.contribution_margin) || 0

    const needsProxy = chCogs === 0 && chRevenue > 0
    const chMargin = needsProxy ? companyMargin : rawMargin
    const effectiveMargin = chMargin > 0 ? chMargin : 50

    let chOrders = 0
    let hasOrderData = false
    if (key === 'dtc') {
      chOrders = newCustomers > 0 ? newCustomers : totalOrders
      hasOrderData = true
    } else if (key === 'wholesale_faire' || key === 'wholesale_direct') {
      chOrders = wholesaleMonthOrders.get(key) ?? 0
      hasOrderData = chOrders > 0
    }

    const chCac = chOrders > 0 ? calcBlendedCac(chAdSpend, chOrders) : null

    let chLtv: number | null = null
    if (chOrders > 0) {
      chLtv = calcSimplifiedLtv(chRevenue, chOrders, effectiveMargin)
    } else if (chRevenue > 0) {
      chLtv = chRevenue * (effectiveMargin / 100)
    }

    const chRatio = chCac !== null && chCac > 0 && chLtv !== null
      ? calcLtvCacRatio(chLtv, chCac)
      : null

    return {
      channel: key,
      label,
      adSpend: chAdSpend,
      revenue: chRevenue,
      orders: chOrders,
      grossMarginPct: chMargin,
      marginIsProxy: needsProxy,
      contribMargin: chContribMargin,
      marginDelta: channelMarginTrend.get(key) ?? null,
      hasOrderData,
      cac: chCac,
      ltv: chRevenue > 0 ? chLtv : null,
      ratio: chRatio,
    }
  })

  channelBreakout.sort(
    (a, b) => Math.abs(b.contribMargin) - Math.abs(a.contribMargin),
  )

  const blendedContribMargin = channelBreakout.reduce(
    (s, ch) => s + ch.contribMargin,
    0,
  )

  // 13-Week Forecast Minimum
  const forecastCashValues = latestForecastRows
    .map((f) => Number(f.projected_ending_cash))
    .filter((v) => Number.isFinite(v))
  const forecastMin =
    forecastCashValues.length > 0 ? Math.min(...forecastCashValues) : null
  const forecastAlert: 'green' | 'yellow' | 'red' | undefined =
    forecastMin !== null
      ? forecastMin < 0
        ? 'red'
        : forecastMin < 50000
          ? 'yellow'
          : 'green'
      : undefined

  // Committed POs
  const committedPOs = shopifyDaily
    ? Number(shopifyDaily.incoming_inventory_value) || null
    : null
  const posCashPct =
    committedPOs && cash && cash > 0
      ? ((committedPOs / cash) * 100).toFixed(0)
      : null

  const WHOLESALE_KEYS_SET = new Set(['wholesale_faire', 'wholesale_direct', 'wholesale_key'])
  const monthSet = new Set(pnl.slice(0, 12).reverse().map((m) => String(m.month)))
  const channelTrendMap = new Map<string, Record<string, number>>()

  for (const month of monthSet) {
    const entry: Record<string, number> = {}
    channelTrendMap.set(month, entry)
  }

  for (const row of channelPnl) {
    const m = String(row.month)
    if (!channelTrendMap.has(m)) continue
    const entry = channelTrendMap.get(m)!
    const ch = row.channel as string
    const rev = Math.max(0, Number(row.net_revenue) || 0)
    if (WHOLESALE_KEYS_SET.has(ch)) {
      entry.wholesale = (entry.wholesale ?? 0) + rev
    } else if (ch !== 'wholesale') {
      entry[ch] = (entry[ch] ?? 0) + rev
    }
  }

  const channelTrend = [...monthSet].sort().map((m) => ({
    month: formatMonthLabel(m),
    ...channelTrendMap.get(m),
  }))

  const last12 = pnl.slice(0, 12).reverse()
  const revenueTrend = last12.map((m) => {
    const monthStr = String(m.month)
    const d = new Date(monthStr + 'T00:00:00')
    const pyDate = new Date(d)
    pyDate.setFullYear(d.getFullYear() - 1)
    const pyKey = `${pyDate.getFullYear()}-${String(pyDate.getMonth() + 1).padStart(2, '0')}-01`
    const pyRow = pnl.find((p) => String(p.month) === pyKey)
    return {
      month: formatMonthLabel(monthStr),
      revenue: Number(m.net_revenue) || 0,
      priorYear: pyRow ? Number(pyRow.net_revenue) || 0 : 0,
    }
  })

  const cashRunwayData = latestForecastRows.map((f) => ({
    week: `Wk ${f.week_number}`,
    cash: Number(f.projected_ending_cash) || 0,
  }))

  const alertDayCounts = new Map<string, { red: number; yellow: number }>()
  for (const a of alertHistory) {
    const day = String(a.triggered_at).slice(0, 10)
    const entry = alertDayCounts.get(day) ?? { red: 0, yellow: 0 }
    if (a.severity === 'red') entry.red++
    else entry.yellow++
    alertDayCounts.set(day, entry)
  }

  const alertTimelineData: Array<{ day: string; red: number; yellow: number }> = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const key = d.toISOString().slice(0, 10)
    const counts = alertDayCounts.get(key) ?? { red: 0, yellow: 0 }
    alertTimelineData.push({ day: key.slice(5), ...counts })
  }

  return (
    <>
      <PageHeader
        title="CEO Overview"
        lastSynced={lastSync?.started_at ?? null}
      />

      <div className="px-6 pb-4">
        <BriefingCard
          text={briefingRaw?.text ?? null}
          generatedAt={briefingRaw?.generated_at ?? null}
          valid={briefingRaw?.valid ?? true}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 px-6 pb-4 md:grid-cols-4">
        <MetricCard
          title="Run Rate"
          description={`Annualized revenue (${runRateMethod})`}
          value={formatCompact(runRate)}
          subtitle={[
            runRateYoY !== null ? `${runRateYoY > 0 ? '+' : ''}${runRateYoY.toFixed(1)}% YoY` : null,
            normalizedRunRate !== null ? `Normalized: ${formatCompact(normalizedRunRate)}` : null,
            channelWeightedRunRate !== null ? `Ch-weighted fwd: ${formatCompact(channelWeightedRunRate)}` : null,
          ].filter(Boolean).join(' · ') || undefined}
          trend={
            runRateYoY !== null
              ? { value: Number(runRateYoY.toFixed(1)), label: 'YoY' }
              : undefined
          }
          sparkline={sparklineRunRate}
        />
        <MetricCard
          title="Cash"
          description="Bank balance from Finaloop"
          value={formatCompact(cash)}
          subtitle={
            daysOfCash !== null ? `${daysOfCash} days of cash` : undefined
          }
        />
        <MetricCard
          title="Revenue MTD"
          description="Net revenue for the current month"
          value={formatCompact(latestRevenue)}
          subtitle={
            latest?.is_partial && revenuePace !== null
              ? `Pace: ${formatCompact(revenuePace)}${paceVsPrior !== null ? ` (${paceVsPrior > 0 ? '+' : ''}${paceVsPrior.toFixed(0)}% vs prior mo)` : ''}`
              : latest?.is_partial
                ? 'Partial month'
                : undefined
          }
          trend={
            revenueYoY !== null
              ? { value: Number(revenueYoY.toFixed(1)), label: 'YoY' }
              : undefined
          }
          sparkline={sparklineRevenueMtd}
        />
        <MetricCard
          title="Gross Margin"
          description="Revenue minus COGS, as %"
          value={formatPercent(grossMargin)}
          trend={
            marginTrend !== null
              ? { value: marginTrend, label: 'vs 3mo avg' }
              : undefined
          }
          sparkline={sparklineGrossMargin}
        />
        <MetricCard
          title="Blended CAC"
          description="All channels combined"
          value={
            blendedCac !== null ? formatCurrency(blendedCac) : '\u2014'
          }
          subtitle={
            ltvCacRatio !== null
              ? `LTV:CAC ${ltvCacRatio.toFixed(1)}x`
              : undefined
          }
        />
        <MetricCard
          title="13-Week Min"
          description="Lowest forecasted cash balance"
          value={forecastMin !== null ? formatCompact(forecastMin) : '\u2014'}
          subtitle={forecastMin === null ? 'Run forecast to populate' : undefined}
          alert={forecastAlert}
        />
        <MetricCard
          title="Committed POs"
          description="Outstanding purchase orders"
          value={formatCompact(committedPOs)}
          subtitle={posCashPct ? `${posCashPct}% of cash` : undefined}
        />
        <MetricCard
          title="Alerts"
          description="Thresholds needing attention"
          value={formatCount(alerts.length)}
          alert={alerts.length > 0 ? 'red' : 'green'}
        />
      </div>

      <div className="px-6 pb-4">
        <Card>
          <CardHeader>
            <CardTitle>CAC & LTV by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Channel</th>
                    <th className="pb-2 pr-4 text-right font-medium">Ad Spend</th>
                    <th className="pb-2 pr-4 text-right font-medium">Revenue</th>
                    <th className="pb-2 pr-4 text-right font-medium">Margin</th>
                    <th className="pb-2 pr-4 text-right font-medium">Contrib $</th>
                    <th className="pb-2 pr-4 text-right font-medium">Orders</th>
                    <th className="pb-2 pr-4 text-right font-medium">CAC</th>
                    <th className="pb-2 pr-4 text-right font-medium">LTV</th>
                    <th className="pb-2 text-right font-medium">LTV:CAC</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-muted/30 font-medium">
                    <td className="py-2 pr-4">Blended</td>
                    <td className="py-2 pr-4 text-right">{formatCompact(Math.abs(adSpend))}</td>
                    <td className="py-2 pr-4 text-right">{formatCompact(latestRevenue)}</td>
                    <td className="py-2 pr-4 text-right">{formatPercent(grossMargin)}</td>
                    <td className="py-2 pr-4 text-right">{formatCompact(blendedContribMargin)}</td>
                    <td className="py-2 pr-4 text-right">{formatCount(cacDenominator)}</td>
                    <td className="py-2 pr-4 text-right">{blendedCac !== null ? formatCurrency(blendedCac) : '\u2014'}</td>
                    <td className="py-2 pr-4 text-right">{ltv !== null ? formatCurrency(ltv) : '\u2014'}</td>
                    <td className="py-2 text-right">{ltvCacRatio !== null ? `${ltvCacRatio.toFixed(1)}x` : '\u2014'}</td>
                  </tr>
                  {channelBreakout.map((ch) => {
                    const approx = ch.marginIsProxy || !ch.hasOrderData
                    return (
                      <tr key={ch.channel} className="border-b last:border-b-0">
                        <td className="py-2 pr-4">{ch.label}</td>
                        <td className="py-2 pr-4 text-right">{ch.adSpend > 0 ? formatCompact(ch.adSpend) : '\u2014'}</td>
                        <td className="py-2 pr-4 text-right">{ch.revenue > 0 ? formatCompact(ch.revenue) : '\u2014'}</td>
                        <td className="py-2 pr-4 text-right">
                          {ch.grossMarginPct > 0 ? (
                            <span className={ch.marginIsProxy ? 'text-muted-foreground' : undefined}>
                              {ch.marginIsProxy ? '~' : ''}{formatPercent(ch.grossMarginPct)}
                              {ch.marginDelta !== null && ch.marginDelta !== 0 && (
                                <span className={ch.marginDelta > 0 ? 'text-emerald-600' : 'text-red-600'}>
                                  {ch.marginDelta > 0 ? ' ↑' : ' ↓'}
                                </span>
                              )}
                            </span>
                          ) : '\u2014'}
                        </td>
                        <td className="py-2 pr-4 text-right">{formatCompact(ch.contribMargin)}</td>
                        <td className="py-2 pr-4 text-right">{ch.orders > 0 ? formatCount(ch.orders) : '\u2014'}</td>
                        <td className="py-2 pr-4 text-right">
                          {ch.cac !== null ? (
                            <span>{formatCurrency(ch.cac)}</span>
                          ) : '\u2014'}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {ch.ltv !== null ? (
                            <span className={approx ? 'text-muted-foreground' : undefined}>
                              {approx ? '~' : ''}{formatCurrency(ch.ltv)}
                            </span>
                          ) : '\u2014'}
                        </td>
                        <td className="py-2 text-right">
                          {ch.ratio !== null ? (
                            <span className={approx ? 'text-muted-foreground' : undefined}>
                              {approx ? '~' : ''}{ch.ratio.toFixed(1)}x
                            </span>
                          ) : '\u2014'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {channelBreakout.some((ch) => ch.marginIsProxy || (!ch.hasOrderData && ch.revenue > 0)) && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                ~ Estimated.
                {channelBreakout.some((ch) => ch.marginIsProxy) && (
                  <> Margin uses company blended ({formatPercent(companyMargin)}) where COGS not tracked.</>
                )}
                {channelBreakout.some((ch) => !ch.hasOrderData && ch.revenue > 0) && (
                  <> LTV = gross profit (revenue × margin) where order counts unavailable.</>
                )}
              </p>
            )}
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Gross Margin by Channel</p>
              {channelBreakout
                .filter((ch) => ch.revenue > 0)
                .sort((a, b) => b.grossMarginPct - a.grossMarginPct)
                .map((ch) => (
                  <div key={ch.channel} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{ch.label}</span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-primary/60"
                        style={{ width: `${Math.min(ch.grossMarginPct, 100)}%` }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums">
                      {ch.marginIsProxy ? '~' : ''}{ch.grossMarginPct.toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 px-6 pb-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Channel Revenue Mix</CardTitle>
          </CardHeader>
          <CardContent>
            <FinAreaChart
              data={channelTrend}
              xKey="month"
              yKeys={[
                { key: 'dtc', label: 'DTC', color: 'hsl(var(--chart-1))' },
                { key: 'wholesale', label: 'Wholesale', color: 'hsl(var(--chart-2))' },
                { key: 'retail', label: 'Retail', color: 'hsl(var(--chart-5))' },
                { key: 'marketplace', label: 'Marketplace', color: 'hsl(210 70% 55%)' },
              ]}
              empty={channelTrend.length === 0}
              stacked
              showLegend
              formatYAxis="compact"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <FinAreaChart
              data={revenueTrend}
              xKey="month"
              yKeys={[
                {
                  key: 'revenue',
                  label: 'Net Revenue',
                  color: 'hsl(var(--chart-1))',
                },
                {
                  key: 'priorYear',
                  label: 'Prior Year',
                  color: 'hsl(0 0% 60%)',
                  dashed: true,
                },
              ]}
              empty={revenueTrend.length === 0}
              gradientFill
              showLegend
              formatYAxis="compact"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cash Runway</CardTitle>
          </CardHeader>
          <CardContent>
            <CashBurndownChart data={cashRunwayData} />
          </CardContent>
        </Card>
      </div>

      <div className="px-6 pb-6">
        <Card>
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Last 30 Days</p>
              <svg viewBox="0 0 300 40" className="h-10 w-full" preserveAspectRatio="none">
                {alertTimelineData.map((d, i) => {
                  const x = i * 10
                  const redH = Math.min(d.red * 10, 40)
                  const yellowH = Math.min(d.yellow * 10, 40 - redH)
                  return (
                    <g key={d.day}>
                      {redH > 0 && (
                        <rect x={x} y={40 - redH} width={8} height={redH} rx={1} className="fill-red-500" />
                      )}
                      {yellowH > 0 && (
                        <rect x={x} y={40 - redH - yellowH} width={8} height={yellowH} rx={1} className="fill-amber-400" />
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
            <AlertFeedWrapper alerts={alerts} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
