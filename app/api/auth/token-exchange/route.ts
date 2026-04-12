import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const sessionToken = body?.sessionToken

  if (!sessionToken || typeof sessionToken !== 'string') {
    return NextResponse.json(
      { error: 'Missing sessionToken in request body' },
      { status: 400 },
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
    const decoded = JSON.parse(atob(sessionToken.split('.')[1]))
    const shop = decoded.dest?.replace('https://', '') ?? ''

    if (!shop) {
      return NextResponse.json(
        { error: 'Could not extract shop from session token' },
        { status: 400 },
      )
    }

    const tokenRes = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token: sessionToken,
          subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
          requested_token_type:
            'urn:shopify:params:oauth:token-type:offline-access-token',
        }),
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
        access_token: accessToken,
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
