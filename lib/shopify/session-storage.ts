import type { Session } from '@shopify/shopify-api'

import { createServiceClient } from '@/lib/supabase/server'

export function createShopifySessionStorage() {
  return {
    async storeSession(session: Session): Promise<boolean> {
      const supabase = createServiceClient()
      const { error } = await supabase.from('shopify_sessions').upsert(
        {
          id: session.id,
          shop: session.shop,
          state: session.state || null,
          is_online: session.isOnline,
          scope: session.scope ?? null,
          expires: session.expires?.toISOString() ?? null,
          access_token: session.accessToken ?? null,
          online_access_info: session.onlineAccessInfo ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      return !error
    },
  }
}
