import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const layoutSource = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8')

describe('Shopify App Bridge layout setup', () => {
  it('exposes the Shopify API key through the App Bridge CDN meta tag', () => {
    expect(layoutSource).toContain('name="shopify-api-key"')
    expect(layoutSource).toContain('content={process.env.SHOPIFY_CLIENT_ID || \'\'}')
  })
})
