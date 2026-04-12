'use client'

import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Bell, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface AlertItem {
  id: string
  severity: string
  metric_key: string
  metric_label: string
  current_value: number | null
  threshold_value: number | null
  message: string
  triggered_at: string
  acknowledged: boolean
}

interface AlertFeedProps {
  alerts: AlertItem[]
  onAcknowledge?: (id: string) => void
  loading?: boolean
}

export function AlertFeed({
  alerts,
  onAcknowledge,
  loading = false,
}: AlertFeedProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
        <CheckCircle2 className="size-8 text-emerald-500" />
        <p className="text-sm">No active alerts</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-3',
            alert.severity === 'red' &&
              'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
            alert.severity === 'yellow' &&
              'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
          )}
        >
          {alert.severity === 'red' ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
          ) : (
            <Bell className="mt-0.5 size-4 shrink-0 text-amber-500" />
          )}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{alert.metric_label}</span>
              <Badge
                variant={alert.severity === 'red' ? 'destructive' : 'outline'}
                className={cn(
                  alert.severity === 'yellow' &&
                    'border-amber-300 bg-amber-100 text-amber-700',
                )}
              >
                {alert.severity}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{alert.message}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(alert.triggered_at), {
                addSuffix: true,
              })}
            </p>
          </div>
          {onAcknowledge && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAcknowledge(alert.id)}
              className="shrink-0"
            >
              Acknowledge
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
