import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createServiceClient } from '@/lib/supabase/server'

const SettingsSchema = z.object({
  alert_digest_email: z.string().email().or(z.literal('')).optional(),
  sync_failure_email: z.string().email().or(z.literal('')).optional(),
  faire_commission_rate: z.number().min(0).max(100).optional(),
  faire_monthly_ad_budget: z.number().min(0).optional(),
  key_account_gross_margin: z.number().min(0).max(100).optional(),
  shipping_allocation_method: z.enum(['proportional_to_revenue', 'blended_company_wide']).optional(),
  finaloop_pnl_sheet_id: z.string().optional(),
  finaloop_balance_sheet_id: z.string().optional(),
  finaloop_cashflow_sheet_id: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = SettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()
  const settingsToSave: Array<{ key: string; value: unknown }> = []
  const now = new Date().toISOString()

  if (parsed.data.alert_digest_email !== undefined || parsed.data.sync_failure_email !== undefined) {
    settingsToSave.push({
      key: 'notification_email',
      value: {
        alert_digest_email: parsed.data.alert_digest_email,
        sync_failure_email: parsed.data.sync_failure_email,
      },
    })
  }
  if (parsed.data.faire_commission_rate !== undefined) {
    settingsToSave.push({ key: 'faire_commission_rate', value: parsed.data.faire_commission_rate })
  }
  if (parsed.data.faire_monthly_ad_budget !== undefined) {
    settingsToSave.push({ key: 'faire_monthly_ad_budget', value: parsed.data.faire_monthly_ad_budget })
  }
  if (parsed.data.key_account_gross_margin !== undefined) {
    settingsToSave.push({ key: 'key_account_gross_margin', value: parsed.data.key_account_gross_margin })
  }
  if (parsed.data.shipping_allocation_method !== undefined) {
    settingsToSave.push({ key: 'shipping_allocation_method', value: parsed.data.shipping_allocation_method })
  }
  if (parsed.data.finaloop_pnl_sheet_id !== undefined) {
    settingsToSave.push({ key: 'finaloop_pnl_sheet_id', value: parsed.data.finaloop_pnl_sheet_id })
  }
  if (parsed.data.finaloop_balance_sheet_id !== undefined) {
    settingsToSave.push({ key: 'finaloop_balance_sheet_id', value: parsed.data.finaloop_balance_sheet_id })
  }
  if (parsed.data.finaloop_cashflow_sheet_id !== undefined) {
    settingsToSave.push({ key: 'finaloop_cashflow_sheet_id', value: parsed.data.finaloop_cashflow_sheet_id })
  }

  for (const s of settingsToSave) {
    const { error } = await supabase
      .from('fin_settings')
      .upsert({ key: s.key, value: s.value, updated_at: now })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (settingsToSave.length > 0) {
    await supabase.from('fin_audit_log').insert({
      table_name: 'fin_settings',
      record_id: 'bulk',
      field_changed: settingsToSave.map((s) => s.key).join(', '),
      old_value: null,
      new_value: JSON.stringify(Object.fromEntries(settingsToSave.map((s) => [s.key, s.value]))),
      changed_by: 'settings_ui',
      changed_at: now,
    })
  }

  return NextResponse.json({ success: true })
}
