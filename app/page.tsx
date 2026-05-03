export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Settings } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ForecastComboChart } from '@/components/charts/forecast-combo-chart'
import {
  BridgeTrendChart,
  type BridgeTrendLineSpec,
} from '@/components/charts/bridge-trend-chart'
import { WaterfallChart } from '@/components/charts/waterfall-chart'
import { GroupedBarChart } from '@/components/charts/grouped-bar-chart'
import { DualAxisLineChart } from '@/components/charts/dual-axis-line-chart'
import { MonthlyCacChart } from '@/components/charts/monthly-cac-chart'
import { BurnRateChart } from '@/components/charts/burn-rate-chart'
import { RunwayAreaChart } from '@/components/charts/runway-area-chart'
import { buildMonthlyDtcCacTrend, type MonthlyCacInput } from '@/lib/calculations/cac'
import { PinUnlockGate } from '@/components/pin-unlock-gate'
import { getPinGateForPath } from '@/lib/pin-access-server'

const WEEKS_PER_MONTH = 4.33

function fmtFull(n: number | null | undefined): string {
  if (n == null) return '$0'
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '0%'
  return n.toFixed(1) + '%'
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
  payroll: number
  shipping_fulfillment: number
  ga_expense: number
  sm_expense: number
  interest_financing: number
  contribution_margin: number
  allocated_ad_spend: number
  allocated_email_marketing: number
  is_partial: boolean
}

interface BsRow {
  month: string
  cash_and_equivalents: number
  inventory_value: number
  sales_tax_liability: number
  accounts_payable: number
  accounts_receivable: number
}

interface CfRow {
  month: string
  net_cash_flow: number
  sales_tax_payments: number | null
  inventory_purchases: number | null
  ending_cash: number | null
}

interface ForecastDbRow {
  forecast_run_date: string
  week_number: number
  week_start: string
  starting_cash: number
  projected_inflows: number
  projected_outflows: number
  projected_ending_cash: number
}

