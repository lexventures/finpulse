import { describe, expect, it } from 'vitest'

import { transformWaterfallData } from '@/components/charts/waterfall-chart'

describe('transformWaterfallData', () => {
  it('treats a leading isTotal as a starting anchor and reconciles deltas to the ending anchor', () => {
    const input = [
      { name: 'Prior NR', value: 1_000, isTotal: true },
      { name: 'Δ Gross', value: 50 },
      { name: 'Δ Returns', value: -20 },
      { name: 'Current NR', value: 1_030, isTotal: true },
    ]
    const transformed = transformWaterfallData(input)
    expect(transformed[0]).toMatchObject({ name: 'Prior NR', total: 1_000, isTotal: true })
    expect(transformed[1]).toMatchObject({
      name: 'Δ Gross',
      invisible: 1_000,
      positive: 50,
      negative: 0,
    })
    expect(transformed[2]).toMatchObject({
      name: 'Δ Returns',
      invisible: 1_030,
      positive: 0,
      negative: 20,
    })
    expect(transformed[3]).toMatchObject({ name: 'Current NR', total: 1_030, isTotal: true })
  })

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
