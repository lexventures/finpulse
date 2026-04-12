import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { ensureShopify } from '@/lib/shopify/config'

const MYSHOPIFY_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i

function getShopDomain(payload: { dest?: string }): string {
  const dest = payload.dest ?? ''
  const shop = dest.replace(/^https?:\/\//, '').toLowerCase()
  if (!MYSHOPIFY_DOMAIN_PATTERN.test(shop)) {
    throw new Error('Invalid shop domain in session token')
  }
  return shop
}

function getAuthorizedShops(): string[] {
  const shops = [
    process.env.SHOPIFY_DTC_SHOP,
    process.env.SHOPIFY_WHOLESALE_SHOP,
  ]
    .map((s) => s?.trim().toLowerCase())
    .filter((s): s is string => Boolean(s))
  return Array.from(new Set(shops))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const sessionToken = body?.sessionToken
  const authHeader = request.headers.get('authorization')
  const authToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null

  if (!sessionToken || typeof sessionToken !== 'string') {
    return NextResponse.json(
      { error: 'Missing sessionToken in request body' },
      { status: 400 },
    )
  }
  if (!authToken) {
    return NextResponse.json(
      { error: 'Missing Authorization bearer token' },
      { status: 401 },
    )
  }
  if (authToken && authToken !== sessionToken) {
    return NextResponse.json(
      { error: 'Session token mismatch' },
      { status: 401 },
    )
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set' },
      { status: 500 },
    )
  }

  try {
    const shopify = ensureShopify()
    const decoded = await shopify.session.decodeSessionToken(sessionToken)
    const shop = getShopDomain(decoded)
    const authorizedShops = getAuthorizedShops()
    if (authorizedShops.length > 0 && !authorizedShops.includes(shop)) {
      return NextResponse.json(
        { error: `Unauthorized shop: ${shop}` },
        { status: 403 },
      )
    }

    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type:
        'urn:shopify:params:oauth:token-type:offline-access-token',
    })

    const tokenRes = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      },
    )

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      return NextResponse.json(
        { error: `Token exchange failed: ${errText}` },
        { status: tokenRes.status },
      )
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token
    const scope = tokenData.scope
    const expiresIn =
      typeof tokenData.expires_in === 'number' ? tokenData.expires_in : null
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No access_token in response' },
        { status: 500 },
      )
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from('shopify_sessions').upsert(
      {
        id: `offline_${shop}`,
        shop,
        is_online: false,
        scope: scope ?? '',
        expires: expiresAt,
        access_token: accessToken,
        online_access_info: {
          refresh_token: tokenData.refresh_token ?? null,
          refresh_token_expires_in: tokenData.refresh_token_expires_in ?? null,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )

    if (error) {
      return NextResponse.json(
        { error: `Failed to store session: ${error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, shop })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
