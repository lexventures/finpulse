import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  CHANNEL_MAPPINGS,
  CHANNELS,
  WHOLESALE_SUBCHANNELS,
  type FinPulseChannel as Channel,
  type LineItemType,
} from '../../../shared/channel-mapping.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
const WHOLESALE_SUB: Channel[] = [...WHOLESALE_SUBCHANNELS]

// Subtotal / header rows that should never be accumulated.
// NOTE: "Gross Profit", "Expenses", "Operating Expenses" are handled as zone
// transitions in parsePnl and must NOT appear here (they'd be skipped before
// the zone tracker sees them).
const SKIP_ROW_PATTERNS = [
  /^total\b/i,
  /^net\s*(income|profit|revenue|sales|loss)/i,
  /^operating\s*(income|profit|loss)/i,
  /^ebitda/i,
  /^gross\s*margin/i,
  /^contribution\s*margin/i,
  /^cost of goods sold$/i,
  /^revenue$/i,
]

// Company-only patterns for opex / below-the-line items.
// These match both category headers AND individual line items within those categories.
const COMPANY_FIELD_RULES: Array<{ test: RegExp; field: keyof CompanyExtras }> = [
  { test: /salaries|wages|employer taxes|employee benefit|payroll|bonus|gusto/i, field: 'payroll' },
  { test: /shipping & fulfillment|shipping & freight|fulfillment cost|freight|postage|auctane|stamps\.com|fedex|ups\b/i, field: 'shipping_fulfillment' },
  { test: /office|rent\b|insurance|professional services|utilities|bank fees|software|legal|accounting|telephone|general & administrative|operating expense/i, field: 'ga_expense' },
  { test: /marketing(?!.*email)|social media|brand|events|sponsorship|pr\b|paid online ads/i, field: 'sm_expense' },
  { test: /research|development|r&d/i, field: 'rd_expense' },
  { test: /depreciation|amortization|equipment\b|leasehold/i, field: 'depreciation' },
  { test: /interest|financing|loan\b|foreign exchange/i, field: 'interest_financing' },
  { test: /uncategorized|other income|other expense|miscellaneous|sundry|owner.?s? draw|personal\b|charitable|donation/i, field: 'other_income_expenses' },
]

// Section headers that set context for vendor-level line items beneath them.
// When a section header is encountered, all subsequent unmatched vendor lines
// accumulate into this field until a new section is detected.
const SECTION_HEADER_RULES: Array<{ test: RegExp; field: keyof CompanyExtras }> = [
  { test: /^salaries & wages|^payroll|^employee/i, field: 'payroll' },
  { test: /^shipping & fulfillment|^shipping & freight/i, field: 'shipping_fulfillment' },
  { test: /^processing fees|^merchant fees/i, field: 'ga_expense' },
  { test: /^general & administrative|^operating expense|^office|^software|^other operating/i, field: 'ga_expense' },
  { test: /^marketing\b|^paid online ads|^sales & marketing/i, field: 'sm_expense' },
  { test: /^depreciation|^amortization/i, field: 'depreciation' },
  { test: /^interest|^financing/i, field: 'interest_financing' },
  { test: /^other income|^other expense|^non-operating|^owner.?s? draw|^charitable|^personal/i, field: 'other_income_expenses' },
]

// Balance sheet line-item → DB column (case-insensitive contains match)
const BS_FIELD_MAP: Array<{ test: RegExp; col: string }> = [
  { test: /bank accounts/i, col: 'bank_accounts_total' },
  { test: /undeposited funds/i, col: 'undeposited_funds_total' },
  { test: /cash and cash equivalents|total cash|cash & equivalents/i, col: 'cash_and_equivalents' },
  { test: /^inventory|inventory value/i, col: 'inventory_value' },
  { test: /accounts receivable/i, col: 'accounts_receivable' },
  { test: /loans to related/i, col: 'loans_to_related_party' },
  { test: /unidentified payouts/i, col: 'unidentified_payouts' },
  { test: /total current assets/i, col: 'total_current_assets' },
  { test: /net fixed assets/i, col: 'net_fixed_assets' },
  { test: /total assets/i, col: 'total_assets' },
  { test: /credit card/i, col: 'credit_card_balances' },
  { test: /accounts payable/i, col: 'accounts_payable' },
  { test: /sales tax.*liabilit/i, col: 'sales_tax_liability' },
  { test: /total current liabilities/i, col: 'total_current_liabilities' },
  { test: /total liabilities/i, col: 'total_liabilities' },
  { test: /total.*equity/i, col: 'total_equity' },
  { test: /current year.*net.*profit/i, col: 'current_year_net_profit' },
]

