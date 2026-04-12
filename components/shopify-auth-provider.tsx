'use client'

import { useEffect, useRef } from 'react'

export function ShopifyAuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const exchanged = useRef(false)

  useEffect(() => {
    if (exchanged.current) return
    exchanged.current = true

    async function exchangeToken() {
      try {
        const shopify = (window as unknown as { shopify?: { idToken: () => Promise<string> } }).shopify
        if (!shopify?.idToken) return

        const sessionToken = await shopify.idToken()
        if (!sessionToken) return

        await fetch('/api/auth/token-exchange', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ sessionToken }),
        })
      } catch {
        // Token exchange failed silently — sync buttons will show the error
      }
    }

    exchangeToken()
  }, [])

  return <>{children}</>
}
