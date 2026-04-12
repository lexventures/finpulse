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
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {description && (
            <p className="text-[11px] leading-tight text-muted-foreground/60">
              {description}
            </p>
          )}
        </div>
        {icon && (
          <div className="text-muted-foreground [&_svg]:size-4">{icon}</div>
        )}
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
