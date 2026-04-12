import {
  subDays,
  subMonths,
  subYears,
  startOfYear,
  startOfDay,
  endOfDay,
  differenceInDays,
  format,
  isSameYear,
} from 'date-fns'

export type DatePreset = '7d' | '30d' | '90d' | 'ytd' | '12m' | 'all'

export type Granularity = 'day' | 'week' | 'month' | 'quarter'

export interface DateRange {
  start: Date
  end: Date
}

export function getDateRange(
  preset: DatePreset,
  referenceDate?: Date
): DateRange {
  const ref = referenceDate ?? new Date()
  const end = endOfDay(ref)

  switch (preset) {
    case '7d':
      return { start: startOfDay(subDays(ref, 6)), end }
    case '30d':
      return { start: startOfDay(subDays(ref, 29)), end }
    case '90d':
      return { start: startOfDay(subDays(ref, 89)), end }
    case 'ytd':
      return { start: startOfYear(ref), end }
    case '12m':
      return { start: startOfDay(subMonths(ref, 12)), end }
    case 'all':
      return { start: new Date('2020-01-01'), end }
    default: {
      const _exhaustive: never = preset
      throw new Error(`Unknown preset: ${_exhaustive}`)
    }
  }
}

export function getComparisonRange(
  range: DateRange,
  type: 'previous' | 'yoy'
): DateRange {
  const spanDays = differenceInDays(range.end, range.start)

  if (type === 'yoy') {
    return {
      start: subYears(range.start, 1),
      end: subYears(range.end, 1),
    }
  }

  return {
    start: subDays(range.start, spanDays + 1),
    end: subDays(range.start, 1),
  }
}

export function getGranularityOptions(preset: DatePreset): Granularity[] {
  switch (preset) {
    case '7d':
      return ['day']
    case '30d':
      return ['day', 'week']
    case '90d':
      return ['day', 'week', 'month']
    case 'ytd':
      return ['week', 'month', 'quarter']
    case '12m':
      return ['week', 'month', 'quarter']
    case 'all':
      return ['month', 'quarter']
    default: {
      const _exhaustive: never = preset
      throw new Error(`Unknown preset: ${_exhaustive}`)
    }
  }
}

export function formatDateRange(start: Date, end: Date): string {
  if (isSameYear(start, end)) {
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
  }
  return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
}
