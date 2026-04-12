import { NextRequest, NextResponse } from 'next/server'

import { withAuth } from '@/lib/dal'
import { createServiceClient } from '@/lib/supabase/server'

interface ThresholdPayload {
  id: string
  green_above: number | null
  yellow_above: number | null
  red_below: number | null
  is_active: boolean
}

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json()
    const thresholds: unknown = body.thresholds
    if (!Array.isArray(thresholds)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const supabase = createServiceClient()

    for (const t of thresholds as ThresholdPayload[]) {
      const { error } = await supabase
        .from('fin_alert_thresholds')
        .update({
          green_above: t.green_above,
          yellow_above: t.yellow_above,
          red_below: t.red_below,
          is_active: t.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    await supabase.from('fin_audit_log').insert({
      table_name: 'fin_alert_thresholds',
      record_id: 'bulk',
      field_changed: 'thresholds',
      old_value: null,
      new_value: JSON.stringify({ count: (thresholds as ThresholdPayload[]).length }),
      changed_by: 'settings_ui',
      changed_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  })
}
