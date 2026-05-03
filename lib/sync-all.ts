export const SYNC_ALL_SOURCES = [
  'shopify_dtc',
  'shopify_wholesale',
  'shopify_analytics',
  'finaloop',
] as const

export type SyncAllSource = (typeof SYNC_ALL_SOURCES)[number]

export interface SyncAllStepResult {
  source: string
  ok: boolean
}

export interface SyncAllResult<T extends SyncAllStepResult> {
  ok: boolean
  results: T[]
  failedSource: string | null
}

export async function runSyncAll<T extends SyncAllStepResult>(
  syncSource: (source: SyncAllSource) => Promise<T>
): Promise<SyncAllResult<T>> {
  const results: T[] = []

  for (const source of SYNC_ALL_SOURCES) {
    const result = await syncSource(source)
    results.push(result)

    if (!result.ok) {
      return {
        ok: false,
        results,
        failedSource: source,
      }
    }
  }

  return {
    ok: true,
    results,
    failedSource: null,
  }
}
