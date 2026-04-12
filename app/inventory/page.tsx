export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { MetricCard } from '@/components/cards/metric-card'
import { FinAreaChart } from '@/components/charts/area-chart'
import { FinLineChart } from '@/components/charts/line-chart'
import { FinBarChart } from '@/components/charts/bar-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatCompact,
  formatCurrency,
  formatCount,
} from '@/lib/utils/format'

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export default async function InventoryPage() {
  const supabase = createServiceClient()

  const [balanceResult, pnlResult, cashflowResult, shopifyResult, syncResult] =
    await Promise.all([
      supabase
        .from('fin_balance_sheet_monthly')
        .select('*')
        .order('month', { ascending: false })
        .limit(12),
      supabase
        .from('fin_kpi_monthly')
        .select('month, cogs, net_revenue, is_partial')
        .eq('channel', 'company')
        .order('month', { ascending: false })
        .limit(12),
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
        .from('fin_sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1),
    ])

  const balanceSheets = balanceResult.data ?? []
  const pnlData = pnlResult.data ?? []
  const cashflows = cashflowResult.data ?? []
  const shopifyDaily = shopifyResult.data?.[0]
  const lastSync = syncResult.data?.[0]

  // --- Metric Cards ---

  const latestBalance = balanceSheets[0]
  const inventoryValue = latestBalance
    ? Number(latestBalance.inventory_value) || null
    : null

  // Annualized COGS from last 12 months
  const totalCogs = pnlData.reduce(
    (s, m) => s + Math.abs(Number(m.cogs) || 0),
    0
  )
  const monthsOfCogs = pnlData.length
  const annualizedCogs =
    monthsOfCogs > 0 ? (totalCogs / monthsOfCogs) * 12 : null

  // Average inventory over available balance sheet months
  const inventoryValues = balanceSheets
    .map((b) => Number(b.inventory_value) || 0)
    .filter((v) => v > 0)
  const avgInventory =
    inventoryValues.length > 0
      ? inventoryValues.reduce((s, v) => s + v, 0) / inventoryValues.length
      : null

  const inventoryTurns =
    annualizedCogs !== null && avgInventory !== null && avgInventory > 0
      ? annualizedCogs / avgInventory
      : null

  // Daily COGS for Days of Inventory
  const dailyCogs =
    annualizedCogs !== null && annualizedCogs > 0
      ? annualizedCogs / 365
      : null
  const daysOfInventory =
    inventoryValue !== null && dailyCogs !== null && dailyCogs > 0
      ? Math.round(inventoryValue / dailyCogs)
      : null

  const incomingPOs = shopifyDaily
    ? Number(shopifyDaily.incoming_inventory_value) || null
    : null

  // --- Inventory Value Trend (monthly, ascending) ---

  const inventoryTrend = [...balanceSheets]
    .sort((a, b) => (a.month as string).localeCompare(b.month as string))
    .map((b) => ({
      month: formatMonthLabel(b.month as string),
      inventory: Number(b.inventory_value) || 0,
    }))

  // --- Inventory as % of Revenue ---

  const pnlByMonth = new Map(
    pnlData.map((p) => [p.month as string, p])
  )
  const inventoryRevPct = [...balanceSheets]
    .sort((a, b) => (a.month as string).localeCompare(b.month as string))
    .map((b) => {
      const monthPnl = pnlByMonth.get(b.month as string)
      const inv = Number(b.inventory_value) || 0
      const rev = monthPnl ? Number(monthPnl.net_revenue) || 0 : 0
      return {
        month: formatMonthLabel(b.month as string),
        pct: rev > 0 ? (inv / rev) * 100 : 0,
      }
    })

  // --- Inventory Purchases Cash Outflow ---

  const purchasesTrend = [...cashflows]
    .sort((a, b) => (a.month as string).localeCompare(b.month as string))
    .map((cf) => ({
      month: formatMonthLabel(cf.month as string),
      purchases: Math.abs(Number(cf.inventory_purchases) || 0),
    }))

  const noBalance = inventoryTrend.length === 0
  const noCashflow = purchasesTrend.length === 0

  return (
    <>
      <PageHeader
        title="Inventory Health"
        lastSynced={lastSync?.started_at ?? null}
      />

      <div className="grid grid-cols-1 gap-4 px-6 pb-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Inventory Value"
          value={formatCompact(inventoryValue)}
        />
        <MetricCard
          title="Inventory Turns"
          value={
            inventoryTurns !== null
              ? `${inventoryTurns.toFixed(1)}x`
              : '\u2014'
          }
          subtitle="Annualized"
          alert={
            inventoryTurns !== null
              ? inventoryTurns < 4
                ? 'red'
                : inventoryTurns < 6
                  ? 'yellow'
                  : 'green'
              : undefined
          }
        />
        <MetricCard
          title="Days of Inventory"
          value={daysOfInventory !== null ? formatCount(daysOfInventory) : '\u2014'}
          subtitle={
            dailyCogs !== null
              ? `~${formatCurrency(dailyCogs)}/day COGS`
              : undefined
          }
        />
        <MetricCard
          title="Incoming POs"
          value={formatCompact(incomingPOs)}
        />
      </div>

      <section className="space-y-4 px-6 pb-6">
        <Card>
          <CardHeader>
            <CardTitle>Inventory Value Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <FinAreaChart
              data={inventoryTrend}
              xKey="month"
              yKeys={[
                {
                  key: 'inventory',
                  label: 'Inventory Value',
                  color: 'hsl(var(--chart-1))',
                },
              ]}
              empty={noBalance}
              gradientFill
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory as % of Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <FinLineChart
              data={inventoryRevPct}
              xKey="month"
              yKeys={[
                {
                  key: 'pct',
                  label: 'Inventory / Revenue %',
                  color: 'hsl(var(--chart-2))',
                },
              ]}
              empty={inventoryRevPct.length === 0}
              referenceLines={[
                { y: 40, label: 'Alert: 40%', color: 'hsl(0 84% 60%)' },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory Purchases (Cash Outflow)</CardTitle>
          </CardHeader>
          <CardContent>
            <FinBarChart
              data={purchasesTrend}
              xKey="month"
              yKeys={[
                {
                  key: 'purchases',
                  label: 'Inventory Purchases',
                  color: 'hsl(var(--chart-3))',
                },
              ]}
              empty={noCashflow}
            />
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          For SKU-level inventory (dead stock, stockout risk, reorder points),
          see Forekast.
        </p>
      </section>
    </>
  )
}
