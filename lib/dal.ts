import { verifyShopifyRequest } from '@/lib/shopify/verify-request'
import { createServiceClient } from '@/lib/supabase/server'

function getAuthorizedShops(): string[] {
  const shops = [
    process.env.SHOPIFY_DTC_SHOP,
    process.env.SHOPIFY_WHOLESALE_SHOP,
  ]
    .map((s) => s?.trim().toLowerCase())
    .filter((s): s is string => Boolean(s))
  return Array.from(new Set(shops))
}

function ensureAuthorizedShop(shop: string): void {
  const allowed = getAuthorizedShops()
  if (allowed.length > 0 && !allowed.includes(shop.toLowerCase())) {
    throw new Error(`Unauthorized shop: ${shop}`)
  }
}

export async function verifySession(request: Request): Promise<string> {
  const { shop } = await verifyShopifyRequest(request)
  ensureAuthorizedShop(shop)
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
