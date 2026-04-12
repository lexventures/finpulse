import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Types (inline — Edge Functions can't import from lib/)
// ---------------------------------------------------------------------------

interface FactsPacket {
  period: string
  revenue_mtd: number
  revenue_yoy_pct: number | null
  run_rate_annualized: number | null
  revenue_by_channel: Array<{ channel: string; mtd: number; yoy_pct: number | null }>
  gross_margin_pct: number | null
  gross_margin_3mo_avg: number | null
  blended_cac: number | null
  ltv_cac_ratio: number | null
  email_pct_of_dtc: number | null
  cash_balance: number | null
  cash_days: number | null
  cash_forecast_min_amount: number | null
  cash_forecast_min_week: number | null
  incoming_inventory_committed: number | null
  active_red_alerts: Array<{ metric: string; value: string }>
  active_yellow_alerts: Array<{ metric: string; value: string }>
  wholesale_pct_of_total: number | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_WORDS = 300
const FUZZY_TOLERANCE = 0.01

// ---------------------------------------------------------------------------
// Facts packet builder (inline version for Edge Function)
// ---------------------------------------------------------------------------

function currentMonthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function priorYearMonthStart(): string {
  const now = new Date()
  return `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function lastNMonthsStart(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

async function buildFactsPacket(supabase: SupabaseClient): Promise<FactsPacket> {
  const monthStart = currentMonthStart()
  const pyMonthStart = priorYearMonthStart()
  const threeMonthsAgo = lastNMonthsStart(3)
  const now = new Date()
  const period = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const [
    pnlCurrentResult,
    pnlPriorYearResult,
    pnlTrailingResult,
    dailyMtdResult,
    balanceSheetResult,
    shopifyDailyResult,
    alertsResult,
    wholesaleDailyResult,
  ] = await Promise.all([
    supabase.from('fin_kpi_monthly').select('month, channel, net_revenue, gross_margin_pct, allocated_ad_spend, total_opex, is_partial').gte('month', monthStart).order('month', { ascending: false }),
    supabase.from('fin_kpi_monthly').select('month, channel, net_revenue').gte('month', pyMonthStart)
      .lt('month', `${now.getFullYear() - 1}-${String(now.getMonth() + 2).padStart(2, '0')}-01`)
      .eq('channel', 'company'),
    supabase.from('fin_kpi_monthly').select('month, channel, net_revenue, gross_margin_pct').gte('month', threeMonthsAgo)
      .lt('month', monthStart).eq('channel', 'company').order('month', { ascending: true }),
    supabase.from('fin_revenue_daily').select('*').gte('date', monthStart).eq('channel', 'dtc'),
    supabase.from('fin_balance_sheet_monthly').select('*').order('month', { ascending: false }).limit(1),
    supabase.from('fin_shopify_daily').select('*').order('date', { ascending: false }).limit(1),
    supabase.from('fin_alerts').select('*').eq('acknowledged', false).order('triggered_at', { ascending: false }),
    supabase.from('fin_wholesale_daily').select('*').gte('date', monthStart),
  ])

  const pnlCurrent = pnlCurrentResult.data ?? []
  const pnlPriorYear = pnlPriorYearResult.data ?? []
  const pnlTrailing = pnlTrailingResult.data ?? []
  const dailyMtd = dailyMtdResult.data ?? []
  const latestBalance = balanceSheetResult.data?.[0] ?? null
  const latestShopify = shopifyDailyResult.data?.[0] ?? null
  const activeAlerts = alertsResult.data ?? []
  const wholesaleMtd = wholesaleDailyResult.data ?? []

  const companyRow = pnlCurrent.find((r: Record<string, unknown>) => r.channel === 'company')
  const revenueMtd = Number(companyRow?.net_revenue) || 0

  const channelRows = pnlCurrent.filter((r: Record<string, unknown>) => r.channel !== 'company')
  const revenueByChannel = channelRows.map((r: Record<string, unknown>) => ({
    channel: r.channel as string,
    mtd: Number(r.net_revenue) || 0,
    yoy_pct: null as number | null,
  }))

  const pyCompanyRev = Number(pnlPriorYear[0]?.net_revenue) || 0
  const revenueYoyPct = pyCompanyRev > 0 ? ((revenueMtd - pyCompanyRev) / pyCompanyRev) * 100 : null

  const trailingRevenues = pnlTrailing.map((r: Record<string, unknown>) => Number(r.net_revenue) || 0)
  const runRateAnnualized = trailingRevenues.length >= 3
    ? (trailingRevenues.reduce((s: number, v: number) => s + v, 0) / trailingRevenues.length) * 12
    : null

  const grossMarginPct = companyRow ? Number(companyRow.gross_margin_pct) || null : null
  const trailingMargins = pnlTrailing.map((r: Record<string, unknown>) => Number(r.gross_margin_pct) || 0)
  const grossMargin3moAvg = trailingMargins.length >= 3
    ? trailingMargins.reduce((s: number, v: number) => s + v, 0) / trailingMargins.length
    : null

  const totalAdSpend = Math.abs(Number(companyRow?.allocated_ad_spend) || 0)
  const totalNewCustomers = dailyMtd.reduce(
    (sum: number, d: Record<string, unknown>) => sum + (Number(d.new_customer_orders) || 0), 0,
  )
  const blendedCac = totalNewCustomers > 0 ? totalAdSpend / totalNewCustomers : null
  const ltv = totalNewCustomers > 0 ? (revenueMtd / totalNewCustomers) * ((grossMarginPct ?? 50) / 100) : null
  const ltvCacRatio = ltv !== null && blendedCac !== null && blendedCac > 0 ? ltv / blendedCac : null

  const cashBalance = latestBalance ? Number(latestBalance.cash_and_equivalents) || null : null
  const cashDays: number | null = null
  const cashForecastMinAmount: number | null = null
  const cashForecastMinWeek: number | null = null

  const incomingInventoryCommitted = latestShopify
    ? Number(latestShopify.incoming_inventory_value) || null
    : null

  const activeRedAlerts = activeAlerts
    .filter((a: Record<string, unknown>) => a.severity === 'red')
    .map((a: Record<string, unknown>) => ({ metric: a.metric_label as string, value: String(a.current_value) }))
  const activeYellowAlerts = activeAlerts
    .filter((a: Record<string, unknown>) => a.severity === 'yellow')
    .map((a: Record<string, unknown>) => ({ metric: a.metric_label as string, value: String(a.current_value) }))

  const wholesaleRev = wholesaleMtd.reduce(
    (sum: number, d: Record<string, unknown>) => sum + (Number(d.net_revenue) || 0), 0,
  )
  const wholesalePctOfTotal = revenueMtd > 0 ? (wholesaleRev / revenueMtd) * 100 : null

  return {
    period,
    revenue_mtd: revenueMtd,
    revenue_yoy_pct: revenueYoyPct,
    run_rate_annualized: runRateAnnualized,
    revenue_by_channel: revenueByChannel,
    gross_margin_pct: grossMarginPct,
    gross_margin_3mo_avg: grossMargin3moAvg,
    blended_cac: blendedCac,
    ltv_cac_ratio: ltvCacRatio,
    email_pct_of_dtc: null,
    cash_balance: cashBalance,
    cash_days: cashDays,
    cash_forecast_min_amount: cashForecastMinAmount,
    cash_forecast_min_week: cashForecastMinWeek,
    incoming_inventory_committed: incomingInventoryCommitted,
    active_red_alerts: activeRedAlerts,
    active_yellow_alerts: activeYellowAlerts,
    wholesale_pct_of_total: wholesalePctOfTotal,
  }
}

// ---------------------------------------------------------------------------
// Briefing validator (inline)
// ---------------------------------------------------------------------------

function extractNumbers(text: string): number[] {
  const results: number[] = []
  const dollarPattern = /\$[\d,]+(?:\.\d+)?(?:[MKBmkb])?/g
  for (const match of text.matchAll(dollarPattern)) {
    const raw = match[0].replace(/[$,]/g, '')
    const multiplier = raw.endsWith('M') || raw.endsWith('m') ? 1_000_000
      : raw.endsWith('K') || raw.endsWith('k') ? 1_000
      : raw.endsWith('B') || raw.endsWith('b') ? 1_000_000_000
      : 1
    const num = parseFloat(raw.replace(/[MKBmkb]$/, ''))
    if (Number.isFinite(num)) results.push(num * multiplier)
  }
  const pctPattern = /-?[\d,]+(?:\.\d+)?%/g
  for (const match of text.matchAll(pctPattern)) {
    const num = parseFloat(match[0].replace(/[%,]/g, ''))
    if (Number.isFinite(num)) results.push(num)
  }
  return results
}

function collectFactValues(facts: FactsPacket): number[] {
  const values: number[] = []
  const fields: (keyof FactsPacket)[] = [
    'revenue_mtd', 'revenue_yoy_pct', 'run_rate_annualized', 'gross_margin_pct',
    'gross_margin_3mo_avg', 'blended_cac', 'ltv_cac_ratio', 'email_pct_of_dtc',
    'cash_balance', 'cash_days', 'cash_forecast_min_amount', 'cash_forecast_min_week',
    'incoming_inventory_committed', 'wholesale_pct_of_total',
  ]
  for (const field of fields) {
    const val = facts[field]
    if (typeof val === 'number' && Number.isFinite(val)) values.push(val)
  }
  for (const ch of facts.revenue_by_channel) {
    values.push(ch.mtd)
    if (ch.yoy_pct !== null) values.push(ch.yoy_pct)
  }
  for (const alert of [...facts.active_red_alerts, ...facts.active_yellow_alerts]) {
    const parsed = parseFloat(alert.value)
    if (Number.isFinite(parsed)) values.push(parsed)
  }
  return values
}

function validateBriefing(text: string, facts: FactsPacket): { valid: boolean; reason?: string } {
  const wordCount = text.trim().split(/\s+/).length
  if (wordCount > MAX_WORDS) {
    return { valid: false, reason: `Briefing is ${wordCount} words, exceeds ${MAX_WORDS} word limit` }
  }

  const extracted = extractNumbers(text)
  if (extracted.length === 0) return { valid: true }

  const factValues = collectFactValues(facts)
  const unmatched: number[] = []
  for (const num of extracted) {
    let matched = false
    for (const fact of factValues) {
      if (fact === 0 && num === 0) { matched = true; break }
      if (fact === 0) continue
      if (Math.abs(num - fact) / Math.abs(fact) <= FUZZY_TOLERANCE) { matched = true; break }
    }
    if (!matched) unmatched.push(num)
  }

  if (unmatched.length > 0) {
    return { valid: false, reason: `Numbers not in facts: ${unmatched.join(', ')}` }
  }
  return { valid: true }
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function generateWithClaude(factsPacket: FactsPacket): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const systemPrompt = `You are a CFO-level financial briefing writer for a consumer products brand.
You write concise daily briefings (max 300 words) that a CEO can read in 60 seconds.

CRITICAL RULES:
- Only reference data from the provided facts packet. Do not invent or extrapolate numbers.
- Every dollar amount and percentage in your output MUST exist in the facts packet.
- Focus on: revenue performance, margin health, cash position, alerts, and one strategic observation.
- Use plain language. Avoid jargon. Format as 3-5 short paragraphs.
- Start with the headline metric (revenue MTD vs prior year).
- End with one actionable recommendation.
- Never include disclaimers or caveats about data accuracy.`

  const userPrompt = `Generate a daily financial briefing based on this facts packet:

${JSON.stringify(factsPacket, null, 2)}

Write a concise briefing (max 300 words) covering:
1. Revenue headline (MTD, YoY change)
2. Margin and profitability status
3. Cash position and runway
4. Active alerts (if any)
5. One strategic observation or recommendation`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Claude API ${res.status}: ${errText}`)
  }

  const body = await res.json()
  const textBlock = body.content?.find((b: { type: string }) => b.type === 'text')
  if (!textBlock?.text) throw new Error('No text in Claude response')

  return textBlock.text as string
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
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const factsPacket = await buildFactsPacket(supabase)
    const briefingText = await generateWithClaude(factsPacket)
    const validation = validateBriefing(briefingText, factsPacket)

    const briefingRecord = {
      text: briefingText,
      facts: factsPacket,
      generated_at: new Date().toISOString(),
      valid: validation.valid,
      validation_reason: validation.reason ?? null,
    }

    await supabase
      .from('fin_settings')
      .upsert({
        key: 'daily_briefing',
        value: briefingRecord,
        updated_at: new Date().toISOString(),
      })

    return new Response(
      JSON.stringify({
        success: true,
        valid: validation.valid,
        validation_reason: validation.reason ?? null,
        word_count: briefingText.trim().split(/\s+/).length,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
