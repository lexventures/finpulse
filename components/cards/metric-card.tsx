'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  description?: string
  value: string
  subtitle?: string
  trend?: { value: number; label: string }
  alert?: 'green' | 'yellow' | 'red'
  icon?: React.ReactNode
  loading?: boolean
  className?: string
  sparkline?: number[]
}

const SPARK_W = 64
const SPARK_H = 20
const SPARK_PAD = 1.5

function MetricSparkline({ values }: { values: number[] }) {
  const nums = values.map((v) => (Number.isFinite(v) ? v : 0))
  if (nums.length === 0) return null

  const first = nums[0]!
  const last = nums[nums.length - 1]!
  const strokeClass =
    last > first
      ? 'stroke-emerald-600'
      : last < first
        ? 'stroke-red-600'
        : 'stroke-[hsl(var(--chart-1))]'

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min || 1
  const innerW = SPARK_W - 2 * SPARK_PAD
  const innerH = SPARK_H - 2 * SPARK_PAD

  const pts = nums.map((v, i) => {
    const x =
      nums.length === 1
        ? SPARK_PAD + innerW / 2
        : SPARK_PAD + (i / (nums.length - 1)) * innerW
    const y = SPARK_PAD + (1 - (v - min) / range) * innerH
    return `${x},${y}`
  })

  return (
    <svg
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="shrink-0"
      aria-hidden
    >
      <polyline
        className={strokeClass}
        points={pts.join(' ')}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

const ALERT_BORDER: Record<string, string> = {
  red: 'border-l-4 border-l-red-500',
  yellow: 'border-l-4 border-l-amber-400',
  green: '',
}

export function MetricCard({
  title,
  description,
  value,
  subtitle,
  trend,
  alert,
  icon,
  loading = false,
  className,
  sparkline,
}: MetricCardProps) {
  if (loading) {
    return (
      <Card className={cn('relative', className)}>
        <CardHeader>
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('relative', alert && ALERT_BORDER[alert], className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {description && (
            <p className="text-[11px] leading-tight text-muted-foreground/60">
              {description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {sparkline && sparkline.length > 0 && (
            <MetricSparkline values={sparkline} />
          )}
          {icon && (
            <div className="text-muted-foreground [&_svg]:size-4">{icon}</div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {alert && (
            <span
              className={cn(
                'inline-block size-2 rounded-full',
                alert === 'red' && 'bg-red-500',
                alert === 'yellow' && 'bg-amber-400',
                alert === 'green' && 'bg-emerald-500'
              )}
            />
          )}
        </div>
        {trend && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'
            )}
          >
            {trend.value >= 0 ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            <span>
              {trend.value >= 0 ? '+' : ''}
              {trend.value}% {trend.label}
            </span>
          </div>
        )}
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}
