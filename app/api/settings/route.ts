import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withAuth } from '@/lib/dal'
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
  finaloop_pnl_tab: z.string().optional(),
  finaloop_balance_sheet_tab: z.string().optional(),
  finaloop_cashflow_tab: z.string().optional(),
  pin_protected_pages: z.array(z.string()).optional(),
})

const SHEET_ID_RE = /^[a-zA-Z0-9_-]{20,}$/

function normalizeSheetIdInput(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const matched = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/)
  const sheetId = (matched ? matched[1] : trimmed).replace(/['"]/g, '').trim()
  if (!SHEET_ID_RE.test(sheetId)) {
    throw new Error(`Invalid Google Sheet ID format: ${value}`)
  }
  return sheetId
}

function normalizeTabInput(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''
  if (normalized.length > 120) {
    throw new Error('Tab name must be 120 characters or fewer')
  }
  return normalized
}

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
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
    let normalizedPnlSheetId: string | undefined
    let normalizedBalanceSheetId: string | undefined
    let normalizedCashflowSheetId: string | undefined
    let normalizedPnlTab: string | undefined
    let normalizedBalanceTab: string | undefined
    let normalizedCashflowTab: string | undefined

    try {
      if (parsed.data.finaloop_pnl_sheet_id !== undefined) {
        normalizedPnlSheetId = normalizeSheetIdInput(parsed.data.finaloop_pnl_sheet_id)
      }
      if (parsed.data.finaloop_balance_sheet_id !== undefined) {
        normalizedBalanceSheetId = normalizeSheetIdInput(parsed.data.finaloop_balance_sheet_id)
      }
      if (parsed.data.finaloop_cashflow_sheet_id !== undefined) {
        normalizedCashflowSheetId = normalizeSheetIdInput(parsed.data.finaloop_cashflow_sheet_id)
      }
      if (parsed.data.finaloop_pnl_tab !== undefined) {
        normalizedPnlTab = normalizeTabInput(parsed.data.finaloop_pnl_tab)
      }
      if (parsed.data.finaloop_balance_sheet_tab !== undefined) {
        normalizedBalanceTab = normalizeTabInput(parsed.data.finaloop_balance_sheet_tab)
      }
      if (parsed.data.finaloop_cashflow_tab !== undefined) {
        normalizedCashflowTab = normalizeTabInput(parsed.data.finaloop_cashflow_tab)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message }, { status: 400 })
    }

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
    if (normalizedPnlSheetId !== undefined) {
      settingsToSave.push({ key: 'finaloop_pnl_sheet_id', value: normalizedPnlSheetId })
    }
    if (normalizedBalanceSheetId !== undefined) {
      settingsToSave.push({ key: 'finaloop_balance_sheet_id', value: normalizedBalanceSheetId })
    }
    if (normalizedCashflowSheetId !== undefined) {
      settingsToSave.push({ key: 'finaloop_cashflow_sheet_id', value: normalizedCashflowSheetId })
    }
    if (normalizedPnlTab !== undefined) {
      settingsToSave.push({ key: 'finaloop_pnl_tab', value: normalizedPnlTab })
    }
    if (normalizedBalanceTab !== undefined) {
      settingsToSave.push({ key: 'finaloop_balance_sheet_tab', value: normalizedBalanceTab })
    }
    if (normalizedCashflowTab !== undefined) {
      settingsToSave.push({ key: 'finaloop_cashflow_tab', value: normalizedCashflowTab })
    }
    if (parsed.data.pin_protected_pages !== undefined) {
      settingsToSave.push({ key: 'pin_protected_pages', value: parsed.data.pin_protected_pages })
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
  })
}
