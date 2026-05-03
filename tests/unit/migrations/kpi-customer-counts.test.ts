import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/009_preserve_kpi_customer_counts.sql',
)

describe('preserve KPI customer counts migration', () => {
  it('keeps Shopify Analytics customer counts when rebuilding KPI facts', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('existing_customer_counts')
    expect(sql).toContain('new_customer_orders')
    expect(sql).toContain('returning_customer_orders')
    expect(sql).toMatch(/LEFT\s+JOIN\s+existing_customer_counts\s+ecc/i)
    expect(sql).not.toMatch(/TRUNCATE\s+TABLE\s+fin_kpi_monthly/i)
  })
})
