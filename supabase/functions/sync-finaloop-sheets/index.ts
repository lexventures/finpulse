import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel =
  | 'company'
  | 'dtc'
  | 'wholesale'
  | 'wholesale_faire'
  | 'wholesale_direct'
  | 'wholesale_key'
  | 'retail'
  | 'marketplace'

type LineItemType =
  | 'revenue'
  | 'discount'
  | 'return'
  | 'cogs'
  | 'fee'
  | 'shipping'
  | 'ad_spend'
  | 'email_marketing'

interface ChannelMapping {
  pattern: string
  channel: Channel
  type: LineItemType
}

interface ChannelAccumulator {
  gross_revenue: number
  shipping_income: number
  discounts: number
  returns: number
  cogs: number
  processing_fees: number
  selling_fees: number
  allocated_ad_spend: number
  allocated_email_marketing: number
}

interface CompanyExtras {
  shipping_fulfillment: number
  payroll: number
  ga_expense: number
  sm_expense: number
  rd_expense: number
  depreciation: number
  interest_financing: number
  other_income_expenses: number
}

interface MonthMeta {
  month: string
  isPartial: boolean
  colIndex: number
}

// ---------------------------------------------------------------------------
// Channel mappings — mirrors lib/constants/channel-mapping.ts
// ---------------------------------------------------------------------------