// Cash-flow line-item → DB column
const CF_FIELD_MAP: Array<{ test: RegExp; col: string }> = [
  { test: /cash (from|provided by|used in) operations|operating activities|net cash.*operating/i, col: 'cash_from_operations' },
  { test: /cash (from|used in) investing|investing activities|net cash.*investing/i, col: 'cash_from_investing' },
  { test: /cash (from|used in) financing|financing activities|net cash.*financing/i, col: 'cash_from_financing' },
  { test: /net (cash flow|change in cash|increase|decrease)|total change|net change in cash/i, col: 'net_cash_flow' },
  { test: /inventory purchase|purchase.*inventory/i, col: 'inventory_purchases' },
  { test: /owner.?s? distribution|distribution.*owner/i, col: 'owner_distributions' },
  { test: /sales tax payment|tax.*payment|remit.*tax/i, col: 'sales_tax_payments' },
  { test: /(starting|beginning|opening) (cash|balance)|cash.*beginning|balance.*beginning/i, col: 'starting_cash' },
  { test: /(ending|closing) (cash|balance)|cash.*end\b|balance.*end\b/i, col: 'ending_cash' },
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
const FETCH_TIMEOUT_MS = 30_000
const SHEET_ID_MIN_LEN = 20
const SHEET_ID_RE = /^[a-zA-Z0-9_-]+$/
const TAB_NAME_MAX_LEN = 120
const TAB_NAME_FORBIDDEN = /[!:'"\\]/

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  )
}

function validateSheetId(id: string, label: string): void {
  if (id.length < SHEET_ID_MIN_LEN) {
    throw new SheetConfigError(`${label} Sheet ID is too short (${id.length} chars, need ${SHEET_ID_MIN_LEN}+)`)
  }
  if (!SHEET_ID_RE.test(id)) {
    throw new SheetConfigError(`${label} Sheet ID contains invalid characters`)
  }
}

function validateTabName(name: string, label: string): void {
  if (name.length > TAB_NAME_MAX_LEN) {
    throw new SheetConfigError(`${label} tab name exceeds ${TAB_NAME_MAX_LEN} chars`)
  }
  if (TAB_NAME_FORBIDDEN.test(name)) {
    throw new SheetConfigError(
      `${label} tab name contains forbidden characters (! : ' " \\). ` +
      `Use only the plain tab name, not an A1 range reference.`,
    )
  }
}

function validatePemKey(pem: string): void {
  if (!pem.includes('PRIVATE KEY')) {
    throw new SheetConfigError(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not contain a PEM private key header. ' +
      'Ensure the full key (including -----BEGIN/END-----) is set.',
    )
  }
  const stripped = pem
    .replace(/-----BEGIN [A-Z ]*KEY-----/g, '')
    .replace(/-----END [A-Z ]*KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s/g, '')
  if (stripped.length < 100) {
    throw new SheetConfigError(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY appears truncated (base64 body too short).',
    )
  }
}

class SheetConfigError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'SheetConfigError'
  }
}

class NonRetryableError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'NonRetryableError'
  }
}

function normalizeLineItem(value: string): string {
  return value.replace(/[\u00a0\s]+/g, ' ').trim().toLowerCase()
}

const CHANNEL_MAPPING_BY_LABEL = new Map(
  CHANNEL_MAPPINGS.map((mapping) => [normalizeLineItem(mapping.pattern), mapping]),
)

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

let _unparsedCells: Array<{ row: number; col: number; raw: string }> = []

function resetUnparsedTracking(): void {
  _unparsedCells = []
}

function getUnparsedCells(): typeof _unparsedCells {
  return _unparsedCells
}

