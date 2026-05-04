'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getShopifySessionToken } from '@/lib/shopify/client-token'
import { runSyncAll, type SyncAllSource } from '@/lib/sync-all'
import {
  formatRelativeTime,
  type FreshnessSummary,
  type FreshnessTier,
} from '@/lib/freshness'

const SOURCE_LABEL_OVERRIDES: Record<string, string> = {
  finaloop: 'Finaloop',
}

const TIER_DOT: Record<FreshnessTier, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

const TIER_RING: Record<FreshnessTier, string> = {
  green:
    'ring-emerald-500/30 hover:ring-emerald-500/50 text-emerald-700 dark:text-emerald-400',
  amber:
    'ring-amber-500/30 hover:ring-amber-500/50 text-amber-700 dark:text-amber-400',
  red: 'ring-red-500/30 hover:ring-red-500/50 text-red-700 dark:text-red-400',
}

const TIER_LABEL: Record<FreshnessTier, string> = {
  green: 'Fresh',
  amber: 'Stale',
  red: 'Critical',
}

interface FreshnessChipProps {
  freshness: FreshnessSummary
  now: string
}

export function FreshnessChip({ freshness, now }: FreshnessChipProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [activeSource, setActiveSource] = useState<SyncAllSource | null>(null)

  const nowDate = new Date(now)
  const newestPrimary = freshness.bySource
    .filter((s) => s.primary && s.lastAt)
    .sort((a, b) => {
      if (!a.lastAt) return 1
      if (!b.lastAt) return -1
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    })[0]
  const newestLabel = newestPrimary
    ? formatRelativeTime(newestPrimary.lastAt, nowDate)
    : 'Never synced'

  async function handleSyncAll() {
    const startToast = toast.loading('Starting sync…')
    setActiveSource(null)

    try {
      const token = await getShopifySessionToken()
      if (!token) {
        toast.error('Open this app inside Shopify admin to run sync.', {
          id: startToast,
        })
        return
      }

      const result = await runSyncAll(async (source: SyncAllSource) => {
        setActiveSource(source)
        const label = SOURCE_LABEL_OVERRIDES[source] ?? labelize(source)
        toast.loading(`Syncing ${label}…`, { id: startToast })

        const res = await fetch(`/api/sync/${source}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null
          return {
            source,
            ok: false,
            label,
            message:
              typeof body?.error === 'string'
                ? body.error
                : `Failed (${res.status})`,
          }
        }
        return { source, ok: true, label }
      })

      setActiveSource(null)

      if (!result.ok) {
        const failed = result.results[result.results.length - 1]
        toast.error(`Sync stopped at ${failed?.label ?? failed?.source}`, {
          id: startToast,
          description: failed?.message ?? 'See sync log for details.',
        })
        return
      }

      toast.success('Sync complete', {
        id: startToast,
        description: `${result.results.length} sources refreshed.`,
      })
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setActiveSource(null)
      toast.error('Sync request failed', {
        id: startToast,
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const isSyncing = activeSource !== null || pending

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-medium ring-1 transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              TIER_RING[freshness.tier],
            )}
            aria-label={`Data freshness: ${TIER_LABEL[freshness.tier]}`}
          />
        }
      >
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            TIER_DOT[freshness.tier],
          )}
        />
        <span className="tabular-nums">Synced {newestLabel}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 pt-3 pb-2 border-b border-border">
          <p className="font-medium text-sm">Data freshness</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {freshness.summary}
          </p>
        </div>
        <ul className="py-1 max-h-64 overflow-y-auto">
          {freshness.bySource.map((row) => (
            <li
              key={row.source}
              className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'inline-block size-2 rounded-full shrink-0',
                    sourceDotClass(row.status, row.hoursSince),
                  )}
                />
                <span className="truncate">
                  {row.label}
                  {!row.primary && (
                    <span className="text-muted-foreground ml-1">(auto)</span>
                  )}
                </span>
              </div>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {row.status === 'never'
                  ? 'Never'
                  : row.status === 'error'
                    ? `Failed · ${formatRelativeTime(row.lastAt, nowDate)}`
                    : row.status === 'partial'
                      ? `Partial · ${formatRelativeTime(row.lastAt, nowDate)}`
                      : formatRelativeTime(row.lastAt, nowDate)}
              </span>
            </li>
          ))}
        </ul>
        <div className="px-3 pt-2 pb-3 border-t border-border">
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={handleSyncAll}
            disabled={isSyncing}
          >
            <RefreshCw
              className={cn('size-3.5', isSyncing && 'animate-spin')}
            />
            {isSyncing
              ? activeSource
                ? `Syncing ${labelize(activeSource)}…`
                : 'Syncing…'
              : 'Sync now'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function labelize(source: string): string {
  if (SOURCE_LABEL_OVERRIDES[source]) return SOURCE_LABEL_OVERRIDES[source]
  return source
    .split('_')
    .map((part) =>
      part === 'dtc'
        ? 'DTC'
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ')
}

function sourceDotClass(
  status: 'success' | 'partial' | 'error' | 'running' | 'never',
  hoursSince: number | null,
): string {
  if (status === 'error' || status === 'never') return 'bg-red-500'
  if (status === 'partial') return 'bg-amber-500'
  if (status === 'running') return 'bg-blue-500'
  if (hoursSince !== null && hoursSince > 48) return 'bg-red-500'
  if (hoursSince !== null && hoursSince > 12) return 'bg-amber-500'
  return 'bg-emerald-500'
}
