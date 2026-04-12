'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface FinBarChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKeys: Array<{
    key: string
    label: string
    color: string
    stackId?: string
  }>
  height?: number
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  referenceLines?: Array<{ y: number; label: string; color: string }>
  className?: string
}

export function FinBarChart({
  data,
  xKey,
  yKeys,
  height = 300,
  loading = false,
  empty = false,
  emptyMessage = 'No data yet',
  referenceLines,
  className,
}: FinBarChartProps) {
  if (loading) {
    return <Skeleton className={cn('w-full', className)} style={{ height }} />
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
        {emptyMessage}
      </div>
    )
  }

  const config: ChartConfig = Object.fromEntries(
    yKeys.map(({ key, label, color }) => [key, { label, color }])
  )

  return (
    <ChartContainer config={config} className={className} style={{ height }}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
          width={48}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {referenceLines?.map((ref, i) => (
          <ReferenceLine
            key={i}
            y={ref.y}
            stroke={ref.color}
            strokeDasharray="4 4"
            label={{
              value: ref.label,
              position: 'insideTopRight',
              fill: ref.color,
              fontSize: 11,
            }}
          />
        ))}
        {yKeys.map(({ key, color, stackId }) => (
          <Bar
            key={key}
            dataKey={key}
            fill={color}
            stackId={stackId}
            radius={stackId ? 0 : [4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
