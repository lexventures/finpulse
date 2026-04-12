import '@shopify/shopify-api/adapters/node'

import { nodeAdapterInitialized } from '@shopify/shopify-api/adapters/node'
import { shopifyApi, ApiVersion, type Session, type Shopify } from '@shopify/shopify-api'

import { createShopifySessionStorage } from '@/lib/shopify/session-storage'

const API_VERSION_BY_ENV: Record<string, ApiVersion> = {
  '2024-10': ApiVersion.October24,
  '2025-01': ApiVersion.January25,
  '2025-04': ApiVersion.April25,
  '2025-07': ApiVersion.July25,
  '2025-10': ApiVersion.October25,
  '2026-01': ApiVersion.January26,
  '2026-04': ApiVersion.April26,
}

let shopifyInstance: Shopify | null = null
const sessionStorage = createShopifySessionStorage()

function resolveApiVersion(): ApiVersion {
  const fromEnv = process.env.SHOPIFY_API_VERSION
  if (fromEnv && API_VERSION_BY_ENV[fromEnv]) {
    return API_VERSION_BY_ENV[fromEnv]
  }
  return ApiVersion.April25
}

function resolveHostName(): string {
  const appUrl = process.env.SHOPIFY_APP_URL
  if (!appUrl) {
    throw new Error('SHOPIFY_APP_URL is not set')
  }
  return new URL(appUrl).host
}

function resolveScopes(): string[] {
  const raw = process.env.SHOPIFY_SCOPES
  if (!raw?.trim()) {
    return []
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export type FinPulseShopify = {
  auth: Shopify['auth']
  session: Shopify['session']
  config: Shopify['config'] & {
    sessionStorage: {
      storeSession(session: Session): Promise<boolean>
    }
  }
}

export function ensureShopify(): FinPulseShopify {
  if (!nodeAdapterInitialized) {
    throw new Error('Shopify Node adapter failed to initialize')
  }

  if (!shopifyInstance) {
    const apiKey = process.env.SHOPIFY_API_KEY
    const apiSecretKey = process.env.SHOPIFY_API_SECRET
    if (!apiKey || !apiSecretKey) {
      throw new Error('SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be set')
    }

    shopifyInstance = shopifyApi({
      apiKey,
      apiSecretKey,
      scopes: resolveScopes(),
      hostName: resolveHostName(),
      apiVersion: resolveApiVersion(),
      isEmbeddedApp: true,
    })
  }

  return {
    auth: shopifyInstance.auth,
    session: shopifyInstance.session,
    config: {
      ...shopifyInstance.config,
      sessionStorage,
    },
  }
}