function formatWeekLabel(weekNum: number, weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00Z')
  if (Number.isNaN(d.getTime())) return `Wk ${weekNum}`
  return `Wk ${weekNum} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

function fmtAsOfMonth(month: string | undefined): string {
  if (!month) return '—'
  return new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

/** Matches run-cash-forecast: balance sheet cash first; CF ending only when BS cash is 0. */
function forecastStartingCash(
  bsCash: number,
  cfEnding: number | null | undefined,
): number {
  let s = Number(bsCash) || 0
  if (s === 0) {
    const ec = cfEnding
    if (typeof ec === 'number' && !Number.isNaN(ec)) s = ec
  }
  return s
}

function buildFallbackForecast(params: {
  startingCash: number
  weeklyInflow: number
  weeklyTotalOutflow: number
}): Array<{
  label: string
  weeklyInflow: number
  weeklyOutflow: number
  startingBalance: number
  projectedEndingCash: number
}> {
  const { startingCash, weeklyInflow, weeklyTotalOutflow } = params
  const now = new Date()
  let balance = startingCash
  return Array.from({ length: 13 }, (_, i) => {
    const weekNum = i + 1
    const weekStart = new Date(now.getTime() + i * 7 * 86_400_000)
    const label = `Wk ${weekNum} ${weekStart.getMonth() + 1}/${weekStart.getDate()}`
    const startBal = balance
    balance = startBal + weeklyInflow - weeklyTotalOutflow
    return {
      label,
      weeklyInflow: Math.round(weeklyInflow),
      weeklyOutflow: Math.round(weeklyTotalOutflow),
      startingBalance: Math.round(startBal),
      projectedEndingCash: Math.round(balance),
    }
  })
}

/**
 * Finance aggregates are single-tenant for this deployment; see lib/data-scope.ts.
 */
export default async function DashboardPage() {
  const pinGate = await getPinGateForPath('/')
  if (pinGate.showGate) {
    return <PinUnlockGate hint={pinGate.hint} />
  }

  const supabase = createServiceClient()

  const [pnlRes, bsRes, cfRes, fcAllRes, kpiCacRes] = await Promise.all([
    supabase
      .from('fin_pnl_monthly')
      .select(
        'month, channel, gross_revenue, net_revenue, returns, discounts, selling_fees, processing_fees, shipping_income, other_income_expenses, cogs, total_opex, payroll, shipping_fulfillment, ga_expense, sm_expense, interest_financing, contribution_margin, allocated_ad_spend, allocated_email_marketing, is_partial',
      )
      .order('month', { ascending: false })
      .limit(200),
    supabase
      .from('fin_balance_sheet_monthly')
      .select('month, cash_and_equivalents, inventory_value, sales_tax_liability, accounts_payable, accounts_receivable')
      .order('month', { ascending: false })
      .limit(24),
    supabase
      .from('fin_cashflow_monthly')
      .select('month, net_cash_flow, sales_tax_payments, inventory_purchases, ending_cash')
      .order('month', { ascending: false })
      .limit(24),
    supabase
      .from('fin_cash_forecast')
      .select(
        'forecast_run_date, week_number, week_start, starting_cash, projected_inflows, projected_outflows, projected_ending_cash',
      )
      .order('forecast_run_date', { ascending: false })
      .order('week_number', { ascending: true })
      .limit(260),
    supabase
      .from('fin_kpi_monthly')
      .select('month, channel, allocated_ad_spend, new_customer_orders, is_partial')
      .eq('channel', 'dtc')
      .order('month', { ascending: false })
      .limit(24),
  ])

  const pnl = (pnlRes.data ?? []) as PnlRow[]
  const bs = (bsRes.data ?? []) as BsRow[]
  const cf = (cfRes.data ?? []) as CfRow[]
  const fcAll = (fcAllRes.data ?? []) as ForecastDbRow[]
  const kpiCacRows = (kpiCacRes.data ?? []) as MonthlyCacInput[]

  const latestFcDate = fcAll[0]?.forecast_run_date
  const fcWeeks = latestFcDate
    ? fcAll.filter((r) => r.forecast_run_date === latestFcDate).slice(0, 13)
    : []
  const forecastFromPipeline = fcWeeks.length === 13

  const latestBs = bs[0]
  const cashPosition = latestBs?.cash_and_equivalents ?? 0
  const cashFromCf = cf[0]?.ending_cash
  const startingCashForForecast = forecastStartingCash(cashPosition, cashFromCf)

  const companyPnl = pnl.filter((r) => r.channel === 'company' && !r.is_partial)
  const latestCompanyPnl = companyPnl[0]

  const trailing3Pnl = companyPnl.slice(0, 3)

  function monthlyBurn(r: PnlRow): number {
    return (
      Math.abs(r.cogs) +
      Math.abs(r.total_opex) +
      Math.abs(r.other_income_expenses) +
      Math.abs(r.interest_financing ?? 0)
    )
  }

  const avgMonthlyBurn = trailing3Pnl.length > 0
    ? trailing3Pnl.reduce((s, r) => s + monthlyBurn(r), 0) / trailing3Pnl.length
    : 0
  const weeklyBurnRate = avgMonthlyBurn / WEEKS_PER_MONTH
  const runwayWeeks =
    weeklyBurnRate > 0 ? Math.floor(startingCashForForecast / weeklyBurnRate) : 999

  const totalApOutstanding = Math.abs(Number(latestBs?.accounts_payable) || 0)
  const totalArOutstanding = Math.abs(Number(latestBs?.accounts_receivable) || 0)

  const netSalesOfGrossPct =
    latestCompanyPnl && latestCompanyPnl.gross_revenue > 0
      ? (latestCompanyPnl.net_revenue / latestCompanyPnl.gross_revenue) * 100
      : 0

  const avgRevenue = trailing3Pnl.length > 0
    ? trailing3Pnl.reduce((s, r) => s + r.net_revenue, 0) / trailing3Pnl.length
    : 0

  const trailing3Cf = cf.slice(0, 3)
  const cfTaxSum = trailing3Cf.reduce((s, r) => s + Math.abs(r.sales_tax_payments ?? 0), 0)

  let avgTaxMonthly: number
  if (cfTaxSum > 0) {
    avgTaxMonthly = cfTaxSum / trailing3Cf.length
  } else if (bs.length >= 2) {
    const taxDeltas: number[] = []
    for (let i = 0; i < Math.min(3, bs.length - 1); i++) {
      const delta = (bs[i].sales_tax_liability ?? 0) - (bs[i + 1]?.sales_tax_liability ?? 0)
      taxDeltas.push(Math.abs(delta))
    }
    avgTaxMonthly = taxDeltas.length > 0 ? taxDeltas.reduce((a, b) => a + b, 0) / taxDeltas.length : 0
  } else {
    avgTaxMonthly = 0
  }

  const cfInvAvg =
    trailing3Cf.length > 0
      ? trailing3Cf.reduce((s, r) => s + Math.abs(r.inventory_purchases ?? 0), 0) / trailing3Cf.length
      : 0

  const avgCogs = trailing3Pnl.length > 0
    ? trailing3Pnl.reduce((s, r) => s + Math.abs(r.cogs), 0) / trailing3Pnl.length
    : 0
  const avgOperatingBurn = Math.max(0, avgMonthlyBurn - avgCogs)
  const weeklyInflow = avgRevenue / WEEKS_PER_MONTH
  const weeklyOperating = avgOperatingBurn / WEEKS_PER_MONTH
  const weeklyCogs = avgCogs / WEEKS_PER_MONTH
  const weeklyTax = avgTaxMonthly / WEEKS_PER_MONTH
  const weeklyInventoryCf = cfInvAvg / WEEKS_PER_MONTH
  const weeklyTotalOutflowFallback =
    weeklyOperating + weeklyCogs + weeklyTax + weeklyInventoryCf

  let forecastData: Array<{
    label: string
    weeklyInflow: number
    weeklyOutflow: number
    startingBalance: number
    projectedEndingCash: number
  }>

  if (forecastFromPipeline) {
    forecastData = fcWeeks.map((w) => ({
      label: formatWeekLabel(w.week_number, w.week_start),
      weeklyInflow: Math.round(Number(w.projected_inflows) || 0),
      weeklyOutflow: Math.round(Number(w.projected_outflows) || 0),
      startingBalance: Math.round(Number(w.starting_cash) || 0),
      projectedEndingCash: Math.round(Number(w.projected_ending_cash) || 0),
    }))
  } else {
    forecastData = buildFallbackForecast({
      startingCash: startingCashForForecast,
      weeklyInflow,
      weeklyTotalOutflow: weeklyTotalOutflowFallback,
    })
  }

  const netSalesBridge = latestCompanyPnl
    ? [
        { name: 'Gross revenue', value: latestCompanyPnl.gross_revenue },
        { name: 'Returns', value: latestCompanyPnl.returns },
        { name: 'Discounts', value: latestCompanyPnl.discounts },
        { name: 'Shipping income', value: latestCompanyPnl.shipping_income },
        { name: 'Net revenue', value: latestCompanyPnl.net_revenue, isTotal: true },
      ]
    : []

  const contributionBridge = latestCompanyPnl
    ? [
        { name: 'Net revenue', value: latestCompanyPnl.net_revenue },
        { name: 'COGS', value: latestCompanyPnl.cogs },
        { name: 'Processing fees', value: latestCompanyPnl.processing_fees },
        { name: 'Selling fees', value: latestCompanyPnl.selling_fees },
        { name: 'Paid ads', value: latestCompanyPnl.allocated_ad_spend },
        { name: 'Email marketing', value: latestCompanyPnl.allocated_email_marketing },
        {
          name: 'Contribution margin',
          value: latestCompanyPnl.contribution_margin,
          isTotal: true,
        },
      ]
    : []

  const bridgeHistoryMonths = companyPnl.slice(0, 12).reverse()
  const bridgeMonthLabel = (month: string) =>
    new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    })

  const monthlyCacPoints = buildMonthlyDtcCacTrend(kpiCacRows)
  const monthlyCacData = monthlyCacPoints.map((r) => ({
    month: bridgeMonthLabel(r.month),
    cac: r.cac,
    adSpend: r.adSpend,
    newCustomers: r.newCustomers,
  }))
  const hasMonthlyCac = monthlyCacData.some((r) => r.cac != null)

  const netSalesTrendData = bridgeHistoryMonths.map((r) => ({
    month: bridgeMonthLabel(r.month),
    gross_revenue: r.gross_revenue,
    returns: r.returns,
    discounts: r.discounts,
    shipping_income: r.shipping_income,
    net_revenue: r.net_revenue,
  }))

  const contributionTrendData = bridgeHistoryMonths.map((r) => ({
    month: bridgeMonthLabel(r.month),
    net_revenue: r.net_revenue,
    cogs: r.cogs,
    processing_fees: r.processing_fees,
    selling_fees: r.selling_fees,
    allocated_ad_spend: r.allocated_ad_spend,
    allocated_email_marketing: r.allocated_email_marketing,
    contribution_margin: r.contribution_margin,
  }))

  const netSalesBridgeTrendLines: BridgeTrendLineSpec[] = [
    { dataKey: 'gross_revenue', name: 'Gross revenue', stroke: '#64748b' },
    { dataKey: 'returns', name: 'Returns', stroke: '#f97316' },
    { dataKey: 'discounts', name: 'Discounts', stroke: '#ca8a04' },
    { dataKey: 'shipping_income', name: 'Shipping income', stroke: '#0ea5e9' },
    { dataKey: 'net_revenue', name: 'Net revenue', stroke: '#2563eb', strokeWidth: 2.5 },
  ]

  const contributionBridgeTrendLines: BridgeTrendLineSpec[] = [
    { dataKey: 'net_revenue', name: 'Net revenue', stroke: '#2563eb', strokeWidth: 2 },
    { dataKey: 'cogs', name: 'COGS', stroke: '#dc2626' },
    { dataKey: 'processing_fees', name: 'Processing fees', stroke: '#f87171' },
    { dataKey: 'selling_fees', name: 'Selling fees', stroke: '#b91c1c' },
    { dataKey: 'allocated_ad_spend', name: 'Paid ads', stroke: '#a855f7' },
    { dataKey: 'allocated_email_marketing', name: 'Email marketing', stroke: '#7c3aed' },
    {
      dataKey: 'contribution_margin',
      name: 'Contribution margin',
      stroke: '#059669',
      strokeWidth: 2.5,
    },
  ]

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
    ? pnl.filter(
        (r) =>
          r.month === latestMonth &&
          !r.is_partial &&
          r.channel !== 'company' &&
          r.channel !== 'wholesale' &&
          r.gross_revenue > 0,
      )
    : []
  const leakageData = channelPnlLatest.map((r) => ({
    channel: channelNames[r.channel] ?? r.channel,
    grossRevenue: r.gross_revenue,
    netRevenue: r.net_revenue,
    retentionPct: r.gross_revenue > 0 ? (r.net_revenue / r.gross_revenue) * 100 : 0,
  }))

  const trendMonths = companyPnl.slice(0, 12).reverse()
  const trendData = trendMonths.map((r) => ({
    month: new Date(r.month + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    netRetentionPct: r.gross_revenue > 0 ? (r.net_revenue / r.gross_revenue) * 100 : 0,
    totalLeakage: r.gross_revenue - r.net_revenue,
  }))

  const burnMonths = companyPnl.slice(0, 12).reverse()
  const burnData = burnMonths.map((r) => ({
    month: new Date(r.month + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short' }),
    amount: monthlyBurn(r),
  }))

  const runwayData = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() + i)
    return {
      month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      balance: Math.max(0, startingCashForForecast - avgMonthlyBurn * i),
    }
  })
  const dangerThreshold = avgMonthlyBurn * 2

  const lowestForecast = Math.min(...forecastData.map((w) => w.projectedEndingCash))
  const netTaxReserve = weeklyTax * 13
  const forecastSourceNote = forecastFromPipeline
    ? `Forecast uses the latest run-cash-forecast pipeline (${latestFcDate}).`
    : 'Forecast is estimated from trailing P&amp;L and cash flow (run a Finaloop sync to refresh fin_cash_forecast).'

  const summaryHealthy = lowestForecast > 0 && runwayWeeks > 8
  const summaryColor = summaryHealthy ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-800">Financial Health Dashboard</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              13-Week Cash Flow &middot; Net sales &amp; contribution bridges &middot; AP/AR &middot; Burn &amp; runway
            </p>
            <p className="text-[10px] text-gray-400 mt-1 tabular-nums">
              As of: P&amp;L {fmtAsOfMonth(latestCompanyPnl?.month)} · Balance sheet{' '}
              {fmtAsOfMonth(latestBs?.month)} · Cash flow {fmtAsOfMonth(cf[0]?.month)}
            </p>
          </div>
          <Link
            href="/settings"
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            title="Settings"
          >
            <Settings className="size-5" />
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            label="CASH POSITION"
            value={fmtFull(cashPosition)}
            sub={
              cashPosition === 0 && startingCashForForecast > 0
                ? `BS $0 (${fmtAsOfMonth(latestBs?.month)}); runway/forecast use CF ending ${fmtAsOfMonth(cf[0]?.month)}`
                : `Balance sheet cash & equivalents (${fmtAsOfMonth(latestBs?.month)})`
            }
            color="blue"
          />
          <KpiCard
            label="WEEKLY BURN RATE"
            value={`${fmtFull(weeklyBurnRate)}/wk`}
            sub={`COGS + opex + other + interest · last 3 completed mo through ${fmtAsOfMonth(companyPnl[0]?.month)}`}
            color="red"
          />
          <KpiCard
            label="RUNWAY"
            value={`${runwayWeeks} weeks`}
            sub={`${fmtFull(startingCashForForecast)} starting cash (same rule as cash forecast) · burn through ${fmtAsOfMonth(companyPnl[0]?.month)}`}
            color={runwayWeeks > 12 ? 'green' : runwayWeeks > 8 ? 'yellow' : 'red'}
          />
          <KpiCard
            label="TOTAL AP OUTSTANDING"
            value={fmtFull(totalApOutstanding)}
            sub={`Finaloop balance sheet AP (${fmtAsOfMonth(latestBs?.month)})`}
            color="orange"
          />
          <KpiCard
            label="NET SALES % OF GROSS"
            value={fmtPct(netSalesOfGrossPct)}
            sub={`net revenue ÷ gross · company P&amp;L ${fmtAsOfMonth(latestCompanyPnl?.month)}`}
            color="blue"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>13-Week Cash Flow Forecast</CardTitle>
            <CardDescription>
              Weekly inflows vs outflows (left scale) and projected cash balance (right scale).{' '}
              {forecastFromPipeline
                ? 'Data from the latest run-cash-forecast job.'
                : 'Estimated from trailing net revenue and expenses until a forecast run exists.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForecastComboChart data={forecastData} />
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Net sales bridge &mdash; last completed month</CardTitle>
              <CardDescription>
                Gross revenue through returns, discounts, and shipping to{' '}
                <strong>net revenue</strong> (same definition as Finaloop sync).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {netSalesBridge.length > 0 ? (
                <>
                  <WaterfallChart data={netSalesBridge} />
                  <BridgeTrendChart
                    data={netSalesTrendData}
                    lines={netSalesBridgeTrendLines}
                    caption="Historical trend (up to 12 months, same bridge components; net revenue emphasized)"
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No P&amp;L data. Run a Finaloop sync.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Contribution margin bridge &mdash; last completed month</CardTitle>
              <CardDescription>
                From net revenue through COGS, fees, and allocated marketing to{' '}
                <strong>contribution margin</strong> (Finaloop P&amp;L columns).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contributionBridge.length > 0 ? (
                <>
                  <WaterfallChart data={contributionBridge} />
                  <BridgeTrendChart
                    data={contributionTrendData}
                    lines={contributionBridgeTrendLines}
                    caption="Historical trend (up to 12 months; contribution margin emphasized)"
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No P&amp;L data. Run a Finaloop sync.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Net sales by channel</CardTitle>
              <CardDescription>
                Gross vs net revenue per channel for the latest completed month. Net here is Finaloop{' '}
                <strong>net revenue</strong> (not after payment processor fees).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leakageData.length > 0 ? (
                <GroupedBarChart data={leakageData} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No channel data.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Net sales % trend (monthly)</CardTitle>
              <CardDescription>
                Net revenue ÷ gross revenue (company). &ldquo;Gap&rdquo; is gross minus net sales, not fees.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <DualAxisLineChart data={trendData} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No trend data.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>DTC CAC trend (monthly)</CardTitle>
            <CardDescription>
              Finaloop DTC allocated ad spend divided by Shopify DTC new customers. Excludes Faire ad spend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasMonthlyCac ? (
              <MonthlyCacChart data={monthlyCacData} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No DTC CAC data. Run Finaloop and Shopify analytics syncs.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Monthly burn trend</CardTitle>
              <CardDescription>
                COGS + operating expenses + other + interest (company P&amp;L), trailing months.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {burnData.length > 0 ? (
                <BurnRateChart data={burnData} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No burn data.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Runway projection</CardTitle>
              <CardDescription>
                Cash if trailing average monthly burn continues (no new revenue). Matches runway KPI.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {runwayData.length > 0 ? (
                <RunwayAreaChart data={runwayData} dangerThreshold={dangerThreshold} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No runway data.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className={`rounded-xl border p-6 ${summaryColor}`}>
          <h3 className="font-bold text-base mb-2">Cash position summary</h3>
          <p className="text-sm leading-relaxed">
            {forecastSourceNote} Lowest projected week-end balance is {fmtFull(lowestForecast)} (week{' '}
            {forecastData.findIndex((w) => w.projectedEndingCash === lowestForecast) + 1}). Finaloop AP is{' '}
            {fmtFull(totalApOutstanding)} against Finaloop AR of {fmtFull(totalArOutstanding)}, net payables gap{' '}
            {fmtFull(Math.max(0, totalApOutstanding - totalArOutstanding))}. Tax-related estimate (13 weeks):{' '}
            {fmtFull(netTaxReserve)} at ~{fmtFull(weeklyTax)}/wk when cash flow tax lines are empty (else from Finaloop cash flow).
            Weekly burn {fmtFull(weeklyBurnRate)} implies ~{runwayWeeks} weeks runway at {fmtFull(startingCashForForecast)} starting
            cash (balance sheet, or cash-flow ending when BS cash is $0), if burn and no inflows continue.{' '}
            {runwayWeeks < 12 ? 'Review collections and payables timing.' : ''}
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
