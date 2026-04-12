import { NextRequest, NextResponse } from 'next/server'

import { withAuth } from '@/lib/dal'
import { createServiceClient } from '@/lib/supabase/server'

interface BenchmarkPayload {
  id: string
  healthy_range: string
  warning_threshold: string
  context_note: string | null
}

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json()
    const benchmarks: unknown = body.benchmarks
    if (!Array.isArray(benchmarks)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const supabase = createServiceClient()

    for (const b of benchmarks as BenchmarkPayload[]) {
      const { error } = await supabase
        .from('fin_benchmarks')
        .update({
          healthy_range: b.healthy_range,
          warning_threshold: b.warning_threshold,
          context_note: b.context_note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', b.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    await supabase.from('fin_audit_log').insert({
      table_name: 'fin_benchmarks',
      record_id: 'bulk',
      field_changed: 'benchmarks',
      old_value: null,
      new_value: JSON.stringify({ count: (benchmarks as BenchmarkPayload[]).length }),
      changed_by: 'settings_ui',
      changed_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  })
}
