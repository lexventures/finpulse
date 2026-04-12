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
import { AlertFeedWrapper } from './alert-feed-wrapper'

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
  ] = await Promise.all([
    supabase
      .from('fin_pnl_monthly')
      .select('*')
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
      .from('fin_pnl_monthly')
      .select('*')
      .neq('channel', 'company')
      .order('month', { ascending: false }),
    supabase
      .from('fin_shopify_daily')
      .select('*')
      .order('date', { ascending: false })
      .limit(1),
  ])

  const pnl = pnlResult.data ?? []
  const forecasts = forecastResult.data ?? []
  const alerts = alertsResult.data ?? []
  const balance = balanceResult.data?.[0]
  const lastSync = syncResult.data?.[0]
  const channelPnl = channelPnlResult.data ?? []
  const shopifyDaily = shopifyResult.data?.[0]

  const latest = pnl[0]
  const priorYear = pnl.length >= 13 ? pnl[12] : null

  // Run Rate = latest month net_revenue × 12
  const latestRevenue = latest ? Number(latest.net_revenue) || 0 : null
  const runRate = latestRevenue !== null ? latestRevenue * 12 : null
  const priorRevenue = priorYear ? Number(priorYear.net_revenue) || 0 : null
  const runRateYoY =
    priorRevenue && priorRevenue > 0 && runRate !== null
      ? (((latestRevenue! - priorRevenue) / priorRevenue) * 100)
      : null

  // Cash
  const cash = balance ? Number(balance.cash_and_equivalents) || null : null
  const recentOpex = pnl.slice(0, 3)
  const avgMonthlyBurn =
    recentOpex.length > 0
      ? recentOpex.reduce((s, m) => s + (Number(m.total_opex) || 0), 0) /
        recentOpex.length
      : null
  const daysOfCash =
    cash && avgMonthlyBurn && avgMonthlyBurn > 0
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

  // Blended CAC (ad spend only — full CAC requires Phase 3 Klaviyo integration)
  const adSpend = latest ? Number(latest.allocated_ad_spend) || 0 : 0

  // 13-Week Forecast Minimum
  const forecastCashValues = forecasts
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

  // Channel Donut
  const latestMonth = latest?.month
  const channelData = latestMonth
    ? channelPnl
        .filter((r) => r.month === latestMonth)
        .map((r) => ({
          name: CHANNEL_LABELS[r.channel as string] ?? (r.channel as string),
          value: Math.max(0, Number(r.net_revenue) || 0),
          color:
            CHANNEL_COLORS[r.channel as string] ?? 'hsl(var(--chart-1))',
        }))
        .filter((d) => d.value > 0)
    : []

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
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              AI-generated morning briefing will be available in Phase 5
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 px-6 pb-4 md:grid-cols-4">
        <MetricCard
          title="Run Rate"
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
          value={formatCompact(cash)}
          subtitle={
            daysOfCash !== null ? `${daysOfCash} days of cash` : undefined
          }
        />
        <MetricCard
          title="Revenue MTD"
          value={formatCompact(latestRevenue)}
          trend={
            revenueYoY !== null
              ? { value: Number(revenueYoY.toFixed(1)), label: 'YoY' }
              : undefined
          }
        />
        <MetricCard
          title="Gross Margin"
          value={formatPercent(grossMargin)}
          trend={
            marginTrend !== null
              ? { value: marginTrend, label: 'vs 3mo avg' }
              : undefined
          }
        />
        <MetricCard
          title="Blended CAC"
          value={adSpend > 0 ? formatCurrency(adSpend) : '\u2014'}
          subtitle="LTV:CAC available Phase 3"
        />
        <MetricCard
          title="13-Week Min"
          value={formatCompact(forecastMin)}
          alert={forecastAlert}
        />
        <MetricCard
          title="Committed POs"
          value={formatCompact(committedPOs)}
          subtitle={posCashPct ? `${posCashPct}% of cash` : undefined}
        />
        <MetricCard
          title="Alerts"
          value={formatCount(alerts.length)}
          alert={alerts.length > 0 ? 'red' : 'green'}
        />
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
