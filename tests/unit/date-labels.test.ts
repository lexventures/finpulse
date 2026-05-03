import { describe, expect, it } from 'vitest'

import { formatAsOfYear } from '@/lib/date-labels'

describe('formatAsOfYear', () => {
  it('formats month-backed finance periods as the full year only', () => {
    expect(formatAsOfYear('2026-05-01')).toBe('2026')
  })

  it('preserves the empty-state dash for missing periods', () => {
    expect(formatAsOfYear(undefined)).toBe('—')
  })
})
