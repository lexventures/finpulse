import { NextRequest, NextResponse } from 'next/server'

import { ensureShopify } from '@/lib/shopify/config'

export async function GET(request: NextRequest) {
  const shopify = ensureShopify()
  const url = new URL(request.url)
  const shop = url.searchParams.get('shop')

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 })
  }

  try {
    const callbackResponse = await shopify.auth.callback({ rawRequest: request })
    const { session } = callbackResponse

    const sessionStored = await shopify.config.sessionStorage.storeSession(session)
    if (!sessionStored) {
      return NextResponse.json({ error: 'Failed to store session' }, { status: 500 })
    }

    const appUrl = process.env.SHOPIFY_APP_URL || ''
    return NextResponse.redirect(`${appUrl}/?shop=${shop}`)
  } catch (error) {
    console.error('Auth callback error:', error)
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 })
  }
}
