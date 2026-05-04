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
    expect(sql).toMatch(/DELETE\s+FROM\s+fin_kpi_monthly\s+WHERE\s+true/i)
    expect(sql).not.toMatch(/TRUNCATE\s+TABLE\s+fin_kpi_monthly/i)
  })
})

const ltvMigrationPath = join(
  process.cwd(),
  'supabase/migrations/011_shopify_ltv_kpi_columns.sql',
)

describe('Shopify LTV KPI migration', () => {
  it('adds and preserves Shopify LTV fields across KPI rebuilds', () => {
    const sql = readFileSync(ltvMigrationPath, 'utf8')

    expect(sql).toContain('shopify_ltv_to_date')
    expect(sql).toContain('shopify_gross_margin_ltv_to_date')
    expect(sql).toContain('existing_shopify_kpis')
    expect(sql).toMatch(/LEFT\s+JOIN\s+existing_shopify_kpis\s+esk/i)
    expect(sql).toMatch(/DELETE\s+FROM\s+fin_kpi_monthly\s+WHERE\s+true/i)
    expect(sql).not.toMatch(/TRUNCATE\s+TABLE\s+fin_kpi_monthly/i)
  })
})
