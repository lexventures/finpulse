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
import { calcBlendedCac } from '@/lib/calculations/cac'
import { calcSimplifiedLtv, calcLtvCacRatio, calcPaybackPeriod } from '@/lib/calculations/ltv'
import { calcMer } from '@/lib/calculations/mer'

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

export default async function DTCPage(props: {
  searchParams: Promise<Record<string, string>>
}) {
  const searchParams = await props.searchParams
  const rangeParam = searchParams.range || '90d'
  const range: DatePreset = VALID_RANGES.has(rangeParam)
    ? (rangeParam as DatePreset)
    : '90d'

  const { start } = getDateRange(range)
  const startDate = toISODate(start)

  const supabase = createServiceClient()
  const [pnlResult, dailyResult, membershipResult, analyticsResult] = await Promise.all([
    supabase
      .from('fin_kpi_monthly')
      .select('month, net_revenue, gross_margin_pct, contribution_margin, allocated_ad_spend, is_partial')
      .eq('channel', 'dtc')
      .gte('month', startDate)
      .order('month', { ascending: true }),
    supabase
      .from('fin_revenue_daily')
      .select('*')
      .eq('channel', 'dtc')
      .gte('date', startDate)
      .order('date', { ascending: true }),
    supabase
      .from('fin_membership_snapshot')
      .select('*')
      .gte('date', startDate)
      .order('date', { ascending: true }),
    supabase
      .from('fin_shopify_analytics')
      .select('*')
      .eq('store', 'emilylex')
      .gte('date', startDate)
      .order('date', { ascending: true }),
  ])

  const pnlData = pnlResult.data ?? []
  const dailyData = dailyResult.data ?? []
  const membershipData = membershipResult.data ?? []
  const analyticsData = analyticsResult.data ?? []
  const noDaily = dailyData.length === 0
  const noPnl = pnlData.length === 0
  const noMembership = membershipData.length === 0
  const noAnalytics = analyticsData.length === 0

  // Revenue trend
  const revenueChartData = dailyData.map((d) => ({
    date: formatDateLabel(d.date as string),
    revenue: Number(d.net_revenue) || 0,
  }))

  // AOV trend
  const aovChartData = dailyData.map((d) => ({
    date: formatDateLabel(d.date as string),
    aov: Number(d.avg_order_value) || 0,
  }))

  // Order count
  const orderChartData = dailyData.map((d) => ({
    date: formatDateLabel(d.date as string),
    orders: Number(d.order_count) || 0,
  }))

  // New vs returning orders
  const newReturningData = dailyData.map((d) => ({
    date: formatDateLabel(d.date as string),
    new: Number(d.new_customer_orders) || 0,
    returning: Number(d.returning_customer_orders) || 0,
  }))

  // Gross margin % (monthly)
  const marginChartData = pnlData.map((d) => ({
    month: formatMonthLabel(d.month as string),
    margin: Number(d.gross_margin_pct) || 0,
  }))

  // Contribution margin (monthly)
  const contributionData = pnlData.map((d) => ({
    month: formatMonthLabel(d.month as string),
    contribution: Number(d.contribution_margin) || 0,
  }))

  // Membership metrics
  const latestMembership = membershipData.at(-1)
  const prevMembership =
    membershipData.length >= 2 ? membershipData.at(-2) : null

  const activeMembers = latestMembership
    ? Number(latestMembership.active_members) || 0
    : null

  const churnPct =
    prevMembership &&
    latestMembership &&
    Number(prevMembership.active_members) > 0
      ? ((Number(prevMembership.active_members) -
          Number(latestMembership.active_members)) /
          Number(prevMembership.active_members)) *
        100
      : null

  const memberRev = latestMembership
    ? Number(latestMembership.member_revenue) || 0
    : 0
  const nonMemberRev = latestMembership
    ? Number(latestMembership.non_member_revenue) || 0
    : 0
  const totalMembershipRev = memberRev + nonMemberRev
  const memberRevPct =
    totalMembershipRev > 0 ? (memberRev / totalMembershipRev) * 100 : null

  // Member vs non-member AOV
  const memberAovData = membershipData.map((d) => ({
    date: formatDateLabel(d.date as string),
    member: Number(d.member_avg_order_value) || 0,
    nonMember: Number(d.non_member_avg_order_value) || 0,
  }))

  // --- Acquisition & Unit Economics ---
  const now = new Date()
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastFullMonthDate = new Date(now.getFullYear(), now.getMonth(), 0)
  const lastFullMonthStr = `${lastFullMonthDate.getFullYear()}-${String(lastFullMonthDate.getMonth() + 1).padStart(2, '0')}`

  const lastFullMonthPnl = pnlData.filter(
    (d) => (d.month as string).startsWith(lastFullMonthStr)
  )
  const currentMonthPnl = pnlData.filter(
    (d) => (d.month as string).startsWith(currentMonthStr)
  )

  const lastFullMonthAdSpend = lastFullMonthPnl.reduce(
    (s, d) => s + (Number(d.allocated_ad_spend) || 0), 0
  )
  const lastFullMonthNewCusts = dailyData
    .filter((d) => (d.date as string).startsWith(lastFullMonthStr))
    .reduce((s, d) => s + (Number(d.new_customer_orders) || 0), 0)

  const blendedCac = calcBlendedCac(
    Math.abs(lastFullMonthAdSpend),
    lastFullMonthNewCusts
  )

  const currentMonthRevenue = currentMonthPnl.reduce(
    (s, d) => s + (Number(d.net_revenue) || 0), 0
  )
  const currentMonthAdSpend = currentMonthPnl.reduce(
    (s, d) => s + (Number(d.allocated_ad_spend) || 0), 0
  )
  const mer = calcMer(currentMonthRevenue, Math.abs(currentMonthAdSpend))

  const latestGrossMargin = pnlData.at(-1)
    ? Number(pnlData.at(-1)!.gross_margin_pct) || 50
    : 50

  function ltvForHorizon(months: number) {
    const sorted = [...pnlData].sort((a, b) =>
      (a.month as string).localeCompare(b.month as string)
    )
    const horizon = sorted.slice(-months)
    const rev = horizon.reduce((s, d) => s + (Number(d.net_revenue) || 0), 0)
    const daysInHorizon = dailyData.filter((d) => {
      const m = (d.date as string).slice(0, 7)
      return horizon.some((h) => (h.month as string).startsWith(m))
    })
    const newCusts = daysInHorizon.reduce(
      (s, d) => s + (Number(d.new_customer_orders) || 0), 0
    )
    return calcSimplifiedLtv(rev, newCusts, latestGrossMargin)
  }

  const ltv12 = ltvForHorizon(12)
  const ltv6 = ltvForHorizon(6)
  const ltv3 = ltvForHorizon(3)

  const ltvCacRatio = calcLtvCacRatio(ltv12, blendedCac)

  const totalDailyRev = dailyData.reduce(
    (s, d) => s + (Number(d.net_revenue) || 0), 0
  )
  const totalNewCusts = dailyData.reduce(
    (s, d) => s + (Number(d.new_customer_orders) || 0), 0
  )
  const avgDailyRevPerCust =
    dailyData.length > 0 && totalNewCusts > 0
      ? totalDailyRev / dailyData.length / totalNewCusts
      : 0
  const paybackPeriod = calcPaybackPeriod(
    blendedCac,
    avgDailyRevPerCust,
    latestGrossMargin
  )

  const adSpendChartData = pnlData.map((d) => ({
    month: formatMonthLabel(d.month as string),
    adSpend: Math.abs(Number(d.allocated_ad_spend) || 0),
  }))

  // Funnel & conversion metrics
  const latestAnalytics = analyticsData.at(-1)
  const conversionRate = latestAnalytics ? Number(latestAnalytics.conversion_rate) * 100 : null
  const cartAbandonmentRate = latestAnalytics ? Number(latestAnalytics.cart_abandonment_rate) * 100 : null

  const conversionChartData = analyticsData.map((d) => ({
    date: formatDateLabel(d.date as string),
    conversion: (Number(d.conversion_rate) || 0) * 100,
  }))

  const sessionsChartData = analyticsData.map((d) => ({
    date: formatDateLabel(d.date as string),
    sessions: Number(d.sessions) || 0,
  }))

  return (
    <>
      <PageHeader title="DTC Deep Dive" />

      <Suspense fallback={<Skeleton className="mx-6 mb-4 h-10 w-96" />}>
        <TimelineFilter
          defaultRange="90d"
          granularityOptions={['daily', 'weekly', 'monthly']}
          showComparison
        />
      </Suspense>

      <section className="space-y-4 px-6 pb-6">
        <h2 className="text-lg font-semibold">Revenue &amp; Growth</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <FinAreaChart
                data={revenueChartData}
                xKey="date"
                yKeys={[
                  {
                    key: 'revenue',
                    label: 'Net Revenue',
                    color: 'hsl(var(--chart-1))',
                  },
                ]}
                empty={noDaily}
                gradientFill
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AOV Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <FinLineChart
                data={aovChartData}
                xKey="date"
                yKeys={[
                  {
                    key: 'aov',
                    label: 'Avg Order Value',
                    color: 'hsl(var(--chart-2))',
                  },
                ]}
                empty={noDaily}
              />
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
                    color: 'hsl(var(--chart-3))',
                  },
                ]}
                empty={noDaily}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>New vs Returning Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <FinBarChart
                data={newReturningData}
                xKey="date"
                yKeys={[
                  {
                    key: 'new',
                    label: 'New Customers',
                    color: 'hsl(var(--chart-1))',
                    stackId: 'orders',
                  },
                  {
                    key: 'returning',
                    label: 'Returning',
                    color: 'hsl(var(--chart-4))',
                    stackId: 'orders',
                  },
                ]}
                empty={noDaily}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4 px-6 pb-6">
        <h2 className="text-lg font-semibold">Funnel &amp; Conversion</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard
            title="Conversion Rate"
            value={conversionRate !== null ? formatPercent(conversionRate) : '\u2014'}
            subtitle="Sessions to orders"
            alert={conversionRate !== null ? (conversionRate < 1.5 ? 'red' : conversionRate < 2.5 ? 'yellow' : 'green') : undefined}
          />
          <MetricCard
            title="Cart Abandonment"
            value={cartAbandonmentRate !== null ? formatPercent(cartAbandonmentRate) : '\u2014'}
            subtitle="Carts not completed"
            alert={cartAbandonmentRate !== null ? (cartAbandonmentRate > 80 ? 'red' : cartAbandonmentRate > 70 ? 'yellow' : 'green') : undefined}
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
                yKeys={[{ key: 'conversion', label: 'Conversion %', color: 'hsl(var(--chart-1))' }]}
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
                yKeys={[{ key: 'sessions', label: 'Sessions', color: 'hsl(var(--chart-3))' }]}
                empty={noAnalytics}
                gradientFill
              />
            </CardContent>
          </Card>
        </div>
      </section>

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
                referenceLines={[
                  { y: 45, label: 'Min 45%', color: 'hsl(0 84% 60%)' },
                  { y: 55, label: 'Target 55%', color: 'hsl(142 71% 45%)' },
                ]}
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

      <section className="space-y-4 px-6 pb-6">
        <h2 className="text-lg font-semibold">Acquisition &amp; Unit Economics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Blended CAC"
            value={blendedCac !== null ? formatCurrency(blendedCac) : '\u2014'}
            subtitle={lastFullMonthNewCusts > 0
              ? `${formatCount(lastFullMonthNewCusts)} new customers`
              : 'No new customer data'}
            alert={blendedCac !== null
              ? blendedCac > 60 ? 'red' : blendedCac > 40 ? 'yellow' : 'green'
              : undefined}
          />
          <MetricCard
            title="MER"
            value={mer !== null ? `${mer.toFixed(1)}x` : '\u2014'}
            subtitle="Revenue / Ad Spend"
            alert={mer !== null
              ? mer < 3 ? 'red' : mer < 5 ? 'yellow' : 'green'
              : undefined}
          />
          <MetricCard
            title="LTV:CAC Ratio"
            value={ltvCacRatio !== null ? `${ltvCacRatio.toFixed(1)}x` : '\u2014'}
            subtitle="12-month LTV basis"
            alert={ltvCacRatio !== null
              ? ltvCacRatio < 3 ? 'red' : ltvCacRatio < 5 ? 'yellow' : 'green'
              : undefined}
          />
          <MetricCard
            title="Payback Period"
            value={paybackPeriod !== null ? `${Math.round(paybackPeriod)}d` : '\u2014'}
            subtitle="Days to recover CAC"
            alert={paybackPeriod !== null
              ? paybackPeriod > 120 ? 'red' : paybackPeriod > 60 ? 'yellow' : 'green'
              : undefined}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>LTV by Horizon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-8">
              {([
                { label: '12 mo', value: ltv12 },
                { label: '6 mo', value: ltv6 },
                { label: '3 mo', value: ltv3 },
              ] as const).map((h) => (
                <div key={h.label} className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">{h.label}</span>
                  <span className="text-xl font-bold">
                    {h.value !== null ? formatCurrency(h.value) : '\u2014'}
                  </span>
                </div>
              ))}
              {ltv3 !== null && ltv12 !== null && ltv12 !== 0 && (
                <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <span>3mo vs 12mo:</span>
                  <span className={ltv3 >= ltv12 ? 'text-emerald-600' : 'text-red-600'}>
                    {ltv3 >= ltv12 ? '\u2191' : '\u2193'}{' '}
                    {formatPercent(Math.abs((ltv3 / ltv12 - 1) * 100))}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ad Spend Trend (Monthly)</CardTitle>
          </CardHeader>
          <CardContent>
            <FinBarChart
              data={adSpendChartData}
              xKey="month"
              yKeys={[
                {
                  key: 'adSpend',
                  label: 'Ad Spend',
                  color: 'hsl(var(--chart-5))',
                },
              ]}
              empty={noPnl}
            />
          </CardContent>
        </Card>

        <MetricCard
          title="Email Revenue % of DTC"
          value="\u2014"
          subtitle="Email revenue tracking \u2014 coming soon"
          className="border-dashed"
        />
      </section>

      <section className="space-y-4 px-6 pb-6">
        <h2 className="text-lg font-semibold">Email/SMS (Retention)</h2>
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              Email revenue attribution via Shopify Analytics referring_channel coming in next
              update. For campaign performance, see Klaviyo.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4 px-6 pb-6">
        <h2 className="text-lg font-semibold">Membership</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            title="Active Members"
            value={activeMembers !== null ? formatCount(activeMembers) : '\u2014'}
          />
          <MetricCard
            title="Monthly Churn %"
            value={churnPct !== null ? formatPercent(churnPct) : '\u2014'}
            alert={
              churnPct !== null
                ? churnPct > 5
                  ? 'red'
                  : churnPct > 3
                    ? 'yellow'
                    : 'green'
                : undefined
            }
          />
          <MetricCard
            title="Member Revenue %"
            value={memberRevPct !== null ? formatPercent(memberRevPct) : '\u2014'}
            subtitle={
              memberRevPct !== null
                ? `${formatCurrency(memberRev)} of ${formatCurrency(totalMembershipRev)}`
                : undefined
            }
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Member vs Non-Member AOV</CardTitle>
          </CardHeader>
          <CardContent>
            <FinBarChart
              data={memberAovData}
              xKey="date"
              yKeys={[
                {
                  key: 'member',
                  label: 'Member AOV',
                  color: 'hsl(var(--chart-1))',
                },
                {
                  key: 'nonMember',
                  label: 'Non-Member AOV',
                  color: 'hsl(var(--chart-3))',
                },
              ]}
              empty={noMembership}
            />
          </CardContent>
        </Card>
      </section>
    </>
  )
}
