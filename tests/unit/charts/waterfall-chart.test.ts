import { describe, expect, it } from 'vitest'

import { transformWaterfallData } from '@/components/charts/waterfall-chart'

describe('transformWaterfallData', () => {
  it('builds waterfall bars without mutating input items', () => {
    const input = [
      { name: 'Revenue', value: 100 },
      { name: 'Returns', value: -20 },
      { name: 'Net revenue', value: 80, isTotal: true },
    ]

    const transformed = transformWaterfallData(input)

    expect(input).toEqual([
      { name: 'Revenue', value: 100 },
      { name: 'Returns', value: -20 },
      { name: 'Net revenue', value: 80, isTotal: true },
    ])
    expect(transformed).toEqual([
      {
        name: 'Revenue',
        invisible: 0,
        positive: 100,
        negative: 0,
        total: 0,
        rawValue: 100,
        isTotal: false,
      },
      {
        name: 'Returns',
        invisible: 80,
        positive: 0,
        negative: 20,
        total: 0,
        rawValue: -20,
        isTotal: false,
      },
      {
        name: 'Net revenue',
        invisible: 0,
        positive: 0,
        negative: 0,
        total: 80,
        rawValue: 80,
        isTotal: true,
      },
    ])
  })
})
