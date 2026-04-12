import type { FactsPacket } from './build-facts-packet'

const MAX_WORDS = 300
const FUZZY_TOLERANCE = 0.01

function extractNumbers(text: string): number[] {
  const results: number[] = []

  // Match dollar amounts like $1,234.56 or $12.5M or $45K
  const dollarPattern = /\$[\d,]+(?:\.\d+)?(?:[MKBmkb])?/g
  for (const match of text.matchAll(dollarPattern)) {
    const raw = match[0].replace(/[$,]/g, '')
    const multiplier = raw.endsWith('M') || raw.endsWith('m')
      ? 1_000_000
      : raw.endsWith('K') || raw.endsWith('k')
        ? 1_000
        : raw.endsWith('B') || raw.endsWith('b')
          ? 1_000_000_000
          : 1
    const num = parseFloat(raw.replace(/[MKBmkb]$/, ''))
    if (Number.isFinite(num)) results.push(num * multiplier)
  }

  // Match percentages like 45.2% or -3.1%
  const pctPattern = /-?[\d,]+(?:\.\d+)?%/g
  for (const match of text.matchAll(pctPattern)) {
    const num = parseFloat(match[0].replace(/[%,]/g, ''))
    if (Number.isFinite(num)) results.push(num)
  }

  return results
}

function collectFactValues(facts: FactsPacket): number[] {
  const values: number[] = []

  const directFields: (keyof FactsPacket)[] = [
    'revenue_mtd',
    'revenue_yoy_pct',
    'run_rate_annualized',
    'gross_margin_pct',
    'gross_margin_3mo_avg',
    'blended_cac',
    'ltv_cac_ratio',
    'email_pct_of_dtc',
    'cash_balance',
    'cash_days',
    'cash_forecast_min_amount',
    'cash_forecast_min_week',
    'incoming_inventory_committed',
    'wholesale_pct_of_total',
  ]

  for (const field of directFields) {
    const val = facts[field]
    if (typeof val === 'number' && Number.isFinite(val)) {
      values.push(val)
    }
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

function fuzzyMatch(extracted: number, factValues: number[]): boolean {
  for (const fact of factValues) {
    if (fact === 0 && extracted === 0) return true
    if (fact === 0) continue
    const diff = Math.abs(extracted - fact) / Math.abs(fact)
    if (diff <= FUZZY_TOLERANCE) return true
  }
  return false
}

export function validateBriefing(
  text: string,
  facts: FactsPacket,
): { valid: boolean; reason?: string } {
  const wordCount = text.trim().split(/\s+/).length
  if (wordCount > MAX_WORDS) {
    return {
      valid: false,
      reason: `Briefing is ${wordCount} words, exceeds ${MAX_WORDS} word limit`,
    }
  }

  const extracted = extractNumbers(text)
  if (extracted.length === 0) {
    return { valid: true }
  }

  const factValues = collectFactValues(facts)
  const unmatched: number[] = []

  for (const num of extracted) {
    if (!fuzzyMatch(num, factValues)) {
      unmatched.push(num)
    }
  }

  if (unmatched.length > 0) {
    return {
      valid: false,
      reason: `Found numbers not in facts packet: ${unmatched.map((n) => n.toLocaleString()).join(', ')}`,
    }
  }

  return { valid: true }
}
