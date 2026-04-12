import type { NextRequest } from 'next/server'

import { ensureShopify } from '@/lib/shopify/config'

export async function verifyShopifyRequest(
  request: NextRequest | Request,
): Promise<{ shop: string }> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }
  const token = authHeader.slice('Bearer '.length)
  const shopify = ensureShopify()
  const payload = await shopify.session.decodeSessionToken(token)
  const dest = typeof payload.dest === 'string' ? payload.dest : ''
  const shop = dest.replace(/^https?:\/\//, '').split('/')[0]?.toLowerCase() ?? ''
  if (!shop) {
    throw new Error('Invalid session token: missing dest')
  }
  return { shop }
}