const CHANNEL_MAPPINGS: ChannelMapping[] = [
  { pattern: 'Sales - Shopify - emilylex', channel: 'dtc', type: 'revenue' },
  { pattern: 'Sales - Facebook (via Shopify)', channel: 'dtc', type: 'revenue' },
  { pattern: 'Sales - Faire (via Shopify)', channel: 'wholesale_faire', type: 'revenue' },
  { pattern: 'Sales - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'revenue' },
  { pattern: 'Sales - Wholesale', channel: 'wholesale_key', type: 'revenue' },
  { pattern: 'Sales - Square', channel: 'retail', type: 'revenue' },
  { pattern: 'Sales - unidentified payouts', channel: 'marketplace', type: 'revenue' },
  { pattern: 'Affiliate marketing income', channel: 'dtc', type: 'revenue' },
  { pattern: 'Shipping income - Shopify - emilylex', channel: 'dtc', type: 'shipping' },
  { pattern: 'Shipping income - Facebook (via Shopify)', channel: 'dtc', type: 'shipping' },
  { pattern: 'Shipping income - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'shipping' },
  { pattern: 'Discounts - Shopify - emilylex', channel: 'dtc', type: 'discount' },
  { pattern: 'Discounts - Facebook (via Shopify)', channel: 'dtc', type: 'discount' },
  { pattern: 'Discounts - Faire (via Shopify)', channel: 'wholesale_faire', type: 'discount' },
  { pattern: 'Discounts - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'discount' },
  { pattern: 'Returns - Shopify - emilylex', channel: 'dtc', type: 'return' },
  { pattern: 'Returns - Facebook (via Shopify)', channel: 'dtc', type: 'return' },
  { pattern: 'Returns - Faire (via Shopify)', channel: 'wholesale_faire', type: 'return' },
  { pattern: 'Returns - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'return' },
  { pattern: 'COGS - Shopify - emilylex', channel: 'dtc', type: 'cogs' },
  { pattern: 'COGS - Facebook (via Shopify)', channel: 'dtc', type: 'cogs' },
  { pattern: 'COGS - Faire (via Shopify)', channel: 'wholesale_faire', type: 'cogs' },
  { pattern: 'COGS - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'cogs' },
  { pattern: 'Fees - Shopify - emilylex', channel: 'dtc', type: 'fee' },
  { pattern: 'Selling fees - Faire', channel: 'wholesale_faire', type: 'fee' },
  { pattern: 'Fees - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'fee' },
  { pattern: 'Paid online ads - Facebook Advertising', channel: 'dtc', type: 'ad_spend' },
  { pattern: 'Paid online ads - Google Advertising', channel: 'dtc', type: 'ad_spend' },
  { pattern: 'Paid online ads - Faire', channel: 'wholesale_faire', type: 'ad_spend' },
  { pattern: 'Email marketing', channel: 'dtc', type: 'email_marketing' },
]

const CHANNELS: Channel[] = [
  'company', 'dtc', 'wholesale', 'wholesale_faire',
  'wholesale_direct', 'wholesale_key', 'retail', 'marketplace',
]

const WHOLESALE_SUB: Channel[] = ['wholesale_faire', 'wholesale_direct', 'wholesale_key']

// Subtotal / header rows that should never be accumulated
const SKIP_ROW_PATTERNS = [
  /^total\b/i,
  /^gross\s*profit/i,
  /^net\s*(income|profit|revenue|sales|loss)/i,
  /^operating\s*(income|profit|loss)/i,
  /^ebitda/i,
  /^gross\s*margin/i,
  /^contribution\s*margin/i,
  /^cost of goods sold$/i,
  /^revenue$/i,
  /^expenses?$/i,
  /^operating expenses?$/i,
  /^other\s*(income|expenses?)$/i,
]

// Company-only patterns for opex / below-the-line items
const COMPANY_FIELD_RULES: Array<{ test: RegExp; field: keyof CompanyExtras }> = [
  { test: /salaries|wages|employer taxes|employee benefit|payroll|bonus/i, field: 'payroll' },
  { test: /shipping & fulfillment|fulfillment cost|freight|postage/i, field: 'shipping_fulfillment' },
  { test: /office|rent\b|insurance|professional services|utilities|bank fees|software|legal|accounting|telephone/i, field: 'ga_expense' },
  { test: /marketing(?!.*email)|social media|brand|events|sponsorship|pr\b/i, field: 'sm_expense' },
  { test: /research|development|r&d/i, field: 'rd_expense' },
  { test: /depreciation|amortization/i, field: 'depreciation' },
  { test: /interest|financing|loan\b/i, field: 'interest_financing' },
  { test: /uncategorized|other income|other expense|miscellaneous|sundry/i, field: 'other_income_expenses' },
]

// Balance sheet line-item → DB column (case-insensitive contains match)
const BS_FIELD_MAP: Array<{ test: RegExp; col: string }> = [
  { test: /^bank accounts/i, col: 'bank_accounts_total' },
  { test: /^undeposited funds/i, col: 'undeposited_funds_total' },
  { test: /^cash and cash equivalents/i, col: 'cash_and_equivalents' },
  { test: /^inventory/i, col: 'inventory_value' },
  { test: /^accounts receivable/i, col: 'accounts_receivable' },
  { test: /loans to related/i, col: 'loans_to_related_party' },
  { test: /unidentified payouts/i, col: 'unidentified_payouts' },
  { test: /^total current assets/i, col: 'total_current_assets' },
  { test: /^net fixed assets/i, col: 'net_fixed_assets' },
  { test: /^total assets/i, col: 'total_assets' },
  { test: /credit card/i, col: 'credit_card_balances' },
  { test: /^accounts payable/i, col: 'accounts_payable' },
  { test: /sales tax.*liabilit/i, col: 'sales_tax_liability' },
  { test: /^total current liabilities/i, col: 'total_current_liabilities' },
  { test: /^total liabilities/i, col: 'total_liabilities' },
  { test: /^total.*equity/i, col: 'total_equity' },
  { test: /current year.*net.*profit/i, col: 'current_year_net_profit' },
]

// Cash-flow line-item → DB column
const CF_FIELD_MAP: Array<{ test: RegExp; col: string }> = [
  { test: /cash from operations/i, col: 'cash_from_operations' },
  { test: /cash from investing/i, col: 'cash_from_investing' },
  { test: /cash from financing/i, col: 'cash_from_financing' },
  { test: /net cash flow/i, col: 'net_cash_flow' },
  { test: /inventory purchase/i, col: 'inventory_purchases' },
  { test: /owner.?s? distribution/i, col: 'owner_distributions' },
  { test: /sales tax payment/i, col: 'sales_tax_payments' },
  { test: /(starting|beginning|opening) cash/i, col: 'starting_cash' },
  { test: /ending cash/i, col: 'ending_cash' },
]

const MONTH_ABBREVS: Record<string, string> = {
  jan: '01', january: '01', feb: '02', february: '02',
  mar: '03', march: '03', apr: '04', april: '04',
  may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', august: '08', sep: '09', september: '09',
  oct: '10', october: '10', nov: '11', november: '11',
  dec: '12', december: '12',
}

const RETRY_DELAYS = [1000, 4000, 16000]
const MAX_ATTEMPTS = 4

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function base64urlEncode(data: Uint8Array | string): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : data
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function parseNumber(raw: string | undefined | null): number {
  if (!raw || raw.trim() === '' || raw.trim() === '-') return 0
  let s = raw.replace(/[$,\s]/g, '')
  if (s.startsWith('(') && s.endsWith(')')) s = '-' + s.slice(1, -1)
  const n = parseFloat(s)
  return Number.isNaN(n) ? 0 : n
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function emptyAccumulator(): ChannelAccumulator {
  return {
    gross_revenue: 0, shipping_income: 0, discounts: 0, returns: 0,
    cogs: 0, processing_fees: 0, selling_fees: 0,
    allocated_ad_spend: 0, allocated_email_marketing: 0,
  }
}

function emptyExtras(): CompanyExtras {
  return {
    shipping_fulfillment: 0, payroll: 0, ga_expense: 0,
    sm_expense: 0, rd_expense: 0, depreciation: 0,
    interest_financing: 0, other_income_expenses: 0,
  }
}

function accumulatorField(
  type: LineItemType,
  pattern: string,
): keyof ChannelAccumulator {
  switch (type) {
    case 'revenue': return 'gross_revenue'
    case 'shipping': return 'shipping_income'
    case 'discount': return 'discounts'
    case 'return': return 'returns'
    case 'cogs': return 'cogs'
    case 'fee':
      return pattern.toLowerCase().startsWith('selling')
        ? 'selling_fees'
        : 'processing_fees'
    case 'ad_spend': return 'allocated_ad_spend'
    case 'email_marketing': return 'allocated_email_marketing'
  }
}

function addAccumulator(target: ChannelAccumulator, field: keyof ChannelAccumulator, value: number) {
  target[field] += value
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// Google Service-Account JWT auth (RS256)
// ---------------------------------------------------------------------------

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const stripped = pem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binary = atob(stripped)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function getGoogleAccessToken(email: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const headerB64 = base64urlEncode(JSON.stringify(header))
  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await importPrivateKey(privateKeyPem)
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  )
  const jwt = `${signingInput}.${base64urlEncode(new Uint8Array(sig))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google token exchange failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('No access_token in Google token response')
  return data.access_token as string
}

function extractSheetId(input: string): string {
  if (!input) return ''
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input.replace(/['"]/g, '').trim()
}

// ---------------------------------------------------------------------------
// Google Sheets API
// ---------------------------------------------------------------------------

interface SheetValues {
  range: string
  values: string[][]
}

async function fetchSheets(
  accessToken: string,
  spreadsheetId: string,
  sheetNames: string[],
): Promise<SheetValues[]> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`,
  )
  for (const name of sheetNames) url.searchParams.append('ranges', name)
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets API error (${res.status}): ${text}`)
  }
  const body = await res.json()
  return (body.valueRanges ?? []) as SheetValues[]
}

// ---------------------------------------------------------------------------
// Month header detection
// ---------------------------------------------------------------------------

function parseMonthCell(cell: string): { month: string; isPartial: boolean } | null {
  if (!cell || typeof cell !== 'string') return null
  const isPartial = /\(partial\)/i.test(cell)
  const cleaned = cell.replace(/\(partial\)/i, '').trim()
  const m = cleaned.match(/^(\w+)\s+(\d{4})$/)
  if (!m) return null
  const num = MONTH_ABBREVS[m[1].toLowerCase()]
  if (!num) return null
  return { month: `${m[2]}-${num}-01`, isPartial }
}

function detectMonthRow(rows: string[][]): { rowIndex: number; months: MonthMeta[] } {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r]
    const months: MonthMeta[] = []
    for (let c = 1; c < row.length; c++) {
      const parsed = parseMonthCell(String(row[c] ?? ''))
      if (parsed) months.push({ ...parsed, colIndex: c })
    }
    if (months.length >= 2) return { rowIndex: r, months }
  }
  throw new Error('Could not find month headers in the first 10 rows of the P&L sheet')
}

// ---------------------------------------------------------------------------
// P&L parser
// ---------------------------------------------------------------------------

interface PnlResult {
  rows: Record<string, unknown>[]
  warnings: string[]
  unrecognized: string[]
}

function parsePnl(sheet: SheetValues): PnlResult {
  const data = sheet.values
  if (!data || data.length < 3) throw new Error('P&L sheet has fewer than 3 rows')

  const { rowIndex: headerRow, months } = detectMonthRow(data)

  // Per-month accumulators: channel → accumulator
  const accByMonth = new Map<
    string,
    { channels: Record<Channel, ChannelAccumulator>; extras: CompanyExtras; isPartial: boolean }
  >()
  for (const m of months) {
    const channels = {} as Record<Channel, ChannelAccumulator>
    for (const ch of CHANNELS) channels[ch] = emptyAccumulator()
    accByMonth.set(m.month, { channels, extras: emptyExtras(), isPartial: m.isPartial })
  }

  // Track reconciliation values and unrecognized items
  const totalNetSales = new Map<string, number>()
  const unrecognized: string[] = []
  const warnings: string[] = []

  for (let r = headerRow + 1; r < data.length; r++) {
    const row = data[r]
    const lineItem = String(row[0] ?? '').trim()
    if (!lineItem) continue

    // Capture "Total Net Sales" for reconciliation, then skip subtotal rows
    if (/^total net sales/i.test(lineItem)) {
      for (const m of months) {
        totalNetSales.set(m.month, parseNumber(String(row[m.colIndex] ?? '')))
      }
      continue
    }
    if (SKIP_ROW_PATTERNS.some((p) => p.test(lineItem))) continue

    // Try channel mapping (exact match, case-insensitive)
    const mapping = CHANNEL_MAPPINGS.find(
      (cm) => cm.pattern.toLowerCase() === lineItem.toLowerCase(),
    )

    if (mapping) {
      const field = accumulatorField(mapping.type, mapping.pattern)
      for (const m of months) {
        const value = parseNumber(String(row[m.colIndex] ?? ''))
        if (value === 0) continue
        const entry = accByMonth.get(m.month)!
        addAccumulator(entry.channels[mapping.channel], field, value)
        addAccumulator(entry.channels.company, field, value)
        if (WHOLESALE_SUB.includes(mapping.channel)) {
          addAccumulator(entry.channels.wholesale, field, value)
        }
      }
      continue
    }

    // Try company-only field mapping
    const companyRule = COMPANY_FIELD_RULES.find((cr) => cr.test.test(lineItem))
    if (companyRule) {
      for (const m of months) {
        const value = parseNumber(String(row[m.colIndex] ?? ''))
        if (value === 0) continue
        accByMonth.get(m.month)!.extras[companyRule.field] += value
      }
      continue
    }

    // Truly unrecognized — add to company other_income_expenses
    let hasValue = false
    for (const m of months) {
      const value = parseNumber(String(row[m.colIndex] ?? ''))
      if (value === 0) continue
      hasValue = true
      accByMonth.get(m.month)!.extras.other_income_expenses += value
    }
    if (hasValue) unrecognized.push(lineItem)
  }

  // Build output rows
  const dbRows: Record<string, unknown>[] = []

  for (const m of months) {
    const entry = accByMonth.get(m.month)!

    for (const ch of CHANNELS) {
      const acc = entry.channels[ch]
      const isCompany = ch === 'company'
      const ext = isCompany ? entry.extras : emptyExtras()

      const net_revenue = round2(
        acc.gross_revenue + acc.shipping_income + acc.discounts + acc.returns,
      )
      const gross_profit = round2(net_revenue + acc.cogs)
      const gross_margin_pct =
        net_revenue !== 0 ? round2((gross_profit / net_revenue) * 100) : 0
      const total_fees = round2(acc.processing_fees + acc.selling_fees)
      const contribution_margin = round2(
        net_revenue + acc.cogs + total_fees + acc.allocated_ad_spend + acc.allocated_email_marketing,
      )
      const contribution_margin_pct =
        net_revenue !== 0 ? round2((contribution_margin / net_revenue) * 100) : 0

      const total_opex = round2(
        ext.shipping_fulfillment + ext.payroll + ext.ga_expense +
        ext.sm_expense + ext.rd_expense + ext.depreciation,
      )
      const net_operating_profit = round2(contribution_margin + total_opex)
      const ebitda = round2(net_operating_profit - ext.depreciation)
      const net_profit = round2(
        net_operating_profit + ext.interest_financing + ext.other_income_expenses,
      )

      dbRows.push({
        month: m.month,
        channel: ch,
        gross_revenue: round2(acc.gross_revenue),
        shipping_income: round2(acc.shipping_income),
        discounts: round2(acc.discounts),
        returns: round2(acc.returns),
        net_revenue,
        cogs: round2(acc.cogs),
        gross_profit,
        gross_margin_pct,
        processing_fees: round2(acc.processing_fees),
        selling_fees: round2(acc.selling_fees),
        total_fees,
        allocated_ad_spend: round2(acc.allocated_ad_spend),
        allocated_email_marketing: round2(acc.allocated_email_marketing),
        contribution_margin,
        contribution_margin_pct,
        shipping_fulfillment: round2(ext.shipping_fulfillment),
        payroll: round2(ext.payroll),
        ga_expense: round2(ext.ga_expense),
        sm_expense: round2(ext.sm_expense),
        rd_expense: round2(ext.rd_expense),
        depreciation: round2(ext.depreciation),
        total_opex,
        ebitda,
        net_operating_profit,
        interest_financing: round2(ext.interest_financing),
        other_income_expenses: round2(ext.other_income_expenses),
        net_profit,
        is_partial: m.isPartial,
        synced_at: new Date().toISOString(),
      })
    }

    // Reconciliation: compare company net_revenue to Total Net Sales
    const sheetTotal = totalNetSales.get(m.month)
    if (sheetTotal !== undefined && sheetTotal !== 0) {
      const computed = entry.channels.company.gross_revenue +
        entry.channels.company.shipping_income +
        entry.channels.company.discounts +
        entry.channels.company.returns
      const diff = Math.abs(computed - sheetTotal) / Math.abs(sheetTotal)
      if (diff > 0.05) {
        warnings.push(
          `${m.month}: Parsed net revenue (${round2(computed)}) differs from ` +
          `Total Net Sales (${sheetTotal}) by ${round2(diff * 100)}%`,
        )
      }
    }
  }

  return { rows: dbRows, warnings, unrecognized }
}

// ---------------------------------------------------------------------------
// Balance Sheet / Cash Flow parsers (single-row-per-month, field-mapped)
// ---------------------------------------------------------------------------

function parseSimpleSheet(
  sheet: SheetValues,
  fieldMap: Array<{ test: RegExp; col: string }>,
): Record<string, unknown>[] {
  const data = sheet.values
  if (!data || data.length < 3) return []

  const { rowIndex: headerRow, months } = detectMonthRow(data)
  const monthData = new Map<string, Record<string, unknown>>()
  for (const m of months) {
    monthData.set(m.month, { month: m.month, synced_at: new Date().toISOString() })
  }
  for (let r = headerRow + 1; r < data.length; r++) {
    const lineItem = String(data[r][0] ?? '').trim()
    if (!lineItem) continue

    const rule = fieldMap.find((fm) => fm.test.test(lineItem))
    if (!rule) continue

    for (const m of months) {
      const value = parseNumber(String(data[r][m.colIndex] ?? ''))
      const row = monthData.get(m.month)!
      row[rule.col] = round2(value)
    }
  }

  return [...monthData.values()]
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

  const { data: syncLog } = await supabase
    .from('fin_sync_log')
    .insert({ source: 'finaloop_sheets', status: 'running', rows_synced: 0 })
    .select()
    .single()

  const syncId: string = syncLog?.id ?? ''

  const saEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const saKeyRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  if (!saEmail || !saKeyRaw) {
    const msg = 'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
    await supabase.from('fin_sync_log').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: msg,
    }).eq('id', syncId)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const saKey = saKeyRaw.replace(/\\n/g, '\n')

  // Load Sheet IDs: query params > env vars > fin_settings
  const url = new URL(req.url)
  let pnlSheetId = url.searchParams.get('pnl_sheet_id') ?? Deno.env.get('FINALOOP_PNL_SHEET_ID') ?? ''
  let bsSheetId = url.searchParams.get('bs_sheet_id') ?? Deno.env.get('FINALOOP_BALANCE_SHEET_ID') ?? ''
  let cfSheetId = url.searchParams.get('cf_sheet_id') ?? Deno.env.get('FINALOOP_CASHFLOW_SHEET_ID') ?? ''

  // Fallback: single sheet ID for all three (legacy)
  const legacyId = url.searchParams.get('sheet_id') ?? Deno.env.get('FINALOOP_SHEET_ID') ?? ''

  // If any are missing, try reading from fin_settings
  if (!pnlSheetId || !bsSheetId || !cfSheetId) {
    const { data: settingsRows } = await supabase
      .from('fin_settings')
      .select('key, value')
      .in('key', ['finaloop_pnl_sheet_id', 'finaloop_balance_sheet_id', 'finaloop_cashflow_sheet_id'])

    const settingsMap = new Map(
      (settingsRows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]),
    )

    if (!pnlSheetId) pnlSheetId = extractSheetId(String(settingsMap.get('finaloop_pnl_sheet_id') ?? ''))
    if (!bsSheetId) bsSheetId = extractSheetId(String(settingsMap.get('finaloop_balance_sheet_id') ?? ''))
    if (!cfSheetId) cfSheetId = extractSheetId(String(settingsMap.get('finaloop_cashflow_sheet_id') ?? ''))
  }

  // Apply legacy fallback
  if (!pnlSheetId) pnlSheetId = legacyId
  if (!bsSheetId) bsSheetId = legacyId
  if (!cfSheetId) cfSheetId = legacyId

  if (!pnlSheetId) {
    const msg = 'Missing P&L Sheet ID. Set it in Settings > Channels > Data Sources, or via FINALOOP_PNL_SHEET_ID env var.'
    await supabase.from('fin_sync_log').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: msg,
    }).eq('id', syncId)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const pnlTab = Deno.env.get('FINALOOP_PNL_TAB') ?? 'Profit & Loss'
  const bsTab = Deno.env.get('FINALOOP_BS_TAB') ?? 'Balance Sheet'
  const cfTab = Deno.env.get('FINALOOP_CF_TAB') ?? 'Cash Flow'

  // Determine if all three are in the same spreadsheet or separate
  const allSameSheet = pnlSheetId === bsSheetId && bsSheetId === cfSheetId

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        await supabase.from('fin_sync_log').update({
          status: `retry_${attempt - 1}`,
          attempt,
        }).eq('id', syncId)
        await sleep(RETRY_DELAYS[attempt - 2])
      }

      // 1. Google auth
      const accessToken = await getGoogleAccessToken(saEmail, saKey)

      // 2. Fetch sheets (same spreadsheet or separate)
      let pnlSheet: SheetValues | null = null
      let bsSheet: SheetValues | null = null
      let cfSheet: SheetValues | null = null

      if (allSameSheet) {
        const tabs = [pnlTab]
        if (bsSheetId) tabs.push(bsTab)
        if (cfSheetId) tabs.push(cfTab)
        const sheets = await fetchSheets(accessToken, pnlSheetId, tabs)
        pnlSheet = sheets[0] ?? null
        bsSheet = sheets[1] ?? null
        cfSheet = sheets[2] ?? null
      } else {
        const [pnlSheets] = await Promise.all([
          fetchSheets(accessToken, pnlSheetId, [pnlTab]),
        ])
        pnlSheet = pnlSheets[0] ?? null

        if (bsSheetId) {
          const bsSheets = await fetchSheets(accessToken, bsSheetId, [bsTab])
          bsSheet = bsSheets[0] ?? null
        }
        if (cfSheetId) {
          const cfSheets = await fetchSheets(accessToken, cfSheetId, [cfTab])
          cfSheet = cfSheets[0] ?? null
        }
      }

      if (!pnlSheet) throw new Error('No P&L sheet data returned')

      // 3. Parse P&L
      const pnl = parsePnl(pnlSheet)

      // 4. Upsert P&L
      const { error: pnlError } = await supabase
        .from('fin_pnl_monthly')
        .upsert(pnl.rows, { onConflict: 'month,channel' })
      if (pnlError) throw new Error(`P&L upsert failed: ${pnlError.message}`)

      let totalRows = pnl.rows.length

      // 5. Parse & upsert Balance Sheet
      if (bsSheet) {
        const bsRows = parseSimpleSheet(bsSheet, BS_FIELD_MAP)
        if (bsRows.length > 0) {
          const { error: bsError } = await supabase
            .from('fin_balance_sheet_monthly')
            .upsert(bsRows, { onConflict: 'month' })
          if (bsError) throw new Error(`Balance sheet upsert failed: ${bsError.message}`)
          totalRows += bsRows.length
        }
      }

      // 6. Parse & upsert Cash Flow
      if (cfSheet) {
        const cfRows = parseSimpleSheet(cfSheet, CF_FIELD_MAP)
        if (cfRows.length > 0) {
          const { error: cfError } = await supabase
            .from('fin_cashflow_monthly')
            .upsert(cfRows, { onConflict: 'month' })
          if (cfError) throw new Error(`Cash flow upsert failed: ${cfError.message}`)
          totalRows += cfRows.length
        }
      }

      // 7. Log warnings / unrecognized items
      const notes: string[] = []
      if (pnl.warnings.length > 0) notes.push('Reconciliation: ' + pnl.warnings.join('; '))
      if (pnl.unrecognized.length > 0) {
        notes.push('Unrecognized line items: ' + pnl.unrecognized.join(', '))
      }

      await supabase.from('fin_sync_log').update({
        status: pnl.warnings.length > 0 ? 'partial' : 'success',
        completed_at: new Date().toISOString(),
        rows_synced: totalRows,
        error_message: notes.length > 0 ? notes.join(' | ') : null,
      }).eq('id', syncId)

      return new Response(
        JSON.stringify({
          success: true,
          rows: totalRows,
          warnings: pnl.warnings,
          unrecognized: pnl.unrecognized,
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === MAX_ATTEMPTS) {
        await supabase.from('fin_sync_log').update({
          status: 'error',
          completed_at: new Date().toISOString(),
          error_message: message,
        }).eq('id', syncId)
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
