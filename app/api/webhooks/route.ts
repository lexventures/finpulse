import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

import { createServiceClient } from '@/lib/supabase/server'

function verifyWebhookHmac(rawBody: string, hmacHeader: string, secret: string): boolean {
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  const digestBuffer = Buffer.from(digest, 'base64')
  const headerBuffer = Buffer.from(hmacHeader, 'base64')
  if (digestBuffer.length !== headerBuffer.length) {
    return false
  }
  return timingSafeEqual(digestBuffer, headerBuffer)
}

export async function POST(request: NextRequest) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const topic = request.headers.get('x-shopify-topic')
  const shop = request.headers.get('x-shopify-shop-domain')
  const rawBody = await request.text()

  if (!secret || !hmac || !verifyWebhookHmac(rawBody, hmac, secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  let body: Record<string, unknown> | null = null
  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    body = null
  }

  switch (topic) {
    case 'customers/data_request':
      console.log('Customer data request received:', shop)
      break
    case 'customers/redact':
      console.log('Customer redact request received:', shop)
      break
    case 'shop/redact':
      console.log('Shop redact request received:', shop)
      break
    case 'app/uninstalled': {
      if (shop) {
        const supabase = createServiceClient()
        await supabase.from('shopify_sessions').delete().eq('shop', shop)
      }
      console.log('App uninstalled webhook received:', shop)
      break
    }
    default:
      console.log('Unknown webhook topic:', topic)
  }

  return NextResponse.json({ success: true, topic, shop, hasBody: Boolean(body) })
}
