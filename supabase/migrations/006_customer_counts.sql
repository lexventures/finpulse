ALTER TABLE fin_kpi_monthly
  ADD COLUMN IF NOT EXISTS new_customer_orders INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returning_customer_orders INTEGER DEFAULT 0;
