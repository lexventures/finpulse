import { NextRequest, NextResponse } from 'next/server'

import { withAuth } from '@/lib/dal'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  return withAuth(request, async () => {
    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Missing alert id' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('fin_alerts')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  })
}
