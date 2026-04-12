'use client'

import { format, differenceInSeconds } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface SyncLog {
  id: string
  source: string
  started_at: string
  completed_at: string | null
  status: string
  rows_synced: number
  error_message: string | null
}

interface SettingsTabsProps {
  syncLogs: SyncLog[]
}

type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline'

function statusBadge(status: string) {
  const map: Record<string, { variant: StatusVariant; className: string }> = {
    success: {
      variant: 'outline',
      className: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400',
    },
    error: { variant: 'destructive', className: '' },
    running: { variant: 'secondary', className: '' },
    partial: {
      variant: 'outline',
      className: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400',
    },
  }
  const cfg = map[status] ?? { variant: 'outline' as StatusVariant, className: '' }
  return (
    <Badge variant={cfg.variant} className={cn(cfg.className)}>
      {status}
    </Badge>
  )
}

function durationStr(started: string, completed: string | null): string {
  if (!completed) return '\u2014'
  const secs = differenceInSeconds(new Date(completed), new Date(started))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return `${mins}m ${rem}s`
}

const SOURCES = ['finaloop', 'shopify_dtc', 'shopify_wholesale', 'shopify_analytics'] as const

const SOURCE_LABELS: Record<string, string> = {
  finaloop: 'Finaloop',
  shopify_dtc: 'Shopify DTC',
  shopify_wholesale: 'Shopify Wholesale',
  shopify_analytics: 'Shopify Analytics',
}

const PLACEHOLDER_TABS: Array<{ label: string; phase: number }> = [
  { label: 'Thresholds', phase: 2 },
  { label: 'Channels', phase: 3 },
  { label: 'Integrations', phase: 3 },
  { label: 'Team', phase: 4 },
  { label: 'Notifications', phase: 3 },
  { label: 'Advanced', phase: 5 },
]

export function SettingsTabs({ syncLogs }: SettingsTabsProps) {
  const latestBySource = new Map<string, SyncLog>()
  for (const log of syncLogs) {
    if (!latestBySource.has(log.source)) {
      latestBySource.set(log.source, log)
    }
  }

  return (
    <div className="px-6 pb-6">
      <Tabs defaultValue={0}>
        <TabsList className="flex-wrap">
          <TabsTrigger value={0}>Dashboard</TabsTrigger>
          {PLACEHOLDER_TABS.slice(0, 4).map((t, i) => (
            <TabsTrigger key={t.label} value={i + 1}>
              {t.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value={5}>Sync Log</TabsTrigger>
          {PLACEHOLDER_TABS.slice(4).map((t, i) => (
            <TabsTrigger key={t.label} value={i + 6}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab 0: Dashboard */}
        <TabsContent value={0}>
          <div className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {SOURCES.map((source) => {
                const log = latestBySource.get(source)
                const statusColor: 'green' | 'yellow' | 'red' =
                  !log
                    ? 'red'
                    : log.status === 'success'
                      ? 'green'
                      : log.status === 'error'
                        ? 'red'
                        : 'yellow'
                return (
                  <Card key={source}>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{SOURCE_LABELS[source]}</CardTitle>
                      <span
                        className={cn(
                          'inline-block size-2.5 rounded-full',
                          statusColor === 'green' && 'bg-emerald-500',
                          statusColor === 'yellow' && 'bg-amber-400',
                          statusColor === 'red' && 'bg-red-500',
                        )}
                      />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {log ? (
                        <>
                          <div className="space-y-1 text-sm">
                            <p className="text-muted-foreground">
                              Last sync:{' '}
                              {format(
                                new Date(log.started_at),
                                'MMM d, h:mm a',
                              )}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                Status:
                              </span>
                              {statusBadge(log.status)}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No sync data
                        </p>
                      )}
                      <Button variant="outline" size="sm" disabled>
                        <RefreshCw className="size-3" />
                        Re-run Sync
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Edge Function execution times will be displayed here in a
                  future update.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tabs 1–4: Placeholder for Thresholds, Channels, Integrations, Team */}
        {PLACEHOLDER_TABS.slice(0, 4).map((t, i) => (
          <TabsContent key={t.label} value={i + 1}>
            <div className="flex items-center justify-center py-24">
              <p className="text-sm text-muted-foreground">
                {t.label} &mdash; Coming in Phase {t.phase}
              </p>
            </div>
          </TabsContent>
        ))}

        {/* Tab 5: Sync Log */}
        <TabsContent value={5}>
          <div className="pt-4">
            <Card>
              <CardContent className="p-0">
                {syncLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-sm text-muted-foreground">
                      No sync logs recorded yet
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">
                          Rows Synced
                        </TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {syncLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">
                            {SOURCE_LABELS[log.source] ?? log.source}
                          </TableCell>
                          <TableCell>
                            {format(
                              new Date(log.started_at),
                              'MMM d, h:mm a',
                            )}
                          </TableCell>
                          <TableCell>
                            {durationStr(log.started_at, log.completed_at)}
                          </TableCell>
                          <TableCell>{statusBadge(log.status)}</TableCell>
                          <TableCell className="text-right">
                            {log.rows_synced ?? 0}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {log.error_message ?? '\u2014'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tabs 6–7: Placeholder for Notifications, Advanced */}
        {PLACEHOLDER_TABS.slice(4).map((t, i) => (
          <TabsContent key={t.label} value={i + 6}>
            <div className="flex items-center justify-center py-24">
              <p className="text-sm text-muted-foreground">
                {t.label} &mdash; Coming in Phase {t.phase}
              </p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
