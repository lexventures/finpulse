/**
 * Shopify Client Credentials Grant (2026)
 *
 * Exchanges client_id + client_secret for a short-lived access token.
 * Tokens expire after 24 hours. Each call gets a fresh token.
 * Used for server-to-server API calls (Edge Functions, API routes).
 */

export async function getShopifyAccessToken(shop: string): Promise<{
  accessToken: string
  scope: string
  expiresIn: number
}> {
  const clientId = process.env.SHOPIFY_CLIENT_ID ?? process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set')
  }

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify client credentials failed (${res.status}): ${text}`)
  }

  const data = await res.json()

  if (!data.access_token) {
    throw new Error('No access_token in Shopify client credentials response')
  }

  return {
    accessToken: data.access_token,
    scope: data.scope ?? '',
    expiresIn: data.expires_in ?? 86399,
  }
}
