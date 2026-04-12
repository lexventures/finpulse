import { describe, expect, it } from 'vitest'

import {
  formatCompact,
  formatCount,
  formatCurrency,
  formatDelta,
  formatPercent,
} from '@/lib/utils/format'

const EM_DASH = '\u2014'

describe('formatCurrency', () => {
  it('formats large values with no cents', () => {
    expect(formatCurrency(1_234_567)).toBe('$1,234,567')
  })

  it('formats small values with two decimal places', () => {
    expect(formatCurrency(12.34)).toBe('$12.34')
  })

  it('returns an em dash for null', () => {
    expect(formatCurrency(null)).toBe(EM_DASH)
  })
})

describe('formatPercent', () => {
  it('formats valid numbers with one decimal and a percent sign', () => {
    expect(formatPercent(45.2)).toBe('45.2%')
  })

  it('returns an em dash for null', () => {
    expect(formatPercent(null)).toBe(EM_DASH)
  })
})

describe('formatCount', () => {
  it('formats integers with grouping separators', () => {
    expect(formatCount(1234)).toBe('1,234')
  })

  it('returns an em dash for null', () => {
    expect(formatCount(null)).toBe(EM_DASH)
  })
})

describe('formatDelta', () => {
  it('prefixes positive currency with plus and negative with minus', () => {
    expect(formatDelta(12_345, 'currency')).toEqual({
      text: '+$12,345',
      direction: 'positive',
    })
    expect(formatDelta(-12_345, 'currency')).toEqual({
      text: '-$12,345',
      direction: 'negative',
    })
  })

  it('formats percent deltas with sign', () => {
    expect(formatDelta(3.5, 'percent')).toEqual({
      text: '+3.5%',
      direction: 'positive',
    })
    expect(formatDelta(-2.1, 'percent')).toEqual({
      text: '-2.1%',
      direction: 'negative',
    })
  })

  it('returns an em dash and neutral direction for null', () => {
    expect(formatDelta(null, 'currency')).toEqual({
      text: EM_DASH,
      direction: 'neutral',
    })
  })
})

describe('formatCompact', () => {
  it('formats millions, thousands, and small dollar amounts', () => {
    expect(formatCompact(1_200_000)).toBe('$1.2M')
    expect(formatCompact(456_000)).toBe('$456K')
    expect(formatCompact(123)).toBe('$123')
  })

  it('returns an em dash for null', () => {
    expect(formatCompact(null)).toBe(EM_DASH)
  })
})

describe('formatters and non-finite values', () => {
  const badValues = [NaN, Infinity, -Infinity, undefined] as const

  it.each(badValues)('formatCurrency returns em dash for %p', (value) => {
    expect(formatCurrency(value as unknown as number | null)).toBe(EM_DASH)
  })

  it.each(badValues)('formatPercent returns em dash for %p', (value) => {
    expect(formatPercent(value as unknown as number | null)).toBe(EM_DASH)
  })

  it.each(badValues)('formatCount returns em dash for %p', (value) => {
    expect(formatCount(value as unknown as number | null)).toBe(EM_DASH)
  })

  it.each(badValues)('formatDelta returns em dash for %p', (value) => {
    expect(formatDelta(value as unknown as number | null, 'currency')).toEqual({
      text: EM_DASH,
      direction: 'neutral',
    })
    expect(formatDelta(value as unknown as number | null, 'percent')).toEqual({
      text: EM_DASH,
      direction: 'neutral',
    })
  })

  it.each(badValues)('formatCompact returns em dash for %p', (value) => {
    expect(formatCompact(value as unknown as number | null)).toBe(EM_DASH)
  })
})
