CREATE TABLE fin_shopify_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  net_sales NUMERIC(12,2),
  gross_sales NUMERIC(12,2),
  total_sales NUMERIC(12,2),
  discounts NUMERIC(12,2),
  returns NUMERIC(12,2),
  shipping NUMERIC(12,2),
  taxes NUMERIC(12,2),
  orders INTEGER,
  sessions INTEGER,
  conversion_rate NUMERIC(8,4),
  cart_abandonment_rate NUMERIC(8,4),
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date)
);

ALTER TABLE fin_shopify_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on fin_shopify_analytics"
  ON fin_shopify_analytics FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_fin_shopify_analytics_date ON fin_shopify_analytics(date DESC);
