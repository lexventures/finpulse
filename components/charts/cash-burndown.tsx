'use client'

import { FinAreaChart } from '@/components/charts/area-chart'
import { formatCompact } from '@/lib/utils/format'

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

  return (
    <FinAreaChart
      data={chartData}
      xKey="week"
      yKeys={[
        {
          key: 'cash',
          label: 'Projected cash',
          color: 'hsl(var(--chart-1))',
        },
      ]}
      height={200}
      empty={data.length === 0}
      gradientFill
      referenceLines={[
        { y: 0, label: '$0', color: 'hsl(0 72% 51%)' },
        { y: 50_000, label: '$50k', color: 'hsl(48 96% 53%)' },
      ]}
      yAxisTickFormatter={(v) => formatCompact(Number(v))}
    />
  )
}
