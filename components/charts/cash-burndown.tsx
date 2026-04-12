'use client'

import { FinAreaChart } from '@/components/charts/area-chart'

export interface CashBurndownPoint {
  week: string
  cash: number
}

interface CashBurndownChartProps {
  data: CashBurndownPoint[]
}

export function CashBurndownChart({ data }: CashBurndownChartProps) {
  const chartData = data.map((d) => ({
    week: d.week,
    cash: d.cash,
  })) as Array<Record<string, unknown>>

  const minCash = data.length > 0 ? Math.min(...data.map((d) => d.cash)) : 0

  const refs: Array<{ y: number; label: string; color: string }> = []
  if (minCash < 200_000) {
    refs.push({ y: 0, label: '$0', color: 'hsl(0 72% 51%)' })
  }
  if (minCash < 200_000) {
    refs.push({ y: 50_000, label: '$50K', color: 'hsl(48 96% 53%)' })
  }

  const lineColor = minCash < 0
    ? 'hsl(0 72% 51%)'
    : minCash < 50_000
      ? 'hsl(48 96% 53%)'
      : 'hsl(var(--chart-1))'

  return (
    <FinAreaChart
      data={chartData}
      xKey="week"
      yKeys={[
        {
          key: 'cash',
          label: 'Projected cash',
          color: lineColor,
        },
      ]}
      height={200}
      empty={data.length === 0}
      gradientFill
      referenceLines={refs.length > 0 ? refs : undefined}
      formatYAxis="compact"
    />
  )
}
