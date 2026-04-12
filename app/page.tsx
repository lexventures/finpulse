export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Settings } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ForecastComboChart } from '@/components/charts/forecast-combo-chart'
import { WaterfallChart } from '@/components/charts/waterfall-chart'
import { GroupedBarChart } from '@/components/charts/grouped-bar-chart'
import { DualAxisLineChart } from '@/components/charts/dual-axis-line-chart'
import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart'
import { BurnRateChart } from '@/components/charts/burn-rate-chart'
import { RunwayAreaChart } from '@/components/charts/runway-area-chart'

const WEEKS_PER_MONTH = 4.33

function fmt(n: number | null | undefined): string {
  if (n == null) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n < 0 ? '-' : '') + '$' + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return (n < 0 ? '-' : '') + '$' + Math.round(abs / 1_000).toLocaleString() + 'k' 
  return '$' + Math.round(n).toLocaleString()
}

function fmtFull(n: number | null | undefined): string {
  if (n == null) return '$0'
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '0%'
  return n.toFixed(1) + '%'
}

function daysBetween(a: string, b: Date): number {
  const d = new Date(a)
  return Math.max(0, Math.floor((b.getTime() - d.getTime()) / 86_400_000))
}

function ageBucket(days: number): string {
  if (days <= 30) return '0-30 days'
  if (days <= 60) return '31-60 days'
  if (days <= 90) return '61-90 days'
  return '90+ days'
}

interface PnlRow {
  month: string
  channel: string
  gross_revenue: number
  net_revenue: number
  returns: number
  discounts: number
  selling_fees: number
  processing_fees: number
  shipping_income: number
  other_income_expenses: number
  cogs: number
  total_opex: number
  is_partial: boolean
}

interface BsRow {
  month: string
  cash_and_equivalents: number
  inventory_value: number
}

interface CfRow {
  month: string
  net_cash_flow: number
  sales_tax_payments: number
  ending_cash: number
}

interface ApRow {
  id: string
  vendor: string
  po_reference: string | null
  item_type: string
  created_at: string
  amount: number
}

interface ArRow {
  id: string
  customer_name: string
  channel: string | null
  terms: string
  order_id: string
  order_date: string
  amount: number
}

interface ShopifyDaily {
  incoming_inventory_value: number
}

