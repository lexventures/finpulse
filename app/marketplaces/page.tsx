export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { MetricCard } from '@/components/cards/metric-card'
import { FinAreaChart } from '@/components/charts/area-chart'
import { FinLineChart } from '@/components/charts/line-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatCompact,
  formatPercent,
  formatCurrency,
} from '@/lib/utils/format'

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export default async function MarketplacesPage() {
  const supabase = createServiceClient()

  const [marketplaceResult, companyResult] = await Promise.all([
    supabase
      .from('fin_kpi_monthly')
      .select('month, net_revenue, gross_margin_pct, contribution_margin, is_partial')
      .eq('channel', 'marketplace')
      .order('month', { ascending: true }),
    supabase
      .from('fin_kpi_monthly')
      .select('month, net_revenue')
      .eq('channel', 'company')
      .order('month', { ascending: true }),
  ])

  const pnlData = marketplaceResult.data ?? []
  const companyData = companyResult.data ?? []
  const noPnl = pnlData.length === 0

  const now = new Date()
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const latestRow = pnlData.at(-1)
  const currentMonthRow = pnlData.find((d) =>
    (d.month as string).startsWith(currentMonthPrefix)
  )
  const mtdRow = currentMonthRow ?? latestRow

  const revenueMTD = mtdRow ? Number(mtdRow.net_revenue) || null : null
  const grossMarginPct = mtdRow ? Number(mtdRow.gross_margin_pct) || null : null

  const mtdMonth = mtdRow?.month as string | undefined
  const companyRow = mtdMonth
    ? companyData.find((c) => c.month === mtdMonth)
    : null
  const companyRevenue = companyRow ? Number(companyRow.net_revenue) || 0 : 0
  const revenueAsPctOfTotal =
    revenueMTD !== null && companyRevenue > 0
      ? (revenueMTD / companyRevenue) * 100
      : null

  const revenueChartData = pnlData.map((d) => ({
    month: formatMonthLabel(d.month as string),
    revenue: Number(d.net_revenue) || 0,
  }))

  const contributionData = pnlData.map((d) => ({
    month: formatMonthLabel(d.month as string),
    contribution: Number(d.contribution_margin) || 0,
  }))

  return (
    <>
      <PageHeader title="Marketplaces" />

      <section className="space-y-4 px-6 pb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            title="Revenue MTD"
            value={formatCurrency(revenueMTD)}
            subtitle={mtdMonth ? formatMonthLabel(mtdMonth) : undefined}
          />
          <MetricCard
            title="Gross Margin %"
            value={grossMarginPct !== null ? formatPercent(grossMarginPct) : '\u2014'}
            alert={
              grossMarginPct !== null
                ? grossMarginPct < 30
                  ? 'red'
                  : grossMarginPct < 45
                    ? 'yellow'
                    : 'green'
                : undefined
            }
          />
          <MetricCard
            title="Revenue as % of Total"
            value={
              revenueAsPctOfTotal !== null
                ? formatPercent(revenueAsPctOfTotal)
                : '\u2014'
            }
            subtitle={
              companyRevenue > 0
                ? `${formatCompact(revenueMTD)} of ${formatCompact(companyRevenue)}`
                : undefined
            }
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <FinAreaChart
              data={revenueChartData}
              xKey="month"
              yKeys={[
                {
                  key: 'revenue',
                  label: 'Net Revenue',
                  color: 'hsl(210 70% 55%)',
                },
              ]}
              empty={noPnl}
              gradientFill
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contribution Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <FinLineChart
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
            />
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              This page launches thin. Data enriches as Amazon is connected to
              Finaloop.
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  )
}
