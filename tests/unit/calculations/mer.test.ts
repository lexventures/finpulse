import { describe, expect, it } from 'vitest'

import { calcMer } from '@/lib/calculations/mer'

describe('calcMer', () => {
  it('returns revenue / adSpend for valid inputs', () => {
    expect(calcMer(50_000, 10_000)).toBe(5)
    expect(calcMer(12_000, 4_000)).toBe(3)
  })

  it('returns null when adSpend is 0', () => {
    expect(calcMer(10_000, 0)).toBeNull()
  })
})