function parseNumber(raw: unknown, rowHint = -1, colHint = -1): number {
  if (raw == null) return 0
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0
  }
  const text = String(raw).trim()
  if (text === '' || text === '-') return 0
  let s = text.replace(/[$,\s]/g, '')
  if (s.startsWith('(') && s.endsWith(')')) s = '-' + s.slice(1, -1)
  const n = parseFloat(s)
  if (Number.isNaN(n)) {
    if (text.length > 0 && _unparsedCells.length < 50) {
      _unparsedCells.push({ row: rowHint, col: colHint, raw: text.substring(0, 60) })
    }
    return 0
  }
  return n
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

function feeAccumulatorField(lineItem: string): keyof ChannelAccumulator {
  const n = lineItem.toLowerCase()
  // Finaloop uses "Selling fees - …" vs "Fees - Shopify …" (payment processing). Only the
  // former should hit selling_fees; the old pattern.startsWith('selling') missed mapped rows
  // whose pattern is "Fees - Shopify - …".
  if (/\bselling\s+fees\b/.test(n) || (n.includes('selling') && n.includes('fee'))) {
    return 'selling_fees'
  }
  // Standalone "Faire" fee row (channel-mapping) is marketplace commission / selling-type fees
  if (n === 'faire') return 'selling_fees'
  return 'processing_fees'
}

