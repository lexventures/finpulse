export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { MetricCard } from '@/components/cards/metric-card'
import { FinLineChart } from '@/components/charts/line-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatCurrency,
  formatPercent,
  formatCount,
  formatCompact,
} from '@/lib/utils/format'
import { PinGate } from './pin-gate'
import { EmployeeTable } from './employee-table'
import { isPageProtected } from '@/lib/pin-protection'

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export default async function TeamPage() {
  const cookieStore = await cookies()
  const pinVerified = cookieStore.get('pin_verified')
  const needsPin = await isPageProtected('/team')

  if (needsPin && !pinVerified) {
    return (
      <>
        <PageHeader title="Headcount & Labor" />
        <PinGate />
      </>
    )
  }

  const supabase = createServiceClient()

  const [headcountResult, pnlResult] = await Promise.all([
    supabase
      .from('fin_headcount')
      .select('*')
      .eq('is_active', true)
      .order('start_date', { ascending: true }),
    supabase
      .from('fin_pnl_monthly')
      .select('*')
      .eq('channel', 'company')
      .order('month', { ascending: true }),
  ])

  const headcount = headcountResult.data ?? []
  const pnlData = pnlResult.data ?? []
  const noPnl = pnlData.length === 0

  const headcountCount = headcount.length
  const totalPayroll = headcount.reduce(
    (sum, e) => sum + (Number(e.fully_loaded_annual) || 0),
    0
  )
  const monthlyPayroll = totalPayroll / 12

  const latestPnl = pnlData.at(-1)
  const latestRevenue = latestPnl ? Number(latestPnl.net_revenue) || 0 : 0
  const annualizedRevenue = latestRevenue * 12
  const revenuePerEmployee =
    headcountCount > 0 ? annualizedRevenue / headcountCount : null

  const laborPctOfRevenue =
    latestRevenue > 0 ? (monthlyPayroll / latestRevenue) * 100 : null

  const revPerEmployeeData = pnlData.map((d) => {
    const monthEnd = new Date((d.month as string) + '-01')
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    monthEnd.setDate(0)
    const hcAtMonth = headcount.filter(
      (e) => new Date(e.start_date as string) <= monthEnd
    ).length
    const monthlyRev = Number(d.net_revenue) || 0
    return {
      month: formatMonthLabel(d.month as string),
      revPerEmployee: hcAtMonth > 0 ? (monthlyRev * 12) / hcAtMonth : 0,
    }
  })

  const laborPctData = pnlData.map((d) => {
    const monthEnd = new Date((d.month as string) + '-01')
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    monthEnd.setDate(0)
    const laborAtMonth = headcount
      .filter((e) => new Date(e.start_date as string) <= monthEnd)
      .reduce((sum, e) => sum + (Number(e.fully_loaded_annual) || 0) / 12, 0)
    const monthlyRev = Number(d.net_revenue) || 0
    return {
      month: formatMonthLabel(d.month as string),
      laborPct: monthlyRev > 0 ? (laborAtMonth / monthlyRev) * 100 : 0,
    }
  })

  const headcountOverTime = pnlData.map((d) => {
    const monthEnd = new Date((d.month as string) + '-01')
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    monthEnd.setDate(0)
    return {
      month: formatMonthLabel(d.month as string),
      headcount: headcount.filter(
        (e) => new Date(e.start_date as string) <= monthEnd
      ).length,
    }
  })

  const employees = headcount.map((e) => ({
    id: e.id as string,
    name: e.name as string,
    role: e.role as string,
    fully_loaded_annual: Number(e.fully_loaded_annual) || 0,
    start_date: e.start_date as string,
  }))

  return (
    <>
      <PageHeader title="Headcount & Labor" />

      <section className="space-y-4 px-6 pb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            title="Headcount"
            value={formatCount(headcountCount)}
            subtitle="Active employees"
          />
          <MetricCard
            title="Revenue per Employee"
            value={
              revenuePerEmployee !== null
                ? formatCompact(revenuePerEmployee)
                : '\u2014'
            }
            subtitle="Annualized"
            alert={
              revenuePerEmployee !== null
                ? revenuePerEmployee < 200_000
                  ? 'red'
                  : revenuePerEmployee < 350_000
                    ? 'yellow'
                    : 'green'
                : undefined
            }
          />
          <MetricCard
            title="Labor % of Revenue"
            value={
              laborPctOfRevenue !== null
                ? formatPercent(laborPctOfRevenue)
                : '\u2014'
            }
            alert={
              laborPctOfRevenue !== null
                ? laborPctOfRevenue > 25
                  ? 'red'
                  : laborPctOfRevenue > 20
                    ? 'yellow'
                    : 'green'
                : undefined
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue per Employee</CardTitle>
            </CardHeader>
            <CardContent>
              <FinLineChart
                data={revPerEmployeeData}
                xKey="month"
                yKeys={[
                  {
                    key: 'revPerEmployee',
                    label: 'Rev / Employee',
                    color: 'hsl(var(--chart-1))',
                  },
                ]}
                empty={noPnl}
                referenceLines={[
                  {
                    y: 4_000_000,
                    label: '$4M benchmark',
                    color: 'hsl(142 71% 45%)',
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Labor % of Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <FinLineChart
                data={laborPctData}
                xKey="month"
                yKeys={[
                  {
                    key: 'laborPct',
                    label: 'Labor %',
                    color: 'hsl(var(--chart-3))',
                  },
                ]}
                empty={noPnl}
                referenceLines={[
                  { y: 20, label: '20% target', color: 'hsl(38 92% 50%)' },
                  { y: 25, label: '25% max', color: 'hsl(0 84% 60%)' },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Headcount Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <FinLineChart
              data={headcountOverTime}
              xKey="month"
              yKeys={[
                {
                  key: 'headcount',
                  label: 'Headcount',
                  color: 'hsl(var(--chart-4))',
                },
              ]}
              empty={noPnl}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <EmployeeTable employees={employees} />
          </CardContent>
        </Card>
      </section>
    </>
  )
}
