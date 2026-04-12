import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const RETRY_DELAYS = [1000, 4000, 16000]
const MAX_ATTEMPTS = 4

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Threshold evaluation (mirrors lib/calculations/evaluate-thresholds.ts)
// ---------------------------------------------------------------------------

type AlertSeverity = 'red' | 'yellow'

interface Threshold {
  id: string
  metric_key: string
  metric_label: string
  green_above: number | null
  yellow_above: number | null
  red_below: number | null
  comparison_type: string
  trend_periods: number | null
  higher_is_better: boolean
  is_active: boolean
  notify_on_red: boolean
  notify_on_yellow: boolean
}

function evaluateAbsolute(
  value: number,
  t: Threshold
): AlertSeverity | 'green' | null {
  if (t.higher_is_better) {
    if (t.green_above !== null && value >= t.green_above) return 'green'
    if (t.yellow_above !== null && value >= t.yellow_above) return 'yellow'
    return 'red'
  }
  if (t.red_below !== null && value >= t.red_below) return 'red'
  if (t.yellow_above !== null && value >= t.yellow_above) return 'yellow'
  return 'green'
}

// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------

interface MetricResult {
  value: number | null
  trendValues?: number[]
}

async function computeMetric(
  key: string,
  supabase: SupabaseClient
): Promise<MetricResult> {
  switch (key) {
    case 'gross_margin_pct': {
      const { data } = await supabase
        .from('fin_kpi_monthly')
        .select('gross_margin_pct')
        .eq('channel', 'company')
        .order('month', { ascending: false })
        .limit(1)
      return { value: data?.[0] ? Number(data[0].gross_margin_pct) : null }
    }

    case 'gross_margin_trend': {
      const { data } = await supabase
        .from('fin_kpi_monthly')
        .select('gross_margin_pct')
        .eq('channel', 'company')
        .order('month', { ascending: false })
        .limit(6)
      const values = (data ?? []).map((d) => Number(d.gross_margin_pct) || 0)
      return { value: values[0] ?? null, trendValues: values }
    }

    case 'cash_days': {
      const [balRes, pnlRes] = await Promise.all([
        supabase
          .from('fin_balance_sheet_monthly')
          .select('cash_and_equivalents')
          .order('month', { ascending: false })
          .limit(1),
        supabase
          .from('fin_kpi_monthly')
          .select('total_opex')
          .eq('channel', 'company')
          .order('month', { ascending: false })
          .limit(3),
      ])
      const cash = balRes.data?.[0]
        ? Number(balRes.data[0].cash_and_equivalents)
        : null
      const pnl = pnlRes.data ?? []
      if (cash === null || pnl.length === 0) return { value: null }
      const avgOpex =
        pnl.reduce((s, m) => s + Math.abs(Number(m.total_opex) || 0), 0) /
        pnl.length
      const dailyOpex = avgOpex / 30
      return { value: dailyOpex > 0 ? cash / dailyOpex : null }
    }

    case 'blended_cac': {
      const { data } = await supabase
        .from('fin_kpi_monthly')
        .select('allocated_ad_spend')
        .eq('channel', 'company')
        .order('month', { ascending: false })
        .limit(1)
      const adSpend = data?.[0]
        ? Math.abs(Number(data[0].allocated_ad_spend) || 0)
        : 0
      const { data: dailyData } = await supabase
        .from('fin_revenue_daily')
        .select('new_customer_orders, date')
        .eq('channel', 'dtc')
        .order('date', { ascending: false })
        .limit(30)
      const newCusts = (dailyData ?? []).reduce(
        (s, d) => s + (Number(d.new_customer_orders) || 0),
        0
      )
      return { value: newCusts > 0 ? adSpend / newCusts : null }
    }

    case 'ltv_cac_ratio': {
      const cacResult = await computeMetric('blended_cac', supabase)
      const cac = cacResult.value
      if (cac === null || cac <= 0) return { value: null }

      const { data: pnl } = await supabase
        .from('fin_kpi_monthly')
        .select('net_revenue, gross_margin_pct')
        .eq('channel', 'dtc')
        .order('month', { ascending: false })
        .limit(12)

      const { data: daily } = await supabase
        .from('fin_revenue_daily')
        .select('new_customer_orders')
        .eq('channel', 'dtc')
        .order('date', { ascending: false })
        .limit(365)

      const totalRev = (pnl ?? []).reduce(
        (s, d) => s + (Number(d.net_revenue) || 0),
        0
      )
      const totalNew = (daily ?? []).reduce(
        (s, d) => s + (Number(d.new_customer_orders) || 0),
        0
      )
      const margin =
        pnl && pnl.length > 0
          ? Number(pnl[0].gross_margin_pct) || 50
          : 50

      const ltv =
        totalNew > 0 ? (totalRev / totalNew) * (margin / 100) : null
      return { value: ltv !== null ? ltv / cac : null }
    }

    case 'channel_max_pct': {
      const { data } = await supabase
        .from('fin_kpi_monthly')
        .select('channel, net_revenue, month')
        .neq('channel', 'company')
        .neq('channel', 'wholesale')
        .order('month', { ascending: false })
      if (!data || data.length === 0) return { value: null }
      const latestMonth = data[0].month as string
      const monthData = data.filter((d) => d.month === latestMonth)
      const totalRev = monthData.reduce(
        (s, d) => s + Math.max(0, Number(d.net_revenue) || 0),
        0
      )
      if (totalRev <= 0) return { value: null }
      const maxRev = Math.max(
        ...monthData.map((d) => Math.max(0, Number(d.net_revenue) || 0))
      )
      return { value: (maxRev / totalRev) * 100 }
    }

    case 'inventory_turns': {
      const [balRes, pnlRes] = await Promise.all([
        supabase
          .from('fin_balance_sheet_monthly')
          .select('inventory_value')
          .order('month', { ascending: false })
          .limit(12),
        supabase
          .from('fin_kpi_monthly')
          .select('cogs')
          .eq('channel', 'company')
          .order('month', { ascending: false })
          .limit(12),
      ])
      const invValues = (balRes.data ?? [])
        .map((b) => Number(b.inventory_value) || 0)
        .filter((v) => v > 0)
      const avgInv =
        invValues.length > 0
          ? invValues.reduce((s, v) => s + v, 0) / invValues.length
          : 0
      const pnl = pnlRes.data ?? []
      const totalCogs = pnl.reduce(
        (s, m) => s + Math.abs(Number(m.cogs) || 0),
        0
      )
      const annualCogs = pnl.length > 0 ? (totalCogs / pnl.length) * 12 : 0
      return { value: avgInv > 0 ? annualCogs / avgInv : null }
    }

    case 'labor_pct': {
      const { data } = await supabase
        .from('fin_kpi_monthly')
        .select('payroll, net_revenue')
        .eq('channel', 'company')
        .order('month', { ascending: false })
        .limit(1)
      const row = data?.[0]
      if (!row) return { value: null }
      const payroll = Math.abs(Number(row.payroll) || 0)
      const rev = Number(row.net_revenue) || 0
      return { value: rev > 0 ? (payroll / rev) * 100 : null }
    }

    case 'revenue_recon': {
      const { data: syncData } = await supabase
        .from('fin_sync_log')
        .select('error_message')
        .eq('source', 'finaloop_sheets')
        .order('started_at', { ascending: false })
        .limit(1)
      const msg = syncData?.[0]?.error_message as string | null
      if (!msg) return { value: 0 }
      const match = msg.match(/differs.*?by\s+([\d.]+)%/)
      return { value: match ? parseFloat(match[1]) : 0 }
    }

    default:
      return { value: null }
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: syncLog } = await supabase
    .from('fin_sync_log')
    .insert({ source: 'alert_engine', status: 'running', rows_synced: 0 })
    .select()
    .single()
  const syncId: string = syncLog?.id ?? ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        await supabase
          .from('fin_sync_log')
          .update({ status: `retry_${attempt - 1}`, attempt })
          .eq('id', syncId)
        await sleep(RETRY_DELAYS[attempt - 2])
      }

      // Load active thresholds
      const { data: thresholds, error: thErr } = await supabase
        .from('fin_alert_thresholds')
        .select('*')
        .eq('is_active', true)
      if (thErr) throw new Error(`Failed to load thresholds: ${thErr.message}`)
      if (!thresholds || thresholds.length === 0) {
        await supabase
          .from('fin_sync_log')
          .update({
            status: 'success',
            completed_at: new Date().toISOString(),
            rows_synced: 0,
            error_message: 'No active thresholds configured',
          })
          .eq('id', syncId)
        return new Response(
          JSON.stringify({ success: true, alerts: 0 }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        )
      }

      let alertsCreated = 0

      for (const threshold of thresholds as Threshold[]) {
        const metric = await computeMetric(threshold.metric_key, supabase)

        if (threshold.comparison_type === 'trend_decline') {
          const periods = threshold.trend_periods ?? 3
          const values = metric.trendValues
          if (!values || values.length < periods + 1) continue

          const recent = values.slice(0, periods + 1)
          const isDecline = recent.every(
            (v, i) => i === 0 || v > recent[i - 1]
          )
          if (!isDecline) continue

          const severity: AlertSeverity = 'yellow'
          const created = await maybeInsertAlert(
            supabase,
            threshold,
            severity,
            recent[0],
            `${threshold.metric_label} has declined for ${periods} consecutive periods`
          )
          if (created) alertsCreated++
          continue
        }

        // Absolute comparison
        if (metric.value === null) continue
        const result = evaluateAbsolute(metric.value, threshold)
        if (result === null || result === 'green') continue

        const severity: AlertSeverity = result
        const thresholdValue =
          severity === 'red'
            ? threshold.higher_is_better
              ? threshold.red_below
              : threshold.red_below
            : threshold.yellow_above
        const direction = threshold.higher_is_better ? 'below' : 'above'
        const message =
          `${threshold.metric_label} is ${metric.value.toFixed(1)} ` +
          `(${severity}: ${direction} ${thresholdValue})`

        const created = await maybeInsertAlert(
          supabase,
          threshold,
          severity,
          metric.value,
          message
        )
        if (created) alertsCreated++
      }

      await supabase
        .from('fin_sync_log')
        .update({
          status: 'success',
          completed_at: new Date().toISOString(),
          rows_synced: alertsCreated,
        })
        .eq('id', syncId)

      return new Response(
        JSON.stringify({ success: true, alerts: alertsCreated }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === MAX_ATTEMPTS) {
        await supabase
          .from('fin_sync_log')
          .update({
            status: 'error',
            completed_at: new Date().toISOString(),
            error_message: message,
          })
          .eq('id', syncId)
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }
    }
  }

  return new Response(JSON.stringify({ error: 'Unreachable' }), {
    status: 500,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})

