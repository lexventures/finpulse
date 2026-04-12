export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { SettingsTabs } from './settings-tabs'

export default async function SettingsPage() {
  const supabase = createServiceClient()
  const { data: syncLogs } = await supabase
    .from('fin_sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(100)

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configuration &amp; data status"
      />
      <SettingsTabs syncLogs={(syncLogs as never[]) ?? []} />
    </>
  )
}
