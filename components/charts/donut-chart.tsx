'use client'

import { PieChart, Pie, Cell, Label } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface FinDonutChartProps {
  data: Array<{ name: string; value: number; color: string }>
  height?: number
  loading?: boolean
  empty?: boolean
  innerLabel?: string
  className?: string
}

export function FinDonutChart({
  data,
  height = 250,
  loading = false,
  empty = false,
  innerLabel,
  className,
}: FinDonutChartProps) {
  if (loading) {
    return (
      <Skeleton
        className={cn('mx-auto aspect-square rounded-full', className)}
        style={{ height, width: height }}
      />
    )
  }

  if (empty || data.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          className
        )}
        style={{ height }}
      >
        No data yet
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d.value, 0)
  const label = innerLabel ?? total.toLocaleString()

  const config: ChartConfig = Object.fromEntries(
    data.map(({ name, color }) => [name, { label: name, color }])
  )

  return (
    <ChartContainer config={config} className={className} style={{ height }}>
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="60%"
          outerRadius="80%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
          <Label
            position="center"
            content={({ viewBox }) => {
              if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                return (
                  <text
                    x={viewBox.cx}
                    y={viewBox.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy}
                      className="fill-foreground text-xl font-bold"
                    >
                      {label}
                    </tspan>
                  </text>
                )
              }
              return null
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
