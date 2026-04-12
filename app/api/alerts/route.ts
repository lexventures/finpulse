import { NextRequest, NextResponse } from 'next/server'

import { verifyShopifyRequest } from '@/lib/shopify/verify-request'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  try {
    await verifyShopifyRequest(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
}