// ---------------------------------------------------------------------------
// Deduplication: skip if same metric_key + severity exists unacknowledged
// within the last 7 days
// ---------------------------------------------------------------------------

async function maybeInsertAlert(
  supabase: SupabaseClient,
  threshold: Threshold,
  severity: AlertSeverity,
  currentValue: number,
  message: string
): Promise<boolean> {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data: existing } = await supabase
    .from('fin_alerts')
    .select('id')
    .eq('metric_key', threshold.metric_key)
    .eq('severity', severity)
    .eq('acknowledged', false)
    .gte('triggered_at', sevenDaysAgo)
    .limit(1)

  if (existing && existing.length > 0) return false

  const shouldNotify =
    (severity === 'red' && threshold.notify_on_red) ||
    (severity === 'yellow' && threshold.notify_on_yellow)
  if (!shouldNotify && severity === 'yellow') return false

  const { error } = await supabase.from('fin_alerts').insert({
    threshold_id: threshold.id,
    severity,
    metric_key: threshold.metric_key,
    metric_label: threshold.metric_label,
    current_value: currentValue,
    threshold_value:
      severity === 'red'
        ? threshold.red_below ?? threshold.yellow_above
        : threshold.yellow_above ?? threshold.green_above,
    message,
  })

  return !error
}
