import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const functionSource = readFileSync(
  join(process.cwd(), 'supabase/functions/sync-shopify-analytics/index.ts'),
  'utf8',
)

describe('sync-shopify-analytics customer count writes', () => {
  it('upserts monthly customer counts so missing KPI rows are seeded before Finaloop rebuilds', () => {
    expect(functionSource).toContain('.upsert(')
    expect(functionSource).toContain("{ onConflict: 'month,channel' }")
    expect(functionSource).not.toContain(".update({\n                  new_customer_orders")
  })
})
