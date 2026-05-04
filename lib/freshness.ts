export type FreshnessTier = 'green' | 'amber' | 'red'

export type FreshnessSourceStatus = 'success' | 'partial' | 'error' | 'running' | 'never'

export interface FreshnessSyncLog {
  source: string
  started_at: string
  completed_at: string | null
  status: string
}

export interface FreshnessSourceRow {
  source: string
  label: string
  primary: boolean
  status: FreshnessSourceStatus
  lastAt: string | null
  hoursSince: number | null
}

export interface FreshnessSummary {
  tier: FreshnessTier
  oldestPrimaryHours: number | null
  primaryNeverSynced: string[]
  primaryErrored: string[]
  bySource: FreshnessSourceRow[]
  summary: string
}

const SOURCE_LABELS: Record<string, string> = {
  finaloop_sheets: 'Finaloop',
  shopify_dtc: 'Shopify DTC',
  shopify_wholesale: 'Shopify Wholesale',
  shopify_analytics: 'Shopify Analytics',
  kpi_facts: 'KPI Facts',
  cash_forecast: 'Cash Forecast',
}

export const FRESHNESS_PRIMARY_SOURCES = [
  'finaloop_sheets',
  'shopify_dtc',
  'shopify_wholesale',
  'shopify_analytics',
] as const

export const FRESHNESS_SECONDARY_SOURCES = ['kpi_facts', 'cash_forecast'] as const

const ALL_SOURCES = [...FRESHNESS_PRIMARY_SOURCES, ...FRESHNESS_SECONDARY_SOURCES] as const

const GREEN_HOURS = 12
const AMBER_HOURS = 48

function normalizeStatus(raw: string): FreshnessSourceStatus {
  switch (raw) {
    case 'success':
    case 'partial':
    case 'error':
    case 'running':
      return raw
    default:
      return 'error'
  }
}

function pickLatestPerSource(
  logs: FreshnessSyncLog[],
): Map<string, FreshnessSyncLog> {
  const latest = new Map<string, FreshnessSyncLog>()
  for (const log of logs) {
    const stamp = log.completed_at ?? log.started_at
    if (!stamp) continue
    const existing = latest.get(log.source)
    if (!existing) {
      latest.set(log.source, log)
      continue
    }
    const existingStamp = existing.completed_at ?? existing.started_at
    if (new Date(stamp).getTime() > new Date(existingStamp).getTime()) {
      latest.set(log.source, log)
    }
  }
  return latest
}

export function computeFreshness(
  logs: FreshnessSyncLog[],
  now: Date = new Date(),
): FreshnessSummary {
  const nowMs = now.getTime()
  const latest = pickLatestPerSource(logs)

  const bySource: FreshnessSourceRow[] = ALL_SOURCES.map((source) => {
    const log = latest.get(source)
    if (!log) {
      return {
        source,
        label: SOURCE_LABELS[source] ?? source,
        primary: (FRESHNESS_PRIMARY_SOURCES as readonly string[]).includes(source),
        status: 'never' as const,
        lastAt: null,
        hoursSince: null,
      }
    }
    const stamp = log.completed_at ?? log.started_at
    const hoursSince = (nowMs - new Date(stamp).getTime()) / 3_600_000
    return {
      source,
      label: SOURCE_LABELS[source] ?? source,
      primary: (FRESHNESS_PRIMARY_SOURCES as readonly string[]).includes(source),
      status: normalizeStatus(log.status),
      lastAt: stamp,
      hoursSince,
    }
  })

  const primaries = bySource.filter((row) => row.primary)
  const primaryNeverSynced = primaries
    .filter((row) => row.status === 'never')
    .map((row) => row.label)
  const primaryErrored = primaries
    .filter((row) => row.status === 'error')
    .map((row) => row.label)

  const primaryHours = primaries
    .map((row) => row.hoursSince)
    .filter((h): h is number => h !== null)
  const oldestPrimaryHours =
    primaryHours.length > 0 ? Math.max(...primaryHours) : null

  let tier: FreshnessTier
  if (
    primaryNeverSynced.length > 0 ||
    primaryErrored.length > 0 ||
    oldestPrimaryHours === null ||
    oldestPrimaryHours > AMBER_HOURS
  ) {
    tier = 'red'
  } else if (
    oldestPrimaryHours > GREEN_HOURS ||
    primaries.some((row) => row.status === 'partial')
  ) {
    tier = 'amber'
  } else {
    tier = 'green'
  }

  let summary: string
  if (primaryNeverSynced.length > 0) {
    summary = `Never synced: ${primaryNeverSynced.join(', ')}`
  } else if (primaryErrored.length > 0) {
    summary = `Last sync failed: ${primaryErrored.join(', ')}`
  } else if (oldestPrimaryHours === null) {
    summary = 'No sync history'
  } else if (tier === 'green') {
    summary = `All sources fresh — oldest ${formatHours(oldestPrimaryHours)}`
  } else if (tier === 'amber') {
    summary = `Oldest source ${formatHours(oldestPrimaryHours)} — consider syncing`
  } else {
    summary = `Stale data — oldest ${formatHours(oldestPrimaryHours)}`
  }

  return {
    tier,
    oldestPrimaryHours,
    primaryNeverSynced,
    primaryErrored,
    bySource,
    summary,
  }
}

function formatHours(hours: number): string {
  if (hours < 1) return 'under an hour ago'
  if (hours < 48) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function formatRelativeTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return '—'
  const ms = now.getTime() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  if (ms < 60_000) return 'just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(ms / 86_400_000)
  return `${days}d ago`
}
