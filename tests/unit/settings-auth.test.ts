import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const settingsTabsSource = readFileSync(
  join(process.cwd(), 'app/settings/settings-tabs.tsx'),
  'utf8',
)

describe('settings API client auth', () => {
  it('sends Shopify session authorization when saving settings', () => {
    expect(settingsTabsSource).toContain('async function postSettings')
    expect(settingsTabsSource).toContain('const token = await getShopifySessionToken()')
    expect(settingsTabsSource).toContain('Authorization: `Bearer ${token}`')
  })
})
