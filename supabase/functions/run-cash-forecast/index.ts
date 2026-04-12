import { createClient } from 'jsr:@supabase/supabase-js@2'

const WEEKS_PER_MONTH = 4.33

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

function weekStartDate(baseDate: string, weekNum: number): string {
  const d = new Date(baseDate + 'T12:00:00Z')
  d.setDate(d.getDate() + (weekNum - 1) * 7)
  return d.toISOString().slice(0, 10)
}

interface WeekProjection {
  week_number: number
  starting_balance: number
  inflows: number
  outflows: number
  ending_balance: number
}

function projectCashForecast(
  startingCash: number,
  monthlyInflows: Record<string, number>,
  monthlyOutflows: Record<string, number>,
  growthRate: number,
  incomingInventoryValue: number,
): WeekProjection[] {
  const totalMonthlyInflows = Object.values(monthlyInflows).reduce((s, v) => s + v, 0)
  const totalMonthlyOutflows = Object.values(monthlyOutflows).reduce((s, v) => s + v, 0)

  const weeklyBaseInflow = totalMonthlyInflows / WEEKS_PER_MONTH
  const weeklyBaseOutflow = totalMonthlyOutflows / WEEKS_PER_MONTH
  const weeklyInventoryOutflow = incomingInventoryValue > 0 ? incomingInventoryValue / 13 : 0

  const projections: WeekProjection[] = []
  let balance = startingCash

  for (let week = 1; week <= 13; week++) {
    const weeklyGrowthRate = Math.pow(1 + growthRate, 1 / WEEKS_PER_MONTH) - 1
    const cumulativeGrowth = Math.pow(1 + weeklyGrowthRate, week)

    const inflows = weeklyBaseInflow * cumulativeGrowth
    const outflows = weeklyBaseOutflow * cumulativeGrowth + weeklyInventoryOutflow
    const endingBalance = balance + inflows - outflows

    projections.push({
      week_number: week,
      starting_balance: balance,
      inflows,
      outflows,
      ending_balance: endingBalance,
    })

    balance = endingBalance
  }

  return projections
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: syncLog } = await supabase
    .from('fin_sync_log')
    .insert({ source: 'cash_forecast', status: 'running', rows_synced: 0 })
    .select()
    .single()
  const syncId = syncLog?.id ?? ''

  try {
    // 1. Starting cash: balance sheet -> cashflow fallback
    const { data: bsRow } = await supabase
      .from('fin_balance_sheet_monthly')
      .select('cash_and_equivalents')
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()

    let startingCash = bsRow ? Number(bsRow.cash_and_equivalents) || 0 : 0

    if (startingCash === 0) {
      const { data: cfRow } = await supabase
        .from('fin_cashflow_monthly')
        .select('ending_cash')
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle()
      startingCash = cfRow ? Number(cfRow.ending_cash) || 0 : 0
    }

    // 2. Monthly inflows by channel — 3-month trailing average (completed months only)
    const { data: channelRows } = await supabase
      .from('fin_kpi_monthly')
      .select('channel, net_revenue, month, is_partial')
      .neq('channel', 'company')
      .order('month', { ascending: false })

    const inflowChannels: Record<string, number> = {
      dtc: 0,
      wholesale_faire: 0,
      wholesale_direct: 0,
      wholesale_key: 0,
      retail: 0,
      marketplace: 0,
    }

    if (channelRows && channelRows.length > 0) {
      const completedRows = channelRows.filter((r) => !r.is_partial)
      const channelMonths = new Map<string, number[]>()
      for (const ch of Object.keys(inflowChannels)) {
        channelMonths.set(ch, [])
      }
      for (const row of completedRows) {
        const ch = row.channel as string
        const arr = channelMonths.get(ch)
        if (arr && arr.length < 3) {
          arr.push(Math.max(0, Number(row.net_revenue) || 0))
        }
      }
      for (const [ch, values] of channelMonths) {
        inflowChannels[ch] = values.length > 0
          ? values.reduce((s, v) => s + v, 0) / values.length
          : 0
      }
    }

    // 3. Monthly outflows by category (from company P&L + cashflow)
    const { data: companyPnl } = await supabase
      .from('fin_kpi_monthly')
      .select('month, net_revenue, allocated_ad_spend, total_opex, payroll')
      .eq('channel', 'company')
      .order('month', { ascending: false })
      .limit(3)

    const latestCompany = companyPnl?.[0]
    const totalPayroll = Math.abs(Number(latestCompany?.payroll) || 0)
    const adSpend = Math.abs(Number(latestCompany?.allocated_ad_spend) || 0)
    const totalOpex = Math.abs(Number(latestCompany?.total_opex) || 0)
    const otherOpex = Math.max(0, totalOpex - totalPayroll - adSpend)

    const { data: cfLatest } = await supabase
      .from('fin_cashflow_monthly')
      .select('sales_tax_payments, owner_distributions, inventory_purchases')
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()

    const salesTax = Math.abs(Number(cfLatest?.sales_tax_payments) || 0)
    const distributions = Math.abs(Number(cfLatest?.owner_distributions) || 0)
    const inventoryPurchases = Math.abs(Number(cfLatest?.inventory_purchases) || 0)

    const outflowCategories: Record<string, number> = {
      payroll: totalPayroll,
      ad_spend: adSpend,
      inventory_pos: inventoryPurchases,
      sales_tax: salesTax,
      owner_distributions: distributions,
      other: otherOpex,
    }

    // 4. Incoming inventory from Shopify (unpaid POs, separate from Finaloop's
    // paid inventory_purchases above — these are additive, not overlapping)
    const { data: shopifyRow } = await supabase
      .from('fin_shopify_daily')
      .select('incoming_inventory_value')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    const incomingInventory = Number(shopifyRow?.incoming_inventory_value) || 0

    // 5. Growth rate: trailing 3-month revenue growth
    let growthRate = 0
    if (companyPnl && companyPnl.length >= 2) {
      const recent = Number(companyPnl[0]?.net_revenue) || 0
      const older = Number(companyPnl[companyPnl.length - 1]?.net_revenue) || 0
      if (older > 0 && recent > 0) {
        const periods = companyPnl.length - 1
        growthRate = Math.pow(recent / older, 1 / periods) - 1
      }
    }

    // 6. Run projection
    const today = todayStr()
    const projections = projectCashForecast(
      startingCash,
      inflowChannels,
      outflowCategories,
      growthRate,
      incomingInventory,
    )

    if (projections.length === 0) {
      const msg = 'Forecast returned no projections — check input data'
      await supabase.from('fin_sync_log').update({
        status: 'error', completed_at: new Date().toISOString(), error_message: msg,
      }).eq('id', syncId)
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // 7. Build upsert rows with per-channel/category splits
    const totalMonthlyInflows = Object.values(inflowChannels).reduce((s, v) => s + v, 0)
    const totalMonthlyOutflows = Object.values(outflowCategories).reduce((s, v) => s + v, 0)

    const inflowShares: Record<string, number> = {}
    for (const [ch, val] of Object.entries(inflowChannels)) {
      inflowShares[ch] = totalMonthlyInflows > 0 ? val / totalMonthlyInflows : 0
    }

    const outflowShares: Record<string, number> = {}
    for (const [cat, val] of Object.entries(outflowCategories)) {
      outflowShares[cat] = totalMonthlyOutflows > 0 ? val / totalMonthlyOutflows : 0
    }

    const upsertRows = projections.map((p) => ({
      forecast_run_date: today,
      week_number: p.week_number,
      week_start: weekStartDate(today, p.week_number),
      starting_cash: round2(p.starting_balance),
      projected_inflows: round2(p.inflows),
      projected_outflows: round2(p.outflows),
      projected_ending_cash: round2(p.ending_balance),
      inflow_dtc: round2(p.inflows * (inflowShares.dtc || 0)),
      inflow_wholesale_faire: round2(p.inflows * (inflowShares.wholesale_faire || 0)),
      inflow_wholesale_direct: round2(p.inflows * (inflowShares.wholesale_direct || 0)),
      inflow_wholesale_key: round2(p.inflows * (inflowShares.wholesale_key || 0)),
      inflow_retail: round2(p.inflows * (inflowShares.retail || 0)),
      inflow_marketplace: round2(p.inflows * (inflowShares.marketplace || 0)),
      inflow_other: 0,
      outflow_payroll: round2(p.outflows * (outflowShares.payroll || 0)),
      outflow_inventory_pos: round2(p.outflows * (outflowShares.inventory_pos || 0)),
      outflow_ad_spend: round2(p.outflows * (outflowShares.ad_spend || 0)),
      outflow_software: 0,
      outflow_rent: 0,
      outflow_sales_tax: round2(p.outflows * (outflowShares.sales_tax || 0)),
      outflow_owner_distributions: round2(p.outflows * (outflowShares.owner_distributions || 0)),
      outflow_other: round2(p.outflows * (outflowShares.other || 0)),
      source_data_stale: false,
    }))

    // Delete previous forecast for today, then insert fresh
    await supabase.from('fin_cash_forecast').delete().eq('forecast_run_date', today)
    const { error: upsertError } = await supabase
      .from('fin_cash_forecast')
      .insert(upsertRows)

    if (upsertError) {
      throw new Error(`fin_cash_forecast insert failed: ${upsertError.message}`)
    }

    await supabase.from('fin_sync_log').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      rows_synced: upsertRows.length,
    }).eq('id', syncId)

    return new Response(JSON.stringify({
      success: true,
      rows: upsertRows.length,
      starting_cash: round2(startingCash),
      growth_rate: round2(growthRate * 100),
      forecast_min: round2(Math.min(...projections.map((p) => p.ending_balance))),
      forecast_end: round2(projections[12].ending_balance),
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('fin_sync_log').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: message,
    }).eq('id', syncId)
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
