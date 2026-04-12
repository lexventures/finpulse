'use client'

/**
 * Session token from Shopify App Bridge (embedded admin). Use as Authorization Bearer for API routes.
 */
export async function getShopifySessionToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const shopify = (window as unknown as { shopify?: { idToken?: () => Promise<string> } }).shopify
  if (!shopify?.idToken) return null
  try {
    const token = await shopify.idToken()
    return token && token.length > 0 ? token : null
  } catch {
    return null
  }
}
