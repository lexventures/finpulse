import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const topic = request.headers.get('x-shopify-topic')
  const body = await request.json()

  switch (topic) {
    case 'customers/data_request':
      console.log('Customer data request received:', body.shop_domain)
      break
    case 'customers/redact':
      console.log('Customer redact request received:', body.shop_domain)
      break
    case 'shop/redact':
      console.log('Shop redact request received:', body.shop_domain)
      break
    default:
      console.log('Unknown webhook topic:', topic)
  }

  return NextResponse.json({ success: true })
}
