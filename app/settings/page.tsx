export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { SettingsTabs } from './settings-tabs'

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
          'channel_config',
          'notification_email',
          'pin_hash',
        ]),
    ])

  const settingsRows = settingsResult.data ?? []
  const channelConfig =
    (settingsRows.find((r) => r.key === 'channel_config')?.value as Record<string, unknown>) ?? {}
  const notificationEmails =
    (settingsRows.find((r) => r.key === 'notification_email')?.value as Record<string, unknown>) ?? {}
  const pinHashVal = settingsRows.find((r) => r.key === 'pin_hash')?.value

  const settings = {
    faire_commission_rate: channelConfig.faire_commission_rate as number | undefined,
    faire_monthly_ad_budget: channelConfig.faire_monthly_ad_budget as number | undefined,
    key_account_gross_margin: channelConfig.key_account_gross_margin as number | undefined,
    shipping_allocation_method: channelConfig.shipping_allocation_method as string | undefined,
    alert_digest_email: notificationEmails.alert_digest_email as string | undefined,
    sync_failure_email: notificationEmails.sync_failure_email as string | undefined,
    pin_hash_set:
      typeof pinHashVal === 'string'
        ? pinHashVal.length > 0
        : Boolean(pinHashVal),
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
