export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { MetricCard } from '@/components/cards/metric-card'
import { FinBarChart } from '@/components/charts/bar-chart'
import { FinLineChart } from '@/components/charts/line-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatCompact,
  formatCurrency,
  formatCount,
} from '@/lib/utils/format'
import { CashWhatIf } from './what-if'

function formatWeekLabel(weekNum: number): string {
  return `Wk ${weekNum}`
}

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export default async function CashPage() {
  const supabase = createServiceClient()

  const [forecastResult, balanceResult, cashflowResult, shopifyResult, pnlResult, syncResult] =
    await Promise.all([
      supabase
        .from('fin_cash_forecast')
        .select('*')
        .order('forecast_run_date', { ascending: false })
        .limit(13),
      supabase
        .from('fin_balance_sheet_monthly')
        .select('*')
        .order('month', { ascending: false })
        .limit(1),
      supabase
        .from('fin_cashflow_monthly')
        .select('*')
        .order('month', { ascending: false })
        .limit(12),
      supabase
        .from('fin_shopify_daily')
        .select('*')
        .order('date', { ascending: false })
        .limit(1),
      supabase
        .from('fin_pnl_monthly')
        .select('*')
        .eq('channel', 'company')
        .order('month', { ascending: false })
        .limit(3),
      supabase
        .from('fin_sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1),
    ])

  const forecasts = forecastResult.data ?? []
  const balance = balanceResult.data?.[0]
  const cashflows = cashflowResult.data ?? []
  const shopifyDaily = shopifyResult.data?.[0]
  const pnlRecent = pnlResult.data ?? []
  const lastSync = syncResult.data?.[0]

  // --- Metric Cards ---
  // Cash sources in priority order: balance sheet -> cashflow ending -> forecast starting week 1

  const cash =
    (balance ? Number(balance.cash_and_equivalents) || null : null) ??
    (cashflows.length > 0 ? Number(cashflows[0].ending_cash) || null : null) ??
    (forecasts.length > 0 ? Number(forecasts[0].starting_cash) || null : null)

  const avgMonthlyOpex =
    pnlRecent.length > 0
      ? pnlRecent.reduce((s, m) => s + (Number(m.total_opex) || 0), 0) /
        pnlRecent.length
      : null
  const dailyOpex =
    avgMonthlyOpex !== null && avgMonthlyOpex !== 0
      ? Math.abs(avgMonthlyOpex) / 30
      : null
  const daysOfCash =
    cash !== null && dailyOpex !== null && dailyOpex > 0
      ? Math.round(cash / dailyOpex)
      : null

  const committedPOs = shopifyDaily
    ? Number(shopifyDaily.incoming_inventory_value) || null
    : null
  const posCashPct =
    committedPOs !== null && cash !== null && cash > 0
      ? ((committedPOs / cash) * 100).toFixed(0)
      : null

  // --- 13-Week Forecast Chart ---

  const latestRunDate =
    forecasts.length > 0
      ? (forecasts[0].forecast_run_date as string)
      : null
  const forecastData = latestRunDate
    ? forecasts
        .filter((f) => f.forecast_run_date === latestRunDate)
        .sort(
          (a, b) =>
            (Number(a.week_number) || 0) - (Number(b.week_number) || 0)
        )
    : []

  const forecastChartData = forecastData.map((f) => ({
    week: formatWeekLabel(Number(f.week_number)),
    inflows: Number(f.projected_inflows) || 0,
    outflows: -(Math.abs(Number(f.projected_outflows) || 0)),
  }))

  const forecastEndingCash =
    forecastData.length > 0
      ? Number(forecastData[forecastData.length - 1].projected_ending_cash) ||
        null
      : null

  // --- Inflow Breakdown by Channel ---

  const inflowChannelKeys = [
    { dbCol: 'inflow_dtc', label: 'DTC', color: 'hsl(var(--chart-1))' },
    { dbCol: 'inflow_wholesale_faire', label: 'Faire', color: 'hsl(var(--chart-2))' },
    { dbCol: 'inflow_wholesale_direct', label: 'Direct WS', color: 'hsl(var(--chart-3))' },
    { dbCol: 'inflow_wholesale_key', label: 'Key Accounts', color: 'hsl(var(--chart-4))' },
    { dbCol: 'inflow_retail', label: 'Retail', color: 'hsl(var(--chart-5))' },
    { dbCol: 'inflow_marketplace', label: 'Marketplace', color: 'hsl(210 70% 55%)' },
    { dbCol: 'inflow_other', label: 'Other', color: 'hsl(220 10% 60%)' },
  ]

  const inflowChartData = forecastData.map((f) => {
    const row: Record<string, unknown> = {
      week: formatWeekLabel(Number(f.week_number)),
    }
    for (const ch of inflowChannelKeys) {
      row[ch.label] = Number((f as Record<string, unknown>)[ch.dbCol]) || 0
    }
    return row
  })

  // --- Outflow Breakdown by Category ---

  const outflowCategoryKeys = [
    { dbCol: 'outflow_payroll', label: 'Payroll', color: 'hsl(0 70% 55%)' },
    { dbCol: 'outflow_inventory_pos', label: 'Inventory/POs', color: 'hsl(25 80% 55%)' },
    { dbCol: 'outflow_ad_spend', label: 'Ad Spend', color: 'hsl(45 80% 50%)' },
    { dbCol: 'outflow_software', label: 'Software', color: 'hsl(200 60% 50%)' },
    { dbCol: 'outflow_rent', label: 'Rent', color: 'hsl(270 50% 55%)' },
    { dbCol: 'outflow_sales_tax', label: 'Sales Tax', color: 'hsl(330 50% 55%)' },
    { dbCol: 'outflow_owner_distributions', label: 'Distributions', color: 'hsl(160 40% 50%)' },
    { dbCol: 'outflow_other', label: 'Other', color: 'hsl(220 10% 60%)' },
  ]

  const outflowChartData = forecastData.map((f) => {
    const row: Record<string, unknown> = {
      week: formatWeekLabel(Number(f.week_number)),
    }
    for (const cat of outflowCategoryKeys) {
      row[cat.label] = Math.abs(
        Number((f as Record<string, unknown>)[cat.dbCol]) || 0
      )
    }
    return row
  })

  // --- Cash from Ops/Investing/Financing (monthly trend) ---

  const cashflowTrend = [...cashflows]
    .sort((a, b) => (a.month as string).localeCompare(b.month as string))
    .map((cf) => ({
      month: formatMonthLabel(cf.month as string),
      operations: Number(cf.cash_from_operations) || 0,
      investing: Number(cf.cash_from_investing) || 0,
      financing: Number(cf.cash_from_financing) || 0,
    }))

  const noForecast = forecastChartData.length === 0
  const noCashflow = cashflowTrend.length === 0

  return (
    <>
      <PageHeader
        title="Cash Flow & 13-Week Forecast"
        lastSynced={lastSync?.started_at ?? null}
      />

      <div className="grid grid-cols-1 gap-4 px-6 pb-4 sm:grid-cols-3">
        <MetricCard
          title="Current Cash"
          value={formatCompact(cash)}
        />
        <MetricCard
          title="Days of Cash"
          value={daysOfCash !== null ? formatCount(daysOfCash) : '\u2014'}
          subtitle={
            dailyOpex !== null
              ? `~${formatCurrency(dailyOpex)}/day opex`
              : undefined
          }
          alert={
            daysOfCash !== null
              ? daysOfCash < 30
                ? 'red'
                : daysOfCash < 60
                  ? 'yellow'
                  : 'green'
              : undefined
          }
        />
        <MetricCard
          title="Committed POs"
          value={formatCompact(committedPOs)}
          subtitle={posCashPct ? `${posCashPct}% of cash` : undefined}
        />
      </div>

      <section className="space-y-4 px-6 pb-6">
        <Card>
          <CardHeader>
            <CardTitle>13-Week Cash Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <FinBarChart
              data={forecastChartData}
              xKey="week"
              yKeys={[
                {
                  key: 'inflows',
                  label: 'Inflows',
                  color: 'hsl(142 71% 45%)',
                  stackId: 'cash',
                },
                {
                  key: 'outflows',
                  label: 'Outflows',
                  color: 'hsl(0 84% 60%)',
                  stackId: 'cash',
                },
              ]}
              height={350}
              empty={noForecast}
              emptyMessage="No forecast data yet. Run the cash forecast to populate."
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Inflow Breakdown by Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <FinBarChart
                data={inflowChartData}
                xKey="week"
                yKeys={inflowChannelKeys.map((ch) => ({
                  key: ch.label,
                  label: ch.label,
                  color: ch.color,
                  stackId: 'inflow',
                }))}
                empty={noForecast}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outflow Breakdown by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <FinBarChart
                data={outflowChartData}
                xKey="week"
                yKeys={outflowCategoryKeys.map((cat) => ({
                  key: cat.label,
                  label: cat.label,
                  color: cat.color,
                  stackId: 'outflow',
                }))}
                empty={noForecast}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cash from Operations / Investing / Financing</CardTitle>
          </CardHeader>
          <CardContent>
            <FinLineChart
              data={cashflowTrend}
              xKey="month"
              yKeys={[
                {
                  key: 'operations',
                  label: 'Operations',
                  color: 'hsl(var(--chart-1))',
                },
                {
                  key: 'investing',
                  label: 'Investing',
                  color: 'hsl(var(--chart-2))',
                },
                {
                  key: 'financing',
                  label: 'Financing',
                  color: 'hsl(var(--chart-3))',
                },
              ]}
              empty={noCashflow}
            />
          </CardContent>
        </Card>

        <CashWhatIf forecastEndingCash={forecastEndingCash} />
      </section>
    </>
  )
}
