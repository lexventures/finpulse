import { afterEach, describe, expect, it, vi } from 'vitest'

import { getShopifySessionToken } from '@/lib/shopify/client-token'

describe('getShopifySessionToken', () => {
  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('waits briefly for Shopify App Bridge to expose idToken', async () => {
    vi.useFakeTimers()
    const idToken = vi.fn(async () => 'session-token')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    })

    const tokenPromise = getShopifySessionToken()

    setTimeout(() => {
      ;(globalThis.window as unknown as { shopify?: { idToken: () => Promise<string> } }).shopify = {
        idToken,
      }
    }, 100)

    await vi.advanceTimersByTimeAsync(150)

    await expect(tokenPromise).resolves.toBe('session-token')
    expect(idToken).toHaveBeenCalledOnce()
  })
})