function accumulatorField(
  type: LineItemType,
  lineItem: string,
): keyof ChannelAccumulator {
  switch (type) {
    case 'revenue': return 'gross_revenue'
    case 'shipping': return 'shipping_income'
    case 'discount': return 'discounts'
    case 'return': return 'returns'
    case 'cogs': return 'cogs'
    case 'fee':
      return feeAccumulatorField(lineItem)
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
    .replace(/-----BEGIN [A-Z ]*KEY-----/g, '')
    .replace(/-----END [A-Z ]*KEY-----/g, '')
    .replace(/\\n/g, '')
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

  const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    if (res.status === 401 || res.status === 403) {
      throw new NonRetryableError(
        `Google token exchange rejected (${res.status}): ${text}. ` +
        'Check that GOOGLE_SERVICE_ACCOUNT_EMAIL and PRIVATE_KEY are correct.',
      )
    }
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
  values: unknown[][]
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

  const res = await fetchWithTimeout(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text()
    if (res.status === 403) {
      throw new NonRetryableError(
        `Google Sheets access denied (403). Share the sheet with the service ` +
        `account email as a Viewer. Details: ${text}`,
      )
    }
    if (res.status === 404) {
      throw new NonRetryableError(
        `Google Sheets not found (404). Verify the Sheet ID and tab name are correct. Details: ${text}`,
      )
    }
    throw new Error(`Sheets API error (${res.status}): ${text}`)
  }
  const body = await res.json()
  return (body.valueRanges ?? []) as SheetValues[]
}

// ---------------------------------------------------------------------------
// Month header detection
// ---------------------------------------------------------------------------

function monthFromDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}-01`
}

function parseMonthCell(rawCell: unknown): { month: string; isPartial: boolean } | null {
  if (rawCell == null) return null
  if (typeof rawCell === 'number') {
    // Google Sheets serial date days since 1899-12-30.
    if (!Number.isFinite(rawCell) || rawCell <= 0) return null
    const utcMs = Date.UTC(1899, 11, 30) + rawCell * 86400000
    const month = monthFromDate(new Date(utcMs))
    return month ? { month, isPartial: false } : null
  }

  const cell = String(rawCell).trim()
  if (!cell) return null
  const isPartial = /\(partial\)/i.test(cell)
  const cleaned = cell.replace(/\(partial\)/i, '').trim()

  // Format 1: "January 2026" or "Jan 2026"
  const m1 = cleaned.match(/^(\w+)\s+(\d{4})$/)
  if (m1) {
    const num = MONTH_ABBREVS[m1[1].toLowerCase()]
    if (num) return { month: `${m1[2]}-${num}-01`, isPartial }
  }

  // Format 2: "Jan 31, 2026" or "January 12, 2026"
  const m2 = cleaned.match(/^(\w+)\s+\d{1,2},?\s+(\d{4})$/)
  if (m2) {
    const num = MONTH_ABBREVS[m2[1].toLowerCase()]
    if (num) return { month: `${m2[2]}-${num}-01`, isPartial }
  }

  // Format 3: "2026-01-31" ISO date
  const m3 = cleaned.match(/^(\d{4})-(\d{2})-\d{2}$/)
  if (m3) return { month: `${m3[1]}-${m3[2]}-01`, isPartial }

  // Format 4: numeric-like string serial date from Sheets.
  const numeric = Number(cleaned)
  if (Number.isFinite(numeric) && numeric > 0) {
    const utcMs = Date.UTC(1899, 11, 30) + numeric * 86400000
    const month = monthFromDate(new Date(utcMs))
    if (month) return { month, isPartial }
  }

  return null
}

function detectMonthRow(rows: unknown[][]): { rowIndex: number; months: MonthMeta[] } {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r]
    const months: MonthMeta[] = []
    for (let c = 1; c < row.length; c++) {
      const parsed = parseMonthCell(row[c])
      if (parsed) months.push({ ...parsed, colIndex: c })
    }
    if (months.length >= 2) return { rowIndex: r, months }
  }
  const sampleRows = rows.slice(0, 10).map((r, i) =>
    `Row ${i}: [${r.slice(0, 6).map((c: unknown) => JSON.stringify(c)).join(', ')}]`
  ).join('; ')
  throw new Error(`Could not find month headers in the first 10 rows. Sample: ${sampleRows}`)
}

// ---------------------------------------------------------------------------
// P&L parser
// ---------------------------------------------------------------------------

interface PnlResult {
  rows: Record<string, unknown>[]
  warnings: string[]
  unrecognized: Array<{ lineItem: string; total: number }>
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
  const unrecognizedTotals = new Map<string, number>()
  const warnings: string[] = []

  // P&L zone tracking: once we pass "Gross Profit" or "Cost of goods sold" totals,
  // we're in the operating expenses area. Any vendor line here that doesn't match
  // a specific rule is a legitimate expense — default to the active section or
  // other_income_expenses rather than marking "unrecognized".
  let inExpenseZone = false
  let activeSection: keyof CompanyExtras | null = null

  for (let r = headerRow + 1; r < data.length; r++) {
    const row = data[r]
    const lineItem = String(row[0] ?? '').trim()
    if (!lineItem) continue

    // Capture "Total Net Sales" for reconciliation, then skip subtotal rows
    if (/^total net sales/i.test(lineItem)) {
      for (const m of months) {
        totalNetSales.set(m.month, parseNumber(row[m.colIndex], r, m.colIndex))
      }
      activeSection = null
      continue
    }

    // Detect transition into expense zone via structural markers
    if (/^gross\s*profit/i.test(lineItem) || /^operating expenses?$/i.test(lineItem) || /^expenses?$/i.test(lineItem)) {
      inExpenseZone = true
      activeSection = null
      continue
    }
    if (/^other\s*(income|expenses?)\s*((&|and)\s*(income|expenses?))?\s*$/i.test(lineItem)) {
      inExpenseZone = true
      activeSection = 'other_income_expenses'
      continue
    }

    if (SKIP_ROW_PATTERNS.some((p) => p.test(lineItem))) {
      if (/^total\b/i.test(lineItem)) activeSection = null
      continue
    }

    // Try channel mapping (exact match, case-insensitive)
    const mapping = CHANNEL_MAPPING_BY_LABEL.get(normalizeLineItem(lineItem))

    if (mapping) {
      activeSection = null
      const field = accumulatorField(mapping.type, lineItem)
      for (const m of months) {
        const value = parseNumber(row[m.colIndex], r, m.colIndex)
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

    // Check if this is a section header that sets context for vendor lines beneath it
    const sectionRule = SECTION_HEADER_RULES.find((sr) => sr.test.test(lineItem))
    if (sectionRule) {
      activeSection = sectionRule.field
    }

    // Try company-only field mapping (direct match on line item text)
    const companyRule = COMPANY_FIELD_RULES.find((cr) => cr.test.test(lineItem))
    if (companyRule) {
      if (!sectionRule) activeSection = companyRule.field
      for (const m of months) {
        const value = parseNumber(row[m.colIndex], r, m.colIndex)
        if (value === 0) continue
        accByMonth.get(m.month)!.extras[companyRule.field] += value
      }
      continue
    }

    // If we're inside a known section, assign this vendor line to that section
    if (activeSection) {
      for (const m of months) {
        const value = parseNumber(row[m.colIndex], r, m.colIndex)
        if (value === 0) continue
        accByMonth.get(m.month)!.extras[activeSection] += value
      }
      continue
    }

    // In the expense zone, any unmatched vendor line is a real expense —
    // book it to other_income_expenses rather than flagging unrecognized.
    if (inExpenseZone) {
      for (const m of months) {
        const value = parseNumber(row[m.colIndex], r, m.colIndex)
        if (value === 0) continue
        accByMonth.get(m.month)!.extras.other_income_expenses += value
      }
      continue
    }

    // Pre-expense-zone unrecognized — track for operator review.
    let hasValue = false
    let rowTotal = 0
    for (const m of months) {
      const value = parseNumber(row[m.colIndex], r, m.colIndex)
      if (value === 0) continue
      hasValue = true
      rowTotal += value
    }
    if (hasValue) {
      unrecognizedTotals.set(lineItem, (unrecognizedTotals.get(lineItem) ?? 0) + rowTotal)
    }
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

  const unrecognized = [...unrecognizedTotals.entries()].map(([lineItem, total]) => ({
    lineItem,
    total: round2(total),
  }))

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
    const rawLabel = String(data[r][0] ?? '')
    const lineItem = rawLabel.replace(/^[\s\u00a0]+/, '').trim()
    if (!lineItem) continue

    const rule = fieldMap.find((fm) => fm.test.test(lineItem))
    if (!rule) continue

    for (const m of months) {
      const value = parseNumber(data[r][m.colIndex], r, m.colIndex)
      const row = monthData.get(m.month)!
      row[rule.col] = round2(value)
    }
  }

  return [...monthData.values()]
}

function hasDefinedValue(row: Record<string, unknown>, key: string): boolean {
  return row[key] !== null && row[key] !== undefined
}

function validateRequiredFields(
  label: string,
  rows: Record<string, unknown>[],
  requiredAnyFields: string[],
): void {
  if (rows.length === 0) {
    throw new Error(`${label} sheet parsed zero month rows.`)
  }

  for (const row of rows) {
    const ok = requiredAnyFields.some((field) => hasDefinedValue(row, field))
    if (!ok) {
      throw new Error(
        `${label} month ${String(row.month ?? 'unknown')} is missing expected fields (${requiredAnyFields.join(', ')})`,
      )
    }
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
  const saKey = saKeyRaw
    .replace(/\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/"\s*$/g, '')
    .replace(/^\s*"/g, '')

  try {
    validatePemKey(saKey)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    await supabase.from('fin_sync_log').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: msg,
    }).eq('id', syncId)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Load Sheet IDs / tab names: query params > env vars > fin_settings > defaults
  const url = new URL(req.url)
  let pnlSheetId = url.searchParams.get('pnl_sheet_id') ?? Deno.env.get('FINALOOP_PNL_SHEET_ID') ?? ''
  let bsSheetId = url.searchParams.get('bs_sheet_id') ?? Deno.env.get('FINALOOP_BALANCE_SHEET_ID') ?? ''
  let cfSheetId = url.searchParams.get('cf_sheet_id') ?? Deno.env.get('FINALOOP_CASHFLOW_SHEET_ID') ?? ''
  let pnlTabSetting = url.searchParams.get('pnl_tab') ?? Deno.env.get('FINALOOP_PNL_TAB') ?? ''
  let bsTabSetting = url.searchParams.get('bs_tab') ?? Deno.env.get('FINALOOP_BS_TAB') ?? ''
  let cfTabSetting = url.searchParams.get('cf_tab') ?? Deno.env.get('FINALOOP_CF_TAB') ?? ''

  // Fallback: single sheet ID for all three.
  const legacyId = url.searchParams.get('sheet_id') ?? Deno.env.get('FINALOOP_SHEET_ID') ?? ''

  if (!pnlSheetId && legacyId) pnlSheetId = legacyId
  if (!bsSheetId && legacyId) bsSheetId = legacyId
  if (!cfSheetId && legacyId) cfSheetId = legacyId

  // If any IDs/tabs are missing, try reading from fin_settings.
  if (!pnlSheetId || !bsSheetId || !cfSheetId || !pnlTabSetting || !bsTabSetting || !cfTabSetting) {
    const { data: settingsRows } = await supabase
      .from('fin_settings')
      .select('key, value')
      .in('key', [
        'finaloop_pnl_sheet_id',
        'finaloop_balance_sheet_id',
        'finaloop_cashflow_sheet_id',
        'finaloop_pnl_tab',
        'finaloop_balance_sheet_tab',
        'finaloop_cashflow_tab',
      ])

    const settingsMap = new Map(
      (settingsRows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]),
    )

    if (!pnlSheetId) pnlSheetId = extractSheetId(String(settingsMap.get('finaloop_pnl_sheet_id') ?? ''))
    if (!bsSheetId) bsSheetId = extractSheetId(String(settingsMap.get('finaloop_balance_sheet_id') ?? ''))
    if (!cfSheetId) cfSheetId = extractSheetId(String(settingsMap.get('finaloop_cashflow_sheet_id') ?? ''))
    if (!pnlTabSetting) pnlTabSetting = String(settingsMap.get('finaloop_pnl_tab') ?? '')
    if (!bsTabSetting) bsTabSetting = String(settingsMap.get('finaloop_balance_sheet_tab') ?? '')
    if (!cfTabSetting) cfTabSetting = String(settingsMap.get('finaloop_cashflow_tab') ?? '')
  }

  pnlSheetId = extractSheetId(pnlSheetId)
  bsSheetId = extractSheetId(bsSheetId)
  cfSheetId = extractSheetId(cfSheetId)

  const missingSheetLabels: string[] = []
  if (!pnlSheetId) missingSheetLabels.push('P&L')
  if (!bsSheetId) missingSheetLabels.push('Balance Sheet')
  if (!cfSheetId) missingSheetLabels.push('Cash Flow')
  if (missingSheetLabels.length > 0) {
    const msg = `Missing required Finaloop Sheet IDs: ${missingSheetLabels.join(', ')}. Set all three in Settings > Channels > Data Sources.`
    await supabase.from('fin_sync_log').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: msg,
    }).eq('id', syncId)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const pnlTab = String(pnlTabSetting || 'Profit and Loss').trim()
  const bsTab = String(bsTabSetting || 'Balance Sheet').trim()
  const cfTab = String(cfTabSetting || 'Cash Flow').trim()

  try {
    validateSheetId(pnlSheetId, 'P&L')
    validateSheetId(bsSheetId, 'Balance Sheet')
    validateSheetId(cfSheetId, 'Cash Flow')
    validateTabName(pnlTab, 'P&L')
    validateTabName(bsTab, 'Balance Sheet')
    validateTabName(cfTab, 'Cash Flow')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    await supabase.from('fin_sync_log').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: msg,
    }).eq('id', syncId)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

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

      resetUnparsedTracking()

      // 1. Google auth
      const accessToken = await getGoogleAccessToken(saEmail, saKey)

      // 2. Fetch sheets (same spreadsheet or separate)
      let pnlSheet: SheetValues | null = null
      let bsSheet: SheetValues | null = null
      let cfSheet: SheetValues | null = null

      if (allSameSheet) {
        const sheets = await fetchSheets(accessToken, pnlSheetId, [pnlTab, bsTab, cfTab])
        pnlSheet = sheets[0] ?? null
        bsSheet = sheets[1] ?? null
        cfSheet = sheets[2] ?? null
      } else {
        const [pnlSheets, bsSheets, cfSheets] = await Promise.all([
          fetchSheets(accessToken, pnlSheetId, [pnlTab]),
          fetchSheets(accessToken, bsSheetId, [bsTab]),
          fetchSheets(accessToken, cfSheetId, [cfTab]),
        ])
        pnlSheet = pnlSheets[0] ?? null
        bsSheet = bsSheets[0] ?? null
        cfSheet = cfSheets[0] ?? null
      }

      if (!pnlSheet) throw new Error('No P&L sheet data returned')
      if (!bsSheet) throw new Error('No Balance Sheet data returned')
      if (!cfSheet) throw new Error('No Cash Flow data returned')

      // 3. Parse all sheets before writing anything.
      const pnl = parsePnl(pnlSheet)
      if (pnl.rows.length === 0) {
        throw new Error('P&L parser returned zero rows.')
      }
      const byMonth = new Map<string, Set<string>>()
      for (const row of pnl.rows) {
        const month = String(row.month)
        const channel = String(row.channel)
        if (!byMonth.has(month)) byMonth.set(month, new Set<string>())
        byMonth.get(month)!.add(channel)
      }
      for (const [month, channels] of byMonth.entries()) {
        if (channels.size !== CHANNELS.length) {
          const missing = CHANNELS.filter((ch) => !channels.has(ch)).join(', ')
          throw new Error(`P&L month ${month} is missing expected channels: ${missing}`)
        }
      }

      const bsRows = parseSimpleSheet(bsSheet, BS_FIELD_MAP)
      for (const row of bsRows) {
        if (row.cash_and_equivalents == null || row.cash_and_equivalents === 0) {
          const bank = Number(row.bank_accounts_total) || 0
          const undeposited = Number(row.undeposited_funds_total) || 0
          if (bank > 0 || undeposited > 0) {
            row.cash_and_equivalents = round2(bank + undeposited)
          }
        }
      }
      validateRequiredFields(
        'Balance Sheet',
        bsRows,
        ['cash_and_equivalents', 'bank_accounts_total', 'total_assets'],
      )

      const cfRows = parseSimpleSheet(cfSheet, CF_FIELD_MAP)
      validateRequiredFields(
        'Cash Flow',
        cfRows,
        ['ending_cash', 'net_cash_flow', 'starting_cash'],
      )

      // 4. Apply all parsed rows atomically.
      const { data: applyResult, error: applyError } = await supabase
        .rpc('apply_finaloop_sync', {
          p_pnl_rows: pnl.rows,
          p_bs_rows: bsRows,
          p_cf_rows: cfRows,
        })
      if (applyError) throw new Error(`apply_finaloop_sync failed: ${applyError.message}`)

      const applyCounts = (applyResult ?? {}) as { total_rows?: number }
      const totalRows = Number(applyCounts.total_rows) ||
        (pnl.rows.length + bsRows.length + cfRows.length)

      // 5. Log warnings / unrecognized items / unparsed cells
      const notes: string[] = []
      if (pnl.warnings.length > 0) notes.push('Reconciliation: ' + pnl.warnings.join('; '))
      if (pnl.unrecognized.length > 0) {
        notes.push(
          'Unrecognized line items: ' +
          pnl.unrecognized
            .map((entry) => `${entry.lineItem} (${entry.total})`)
            .join(', '),
        )
      }
      const unparsed = getUnparsedCells()
      if (unparsed.length > 0) {
        notes.push(
          `${unparsed.length} cell(s) could not be parsed as numbers: ` +
          unparsed.slice(0, 5).map((c) => `R${c.row}C${c.col}="${c.raw}"`).join(', ') +
          (unparsed.length > 5 ? ` (+${unparsed.length - 5} more)` : ''),
        )
      }
      const status = pnl.warnings.length > 0 || pnl.unrecognized.length > 0 || unparsed.length > 0
        ? 'partial'
        : 'success'

      await supabase.from('fin_sync_log').update({
        status,
        completed_at: new Date().toISOString(),
        rows_synced: totalRows,
        error_message: notes.length > 0 ? notes.join(' | ') : null,
      }).eq('id', syncId)

      return new Response(
        JSON.stringify({
          success: true,
          status,
          rows: totalRows,
          warnings: pnl.warnings,
          unrecognized: pnl.unrecognized,
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const noRetry =
        error instanceof NonRetryableError ||
        error instanceof SheetConfigError
      if (noRetry || attempt === MAX_ATTEMPTS) {
        await supabase.from('fin_sync_log').update({
          status: 'error',
          completed_at: new Date().toISOString(),
          error_message: message,
        }).eq('id', syncId)
        const httpStatus = error instanceof SheetConfigError ? 400 : 500
        return new Response(JSON.stringify({ error: message }), {
          status: httpStatus,
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
