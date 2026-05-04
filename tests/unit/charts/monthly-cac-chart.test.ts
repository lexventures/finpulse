import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const chartSource = readFileSync(
  join(process.cwd(), 'components/charts/monthly-cac-chart.tsx'),
  'utf8',
)

describe('MonthlyCacChart', () => {
  it('renders CAC, Shopify LTV, and gross-margin Shopify LTV lines', () => {
    expect(chartSource).toContain('dataKey="cac"')
    expect(chartSource).toContain('dataKey="shopifyLtvToDate"')
    expect(chartSource).toContain('dataKey="shopifyGrossMarginLtvToDate"')
    expect(chartSource).toContain('Shopify LTV to date')
    expect(chartSource).toContain('Gross-margin LTV to date')
  })
})
