import { describe, expect, it } from 'vitest'

import { calcBlendedCac } from '@/lib/calculations/cac'

describe('calcBlendedCac', () => {
  it('returns adSpend / newCustomers for valid inputs', () => {
    expect(calcBlendedCac(10_000, 100)).toBe(100)
    expect(calcBlendedCac(1_500, 50)).toBe(30)
  })

  it('returns null when newCustomers is 0', () => {
    expect(calcBlendedCac(5_000, 0)).toBeNull()
  })

  it('returns null when newCustomers is negative', () => {
    expect(calcBlendedCac(5_000, -10)).toBeNull()
  })

  it('handles large numbers correctly', () => {
    const adSpend = 9_000_000_000
    const newCustomers = 3_000_000
    expect(calcBlendedCac(adSpend, newCustomers)).toBe(3000)
  })
})
