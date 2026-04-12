export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { SettingsTabs } from './settings-tabs'

function getSettingValue<T>(rows: Array<{ key: string; value: unknown }>, key: string): T | undefined {
  const row = rows.find((r) => r.key === key)
  if (!row) return undefined
  return row.value as T
}

export default async function SettingsPage() {
  const supabase = createServiceClient()

  const [syncLogsResult, thresholdsResult, benchmarksResult, auditLogsResult, settingsResult] =
    await Promise.all([
      supabase
        .from('fin_sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100),
      supabase
        .from('fin_alert_thresholds')
        .select('*')
        .order('category', { ascending: true }),
      supabase
        .from('fin_benchmarks')
        .select('*')
        .order('category', { ascending: true }),
      supabase
        .from('fin_audit_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(200),
      supabase
        .from('fin_settings')
        .select('key, value')
        .in('key', [
          'key_account_gross_margin',
          'faire_commission_rate',
          'faire_monthly_ad_budget',
          'shipping_allocation_method',
          'notification_email',
          'pin_hash',
          'pin_protected_pages',
          'finaloop_pnl_sheet_id',
          'finaloop_balance_sheet_id',
          'finaloop_cashflow_sheet_id',
          'google_service_account_email',
        ]),
    ])

  const settingsRows = settingsResult.data ?? []
  const notificationEmails =
    (getSettingValue<Record<string, unknown>>(settingsRows, 'notification_email')) ?? {}
  const pinHashVal = getSettingValue<unknown>(settingsRows, 'pin_hash')

  const settings = {
    faire_commission_rate: getSettingValue<number>(settingsRows, 'faire_commission_rate'),
    faire_monthly_ad_budget: getSettingValue<number>(settingsRows, 'faire_monthly_ad_budget'),
    key_account_gross_margin: getSettingValue<number>(settingsRows, 'key_account_gross_margin'),
    shipping_allocation_method: getSettingValue<string>(settingsRows, 'shipping_allocation_method'),
    alert_digest_email: notificationEmails.alert_digest_email as string | undefined,
    sync_failure_email: notificationEmails.sync_failure_email as string | undefined,
    pin_hash_set:
      typeof pinHashVal === 'string'
        ? pinHashVal.length > 0
        : Boolean(pinHashVal),
    pin_protected_pages: getSettingValue<string[]>(settingsRows, 'pin_protected_pages') ?? ['/team', '/scenarios'],
    finaloop_pnl_sheet_id: getSettingValue<string>(settingsRows, 'finaloop_pnl_sheet_id'),
    finaloop_balance_sheet_id: getSettingValue<string>(settingsRows, 'finaloop_balance_sheet_id'),
    finaloop_cashflow_sheet_id: getSettingValue<string>(settingsRows, 'finaloop_cashflow_sheet_id'),
    google_service_account_email: getSettingValue<string>(settingsRows, 'google_service_account_email'),
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configuration &amp; data status"
      />
      <SettingsTabs
        syncLogs={(syncLogsResult.data as never[]) ?? []}
        thresholds={(thresholdsResult.data as never[]) ?? []}
        benchmarks={(benchmarksResult.data as never[]) ?? []}
        auditLogs={(auditLogsResult.data as never[]) ?? []}
        settings={settings}
      />
    </>
  )
}
