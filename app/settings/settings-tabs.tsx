'use client'

import { useState, type FormEvent } from 'react'
import { format, differenceInSeconds } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

interface AlertThreshold {
  id: string
  metric_key: string
  metric_label: string
  category: string
  green_above: number | null
  yellow_above: number | null
  red_below: number | null
  comparison_type: string
  higher_is_better: boolean
  is_active: boolean
}

interface Benchmark {
  id: string
  category: string
  metric_name: string
  healthy_range: string
  warning_threshold: string
  context_note: string | null
}

interface AuditLogEntry {
  id: string
  table_name: string
  record_id: string
  field_changed: string
  old_value: string | null
  new_value: string | null
  changed_by: string
  changed_at: string
}

interface SettingsValues {
  faire_commission_rate?: number
  faire_monthly_ad_budget?: number
  key_account_gross_margin?: number
  shipping_allocation_method?: string
  alert_digest_email?: string
  sync_failure_email?: string
  pin_hash_set?: boolean
  finaloop_pnl_sheet_id?: string
  finaloop_balance_sheet_id?: string
  finaloop_cashflow_sheet_id?: string
  google_service_account_email?: string
}

interface SettingsTabsProps {
  syncLogs: SyncLog[]
  thresholds: AlertThreshold[]
  benchmarks: Benchmark[]
  auditLogs: AuditLogEntry[]
  settings: SettingsValues
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

export function SettingsTabs({
  syncLogs,
  thresholds,
  benchmarks,
  auditLogs,
  settings,
}: SettingsTabsProps) {
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
          <TabsTrigger value={1}>Thresholds</TabsTrigger>
          <TabsTrigger value={2}>Benchmarks</TabsTrigger>
          <TabsTrigger value={3}>Channels</TabsTrigger>
          <TabsTrigger value={4}>Notifications</TabsTrigger>
          <TabsTrigger value={5}>Sync Log</TabsTrigger>
          <TabsTrigger value={6}>Change Log</TabsTrigger>
          <TabsTrigger value={7}>PIN</TabsTrigger>
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

        {/* Tab 1: Alert Thresholds */}
        <TabsContent value={1}>
          <div className="pt-4">
            <ThresholdsEditor thresholds={thresholds} />
          </div>
        </TabsContent>

        {/* Tab 2: Financial Benchmarks */}
        <TabsContent value={2}>
          <div className="pt-4">
            <BenchmarksEditor benchmarks={benchmarks} />
          </div>
        </TabsContent>

        {/* Tab 3: Channel Config */}
        <TabsContent value={3}>
          <div className="pt-4">
            <ChannelConfigForm settings={settings} />
          </div>
        </TabsContent>

        {/* Tab 4: Notifications */}
        <TabsContent value={4}>
          <div className="pt-4">
            <NotificationsForm
              initialDigestEmail={settings.alert_digest_email ?? ''}
              initialSyncEmail={settings.sync_failure_email ?? ''}
            />
          </div>
        </TabsContent>

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

        {/* Tab 6: Change Log */}
        <TabsContent value={6}>
          <div className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Change Log</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {auditLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-sm text-muted-foreground">
                      No changes recorded yet
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead>Field</TableHead>
                        <TableHead>Old Value</TableHead>
                        <TableHead>New Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {format(new Date(entry.changed_at), 'MMM d, h:mm a')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {entry.table_name}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {entry.field_changed}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">
                            {entry.old_value ?? '\u2014'}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate text-xs">
                            {entry.new_value ?? '\u2014'}
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

        {/* Tab 7: PIN Management */}
        <TabsContent value={7}>
          <div className="pt-4">
            <PinManagement hasPin={settings.pin_hash_set ?? false} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components for interactive tabs
// ---------------------------------------------------------------------------

function NotificationsForm({
  initialDigestEmail,
  initialSyncEmail,
}: {
  initialDigestEmail: string
  initialSyncEmail: string
}) {
  const [digestEmail, setDigestEmail] = useState(initialDigestEmail)
  const [syncEmail, setSyncEmail] = useState(initialSyncEmail)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_digest_email: digestEmail,
          sync_failure_email: syncEmail,
        }),
      })
      setSaved(true)
    } catch {
      // silently handle
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Alert Digest Email</label>
            <Input
              type="email"
              value={digestEmail}
              onChange={(e) => setDigestEmail(e.target.value)}
              placeholder="ceo@company.com"
            />
            <p className="text-xs text-muted-foreground">
              Receives daily alert digest when red/yellow alerts fire
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Sync Failure Email</label>
            <Input
              type="email"
              value={syncEmail}
              onChange={(e) => setSyncEmail(e.target.value)}
              placeholder="ops@company.com"
            />
            <p className="text-xs text-muted-foreground">
              Receives immediate notification when data syncs fail
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            {saved && (
              <span className="text-sm text-emerald-600">Saved</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ThresholdsEditor({ thresholds }: { thresholds: AlertThreshold[] }) {
  const [items, setItems] = useState(thresholds)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function updateItem(id: string, field: string, value: number | boolean | null) {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    )
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/settings/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholds: items }),
      })
      setSaved(true)
    } catch {
      // silently handle
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alert Thresholds</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              No alert thresholds configured
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Green Above</TableHead>
                  <TableHead className="text-right">Yellow Above</TableHead>
                  <TableHead className="text-right">Red Below</TableHead>
                  <TableHead className="text-center">Direction</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.metric_label}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {t.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="ml-auto w-24 text-right"
                        value={t.green_above ?? ''}
                        onChange={(e) =>
                          updateItem(
                            t.id,
                            'green_above',
                            e.target.value === '' ? null : parseFloat(e.target.value),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="ml-auto w-24 text-right"
                        value={t.yellow_above ?? ''}
                        onChange={(e) =>
                          updateItem(
                            t.id,
                            'yellow_above',
                            e.target.value === '' ? null : parseFloat(e.target.value),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="ml-auto w-24 text-right"
                        value={t.red_below ?? ''}
                        onChange={(e) =>
                          updateItem(
                            t.id,
                            'red_below',
                            e.target.value === '' ? null : parseFloat(e.target.value),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {t.higher_is_better ? 'Higher is better' : 'Lower is better'}
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={t.is_active}
                        onChange={(e) => updateItem(t.id, 'is_active', e.target.checked)}
                        className="size-4 rounded border-input accent-emerald-600"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center gap-3 border-t p-4">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Thresholds'}
              </Button>
              {saved && (
                <span className="text-sm text-emerald-600">Saved</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BenchmarksEditor({ benchmarks }: { benchmarks: Benchmark[] }) {
  const [items, setItems] = useState(benchmarks)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function updateItem(id: string, field: string, value: string | null) {
    setItems((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    )
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/settings/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benchmarks: items }),
      })
      setSaved(true)
    } catch {
      // silently handle
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Benchmarks</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              No benchmarks configured
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Healthy Range</TableHead>
                  <TableHead>Warning Threshold</TableHead>
                  <TableHead>Context Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {b.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {b.metric_name}
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-32"
                        value={b.healthy_range}
                        onChange={(e) => updateItem(b.id, 'healthy_range', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-32"
                        value={b.warning_threshold}
                        onChange={(e) => updateItem(b.id, 'warning_threshold', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-48"
                        value={b.context_note ?? ''}
                        onChange={(e) =>
                          updateItem(b.id, 'context_note', e.target.value || null)
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center gap-3 border-t p-4">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Benchmarks'}
              </Button>
              {saved && (
                <span className="text-sm text-emerald-600">Saved</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ChannelConfigForm({ settings }: { settings: SettingsValues }) {
  const [faireRate, setFaireRate] = useState(settings.faire_commission_rate ?? 0)
  const [adBudget, setAdBudget] = useState(settings.faire_monthly_ad_budget ?? 0)
  const [grossMargin, setGrossMargin] = useState(settings.key_account_gross_margin ?? 0)
  const [shippingMethod, setShippingMethod] = useState(
    settings.shipping_allocation_method ?? 'proportional_to_revenue',
  )
  const [pnlSheetId, setPnlSheetId] = useState(settings.finaloop_pnl_sheet_id ?? '')
  const [balanceSheetId, setBalanceSheetId] = useState(settings.finaloop_balance_sheet_id ?? '')
  const [cashflowSheetId, setCashflowSheetId] = useState(settings.finaloop_cashflow_sheet_id ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faire_commission_rate: faireRate,
          faire_monthly_ad_budget: adBudget,
          key_account_gross_margin: grossMargin,
          shipping_allocation_method: shippingMethod,
          finaloop_pnl_sheet_id: pnlSheetId,
          finaloop_balance_sheet_id: balanceSheetId,
          finaloop_cashflow_sheet_id: cashflowSheetId,
        }),
      })
      setSaved(true)
    } catch {
      // silently handle
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Channel Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Faire Commission Rate (%)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={faireRate}
                onChange={(e) => { setFaireRate(parseFloat(e.target.value) || 0); setSaved(false) }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Faire Monthly Ad Budget ($)</label>
              <Input
                type="number"
                step="1"
                min="0"
                value={adBudget}
                onChange={(e) => { setAdBudget(parseFloat(e.target.value) || 0); setSaved(false) }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Key Account Gross Margin (%)</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={grossMargin}
                onChange={(e) => { setGrossMargin(parseFloat(e.target.value) || 0); setSaved(false) }}
              />
              <p className="text-xs text-muted-foreground">Typical range: 70-85%</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Shipping Allocation Method</label>
              <select
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={shippingMethod}
                onChange={(e) => { setShippingMethod(e.target.value); setSaved(false) }}
              >
                <option value="proportional_to_revenue">Proportional to Revenue</option>
                <option value="blended_company_wide">Blended Company Wide</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Sources — Finaloop Google Sheets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter the Google Sheets ID or full URL for each Finaloop report.
            The sheet ID is the long string in the URL between <code>/d/</code> and <code>/edit</code>.
          </p>
          <div className="grid gap-4 sm:grid-cols-1 max-w-xl">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">P&amp;L Sheet ID or URL</label>
              <Input
                value={pnlSheetId}
                onChange={(e) => { setPnlSheetId(e.target.value); setSaved(false) }}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Balance Sheet ID or URL</label>
              <Input
                value={balanceSheetId}
                onChange={(e) => { setBalanceSheetId(e.target.value); setSaved(false) }}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cash Flow Sheet ID or URL</label>
              <Input
                value={cashflowSheetId}
                onChange={(e) => { setCashflowSheetId(e.target.value); setSaved(false) }}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              />
            </div>
          </div>
          {settings.google_service_account_email && (
            <div className="rounded-md border bg-muted/50 p-3 max-w-xl">
              <p className="text-xs font-medium text-muted-foreground">Google Service Account</p>
              <p className="mt-0.5 text-sm font-mono break-all">
                {settings.google_service_account_email}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Share each Google Sheet with this email. Configure via Supabase Vault or env vars.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600">Saved</span>
        )}
      </div>
    </form>
  )
}

function PinManagement({ hasPin }: { hasPin: boolean }) {
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSetPin(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')

    if (newPin.length < 4 || newPin.length > 6) {
      setError('PIN must be 4-6 digits')
      return
    }
    if (newPin !== confirmPin) {
      setError('PINs do not match')
      return
    }
    if (!/^\d+$/.test(newPin)) {
      setError('PIN must be numeric')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/settings/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin }),
      })
      if (res.ok) {
        setMessage('PIN updated successfully')
        setNewPin('')
        setConfirmPin('')
      } else {
        setError('Failed to update PIN')
      }
    } catch {
      setError('Failed to update PIN')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PIN Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          {hasPin ? (
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
            >
              PIN Set
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              No PIN Set
            </Badge>
          )}
        </div>

        <form onSubmit={handleSetPin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {hasPin ? 'New PIN' : 'Set PIN'}
            </label>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="4-6 digit PIN"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirm PIN</label>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Re-enter PIN"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && (
            <p className="text-sm text-emerald-600">{message}</p>
          )}
          <Button
            type="submit"
            disabled={saving || !newPin || !confirmPin}
          >
            {saving ? 'Saving...' : hasPin ? 'Change PIN' : 'Set PIN'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
