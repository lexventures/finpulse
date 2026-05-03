'use client'

/**
 * Session token from Shopify App Bridge (embedded admin). Use as Authorization Bearer for API routes.
 */
export async function getShopifySessionToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const shopify = await waitForShopifyBridge()
  if (!shopify?.idToken) return null
  try {
    const token = await shopify.idToken()
    return token && token.length > 0 ? token : null
  } catch {
    return null
  }
}

interface ShopifyBridge {
  idToken?: () => Promise<string>
}

function currentShopifyBridge(): ShopifyBridge | undefined {
  return (window as unknown as { shopify?: ShopifyBridge }).shopify
}

async function waitForShopifyBridge(): Promise<ShopifyBridge | undefined> {
  const maxAttempts = 20
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shopify = currentShopifyBridge()
    if (shopify?.idToken) return shopify
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return currentShopifyBridge()
}
