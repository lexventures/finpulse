'use client'

import { useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface TimelineFilterProps {
  defaultRange?: string
  granularityOptions?: string[]
  defaultGranularity?: string
  showComparison?: boolean
}

const RANGE_OPTIONS = ['7d', '30d', '90d', 'ytd', '12m', 'all'] as const

const RANGE_LABELS: Record<string, string> = {
  '7d': '7D',
  '30d': '30D',
  '90d': '90D',
  ytd: 'YTD',
  '12m': '12M',
  all: 'ALL',
}

const GRANULARITY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

const COMPARE_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'pop', label: 'Previous Period' },
  { value: 'yoy', label: 'Same Period Last Year' },
] as const

export function TimelineFilter({
  defaultRange = '30d',
  granularityOptions = ['daily', 'weekly', 'monthly'],
  defaultGranularity = 'weekly',
  showComparison = false,
}: TimelineFilterProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const range = searchParams.get('range') ?? defaultRange
  const granularity = searchParams.get('granularity') ?? defaultGranularity
  const compare = searchParams.get('compare') ?? 'off'

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, val] of Object.entries(updates)) {
        if (val) {
          params.set(key, val)
        } else {
          params.delete(key)
        }
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [searchParams, router, pathname]
  )

  return (
    <div className="flex flex-wrap items-center gap-4 px-6 pb-4">
      <ToggleGroup
        value={[range]}
        onValueChange={(val) => {
          if (val.length > 0) updateParams({ range: val[val.length - 1] })
        }}
        variant="outline"
        size="sm"
      >
        {RANGE_OPTIONS.map((opt) => (
          <ToggleGroupItem key={opt} value={opt}>
            {RANGE_LABELS[opt]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {granularityOptions.length > 1 && (
        <ToggleGroup
          value={[granularity]}
          onValueChange={(val) => {
            if (val.length > 0) updateParams({ granularity: val[val.length - 1] })
          }}
          variant="outline"
          size="sm"
        >
          {granularityOptions.map((opt) => (
            <ToggleGroupItem key={opt} value={opt}>
              {GRANULARITY_LABELS[opt] ?? opt}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {showComparison && (
        <ToggleGroup
          value={[compare]}
          onValueChange={(val) => {
            if (val.length > 0) updateParams({ compare: val[val.length - 1] })
          }}
          variant="outline"
          size="sm"
        >
          {COMPARE_OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value}>
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  )
}
