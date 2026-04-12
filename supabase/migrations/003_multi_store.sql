-- Add store column to fin_shopify_analytics for multi-store support
ALTER TABLE fin_shopify_analytics ADD COLUMN store TEXT NOT NULL DEFAULT 'emilylex';
ALTER TABLE fin_shopify_analytics DROP CONSTRAINT fin_shopify_analytics_date_key;
ALTER TABLE fin_shopify_analytics ADD CONSTRAINT fin_shopify_analytics_date_store_key UNIQUE(date, store);
DROP INDEX IF EXISTS idx_fin_shopify_analytics_date;
CREATE INDEX idx_fin_shopify_analytics_date_store ON fin_shopify_analytics(date DESC, store);

-- Wholesale daily revenue (from ShopifyQL on elsw store)
CREATE TABLE fin_wholesale_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  segment TEXT NOT NULL CHECK (segment IN ('wholesale_faire', 'wholesale_direct')),
  gross_revenue NUMERIC(12,2),
  net_revenue NUMERIC(12,2),
  order_count INTEGER,
  avg_order_value NUMERIC(10,2),
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, segment)
);

ALTER TABLE fin_wholesale_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on fin_wholesale_daily"
  ON fin_wholesale_daily FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_fin_wholesale_daily_date ON fin_wholesale_daily(date DESC);
CREATE INDEX idx_fin_wholesale_daily_segment ON fin_wholesale_daily(segment, date DESC);
