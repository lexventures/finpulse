import { describe, expect, it } from 'vitest'

import {
  projectCashForecast,
  type CashForecastParams,
} from '@/lib/calculations/cash-forecast'

const WEEKS_PER_MONTH = 4.33

function baseParams(
  overrides: Partial<CashForecastParams> = {}
): CashForecastParams {
  return {
    startingCash: 100_000,
    monthlyInflowsByChannel: { primary: 43_300 },
    monthlyOutflowsByCategory: { opex: 21_650 },
    growthRate: 0,
    seasonalityIndex: {},
    incomingInventoryValue: 0,
    currentMonth: 1,
    ...overrides,
  }
}

describe('projectCashForecast', () => {
  it('returns 13 week projections', () => {
    const rows = projectCashForecast(baseParams())
    expect(rows).toHaveLength(13)
    expect(rows.map((r) => r.week_number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ])
  })

  it('carries starting cash forward each week', () => {
    const rows = projectCashForecast(baseParams())
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      expect(row.starting_balance + row.inflows - row.outflows).toBeCloseTo(
        row.ending_balance,
        8
      )
      if (i > 0) {
        expect(row.starting_balance).toBeCloseTo(rows[i - 1].ending_balance, 8)
      }
    }
    expect(rows[0].starting_balance).toBe(100_000)
  })

  it('compounds growth rate across weeks', () => {
    const growthRate = 0.12
    const rows = projectCashForecast(baseParams({ growthRate }))
    const weeklyGrowthRate = Math.pow(1 + growthRate, 1 / WEEKS_PER_MONTH) - 1

    for (const row of rows) {
      expect(row.cumulative_growth_factor).toBeCloseTo(
        Math.pow(1 + weeklyGrowthRate, row.week_number),
        8
      )
    }

    expect(rows[12].cumulative_growth_factor).toBeGreaterThan(
      rows[0].cumulative_growth_factor
    )
    expect(rows[12].inflows).toBeGreaterThan(rows[0].inflows)
  })

  it('does not treat incoming inventory as an extra AP outflow', () => {
    const inventory = 65_000
    const rowsNoInv = projectCashForecast(baseParams({ incomingInventoryValue: 0 }))
    const rowsInv = projectCashForecast(
      baseParams({ incomingInventoryValue: inventory, growthRate: 0 })
    )

    for (let i = 0; i < rowsInv.length; i++) {
      expect(rowsInv[i].outflows).toBeCloseTo(rowsNoInv[i].outflows, 8)
      expect(rowsInv[i].ending_balance).toBeCloseTo(rowsNoInv[i].ending_balance, 8)
    }
  })

  it('returns an empty array for invalid inputs', () => {
    expect(projectCashForecast(baseParams({ startingCash: NaN }))).toEqual([])
    expect(projectCashForecast(baseParams({ growthRate: Infinity }))).toEqual([])
    expect(
      projectCashForecast(baseParams({ incomingInventoryValue: Number.NaN }))
    ).toEqual([])
    expect(projectCashForecast(baseParams({ currentMonth: 0 }))).toEqual([])
    expect(projectCashForecast(baseParams({ currentMonth: 13 }))).toEqual([])
    expect(
      projectCashForecast(
        baseParams({ seasonalityIndex: { 1: NaN } })
      )
    ).toEqual([])
    expect(
      projectCashForecast(
        baseParams({ monthlyInflowsByChannel: { a: NaN } })
      )
    ).toEqual([])
  })
})