export default async function DashboardPage() {
  const supabase = createServiceClient()

  const [pnlRes, bsRes, cfRes, apRes, arRes, sdRes] = await Promise.all([
    supabase
      .from('fin_pnl_monthly')
      .select('month, channel, gross_revenue, net_revenue, returns, discounts, selling_fees, processing_fees, shipping_income, other_income_expenses, cogs, total_opex, is_partial')
      .order('month', { ascending: false })
      .limit(200),
    supabase
      .from('fin_balance_sheet_monthly')
      .select('month, cash_and_equivalents, inventory_value')
      .order('month', { ascending: false })
      .limit(24),
    supabase
      .from('fin_cashflow_monthly')
      .select('month, net_cash_flow, sales_tax_payments, ending_cash')
      .order('month', { ascending: false })
      .limit(24),
    supabase
      .from('fin_ap_aging')
      .select('*')
      .order('amount', { ascending: true }),
    supabase
      .from('fin_ar_aging')
      .select('*')
      .order('amount', { ascending: true }),
    supabase
      .from('fin_shopify_daily')
      .select('incoming_inventory_value')
      .order('date', { ascending: false })
      .limit(1),
  ])

  const pnl = (pnlRes.data ?? []) as PnlRow[]
  const bs = (bsRes.data ?? []) as BsRow[]
  const cf = (cfRes.data ?? []) as CfRow[]
  const apAging = (apRes.data ?? []) as ApRow[]
  const arAging = (arRes.data ?? []) as ArRow[]
  const shopifyDaily = (sdRes.data ?? [])[0] as ShopifyDaily | undefined

  // ---- KPI HEADER CALCULATIONS ----
  const latestBs = bs[0]
  const cashPosition = latestBs?.cash_and_equivalents ?? 0
  const inventoryValue = latestBs?.inventory_value ?? 0
  const fivePercentReserve = inventoryValue * 0.05

  const completedCf = cf.filter((_r, i) => i > 0 || true).slice(0, 3)
  const avgNetCashFlow = completedCf.length > 0
    ? completedCf.reduce((s, r) => s + (r.net_cash_flow ?? 0), 0) / completedCf.length
    : 0
  const weeklyBurnRate = Math.abs(avgNetCashFlow) / WEEKS_PER_MONTH
  const runwayWeeks = weeklyBurnRate > 0 ? Math.floor(cashPosition / weeklyBurnRate) : 999

  const totalApOutstanding = apAging.reduce((s, r) => s + Math.abs(r.amount), 0)

  const companyPnl = pnl.filter((r) => r.channel === 'company' && !r.is_partial)
  const latestCompanyPnl = companyPnl[0]
  const grossToNetPct = latestCompanyPnl && latestCompanyPnl.gross_revenue > 0
    ? (latestCompanyPnl.net_revenue / latestCompanyPnl.gross_revenue) * 100
    : 0

  // ---- 13-WEEK CASH FLOW FORECAST ----
  const trailing3Pnl = companyPnl.slice(0, 3)
  const avgRevenue = trailing3Pnl.length > 0
    ? trailing3Pnl.reduce((s, r) => s + r.net_revenue, 0) / trailing3Pnl.length
    : 0
  const avgOpex = trailing3Pnl.length > 0
    ? trailing3Pnl.reduce((s, r) => s + Math.abs(r.total_opex), 0) / trailing3Pnl.length
    : 0
  const trailing3Cf = cf.slice(0, 3)
  const avgTax = trailing3Cf.length > 0
    ? trailing3Cf.reduce((s, r) => s + Math.abs(r.sales_tax_payments ?? 0), 0) / trailing3Cf.length
    : 0

  const weeklyInflow = avgRevenue / WEEKS_PER_MONTH
  const weeklyOpex = avgOpex / WEEKS_PER_MONTH
  const weeklyPo = (shopifyDaily?.incoming_inventory_value ?? 0) / 13
  const weeklyTax = avgTax / WEEKS_PER_MONTH

  const startingCash = cf[0]?.ending_cash ?? cashPosition
  const forecastData = Array.from({ length: 13 }, (_, i) => {
    const weekNum = i + 1
    const now = new Date()
    const weekStart = new Date(now.getTime() + i * 7 * 86_400_000)
    const label = `Wk ${weekNum} ${(weekStart.getMonth() + 1)}/${weekStart.getDate()}`
    const cumInflows = weeklyInflow * weekNum
    const cumOutflows = (weeklyOpex + weeklyPo + weeklyTax) * weekNum
    const projectedBalance = startingCash + cumInflows - cumOutflows
    return {
      label,
      grossInflow: Math.round(weeklyInflow),
      openingBalance: Math.round(i === 0 ? startingCash : startingCash + weeklyInflow * i - (weeklyOpex + weeklyPo + weeklyTax) * i),
      cashInflows: Math.round(weeklyInflow),
      operatingOutflows: Math.round(weeklyOpex),
      poPayments: Math.round(weeklyPo),
      taxReserves: Math.round(weeklyTax),
      projectedBalance: Math.round(projectedBalance),
    }
  })

  // ---- GROSS-TO-NET REVENUE BRIDGE ----
  const bridgeData = latestCompanyPnl ? [
    { name: 'Gross Revenue', value: latestCompanyPnl.gross_revenue },
    { name: 'Returns', value: -(Math.abs(latestCompanyPnl.returns)) },
    { name: 'Discounts', value: -(Math.abs(latestCompanyPnl.discounts)) },
    { name: 'Faire Fees', value: -(Math.abs(latestCompanyPnl.selling_fees)) },
    { name: 'Shopify Fees', value: -(Math.abs(latestCompanyPnl.processing_fees) * 0.4) },
    { name: 'Payment Processing', value: -(Math.abs(latestCompanyPnl.processing_fees) * 0.6) },
    { name: 'Adjustments', value: latestCompanyPnl.other_income_expenses },
    { name: 'Shipping Revenue', value: Math.abs(latestCompanyPnl.shipping_income) },
    { name: 'Net Revenue', value: latestCompanyPnl.net_revenue, isTotal: true },
  ] : []

  // ---- REVENUE LEAKAGE BY CHANNEL ----
  const channelNames: Record<string, string> = {
    dtc: 'Shopify DTC',
    wholesale_faire: 'Faire Wholesale',
    wholesale_direct: 'Direct Wholesale',
    wholesale_key: 'Key Accounts',
    retail: 'Retail',
    marketplace: 'Marketplaces',
  }
  const latestMonth = companyPnl[0]?.month
  const channelPnlLatest = latestMonth
    ? pnl.filter((r) => r.month === latestMonth && r.channel !== 'company' && r.channel !== 'wholesale' && r.gross_revenue > 0)
    : []
  const leakageData = channelPnlLatest.map((r) => ({
    channel: channelNames[r.channel] ?? r.channel,
    grossRevenue: r.gross_revenue,
    netRevenue: r.net_revenue,
    retentionPct: r.gross_revenue > 0 ? (r.net_revenue / r.gross_revenue) * 100 : 0,
  }))

  // ---- GROSS-TO-NET TREND (MONTHLY) ----
  const trendMonths = companyPnl.slice(0, 12).reverse()
  const trendData = trendMonths.map((r) => ({
    month: new Date(r.month + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    netRetentionPct: r.gross_revenue > 0 ? (r.net_revenue / r.gross_revenue) * 100 : 0,
    totalLeakage: r.gross_revenue - r.net_revenue,
  }))

  // ---- MONTHLY BURN RATE TREND ----
  const burnMonths = companyPnl.slice(0, 12).reverse()
  const burnData = burnMonths.map((r) => ({
    month: new Date(r.month + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short' }),
    amount: Math.abs(r.total_opex) + Math.abs(r.cogs),
  }))

  // ---- RUNWAY PROJECTION ----
  const latestBurn = burnData.length > 0 ? burnData[burnData.length - 1].amount : 0
  const runwayData = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() + i)
    return {
      month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      balance: Math.max(0, cashPosition - latestBurn * i),
    }
  })
  const dangerBalance = latestBurn * 2

  // ---- AP AGING BUCKETS ----
  const now = new Date()
  const apBuckets = new Map<string, number>()
  for (const item of apAging) {
    const days = daysBetween(item.created_at, now)
    const bucket = ageBucket(days)
    apBuckets.set(bucket, (apBuckets.get(bucket) ?? 0) + Math.abs(item.amount))
  }
  const apBucketData = ['0-30 days', '31-60 days', '61-90 days', '90+ days'].map((bucket) => ({
    bucket,
    amount: apBuckets.get(bucket) ?? 0,
  }))

  // ---- AR AGING BUCKETS ----
  const arBuckets = new Map<string, number>()
  const totalArOutstanding = arAging.reduce((s, r) => s + Math.abs(r.amount), 0)
  for (const item of arAging) {
    const days = daysBetween(item.order_date, now)
    const bucket = ageBucket(days)
    arBuckets.set(bucket, (arBuckets.get(bucket) ?? 0) + Math.abs(item.amount))
  }
  const arBucketData = ['0-30 days', '31-60 days', '61-90 days', '90+ days'].map((bucket) => ({
    bucket,
    amount: arBuckets.get(bucket) ?? 0,
  }))

  // ---- CASH POSITION SUMMARY ----
  const lowestForecast = Math.min(...forecastData.map((w) => w.projectedBalance))
  const netTaxReserve = weeklyTax * 13
  const weeklyBurnNet = weeklyOpex + weeklyPo + weeklyTax
  const weeksOfRunway = weeklyBurnNet > 0 ? Math.floor(cashPosition / weeklyBurnNet) : 999

  const summaryHealthy = lowestForecast > 0 && runwayWeeks > 8
  const summaryColor = summaryHealthy ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Bar */}
      <div className="bg-[#e8594f] text-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Financial Health Dashboard</h1>
            <p className="text-xs text-white/80 mt-0.5">
              13-Week Cash Flow &middot; Gross-to-Net Bridge &middot; AP/AR Aging &middot; Burn Rate &middot; Runway &middot; Tax Reserve
            </p>
          </div>
          <Link
            href="/settings"
            className="p-2 rounded-lg hover:bg-white/20 transition-colors"
            title="Settings"
          >
            <Settings className="size-5" />
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Section 1: KPI Header Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard label="CASH POSITION" value={fmtFull(cashPosition)} sub="Current bank balance" color="blue" />
          <KpiCard label="WEEKLY BURN RATE" value={`${fmtFull(weeklyBurnRate)}/wk`} sub={`Avg cash out / week (${WEEKS_PER_MONTH.toFixed(1)} wks)`} color="red" />
          <KpiCard label="RUNWAY" value={`${runwayWeeks} weeks`} sub={`Weeks until cash = $0`} color={runwayWeeks > 12 ? 'green' : runwayWeeks > 8 ? 'yellow' : 'red'} />
          <KpiCard label="TOTAL AP OUTSTANDING" value={fmtFull(totalApOutstanding)} sub="Vendor bills + open POs" color="orange" />
          <KpiCard label="GROSS-TO-NET" value={fmtPct(grossToNetPct)} sub="Revenue retention ratio" color="blue" />
        </div>

        {/* Section 2: 13-Week Cash Flow Forecast */}
        <Card>
          <CardHeader>
            <CardTitle>13-Week Cash Flow Forecast</CardTitle>
            <CardDescription>Projected weekly cash inflows, outflows, and running balance. Cash-at-risk line = break-even ($0).</CardDescription>
          </CardHeader>
          <CardContent>
            <ForecastComboChart data={forecastData} />
          </CardContent>
        </Card>

        {/* Section 3: Gross-to-Net Revenue Bridge */}
        <Card>
          <CardHeader>
            <CardTitle>Gross-to-Net Revenue Bridge &mdash; Last 30 Days</CardTitle>
            <CardDescription>Where your top-line revenue goes before it hits the bank. Each bar shows what&apos;s subtracted from gross sales to arrive at net cash collected.</CardDescription>
          </CardHeader>
          <CardContent>
            {bridgeData.length > 0 ? (
              <WaterfallChart data={bridgeData} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No P&amp;L data available. Run a Finaloop sync from Settings.</p>
            )}
          </CardContent>
        </Card>

        {/* Section 4 & 5: Revenue Leakage + Gross-to-Net Trend */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Leakage by Channel</CardTitle>
              <CardDescription>Gross-to-net retention rate per channel &mdash; what % of gross revenue you actually keep.</CardDescription>
            </CardHeader>
            <CardContent>
              {leakageData.length > 0 ? (
                <GroupedBarChart data={leakageData} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No channel data available.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Gross-to-Net Trend (Monthly)</CardTitle>
              <CardDescription>Net retention % over time &mdash; are you keeping more or less of each dollar?</CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <DualAxisLineChart data={trendData} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No trend data available.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 6 & 7: Burn Rate + Runway */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Burn Rate Trend</CardTitle>
              <CardDescription>Total monthly cash outflows (operating + PO + tax reserves).</CardDescription>
            </CardHeader>
            <CardContent>
              {burnData.length > 0 ? (
                <BurnRateChart data={burnData} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No burn data available.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Runway Projection</CardTitle>
              <CardDescription>Months of runway remaining at current burn rate.</CardDescription>
            </CardHeader>
            <CardContent>
              {runwayData.length > 0 ? (
                <RunwayAreaChart data={runwayData} dangerWeeks={dangerBalance} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No runway data.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 8 & 9: AP Aging + AR Aging Tables */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>AP Aging (Incl. Unpaid POs)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {apAging.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>VENDOR / PO</TableHead>
                      <TableHead>TYPE</TableHead>
                      <TableHead className="text-right">AGE</TableHead>
                      <TableHead className="text-right">AMOUNT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apAging.slice(0, 10).map((item) => {
                      const days = daysBetween(item.created_at, now)
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-xs">{item.vendor}{item.po_reference ? ` (${item.po_reference})` : ''}</TableCell>
                          <TableCell className="text-xs">{item.item_type}</TableCell>
                          <TableCell className={`text-right text-xs ${days > 60 ? 'text-red-600 font-semibold' : ''}`}>{days} days</TableCell>
                          <TableCell className="text-right text-xs font-medium">{fmtFull(Math.abs(item.amount))}</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3} className="text-xs">Total AP Outstanding</TableCell>
                      <TableCell className="text-right text-xs">{fmtFull(totalApOutstanding)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center px-4">No AP aging data. Run a Shopify DTC sync.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AR Aging (Outstanding Receivables)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {arAging.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CUSTOMER / CHANNEL</TableHead>
                      <TableHead>TERMS</TableHead>
                      <TableHead className="text-right">AGE</TableHead>
                      <TableHead className="text-right">AMOUNT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arAging.slice(0, 10).map((item) => {
                      const days = daysBetween(item.order_date, now)
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-xs">{item.customer_name}{item.channel ? ` (${item.channel})` : ''}</TableCell>
                          <TableCell className="text-xs">{item.terms}</TableCell>
                          <TableCell className={`text-right text-xs ${days > 60 ? 'text-red-600 font-semibold' : ''}`}>{days} days</TableCell>
                          <TableCell className="text-right text-xs font-medium">{fmtFull(Math.abs(item.amount))}</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3} className="text-xs">Total AR Outstanding</TableCell>
                      <TableCell className="text-right text-xs">{fmtFull(totalArOutstanding)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center px-4">No AR aging data. Run a Shopify Wholesale sync.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 10 & 11: AP/AR Aging Bucket Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>AP Aging Buckets</CardTitle>
              <CardDescription>Payables by aging period.</CardDescription>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart data={apBucketData} color="#3b82f6" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>AR Aging Buckets</CardTitle>
              <CardDescription>Receivables by aging period.</CardDescription>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart data={arBucketData} color="#22c55e" />
            </CardContent>
          </Card>
        </div>

        {/* Section 12: Cash Position Summary */}
        <div className={`rounded-xl border p-6 ${summaryColor}`}>
          <h3 className="font-bold text-base mb-2">Cash Position Summary</h3>
          <p className="text-sm leading-relaxed">
            Cash remains {summaryHealthy ? 'positive' : 'at risk'} through the 13-week window.
            Lowest projected balance is {fmtFull(lowestForecast)} (Wk {forecastData.findIndex((w) => w.projectedBalance === lowestForecast) + 1}).
            Total AP outstanding is {fmtFull(totalApOutstanding)} and selling open POs against AR of {fmtFull(totalArOutstanding)}, leaving a net
            payables gap of {fmtFull(Math.max(0, totalApOutstanding - totalArOutstanding))}.
            Tax reserve accruing at {fmtFull(netTaxReserve)} over 13 weeks at {fmtFull(weeklyTax)}/wk effective rate.
            Weekly burn of {fmtFull(weeklyBurnNet)} gives {weeksOfRunway} weeks of runway from today&apos;s cash position.
            {runwayWeeks < 12 ? ' Watch Weeks 9-11 — proactive collections or PO deferral recommended.' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    red: 'bg-red-50 border-red-200',
    green: 'bg-emerald-50 border-emerald-200',
    yellow: 'bg-amber-50 border-amber-200',
    orange: 'bg-orange-50 border-orange-200',
  }
  const textMap: Record<string, string> = {
    blue: 'text-blue-700',
    red: 'text-red-700',
    green: 'text-emerald-700',
    yellow: 'text-amber-700',
    orange: 'text-orange-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] ?? 'bg-white border-gray-200'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-1 ${textMap[color] ?? 'text-foreground'}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  )
}
