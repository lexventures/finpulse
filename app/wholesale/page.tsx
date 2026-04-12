export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { getDateRange, type DatePreset } from '@/lib/utils/date-ranges'
import { PageHeader } from '@/components/layout/page-header'
import { MetricCard } from '@/components/cards/metric-card'
import { TimelineFilter } from '@/components/filters/timeline-filter'
import { FinAreaChart } from '@/components/charts/area-chart'
import { FinLineChart } from '@/components/charts/line-chart'
import { FinBarChart } from '@/components/charts/bar-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatPercent,
  formatCurrency,
  formatCount,
} from '@/lib/utils/format'
import { SegmentToggle } from './segment-toggle'

const VALID_RANGES = new Set(['7d', '30d', '90d', 'ytd', '12m', 'all'])

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

interface DailyRow {
  date: string
  segment: string
  net_revenue: number | string | null
  order_count: number | string | null
  avg_order_value: number | string | null
}

export default async function WholesalePage(props: {
  searchParams: Promise<Record<string, string>>
}) {
  const searchParams = await props.searchParams
  const rangeParam = searchParams.range || '12m'
  const range: DatePreset = VALID_RANGES.has(rangeParam)
    ? (rangeParam as DatePreset)
    : '12m'
  const segment = searchParams.segment || 'all'

  const { start } = getDateRange(range)
  const startDate = toISODate(start)

  const supabase = createServiceClient()

  const segmentFilter =
    segment === 'faire'
      ? 'wholesale_faire'
      : segment === 'direct'
        ? 'wholesale_direct'
        : null

  const wholesaleDailyQuery = supabase
    .from('fin_wholesale_daily')
    .select('*')
    .gte('date', startDate)
    .order('date', { ascending: true })

  if (segmentFilter) {
    wholesaleDailyQuery.eq('segment', segmentFilter)
  }

  const pnlChannel =
    segment === 'faire'
      ? 'wholesale_faire'
      : segment === 'direct'
        ? 'wholesale_direct'
        : 'wholesale'

  const [dailyResult, pnlResult, analyticsResult] = await Promise.all([
    wholesaleDailyQuery,
    supabase
      .from('fin_kpi_monthly')
      .select('month, gross_margin_pct, contribution_margin, is_partial')
      .eq('channel', pnlChannel)
      .gte('month', startDate)
      .order('month', { ascending: true }),
    supabase
      .from('fin_shopify_analytics')
      .select('*')
      .eq('store', 'elsw')
      .gte('date', startDate)
      .order('date', { ascending: true }),
  ])

  const rawDaily = (dailyResult.data ?? []) as DailyRow[]
  const pnlData = pnlResult.data ?? []
  const analyticsData = analyticsResult.data ?? []

  // Aggregate daily data by date when viewing "All" (sum faire + direct per day)
  const dailyData: Array<{
    date: string
    net_revenue: number
    order_count: number
    avg_order_value: number
    faire_revenue: number
    direct_revenue: number
  }> = []

  if (segment === 'all') {
    const byDate = new Map<
      string,
      { revenue: number; orders: number; faire: number; direct: number }
    >()
    for (const row of rawDaily) {
      const existing = byDate.get(row.date) ?? {
        revenue: 0,
        orders: 0,
        faire: 0,
        direct: 0,
      }
      const rev = Number(row.net_revenue) || 0
      existing.revenue += rev
      existing.orders += Number(row.order_count) || 0
      if (row.segment === 'wholesale_faire') existing.faire += rev
      else existing.direct += rev
      byDate.set(row.date, existing)
    }
    for (const [date, agg] of byDate) {
      dailyData.push({
        date,
        net_revenue: agg.revenue,
        order_count: agg.orders,
        avg_order_value: agg.orders > 0 ? agg.revenue / agg.orders : 0,
        faire_revenue: agg.faire,
        direct_revenue: agg.direct,
      })
    }
    dailyData.sort((a, b) => a.date.localeCompare(b.date))
  } else {
    for (const row of rawDaily) {
      const rev = Number(row.net_revenue) || 0
      const orders = Number(row.order_count) || 0
      dailyData.push({
        date: row.date,
        net_revenue: rev,
        order_count: orders,
        avg_order_value: orders > 0 ? rev / orders : 0,
        faire_revenue: segment === 'faire' ? rev : 0,
        direct_revenue: segment === 'direct' ? rev : 0,
      })
    }
  }

  const noDaily = dailyData.length === 0
  const noPnl = pnlData.length === 0
  const noAnalytics = analyticsData.length === 0

  // MTD metrics
  const now = new Date()
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const mtdRows = dailyData.filter((d) => d.date.startsWith(currentMonthPrefix))
  const revenueMTD = mtdRows.reduce((sum, d) => sum + d.net_revenue, 0)
  const ordersMTD = mtdRows.reduce((sum, d) => sum + d.order_count, 0)
  const aovMTD = ordersMTD > 0 ? revenueMTD / ordersMTD : 0

  // Revenue chart data
  const revenueChartData =
    segment === 'all'
      ? dailyData.map((d) => ({
          date: formatDateLabel(d.date),
          faire: d.faire_revenue,
          direct: d.direct_revenue,
        }))
      : dailyData.map((d) => ({
          date: formatDateLabel(d.date),
          revenue: d.net_revenue,
        }))

  // Order chart data
  const orderChartData = dailyData.map((d) => ({
    date: formatDateLabel(d.date),
    orders: d.order_count,
  }))

  // P&L chart data
  const marginChartData = pnlData.map((d) => ({
    month: formatMonthLabel(d.month as string),
    margin: Number(d.gross_margin_pct) || 0,
  }))

  const contributionData = pnlData.map((d) => ({
    month: formatMonthLabel(d.month as string),
    contribution: Number(d.contribution_margin) || 0,
  }))

  // Storefront analytics
  const latestAnalytics = analyticsData.at(-1)
  const conversionRate = latestAnalytics
    ? Number(latestAnalytics.conversion_rate) * 100
    : null
  const sessions = latestAnalytics
    ? Number(latestAnalytics.sessions)
    : null

  const conversionChartData = analyticsData.map((d) => ({
    date: formatDateLabel(d.date as string),
    conversion: (Number(d.conversion_rate) || 0) * 100,
  }))

  const sessionsChartData = analyticsData.map((d) => ({
    date: formatDateLabel(d.date as string),
    sessions: Number(d.sessions) || 0,
  }))

  const segmentColor =
    segment === 'faire'
      ? 'hsl(142 71% 45%)'
      : segment === 'direct'
        ? 'hsl(38 92% 50%)'
        : 'hsl(var(--chart-1))'

  return (
    <>
      <PageHeader title="Wholesale Deep Dive" />

      <Suspense fallback={<Skeleton className="mx-6 mb-4 h-10 w-96" />}>
        <SegmentToggle />
      </Suspense>

      <Suspense fallback={<Skeleton className="mx-6 mb-4 h-10 w-96" />}>
        <TimelineFilter
          defaultRange="12m"
          granularityOptions={['weekly', 'monthly']}
        />
      </Suspense>

      {/* KPI Cards */}
      <section className="space-y-4 px-6 pb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            title="Revenue MTD"
            value={formatCurrency(revenueMTD)}
            subtitle={`${currentMonthPrefix} to date`}
          />
          <MetricCard
            title="Orders MTD"
            value={formatCount(ordersMTD)}
            subtitle={`${currentMonthPrefix} to date`}
          />
          <MetricCard
            title="AOV"
            value={ordersMTD > 0 ? formatCurrency(aovMTD) : '\u2014'}
            subtitle="Current period avg order value"
          />
        </div>
      </section>

      {/* Revenue & Orders */}
      <section className="space-y-4 px-6 pb-6">
        <h2 className="text-lg font-semibold">Revenue &amp; Orders</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {segment === 'all' ? (
                <FinAreaChart
                  data={revenueChartData}
                  xKey="date"
                  yKeys={[
                    {
                      key: 'faire',
                      label: 'Faire',
                      color: 'hsl(142 71% 45%)',
                    },
                    {
                      key: 'direct',
                      label: 'Direct',
                      color: 'hsl(38 92% 50%)',
                    },
                  ]}
                  empty={noDaily}
                  gradientFill
                />
              ) : (
                <FinAreaChart
                  data={revenueChartData}
                  xKey="date"
                  yKeys={[
                    {
                      key: 'revenue',
                      label: 'Net Revenue',
                      color: segmentColor,
                    },
                  ]}
                  empty={noDaily}
                  gradientFill
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Count</CardTitle>
            </CardHeader>
            <CardContent>
              <FinBarChart
                data={orderChartData}
                xKey="date"
                yKeys={[
                  {
                    key: 'orders',
                    label: 'Orders',
                    color: segmentColor,
                  },
                ]}
                empty={noDaily}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Profitability */}
      <section className="space-y-4 px-6 pb-6">
        <h2 className="text-lg font-semibold">Profitability</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Gross Margin %</CardTitle>
            </CardHeader>
            <CardContent>
              <FinLineChart
                data={marginChartData}
                xKey="month"
                yKeys={[
                  {
                    key: 'margin',
                    label: 'Gross Margin',
                    color: 'hsl(var(--chart-1))',
                  },
                ]}
                empty={noPnl}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contribution Margin</CardTitle>
            </CardHeader>
            <CardContent>
              <FinAreaChart
                data={contributionData}
                xKey="month"
                yKeys={[
                  {
                    key: 'contribution',
                    label: 'Contribution Margin',
                    color: 'hsl(var(--chart-2))',
                  },
                ]}
                empty={noPnl}
                gradientFill
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Storefront Analytics */}
      <section className="space-y-4 px-6 pb-6">
        <h2 className="text-lg font-semibold">Storefront Analytics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard
            title="Conversion Rate"
            value={
              conversionRate !== null ? formatPercent(conversionRate) : '\u2014'
            }
            subtitle="Sessions to orders (latest day)"
            alert={
              conversionRate !== null
                ? conversionRate < 1.5
                  ? 'red'
                  : conversionRate < 2.5
                    ? 'yellow'
                    : 'green'
                : undefined
            }
          />
          <MetricCard
            title="Sessions"
            value={sessions !== null ? formatCount(sessions) : '\u2014'}
            subtitle="Latest day"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Conversion Rate Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <FinLineChart
                data={conversionChartData}
                xKey="date"
                yKeys={[
                  {
                    key: 'conversion',
                    label: 'Conversion %',
                    color: 'hsl(var(--chart-1))',
                  },
                ]}
                empty={noAnalytics}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sessions Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <FinAreaChart
                data={sessionsChartData}
                xKey="date"
                yKeys={[
                  {
                    key: 'sessions',
                    label: 'Sessions',
                    color: 'hsl(var(--chart-3))',
                  },
                ]}
                empty={noAnalytics}
                gradientFill
              />
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  )
}
