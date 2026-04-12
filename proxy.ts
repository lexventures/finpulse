import { type NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/healthz', '/api/webhooks', '/api/auth']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const shop = request.nextUrl.searchParams.get('shop')
  if (!shop && !request.headers.get('authorization')) {
    const appUrl = process.env.SHOPIFY_APP_URL
    if (appUrl) {
      return NextResponse.redirect(new URL(appUrl))
    }
  }

  const response = NextResponse.next()
  response.headers.set(
    'Content-Security-Policy',
    'frame-ancestors https://admin.shopify.com https://*.myshopify.com;',
  )
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
