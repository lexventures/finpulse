'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
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

function formatCompactTick(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) {
    const k = abs / 1_000
    return `${sign}$${k >= 100 ? Math.round(k) : k.toFixed(1)}K`
  }
  return `${sign}$${Math.round(abs)}`
}

interface FinAreaChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKeys: Array<{ key: string; label: string; color: string; dashed?: boolean }>
  height?: number
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  referenceLines?: Array<{ y: number; label: string; color: string }>
  gradientFill?: boolean
  stacked?: boolean
  showLegend?: boolean
  formatYAxis?: 'compact'
  className?: string
}

export function FinAreaChart({
  data,
  xKey,
  yKeys,
  height = 300,
  loading = false,
  empty = false,
  emptyMessage = 'No data yet',
  referenceLines,
  gradientFill = true,
  stacked = false,
  showLegend = false,
  formatYAxis,
  className,
}: FinAreaChartProps) {
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
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          {gradientFill &&
            yKeys.map(({ key, color }) => (
              <linearGradient
                key={key}
                id={`fill-${key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            ))}
        </defs>
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
          tickFormatter={formatYAxis === 'compact' ? formatCompactTick : undefined}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {showLegend && (
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
        )}
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
        {yKeys.map(({ key, color, dashed }) => {
          const useSolidFill = stacked && !dashed
          const fillValue = dashed
            ? 'transparent'
            : useSolidFill
              ? color
              : gradientFill
                ? `url(#fill-${key})`
                : 'transparent'
          return (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId={stacked ? 'stack' : undefined}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={dashed ? '6 3' : undefined}
              fill={fillValue}
              fillOpacity={useSolidFill ? 0.7 : 1}
              dot={false}
            />
          )
        })}
      </AreaChart>
    </ChartContainer>
  )
}
