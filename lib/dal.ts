import { verifyShopifyRequest } from '@/lib/shopify/verify-request'
import { createServiceClient } from '@/lib/supabase/server'

export async function verifySession(request: Request): Promise<string> {
  const { shop } = await verifyShopifyRequest(request)
  return shop
}

export function getServiceClient() {
  return createServiceClient()
}

export async function withAuth(
  request: Request,
  handler: (shop: string) => Promise<Response>
): Promise<Response> {
  try {
    const shop = await verifySession(request)
    return await handler(shop)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Authentication failed'
    return Response.json({ error: message }, { status: 401 })
  }
}
