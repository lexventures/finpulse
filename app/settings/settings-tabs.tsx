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
  pin_protected_pages?: string[]
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
          <TabsTrigger value={8}>Setup Guide</TabsTrigger>
        </TabsList>

        {/* Tab 0: Dashboard */}
        <TabsContent value={0}>
          <div className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {SOURCES.map((source) => (
                <SyncSourceCard
                  key={source}
                  source={source}
                  log={latestBySource.get(source) ?? null}
                />
              ))}
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

        {/* Tab 1: Alert Thresholds (reference) */}
        <TabsContent value={1}>
          <div className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Alert Thresholds</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Thresholds evaluated daily by the alert engine. Red alerts trigger email notifications.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {thresholds.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-sm text-muted-foreground">No alert thresholds configured</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metric</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Green</TableHead>
                        <TableHead className="text-right">Yellow</TableHead>
                        <TableHead className="text-right">Red</TableHead>
                        <TableHead className="text-center">Direction</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {thresholds.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.metric_label}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{t.category}</Badge></TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{t.green_above ?? '\u2014'}</TableCell>
                          <TableCell className="text-right text-amber-600 dark:text-amber-400">{t.yellow_above ?? '\u2014'}</TableCell>
                          <TableCell className="text-right text-red-600 dark:text-red-400">{t.red_below ?? '\u2014'}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{t.higher_is_better ? 'Higher is better' : 'Lower is better'}</TableCell>
                          <TableCell className="text-center"><span className={cn('inline-block size-2 rounded-full', t.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/30')} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Financial Benchmarks (reference) */}
        <TabsContent value={2}>
          <div className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Financial Benchmarks</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Industry benchmarks used by the AI briefing for context and by charts for reference lines.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {benchmarks.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-sm text-muted-foreground">No benchmarks configured</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Metric</TableHead>
                        <TableHead>Healthy Range</TableHead>
                        <TableHead>Warning</TableHead>
                        <TableHead>Context</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {benchmarks.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell><Badge variant="outline" className="text-xs">{b.category}</Badge></TableCell>
                          <TableCell className="font-medium">{b.metric_name}</TableCell>
                          <TableCell className="text-emerald-600 dark:text-emerald-400">{b.healthy_range}</TableCell>
                          <TableCell className="text-amber-600 dark:text-amber-400">{b.warning_threshold}</TableCell>
                          <TableCell className="max-w-[250px] truncate text-xs text-muted-foreground">{b.context_note ?? '\u2014'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
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
            <PinManagement
              hasPin={settings.pin_hash_set ?? false}
              protectedPages={settings.pin_protected_pages ?? ['/team', '/scenarios']}
            />
          </div>
        </TabsContent>

        {/* Tab 8: Setup Guide */}
        <TabsContent value={8}>
          <div className="space-y-6 pt-4 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle>How FinPulse Works</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
                <p>
                  FinPulse is a financial intelligence dashboard that pulls data from three sources:
                  Finaloop (via Google Sheets), Shopify (via API), and computes CFO-level metrics
                  automatically. Data syncs daily via Supabase Edge Functions.
                </p>
                <h4 className="font-semibold text-base">Data Flow</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Finaloop auto-exports P&amp;L, Balance Sheet, and Cash Flow to Google Sheets daily</li>
                  <li>FinPulse reads those sheets via the Google Sheets API and parses financial data into channel-segmented monthly rows</li>
                  <li>Shopify order and analytics data is pulled via ShopifyQL (aggregated, no individual orders stored)</li>
                  <li>All data lands in Supabase Postgres, where the dashboard pages query it</li>
                  <li>The alert engine evaluates 20 thresholds daily and sends email digests via Resend</li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Connecting Finaloop Google Sheets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <h4 className="font-semibold">Step 1: Create a Google Service Account</h4>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Go to <span className="font-mono text-foreground">console.cloud.google.com</span></li>
                    <li>Create a project (or use an existing one)</li>
                    <li>Enable the <strong>Google Sheets API</strong>: APIs &amp; Services &rarr; Library &rarr; search &ldquo;Google Sheets API&rdquo; &rarr; Enable</li>
                    <li>Go to <strong>IAM &amp; Admin &rarr; Service Accounts &rarr; Create Service Account</strong></li>
                    <li>Name it (e.g. &ldquo;finpulse-sheets&rdquo;), skip optional roles, click Done</li>
                    <li>Click into the service account &rarr; <strong>Keys</strong> tab &rarr; Add Key &rarr; Create New Key &rarr; <strong>JSON</strong></li>
                    <li>This downloads a JSON file with the <span className="font-mono">client_email</span> and <span className="font-mono">private_key</span></li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Step 2: Share the Google Sheets</h4>
                  <p className="text-muted-foreground">
                    Open each Finaloop Google Sheet (P&amp;L, Balance Sheet, Cash Flow).
                    Click <strong>Share</strong>, paste the service account email
                    (e.g. <span className="font-mono">finpulse-sheets@your-project.iam.gserviceaccount.com</span>),
                    set to <strong>Viewer</strong>, and click Send.
                    You do NOT need &ldquo;Anyone with the link&rdquo; &mdash; only the service account needs access.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Step 3: Set the Credentials</h4>
                  <p className="text-muted-foreground">
                    In your <strong>Supabase Dashboard &rarr; Edge Functions &rarr; Secrets</strong>, add:
                  </p>
                  <div className="rounded-md border bg-muted/50 p-3 font-mono text-xs space-y-1">
                    <p>GOOGLE_SERVICE_ACCOUNT_EMAIL = <span className="text-muted-foreground">(the client_email from the JSON)</span></p>
                    <p>GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = <span className="text-muted-foreground">(the private_key from the JSON, starts with -----BEGIN PRIVATE KEY-----)</span></p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Step 4: Enter Sheet IDs</h4>
                  <p className="text-muted-foreground">
                    Go to <strong>Settings &rarr; Channels</strong> tab &rarr; Data Sources section.
                    Paste the full Google Sheets URL or just the Sheet ID for each report.
                    The Sheet ID is the long string in the URL between <span className="font-mono">/d/</span> and <span className="font-mono">/edit</span>.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Step 5: Run the Sync</h4>
                  <p className="text-muted-foreground">
                    Go to <strong>Settings &rarr; Dashboard</strong> tab and click <strong>Run Sync</strong> on the Finaloop card.
                    The sync will pull data from the Google Sheets, parse it, and populate all financial tables.
                    After a successful sync, the CEO Overview and channel pages will show real data.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Environment Variables Reference</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <h4 className="font-semibold">Vercel Environment Variables</h4>
                  <p className="text-muted-foreground">Set in Vercel &rarr; Project Settings &rarr; Environment Variables:</p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left font-medium">Variable</th><th className="px-3 py-2 text-left font-medium">Purpose</th></tr></thead>
                      <tbody className="divide-y">
                        <tr><td className="px-3 py-1.5 font-mono">SHOPIFY_CLIENT_ID</td><td className="px-3 py-1.5 text-muted-foreground">Shopify app client ID</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">SHOPIFY_CLIENT_SECRET</td><td className="px-3 py-1.5 text-muted-foreground">Shopify app client secret</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">SHOPIFY_APP_URL</td><td className="px-3 py-1.5 text-muted-foreground">Vercel production URL</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">NEXT_PUBLIC_SUPABASE_URL</td><td className="px-3 py-1.5 text-muted-foreground">Supabase project URL</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</td><td className="px-3 py-1.5 text-muted-foreground">Supabase anon key (public)</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">SUPABASE_SERVICE_ROLE_KEY</td><td className="px-3 py-1.5 text-muted-foreground">Supabase service role key (server only)</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Supabase Edge Function Secrets</h4>
                  <p className="text-muted-foreground">Set in Supabase Dashboard &rarr; Edge Functions &rarr; Secrets:</p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left font-medium">Variable</th><th className="px-3 py-2 text-left font-medium">Purpose</th></tr></thead>
                      <tbody className="divide-y">
                        <tr><td className="px-3 py-1.5 font-mono">GOOGLE_SERVICE_ACCOUNT_EMAIL</td><td className="px-3 py-1.5 text-muted-foreground">Google service account email for Sheets API</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</td><td className="px-3 py-1.5 text-muted-foreground">Private key from the service account JSON</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">SHOPIFY_DTC_SHOP</td><td className="px-3 py-1.5 text-muted-foreground">DTC store domain (emilylex.myshopify.com)</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">SHOPIFY_WHOLESALE_SHOP</td><td className="px-3 py-1.5 text-muted-foreground">Wholesale store domain (elsw.myshopify.com)</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">RESEND_API_KEY</td><td className="px-3 py-1.5 text-muted-foreground">Resend API key for alert digest emails</td></tr>
                        <tr><td className="px-3 py-1.5 font-mono">ANTHROPIC_API_KEY</td><td className="px-3 py-1.5 text-muted-foreground">Claude API key for AI morning briefing</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically provided to Edge Functions by Supabase.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">In-App Settings (Settings &rarr; Channels tab)</h4>
                  <p className="text-muted-foreground">These are stored in the database and editable from the app:</p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left font-medium">Setting</th><th className="px-3 py-2 text-left font-medium">Purpose</th></tr></thead>
                      <tbody className="divide-y">
                        <tr><td className="px-3 py-1.5">Finaloop Sheet IDs</td><td className="px-3 py-1.5 text-muted-foreground">Google Sheets URLs or IDs for P&amp;L, Balance Sheet, Cash Flow</td></tr>
                        <tr><td className="px-3 py-1.5">Faire Commission Rate</td><td className="px-3 py-1.5 text-muted-foreground">Marketplace commission % for contribution margin calculation</td></tr>
                        <tr><td className="px-3 py-1.5">Faire Monthly Ad Budget</td><td className="px-3 py-1.5 text-muted-foreground">Promoted Listings budget cross-reference</td></tr>
                        <tr><td className="px-3 py-1.5">Key Account Gross Margin</td><td className="px-3 py-1.5 text-muted-foreground">Post-wholesale-discount margin for COGS estimation</td></tr>
                        <tr><td className="px-3 py-1.5">Shipping Allocation</td><td className="px-3 py-1.5 text-muted-foreground">How shipping costs split across channels</td></tr>
                        <tr><td className="px-3 py-1.5">Notification Emails</td><td className="px-3 py-1.5 text-muted-foreground">Alert digest and sync failure email addresses</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shopify Permissions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  FinPulse is installed as a single Shopify app on both the DTC store (emilylex) and
                  the wholesale store (elsw). It uses these read-only scopes:
                </p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left font-medium">Scope</th><th className="px-3 py-2 text-left font-medium">Used For</th></tr></thead>
                    <tbody className="divide-y">
                      <tr><td className="px-3 py-1.5 font-mono">read_orders</td><td className="px-3 py-1.5 text-muted-foreground">DTC order aggregation, membership detection via tags</td></tr>
                      <tr><td className="px-3 py-1.5 font-mono">read_products</td><td className="px-3 py-1.5 text-muted-foreground">Product context for inventory queries</td></tr>
                      <tr><td className="px-3 py-1.5 font-mono">read_inventory</td><td className="px-3 py-1.5 text-muted-foreground">Incoming inventory value (committed PO outflows for cash forecast)</td></tr>
                      <tr><td className="px-3 py-1.5 font-mono">read_analytics</td><td className="px-3 py-1.5 text-muted-foreground">ShopifyQL for sessions, conversion rate, cart abandonment, revenue by source</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  Inventory is only pulled from the DTC store (emilylex). The wholesale store shares the same inventory pool.
                  FinPulse never writes to Shopify &mdash; all scopes are read-only.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daily Sync Schedule</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="text-muted-foreground mb-3">
                  Edge Functions run sequentially each morning (Eastern time). Configure via pg_cron in Supabase.
                  You can also trigger any sync manually from the Dashboard tab.
                </p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left font-medium">Time</th><th className="px-3 py-2 text-left font-medium">Function</th><th className="px-3 py-2 text-left font-medium">Source</th></tr></thead>
                    <tbody className="divide-y">
                      <tr><td className="px-3 py-1.5">4:00 AM</td><td className="px-3 py-1.5">sync-shopify-dtc</td><td className="px-3 py-1.5 text-muted-foreground">Shopify emilylex &rarr; daily revenue + membership + inventory</td></tr>
                      <tr><td className="px-3 py-1.5">4:15 AM</td><td className="px-3 py-1.5">sync-shopify-wholesale</td><td className="px-3 py-1.5 text-muted-foreground">Shopify elsw &rarr; Faire/Direct daily revenue</td></tr>
                      <tr><td className="px-3 py-1.5">4:30 AM</td><td className="px-3 py-1.5">sync-finaloop-sheets</td><td className="px-3 py-1.5 text-muted-foreground">Google Sheets &rarr; monthly P&amp;L, Balance Sheet, Cash Flow</td></tr>
                      <tr><td className="px-3 py-1.5">4:45 AM</td><td className="px-3 py-1.5">sync-shopify-analytics</td><td className="px-3 py-1.5 text-muted-foreground">ShopifyQL &rarr; sessions, conversion, cart abandonment</td></tr>
                      <tr><td className="px-3 py-1.5">5:15 AM</td><td className="px-3 py-1.5">run-alert-engine</td><td className="px-3 py-1.5 text-muted-foreground">Evaluate 20 alert thresholds</td></tr>
                      <tr><td className="px-3 py-1.5">5:30 AM</td><td className="px-3 py-1.5">generate-briefing</td><td className="px-3 py-1.5 text-muted-foreground">Claude AI morning briefing</td></tr>
                      <tr><td className="px-3 py-1.5">5:45 AM</td><td className="px-3 py-1.5">send-alert-digest</td><td className="px-3 py-1.5 text-muted-foreground">Email red/yellow alerts via Resend</td></tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
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
              <p className="text-xs text-muted-foreground">
                Faire&apos;s marketplace commission on orders placed through Faire (not Faire Direct). Default 15%.
                Used to calculate Faire contribution margin: Revenue &minus; COGS &minus; Commission &minus; Ads.
                Shown separately from Promoted Listings ad spend, which is billed via ACH.
              </p>
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
              <p className="text-xs text-muted-foreground">
                Faire Promoted Listings monthly budget, billed separately via ACH (not deducted from payouts).
                Used as a cross-reference until Finaloop categorizes these charges under &ldquo;Paid online ads &minus; Faire.&rdquo;
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Key Account Gross Margin (%)</label>
              <Input
                type="number"
                step="0.1"
                min="70"
                max="85"
                value={grossMargin}
                onChange={(e) => { setGrossMargin(parseFloat(e.target.value) || 0); setSaved(false) }}
              />
              <p className="text-xs text-muted-foreground">
                Margin on wholesale key account orders (PO/ACH). This is the margin AFTER the wholesale price
                (e.g., if retail is $50 and wholesale is $25, and COGS is $5.63, margin = ($25 &minus; $5.63) / $25 = 77.5%).
                Finaloop doesn&apos;t break out key account COGS, so FinPulse calculates it as: Key Account Revenue &times; (1 &minus; this value).
                Range: 70&ndash;85%.
              </p>
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
              <p className="text-xs text-muted-foreground">
                How &ldquo;Shipping &amp; freight-out&rdquo; from Finaloop is allocated to channels.
                &ldquo;Proportional to Revenue&rdquo; splits shipping costs by each channel&apos;s share of total revenue.
                &ldquo;Blended Company Wide&rdquo; keeps shipping as a single company-level line item (not allocated to channels).
              </p>
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

const PIN_PAGE_OPTIONS = [
  { path: '/team', label: 'Team (Headcount & Labor)' },
  { path: '/scenarios', label: 'Scenarios' },
  { path: '/cash', label: 'Cash Flow' },
  { path: '/settings', label: 'Settings' },
  { path: '/', label: 'CEO Overview' },
  { path: '/dtc', label: 'DTC' },
  { path: '/wholesale', label: 'Wholesale' },
  { path: '/marketplaces', label: 'Marketplaces' },
  { path: '/retail', label: 'Retail' },
  { path: '/inventory', label: 'Inventory' },
]

function PinManagement({
  hasPin,
  protectedPages,
}: {
  hasPin: boolean
  protectedPages: string[]
}) {
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinHint, setPinHint] = useState('')
  const [selectedPages, setSelectedPages] = useState<string[]>(protectedPages)
  const [saving, setSaving] = useState(false)
  const [savingPages, setSavingPages] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pagesMessage, setPagesMessage] = useState('')

  function togglePage(path: string) {
    setSelectedPages((prev) =>
      prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path],
    )
    setPagesMessage('')
  }

  async function handleSavePages() {
    setSavingPages(true)
    setPagesMessage('')
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_protected_pages: selectedPages }),
      })
      setPagesMessage('Saved')
    } catch {
      setPagesMessage('Failed to save')
    } finally {
      setSavingPages(false)
    }
  }

  async function handleSetPin(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')

    if (newPin.length !== 8) {
      setError('PIN must be exactly 8 characters')
      return
    }
    if (newPin !== confirmPin) {
      setError('PINs do not match')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/settings/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin, hint: pinHint }),
      })
      if (res.ok) {
        setMessage('PIN updated successfully')
        setNewPin('')
        setConfirmPin('')
        setPinHint('')
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>PIN Protection</CardTitle>
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
                maxLength={8}
                minLength={8}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="8-character PIN"
              />
              <p className="text-xs text-muted-foreground">
                Letters, numbers, or a mix. Exactly 8 characters.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Confirm PIN</label>
              <Input
                type="password"
                maxLength={8}
                minLength={8}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Re-enter PIN"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Hint (optional)</label>
              <Input
                type="text"
                maxLength={100}
                value={pinHint}
                onChange={(e) => setPinHint(e.target.value)}
                placeholder="e.g. favorite coffee order"
              />
              <p className="text-xs text-muted-foreground">
                Shown after a failed attempt to help you remember
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && (
              <p className="text-sm text-emerald-600">{message}</p>
            )}
            <Button
              type="submit"
              disabled={saving || newPin.length !== 8 || !confirmPin}
            >
              {saving ? 'Saving...' : hasPin ? 'Change PIN' : 'Set PIN'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Protected Pages</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select which pages require PIN entry. PIN must be set first.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-2">
            {PIN_PAGE_OPTIONS.map((page) => (
              <label
                key={page.path}
                className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedPages.includes(page.path)}
                  onChange={() => togglePage(page.path)}
                  disabled={!hasPin}
                  className="size-4 rounded border-input accent-primary"
                />
                <span className="text-sm">{page.label}</span>
                <span className="ml-auto text-xs text-muted-foreground font-mono">
                  {page.path}
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSavePages}
              disabled={savingPages || !hasPin}
              variant="outline"
            >
              {savingPages ? 'Saving...' : 'Save Page Settings'}
            </Button>
            {pagesMessage && (
              <span className={cn(
                'text-sm',
                pagesMessage === 'Saved' ? 'text-emerald-600' : 'text-destructive',
              )}>
                {pagesMessage}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SyncSourceCard({
  source,
  log: initialLog,
}: {
  source: string
  log: SyncLog | null
}) {
  const [syncing, setSyncing] = useState(false)
  const [log, setLog] = useState(initialLog)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  const statusColor: 'green' | 'yellow' | 'red' =
    syncing
      ? 'yellow'
      : !log
        ? 'red'
        : log.status === 'success' || log.status === 'partial'
          ? 'green'
          : log.status === 'error'
            ? 'red'
            : 'yellow'

  async function handleSync() {
    setSyncing(true)
    setResultMessage(null)
    try {
      const res = await fetch(`/api/sync/${source}`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (res.ok) {
        const result = body?.result
        const rows = result?.rows ?? result?.wholesale_daily_rows ?? 0
        setResultMessage(`Sync completed — ${rows} rows`)
        setLog({
          id: '',
          source,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: 'success',
          rows_synced: rows,
          error_message: null,
        })
      } else {
        const errMsg = body?.error ?? `Failed (${res.status})`
        setResultMessage(errMsg)
        setLog({
          id: '',
          source,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: 'error',
          rows_synced: 0,
          error_message: errMsg,
        })
      }
    } catch {
      setResultMessage('Sync request failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{SOURCE_LABELS[source] ?? source}</CardTitle>
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
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              Last sync:{' '}
              {format(new Date(log.started_at), 'MMM d, h:mm a')}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              {statusBadge(log.status)}
            </div>
            {log.rows_synced > 0 && (
              <p className="text-muted-foreground">
                Rows synced: {log.rows_synced}
              </p>
            )}
            {log.error_message && log.status === 'error' && (
              <p className="text-xs text-destructive truncate max-w-[250px]" title={log.error_message}>
                {log.error_message}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No sync data</p>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={syncing}
          onClick={handleSync}
        >
          <RefreshCw className={cn('size-3', syncing && 'animate-spin')} />
          {syncing ? 'Syncing\u2026' : 'Run Sync'}
        </Button>
        {resultMessage && (
          <p className={cn(
            'text-xs',
            resultMessage.startsWith('Sync completed') ? 'text-emerald-600' : 'text-destructive',
          )}>
            {resultMessage}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
