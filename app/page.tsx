export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { MetricCard } from '@/components/cards/metric-card'
import { FinDonutChart } from '@/components/charts/donut-chart'
import { FinAreaChart } from '@/components/charts/area-chart'
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
    balanceResult,
    syncResult,
    channelPnlResult,
    shopifyResult,
    revenueDailyResult,
    briefingResult,
    wholesaleDailyResult,
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
      .select('month, channel, net_revenue, allocated_ad_spend, gross_margin_pct, cogs')
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
  ])

  const pnl = pnlResult.data ?? []
  const forecasts = forecastResult.data ?? []
  const alerts = alertsResult.data ?? []
  const balance = balanceResult.data?.[0]
  const lastSync = syncResult.data?.[0]
  const channelPnl = channelPnlResult.data ?? []
  const shopifyDaily = shopifyResult.data?.[0]
  const revenueDaily = revenueDailyResult.data ?? []
  const briefingRaw = briefingResult.data?.value as
    | { text?: string; generated_at?: string; valid?: boolean }
    | null
  const wholesaleDaily = wholesaleDailyResult.data ?? []

  const cashflowLatest = (await supabase
    .from('fin_cashflow_monthly')
    .select('ending_cash')
    .order('month', { ascending: false })
    .limit(1)).data?.[0]

  const latest = pnl[0]
  const priorYear = pnl.length >= 13 ? pnl[12] : null
  const latestMonth = latest?.month

  // Run Rate = latest month net_revenue × 12
  const latestRevenue = latest ? Number(latest.net_revenue) || 0 : null
  const runRate = latestRevenue !== null ? latestRevenue * 12 : null
  const priorRevenue = priorYear ? Number(priorYear.net_revenue) || 0 : null
  const runRateYoY =
    priorRevenue && priorRevenue > 0 && runRate !== null
      ? (((latestRevenue! - priorRevenue) / priorRevenue) * 100)
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
  const avgMonthlyBurn = avgOpex !== null ? Math.abs(avgOpex) : null
  const daysOfCash =
    cash != null &&
    avgMonthlyBurn != null &&
    avgMonthlyBurn > 0
      ? Math.round(cash / (avgMonthlyBurn / 30))
      : null

  // Revenue MTD
  const revenueYoY =
    latestRevenue !== null && priorRevenue && priorRevenue > 0
      ? ((latestRevenue - priorRevenue) / priorRevenue) * 100
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
      hasOrderData,
      cac: chCac,
      ltv: chRevenue > 0 ? chLtv : null,
      ratio: chRatio,
    }
  })

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

  // Channel Donut — roll up wholesale sub-channels into one slice
  const WHOLESALE_KEYS = new Set(['wholesale_faire', 'wholesale_direct', 'wholesale_key'])
  const rawChannelData = latestMonth
    ? channelPnl.filter((r) => r.month === latestMonth)
    : []

  let wholesaleTotal = 0
  const channelData: Array<{ name: string; value: number; color: string }> = []

  for (const r of rawChannelData) {
    const ch = r.channel as string
    const val = Math.max(0, Number(r.net_revenue) || 0)
    if (val === 0) continue

    if (WHOLESALE_KEYS.has(ch)) {
      wholesaleTotal += val
    } else if (ch !== 'wholesale') {
      channelData.push({
        name: CHANNEL_LABELS[ch] ?? ch,
        value: val,
        color: CHANNEL_COLORS[ch] ?? 'hsl(var(--chart-1))',
      })
    }
  }

  if (wholesaleTotal > 0) {
    channelData.push({
      name: 'Wholesale',
      value: wholesaleTotal,
      color: CHANNEL_COLORS.wholesale ?? 'hsl(var(--chart-2))',
    })
  }

  channelData.sort((a, b) => b.value - a.value)

  // Revenue Trend (last 12 months, ascending for chart)
  const revenueTrend = pnl
    .slice(0, 12)
    .reverse()
    .map((m) => ({
      month: formatMonthLabel(m.month as string),
      revenue: Number(m.net_revenue) || 0,
    }))

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
          description="Latest month revenue × 12"
          value={formatCompact(runRate)}
          subtitle={
            runRateYoY !== null
              ? `${runRateYoY > 0 ? '+' : ''}${runRateYoY.toFixed(1)}% YoY`
              : undefined
          }
          trend={
            runRateYoY !== null
              ? { value: Number(runRateYoY.toFixed(1)), label: 'YoY' }
              : undefined
          }
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
          subtitle={latest?.is_partial ? 'Partial month' : undefined}
          trend={
            revenueYoY !== null
              ? { value: Number(revenueYoY.toFixed(1)), label: 'YoY' }
              : undefined
          }
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
                            </span>
                          ) : '\u2014'}
                        </td>
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 px-6 pb-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Channel Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <FinDonutChart
              data={channelData}
              empty={channelData.length === 0}
              innerLabel={
                latestRevenue !== null
                  ? formatCompact(latestRevenue)
                  : undefined
              }
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
              ]}
              empty={revenueTrend.length === 0}
              gradientFill
            />
          </CardContent>
        </Card>
      </div>

      <div className="px-6 pb-6">
        <Card>
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertFeedWrapper alerts={alerts} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
